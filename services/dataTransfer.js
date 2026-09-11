import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const BACKUP_VERSION = 1;
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export function createBackup({ records = [], notes = [], aiHistory = [], plan = { type: 'free' }, user = null, subjectArtifacts = {}, learningPreferences = {} } = {}) {
  return {
    app: 'jovi-lens',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    records: records.filter((record) => record?.source !== 'sample'),
    notes,
    aiHistory,
    plan,
    user,
    subjectArtifacts,
    learningPreferences,
  };
}

// Web downloads via a Blob + synthetic <a download> click — there's no RN
// equivalent of a browser download. Instead: write the JSON to a local file
// and hand it off through the OS share sheet (Save to Files, AirDrop, Drive,
// email, ...) via expo-sharing, matching the plan's decided approach.
export async function downloadBackup(data) {
  const filename = `jovi-lens-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(data, null, 2));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Salvar backup do JOVI Lens' });
  }
  return path;
}

function listOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

// `file` is an expo-document-picker asset ({ uri, size, name, mimeType }),
// not a web File — the caller picks it via DocumentPicker.getDocumentAsync().
export async function readBackupFile(file) {
  if (!file?.uri || (file.size && file.size > MAX_IMPORT_BYTES)) throw new Error('Esse backup é grande demais para importar.');
  let data;
  try {
    data = JSON.parse(await FileSystem.readAsStringAsync(file.uri));
  } catch {
    throw new Error('O arquivo selecionado não é um backup JSON válido.');
  }
  if (data?.app !== 'jovi-lens' || data?.version !== BACKUP_VERSION) throw new Error('Backup incompatível com esta versão do JOVI Lens.');
  return {
    records: listOrEmpty(data.records).filter((record) => record && typeof record.id === 'string' && typeof record.src === 'string'),
    notes: listOrEmpty(data.notes),
    aiHistory: listOrEmpty(data.aiHistory),
    plan: data.plan && typeof data.plan === 'object' ? data.plan : { type: 'free' },
    user: data.user && typeof data.user === 'object' ? data.user : null,
    subjectArtifacts: data.subjectArtifacts && typeof data.subjectArtifacts === 'object' ? data.subjectArtifacts : {},
    learningPreferences: data.learningPreferences && typeof data.learningPreferences === 'object' ? data.learningPreferences : {},
  };
}
