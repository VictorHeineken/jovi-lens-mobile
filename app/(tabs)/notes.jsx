import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Icon from '../../components/Icon.jsx';
import SubjectNotes from '../../components/SubjectNotes.jsx';
import SubjectStudio from '../../components/SubjectStudio.jsx';
import SmartImageSheet from '../../components/SmartImageSheet.jsx';
import LibrarySearch from '../../components/LibrarySearch.jsx';
import NoteEditor from '../../components/NoteEditor.jsx';
import { useAppData } from '../../context/AppDataContext.jsx';

export default function NotesScreen() {
  const { notes, aiHistory, records, subjects, removeNote, updateNote, toggleNoteFavorite } = useAppData();
  const [selected, setSelected] = useState(null);
  const [selectedView, setSelectedView] = useState('viewer');
  const [studioSubject, setStudioSubject] = useState(null);
  const [editing, setEditing] = useState(null);

  function openRecord(record, view = 'viewer') {
    setSelectedView(view);
    setSelected(record);
  }

  function openStudio(subjectName) {
    setStudioSubject(subjects.find((subject) => subject.name === subjectName) || null);
  }

  return (
    <View className="flex-1 bg-white">
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-14">
        <View className="flex-row items-center justify-between">
          <View className="gap-1">
            <View className="flex-row items-center gap-1.5">
              <Icon name="note" size={13} color="#4f46e5" />
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Memória da IA</Text>
            </View>
            <Text className="text-[24px] font-bold text-slate-900">Notas</Text>
          </View>
          <View className="items-end">
            <Text className="text-[20px] font-bold text-slate-900">{notes.length}</Text>
            <Text className="text-[11px] text-slate-400">salvas</Text>
          </View>
        </View>
        <LibrarySearch notes={notes} aiHistory={aiHistory} records={records} onOpen={openRecord} />
        <SubjectNotes
          notes={notes}
          records={records}
          onOpen={openRecord}
          onOpenStudio={openStudio}
          onFavorite={toggleNoteFavorite}
          onRemove={removeNote}
          onEdit={setEditing}
        />
      </ScrollView>
      {selected ? (
        <SmartImageSheet
          record={{ ...selected, ...(records.find((item) => item.id === selected.id) || {}) }}
          initialView={selectedView}
          onClose={() => { setSelected(null); setSelectedView('viewer'); }}
        />
      ) : null}
      {studioSubject ? <SubjectStudio subject={studioSubject} onClose={() => setStudioSubject(null)} /> : null}
      {editing ? (
        <NoteEditor
          note={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => { updateNote(editing.id, next); setEditing(null); }}
        />
      ) : null}
    </View>
  );
}
