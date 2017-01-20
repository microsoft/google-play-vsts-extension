import fs = require('fs');
import path = require('path');
import tl = require('vsts-task-lib/task');
import Promise = require('bluebird');
let google = require('googleapis');
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

function run() {
    try {
        tl.setResourcePath(path.join( __dirname, 'task.json'));
        let authType: string = tl.getInput('authType', true);
        let key: ClientKey = {};
        if (authType === 'JsonFile') {
            let serviceAccountKeyFile: string = tl.getPathInput('serviceAccountKey', false);
            if (!serviceAccountKeyFile) {
                throw new Error(tl.loc('JsonKeyFileNotFound'));
            }
            let stats: fs.Stats = fs.statSync(serviceAccountKeyFile);
            if (stats && stats.isFile()) {
                key = require(serviceAccountKeyFile);
            } else {
                console.error(tl.loc('InvalidAuthFile'));
                throw new Error(tl.loc('InvalidAuthFilewithName', serviceAccountKeyFile));
            }
        } else if (authType === 'ServiceEndpoint') {
            let serviceEndpoint: tl.EndpointAuthorization = tl.getEndpointAuthorization(tl.getInput('serviceEndpoint', true), true);
            if (!serviceEndpoint) {
                throw new Error(tl.loc('EndpointNotFound'));
            }
            key.client_email = serviceEndpoint.parameters['username'];
            key.private_key = serviceEndpoint.parameters['password'].replace(/\\n/g, '\n');
        }

        let packageName: string = tl.getPathInput('packageName', true);
        let sourceTrack: string = tl.getInput('sourceTrack', true);
        let destinationTrack: string = tl.getInput('destinationTrack', true);
        let userFraction: number = Number(tl.getInput('userFraction', false)); // Used for staged rollouts

        // Constants
        let GOOGLE_PLAY_SCOPES: string[] = ['https://www.googleapis.com/auth/androidpublisher'];
        let globalParams: GlobalParams = { auth: null, params: {} };

        let jwtClient: any = new google.auth.JWT(key.client_email, null, key.private_key, GOOGLE_PLAY_SCOPES, null);
        let edits: any = publisher.edits;

        [edits, edits.tracks, jwtClient].forEach(Promise.promisifyAll);

        globalParams.auth = jwtClient;
        updateGlobalParams(globalParams, 'packageName', packageName);

        console.log(tl.loc('Authenticating'));
        let currentEdit: any = jwtClient.authorizeAsync().then(function (res) {
            return getNewEdit(edits, globalParams, packageName);
        });

        currentEdit = currentEdit.then(function (res) {
            console.log(tl.loc('GetTrackInfo', sourceTrack));
            return getTrack(edits, packageName, sourceTrack);
        });

        currentEdit = currentEdit.then(function (res) {
            console.log(tl.loc('PromoteTrack', destinationTrack));
            return updateTrack(edits, packageName, destinationTrack, res[0].versionCodes, userFraction);
        });

        currentEdit = currentEdit.then(function (res) {
            console.log(tl.loc('CleanTrack', sourceTrack));
            return updateTrack(edits, packageName, sourceTrack, [], userFraction);
        });

        currentEdit = currentEdit.then(function (res) {
            return edits.commitAsync().then(function (res) {
                console.log(tl.loc('PromoteSucceed'));
                console.log(tl.loc('SourceTrack', sourceTrack));
                console.log(tl.loc('DestTrack', destinationTrack));
                tl.setResult(tl.TaskResult.Succeeded, tl.loc('Success'));
            });
        }).catch(function (err) {
            console.error(err);
            tl.setResult(tl.TaskResult.Failed, tl.loc('Failure'));
        });
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
    let requestParameters: PackageParams = {
        packageName: packageName
    };

    tl.debug('Additional Parameters: ' + JSON.stringify(requestParameters));

    return edits.insertAsync(requestParameters).then(function (res) {
        updateGlobalParams(globalParams, 'editId', res[0].id);
        return res;
    });
}

/**
 * Gets information for the specified app and track
 * Assumes authorized
 * @param {string} packageName - unique android package name (com.android.etc)
 * @param {string} track - one of the values {"alpha", "beta", "production", "rollout"}
 * @returns {Promise} track - A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
function getTrack(edits: any, packageName: string, track: string): Promise<any> {
    tl.debug('Getting Track information');
    let requestParameters: PackageParams = {
        packageName: packageName,
        track: track
    };

    tl.debug('Additional Parameters: ' + JSON.stringify(requestParameters));

    return edits.tracks.getAsync(requestParameters);
}

/**
 * Update a given release track with the given information
 * Assumes authorized
 * @param {string} packageName - unique android package name (com.android.etc)
 * @param {string} track - one of the values {"alpha", "beta", "production", "rollout"}
 * @param {integer or [integers]} versionCode - version code returned from an apk call. will take either a number or a [number]
 * @param {double} userFraction - for rollout, fraction of users to get update
 * @returns {Promise} track - A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
function updateTrack(edits: any, packageName: string, track: string, versionCode: any, userFraction: number) : Promise<any> {
    tl.debug('Updating track');
    let requestParameters: PackageParams = {
        packageName: packageName,
        track: track,
        resource: {
            track: track,
            versionCodes: (typeof versionCode === 'number' ? [versionCode] : versionCode)
        }
    };

    if (track === 'rollout') {
        requestParameters.resource.userFraction = userFraction;
    }

    tl.debug('Additional Parameters: ' + JSON.stringify(requestParameters));

    return edits.tracks.updateAsync(requestParameters);
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
