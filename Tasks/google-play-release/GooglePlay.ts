import fs = require('fs');
import path = require('path');
import tl = require('vsts-task-lib/task');
import glob = require('glob');
import bb = require('bluebird');
let google = require('googleapis');
let apkParser = require('node-apk-parser');
let publisher = google.androidpublisher('v2');

interface ClientKey {
    client_email?: string;
    private_key?: string;
}

interface AndroidResource {
    track?: string;
    versionCodes?: any;
    userFraction?: number;
    language?: string;
    recentChanges?: string;
    fullDescription?: string;
    shortDescription?: string;
    title?: string;
    video?: string;
}

interface AndroidMedia {
    body: fs.ReadStream;
    mimeType: string;
}

interface PackageParams {
    packageName?: string;
    editId?: any;
    track?: string;
    resource?: AndroidResource;
    media?: AndroidMedia;
    apkVersionCode?: number;
    language?: string;
    imageType?: string;
    uploadType?: string;
}

interface GlobalParams {
    auth?: any;
    params?: PackageParams;
}

interface Edit {
    id: string;
    expiryTimeSeconds: string;
}

interface Apk {
  versionCode: number;
  binary: {
    sha1: string;
  };
}

interface Track {
  track: string;
  versionCodes: number[];
  userFraction: number;
}

