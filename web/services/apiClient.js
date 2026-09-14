// Attaches the shared x-api-key header (see auth-plan.md Phase 1) so every
// backend call gets it without each service file repeating the header. The
// web app calls relative /api/... paths (same-origin, proxied to the local
// API by web/vite.config.js in dev — see services/apiClient.js for the RN
// equivalent, which needs an absolute base URL instead).
export function apiFetch(path, options = {}) {
  const headers = { ...options.headers };
  if (import.meta.env.VITE_JOVI_API_KEY) headers['x-api-key'] = import.meta.env.VITE_JOVI_API_KEY;
  return fetch(path, { ...options, headers });
}
