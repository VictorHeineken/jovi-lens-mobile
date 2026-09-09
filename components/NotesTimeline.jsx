import { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
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
    setOpenId((current) => (current === eventId ? null : eventId));
  }

  function startConversation(event) {
    onOpen?.(getRecord(event, records), 'study');
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between rounded-2xl bg-indigo-50 px-4 py-4">
        <View className="flex-1 gap-1 pr-3">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Memória da IA</Text>
          <Text className="text-[16px] font-bold text-slate-900">O que você pediu fica em texto.</Text>
          <Text className="text-[13px] text-slate-600">Pesquisas, explicações e respostas organizadas por data para continuar estudando.</Text>
        </View>
        <View className="h-11 w-11 items-center justify-center rounded-full bg-white">
          <Icon name="note" size={23} color="#4f46e5" />
        </View>
      </View>

      <View className="flex-row flex-wrap gap-2" accessibilityRole="tablist" accessibilityLabel="Filtrar notas">
        {FILTERS.map((item) => {
          const count = item.id === 'all' ? events.length : item.id === 'saved' ? events.filter((event) => event.kind === 'saved').length : item.id === 'ai' ? events.filter((event) => event.kind === 'ai').length : events.filter((event) => event.favorite).length;
          const active = filter === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setFilter(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200 bg-white'}`}
            >
              <Text className={`text-[13px] font-medium ${active ? 'text-white' : 'text-slate-600'}`}>{item.label}</Text>
              <Text className={`text-[11px] ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{count}</Text>
            </Pressable>
          );
        })}
      </View>

      {groups.length ? (
        groups.map((group) => (
          <View className="gap-2" key={group.key}>
            <View className="flex-row items-baseline justify-between">
              <Text className="text-[14px] font-bold text-slate-900">{group.label}</Text>
              <Text className="text-[12px] text-slate-400">{group.items.length} {group.items.length === 1 ? 'registro' : 'registros'}</Text>
            </View>
            <View className="gap-2">
              {group.items.map((event) => (
                <NoteTimelineCard
                  key={event.id}
                  event={event}
                  open={openId === event.id}
                  record={getRecord(event, records)}
                  onToggle={() => toggle(event.id)}
                  onConversation={() => startConversation(event)}
                  onFavorite={event.kind === 'saved' && onFavorite ? () => onFavorite(event.sourceId) : undefined}
                  onRemove={event.kind === 'saved' && onRemove ? () => onRemove(event.sourceId) : undefined}
                />
              ))}
            </View>
          </View>
        ))
      ) : (
        <View className="items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-10">
          <Icon name="note" size={22} color="#94a3b8" />
          <Text className="text-[14px] font-semibold text-slate-700">Nenhuma pesquisa nesta seleção</Text>
          <Text className="text-center text-[13px] text-slate-500">Abra uma imagem, use a IA e a conversa aparecerá aqui em ordem cronológica.</Text>
        </View>
      )}
    </View>
  );
}

function NoteTimelineCard({ event, record, open, onToggle, onConversation, onFavorite, onRemove }) {
  return (
    <View className={`overflow-hidden rounded-2xl border bg-white ${open ? 'border-indigo-300' : 'border-slate-200'}`}>
      <View className="flex-row items-stretch">
        <Pressable onPress={onToggle} accessibilityState={{ expanded: open }} className="flex-1 flex-row items-center gap-3 px-3 py-3">
          <MediaThumb record={record} />
          <View className="flex-1 gap-0.5">
            <Text className="text-[11px] text-slate-400">{event.type} · {event.category}</Text>
            <Text className="text-[14px] font-semibold text-slate-900" numberOfLines={1}>{event.title}</Text>
            <Text className="text-[12px] text-slate-500" numberOfLines={2}>{event.summary}</Text>
          </View>
          <Icon name="chevron" size={17} color="#94a3b8" strokeWidth={open ? 2.4 : 1.9} />
        </Pressable>
        <Pressable onPress={onConversation} accessibilityLabel={`Conversar sobre ${event.title}`} className="items-center justify-center gap-1 border-l border-slate-100 px-3">
          <Icon name="send" size={14} color="#4f46e5" />
          <Text className="text-[10px] font-medium text-indigo-600">Conversar</Text>
        </Pressable>
      </View>

      {open ? (
        <View className="gap-3 border-t border-slate-100 px-4 py-3">
          {event.prompt ? <TextBlock label="Você pediu" text={event.prompt} /> : null}
          {event.contentText ? <TextBlock label="Texto da imagem" text={event.contentText} /> : null}
          {event.response ? <TextBlock label="Resposta da IA" text={event.response} /> : null}
          {event.keyPoints?.length ? (
            <View className="gap-1.5">
              {event.keyPoints.map((point, index) => (
                <View key={`${point}-${index}`} className="flex-row items-start gap-2">
                  <Icon name="check" size={14} color="#16a34a" />
                  <Text className="flex-1 text-[13px] text-slate-700">{point}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View className="flex-row flex-wrap gap-2 pt-1">
            <ActionButton icon="send" label="Continuar conversa" onPress={onConversation} />
            {onFavorite ? <ActionButton icon="bookmark" label={event.favorite ? 'Desfavoritar' : 'Favoritar'} onPress={onFavorite} /> : null}
            {onRemove ? <ActionButton icon="trash" label="Excluir" onPress={onRemove} danger /> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function TextBlock({ label, text }) {
  return (
    <View className="gap-1">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</Text>
      <Text className="text-[13px] leading-5 text-slate-700">{text}</Text>
    </View>
  );
}

function ActionButton({ icon, label, onPress, danger }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${danger ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}
    >
      <Icon name={icon} size={14} color={danger ? '#dc2626' : '#475569'} />
      <Text className={`text-[12px] font-medium ${danger ? 'text-red-600' : 'text-slate-600'}`}>{label}</Text>
    </Pressable>
  );
}

function MediaThumb({ record }) {
  const [failed, setFailed] = useState(false);
  if (!record?.src || failed) {
    return (
      <View className="h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
        <Icon name="image" size={17} color="#94a3b8" />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: record.src }}
      accessibilityLabel={record.label || 'Imagem'}
      onError={() => setFailed(true)}
      className="h-12 w-12 rounded-xl bg-slate-100"
    />
  );
}