async function run() {
    try {
        tl.setResourcePath(path.join(__dirname, 'task.json'));

        tl.debug('Prepare task inputs.');

        let authType: string = tl.getInput('authType', true);
        let key: ClientKey = {};
        if (authType === 'JsonFile') {
            let serviceAccountKeyFile: string = tl.getPathInput('serviceAccountKey', true, true);

            let stats: fs.Stats = fs.statSync(serviceAccountKeyFile);
            if (stats && stats.isFile()) {
                key = require(serviceAccountKeyFile);
            } else {
                tl.debug(`The service account file path ${serviceAccountKeyFile} points to a directory.`);
                throw new Error(tl.loc('InvalidAuthFile', serviceAccountKeyFile));
            }
        } else if (authType === 'ServiceEndpoint') {
            let serviceEndpoint: tl.EndpointAuthorization = tl.getEndpointAuthorization(tl.getInput('serviceEndpoint', true), false);
            key.client_email = serviceEndpoint.parameters['username'];
            key.private_key = serviceEndpoint.parameters['password'].replace(/\\n/g, '\n');
        }

        let mainApkPattern = tl.getPathInput('apkFile', true);
        tl.debug(`Main APK pattern: ${mainApkPattern}`);

        let apkFile: string = resolveGlobPath(mainApkPattern);
        tl.checkPath(apkFile, 'apkFile');
        let mainVersionCode = apkParser.readFile(apkFile).readManifestSync().versionCode;
        console.log(tl.loc('FoundMainApk', apkFile, mainVersionCode));
        tl.debug(`    Found the main APK file: ${apkFile} (version code ${mainVersionCode}).`);

        let apkFileList: string[] = getAllApkPaths(apkFile);
        if (apkFileList.length > 1) {
            console.log(tl.loc('FoundMultiApks'));
            console.log(apkFileList);
        }

        let versionCodeFilterType: string = tl.getInput('versionCodeFilterType', false) ;
        let versionCodeFilter: string | number[] = null;
        if (versionCodeFilterType === 'list') {
            versionCodeFilter = getVersionCodeListInput();
        } else if (versionCodeFilterType === 'expression') {
            versionCodeFilter = tl.getInput('replaceExpression', true);
        }

        let track: string = tl.getInput('track', true);
        let userFraction: number = Number(tl.getInput('userFraction', false)); // Used for staged rollouts
        let changelogFile: string = tl.getInput('changelogFile', false);
        let shouldAttachMetadata: boolean = tl.getBoolInput('shouldAttachMetadata', false);
        let shouldUploadApks: boolean = !shouldAttachMetadata || tl.getBoolInput('shouldUploadApks', false);
        let metadataRootPath: string = null;
        if (shouldAttachMetadata) {
            metadataRootPath = tl.getPathInput('metadataRootPath', true, true);
        }

        // Constants
        let GOOGLE_PLAY_SCOPES: string[] = ['https://www.googleapis.com/auth/androidpublisher'];
        let APK_MIME_TYPE: string = 'application/vnd.android.package-archive';

        let globalParams: GlobalParams = { auth: null, params: {} };
        let apkVersionCodes: number[] = [];

        // The submission process is composed
        // of a transction with the following steps:
        // -----------------------------------------
        // #1) Extract the package name from the specified APK file
        // #2) Get an OAuth token by authentincating the service account
        // #3) Create a new editing transaction
        // #4) Upload the new APK(s)
        // #5) Specify the track that should be used for the new APK (e.g. alpha, beta)
        // #6) Specify the new change log
        // #7) Commit the edit transaction

        tl.debug(`Getting a package name from ${apkFile}`);
        let packageName: string = getPackageName(apkFile);
        updateGlobalParams(globalParams, 'packageName', packageName);

        tl.debug('Initializing JWT.');
        let jwtClient: any = new google.auth.JWT(key.client_email, null, key.private_key, GOOGLE_PLAY_SCOPES, null);
        globalParams.auth = jwtClient;

        tl.debug('Initializing Google Play publisher API.');
        let edits: any = publisher.edits;
        [edits, edits.apklistings, edits.apks, edits.tracks, edits.listings, edits.images, jwtClient].forEach(bb.promisifyAll);

        tl.debug('Authorize JWT.');
        await jwtClient.authorizeAsync();

        console.log(tl.loc('GetNewEditAfterAuth'));
        tl.debug('Creating a new edit transaction in Google Play.');
        let currentEdit: Edit = await getNewEdit(edits, globalParams, packageName);
        updateGlobalParams(globalParams, 'editId', currentEdit.id);

        if (shouldUploadApks) {
            tl.debug(`Uploading ${apkFileList.length} APK(s).`);

            for (let apkFile of apkFileList) {
                tl.debug(`Uploading APK ${apkFile}`);
                let apk: Apk = await addApk(edits, packageName, apkFile, APK_MIME_TYPE);
                tl.debug(`Uploaded ${apkFile} with the version code ${apk.versionCode}`);
                apkVersionCodes.push(apk.versionCode);
            }

            console.log(tl.loc('UpdateTrack'));
            tl.debug(`Updating the track ${track}.`);
            let updatedTrack: Track = await updateTrack(edits, packageName, track, apkVersionCodes, versionCodeFilterType, versionCodeFilter, userFraction);
            tl.debug('Updated track info: ' + JSON.stringify(updatedTrack));
        }

        if (shouldAttachMetadata) {
            console.log(tl.loc('AttachingMetadataToRelease'));
            tl.debug(`Uploading metadata ${changelogFile} from ${metadataRootPath}`);
            await addMetadata(edits, apkVersionCodes, changelogFile, metadataRootPath);
        } else if (!changelogFile) {
            tl.debug(`Upload the common change log ${changelogFile} to all versions`);
            await uploadCommonChangeLog(edits, 'en-US', changelogFile, apkVersionCodes);
        }

        tl.debug('Committing the edit transaction in Google Play.');
        await commitEditTransaction(edits, track);
        tl.setResult(tl.TaskResult.Succeeded, tl.loc('Success'));
    } catch (e) {
        tl.error(e);
        tl.setResult(tl.TaskResult.Failed, tl.loc('Failure'));
    }
}

/**
 * Tries to extract the package name from an apk file
 * @param {Object} apkFile The apk file from which to attempt name extraction
 * @return {string} packageName Name extracted from package.
 */
function getPackageName(apkFile: string): string {
    let packageName: string = null;

    try {
        packageName = apkParser
            .readFile(apkFile)
            .readManifestSync()
            .package;
        if (packageName) {
            tl.debug(`name extraction from apk ${apkFile} succeeded: ${packageName}`);
        } else {
            throw new Error('node-apk-parser returned empty package name.');
        }
    } catch (e) {
        tl.debug(`name extraction from apk ${apkFile} failed:`);
        tl.debug(e);
        throw new Error(tl.loc('CannotGetPackageName', apkFile));
    }

    return packageName;
}

/**
 * Uses the provided JWT client to request a new edit from the Play store and attach the edit id to all requests made this session
 * Assumes authorized
 * @param {string} packageName unique android package name (com.android.etc)
 * @return {Promise} edit A promise that will return result from inserting a new edit
 *                          { id: string, expiryTimeSeconds: string }
 */
