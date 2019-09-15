// common code shared by all tasks
import * as fs from 'fs';
import * as tl from 'azure-pipelines-task-lib';
import { google, androidpublisher_v3 as pub3 } from 'googleapis';
import { JWT } from 'google-auth-library';

export const publisher = google.androidpublisher('v3');

export interface ClientKey {
    client_email?: string;
    private_key?: string;
}

export interface AndroidRelease {
    name?: string;
    userFraction?: number;
    releaseNotes?: pub3.Schema$LocalizedText[];
    versionCodes?: [number];
    status?: string;
}

export interface AndroidMedia {
    body: fs.ReadStream;
    mimeType: string;
}

export interface AndroidResource {
    track?: string;
    releases?: AndroidRelease[];
}

export interface AndroidListingResource {
    language?: string;
    title?: string;
    fullDescription?: string;
    shortDescription?: string;
    video?: string;
}

export interface PackageParams {
    packageName?: string;
    editId?: any;
    track?: string;
    resource?: AndroidResource; // 'resource' goes into the 'body' of the http request
    media?: AndroidMedia;
    apkVersionCode?: number;
    language?: string;
    imageType?: string;
    uploadType?: string;
}

export interface PackageListingParams {
    packageName?: string;
    editId?: any;
    track?: string;
    resource?: AndroidListingResource; // 'resource' goes into the 'body' of the http request
    media?: AndroidMedia;
    apkVersionCode?: number;
    language?: string;
    imageType?: string;
    uploadType?: string;
}

export interface GlobalParams {
    auth?: any;
    params?: PackageParams;
}

export function getJWT(key: ClientKey): JWT {
    const GOOGLE_PLAY_SCOPES: string[] = ['https://www.googleapis.com/auth/androidpublisher'];
    return new google.auth.JWT(key.client_email, null, key.private_key, GOOGLE_PLAY_SCOPES, null);
}

/**
 * Uses the provided JWT client to request a new edit from the Play store and attach the edit id to all requests made this session
 * Assumes authorized
 * @param {string} packageName - unique android package name (com.android.etc)
 * @return {Promise} edit - A promise that will return result from inserting a new edit
 *                          { id: string, expiryTimeSeconds: string }
 */
export async function getNewEdit(edits: pub3.Resource$Edits, globalParams: GlobalParams, packageName: string): Promise<pub3.Schema$AppEdit> {
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
 * @param {string} packageName - unique android package name (com.android.etc)
 * @param {string} track - one of the values {"internal", "alpha", "beta", "production"}
 * @returns {Promise} track - A promise that will return result from updating a track
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
 * Update a given release track with the given information
 * Assumes authorized
 * @param {string} packageName - unique android package name (com.android.etc)
 * @param {string} track - one of the values {"internal", "alpha", "beta", "production"}
 * @param {integer or [integers]} versionCode - version code returned from an apk call. will take either a number or a [number]
 * @param {double} userFraction - for rollouting out a release to a track, it's the fraction of users to get update 1.0 is all users
 * @param {releaseNotes} releaseNotes - optional release notes to be attached as part of the update
 * @returns {Promise} track - A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
export async function updateTrack(edits: pub3.Resource$Edits, packageName: string, track: string, versionCode: any, userFraction: number, releaseNotes?: pub3.Schema$LocalizedText[]): Promise<pub3.Schema$Track> {
    tl.debug('Updating track');
    const release: pub3.Schema$TrackRelease = {
        versionCodes: (typeof versionCode === 'number' ? [versionCode] : versionCode)
    };

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
 * @param {string} paramName - Name of parameter to add/update
 * @param {any} value - value to assign to paramName. Any value is admissible.
 * @returns {void} void
 */
export function updateGlobalParams(globalParams: GlobalParams, paramName: string, value: any): void {
    tl.debug('Updating Global Parameters');
    tl.debug('SETTING ' + paramName + ' TO ' + JSON.stringify(value));
    globalParams.params[paramName] = value;
    google.options(globalParams);
    tl.debug('Global Params set to ' + JSON.stringify(globalParams));
}

/**
 * Adds an apk to an existing edit
 * Assumes authorized
 * @param {string} packageName unique android package name (com.android.etc)
 * @param {string} apkFile path to apk file
 * @returns {Promise} apk A promise that will return result from uploading an apk
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
        const res = (await edits.apks.upload(requestParameters)).data;
        tl.debug('returned: ' + JSON.stringify(res));
        return res;
    } catch (e) {
        tl.debug(`Failed to upload the APK ${apkFile}`);
        tl.debug(e);
        throw new Error(tl.loc('CannotUploadApk', apkFile, e));
    }
}

/**
 * Adds a bundle to an existing edit
 * Assumes authorized
 * @param {string} packageName unique android package name (com.android.etc)
 * @param {string} bundleFile path to bundle file
 * @returns {Promise} A promise that will return result from uploading a bundle
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
        const res = (await edits.bundles.upload(requestParameters)).data;
        tl.debug('returned: ' + JSON.stringify(res));
        return res;
    } catch (e) {
        tl.debug(`Failed to upload Bundle ${bundleFile}`);
        tl.debug(e);
        throw new Error(tl.loc('CannotUploadBundle', bundleFile, e));
    }
}

/**
 * Uploads a deobfuscation file (mapping.txt) for a given package
 * Assumes authorized
 * @param {string} mappingFilePath the path to the file to upload
 * @param {string} packageName unique android package name (com.android.etc)
 * @param apkVersionCode version code of uploaded APK
 * @returns {Promise} deobfuscationFiles A promise that will return result from uploading a deobfuscation file
 *                          { deobfuscationFile: { symbolType: string } }
 */
export async function uploadDeobfuscation(edits: pub3.Resource$Edits, mappingFilePath: string, packageName: string, apkVersionCode: number): Promise<pub3.Schema$DeobfuscationFilesUploadResponse> {
    const requestParameters: pub3.Params$Resource$Edits$Deobfuscationfiles$Upload = {
        deobfuscationFileType: 'proguard',
        packageName: packageName,
        apkVersionCode: apkVersionCode,
        media: {
            body: fs.createReadStream(mappingFilePath),
            mimeType: ''
        }
    };

    try {
        tl.debug('Request Parameters: ' + JSON.stringify(requestParameters));
        const res = (await edits.deobfuscationfiles.upload(requestParameters)).data;
        tl.debug('returned: ' + JSON.stringify(res));
        return res;
    } catch (e) {
        tl.debug(`Failed to upload deobfuscation file ${mappingFilePath}`);
        tl.debug(e);
        throw new Error(tl.loc('CannotUploadDeobfuscationFile', mappingFilePath, e));
    }
}