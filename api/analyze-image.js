import { runStudyAI } from './_lib/ai/service.js';
import { errorResponse, hasKnownImageSignature, isRateLimited } from './_lib/http.js';

const MAX_IMAGE_LENGTH = 8_000_000;
const VALID_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function safeInput(body) {
  const image = typeof body?.image === 'string' ? body.image : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/jpeg';
  const action = ['analyze', 'extract', 'explain', 'solve', 'quiz', 'flashcards', 'ask'].includes(body?.action) ? body.action : 'analyze';
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 500) : '';
  const context = body?.context && typeof body.context === 'object' ? body.context : null;

  const invalidImage = image && (image.length > MAX_IMAGE_LENGTH || !/^[A-Za-z0-9+/=]+$/.test(image) || !VALID_MIME_TYPES.has(mimeType) || !hasKnownImageSignature(image, mimeType));
  if ((action !== 'ask' && !image) || invalidImage) {
    return { error: { status: 400, message: 'Imagem inválida ou grande demais.' } };
  }
  if (action === 'ask' && (!question || question.length < 2)) return { error: { status: 400, message: 'Escreva uma pergunta para continuar.' } };
  return { image, mimeType, action, question, context };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  if (isRateLimited(req, { scope: 'analyze', max: 12 })) return res.status(429).json({ code: 'AI_RATE_LIMITED', message: 'Muitas análises em sequência. Tente novamente em instantes.' });

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
    console.error('JOVI Lens AI request failed', { code: error?.code || 'UNKNOWN', status: error?.status });
    return res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
  }
}