async function getNewEdit(edits: any, globalParams: GlobalParams, packageName: string): Promise<Edit> {
    let requestParameters: PackageParams = {
        packageName: packageName
    };

    try {
        tl.debug('Request Parameters: ' + JSON.stringify(requestParameters));

        let res: Edit = (await edits.insertAsync(requestParameters))[0];
        return res;
    } catch (e) {
        tl.debug(`Failed to create a new edit transaction for the package ${packageName}.`);
        tl.debug(e);
        throw new Error(tl.loc('CannotCreateTransaction', packageName));
    }
}

async function commitEditTransaction(edits: any, track: string) {
    await edits.commitAsync();
    console.log(tl.loc('AptPublishSucceed'));
    console.log(tl.loc('TrackInfo', track));
}

/**
 * Adds an apk to an existing edit
 * Assumes authorized
 * @param {string} packageName unique android package name (com.android.etc)
 * @param {string} apkFile path to apk file
 * @returns {Promise} apk A promise that will return result from uploading an apk
 *                          { versionCode: integer, binary: { sha1: string } }
 */
async function addApk(edits: any, packageName: string, apkFile: string, APK_MIME_TYPE: string): Promise<Apk> {
    let requestParameters: PackageParams = {
        packageName: packageName,
        media: {
            body: fs.createReadStream(apkFile),
            mimeType: APK_MIME_TYPE
        }
    };

    try {
        tl.debug('Request Parameters: ' + JSON.stringify(requestParameters));
        let res: Apk = (await edits.apks.uploadAsync(requestParameters))[0];

        tl.debug('returned: ' + JSON.stringify(res));

        return res;
    } catch (e) {
        tl.debug(`Failed to upload the APK ${apkFile}`);
        tl.debug(e);
        throw new Error(tl.loc('CannotUploadApk', apkFile));
    }
}

/**
 * Update a given release track with the given information
 * Assumes authorized
 * @param {string} packageName unique android package name (com.android.etc)
 * @param {string} track one of the values {"alpha", "beta", "production", "rollout"}
 * @param {number[]} apkVersionCodes version code of uploaded modules.
 * @param {string} versionCodeListType type of version code replacement filter, i.e. 'all', 'list', or 'expression'
 * @param {string | string[]} versionCodeFilter version code filter, i.e. either a list of version code or a regular expression string.
 * @param {double} userFraction for rollout, fraction of users to get update
 * @returns {Promise} track A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
async function updateTrack(
    edits: any,
    packageName: string,
    track: string,
    apkVersionCodes: number[],
    versionCodeListType: string,
    versionCodeFilter: string | number[],
    userFraction: number): Promise<Track> {

    let requestParameters: PackageParams = {
        packageName: packageName,
        track: track
    };

    let res: Track;
    let newTrackVersionCodes: number[] = [];

    if (versionCodeListType === 'all') {
        newTrackVersionCodes = apkVersionCodes;
    } else {
        try {
            tl.debug(`Reading current ${track} track info.`);
            tl.debug('Request Parameters: ' + JSON.stringify(requestParameters));

            res = (await edits.tracks.getAsync(requestParameters))[0];
        } catch (e) {
            tl.debug(`Failed to download track ${track} information.`);
            tl.debug(e);
            throw new Error(tl.loc('CannotDownloadTrack', track));
        }

        let oldTrackVersionCodes: number[] = res.versionCodes;
        tl.debug('Current version codes: ' + JSON.stringify(oldTrackVersionCodes));

        if (typeof(versionCodeFilter) === 'string') {
            tl.debug(`Removing version codes matching the regular expression: ^${versionCodeFilter as string}$`);
            let versionCodesToRemove: RegExp = new RegExp(`^${versionCodeFilter as string}$`);

            oldTrackVersionCodes.forEach((versionCode) => {
                if (!versionCode.toString().match(versionCodesToRemove)) {
                    newTrackVersionCodes.push(versionCode);
                }
            });
        } else {
            let versionCodesToRemove: number[] = versionCodeFilter as number[];
            tl.debug('Removing version codes: ' + JSON.stringify(versionCodesToRemove));

            oldTrackVersionCodes.forEach((versionCode) => {
                if (versionCodesToRemove.indexOf(versionCode) === -1) {
                    newTrackVersionCodes.push(versionCode);
                }
            });
        }

        tl.debug('Version codes to keep: ' + JSON.stringify(newTrackVersionCodes));

        apkVersionCodes.forEach((versionCode) => {
            if (newTrackVersionCodes.indexOf(versionCode) === -1) {
                newTrackVersionCodes.push(versionCode);
            }
        });
    }

    tl.debug(`New ${track} track version codes: ` + JSON.stringify(newTrackVersionCodes));
    requestParameters.resource = {
        track: track,
        versionCodes: newTrackVersionCodes
    };

    if (track === 'rollout') {
        requestParameters.resource.userFraction = userFraction;
    }

    try {
        tl.debug(`Updating the ${track} track info.`);
        tl.debug('Request Parameters: ' + JSON.stringify(requestParameters));
        res = (await edits.tracks.updateAsync(requestParameters))[0];
    } catch (e) {
        tl.debug(`Failed to update track ${track}.`);
        tl.debug(e);
        throw new Error(tl.loc('CannotUpdateTrack', track));
    }

    return res;
}

/**
 * Uploads change log files if specified for all the apk version codes in the update
 * @param changelogFile
 * @param apkVersionCodes
 * @returns {*}
 */
