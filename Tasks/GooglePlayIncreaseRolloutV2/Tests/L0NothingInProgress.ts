import * as tmrm from 'azure-pipelines-task-lib/mock-run';
import * as sinon from 'sinon';

import path = require('path');

const taskPath = path.join(__dirname, '..', 'google-play-increase-rollout.js');
const tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tr.setInput('authType', 'ServiceEndpoint');
tr.setInput('serviceEndpoint', 'myServiceEndpoint');
tr.setInput('packageName', 'myPackageName');
tr.setInput('track', 'production');
tr.setInput('userFraction', '1.0');

tr.registerMock('./googleutil', {
    publisher: {
        edits: {
            commit: () => Promise.resolve({ data: {} })
        }
    },
    getJWT: () => ({ authorize: () => sinon.stub() }),
    updateGlobalParams: () => ({}),
    getNewEdit: () => Promise.resolve({}),
    updateTrack: () => Promise.resolve({}),
    getTrack: () => Promise.resolve({
        releases: [
            {
                status: 'complete',
                versionCodes: [123]
            }
        ]
    })
});

process.env['ENDPOINT_AUTH_myServiceEndpoint'] = '{ "parameters": {"username": "myUser", "password": "myPass"}, "scheme": "UsernamePassword"}';

tr.run();
