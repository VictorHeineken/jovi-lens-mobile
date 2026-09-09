import { abortableTimeout, emptyResponseError, httpError, notConfigured, timeoutError } from './shared.js';

// Verified against https://platform.minimax.io/docs (Sept 2026) — MiniMax's
// chat endpoint is OpenAI-compatible (Bearer auth, choices[0].message.content,
// and the same { type:'image_url', image_url:{url} } content-part shape this
// app already produces), but TTS/video are MiniMax's own REST shape with a
// { base_resp: { status_code, status_msg } } envelope instead of plain HTTP
// error codes, and TTS lives on a separate subdomain from chat/video.
const DEFAULT_BASE_URL = 'https://api.minimax.io';
const DEFAULT_TTS_BASE_URL = 'https://api-uw.minimax.io';

// speech-2.8-hd / MiniMax-Hailuo-02 are current flagship models as of this
// writing — MiniMax's catalog moves fast, override via env if these age out.
const DEFAULT_CHAT_MODEL = 'MiniMax-M3';
const DEFAULT_TTS_MODEL = 'speech-2.8-hd';
const DEFAULT_VIDEO_MODEL = 'MiniMax-Hailuo-02';

// Confirmed live via /v1/get_voice against the account's own key — MiniMax's
// "Portuguese" voice pool has no separate Brazilian/European variant (same
// for language_boost below), so this is the closest the API can target, not
// a guaranteed BR accent.
const ROLE_VOICE = {
  A: process.env.MINIMAX_VOICE_A || 'Portuguese_ChattyGirl',
  B: process.env.MINIMAX_VOICE_B || 'Portuguese_WiseScholar',
  narrator: process.env.MINIMAX_VOICE_NARRATOR || 'Portuguese_Narrator',
};

// T2A allows up to 10,000 chars/request (vs. Azure's 4096) — larger chunks,
// fewer round-trips.
export const ttsChunkLimit = 9500;

export const capabilities = { chat: true, vision: true, tts: true, stt: false, video: true };

function getConfig() {
  return {
    apiKey: process.env.MINIMAX_API_KEY,
    baseUrl: (process.env.MINIMAX_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    ttsBaseUrl: (process.env.MINIMAX_TTS_BASE_URL || DEFAULT_TTS_BASE_URL).replace(/\/$/, ''),
    chatModel: process.env.MINIMAX_CHAT_MODEL || DEFAULT_CHAT_MODEL,
    ttsModel: process.env.MINIMAX_TTS_MODEL || DEFAULT_TTS_MODEL,
    videoModel: process.env.MINIMAX_VIDEO_MODEL || DEFAULT_VIDEO_MODEL,
  };
}

export function isConfigured(capability) {
  const config = getConfig();
  if (capability === 'chat' || capability === 'vision') return Boolean(config.apiKey && config.chatModel);
  if (capability === 'tts') return Boolean(config.apiKey && config.ttsModel);
  if (capability === 'video') return Boolean(config.apiKey && config.videoModel);
  return false;
}

// MiniMax's own (non-OpenAI-compatible) endpoints return HTTP 200 even on
// logical failure — the real result is base_resp.status_code (0 = success).
function checkBaseResp(payload, message) {
  const statusCode = payload?.base_resp?.status_code;
  if (statusCode === undefined || statusCode === 0) return;
  const error = new Error(payload?.base_resp?.status_msg || message);
  error.code = statusCode === 1002 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_ERROR';
  error.status = statusCode;
  throw error;
}

export async function complete({ messages, maxTokens = 1400, timeoutMs = 22000 }) {
  const config = getConfig();
  if (!isConfigured('chat')) throw notConfigured('MiniMax não está configurado.');

  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      // "adaptive" thinking (M3's default) adds ~30s of reasoning-token latency
      // for this kind of vision+structured-JSON task — measured 35.7s with it
      // on vs. 7.8s disabled, for the exact same prompt. Disabling it keeps
      // responses well under the abort timeout without hurting output quality.
      body: JSON.stringify({ model: config.chatModel, messages, temperature: 0.2, max_completion_tokens: maxTokens, thinking: { type: 'disabled' } }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError('Falha no serviço de IA.', response.status);
    checkBaseResp(payload, 'Falha no serviço de IA.');

    const text = payload?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') throw emptyResponseError('A IA não retornou conteúdo.');

    return { text, model: config.chatModel, provider: 'minimax' };
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError('Tempo limite da análise excedido.');
    throw error;
  } finally {
    clear();
  }
}

// --- Text-to-speech (T2A v2) --------------------------------------------
export async function speak({ text, voice = 'narrator', format = 'mp3', timeoutMs = 30000 }) {
  const config = getConfig();
  if (!isConfigured('tts')) throw notConfigured('TTS da MiniMax não está configurado.');
  const voiceId = ROLE_VOICE[voice] || ROLE_VOICE.narrator;

  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const response = await fetch(`${config.ttsBaseUrl}/v1/t2a_v2`, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ttsModel,
        text,
        voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 32000, format, channel: 1 },
        // No Brazilian-specific enum value exists — 'Portuguese' is the
        // closest hint T2A's language_boost accepts.
        language_boost: 'Portuguese',
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError('Falha ao gerar áudio.', response.status);
    checkBaseResp(payload, 'Falha ao gerar áudio.');

    const hex = payload?.data?.audio;
    if (!hex) throw emptyResponseError('A IA não retornou áudio.');
    return { buffer: Buffer.from(hex, 'hex'), mimeType: format === 'mp3' ? 'audio/mpeg' : `audio/${format}`, model: config.ttsModel, provider: 'minimax' };
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError('Tempo limite do áudio excedido.');
    throw error;
  } finally {
    clear();
  }
}