async function uploadCommonChangeLog(edits: any, languageCode: string, changelogFile: string, apkVersionCodes: number[]) {
    let stats: fs.Stats = fs.statSync(changelogFile);

    if (stats && stats.isFile()) {
        for (let apkVersionCode of apkVersionCodes) {
            tl.debug(`Adding the change log file ${changelogFile} to the APK version code ${apkVersionCode}`);
            await addChangelog(edits, 'en-US', changelogFile, apkVersionCode);
            tl.debug(`Successfully added the change log file ${changelogFile} to the APK version code ${apkVersionCode}`);
        }
    } else {
        tl.debug(`The change log path ${changelogFile} either does not exist or points to a directory. Ignoring...`);
    }
}

/**
 * Add a changelog to an edit
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} changelogFile Path to changelog file.
 * @param {integer} APK version code
 * @returns {Promise} track A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
async function addChangelog(edits: any, languageCode: string, changelogFile: string, apkVersionCode: number) {
    let changelog: string;
    try {
        changelog = fs.readFileSync(changelogFile).toString();
    } catch (e) {
        tl.debug(`Changelog reading failed for ${changelogFile}`);
        tl.debug(e);
        throw new Error(tl.loc('CannotReadChangeLog', changelogFile));
    }

    let requestParameters: PackageParams = {
        apkVersionCode: apkVersionCode,
        language: languageCode,
        resource: {
            language: languageCode,
            recentChanges: changelog
        }
    };

    try {
        tl.debug('Request Parameters: ' + JSON.stringify(requestParameters));
        await edits.apklistings.updateAsync(requestParameters);
    } catch (e) {
        tl.debug(`Failed to upload the ${languageCode} changelog ${changelogFile} version ${apkVersionCode}`);
        tl.debug(e);
        throw new Error(tl.loc('CannotUploadChangelog', languageCode, changelogFile, apkVersionCode));
    }
}

/**
 * Adds all changelogs found in directory to an edit. Pulls version code from file name. Failing this, assumes the global version code inferred from apk
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory with a changesogs folder where changelogs can be found.
 * @returns {Promise} track A promise that will return result from updating an apk listing
 *                            { language: string, recentChanges: string }
 */
async function addAllChangelogs(edits: any, apkVersionCodes: any, languageCode: string, directory: string) {
    let changelogDir: string = path.join(directory, 'changelogs');

    let changelogs: string[] = fs.readdirSync(changelogDir).filter(subPath => {
        try {
            let fileToCheck: string = path.join(changelogDir, subPath);
            tl.debug(`Checking File ${fileToCheck}`);
            return fs.statSync(fileToCheck).isFile();
        } catch (e) {
            tl.debug(`Failed to stat path ${subPath}:`);
            tl.debug(e);
            tl.debug('Ignoring...');
            return false;
        }
    });

    if (changelogs.length === 0) {
        return;
    }

    let versionCodeFound: boolean = false;
    for (let changelogFile of changelogs) {
        let changelogName: string = path.basename(changelogFile, path.extname(changelogFile));
        let changelogVersion: number = parseInt(changelogName, 10);
        if (!isNaN(changelogVersion) && (apkVersionCodes.indexOf(changelogVersion) !== -1)) {
            versionCodeFound = true;
            let fullChangelogPath: string = path.join(changelogDir, changelogFile);

            console.log(tl.loc('AppendChangelog', fullChangelogPath));
            tl.debug(`Uploading change log version ${changelogVersion} from ${fullChangelogPath} for language code ${languageCode}`);
            await addChangelog(edits, languageCode, fullChangelogPath, changelogVersion);
            tl.debug(`Successfully uploaded change log version ${changelogVersion} from ${fullChangelogPath} for language code ${languageCode}`);
        } else {
            tl.debug(`The name of the file ${changelogFile} is not a valid version code. Skipping it.`);
        }
    }

    if (!versionCodeFound && (changelogs.length === 1)) {
        tl.debug(`Applying file ${changelogs[0]} to all version codes`);
        let fullChangelogPath: string = path.join(changelogDir, changelogs[0]);
        await uploadCommonChangeLog(edits, languageCode, fullChangelogPath, apkVersionCodes);
    }
}

