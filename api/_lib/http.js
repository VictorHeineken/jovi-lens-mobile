// Shared HTTP helpers for the local JOVI Lens API handlers.
// Extracted from api/analyze-image.js so every endpoint reuses the same
// client identification, rate limiting and payload validation.

import { timingSafeEqual } from 'node:crypto';
import { isIPv6 } from 'node:net';
import { verifySession } from './session.js';

// Short-window (burst) and long-window (daily) buckets live apart: capping one
// shared map evicted the oldest entries first — the daily ones — so a flood of
// new client keys silently reset everyone's daily quota. Each map is swept at
// most once a minute and capped on its own. An in-process guard for the local
// prototype; a deployment needs a shared store keyed by account.
const LONG_WINDOW_MS = 3_600_000;
const buckets = { short: new Map(), long: new Map() };
const MAX_BUCKETS = { short: 20_000, long: 200_000 };
const SWEEP_INTERVAL_MS = 60_000;
const lastSweepAt = { short: 0, long: 0 };

function sweepBuckets(kind, now) {
  const map = buckets[kind];
  if (now - lastSweepAt[kind] < SWEEP_INTERVAL_MS && map.size <= MAX_BUCKETS[kind]) return;
  lastSweepAt[kind] = now;
  for (const [key, bucket] of map) if (now - bucket.startedAt > bucket.windowMs) map.delete(key);
  for (const key of map.keys()) {
    if (map.size <= MAX_BUCKETS[kind]) break;
    map.delete(key);
  }
}

// Static shared-secret gate — see auth-plan.md Phase 1. This is a speed bump
// against casual/accidental use of the paid AI quota by other devices on the
// same LAN, not real authentication: the key ships inside the app bundle and
// web build, so anyone who extracts it can still call the API directly.
// Phase 2 (device attestation + per-account quota) replaces/augments this.
export function hasValidApiKey(req) {
  const expected = process.env.JOVI_API_KEY;
  if (!expected) return true; // unset = feature opt-in, same pattern as GOOGLE_CLIENT_ID
  const provided = String(req.headers['x-api-key'] || '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Reads the app-issued session from `Authorization: Bearer <token>` (see
// api/_lib/session.js and auth-plan.md Phase 2). `provided` distinguishes "no
// header" (fine — falls back to IP-based limiting, logged-out use stays
// allowed) from "header present but invalid/expired" (the caller should
// reject with 401 rather than silently falling back, so a stale token can't
// quietly ride on IP-based limits after logout/expiry).
export function sessionUser(req) {
  const header = String(req.headers['authorization'] || '');
  if (!header.startsWith('Bearer ')) return { provided: false, user: null };
  return { provided: true, user: verifySession(header.slice(7)) };
}

// IPv6 clients control a whole /64; keying on the full /128 let one client
// rotate addresses to get fresh buckets. The address is expanded to its 8
// groups first — the compressed text form places "::" differently for
// addresses of the same /64. IPv4 (and IPv4-mapped) stay exact.
function ipKey(ip) {
  const value = String(ip).slice(0, 80).split('%')[0];
  if (!isIPv6(value) || value.toLowerCase().startsWith('::ffff:')) return value;
  const [head, tail = ''] = value.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = value.includes('::') && tail ? tail.split(':') : [];
  const groups = value.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export function clientKey(req) {
  const { user } = sessionUser(req);
  if (user) return `user:${user.sub}`;
  // Prefer the transport-level peer address (set by the local server from the
  // socket) — never key primarily on a client-supplied X-Forwarded-For, whose
  // left-most entry the client controls and could rotate to defeat the limiter.
  if (req.ip) return ipKey(req.ip);
  const forwarded = req.headers['x-forwarded-for'];
  // Behind a trusted proxy the hop it appends is the RIGHT-most entry.
  if (forwarded) return String(forwarded).split(',').pop().trim().slice(0, 80);
  return String(req.headers['x-real-ip'] || 'unknown').slice(0, 80);
}

// Per-scope fixed window. Each endpoint passes its own scope + budget so a
// burst of cheap requests on one route never blocks another.
export function isRateLimited(req, { windowMs = 60_000, max = 12, scope = 'default' } = {}) {
  const now = Date.now();
  // Each bucket is judged by its OWN window: judging by the caller's window let
  // a 60 s call delete daily buckets and silently reset everyone's daily quota.
  const kind = windowMs >= LONG_WINDOW_MS ? 'long' : 'short';
  sweepBuckets(kind, now);
  const map = buckets[kind];
  const key = `${scope}:${clientKey(req)}`;
  const bucket = map.get(key);
  if (!bucket || now - bucket.startedAt > bucket.windowMs) {
    map.set(key, { startedAt: now, count: 1, windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

// A second, longer window protects the provider budget even when requests are
// spread out enough to evade the short burst limiter. This is intentionally an
// in-process guard for the local prototype; production should move it to a
// shared store and key it by authenticated user.
export function isDailyLimited(req, { max = 100, scope = 'default' } = {}) {
  return isRateLimited(req, { windowMs: 86_400_000, max, scope: `daily:${scope}` });
}

// Exact MIME essence: "text/plain;application/json" contains the substring but
// is a CORS-safelisted type a browser sends cross-site without a preflight.
export function isJsonContentType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase() === 'application/json';
}

// The one preamble every AI handler runs, in the order that keeps the
// status codes honest: method → JSON body → shared key → session → burst →
// daily. The content-type check lives here too (not only in server/app.js) so
// it holds wherever the handlers are deployed. Failed key checks are counted
// only to cap noise from a misconfigured client — they do not slow down key
// guessing (a correct key is always let through); the key's entropy (32 random
// bytes) is the actual protection. Returns true when it already replied.
export function guardAiRequest(req, res, { scope, perMinute, perDay, burstMessage, dailyMessage, checkSession = true }) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Método não permitido.' });
    return true;
  }
  if (!isJsonContentType(req.headers?.['content-type'])) {
    res.status(415).json({ message: 'Tipo de conteúdo não suportado.' });
    return true;
  }
  if (!hasValidApiKey(req)) {
    const locked = isRateLimited(req, { scope: 'apikey-failures', max: 10 });
    res.status(locked ? 429 : 401).json(locked
      ? { code: 'AI_RATE_LIMITED', message: 'Muitas tentativas sem autorização. Tente novamente em instantes.' }
      : { code: 'API_KEY_INVALID', message: 'Acesso não autorizado.' });
    return true;
  }
  if (checkSession) {
    const { provided, user } = sessionUser(req);
    if (provided && !user) {
      res.status(401).json({ code: 'SESSION_INVALID', message: 'Sessão expirada. Faça login novamente.' });
      return true;
    }
  }
  if (isRateLimited(req, { scope, max: perMinute })) {
    res.status(429).json({ code: 'AI_RATE_LIMITED', message: burstMessage || 'Muitos pedidos em sequência. Tente novamente em instantes.' });
    return true;
  }
  if (isDailyLimited(req, { scope, max: perDay })) {
    res.status(429).json({ code: 'AI_RATE_LIMITED', message: dailyMessage || 'O limite diário deste recurso foi atingido. Tente novamente amanhã.' });
    return true;
  }
  return false;
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
