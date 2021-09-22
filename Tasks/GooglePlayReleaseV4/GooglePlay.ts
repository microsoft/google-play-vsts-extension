import * as fs from 'fs';
import * as path from 'path';
import * as tl from 'azure-pipelines-task-lib/task';
import * as glob from 'glob';

import * as googleutil from './googleutil';
import * as metadataHelper from './metadataHelper';

import * as googleapis from 'googleapis';
import { androidpublisher_v3 as pub3 } from 'googleapis';

type Action = 'OnlyStoreListing' | 'SingleBundle' | 'SingleApk' | 'MultiApkAab';

async function run(): Promise<void> {
    try {
        tl.setResourcePath(path.join(__dirname, 'task.json'));

        tl.debug('Prepare task inputs.');

        // Authentication inputs

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

        // General inputs

        const actionString: string = tl.getInput('action', false);
        if (
            actionString !== 'MultiApkAab'
            && actionString !== 'SingleBundle'
            && actionString !== 'SingleApk'
            && actionString !== 'OnlyStoreListing'
        ) {
            throw new Error(`Action input value is invalid: ${actionString}`);
        }
        const action: Action = actionString;
        tl.debug(`Action: ${action}`);

        const packageName: string = tl.getInput('applicationId', true);
        tl.debug(`Application identifier: ${packageName}`);

        const bundleFileList: string[] = getBundles(action);
        tl.debug(`Bundles: ${bundleFileList}`);
        const apkFileList: string[] = getApks(action);
        tl.debug(`APKs: ${apkFileList}`);

        const shouldPickObb: boolean = tl.getBoolInput('shouldPickObbFile', false);

        if (shouldPickObb && apkFileList.length === 0) {
            throw new Error(tl.loc('MustProvideApkIfObb'));
        }

        if (action !== 'OnlyStoreListing' && bundleFileList.length === 0 && apkFileList.length === 0) {
            throw new Error(tl.loc('MustProvideApkOrAab'));
        }

        const track: string = tl.getInput('track', true);

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

        // Advanced inputs

        const updatePrioritySupplied: boolean = tl.getBoolInput('changeUpdatePriority');
        const updatePriority: number = Number(updatePrioritySupplied ? tl.getInput('updatePriority', false) : 0);

        const userFractionSupplied: boolean = tl.getBoolInput('rolloutToUserFraction');
        const userFraction: number = Number(userFractionSupplied ? tl.getInput('userFraction', false) : 1.0);

        const uploadMappingFile: boolean = tl.getBoolInput('shouldUploadMappingFile', false);
        const mappingFilePattern: string = tl.getInput('mappingFilePath');

        const changesNotSentForReview: boolean = tl.getBoolInput('changesNotSentForReview');

        const releaseName: string = tl.getInput('releaseName', false);

        const versionCodeFilterType: string = tl.getInput('versionCodeFilterType', false) || 'all';
        let versionCodeFilter: string | number[] = null;
        if (versionCodeFilterType === 'list') {
            versionCodeFilter = getVersionCodeListInput();
        } else if (versionCodeFilterType === 'expression') {
            versionCodeFilter = tl.getInput('replaceExpression', true);
        }

        // Warn about unused inputs

        switch (action) {
            case 'MultiApkAab': warnIfUnusedInputsSet('bundleFile', 'apkFile', 'shouldUploadMappingFile', 'mappingFilePath'); break;
            case 'SingleBundle': warnIfUnusedInputsSet('apkFile', 'bundleFiles', 'apkFiles'); break;
            case 'SingleApk': warnIfUnusedInputsSet('bundleFile', 'bundleFiles', 'apkFiles'); break;
            case 'OnlyStoreListing': warnIfUnusedInputsSet('bundleFile', 'apkFile', 'bundleFiles', 'apkFiles', 'track'); break;
        }

        // The regular submission process is composed
        // of a transction with the following steps:
        // -----------------------------------------
        // #1) Get an OAuth token by authentincating the service account
        // #2) Create a new editing transaction
        // #3) Upload the new APK(s) or AAB(s)
        // #4) Specify the track that should be used for the new APK/AAB (e.g. alpha, beta)
        // #5) Specify the new change log
        // #6) Commit the edit transaction

        const globalParams: googleapis.Common.GlobalOptions = { auth: null, params: {} };

        googleutil.updateGlobalParams(globalParams, 'packageName', packageName);

        tl.debug('Initializing JWT.');
        const jwtClient: googleapis.Common.JWT = googleutil.getJWT(key);
        globalParams.auth = jwtClient;

        tl.debug('Initializing Google Play publisher API.');
        const edits: pub3.Resource$Edits = googleutil.publisher.edits;

        tl.debug('Authorize JWT.');
        await jwtClient.authorize();

        console.log(tl.loc('GetNewEditAfterAuth'));
        tl.debug('Creating a new edit transaction in Google Play.');
        const edit: pub3.Schema$AppEdit = await googleutil.getNewEdit(edits, packageName);
        googleutil.updateGlobalParams(globalParams, 'editId', edit.id);

        let requireTrackUpdate = false;
        const versionCodes: number[] = [];

        if (action === 'OnlyStoreListing') {
            tl.debug('Selected store listing update only -> skip APK/AAB reading');
        } else {
            requireTrackUpdate = true;

            tl.debug(`Uploading ${bundleFileList.length} AAB(s).`);

            for (const bundleFile of bundleFileList) {
                tl.debug(`Uploading bundle ${bundleFile}`);
                const bundle: pub3.Schema$Bundle = await googleutil.addBundle(edits, packageName, bundleFile);
                tl.debug(`Uploaded ${bundleFile} with the version code ${bundle.versionCode}`);
                versionCodes.push(bundle.versionCode);
            }

            tl.debug(`Uploading ${apkFileList.length} APK(s).`);

            for (const apkFile of apkFileList) {
                tl.debug(`Uploading APK ${apkFile}`);
                const apk: pub3.Schema$Apk = await googleutil.addApk(edits, packageName, apkFile);
                tl.debug(`Uploaded ${apkFile} with the version code ${apk.versionCode}`);

                if (shouldPickObb) {
                    const obbFile: string | null = getObbFile(apkFile, packageName, apk.versionCode);

                    if (obbFile !== null) {
                        const obb: pub3.Schema$ExpansionFilesUploadResponse | null = await googleutil.addObb(
                            edits,
                            packageName,
                            obbFile,
                            apk.versionCode,
                            'main'
                        );

                        if (obb.expansionFile.fileSize !== null && Number(obb.expansionFile.fileSize) !== 0) {
                            console.log(`Uploaded Obb file with version code ${apk.versionCode} and size ${obb.expansionFile.fileSize}`);
                        }
                    }
                }
                versionCodes.push(apk.versionCode);
            }

            if (uploadMappingFile) {
                tl.debug(`Mapping file pattern: ${mappingFilePattern}`);

                const mappingFilePath = resolveGlobPath(mappingFilePattern);
                tl.checkPath(mappingFilePath, 'Mapping file path');
                console.log(tl.loc('FoundDeobfuscationFile', mappingFilePath));
                tl.debug(`Uploading ${mappingFilePath} for version code ${versionCodes[0]}`);
                await googleutil.uploadDeobfuscation(edits, mappingFilePath, packageName, versionCodes[0]);
            }
        }

        let releaseNotes: googleapis.androidpublisher_v3.Schema$LocalizedText[];
        if (shouldAttachMetadata) {
            console.log(tl.loc('AttachingMetadataToRelease'));
            tl.debug(`Uploading metadata from ${metadataRootPath}`);
            releaseNotes = await metadataHelper.addMetadata(edits, versionCodes.map((versionCode) => Number(versionCode)), metadataRootPath);
            if (action === 'OnlyStoreListing') {
                tl.debug('Selected store listing update -> skip update track');
            }
            requireTrackUpdate = action !== 'OnlyStoreListing';
        } else if (changelogFile) {
            tl.debug(`Uploading the common change log ${changelogFile} to all versions`);
            const commonNotes = await metadataHelper.getCommonReleaseNotes(languageCode, changelogFile);
            releaseNotes = commonNotes && [commonNotes];
            requireTrackUpdate = true;
        }

        if (requireTrackUpdate) {
            console.log(tl.loc('UpdateTrack'));
            tl.debug(`Updating the track ${track}.`);
            const updatedTrack: pub3.Schema$Track = await updateTrack(
                edits,
                packageName,
                track,
                versionCodes,
                versionCodeFilterType,
                versionCodeFilter,
                userFraction,
                updatePriority,
                releaseNotes,
                releaseName
            );
            tl.debug('Updated track info: ' + JSON.stringify(updatedTrack));
        }

        tl.debug('Committing the edit transaction in Google Play.');
        await edits.commit({ changesNotSentForReview });

        console.log(tl.loc('TrackInfo', track));
        tl.setResult(tl.TaskResult.Succeeded, tl.loc('PublishSucceed'));
    } catch (e) {
        tl.setResult(tl.TaskResult.Failed, e);
    }
}

