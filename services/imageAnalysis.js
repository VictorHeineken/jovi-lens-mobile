import { getDemoAction, getDemoAnalysis } from './demoResponses.js';

const CLIENT_DEMO_MODE = String(import.meta.env.VITE_JOVI_LENS_DEMO_MODE ?? 'true').toLowerCase() === 'true';
const MAX_FILE_SIZE = 12 * 1024 * 1024;
const VALID_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export async function fileToDataUrl(file) {
  if (!file || !VALID_MIME_TYPES.has(file.type)) throw new Error('Escolha uma imagem JPG, PNG ou WebP.');
  if (file.size > MAX_FILE_SIZE) throw new Error('Essa imagem é grande demais. Escolha um arquivo de até 12 MB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function prepareImageForAI(src, maxSide = 1600) {
  let source = src;
  if (!String(src).startsWith('data:')) {
    const blob = await fetch(src).then((response) => response.blob());
    source = await fileToDataUrl(blob);
  }

  const image = await loadImage(source);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

async function requestAnalysis(src, { action = 'analyze', question = '', context = null } = {}) {
  if (CLIENT_DEMO_MODE) {
    await new Promise((resolve) => window.setTimeout(resolve, action === 'analyze' ? 1100 : 520));
    if (action === 'extract') return { text: getDemoAnalysis().text, language: 'pt', confidence: 0.96, provider: 'demo', model: 'jovi-lens-demo', mode: 'demo' };
    return action === 'analyze' ? { ...getDemoAnalysis(), provider: 'demo', model: 'jovi-lens-demo', mode: 'demo' } : getDemoAction({ action, question });
  }

  const prepared = await prepareImageForAI(src);
  const [header, base64] = prepared.split(',');
  const mimeType = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';

  let response;
  try {
    response = await fetch('/api/analyze-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, mimeType, action, question, context }),
    });
  } catch {
    throw new Error('Sem conexão no momento. Confira a internet ou ative o modo demonstração.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Não foi possível analisar a imagem.');
  return payload;
}

export async function analyzeImage(src) {
  return requestAnalysis(src);
}

export async function extractText(src) {
  return requestAnalysis(src, { action: 'extract' });
}

export async function requestStudyAction(src, options) {
  return requestAnalysis(src, options);
}

export function isDemoMode() {
  return CLIENT_DEMO_MODE;
}

export function googleSearch(text) {
  const query = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 650);
  if (!query) return false;
  window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
  return true;
}

export async function copyText(text) {
  if (!text) return false;
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  el.remove();
  return ok;
}
