import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import useDialogAccessibility from './useDialogAccessibility.js';

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
  const dialogRef = useDialogAccessibility(onClose);

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

  function submit(event) {
    event.preventDefault();
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
    <div ref={dialogRef} className="sheet-backdrop note-editor-backdrop" role="dialog" aria-modal="true" aria-label="Editar nota">
      <button className="sheet-close" onClick={onClose} aria-label="Fechar edição"><Icon name="close" size={20} /></button>
      <form className="note-editor" onSubmit={submit}>
        <div className="studio-kicker"><Icon name="note" size={13} /> Editar nota</div>
        <h2>Deixe este conteúdo do seu jeito.</h2>
        <p className="note-editor-intro">Ajuste o título, a matéria e o texto sem perder a imagem que originou a análise.</p>
        {error && <div className="studio-error" role="alert">{error}</div>}
        <label>Título<input value={draft.title} onChange={(event) => update('title', event.target.value)} maxLength={120} autoComplete="off" /></label>
        <div className="note-editor-grid"><label>Matéria<input value={draft.category} onChange={(event) => update('category', event.target.value)} maxLength={60} /></label><label>Subtema<input value={draft.subcategory} onChange={(event) => update('subcategory', event.target.value)} maxLength={80} /></label></div>
        <label>Tags <span className="field-hint">separe por vírgula</span><input value={draft.tags} onChange={(event) => update('tags', event.target.value)} maxLength={240} placeholder="revisão, prova, importante" /></label>
        <label>Resumo<textarea value={draft.summary} onChange={(event) => update('summary', event.target.value)} rows={3} maxLength={1000} /></label>
        <label>Conteúdo completo<textarea value={draft.text} onChange={(event) => update('text', event.target.value)} rows={7} maxLength={10000} /></label>
        <div className="note-editor-actions"><button type="button" className="studio-ghost" onClick={onClose}>Cancelar</button><button type="submit" className="studio-primary"><Icon name="check" size={15} /> Salvar alterações</button></div>
      </form>
    </div>
  );
}
