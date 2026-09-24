// Single entry point for every backend call from the native app
// (prod-implementation-spec.md §6.4): API key, session, idempotency, BYOK and
// Play Integrity headers, timeouts, one retry for transient failures, and
// silent session recovery. Resolves to the parsed JSON on 2xx; throws ApiError
// otherwise. Demo builds never call it.
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { ApiError, messageFor } from './apiErrors.js';
import { getIntegrityToken, integrityAvailable } from './integrity.js';
import { getSessionToken, getUser, setSessionToken } from './storage.js';
import { getByok, setCredits } from './aiAccess.js';
import { refreshSession, signOutLocal } from './googleAuth.js';
import { isDemoMode } from './env.js';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';
const APP_VARIANT = Constants.expoConfig?.extra?.appVariant || 'development';

// Release builds must only talk to the backend over HTTPS.
if (!isDemoMode() && APP_VARIANT !== 'development' && !API_BASE_URL.startsWith('https://')) {
  throw new Error('EXPO_PUBLIC_API_BASE_URL precisa usar https:// fora do build de desenvolvimento.');
}

const DEFAULT_TIMEOUTS = {
  '/api/analyze-image': 45000,
  '/api/subject-ai': 70000,
  '/api/video-recommendations': 30000,
  '/api/tts': 45000,
  '/api/transcribe': 45000,
  '/api/auth/google': 20000,
  '/api/me': 15000,
  '/api/byok/validate': 20000,
};
const RETRY_DELAY_MS = 1000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCallerAbort(signal) {
  return Boolean(signal?.aborted);
}

async function buildHeaders({ method, path, bodyString, idempotencyKey, byok, integrity }) {
  const headers = {};
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  if (process.env.EXPO_PUBLIC_JOVI_API_KEY) headers['x-api-key'] = process.env.EXPO_PUBLIC_JOVI_API_KEY;
  const session = getSessionToken();
  if (session) headers.Authorization = `Bearer ${session}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (byok) {
    headers['x-ai-provider'] = byok.provider;
    headers['x-ai-key'] = byok.apiKey;
  }
  if (integrity && integrityAvailable()) {
    try {
      const ts = String(Date.now());
      const bodyHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, bodyString);
      const requestHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${method}\n${path}\n${bodyHash}\n${ts}`);
      headers['x-play-integrity-token'] = await getIntegrityToken(requestHash);
      headers['x-jovi-ts'] = ts;
    } catch {
      // Sent without a token; the server decides.
    }
  }
  return headers;
}

async function send(path, { method, bodyString, signal, timeoutMs, idempotencyKey, byok, integrity }) {
  const headers = await buildHeaders({ method, path, bodyString, idempotencyKey, byok, integrity });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener?.('abort', onCallerAbort);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: method === 'POST' ? bodyString : undefined,
      signal: controller.signal,
    });
    const credits = response.headers?.get?.('x-jovi-credits-remaining');
    if (credits !== null && credits !== undefined && credits !== '') setCredits(Number(credits));
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok, payload };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onCallerAbort);
  }
}

export async function apiRequest(path, {
  method = 'POST',
  body,
  signal,
  timeoutMs,
  idempotent = false, // true for cost-1 routes
  useByok = true, // attach BYOK headers if a key is saved
  integrity = true,
  byok: explicitByok, // explicit BYOK headers (key validation before saving)
  recover = true, // silent session recovery on 401
} = {}) {
  const bodyString = body === undefined ? '' : JSON.stringify(body);
  const idempotencyKey = idempotent ? Crypto.randomUUID() : null;
  const byok = explicitByok || (useByok ? await getByok() : null);
  const options = { method, bodyString, signal, timeoutMs: timeoutMs || DEFAULT_TIMEOUTS[path] || 30000, idempotencyKey, byok, integrity };

  let result;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      result = await send(path, options);
    } catch (error) {
      if (isCallerAbort(signal)) throw error;
      if (attempt === 0) { await wait(RETRY_DELAY_MS); continue; }
      throw new ApiError({ code: 'NETWORK', message: messageFor('NETWORK') });
    }
    if (attempt === 0 && [502, 503, 504].includes(result.status) && !isCallerAbort(signal)) {
      await wait(RETRY_DELAY_MS);
      continue;
    }
    break;
  }

  const code = result.payload?.code;
  if (result.status === 401 && recover && (code === 'SESSION_INVALID' || code === 'SIGN_IN_REQUIRED') && getUser()) {
    if (await refreshSession()) {
      return apiRequest(path, { method, body, signal, timeoutMs, idempotent, useByok, integrity, byok: explicitByok, recover: false });
    }
    signOutLocal();
  }

  if (!result.ok) {
    throw new ApiError({ status: result.status, code: code || 'UNKNOWN', message: messageFor(code, result.payload?.message) });
  }
  return result.payload;
}

export { getSessionToken, setSessionToken };
