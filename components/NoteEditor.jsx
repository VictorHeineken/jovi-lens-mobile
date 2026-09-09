import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Icon from './Icon.jsx';

export default function NoteEditor({ note, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({
    title: note?.title || '',
    category: note?.category || 'Estudos',
    subcategory: note?.subcategory || 'Geral',
    summary: note?.summary || '',
    text: note?.text || '',
    tags: Array.isArray(note?.tags) ? note.tags.join(', ') : '',
  }));
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft({
      title: note?.title || '',
      category: note?.category || 'Estudos',
      subcategory: note?.subcategory || 'Geral',
      summary: note?.summary || '',
      text: note?.text || '',
      tags: Array.isArray(note?.tags) ? note.tags.join(', ') : '',
    });
  }, [note?.id]);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submit() {
    if (!draft.title.trim()) {
      setError('Dê um título para esta nota.');
      return;
    }
    onSave?.({
      ...note,
      title: draft.title.trim(),
      category: draft.category.trim() || 'Estudos',
      subcategory: draft.subcategory.trim() || 'Geral',
      topicPath: [draft.subcategory.trim() || 'Geral'],
      summary: draft.summary.trim(),
      text: draft.text.trim(),
      tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View className="flex-1 bg-white">
        <Pressable
          onPress={onClose}
          accessibilityLabel="Fechar edição"
          className="absolute right-4 top-14 z-10 h-9 w-9 items-center justify-center rounded-full bg-slate-100"
        >
          <Icon name="close" size={20} color="#475569" />
        </Pressable>
        <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-14">
          <View className="flex-row items-center gap-1.5">
            <Icon name="note" size={13} color="#4f46e5" />
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Editar nota</Text>
          </View>
          <Text className="text-[22px] font-bold text-slate-900">Deixe este conteúdo do seu jeito.</Text>
          <Text className="text-[13px] text-slate-500">Ajuste o título, a matéria e o texto sem perder a imagem que originou a análise.</Text>
          {error ? (
            <View className="rounded-xl bg-red-50 px-3 py-2.5" accessibilityRole="alert">
              <Text className="text-[13px] text-red-600">{error}</Text>
            </View>
          ) : null}

          <Field label="Título">
            <TextInput value={draft.title} onChangeText={(value) => update('title', value)} maxLength={120} autoComplete="off" className="text-[15px] text-slate-900" />
          </Field>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Matéria">
                <TextInput value={draft.category} onChangeText={(value) => update('category', value)} maxLength={60} className="text-[15px] text-slate-900" />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Subtema">
                <TextInput value={draft.subcategory} onChangeText={(value) => update('subcategory', value)} maxLength={80} className="text-[15px] text-slate-900" />
              </Field>
            </View>
          </View>
          <Field label="Tags" hint="separe por vírgula">
            <TextInput value={draft.tags} onChangeText={(value) => update('tags', value)} maxLength={240} placeholder="revisão, prova, importante" placeholderTextColor="#94a3b8" className="text-[15px] text-slate-900" />
          </Field>
          <Field label="Resumo">
            <TextInput value={draft.summary} onChangeText={(value) => update('summary', value)} multiline numberOfLines={3} maxLength={1000} textAlignVertical="top" className="min-h-20 text-[15px] text-slate-900" />
          </Field>
          <Field label="Conteúdo completo">
            <TextInput value={draft.text} onChangeText={(value) => update('text', value)} multiline numberOfLines={7} maxLength={10000} textAlignVertical="top" className="min-h-40 text-[15px] text-slate-900" />
          </Field>

          <View className="flex-row gap-3 pt-2">
            <Pressable onPress={onClose} className="flex-1 items-center rounded-xl border border-slate-200 bg-white py-3">
              <Text className="text-[14px] font-semibold text-slate-600">Cancelar</Text>
            </Pressable>
            <Pressable onPress={submit} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-3">
              <Icon name="check" size={15} color="#ffffff" />
              <Text className="text-[14px] font-semibold text-white">Salvar alterações</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Field({ label, hint, children }) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline gap-1.5">
        <Text className="text-[13px] font-semibold text-slate-700">{label}</Text>
        {hint ? <Text className="text-[11px] text-slate-400">{hint}</Text> : null}
      </View>
      <View className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        {children}
      </View>
    </View>
  );
}
