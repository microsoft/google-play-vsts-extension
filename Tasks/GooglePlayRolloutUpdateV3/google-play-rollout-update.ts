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
        const userFraction: number = Number(tl.getInput('userFraction', false)); // Used for staged rollouts
        const rolloutTrack: string = tl.getInput('track', true);

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

        console.log(tl.loc('GetTrackRolloutInfo'));
        const track: googleutil.Track = await googleutil.getTrack(edits, packageName, rolloutTrack);
        tl.debug('Track: ' + JSON.stringify(track));
        const inProgressTrack = track.releases.find(x => x.status === 'inProgress');
        if (!inProgressTrack) {
            throw new Error(tl.loc('InProgressNotFound'));
        }

        console.log(tl.loc('CurrentUserFrac', inProgressTrack.userFraction));
        const updatedTrack: googleutil.Track = await googleutil.updateTrack(edits, packageName, rolloutTrack, inProgressTrack.versionCodes, userFraction, inProgressTrack.releaseNotes);
        tl.debug('Update Track: ' + JSON.stringify(updatedTrack));

        console.log(tl.loc('RolloutFracUpdate'));
        const commit = await edits.commit();
        tl.debug('Commit: ' + JSON.stringify(commit.data));

        tl.setResult(tl.TaskResult.Succeeded, tl.loc('Success'));
    } catch (err) {
        tl.setResult(tl.TaskResult.Failed, err);
    }
}

run();
