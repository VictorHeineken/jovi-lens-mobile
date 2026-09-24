import { getSubjectDemo } from '../../shared/demoResponses.js';
import { isDemoMode } from './imageAnalysis.js';
import { apiFetch } from './apiClient.js';
import { getLearningPreferences, getStudyCalendar } from './storage.js';
import { eventsForSubject, normalizeStudyCalendar } from '../../shared/studyCalendar.js';

// Only the request half lives here. The subject aggregation is identical on both
// clients and lives in shared/subjects.js; this file keeps what is genuinely
// web-specific — the relative API path (resolved against the page origin, proxied
// in dev by vite.config.js) and the VITE_ demo flag.

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
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    return { ...getSubjectDemo({ action, subject: payloadSubject, preferences }), provider: 'demo', model: 'jovi-lens-demo', mode: 'demo' };
  }

  let response;
  try {
    response = await apiFetch('/api/subject-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, subject: payloadSubject, preferences }),
    });
  } catch {
    throw new Error('Sem conexão no momento. Confira a internet ou ative o modo demonstração.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || 'Não foi possível gerar este conteúdo agora.'), { code: data.code });
  return data;
}
