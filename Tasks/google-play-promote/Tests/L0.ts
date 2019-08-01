import assert = require('assert');
import path = require('path');
import process = require('process');

import * as ttm from 'azure-pipelines-task-lib/mock-test';

describe('L0 Suite google-play-promote', function () {
    this.timeout(parseInt(process.env.TASK_TEST_TIMEOUT) || 20000);

    before((done) => {
        done();
    });

    it('test no service endpoint fails', (done) => {
        const testFile = path.join(__dirname, 'L0NoServiceEndpoint.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.createdErrorIssue('Error: loc_mock_EndpointNotFound'), 'Did not print the expected message: ' + JSON.stringify(testRunner));
        assert(testRunner.failed, 'task should have failed');
        done();
    });

    it('test no json file fails', (done) => {
        const testFile = path.join(__dirname, 'L0NoJsonFileAuth.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.createdErrorIssue('Error: loc_mock_JsonKeyFileNotFound'), 'Did not print the expected message: ' + JSON.stringify(testRunner));
        assert(testRunner.failed, 'task should have failed');
        done();
    });

    it('test invalid json file fails', (done) => {
        const testFile = path.join(__dirname, 'L0InvalidJsonAuth.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.createdErrorIssue('Error: loc_mock_InvalidAuthFilewithName myServiceAccountKey'), 'Did not print the expected message: ' + JSON.stringify(testRunner));
        assert(testRunner.failed, 'task should have failed');
        done();
    });
});
