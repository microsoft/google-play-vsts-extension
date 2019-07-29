import * as tmrm from 'azure-pipelines-task-lib/mock-run';
import path = require('path');

const taskPath = path.join(__dirname, '..', 'google-play-rollout-update.js');
const tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tr.setInput('authType', 'ServiceEndpoint');
tr.setInput('serviceEndpoint', 'myServiceEndpoint');
tr.setInput('serviceAccountKey', '');

tr.run();
