import * as tmrm from 'azure-pipelines-task-lib/mock-run';
import path = require('path');

const taskPath = path.join(__dirname, '..', 'GooglePlay.js');
const tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tr.setInput('authType', 'JsonFile');
tr.setInput('serviceEndpoint', 'myServiceEndpoint');
tr.setInput('serviceAccountKey', '');

tr.run();
