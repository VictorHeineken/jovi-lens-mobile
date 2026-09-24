import { Image } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Linking from 'expo-linking';
import { getDemoAction, getDemoAnalysis } from '../shared/demoResponses.js';
import { demoAssetModule } from './demoAssets.js';
import { isDemoMode } from './env.js';
import { apiRequest } from './apiClient.js';
import { ApiError } from './apiErrors.js';

const MAX_IMAGE_BASE64 = 3_000_000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getImageSize(uri) {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

// Android's image loader (Fresco) rejects `data:` URIs with "Unsupported uri
// scheme for encoded image fetch!", and both capture flows store images as
// data URIs (see app/(tabs)/camera.jsx and app/(tabs)/gallery.jsx). Spilling
// the payload to a cache file first gives Image.getSize/ImageManipulator a
// file:// URI, which both accept on every platform.
async function toLoadableUri(uri) {
  // A seeded sample's `/demo-assets/...` src names a bundled module, not a file
  // on disk, so Image.getSize and ImageManipulator both fail on it. expo-asset
  // materializes the module into the app's cache and hands back a real URI.
  const demoModule = demoAssetModule(uri);
  if (demoModule) {
    const asset = Asset.fromModule(demoModule);
    if (!asset.localUri) await asset.downloadAsync();
    return { uri: asset.localUri || asset.uri, cleanup: null };
  }
  if (typeof uri !== 'string' || !uri.startsWith('data:')) return { uri, cleanup: null };
  const base64 = uri.slice(uri.indexOf(',') + 1);
  const target = `${FileSystem.cacheDirectory}jovi-ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
  return { uri: target, cleanup: () => FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {}) };
}

// Web resizes on a <canvas> before upload. RN has no canvas — expo-image-manipulator
// does the resize+compress+base64 natively in one call, and (unlike the web version)
// takes the source URI directly, so there's no separate fetch-as-blob step for
// remote images either.
export async function prepareImageForAI(uri, maxSide = 1600, { compress = 0.82 } = {}) {
  const { uri: loadableUri, cleanup } = await toLoadableUri(uri);
  try {
    const { width, height } = await getImageSize(loadableUri);
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const result = await ImageManipulator.manipulateAsync(
      loadableUri,
      [{ resize: { width: targetWidth, height: targetHeight } }],
      { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return `data:image/jpeg;base64,${result.base64}`;
  } finally {
    if (cleanup) await cleanup();
  }
}

async function requestAnalysis(src, { action = 'analyze', question = '', context = null } = {}) {
  if (isDemoMode()) {
    await wait(action === 'analyze' ? 1100 : 520);
    if (action === 'extract') return { text: getDemoAnalysis().text, language: 'pt', confidence: 0.96, provider: 'demo', model: 'jovi-lens-demo', mode: 'demo' };
    return action === 'analyze' ? { ...getDemoAnalysis(), provider: 'demo', model: 'jovi-lens-demo', mode: 'demo' } : getDemoAction({ action, question, context });
  }

  // The server accepts up to 3,000,000 base64 chars: retry smaller and more
  // compressed before giving up.
  let prepared = await prepareImageForAI(src, 1600);
  if (prepared.length - prepared.indexOf(',') - 1 > MAX_IMAGE_BASE64) prepared = await prepareImageForAI(src, 1200, { compress: 0.7 });
  const [header, base64] = prepared.split(',');
  if (base64.length > MAX_IMAGE_BASE64) throw new ApiError({ code: 'PAYLOAD_TOO_LARGE' });
  const mimeType = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';

  return apiRequest('/api/analyze-image', {
    body: { image: base64, mimeType, action, question, context },
    idempotent: true,
  });
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
