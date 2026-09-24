import { abortableTimeout, emptyResponseError, httpError, notConfigured, ROLE_STYLE, timeoutError } from './shared.js';

// api.openai.com directly. BYOK only in production (the user's key), but it
// also works as a server provider with OPENAI_API_KEY for local development.
const BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_CHAT_MODEL = 'gpt-6-luna';
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_STT_MODEL = 'gpt-4o-mini-transcribe';

export const capabilities = { chat: true, vision: true, tts: true, stt: true };
export const ttsChunkLimit = 2000;

function apiKey(credentials) {
  return credentials?.apiKey || process.env.OPENAI_API_KEY;
}

function roleVoice(voice) {
  const voices = {
    A: process.env.OPENAI_VOICE_A || 'nova',
    B: process.env.OPENAI_VOICE_B || 'onyx',
    narrator: process.env.OPENAI_VOICE_NARRATOR || 'alloy',
    coach: process.env.OPENAI_VOICE_COACH || 'nova',
    feedback: process.env.OPENAI_VOICE_FEEDBACK || 'onyx',
  };
  return voices[voice] || voices.narrator;
}

export function isConfigured(_capability, credentials) {
  return Boolean(apiKey(credentials));
}

async function request(path, { method = 'POST', headers = {}, body, credentials, timeoutMs, errorMessage, timeoutMessage }, read) {
  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      redirect: 'error',
      headers: { Authorization: `Bearer ${apiKey(credentials)}`, ...headers },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw httpError(errorMessage, response.status);
    return await read(response);
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError(timeoutMessage);
    throw error;
  } finally {
    clear();
  }
}

export async function complete({ messages, maxTokens = 1400, timeoutMs = 22000, credentials }) {
  if (!isConfigured('chat', credentials)) throw notConfigured('OpenAI não está configurado.');
  const model = process.env.OPENAI_CHAT_MODEL || DEFAULT_CHAT_MODEL;
  const payload = await request('/chat/completions', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_completion_tokens: maxTokens, reasoning_effort: 'low', response_format: { type: 'json_object' } }),
    credentials,
    timeoutMs,
    errorMessage: 'Falha no serviço de IA.',
    timeoutMessage: 'Tempo limite da análise excedido.',
  }, (response) => response.json().catch(() => ({})));
  const text = payload?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') throw emptyResponseError('A IA não retornou conteúdo.');
  return { text, model, provider: 'openai' };
}

export async function speak({ text, voice = 'narrator', timeoutMs = 30000, credentials }) {
  if (!isConfigured('tts', credentials)) throw notConfigured('TTS da OpenAI não está configurado.');
  const model = process.env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL;
  const buffer = await request('/audio/speech', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text, voice: roleVoice(voice), response_format: 'mp3', instructions: ROLE_STYLE[voice] || ROLE_STYLE.narrator }),
    credentials,
    timeoutMs,
    errorMessage: 'Falha ao gerar áudio.',
    timeoutMessage: 'Tempo limite do áudio excedido.',
  }, async (response) => Buffer.from(await response.arrayBuffer()));
  if (!buffer.length) throw emptyResponseError('A IA não retornou áudio.');
  return { buffer, mimeType: 'audio/mpeg', model, provider: 'openai' };
}

export async function transcribe({ buffer, mimeType = 'audio/webm', filename = 'audio.webm', timeoutMs = 30000, credentials }) {
  if (!isConfigured('stt', credentials)) throw notConfigured('Transcrição da OpenAI não está configurada.');
  const model = process.env.OPENAI_STT_MODEL || DEFAULT_STT_MODEL;
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  form.append('model', model);
  form.append('response_format', 'json');
  const payload = await request('/audio/transcriptions', {
    body: form,
    credentials,
    timeoutMs,
    errorMessage: 'Falha ao transcrever o áudio.',
    timeoutMessage: 'Tempo limite da transcrição excedido.',
  }, (response) => response.json().catch(() => ({})));
  const text = typeof payload?.text === 'string' ? payload.text : '';
  if (!text) throw emptyResponseError('Nenhuma fala reconhecida.');
  return { text, model, provider: 'openai' };
}

export async function validateKey(credentials, { timeoutMs = 15000 } = {}) {
  await request('/models', {
    method: 'GET',
    credentials,
    timeoutMs,
    errorMessage: 'Falha ao validar a chave.',
    timeoutMessage: 'Tempo limite da validação excedido.',
  }, async () => null);
  return { ok: true };
}
