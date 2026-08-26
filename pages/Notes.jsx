import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { useAppData } from '../context/AppDataContext.jsx';

export default function Notes() {
  const { notes, removeNote } = useAppData();
  const [openId, setOpenId] = useState(notes[0]?.id || null);

  return (
    <main className="light-page notes-page">
      <header className="mobile-header">
        <div><div className="eyebrow">Memória inteligente</div><h1>Notas</h1></div>
        <div className="header-count">{notes.length}</div>
      </header>

      {notes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="note" size={30} /></div>
          <h2>Suas notas aparecem aqui</h2>
          <p>Fotografe ou abra uma imagem, espere a leitura e toque em “Nota IA”.</p>
        </div>
      ) : (
        <section className="notes-list">
          {notes.map((note) => {
            const open = openId === note.id;
            return (
              <article className={`note-card${open ? ' open' : ''}`} key={note.id}>
                <button className="note-card-main" onClick={() => setOpenId(open ? null : note.id)}>
                  <img src={note.image} alt="" />
                  <div><span>{note.category}</span><h2>{note.title}</h2><p>{note.summary}</p></div>
                  <Icon name="chevron" size={18} className="note-chevron" />
                </button>
                {open && (
                  <div className="note-expanded">
                    {!!note.keyPoints?.length && note.keyPoints.map((point, index) => <div key={index}><Icon name="check" size={15} />{point}</div>)}
                    <button className="danger-link" onClick={() => removeNote(note.id)}><Icon name="trash" size={16} /> Excluir nota</button>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
