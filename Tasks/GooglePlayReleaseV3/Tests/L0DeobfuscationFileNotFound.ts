import * as ma from 'azure-pipelines-task-lib/mock-answer';
import * as tmrm from 'azure-pipelines-task-lib/mock-run';
import * as sinon from 'sinon';

import path = require('path');

const taskPath = path.join(__dirname, '..', 'GooglePlay.js');
const tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

process.env['ENDPOINT_AUTH_myServiceEndpoint'] = '{ "parameters": {"username": "myUser", "password": "myPass"}, "scheme": "UsernamePassword"}';

tr.setInput('authType', 'ServiceEndpoint');
tr.setInput('serviceEndpoint', 'myServiceEndpoint');
tr.setInput('apkFile', '/path/to/apk');
tr.setInput('shouldUploadApks', 'true');
tr.setInput('shouldUploadMappingFile', 'true');
tr.setInput('mappingFilePath', '/path/to/mapping');
tr.setInput('track', 'Production');

// provide answers for task mock
const a: ma.TaskLibAnswers = <ma.TaskLibAnswers>{
    'checkPath': {
        '/path/to/apk': true
    }
};
tr.setAnswers(a);

tr.registerMock('./googleutil', {
    publisher: {
        edits: {
            commit: sinon.stub()
        }
    },
    getJWT: () => {
        return {
            authorize: sinon.stub()
        };
    },
    getNewEdit: () => Promise.resolve({}),
    getTrack: () => Promise.resolve({}),
    updateTrack: () => Promise.resolve({}),
    updateGlobalParams: () => Promise.resolve({}),
    addApk: () => Promise.resolve({})
});

tr.registerMock('adbkit-apkreader', {
    open: () => Promise.resolve({
        readManifest: () => Promise.resolve({ versionCode: 1.0 })
    })
});

tr.registerMock('glob', {
    sync: (path) => [path]
});

tr.run();
