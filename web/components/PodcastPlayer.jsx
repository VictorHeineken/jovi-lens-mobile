import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { generateSubjectContent } from '../services/subjectStudy.js';
import { narration } from '../services/audio.js';

const SPEAKER_LABEL = { A: 'Ana', B: 'Especialista', narrator: 'Narrador' };

export default function PodcastPlayer({ subject, saved, onSave }) {
  const [format, setFormat] = useState(saved?.format || 'dialogue');
  const [script, setScript] = useState(saved || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playback, setPlayback] = useState({ index: -1, state: 'idle', mode: null });

  useEffect(() => () => narration.stop(), []);

  async function generate(nextFormat = format) {
    setLoading(true);
    setError('');
    narration.stop();
    setPlayback({ index: -1, state: 'idle', mode: null });
    try {
      const result = await generateSubjectContent(subject, { action: 'podcast-script', format: nextFormat });
      if (!result.segments?.length) throw new Error('Não foi possível gerar o roteiro agora.');
      setScript(result);
      onSave?.(result);
    } catch (err) {
      setError(err.message || 'Falha ao gerar o podcast.');
    } finally {
      setLoading(false);
    }
  }

  function chooseFormat(next) {
    if (next === format) return;
    setFormat(next);
    if (script) generate(next);
  }

  function playFrom(index = 0) {
    if (!script?.segments?.length) return;
    narration.start(script.segments, {
      onUpdate: (u) => setPlayback({ index: u.index, state: u.state, mode: u.mode }),
      onEnd: () => setPlayback({ index: -1, state: 'idle', mode: null }),
    }, index);
  }

  const isPlaying = playback.state === 'playing';
  const isPaused = playback.state === 'paused';

  if (loading) return <div className="studio-loading"><span className="loading-orbit" /> Gravando seu podcast de {subject.name}...</div>;

  if (!script) {
    return (
      <div className="studio-panel">
        <div className="studio-hero">
          <span className="studio-panel-kicker"><Icon name="waveform" size={13} /> Podcast da matéria</span>
          <h3>Ouça {subject.name} em áudio</h3>
          <p>Transformamos suas notas em um episódio. Escolha o formato e toque para ouvir — a narração usa a voz do dispositivo quando o áudio ao vivo não está configurado.</p>
        </div>
        <FormatChooser format={format} onChoose={chooseFormat} />
        {error && <div className="studio-error" role="alert">{error}</div>}
        <button className="studio-primary" onClick={() => generate()}><Icon name="waveform" size={16} /> Gerar podcast</button>
      </div>
    );
  }

  return (
    <div className="studio-panel">
      <div className="podcast-cover">
        <div className="podcast-cover-art" aria-hidden="true"><Icon name="waveform" size={26} /></div>
        <div className="podcast-cover-copy">
          <span>{format === 'dialogue' ? 'Conversa · 2 vozes' : 'Episódio · narrador'}</span>
          <strong>{script.title}</strong>
        </div>
      </div>

      <FormatChooser format={format} onChoose={chooseFormat} />

      <div className="podcast-controls">
        {isPlaying
          ? <button className="podcast-play" onClick={() => narration.pause()}><Icon name="pause" size={20} /> Pausar</button>
          : <button className="podcast-play" onClick={() => (isPaused ? narration.resume() : playFrom(0))}><Icon name="play" size={20} /> {isPaused ? 'Retomar' : 'Reproduzir'}</button>}
        {(isPlaying || isPaused) && <button className="podcast-stop" onClick={() => { narration.stop(); setPlayback({ index: -1, state: 'idle', mode: null }); }} aria-label="Parar"><Icon name="stop" size={18} /></button>}
      </div>
      {playback.mode === 'browser' && (isPlaying || isPaused) && <p className="podcast-mode-hint"><Icon name="info" size={12} /> Narração pela voz do dispositivo.</p>}

      <div className="podcast-transcript">
        {script.segments.map((segment, index) => (
          <button
            key={index}
            className={`podcast-line${playback.index === index ? ' active' : ''} speaker-${segment.speaker}`}
            onClick={() => playFrom(index)}
          >
            <span className="podcast-speaker">{SPEAKER_LABEL[segment.speaker] || 'Narrador'}</span>
            <span className="podcast-text">{segment.text}</span>
          </button>
        ))}
      </div>

      <button className="studio-ghost wide" onClick={() => generate()}><Icon name="rotate" size={14} /> Gerar novo episódio</button>
    </div>
  );
}

function FormatChooser({ format, onChoose }) {
  return (
    <div className="podcast-format" role="tablist" aria-label="Formato do podcast">
      <button role="tab" aria-selected={format === 'dialogue'} className={format === 'dialogue' ? 'active' : ''} onClick={() => onChoose('dialogue')}>
        <Icon name="user" size={14} /> Dois apresentadores
      </button>
      <button role="tab" aria-selected={format === 'single'} className={format === 'single' ? 'active' : ''} onClick={() => onChoose('single')}>
        <Icon name="mic" size={14} /> Narrador único
      </button>
    </div>
  );
}