/**
 * Attaches the metadata in the specified directory to the edit. Assumes the metadata structure specified by Fastlane.
 * Assumes authorized
 *
 * Metadata Structure:
 * metadata
 *  └ $(languageCodes)
 *    ├ full_description.txt
 *    ├ short_description.txt
 *    ├ title.txt
 *    ├ video.txt
 *    ├ images
 *    |  ├ featureGraphic.png    || featureGraphic.jpg   || featureGraphic.jpeg
 *    |  ├ icon.png              || icon.jpg             || icon.jpeg
 *    |  ├ promoGraphic.png      || promoGraphic.jpg     || promoGraphic.jpeg
 *    |  ├ tvBanner.png          || tvBanner.jpg         || tvBanner.jpeg
 *    |  ├ phoneScreenshots
 *    |  |  └ *.png || *.jpg || *.jpeg
 *    |  ├ sevenInchScreenshots
 *    |  |  └ *.png || *.jpg || *.jpeg
 *    |  ├ tenInchScreenshots
 *    |  |  └ *.png || *.jpg || *.jpeg
 *    |  ├ tvScreenshots
 *    |  |  └ *.png || *.jpg || *.jpeg
 *    |  └ wearScreenshots
 *    |     └ *.png || *.jpg || *.jpeg
 *    └ changelogs
 *      └ $(versioncodes).txt
 *
 * @param {string} metadataRootDirectory Path to the folder where the Fastlane metadata structure is found. eg the folders under this directory should be the language codes
 * @returns {Promise<void>}
 */
async function addMetadata(edits: any, apkVersionCodes: number[], changelogFile: string, metadataRootDirectory: string) {
    let metadataLanguageCodes: string[] = fs.readdirSync(metadataRootDirectory).filter((subPath) => {
        try {
            return fs.statSync(path.join(metadataRootDirectory, subPath)).isDirectory();
        } catch (e) {
            tl.debug(`Failed to stat path ${subPath}:`);
            tl.debug(e);
            tl.debug('Ignoring...');
            return false;
    }});

    tl.debug(`Found language codes: ${metadataLanguageCodes}`);

    for (let languageCode of metadataLanguageCodes) {
        let metadataDirectory: string = path.join(metadataRootDirectory, languageCode);

        tl.debug(`Uploading metadata from ${metadataDirectory} for language code ${languageCode} and version codes ${apkVersionCodes}`);
        await uploadMetadataWithLanguageCode(edits, apkVersionCodes, changelogFile, languageCode, metadataDirectory);
    }
}

/**
 * Updates the details for a language with new information
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns {Promise<void>}
 */
async function uploadMetadataWithLanguageCode(edits: any, apkVersionCodes: number[], changelogFile: string, languageCode: string, directory: string) {
    console.log(tl.loc('UploadingMetadataForLanguage', directory, languageCode));

    tl.debug(`Adding localized store listing for language code ${languageCode} from ${directory}`);
    await addLanguageListing(edits, languageCode, directory);

    tl.debug(`Uploading change logs for language code ${languageCode} from ${directory}`);
    await addAllChangelogs(edits, apkVersionCodes, languageCode, directory);

    tl.debug(`Uploading images for language code ${languageCode} from ${directory}`);
    await attachImages(edits, languageCode, directory);
}

/**
 * Updates the details for a language with new information
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns {Promise<void>}
 */
