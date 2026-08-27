export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).json({ message: 'Google Sign-In ainda não está configurado no servidor.' });
  const credential = req.body?.credential;
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 6000) return res.status(400).json({ message: 'Credencial Google inválida.' });

  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
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
