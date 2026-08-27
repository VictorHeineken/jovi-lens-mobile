import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Copilot from './Copilot.jsx';
import Icon from '../components/Icon.jsx';
import NotesTimeline from '../components/NotesTimeline.jsx';
import SubjectNotes from '../components/SubjectNotes.jsx';
import SmartImageSheet from '../components/SmartImageSheet.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { fileToDataUrl } from '../services/imageAnalysis.js';

const GALLERY_TABS = [
  { id: 'photos', label: 'Fotos', icon: 'gallery' },
  { id: 'albums', label: 'Álbuns', icon: 'album' },
  { id: 'notes', label: 'Notas', icon: 'note' },
  { id: 'history', label: 'Histórico', icon: 'history' },
  { id: 'copilot', label: 'Copilot', icon: 'sparkle' },
];

function dayKey(date) {
  const value = new Date(date);
  return Number.isNaN(value.getTime()) ? 'unknown' : value.toISOString().slice(0, 10);
}

function dayLabel(date) {
  const value = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(value) === dayKey(today)) return 'Hoje';
  if (dayKey(value) === dayKey(yesterday)) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(value);
}

function groupRecords(records) {
  const groups = new Map();
  records.forEach((record) => {
    const key = dayKey(record.createdAt);
    if (!groups.has(key)) groups.set(key, { key, label: dayLabel(record.createdAt), items: [] });
    groups.get(key).items.push(record);
  });
  return [...groups.values()];
}

export default function Gallery() {
  const navigate = useNavigate();
  const { records, notes, aiHistory, addRecord } = useAppData();
  const [selected, setSelected] = useState(null);
  const [selectedView, setSelectedView] = useState('viewer');
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('photos');
  const [activeAlbum, setActiveAlbum] = useState(null);
  const inputRef = useRef(null);

  const orderedRecords = useMemo(() => [...records].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [records]);
  const recordGroups = useMemo(() => groupRecords(orderedRecords), [orderedRecords]);
  const albums = useMemo(() => {
    const camera = orderedRecords.filter((record) => record.source === 'camera');
    const documents = orderedRecords.filter((record) => /texto|livro|pesquisa|document/i.test(record.label || ''));
    const studied = orderedRecords.filter((record) => record.analysis || record.aiAvailable !== false);
    return [
      { id: 'all', title: 'Todas as fotos', subtitle: 'Seu arquivo completo', items: orderedRecords, icon: 'gallery' },
      { id: 'camera', title: 'Câmera', subtitle: 'Capturas feitas neste aparelho', items: camera.length ? camera : orderedRecords.slice(0, 2), icon: 'camera' },
      { id: 'documents', title: 'Documentos', subtitle: 'Textos e páginas para consultar', items: documents.length ? documents : orderedRecords.slice(1, 3), icon: 'note' },
      { id: 'studied', title: 'Estudadas', subtitle: 'Fotos que já viraram aprendizado', items: studied, icon: 'sparkle' },
    ];
  }, [orderedRecords]);
  const pageTitle = { photos: 'Fotos', albums: 'Álbuns', notes: 'Notas', history: 'Histórico', copilot: 'Copilot' }[activeTab];
  const pageKicker = { photos: 'Galeria', albums: 'Álbum', notes: 'Memória da IA', history: 'Uso da IA', copilot: 'Inteligência avançada' }[activeTab];

  async function onFiles(event) {
    const files = [...(event.target.files || [])].slice(0, 6);
    event.target.value = '';
    if (!files.length) return;
    setIsUploading(true);
    try {
      for (const file of files) {
        const src = await fileToDataUrl(file);
        await addRecord({ src, source: 'upload', label: file.name });
      }
      setMessage(`${files.length} ${files.length === 1 ? 'imagem adicionada' : 'imagens adicionadas'}`);
    } catch (error) {
      setMessage(error.message || 'Não foi possível adicionar essa imagem.');
    } finally {
      setIsUploading(false);
      window.setTimeout(() => setMessage(''), 2600);
    }
  }

  function openRecord(record, view = 'viewer') {
    setSelectedView(view);
    setSelected(record);
  }

  function openAlbum(album) {
    setActiveAlbum(album.id);
  }

  const selectedAlbum = albums.find((album) => album.id === activeAlbum);

  return (
    <main className={`light-page gallery-page origin-gallery${activeTab === 'copilot' ? ' copilot-active' : ''}`}>
      <div className="origin-gallery-scroll">
        <header className="origin-gallery-header">
          <div className="origin-gallery-title-line">
            <div><span className="origin-gallery-kicker">{pageKicker}</span><h1>{pageTitle}</h1></div>
            <div className="origin-gallery-header-actions">
              <button onClick={() => navigate('/camera')} aria-label="Abrir câmera"><Icon name="camera" size={18} /></button>
              <button onClick={() => setActiveTab('notes')} aria-label="Abrir notas da IA"><Icon name="note" size={18} /></button>
              <button onClick={() => inputRef.current?.click()} aria-label="Importar fotos"><Icon name="upload" size={18} /></button>
              <button onClick={() => setMessage('Organização inteligente ativada')} aria-label="Mais opções"><Icon name="more" size={19} /></button>
            </div>
          </div>
          <div className="origin-gallery-segmented" role="tablist" aria-label="Seções da galeria">
            <button className={activeTab === 'photos' ? 'active' : ''} onClick={() => { setActiveTab('photos'); setActiveAlbum(null); }} role="tab" aria-selected={activeTab === 'photos'}>Fotos</button>
            <button className={activeTab === 'albums' ? 'active' : ''} onClick={() => { setActiveTab('albums'); setActiveAlbum(null); }} role="tab" aria-selected={activeTab === 'albums'}>Álbuns</button>
          </div>
        </header>

        {activeTab === 'photos' && <PhotosView groups={recordGroups} isUploading={isUploading} onImport={() => inputRef.current?.click()} onOpen={openRecord} />}
        {activeTab === 'albums' && (selectedAlbum ? <AlbumDetail album={selectedAlbum} onBack={() => setActiveAlbum(null)} onOpen={openRecord} /> : <AlbumsView albums={albums} onOpen={openAlbum} />)}
        {activeTab === 'notes' && <SubjectNotes notes={notes} records={orderedRecords} onOpen={openRecord} />}
        {activeTab === 'history' && <NotesTimeline notes={notes} aiHistory={aiHistory} records={orderedRecords} onOpen={openRecord} />}
        {activeTab === 'copilot' && <Copilot embedded />}
      </div>

      <nav className="origin-gallery-bottom-nav" aria-label="Navegação da galeria">
        {GALLERY_TABS.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => { setActiveTab(tab.id); setActiveAlbum(null); }} aria-current={activeTab === tab.id ? 'page' : undefined}><Icon name={tab.icon} size={19} /><span>{tab.label}</span></button>)}
      </nav>

      <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onFiles} />
      {message && <div className="page-toast" role="status"><Icon name={isUploading ? 'sparkle' : 'check'} size={15} /> {message}</div>}
      {selected && <SmartImageSheet record={{ ...(records.find((item) => item.id === selected.id) || {}), ...selected }} initialView={selectedView} onClose={() => { setSelected(null); setSelectedView('viewer'); }} />}
    </main>
  );
}

