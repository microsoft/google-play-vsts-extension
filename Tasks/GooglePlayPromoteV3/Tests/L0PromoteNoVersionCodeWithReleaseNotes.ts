import * as tmrm from 'azure-pipelines-task-lib/mock-run';
import * as ma from 'azure-pipelines-task-lib/mock-answer';
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
tr.setInput('changeLogFile', '/path/to/changelog');

// provide answers for task mock
const a: ma.TaskLibAnswers = <ma.TaskLibAnswers>{
    'checkPath': {
        '/path/to/changelog': true
    },
    'stats': {
        '/path/to/changelog': {
            isFile: () => true,
            isDirectory: () => false
        }
    }
};
tr.setAnswers(a);

tr.registerMock('./googleutil', {
    publisher: {
        edits: {
            commit: () => Promise.resolve({ data: {} })
        }
    },
    getJWT: () => ({ authorize: () => { throw new Error('JWT.authorize() should be run via googleutil.authorize(JWT)'); } }),
    authorize: () => Promise.resolve(),
    updateGlobalParams: () => ({}),
    getNewEdit: () => Promise.resolve({}),
    updateTrack: (_edits, _packageName, _track, _versionCode, _userFraction, releaseNotes?) => Promise.resolve({
        releases: [
            {
                status: 'inProgress',
                versionCodes: _versionCode,
                releaseNotes: releaseNotes
            }
        ]
    }),
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

tr.registerMock('glob', {
    sync: (path) => [path]
});

tr.registerMock('fs', {
    readFileSync: () => {
        return {
            toString: () => 'file contents'
        };
    },
    writeFileSync: sinon.stub(),
    statSync: () => {
        return {
            isFile: () => true,
            isDirectory: () => false
        };
    }
});

process.env['ENDPOINT_AUTH_myServiceEndpoint'] = JSON.stringify({
    parameters: {
        username: 'myUser',
        password: 'myPass'
    },

    scheme: 'UsernamePassword'
});

tr.run();
