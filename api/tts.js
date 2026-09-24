import { synthesizeSpeech } from './_lib/ai/service.js';
import { DEFAULT_VOICE_ROLE, VOICE_ROLES } from './_lib/ai/voices.js';
import { defineRoute } from './_lib/guard.js';

export const config = { api: { bodyParser: false } };

const MAX_TEXT = 2000; // clients split longer text with shared/textChunks.js
const MAX_RESPONSE_BASE64 = 4_000_000;
const FORMATS = new Set(['mp3', 'opus', 'aac', 'flac', 'wav']);

function safeInput(body) {
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const voice = VOICE_ROLES.includes(body?.voice) ? body.voice : DEFAULT_VOICE_ROLE;
  const format = FORMATS.has(body?.format) ? body.format : 'mp3';
  if (!text) return { error: { status: 400, code: 'INVALID_INPUT', message: 'Texto ausente para gerar áudio.' } };
  if (text.length > MAX_TEXT) return { error: { status: 400, code: 'TEXT_TOO_LONG', message: 'Texto longo demais para gerar áudio.' } };
  return { input: { text, voice, format } };
}

export default defineRoute({
  method: 'POST',
  scope: 'tts',
  burstPerMinute: 60,
  auth: 'session',
  integrity: true,
  cost: 0,
  byok: 'required',
  byokCapability: 'tts',
  validate: safeInput,
  run: async (input, ctx) => {
    const result = await synthesizeSpeech({ ...input, credentials: ctx.byok });
    const size = result.parts.reduce((sum, part) => sum + part.length, 0);
    if (size > MAX_RESPONSE_BASE64) throw Object.assign(new Error('TTS response too large.'), { code: 'AI_RESPONSE_TOO_LARGE' });
    return result;
  },
});
