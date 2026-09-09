// The web app's services call `fetch('/api/...')` with a relative URL, which
// resolves against the page's own origin — free in a browser, meaningless in
// React Native (there is no origin). Every backend call here goes through
// apiUrl() instead, which prefixes EXPO_PUBLIC_API_BASE_URL (set in the
// repo-root .env — see .env.example; point it at your machine's LAN IP for
// `npm run dev:api` on web, or at the deployed backend).
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';

export function apiUrl(path) {
  if (!API_BASE_URL) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL não configurada. Defina-a no .env na raiz do repositório: EXPO_PUBLIC_API_BASE_URL=http://SEU_IP_LOCAL:8787 (ou a URL do backend publicado) — veja .env.example.'
    );
  }
  return `${API_BASE_URL}${path}`;
}
