import { runStudyAI } from './_lib/ai/service.js';
import { defineRoute } from './_lib/guard.js';
import { hasKnownImageSignature } from './_lib/http.js';

export const config = { api: { bodyParser: false } };

const MAX_IMAGE_LENGTH = 3_000_000;
const VALID_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function invalidInput(message) {
  return { error: { status: 400, code: 'INVALID_INPUT', message } };
}

function safeInput(body) {
  const image = typeof body?.image === 'string' ? body.image : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/jpeg';
  const action = ['analyze', 'extract', 'explain', 'solve', 'quiz', 'flashcards', 'ask'].includes(body?.action) ? body.action : 'analyze';
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 500) : '';
  const context = body?.context && typeof body.context === 'object' ? body.context : null;

  const invalidImage = image && (image.length > MAX_IMAGE_LENGTH || !/^[A-Za-z0-9+/=]+$/.test(image) || !VALID_MIME_TYPES.has(mimeType) || !hasKnownImageSignature(image, mimeType));
  if ((action !== 'ask' && !image) || invalidImage) return invalidInput('Imagem inválida ou grande demais.');
  if (action === 'ask' && (!question || question.length < 2)) return invalidInput('Escreva uma pergunta para continuar.');
  return { input: { image, mimeType, action, question, context } };
}

export default defineRoute({
  method: 'POST',
  scope: 'analyze',
  burstPerMinute: 12,
  auth: 'session',
  integrity: true,
  cost: 1,
  byok: 'optional',
  validate: safeInput,
  run: (input, ctx) => runStudyAI({
    ...input,
    imageDataUrl: input.image ? `data:${input.mimeType};base64,${input.image}` : undefined,
    credentials: ctx.byok,
  }),
});
