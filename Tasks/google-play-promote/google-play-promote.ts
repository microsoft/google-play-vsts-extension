import * as fs from 'fs';
import * as path from 'path';
import * as tl from 'azure-pipelines-task-lib/task';
import * as googleutil from 'utility-common/googleutil';

async function run() {
    try {
        tl.setResourcePath(path.join( __dirname, 'task.json'));
        const authType: string = tl.getInput('authType', true);
        let key: googleutil.ClientKey = {};
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
        const sourceTrack: string = tl.getInput('sourceTrack', true);
        const destinationTrack: string = tl.getInput('destinationTrack', true);
        const userFraction: number = Number(tl.getInput('userFraction', false)); // Used for staged rollouts

        // Constants
        const globalParams: googleutil.GlobalParams = { auth: null, params: {} };

        const jwtClient = googleutil.getJWT(key);
        const edits: any = googleutil.publisher.edits;

        globalParams.auth = jwtClient;
        googleutil.updateGlobalParams(globalParams, 'packageName', packageName);

        console.log(tl.loc('Authenticating'));
        await jwtClient.authorize();
        await googleutil.getNewEdit(edits, globalParams, packageName);

        console.log(tl.loc('GetTrackInfo', sourceTrack));
        //const track: any = 
        await googleutil.getTrack(edits, packageName, sourceTrack);

        console.log(tl.loc('PromoteTrack', destinationTrack));
        //await updateTrack(edits, packageName, destinationTrack, res[0].versionCodes, userFraction);

        console.log(tl.loc('CleanTrack', sourceTrack));
        await googleutil.updateTrack(edits, packageName, sourceTrack, [], userFraction);

        //const commit: any = 
        await edits.commit();

        console.log(tl.loc('PromoteSucceed'));
        console.log(tl.loc('SourceTrack', sourceTrack));
        console.log(tl.loc('DestTrack', destinationTrack));
        tl.setResult(tl.TaskResult.Succeeded, tl.loc('Success'));
    } catch (err) {
        tl.setResult(tl.TaskResult.Failed, err);
    }
}

run();
