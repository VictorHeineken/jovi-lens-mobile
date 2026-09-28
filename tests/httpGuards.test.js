import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ipKey, isJsonContentType } from '../api/_lib/http.js';
import { clientIp } from '../api/_lib/guard.js';
import { issueSession } from '../api/_lib/session.js';
import { resetMemoryStore } from '../api/_lib/store.js';
import tts from '../api/tts.js';
import analyzeImage from '../api/analyze-image.js';
import { BASE_ENV, makeReq, makeRes, withEnv } from './helpers/http.js';

const ORIGINAL_FETCH = globalThis.fetch;

function signedHeaders(sub, extra = {}) {
  return { authorization: `Bearer ${issueSession({ sub, email: `${sub}@example.com` })}`, 'idempotency-key': randomUUID(), ...extra };
}

async function call(handler, reqOptions) {
  const res = makeRes();
  await handler(makeReq(reqOptions), res);
  return res;
}

function guardTest(name, fn, env = {}) {
  test(name, () => withEnv({ ...BASE_ENV, ...env }, async () => {
    resetMemoryStore();
    try {
      await fn();
    } finally {
      globalThis.fetch = ORIGINAL_FETCH;
    }
  }));
}

guardTest('handlers answer 405 for a non-POST method', async () => {
  const res = await call(tts, { method: 'GET', url: '/api/tts' });
  assert.equal(res.statusCode, 405);
});

guardTest('handlers refuse non-JSON bodies themselves, wherever they are deployed', async () => {
  // "text/plain;application/json" contains the substring but is a
  // CORS-safelisted type a browser sends cross-site without a preflight.
  const res = await call(tts, { url: '/api/tts', headers: { 'content-type': 'text/plain;application/json' }, body: { text: 'oi' } });
  assert.equal(res.statusCode, 415);
  assert.equal(isJsonContentType('application/json; charset=utf-8'), true);
  assert.equal(isJsonContentType('text/plain;application/json'), false);
});

guardTest('follow-up study actions work from context alone, without re-sending the image', async () => {
  const res = await call(analyzeImage, { url: '/api/analyze-image', headers: signedHeaders('followup'), body: { action: 'explain', context: { title: 'Pêndulo', text: 'Período depende do comprimento.' } } });
  assert.equal(res.statusCode, 200);
  const missing = await call(analyzeImage, { url: '/api/analyze-image', headers: signedHeaders('followup'), body: { action: 'explain' } });
  assert.equal(missing.statusCode, 400);
}, { JOVI_LENS_DEMO_MODE: 'true' });

guardTest('a follow-up with context does not turn into a vision call even if the image is sent', async () => {
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push(String(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"title":"t","learning":{}}' } }] }), { status: 200 });
  };
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString('base64');
  const followUp = await call(analyzeImage, { url: '/api/analyze-image', headers: signedHeaders('drop-image'), body: { action: 'quiz', image: jpeg, mimeType: 'image/jpeg', context: { title: 'x', text: 'y' } } });
  assert.equal(followUp.statusCode, 200);
  assert.equal(sent.at(-1).includes('image_url'), false, 'follow-up must be a text call');
  // Positive control: the initial analysis does send the image.
  await call(analyzeImage, { url: '/api/analyze-image', headers: signedHeaders('drop-image'), body: { action: 'analyze', image: jpeg, mimeType: 'image/jpeg' } });
  assert.equal(sent.at(-1).includes('image_url'), true);
}, { AI_PROVIDER: 'azure-openai', AZURE_OPENAI_ENDPOINT: 'https://azure.test', AZURE_OPENAI_API_KEY: 'k', AZURE_OPENAI_DEPLOYMENT: 'd' });

test('IPv6 clients are keyed per /64 so rotating addresses does not reset limits', () => {
  // Regression: keys were cut from the compressed text, so 2001:db8:1::5 and
  // 2001:db8:1:0:5::1 (same /64) got different buckets.
  assert.equal(ipKey('2001:db8:1::5'), ipKey('2001:db8:1:0:5::1'));
  assert.equal(ipKey('2001:db8:1:2::1'), ipKey('2001:db8:1:2::ff'));
  assert.notEqual(ipKey('2001:db8:1::5'), ipKey('2001:db8:2::5'));
  assert.equal(ipKey('::ffff:10.0.0.1'), '::ffff:10.0.0.1');
  assert.equal(ipKey('10.0.0.1'), '10.0.0.1');
});

test('the guard keys unauthenticated limits on the /64, locally and on Vercel', () => withEnv({ VERCEL: undefined }, () => {
  assert.equal(clientIp({ ip: '2001:db8:1:2::1', headers: {} }), clientIp({ ip: '2001:db8:1:2::abcd', headers: {} }));
  process.env.VERCEL = '1';
  assert.equal(clientIp({ headers: { 'x-real-ip': '2001:db8:1:2::1' } }), clientIp({ headers: { 'x-real-ip': '2001:db8:1:2::abcd' } }));
}));
