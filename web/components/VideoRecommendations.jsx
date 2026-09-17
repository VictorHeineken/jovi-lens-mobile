import { useState } from 'react';
import Icon from './Icon.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { findVideoLessons } from '../services/videoRecommendations.js';

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

export default function VideoRecommendations({ subject, saved = null, examResult = null, onSave }) {
  const { learningPreferences } = useAppData();
  const [result, setResult] = useState(saved || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const weakTopics = weakTopicsFromExam(examResult);

  async function search() {
    setLoading(true);
    setError('');
    try {
      const next = await findVideoLessons({ ...subject, weakTopics: weakTopicsFromExam(examResult) }, learningPreferences);
      next.videos = mergeVideoMetadata(next.videos, result?.videos || saved?.videos || []);
      setResult(next);
      onSave?.(next);
    } catch (err) {
      setError(err.message || 'Não foi possível recomendar uma aula agora.');
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
    <section className="video-recommendations">
      <div className="video-recommendations-head">
        <div><span className="studio-panel-kicker"><Icon name="search" size={13} /> Busca inteligente</span><h3>Aulas em vídeo para {subject.name}</h3><p>A IA sugere buscas e critérios didáticos para você escolher uma aula boa sem depender de API externa de vídeos.</p></div>
        {result?.mode === 'demo' && <span className="video-demo-badge">DEMO</span>}
      </div>
      {result?.query && <div className="video-query"><Icon name="sparkle" size={13} /><span>Busca principal: <strong>{result.query}</strong></span></div>}
      {result?.reason && <p className="video-reason">A seleção {result.reason}.</p>}
      {!!weakTopics.length && <div className="video-weak-topics"><Icon name="target" size={13} /><span>Também priorizando suas dificuldades: <strong>{weakTopics.join(', ')}</strong></span></div>}
      {error && <div className="studio-error" role="alert">{error}</div>}
      {!result && !loading && <button className="studio-primary" onClick={search}><Icon name="search" size={16} /> Recomendar aulas</button>}
      {loading && <div className="studio-loading compact"><span className="loading-orbit" /> Pensando nas melhores buscas para você...</div>}
      {result && !loading && <div className="video-list">
        {result.videos?.length ? result.videos.map((video) => (
          <article className="video-card video-search-card" key={video.id}>
            <div className="video-thumb">
              {video.thumbnail ? <img src={video.thumbnail} alt="" loading="lazy" /> : <Icon name="search" size={22} />}
            </div>
            <div className="video-copy">
              <strong>{video.title}</strong>
              <span>{video.estimatedMinutes ? `${video.estimatedMinutes} min sugeridos` : video.channelTitle}</span>
              <p>{video.description || 'Busca sugerida para esta matéria.'}</p>
              {video.didacticReason && <p className="video-reason">{video.didacticReason}</p>}
              {!!video.watchFor?.length && <div className="video-watch-for">{video.watchFor.map((item) => <span key={item}>{item}</span>)}</div>}
              <div className="video-actions">
                <a href={video.url} target="_blank" rel="noopener noreferrer"><Icon name="play" size={13} /> Ir ao vídeo</a>
                <button className={video.saved ? 'saved' : ''} onClick={() => updateVideo(video.id, { saved: !video.saved })}><Icon name={video.saved ? 'check' : 'bookmark'} size={13} /> {video.saved ? 'Na trilha' : 'Salvar'}</button>
              </div>
              <div className="video-feedback" aria-label={`Avaliar recomendação ${video.title}`}>
                <span>Serviu?</span>
                <button className={video.feedback === 'up' ? 'active' : ''} onClick={() => updateVideo(video.id, { feedback: video.feedback === 'up' ? null : 'up' })} aria-label="Recomendação útil" aria-pressed={video.feedback === 'up'}><Icon name="check" size={11} /> Útil</button>
                <button className={video.feedback === 'down' ? 'active' : ''} onClick={() => updateVideo(video.id, { feedback: video.feedback === 'down' ? null : 'down' })} aria-label="Recomendação não serviu" aria-pressed={video.feedback === 'down'}><Icon name="close" size={11} /> Não serviu</button>
              </div>
            </div>
          </article>
        )) : <div className="video-empty"><Icon name="search" size={18} /> Não encontrei uma busca adequada com esses filtros.</div>}
        <button className="studio-ghost wide" onClick={search}><Icon name="rotate" size={14} /> Recomendar de novo</button>
      </div>}
    </section>
  );
}
