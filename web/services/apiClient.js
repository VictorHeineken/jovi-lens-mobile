// Attaches the shared x-api-key header (see auth-plan.md Phase 1) and, when
// signed in, the account session (Phase 2 — see services/googleAuth.js) as
// Authorization: Bearer, so every backend call gets both without each service
// file repeating the headers. The web app calls relative /api/... paths
// (same-origin, proxied to the local API by web/vite.config.js in dev — see
// services/apiClient.js for the RN equivalent, which needs an absolute base
// URL instead).
import { getSessionToken, setSessionToken } from './storage.js';

export function apiFetch(path, options = {}) {
  const headers = { ...options.headers };
  if (import.meta.env.VITE_JOVI_API_KEY) headers['x-api-key'] = import.meta.env.VITE_JOVI_API_KEY;
  const session = getSessionToken();
  if (session) headers['Authorization'] = `Bearer ${session}`;
  return fetch(path, { ...options, headers });
}

export { getSessionToken, setSessionToken };
