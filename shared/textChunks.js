// Splits long text into provider-sized TTS chunks at sentence boundaries.
// Shared by the backend (per-provider chunk limits) and both clients (which
// split before calling /api/tts, whose input is capped at TTS_CHUNK_CHARS).
export const TTS_CHUNK_CHARS = 2000;

export function chunkText(text, max = TTS_CHUNK_CHARS) {
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