// --- Video generation (Hailuo) — opening clip for the video lesson ------
function requireVideoConfig() {
  const config = getConfig();
  if (!isConfigured('video')) throw notConfigured('Geração de vídeo da MiniMax não está configurada.');
  return config;
}

export async function createVideoJob({ prompt, seconds = 6, timeoutMs = 30000 }) {
  const config = requireVideoConfig();
  // MiniMax only accepts discrete durations (6s or 10s) per current docs,
  // unlike Azure Sora's arbitrary n_seconds — snap to the nearest supported value.
  const duration = seconds > 8 ? 10 : 6;

  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/v1/video_generation`, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.videoModel, prompt, duration }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError('Falha ao iniciar o vídeo.', response.status);
    checkBaseResp(payload, 'Falha ao iniciar o vídeo.');
    if (!payload?.task_id) throw emptyResponseError('A IA não retornou uma tarefa de vídeo.');
    return { id: payload.task_id, status: 'queued' };
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError('Tempo limite ao iniciar o vídeo.');
    throw error;
  } finally {
    clear();
  }
}

const STATUS_MAP = { Success: 'succeeded', Fail: 'failed' };

export async function getVideoJob(jobId, { timeoutMs = 20000 } = {}) {
  const config = requireVideoConfig();
  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const url = `${config.baseUrl}/v1/query/video_generation?task_id=${encodeURIComponent(jobId)}`;
    const response = await fetch(url, { redirect: 'error', headers: { Authorization: `Bearer ${config.apiKey}` }, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError('Falha ao consultar o vídeo.', response.status);
    checkBaseResp(payload, 'Falha ao consultar o vídeo.');
    const status = STATUS_MAP[payload?.status] || 'processing';
    return {
      status,
      generationId: status === 'succeeded' ? String(payload?.file_id ?? '') || null : null,
      failure: status === 'failed' ? (payload?.base_resp?.status_msg || 'Falha na geração do vídeo.') : null,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError('Tempo limite ao consultar o vídeo.');
    throw error;
  } finally {
    clear();
  }
}

// Two hops: files/retrieve gives a presigned download_url (valid ~9h), then
// that URL itself is fetched for the actual bytes.
export async function getVideoContent(generationId, { timeoutMs = 45000 } = {}) {
  const config = requireVideoConfig();
  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const metaUrl = `${config.baseUrl}/v1/files/retrieve?file_id=${encodeURIComponent(generationId)}`;
    const metaResponse = await fetch(metaUrl, { redirect: 'error', headers: { Authorization: `Bearer ${config.apiKey}` }, signal: controller.signal });
    const metaPayload = await metaResponse.json().catch(() => ({}));
    if (!metaResponse.ok) throw httpError('Falha ao localizar o vídeo.', metaResponse.status);
    checkBaseResp(metaPayload, 'Falha ao localizar o vídeo.');
    const downloadUrl = metaPayload?.file?.download_url;
    if (!downloadUrl) throw emptyResponseError('A IA não retornou um link de vídeo.');

    const fileResponse = await fetch(downloadUrl, { redirect: 'follow', signal: controller.signal });
    if (!fileResponse.ok) throw httpError('Falha ao baixar o vídeo.', fileResponse.status);
    return { buffer: Buffer.from(await fileResponse.arrayBuffer()), mimeType: 'video/mp4' };
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError('Tempo limite ao baixar o vídeo.');
    throw error;
  } finally {
    clear();
  }
}
