import { buildActionPrompt, buildAnalysisPrompt, buildTextExtractionPrompt } from './prompts.js';
import { completeWithAzure } from './providers/azureOpenAI.js';
import { completeWithDemo } from './providers/demo.js';

const parseJson = (text) => {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw Object.assign(new Error('Resposta da IA não estava em JSON.'), { code: 'AI_INVALID_RESPONSE' });
    return JSON.parse(match[0]);
  }
};

const asText = (value, fallback = '', max = 2400) => String(value ?? fallback).trim().slice(0, max);
const asList = (value, max = 5) => Array.isArray(value) ? value.map((item) => asText(item, '', 500)).filter(Boolean).slice(0, max) : [];

export function isDemoMode() {
  return String(process.env.JOVI_LENS_DEMO_MODE || '').toLowerCase() === 'true';
}

function normalizeAnalysis(result, meta) {
  return {
    text: asText(result?.text, '', 10000),
    language: asText(result?.language, 'auto', 12),
    title: asText(result?.title, 'Conteúdo identificado', 120),
    summary: asText(result?.summary, 'Conteúdo visual identificado para estudo.', 800),
    keyPoints: asList(result?.keyPoints),
    category: asText(result?.category, 'Estudos', 60),
    contentType: asText(result?.contentType, 'Conteúdo visual', 60),
    subject: asText(result?.subject, 'Estudos', 80),
    confidence: Number.isFinite(Number(result?.confidence)) ? Math.min(1, Math.max(0, Number(result.confidence))) : null,
    suggestedQuestions: asList(result?.suggestedQuestions, 4),
    learning: {
      understand: result?.learning?.understand || null,
      solve: result?.learning?.solve || null,
      practice: result?.learning?.practice || null,
      flashcards: Array.isArray(result?.learning?.flashcards) ? result.learning.flashcards.slice(0, 6) : [],
    },
    provider: meta.provider,
    model: meta.model,
    mode: meta.provider === 'demo' ? 'demo' : 'live',
  };
}

function normalizeTextExtraction(result, meta) {
  return {
    text: asText(result?.text, '', 10000),
    language: asText(result?.language, 'auto', 12),
    confidence: Number.isFinite(Number(result?.confidence)) ? Math.min(1, Math.max(0, Number(result.confidence))) : null,
    provider: meta.provider,
    model: meta.model,
    mode: meta.provider === 'demo' ? 'demo' : 'live',
  };
}

export async function runStudyAI({ action = 'analyze', question = '', context = null, imageDataUrl }) {
  if (isDemoMode()) {
    const demo = await completeWithDemo({ action, question });
    if (action === 'extract') return normalizeTextExtraction(demo.result, demo);
    return action === 'analyze' ? normalizeAnalysis(demo.result, demo) : { ...demo.result, provider: demo.provider, model: demo.model, mode: 'demo' };
  }

  const content = [{ type: 'text', text: action === 'analyze' ? buildAnalysisPrompt() : action === 'extract' ? buildTextExtractionPrompt() : buildActionPrompt({ action, question, context }) }];
  if (imageDataUrl) content.push({ type: 'image_url', image_url: { url: imageDataUrl } });
  const completion = await completeWithAzure({ messages: [{ role: 'user', content }] });
  const result = parseJson(completion.text);
  return action === 'analyze'
    ? normalizeAnalysis(result, completion)
    : action === 'extract'
      ? normalizeTextExtraction(result, completion)
    : { ...result, provider: completion.provider, model: completion.model, mode: 'live' };
}
