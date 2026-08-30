import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { narration, noteToSpeech } from '../services/audio.js';

const THEME_META = {
  'História': { icon: 'history', description: 'Linha do tempo, indústria e transporte da Revolução Industrial.' },
  'Programação': { icon: 'code', description: 'Guias técnicos separados por linguagem e camada.' },
  'Livros': { icon: 'book', description: 'Leituras identificadas por imagem e organizadas por tema.' },
  'Fotografia': { icon: 'camera', description: 'Equipamentos, acervos e o processo por trás de cada imagem.' },
};
const DEFAULT_THEME_META = { icon: 'note', description: 'Conteúdos organizados por tema.' };

function subthemeName(note) {
  return (Array.isArray(note.topicPath) && note.topicPath[0]) || note.subcategory || 'Geral';
}

function groupBySubject(notes) {
  const subjects = new Map();
  notes.forEach((note) => {
    const subject = note.category || 'Outros';
    if (!subjects.has(subject)) subjects.set(subject, new Map());
    const subthemes = subjects.get(subject);
    const key = subthemeName(note);
    if (!subthemes.has(key)) subthemes.set(key, { name: key, items: [] });
    subthemes.get(key).items.push(note);
  });

  return [...subjects.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([subject, subthemeMap]) => {
      const subthemes = [...subthemeMap.values()].map((subtheme) => ({
        ...subtheme,
        items: [...subtheme.items].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
      }));
      subthemes.sort((a, b) => new Date(b.items[0]?.createdAt || 0) - new Date(a.items[0]?.createdAt || 0));
      return { subject, subthemes };
    });
}

// note.image is the theme photo chosen for this note; record?.src only fills in when a note has none.
function noteImages(note, record) {
  const primary = note.image || record?.src;
  return [...new Set([primary, ...(Array.isArray(note.images) ? note.images : [])].filter(Boolean))];
}

function getRecord(note, records) {
  const record = records.find((item) => item.id === note.recordId);
  const src = note.image || record?.src;
  const images = noteImages(note, record);
  if (record) return { ...record, src, images, aiAvailable: true };
  return {
    id: note.recordId || note.id,
    src,
    images,
    label: note.title,
    aiAvailable: true,
    analysis: null,
  };
}

