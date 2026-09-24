import { runSubjectAI } from './_lib/ai/service.js';
import { defineRoute } from './_lib/guard.js';

export const config = { api: { bodyParser: false } };

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
      provider: preferences.studyCalendar?.provider === 'outlook' ? 'outlook' : 'google',
      syncedAt: typeof preferences.studyCalendar?.syncedAt === 'string' ? preferences.studyCalendar.syncedAt.slice(0, 80) : '',
      events: calendarEvents,
    } : null,
  };
}

function safeInput(body) {
  const action = VALID_ACTIONS.has(body?.action) ? body.action : 'questions';
  const subject = body?.subject && typeof body.subject === 'object' ? body.subject : null;
  if (!subject) return { error: { status: 400, code: 'INVALID_INPUT', message: 'Contexto da matéria ausente.' } };

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

  if (!name && !notes.length) return { error: { status: 400, code: 'INVALID_INPUT', message: 'Salve ao menos uma nota nesta matéria para gerar este conteúdo.' } };

  const format = ['dialogue', 'single', 'drive'].includes(subject.format) ? subject.format : undefined;
  return { input: { action, subject: { name: name || 'Matéria', notes, format }, preferences: safePreferences(body?.preferences) } };
}

export default defineRoute({
  method: 'POST',
  scope: 'subject',
  burstPerMinute: 10,
  auth: 'session',
  integrity: true,
  cost: 1,
  byok: 'optional',
  validate: safeInput,
  run: (input, ctx) => runSubjectAI({ ...input, credentials: ctx.byok }),
});
