import assert = require('assert');
import path = require('path');
import process = require('process');

import * as ttm from 'azure-pipelines-task-lib/mock-test';

describe('L0 Suite google-play-increase-rollout', function () {
    this.timeout(parseInt(process.env.TASK_TEST_TIMEOUT) || 20000);

    it('test no service endpoint fails', async () => {
        const testFile = path.join(__dirname, 'L0NoServiceEndpoint.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.createdErrorIssue('Error: loc_mock_EndpointNotFound'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
    });

    it('test no json file fails', async () => {
        const testFile = path.join(__dirname, 'L0NoJsonFileAuth.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.createdErrorIssue('Error: loc_mock_JsonKeyFileNotFound'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
    });

    it('test invalid json file fails', async () => {
        const testFile = path.join(__dirname, 'L0InvalidJsonAuth.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.createdErrorIssue('Error: loc_mock_InvalidAuthFilewithName myServiceAccountKey'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
    });

    it('test authorize throw fails task', async () => {
        const testFile = path.join(__dirname, 'L0GoogleAuthError.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.createdErrorIssue('Error: authorize() error'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
    });

    it('test nothing in progress fails', async () => {
        const testFile = path.join(__dirname, 'L0NothingInProgress.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.createdErrorIssue('Error: loc_mock_InProgressNotFound'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
    });

    it('test pass through release notes', async () => {
        const testFile = path.join(__dirname, 'L0SendReleaseNotes.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        // This test returns 'release notes' from `getTrack` and tests the 'Track' printed from `updateTrack`
        assert(testRunner.stdOutContained('Update Track: [{"text":"release contents","language":"en-US"}]'), 'Did not print the expected message');
        assert(testRunner.succeeded, 'task should have succeeded');
    });
});
