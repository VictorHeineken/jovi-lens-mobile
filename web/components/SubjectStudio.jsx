import { useState } from 'react';
import Icon from './Icon.jsx';
import SubjectExam from './SubjectExam.jsx';
import StudyPlan from './StudyPlan.jsx';
import PodcastPlayer from './PodcastPlayer.jsx';
import LessonPlayer from './LessonPlayer.jsx';
import VideoRecommendations from './VideoRecommendations.jsx';
import useDialogAccessibility from './useDialogAccessibility.js';
import { generateSubjectContent } from '../services/subjectStudy.js';
import { useAppData } from '../context/AppDataContext.jsx';
import { buildSubjectInsights } from '../../shared/subjectInsights.js';

const TABS = [
  { id: 'overview', label: 'Visão', icon: 'layers' },
  { id: 'questions', label: 'Perguntas', icon: 'question' },
  { id: 'exam', label: 'Simulado', icon: 'target' },
  { id: 'podcast', label: 'Podcast', icon: 'waveform' },
  { id: 'lesson', label: 'Vídeo aula', icon: 'film' },
  { id: 'plan', label: 'Plano', icon: 'route' },
];

export default function SubjectStudio({ subject, onClose }) {
  const { saveSubjectArtifact, getSubjectArtifact } = useAppData();
  const dialogRef = useDialogAccessibility(onClose, Boolean(subject));
  const [tab, setTab] = useState('overview');

  if (!subject) return null;

  const examResult = getSubjectArtifact(subject.name, 'examResult')?.data || null;
  const savedExam = getSubjectArtifact(subject.name, 'exam')?.data || null;
  const savedPlan = getSubjectArtifact(subject.name, 'plan')?.data || null;
  const savedPlanProgress = getSubjectArtifact(subject.name, 'planProgress')?.data || {};
  const savedQuestions = getSubjectArtifact(subject.name, 'questions')?.data || null;
  const savedPodcast = getSubjectArtifact(subject.name, 'podcast')?.data || null;
  const savedPodcasts = getSubjectArtifact(subject.name, 'podcasts')?.data || null;
  const savedLesson = getSubjectArtifact(subject.name, 'lesson')?.data || null;
  const savedVideoRecommendations = getSubjectArtifact(subject.name, 'videoRecommendations')?.data || null;
  const insightArtifacts = {
    questions: savedQuestions ? { data: savedQuestions } : null,
    exam: savedExam ? { data: savedExam } : null,
    examResult: examResult ? { data: examResult } : null,
    plan: savedPlan ? { data: savedPlan } : null,
    podcast: savedPodcast ? { data: savedPodcast } : null,
    videoRecommendations: savedVideoRecommendations ? { data: savedVideoRecommendations } : null,
    lesson: savedLesson ? { data: savedLesson } : null,
  };
  const insights = buildSubjectInsights(subject, insightArtifacts);

  return (
    <div ref={dialogRef} className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={`Estúdio da matéria ${subject.name}`}>
      <button className="sheet-close" onClick={onClose} aria-label="Fechar estúdio da matéria"><Icon name="close" size={20} /></button>
      <div className="subject-studio">
        <div className="sheet-handle" />
        <header className="studio-header">
          <span className="studio-kicker"><Icon name="layers" size={13} /> Estúdio da matéria</span>
          <h2>{subject.name}</h2>
          <div className="studio-meta">
            <span><Icon name="note" size={12} /> {subject.count} {subject.count === 1 ? 'nota' : 'notas'}</span>
            <span><Icon name="layers" size={12} /> {subject.subthemes.length} {subject.subthemes.length === 1 ? 'subtema' : 'subtemas'}</span>
          </div>
          <div className="studio-chips">
            {subject.subthemes.slice(0, 6).map((theme) => <span key={theme}>{theme}</span>)}
          </div>
        </header>

        <div className="studio-tabs" role="tablist" aria-label="Ferramentas da matéria">
          {TABS.map((item) => (
            <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
              <Icon name={item.icon} size={15} /><span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="studio-body">
          {tab === 'overview' && <SubjectOverview subject={subject} insights={insights} />}
          {tab === 'questions' && <SubjectQuestions subject={subject} saved={savedQuestions} onSave={(data) => saveSubjectArtifact(subject.name, 'questions', data)} />}
          {tab === 'exam' && <SubjectExam subject={subject} savedExam={savedExam} savedResult={examResult} onResult={(data) => saveSubjectArtifact(subject.name, 'examResult', data)} />}
          {tab === 'podcast' && (
            <PodcastPlayer
              subject={subject}
              saved={savedPodcast}
              savedVariants={savedPodcasts?.formats}
              onSave={(data) => {
                saveSubjectArtifact(subject.name, 'podcast', data);
                if (savedPodcasts?.formats) saveSubjectArtifact(subject.name, 'podcasts', { ...savedPodcasts, formats: { ...savedPodcasts.formats, [data.format || 'dialogue']: data } });
              }}
            />
          )}
          {tab === 'lesson' && <div className="studio-lesson-stack"><VideoRecommendations subject={subject} saved={savedVideoRecommendations} examResult={examResult} onSave={(data) => saveSubjectArtifact(subject.name, 'videoRecommendations', data)} /><LessonPlayer subject={subject} saved={savedLesson} onSave={(data) => saveSubjectArtifact(subject.name, 'lesson', data)} /></div>}
          {tab === 'plan' && <StudyPlan subject={subject} savedPlan={savedPlan} savedProgress={savedPlanProgress} savedLessons={savedVideoRecommendations?.videos?.filter((video) => video.saved) || []} onSave={(data) => saveSubjectArtifact(subject.name, 'plan', data)} onProgressSave={(data) => saveSubjectArtifact(subject.name, 'planProgress', data)} />}
        </div>
      </div>
    </div>
  );
}

function SubjectOverview({ subject, insights }) {
  return (
    <div className="studio-panel subject-overview-panel">
      <div className="studio-hero">
        <span className="studio-panel-kicker"><Icon name="layers" size={13} /> Painel inteligente</span>
        <h3>Mapa, revisão e domínio de {subject.name}</h3>
        <p>Uma visão pronta para mostrar o que estudar, onde está fraco e como revisar hoje.</p>
      </div>

      <section className="insight-card">
        <div className="insight-card-head"><Icon name="route" size={15} /><strong>Mapa da matéria</strong></div>
        <div className="subject-map">
          {insights.map.map((item) => (
            <div className={`subject-map-node status-${item.status.toLowerCase().replace(/\s+/g, '-')}`} key={item.topic}>
              <span>{String(item.order).padStart(2, '0')}</span>
              <strong>{item.topic}</strong>
              <small>{item.status}{item.mastery !== null ? ` · ${item.mastery}%` : ` · ${item.noteCount} nota${item.noteCount === 1 ? '' : 's'}`}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="insight-card">
        <div className="insight-card-head"><Icon name="target" size={15} /><strong>Radar de dificuldade</strong></div>
        <div className="difficulty-radar">
          {insights.radar.slice(0, 6).map((item) => (
            <div className="difficulty-row" key={item.topic}>
              <div><strong>{item.topic}</strong><span>{item.label}</span></div>
              <div className="difficulty-bar" aria-label={`${item.percent}% de domínio`}><i style={{ width: `${Math.max(6, item.percent)}%` }} /></div>
              <b>{item.percent}%</b>
            </div>
          ))}
        </div>
      </section>

      <section className="insight-card">
        <div className="insight-card-head"><Icon name="clock" size={15} /><strong>Revisão do dia</strong></div>
        <div className="review-today">
          {insights.reviewToday.map((task) => (
            <article key={`${task.label}-${task.topic}`}>
              <span>{task.label} · {task.minutes} min</span>
              <strong>{task.text}</strong>
              <small>{task.topic}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="insight-card">
        <div className="insight-card-head"><Icon name="cards" size={15} /><strong>Flashcards automáticos</strong></div>
        <div className="subject-flashcards">
          {insights.flashcards.slice(0, 6).map((card, index) => (
            <article key={`${card.front}-${index}`}>
              <span>{card.topic}</span>
              <strong>{card.front}</strong>
              <p>{card.back}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="insight-card">
        <div className="insight-card-head"><Icon name="history" size={15} /><strong>{subject.name === 'História' ? 'Linha do tempo de História' : 'Sequência de estudo'}</strong></div>
        <div className="history-timeline">
          {insights.timeline.map((item) => (
            <article key={item.topic}>
              <span>{item.marker}</span>
              <div><strong>{item.topic}</strong><p>{item.text}</p></div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function SubjectQuestions({ subject, saved, onSave }) {
  const [items, setItems] = useState(saved?.questions || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({});

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const result = await generateSubjectContent(subject, { action: 'questions' });
      if (!result.questions?.length) throw new Error('Não foi possível gerar as perguntas agora.');
      setItems(result.questions);
      setOpen({});
      onSave?.(result);
    } catch (err) {
      setError(err.message || 'Falha ao gerar as perguntas.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="studio-loading"><span className="loading-orbit" /> Criando perguntas sobre {subject.name}...</div>;

  if (!items) {
    return (
      <div className="studio-panel">
        <div className="studio-hero">
          <span className="studio-panel-kicker"><Icon name="question" size={13} /> Perguntas da matéria</span>
          <h3>Perguntas sobre {subject.name} inteira</h3>
          <p>Geramos perguntas de estudo que cruzam todos os subtemas — não apenas uma imagem — com respostas-modelo para você conferir.</p>
        </div>
        {error && <div className="studio-error" role="alert">{error}</div>}
        <button className="studio-primary" onClick={generate}><Icon name="sparkle" size={16} /> Gerar perguntas</button>
      </div>
    );
  }

  return (
    <div className="studio-panel">
      <div className="studio-questions">
        {items.map((item, index) => (
          <div className={`studio-question${open[index] ? ' open' : ''}`} key={index}>
            <button className="studio-question-head" onClick={() => setOpen((o) => ({ ...o, [index]: !o[index] }))} aria-expanded={!!open[index]}>
              <span className="studio-question-tag">{item.topic}{item.difficulty ? ` · ${item.difficulty}` : ''}</span>
              <strong>{item.question}</strong>
              <Icon name="chevron" size={15} className="studio-question-chevron" />
            </button>
            {open[index] && <p className="studio-question-answer"><span>Resposta-modelo</span>{item.answer}</p>}
          </div>
        ))}
      </div>
      <button className="studio-ghost wide" onClick={generate}><Icon name="rotate" size={14} /> Gerar novas perguntas</button>
    </div>
  );
}
