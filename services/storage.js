import * as FileSystem from 'expo-file-system';
import { MMKV } from 'react-native-mmkv';

// Same key/value interface as the web app's services/storage.js (backed by
// localStorage + IndexedDB there). MMKV is used instead of AsyncStorage
// because it's synchronous, like localStorage — that lets every getX()/setX()
// below keep the exact same synchronous signature, so context/AppDataContext.jsx
// ports with no async refactor. It's a native module either way (not available
// in Expo Go), which this project already accepts for the camera/dictation
// libraries — see react-native-migration-plan.md.

const storage = new MMKV({ id: 'jovi-lens' });

const NOTES_KEY = 'jovi_mobile_notes_v2';
const HISTORY_KEY = 'jovi_mobile_ai_history_v1';
const PLAN_KEY = 'jovi_mobile_plan_v1';
const USER_KEY = 'jovi_mobile_user_v1';
const SUBJECT_KEY = 'jovi_mobile_subject_artifacts_v1';
const LEARNING_PREFERENCES_KEY = 'jovi_mobile_learning_preferences_v1';
const MEDIA_INDEX_KEY = 'jovi_mobile_media_index_v1';

export const MEDIA_DIR = `${FileSystem.documentDirectory}jovi-media/`;

export async function ensureMediaDirExists() {
  const info = await FileSystem.getInfoAsync(MEDIA_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
}

export const DEFAULT_LEARNING_PREFERENCES = {
  videoStyle: 'animated',
  duration: 'standard',
  level: 'intermediate',
  sort: 'relevance',
};

function readJson(key, fallback) {
  try {
    const raw = storage.getString(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Guarded writer, mirroring the web version's contract: callers doing an
// optimistic state update (e.g. saveNote) can tell a real success from a
// silent failure (disk full, MMKV unavailable) via the boolean return.
function writeJson(key, value) {
  try {
    storage.set(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function extensionForMediaType(mediaType) {
  return mediaType === 'video' ? 'mp4' : 'jpg';
}

// A freshly captured record's `src` arrives as a data: URI (base64, same
// shape the web camera/upload flow produces). Anything already a file://
// URI (previously persisted) or a bundled/remote asset (samples, http)
// passes through untouched.
async function persistMediaFile(record) {
  if (!record?.src || !record.src.startsWith('data:')) return record;
  const match = /^data:([^;]+);base64,(.*)$/s.exec(record.src);
  if (!match) return record;
  await ensureMediaDirExists();
  const path = `${MEDIA_DIR}${record.id}.${extensionForMediaType(record.mediaType)}`;
  await FileSystem.writeAsStringAsync(path, match[2], { encoding: FileSystem.EncodingType.Base64 });
  return { ...record, src: path };
}

async function deleteMediaFile(src) {
  if (!src || !src.startsWith(MEDIA_DIR)) return;
  try {
    await FileSystem.deleteAsync(src, { idempotent: true });
  } catch {
    // Ignore storage failures in prototype mode.
  }
}

function readMediaIndex() {
  return readJson(MEDIA_INDEX_KEY, []);
}

function writeMediaIndex(records) {
  return writeJson(MEDIA_INDEX_KEY, records);
}

export async function getAllMediaRecords() {
  try {
    const stored = readMediaIndex();
    return [...stored].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch {
    return [];
  }
}

export async function saveMediaRecord(record) {
  try {
    const persisted = await persistMediaFile(record);
    const index = readMediaIndex();
    writeMediaIndex([persisted, ...index.filter((item) => item.id !== persisted.id)]);
    return persisted;
  } catch {
    // The app stays usable even when the filesystem write fails.
    return record;
  }
}

export async function deleteMediaRecord(id) {
  try {
    const index = readMediaIndex();
    const target = index.find((item) => item.id === id);
    writeMediaIndex(index.filter((item) => item.id !== id));
    if (target) await deleteMediaFile(target.src);
  } catch {
    // Ignore storage failures in prototype mode.
  }
}

export async function clearMediaRecords() {
  try {
    const index = readMediaIndex();
    await Promise.all(index.map((item) => deleteMediaFile(item.src)));
    writeMediaIndex([]);
  } catch {
    // Ignore storage failures in prototype mode.
  }
}

export const getNotes = () => readJson(NOTES_KEY, []);
export const setNotes = (notes) => writeJson(NOTES_KEY, notes);
export const getHistory = () => readJson(HISTORY_KEY, []);
export const setHistory = (history) => writeJson(HISTORY_KEY, history);
export const getPlan = () => readJson(PLAN_KEY, { type: 'free' });
export const setPlan = (plan) => writeJson(PLAN_KEY, plan);
export const getUser = () => readJson(USER_KEY, null);
export const setUser = (user) => {
  try {
    if (user) storage.set(USER_KEY, JSON.stringify(user));
    else storage.delete(USER_KEY);
  } catch {
    // storage unavailable
  }
};

// Subject artifacts: generated plan/exam/scripts + last exam result, keyed by matéria.
export const getSubjectArtifacts = () => readJson(SUBJECT_KEY, {});
export const setSubjectArtifacts = (artifacts) => writeJson(SUBJECT_KEY, artifacts);
export const getLearningPreferences = () => ({ ...DEFAULT_LEARNING_PREFERENCES, ...readJson(LEARNING_PREFERENCES_KEY, {}) });
export const setLearningPreferences = (preferences) => writeJson(LEARNING_PREFERENCES_KEY, { ...DEFAULT_LEARNING_PREFERENCES, ...preferences });
