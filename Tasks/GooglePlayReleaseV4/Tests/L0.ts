import assert = require('assert');
import path = require('path');
import process = require('process');

import * as ttm from 'azure-pipelines-task-lib/mock-test';

describe('L0 Suite GooglePlayReleaseV4', function () {
    this.timeout(parseInt(process.env.TASK_TEST_TIMEOUT) || 30000);

    describe('Google Util tests', function() {
        require('./L0_googleutil');
    });

    it('test no service endpoint fails', async () => {
        const testFile = path.join(__dirname, 'L0NoServiceEndpoint.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.createdErrorIssue('Error: Input required: serviceEndpoint'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
    });

    it('test no json file fails', async () => {
        const testFile = path.join(__dirname, 'L0NoJsonFileAuth.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.createdErrorIssue('Error: Input required: serviceAccountKey'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
    });

    it('test invalid json file fails', async () => {
        const testFile = path.join(__dirname, 'L0InvalidJsonAuth.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.createdErrorIssue('Error: loc_mock_InvalidAuthFile myServiceAccountKey'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
    });

    it('test fail when no APK supplied', async () => {
        const testFile = path.join(__dirname, 'L0NoApkSupplied.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.createdErrorIssue('Error: Input required: apkFile'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
    });

    it('test fail when no APK found', async () => {
        const testFile = path.join(__dirname, 'L0NoApkFound.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.createdErrorIssue('Error: loc_mock_ApkOrAabNotFound apkFile /path/to/apk'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
    });

    it('test found obb file in parent directory', async () => {
        const testFile = path.join(__dirname, 'L0ObbFoundInParentDirectory.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.stdOutContained('Found Obb file for upload in parent directory: /path/to/obbfolder/file.obb'), 'Did not print the expected message');
        assert(testRunner.succeeded, 'task should have succeeded');
    });

    it('test found obb file in apk directory', async () => {
        const testFile = path.join(__dirname, 'L0ObbFoundInApkDirectory.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.stdOutContained('Found Obb file for upload in current directory: main.1.package.obb'), 'Did not print the expected message');
        assert(testRunner.succeeded, 'task should have succeeded');
    });

    it('test obb file not found', async () => {
        const testFile = path.join(__dirname, 'L0ObbFileNotFound.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.stdOutContained('No Obb found for /path/to/apk, skipping upload'), 'Did not print the expected message');
        assert(testRunner.succeeded, 'task should have succeeded');
    });

    it('test found deobfuscation file', async () => {
        const testFile = path.join(__dirname, 'L0FoundDeobfuscationFile.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.stdOutContained('loc_mock_FoundDeobfuscationFile /path/to/mapping'), 'Did not print the expected message: ' + JSON.stringify(testRunner));
        assert(testRunner.succeeded, 'task should have succeeded: ' + JSON.stringify(testRunner));
    });

    it('test deobfuscation file not found', async () => {
        const testFile = path.join(__dirname, 'L0DeobfuscationFileNotFound.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.createdErrorIssue('Error: Not found /path/to/mapping'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
    });

    it('test succeeds on happy path', async () => {
        const testFile = path.join(__dirname, 'L0HappyPath.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.succeeded, 'task should have succeeded');
    });

    it('test fails task when cannot read changelog', async () => {
        const testFile = path.join(__dirname, 'L0UseChangeLogFail.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.stdOutContained('loc_mock_AppendChangelog /path/to/changelog'), 'Did not have expected localized message');
        assert(testRunner.createdErrorIssue('Error: loc_mock_CannotReadChangeLog /path/to/changelog'), 'Did not have expected localized message');
        assert(testRunner.failed, 'task should have failed');
    });

    it('test succeeds task with updating changelog', async () => {
        const testFile = path.join(__dirname, 'L0UseChangeLog.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.stdOutContained('loc_mock_AppendChangelog /path/to/changelog'), 'Did not have expected localized message');
        assert(testRunner.succeeded, 'task should have succeeded');
    });

    it('test uploads metadata', async () => {
        const testFile = path.join(__dirname, 'L0AttachMetadata.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.stdOutContained('loc_mock_AttachingMetadataToRelease'), 'Did not have expected localized message');
        assert(testRunner.succeeded, 'task should have succeeded');
    });

    it('test update track with specified versions', async () => {
        const testFile = path.join(__dirname, 'L0UpdateTrackWithVersionList.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.stdOutContained('New Production track version codes: [2,4]'), 'Did not have expected localized message: ' + JSON.stringify(testRunner));
        assert(testRunner.succeeded, 'task should have succeeded: ' + JSON.stringify(testRunner));
    });

    it('test fails with bad version list', async () => {
        const testFile = path.join(__dirname, 'L0BadVersionList.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        await testRunner.runAsync();

        assert(testRunner.createdErrorIssue('Error: loc_mock_IncorrectVersionCodeFilter ["notreal"]'), 'Did not have expected localized message: ' + JSON.stringify(testRunner));
        assert(testRunner.failed, 'task should have failed: ' + JSON.stringify(testRunner));
    });
});
