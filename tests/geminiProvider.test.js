import test from 'node:test';
import assert from 'node:assert/strict';
import { complete, speak, transcribe, validateKey } from '../api/_lib/ai/providers/gemini.js';
import { withEnv } from './helpers/http.js';

const ORIGINAL_FETCH = globalThis.fetch;
const ENV = {
  GEMINI_API_KEY: 'server-gemini-key',
  GEMINI_CHAT_MODEL: undefined,
  GEMINI_TTS_MODEL: undefined,
  GEMINI_STT_MODEL: undefined,
  GEMINI_VOICE_A: undefined,
};

function textPayload(text) {
  return { status: 'completed', steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'text', text }] }] };
}

function capture(responder) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options, body: options.body ? JSON.parse(options.body) : null });
    return responder(String(url), options);
  };
  return calls;
}

function geminiTest(name, fn) {
  test(name, () => withEnv(ENV, async () => {
    try {
      await fn();
    } finally {
      globalThis.fetch = ORIGINAL_FETCH;
    }
  }));
}

geminiTest('complete sends text to the Interactions API and joins model_output text', async () => {
  const calls = capture(() => new Response(JSON.stringify(textPayload('{"ok":true}')), { status: 200 }));
  const result = await complete({ messages: [{ role: 'user', content: 'Explique a fotossíntese.' }], maxTokens: 900 });

  assert.deepEqual(result, { text: '{"ok":true}', model: 'gemini-3.5-flash-lite', provider: 'gemini' });
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'server-gemini-key');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(calls[0].body, {
    model: 'gemini-3.5-flash-lite',
    input: [{ type: 'text', text: 'Explique a fotossíntese.' }],
    store: false,
    response_format: { type: 'text', mime_type: 'application/json' },
    generation_config: { max_output_tokens: 900, temperature: 0.2, thinking_level: 'minimal' },
  });
});

geminiTest('complete maps image_url data URLs to inline image input', async () => {
  const calls = capture(() => new Response(JSON.stringify(textPayload('{}')), { status: 200 }));
  await complete({ messages: [{ role: 'user', content: [{ type: 'text', text: 'Analise.' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/AAAA' } }] }] });
  assert.deepEqual(calls[0].body.input, [
    { type: 'text', text: 'Analise.' },
    { type: 'image', data: '/9j/AAAA', mime_type: 'image/jpeg' },
  ]);
});

geminiTest('complete with no text output → AI_EMPTY_RESPONSE', async () => {
  capture(() => new Response(JSON.stringify({ status: 'completed', steps: [] }), { status: 200 }));
  await assert.rejects(complete({ messages: [{ role: 'user', content: 'x' }] }), { code: 'AI_EMPTY_RESPONSE' });
});

geminiTest('speak requests mp3 with the role voice, style and pt-BR, and parses audio', async () => {
  const audio = Buffer.from('ID3-mp3-bytes').toString('base64');
  const calls = capture(() => new Response(JSON.stringify({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'audio', data: audio, mime_type: 'audio/mp3' }] }] }), { status: 200 }));
  const result = await speak({ text: 'Olá, turma.', voice: 'A' });

  assert.equal(result.mimeType, 'audio/mpeg');
  assert.equal(result.buffer.toString(), 'ID3-mp3-bytes');
  const body = calls[0].body;
  assert.equal(body.model, 'gemini-3.8-flash-lite-tts');
  assert.equal(body.store, false);
  assert.deepEqual(body.response_format, { type: 'audio', mime_type: 'audio/mp3', bit_rate: 64000 });
  assert.deepEqual(body.generation_config, { speech_config: [{ voice: 'Aoede', language: 'pt-BR' }] });
  assert.equal(body.input[0].type, 'user_input');
  assert.equal(body.input[0].content[0].text, 'Olá, turma.');
  assert.equal(body.input[0].content[0].annotations[0].type, 'speech_metadata');
  assert.match(body.input[0].content[0].annotations[0].style, /apresentadora curiosa/);
});

geminiTest('transcribe sends the prompt and base64 audio with a normalized mime', async () => {
  const calls = capture(() => new Response(JSON.stringify(textPayload(' fala transcrita ')), { status: 200 }));
  const result = await transcribe({ buffer: Buffer.from('RIFFxxxxWAVE'), mimeType: 'audio/x-wav' });

  assert.equal(result.text, 'fala transcrita');
  const body = calls[0].body;
  assert.equal(body.model, 'gemini-3.5-flash-lite');
  assert.match(body.input[0].text, /Transcreva a fala/);
  assert.deepEqual(body.input[1], { type: 'audio', data: Buffer.from('RIFFxxxxWAVE').toString('base64'), mime_type: 'audio/wav' });
  assert.deepEqual(body.response_format, { type: 'text', mime_type: 'text/plain' });
  assert.deepEqual(body.generation_config, { max_output_tokens: 1000, thinking_level: 'minimal' });
});

geminiTest('HTTP 429 → AI_RATE_LIMITED, 401/403 → AI_PROVIDER_AUTH, 500 → AI_PROVIDER_ERROR', async () => {
  for (const [status, code] of [[429, 'AI_RATE_LIMITED'], [401, 'AI_PROVIDER_AUTH'], [403, 'AI_PROVIDER_AUTH'], [500, 'AI_PROVIDER_ERROR']]) {
    capture(() => new Response(JSON.stringify({ error: { message: 'secret details' } }), { status }));
    await assert.rejects(complete({ messages: [{ role: 'user', content: 'x' }] }), (error) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /secret details/);
      return true;
    });
  }
});

geminiTest('an aborted request → AI_TIMEOUT', async () => {
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  await assert.rejects(complete({ messages: [{ role: 'user', content: 'x' }], timeoutMs: 5 }), { code: 'AI_TIMEOUT' });
});

geminiTest('credentials override the env key', async () => {
  const calls = capture(() => new Response(JSON.stringify(textPayload('{}')), { status: 200 }));
  await complete({ messages: [{ role: 'user', content: 'x' }], credentials: { apiKey: 'user-gemini-key' } });
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'user-gemini-key');
});

geminiTest('validateKey lists one model; 400/401/403 → AI_PROVIDER_AUTH', async () => {
  const calls = capture(() => new Response('{}', { status: 200 }));
  assert.deepEqual(await validateKey({ apiKey: 'user-gemini-key' }), { ok: true });
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'user-gemini-key');

  for (const status of [400, 401, 403]) {
    capture(() => new Response('{}', { status }));
    await assert.rejects(validateKey({ apiKey: 'bad' }), { code: 'AI_PROVIDER_AUTH' });
  }
});
