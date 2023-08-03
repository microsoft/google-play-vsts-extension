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
        edits: {}
    },
    getJWT: () => ({ authorize: () => { throw new Error('JWT.authorize() should be run via googleutil.authorize(JWT)'); } }),
    authorize: () => Promise.reject(new Error('authorize() error')),
    updateGlobalParams: () => sinon.stub()
});

process.env['ENDPOINT_AUTH_myServiceEndpoint'] = JSON.stringify({
    parameters: {
        username: 'myUser',
        password: 'myPass'
    },

    scheme: 'UsernamePassword'
});

tr.run();