/**
 * Gets the right bundle(s) depending on the action
 * @param action user's action
 * @returns a list of bundles
 */
function getBundles(action: Action): string[] {
    if (action === 'SingleBundle') {
        const bundlePattern: string = tl.getInput('bundleFile', true);
        const bundlePath: string = resolveGlobPath(bundlePattern);
        tl.checkPath(bundlePath, 'bundlePath');
        return [bundlePath];
    } else if (action === 'MultiApkAab') {
        const bundlePatterns: string[] = tl.getDelimitedInput('bundleFiles', '\n');
        const allBundlePaths = new Set<string>();
        for (const bundlePattern of bundlePatterns) {
            const bundlePaths: string[] = resolveGlobPaths(bundlePattern);
            bundlePaths.forEach((bundlePath) => allBundlePaths.add(bundlePath));
        }
        return Array.from(allBundlePaths);
    }

    return [];
}

/**
 * Gets the right apk(s) depending on the action
 * @param action user's action
 * @returns a list of apks
 */
function getApks(action: Action): string[] {
    if (action === 'SingleApk') {
        const apkPattern: string = tl.getInput('apkFile', true);
        const apkPath: string = resolveGlobPath(apkPattern);
        tl.checkPath(apkPath, 'apkPath');
        return [apkPath];
    } else if (action === 'MultiApkAab') {
        const apkPatterns: string[] = tl.getDelimitedInput('apkFiles', '\n');
        const allApkPaths = new Set<string>();
        for (const apkPattern of apkPatterns) {
            const apkPaths: string[] = resolveGlobPaths(apkPattern);
            apkPaths.forEach((apkPath) => allApkPaths.add(apkPath));
        }
        return Array.from(allApkPaths);
    }

    return [];
}

