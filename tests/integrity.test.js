import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createVerify, generateKeyPairSync } from 'node:crypto';
import { buildServiceAccountJwt, resetIntegrityCache } from '../api/_lib/attestation.js';
import { defineRoute } from '../api/_lib/guard.js';
import { issueSession } from '../api/_lib/session.js';
import { resetMemoryStore } from '../api/_lib/store.js';
import { BASE_ENV, makeReq, makeRes, withEnv } from './helpers/http.js';

const ORIGINAL_FETCH = globalThis.fetch;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SERVICE_ACCOUNT = {
  client_email: 'integrity-verifier@jovi-lens.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};
const CERT = 'q1w2e3r4t5y6u7i8o9p0asdfghjklzxcvbnmQWERTYU';
const ENV = {
  ...BASE_ENV,
  JOVI_REQUIRE_INTEGRITY: 'true',
  PLAY_INTEGRITY_PACKAGE: undefined,
  PLAY_INTEGRITY_CERT_SHA256: `other-cert,${CERT}=`,
  PLAY_INTEGRITY_SA_JSON_B64: Buffer.from(JSON.stringify(SERVICE_ACCOUNT)).toString('base64'),
};
const BODY = { hello: 'mundo' };

const route = defineRoute({
  method: 'POST',
  scope: 'integrity-test',
  burstPerMinute: 1000,
  auth: 'session',
  integrity: true,
  cost: 0,
  byok: 'optional',
  run: async () => ({ ok: true }),
});

function sha256hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requestHash(ts, body = BODY, path = '/api/test') {
  return sha256hex(`POST\n${path}\n${sha256hex(JSON.stringify(body))}\n${ts}`);
}

function goodPayload(hash) {
  return {
    requestDetails: { requestPackageName: 'com.jovilens.app', requestHash: hash, timestampMillis: String(Date.now()) },
    appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION', packageName: 'com.jovilens.app', certificateSha256Digest: [CERT] },
    deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
  };
}

// Mocks Google's OAuth token endpoint and decodeIntegrityToken.
function mockGoogle({ payload, decodeStatus = 200 } = {}) {
  const calls = { token: [], decode: [] };
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target === 'https://oauth2.googleapis.com/token') {
      calls.token.push(Object.fromEntries(new URLSearchParams(options.body)));
      return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), { status: 200 });
    }
    calls.decode.push({ url: target, headers: options.headers, body: JSON.parse(options.body) });
    if (decodeStatus !== 200) return new Response('{}', { status: decodeStatus });
    return new Response(JSON.stringify({ tokenPayloadExternal: payload }), { status: 200 });
  };
  return calls;
}

async function call({ ts = String(Date.now()), token = 'integrity-token', body = BODY } = {}) {
  const res = makeRes();
  const headers = { authorization: `Bearer ${issueSession({ sub: 'device-user', email: 'd@example.com' })}` };
  if (ts !== null) headers['x-jovi-ts'] = ts;
  if (token !== null) headers['x-play-integrity-token'] = token;
  await route(makeReq({ url: '/api/test', headers, body }), res);
  return res;
}

function integrityTest(name, fn) {
  test(name, () => withEnv(ENV, async () => {
    resetMemoryStore();
    resetIntegrityCache();
    try {
      await fn();
    } finally {
      globalThis.fetch = ORIGINAL_FETCH;
    }
  }));
}

integrityTest('a valid token for this exact request passes', async () => {
  const ts = String(Date.now());
  const calls = mockGoogle({ payload: goodPayload(requestHash(ts)) });
  const res = await call({ ts });
  assert.equal(res.statusCode, 200);
  assert.equal(calls.decode[0].url, 'https://playintegrity.googleapis.com/v1/com.jovilens.app:decodeIntegrityToken');
  assert.equal(calls.decode[0].headers.Authorization, 'Bearer ya29.test');
  assert.deepEqual(calls.decode[0].body, { integrity_token: 'integrity-token' });
  assert.equal(calls.token[0].grant_type, 'urn:ietf:params:oauth:grant-type:jwt-bearer');
});

const FAILURES = [
  ['pkg (request)', (p) => { p.requestDetails.requestPackageName = 'com.evil.app'; }],
  ['pkg (app)', (p) => { p.appIntegrity.packageName = 'com.evil.app'; }],
  ['hash', (p) => { p.requestDetails.requestHash = 'f'.repeat(64); }],
  ['unevaluated', (p) => { p.appIntegrity.appRecognitionVerdict = 'UNEVALUATED'; }],
  ['cert', (p) => { p.appIntegrity.certificateSha256Digest = ['resigned-cert']; }],
  ['device', (p) => { p.deviceIntegrity.deviceRecognitionVerdict = ['MEETS_BASIC_INTEGRITY']; }],
];

for (const [reason, mutate] of FAILURES) {
  integrityTest(`failure reason ${reason} → 403 INTEGRITY_FAILED`, async () => {
    const ts = String(Date.now());
    const payload = goodPayload(requestHash(ts));
    mutate(payload);
    mockGoogle({ payload });
    const res = await call({ ts });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'INTEGRITY_FAILED');
  });
}

integrityTest('stale or missing timestamp → 403', async () => {
  mockGoogle({ payload: {} });
  const stale = await call({ ts: String(Date.now() - 180_000) });
  assert.equal(stale.statusCode, 403);
  const missing = await call({ token: null });
  assert.equal(missing.statusCode, 403);
});

integrityTest('a replayed request → 403', async () => {
  const ts = String(Date.now());
  mockGoogle({ payload: goodPayload(requestHash(ts)) });
  assert.equal((await call({ ts })).statusCode, 200);
  const replay = await call({ ts });
  assert.equal(replay.statusCode, 403);
  assert.equal(replay.body.code, 'INTEGRITY_FAILED');
});

integrityTest('Google 5xx → 503 INTEGRITY_UNAVAILABLE; 4xx → 403', async () => {
  mockGoogle({ decodeStatus: 503 });
  const down = await call();
  assert.equal(down.statusCode, 503);
  assert.equal(down.body.code, 'INTEGRITY_UNAVAILABLE');

  mockGoogle({ decodeStatus: 400 });
  const rejected = await call();
  assert.equal(rejected.statusCode, 403);
});

test('the service-account JWT is RS256 with the right claims', () => {
  const now = Date.UTC(2026, 8, 24, 12, 0, 0);
  const jwt = buildServiceAccountJwt(SERVICE_ACCOUNT, now);
  const [header, claims, signature] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  const iat = Math.floor(now / 1000);
  assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url')), {
    iss: SERVICE_ACCOUNT.client_email,
    scope: 'https://www.googleapis.com/auth/playintegrity',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  });
  assert.ok(createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, signature, 'base64url'));
});
