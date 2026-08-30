import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import SubjectNotes from '../components/SubjectNotes.jsx';
import SubjectStudio from '../components/SubjectStudio.jsx';
import SmartImageSheet from '../components/SmartImageSheet.jsx';
import { useAppData } from '../context/AppDataContext.jsx';

export default function Notes() {
  const { notes, records, subjects, removeNote, toggleNoteFavorite } = useAppData();
  const [selected, setSelected] = useState(null);
  const [selectedView, setSelectedView] = useState('viewer');
  const [studioSubject, setStudioSubject] = useState(null);

  function openRecord(record, view = 'viewer') {
    setSelectedView(view);
    setSelected(record);
  }

  function openStudio(subjectName) {
    setStudioSubject(subjects.find((subject) => subject.name === subjectName) || null);
  }

  return (
    <main className="light-page notes-page">
      <header className="mobile-header">
        <div><div className="eyebrow"><Icon name="note" size={13} /> Memória da IA</div><h1>Notas</h1></div>
        <div className="header-count"><strong>{notes.length}</strong><span>salvas</span></div>
      </header>
      <SubjectNotes
        notes={notes}
        records={records}
        onOpen={openRecord}
        onOpenStudio={openStudio}
        onFavorite={toggleNoteFavorite}
        onRemove={removeNote}
      />
      {selected && <SmartImageSheet record={{ ...(records.find((item) => item.id === selected.id) || {}), ...selected }} initialView={selectedView} onClose={() => { setSelected(null); setSelectedView('viewer'); }} />}
      {studioSubject && <SubjectStudio subject={studioSubject} onClose={() => setStudioSubject(null)} />}
    </main>
  );
}
