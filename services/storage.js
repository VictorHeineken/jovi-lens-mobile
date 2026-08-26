const DB_NAME = 'jovi-mobile';
const DB_VERSION = 1;
const STORE = 'media';
const NOTES_KEY = 'jovi_mobile_notes_v1';
const PLAN_KEY = 'jovi_mobile_plan_v1';
const USER_KEY = 'jovi_mobile_user_v1';

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

export const getNotes = () => readJson(NOTES_KEY, []);
export const setNotes = (notes) => localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
export const getPlan = () => readJson(PLAN_KEY, { type: 'free' });
export const setPlan = (plan) => localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
export const getUser = () => readJson(USER_KEY, null);
export const setUser = (user) => user ? localStorage.setItem(USER_KEY, JSON.stringify(user)) : localStorage.removeItem(USER_KEY);
