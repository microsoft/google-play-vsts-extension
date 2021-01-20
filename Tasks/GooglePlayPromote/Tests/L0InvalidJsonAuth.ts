import * as ma from 'azure-pipelines-task-lib/mock-answer';
import * as tmrm from 'azure-pipelines-task-lib/mock-run';
import path = require('path');

const taskPath = path.join(__dirname, '..', 'google-play-promote.js');
const tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tr.setInput('authType', 'JsonFile');
tr.setInput('serviceEndpoint', 'myServiceEndpoint');
tr.setInput('serviceAccountKey', 'myServiceAccountKey');

// provide answers for task mock
const a: ma.TaskLibAnswers = <ma.TaskLibAnswers>{
    'getEndpointAuthorization': {
        'myServiceEndpoint': true
    },
    'checkPath': {
        'myServiceAccountKey': true
    }
};
tr.setAnswers(a);

tr.run();
