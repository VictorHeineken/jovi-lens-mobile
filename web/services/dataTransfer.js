import { getDismissedSeedNotes } from './storage.js';

const BACKUP_VERSION = 1;
// Same ceiling as the native app, whose backups embed photos — a phone backup
// has to be importable here too.
const MAX_IMPORT_BYTES = 120 * 1024 * 1024;

export function createBackup({ records = [], notes = [], aiHistory = [], plan = { type: 'free' }, user = null, subjectArtifacts = {}, learningPreferences = {}, studyCalendar = null } = {}) {
  return {
    app: 'jovi-lens',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    records: records.filter((record) => record?.source !== 'sample'),
    notes,
    // Examples the student deleted — without it a restore brought them all back.
    dismissedSeedNotes: getDismissedSeedNotes(),
    aiHistory,
    plan,
    user,
    subjectArtifacts,
    learningPreferences,
    studyCalendar,
  };
}

export function downloadBackup(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `jovi-lens-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function listOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

export async function readBackupFile(file) {
  if (!file || file.size > MAX_IMPORT_BYTES) throw new Error('Esse backup é grande demais para importar.');
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('O arquivo selecionado não é um backup JSON válido.');
  }
  if (data?.app !== 'jovi-lens' || data?.version !== BACKUP_VERSION) throw new Error('Backup incompatível com esta versão do JOVI Lens.');
  return {
    records: listOrEmpty(data.records).filter((record) => record && typeof record.id === 'string' && /^[\w-]{1,80}$/.test(record.id) && typeof record.src === 'string' && (record.src.startsWith('data:') || record.src.startsWith('/demo-assets/'))),
    notes: listOrEmpty(data.notes).filter((note) => note && typeof note.id === 'string' && typeof note.title === 'string'),
    dismissedSeedNotes: listOrEmpty(data.dismissedSeedNotes).filter((id) => typeof id === 'string'),
    aiHistory: listOrEmpty(data.aiHistory),
    plan: data.plan && typeof data.plan === 'object' ? data.plan : { type: 'free' },
    user: data.user && typeof data.user === 'object' ? data.user : null,
    subjectArtifacts: data.subjectArtifacts && typeof data.subjectArtifacts === 'object' ? data.subjectArtifacts : {},
    learningPreferences: data.learningPreferences && typeof data.learningPreferences === 'object' ? data.learningPreferences : {},
    studyCalendar: data.studyCalendar && typeof data.studyCalendar === 'object' ? data.studyCalendar : null,
  };
}
