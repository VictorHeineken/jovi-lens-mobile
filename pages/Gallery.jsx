import { useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import SmartImageSheet from '../components/SmartImageSheet.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { fileToDataUrl, prepareImageForAI } from '../services/imageAnalysis.js';

export default function Gallery() {
  const { records, addRecord } = useAppData();
  const [selected, setSelected] = useState(null);
  const inputRef = useRef(null);

  async function onFiles(event) {
    const files = [...(event.target.files || [])].filter((file) => file.type.startsWith('image/'));
    for (const file of files.slice(0, 6)) {
      const raw = await fileToDataUrl(file);
      const src = await prepareImageForAI(raw);
      await addRecord({ src, source: 'upload', label: file.name });
    }
    event.target.value = '';
  }

  return (
    <main className="light-page gallery-page">
      <header className="mobile-header">
        <div>
          <div className="eyebrow">Sua biblioteca</div>
          <h1>Galeria</h1>
        </div>
        <button className="round-primary" onClick={() => inputRef.current?.click()} aria-label="Adicionar fotos"><Icon name="upload" size={19} /></button>
      </header>

      <section className="gallery-hero">
        <div>
          <Icon name="sparkle" size={18} />
          <strong>Qualquer foto vira conhecimento.</strong>
          <span>Abra uma imagem para copiar, pesquisar ou criar uma nota com IA.</span>
        </div>
      </section>

      <div className="section-row"><strong>Recentes</strong><span>{records.length} itens</span></div>
      <section className="photo-grid" aria-label="Fotos recentes">
        <button className="add-photo-tile" onClick={() => inputRef.current?.click()}>
          <Icon name="upload" size={23} />
          <span>Adicionar</span>
        </button>
        {records.map((record) => (
          <button className="photo-tile" key={record.id} onClick={() => setSelected(record)}>
            <img src={record.src} alt={record.label || 'Foto'} />
            {record.analysis && <span className="ai-badge"><Icon name="sparkle" size={11} /> IA</span>}
          </button>
        ))}
      </section>
      <input ref={inputRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={onFiles} />
      {selected && <SmartImageSheet record={records.find((item) => item.id === selected.id) || selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
