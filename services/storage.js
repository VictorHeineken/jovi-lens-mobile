const DB_NAME = 'jovi-mobile';
const DB_VERSION = 1;
const STORE = 'media';
const NOTES_KEY = 'jovi_mobile_notes_v2';
const HISTORY_KEY = 'jovi_mobile_ai_history_v1';
const PLAN_KEY = 'jovi_mobile_plan_v1';
const USER_KEY = 'jovi_mobile_user_v1';
const SUBJECT_KEY = 'jovi_mobile_subject_artifacts_v1';
const LEARNING_PREFERENCES_KEY = 'jovi_mobile_learning_preferences_v1';

export const DEFAULT_LEARNING_PREFERENCES = {
  videoStyle: 'animated',
  duration: 'standard',
  level: 'intermediate',
  sort: 'relevance',
};

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const request = action(store);
    let result;
    let settled = false;
    const close = () => db.close();
    const fail = (error) => {
      if (settled) return;
      settled = true;
      close();
      reject(error || new Error('IndexedDB transaction failed.'));
    };

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => fail(request.error);
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error || new Error('IndexedDB transaction aborted.'));
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      close();
      resolve(result);
    };
  });
}

export async function getAllMediaRecords() {
  try {
    const result = await withStore('readonly', (store) => store.getAll());
    return (result || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch {
    return [];
  }
}

export async function saveMediaRecord(record) {
  try {
    await withStore('readwrite', (store) => store.put(record));
  } catch {
    // The app stays usable even when private browsing blocks IndexedDB.
  }
  return record;
}

export async function deleteMediaRecord(id) {
  try {
    await withStore('readwrite', (store) => store.delete(id));
  } catch {
    // Ignore storage failures in prototype mode.
  }
}

export async function clearMediaRecords() {
  try {
    await withStore('readwrite', (store) => store.clear());
  } catch {
    // Ignore storage failures in prototype mode.
  }
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}

// Guarded writer: quota-exceeded or private-mode throws must not crash the app.
// Returns whether the write actually landed, so callers doing an optimistic
// state update (e.g. saveNote) can tell a real success from a silent failure.
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const getNotes = () => readJson(NOTES_KEY, []);
export const setNotes = (notes) => writeJson(NOTES_KEY, notes);
export const getHistory = () => readJson(HISTORY_KEY, []);
export const setHistory = (history) => writeJson(HISTORY_KEY, history);
export const getPlan = () => readJson(PLAN_KEY, { type: 'free' });
export const setPlan = (plan) => writeJson(PLAN_KEY, plan);
export const getUser = () => readJson(USER_KEY, null);
export const setUser = (user) => { try { user ? localStorage.setItem(USER_KEY, JSON.stringify(user)) : localStorage.removeItem(USER_KEY); } catch { /* storage unavailable */ } };

// Subject artifacts: generated plan/exam/scripts + last exam result, keyed by matéria.
export const getSubjectArtifacts = () => readJson(SUBJECT_KEY, {});
export const setSubjectArtifacts = (artifacts) => writeJson(SUBJECT_KEY, artifacts);
export const getLearningPreferences = () => ({ ...DEFAULT_LEARNING_PREFERENCES, ...readJson(LEARNING_PREFERENCES_KEY, {}) });
export const setLearningPreferences = (preferences) => writeJson(LEARNING_PREFERENCES_KEY, { ...DEFAULT_LEARNING_PREFERENCES, ...preferences });
