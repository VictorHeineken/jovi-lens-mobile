// Shared HTTP helpers for the local JOVI Lens API handlers.
// Extracted from api/analyze-image.js so every endpoint reuses the same
// client identification, rate limiting and payload validation.

const rateBuckets = new Map();

export function clientKey(req) {
  // Prefer the transport-level peer address (set by the local server from the
  // socket) — never key primarily on a client-supplied X-Forwarded-For, whose
  // left-most entry the client controls and could rotate to defeat the limiter.
  if (req.ip) return String(req.ip).slice(0, 80);
  const forwarded = req.headers['x-forwarded-for'];
  // Behind a trusted proxy the hop it appends is the RIGHT-most entry.
  if (forwarded) return String(forwarded).split(',').pop().trim().slice(0, 80);
  return String(req.headers['x-real-ip'] || 'unknown').slice(0, 80);
}

// Per-scope fixed window. Each endpoint passes its own scope + budget so a
// burst of cheap requests on one route never blocks another.
export function isRateLimited(req, { windowMs = 60_000, max = 12, scope = 'default' } = {}) {
  const now = Date.now();
  // Opportunistic eviction so the bucket map can't grow without bound.
  if (rateBuckets.size > 500) {
    for (const [key, bucket] of rateBuckets) if (now - bucket.startedAt > windowMs) rateBuckets.delete(key);
  }
  const key = `${scope}:${clientKey(req)}`;
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt > windowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

export function hasKnownImageSignature(base64, mimeType) {
  try {
    // Only the header is needed for magic-byte detection — avoid decoding megabytes.
    const bytes = Buffer.from(base64.slice(0, 32), 'base64');
    if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
    if (mimeType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mimeType === 'image/webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  } catch {
    return false;
  }
  return false;
}

// Lightweight magic-byte check for the audio formats a browser MediaRecorder /
// getUserMedia flow produces, used by the transcription endpoint.
export function hasKnownAudioSignature(base64, mimeType) {
  try {
    // Header-only decode; the full audio is decoded once later for the upload.
    const bytes = Buffer.from(base64.slice(0, 32), 'base64');
    if (mimeType.includes('webm') || mimeType.includes('ogg')) return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 ? true : bytes.subarray(0, 4).toString() === 'OggS';
    if (mimeType.includes('wav')) return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE';
    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) || bytes.subarray(0, 3).toString() === 'ID3';
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) return bytes.subarray(4, 8).toString() === 'ftyp';
  } catch {
    return false;
  }
  return false;
}

// Maps a provider/service error code to the public status + message, keeping
// internal details out of the response body. Handlers extend `messages`.
export function errorResponse(error, messages = {}) {
  const code = error?.code || 'AI_UNAVAILABLE';
  const status = code === 'AI_NOT_CONFIGURED' ? 503
    : code === 'AI_RATE_LIMITED' ? 429
    : code === 'AI_TIMEOUT' ? 504
    : 502;
  const base = {
    AI_NOT_CONFIGURED: 'Este recurso ao vivo ainda não está configurado. Ative o modo demonstração ou configure o serviço de IA.',
    AI_TIMEOUT: 'A geração demorou mais que o esperado. Tente novamente.',
    AI_EMPTY_RESPONSE: 'A IA não retornou um resultado utilizável. Tente novamente.',
    AI_INVALID_RESPONSE: 'Recebemos uma resposta que não pôde ser organizada. Tente novamente.',
    AI_RATE_LIMITED: 'O serviço de IA está temporariamente ocupado. Tente novamente em instantes.',
  };
  return { status, code, message: { ...base, ...messages }[code] || 'Não foi possível concluir agora. Tente novamente.' };
}
