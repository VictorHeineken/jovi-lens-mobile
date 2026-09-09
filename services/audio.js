import { createAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { isDemoMode } from './env.js';
import { apiUrl } from './apiClient.js';

// "Browser" pitch differentiates speakers when only one pt-BR voice exists for
// the on-device fallback (expo-speech, RN's equivalent of speechSynthesis).
// The live path sends the role itself ('A'/'B'/'narrator') to /api/tts — the
// active provider maps it to a real voice ID server-side.
const BROWSER_PITCH = { A: 1.12, B: 0.9, narrator: 1 };

let liveTtsAvailable = null; // null unknown | true | false (not configured / failed)

export function ttsMode() {
  if (isDemoMode()) return 'browser';
  return liveTtsAvailable === false ? 'browser' : 'live';
}

export function noteToSpeech(note) {
  const parts = [note?.title, note?.summary, ...(Array.isArray(note?.keyPoints) ? note.keyPoints : [])].filter(Boolean);
  return parts.join('. ').slice(0, 3000);
}

let cachedVoiceId; // undefined = not looked up yet, null = none found
function ensureVoiceLookup() {
  if (cachedVoiceId !== undefined) return;
  cachedVoiceId = null;
  Speech.getAvailableVoicesAsync()
    .then((voices) => {
      const voice = voices.find((v) => /pt.BR/i.test(v.language)) || voices.find((v) => /^pt/i.test(v.language));
      cachedVoiceId = voice?.identifier || null;
    })
    .catch(() => { cachedVoiceId = null; });
}

// Returns an array of playable data: URLs for one text chunk, or null when the
// server reports TTS is not configured (caller then falls back to on-device speech).
async function fetchLiveTts(text, voice) {
  let response;
  try {
    response = await fetch(apiUrl('/api/tts'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice }) });
  } catch {
    liveTtsAvailable = false;
    return null;
  }
  if (response.status === 503) { liveTtsAvailable = false; return null; }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.code === 'AI_NOT_CONFIGURED') { liveTtsAvailable = false; return null; }
    throw new Error(data.message || 'Falha ao gerar o áudio.');
  }
  liveTtsAvailable = true;
  const mime = data.mimeType || 'audio/mpeg';
  return (data.parts || []).map((b64) => `data:${mime};base64,${b64}`);
}

// Single shared narrator: only one narration plays at a time across the app.
class Narration {
  constructor() {
    this.player = createAudioPlayer(null);
    // A single persistent listener, guarded by activeToken (set right before
    // each play()) rather than reassigned per segment like the web version's
    // audio.onended — expo-audio's AudioPlayer has no per-call onended hook.
    this.player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish && !this.stale(this.activeToken)) this.playParts(this.activeToken);
    });
    this.segments = [];
    this.index = 0;
    this.partQueue = [];
    this.state = 'idle'; // idle | playing | paused | done
    this.handlers = {};
    this.usingBrowser = false; // true = on-device (expo-speech) fallback, matching ttsMode()'s 'browser' value
    this.cancelled = false;
    this.token = 0; // bumped on every start(); stale async continuations bail out.
    this.activeToken = null; // token the player is currently playing audio for
    this.pendingResume = null; // set when paused while a segment's audio was still fetching.
  }

  emit(extra = {}) {
    this.handlers.onUpdate?.({ index: this.index, state: this.state, total: this.segments.length, mode: this.usingBrowser ? 'browser' : 'live', ...extra });
  }

  start(segments, handlers = {}, startIndex = 0) {
    // Supersede any previous owner.
    if (this.handlers.onUpdate && this.handlers !== handlers) this.handlers.onUpdate({ index: this.index, state: 'idle', total: 0, superseded: true });
    this.stopMedia();
    this.cancelled = false;
    this.token += 1;
    this.segments = segments || [];
    this.index = Math.min(Math.max(0, startIndex), Math.max(0, this.segments.length - 1));
    this.partQueue = [];
    this.handlers = handlers;
    this.state = 'playing';
    this.usingBrowser = ttsMode() === 'browser';
    this.playSegment(this.token);
  }

  stale(token) {
    return this.cancelled || token !== this.token;
  }

  async playSegment(token) {
    if (this.stale(token)) return;
    if (this.index >= this.segments.length) { this.state = 'done'; this.emit(); this.handlers.onEnd?.(); return; }
    this.emit();
    const segment = this.segments[this.index];
    if (!this.usingBrowser) {
      let urls;
      try {
        urls = await fetchLiveTts(segment.text, segment.speaker || 'narrator');
      } catch (error) {
        if (this.stale(token)) return;
        this.state = 'idle';
        this.emit({ error: error.message });
        return;
      }
      if (this.stale(token)) return;
      if (urls === null) { this.usingBrowser = true; return this.playSegment(token); }
      this.partQueue = urls;
      // If the user paused while this segment was still fetching, wait for resume.
      if (this.state === 'paused') { this.pendingResume = () => this.playParts(token); return; }
      return this.playParts(token);
    }
    return this.speakDevice(segment, token);
  }

  playParts(token) {
    if (this.stale(token)) return;
    if (!this.partQueue.length) { this.index += 1; return this.playSegment(token); }
    const url = this.partQueue.shift();
    try {
      this.activeToken = token;
      this.player.replace(url);
      this.player.play();
    } catch {
      if (this.stale(token)) return;
      this.state = 'paused';
      this.emit();
    }
  }

  speakDevice(segment, token) {
    ensureVoiceLookup();
    Speech.speak(segment.text, {
      language: 'pt-BR',
      voice: cachedVoiceId || undefined,
      pitch: BROWSER_PITCH[segment.speaker] ?? 1,
      rate: 1,
      onDone: () => { if (!this.stale(token)) { this.index += 1; this.playSegment(token); } },
      onError: () => { if (!this.stale(token)) { this.index += 1; this.playSegment(token); } },
    });
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    // expo-speech's pause()/resume() only work on iOS — Android has no native
    // pause, so a device-mode pause on Android is closer to a stop-in-place.
    if (this.usingBrowser) Speech.pause();
    else { try { this.player.pause(); } catch { /* no-op */ } }
    this.emit();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    if (this.usingBrowser) { Speech.resume(); this.emit(); return; }
    // A segment finished fetching while paused — start it now.
    if (this.pendingResume) { const run = this.pendingResume; this.pendingResume = null; this.emit(); run(); return; }
    try { this.player.play(); } catch { this.state = 'paused'; }
    this.emit();
  }

  stopMedia() {
    this.pendingResume = null;
    Speech.stop();
    try { this.player.pause(); } catch { /* no-op */ }
  }

  stop() {
    this.cancelled = true;
    this.state = 'idle';
    this.stopMedia();
    this.emit();
    this.handlers = {};
  }
}

export const narration = new Narration();
