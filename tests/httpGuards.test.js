import test from 'node:test';
import assert from 'node:assert/strict';
import { isDailyLimited, isRateLimited } from '../api/_lib/http.js';
import tts from '../api/tts.js';
import analyzeImage from '../api/analyze-image.js';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function mockReq({ method = 'POST', body = {}, headers = {}, ip = 'guard-test' } = {}) {
  return { method, body, headers: { 'content-type': 'application/json', ...headers }, ip };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('valid requests never consume the API-key failure budget', async () => {
  // Regression: every request used to count toward a shared 20/min "apikey"
  // bucket, so the 21st legitimate call to ANY endpoint came back as
  // 401 "Acesso não autorizado" even with no JOVI_API_KEY configured.
  try {
    delete process.env.JOVI_API_KEY;
    delete process.env.AI_PROVIDER;
    const statuses = [];
    for (let i = 0; i < 30; i += 1) {
      const res = mockRes();
      await tts(mockReq({ body: { text: 'oi' }, ip: 'guard-valid' }), res);
      statuses.push(res.statusCode);
    }
    assert.ok(!statuses.includes(401), `unexpected 401 in ${statuses.join(',')}`);
  } finally {
    restoreEnv();
  }
});

test('repeated wrong API keys are throttled with 429, not an endless 401 loop', async () => {
  try {
    process.env.JOVI_API_KEY = 'segredo-correto';
    const statuses = [];
    for (let i = 0; i < 15; i += 1) {
      const res = mockRes();
      await tts(mockReq({ body: { text: 'oi' }, headers: { 'x-api-key': 'errado' }, ip: 'guard-bad-key' }), res);
      statuses.push(res.statusCode);
    }
    assert.equal(statuses[0], 401);
    assert.equal(statuses.at(-1), 429);
  } finally {
    restoreEnv();
  }
});

test('handlers answer 405 for a non-POST method', async () => {
  const res = mockRes();
  await tts(mockReq({ method: 'GET', ip: 'guard-405' }), res);
  assert.equal(res.statusCode, 405);
});

test('daily buckets survive an eviction triggered by a short-window call', () => {
  // Regression: eviction used the CURRENT call's window, so a 60 s call
  // deleted every daily bucket older than 60 s — silently resetting quotas.
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    const victim = mockReq({ ip: 'daily-victim' });
    for (let i = 0; i < 3; i += 1) isDailyLimited(victim, { scope: 'evict-test', max: 3 });
    assert.equal(isDailyLimited(victim, { scope: 'evict-test', max: 3 }), true);
    now += 120_000;
    for (let i = 0; i < 510; i += 1) isRateLimited(mockReq({ ip: `evict-${i}` }), { scope: 'evict-burst', windowMs: 60_000 });
    assert.equal(isDailyLimited(victim, { scope: 'evict-test', max: 3 }), true);
  } finally {
    Date.now = realNow;
  }
});

test('follow-up study actions work from context alone, without re-sending the image', async () => {
  try {
    delete process.env.JOVI_API_KEY;
    process.env.JOVI_LENS_DEMO_MODE = 'true';
    const res = mockRes();
    await analyzeImage(mockReq({ body: { action: 'explain', context: { title: 'Pêndulo', text: 'Período depende do comprimento.' } }, ip: 'guard-followup' }), res);
    assert.equal(res.statusCode, 200);
    const missing = mockRes();
    await analyzeImage(mockReq({ body: { action: 'explain' }, ip: 'guard-followup' }), missing);
    assert.equal(missing.statusCode, 400);
  } finally {
    restoreEnv();
  }
});

test('handlers refuse non-JSON bodies themselves, wherever they are deployed', async () => {
  const res = mockRes();
  await tts(mockReq({ body: { text: 'oi' }, headers: { 'content-type': 'text/plain;application/json' }, ip: 'guard-ctype' }), res);
  assert.equal(res.statusCode, 415);
});

test('IPv6 clients share one bucket per /64 so rotating addresses does not reset limits', async () => {
  try {
    delete process.env.JOVI_API_KEY;
    delete process.env.AI_PROVIDER;
    const statuses = [];
    for (let i = 0; i < 70; i += 1) {
      const res = mockRes();
      await tts(mockReq({ body: { text: 'oi' }, ip: `2001:db8:1:2::${i.toString(16)}` }), res);
      statuses.push(res.statusCode);
    }
    assert.ok(statuses.includes(429), 'the /64 should hit the 60/min TTS limit');
  } finally {
    restoreEnv();
  }
});

