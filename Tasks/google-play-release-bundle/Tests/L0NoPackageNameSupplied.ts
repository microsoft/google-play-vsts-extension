import * as tmrm from 'azure-pipelines-task-lib/mock-run';

import path = require('path');

const taskPath = path.join(__dirname, '..', 'GooglePlay.js');
const tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tr.setInput('authType', 'ServiceEndpoint');
tr.setInput('serviceEndpoint', 'myServiceEndpoint');
tr.setInput('bundleFile', '/path/to/bundle');
tr.setInput('applicationId', '');

process.env['ENDPOINT_AUTH_myServiceEndpoint'] = '{ "parameters": {"username": "myUser", "password": "myPass"}, "scheme": "UsernamePassword"}';

tr.run();
