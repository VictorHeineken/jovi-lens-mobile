import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { generateSubjectContent } from '../services/subjectStudy.js';
import { narration } from '../services/audio.js';

const SPEAKER_LABEL = { A: 'Ana', B: 'Especialista', narrator: 'Narrador', coach: 'IA', feedback: 'Feedback' };
const FORMAT_LABEL = {
  dialogue: 'Conversa · 2 vozes',
  single: 'Episódio · narrador',
  drive: 'No carro · mãos livres',
};

export default function PodcastPlayer({ subject, saved, savedVariants = null, initialFormat: preferredFormat = null, onSave }) {
  const initialFormat = preferredFormat || saved?.format || (savedVariants?.dialogue ? 'dialogue' : Object.keys(savedVariants || {})[0]) || 'dialogue';
  const [format, setFormat] = useState(initialFormat);
  const [script, setScript] = useState(savedVariants?.[initialFormat] || saved || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playback, setPlayback] = useState({ index: -1, state: 'idle', mode: null });
  const [coachAnswers, setCoachAnswers] = useState({});

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
      setCoachAnswers({});
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
    const savedScript = savedVariants?.[next];
    if (savedScript) {
      narration.stop();
      setPlayback({ index: -1, state: 'idle', mode: null });
      setScript(savedScript);
      setCoachAnswers({});
      setError('');
      return;
    }
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
  const currentIndex = playback.index >= 0 ? playback.index : 0;
  const currentLabel = script?.segments?.length ? `Trecho ${currentIndex + 1} de ${script.segments.length}` : '';

  if (loading) return <div className="studio-loading"><span className="loading-orbit" /> Gravando seu podcast de {subject.name}...</div>;

  if (!script) {
    return (
      <div className="studio-panel">
        <div className="studio-hero">
          <span className="studio-panel-kicker"><Icon name="waveform" size={13} /> Podcast da matéria</span>
          <h3>Ouça {subject.name} em áudio</h3>
          <p>Transformamos suas notas em episódio. O modo No carro organiza a revisão para ouvir sem olhar para a tela.</p>
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
          <span>{FORMAT_LABEL[script.format || format] || FORMAT_LABEL.dialogue}</span>
          <strong>{script.title}</strong>
          {script.durationMinutes && <small>Aprox. {script.durationMinutes} min</small>}
        </div>
      </div>

      {script.format === 'drive' && (
        <div className="podcast-drive">
          <span><Icon name="route" size={13} /> Modo carro</span>
          <p>A IA conversa com você, faz perguntas da matéria e dá feedback para a resposta escolhida.</p>
          {currentLabel && <small>{currentLabel}</small>}
        </div>
      )}

      <FormatChooser format={format} onChoose={chooseFormat} />

      <div className="podcast-controls">
        {isPlaying
          ? <button className="podcast-play" onClick={() => narration.pause()}><Icon name="pause" size={20} /> Pausar</button>
          : <button className="podcast-play" onClick={() => (isPaused ? narration.resume() : playFrom(0))}><Icon name="play" size={20} /> {isPaused ? 'Retomar' : 'Reproduzir'}</button>}
        {(isPlaying || isPaused) && <button className="podcast-stop" onClick={() => { narration.stop(); setPlayback({ index: -1, state: 'idle', mode: null }); }} aria-label="Parar"><Icon name="stop" size={18} /></button>}
      </div>
      {script.format === 'drive' && script.segments.length > 1 && (
        <div className="podcast-skip-controls">
          <button onClick={() => playFrom(Math.max(0, currentIndex - 1))}>Trecho anterior</button>
          <button onClick={() => playFrom(Math.min(script.segments.length - 1, currentIndex + 1))}>Próximo trecho</button>
        </div>
      )}
      {playback.mode === 'browser' && (isPlaying || isPaused) && <p className="podcast-mode-hint"><Icon name="info" size={12} /> Narração pela voz do dispositivo.</p>}

      {script.format === 'drive' && <DriveCoach script={script} answers={coachAnswers} onAnswer={(id, value) => setCoachAnswers((current) => ({ ...current, [id]: value }))} />}

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

      {!!script.takeaways?.length && (
        <div className="podcast-takeaways">
          <span className="studio-subtitle"><Icon name="bookmark" size={13} /> Para lembrar depois</span>
          <div>{script.takeaways.map((item) => <span key={item}>{item}</span>)}</div>
        </div>
      )}

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
      <button role="tab" aria-selected={format === 'drive'} className={format === 'drive' ? 'active' : ''} onClick={() => onChoose('drive')}>
        <Icon name="route" size={14} /> No carro
      </button>
    </div>
  );
}

function DriveCoach({ script, answers, onAnswer }) {
  const interactions = Array.isArray(script.interactions) ? script.interactions : [];
  if (!interactions.length) return null;

  return (
    <section className="podcast-coach" aria-label="Treino interativo no carro">
      <div className="podcast-coach-head">
        <span><Icon name="sparkle" size={13} /> Bate-papo com IA</span>
        <small>Responda em voz alta e toque na opção para ver o feedback.</small>
      </div>
      {interactions.map((item, index) => {
        const selectedId = answers[item.id];
        const selected = item.options?.find((option) => option.id === selectedId);
        return (
          <article className="podcast-coach-card" key={item.id || item.prompt}>
            <span className="podcast-coach-topic">{String(index + 1).padStart(2, '0')} · {item.topic}</span>
            <strong>{item.prompt}</strong>
            <div>
              {(item.options || []).map((option) => (
                <button
                  key={option.id}
                  className={selectedId === option.id ? 'selected' : ''}
                  onClick={() => onAnswer(item.id, option.id)}
                >
                  {option.text}
                </button>
              ))}
            </div>
            {selected && (
              <p className={selected.correct ? 'correct' : 'wrong'}>
                <Icon name={selected.correct ? 'check' : 'info'} size={13} />
                {selected.correct ? item.feedbackCorrect : item.feedbackWrong}
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}
