import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Icon from './Icon.jsx';
import { generateSubjectContent } from '../services/subjectStudy.js';
import { narration } from '../services/audio.js';
import { pollOpeningClip, startOpeningClip } from '../services/videoLesson.js';

// videoExport.js (client-side canvas+MediaRecorder slideshow render, and the
// "Exportar vídeo (.webm)" button that used it) is dropped for the RN app —
// see react-native-migration-plan.md's Tier 3 decision. This screen only
// plays back what the backend already produced: the AI-generated opening
// clip. There's no full-lesson video export here.

export default function LessonPlayer({ subject, saved, onSave }) {
  const [phase, setPhase] = useState(saved ? 'ready' : 'idle');
  const [script, setScript] = useState(saved || null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('idle'); // idle | intro | slides
  const [playing, setPlaying] = useState({ index: 0, state: 'idle' });
  const [clip, setClip] = useState({ available: false, status: 'none', url: null });
  const pollRef = useRef(null);
  const titleTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const clipUrlRef = useRef(null);
  const player = useVideoPlayer(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; narration.stop(); clearTimeout(pollRef.current); clearTimeout(titleTimerRef.current); };
  }, []);

  useEffect(() => {
    clipUrlRef.current = clip.url;
    if (clip.url) player.replace(clip.url);
  }, [clip.url, player]);

  // Drive the opening once mode enters 'intro'. Title card is the fallback
  // when there's no clip (not yet generated, or generation failed).
  useEffect(() => {
    if (mode !== 'intro') return undefined;
    let cancelled = false;
    const advance = () => { if (!cancelled) beginNarration(); };
    if (clipUrlRef.current) {
      const subscription = player.addListener('playToEnd', advance);
      player.currentTime = 0;
      player.play();
      return () => { cancelled = true; subscription.remove(); };
    }
    titleTimerRef.current = setTimeout(advance, 3400);
    return () => { cancelled = true; clearTimeout(titleTimerRef.current); };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function startPolling(jobId) {
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      const result = await pollOpeningClip(jobId);
      if (!mountedRef.current) return; // left the screen — stop polling
      if (result.status === 'succeeded') { setClip((c) => ({ ...c, status: 'succeeded', url: result.url })); return; }
      if (result.status === 'failed' || attempts > 24) { setClip((c) => ({ ...c, status: 'failed' })); return; }
      pollRef.current = setTimeout(tick, 5000);
    };
    pollRef.current = setTimeout(tick, 4000);
  }

  async function generate() {
    setPhase('loading');
    setError('');
    narration.stop();
    clearTimeout(pollRef.current);
    clearTimeout(titleTimerRef.current);
    setClip({ available: false, status: 'none', url: null });
    setMode('idle');
    setPlaying({ index: 0, state: 'idle' });
    try {
      const result = await generateSubjectContent(subject, { action: 'lesson-script' });
      if (!mountedRef.current) return;
      if (!result.slides?.length) throw new Error('Não foi possível montar a aula agora.');
      setScript(result);
      setPhase('ready');
      onSave?.(result);
      const opening = await startOpeningClip({ prompt: result.soraPrompt, seconds: 5 });
      if (!mountedRef.current) return;
      if (opening.available && opening.jobId) {
        setClip({ available: true, status: 'generating', url: null });
        startPolling(opening.jobId);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Falha ao gerar a aula.');
      setPhase('idle');
    }
  }

  function beginNarration() {
    setMode('slides');
    narration.start(
      script.slides.map((slide) => ({ speaker: 'narrator', text: slide.narration || slide.heading })),
      {
        onUpdate: (update) => setPlaying({ index: update.superseded ? 0 : update.index, state: update.superseded ? 'idle' : update.state }),
        onEnd: () => { setPlaying({ index: 0, state: 'idle' }); setMode('idle'); },
      },
    );
  }

  // The [mode] effect handles the actual clip/title-card playback → beginNarration.
  function play() {
    if (!script?.slides?.length) return;
    setPlaying({ index: 0, state: 'playing' });
    setMode('intro');
  }

  function stopAll() {
    clearTimeout(titleTimerRef.current);
    narration.stop();
    try { player.pause(); } catch { /* no-op */ }
    setMode('idle');
    setPlaying({ index: 0, state: 'idle' });
  }

  if (phase === 'loading') {
    return (
      <View className="flex-row items-center gap-2 py-4">
        <ActivityIndicator color="#4f46e5" />
        <Text className="text-[13px] text-slate-500">Preparando sua vídeo aula de {subject.name}...</Text>
      </View>
    );
  }

  if (!script) {
    return (
      <View className="gap-3">
        <View className="gap-1">
          <View className="flex-row items-center gap-1.5">
            <Icon name="film" size={13} color="#4f46e5" />
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Vídeo aula</Text>
          </View>
          <Text className="text-[16px] font-bold text-slate-900">Aula personalizada de {subject.name}</Text>
          <Text className="text-[13px] text-slate-600">Slides narrados a partir das suas notas, com um clipe de abertura gerado pela IA.</Text>
        </View>
        {error ? <View className="rounded-xl bg-red-50 px-3 py-2.5" accessibilityRole="alert"><Text className="text-[13px] text-red-600">{error}</Text></View> : null}
        <Pressable onPress={generate} className="flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-3">
          <Icon name="film" size={16} color="#ffffff" />
          <Text className="text-[14px] font-semibold text-white">Gerar vídeo aula</Text>
        </Pressable>
      </View>
    );
  }

  const slide = script.slides[Math.max(0, playing.index)] || script.slides[0];
  const isPlaying = playing.state === 'playing';
  const isPaused = playing.state === 'paused';
  const statusLabel = clip.status === 'succeeded' ? 'clipe pronto' : clip.status === 'generating' ? 'gerando…' : 'title card';

  return (
    <View className="gap-4">
      <View className="min-h-52 justify-center overflow-hidden rounded-2xl bg-slate-900">
        {mode === 'intro' && clip.url ? (
          <VideoView player={player} style={{ width: '100%', height: 208 }} contentFit="cover" nativeControls={false} />
        ) : null}
        {mode === 'intro' && !clip.url ? (
          <View className="items-center gap-1 px-6 py-14">
            <Text className="text-[11px] font-bold tracking-widest text-indigo-300">AULA</Text>
            <Text className="text-center text-[19px] font-bold text-white">{script.title}</Text>
            <Text className="text-[13px] text-slate-400">{subject.name}</Text>
          </View>
        ) : null}
        {mode !== 'intro' ? (
          <View className="gap-2 px-5 py-6" accessibilityLiveRegion="polite">
            <Text className="text-[11px] text-indigo-300">Slide {Math.max(0, playing.index) + 1} / {script.slides.length}</Text>
            <Text className="text-[18px] font-bold text-white">{slide.heading}</Text>
            <View className="gap-1">
              {(slide.bullets || []).map((bullet, i) => (
                <Text key={i} className="text-[13px] text-slate-200">• {bullet}</Text>
              ))}
            </View>
            {(isPlaying || isPaused) && slide.narration ? (
              <Text className="mt-1 text-[12px] italic text-slate-400">{slide.narration}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <View className="h-1.5 rounded-full bg-indigo-600" style={{ width: `${((Math.max(0, playing.index) + 1) / script.slides.length) * 100}%` }} />
      </View>

      <View className="flex-row items-center gap-3">
        {mode === 'intro' ? (
          <View className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-slate-200 py-3">
            <Icon name="film" size={20} color="#64748b" />
            <Text className="text-[14px] font-semibold text-slate-500">Introdução…</Text>
          </View>
        ) : isPlaying ? (
          <Pressable onPress={() => narration.pause()} className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3">
            <Icon name="pause" size={20} color="#ffffff" />
            <Text className="text-[14px] font-semibold text-white">Pausar</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => (isPaused ? narration.resume() : play())} className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3">
            <Icon name="play" size={20} color="#ffffff" />
            <Text className="text-[14px] font-semibold text-white">{isPaused ? 'Retomar' : 'Assistir aula'}</Text>
          </Pressable>
        )}
        {mode !== 'idle' ? (
          <Pressable onPress={stopAll} accessibilityLabel="Parar" className="h-12 w-12 items-center justify-center rounded-xl border border-slate-200">
            <Icon name="stop" size={18} color="#475569" />
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row items-center gap-1.5 self-start rounded-full bg-slate-100 px-3 py-1">
        <Icon name="film" size={12} color="#64748b" />
        <Text className="text-[11px] text-slate-500">Abertura: {statusLabel}</Text>
      </View>

      <Pressable onPress={generate} className="flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5">
        <Icon name="rotate" size={14} color="#475569" />
        <Text className="text-[13px] font-medium text-slate-600">Gerar nova aula</Text>
      </Pressable>
    </View>
  );
}
