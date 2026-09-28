import test from 'node:test';
import assert from 'node:assert/strict';
import authGoogle from '../api/auth/google.js';
import { verifySession } from '../api/_lib/session.js';
import { getStore, resetMemoryStore } from '../api/_lib/store.js';
import { BASE_ENV, makeReq, makeRes, withEnv } from './helpers/http.js';

const ORIGINAL_FETCH = globalThis.fetch;
const CLIENT_ID = 'web-client.apps.googleusercontent.com';

// Mocked tokeninfo: the credential string is "cred-<sub>[-n<nonce>]-t<n>-xxx…".
// Each distinct credential string is a distinct token (its own iat), as with
// real Google tokens; presenting the same string twice is a replay.
function mockTokeninfo() {
  const issued = new Map();
  globalThis.fetch = async (url) => {
    const token = decodeURIComponent(String(url).split('id_token=')[1]);
    const [, sub, nonce] = token.match(/^cred-([^-]+)(?:-n([a-z0-9]+))?-t\d+-x+$/);
    if (!issued.has(token)) issued.set(token, String(1_700_000_000 + issued.size));
    return new Response(JSON.stringify({
      aud: CLIENT_ID,
      iss: 'https://accounts.google.com',
      email_verified: 'true',
      iat: issued.get(token),
      exp: String(Math.floor(Date.now() / 1000) + 3600),
      ...(nonce ? { nonce } : {}),
      sub,
      email: `${sub}@gmail.com`,
      name: `User ${sub}`,
      picture: '',
    }), { status: 200 });
  };
}

let signInCount = 0;

// A fresh credential per call unless `credential` is given (to replay one).
async function signIn(sub, ip = '10.1.1.1', { credential, nonce, tokenNonce = nonce } = {}) {
  signInCount += 1;
  const res = makeRes();
  const fresh = `cred-${sub}${tokenNonce ? `-n${tokenNonce}` : ''}-t${signInCount}-xxxxxxxxxxxxxxxxxxxx`;
  const body = { credential: credential || fresh, ...(nonce ? { nonce } : {}) };
  await authGoogle(makeReq({ url: '/api/auth/google', ip, body }), res);
  return res;
}

function authTest(name, fn, env = {}) {
  test(name, () => withEnv({ ...BASE_ENV, GOOGLE_CLIENT_ID: CLIENT_ID, ...env }, async () => {
    resetMemoryStore();
    mockTokeninfo();
    try {
      await fn();
    } finally {
      globalThis.fetch = ORIGINAL_FETCH;
    }
  }));
}

authTest('a new account starts with 3 credits and gets a session', async () => {
  const res = await signIn('alice');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.creditsRemaining, 3);
  assert.deepEqual(res.body.user, { id: 'alice', name: 'User alice', email: 'alice@gmail.com', picture: '' });
  assert.equal(verifySession(res.body.session).sub, 'alice');
});

authTest('signing in again does not reset credits', async () => {
  await signIn('bob');
  await getStore().reserveCredit('bob', 3);
  const again = await signIn('bob');
  assert.equal(again.statusCode, 200);
  assert.equal(again.body.creditsRemaining, 2);
});

authTest('too many new accounts from one IP → 429 SIGNUP_LIMITED and the credits key is deleted', async () => {
  assert.equal((await signIn('c1', '10.9.9.9')).statusCode, 200);
  assert.equal((await signIn('c2', '10.9.9.9')).statusCode, 200);
  const limited = await signIn('c3', '10.9.9.9');
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.code, 'SIGNUP_LIMITED');
  assert.equal(await getStore().get('credits:c3'), null);

  // Existing accounts can still sign in from that IP.
  assert.equal((await signIn('c1', '10.9.9.9')).statusCode, 200);
}, { JOVI_SIGNUP_LIMIT_PER_IP_DAY: '2' });

authTest('a token for another client id is rejected', async () => {
  const res = await signIn('mallory');
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'GOOGLE_TOKEN_INVALID');
}, { GOOGLE_CLIENT_ID: 'other-client.apps.googleusercontent.com' });

authTest('the same Google credential cannot be exchanged twice (replay)', async () => {
  const credential = 'cred-replayer-t0-xxxxxxxxxxxxxxxxxxxx';
  assert.equal((await signIn('replayer', '10.1.1.1', { credential })).statusCode, 200);
  const replay = await signIn('replayer', '10.1.1.1', { credential });
  assert.equal(replay.statusCode, 401);
  assert.equal(replay.body.code, 'GOOGLE_TOKEN_REUSED');
});

authTest('a nonce that does not match the token is rejected', async () => {
  assert.equal((await signIn('nonceok', '10.1.1.1', { nonce: 'abc123' })).statusCode, 200);
  const injected = await signIn('noncebad', '10.1.1.1', { nonce: 'abc123', tokenNonce: 'zzz999' });
  assert.equal(injected.statusCode, 401);
  assert.equal(injected.body.code, 'GOOGLE_TOKEN_INVALID');
});
