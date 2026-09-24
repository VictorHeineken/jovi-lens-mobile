// AI access state: free credits left on the signed-in Google account and the
// user's own AI key (BYOK). The key lives only in expo-secure-store under the
// account; React state only ever sees the provider and a masked preview.
import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getUser } from './storage.js';
import { isDemoMode } from './env.js';
import { apiRequest } from './apiClient.js';
import { signIn } from './googleAuth.js';

export const BYOK_PROVIDERS = ['gemini', 'openai', 'minimax'];

const CAPABILITIES = {
  gemini: { tts: true, stt: true },
  openai: { tts: true, stt: true },
  minimax: { tts: true, stt: false },
};

let state = { creditsRemaining: null, byok: null };
const listeners = new Set();

function update(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// { creditsRemaining: number|null, byok: { provider, masked } | null }
export function useAiAccess() {
  return useSyncExternalStore(subscribe, () => state);
}

export function getAiAccessState() {
  return state;
}

export function setCredits(n) {
  if (Number.isFinite(n)) update({ creditsRemaining: n });
}

export function reset() {
  update({ creditsRemaining: null, byok: null });
}

export async function refresh() {
  if (!getUser()) return;
  try {
    const me = await apiRequest('/api/me', { method: 'GET', integrity: false, useByok: false });
    setCredits(me.creditsRemaining);
  } catch {
    // Keep the last known value; the next AI call refreshes it via its header.
  }
}

export function capabilitiesFor(provider) {
  return CAPABILITIES[provider] || { tts: false, stt: false };
}

function byokStorageKey() {
  const sub = getUser()?.id;
  return sub ? `byok.${sub}` : null;
}

function mask(apiKey) {
  return `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}`;
}

export async function getByok() {
  const key = byokStorageKey();
  if (!key) return null;
  try {
    const raw = await SecureStore.getItemAsync(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.provider && parsed?.apiKey ? { provider: parsed.provider, apiKey: parsed.apiKey } : null;
  } catch {
    return null;
  }
}

// Loads the masked BYOK summary for the current user into state.
export async function loadByok() {
  const saved = await getByok();
  update({ byok: saved ? { provider: saved.provider, masked: mask(saved.apiKey) } : null });
}

// Validates the key with the provider (through the server) before saving it.
// Throws ApiError (e.g. BYOK_REJECTED, BYOK_INVALID_FORMAT) when it is refused.
export async function saveByok(provider, apiKey) {
  const trimmed = String(apiKey || '').trim();
  const key = byokStorageKey();
  if (!key) throw new Error('Entre com sua conta Google para salvar uma chave.');
  await apiRequest('/api/byok/validate', { body: {}, byok: { provider, apiKey: trimmed } });
  await SecureStore.setItemAsync(key, JSON.stringify({ provider, apiKey: trimmed }));
  update({ byok: { provider, masked: mask(trimmed) } });
}

export async function removeByok() {
  const key = byokStorageKey();
  if (key) await SecureStore.deleteItemAsync(key).catch(() => {});
  update({ byok: null });
}

export function byokHasTts() {
  return Boolean(state.byok && capabilitiesFor(state.byok.provider).tts);
}

export function byokHasStt() {
  return Boolean(state.byok && capabilitiesFor(state.byok.provider).stt);
}

// Call at the top of every user action that triggers an AI request. Never
// called in demo mode.
export function ensureSignedIn() {
  if (getUser()) return true;
  Alert.alert('Entre para usar a IA', 'Entre com sua conta Google para analisar fotos e gerar conteúdo.', [
    { text: 'Agora não', style: 'cancel' },
    {
      text: 'Entrar com Google',
      onPress: () => {
        signIn().catch((error) => Alert.alert('Entrar com Google', error.message || 'Não foi possível entrar com o Google.'));
      },
    },
  ]);
  return false;
}

// Gate for AI actions: the presentation build never needs an account.
export function requireAI() {
  return isDemoMode() || ensureSignedIn();
}
