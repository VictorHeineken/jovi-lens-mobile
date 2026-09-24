// Local exam reminders (prod-implementation-spec.md §6.12). Scheduling is
// idempotent: syncExamReminders() reconciles the scheduled "exam-*"
// notifications with what buildExamReminders() wants for the calendar.
import * as Notifications from 'expo-notifications';
import { buildExamReminders } from '../shared/examReminders.js';
import { getNotificationSettings, setNotificationSettings } from './storage.js';

const CHANNEL_ID = 'exam-reminders';
const ID_PREFIX = 'exam-';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export function getExamRemindersEnabled() {
  return Boolean(getNotificationSettings()?.examReminders);
}

function setExamRemindersEnabled(enabled) {
  setNotificationSettings({ ...(getNotificationSettings() || {}), examReminders: enabled });
}

export function setupChannel() {
  return Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: 'Lembretes de prova', importance: Notifications.AndroidImportance.HIGH });
}

async function scheduledExamIds() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.map((item) => item.identifier).filter((id) => id.startsWith(ID_PREFIX));
}

export async function cancelExamReminders() {
  await Promise.all((await scheduledExamIds()).map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}

// Resolves 'enabled' or 'denied'.
export async function enableExamReminders(calendar) {
  await setupChannel();
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return 'denied';
  setExamRemindersEnabled(true);
  await syncExamReminders(calendar);
  return 'enabled';
}

export async function disableExamReminders() {
  setExamRemindersEnabled(false);
  await cancelExamReminders();
}

export async function syncExamReminders(calendar) {
  if (!getExamRemindersEnabled()) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;

  const desired = buildExamReminders(calendar, new Date());
  const desiredIds = new Set(desired.map((item) => item.id));
  const existing = await scheduledExamIds();
  await Promise.all(existing.filter((id) => !desiredIds.has(id)).map((id) => Notifications.cancelScheduledNotificationAsync(id)));

  const existingIds = new Set(existing);
  for (const reminder of desired) {
    if (existingIds.has(reminder.id)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: { title: reminder.title, body: reminder.body, data: reminder.data },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.fireAt, channelId: CHANNEL_ID },
    });
  }
}