async function addLanguageListing(edits: any, languageCode: string, directory: string) {
    let patchListingRequestParameters: PackageParams = {
        language: languageCode
    };
    patchListingRequestParameters.resource = createListingResource(languageCode, directory);

    try {
        tl.debug(`Uploading a localized ${languageCode} store listing.`);
        tl.debug('Request Parameters: ' + JSON.stringify(patchListingRequestParameters));
        // The patchAsync method fails if the listing for the language does not exist,
        // while updateAsync actually updates or creates.
        await edits.listings.updateAsync(patchListingRequestParameters);
        tl.debug(`Successfully uploaded a localized ${languageCode} store listing.`);
    } catch (e) {
        tl.debug(`Failed to create the localized ${languageCode} store listing.`);
        tl.debug(e);
        throw new Error(tl.loc('CannotCreateListing', languageCode));
    }
}

/**
 * Helper method for creating the resource for the edits.listings.update method.
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns {AndroidResource} resource A crafted resource for the edits.listings.update method.
 *          { languageCode: string, fullDescription: string, shortDescription: string, title: string, video: string }
 */
function createListingResource(languageCode: string, directory: string): AndroidResource {
    tl.debug(`Constructing resource to update listing with language code ${languageCode} from ${directory}`);

    let resourceParts = {
        fullDescription: 'full_description.txt',
        shortDescription: 'short_description.txt',
        title: 'title.txt',
        video: 'video.txt'
    };

    let resource: AndroidResource = {
        language: languageCode
    };

    for (let i in resourceParts) {
        if (resourceParts.hasOwnProperty(i)) {
            let file: string = path.join(directory, resourceParts[i]);
            // let fileContents;
            try {
                let fileContents: Buffer = fs.readFileSync(file);
                resource[i] = fileContents.toString();
            } catch (e) {
                tl.debug(`Failed to read metadata file ${file}:`);
                tl.debug(e);
                tl.debug('Ignoring...');
            }
        }
    }

    tl.debug(`Finished constructing listing resource ${JSON.stringify(resource)}`);
    return resource;
}

/**
 * Upload images to the app listing.
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns {Promise} response Response from last attempted image upload
 *                             { image: { id: string, url: string, sha1: string } }
 */
async function attachImages(edits: any, languageCode: string, directory: string) {
    let imageList: any = getImageList(directory);

    let cnt: number = 0;
    for (let imageType in imageList) {
        if (imageList.hasOwnProperty(imageType)) {
            let images: any = imageList[imageType];
            for (let i in images) {
                if (images.hasOwnProperty(i)) {
                    tl.debug(`Uploading image of type ${imageType} from ${images[i]}`);
                    await uploadImage(edits, languageCode, imageType, images[i]);
                    cnt++;
                }
            }
        }
    }

    tl.debug(`${cnt} image(s) uploaded.`);
}

/**
 * Get all the images in the metadata directory that need to be uploaded.
 * Assumes all files are in a folder labeled "images" at the root of directory
 * directory
 *  └ images
 *    ├ featureGraphic.png    || featureGraphic.jpg   || featureGraphic.jpeg
 *    ├ icon.png              || icon.jpg             || icon.jpeg
 *    ├ promoGraphic.png      || promoGraphic.jpg     || promoGraphic.jpeg
 *    ├ tvBanner.png          || tvBanner.jpg         || tvBanner.jpeg
 *    ├ phoneScreenshots
 *    |  └ *.png || *.jpg || *.jpeg
 *    ├ sevenInchScreenshots
 *    |  └ *.png || *.jpg || *.jpeg
 *    ├ tenInchScreenshots
 *    |  └ *.png || *.jpg || *.jpeg
 *    ├ tvScreenshots
 *    |  └ *.png || *.jpg || *.jpeg
 *    └ wearScreenshots
 *       └ *.png || *.jpg || *.jpeg
 * @param {string} directory Directory where the "images" folder is found matching the structure specified above
 * @returns {Object} imageList Map of image types to lists of images matching that type.
 *                              { [imageType]: string[] }
 */
