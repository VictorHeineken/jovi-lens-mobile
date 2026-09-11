import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Icon from '../components/Icon.jsx';
import NotesTimeline from '../components/NotesTimeline.jsx';
import SmartImageSheet from '../components/SmartImageSheet.jsx';
import LibrarySearch from '../components/LibrarySearch.jsx';
import { useAppData } from '../context/AppDataContext.jsx';

export default function HistoryScreen() {
  const { notes, aiHistory, records } = useAppData();
  const [selected, setSelected] = useState(null);
  const [selectedView, setSelectedView] = useState('viewer');

  function openRecord(record, view = 'viewer') {
    setSelectedView(view);
    setSelected(record);
  }

  return (
    <View className="flex-1 bg-white">
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <View className="flex-row items-center justify-between">
          <View className="gap-1">
            <View className="flex-row items-center gap-1.5">
              <Icon name="history" size={13} color="#4f46e5" />
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Uso da IA</Text>
            </View>
            <Text className="text-[24px] font-bold text-slate-900">Histórico</Text>
          </View>
          <View className="items-end">
            <Text className="text-[20px] font-bold text-slate-900">{notes.length + aiHistory.length}</Text>
            <Text className="text-[11px] text-slate-400">registros</Text>
          </View>
        </View>
        <LibrarySearch notes={notes} aiHistory={aiHistory} records={records} onOpen={openRecord} />
        <NotesTimeline notes={notes} aiHistory={aiHistory} records={records} onOpen={openRecord} />
      </ScrollView>
      {selected ? (
        <SmartImageSheet
          record={{ ...selected, ...(records.find((item) => item.id === selected.id) || {}) }}
          initialView={selectedView}
          onClose={() => { setSelected(null); setSelectedView('viewer'); }}
        />
      ) : null}
    </View>
  );
}