test('a Google id_token is exchanged for a session only once (replay)', async () => {
  const { default: googleAuth } = await import('../api/auth/google.js');
  const realFetch = globalThis.fetch;
  try {
    delete process.env.JOVI_API_KEY;
    process.env.GOOGLE_CLIENT_ID = 'client-web';
    const exp = Math.floor(Date.now() / 1000) + 3600;
    globalThis.fetch = async () => new Response(JSON.stringify({ aud: 'client-web', iss: 'https://accounts.google.com', email_verified: 'true', exp: String(exp), sub: '123', email: 'a@b.c', nonce: 'n1' }), { status: 200 });
    const credential = 'x'.repeat(40);
    const first = mockRes();
    await googleAuth(mockReq({ body: { credential, nonce: 'n1' }, ip: 'google-replay' }), first);
    assert.equal(first.statusCode, 200);
    const replay = mockRes();
    await googleAuth(mockReq({ body: { credential }, ip: 'google-replay' }), replay);
    assert.equal(replay.statusCode, 401);
    const wrongNonce = mockRes();
    await googleAuth(mockReq({ body: { credential: 'y'.repeat(40), nonce: 'outro' }, ip: 'google-replay' }), wrongNonce);
    assert.equal(wrongNonce.statusCode, 401);
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv();
  }
});

test('a follow-up with context does not turn into a vision call even if the image is sent', async () => {
  const realFetch = globalThis.fetch;
  const sent = [];
  try {
    delete process.env.JOVI_API_KEY;
    delete process.env.JOVI_LENS_DEMO_MODE;
    Object.assign(process.env, { AI_PROVIDER: 'azure-openai', AZURE_OPENAI_ENDPOINT: 'https://azure.test', AZURE_OPENAI_API_KEY: 'k', AZURE_OPENAI_DEPLOYMENT: 'd' });
    globalThis.fetch = async (url, init) => {
      sent.push(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"title":"t","learning":{}}' } }] }), { status: 200 });
    };
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString('base64');
    const followUp = mockRes();
    await analyzeImage(mockReq({ body: { action: 'quiz', image: jpeg, mimeType: 'image/jpeg', context: { title: 'x', text: 'y' } }, ip: 'guard-drop-image' }), followUp);
    assert.equal(followUp.statusCode, 200);
    assert.equal(sent.at(-1).includes('image_url'), false, 'follow-up must be a text call');
    // Positive control: the initial analysis does send the image.
    const analyze = mockRes();
    await analyzeImage(mockReq({ body: { action: 'analyze', image: jpeg, mimeType: 'image/jpeg' }, ip: 'guard-drop-image' }), analyze);
    assert.equal(sent.at(-1).includes('image_url'), true);
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv();
  }
});

test('two spellings of addresses in the same IPv6 /64 share a bucket', async () => {
  // Regression: keys were cut from the compressed text, so 2001:db8:1::5 and
  // 2001:db8:1:0:5::1 (same /64) got different buckets.
  const { clientKey } = await import('../api/_lib/http.js');
  assert.equal(clientKey({ headers: {}, ip: '2001:db8:1::5' }), clientKey({ headers: {}, ip: '2001:db8:1:0:5::1' }));
  assert.notEqual(clientKey({ headers: {}, ip: '2001:db8:1::5' }), clientKey({ headers: {}, ip: '2001:db8:2::5' }));
  assert.equal(clientKey({ headers: {}, ip: '::ffff:10.0.0.1' }), '::ffff:10.0.0.1');
});

test('a flood of new client keys cannot evict daily buckets', () => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    const victim = mockReq({ ip: 'daily-cap-victim' });
    for (let i = 0; i < 3; i += 1) isDailyLimited(victim, { scope: 'cap-test', max: 3 });
    assert.equal(isDailyLimited(victim, { scope: 'cap-test', max: 3 }), true);
    for (let i = 0; i < 21_000; i += 1) isRateLimited(mockReq({ ip: `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}` }), { scope: 'cap-flood' });
    now += 61_000;
    isRateLimited(mockReq({ ip: '10.250.0.1' }), { scope: 'cap-flood' });
    assert.equal(isDailyLimited(victim, { scope: 'cap-test', max: 3 }), true);
  } finally {
    Date.now = realNow;
  }
});
