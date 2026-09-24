import { transcribeAudio } from './_lib/ai/service.js';
import { defineRoute } from './_lib/guard.js';
import { hasKnownAudioSignature } from './_lib/http.js';

export const config = { api: { bodyParser: false } };

const MAX_AUDIO_LENGTH = 3_500_000; // base64 chars (~2.6 MB of audio)
const VALID_MIME = new Set(['audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a']);

function safeInput(body) {
  const audio = typeof body?.audio === 'string' ? body.audio : '';
  const mimeType = typeof body?.mimeType === 'string' && VALID_MIME.has(body.mimeType) ? body.mimeType : 'audio/webm';
  const invalid = !audio || audio.length > MAX_AUDIO_LENGTH || !/^[A-Za-z0-9+/=]+$/.test(audio) || !hasKnownAudioSignature(audio, mimeType);
  if (invalid) return { error: { status: 400, code: 'INVALID_INPUT', message: 'Áudio inválido ou grande demais.' } };
  return { input: { audio, mimeType } };
}

export default defineRoute({
  method: 'POST',
  scope: 'stt',
  burstPerMinute: 20,
  auth: 'session',
  integrity: true,
  cost: 0,
  byok: 'required',
  byokCapability: 'stt',
  validate: safeInput,
  run: async ({ audio, mimeType }, ctx) => {
    const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('m4a') ? 'm4a' : mimeType.includes('mp4') ? 'mp4' : (mimeType.includes('mpeg') || mimeType.includes('mp3')) ? 'mp3' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    const result = await transcribeAudio({ buffer: Buffer.from(audio, 'base64'), mimeType, filename: `audio.${ext}`, credentials: ctx.byok });
    return { text: result.text };
  },
});
