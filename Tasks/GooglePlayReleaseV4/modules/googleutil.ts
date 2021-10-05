import * as fs from 'fs';
import * as tl from 'azure-pipelines-task-lib';
import * as googleapis from 'googleapis';
import { androidpublisher_v3 as pub3 } from 'googleapis'; // Short alias for convenience

export const publisher: pub3.Androidpublisher = googleapis.google.androidpublisher('v3');

export interface ClientKey {
    client_email?: string;
    private_key?: string;
}

/**
 * @param key an object containing client email and private key
 * @returns JWT service account credentials.
 */
export function getJWT(key: ClientKey): googleapis.Auth.JWT {
    const GOOGLE_PLAY_SCOPES: string[] = ['https://www.googleapis.com/auth/androidpublisher'];
    return new googleapis.Auth.JWT(key.client_email, null, key.private_key, GOOGLE_PLAY_SCOPES, null);
}

/**
 * Uses the provided JWT client to request a new edit from the Play store and attach the edit id to all requests made this session
 * Assumes authorized
 * @param packageName - unique android package name (com.android.etc)
 * @return edit - A promise that will return result from inserting a new edit
 *                          { id: string, expiryTimeSeconds: string }
 */
export async function getNewEdit(edits: pub3.Resource$Edits, packageName: string): Promise<pub3.Schema$AppEdit> {
    tl.debug('Creating a new edit');
    const requestParameters: pub3.Params$Resource$Edits$Insert = {
        packageName: packageName
    };

    tl.debug('Additional Parameters: ' + JSON.stringify(requestParameters));
    const res = await edits.insert(requestParameters);
    return res.data;
}

/**
 * Gets information for the specified app and track
 * Assumes authorized
 * @param packageName - unique android package name (com.android.etc)
 * @param track - one of the values {"internal", "alpha", "beta", "production"}
 * @returns track - A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
export async function getTrack(edits: pub3.Resource$Edits, packageName: string, track: string): Promise<pub3.Schema$Track> {
    tl.debug('Getting Track information');
    const requestParameters: pub3.Params$Resource$Edits$Tracks$Get = {
        packageName: packageName,
        track: track
    };

    tl.debug('Additional Parameters: ' + JSON.stringify(requestParameters));
    const getTrack = await edits.tracks.get(requestParameters);
    return getTrack.data;
}

/**
 * @param edits Google API Edits
 * @param packageName unique android package name (com.android.etc)
 * @param track release track. Should be one of {"internal", "alpha", "beta", "production"}
 * @param versionCodes version codes that will be exposed to the users of this track when this release is rolled out
 * @param userFraction for rollouting out a release to a track, it's the fraction of users to get update; 1.0 is all users
 * @param updatePriority in-app update priority value of the release. All newly added APKs in the release will be considered at this priority. Can take values in the range [0, 5], with 5 the highest priority. Defaults to 0.
 * @param releaseNotes optional release notes to be attached as part of the update
 * @param releaseName optional release name. If not set, the name is generated from the APK's version_name. If the release contains multiple APKs, the name is generated from the date
 * @returns track - A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
export async function updateTrack(
    edits: pub3.Resource$Edits,
    packageName: string,
    track: string,
    versionCodes: number | number[],
    userFraction: number,
    updatePriority: number,
    releaseNotes?: pub3.Schema$LocalizedText[],
    releaseName?: string
): Promise<pub3.Schema$Track> {
    tl.debug('Updating track');
    const versionCodesArray: number[] = (Array.isArray(versionCodes) ? versionCodes : [versionCodes]);
    const release: pub3.Schema$TrackRelease = {
        versionCodes: versionCodesArray.map((versionCode) => versionCode.toString()),
        inAppUpdatePriority: updatePriority
    };

    if (releaseName && releaseName.length > 0) {
        tl.debug('Add release name: ' + releaseName);
        release.name = releaseName;
    }

    if (releaseNotes && releaseNotes.length > 0) {
        tl.debug('Attaching release notes to the update');
        release.releaseNotes = releaseNotes;
    }

    if (userFraction < 1.0) {
        release.userFraction = userFraction;
        release.status = 'inProgress';
    } else {
        tl.debug('User fraction is more than 100% marking rollout "completed"');
        release.status = 'completed';
    }

    const requestParameters: pub3.Params$Resource$Edits$Tracks$Update = {
        packageName: packageName,
        track: track,
        requestBody: {
            track,
            releases: [release]
        }
    };

    tl.debug('Additional Parameters: ' + JSON.stringify(requestParameters));
    const updatedTrack = await edits.tracks.update(requestParameters);
    return updatedTrack.data;
}

/**
 * Update the universal parameters attached to every request
 * @param paramName - Name of parameter to add/update
 * @param value - value to assign to paramName. Any value is admissible.
 */
export function updateGlobalParams(globalParams: googleapis.Common.GlobalOptions, paramName: string, value: any): void {
    tl.debug('Updating Global Parameters');
    tl.debug('SETTING ' + paramName + ' TO ' + JSON.stringify(value));
    globalParams.params[paramName] = value;
    googleapis.google.options(globalParams);
    tl.debug('Global Params set to ' + JSON.stringify(globalParams));
}

