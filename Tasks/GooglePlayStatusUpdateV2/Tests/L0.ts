import assert = require('assert');
import { generateKeyPairSync } from 'crypto';
import process = require('process');
import { URL } from 'url';

import * as googleutil from '../googleutil';

describe('L0 Suite google-play-status-update', function () {
    this.timeout(parseInt(process.env.TASK_TEST_TIMEOUT) || 20000);

    it('uses dedicated OAuth and Play API hosts for token refresh and status updates', async function () {
        const { privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            publicKeyEncoding: { type: 'spki', format: 'pem' }
        });
        const jwtClient = googleutil.getJWT({
            client_email: 'endpoint-test@example.invalid',
            private_key: privateKey
        });
        const requests: URL[] = [];
        let tokenRequests = 0;
        let updateRequestBody: any;
        const releaseNotes = [{ language: 'en-US', text: 'Endpoint test' }];
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
                } else if (url.pathname.endsWith('/tracks/production') && options.method === 'GET') {
                    data = {
                        track: 'production',
                        releases: [{ versionCodes: ['42'], releaseNotes, status: 'inProgress', userFraction: 0.2 }]
                    };
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

        const globalParams: googleutil.GlobalParams = { auth: jwtClient, params: {} };
        googleutil.updateGlobalParams(globalParams, 'packageName', packageName);
        await googleutil.authorize(jwtClient);
        assert.strictEqual(tokenRequests, 1);

        jwtClient.credentials.expiry_date = Date.now() - 1;
        await jwtClient.getAccessToken();
        assert.strictEqual(tokenRequests, 2, 'Token renewal must use the dedicated OAuth host.');

        const edit = await googleutil.getNewEdit(edits, globalParams, packageName);
        googleutil.updateGlobalParams(globalParams, 'editId', edit.id);
        const track = await googleutil.getTrack(edits, packageName, 'production');
        const release = track.releases[0];
        await googleutil.updateTrack(edits, packageName, 'production', release.versionCodes, 'halted', release.userFraction, release.releaseNotes);
        await edits.commit();

        assert.deepStrictEqual(updateRequestBody, {
            track: 'production',
            releases: [{ versionCodes: ['42'], releaseNotes, userFraction: 0.2, status: 'halted' }]
        });
        assert.strictEqual(requests.length, 6);
        assert(requests.every(url => (
            url.hostname === 'oauth2.googleapis.com' ||
            url.hostname === 'androidpublisher.googleapis.com'
        )));
    });
});
