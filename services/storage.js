const DB_NAME = 'jovi-mobile';
const DB_VERSION = 1;
const STORE = 'media';
const NOTES_KEY = 'jovi_mobile_notes_v2';
const HISTORY_KEY = 'jovi_mobile_ai_history_v1';
const PLAN_KEY = 'jovi_mobile_plan_v1';
const USER_KEY = 'jovi_mobile_user_v1';
const SUBJECT_KEY = 'jovi_mobile_subject_artifacts_v1';

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
    const store = tx.objectStore(storeName);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
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

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}

// Guarded writer: quota-exceeded or private-mode throws must not crash the app.
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* keep app usable when storage is unavailable */ }
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
