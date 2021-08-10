import * as assert from 'assert';
import * as mockery from 'mockery';
import * as sinon from 'sinon';

import * as mockTask from 'azure-pipelines-task-lib/mock-task';
import * as googleutil from '../googleutil';

before(function () {
    mockery.enable({
        useCleanCache: true,
        warnOnUnregistered: false
    });
});

after(function () {
    mockery.disable();
});

afterEach(function () {
    mockery.deregisterAll();
    mockery.resetCache();
});

it('updateTrack tests', async function () {
    mockery.registerMock('azure-pipelines-task-lib/task', mockTask);
    mockery.registerMock('googleapis', {
        google: {
            androidpublisher: () => ({})
        }
    });

    const stub = sinon.stub();
    const edits: any = { tracks: { update: stub } };

    const packname = 'myPackageName';
    const track = 'myFakeTrack';
    const releaseName = 'myReleaseName';

    stub.returns({ data: {}});
    await googleutil.updateTrack(edits, packname, track, '123', 1.0, 0, null, releaseName);
    assert(stub.called);
    let response = stub.args[0][0];
    assert.strictEqual(packname, response.packageName);
    assert.strictEqual(track, response.track);
    assert.strictEqual(1, response.requestBody.releases[0].versionCodes.length);
    assert(!response.requestBody.releases[0].userFraction);
    assert.strictEqual(releaseName, response.requestBody.releases[0].name);
    assert.strictEqual('completed', response.requestBody.releases[0].status);
    stub.reset();

    stub.returns({ data: {}});
    await googleutil.updateTrack(edits, packname, track, ['123', '345'], 0.9, 0, null, releaseName);
    assert(stub.called);
    response = stub.args[0][0];
    assert.strictEqual(2, response.requestBody.releases[0].versionCodes.length);
    assert.strictEqual(0.9, response.requestBody.releases[0].userFraction);
    assert.strictEqual(releaseName, response.requestBody.releases[0].name);
    assert.strictEqual('inProgress', response.requestBody.releases[0].status);
    stub.reset();
});
