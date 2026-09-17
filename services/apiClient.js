// The web app's services call `fetch('/api/...')` with a relative URL, which
// resolves against the page's own origin — free in a browser, meaningless in
// React Native (there is no origin). Every backend call here goes through
// apiUrl() instead, which prefixes EXPO_PUBLIC_API_BASE_URL (set in the
// repo-root .env — see .env.example; point it at your machine's LAN IP for
// `npm run dev:api` on web, or at the deployed backend).
import { getSessionToken, setSessionToken } from './storage.js';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';

export function apiUrl(path) {
  if (!API_BASE_URL) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL não configurada. Defina-a no .env na raiz do repositório: EXPO_PUBLIC_API_BASE_URL=http://SEU_IP_LOCAL:8787 (ou a URL do backend publicado) — veja .env.example.'
    );
  }
  return `${API_BASE_URL}${path}`;
}

// Attaches the shared x-api-key header (see auth-plan.md Phase 1) and, when
// signed in, the account session (Phase 2 — see services/googleAuth.js) as
// Authorization: Bearer, so every backend call gets both without each service
// file repeating the headers.
export function apiFetch(path, options = {}) {
  const headers = { ...options.headers };
  if (process.env.EXPO_PUBLIC_JOVI_API_KEY) headers['x-api-key'] = process.env.EXPO_PUBLIC_JOVI_API_KEY;
  const session = getSessionToken();
  if (session) headers['Authorization'] = `Bearer ${session}`;
  return fetch(apiUrl(path), { ...options, headers });
}

export { getSessionToken, setSessionToken };
