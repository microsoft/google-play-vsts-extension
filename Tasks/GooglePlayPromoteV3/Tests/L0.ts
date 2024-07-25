import assert = require('assert');
import path = require('path');
import process = require('process');

import * as ttm from 'azure-pipelines-task-lib/mock-test';

describe('L0 Suite google-play-promote', function () {
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

    it('test pass through release notes', async () => {
        const testFile = path.join(__dirname, 'L0SendReleaseNotes.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        // This test returns 'release notes' from `getTrack` and tests the 'Track' printed from `updateTrack`
        assert(testRunner.stdOutContained('Update track: [{"text":"release contents","language":"en-US"}]'), 'Did not print the expected message: ' + JSON.stringify(testRunner));
        assert(testRunner.succeeded, 'task should have succeeded');
    });

    it('test correct release with version code selected', async () => {
        const testFile = path.join(__dirname, 'L0PromoteWithVersionCode.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.stdOutContained('Update track: {"releases":[{"status":"inProgress","versionCodes":[120],"releaseNotes":[{"text":"Updated Release","language":"en-US"}]}]}'), 'Did not print the expected message: ' + JSON.stringify(testRunner));
        assert(testRunner.succeeded, 'task should have succeeded');
    });

    it('test correct release with no version code selected', async () => {
        const testFile = path.join(__dirname, 'L0PromoteNoVersionCode.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.stdOutContained('Update track: {"releases":[{"status":"inProgress","versionCodes":[123],"releaseNotes":[{"text":"release contents","language":"en-US"}]}]}'), 'Did not print the expected message: ' + JSON.stringify(testRunner));
        assert(testRunner.succeeded, 'task should have succeeded');
    });

});
