import * as path from 'path';
import * as tl from 'azure-pipelines-task-lib/task';
import * as googleutil from './googleutil';
import { androidpublisher_v3 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { GaxiosResponse } from 'gaxios/build/src/common';

async function run() {
    try {
        tl.setResourcePath(path.join(__dirname, 'task.json'));

        const authType: string = tl.getInput('authType', true);
        let key: googleutil.ClientKey = {};
        if (authType === 'JsonFile') {
            const serviceAccountKeyFile: string = tl.getPathInput('serviceAccountKey', false);
            if (!serviceAccountKeyFile) {
                throw new Error(tl.loc('JsonKeyFileNotFound'));
            }
            const stats: tl.FsStats = tl.stats(serviceAccountKeyFile);
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
        const status: string = tl.getInput('status', true);
        const userFractionInput: string = tl.getInput('userFraction', false);
        let userFraction: number = Number.NaN;
        const trackName: string = tl.getInput('track', true);

        // Constants
        const globalParams: googleutil.GlobalParams = { auth: null, params: {} };

        const jwtClient: JWT = googleutil.getJWT(key);
        const edits: androidpublisher_v3.Resource$Edits = googleutil.publisher.edits;

        globalParams.auth = jwtClient;
        googleutil.updateGlobalParams(globalParams, 'packageName', packageName);

        console.log(tl.loc('Authenticating'));
        await jwtClient.authorize();
        const edit: androidpublisher_v3.Schema$AppEdit = await googleutil.getNewEdit(edits, globalParams, packageName);
        googleutil.updateGlobalParams(globalParams, 'editId', edit.id);

        console.log(tl.loc('GetTrackInfo', trackName));
        const track: androidpublisher_v3.Schema$Track = await googleutil.getTrack(edits, packageName, trackName);
        tl.debug('Track: ' + JSON.stringify(track));

        if (track.releases.length <= 0) {
            throw new Error(tl.loc('EmptyReleases'));
        }
        const firstRelease: androidpublisher_v3.Schema$TrackRelease = track.releases[0];

        if (userFractionInput === undefined) {
            console.log(tl.loc('keepUserFrac'));
            if (firstRelease.status === 'inProgress' || firstRelease.status === 'halted') {
                console.log(tl.loc('CurrentUserFrac', firstRelease.userFraction));
                userFraction = firstRelease.userFraction;
            }
        } else {
            userFraction = Number(userFractionInput);
            if (Number.isNaN(userFraction) || userFraction >= 1 || userFraction <= 0) {
                throw new Error(tl.loc('userFractionInvalid'));
            }
            console.log(tl.loc('UserFracSpecified', userFraction));
        }

        const updatedTrack: androidpublisher_v3.Schema$Track = await googleutil.updateTrack(edits, packageName, trackName, firstRelease.versionCodes, status, userFraction, firstRelease.releaseNotes);
        tl.debug('Update Track: ' + JSON.stringify(updatedTrack));

        console.log(tl.loc('StatusUpdating', status));
        const commit: GaxiosResponse<androidpublisher_v3.Schema$AppEdit> = await edits.commit();
        tl.debug('Commit: ' + JSON.stringify(commit.data));

        tl.setResult(tl.TaskResult.Succeeded, tl.loc('Success'));
    } catch (err) {
        tl.setResult(tl.TaskResult.Failed, err);
    }
}

run();
