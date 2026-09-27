import { createHash } from 'node:crypto';
import { guardAiRequest } from '../_lib/http.js';
import { issueSession } from '../_lib/session.js';

// Each Google id_token is exchanged for a session at most once. The nonce
// alone cannot stop a replay: it travels inside the token's readable payload,
// so whoever holds the token can present it too. The cache is keyed on the
// token's own claims (not its raw text, which could be re-encoded) and kept
// until it expires — per process; a multi-instance deployment needs a shared
// store here.
const usedCredentials = new Map();

function tokenKey(profile) {
  return createHash('sha256').update(`${profile.sub}|${profile.iat}|${profile.exp}|${profile.nonce || ''}`).digest('hex');
}

function claimOnce(key, expMs) {
  const now = Date.now();
  for (const [hash, until] of usedCredentials) if (until <= now) usedCredentials.delete(hash);
  if (usedCredentials.has(key)) return false;
  usedCredentials.set(key, expMs);
  return true;
}

export default async function handler(req, res) {
  // Rate limited even though it is unauthenticated by definition: each call makes
  // an outbound request to Google, so an unthrottled route here is a free way to
  // hammer that dependency from our IP. No session check — this is where an
  // expired session comes to be replaced, so rejecting a stale Bearer here
  // would lock the user out of signing back in.
  if (guardAiRequest(req, res, {
    scope: 'auth',
    perMinute: 10,
    perDay: 60,
    checkSession: false,
    burstMessage: 'Muitas tentativas de login em sequência. Tente novamente em instantes.',
    dailyMessage: 'O limite diário de tentativas de login foi atingido.',
  })) return;

  // Comma-separated on purpose: the web app (Google Identity Services) and the
  // RN app (expo-auth-session's browser OAuth flow) are registered as separate
  // Google Cloud OAuth clients, so a token's `aud` legitimately differs by
  // platform — this checks membership instead of equality against one value.
  const allowedClientIds = String(process.env.GOOGLE_CLIENT_ID || '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!allowedClientIds.length) return res.status(503).json({ message: 'Google Sign-In ainda não está configurado no servidor.' });
  const credential = req.body?.credential;
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 6000) return res.status(400).json({ message: 'Credencial Google inválida.' });
  // The native client sends the nonce it asked Google to embed; a mismatch means
  // the token was minted for a different sign-in (an injected token). This is
  // not replay protection — see claimOnce() above. Optional so the web (GIS)
  // flow, which does not send one, keeps working.
  const nonce = typeof req.body?.nonce === 'string' ? req.body.nonce.slice(0, 200) : '';

  try {
    // 8s cap: without it a hung response from Google holds this handler open
    // indefinitely instead of failing fast into a clean error.
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(8000) });
    // Google's tokeninfo returns 400 with an error body for a genuinely malformed
    // or invalid token (confirmed: {"error":"invalid_token", ...}). Any OTHER
    // non-2xx — 429 rate-limited, 5xx — is an upstream problem, not proof the
    // credential is bad. Collapsing both into "Token Google inválido" told a real
    // user their account was broken during a transient Google-side hiccup, and
    // encouraged retries that only ate into this endpoint's own rate limit.
    if (response.status !== 400 && !response.ok) return res.status(502).json({ message: 'Não foi possível validar com o Google agora. Tente novamente.' });
    const profile = await response.json();
    if (!response.ok || !allowedClientIds.includes(profile.aud) || !['accounts.google.com', 'https://accounts.google.com'].includes(profile.iss) || profile.email_verified !== 'true' || Number(profile.exp || 0) * 1000 <= Date.now() || (nonce && profile.nonce !== nonce)) return res.status(401).json({ message: 'Token Google inválido para este aplicativo.' });

    // Checked only after Google accepted the token, so a burst of garbage
    // cannot fill the cache.
    const key = tokenKey(profile);
    if (!claimOnce(key, Number(profile.exp) * 1000)) return res.status(401).json({ message: 'Esta credencial Google já foi usada. Entre novamente.' });

    let session;
    try {
      session = issueSession({ sub: profile.sub, email: profile.email });
    } catch (error) {
      // JOVI_SESSION_SECRET unset: sign-in itself still works (the client gets
      // a profile to show), but per-account quotas stay on IP-based limiting
      // until the secret is configured — same "optional until configured"
      // pattern as GOOGLE_CLIENT_ID/JOVI_API_KEY elsewhere in this file.
      if (error?.code !== 'SESSION_NOT_CONFIGURED') {
        usedCredentials.delete(key); // an internal failure must not burn the user's token
        throw error;
      }
    }

    return res.status(200).json({
      user: {
        id: profile.sub,
        name: profile.name || profile.given_name || 'Usuário Google',
        email: profile.email,
        picture: profile.picture || '',
      },
      session,
    });
  } catch {
    return res.status(500).json({ message: 'Não foi possível validar a conta Google.' });
  }
}
