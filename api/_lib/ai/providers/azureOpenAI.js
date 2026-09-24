import { abortableTimeout, emptyResponseError, httpError, notConfigured, ROLE_STYLE, timeoutError } from './shared.js';

const DEFAULT_API_VERSION = '2024-10-21';
const DEFAULT_TTS_API_VERSION = '2025-04-01-preview';
const DEFAULT_TRANSCRIBE_API_VERSION = '2025-04-01-preview';

// Azure/OpenAI voice ids per role. gpt-4o-mini-tts responds better when the
// voice and style instruction match the speaker's role, so keep this mapping
// provider-side and configurable without leaking provider details to clients.
function roleVoice(voice) {
  const voices = {
    A: process.env.AZURE_OPENAI_TTS_VOICE_A || 'nova',
    B: process.env.AZURE_OPENAI_TTS_VOICE_B || 'onyx',
    narrator: process.env.AZURE_OPENAI_TTS_VOICE_NARRATOR || 'alloy',
    coach: process.env.AZURE_OPENAI_TTS_VOICE_COACH || process.env.AZURE_OPENAI_TTS_VOICE_A || 'nova',
    feedback: process.env.AZURE_OPENAI_TTS_VOICE_FEEDBACK || process.env.AZURE_OPENAI_TTS_VOICE_B || 'onyx',
  };
  return voices[voice] || voices.narrator;
}

export const capabilities = { chat: true, vision: true, tts: true, stt: true };

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
  const voiceId = roleVoice(voice);
  const instructions = ROLE_STYLE[voice] || ROLE_STYLE.narrator;

  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const url = `${config.endpoint}/openai/deployments/${encodeURIComponent(deployment)}/audio/speech?api-version=${encodeURIComponent(apiVersion)}`;
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: deployment, input: text, voice: voiceId, response_format: format, instructions }),
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
  const model = process.env.AZURE_OPENAI_TRANSCRIBE_MODEL || deployment;
  const apiVersion = process.env.AZURE_OPENAI_TRANSCRIBE_API_VERSION || DEFAULT_TRANSCRIBE_API_VERSION;
  if (!isConfigured('stt')) throw notConfigured('Transcrição da Azure OpenAI não está configurada.');

  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const url = `${config.endpoint}/openai/deployments/${encodeURIComponent(deployment)}/audio/transcriptions?api-version=${encodeURIComponent(apiVersion)}`;
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), filename);
    form.append('model', model);
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

// Azure OpenAI is a server-only provider (never a BYOK option), so there is no
// user key to validate.
export async function validateKey() {
  throw notConfigured('Azure OpenAI não aceita chave do usuário.');
}
