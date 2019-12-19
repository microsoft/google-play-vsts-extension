import * as ma from 'azure-pipelines-task-lib/mock-answer';
import * as tmrm from 'azure-pipelines-task-lib/mock-run';
import * as sinon from 'sinon';

import path = require('path');

const taskPath = path.join(__dirname, '..', 'GooglePlay.js');
const tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

process.env['ENDPOINT_AUTH_myServiceEndpoint'] = '{ "parameters": {"username": "myUser", "password": "myPass"}, "scheme": "UsernamePassword"}';

tr.setInput('authType', 'ServiceEndpoint');
tr.setInput('serviceEndpoint', 'myServiceEndpoint');
tr.setInput('applicationId', 'myPackage');
tr.setInput('bundleFile', '/path/to/bundle');
tr.setInput('track', 'Production');
tr.setInput('shouldAttachMetadata', 'true');
tr.setInput('metadataRootPath', '/path/to/metadata/folder');
tr.setInput('versionCodeFilterType', 'list');
tr.setInput('replaceList', '1, 3');

// provide answers for task mock
const a: ma.TaskLibAnswers = <ma.TaskLibAnswers>{
    'checkPath': {
        '/path/to/bundle': true,
        '/path/to/metadata/folder': true
    }
};
tr.setAnswers(a);

tr.registerMock('./googleutil', {
    publisher: {
        edits: {
            commit: sinon.stub(),
            listings: {
                update: sinon.stub()
            }
        }
    },
    getJWT: () => {
        return {
            authorize: sinon.stub()
        };
    },
    getNewEdit: () => Promise.resolve({}),
    getTrack: () => Promise.resolve({ releases: [{ versionCodes: [1, 2, 3]}]}),
    updateTrack: () => Promise.resolve({}),
    updateGlobalParams: () => Promise.resolve({}),
    addBundle: () => Promise.resolve({ versionCode: 4 })
});

tr.registerMock('glob', {
    sync: (path) => [path]
});

tr.registerMock('fs', {
    readdirSync: () => {
        return {
            filter: () => ['/path/to/metadata/folder/en-US']
        };
    },
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
