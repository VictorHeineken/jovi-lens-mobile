// Read-only sync of the signed-in Google account's calendars from the
// device's CalendarContract provider (prod-implementation-spec.md §6.11).
// Nothing is ever written to the calendar; only detected exams/assignments
// become study-calendar events.
import { Linking, PermissionsAndroid } from 'react-native';
import JoviNative from '../modules/jovi-native/index.js';
import { classifyCalendarEvent, DEFAULT_SUBJECTS } from '../shared/examDetection.js';
import { EMPTY_STUDY_CALENDAR } from '../shared/studyCalendar.js';
import { cancelExamReminders, syncExamReminders } from './notifications.js';
import { getCalendarSettings, setCalendarSettings } from './storage.js';

const WINDOW_MS = 60 * 86400000;
const AUTO_SYNC_AFTER_MS = 15 * 60000;

const EMPTY_SETTINGS = { connected: false, account: '', selectedCalendarIds: [], overrides: {}, lastSyncAt: null, pending: [] };

export function readCalendarSettings() {
  return { ...EMPTY_SETTINGS, ...(getCalendarSettings() || {}) };
}

function writeCalendarSettings(patch) {
  const next = { ...readCalendarSettings(), ...patch };
  setCalendarSettings(next);
  return next;
}

export function subjectNamesFrom(subjects = []) {
  return [...new Set([...subjects.map((subject) => subject.name).filter(Boolean), ...DEFAULT_SUBJECTS])];
}

export function openAndroidAccounts() {
  return Linking.sendIntent('android.settings.SYNC_SETTINGS');
}

async function requestCalendarPermission() {
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALENDAR, {
    title: 'Agenda',
    message: 'O JOVI Lens lê (sem alterar) as provas da sua agenda Google para planejar seus estudos.',
    buttonPositive: 'Permitir',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function listAccountCalendars(email) {
  if (!JoviNative?.getAccountCalendars) return [];
  const calendars = await JoviNative.getAccountCalendars(email);
  return [...calendars].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

// Resolves { status: 'connected' } or { status: 'denied' | 'no_calendars', message }.
export async function connectCalendar(email, { subjectNames, setStudyCalendar }) {
  if (!(await requestCalendarPermission())) {
    return { status: 'denied', message: 'Permissão negada. Você pode permitir em Configurações > Apps > JOVI Lens > Permissões.' };
  }
  const calendars = await listAccountCalendars(email);
  if (!calendars.length) {
    return { status: 'no_calendars', message: `A conta ${email} não está neste aparelho ou a sincronização da agenda está desativada.` };
  }
  const synced = calendars.filter((calendar) => calendar.visible && calendar.synced).map((calendar) => calendar.id);
  writeCalendarSettings({
    connected: true,
    account: email,
    selectedCalendarIds: synced.length ? synced : calendars.map((calendar) => calendar.id),
  });
  await syncCalendar({ subjectNames, setStudyCalendar });
  return { status: 'connected' };
}

function startsAtFor(instance) {
  if (!instance.allDay) return new Date(instance.begin).toISOString();
  // All-day instances start at UTC midnight; show them at 08:00 local that day.
  const day = new Date(instance.begin);
  return new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 8, 0).toISOString();
}

export async function syncCalendar({ subjectNames, setStudyCalendar }) {
  const settings = readCalendarSettings();
  if (!settings.connected || !JoviNative?.getCalendarInstances) return null;
  const now = Date.now();
  const instances = await JoviNative.getCalendarInstances(settings.selectedCalendarIds, now, now + WINDOW_MS);

  const events = [];
  const pending = [];
  for (const instance of instances) {
    const instanceId = `${instance.eventId}-${instance.begin}`;
    const override = settings.overrides[instanceId] || {};
    if (override.ignored) continue;
    const detected = classifyCalendarEvent({ title: instance.title, description: instance.description }, subjectNames);
    const type = override.type || detected.type;
    if (!type) continue;
    const subject = override.subject || detected.subject;
    const startsAt = startsAtFor(instance);
    if (!subject) {
      pending.push({ instanceId, title: instance.title, startsAt, type });
      continue;
    }
    events.push({
      id: instanceId,
      type,
      source: 'Google Agenda',
      subject,
      title: instance.title,
      startsAt,
      durationMinutes: Math.round((instance.end - instance.begin) / 60000),
      location: instance.location,
      topics: detected.topics,
    });
  }

  const studyCalendar = { connected: true, provider: 'google', account: settings.account, syncedAt: new Date(now).toISOString(), events };
  setStudyCalendar(studyCalendar);
  writeCalendarSettings({ lastSyncAt: new Date(now).toISOString(), pending });
  await syncExamReminders(studyCalendar);
  return studyCalendar;
}

export function shouldAutoSync() {
  const settings = readCalendarSettings();
  if (!settings.connected) return false;
  return !settings.lastSyncAt || Date.now() - new Date(settings.lastSyncAt).getTime() > AUTO_SYNC_AFTER_MS;
}

export function setSelectedCalendars(selectedCalendarIds) {
  return writeCalendarSettings({ selectedCalendarIds });
}

// patch: { subject?, type?, ignored? } for one calendar instance.
export function setEventOverride(instanceId, patch) {
  const settings = readCalendarSettings();
  return writeCalendarSettings({ overrides: { ...settings.overrides, [instanceId]: { ...(settings.overrides[instanceId] || {}), ...patch } } });
}

export async function disconnectCalendar({ setStudyCalendar }) {
  setCalendarSettings(null);
  setStudyCalendar(EMPTY_STUDY_CALENDAR);
  await cancelExamReminders();
  return 'Agenda desconectada. Para revogar a permissão, use as configurações do Android.';
}
