import { runSubjectAI } from './_lib/ai/service.js';
import { errorResponse, hasValidApiKey, isDailyLimited, isRateLimited, sessionUser } from './_lib/http.js';

const VALID_ACTIONS = new Set(['questions', 'exam', 'plan', 'podcast-script', 'lesson-script']);
const MAX_NOTES = 40;

function safePreferences(preferences = {}) {
  const calendarEvents = Array.isArray(preferences.studyCalendar?.events) ? preferences.studyCalendar.events.slice(0, 5).map((event) => ({
    id: typeof event?.id === 'string' ? event.id.slice(0, 120) : '',
    type: event?.type === 'assignment' ? 'assignment' : 'exam',
    subject: typeof event?.subject === 'string' ? event.subject.slice(0, 80) : '',
    title: typeof event?.title === 'string' ? event.title.slice(0, 160) : '',
    startsAt: typeof event?.startsAt === 'string' ? event.startsAt.slice(0, 80) : '',
    topics: Array.isArray(event?.topics) ? event.topics.filter((topic) => typeof topic === 'string').slice(0, 8).map((topic) => topic.slice(0, 80)) : [],
  })).filter((event) => event.title && event.startsAt) : [];
  return {
    studyGoal: ['vestibular', 'enem', 'school_exam', 'general'].includes(preferences.studyGoal) ? preferences.studyGoal : 'vestibular',
    studyContext: ['classes', 'exam_season', 'catch_up', 'maintenance'].includes(preferences.studyContext) ? preferences.studyContext : 'classes',
    weeklyPace: ['light', 'regular', 'intense'].includes(preferences.weeklyPace) ? preferences.weeklyPace : 'regular',
    practiceMode: ['concept_first', 'questions_first', 'mixed'].includes(preferences.practiceMode) ? preferences.practiceMode : 'mixed',
    reviewMethod: ['spaced', 'retrieval', 'interleaved', 'flashcards'].includes(preferences.reviewMethod) ? preferences.reviewMethod : 'spaced',
    videoStyle: ['animated', 'balanced', 'calm', 'exam'].includes(preferences.videoStyle) ? preferences.videoStyle : 'balanced',
    duration: ['short', 'standard', 'long'].includes(preferences.duration) ? preferences.duration : 'standard',
    level: ['beginner', 'intermediate', 'advanced'].includes(preferences.level) ? preferences.level : 'intermediate',
    sort: ['relevance', 'viewCount', 'date'].includes(preferences.sort) ? preferences.sort : 'relevance',
    studyCalendar: calendarEvents.length ? {
      provider: preferences.studyCalendar?.provider === 'outlook' ? 'outlook' : 'outlook',
      syncedAt: typeof preferences.studyCalendar?.syncedAt === 'string' ? preferences.studyCalendar.syncedAt.slice(0, 80) : '',
      events: calendarEvents,
    } : null,
  };
}

function safeInput(body) {
  const action = VALID_ACTIONS.has(body?.action) ? body.action : 'questions';
  const subject = body?.subject && typeof body.subject === 'object' ? body.subject : null;
  if (!subject) return { error: { status: 400, message: 'Contexto da matéria ausente.' } };

  const name = typeof subject.name === 'string' ? subject.name.trim().slice(0, 80) : (typeof subject.subject === 'string' ? subject.subject.trim().slice(0, 80) : '');
  const rawNotes = Array.isArray(subject.notes) ? subject.notes.slice(0, MAX_NOTES) : [];
  const notes = rawNotes.map((note) => ({
    title: typeof note?.title === 'string' ? note.title.slice(0, 160) : '',
    summary: typeof note?.summary === 'string' ? note.summary.slice(0, 900) : '',
    text: typeof note?.text === 'string' ? note.text.slice(0, 1200) : '',
    keyPoints: Array.isArray(note?.keyPoints) ? note.keyPoints.filter((p) => typeof p === 'string').slice(0, 6).map((p) => p.slice(0, 300)) : [],
    subtheme: typeof note?.subtheme === 'string' ? note.subtheme.slice(0, 80) : (typeof note?.subcategory === 'string' ? note.subcategory.slice(0, 80) : ''),
    topicPath: Array.isArray(note?.topicPath) ? note.topicPath.filter((t) => typeof t === 'string').slice(0, 4) : [],
  }));

  if (!name && !notes.length) return { error: { status: 400, message: 'Salve ao menos uma nota nesta matéria para gerar este conteúdo.' } };

  const format = ['dialogue', 'single', 'drive'].includes(subject.format) ? subject.format : undefined;
  return { action, subject: { name: name || 'Matéria', notes, format }, preferences: safePreferences(body?.preferences) };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido.' });
  if (isRateLimited(req, { scope: 'apikey', max: 20 }) || !hasValidApiKey(req)) return res.status(401).json({ code: 'API_KEY_INVALID', message: 'Acesso não autorizado.' });
  const { provided: hasSession, user: sessionOwner } = sessionUser(req);
  if (hasSession && !sessionOwner) return res.status(401).json({ code: 'SESSION_INVALID', message: 'Sessão expirada. Faça login novamente.' });
  if (isRateLimited(req, { scope: 'subject', max: 10 })) return res.status(429).json({ code: 'AI_RATE_LIMITED', message: 'Muitos pedidos em sequência. Tente novamente em instantes.' });
  if (isDailyLimited(req, { scope: 'subject', max: 40 })) return res.status(429).json({ code: 'AI_RATE_LIMITED', message: 'O limite diário do Estúdio foi atingido. Tente novamente amanhã.' });

  const input = safeInput(req.body || {});
  if (input.error) return res.status(input.error.status).json({ message: input.error.message });

  try {
    const result = await runSubjectAI({ action: input.action, subject: input.subject, preferences: input.preferences });
    return res.status(200).json(result);
  } catch (error) {
    const mapped = errorResponse(error);
    console.error('JOVI Lens subject AI failed', { action: input.action, code: error?.code || 'UNKNOWN', status: error?.status });
    return res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
  }
}
