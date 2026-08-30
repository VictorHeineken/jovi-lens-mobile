import { isDemoMode } from './imageAnalysis.js';

// Azure voices per role; browser pitch differentiates speakers when only one
// pt-BR voice exists in speechSynthesis.
export const AZURE_VOICES = { A: 'nova', B: 'onyx', narrator: 'alloy' };
const BROWSER_PITCH = { A: 1.12, B: 0.9, narrator: 1 };

let liveTtsAvailable = null; // null unknown | true | false (not configured / failed)

export function ttsMode() {
  if (isDemoMode()) return 'browser';
  return liveTtsAvailable === false ? 'browser' : 'azure';
}

export function noteToSpeech(note) {
  const parts = [note?.title, note?.summary, ...(Array.isArray(note?.keyPoints) ? note.keyPoints : [])].filter(Boolean);
  return parts.join('. ').slice(0, 3000);
}

function pickBrowserVoice() {
  const synth = window.speechSynthesis;
  const voices = synth?.getVoices?.() || [];
  return voices.find((v) => /pt.BR/i.test(v.lang)) || voices.find((v) => /^pt/i.test(v.lang)) || null;
}

// Returns an array of playable data: URLs for one text chunk, or null when the
// server reports TTS is not configured (caller then falls back to the browser).
async function fetchAzureTts(text, voice) {
  let response;
  try {
    response = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice }) });
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
    this.audio = typeof Audio !== 'undefined' ? new Audio() : null;
    this.segments = [];
    this.index = 0;
    this.partQueue = [];
    this.state = 'idle'; // idle | playing | paused | done
    this.handlers = {};
    this.usingBrowser = false;
    this.cancelled = false;
    this.token = 0; // bumped on every start(); stale async continuations bail out.
    this.pendingResume = null; // set when paused while a segment's audio was still fetching.
  }

  emit(extra = {}) {
    this.handlers.onUpdate?.({ index: this.index, state: this.state, total: this.segments.length, mode: this.usingBrowser ? 'browser' : 'azure', ...extra });
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
        urls = await fetchAzureTts(segment.text, AZURE_VOICES[segment.speaker] || 'alloy');
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
    return this.speakBrowser(segment, token);
  }

  playParts(token) {
    if (this.stale(token) || !this.audio) return;
    if (!this.partQueue.length) { this.index += 1; return this.playSegment(token); }
    const url = this.partQueue.shift();
    this.audio.src = url;
    this.audio.onended = () => this.playParts(token);
    this.audio.onerror = () => this.playParts(token);
    this.audio.play().catch(() => { if (this.stale(token)) return; this.state = 'paused'; this.emit(); });
  }

  speakBrowser(segment, token) {
    const synth = window.speechSynthesis;
    if (!synth) { this.index += 1; return this.playSegment(token); }
    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.lang = 'pt-BR';
    const voice = pickBrowserVoice();
    if (voice) utterance.voice = voice;
    utterance.pitch = BROWSER_PITCH[segment.speaker] ?? 1;
    utterance.rate = 1;
    utterance.onend = () => { if (!this.stale(token)) { this.index += 1; this.playSegment(token); } };
    utterance.onerror = () => { if (!this.stale(token)) { this.index += 1; this.playSegment(token); } };
    synth.speak(utterance);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    if (this.usingBrowser) window.speechSynthesis?.pause();
    else this.audio?.pause();
    this.emit();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    if (this.usingBrowser) { window.speechSynthesis?.resume(); this.emit(); return; }
    // A segment finished fetching while paused — start it now.
    if (this.pendingResume) { const run = this.pendingResume; this.pendingResume = null; this.emit(); run(); return; }
    const token = this.token;
    this.audio?.play().catch(() => { if (this.stale(token)) return; this.state = 'paused'; this.emit(); });
    this.emit();
  }

  stopMedia() {
    this.pendingResume = null;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (this.audio) { this.audio.pause(); this.audio.onended = null; this.audio.onerror = null; this.audio.src = ''; }
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
