import test from 'node:test';
import assert from 'node:assert/strict';
import { speak, transcribe } from '../api/_lib/ai/providers/azureOpenAI.js';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function restoreGlobals() {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
}

test('Azure transcription sends the required model multipart field', async () => {
  try {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://jovi-test.openai.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT = 'gpt-4o-mini-transcribe';
    process.env.AZURE_OPENAI_TRANSCRIBE_API_VERSION = '2025-04-01-preview';
    delete process.env.AZURE_OPENAI_TRANSCRIBE_MODEL;

    let capturedUrl = '';
    let capturedBody;
    globalThis.fetch = async (url, options) => {
      capturedUrl = String(url);
      capturedBody = options.body;
      return new Response(JSON.stringify({ text: 'fala transcrita' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const result = await transcribe({
      buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      mimeType: 'audio/webm',
      filename: 'voice.webm',
    });

    assert.equal(result.text, 'fala transcrita');
    assert.match(capturedUrl, /\/openai\/deployments\/gpt-4o-mini-transcribe\/audio\/transcriptions/);
    assert.equal(capturedBody.get('model'), 'gpt-4o-mini-transcribe');
    assert.equal(capturedBody.get('response_format'), 'json');
    assert.equal(capturedBody.get('file').name, 'voice.webm');
  } finally {
    restoreGlobals();
  }
});

test('Azure transcription allows a custom model id when deployment is aliased', async () => {
  try {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://jovi-test.openai.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT = 'transcribe-prod';
    process.env.AZURE_OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';

    let capturedBody;
    globalThis.fetch = async (url, options) => {
      capturedBody = options.body;
      return new Response(JSON.stringify({ text: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    await transcribe({ buffer: Buffer.from('RIFFxxxxWAVE'), mimeType: 'audio/wav', filename: 'voice.wav' });

    assert.equal(capturedBody.get('model'), 'gpt-4o-mini-transcribe');
  } finally {
    restoreGlobals();
  }
});

test('Azure speech sends role voice and natural style instructions', async () => {
  try {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://jovi-test.openai.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_TTS_DEPLOYMENT = 'gpt-4o-mini-tts';
    process.env.AZURE_OPENAI_TTS_VOICE_A = 'nova';

    let capturedBody;
    globalThis.fetch = async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return new Response(Buffer.from('mp3-bytes'), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    };

    const result = await speak({ text: 'Olá, vamos revisar História?', voice: 'A' });

    assert.equal(result.provider, 'azure-openai');
    assert.equal(capturedBody.model, 'gpt-4o-mini-tts');
    assert.equal(capturedBody.voice, 'nova');
    assert.equal(capturedBody.response_format, 'mp3');
    assert.match(capturedBody.instructions, /português do Brasil/);
    assert.match(capturedBody.instructions, /conversa/);
  } finally {
    restoreGlobals();
  }
});
