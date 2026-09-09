import { useState } from 'react';
import Icon from './Icon.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { findYouTubeLessons } from '../services/youtubeRecommendations.js';

function weakTopicsFromExam(examResult) {
  return Object.entries(examResult?.byTopic || {})
    .filter(([, value]) => value.correct < value.total)
    .sort(([, a], [, b]) => (a.correct / a.total) - (b.correct / b.total))
    .map(([topic]) => topic)
    .slice(0, 4);
}

function mergeVideoMetadata(nextVideos = [], previousVideos = []) {
  const previous = new Map(previousVideos.map((video) => [video.id, video]));
  const merged = nextVideos.map((video) => ({ ...video, feedback: previous.get(video.id)?.feedback || null, saved: Boolean(previous.get(video.id)?.saved) }));
  const savedVideos = previousVideos.filter((video) => video.saved && !merged.some((item) => item.id === video.id));
  return [...merged, ...savedVideos].slice(0, 8);
}

export default function YouTubeRecommendations({ subject, saved = null, examResult = null, onSave }) {
  const { learningPreferences } = useAppData();
  const [result, setResult] = useState(saved || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const weakTopics = weakTopicsFromExam(examResult);

  async function search() {
    setLoading(true);
    setError('');
    try {
      const next = await findYouTubeLessons({ ...subject, weakTopics: weakTopicsFromExam(examResult) }, learningPreferences);
      next.videos = mergeVideoMetadata(next.videos, result?.videos || saved?.videos || []);
      setResult(next);
      onSave?.(next);
    } catch (err) {
      setError(err.message || 'Não foi possível buscar uma aula agora.');
    } finally {
      setLoading(false);
    }
  }

  function updateVideo(videoId, patch) {
    if (!result) return;
    const next = { ...result, videos: result.videos.map((video) => video.id === videoId ? { ...video, ...patch } : video) };
    setResult(next);
    onSave?.(next);
  }

  return (
    <section className="youtube-recommendations">
      <div className="youtube-recommendations-head">
        <div><span className="studio-panel-kicker"><Icon name="search" size={13} /> Busca inteligente</span><h3>Aulas no YouTube para {subject.name}</h3><p>A IA combina seus subtemas com seu estilo de aprendizagem e entrega links reais para assistir.</p></div>
        {result?.mode === 'demo' && <span className="youtube-demo-badge">DEMO</span>}
      </div>
      {result?.query && <div className="youtube-query"><Icon name="sparkle" size={13} /><span>Busca: <strong>{result.query}</strong></span></div>}
      {result?.reason && <p className="youtube-reason">A seleção {result.reason}.</p>}
      {!!weakTopics.length && <div className="youtube-weak-topics"><Icon name="target" size={13} /><span>Também priorizando suas dificuldades: <strong>{weakTopics.join(', ')}</strong></span></div>}
      {error && <div className="studio-error" role="alert">{error}</div>}
      {!result && !loading && <button className="studio-primary" onClick={search}><Icon name="search" size={16} /> Encontrar minha aula</button>}
      {loading && <div className="studio-loading compact"><span className="loading-orbit" /> Procurando uma aula que combine com você…</div>}
      {result && !loading && <div className="youtube-video-list">
        {result.videos?.length ? result.videos.map((video) => (
          <article className="youtube-video-card" key={video.id}>
            <div className="youtube-video-thumb">{video.thumbnail ? <img src={video.thumbnail} alt="" loading="lazy" /> : <Icon name="play" size={22} />}</div>
            <div className="youtube-video-copy"><strong>{video.title}</strong><span>{video.channelTitle}</span><p>{video.description || 'Vídeo selecionado para esta matéria.'}</p><div className="youtube-video-actions"><a href={video.url} target="_blank" rel="noopener noreferrer"><Icon name="play" size={13} /> Assistir</a><button className={video.saved ? 'saved' : ''} onClick={() => updateVideo(video.id, { saved: !video.saved })}><Icon name={video.saved ? 'check' : 'bookmark'} size={13} /> {video.saved ? 'Na trilha' : 'Salvar'}</button></div><div className="youtube-feedback" aria-label={`Avaliar vídeo ${video.title}`}><span>Foi útil?</span><button className={video.feedback === 'up' ? 'active' : ''} onClick={() => updateVideo(video.id, { feedback: video.feedback === 'up' ? null : 'up' })} aria-label="Vídeo útil" aria-pressed={video.feedback === 'up'}>👍</button><button className={video.feedback === 'down' ? 'active' : ''} onClick={() => updateVideo(video.id, { feedback: video.feedback === 'down' ? null : 'down' })} aria-label="Vídeo não útil" aria-pressed={video.feedback === 'down'}>👎</button></div></div>
          </article>
        )) : <div className="youtube-empty"><Icon name="search" size={18} /> Não encontrei uma aula adequada com esses filtros.</div>}
        <button className="studio-ghost wide" onClick={search}><Icon name="rotate" size={14} /> Buscar novamente</button>
      </div>}
    </section>
  );
}
