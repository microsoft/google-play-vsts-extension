import * as ma from 'azure-pipelines-task-lib/mock-answer';
import * as tmrm from 'azure-pipelines-task-lib/mock-run';

import path = require('path');

const taskPath = path.join(__dirname, '..', 'main.js');
const tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

process.env['ENDPOINT_AUTH_myServiceEndpoint'] = '{ "parameters": {"username": "myUser", "password": "myPass"}, "scheme": "UsernamePassword"}';

tr.setInput('authType', 'ServiceEndpoint');
tr.setInput('serviceEndpoint', 'myServiceEndpoint');
tr.setInput('applicationId', 'package');
tr.setInput('action', 'SingleApk');
tr.setInput('apkFile', '/path/to/apk');
tr.setInput('track', 'Production');
tr.setInput('shouldAttachMetadata', 'false');
tr.setInput('versionCodeFilterType', 'list');
tr.setInput('replaceList', '1, 3, notreal');

// provide answers for task mock
const a: ma.TaskLibAnswers = <ma.TaskLibAnswers>{
    'checkPath': {
        '/path/to/apk': true
    }
};
tr.setAnswers(a);

tr.registerMock('glob', {
    sync: (path) => [path]
});

tr.run();
