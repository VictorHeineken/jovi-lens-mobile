// Google Identity Services (https://accounts.google.com/gsi/client) — the
// standard web Sign-In flow: no redirect, no code exchange, no client secret.
// See auth-plan.md Phase 2.
import { apiFetch } from './apiClient.js';
import { setSessionToken } from './storage.js';

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise = null;

function loadScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Não foi possível carregar o login do Google.'));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export function isGoogleSignInConfigured() {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
}

// Renders Google's own Sign In button into `container`. `onResult` receives
// { user } on success or { error } on failure — the id_token → session
// exchange happens here so callers only handle the outcome.
export async function renderGoogleSignInButton(container, onResult) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId || !container) return;
  await loadScript();
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: async ({ credential }) => {
      try {
        const response = await apiFetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível entrar com o Google.');
        setSessionToken(payload.session || null);
        onResult({ user: payload.user });
      } catch (error) {
        onResult({ error: error.message || 'Não foi possível entrar com o Google.' });
      }
    },
  });
  window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with' });
}

export function signOutGoogle() {
  setSessionToken(null);
  window.google?.accounts?.id?.disableAutoSelect?.();
}
