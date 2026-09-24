import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import analyzeImage from '../api/analyze-image.js';
import me from '../api/me.js';
import transcribe from '../api/transcribe.js';
import tts from '../api/tts.js';
import { defineRoute } from '../api/_lib/guard.js';
import { issueSession } from '../api/_lib/session.js';
import { getStore, resetMemoryStore } from '../api/_lib/store.js';
import { BASE_ENV, makeReq, makeRes, withEnv } from './helpers/http.js';

const MINIMAX_KEY = 'mm-test-key-abcdefghijklmnopqrstuvwxyz';
const ORIGINAL_FETCH = globalThis.fetch;

function headersFor(sub, extra = {}) {
  return { authorization: `Bearer ${issueSession({ sub, email: `${sub}@example.com` })}`, 'idempotency-key': randomUUID(), ...extra };
}

async function call(handler, reqOptions) {
  const res = makeRes();
  await handler(makeReq(reqOptions), res);
  return res;
}

const ASK = { action: 'ask', question: 'O que é fotossíntese?' };

function creditsTest(name, fn, env = {}) {
  test(name, () => withEnv({ ...BASE_ENV, JOVI_LENS_DEMO_MODE: 'true', ...env }, async () => {
    resetMemoryStore();
    try {
      await fn();
    } finally {
      globalThis.fetch = ORIGINAL_FETCH;
    }
  }));
}

creditsTest('a new user has 3 credits and the 4th analyze call is 402', async () => {
  const meRes = await call(me, { method: 'GET', url: '/api/me', headers: headersFor('new-user') });
  assert.equal(meRes.statusCode, 200);
  assert.equal(meRes.body.creditsRemaining, 3);
  assert.equal(meRes.body.creditsTotal, 3);
  assert.equal(meRes.headers['x-jovi-credits-remaining'], '3');

  for (const expected of ['2', '1', '0']) {
    const res = await call(analyzeImage, { headers: headersFor('new-user'), body: ASK });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-jovi-credits-remaining'], expected);
  }
  const exhausted = await call(analyzeImage, { headers: headersFor('new-user'), body: ASK });
  assert.equal(exhausted.statusCode, 402);
  assert.equal(exhausted.body.code, 'CREDITS_EXHAUSTED');
});

creditsTest('a failed run refunds the credit and frees the idempotency key', async () => {
  const headers = headersFor('refund-user');
  const failed = await call(analyzeImage, { headers, body: ASK });
  assert.equal(failed.statusCode, 503);
  assert.equal(failed.body.code, 'AI_NOT_CONFIGURED');
  assert.equal(await getStore().getCredits('refund-user', 3), 3);
  assert.equal(await getStore().get(`idem:refund-user:${headers['idempotency-key']}`), null);
}, { JOVI_LENS_DEMO_MODE: undefined, AI_PROVIDER: undefined });

creditsTest('replaying an Idempotency-Key returns the stored body without a second charge', async () => {
  const headers = headersFor('replay-user');
  const first = await call(analyzeImage, { headers, body: ASK });
  const replay = await call(analyzeImage, { headers, body: ASK });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.headers['x-jovi-idempotent-replay'], 'true');
  assert.deepEqual(replay.body, first.body);
  assert.equal(await getStore().getCredits('replay-user', 3), 2);
});

creditsTest('a concurrent duplicate request gets 409 REQUEST_IN_PROGRESS', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const slow = defineRoute({ method: 'POST', scope: 'slow', burstPerMinute: 100, auth: 'session', cost: 1, byok: 'optional', run: async () => { await gate; return { ok: true }; } });
  const headers = headersFor('dup-user');
  const firstRes = makeRes();
  const first = slow(makeReq({ headers, body: {} }), firstRes);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const duplicate = await call(slow, { headers, body: {} });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.body.code, 'REQUEST_IN_PROGRESS');
  release();
  await first;
  assert.equal(firstRes.statusCode, 200);
  assert.equal(await getStore().getCredits('dup-user', 3), 2);
});

creditsTest('a BYOK call does not charge', async () => {
  const byokRoute = defineRoute({ method: 'POST', scope: 'byok-charge', burstPerMinute: 100, auth: 'session', cost: 1, byok: 'optional', run: async (_input, ctx) => ({ usedKey: Boolean(ctx.byok) }) });
  const res = await call(byokRoute, { headers: headersFor('byok-user', { 'x-ai-provider': 'minimax', 'x-ai-key': MINIMAX_KEY }), body: {} });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.usedKey, true);
  assert.equal(res.headers['x-jovi-credits-remaining'], undefined);
  assert.equal(await getStore().getCredits('byok-user', 3), 3);
});

creditsTest('tts and transcribe never charge', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { audio: Buffer.from('mp3').toString('hex') }, base_resp: { status_code: 0 } }), { status: 200 });
  const spoken = await call(tts, { url: '/api/tts', headers: headersFor('audio-user', { 'x-ai-provider': 'minimax', 'x-ai-key': MINIMAX_KEY }), body: { text: 'Olá, turma.' } });
  assert.equal(spoken.statusCode, 200);
  assert.equal(spoken.body.parts.length, 1);

  const heard = await call(transcribe, { url: '/api/transcribe', headers: headersFor('audio-user'), body: { audio: 'GkXfo0AAAAAAAAAA', mimeType: 'audio/webm' } });
  assert.equal(heard.statusCode, 403);
  assert.equal(heard.body.code, 'BYOK_REQUIRED');

  assert.equal(await getStore().getCredits('audio-user', 3), 3);
}, { JOVI_LENS_DEMO_MODE: undefined, AI_PROVIDER: 'minimax', MINIMAX_API_KEY: 'server-minimax-key-not-used-0000' });
