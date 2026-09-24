// Server-side Play Integrity verification for standard requests
// (prod-implementation-spec.md §5.8). The client binds each token to one
// request with requestHash = sha256(method \n path \n sha256(body) \n ts);
// the server recomputes it from the raw body, decodes the token with Google
// using a service account, and checks package, certificate, device verdict
// and replay. Only { event, reason } is ever logged.
import { createHash, createSign } from 'node:crypto';
import { logError } from './log.js';
import { getStore } from './store.js';

const MAX_CLOCK_SKEW_MS = 120_000;
const REPLAY_TTL_SEC = 300;
const DECODE_TIMEOUT_MS = 8000;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/playintegrity';
const ACCEPTED_APP_VERDICTS = new Set(['PLAY_RECOGNIZED', 'UNRECOGNIZED_VERSION']);

let cachedAccessToken = null; // { token, expiresAt }

function unavailable() {
  return Object.assign(new Error('Play Integrity unavailable.'), { code: 'INTEGRITY_UNAVAILABLE' });
}

function fail(reason) {
  logError('integrity_fail', { reason });
  return { ok: false, reason };
}

function sha256hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function packageName() {
  return process.env.PLAY_INTEGRITY_PACKAGE || 'com.jovilens.app';
}

function allowedCertDigests() {
  return String(process.env.PLAY_INTEGRITY_CERT_SHA256 || '').split(',').map((value) => value.trim().replace(/=+$/, '')).filter(Boolean);
}

function serviceAccount() {
  try {
    const parsed = JSON.parse(Buffer.from(String(process.env.PLAY_INTEGRITY_SA_JSON_B64 || ''), 'base64').toString('utf8'));
    if (!parsed.client_email || !parsed.private_key) throw new Error('incomplete');
    return parsed;
  } catch {
    throw unavailable();
  }
}

// RS256 service-account assertion for the OAuth 2.0 JWT bearer grant.
export function buildServiceAccountJwt({ client_email: clientEmail, private_key: privateKey }, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(privateKey, 'base64url');
  return `${header}.${claims}.${signature}`;
}

async function accessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60_000 > Date.now()) return cachedAccessToken.token;
  const assertion = buildServiceAccountJwt(serviceAccount());
  let response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
      signal: AbortSignal.timeout(DECODE_TIMEOUT_MS),
    });
  } catch {
    throw unavailable();
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw unavailable();
  cachedAccessToken = { token: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000 };
  return cachedAccessToken.token;
}

async function decodeToken(integrityToken) {
  const token = await accessToken();
  let response;
  try {
    response = await fetch(`https://playintegrity.googleapis.com/v1/${packageName()}:decodeIntegrityToken`, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrity_token: integrityToken }),
      signal: AbortSignal.timeout(DECODE_TIMEOUT_MS),
    });
  } catch {
    throw unavailable();
  }
  if (response.status >= 500) throw unavailable();
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.tokenPayloadExternal || null;
}

// Resolves { ok: true } or { ok: false, reason }; throws INTEGRITY_UNAVAILABLE
// when Google can't be reached (the guard answers 503).
export async function verifyIntegrity(req, bodySha256) {
  const integrityToken = req.headers['x-play-integrity-token'];
  const ts = req.headers['x-jovi-ts'];
  if (!integrityToken || !ts) return fail('missing');
  const tsNumber = Number(ts);
  if (!Number.isFinite(tsNumber) || Math.abs(Date.now() - tsNumber) > MAX_CLOCK_SKEW_MS) return fail('stale_ts');

  const path = String(req.url || '').split('?')[0];
  const expectedHash = sha256hex(`${req.method}\n${path}\n${bodySha256}\n${ts}`);

  const payload = await decodeToken(String(integrityToken));
  if (!payload) return fail('decode_rejected');

  const pkg = packageName();
  if (payload.requestDetails?.requestPackageName !== pkg) return fail('pkg');
  if (payload.requestDetails?.requestHash !== expectedHash) return fail('hash');
  if (!ACCEPTED_APP_VERDICTS.has(payload.appIntegrity?.appRecognitionVerdict)) return fail('unevaluated');
  if (payload.appIntegrity?.packageName !== pkg) return fail('pkg');
  const digests = Array.isArray(payload.appIntegrity?.certificateSha256Digest) ? payload.appIntegrity.certificateSha256Digest.map((value) => String(value).replace(/=+$/, '')) : [];
  const allowed = allowedCertDigests();
  if (!digests.some((digest) => allowed.includes(digest))) return fail('cert');
  const deviceVerdicts = payload.deviceIntegrity?.deviceRecognitionVerdict;
  if (!Array.isArray(deviceVerdicts) || !deviceVerdicts.includes('MEETS_DEVICE_INTEGRITY')) return fail('device');

  if (!(await getStore().setNX(`integ:${expectedHash}`, '1', REPLAY_TTL_SEC))) return fail('replay');
  return { ok: true };
}

// Tests only.
export function resetIntegrityCache() {
  cachedAccessToken = null;
}
