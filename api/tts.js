import { synthesizeSpeech } from './_lib/ai/service.js';
import { errorResponse, isRateLimited } from './_lib/http.js';

const MAX_TEXT = 8000; // service chunks this into ≤4096-char TTS calls
const VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'sage', 'ash']);
const FORMATS = new Set(['mp3', 'opus', 'aac', 'flac', 'wav']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido.' });
  if (isRateLimited(req, { scope: 'tts', max: 60 })) return res.status(429).json({ code: 'AI_RATE_LIMITED', message: 'Muitos áudios em sequência. Tente novamente em instantes.' });

  const body = req.body || {};
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  const voice = VOICES.has(body.voice) ? body.voice : 'alloy';
  const format = FORMATS.has(body.format) ? body.format : 'mp3';
  if (!text) return res.status(400).json({ message: 'Texto ausente para gerar áudio.' });

  try {
    const result = await synthesizeSpeech({ text, voice, format });
    return res.status(200).json(result);
  } catch (error) {
    const mapped = errorResponse(error, { AI_NOT_CONFIGURED: 'A geração de áudio ao vivo ainda não está configurada.' });
    console.error('JOVI Lens TTS failed', { code: error?.code || 'UNKNOWN', status: error?.status });
    return res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
  }
}
