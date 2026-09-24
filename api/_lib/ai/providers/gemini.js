import { abortableTimeout, dataUrlToBase64, emptyResponseError, httpError, notConfigured, ROLE_STYLE, timeoutError } from './shared.js';

// Google Gemini through the Interactions API. Serves the free credits with the
// server key (GEMINI_API_KEY) and BYOK calls with the user's key.
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_CHAT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
const DEFAULT_STT_MODEL = 'gemini-3.5-flash-lite';
const TRANSCRIBE_PROMPT = 'Transcreva a fala deste áudio em português do Brasil. Responda somente com a transcrição, sem comentários.';

export const capabilities = { chat: true, vision: true, tts: true, stt: true };
export const ttsChunkLimit = 2000;

function apiKey(credentials) {
  return credentials?.apiKey || process.env.GEMINI_API_KEY;
}

function roleVoice(voice) {
  const voices = {
    A: process.env.GEMINI_VOICE_A || 'Aoede',
    B: process.env.GEMINI_VOICE_B || 'Charon',
    narrator: process.env.GEMINI_VOICE_NARRATOR || 'Kore',
    coach: process.env.GEMINI_VOICE_COACH || 'Leda',
    feedback: process.env.GEMINI_VOICE_FEEDBACK || 'Orus',
  };
  return voices[voice] || voices.narrator;
}

export function isConfigured(_capability, credentials) {
  return Boolean(apiKey(credentials));
}

async function interact(body, { credentials, timeoutMs, errorMessage, timeoutMessage }) {
  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}/interactions`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'x-goog-api-key': apiKey(credentials), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(errorMessage, response.status);
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError(timeoutMessage);
    throw error;
  } finally {
    clear();
  }
}

function outputText(payload) {
  if (payload?.status !== 'completed') return '';
  return (Array.isArray(payload.steps) ? payload.steps : [])
    .filter((step) => step?.type === 'model_output')
    .flatMap((step) => (Array.isArray(step.content) ? step.content : []))
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('');
}

// OpenAI-style message content (what service.js builds) → Interactions input.
function toInput(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return (Array.isArray(content) ? content : []).map((part) => {
    if (part?.type === 'image_url') {
      const { mediaType, data } = dataUrlToBase64(part.image_url?.url);
      return { type: 'image', data, mime_type: mediaType };
    }
    return { type: 'text', text: String(part?.text ?? '') };
  });
}

export async function complete({ messages, maxTokens = 1400, timeoutMs = 22000, credentials }) {
  if (!isConfigured('chat', credentials)) throw notConfigured('Gemini não está configurado.');
  const model = process.env.GEMINI_CHAT_MODEL || DEFAULT_CHAT_MODEL;
  const payload = await interact({
    model,
    input: toInput(messages?.[0]?.content),
    store: false,
    response_format: { type: 'text', mime_type: 'application/json' },
    generation_config: { max_output_tokens: maxTokens, temperature: 0.2, thinking_level: 'minimal' },
  }, { credentials, timeoutMs, errorMessage: 'Falha no serviço de IA.', timeoutMessage: 'Tempo limite da análise excedido.' });
  const text = outputText(payload);
  if (!text) throw emptyResponseError('A IA não retornou conteúdo.');
  return { text, model, provider: 'gemini' };
}

export async function speak({ text, voice = 'narrator', timeoutMs = 30000, credentials }) {
  if (!isConfigured('tts', credentials)) throw notConfigured('TTS do Gemini não está configurado.');
  const model = process.env.GEMINI_TTS_MODEL || DEFAULT_TTS_MODEL;
  const payload = await interact({
    model,
    store: false,
    input: [{
      type: 'user_input',
      content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: ROLE_STYLE[voice] || ROLE_STYLE.narrator }] }],
    }],
    response_format: { type: 'audio', mime_type: 'audio/mp3', bit_rate: 64000 },
    generation_config: { speech_config: [{ voice: roleVoice(voice), language: 'pt-BR' }] },
  }, { credentials, timeoutMs, errorMessage: 'Falha ao gerar áudio.', timeoutMessage: 'Tempo limite do áudio excedido.' });

  const audio = (Array.isArray(payload?.steps) ? payload.steps : [])
    .flatMap((step) => (Array.isArray(step?.content) ? step.content : []))
    .find((item) => item?.type === 'audio' && item.data);
  if (!audio) throw emptyResponseError('A IA não retornou áudio.');
  return {
    buffer: Buffer.from(audio.data, 'base64'),
    mimeType: audio.mime_type === 'audio/mp3' ? 'audio/mpeg' : audio.mime_type,
    model,
    provider: 'gemini',
  };
}

const TRANSCRIBE_MIME = {
  'audio/m4a': 'audio/m4a',
  'audio/mp4': 'audio/mp4',
  'audio/webm': 'audio/webm',
  'audio/ogg': 'audio/ogg',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/mp3': 'audio/mp3',
  'audio/mpeg': 'audio/mp3',
};

export async function transcribe({ buffer, mimeType = 'audio/webm', timeoutMs = 30000, credentials }) {
  if (!isConfigured('stt', credentials)) throw notConfigured('Transcrição do Gemini não está configurada.');
  const model = process.env.GEMINI_STT_MODEL || DEFAULT_STT_MODEL;
  const payload = await interact({
    model,
    store: false,
    input: [
      { type: 'text', text: TRANSCRIBE_PROMPT },
      { type: 'audio', data: Buffer.from(buffer).toString('base64'), mime_type: TRANSCRIBE_MIME[mimeType] || 'audio/webm' },
    ],
    response_format: { type: 'text', mime_type: 'text/plain' },
    generation_config: { max_output_tokens: 1000, thinking_level: 'minimal' },
  }, { credentials, timeoutMs, errorMessage: 'Falha ao transcrever o áudio.', timeoutMessage: 'Tempo limite da transcrição excedido.' });
  const text = outputText(payload).trim();
  if (!text) throw emptyResponseError('Nenhuma fala reconhecida.');
  return { text, model, provider: 'gemini' };
}

export async function validateKey(credentials, { timeoutMs = 15000 } = {}) {
  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}/models?pageSize=1`, {
      method: 'GET',
      redirect: 'error',
      headers: { 'x-goog-api-key': apiKey(credentials) },
      signal: controller.signal,
    });
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw Object.assign(new Error('Chave recusada pelo provedor.'), { code: 'AI_PROVIDER_AUTH', status: response.status });
    }
    if (!response.ok) throw httpError('Falha ao validar a chave.', response.status);
    return { ok: true };
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError('Tempo limite da validação excedido.');
    throw error;
  } finally {
    clear();
  }
}
