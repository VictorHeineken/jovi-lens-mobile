import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Icon from './Icon.jsx';
import { searchLibrary } from '../services/search.js';

function resultLabel(kind) {
  return { nota: 'Nota', historico: 'Histórico', foto: 'Foto' }[kind] || 'Resultado';
}

export default function LibrarySearch({ notes, aiHistory, records, onOpen }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchLibrary(query, { notes, aiHistory, records }), [query, notes, aiHistory, records]);

  return (
    <View className="gap-2" accessibilityLabel="Busca na biblioteca">
      <View className="flex-row items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <Icon name="search" size={17} color="#64748b" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar notas, textos e pesquisas..."
          accessibilityLabel="Buscar na biblioteca"
          className="flex-1 text-[15px] text-slate-900"
          placeholderTextColor="#94a3b8"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} accessibilityLabel="Limpar busca" hitSlop={8}>
            <Icon name="close" size={14} color="#64748b" />
          </Pressable>
        ) : null}
      </View>

      {query ? (
        <View className="gap-1.5" accessibilityRole="menu" accessibilityLabel="Resultados da busca">
          {results.length ? (
            results.map((result) => (
              <Pressable
                key={result.id}
                onPress={() => onOpen?.(result.record, result.kind === 'historico' ? 'study' : 'viewer')}
                className="flex-row items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 active:bg-slate-50"
              >
                <Icon name={result.kind === 'foto' ? 'image' : result.kind === 'historico' ? 'history' : 'note'} size={15} color="#4f46e5" />
                <View className="flex-1 gap-0.5">
                  <Text className="text-[14px] font-semibold text-slate-900" numberOfLines={1}>{result.title}</Text>
                  <Text className="text-[12px] text-slate-500">{resultLabel(result.kind)} · {result.category}</Text>
                  {result.summary ? <Text className="text-[12px] text-slate-500" numberOfLines={2}>{result.summary}</Text> : null}
                </View>
                <Icon name="chevron" size={15} color="#94a3b8" />
              </Pressable>
            ))
          ) : (
            <View className="flex-row items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3">
              <Icon name="search" size={18} color="#94a3b8" />
              <Text className="text-[13px] text-slate-500">Nenhum resultado para "{query}".</Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
