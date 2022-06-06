import * as tmrm from 'azure-pipelines-task-lib/mock-run';
import * as sinon from 'sinon';

import path = require('path');

const taskPath = path.join(__dirname, '..', 'google-play-promote.js');
const tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tr.setInput('authType', 'ServiceEndpoint');
tr.setInput('serviceEndpoint', 'myServiceEndpoint');
tr.setInput('packageName', 'myPackageName');
tr.setInput('destinationTrack', 'alpha');
tr.setInput('sourceTrack', 'production');
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
    updateTrack: (_edits, _packageName, _track, _versionCode, _userFraction, releaseNotes?) => Promise.resolve(releaseNotes),
    getTrack: () => Promise.resolve({
        releases: [
            {
                status: 'inProgress',
                versionCodes: [123],
                releaseNotes: [
                    { text: 'release contents', language: 'en-US' }
                ]
            }
        ]
    })
});

process.env['ENDPOINT_AUTH_myServiceEndpoint'] = '{ "parameters": {"username": "myUser", "password": "myPass"}, "scheme": "UsernamePassword"}';

tr.run();
