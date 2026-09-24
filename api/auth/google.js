import { defineRoute, freeCredits } from '../_lib/guard.js';
import { issueSession } from '../_lib/session.js';
import { getStore } from '../_lib/store.js';

export const config = { api: { bodyParser: false } };

function routeError(code) {
  return Object.assign(new Error(code), { code });
}

function signupLimit() {
  const n = Number(process.env.JOVI_SIGNUP_LIMIT_PER_IP_DAY || 25);
  return Number.isFinite(n) && n > 0 ? n : 25;
}

function safeInput(body) {
  const credential = body?.credential;
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 6000) {
    return { error: { status: 400, code: 'INVALID_INPUT', message: 'Credencial Google inválida.' } };
  }
  return { input: { credential } };
}

async function verifyGoogleCredential(credential) {
  // Comma-separated on purpose: the Android app and the local web app may be
  // registered as separate OAuth clients, so a token's `aud` can differ.
  const allowedClientIds = String(process.env.GOOGLE_CLIENT_ID || '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!allowedClientIds.length) throw routeError('SERVER_MISCONFIGURED');

  let response;
  try {
    // 8s cap: a hung response from Google fails fast into a clean error.
    response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw routeError('GOOGLE_UNAVAILABLE');
  }
  // tokeninfo answers 400 for a genuinely invalid token. Any other non-2xx
  // (429, 5xx) is an upstream problem, not proof the credential is bad.
  if (response.status !== 400 && !response.ok) throw routeError('GOOGLE_UNAVAILABLE');
  const profile = await response.json().catch(() => ({}));
  const valid = response.ok
    && allowedClientIds.includes(profile.aud)
    && ['accounts.google.com', 'https://accounts.google.com'].includes(profile.iss)
    && profile.email_verified === 'true'
    && Number(profile.exp || 0) * 1000 > Date.now()
    && profile.sub;
  if (!valid) throw routeError('GOOGLE_TOKEN_INVALID');
  return profile;
}

function createSession(profile) {
  try {
    return issueSession({ sub: profile.sub, email: profile.email });
  } catch (error) {
    // Only local dev may run without a session secret; on Vercel the guard
    // already fails closed before reaching this point.
    if (error?.code !== 'SESSION_NOT_CONFIGURED' || process.env.VERCEL) throw routeError('SERVER_MISCONFIGURED');
    return undefined;
  }
}

export default defineRoute({
  method: 'POST',
  scope: 'auth',
  burstPerMinute: 10,
  auth: 'none',
  integrity: true,
  cost: 0,
  byok: 'forbidden',
  validate: safeInput,
  run: async ({ credential }, ctx) => {
    const profile = await verifyGoogleCredential(credential);
    const store = getStore();
    const initial = freeCredits();

    const isNew = await store.initCredits(profile.sub, initial);
    if (isNew) {
      const utcDate = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const signups = await store.hit(`signup:${ctx.ip}:${utcDate}`, 86400);
      if (signups > signupLimit()) {
        await store.del(`credits:${profile.sub}`);
        throw routeError('SIGNUP_LIMITED');
      }
    }

    return {
      user: {
        id: profile.sub,
        name: profile.name || profile.given_name || 'Usuário Google',
        email: profile.email,
        picture: profile.picture || '',
      },
      session: createSession(profile),
      creditsRemaining: await store.getCredits(profile.sub, initial),
    };
  },
});