function formatNoteDate(value) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export default function SubjectNotes({ notes = [], records = [], onOpen, onOpenStudio, onFavorite, onRemove }) {
  const [openSubject, setOpenSubject] = useState(null);
  const [activeSubtheme, setActiveSubtheme] = useState({});
  const subjects = useMemo(() => groupBySubject(notes), [notes]);
  const subthemeCount = subjects.reduce((total, subject) => total + subject.subthemes.length, 0);

  function toggleSubject(subject) {
    setOpenSubject((current) => (current === subject ? null : subject));
  }

  return (
    <section className="origin-subject-notes">
      <div className="origin-subject-notes-hero">
        <div>
          <span className="origin-gallery-kicker">Biblioteca de estudo</span>
          <strong>Conhecimento organizado por temas</strong>
          <p>Consulte suas notas separadas por matéria, tecnologia e leitura — o texto sempre referencia a imagem que originou a análise.</p>
        </div>
        <div className="origin-subject-notes-count"><strong>{subjects.length}</strong><span>temas</span></div>
      </div>

      <div className="origin-subject-notes-summary">
        <span><Icon name="note" size={14} /> {notes.length} {notes.length === 1 ? 'conteúdo' : 'conteúdos'}</span>
        <span>{subthemeCount} {subthemeCount === 1 ? 'subtema' : 'subtemas'}</span>
      </div>

      {subjects.length ? subjects.map((subject) => {
        const meta = THEME_META[subject.subject] || DEFAULT_THEME_META;
        const isOpen = openSubject === subject.subject;
        const currentName = activeSubtheme[subject.subject] || subject.subthemes[0]?.name;
        const subtheme = subject.subthemes.find((item) => item.name === currentName) || subject.subthemes[0];

        return (
          <section className={`origin-subject-section${isOpen ? ' open' : ''}`} key={subject.subject}>
            <button
              className="origin-subject-heading"
              onClick={() => toggleSubject(subject.subject)}
              aria-expanded={isOpen}
            >
              <span className="origin-subject-icon"><Icon name={meta.icon} size={16} /></span>
              <span className="origin-subject-heading-copy">
                <h2>{subject.subject}</h2>
                <span>{meta.description}</span>
              </span>
              <Icon name="chevron" size={17} className="origin-subject-chevron" />
            </button>

            {isOpen && (
              <div className="origin-subject-children">
                {onOpenStudio && (
                  <button className="subject-studio-entry" onClick={() => onOpenStudio(subject.subject)}>
                    <span className="subject-studio-entry-icon"><Icon name="layers" size={16} /></span>
                    <span className="subject-studio-entry-copy">
                      <strong>Estúdio da matéria</strong>
                      <small>Perguntas, simulado, podcast, vídeo aula e plano de {subject.subject}</small>
                    </span>
                    <Icon name="arrow-up-right" size={15} />
                  </button>
                )}
                <div className="origin-subtheme-tabs" role="tablist" aria-label={`Subtemas de ${subject.subject}`}>
                  {subject.subthemes.map((item) => (
                    <button
                      key={item.name}
                      className={item.name === subtheme?.name ? 'active' : ''}
                      role="tab"
                      aria-selected={item.name === subtheme?.name}
                      onClick={() => setActiveSubtheme((current) => ({ ...current, [subject.subject]: item.name }))}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>

                {subtheme?.items.map((note) => {
                  const record = getRecord(note, records);
                  return (
                    <NoteDetail
                      key={note.id}
                      note={note}
                      record={record}
                      onConversation={() => onOpen?.(record, 'study')}
                      onViewImage={(src) => onOpen?.({ ...record, src, label: note.title }, 'viewer')}
                      onFavorite={onFavorite ? () => onFavorite(note.id) : undefined}
                      onRemove={onRemove ? () => onRemove(note.id) : undefined}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      }) : (
        <div className="origin-subject-notes-empty">
          <span><Icon name="note" size={22} /></span>
          <strong>Sua biblioteca começa com a primeira nota</strong>
          <p>Abra uma imagem, use a IA e salve o conteúdo para organizar seus estudos aqui.</p>
        </div>
      )}
    </section>
  );
}

function NoteDetail({ note, record, onConversation, onViewImage, onFavorite, onRemove }) {
  const images = record?.images || [];
  return (
    <article className="origin-note-detail">
      <div className="origin-note-detail-head">
        <span className="origin-gallery-kicker">Nota da IA</span>
        <h3>{note.title || 'Conteúdo estudado'}</h3>
        <div className="origin-note-pills">
          <span className="origin-note-pill">{note.category || 'Estudos'}</span>
          <span className="origin-note-pill muted">{formatNoteDate(note.createdAt)}</span>
        </div>
      </div>

      {note.summary && <p className="origin-note-summary">{note.summary}</p>}

      {!!images.length && (
        <div className="origin-note-figures">
          {images.map((src, index) => (
            <figure className="origin-note-figure" key={src}>
              <button onClick={() => onViewImage?.(src)} aria-label={`Ampliar imagem de referência ${index + 1} de ${note.title || 'nota'}`}>
                <MediaThumb src={src} alt={`Imagem de referência ${index + 1} de ${note.title || 'nota'}`} />
              </button>
              <figcaption>{index === 0 ? 'Imagem usada nesta análise' : 'Imagem complementar'}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {note.text && <p className="origin-note-text">{note.text}</p>}

      {!!note.keyPoints?.length && (
        <div className="origin-note-points">
          <span>Pontos importantes</span>
          {note.keyPoints.map((point, index) => <div key={`${point}-${index}`}><Icon name="check" size={14} />{point}</div>)}
        </div>
      )}

      {!!note.sources?.length && (
        <div className="origin-note-sources">
          <span>Fontes</span>
          {note.sources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              {source.label}<Icon name="arrow-up-right" size={11} />
            </a>
          ))}
        </div>
      )}

      <div className="origin-note-actions">
        <button className="origin-note-chat" onClick={onConversation}><Icon name="send" size={14} /><span>Conversar com IA</span></button>
        <NoteAudioButton note={note} />
        {onFavorite && <button onClick={onFavorite}><Icon name="bookmark" size={14} /> {note.favorite ? 'Desfavoritar' : 'Favoritar'}</button>}
        {onRemove && <button className="origin-note-delete" onClick={onRemove}><Icon name="trash" size={14} /> Excluir</button>}
      </div>
    </article>
  );
}

function NoteAudioButton({ note }) {
  const [state, setState] = useState('idle');
  const activeRef = useRef(false);

  useEffect(() => { activeRef.current = state !== 'idle'; }, [state]);
  // Stop playback if the note is unmounted (accordion collapsed / tab switched)
  // while THIS button owns the shared narrator.
  useEffect(() => () => { if (activeRef.current) narration.stop(); }, []);

  function toggle() {
    if (state === 'playing' || state === 'paused') {
      narration.stop();
      setState('idle');
      return;
    }
    narration.start([{ speaker: 'narrator', text: noteToSpeech(note) }], {
      onUpdate: (update) => setState(update.superseded ? 'idle' : update.state),
      onEnd: () => setState('idle'),
    });
  }

  const active = state === 'playing' || state === 'paused';
  return (
    <button className={`origin-note-audio${active ? ' active' : ''}`} onClick={toggle} aria-pressed={active}>
      <Icon name={active ? 'stop' : 'play'} size={14} /> {active ? 'Parar' : 'Ouvir'}
    </button>
  );
}

function MediaThumb({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="origin-media-fallback"><Icon name="image" size={17} /><small>Imagem indisponível</small></span>;
  return <img src={src} alt={alt || 'Imagem'} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
