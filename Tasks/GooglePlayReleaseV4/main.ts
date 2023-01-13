import * as path from 'path';
import * as tl from 'azure-pipelines-task-lib/task';

import * as googleutil from './modules/googleutil';
import * as metadataHelper from './modules/metadataHelper';
import * as inputsHelper from './modules/inputsHelper';
import * as fileHelper from './modules/fileHelper';

import * as googleapis from 'googleapis';
import { androidpublisher_v3 as pub3 } from 'googleapis';

async function run(): Promise<void> {
    try {
        tl.setResourcePath(path.join(__dirname, 'task.json'));

        tl.debug('Prepare task inputs.');

        // Authentication inputs

        const key: googleutil.ClientKey = inputsHelper.getClientKey();

        // General inputs

        const action: inputsHelper.Action = inputsHelper.getAction();
        tl.debug(`Action: ${action}`);

        const packageName: string = tl.getInput('applicationId', true);
        tl.debug(`Application identifier: ${packageName}`);

        const bundleFileList: string[] = inputsHelper.getBundles(action);
        tl.debug(`Bundles: ${bundleFileList}`);
        const apkFileList: string[] = inputsHelper.getApks(action);
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
            const defaultLanguageCode = 'en-US';
            languageCode = tl.getInput('languageCode', false) || defaultLanguageCode;
        }

        // Advanced inputs

        const updatePrioritySupplied: boolean = tl.getBoolInput('changeUpdatePriority');
        const updatePriority: number = Number(updatePrioritySupplied ? tl.getInput('updatePriority', false) : 0);

        const userFractionSupplied: boolean = tl.getBoolInput('rolloutToUserFraction');
        const userFraction: number = Number(userFractionSupplied ? tl.getInput('userFraction', false) : 1.0);

        const uploadMappingFile: boolean = tl.getBoolInput('shouldUploadMappingFile', false) && (action === 'SingleApk' || action === 'SingleBundle' || action === 'MultiApk');
        const mappingFilePattern: string = tl.getInput('mappingFilePath');

        const uploadNativeDebugSymbols: boolean = tl.getBoolInput('shouldUploadNativeDebugSymbols', false) && (action === 'SingleApk' || action === 'SingleBundle');
        const nativeDebugSymbolsFilePattern: string = tl.getInput('nativeDebugSymbolsFile');

        const changesNotSentForReview: boolean = tl.getBoolInput('changesNotSentForReview');

        const releaseName: string = tl.getInput('releaseName', false);

        const versionCodeFilterType: string = tl.getInput('versionCodeFilterType', false) || 'all';
        let versionCodeFilter: string | number[] = null;
        if (versionCodeFilterType === 'list') {
            versionCodeFilter = inputsHelper.getVersionCodeListInput();
        } else if (versionCodeFilterType === 'expression') {
            versionCodeFilter = tl.getInput('replaceExpression', true);
        }

        inputsHelper.warnAboutUnusedInputs(action);

        // The regular submission process is composed
        // of a transction with the following steps:
        // -----------------------------------------
        // #1) Get an OAuth token by authenticating the service account
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
                    const obbFile: string | null = fileHelper.getObbFile(apkFile, packageName, apk.versionCode);

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
                
                for (const versionCode of versionCodes) {
                     
                        const mappingFilePath = fileHelper.resolveGlobPath(mappingFilePattern);
                tl.checkPath(mappingFilePath, 'Mapping file path');

                console.log(tl.loc('FoundDeobfuscationFile', mappingFilePath));
                tl.debug(`Uploading ${mappingFilePath} for version code ${versionCode]}`);
                await googleutil.uploadDeobfuscation(edits, mappingFilePath, packageName, versionCode);
                        
                        
                    }
                
                
            } 

            if (uploadNativeDebugSymbols) {
                tl.debug(`Native debug symbols file pattern: ${nativeDebugSymbolsFilePattern}`);

                const nativeDebugSymbolsFilePath = fileHelper.resolveGlobPath(nativeDebugSymbolsFilePattern);
                tl.checkPath(nativeDebugSymbolsFilePath, 'Native debug symbols archive path');

                console.log(tl.loc('FoundNativeDeobfuscationFile', nativeDebugSymbolsFilePath));
                tl.debug(`Uploading ${nativeDebugSymbolsFilePath} for version code ${versionCodes[0]}`);
                await googleutil.uploadNativeDeobfuscation(edits, nativeDebugSymbolsFilePath, packageName, versionCodes[0]);
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

        const isDraftRelease: boolean = !userFractionSupplied && tl.getBoolInput('isDraftRelease', false);

        if (isDraftRelease) {
            requireTrackUpdate = true;
        }

        if (requireTrackUpdate) {
            console.log(tl.loc('UpdateTrack'));
            tl.debug(`Updating the track ${track}.`);
            const parameters: TrackUpdateParameters = {
                edits,
                packageName,
                track,
                versionCodes,
                versionCodeFilterType,
                versionCodeFilter,
                userFraction,
                updatePriority,
                isDraftRelease,
                releaseNotes,
                releaseName
            };
            const updatedTrack: pub3.Schema$Track = await prepareTrackUpdate(parameters);
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

interface TrackUpdateParameters {
    edits: pub3.Resource$Edits;
    packageName: string;
    track: string;
    versionCodes: number[];
    versionCodeFilterType: string;
    versionCodeFilter: string | number[];
    userFraction: number;
    updatePriority: number;
    isDraftRelease: boolean;
    releaseNotes?: pub3.Schema$LocalizedText[];
    releaseName?: string;
}

/**
 * Removes old version codes, then updates a given release track with the given information
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
async function prepareTrackUpdate({
    edits,
    packageName,
    track,
    versionCodes,
    versionCodeFilterType,
    versionCodeFilter,
    userFraction,
    updatePriority,
    isDraftRelease,
    releaseNotes,
    releaseName
}: TrackUpdateParameters): Promise<pub3.Schema$Track> {
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
            tl.debug(`Removing version codes matching the regular expression: ^${versionCodeFilter}$`);
            const versionCodesToRemove: RegExp = new RegExp(`^${versionCodeFilter}$`);

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
        versionCodes.forEach((versionCode) => {
            if (newTrackVersionCodes.indexOf(versionCode) === -1) {
                newTrackVersionCodes.push(versionCode);
            }
        });
    }

    tl.debug(`New ${track} track version codes: ` + JSON.stringify(newTrackVersionCodes));
    try {
        res = await googleutil.updateTrack(edits, packageName, track, newTrackVersionCodes, userFraction, updatePriority, releaseNotes, releaseName, isDraftRelease);
    } catch (e) {
        tl.debug(`Failed to update track ${track}.`);
        tl.debug(e);
        throw new Error(tl.loc('CannotUpdateTrack', track, e));
    }
    return res;
}

run();
