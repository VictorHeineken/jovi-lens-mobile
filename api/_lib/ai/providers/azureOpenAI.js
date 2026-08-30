const DEFAULT_API_VERSION = '2024-10-21';
const DEFAULT_TTS_API_VERSION = '2025-04-01-preview';
const DEFAULT_TRANSCRIBE_API_VERSION = '2025-04-01-preview';
const DEFAULT_VIDEO_API_VERSION = 'preview';

function getConfig() {
  return {
    endpoint: String(process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/$/, ''),
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || DEFAULT_API_VERSION,
  };
}

function notConfigured(message = 'Recurso da Azure OpenAI não está configurado.') {
  return Object.assign(new Error(message), { code: 'AI_NOT_CONFIGURED' });
}

function abortableTimeout(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, clear: () => clearTimeout(timeout) };
}

export async function completeWithAzure({ messages, maxTokens = 1400, timeoutMs = 22000 }) {
  const config = getConfig();
  if (!config.endpoint || !config.apiKey || !config.deployment) {
    const error = new Error('Azure OpenAI não está configurado.');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
    if (!response.ok) {
      const error = new Error('Falha no serviço de IA.');
      error.code = response.status === 429 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_ERROR';
      error.status = response.status;
      throw error;
    }

    const text = payload?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') {
      const error = new Error('A IA não retornou conteúdo.');
      error.code = 'AI_EMPTY_RESPONSE';
      throw error;
    }

    return { text, model: config.deployment, provider: 'azure-openai' };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Tempo limite da análise excedido.');
      timeoutError.code = 'AI_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Text-to-speech (podcast, narração da aula, áudio-resumo) ----------------
export function isTtsConfigured() {
  return Boolean(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_TTS_DEPLOYMENT);
}

export async function speakWithAzure({ text, voice = 'alloy', format = 'mp3', timeoutMs = 30000 }) {
  const config = getConfig();
  const deployment = process.env.AZURE_OPENAI_TTS_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_TTS_API_VERSION || DEFAULT_TTS_API_VERSION;
  if (!config.endpoint || !config.apiKey || !deployment) throw notConfigured('TTS da Azure OpenAI não está configurado.');

  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const url = `${config.endpoint}/openai/deployments/${encodeURIComponent(deployment)}/audio/speech?api-version=${encodeURIComponent(apiVersion)}`;
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: deployment, input: text, voice, response_format: format }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error('Falha ao gerar áudio.');
      error.code = response.status === 429 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_ERROR';
      error.status = response.status;
      throw error;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, mimeType: format === 'mp3' ? 'audio/mpeg' : `audio/${format}`, model: deployment, provider: 'azure-openai' };
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('Tempo limite do áudio excedido.'), { code: 'AI_TIMEOUT' });
    throw error;
  } finally {
    clear();
  }
}

// --- Speech-to-text (pergunta por voz) --------------------------------------
export function isTranscribeConfigured() {
  return Boolean(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT);
}

export async function transcribeWithAzure({ buffer, mimeType = 'audio/webm', filename = 'audio.webm', timeoutMs = 30000 }) {
  const config = getConfig();
  const deployment = process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_TRANSCRIBE_API_VERSION || DEFAULT_TRANSCRIBE_API_VERSION;
  if (!config.endpoint || !config.apiKey || !deployment) throw notConfigured('Transcrição da Azure OpenAI não está configurada.');

  const { controller, clear } = abortableTimeout(timeoutMs);
  try {
    const url = `${config.endpoint}/openai/deployments/${encodeURIComponent(deployment)}/audio/transcriptions?api-version=${encodeURIComponent(apiVersion)}`;
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), filename);
    form.append('response_format', 'json');
    const response = await fetch(url, { method: 'POST', redirect: 'error', headers: { 'api-key': config.apiKey }, body: form, signal: controller.signal });
    if (!response.ok) {
      const error = new Error('Falha ao transcrever o áudio.');
      error.code = response.status === 429 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_ERROR';
      error.status = response.status;
      throw error;
    }
    const payload = await response.json().catch(() => ({}));
    const text = typeof payload?.text === 'string' ? payload.text : '';
    if (!text) throw Object.assign(new Error('Nenhuma fala reconhecida.'), { code: 'AI_EMPTY_RESPONSE' });
    return { text, model: deployment, provider: 'azure-openai' };
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('Tempo limite da transcrição excedido.'), { code: 'AI_TIMEOUT' });
    throw error;
  } finally {
    clear();
  }
}

// --- Video generation (Sora) — opening clip for the video lesson ------------
export function isVideoConfigured() {
  return Boolean(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_SORA_DEPLOYMENT);
}

function videoBase() {
  const config = getConfig();
  const deployment = process.env.AZURE_OPENAI_SORA_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_VIDEO_API_VERSION || DEFAULT_VIDEO_API_VERSION;
  if (!config.endpoint || !config.apiKey || !deployment) throw notConfigured('Geração de vídeo (Sora) da Azure OpenAI não está configurada.');
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
    if (!response.ok) {
      const error = new Error('Falha ao iniciar o vídeo.');
      error.code = response.status === 429 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_ERROR';
      error.status = response.status;
      throw error;
    }
    return { id: payload?.id, status: payload?.status || 'queued' };
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('Tempo limite ao iniciar o vídeo.'), { code: 'AI_TIMEOUT' });
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
    if (!response.ok) throw Object.assign(new Error('Falha ao consultar o vídeo.'), { code: 'AI_PROVIDER_ERROR', status: response.status });
    const generationId = payload?.generations?.[0]?.id || null;
    return { status: payload?.status || 'unknown', generationId, failure: payload?.failure_reason || null };
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('Tempo limite ao consultar o vídeo.'), { code: 'AI_TIMEOUT' });
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
    if (!response.ok) throw Object.assign(new Error('Falha ao baixar o vídeo.'), { code: 'AI_PROVIDER_ERROR', status: response.status });
    return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: 'video/mp4' };
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('Tempo limite ao baixar o vídeo.'), { code: 'AI_TIMEOUT' });
    throw error;
  } finally {
    clear();
  }
}
