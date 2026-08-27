import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';

const FILTERS = [
  { id: 'all', label: 'Tudo' },
  { id: 'saved', label: 'Salvas' },
  { id: 'ai', label: 'Pesquisas IA' },
  { id: 'favorites', label: 'Favoritas' },
];

function dayKey(date) {
  const value = new Date(date);
  return Number.isNaN(value.getTime()) ? 'unknown' : value.toISOString().slice(0, 10);
}

function dayLabel(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return 'Sem data';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(value) === dayKey(today)) return 'Hoje';
  if (dayKey(value) === dayKey(yesterday)) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(value);
}

function toTimelineEvents(notes, aiHistory) {
  const saved = notes.map((note) => ({
    id: `saved-${note.id}`,
    kind: 'saved',
    createdAt: note.createdAt,
    image: note.image,
    recordId: note.recordId,
    title: note.title || 'Nota da IA',
    type: 'Nota salva',
    category: note.category || 'Estudos',
    subcategory: note.subcategory || note.contentType || 'Revisão',
    summary: note.summary || 'Conteúdo guardado para revisar depois.',
    contentText: note.text || '',
    response: note.summary || '',
    keyPoints: note.keyPoints || [],
    favorite: Boolean(note.favorite),
    sourceId: note.id,
  }));

  const researched = aiHistory.map((entry) => ({
    id: entry.id,
    kind: 'ai',
    createdAt: entry.createdAt,
    image: entry.image,
    recordId: entry.recordId,
    title: entry.title || entry.prompt || 'Pesquisa com a IA',
    type: entry.type || 'Pesquisa IA',
    category: entry.category || 'Estudos',
    subcategory: entry.subcategory || 'Pesquisa',
    summary: entry.response || entry.text || entry.contentText || 'Pesquisa realizada a partir da imagem.',
    prompt: entry.prompt || entry.question || '',
    contentText: entry.contentText || '',
    response: entry.response || entry.text || '',
    keyPoints: entry.keyPoints || [],
    favorite: false,
    sourceId: entry.id,
  }));

  return [...saved, ...researched].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function groupEvents(events) {
  const groups = new Map();
  events.forEach((event) => {
    const key = dayKey(event.createdAt);
    if (!groups.has(key)) groups.set(key, { key, label: dayLabel(event.createdAt), items: [] });
    groups.get(key).items.push(event);
  });
  return [...groups.values()];
}

function filterEvents(events, filter) {
  if (filter === 'saved') return events.filter((event) => event.kind === 'saved');
  if (filter === 'ai') return events.filter((event) => event.kind === 'ai');
  if (filter === 'favorites') return events.filter((event) => event.favorite);
  return events;
}

function getRecord(event, records) {
  const record = records.find((item) => item.id === event.recordId);
  if (record) return { ...record, aiAvailable: event.kind === 'ai' || Boolean(record.analysis) ? record.aiAvailable : true };
  return {
    id: event.recordId || event.id,
    src: event.image,
    label: event.title,
    aiAvailable: true,
    analysis: null,
  };
}

export default function NotesTimeline({ notes = [], aiHistory = [], records = [], onOpen, onFavorite, onRemove }) {
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const events = useMemo(() => toTimelineEvents(notes, aiHistory), [notes, aiHistory]);
  const visibleEvents = useMemo(() => filterEvents(events, filter), [events, filter]);
  const groups = useMemo(() => groupEvents(visibleEvents), [visibleEvents]);

  function toggle(eventId) {
    setOpenId((current) => current === eventId ? null : eventId);
  }

  function startConversation(event) {
    onOpen?.(getRecord(event, records), 'study');
  }

  return (
    <section className="origin-notes-view">
      <div className="origin-notes-hero">
        <div>
          <span className="origin-gallery-kicker">Memória da IA</span>
          <strong>O que você pediu fica em texto.</strong>
          <p>Pesquisas, explicações e respostas organizadas por data para continuar estudando.</p>
        </div>
        <div className="origin-notes-hero-icon"><Icon name="note" size={23} /></div>
      </div>

      <div className="origin-notes-filters" role="tablist" aria-label="Filtrar notas">
        {FILTERS.map((item) => {
          const count = item.id === 'all' ? events.length : item.id === 'saved' ? events.filter((event) => event.kind === 'saved').length : item.id === 'ai' ? events.filter((event) => event.kind === 'ai').length : events.filter((event) => event.favorite).length;
          return <button key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)} role="tab" aria-selected={filter === item.id}>{item.label}<span>{count}</span></button>;
        })}
      </div>

      {groups.length ? groups.map((group) => (
        <section className="origin-notes-day" key={group.key}>
          <div className="origin-notes-date"><strong>{group.label}</strong><span>{group.items.length} {group.items.length === 1 ? 'registro' : 'registros'}</span></div>
          <div className="origin-notes-list">
            {group.items.map((event) => <NoteTimelineCard key={event.id} event={event} open={openId === event.id} record={getRecord(event, records)} onToggle={() => toggle(event.id)} onConversation={() => startConversation(event)} onFavorite={event.kind === 'saved' && onFavorite ? () => onFavorite(event.sourceId) : undefined} onRemove={event.kind === 'saved' && onRemove ? () => onRemove(event.sourceId) : undefined} />)}
          </div>
        </section>
      )) : (
        <div className="origin-notes-empty"><span><Icon name="note" size={22} /></span><strong>Nenhuma pesquisa nesta seleção</strong><p>Abra uma imagem, use a IA e a conversa aparecerá aqui em ordem cronológica.</p></div>
      )}
    </section>
  );
}

