import assert = require('assert');
import path = require('path');
import process = require('process');

import * as ttm from 'azure-pipelines-task-lib/mock-test';

describe('L0 Suite google-play-release', function () {
    this.timeout(parseInt(process.env.TASK_TEST_TIMEOUT) || 20000);

    before((done) => {
        done();
    });

    describe('Google Util tests', function() {
        require('./L0_googleutil');
    });

    it('test no service endpoint fails', (done) => {
        const testFile = path.join(__dirname, 'L0NoServiceEndpoint.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.createdErrorIssue('Error: Input required: serviceEndpoint'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
        done();
    });

    it('test no json file fails', (done) => {
        const testFile = path.join(__dirname, 'L0NoJsonFileAuth.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.createdErrorIssue('Error: Input required: serviceAccountKey'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
        done();
    });

    it('test invalid json file fails', (done) => {
        const testFile = path.join(__dirname, 'L0InvalidJsonAuth.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.createdErrorIssue('Error: loc_mock_InvalidAuthFile myServiceAccountKey'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
        done();
    });

    it('test fail when no APK supplied', (done) => {
        const testFile = path.join(__dirname, 'L0NoApkSupplied.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.createdErrorIssue('Error: Input required: apkFile'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
        done();
    });

    it('test fail when no APK found', (done) => {
        const testFile = path.join(__dirname, 'L0NoApkFound.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.createdErrorIssue('Error: Not found /path/to/apk'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
        done();
    });

    it('test found obb file', (done) => {
        const testFile = path.join(__dirname, 'L0ObbFileFound.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.stdOutContained('Found Obb file for upload: /path/to/obbfolder/filename.obb'), 'Did not print the expected message');
        assert(testRunner.succeeded, 'task should have succeeded');
        done();
    });

    it('test obb file not found', (done) => {
        const testFile = path.join(__dirname, 'L0ObbFileNotFound.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.stdOutContained('No Obb found for /path/to/apk, skipping upload'), 'Did not print the expected message');
        assert(testRunner.succeeded, 'task should have succeeded');
        done();
    });

    it('test found deobfuscation file', (done) => {
        const testFile = path.join(__dirname, 'L0FoundDeobfuscationFile.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.stdOutContained('loc_mock_FoundDeobfuscationFile /path/to/mapping'), 'Did not print the expected message: ' + JSON.stringify(testRunner));
        assert(testRunner.succeeded, 'task should have succeeded: ' + JSON.stringify(testRunner));
        done();
    });

    it('test deobfuscation file not found', (done) => {
        const testFile = path.join(__dirname, 'L0DeobfuscationFileNotFound.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.createdErrorIssue('Error: Not found /path/to/mapping'), 'Did not print the expected message');
        assert(testRunner.failed, 'task should have failed');
        done();
    });

    it('test succeeds on happy path', (done) => {
        const testFile = path.join(__dirname, 'L0HappyPath.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.succeeded, 'task should have succeeded');
        done();
    });

    it('test fails task when cannot read changelog', (done) => {
        const testFile = path.join(__dirname, 'L0UseChangeLogFail.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.stdOutContained('loc_mock_AppendChangelog /path/to/changelog'), 'Did not have expected localized message');
        assert(testRunner.createdErrorIssue('Error: loc_mock_CannotReadChangeLog /path/to/changelog'), 'Did not have expected localized message');
        assert(testRunner.failed, 'task should have failed');
        done();
    });

    it('test succeeds task with updating changelog', (done) => {
        const testFile = path.join(__dirname, 'L0UseChangeLog.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.stdOutContained('loc_mock_AppendChangelog /path/to/changelog'), 'Did not have expected localized message');
        assert(testRunner.succeeded, 'task should have succeeded');
        done();
    });

    it('test uploads metadata', (done) => {
        const testFile = path.join(__dirname, 'L0AttachMetadata.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.stdOutContained('loc_mock_AttachingMetadataToRelease'), 'Did not have expected localized message');
        assert(testRunner.succeeded, 'task should have succeeded');
        done();
    });

    it('test update track with specified versions', (done) => {
        const testFile = path.join(__dirname, 'L0UpdateTrackWithVersionList.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.stdOutContained('New Production track version codes: [2,4]'), 'Did not have expected localized message: ' + JSON.stringify(testRunner));
        assert(testRunner.succeeded, 'task should have succeeded: ' + JSON.stringify(testRunner));
        done();
    });

    it('test fails with bad version list', (done) => {
        const testFile = path.join(__dirname, 'L0BadVersionList.js');
        const testRunner = new ttm.MockTestRunner(testFile);

        testRunner.run();

        assert(testRunner.createdErrorIssue('Error: loc_mock_IncorrectVersionCodeFilter ["notreal"]'), 'Did not have expected localized message: ' + JSON.stringify(testRunner));
        assert(testRunner.failed, 'task should have failed: ' + JSON.stringify(testRunner));
        done();
    });
});
