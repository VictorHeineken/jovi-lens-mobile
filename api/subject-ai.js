import { runSubjectAI } from './_lib/ai/service.js';
import { errorResponse, isRateLimited } from './_lib/http.js';

const VALID_ACTIONS = new Set(['questions', 'exam', 'plan', 'podcast-script', 'lesson-script']);
const MAX_NOTES = 40;

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

  const format = subject.format === 'single' ? 'single' : (subject.format === 'dialogue' ? 'dialogue' : undefined);
  return { action, subject: { name: name || 'Matéria', notes, format } };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido.' });
  if (isRateLimited(req, { scope: 'subject', max: 10 })) return res.status(429).json({ code: 'AI_RATE_LIMITED', message: 'Muitos pedidos em sequência. Tente novamente em instantes.' });

  const input = safeInput(req.body || {});
  if (input.error) return res.status(input.error.status).json({ message: input.error.message });

  try {
    const result = await runSubjectAI({ action: input.action, subject: input.subject });
    return res.status(200).json(result);
  } catch (error) {
    const mapped = errorResponse(error);
    console.error('JOVI Lens subject AI failed', { action: input.action, code: error?.code || 'UNKNOWN', status: error?.status });
    return res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
  }
}
