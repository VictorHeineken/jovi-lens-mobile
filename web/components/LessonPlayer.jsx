import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { generateSubjectContent } from '../services/subjectStudy.js';
import { narration } from '../services/audio.js';
import { pollOpeningClip, startOpeningClip } from '../services/videoLesson.js';
import { exportLessonWebm } from '../services/videoExport.js';

export default function LessonPlayer({ subject, saved, onSave }) {
  const [phase, setPhase] = useState(saved ? 'ready' : 'idle');
  const [script, setScript] = useState(saved || null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('idle'); // idle | intro | slides
  const [playing, setPlaying] = useState({ index: 0, state: 'idle' });
  const [clip, setClip] = useState({ available: false, status: 'none', url: null });
  const [exporting, setExporting] = useState(null);
  const videoRef = useRef(null);
  const pollRef = useRef(null);
  const titleTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const clipUrlRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; narration.stop(); window.clearTimeout(pollRef.current); window.clearTimeout(titleTimerRef.current); };
  }, []);

  useEffect(() => { clipUrlRef.current = clip.url; }, [clip.url]);

  // Drive the opening once mode enters 'intro' — runs AFTER render, so the
  // <video> ref exists (fixing the "clip never plays" tick race) and a
  // freshly-ready clip isn't skipped. Title card is the fallback.
  useEffect(() => {
    if (mode !== 'intro') return undefined;
    let cancelled = false;
    const advance = () => { if (!cancelled) beginNarration(); };
    const video = videoRef.current;
    if (clipUrlRef.current && video) {
      video.currentTime = 0;
      video.onended = advance;
      video.play().catch(advance);
    } else {
      titleTimerRef.current = window.setTimeout(advance, 3400);
    }
    return () => { cancelled = true; window.clearTimeout(titleTimerRef.current); if (video) video.onended = null; };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function startPolling(jobId) {
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      const result = await pollOpeningClip(jobId);
      if (!mountedRef.current) return; // left the screen — stop polling
      if (result.status === 'succeeded') { setClip((c) => ({ ...c, status: 'succeeded', url: result.url })); return; }
      if (result.status === 'failed' || attempts > 24) { setClip((c) => ({ ...c, status: 'failed' })); return; }
      pollRef.current = window.setTimeout(tick, 5000);
    };
    pollRef.current = window.setTimeout(tick, 4000);
  }

  async function generate() {
    setPhase('loading');
    setError('');
    narration.stop();
    window.clearTimeout(pollRef.current);
    window.clearTimeout(titleTimerRef.current);
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
    window.clearTimeout(titleTimerRef.current);
    narration.stop();
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.onended = null; }
    setMode('idle');
    setPlaying({ index: 0, state: 'idle' });
  }

  async function doExport() {
    setExporting(0);
    try {
      await exportLessonWebm({ title: script.title, subjectName: subject.name, slides: script.slides, onProgress: (p) => setExporting(Math.round(p * 100)) });
    } catch (err) {
      setError(err.message || 'Não foi possível exportar o vídeo.');
    } finally {
      setExporting(null);
    }
  }

  if (phase === 'loading') return <div className="studio-loading"><span className="loading-orbit" /> Preparando sua vídeo aula de {subject.name}...</div>;

  if (!script) {
    return (
      <div className="studio-panel">
        <div className="studio-hero">
          <span className="studio-panel-kicker"><Icon name="film" size={13} /> Vídeo aula</span>
          <h3>Aula personalizada de {subject.name}</h3>
          <p>Slides narrados a partir das suas notas, com um clipe de abertura. Toque para assistir no app ou exporte como vídeo para compartilhar.</p>
        </div>
        {error && <div className="studio-error" role="alert">{error}</div>}
        <button className="studio-primary" onClick={generate}><Icon name="film" size={16} /> Gerar vídeo aula</button>
      </div>
    );
  }

  const slide = script.slides[Math.max(0, playing.index)] || script.slides[0];
  const isPlaying = playing.state === 'playing';
  const isPaused = playing.state === 'paused';

  return (
    <div className="studio-panel">
      <div className="lesson-stage">
        {mode === 'intro' && clip.url && (
          <video ref={videoRef} className="lesson-clip" src={clip.url} playsInline muted={false} />
        )}
        {mode === 'intro' && !clip.url && (
          <div className="lesson-titlecard">
            <span>AULA</span>
            <strong>{script.title}</strong>
            <small>{subject.name}</small>
          </div>
        )}
        {mode !== 'intro' && (
          <div className="lesson-slide" aria-live="polite">
            <span className="lesson-slide-index">Slide {Math.max(0, playing.index) + 1} / {script.slides.length}</span>
            <h3>{slide.heading}</h3>
            <ul>{(slide.bullets || []).map((bullet, i) => <li key={i}>{bullet}</li>)}</ul>
            {(isPlaying || isPaused) && slide.narration && <p className="lesson-caption">{slide.narration}</p>}
          </div>
        )}
      </div>

      <div className="lesson-progress"><i style={{ width: `${((Math.max(0, playing.index) + 1) / script.slides.length) * 100}%` }} /></div>

      <div className="lesson-controls">
        {mode === 'intro'
          ? <button className="podcast-play" disabled><Icon name="film" size={20} /> Introdução…</button>
          : isPlaying
            ? <button className="podcast-play" onClick={() => narration.pause()}><Icon name="pause" size={20} /> Pausar</button>
            : <button className="podcast-play" onClick={() => (isPaused ? narration.resume() : play())}><Icon name="play" size={20} /> {isPaused ? 'Retomar' : 'Assistir aula'}</button>}
        {mode !== 'idle' && <button className="podcast-stop" onClick={stopAll} aria-label="Parar"><Icon name="stop" size={18} /></button>}
      </div>

      <div className="lesson-meta">
        <span className={`lesson-clip-badge status-${clip.status}`}>
          <Icon name="film" size={12} /> Abertura: {clip.status === 'succeeded' ? 'clipe pronto' : clip.status === 'generating' ? 'gerando…' : clip.status === 'failed' ? 'title card' : 'title card'}
        </span>
      </div>

      <button className="studio-primary lesson-export" onClick={doExport} disabled={exporting !== null}>
        <Icon name="download" size={16} /> {exporting !== null ? `Exportando… ${exporting}%` : 'Exportar vídeo (.webm)'}
      </button>
      <button className="studio-ghost wide" onClick={generate}><Icon name="rotate" size={14} /> Gerar nova aula</button>
    </div>
  );
}