/**
 * Update a given release track with the given information
 * Assumes authorized
 * @param packageName unique android package name (com.android.etc)
 * @param track one of the values {"internal", "alpha", "beta", "production"}
 * @param bundleVersionCode version code of uploaded modules.
 * @param versionCodeFilterType type of version code replacement filter, i.e. 'all', 'list', or 'expression'
 * @param versionCodeFilter version code filter, i.e. either a list of version code or a regular expression string.
 * @param userFraction the fraction of users to get update
 * @param updatePriority - In-app update priority value of the release. All newly added APKs in the release will be considered at this priority. Can take values in the range [0, 5], with 5 the highest priority. Defaults to 0.
 * @returns track A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
async function updateTrack(
    edits: pub3.Resource$Edits,
    packageName: string,
    track: string,
    versionCodes: number[],
    versionCodeFilterType: string,
    versionCodeFilter: string | number[],
    userFraction: number,
    updatePriority: number,
    releaseNotes?: pub3.Schema$LocalizedText[],
    releaseName?: string
): Promise<pub3.Schema$Track> {

    let newTrackVersionCodes: number[] = [];
    let res: pub3.Schema$Track;

    if (versionCodeFilterType === 'all') {
        newTrackVersionCodes = versionCodes;
    } else {
        try {
            res = await googleutil.getTrack(edits, packageName, track);
        } catch (e) {
            tl.debug(`Failed to download track ${track} information.`);
            tl.debug(e);
            throw new Error(tl.loc('CannotDownloadTrack', track, e));
        }

        const oldTrackVersionCodes: number[] = res.releases[0].versionCodes.map((v) => Number(v));
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
            const versionCodesToRemove = versionCodeFilter as number[];
            tl.debug('Removing version codes: ' + JSON.stringify(versionCodesToRemove));

            oldTrackVersionCodes.forEach((versionCode) => {
                if (versionCodesToRemove.indexOf(versionCode) === -1) {
                    newTrackVersionCodes.push(versionCode);
                }
            });
        }

        tl.debug('Version codes to keep: ' + JSON.stringify(newTrackVersionCodes));
        versionCodes.forEach((versionCode) => {
            if (newTrackVersionCodes.indexOf(versionCode) === -1) {
                newTrackVersionCodes.push(versionCode);
            }
        });
    }

    tl.debug(`New ${track} track version codes: ` + JSON.stringify(newTrackVersionCodes));
    try {
        res = await googleutil.updateTrack(edits, packageName, track, newTrackVersionCodes, userFraction, updatePriority, releaseNotes, releaseName);
    } catch (e) {
        tl.debug(`Failed to update track ${track}.`);
        tl.debug(e);
        throw new Error(tl.loc('CannotUpdateTrack', track, e));
    }
    return res;
}

/**
 * Get the appropriate file from the provided pattern
 * @param path The minimatch pattern of glob to be resolved to file path
 * @returns path path of the file resolved by glob. Returns null if not found or if `path` argument was not provided
 */
