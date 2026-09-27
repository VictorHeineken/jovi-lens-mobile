import { runVideoRecommendations } from './_lib/ai/service.js';
import { errorResponse, guardAiRequest } from './_lib/http.js';

const MAX_NOTES = 40;

function safeInput(body) {
  const subject = body?.subject && typeof body.subject === 'object' ? body.subject : null;
  if (!subject) return { error: { status: 400, message: 'Contexto da matéria ausente.' } };

  const name = typeof subject.name === 'string' ? subject.name.trim().slice(0, 80) : '';
  const rawNotes = Array.isArray(subject.notes) ? subject.notes.slice(0, MAX_NOTES) : [];
  const notes = rawNotes.map((note) => ({
    title: typeof note?.title === 'string' ? note.title.slice(0, 160) : '',
    summary: typeof note?.summary === 'string' ? note.summary.slice(0, 700) : '',
    text: typeof note?.text === 'string' ? note.text.slice(0, 900) : '',
    keyPoints: Array.isArray(note?.keyPoints) ? note.keyPoints.filter((point) => typeof point === 'string').slice(0, 5).map((point) => point.slice(0, 220)) : [],
    subtheme: typeof note?.subtheme === 'string' ? note.subtheme.slice(0, 80) : '',
    topicPath: Array.isArray(note?.topicPath) ? note.topicPath.filter((topic) => typeof topic === 'string').slice(0, 3) : [],
  }));
  // Preferences go through service.normalizeLearningPreferences — the one allowlist.
  const preferences = body?.preferences;

  const weakTopics = Array.isArray(subject.weakTopics) ? subject.weakTopics.filter((topic) => typeof topic === 'string').slice(0, 5).map((topic) => topic.slice(0, 80)) : [];

  if (!name && !notes.length) return { error: { status: 400, message: 'Salve ao menos uma nota nesta matéria para recomendar aulas.' } };
  return { subject: { name: name || 'Matéria', notes, weakTopics }, preferences };
}

export default async function handler(req, res) {
  if (guardAiRequest(req, res, {
    scope: 'video-recommendations',
    perMinute: 6,
    perDay: 20,
    burstMessage: 'Muitas buscas em sequência. Tente novamente em instantes.',
    dailyMessage: 'O limite diário de recomendações foi atingido. Tente novamente amanhã.',
  })) return;

  const input = safeInput(req.body || {});
  if (input.error) return res.status(input.error.status).json({ message: input.error.message });

  try {
    const result = await runVideoRecommendations(input);
    return res.status(200).json(result);
  } catch (error) {
    const mapped = errorResponse(error, {
      AI_NOT_CONFIGURED: 'A IA ainda não está configurada para recomendar aulas em vídeo.',
    });
    console.error('JOVI Lens video recommendations failed', { code: error?.code || 'UNKNOWN', status: error?.status });
    return res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
  }
}
