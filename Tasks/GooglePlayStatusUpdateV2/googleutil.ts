// common code shared by all tasks
import * as fs from 'fs';
import * as tl from 'azure-pipelines-task-lib/task';
import { google, androidpublisher_v3, Common } from 'googleapis';
import { JWT } from 'google-auth-library';

export const publisher: androidpublisher_v3.Androidpublisher = google.androidpublisher({
    version: 'v3',
    rootUrl: 'https://androidpublisher.googleapis.com/'
});

export interface ClientKey {
    client_email?: string;
    private_key?: string;
}

export interface AndroidMedia {
    body: fs.ReadStream;
    mimeType: string;
}

export interface AndroidResource {
    track?: string;
    releases?: androidpublisher_v3.Schema$TrackRelease[];
}

export interface PackageParams {
    packageName?: string;
    editId?: string;
    track?: string;
    requestBody?: AndroidResource;
    media?: AndroidMedia;
    apkVersionCode?: number;
    language?: string;
    imageType?: string;
    uploadType?: string;
}

export interface ReleaseNotes {
    language?: string;
    text?: string;
}

export interface GlobalParams {
    auth?: JWT;
    params?: PackageParams;
}

export function getJWT(key: ClientKey): JWT {
    const GOOGLE_PLAY_SCOPES: string[] = ['https://www.googleapis.com/auth/androidpublisher'];
    return new google.auth.JWT({
        email: key.client_email,
        key: key.private_key,
        scopes: GOOGLE_PLAY_SCOPES
    });
}

export async function authorize(jwtClient: JWT): Promise<void> {
    const credentials = await jwtClient.authorize();
    if (!credentials.access_token) {
        throw new Error(tl.loc('AccessTokenNotFound'));
    }
    tl.setSecret(credentials.access_token);
}

/**
 * Uses the provided JWT client to request a new edit from the Play store and attach the edit id to all requests made this session
 * Assumes authorized
 * @param {string} packageName - unique android package name (com.android.etc)
 * @return {Promise} edit - A promise that will return result from inserting a new edit
 *                          { id: string, expiryTimeSeconds: string }
 */
export async function getNewEdit(edits: androidpublisher_v3.Resource$Edits, globalParams: GlobalParams, packageName: string): Promise<androidpublisher_v3.Schema$AppEdit> {
    tl.debug('Creating a new edit');
    const requestParameters: androidpublisher_v3.Params$Resource$Edits$Insert = {
        packageName: packageName
    };

    tl.debug('Additional Parameters: ' + JSON.stringify(requestParameters));
    const res: Common.GaxiosResponseWithHTTP2<androidpublisher_v3.Schema$AppEdit> = await edits.insert(requestParameters);
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
export async function getTrack(edits: androidpublisher_v3.Resource$Edits, packageName: string, track: string): Promise<androidpublisher_v3.Schema$Track> {
    tl.debug('Getting Track information');
    const requestParameters: androidpublisher_v3.Params$Resource$Edits$Tracks$Get = {
        packageName: packageName,
        track: track
    };

    tl.debug('Additional Parameters: ' + JSON.stringify(requestParameters));
    const getTrack: Common.GaxiosResponseWithHTTP2<androidpublisher_v3.Schema$Track> = await edits.tracks.get(requestParameters);
    return getTrack.data;
}

/**
 * Update a given release track with the given information
 * Assumes authorized
 * @param {string} packageName - unique android package name (com.android.etc)
 * @param {string} track - one of the values {"internal", "alpha", "beta", "production"}
 * @param {integer or [integers]} versionCode - version code returned from an apk call. will take either a number or a [number]
 * @param {string} status - one of the values {"draft", "inProgress", "halted", "completed"}
 * @param {double} userFraction - for rollouting out a release to a track.
 * @param {releaseNotes} releaseNotes - optional release notes to be attached as part of the update
 * @returns {Promise} track - A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
export async function updateTrack(edits: androidpublisher_v3.Resource$Edits, packageName: string, track: string, versionCode: string[] | null, status: string, userFraction: number, releaseNotes?: ReleaseNotes[]): Promise<androidpublisher_v3.Schema$Track> {
    tl.debug('Updating track');
    const release: androidpublisher_v3.Schema$TrackRelease = {
        versionCodes: versionCode
    };

    if (releaseNotes && releaseNotes.length > 0) {
        tl.debug('Attaching release notes to the update');
        release.releaseNotes = releaseNotes;
    }

    if (!Number.isNaN(userFraction)) {
        release.userFraction = userFraction;
    }
    release.status = status;

    const requestParameters: androidpublisher_v3.Params$Resource$Edits$Tracks$Update = {
        packageName: packageName,
        track: track,
        requestBody: {
            track: track,
            releases: [release]
        }
    };

    tl.debug('Additional Parameters: ' + JSON.stringify(requestParameters));
    const updatedTrack: Common.GaxiosResponseWithHTTP2<androidpublisher_v3.Schema$Track> = await edits.tracks.update(requestParameters);
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
