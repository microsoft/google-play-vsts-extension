import * as fs from 'fs';
import * as tl from 'azure-pipelines-task-lib/task';
import { google } from 'googleapis';

export const publisher = google.androidpublisher('v3');

export interface ClientKey {
    client_email?: string;
    private_key?: string;
}

export interface Apk {
    versionCode: number;
    binary: {
        sha1: string;
    };
}

export interface AndroidRelease {
    name?: string;
    userFraction?: number;
    releaseNotes?: [{ language: string; text: string; }];
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

export interface Edit {
    id: string;
    expiryTimeSeconds: string;
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

export interface Track {
    track: string;
    versionCodes: number[];
    userFraction: number;
}

export interface GlobalParams {
    auth?: any;
    params?: PackageParams;
}

export function getJWT(key: ClientKey) {
    const GOOGLE_PLAY_SCOPES: string[] = ['https://www.googleapis.com/auth/androidpublisher'];
    return new google.auth.JWT(key.client_email, null, key.private_key, GOOGLE_PLAY_SCOPES, null)
}

/**
 * Uses the provided JWT client to request a new edit from the Play store and attach the edit id to all requests made this session
 * Assumes authorized
 * @param {string} packageName - unique android package name (com.android.etc)
 * @return {Promise} edit - A promise that will return result from inserting a new edit
 *                          { id: string, expiryTimeSeconds: string }
 */
export async function getNewEdit(edits: any, globalParams: GlobalParams, packageName: string): Promise<any> {
    tl.debug('Creating a new edit');
    const requestParameters: PackageParams = {
        packageName: packageName
    };

    tl.debug('Additional Parameters: ' + JSON.stringify(requestParameters));
    const res = await edits.insert(requestParameters);
    updateGlobalParams(globalParams, 'editId', res.data.id);
    return res;
}

/**
 * Gets information for the specified app and track
 * Assumes authorized
 * @param {string} packageName - unique android package name (com.android.etc)
 * @param {string} track - one of the values {"internal", "alpha", "beta", "production"}
 * @returns {Promise} track - A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
export function getTrack(edits: any, packageName: string, track: string): Promise<any> {
    tl.debug('Getting Track information');
    const requestParameters: PackageParams = {
        packageName: packageName,
        track: track
    };

    tl.debug('Additional Parameters: ' + JSON.stringify(requestParameters));
    return edits.tracks.get(requestParameters);
}

/**
 * Update a given release track with the given information
 * Assumes authorized
 * @param {string} packageName - unique android package name (com.android.etc)
 * @param {string} track - one of the values {"internal", "alpha", "beta", "production"}
 * @param {integer or [integers]} versionCode - version code returned from an apk call. will take either a number or a [number]
 * @param {double} userFraction - for rollout, fraction of users to get update
 * @returns {Promise} track - A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
export function updateTrack(edits: any, packageName: string, track: string, versionCode: any, userFraction: number): Promise<any> {
    tl.debug('Updating track');
    const release: AndroidRelease = {
        versionCodes: (typeof versionCode === 'number' ? [versionCode] : versionCode)
    };

    if (userFraction < 1.0) {
        release.userFraction = userFraction;
        release.status = 'inProgress';
    } else {
        tl.debug('User fraction is more than 100% marking rollout "completed"');
        release.status = 'completed';
    }

    const requestParameters: PackageParams = {
        packageName: packageName,
        track: track,
        resource: {
            track: track,
            releases: [release]
        }
    };

    tl.debug('Additional Parameters: ' + JSON.stringify(requestParameters));
    return edits.tracks.update(requestParameters);
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
export async function addApk(edits: any, packageName: string, apkFile: string): Promise<Apk> {
    let requestParameters: PackageParams = {
        packageName: packageName,
        media: {
            body: fs.createReadStream(apkFile),
            mimeType: 'application/vnd.android.package-archive'
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
        throw new Error(tl.loc('CannotUploadApk', apkFile, e));
    }
}