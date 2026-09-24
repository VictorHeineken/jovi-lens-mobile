import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import analyzeImage from '../api/analyze-image.js';
import authGoogle from '../api/auth/google.js';
import byokValidate from '../api/byok/validate.js';
import me from '../api/me.js';
import subjectAI from '../api/subject-ai.js';
import transcribe from '../api/transcribe.js';
import tts from '../api/tts.js';
import videoRecommendations from '../api/video-recommendations.js';
import { issueSession } from '../api/_lib/session.js';
import { resetMemoryStore } from '../api/_lib/store.js';
import { BASE_ENV, makeReq, makeRes, withEnv } from './helpers/http.js';

const KEY = 'sk-TESTKEY-DO-NOT-LOG-1234567890';
const ORIGINAL_FETCH = globalThis.fetch;

const ROUTES = [
  { name: 'analyze-image', handler: analyzeImage, body: { action: 'ask', question: 'O que é isso?' }, invalid: {} },
  { name: 'subject-ai', handler: subjectAI, body: { action: 'questions', subject: { name: 'História', notes: [{ title: 'Revolução Francesa' }] } }, invalid: {} },
  { name: 'video-recommendations', handler: videoRecommendations, body: { subject: { name: 'Física' } }, invalid: {} },
  { name: 'tts', handler: tts, body: { text: 'Olá, turma.' }, invalid: { text: '' } },
  { name: 'transcribe', handler: transcribe, body: { audio: 'GkXfo0AAAAAAAAAA', mimeType: 'audio/webm' }, invalid: { audio: '' } },
  { name: 'byok/validate', handler: byokValidate, body: {}, invalid: null },
  { name: 'auth/google', handler: authGoogle, body: { credential: 'google-credential-xxxxxxxxxxxxxxxx' }, invalid: { credential: 'x' } },
  { name: 'me', handler: me, method: 'GET', invalid: null },
];

// Every upstream response echoes the key back, the way real providers do in
// their "Incorrect API key provided: sk-..." errors.
function mockProviders(status) {
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (status !== 200) return new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}` } }), { status });
    if (target.includes('tokeninfo')) return new Response(JSON.stringify({ error: `invalid ${KEY}` }), { status: 400 });
    if (target.endsWith('/chat/completions')) return new Response(JSON.stringify({ choices: [{ message: { content: `{"answer":"ok","subject":"História","questions":[],"echo":"${KEY.slice(0, 4)}"}` } }] }), { status: 200 });
    if (target.endsWith('/audio/speech')) return new Response(Buffer.from('mp3'), { status: 200 });
    if (target.endsWith('/audio/transcriptions')) return new Response(JSON.stringify({ text: 'fala' }), { status: 200 });
    return new Response('{"data":[]}', { status: 200 });
  };
}

function captureConsole() {
  const lines = [];
  const originals = { log: console.log, error: console.error, warn: console.warn };
  for (const method of Object.keys(originals)) console[method] = (...args) => lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  return { lines, restore: () => Object.assign(console, originals) };
}

async function callRoute(route, body) {
  const req = makeReq({
    method: route.method || 'POST',
    url: `/api/${route.name}`,
    headers: {
      authorization: `Bearer ${issueSession({ sub: 'redaction-user', email: 'r@example.com' })}`,
      'idempotency-key': randomUUID(),
      'x-ai-provider': 'openai',
      'x-ai-key': KEY,
    },
    body: route.method === 'GET' ? undefined : body,
  });
  const res = makeRes();
  await route.handler(req, res);
  return { req, res };
}

for (const scenario of ['success', 'provider 401', 'provider 500', 'validation error']) {
  test(`BYOK key never appears in logs or responses (${scenario})`, () => withEnv({ ...BASE_ENV, GOOGLE_CLIENT_ID: 'client-id' }, async () => {
    resetMemoryStore();
    mockProviders(scenario === 'provider 401' ? 401 : scenario === 'provider 500' ? 500 : 200);
    const output = captureConsole();
    try {
      for (const route of ROUTES) {
        if (scenario === 'validation error' && !route.invalid) continue;
        const { req, res } = await callRoute(route, scenario === 'validation error' ? route.invalid : route.body);
        assert.equal(req.headers['x-ai-key'], undefined, `${route.name}: header removed`);
        assert.doesNotMatch(JSON.stringify(res.body), /TESTKEY/, `${route.name}: response body`);
        assert.doesNotMatch(JSON.stringify(res.headers), /TESTKEY/, `${route.name}: response headers`);
        if (scenario === 'provider 401' && route.name !== 'me' && route.name !== 'auth/google') {
          assert.equal(res.body.code, 'BYOK_REJECTED', `${route.name}: provider 401 → BYOK_REJECTED`);
        }
      }
    } finally {
      output.restore();
      globalThis.fetch = ORIGINAL_FETCH;
    }
    assert.ok(output.lines.length > 0);
    for (const line of output.lines) assert.doesNotMatch(line, /TESTKEY/);
  }));
}
