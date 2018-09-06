import * as fs from 'fs';
import * as path from 'path';
import * as tl from 'vsts-task-lib/task';
import { google } from 'googleapis';

const publisher = google.androidpublisher('v3');
const rolloutTrack = 'production'; // v2 it used to be called 'rollout'

interface ClientKey {
    client_email?: string;
    private_key?: string;
}

interface AndroidRelease {
    name?: string;
    userFraction?: number;
    releaseNotes?: [{ language: string; text: string; }];
    versionCodes?: any;
    status?: string;
}

interface AndroidMedia {
    body: fs.ReadStream;
    mimeType: string;
}

interface AndroidResource {
    track?: string;
    releases?: AndroidRelease[];
}

interface PackageParams {
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

interface GlobalParams {
    auth?: any;
    params?: PackageParams;
}

async function run() {
    try {
        tl.setResourcePath(path.join(__dirname, 'task.json'));

        const authType: string = tl.getInput('authType', true);
        let key: ClientKey = {};
        if (authType === 'JsonFile') {
            const serviceAccountKeyFile: string = tl.getPathInput('serviceAccountKey', false);
            if (!serviceAccountKeyFile) {
                throw new Error(tl.loc('JsonKeyFileNotFound'));
            }
            const stats: fs.Stats = fs.statSync(serviceAccountKeyFile);
            if (stats && stats.isFile()) {
                key = require(serviceAccountKeyFile);
            } else {
                console.error(tl.loc('InvalidAuthFile'));
                throw new Error(tl.loc('InvalidAuthFilewithName', serviceAccountKeyFile));
            }
        } else if (authType === 'ServiceEndpoint') {
            const serviceEndpoint: tl.EndpointAuthorization = tl.getEndpointAuthorization(tl.getInput('serviceEndpoint', true), true);
            if (!serviceEndpoint) {
                throw new Error(tl.loc('EndpointNotFound'));
            }
            key.client_email = serviceEndpoint.parameters['username'];
            key.private_key = serviceEndpoint.parameters['password'].replace(/\\n/g, '\n');
        }

        const packageName: string = tl.getPathInput('packageName', true);
        const userFraction: number = Number(tl.getInput('userFraction', false)); // Used for staged rollouts

        // Constants
        const GOOGLE_PLAY_SCOPES: string[] = ['https://www.googleapis.com/auth/androidpublisher'];
        const globalParams: GlobalParams = { auth: null, params: {} };

        const jwtClient = new google.auth.JWT(key.client_email, null, key.private_key, GOOGLE_PLAY_SCOPES, null);
        const edits: any = publisher.edits;

        globalParams.auth = jwtClient;
        updateGlobalParams(globalParams, 'packageName', packageName);

        console.log(tl.loc('Authenticating'));
        await jwtClient.authorize();
        await getNewEdit(edits, globalParams, packageName);

        console.log(tl.loc('GetTrackRolloutInfo'));
        const track: any = await getTrack(edits, packageName, rolloutTrack);
        tl.debug('Track' + JSON.stringify(track.data));
        const inProgressTrack = track.data.releases.find(x => x.status === 'inProgress');
        if (!inProgressTrack) {
            throw new Error(tl.loc('InProgressNotFound'));
        }

        console.log(tl.loc('CurrentUserFrac', inProgressTrack.userFraction));
        const updatedTrack: any = await updateTrack(edits, packageName, rolloutTrack, inProgressTrack.versionCodes, userFraction);
        tl.debug('Update Track' + JSON.stringify(updatedTrack.data));

        console.log(tl.loc('RolloutFracUpdate'));
        const commit: any = await edits.commit();
        tl.debug('Commit' + JSON.stringify(commit.data));

        tl.setResult(tl.TaskResult.Succeeded, tl.loc('Success'));
    } catch (err) {
        tl.setResult(tl.TaskResult.Failed, err);
    }
}

/**
 * Uses the provided JWT client to request a new edit from the Play store and attach the edit id to all requests made this session
 * Assumes authorized
 * @param {string} packageName - unique android package name (com.android.etc)
 * @return {Promise} edit - A promise that will return result from inserting a new edit
 *                          { id: string, expiryTimeSeconds: string }
 */
function getNewEdit(edits: any, globalParams: GlobalParams, packageName: string): Promise<any> {
    tl.debug('Creating a new edit');
    const requestParameters: PackageParams = {
        packageName: packageName
    };

    tl.debug('Additional Parameters: ' + JSON.stringify(requestParameters));
    return edits.insert(requestParameters).then(function (res) {
        updateGlobalParams(globalParams, 'editId', res.data.id);
        return res;
    });
}

/**
 * Gets information for the specified app and track
 * Assumes authorized
 * @param {string} packageName - unique android package name (com.android.etc)
 * @param {string} track - one of the values {"internal", "alpha", "beta", "production"}
 * @returns {Promise} track - A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
function getTrack(edits: any, packageName: string, track: string): Promise<any> {
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
function updateTrack(edits: any, packageName: string, track: string, versionCode: any, userFraction: number): Promise<any> {
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
            releases: [ release ]
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
function updateGlobalParams(globalParams: GlobalParams, paramName: string, value: any): void {
    tl.debug('Updating Global Parameters');
    tl.debug('SETTING ' + paramName + ' TO ' + JSON.stringify(value));
    globalParams.params[paramName] = value;
    google.options(globalParams);
    tl.debug('Global Params set to ' + JSON.stringify(globalParams));
}

run();
