const DEFAULT_API_VERSION = '2024-10-21';

function getConfig() {
  return {
    endpoint: String(process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/$/, ''),
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || DEFAULT_API_VERSION,
  };
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