function NoteTimelineCard({ event, record, open, onToggle, onConversation, onFavorite, onRemove }) {
  return (
    <article className={`origin-notes-card${open ? ' open' : ''}`}>
      <div className="origin-notes-card-main">
        <button className="origin-notes-toggle" onClick={onToggle} aria-expanded={open}>
          <span className="origin-notes-thumb"><MediaThumb record={record} alt="Imagem da pesquisa" /></span>
          <span className="origin-notes-card-copy"><small>{event.type} · {event.category}</small><strong>{event.title}</strong><p>{event.summary}</p></span>
          <Icon name="chevron" size={17} className="origin-notes-chevron" />
        </button>
        <button className="origin-notes-chat" onClick={onConversation} aria-label={`Conversar sobre ${event.title}`}><Icon name="send" size={14} /><span>Conversar</span></button>
      </div>

      {open && <div className="origin-notes-expanded">
        {event.prompt && <div className="origin-notes-text-block origin-notes-prompt"><span>Você pediu</span><p>{event.prompt}</p></div>}
        {event.contentText && <div className="origin-notes-text-block"><span>Texto da imagem</span><p>{event.contentText}</p></div>}
        {event.response && <div className="origin-notes-text-block"><span>Resposta da IA</span><p>{event.response}</p></div>}
        {!!event.keyPoints?.length && <div className="origin-notes-points">{event.keyPoints.map((point, index) => <div key={`${point}-${index}`}><Icon name="check" size={14} />{point}</div>)}</div>}
        <div className="origin-notes-expanded-actions">
          <button onClick={onConversation}><Icon name="send" size={14} /> Continuar conversa</button>
          {onFavorite && <button onClick={onFavorite}><Icon name="bookmark" size={14} /> {event.favorite ? 'Desfavoritar' : 'Favoritar'}</button>}
          {onRemove && <button className="origin-notes-delete" onClick={onRemove}><Icon name="trash" size={14} /> Excluir</button>}
        </div>
      </div>}
    </article>
  );
}

function MediaThumb({ record, alt }) {
  const [failed, setFailed] = useState(false);
  if (!record?.src || failed) return <span className="origin-media-fallback"><Icon name="image" size={17} /><small>Imagem indisponível</small></span>;
  return <img src={record.src} alt={alt || record.label || 'Imagem'} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
