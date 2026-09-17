// Minimal app-issued session token — see auth-plan.md Phase 2. Binds a
// verified Google account id (`sub`) to a short-lived, HMAC-signed token so
// AI handlers can key quotas per account without re-validating the raw
// Google id_token (and hammering Google's tokeninfo endpoint) on every call.
// Deliberately not a full JWT: one HMAC over one JSON payload is all this
// needs, so no new dependency was added for it.

import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sign(body, secret) {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function issueSession({ sub, email }) {
  const secret = process.env.JOVI_SESSION_SECRET;
  if (!secret) throw Object.assign(new Error('JOVI_SESSION_SECRET not configured'), { code: 'SESSION_NOT_CONFIGURED' });
  const body = Buffer.from(JSON.stringify({ sub, email, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

// Returns the payload for a valid, unexpired token, or null for anything else
// (unconfigured secret, malformed token, bad signature, expired).
export function verifySession(token) {
  const secret = process.env.JOVI_SESSION_SECRET;
  if (!secret || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.sub || !payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
