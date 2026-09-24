// Exam reminder schedule (prod-implementation-spec.md §6.12): local
// notifications at 19:00 local time, 3 days and 1 day before each exam.
// Pure: services/notifications.js schedules what this returns.
import { formatEventDate } from './studyCalendar.js';

const REMINDER_HOUR = 19;
const OFFSETS_DAYS = [3, 1];
const HORIZON_MS = 60 * 86400000;

export function buildExamReminders(calendar, now = new Date()) {
  const events = Array.isArray(calendar?.events) ? calendar.events : [];
  const reminders = [];
  for (const event of events) {
    if (event?.type !== 'exam') continue;
    const startsAt = new Date(event.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() > now.getTime() + HORIZON_MS) continue;
    const subject = event.subject;
    const topics = Array.isArray(event.topics) ? event.topics : [];
    for (const offsetDays of OFFSETS_DAYS) {
      const fireAt = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate() - offsetDays, REMINDER_HOUR, 0, 0, 0);
      if (fireAt <= now) continue;
      reminders.push({
        id: `exam-${event.id}-${offsetDays}d`,
        fireAt,
        title: offsetDays === 3 ? `Prova de ${subject} em 3 dias` : `Prova de ${subject} amanhã`,
        body: `${event.title} · ${formatEventDate(event)}. Revise ${topics.slice(0, 2).join(' e ') || 'os principais tópicos'} hoje.`,
        data: { subject },
      });
    }
  }
  return reminders.sort((a, b) => a.fireAt - b.fireAt);
}
