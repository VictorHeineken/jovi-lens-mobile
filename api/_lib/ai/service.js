import {
  buildActionPrompt,
  buildAnalysisPrompt,
  buildLessonScriptPrompt,
  buildPodcastScriptPrompt,
  buildStudyPlanPrompt,
  buildSubjectExamPrompt,
  buildSubjectQuestionsPrompt,
  buildTextExtractionPrompt,
} from './prompts.js';
import {
  completeWithAzure,
  createVideoJob,
  getVideoContent,
  getVideoJob,
  speakWithAzure,
  transcribeWithAzure,
} from './providers/azureOpenAI.js';
import { completeSubjectWithDemo, completeWithDemo } from './providers/demo.js';

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

// ---------------------------------------------------------------------------
// Subject-level generation (over ALL notes of a matéria).
// ---------------------------------------------------------------------------

const SUBJECT_ACTIONS = new Set(['questions', 'exam', 'plan', 'podcast-script', 'lesson-script']);

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

function normalizeSubject(action, result, subjectName, meta) {
  const subject = asText(result?.subject, subjectName, 80) || subjectName;
  const base = { subject, provider: meta.provider, model: meta.model, mode: meta.provider === 'demo' ? 'demo' : 'live' };

  if (action === 'questions') {
    const questions = (Array.isArray(result?.questions) ? result.questions : []).slice(0, 12).map((q) => ({
      question: asText(q?.question, '', 400),
      answer: asText(q?.answer, '', 600),
      topic: asText(q?.topic, 'Geral', 60),
      difficulty: ['fácil', 'média', 'difícil'].includes(String(q?.difficulty)) ? q.difficulty : 'média',
    })).filter((q) => q.question);
    return { ...base, questions };
  }

  if (action === 'exam') {
    const questions = (Array.isArray(result?.questions) ? result.questions : []).slice(0, 12).map((q) => {
      const rawOptions = asList(q?.options, 6);
      const rawAnswer = Number(q?.answerIndex);
      const validAnswer = Number.isInteger(rawAnswer) && rawAnswer >= 0 && rawAnswer < rawOptions.length;
      // Cap at 4 options but never drop the correct one: if it sits beyond the
      // window, swap it in and re-index (instead of silently marking a wrong one).
      let options = rawOptions.slice(0, 4);
      let answerIndex = validAnswer ? rawAnswer : -1;
      if (validAnswer && rawAnswer >= 4) {
        options = [...rawOptions.slice(0, 3), rawOptions[rawAnswer]];
        answerIndex = 3;
      }
      return {
        question: asText(q?.question, '', 400),
        options,
        answerIndex,
        explanation: asText(q?.explanation, '', 500),
        topic: asText(q?.topic, 'Geral', 60),
      };
    }).filter((q) => q.question && q.options.length >= 2 && q.answerIndex >= 0 && q.answerIndex < q.options.length);
    return { ...base, durationMinutes: clampInt(result?.durationMinutes, 3, 60, 10), questions };
  }

  if (action === 'plan') {
    const sessions = (Array.isArray(result?.sessions) ? result.sessions : []).slice(0, 8).map((s, index) => ({
      label: asText(s?.label, `Sessão ${index + 1}`, 40),
      focus: asText(s?.focus, 'Revisão', 120),
      durationMinutes: clampInt(s?.durationMinutes, 10, 180, 30),
      tasks: asList(s?.tasks, 6),
    })).filter((s) => s.focus);
    const spacedReview = (Array.isArray(result?.spacedReview) ? result.spacedReview : []).slice(0, 8).map((r) => ({
      topic: asText(r?.topic, '', 80),
      when: asText(r?.when, 'em 3 dias', 40),
    })).filter((r) => r.topic);
    return { ...base, overview: asText(result?.overview, '', 400), sessions, spacedReview };
  }

  if (action === 'podcast-script') {
    const segments = (Array.isArray(result?.segments) ? result.segments : []).slice(0, 24).map((seg) => ({
      speaker: ['A', 'B', 'narrator'].includes(String(seg?.speaker)) ? seg.speaker : 'narrator',
      text: asText(seg?.text, '', 900),
    })).filter((seg) => seg.text);
    return { ...base, format: result?.format === 'single' ? 'single' : 'dialogue', title: asText(result?.title, `Podcast · ${subject}`, 120), segments };
  }

  // lesson-script
  const slides = (Array.isArray(result?.slides) ? result.slides : []).slice(0, 10).map((slide) => ({
    heading: asText(slide?.heading, '', 120),
    bullets: asList(slide?.bullets, 5),
    narration: asText(slide?.narration, '', 900),
  })).filter((slide) => slide.heading || slide.narration);
  return { ...base, title: asText(result?.title, `Aula · ${subject}`, 120), soraPrompt: asText(result?.soraPrompt, '', 400), slides };
}

