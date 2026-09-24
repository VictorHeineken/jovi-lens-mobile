import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import SubjectNotes from '../components/SubjectNotes.jsx';
import SubjectStudio from '../components/SubjectStudio.jsx';
import SmartImageSheet from '../components/SmartImageSheet.jsx';
import LibrarySearch from '../components/LibrarySearch.jsx';
import NoteEditor from '../components/NoteEditor.jsx';
import { useAppData } from '../context/AppDataContext.jsx';

export default function Notes() {
  const { notes, aiHistory, records, subjects, removeNote, updateNote, toggleNoteFavorite } = useAppData();
  const [searchParams] = useSearchParams();
  const [selected, setSelected] = useState(null);
  const [selectedView, setSelectedView] = useState('viewer');
  const [studioSubject, setStudioSubject] = useState(null);
  const [studioInitialTab, setStudioInitialTab] = useState('overview');
  const [studioPodcastFormat, setStudioPodcastFormat] = useState(null);
  const [editing, setEditing] = useState(null);
  const focusSubject = searchParams.get('subject') || '';
  const focusStudio = searchParams.get('studio') || '';
  const focusPodcast = searchParams.get('podcast') || '';

  useEffect(() => {
    if (!focusSubject || !focusStudio) return;
    const subject = subjects.find((item) => item.name === focusSubject);
    if (!subject) return;
    setStudioSubject(subject);
    setStudioInitialTab(focusStudio);
    setStudioPodcastFormat(focusPodcast === 'drive' ? 'drive' : null);
  }, [focusSubject, focusStudio, focusPodcast, subjects]);

  function openRecord(record, view = 'viewer') {
    setSelectedView(view);
    setSelected(record);
  }

  function openStudio(subjectName, initialTab = 'overview') {
    setStudioInitialTab(initialTab);
    setStudioPodcastFormat(null);
    setStudioSubject(subjects.find((subject) => subject.name === subjectName) || null);
  }

  return (
    <main className="light-page notes-page">
      <header className="mobile-header">
        <div><div className="eyebrow"><Icon name="note" size={13} /> Memória da IA</div><h1>Notas</h1></div>
        <div className="header-count"><strong>{notes.length}</strong><span>salvas</span></div>
      </header>
      <LibrarySearch notes={notes} aiHistory={aiHistory} records={records} onOpen={openRecord} />
      <SubjectNotes
        notes={notes}
        records={records}
        focusSubject={focusSubject}
        onOpen={openRecord}
        onOpenStudio={openStudio}
        onFavorite={toggleNoteFavorite}
        onRemove={removeNote}
        onEdit={setEditing}
      />
      {selected && <SmartImageSheet record={{ ...selected, ...(records.find((item) => item.id === selected.id) || {}) }} initialView={selectedView} onClose={() => { setSelected(null); setSelectedView('viewer'); }} />}
      {studioSubject && (
        <SubjectStudio
          subject={studioSubject}
          initialTab={studioInitialTab}
          initialPodcastFormat={studioPodcastFormat}
          onClose={() => setStudioSubject(null)}
        />
      )}
      {editing && <NoteEditor note={editing} onClose={() => setEditing(null)} onSave={(next) => { updateNote(editing.id, next); setEditing(null); }} />}
    </main>
  );
}
