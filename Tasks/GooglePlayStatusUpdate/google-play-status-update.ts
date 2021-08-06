import * as path from 'path';
import * as tl from 'azure-pipelines-task-lib/task';
import * as googleutil from './googleutil';

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
        const keepUserFraction: boolean = tl.getBoolInput('keepUserFraction', true);
        let userFraction: number;
        const haltTrack: string = tl.getInput('track', true);

        // Constants
        const globalParams: googleutil.GlobalParams = { auth: null, params: {} };

        const jwtClient = googleutil.getJWT(key);
        const edits: any = googleutil.publisher.edits;

        globalParams.auth = jwtClient;
        googleutil.updateGlobalParams(globalParams, 'packageName', packageName);

        console.log(tl.loc('Authenticating'));
        await jwtClient.authorize();
        const edit = await googleutil.getNewEdit(edits, globalParams, packageName);
        googleutil.updateGlobalParams(globalParams, 'editId', edit.id);

        console.log(tl.loc('GetTrackInfo', haltTrack));
        const track: googleutil.Track = await googleutil.getTrack(edits, packageName, haltTrack);
        tl.debug('Track: ' + JSON.stringify(track));

        if (track.releases.length <= 0) {
            throw new Error(tl.loc('EmptyReleases'));
        }
        const firstRelease = track.releases[0];

        if (!keepUserFraction) {
            userFraction = Number(tl.getInput('userFraction', false));
        } else {
            if (firstRelease.status === 'inProgress' || firstRelease.status === 'halted') {
                console.log(tl.loc('CurrentUserFrac', firstRelease.userFraction));
                userFraction = firstRelease.userFraction;
            } else {
                throw new Error(tl.loc('UserFracNotFound'));
            }
        }

        if (userFraction >= 1 || userFraction <= 0) {
            throw new Error(tl.loc('userFractionInvalid'));
        }

        const updatedTrack: googleutil.Track = await googleutil.updateTrack(edits, packageName, haltTrack, firstRelease.versionCodes, status, userFraction, firstRelease.releaseNotes);
        tl.debug('Update Track: ' + JSON.stringify(updatedTrack));

        console.log(tl.loc('StatusUpdating', status));
        const commit = await edits.commit();
        tl.debug('Commit: ' + JSON.stringify(commit.data));

        tl.setResult(tl.TaskResult.Succeeded, tl.loc('Success'));
    } catch (err) {
        tl.setResult(tl.TaskResult.Failed, err);
    }
}

run();