function getImageList(directory: string): any {
    let imageTypes: string[] = ['featureGraphic', 'icon', 'promoGraphic', 'tvBanner', 'phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots', 'tvScreenshots', 'wearScreenshots'];
    let acceptedExtensions: string[] = ['.png', '.jpg', '.jpeg'];

    let imageDirectory: string = path.join(directory, 'images');
    let imageList: any = {};

    for (let imageType of imageTypes) {
        let shouldAttemptUpload: boolean = false;

        imageList[imageType] = [];

        tl.debug(`Attempting to get images of type ${imageType}`);
        switch (imageType) {
            case 'featureGraphic':
            case 'icon':
            case 'promoGraphic':
            case 'tvBanner':
                for (let acceptedExtension of acceptedExtensions) {
                    let fullPathToFileToCheck: string = path.join(imageDirectory, imageType + acceptedExtension);
                    try {
                        let imageStat: fs.Stats = fs.statSync(fullPathToFileToCheck);
                        if (imageStat) {
                            shouldAttemptUpload = imageStat.isFile();
                            if (shouldAttemptUpload) {
                                console.log(tl.loc('FoundImageAtPath', imageType, fullPathToFileToCheck));
                                imageList[imageType].push(fullPathToFileToCheck);
                                break;
                            }
                        }
                    } catch (e) {
                        tl.debug(`File ${fullPathToFileToCheck} doesn't exist. Skipping...`);
                    }
                }

                if (!shouldAttemptUpload) {
                    console.log(tl.loc('ImageTypeNotFound', imageType));
                }
                break;
            case 'phoneScreenshots':
            case 'sevenInchScreenshots':
            case 'tenInchScreenshots':
            case 'tvScreenshots':
            case 'wearScreenshots':
                try {
                    let fullPathToDirToCheck: string = path.join(imageDirectory, imageType);
                    let imageStat: fs.Stats = fs.statSync(fullPathToDirToCheck);
                    if (imageStat) {
                        tl.debug(`Found something for type ${imageType}`);
                        shouldAttemptUpload = imageStat.isDirectory();
                        if (!shouldAttemptUpload) {
                            console.log(tl.loc('StatNotDirectory', imageType));
                        } else {
                            imageList[imageType] = fs.readdirSync(fullPathToDirToCheck)
                                .filter(function (image) {
                                    let pathIsFile = false;
                                    try {
                                        pathIsFile = fs.statSync(path.join(fullPathToDirToCheck, image)).isFile();
                                    } catch (e) {
                                        tl.debug(e);
                                        tl.debug(`Failed to stat path ${image}. Ignoring...`);
                                    }

                                    return pathIsFile;
                                })
                                .map(function (image) {
                                    return path.join(fullPathToDirToCheck, image);
                                });
                        }
                    }
                } catch (e) {
                    tl.debug(e);
                    console.log(tl.loc('ImageDirNotFound', imageType));
                }
                break;
            default:
                tl.debug(`Image type ${imageType} is an unknown type and was ignored`);
                continue;
        }
    }

    tl.debug(`Finished enumerating images: ${JSON.stringify(imageList)}`);
    return imageList;
}

/**
 * Attempts to upload the specified image to the edit
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} imageType One of the following values: "featureGraphic", "icon", "promoGraphic", "tvBanner", "phoneScreenshots", "sevenInchScreenshots", "tenInchScreenshots", "tvScreenshots", "wearScreenshots"
 * @param {string} imagePath Path to image to attempt upload with
 * @returns {Promise} imageUploadPromise A promise that will return after the image upload has completed or failed. Upon success, returns an object
 *                                       { image: [ { id: string, url: string, sha1: string } ] }
 */
async function uploadImage(edits: any, languageCode: string, imageType: string, imagePath: string) {
    let imageRequest: PackageParams = {
        language: languageCode,
        imageType: imageType
    };

    try {
        // User Story 955465 and https://github.com/Microsoft/google-play-vsts-extension/issues/34
        tl.debug(`Removing old images of type ${imageType}.`);
        tl.debug('Request Parameters: ' + JSON.stringify(imageRequest));
        await edits.images.deleteallAsync(imageRequest);
        tl.debug(`Successfully removed old images of type ${imageType}.`);
    } catch (e) {
        tl.debug(`Failed to remove old images of type ${imageType}.`);
        tl.debug(e);
    }

    imageRequest.uploadType = 'media';
    imageRequest.media = {
        body: fs.createReadStream(imagePath),
        mimeType: helperResolveImageMimeType(imagePath)
    };

    try {
        tl.debug(`Uploading image ${imagePath} of type ${imageType}.`);
        tl.debug('Request Parameters: ' + JSON.stringify(imageRequest));
        await edits.images.uploadAsync(imageRequest);
        tl.debug(`Successfully uploaded image ${imagePath} of type ${imageType}.`);
    } catch (e) {
        tl.debug(`Failed to upload image ${imagePath} of type ${imageType}.`);
        tl.debug(e);
        throw new Error(tl.loc('UploadImageFail'));
    }
}