function PhotosView({ groups, isUploading, onImport, onOpen }) {
  return (
    <section className="origin-photos-view">
      <div className="origin-gallery-summary"><div><strong>Recentes</strong><span>O seu mural de fotos</span></div><button onClick={onImport} disabled={isUploading}><Icon name="upload" size={15} /> {isUploading ? 'Importando' : 'Importar'}</button></div>
      {groups.map((group) => <section className="origin-photo-group" key={group.key}><div className="origin-date-row"><strong>{group.label}</strong><span>{group.items.length} {group.items.length === 1 ? 'item' : 'itens'}</span></div><div className="origin-photo-wall">{group.items.map((record) => <PhotoTile key={record.id} record={record} onOpen={onOpen} />)}</div></section>)}
      {!groups.length && <div className="gallery-empty"><Icon name="camera" size={20} /><p>Suas próximas fotos aparecem aqui.</p></div>}
    </section>
  );
}

function PhotoTile({ record, onOpen }) {
  return <button className="origin-photo-tile" onClick={() => onOpen(record)} aria-label={`Abrir ${record.label || 'foto'}`}><MediaThumb record={record} />{record.mediaType === 'video' ? <span className="origin-photo-marker" aria-label="Vídeo"><Icon name="play" size={10} /></span> : record.analysis && <span className="origin-photo-marker" aria-label="Foto estudada"><Icon name="sparkle" size={10} /></span>}</button>;
}

function MediaThumb({ record, alt = '' }) {
  const [failed, setFailed] = useState(false);
  if (!record?.src || failed) return <span className="origin-media-fallback"><Icon name={record?.mediaType === 'video' ? 'play' : 'image'} size={18} /><small>Imagem indisponível</small></span>;
  if (record.mediaType === 'video') return <video src={record.src} muted playsInline preload="metadata" aria-label={alt || record.label || 'Vídeo da galeria'} onError={() => setFailed(true)} />;
  return <img src={record.src} alt={alt || record.label || 'Foto da galeria'} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function AlbumsView({ albums, onOpen }) {
  return <section className="origin-albums-view"><div className="origin-section-heading"><div><strong>Álbuns</strong><span>Organizados no seu JOVI</span></div><button aria-label="Mais opções de álbuns"><Icon name="more" size={18} /></button></div><div className="origin-album-grid">{albums.map((album) => <button className="origin-album-card" key={album.id} onClick={() => onOpen(album)}><span className="origin-album-cover">{album.items[0] ? <MediaThumb record={album.items[0]} /> : <Icon name={album.icon} size={22} />}</span><span className="origin-album-copy"><strong>{album.title}</strong><small>{album.items.length} itens</small></span><Icon name="chevron" size={16} /></button>)}</div><div className="origin-smart-classification"><Icon name="sparkle" size={18} /><div><strong>Classificação inteligente</strong><span>Documentos, estudos e referências organizados automaticamente.</span></div><Icon name="chevron" size={16} /></div></section>;
}

function AlbumDetail({ album, onBack, onOpen }) {
  return <section className="origin-album-detail"><button className="origin-back-button" onClick={onBack}><Icon name="chevron" size={17} className="back-chevron" /> Álbuns</button><div className="origin-detail-title"><strong>{album.title}</strong><span>{album.items.length} itens</span></div><div className="origin-photo-wall">{album.items.map((record) => <PhotoTile key={record.id} record={record} onOpen={onOpen} />)}</div></section>;
}
