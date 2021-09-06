import * as ma from 'azure-pipelines-task-lib/mock-answer';
import * as tmrm from 'azure-pipelines-task-lib/mock-run';
import * as sinon from 'sinon';
import * as fs from 'fs';

import path = require('path');

const taskPath = path.join(__dirname, '..', 'GooglePlay.js');
const tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

const stubForReaddirSync: sinon.SinonStub = sinon.stub(fs, 'readdirSync');
stubForReaddirSync.onFirstCall().returns(['/path/to/obbfolder/file.exe', '/path/to/obbfolder/filename.txt']);
stubForReaddirSync.onSecondCall().returns(['main.1.package.obb', '/path/to/obbfolder/filename.txt']);
stubForReaddirSync.onThirdCall().returns(['main.1.package.obb', '/path/to/obbfolder/filename.txt']);

process.env['ENDPOINT_AUTH_myServiceEndpoint'] = '{ "parameters": {"username": "myUser", "password": "myPass"}, "scheme": "UsernamePassword"}';

tr.setInput('authType', 'ServiceEndpoint');
tr.setInput('serviceEndpoint', 'myServiceEndpoint');
tr.setInput('apkFile', '/path/to/apk');
tr.setInput('track', 'Production');
tr.setInput('shouldPickObbFile', 'true');
tr.setInput('shouldUploadApks', 'true');
tr.setInput('versionCodeFilterType', 'list');

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
    getTrack: () => Promise.resolve({ releases: [{ versionCodes: [1, 2, 3 ]}]}),
    updateTrack: () => Promise.resolve({}),
    updateGlobalParams: () => Promise.resolve({}),
    addApk: () => Promise.resolve({versionCode: 1}),
    addObb: () => Promise.resolve({ expansionFile: { fileSize: '1000' } })
});

tr.registerMock('adbkit-apkreader', {
    open: () => Promise.resolve({
        readManifest: () => Promise.resolve({ versionCode: 1.0, package: 'package' })
    })
});

tr.registerMock('glob', {
    sync: (path) => [path]
});

tr.registerMock('fs', {

    readdirSync: () => stubForReaddirSync(),
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

tr.run();
