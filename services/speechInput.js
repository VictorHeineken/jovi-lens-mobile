import * as FileSystem from 'expo-file-system/legacy';
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { ExpoSpeechRecognitionModule, ExpoWebSpeechRecognition } from 'expo-speech-recognition';
import { isDemoMode } from './env.js';
import { apiRequest } from './apiClient.js';
import { byokHasStt } from './aiAccess.js';

// Keeps a server recording under /api/transcribe's 3.5 MB base64 limit.
const MAX_SERVER_RECORDING_MS = 90_000;

export function speechRecognitionAvailable() {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

// The server transcription path needs the user's own key with a provider that
// offers speech-to-text; free users only get on-device recognition.
export function voiceInputAvailable() {
  return speechRecognitionAvailable() || (!isDemoMode() && byokHasStt());
}

function pendingController(starter, handlers) {
  const controller = { _inner: null, _pendingStop: false, stop() { this._pendingStop = true; this._inner?.stop?.(); } };
  starter(handlers).then((inner) => {
    controller._inner = inner;
    if (controller._pendingStop) inner.stop();
  });
  return controller;
}

// On-device live dictation with interim results. expo-speech-recognition's
// ExpoWebSpeechRecognition implements the same SpeechRecognition interface
// the web version used (window.SpeechRecognition/webkitSpeechRecognition),
// so this ports almost unchanged — only the permission request and the
// class import are RN-specific.
async function startDeviceRecognition({ onPartial, onFinal, onError, onEnd }) {
  const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!permission.granted) {
    onError?.('Permita o microfone para usar a voz.');
    onEnd?.();
    return { stop() {} };
  }

  const recognizer = new ExpoWebSpeechRecognition();
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

// Server path: record on-device with expo-audio, then POST to /api/transcribe —
// same contract as the web version's MediaRecorder path.
async function startServerRecording({ onFinal, onError, onEnd, onState }) {
  const permission = await requestRecordingPermissionsAsync();
  if (!permission.granted) {
    onError?.('Permita o microfone para usar a voz.');
    onEnd?.();
    return { stop() {} };
  }
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

  const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
  await recorder.prepareToRecordAsync();
  recorder.record();
  onState?.('recording');

  let finished = false;
  let autoStop = null;
  const finish = async () => {
    if (finished) return;
    finished = true;
    clearTimeout(autoStop);
    await recorder.stop();
    onState?.('transcribing');
    try {
      if (!recorder.uri) throw new Error('Gravação vazia.');
      const base64 = await FileSystem.readAsStringAsync(recorder.uri, { encoding: FileSystem.EncodingType.Base64 });
      // RecordingPresets.HIGH_QUALITY writes an .m4a (AAC/MPEG4) file on both
      // platforms — matches one of api/transcribe.js's accepted mime types.
      const data = await apiRequest('/api/transcribe', { body: { audio: base64, mimeType: 'audio/m4a' } });
      onFinal?.(data.text || '');
    } catch (error) {
      onError?.(error.message || 'Falha ao transcrever.');
    } finally {
      onEnd?.();
    }
  };

  autoStop = setTimeout(() => { finish(); }, MAX_SERVER_RECORDING_MS);
  return { stop: () => { finish(); } };
}

// Unified entry point. Returns a controller with stop() immediately, even
// while the async microphone permission is still resolving.
export function startVoiceInput(handlers = {}) {
  if (speechRecognitionAvailable()) return pendingController(startDeviceRecognition, handlers);
  if (!isDemoMode() && byokHasStt()) return pendingController(startServerRecording, handlers);
  handlers.onError?.('Entrada por voz indisponível neste dispositivo.');
  handlers.onEnd?.();
  return { stop() {} };
}
