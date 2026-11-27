import assert = require('assert');
import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { URL } from 'url';

import * as googleutil from '../modules/googleutil';

async function readBody(data: any): Promise<string> {
    if (data instanceof Readable) {
        const chunks: Buffer[] = [];
        for await (const chunk of data) {
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks).toString();
    }
    return typeof data === 'string' ? data : JSON.stringify(data);
}

it('uses dedicated OAuth and Play API hosts for token refresh, uploads and track updates', async function () {
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    const jwtClient = googleutil.getJWT({
        client_email: 'endpoint-test@example.invalid',
        private_key: privateKey
    });
    const bundleContent = 'endpoint-test-bundle';
    const bundleFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gp-release-')), 'app.aab');
    fs.writeFileSync(bundleFile, bundleContent);

    const requests: URL[] = [];
    let tokenRequests = 0;
    let uploadedBody: string;
    let updateRequestBody: any;
    const edits = googleutil.publisher.edits;
    const packageName = 'com.example.endpointtest';

    jwtClient.transporter.defaults.adapter = async options => {
        const url = new URL(options.url.toString());
        requests.push(url);
        let data;
        if (url.hostname === 'oauth2.googleapis.com') {
            assert.strictEqual(url.pathname, '/token');
            const form = new URLSearchParams(options.data as any);
            const claims = JSON.parse(Buffer.from(form.get('assertion').split('.')[1], 'base64url').toString());
            assert.strictEqual(claims.aud, 'https://oauth2.googleapis.com/token');
            tokenRequests++;
            data = { access_token: `endpoint-token-${tokenRequests}`, token_type: 'Bearer', expires_in: 3600 };
        } else {
            assert.strictEqual(url.hostname, 'androidpublisher.googleapis.com');
            if (url.pathname.endsWith('/edits')) {
                data = { id: 'endpoint-edit' };
            } else if (url.pathname.startsWith('/upload/') && url.pathname.endsWith('/endpoint-edit/bundles')) {
                uploadedBody = await readBody(options.data);
                data = { versionCode: 42, sha256: 'abc' };
            } else if (url.pathname.endsWith('/tracks/production') && options.method === 'PUT') {
                updateRequestBody = options.data;
                data = options.data;
            } else if (url.pathname.endsWith('/endpoint-edit:commit')) {
                data = { id: 'endpoint-edit' };
            } else {
                assert.fail(`Unexpected request: ${options.method} ${url}`);
            }
        }
        return {
            data,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            config: options
        } as any;
    };

    try {
        const globalParams = { auth: jwtClient, params: {} };
        googleutil.updateGlobalParams(globalParams, 'packageName', packageName);
        await googleutil.authorize(jwtClient);
        assert.strictEqual(tokenRequests, 1);

        jwtClient.credentials.expiry_date = Date.now() - 1;
        await jwtClient.getAccessToken();
        assert.strictEqual(tokenRequests, 2, 'Token renewal must use the dedicated OAuth host.');

        const edit = await googleutil.getNewEdit(edits, packageName);
        googleutil.updateGlobalParams(globalParams, 'editId', edit.id);

        const bundle = await googleutil.addBundle(edits, packageName, bundleFile);
        assert.strictEqual(bundle.versionCode, 42);
        assert(uploadedBody.includes(bundleContent), 'Bundle content must be streamed in the upload request.');

        await googleutil.updateTrack(edits, packageName, 'production', [bundle.versionCode], 1.0, 0);
        await edits.commit();

        assert.deepStrictEqual(updateRequestBody, {
            track: 'production',
            releases: [{ versionCodes: ['42'], inAppUpdatePriority: 0, status: 'completed' }]
        });
        assert.strictEqual(requests.length, 6);
        assert(requests.every(url => (
            url.hostname === 'oauth2.googleapis.com' ||
            url.hostname === 'androidpublisher.googleapis.com'
        )));
    } finally {
        fs.rmSync(path.dirname(bundleFile), { recursive: true, force: true });
    }
});
