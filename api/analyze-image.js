import { runStudyAI } from './_lib/ai/service.js';

const MAX_IMAGE_LENGTH = 8_000_000;
const VALID_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const rateBuckets = new Map();

function clientKey(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 80);
}

function isRateLimited(req) {
  const now = Date.now();
  const key = clientKey(req);
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt > 60_000) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > 12;
}

function hasKnownImageSignature(image, mimeType) {
  try {
    const bytes = Buffer.from(image, 'base64');
    if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
    if (mimeType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mimeType === 'image/webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  } catch {
    return false;
  }
  return false;
}

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

  if (isRateLimited(req)) return res.status(429).json({ code: 'AI_RATE_LIMITED', message: 'Muitas análises em sequência. Tente novamente em instantes.' });

  const input = safeInput(req.body || {});
  if (input.error) return res.status(input.error.status).json({ message: input.error.message });

  try {
    const imageDataUrl = input.image ? `data:${input.mimeType};base64,${input.image}` : undefined;
    const result = await runStudyAI({ ...input, imageDataUrl });
    return res.status(200).json(result);
  } catch (error) {
    const status = error?.code === 'AI_NOT_CONFIGURED' ? 503 : error?.code === 'AI_RATE_LIMITED' ? 429 : error?.code === 'AI_TIMEOUT' ? 504 : 502;
    const messages = {
      AI_NOT_CONFIGURED: 'A análise ao vivo ainda não está configurada. Ative o modo demonstração ou configure o serviço de IA.',
      AI_TIMEOUT: 'A análise demorou mais que o esperado. Tente novamente.',
      AI_EMPTY_RESPONSE: 'A IA não encontrou uma resposta utilizável. Tente enquadrar melhor o conteúdo.',
      AI_INVALID_RESPONSE: 'Recebemos uma resposta que não pôde ser organizada. Tente novamente.',
      AI_RATE_LIMITED: 'O serviço de IA está temporariamente ocupado. Tente novamente em instantes.',
    };
    console.error('JOVI Lens AI request failed', { code: error?.code || 'UNKNOWN', status: error?.status });
    return res.status(status).json({ code: error?.code || 'AI_UNAVAILABLE', message: messages[error?.code] || 'Não foi possível analisar agora. Tente novamente.' });
  }
}
