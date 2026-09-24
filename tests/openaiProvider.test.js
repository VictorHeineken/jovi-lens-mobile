import test from 'node:test';
import assert from 'node:assert/strict';
import { complete, speak, transcribe, validateKey } from '../api/_lib/ai/providers/openai.js';
import { withEnv } from './helpers/http.js';

const ORIGINAL_FETCH = globalThis.fetch;
const ENV = {
  OPENAI_API_KEY: 'server-openai-key',
  OPENAI_CHAT_MODEL: undefined,
  OPENAI_TTS_MODEL: undefined,
  OPENAI_STT_MODEL: undefined,
  OPENAI_VOICE_A: undefined,
};

function capture(responder) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return responder(String(url), options);
  };
  return calls;
}

function openaiTest(name, fn) {
  test(name, () => withEnv(ENV, async () => {
    try {
      await fn();
    } finally {
      globalThis.fetch = ORIGINAL_FETCH;
    }
  }));
}

openaiTest('complete posts Chat Completions with JSON mode and parses the content', async () => {
  const calls = capture(() => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }));
  const messages = [{ role: 'user', content: [{ type: 'text', text: 'Analise.' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBOR' } }] }];
  const result = await complete({ messages, maxTokens: 800 });

  assert.deepEqual(result, { text: '{"ok":true}', model: 'gpt-6-luna', provider: 'openai' });
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer server-openai-key');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    model: 'gpt-6-luna',
    messages,
    max_completion_tokens: 800,
    reasoning_effort: 'low',
    response_format: { type: 'json_object' },
  });
});

openaiTest('speak requests mp3 with the role voice and style instructions', async () => {
  const calls = capture(() => new Response(Buffer.from('mp3-bytes'), { status: 200 }));
  const result = await speak({ text: 'Olá, turma.', voice: 'A' });

  assert.equal(result.mimeType, 'audio/mpeg');
  assert.equal(result.buffer.toString(), 'mp3-bytes');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/speech');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, 'gpt-4o-mini-tts');
  assert.equal(body.input, 'Olá, turma.');
  assert.equal(body.voice, 'nova');
  assert.equal(body.response_format, 'mp3');
  assert.match(body.instructions, /português do Brasil/);
});

openaiTest('transcribe uploads multipart file, model and response_format', async () => {
  const calls = capture(() => new Response(JSON.stringify({ text: 'fala transcrita' }), { status: 200 }));
  const result = await transcribe({ buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), mimeType: 'audio/webm', filename: 'voice.webm' });

  assert.equal(result.text, 'fala transcrita');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/transcriptions');
  const form = calls[0].options.body;
  assert.equal(form.get('model'), 'gpt-4o-mini-transcribe');
  assert.equal(form.get('response_format'), 'json');
  assert.equal(form.get('file').name, 'voice.webm');
});

openaiTest('HTTP 429 → AI_RATE_LIMITED, 401/403 → AI_PROVIDER_AUTH, 500 → AI_PROVIDER_ERROR', async () => {
  for (const [status, code] of [[429, 'AI_RATE_LIMITED'], [401, 'AI_PROVIDER_AUTH'], [403, 'AI_PROVIDER_AUTH'], [500, 'AI_PROVIDER_ERROR']]) {
    capture(() => new Response(JSON.stringify({ error: { message: 'secret details' } }), { status }));
    await assert.rejects(complete({ messages: [{ role: 'user', content: 'x' }] }), (error) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /secret details/);
      return true;
    });
  }
});

openaiTest('an aborted request → AI_TIMEOUT', async () => {
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  await assert.rejects(speak({ text: 'x', timeoutMs: 5 }), { code: 'AI_TIMEOUT' });
});

openaiTest('credentials override the env key', async () => {
  const calls = capture(() => new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }));
  await complete({ messages: [{ role: 'user', content: 'x' }], credentials: { apiKey: 'user-openai-key' } });
  assert.equal(calls[0].options.headers.Authorization, 'Bearer user-openai-key');
});

openaiTest('validateKey lists models; 401 → AI_PROVIDER_AUTH', async () => {
  const calls = capture(() => new Response('{"data":[]}', { status: 200 }));
  assert.deepEqual(await validateKey({ apiKey: 'user-openai-key' }), { ok: true });
  assert.equal(calls[0].url, 'https://api.openai.com/v1/models');
  assert.equal(calls[0].options.method, 'GET');

  capture(() => new Response('{}', { status: 401 }));
  await assert.rejects(validateKey({ apiKey: 'bad' }), { code: 'AI_PROVIDER_AUTH' });
});
