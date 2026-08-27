import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import NotesTimeline from '../components/NotesTimeline.jsx';
import SmartImageSheet from '../components/SmartImageSheet.jsx';
import { useAppData } from '../context/AppDataContext.jsx';

export default function History() {
  const { notes, aiHistory, records } = useAppData();
  const [selected, setSelected] = useState(null);
  const [selectedView, setSelectedView] = useState('viewer');

  function openRecord(record, view = 'viewer') {
    setSelectedView(view);
    setSelected(record);
  }

  return (
    <main className="light-page notes-page">
      <header className="mobile-header">
        <div><div className="eyebrow"><Icon name="history" size={13} /> Uso da IA</div><h1>Histórico</h1></div>
        <div className="header-count"><strong>{notes.length + aiHistory.length}</strong><span>registros</span></div>
      </header>
      <NotesTimeline notes={notes} aiHistory={aiHistory} records={records} onOpen={openRecord} />
      {selected && <SmartImageSheet record={{ ...(records.find((item) => item.id === selected.id) || {}), ...selected }} initialView={selectedView} onClose={() => { setSelected(null); setSelectedView('viewer'); }} />}
    </main>
  );
}
