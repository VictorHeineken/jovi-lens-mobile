import { hasValidApiKey, isDailyLimited, isRateLimited } from '../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido.' });

  // Every other endpoint is rate limited and this one was not, which mattered more
  // than it looks: it is unauthenticated by definition (it is what establishes who
  // the caller is) and each call makes an outbound request to Google, so an
  // unthrottled route here is a free way to hammer that dependency from our IP.
  if (isRateLimited(req, { scope: 'apikey', max: 20 }) || !hasValidApiKey(req)) return res.status(401).json({ code: 'API_KEY_INVALID', message: 'Acesso não autorizado.' });
  if (isRateLimited(req, { scope: 'auth', max: 10 })) return res.status(429).json({ code: 'AI_RATE_LIMITED', message: 'Muitas tentativas de login em sequência. Tente novamente em instantes.' });
  if (isDailyLimited(req, { scope: 'auth', max: 60 })) return res.status(429).json({ code: 'AI_RATE_LIMITED', message: 'O limite diário de tentativas de login foi atingido.' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).json({ message: 'Google Sign-In ainda não está configurado no servidor.' });
  const credential = req.body?.credential;
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 6000) return res.status(400).json({ message: 'Credencial Google inválida.' });

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
    if (!response.ok || profile.aud !== clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(profile.iss) || profile.email_verified !== 'true' || Number(profile.exp || 0) * 1000 <= Date.now()) return res.status(401).json({ message: 'Token Google inválido para este aplicativo.' });
    return res.status(200).json({
      user: {
        id: profile.sub,
        name: profile.name || profile.given_name || 'Usuário Google',
        email: profile.email,
        picture: profile.picture || '',
      },
    });
  } catch {
    return res.status(500).json({ message: 'Não foi possível validar a conta Google.' });
  }
}
