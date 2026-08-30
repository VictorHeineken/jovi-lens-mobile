import { pollVideoLesson, startVideoLesson } from './_lib/ai/service.js';
import { errorResponse, isRateLimited } from './_lib/http.js';

const MAX_PROMPT = 800;

// POST { prompt, seconds } -> starts a Sora job; GET ?jobId=... -> polls/downloads.
export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (isRateLimited(req, { scope: 'video-poll', max: 60 })) return res.status(429).json({ code: 'AI_RATE_LIMITED', message: 'Muitas consultas em sequência. Aguarde um momento.' });
    const jobId = new URLSearchParams((req.url || '').split('?')[1] || '').get('jobId');
    if (!jobId || !/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return res.status(400).json({ message: 'jobId inválido.' });
    try {
      const result = await pollVideoLesson({ jobId });
      return res.status(200).json(result);
    } catch (error) {
      const mapped = errorResponse(error, { AI_NOT_CONFIGURED: 'A geração de vídeo ainda não está configurada.' });
      console.error('JOVI Lens video poll failed', { code: error?.code || 'UNKNOWN', status: error?.status });
      return res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido.' });
  if (isRateLimited(req, { scope: 'video', max: 6 })) return res.status(429).json({ code: 'AI_RATE_LIMITED', message: 'Muitos vídeos em sequência. Aguarde um momento.' });

  const body = req.body || {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT) : '';
  const seconds = Math.min(20, Math.max(1, Math.round(Number(body.seconds) || 5)));
  if (!prompt) return res.status(400).json({ message: 'Descrição do vídeo ausente.' });

  try {
    const result = await startVideoLesson({ prompt, seconds });
    return res.status(200).json(result);
  } catch (error) {
    const mapped = errorResponse(error, { AI_NOT_CONFIGURED: 'A geração de vídeo ainda não está configurada.' });
    console.error('JOVI Lens video start failed', { code: error?.code || 'UNKNOWN', status: error?.status });
    return res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
  }
}
