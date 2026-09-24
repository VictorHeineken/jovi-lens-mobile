import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { defineRoute } from '../api/_lib/guard.js';
import { issueSession } from '../api/_lib/session.js';
import { resetMemoryStore } from '../api/_lib/store.js';
import { BASE_ENV, makeReq, makeRes, withEnv } from './helpers/http.js';

const MINIMAX_KEY = 'mm-test-key-abcdefghijklmnopqrstuvwxyz';

function route(overrides = {}) {
  return defineRoute({
    method: 'POST',
    scope: 'guard-test',
    burstPerMinute: 1000,
    auth: 'session',
    integrity: false,
    cost: 0,
    byok: 'optional',
    validate: (body) => ({ input: body }),
    run: async () => ({ ok: true }),
    ...overrides,
  });
}

function session(sub = 'user-1') {
  return `Bearer ${issueSession({ sub, email: `${sub}@example.com` })}`;
}

async function call(handler, reqOptions) {
  const res = makeRes();
  await handler(makeReq(reqOptions), res);
  return res;
}

function guarded(name, fn, env = {}) {
  test(name, () => withEnv({ ...BASE_ENV, ...env }, async () => {
    resetMemoryStore();
    await fn();
  }));
}

guarded('405 METHOD_NOT_ALLOWED for the wrong method', async () => {
  const res = await call(route(), { method: 'GET', headers: { authorization: session() } });
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.code, 'METHOD_NOT_ALLOWED');
});

guarded('415 UNSUPPORTED_MEDIA_TYPE for a non-JSON POST', async () => {
  const res = await call(route(), { headers: { 'content-type': 'text/plain', authorization: session() }, rawBody: 'hi' });
  assert.equal(res.statusCode, 415);
  assert.equal(res.body.code, 'UNSUPPORTED_MEDIA_TYPE');
});

guarded('413 PAYLOAD_TOO_LARGE above 4,000,000 bytes', async () => {
  const res = await call(route(), { headers: { authorization: session() }, rawBody: 'x'.repeat(4_000_001) });
  assert.equal(res.statusCode, 413);
  assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE');
});

guarded('400 INVALID_JSON for a malformed body', async () => {
  const res = await call(route(), { headers: { authorization: session() }, rawBody: '{nope' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'INVALID_JSON');
  assert.equal(res.body.message, 'Requisição inválida.');
});

guarded('401 API_KEY_INVALID, then 429 after 20 bad keys; valid keys never hit that bucket', async () => {
  const handler = route();
  const first = await call(handler, { headers: { 'x-api-key': 'wrong', authorization: session() }, body: {} });
  assert.equal(first.statusCode, 401);
  assert.equal(first.body.code, 'API_KEY_INVALID');

  for (let i = 0; i < 19; i += 1) await call(handler, { headers: { 'x-api-key': 'wrong' }, body: {} });
  const limited = await call(handler, { headers: { 'x-api-key': 'wrong' }, body: {} });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.code, 'RATE_LIMITED');

  // A different IP with the right key is never limited by the failure bucket.
  for (let i = 0; i < 60; i += 1) {
    const ok = await call(handler, { ip: '10.0.0.2', headers: { 'x-api-key': 'right-key', authorization: session() }, body: {} });
    assert.equal(ok.statusCode, 200);
  }
}, { JOVI_API_KEY: 'right-key' });

guarded('401 SIGN_IN_REQUIRED without a session and SESSION_INVALID with a bad one', async () => {
  const missing = await call(route(), { body: {} });
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.body.code, 'SIGN_IN_REQUIRED');

  const invalid = await call(route(), { headers: { authorization: 'Bearer not-a-real-token' }, body: {} });
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.body.code, 'SESSION_INVALID');
});

guarded('429 RATE_LIMITED past the per-user burst', async () => {
  const handler = route({ burstPerMinute: 2 });
  const headers = { authorization: session('burst-user') };
  assert.equal((await call(handler, { headers, body: {} })).statusCode, 200);
  assert.equal((await call(handler, { headers, body: {} })).statusCode, 200);
  const limited = await call(handler, { headers, body: {} });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.code, 'RATE_LIMITED');
});

guarded('403 BYOK_REQUIRED on a byok-required route without a key', async () => {
  const res = await call(route({ byok: 'required', byokCapability: 'tts' }), { headers: { authorization: session() }, body: {} });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'BYOK_REQUIRED');
});

guarded('400 BYOK_CAPABILITY_UNSUPPORTED for MiniMax speech-to-text', async () => {
  const res = await call(route({ byok: 'required', byokCapability: 'stt' }), {
    headers: { authorization: session(), 'x-ai-provider': 'minimax', 'x-ai-key': MINIMAX_KEY },
    body: {},
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'BYOK_CAPABILITY_UNSUPPORTED');
});

guarded('400 BYOK_INVALID_FORMAT for a key without a provider or with a bad shape', async () => {
  const noProvider = await call(route(), { headers: { authorization: session(), 'x-ai-key': MINIMAX_KEY }, body: {} });
  assert.equal(noProvider.statusCode, 400);
  assert.equal(noProvider.body.code, 'BYOK_INVALID_FORMAT');

  const badShape = await call(route(), { headers: { authorization: session(), 'x-ai-provider': 'gemini', 'x-ai-key': 'short' }, body: {} });
  assert.equal(badShape.body.code, 'BYOK_INVALID_FORMAT');
});

guarded('400 IDEMPOTENCY_KEY_REQUIRED on a cost-1 route without a UUID', async () => {
  const handler = route({ cost: 1 });
  const missing = await call(handler, { headers: { authorization: session() }, body: {} });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.body.code, 'IDEMPOTENCY_KEY_REQUIRED');

  const ok = await call(handler, { headers: { authorization: session(), 'idempotency-key': randomUUID() }, body: {} });
  assert.equal(ok.statusCode, 200);
});

guarded('validation errors pass through with their status, code and message', async () => {
  const handler = route({ validate: () => ({ error: { status: 400, code: 'INVALID_INPUT', message: 'Campo ausente.' } }) });
  const res = await call(handler, { headers: { authorization: session() }, body: {} });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { code: 'INVALID_INPUT', message: 'Campo ausente.' });
});

guarded('the dev bypass skips session and credits but not burst limits', async () => {
  const handler = route({ cost: 1, burstPerMinute: 1 });
  const ok = await call(handler, { body: {} });
  assert.equal(ok.statusCode, 200);
  const limited = await call(handler, { body: {} });
  assert.equal(limited.body.code, 'RATE_LIMITED');
}, { JOVI_LOCAL_DEV_BYPASS: 'true' });

guarded('the dev bypass is ignored on Vercel, which also fails closed when misconfigured', async () => {
  const res = await call(route(), { body: {} });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'SERVER_MISCONFIGURED');
}, { JOVI_LOCAL_DEV_BYPASS: 'true', VERCEL: '1' });

guarded('provider auth errors become BYOK_REJECTED with a user key and AI_UNAVAILABLE without', async () => {
  const handler = route({ run: async () => { throw Object.assign(new Error('x'), { code: 'AI_PROVIDER_AUTH', status: 401 }); } });
  const withKey = await call(handler, { headers: { authorization: session(), 'x-ai-provider': 'minimax', 'x-ai-key': MINIMAX_KEY }, body: {} });
  assert.equal(withKey.statusCode, 422);
  assert.equal(withKey.body.code, 'BYOK_REJECTED');

  const serverKey = await call(handler, { headers: { authorization: session() }, body: {} });
  assert.equal(serverKey.statusCode, 502);
  assert.equal(serverKey.body.code, 'AI_UNAVAILABLE');
});
