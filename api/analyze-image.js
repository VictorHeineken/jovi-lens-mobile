import { runStudyAI } from './_lib/ai/service.js';
import { errorResponse, guardAiRequest, hasKnownImageSignature } from './_lib/http.js';

const MAX_IMAGE_LENGTH = 8_000_000;
const VALID_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// Only these need to look at the pixels. Every follow-up (explain, solve,
// quiz, flashcards, ask) works from the analysis the client already has —
// re-sending a 1600px photo for each one doubled latency and vision cost.
const IMAGE_ACTIONS = new Set(['analyze', 'extract']);

function safeInput(body) {
  const image = typeof body?.image === 'string' ? body.image : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/jpeg';
  const action = ['analyze', 'extract', 'explain', 'solve', 'quiz', 'flashcards', 'ask'].includes(body?.action) ? body.action : 'analyze';
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 500) : '';
  const context = body?.context && typeof body.context === 'object' && !Array.isArray(body.context) ? body.context : null;

  const invalidImage = image && (image.length > MAX_IMAGE_LENGTH || !/^[A-Za-z0-9+/=]+$/.test(image) || !VALID_MIME_TYPES.has(mimeType) || !hasKnownImageSignature(image, mimeType));
  if (invalidImage || (IMAGE_ACTIONS.has(action) && !image)) {
    return { error: { status: 400, message: 'Imagem inválida ou grande demais.' } };
  }
  if (!IMAGE_ACTIONS.has(action) && !image && !context) {
    return { error: { status: 400, message: 'Analise a imagem antes de continuar o estudo.' } };
  }
  if (action === 'ask' && (!question || question.length < 2)) return { error: { status: 400, message: 'Escreva uma pergunta para continuar.' } };
  // With the analysis in hand, a follow-up is a text call even if a client
  // still sends the photo (the web app does) — the saving holds for everyone.
  const useImage = IMAGE_ACTIONS.has(action) || !context;
  return { image: useImage ? image : '', mimeType, action, question, context };
}

export default async function handler(req, res) {
  if (guardAiRequest(req, res, {
    scope: 'analyze',
    perMinute: 12,
    perDay: 100,
    burstMessage: 'Muitas análises em sequência. Tente novamente em instantes.',
    dailyMessage: 'O limite diário de análises foi atingido. Tente novamente amanhã.',
  })) return;

  const input = safeInput(req.body || {});
  if (input.error) return res.status(input.error.status).json({ message: input.error.message });

  try {
    const imageDataUrl = input.image ? `data:${input.mimeType};base64,${input.image}` : undefined;
    const result = await runStudyAI({ ...input, imageDataUrl });
    return res.status(200).json(result);
  } catch (error) {
    const mapped = errorResponse(error, {
      AI_NOT_CONFIGURED: 'A análise ao vivo ainda não está configurada. Ative o modo demonstração ou configure o serviço de IA.',
      AI_TIMEOUT: 'A análise demorou mais que o esperado. Tente novamente.',
      AI_EMPTY_RESPONSE: 'A IA não encontrou uma resposta utilizável. Tente enquadrar melhor o conteúdo.',
    });
    console.error('JOVI Lens AI request failed', { action: input.action, code: error?.code || 'UNKNOWN', status: error?.status });
    return res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
  }
}
