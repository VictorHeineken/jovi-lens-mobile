import { isDemoMode } from './imageAnalysis.js';

// Starts the Sora opening clip. Returns { available:false } in Demo Mode or when
// the server reports Sora isn't configured — the lesson then uses a title card.
export async function startOpeningClip({ prompt, seconds = 5 }) {
  if (isDemoMode() || !prompt) return { available: false };
  let response;
  try {
    response = await fetch('/api/video-lesson', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, seconds }) });
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
    response = await fetch(`/api/video-lesson?jobId=${encodeURIComponent(jobId)}`);
  } catch {
    return { status: 'failed' };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { status: 'failed', error: data.message };
  if (data.status === 'succeeded' && data.video) return { status: 'succeeded', url: `data:${data.mimeType || 'video/mp4'};base64,${data.video}` };
  return { status: data.status };
}