/**
 * Adds a bundle to an existing edit
 * Assumes authorized
 * @param packageName unique android package name (com.android.etc)
 * @param bundleFile path to bundle file
 * @returns A promise that will return result from uploading a bundle
 *                          { versionCode: integer, binary: { sha1: string } }
 */
export async function addBundle(edits: pub3.Resource$Edits, packageName: string, bundleFile: string): Promise<pub3.Schema$Bundle> {
    let requestParameters: pub3.Params$Resource$Edits$Bundles$Upload = {
        packageName: packageName,
        media: {
            body: fs.createReadStream(bundleFile),
            mimeType: 'application/octet-stream'
        }
    };

    try {
        tl.debug('Request Parameters: ' + JSON.stringify(requestParameters));
        const res = await edits.bundles.upload(requestParameters, { onUploadProgress });
        tl.debug('Returned: ' + JSON.stringify(res));
        return res.data;
    } catch (e) {
        tl.debug(`Failed to upload Bundle ${bundleFile}`);
        tl.debug(e);
        throw new Error(tl.loc('CannotUploadBundle', bundleFile, e));
    }
}

/**
 * Adds an apk to an existing edit
 * Assumes authorized
 * @param packageName unique android package name (com.android.etc)
 * @param apkFile path to apk file
 * @returns A promise that will return result from uploading an apk
 *                          { versionCode: integer, binary: { sha1: string } }
 */
export async function addApk(edits: pub3.Resource$Edits, packageName: string, apkFile: string): Promise<pub3.Schema$Apk> {
    let requestParameters: pub3.Params$Resource$Edits$Apks$Upload = {
        packageName: packageName,
        media: {
            body: fs.createReadStream(apkFile),
            mimeType: 'application/vnd.android.package-archive'
        }
    };

    try {
        tl.debug('Request Parameters: ' + JSON.stringify(requestParameters));
        const res = await edits.apks.upload(requestParameters, { onUploadProgress });
        tl.debug('Returned: ' + JSON.stringify(res));
        return res.data;
    } catch (e) {
        tl.debug(`Failed to upload APK ${apkFile}`);
        tl.debug(e);
        throw new Error(tl.loc('CannotUploadAPK', apkFile, e));
    }
}

/**
 * Adds an obb for an apk to an existing edit
 * Assumes authorized
 * @param packageName unique android package name (com.android.etc)
 * @param obbFile path to obb file
 * @param apkVersionCode version code of the corresponding apk
 * @param obbFileType type of obb to be uploaded (main/patch)
 * @returns ObbResponse A promise that will return result from uploading an obb
 *                          { expansionFile: { referencesVersion: number, fileSize: number } }
 */
export async function addObb(
    edits: pub3.Resource$Edits,
    packageName: string,
    obbFile: string,
    apkVersionCode: number,
    obbFileType: string
): Promise<pub3.Schema$ExpansionFilesUploadResponse> {
    const requestParameters: pub3.Params$Resource$Edits$Expansionfiles$Upload = {
        packageName: packageName,
        media: {
            body: fs.createReadStream(obbFile),
            mimeType: 'application/octet-stream'
        },
        apkVersionCode: apkVersionCode,
        expansionFileType: obbFileType
    };

    try {
        tl.debug('Request Parameters: ' + JSON.stringify(requestParameters));
        const res = await edits.expansionfiles.upload(requestParameters, { onUploadProgress });
        tl.debug('returned: ' + JSON.stringify(res));
        return res.data;
    } catch (e) {
        tl.debug(`Failed to upload the Obb ${obbFile}`);
        tl.debug(e);
        throw new Error(tl.loc('CannotUploadExpansionFile', obbFile, e));
    }
}

/**
 * Uploads a deobfuscation file (mapping.txt) for a given package
 * Assumes authorized
 * @param mappingFilePath the path to the file to upload
 * @param packageName unique android package name (com.android.etc)
 * @param versionCode version code of uploaded APK or AAB
 * @returns deobfuscationFiles A promise that will return result from uploading a deobfuscation file
 *                          { deobfuscationFile: { symbolType: string } }
 */
export async function uploadDeobfuscation(
    edits: pub3.Resource$Edits,
    mappingFilePath: string,
    packageName: string,
    versionCode: number
): Promise<pub3.Schema$DeobfuscationFilesUploadResponse> {
    const requestParameters: pub3.Params$Resource$Edits$Deobfuscationfiles$Upload = {
        deobfuscationFileType: 'proguard',
        packageName: packageName,
        apkVersionCode: versionCode,
        media: {
            body: fs.createReadStream(mappingFilePath),
            mimeType: ''
        }
    };

    try {
        tl.debug('Request Parameters: ' + JSON.stringify(requestParameters));
        const res = await edits.deobfuscationfiles.upload(requestParameters, { onUploadProgress });
        tl.debug('returned: ' + JSON.stringify(res));
        return res.data;
    } catch (e) {
        tl.debug(`Failed to upload deobfuscation file ${mappingFilePath}`);
        tl.debug(e);
        throw new Error(tl.loc('CannotUploadDeobfuscationFile', mappingFilePath, e));
    }
}

/**
 * Default logger for uploading files
 * @param progress progress update from googleapis
 */
function onUploadProgress(progress: any): void {
    tl.debug('Upload progress: ' + JSON.stringify(progress));
}
