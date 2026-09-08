import { abortableTimeout, emptyResponseError, httpError, notConfigured, timeoutError } from './shared.js';

const DEFAULT_API_VERSION = '2024-10-21';
const DEFAULT_TTS_API_VERSION = '2025-04-01-preview';
const DEFAULT_TRANSCRIBE_API_VERSION = '2025-04-01-preview';
const DEFAULT_VIDEO_API_VERSION = 'preview';

// Azure voices per role; browser pitch differentiates speakers client-side
// when only one pt-BR voice exists in speechSynthesis.
const ROLE_VOICE = { A: 'nova', B: 'onyx', narrator: 'alloy' };

export const capabilities = { chat: true, vision: true, tts: true, stt: true, video: true };

function getConfig() {
  return {
    endpoint: String(process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/$/, ''),
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || DEFAULT_API_VERSION,
  };
}

export function isConfigured(capability) {
  const config = getConfig();
  const hasBase = Boolean(config.endpoint && config.apiKey);
  if (capability === 'chat' || capability === 'vision') return hasBase && Boolean(config.deployment);
  if (capability === 'tts') return hasBase && Boolean(process.env.AZURE_OPENAI_TTS_DEPLOYMENT);
  if (capability === 'stt') return hasBase && Boolean(process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT);
  if (capability === 'video') return hasBase && Boolean(process.env.AZURE_OPENAI_SORA_DEPLOYMENT);
  return false;
}

export async function complete({ messages, maxTokens = 1400, timeoutMs = 22000 }) {
  const config = getConfig();
  if (!isConfigured('chat')) throw notConfigured('Azure OpenAI não está configurado.');

  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const url = `${config.endpoint}/openai/deployments/${encodeURIComponent(config.deployment)}/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError('Falha no serviço de IA.', response.status);

    const text = payload?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') throw emptyResponseError('A IA não retornou conteúdo.');

    return { text, model: config.deployment, provider: 'azure-openai' };
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError('Tempo limite da análise excedido.');
    throw error;
  } finally {
    clear();
  }
}

// --- Text-to-speech (podcast, narração da aula, áudio-resumo) ----------------
export async function speak({ text, voice = 'narrator', format = 'mp3', timeoutMs = 30000 }) {
  const config = getConfig();
  const deployment = process.env.AZURE_OPENAI_TTS_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_TTS_API_VERSION || DEFAULT_TTS_API_VERSION;
  if (!isConfigured('tts')) throw notConfigured('TTS da Azure OpenAI não está configurado.');
  const voiceId = ROLE_VOICE[voice] || ROLE_VOICE.narrator;

  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const url = `${config.endpoint}/openai/deployments/${encodeURIComponent(deployment)}/audio/speech?api-version=${encodeURIComponent(apiVersion)}`;
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: deployment, input: text, voice: voiceId, response_format: format }),
      signal: controller.signal,
    });
    if (!response.ok) throw httpError('Falha ao gerar áudio.', response.status);
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, mimeType: format === 'mp3' ? 'audio/mpeg' : `audio/${format}`, model: deployment, provider: 'azure-openai' };
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError('Tempo limite do áudio excedido.');
    throw error;
  } finally {
    clear();
  }
}

// --- Speech-to-text (pergunta por voz) --------------------------------------
export async function transcribe({ buffer, mimeType = 'audio/webm', filename = 'audio.webm', timeoutMs = 30000 }) {
  const config = getConfig();
  const deployment = process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_TRANSCRIBE_API_VERSION || DEFAULT_TRANSCRIBE_API_VERSION;
  if (!isConfigured('stt')) throw notConfigured('Transcrição da Azure OpenAI não está configurada.');

  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const url = `${config.endpoint}/openai/deployments/${encodeURIComponent(deployment)}/audio/transcriptions?api-version=${encodeURIComponent(apiVersion)}`;
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), filename);
    form.append('response_format', 'json');
    const response = await fetch(url, { method: 'POST', redirect: 'error', headers: { 'api-key': config.apiKey }, body: form, signal: controller.signal });
    if (!response.ok) throw httpError('Falha ao transcrever o áudio.', response.status);
    const payload = await response.json().catch(() => ({}));
    const text = typeof payload?.text === 'string' ? payload.text : '';
    if (!text) throw emptyResponseError('Nenhuma fala reconhecida.');
    return { text, model: deployment, provider: 'azure-openai' };
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError('Tempo limite da transcrição excedido.');
    throw error;
  } finally {
    clear();
  }
}

// --- Video generation (Sora) — opening clip for the video lesson ------------
function videoBase() {
  const config = getConfig();
  const deployment = process.env.AZURE_OPENAI_SORA_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_VIDEO_API_VERSION || DEFAULT_VIDEO_API_VERSION;
  if (!isConfigured('video')) throw notConfigured('Geração de vídeo (Sora) da Azure OpenAI não está configurada.');
  return { config, deployment, apiVersion };
}

export async function createVideoJob({ prompt, seconds = 5, width = 480, height = 854, timeoutMs = 30000 }) {
  const { config, deployment, apiVersion } = videoBase();
  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const url = `${config.endpoint}/openai/v1/video/generations/jobs?api-version=${encodeURIComponent(apiVersion)}`;
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: deployment, prompt, n_seconds: seconds, n_variants: 1, width, height }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError('Falha ao iniciar o vídeo.', response.status);
    return { id: payload?.id, status: payload?.status || 'queued' };
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError('Tempo limite ao iniciar o vídeo.');
    throw error;
  } finally {
    clear();
  }
}

export async function getVideoJob(jobId, { timeoutMs = 20000 } = {}) {
  const { config, apiVersion } = videoBase();
  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const url = `${config.endpoint}/openai/v1/video/generations/jobs/${encodeURIComponent(jobId)}?api-version=${encodeURIComponent(apiVersion)}`;
    const response = await fetch(url, { redirect: 'error', headers: { 'api-key': config.apiKey }, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError('Falha ao consultar o vídeo.', response.status);
    const generationId = payload?.generations?.[0]?.id || null;
    return { status: payload?.status || 'unknown', generationId, failure: payload?.failure_reason || null };
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError('Tempo limite ao consultar o vídeo.');
    throw error;
  } finally {
    clear();
  }
}

export async function getVideoContent(generationId, { timeoutMs = 45000 } = {}) {
  const { config, apiVersion } = videoBase();
  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const url = `${config.endpoint}/openai/v1/video/generations/${encodeURIComponent(generationId)}/content/video?api-version=${encodeURIComponent(apiVersion)}`;
    const response = await fetch(url, { redirect: 'error', headers: { 'api-key': config.apiKey }, signal: controller.signal });
    if (!response.ok) throw httpError('Falha ao baixar o vídeo.', response.status);
    return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: 'video/mp4' };
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError('Tempo limite ao baixar o vídeo.');
    throw error;
  } finally {
    clear();
  }
}
