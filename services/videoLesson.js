import * as FileSystem from 'expo-file-system/legacy';
import { isDemoMode } from './env.js';
import { apiUrl } from './apiClient.js';

// Starts the Sora opening clip. Returns { available:false } in Demo Mode or when
// the server reports Sora isn't configured — the lesson then uses a title card.
export async function startOpeningClip({ prompt, seconds = 5 }) {
  if (isDemoMode() || !prompt) return { available: false };
  let response;
  try {
    response = await fetch(apiUrl('/api/video-lesson'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, seconds }) });
  } catch {
    return { available: false };
  }
  if (response.status === 503) return { available: false };
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { available: false, error: data.message };
  return { available: true, jobId: data.jobId, status: data.status };
}

export async function pollOpeningClip(jobId) {
  let response;
  try {
    response = await fetch(apiUrl(`/api/video-lesson?jobId=${encodeURIComponent(jobId)}`));
  } catch {
    return { status: 'failed' };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { status: 'failed', error: data.message };
  if (data.status === 'succeeded' && data.video) {
    // expo-video plays file:// URIs more reliably than a multi-MB inline
    // data: URI — write the base64 payload out once and hand back a real path.
    const path = `${FileSystem.cacheDirectory}opening-clip-${jobId}.mp4`;
    await FileSystem.writeAsStringAsync(path, data.video, { encoding: FileSystem.EncodingType.Base64 });
    return { status: 'succeeded', url: path };
  }
  return { status: data.status };
}
