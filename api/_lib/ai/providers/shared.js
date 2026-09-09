// Helpers shared by every provider adapter so error codes, timeouts, and
// image encoding stay consistent no matter which vendor is behind them.

export function abortableTimeout(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, clear: () => clearTimeout(timeout) };
}

export function notConfigured(message = 'Recurso de IA não está configurado.') {
  return Object.assign(new Error(message), { code: 'AI_NOT_CONFIGURED' });
}

export function httpError(message, status) {
  return Object.assign(new Error(message), { code: status === 429 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_ERROR', status });
}

export function timeoutError(message) {
  return Object.assign(new Error(message), { code: 'AI_TIMEOUT' });
}

export function emptyResponseError(message) {
  return Object.assign(new Error(message), { code: 'AI_EMPTY_RESPONSE' });
}

// "data:image/jpeg;base64,...." -> { mediaType, data }. Providers whose vision
// input isn't OpenAI's { image_url: { url } } shape (Anthropic, Gemini) use
// this to translate the data URL that service.js always produces.
export function dataUrlToBase64(dataUrl) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(String(dataUrl || ''));
  if (!match) throw Object.assign(new Error('Formato de imagem inválido.'), { code: 'AI_INVALID_RESPONSE' });
  return { mediaType: match[1], data: match[2] };
}
