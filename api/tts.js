import { synthesizeSpeech } from './_lib/ai/service.js';
import { DEFAULT_VOICE_ROLE, VOICE_ROLES } from './_lib/ai/voices.js';
import { errorResponse, guardAiRequest } from './_lib/http.js';

const MAX_TEXT = 8000; // service chunks this into provider-sized TTS calls
const FORMATS = new Set(['mp3', 'opus', 'aac', 'flac', 'wav']);

export default async function handler(req, res) {
  if (guardAiRequest(req, res, {
    scope: 'tts',
    perMinute: 60,
    perDay: 200,
    burstMessage: 'Muitos áudios em sequência. Tente novamente em instantes.',
    dailyMessage: 'O limite diário de áudio foi atingido. Tente novamente amanhã.',
  })) return;

  const body = req.body || {};
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  const voice = VOICE_ROLES.includes(body.voice) ? body.voice : DEFAULT_VOICE_ROLE;
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