/**
 * Attempts to resolve the image mime type of the given path.
 * Not compelete. DO NOT REUSE.
 * @param {string} imagePath Path to attempt to resolve image mime for.
 * @returns {string} mimeType Google Play accepted image mime type that imagePath most closely maps to.
 */
function helperResolveImageMimeType(imagePath: string): string {
    let extension: string = imagePath.split('.').pop();

    switch (extension) {
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        default:
            tl.debug(`Could not resolve image mime type for ${imagePath}. Defaulting to jpeg.`);
            return 'image/jpeg';
    }
}

/**
 * Update the universal parameters attached to every request
 * @param {string} paramName Name of parameter to add/update
 * @param {any} value value to assign to paramName. Any value is admissible.
 * @returns {void} void
 */
function updateGlobalParams(globalParams: GlobalParams, paramName: string, value: any): void {
    tl.debug(`Updating Global Parameter ${paramName} to ` + JSON.stringify(value));
    globalParams.params[paramName] = value;
    google.options(globalParams);
    tl.debug('   ... updated.');
}

/**
 * Get the appropriate file from the provided pattern
 * @param {string} path The minimatch pattern of glob to be resolved to file path
 * @returns {string} path path of the file resolved by glob
 */
function resolveGlobPath(path: string): string {
    if (path) {
        // VSTS tries to be smart when passing in paths with spaces in them by quoting the whole path. Unfortunately, this actually breaks everything, so remove them here.
        path = path.replace(/\"/g, '');

        let filesList: string[] = glob.sync(path);
        if (filesList.length > 0) {
            path = filesList[0];
        }
    }

    return path;
}

/**
 * Get the appropriate files from the provided pattern
 * @param {string} path The minimatch pattern of glob to be resolved to file path
 * @returns {string[]} paths of the files resolved by glob
 */
function resolveGlobPaths(path: string): string[] {
    if (path) {
        // Convert the path pattern to a rooted one. We do this to mimic for string inputs the behaviour of filePath inputs provided by Build Agent.
        path = tl.resolve(tl.getVariable('System.DefaultWorkingDirectory'), path);

        let filesList: string[] = glob.sync(path);
        return filesList;
    }

    return [];
}

/**
 * Get unique APK file paths from main and additional APK file inputs.
 * @returns {string[]} paths of the files
 */
function getAllApkPaths(mainApkFile: string): string[] {
    let apkFileList: { [key: string]: number } = {};

    apkFileList[mainApkFile] = 0;

    let additionalApks: string[] = tl.getDelimitedInput('additionalApks', '\n');
    additionalApks.forEach((additionalApk) => {
        tl.debug(`Additional APK pattern: ${additionalApk}`);
        let apkPaths: string[] = resolveGlobPaths(additionalApk);

        apkPaths.forEach((apkPath) => {
            apkFileList[apkPath] = 0;
            let versionCode = apkParser.readFile(apkPath).readManifestSync().versionCode;
            tl.debug(`    Found the additional APK file: ${apkPath} (version code ${versionCode}).`);
        });
    });

    return Object.keys(apkFileList);
}

function getVersionCodeListInput(): number[] {
    let versionCodeFilterInput: string[] = tl.getDelimitedInput('replaceList', ',', false);
    let versionCodeFilter: number[] = [];
    let incorrectCodes: string[] = [];

    for (let versionCode of versionCodeFilterInput) {
        let versionCodeNumber: number = parseInt(versionCode.trim(), 10);

        if (versionCodeNumber && (versionCodeNumber > 0)) {
            versionCodeFilter.push(versionCodeNumber);
        } else {
            incorrectCodes.push(versionCode.trim());
        }
    }

    if (incorrectCodes.length > 0) {
        throw new Error(tl.loc('IncorrectVersionCodeFilter', JSON.stringify(incorrectCodes)));
    } else {
        return versionCodeFilter;
    }
}

// Future features:
// ----------------
// 1) Adding testers
// 2) Adding new images
// 3) Adding expansion files
// 4) Updating contact info

run();
