import { transcribeAudio } from './_lib/ai/service.js';
import { errorResponse, hasKnownAudioSignature, isRateLimited } from './_lib/http.js';

const MAX_AUDIO_LENGTH = 10_000_000; // base64 chars (~7.5 MB of audio)
const VALID_MIME = new Set(['audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido.' });
  if (isRateLimited(req, { scope: 'stt', max: 20 })) return res.status(429).json({ code: 'AI_RATE_LIMITED', message: 'Muitas transcrições em sequência. Tente novamente em instantes.' });

  const body = req.body || {};
  const audio = typeof body.audio === 'string' ? body.audio : '';
  const mimeType = typeof body.mimeType === 'string' && VALID_MIME.has(body.mimeType) ? body.mimeType : 'audio/webm';
  const invalid = !audio || audio.length > MAX_AUDIO_LENGTH || !/^[A-Za-z0-9+/=]+$/.test(audio) || !hasKnownAudioSignature(audio, mimeType);
  if (invalid) return res.status(400).json({ message: 'Áudio inválido ou grande demais.' });

  try {
    const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('m4a') ? 'm4a' : mimeType.includes('mp4') ? 'mp4' : (mimeType.includes('mpeg') || mimeType.includes('mp3')) ? 'mp3' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    const filename = `audio.${ext}`;
    const result = await transcribeAudio({ buffer: Buffer.from(audio, 'base64'), mimeType, filename });
    return res.status(200).json({ text: result.text });
  } catch (error) {
    const mapped = errorResponse(error, { AI_NOT_CONFIGURED: 'A transcrição de voz ao vivo ainda não está configurada.', AI_EMPTY_RESPONSE: 'Não reconhecemos nenhuma fala. Tente falar mais perto do microfone.' });
    console.error('JOVI Lens transcribe failed', { code: error?.code || 'UNKNOWN', status: error?.status });
    return res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
  }
}
