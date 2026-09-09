import { Image } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Linking from 'expo-linking';
import { getDemoAction, getDemoAnalysis } from './demoResponses.js';
import { isDemoMode } from './env.js';
import { apiUrl } from './apiClient.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getImageSize(uri) {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

// Web resizes on a <canvas> before upload. RN has no canvas — expo-image-manipulator
// does the resize+compress+base64 natively in one call, and (unlike the web version)
// takes the source URI directly, so there's no separate fetch-as-blob step for
// remote images either.
export async function prepareImageForAI(uri, maxSide = 1600) {
  const { width, height } = await getImageSize(uri);
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: targetWidth, height: targetHeight } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  return `data:image/jpeg;base64,${result.base64}`;
}

async function requestAnalysis(src, { action = 'analyze', question = '', context = null } = {}) {
  if (isDemoMode()) {
    await wait(action === 'analyze' ? 1100 : 520);
    if (action === 'extract') return { text: getDemoAnalysis().text, language: 'pt', confidence: 0.96, provider: 'demo', model: 'jovi-lens-demo', mode: 'demo' };
    return action === 'analyze' ? { ...getDemoAnalysis(), provider: 'demo', model: 'jovi-lens-demo', mode: 'demo' } : getDemoAction({ action, question });
  }

  const prepared = await prepareImageForAI(src, 1600);
  const [header, base64] = prepared.split(',');
  const mimeType = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';

  let response;
  try {
    response = await fetch(apiUrl('/api/analyze-image'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, mimeType, action, question, context }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('Sem conexão no momento. Confira a internet ou ative o modo demonstração.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Não foi possível analisar a imagem.');
  return payload;
}

export async function analyzeImage(src, options) {
  return requestAnalysis(src, options);
}

export async function extractText(src, options = {}) {
  return requestAnalysis(src, { ...options, action: 'extract' });
}

export async function requestStudyAction(src, options) {
  return requestAnalysis(src, options);
}

export { isDemoMode };

export function googleSearch(text) {
  const query = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 650);
  if (!query) return false;
  Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  return true;
}

export async function copyText(text) {
  if (!text) return false;
  await Clipboard.setStringAsync(text);
  return true;
}
