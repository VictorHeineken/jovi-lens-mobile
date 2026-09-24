import { getSubjectDemo } from '../shared/demoResponses.js';
import { isDemoMode } from './env.js';
import { apiRequest } from './apiClient.js';
import { getLearningPreferences, getStudyCalendar } from './storage.js';
import { eventsForSubject, normalizeStudyCalendar } from '../shared/studyCalendar.js';

// Only the request half lives here. The subject aggregation is identical on both
// clients and lives in shared/subjects.js; this file keeps what is genuinely
// native-specific — the absolute API base URL and the EXPO_PUBLIC_ demo flag.

// action ∈ questions | exam | plan | podcast-script | lesson-script
export async function generateSubjectContent(subject, { action, format } = {}) {
  const payloadSubject = { name: subject.name, notes: subject.notes, ...(format ? { format } : {}) };
  const studyCalendar = normalizeStudyCalendar(getStudyCalendar());
  const preferences = {
    ...getLearningPreferences(),
    studyCalendar: studyCalendar.connected ? {
      provider: studyCalendar.provider,
      account: studyCalendar.account,
      syncedAt: studyCalendar.syncedAt,
      events: eventsForSubject(studyCalendar, payloadSubject.name),
    } : null,
  };

  if (isDemoMode()) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { ...getSubjectDemo({ action, subject: payloadSubject, preferences }), provider: 'demo', model: 'jovi-lens-demo', mode: 'demo' };
  }

  return apiRequest('/api/subject-ai', {
    body: { action, subject: payloadSubject, preferences },
    idempotent: true,
  });
}
