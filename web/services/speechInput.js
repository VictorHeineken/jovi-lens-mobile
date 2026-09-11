import { isDemoMode } from './imageAnalysis.js';

export function speechRecognitionAvailable() {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function mediaRecorderAvailable() {
  return typeof window !== 'undefined' && Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
}

export function voiceInputAvailable() {
  return speechRecognitionAvailable() || (!isDemoMode() && mediaRecorderAvailable());
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Browser Web Speech API: live dictation with interim results.
function startBrowserRecognition({ onPartial, onFinal, onError, onEnd }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognizer = new Recognition();
  recognizer.lang = 'pt-BR';
  recognizer.interimResults = true;
  recognizer.continuous = false;
  recognizer.maxAlternatives = 1;
  let finalText = '';
  recognizer.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    onPartial?.((finalText + interim).trim());
  };
  recognizer.onerror = (event) => onError?.(event.error === 'not-allowed' ? 'Permita o microfone para usar a voz.' : 'Não foi possível ouvir agora.');
  recognizer.onend = () => { onFinal?.(finalText.trim()); onEnd?.(); };
  try { recognizer.start(); } catch { onError?.('Não foi possível iniciar o microfone.'); onEnd?.(); }
  return { stop: () => { try { recognizer.stop(); } catch { /* already stopped */ } } };
}

// Azure path: record with MediaRecorder, then POST to /api/transcribe.
async function startAzureRecording({ onFinal, onError, onEnd, onState }) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    onError?.('Permita o microfone para usar a voz.');
    onEnd?.();
    return { stop() {} };
  }
  const mimeType = ['audio/webm', 'audio/mp4'].find((type) => window.MediaRecorder.isTypeSupported?.(type)) || 'audio/webm';
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = async () => {
    stream.getTracks().forEach((track) => track.stop());
    onState?.('transcribing');
    try {
      const base64 = await blobToBase64(new Blob(chunks, { type: mimeType }));
      const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: base64, mimeType }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Não foi possível transcrever.');
      onFinal?.(data.text || '');
    } catch (error) {
      onError?.(error.message || 'Falha ao transcrever.');
    } finally {
      onEnd?.();
    }
  };
  recorder.start();
  onState?.('recording');
  return { stop: () => { if (recorder.state !== 'inactive') recorder.stop(); } };
}

// Unified entry point. Returns a controller with stop() immediately, even while
// the async microphone permission for the Azure path is still resolving.
export function startVoiceInput(handlers = {}) {
  if (speechRecognitionAvailable()) return startBrowserRecognition(handlers);
  if (!isDemoMode() && mediaRecorderAvailable()) {
    const controller = { _inner: null, _pendingStop: false, stop() { this._pendingStop = true; this._inner?.stop?.(); } };
    startAzureRecording(handlers).then((inner) => { controller._inner = inner; if (controller._pendingStop) inner.stop(); });
    return controller;
  }
  handlers.onError?.('Entrada por voz indisponível neste navegador.');
  handlers.onEnd?.();
  return { stop() {} };
}
