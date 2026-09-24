// Native Google sign-in (original API of @react-native-google-signin). The
// Google id_token is exchanged once at /api/auth/google for an app session;
// when that session expires the client re-runs a silent Google sign-in.
import {
  GoogleSignin,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { apiRequest } from './apiClient.js';
import { loadByok, refresh, reset, setCredits } from './aiAccess.js';
import { isDemoMode } from './env.js';
import { setSessionToken, setUser } from './storage.js';

if (!isDemoMode()) GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });

// AppDataContext mirrors the signed-in user; it subscribes here so sign-in
// from anywhere (profile, the sign-in prompt, session recovery) updates it.
const userListeners = new Set();

export function subscribeUser(listener) {
  userListeners.add(listener);
  return () => userListeners.delete(listener);
}

function applyUser(user) {
  setUser(user);
  userListeners.forEach((listener) => listener(user));
}

async function exchange(idToken) {
  const res = await apiRequest('/api/auth/google', { body: { credential: idToken }, useByok: false, recover: false });
  setSessionToken(res.session || null);
  setCredits(res.creditsRemaining);
  return res.user;
}

// Resolves to the signed-in user, or null when the user cancelled.
export async function signIn() {
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    const user = await exchange(response.data.idToken);
    applyUser(user);
    await loadByok();
    refresh();
    return user;
  } catch (error) {
    if (error?.name === 'ApiError') throw error;
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.IN_PROGRESS) return null;
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Atualize o Google Play Services para entrar.');
    }
    throw new Error('Não foi possível entrar com o Google.');
  }
}

// Silent re-sign-in after the app session expires. Never recurses into
// apiClient's own session recovery.
export async function refreshSession() {
  try {
    const response = await GoogleSignin.signInSilently();
    if (isNoSavedCredentialFoundResponse(response)) return false;
    const user = await exchange(response.data.idToken);
    applyUser(user);
    return true;
  } catch {
    return false;
  }
}

// Clears the local session without touching Google (used when recovery fails).
export function signOutLocal() {
  setSessionToken(null);
  applyUser(null);
  reset();
}

// BYOK keys stay in secure store under the account, so signing back in with
// the same Google account brings the key back.
export async function signOut() {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Ignore: the local sign-out below is what matters.
  }
  signOutLocal();
}
