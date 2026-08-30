import { useState } from 'react';
import Icon from './Icon.jsx';
import SubjectExam from './SubjectExam.jsx';
import StudyPlan from './StudyPlan.jsx';
import PodcastPlayer from './PodcastPlayer.jsx';
import LessonPlayer from './LessonPlayer.jsx';
import { generateSubjectContent } from '../services/subjectStudy.js';
import { useAppData } from '../context/AppDataContext.jsx';

const TABS = [
  { id: 'questions', label: 'Perguntas', icon: 'question' },
  { id: 'exam', label: 'Simulado', icon: 'target' },
  { id: 'podcast', label: 'Podcast', icon: 'waveform' },
  { id: 'lesson', label: 'Vídeo aula', icon: 'film' },
  { id: 'plan', label: 'Plano', icon: 'route' },
];

export default function SubjectStudio({ subject, onClose }) {
  const { saveSubjectArtifact, getSubjectArtifact } = useAppData();
  const [tab, setTab] = useState('questions');

  if (!subject) return null;

  const examResult = getSubjectArtifact(subject.name, 'examResult')?.data || null;
  const savedPlan = getSubjectArtifact(subject.name, 'plan')?.data || null;
  const savedQuestions = getSubjectArtifact(subject.name, 'questions')?.data || null;
  const savedPodcast = getSubjectArtifact(subject.name, 'podcast')?.data || null;
  const savedLesson = getSubjectArtifact(subject.name, 'lesson')?.data || null;

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={`Estúdio da matéria ${subject.name}`}>
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

        <nav className="studio-tabs" role="tablist" aria-label="Ferramentas da matéria">
          {TABS.map((item) => (
            <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
              <Icon name={item.icon} size={15} /><span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="studio-body">
          {tab === 'questions' && <SubjectQuestions subject={subject} saved={savedQuestions} onSave={(data) => saveSubjectArtifact(subject.name, 'questions', data)} />}
          {tab === 'exam' && <SubjectExam subject={subject} savedResult={examResult} onResult={(data) => saveSubjectArtifact(subject.name, 'examResult', data)} />}
          {tab === 'podcast' && <PodcastPlayer subject={subject} saved={savedPodcast} onSave={(data) => saveSubjectArtifact(subject.name, 'podcast', data)} />}
          {tab === 'lesson' && <LessonPlayer subject={subject} saved={savedLesson} onSave={(data) => saveSubjectArtifact(subject.name, 'lesson', data)} />}
          {tab === 'plan' && <StudyPlan subject={subject} savedPlan={savedPlan} onSave={(data) => saveSubjectArtifact(subject.name, 'plan', data)} />}
        </div>
      </div>
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