function resolveGlobPath(path: string): string {
    if (path) {
        // VSTS tries to be smart when passing in paths with spaces in them by quoting the whole path. Unfortunately, this actually breaks everything, so remove them here.
        path = path.replace(/\"/g, '');

        const filesList: string[] = glob.sync(path);
        if (filesList.length > 0) {
            return filesList[0];
        }

        return null;
    }

    return null;
}

/**
 * Get the appropriate files from the provided pattern
 * @param path The minimatch pattern of glob to be resolved to file path
 * @returns paths of the files resolved by glob
 */
function resolveGlobPaths(path: string): string[] {
    if (path) {
        // Convert the path pattern to a rooted one. We do this to mimic for string inputs the behaviour of filePath inputs provided by Build Agent.
        path = tl.resolve(tl.getVariable('System.DefaultWorkingDirectory'), path);

        let filesList: string[] = glob.sync(path);
        tl.debug(`Additional paths: ${JSON.stringify(filesList)}`);

        return filesList;
    }

    return [];
}

function getVersionCodeListInput(): number[] {
    const versionCodeFilterInput: string[] = tl.getDelimitedInput('replaceList', ',', false);
    const versionCodeFilter: number[] = [];
    const incorrectCodes: string[] = [];

    for (const versionCode of versionCodeFilterInput) {
        const versionCodeNumber: number = parseInt(versionCode.trim(), 10);

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

/**
 * If any of the provided inputs are set, it will show a warning
 * @param inputs inputs to check
 */
function warnIfUnusedInputsSet(...inputs: string[]): void {
    for (const input of inputs) {
        tl.debug(`Checking if unused input ${input} is set...`);
        const inputValue: string | undefined = tl.getInput(input);
        if (inputValue !== undefined && inputValue.length !== 0) {
            tl.warning(tl.loc('SetUnusedInput', input));
        }
    }
}

/**
 * Get obb file. Returns any file with .obb extension if present in parent directory else returns
 * from apk directory with pattern: main.<versionCode>.<packageName>.obb
 * @param apkPath apk file path
 * @param packageName package name of the apk
 * @param versionCode version code of the apk
 * @returns ObbPathFile of the obb file is present else null
 */
function getObbFile(apkPath: string, packageName: string, versionCode: number): string | null {
    const currentDirectory: string = path.dirname(apkPath);
    const parentDirectory: string = path.dirname(currentDirectory);

    const fileNamesInParentDirectory: string[] = fs.readdirSync(parentDirectory);
    const obbPathFileInParent: string | undefined = fileNamesInParentDirectory.find(file => path.extname(file) === '.obb');

    if (obbPathFileInParent) {
        tl.debug(`Found Obb file for upload in parent directory: ${obbPathFileInParent}`);
        return path.join(parentDirectory, obbPathFileInParent);
    }

    const fileNamesInApkDirectory: string[] = fs.readdirSync(currentDirectory);
    const expectedMainObbFile: string = `main.${versionCode}.${packageName}.obb`;
    const obbPathFileInCurrent: string | undefined = fileNamesInApkDirectory.find(file => file.toString() === expectedMainObbFile);

    if (obbPathFileInCurrent) {
        tl.debug(`Found Obb file for upload in current directory: ${obbPathFileInCurrent}`);
        return path.join(currentDirectory, obbPathFileInCurrent);
    } else {
        tl.debug(`No Obb found for ${apkPath}, skipping upload`);
        return null;
    }
}

run();
