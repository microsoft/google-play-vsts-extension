import * as fs from 'fs';
import * as path from 'path';
import * as tl from 'azure-pipelines-task-lib';
import * as glob from 'glob';
import * as googleutil from './googleutil';

import { androidpublisher_v3 as pub3 } from 'googleapis';

async function run() {
    try {
        tl.setResourcePath(path.join(__dirname, 'task.json'));

        tl.debug('Prepare task inputs.');

        const packageName: string = tl.getInput('packageName', true);
        const authType: string = tl.getInput('authType', true);

        let key: googleutil.ClientKey = {};
        if (authType === 'JsonFile') {
            const serviceAccountKeyFile: string = tl.getPathInput('serviceAccountKey', true, true);

            const stats: tl.FsStats = tl.stats(serviceAccountKeyFile);
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

        const mainBundlePattern = tl.getPathInput('bundleFile', true);
        tl.debug(`Main bundle pattern: ${mainBundlePattern}`);

        const bundleFile: string = resolveGlobPath(mainBundlePattern);
        tl.checkPath(bundleFile, 'bundleFile');
        console.log(tl.loc('FoundMainBundle', bundleFile));
        tl.debug(`Found the main bundle file: ${bundleFile}.`);

        const versionCodeFilterType: string = tl.getInput('versionCodeFilterType', false) ;
        let versionCodeFilter: string | string[] = null;
        if (versionCodeFilterType === 'list') {
            versionCodeFilter = tl.getDelimitedInput('replaceList', ',', false).map((s) => s.trim());
        } else if (versionCodeFilterType === 'expression') {
            versionCodeFilter = tl.getInput('replaceExpression', true);
        }

        const track: string = tl.getInput('track', true);
        const userFractionSupplied: boolean = tl.getBoolInput('rolloutToUserFraction');
        const userFraction: number = Number(userFractionSupplied ? tl.getInput('userFraction', false) : 1.0);

        const shouldAttachMetadata: boolean = tl.getBoolInput('shouldAttachMetadata', false);

        let changelogFile: string = null;
        let languageCode: string = null;
        let metadataRootPath: string = null;

        if (shouldAttachMetadata) {
            metadataRootPath = tl.getPathInput('metadataRootPath', true, true);
        } else {
            changelogFile = tl.getInput('changelogFile', false);
            languageCode = tl.getInput('languageCode', false) || 'en-US';
        }

        const globalParams: googleutil.GlobalParams = { auth: null, params: {} };
        let bundleVersionCode: number;

        // The submission process is composed
        // of a transction with the following steps:
        // -----------------------------------------
        // //#1) Extract the package name from the specified APK file
        // #2) Get an OAuth token by authentincating the service account
        // #3) Create a new editing transaction
        // #4) Upload the new APK(s)
        // #5) Specify the track that should be used for the new APK (e.g. alpha, beta)
        // #6) Specify the new change log
        // #7) Commit the edit transaction

        googleutil.updateGlobalParams(globalParams, 'packageName', packageName);

        tl.debug('Initializing JWT.');
        const jwtClient: any = googleutil.getJWT(key);
        globalParams.auth = jwtClient;

        tl.debug('Initializing Google Play publisher API.');
        const edits = googleutil.publisher.edits;

        tl.debug('Authorize JWT.');
        await jwtClient.authorize();

        console.log(tl.loc('GetNewEditAfterAuth'));
        tl.debug('Creating a new edit transaction in Google Play.');
        const edit = await googleutil.getNewEdit(edits, globalParams, packageName);
        googleutil.updateGlobalParams(globalParams, 'editId', edit.id);

        console.log(tl.loc('UploadBundle'));
        tl.debug(`Uploading bundle ${bundleFile}`);
        const bundleRes = await googleutil.addBundle(edits, packageName, bundleFile);
        tl.debug(`Uploaded ${bundleFile} with the version code ${bundleRes.versionCode}`);
        bundleVersionCode = bundleRes.versionCode;

        if (bundleVersionCode && tl.getBoolInput('shouldUploadMappingFile', false)) {
            const mappingFilePattern = tl.getPathInput('mappingFilePath', false);
            tl.debug(`Mapping file pattern: ${mappingFilePattern}`);

            const mappingFilePath = resolveGlobPath(mappingFilePattern);
            tl.checkPath(mappingFilePath, 'mappingFilePath');
            console.log(tl.loc('FoundDeobfuscationFile', mappingFilePath));
            tl.debug(`Uploading mapping file ${mappingFilePath}`);
            await googleutil.uploadDeobfuscation(edits, mappingFilePath, packageName, bundleVersionCode);
            tl.debug(`Uploaded ${mappingFilePath} for Bundle ${bundleFile}`);
        }

        let releaseNotes: pub3.Schema$LocalizedText[];
        if (shouldAttachMetadata) {
            console.log(tl.loc('AttachingMetadataToRelease'));
            tl.debug(`Uploading metadata from ${metadataRootPath}`);
            releaseNotes = await addMetadata(edits, [bundleVersionCode], metadataRootPath);
        } else if (changelogFile) {
            tl.debug(`Uploading the common change log ${changelogFile} to all versions`);
            const commonNotes = await getCommonReleaseNotes(languageCode, changelogFile);
            releaseNotes = commonNotes && [commonNotes];
        }

        console.log(tl.loc('UpdateTrack'));
        tl.debug(`Updating the track ${track}.`);
        const updatedTrack: pub3.Schema$Track = await updateTrack(edits, packageName, track, '' + bundleVersionCode, versionCodeFilterType, versionCodeFilter, userFraction, releaseNotes);
        tl.debug('Updated track info: ' + JSON.stringify(updatedTrack));

        tl.debug('Committing the edit transaction in Google Play.');
        await edits.commit();

        console.log(tl.loc('AptPublishSucceed'));
        console.log(tl.loc('TrackInfo', track));
        tl.setResult(tl.TaskResult.Succeeded, tl.loc('Success'));
    } catch (e) {
        tl.setResult(tl.TaskResult.Failed, e);
    }
}

/**
 * Update a given release track with the given information
 * Assumes authorized
 * @param {string} packageName unique android package name (com.android.etc)
 * @param {string} track one of the values {"internal", "alpha", "beta", "production"}
 * @param {number[]} bundleVersionCode version code of uploaded modules.
 * @param {string} versionCodeListType type of version code replacement filter, i.e. 'all', 'list', or 'expression'
 * @param {string | string[]} versionCodeFilter version code filter, i.e. either a list of version code or a regular expression string.
 * @param {double} userFraction the fraction of users to get update
 * @returns {Promise} track A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
async function updateTrack(
    edits: pub3.Resource$Edits,
    packageName: string,
    track: string,
    bundleVersionCode: string,
    versionCodeListType: string,
    versionCodeFilter: string | string[],
    userFraction: number,
    releaseNotes?: pub3.Schema$LocalizedText[]): Promise<pub3.Schema$Track> {

    let newTrackVersionCodes: string[] = [];
    let res: pub3.Schema$Track;

    if (versionCodeListType === 'all') {
        newTrackVersionCodes = [bundleVersionCode];
    } else {
        try {
            res = await googleutil.getTrack(edits, packageName, track);
        } catch (e) {
            tl.debug(`Failed to download track ${track} information.`);
            tl.debug(e);
            throw new Error(tl.loc('CannotDownloadTrack', track, e));
        }

        const oldTrackVersionCodes: string[] = res.releases[0].versionCodes;
        tl.debug('Current version codes: ' + JSON.stringify(oldTrackVersionCodes));

        if (typeof(versionCodeFilter) === 'string') {
            tl.debug(`Removing version codes matching the regular expression: ^${versionCodeFilter as string}$`);
            const versionCodesToRemove: RegExp = new RegExp(`^${versionCodeFilter as string}$`);

            oldTrackVersionCodes.forEach((versionCode) => {
                if (!versionCode.toString().match(versionCodesToRemove)) {
                    newTrackVersionCodes.push(versionCode);
                }
            });
        } else {
            const versionCodesToRemove = versionCodeFilter;
            tl.debug('Removing version codes: ' + JSON.stringify(versionCodesToRemove));

            oldTrackVersionCodes.forEach((versionCode) => {
                if (versionCodesToRemove.indexOf(versionCode) === -1) {
                    newTrackVersionCodes.push(versionCode);
                }
            });
        }

        tl.debug('Version codes to keep: ' + JSON.stringify(newTrackVersionCodes));
        if (newTrackVersionCodes.indexOf(bundleVersionCode) === -1) {
            newTrackVersionCodes.push(bundleVersionCode);
        }
    }

    tl.debug(`New ${track} track version codes: ` + JSON.stringify(newTrackVersionCodes));
    try {
        res = await googleutil.updateTrack(edits, packageName, track, newTrackVersionCodes, userFraction, releaseNotes);
    } catch (e) {
        tl.debug(`Failed to update track ${track}.`);
        tl.debug(e);
        throw new Error(tl.loc('CannotUpdateTrack', track, e));
    }
    return res;
}

/**
 * Uploads change log files if specified for all the apk version codes in the update
 * @param changelogFile
 * @param apkVersionCodes
 * @returns nothing
 */
async function getCommonReleaseNotes(languageCode: string, changelogFile: string): Promise<pub3.Schema$LocalizedText | null> {
    const stats: tl.FsStats = tl.stats(changelogFile);

    let releaseNotes: pub3.Schema$LocalizedText = null;
    if (stats && stats.isFile()) {
        console.log(tl.loc('AppendChangelog', changelogFile));
        releaseNotes = {
            language: languageCode,
            text: getChangelog(changelogFile)
        };

    } else {
        tl.debug(`The change log path ${changelogFile} either does not exist or points to a directory. Ignoring...`);
    }
    return releaseNotes;
}

/**
 * Reads a change log from a file
 * Assumes authorized
 * @param {string} changelogFile Path to changelog file.
 * @returns {string} change log file content as a string.
 */
function getChangelog(changelogFile: string): string {
    tl.debug(`Reading change log from ${changelogFile}`);
    try {
        return fs.readFileSync(changelogFile).toString();
    } catch (e) {
        tl.debug(`Change log reading from ${changelogFile} failed`);
        tl.debug(e);
        throw new Error(tl.loc('CannotReadChangeLog', changelogFile));
    }
}

/**
 * Adds all release notes found in directory to an edit. Pulls version code from file name. Failing this, assumes the global version code inferred from apk
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory with a changesogs folder where release notes can be found.
 * @returns nothing
 */
async function addAllReleaseNotes(apkVersionCodes: number[], languageCode: string, directory: string): Promise<pub3.Schema$LocalizedText[]> {
    const changelogDir: string = path.join(directory, 'changelogs');

    const changelogs: string[] = filterDirectoryContents(changelogDir, stat => stat.isFile());

    if (changelogs.length === 0) {
        return [];
    }

    const releaseNotes: pub3.Schema$LocalizedText[] = [];
    for (const changelogFile of changelogs) {
        const changelogName: string = path.basename(changelogFile, path.extname(changelogFile));
        const changelogVersion: number = parseInt(changelogName, 10);
        if (!isNaN(changelogVersion) && (apkVersionCodes.indexOf(changelogVersion) !== -1)) {
            const fullChangelogPath: string = path.join(changelogDir, changelogFile);

            console.log(tl.loc('AppendChangelog', fullChangelogPath));
            releaseNotes.push({
                language: languageCode,
                text: getChangelog(fullChangelogPath)
            });
            tl.debug(`Found release notes version ${changelogVersion} from ${fullChangelogPath} for language code ${languageCode}`);
        } else {
            tl.debug(`The name of the file ${changelogFile} is not a valid version code. Skipping it.`);
        }
    }

    tl.debug(`All release notes found for ${changelogDir}: ${JSON.stringify(releaseNotes)}`);
    return releaseNotes;
}

/**
 * Filters the directory contents to find files or directories
 * @param {string} directory the directory to search
 * @param {(stats: tl.FsStats) => boolean} filter callback on every item in the directory, return true to keep the results
 * @returns the filtered contents of the directory
 */
function filterDirectoryContents(directory: string, filter: (stats: tl.FsStats) => boolean): string[] {
    return fs.readdirSync(directory).filter(subPath => {
        try {
            const fullPath: string = path.join(directory, subPath);
            tl.debug(`Checking path ${fullPath}`);
            return filter(tl.stats(fullPath));
        } catch (e) {
            tl.debug(`Failed to stat path ${subPath}:`);
            tl.debug(e);
            tl.debug('Ignoring...');
            return false;
        }
    });
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
 * @returns nothing
 */
async function addMetadata(edits: pub3.Resource$Edits, apkVersionCodes: number[], metadataRootDirectory: string): Promise<pub3.Schema$LocalizedText[]> {
    const metadataLanguageCodes: string[] = filterDirectoryContents(metadataRootDirectory, stat => stat.isDirectory());
    tl.debug(`Found language codes: ${metadataLanguageCodes}`);

    let allReleaseNotes: pub3.Schema$LocalizedText[] = [];
    for (const languageCode of metadataLanguageCodes) {
        const metadataDirectory: string = path.join(metadataRootDirectory, languageCode);

        tl.debug(`Uploading metadata from ${metadataDirectory} for language code ${languageCode} and version codes ${apkVersionCodes}`);
        const releaseNotesForLanguage = await uploadMetadataWithLanguageCode(edits, apkVersionCodes, languageCode, metadataDirectory);
        allReleaseNotes = allReleaseNotes.concat(releaseNotesForLanguage);
    }

    tl.debug(`Collected ${allReleaseNotes.length} release notes`);
    return allReleaseNotes;
}

/**
 * Updates the details for a language with new information
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns nothing
 */
async function uploadMetadataWithLanguageCode(edits: pub3.Resource$Edits, apkVersionCodes: number[], languageCode: string, directory: string): Promise<pub3.Schema$LocalizedText[]> {
    console.log(tl.loc('UploadingMetadataForLanguage', directory, languageCode));

    tl.debug(`Adding localized store listing for language code ${languageCode} from ${directory}`);
    await addLanguageListing(edits, languageCode, directory);

    tl.debug(`Uploading change logs for language code ${languageCode} from ${directory}`);
    const releaseNotes: pub3.Schema$LocalizedText[] = await addAllReleaseNotes(apkVersionCodes, languageCode, directory);

    tl.debug(`Uploading images for language code ${languageCode} from ${directory}`);
    await attachImages(edits, languageCode, directory);

    return releaseNotes;
}

/**
 * Updates the details for a language with new information
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns nothing
 */
async function addLanguageListing(edits: pub3.Resource$Edits, languageCode: string, directory: string) {
    const listingResource: googleutil.AndroidListingResource = createListingResource(languageCode, directory);

    const isPatch:boolean = (!listingResource.fullDescription) ||
                          (!listingResource.shortDescription) ||
                          (!listingResource.title);

    const isEmpty:boolean = (!listingResource.fullDescription) &&
                          (!listingResource.shortDescription) &&
                          (!listingResource.video) &&
                          (!listingResource.title);

    const listingRequestParameters: googleutil.PackageListingParams = {
        language: languageCode,
        resource: listingResource
    };

    try {

        if (isEmpty) {
            tl.debug(`Skip localized ${languageCode} store listing.`);
        } else if (isPatch) {
            tl.debug(`Patching an existing localized ${languageCode} store listing.`);
            tl.debug('Request Parameters: ' + JSON.stringify(listingRequestParameters));
            await edits.listings.patch(listingRequestParameters);
            tl.debug(`Successfully patched the localized ${languageCode} store listing.`);
        } else {
            // The patch method fails if the listing for the language does not exist already,
            // while update actually updates or creates.
            tl.debug(`Updating a localized ${languageCode} store listing.`);
            tl.debug('Request Parameters: ' + JSON.stringify(listingRequestParameters));
            await edits.listings.update(listingRequestParameters);
            tl.debug(`Successfully updated the localized ${languageCode} store listing.`);
        }
    } catch (e) {
        tl.debug(`Failed to create the localized ${languageCode} store listing.`);
        tl.debug(e);
        throw new Error(tl.loc('CannotCreateListing', languageCode, e));
    }
}

/**
 * Helper method for creating the resource for the edits.listings.update method.
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns {AndroidListingResource} resource A crafted resource for the edits.listings.update method.
 *          { languageCode: string, fullDescription: string, shortDescription: string, title: string, video: string }
 */
function createListingResource(languageCode: string, directory: string): googleutil.AndroidListingResource {
    tl.debug(`Constructing resource to update listing with language code ${languageCode} from ${directory}`);

    const resourceParts = {
        fullDescription: 'full_description.txt',
        shortDescription: 'short_description.txt',
        title: 'title.txt',
        video: 'video.txt'
    };

    const resource: googleutil.AndroidListingResource = {
        language: languageCode
    };

    for (const i in resourceParts) {
        if (resourceParts.hasOwnProperty(i)) {
            const file: string = path.join(directory, resourceParts[i]);
            try {
                const fileContents: Buffer = fs.readFileSync(file);
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
 * @returns nothing
 */
async function attachImages(edits: pub3.Resource$Edits, languageCode: string, directory: string) {
    const imageList: { [key: string]: string[] } = getImageList(directory);
    tl.debug(`Found ${languageCode} images: ${JSON.stringify(imageList)}`);

    let cnt: number = 0;
    for (const imageType of Object.keys(imageList)) {
        const images: string[] = imageList[imageType];
        tl.debug(`Uploading images of type ${imageType}: ${JSON.stringify(images)}`);

        if (images.length > 0) {
            await removeOldImages(edits, languageCode, imageType);
        }

        for (const image of images) {
            tl.debug(`Uploading image of type ${imageType} from ${image}`);
            await uploadImage(edits, languageCode, imageType, image);
            cnt++;
        }
    }

    tl.debug(`${cnt} image(s) uploaded.`);
}

/**
 * Remove existing images from the app listing.
 * See the user Story 955465 and https://github.com/Microsoft/google-play-vsts-extension/issues/34.
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} imageType type of images.
 * @returns nothing
 */
async function removeOldImages(edits: pub3.Resource$Edits, languageCode: string, imageType: string) {
    try {
        let imageRequest: pub3.Params$Resource$Edits$Images$Deleteall = {
            language: languageCode,
            imageType: imageType
        };

        tl.debug(`Removing old images of type ${imageType} for language ${languageCode}.`);
        tl.debug('Request Parameters: ' + JSON.stringify(imageRequest));
        await edits.images.deleteall(imageRequest);
        tl.debug(`Successfully removed old images of type ${imageType} for language ${languageCode}.`);
    } catch (e) {
        tl.debug(`Failed to remove old images of type ${imageType} for language ${languageCode}.`);
        tl.debug(e);
    }
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
function getImageList(directory: string): { [key: string]: string[] } {
    const imageTypes: string[] = ['featureGraphic', 'icon', 'promoGraphic', 'tvBanner', 'phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots', 'tvScreenshots', 'wearScreenshots'];
    const acceptedExtensions: string[] = ['.png', '.jpg', '.jpeg'];

    const imageDirectory: string = path.join(directory, 'images');
    const imageList: { [key: string]: string[] }  = {};

    for (const imageType of imageTypes) {
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
                        let imageStat: tl.FsStats = tl.stats(fullPathToFileToCheck);
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
                                    try {
                                        return fs.statSync(path.join(fullPathToDirToCheck, image)).isFile();
                                    } catch (e) {
                                        tl.debug(e);
                                        tl.debug(`Failed to stat path ${image}. Ignoring...`);
                                    }

                                    return false;
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
 * @returns nothing
 */
async function uploadImage(edits: pub3.Resource$Edits, languageCode: string, imageType: string, imagePath: string) {
    // Docs at https://developers.google.com/android-publisher/api-ref/edits/images/upload
    const imageRequest: pub3.Params$Resource$Edits$Images$Upload = {
        language: languageCode,
        imageType: imageType
    };
    // imageRequest.uploadType = 'media';
    imageRequest.media = {
        body: fs.createReadStream(imagePath),
        mimeType: helperResolveImageMimeType(imagePath)
    };

    try {
        tl.debug(`Uploading image ${imagePath} of type ${imageType}.`);
        tl.debug('Request Parameters: ' + JSON.stringify(imageRequest));
        await edits.images.upload(imageRequest);
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
    const extension: string = imagePath.split('.').pop();

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
 * Get the appropriate file from the provided pattern
 * @param {string} path The minimatch pattern of glob to be resolved to file path
 * @returns {string} path path of the file resolved by glob
 */
function resolveGlobPath(path: string): string {
    if (path) {
        // VSTS tries to be smart when passing in paths with spaces in them by quoting the whole path. Unfortunately, this actually breaks everything, so remove them here.
        path = path.replace(/\"/g, '');

        const filesList: string[] = glob.sync(path);
        if (filesList.length > 0) {
            path = filesList[0];
        }
    }

    return path;
}

// Future features:
// ----------------
// 1) Adding testers
// 2) Adding new images
// 3) Adding expansion files
// 4) Updating contact info

run();
