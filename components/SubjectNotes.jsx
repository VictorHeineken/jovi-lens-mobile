import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
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

export default function SubjectNotes({ notes = [], records = [], onOpen, onOpenStudio, onFavorite, onRemove, onEdit }) {
  const [openSubject, setOpenSubject] = useState(null);
  const [activeSubtheme, setActiveSubtheme] = useState({});
  const subjects = useMemo(() => groupBySubject(notes), [notes]);
  const subthemeCount = subjects.reduce((total, subject) => total + subject.subthemes.length, 0);

  function toggleSubject(subject) {
    setOpenSubject((current) => (current === subject ? null : subject));
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between rounded-2xl bg-indigo-50 px-4 py-4">
        <View className="flex-1 gap-1 pr-3">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Biblioteca de estudo</Text>
          <Text className="text-[16px] font-bold text-slate-900">Conhecimento organizado por temas</Text>
          <Text className="text-[13px] text-slate-600">Consulte suas notas separadas por matéria, tecnologia e leitura — o texto sempre referencia a imagem que originou a análise.</Text>
        </View>
        <View className="items-center">
          <Text className="text-[20px] font-bold text-slate-900">{subjects.length}</Text>
          <Text className="text-[11px] text-slate-400">temas</Text>
        </View>
      </View>

      <View className="flex-row gap-4">
        <View className="flex-row items-center gap-1.5">
          <Icon name="note" size={14} color="#64748b" />
          <Text className="text-[12px] text-slate-500">{notes.length} {notes.length === 1 ? 'conteúdo' : 'conteúdos'}</Text>
        </View>
        <Text className="text-[12px] text-slate-500">{subthemeCount} {subthemeCount === 1 ? 'subtema' : 'subtemas'}</Text>
      </View>

      {subjects.length ? (
        subjects.map((subject) => {
          const meta = THEME_META[subject.subject] || DEFAULT_THEME_META;
          const isOpen = openSubject === subject.subject;
          const currentName = activeSubtheme[subject.subject] || subject.subthemes[0]?.name;
          const subtheme = subject.subthemes.find((item) => item.name === currentName) || subject.subthemes[0];

          return (
            <View className="overflow-hidden rounded-2xl border border-slate-200" key={subject.subject}>
              <Pressable
                onPress={() => toggleSubject(subject.subject)}
                accessibilityState={{ expanded: isOpen }}
                className="flex-row items-center gap-3 px-4 py-3.5"
              >
                <View className="h-9 w-9 items-center justify-center rounded-full bg-indigo-50">
                  <Icon name={meta.icon} size={16} color="#4f46e5" />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-[15px] font-bold text-slate-900">{subject.subject}</Text>
                  <Text className="text-[12px] text-slate-500" numberOfLines={1}>{meta.description}</Text>
                </View>
                <Icon name="chevron" size={17} color="#94a3b8" strokeWidth={isOpen ? 2.4 : 1.9} />
              </Pressable>

              {isOpen ? (
                <View className="gap-3 border-t border-slate-100 px-4 py-4">
                  {onOpenStudio ? (
                    <Pressable onPress={() => onOpenStudio(subject.subject)} className="flex-row items-center gap-3 rounded-2xl bg-indigo-600 px-4 py-3.5">
                      <View className="h-9 w-9 items-center justify-center rounded-full bg-white/15">
                        <Icon name="layers" size={16} color="#ffffff" />
                      </View>
                      <View className="flex-1 gap-0.5">
                        <Text className="text-[14px] font-bold text-white">Estúdio da matéria</Text>
                        <Text className="text-[11px] text-indigo-100">Perguntas, simulado, podcast, vídeo aula e plano de {subject.subject}</Text>
                      </View>
                      <Icon name="arrow-up-right" size={15} color="#ffffff" />
                    </Pressable>
                  ) : null}

                  <View className="flex-row flex-wrap gap-2" accessibilityRole="tablist" accessibilityLabel={`Subtemas de ${subject.subject}`}>
                    {subject.subthemes.map((item) => {
                      const active = item.name === subtheme?.name;
                      return (
                        <Pressable
                          key={item.name}
                          onPress={() => setActiveSubtheme((current) => ({ ...current, [subject.subject]: item.name }))}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: active }}
                          className={`rounded-full border px-3 py-1.5 ${active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200 bg-white'}`}
                        >
                          <Text className={`text-[12px] font-medium ${active ? 'text-white' : 'text-slate-600'}`}>{item.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

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
                        onEdit={onEdit ? () => onEdit(note) : undefined}
                      />
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })
      ) : (
        <View className="items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-10">
          <Icon name="note" size={22} color="#94a3b8" />
          <Text className="text-[14px] font-semibold text-slate-700">Sua biblioteca começa com a primeira nota</Text>
          <Text className="text-center text-[13px] text-slate-500">Abra uma imagem, use a IA e salve o conteúdo para organizar seus estudos aqui.</Text>
        </View>
      )}
    </View>
  );
}

function NoteDetail({ note, record, onConversation, onViewImage, onFavorite, onRemove, onEdit }) {
  const images = record?.images || [];
  return (
    <View className="gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <View className="gap-1.5">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Nota da IA</Text>
        <Text className="text-[16px] font-bold text-slate-900">{note.title || 'Conteúdo estudado'}</Text>
        <View className="flex-row gap-2">
          <Pill text={note.category || 'Estudos'} />
          <Pill text={formatNoteDate(note.createdAt)} muted />
        </View>
      </View>

      {note.summary ? <Text className="text-[13px] leading-5 text-slate-700">{note.summary}</Text> : null}

      {images.length ? (
        <View className="flex-row flex-wrap gap-2">
          {images.map((src, index) => (
            <Pressable
              key={src}
              onPress={() => onViewImage?.(src)}
              accessibilityLabel={`Ampliar imagem de referência ${index + 1} de ${note.title || 'nota'}`}
              className="gap-1"
            >
              <MediaThumb src={src} alt={`Imagem de referência ${index + 1}`} />
              <Text className="text-[10px] text-slate-400">{index === 0 ? 'Imagem usada' : 'Complementar'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {note.text ? <Text className="text-[13px] leading-5 text-slate-600">{note.text}</Text> : null}

      {note.keyPoints?.length ? (
        <View className="gap-1.5">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pontos importantes</Text>
          {note.keyPoints.map((point, index) => (
            <View key={`${point}-${index}`} className="flex-row items-start gap-2">
              <Icon name="check" size={14} color="#16a34a" />
              <Text className="flex-1 text-[13px] text-slate-700">{point}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {note.tags?.length ? (
        <View className="flex-row flex-wrap gap-1.5">
          {note.tags.map((tag) => (
            <Text key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">#{tag}</Text>
          ))}
        </View>
      ) : null}

      {note.sources?.length ? (
        <View className="gap-1">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Fontes</Text>
          {note.sources.map((source) => (
            <Pressable key={source.url} onPress={() => Linking.openURL(source.url)} className="flex-row items-center gap-1">
              <Text className="text-[12px] text-indigo-600">{source.label}</Text>
              <Icon name="arrow-up-right" size={11} color="#4f46e5" />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-2 pt-1">
        <ActionButton icon="send" label="Conversar com IA" onPress={onConversation} primary />
        <NoteAudioButton note={note} />
        {onEdit ? <ActionButton icon="note" label="Editar" onPress={onEdit} /> : null}
        {onFavorite ? <ActionButton icon="bookmark" label={note.favorite ? 'Desfavoritar' : 'Favoritar'} onPress={onFavorite} /> : null}
        {onRemove ? <ActionButton icon="trash" label="Excluir" onPress={onRemove} danger /> : null}
      </View>
    </View>
  );
}

function Pill({ text, muted }) {
  return (
    <View className={`rounded-full px-2.5 py-1 ${muted ? 'bg-slate-100' : 'bg-indigo-50'}`}>
      <Text className={`text-[11px] font-medium ${muted ? 'text-slate-500' : 'text-indigo-600'}`}>{text}</Text>
    </View>
  );
}

function ActionButton({ icon, label, onPress, primary, danger }) {
  const palette = primary ? 'border-indigo-600 bg-indigo-600' : danger ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white';
  const textColor = primary ? 'text-white' : danger ? 'text-red-600' : 'text-slate-600';
  const iconColor = primary ? '#ffffff' : danger ? '#dc2626' : '#475569';
  return (
    <Pressable onPress={onPress} className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${palette}`}>
      <Icon name={icon} size={14} color={iconColor} />
      <Text className={`text-[12px] font-medium ${textColor}`}>{label}</Text>
    </Pressable>
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
    <Pressable
      onPress={toggle}
      accessibilityState={{ selected: active }}
      className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${active ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white'}`}
    >
      <Icon name={active ? 'stop' : 'play'} size={14} color={active ? '#4f46e5' : '#475569'} />
      <Text className={`text-[12px] font-medium ${active ? 'text-indigo-600' : 'text-slate-600'}`}>{active ? 'Parar' : 'Ouvir'}</Text>
    </Pressable>
  );
}

function MediaThumb({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <View className="h-16 w-16 items-center justify-center rounded-xl bg-slate-100">
        <Icon name="image" size={17} color="#94a3b8" />
      </View>
    );
  }
  return <Image source={{ uri: src }} accessibilityLabel={alt} onError={() => setFailed(true)} className="h-16 w-16 rounded-xl bg-slate-100" />;
}