function buildSubjectPrompt(action, subject) {
  if (action === 'questions') return buildSubjectQuestionsPrompt(subject);
  if (action === 'exam') return buildSubjectExamPrompt(subject);
  if (action === 'plan') return buildStudyPlanPrompt(subject);
  if (action === 'podcast-script') return buildPodcastScriptPrompt(subject, { format: subject?.format });
  return buildLessonScriptPrompt(subject);
}

export async function runSubjectAI({ action = 'questions', subject = {} } = {}) {
  if (!SUBJECT_ACTIONS.has(action)) {
    throw Object.assign(new Error('Ação de matéria inválida.'), { code: 'AI_INVALID_RESPONSE' });
  }
  const subjectName = String(subject?.name || subject?.subject || 'Matéria').slice(0, 80);

  if (isDemoMode()) {
    const demo = await completeSubjectWithDemo({ action, subject });
    return normalizeSubject(action, demo.result, subjectName, demo);
  }

  // Longer budget than a single-image action: subject scripts are the biggest outputs.
  const completion = await completeWithAzure({ messages: [{ role: 'user', content: buildSubjectPrompt(action, subject) }], maxTokens: 2600, timeoutMs: 45000 });
  const result = parseJson(completion.text);
  return normalizeSubject(action, result, subjectName, completion);
}

// ---------------------------------------------------------------------------
// Audio + video services (live only; Demo Mode uses the browser's Web Speech).
// ---------------------------------------------------------------------------

const TTS_CHUNK = 4000; // Azure /audio/speech caps input at 4096 chars.

function chunkText(text, max = TTS_CHUNK) {
  const clean = String(text || '').trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const sentences = clean.split(/(?<=[.!?…])\s+/);
  const chunks = [];
  let buffer = '';
  const flush = () => { if (buffer) { chunks.push(buffer); buffer = ''; } };
  for (const sentence of sentences) {
    if (sentence.length > max) {
      // A single sentence exceeds the cap — hard-split it, keeping the tail.
      flush();
      for (let i = 0; i < sentence.length; i += max) chunks.push(sentence.slice(i, i + max));
      continue;
    }
    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    if (candidate.length > max) { flush(); buffer = sentence; }
    else buffer = candidate;
  }
  flush();
  return chunks;
}

export async function synthesizeSpeech({ text, voice = 'alloy', format = 'mp3' }) {
  const chunks = chunkText(text);
  if (!chunks.length) throw Object.assign(new Error('Texto vazio para áudio.'), { code: 'AI_INVALID_RESPONSE' });
  const results = [];
  for (const chunk of chunks) {
    // eslint-disable-next-line no-await-in-loop -- Azure TTS is per-chunk sequential.
    const audio = await speakWithAzure({ text: chunk, voice, format });
    results.push(audio.buffer.toString('base64'));
  }
  return { parts: results, mimeType: format === 'mp3' ? 'audio/mpeg' : `audio/${format}`, voice };
}

export async function transcribeAudio({ buffer, mimeType, filename }) {
  return transcribeWithAzure({ buffer, mimeType, filename });
}

export async function startVideoLesson({ prompt, seconds, width, height }) {
  const job = await createVideoJob({ prompt, seconds, width, height });
  return { jobId: job.id, status: job.status };
}

export async function pollVideoLesson({ jobId }) {
  const job = await getVideoJob(jobId);
  if (job.status === 'succeeded' && job.generationId) {
    const content = await getVideoContent(job.generationId);
    return { status: 'succeeded', video: content.buffer.toString('base64'), mimeType: content.mimeType };
  }
  return { status: job.status, failure: job.failure };
}
