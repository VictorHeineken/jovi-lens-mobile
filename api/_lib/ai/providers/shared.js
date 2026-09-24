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

// Upstream 401/403 become AI_PROVIDER_AUTH; the guard turns that into
// BYOK_REJECTED (user key) or AI_UNAVAILABLE (server key). The message is
// always the adapter's fixed text, never the provider's response body.
export function httpError(message, status) {
  const code = status === 429 ? 'AI_RATE_LIMITED' : status === 401 || status === 403 ? 'AI_PROVIDER_AUTH' : 'AI_PROVIDER_ERROR';
  return Object.assign(new Error(message), { code, status });
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

// Per-role speaking style, shared by every TTS adapter that accepts a style
// instruction (Azure/OpenAI `instructions`, Gemini speech metadata).
export const ROLE_STYLE = {
  A: 'Fale em português do Brasil como uma apresentadora curiosa e próxima, com ritmo natural, leve sorriso na voz, micro-pausas entre ideias e entonação de conversa. Evite soar como leitura de roteiro.',
  B: 'Fale em português do Brasil como um professor calmo e experiente, com voz clara, calor humano, pequenas pausas explicativas e ênfase suave nos termos importantes. Evite monotonia e tom robótico.',
  narrator: 'Fale em português do Brasil como um narrador educacional natural, acolhedor e fluido, com pausas curtas, respiração realista e cadência de podcast. Evite leitura apressada ou artificial.',
  coach: 'Fale em português do Brasil como uma IA tutora simpática em modo conversa. Faça perguntas com energia calma, deixe pausas naturais para o aluno responder em voz alta e evite tom de locução.',
  feedback: 'Fale em português do Brasil como um professor que corrige com acolhimento. Primeiro valide o raciocínio, depois explique com clareza o que estava certo ou faltando.',
};
