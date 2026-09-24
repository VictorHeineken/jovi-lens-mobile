// Client side of the server error contract (prod-implementation-spec.md §5.4
// and §6.7). Codes with a fixed pt-BR message use it; the rest (e.g.
// INVALID_INPUT, AI_TIMEOUT) keep the server's specific message.
const MESSAGES = {
  INVALID_JSON: 'Requisição inválida.',
  TEXT_TOO_LONG: 'Texto longo demais para gerar áudio.',
  IDEMPOTENCY_KEY_REQUIRED: 'Requisição sem identificador. Atualize o app.',
  BYOK_INVALID_FORMAT: 'Formato de chave de IA inválido.',
  BYOK_CAPABILITY_UNSUPPORTED: 'Seu provedor de IA não oferece este recurso.',
  API_KEY_INVALID: 'Acesso não autorizado.',
  SIGN_IN_REQUIRED: 'Entre com sua conta Google para usar a IA.',
  SESSION_INVALID: 'Sua sessão expirou. Entre novamente.',
  CREDITS_EXHAUSTED: 'Você usou suas 3 análises gratuitas. Adicione sua própria chave de IA para continuar.',
  INTEGRITY_FAILED: 'Não foi possível verificar este aparelho. Use o app oficial em um aparelho sem modificações.',
  BYOK_REQUIRED: 'Vozes e transcrição da IA exigem sua própria chave. Usando a voz do aparelho.',
  METHOD_NOT_ALLOWED: 'Método não permitido.',
  REQUEST_IN_PROGRESS: 'Este pedido ainda está sendo processado.',
  PAYLOAD_TOO_LARGE: 'Arquivo grande demais para enviar.',
  UNSUPPORTED_MEDIA_TYPE: 'Tipo de conteúdo não suportado.',
  BYOK_REJECTED: 'Sua chave de IA foi recusada pelo provedor. Confira ou troque a chave.',
  RATE_LIMITED: 'Muitos pedidos em sequência. Tente novamente em instantes.',
  SIGNUP_LIMITED: 'Muitas contas novas nesta rede hoje. Tente novamente amanhã.',
  AI_RATE_LIMITED: 'O serviço de IA está temporariamente ocupado. Tente novamente em instantes.',
  // The server's text for this code suggests demo mode, which doesn't exist in
  // real builds; the app shows a neutral message instead.
  AI_NOT_CONFIGURED: 'Este recurso de IA não está disponível no momento. Tente novamente mais tarde.',
  AI_RESPONSE_TOO_LARGE: 'A resposta da IA ficou grande demais. Tente um conteúdo menor.',
  STORE_UNAVAILABLE: 'Serviço indisponível no momento. Tente novamente em instantes.',
  SERVER_MISCONFIGURED: 'Serviço indisponível no momento. Tente novamente em instantes.',
  INTEGRITY_UNAVAILABLE: 'Serviço indisponível no momento. Tente novamente em instantes.',
  NETWORK: 'Sem conexão no momento. Confira a internet e tente novamente.',
};

const UNKNOWN_MESSAGE = 'Não foi possível concluir agora. Tente novamente.';

export function messageFor(code, fallback) {
  return MESSAGES[code] || fallback || UNKNOWN_MESSAGE;
}

export class ApiError extends Error {
  constructor({ status = 0, code = 'UNKNOWN', message } = {}) {
    super(message || messageFor(code));
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// Errors that deserve a "Tentar novamente" button (AiErrorActions).
export function isRetryableError(error) {
  return ['NETWORK', 'AI_TIMEOUT', 'AI_RATE_LIMITED'].includes(error?.code) || Number(error?.status) >= 500;
}

// Normalizes whatever a failed AI call threw into something with a message
// (and a code, when it came from the server) for AiErrorActions.
export function asAiError(error, fallback) {
  return error?.message ? error : new Error(fallback);
}
