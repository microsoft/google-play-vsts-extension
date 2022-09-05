import * as assert from 'assert';
import * as mockery from 'mockery';
import * as sinon from 'sinon';

import * as mockTask from 'azure-pipelines-task-lib/mock-task';
import * as googleutil from '../modules/googleutil';

import * as googleapis from 'googleapis';

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

it('getNewEdit tests', async function () {
    mockery.registerMock('azure-pipelines-task-lib/task', mockTask);
    mockery.registerMock('googleapis', {
        google: {
            androidpublisher: () => ({})
        }
    });

    const fakeEditId = 123;
    const stub = sinon.stub();
    stub.returns({ data: { id: fakeEditId } });
    const edits: any = { insert: stub };

    const p: googleapis.Common.GlobalOptions = { params: {} };
    const packname = 'myPackageName';

    const edit = await googleutil.getNewEdit(edits, packname);

    assert.equal(edit.id, fakeEditId);
    assert(stub.called);
    assert.equal(packname, stub.args[0][0].packageName);

    googleutil.updateGlobalParams(p, 'editId', edit.id);
    assert.equal(fakeEditId, p.params['editId']);
});

it('getTrack tests', async function () {
    mockery.registerMock('azure-pipelines-task-lib/task', mockTask);
    mockery.registerMock('googleapis', {
        google: {
            androidpublisher: () => ({})
        }
    });

    const stub = sinon.stub();
    stub.returns({ data: {}});
    const edits: any = { tracks: { get: stub } };

    const packname = 'myPackageName';
    const track = 'myFakeTrack';

    await googleutil.getTrack(edits, packname, track);

    assert(stub.called);
    assert.equal(track, stub.args[0][0].track);
    assert.equal(packname, stub.args[0][0].packageName);
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

    stub.returns({ data: {}});
    await googleutil.updateTrack(edits, packname, track, 123, 1.0, 0);
    assert(stub.called);
    let response = stub.args[0][0];
    assert.equal(packname, response.packageName);
    assert.equal(track, response.track);
    assert.equal(123, response.requestBody.releases[0].versionCodes);
    assert(!response.requestBody.releases[0].userFraction);
    assert.equal('completed', response.requestBody.releases[0].status);
    stub.reset();

    stub.returns({ data: {}});
    await googleutil.updateTrack(edits, packname, track, [234], 1.0, 0);
    assert(stub.called);
    response = stub.args[0][0];
    assert.equal(234, response.requestBody.releases[0].versionCodes);
    assert(!response.requestBody.releases[0].userFraction);
    assert.equal('completed', response.requestBody.releases[0].status);
    stub.reset();

    stub.returns({ data: {}});
    await googleutil.updateTrack(edits, packname, track, [345], 0.9, 0);
    assert(stub.called);
    response = stub.args[0][0];
    assert.equal(345, response.requestBody.releases[0].versionCodes);
    assert.equal(0.9, response.requestBody.releases[0].userFraction);
    assert.equal('inProgress', response.requestBody.releases[0].status);
    stub.reset();

    stub.returns({ data: {}});
    const isDraftRelease = true;
    await googleutil.updateTrack(edits, packname, track, [345], 0.9, 0, undefined, undefined, isDraftRelease);
    assert(stub.called);
    response = stub.args[0][0];
    assert.equal(345, response.requestBody.releases[0].versionCodes);
    assert.equal('draft', response.requestBody.releases[0].status);
    assert(!response.requestBody.releases[0].userFraction);
    stub.reset();
});
