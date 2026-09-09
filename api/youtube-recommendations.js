import { runYouTubeRecommendations } from './_lib/ai/service.js';
import { errorResponse, isDailyLimited, isRateLimited } from './_lib/http.js';

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
  const preferences = body?.preferences && typeof body.preferences === 'object' ? {
    videoStyle: typeof body.preferences.videoStyle === 'string' ? body.preferences.videoStyle : 'balanced',
    duration: typeof body.preferences.duration === 'string' ? body.preferences.duration : 'standard',
    level: typeof body.preferences.level === 'string' ? body.preferences.level : 'intermediate',
    sort: typeof body.preferences.sort === 'string' ? body.preferences.sort : 'relevance',
  } : {};

  const weakTopics = Array.isArray(subject.weakTopics) ? subject.weakTopics.filter((topic) => typeof topic === 'string').slice(0, 5).map((topic) => topic.slice(0, 80)) : [];

  if (!name && !notes.length) return { error: { status: 400, message: 'Salve ao menos uma nota nesta matéria para buscar uma aula.' } };
  return { subject: { name: name || 'Matéria', notes, weakTopics }, preferences };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido.' });
  if (isRateLimited(req, { scope: 'youtube', max: 6 })) return res.status(429).json({ code: 'AI_RATE_LIMITED', message: 'Muitas buscas em sequência. Tente novamente em instantes.' });
  if (isDailyLimited(req, { scope: 'youtube', max: 20 })) return res.status(429).json({ code: 'AI_RATE_LIMITED', message: 'O limite diário de buscas foi atingido. Tente novamente amanhã.' });

  const input = safeInput(req.body || {});
  if (input.error) return res.status(input.error.status).json({ message: input.error.message });

  try {
    const result = await runYouTubeRecommendations(input);
    return res.status(200).json(result);
  } catch (error) {
    const mapped = errorResponse(error, {
      YOUTUBE_NOT_CONFIGURED: 'A busca de aulas ainda não está configurada. Adicione a chave server-side do YouTube ou ative o modo demonstração.',
      YOUTUBE_QUOTA_EXCEEDED: 'A cota diária do YouTube foi atingida. Tente novamente amanhã.',
      YOUTUBE_TIMEOUT: 'A busca do YouTube demorou mais que o esperado. Tente novamente.',
      YOUTUBE_PROVIDER_ERROR: 'O YouTube não respondeu à busca agora. Tente novamente.',
      AI_NOT_CONFIGURED: 'A IA da Azure ainda não está configurada para personalizar esta busca.',
    });
    console.error('JOVI Lens YouTube recommendations failed', { code: error?.code || 'UNKNOWN', status: error?.status });
    return res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
  }
}
