import { useState } from 'react';
import Icon from './Icon.jsx';
import { generateSubjectContent } from '../services/subjectStudy.js';

export default function StudyPlan({ subject, savedPlan, onSave }) {
  const [plan, setPlan] = useState(savedPlan || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState({});

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const result = await generateSubjectContent(subject, { action: 'plan' });
      if (!result.sessions?.length) throw new Error('Não foi possível montar o plano agora.');
      setPlan(result);
      setDone({});
      onSave?.(result);
    } catch (err) {
      setError(err.message || 'Falha ao gerar o plano.');
    } finally {
      setLoading(false);
    }
  }

  function toggle(key) {
    setDone((current) => ({ ...current, [key]: !current[key] }));
  }

  if (loading) return <div className="studio-loading"><span className="loading-orbit" /> Montando seu plano de {subject.name}...</div>;

  if (!plan) {
    return (
      <div className="studio-panel">
        <div className="studio-hero">
          <span className="studio-panel-kicker"><Icon name="route" size={13} /> Plano de estudos</span>
          <h3>Trilha adaptativa de {subject.name}</h3>
          <p>Uma sequência de sessões com revisão espaçada, priorizando os subtemas mais densos do que você já estudou.</p>
        </div>
        {error && <div className="studio-error" role="alert">{error}</div>}
        <button className="studio-primary" onClick={generate}><Icon name="route" size={16} /> Gerar plano</button>
      </div>
    );
  }

  const totalTasks = plan.sessions.reduce((sum, s) => sum + s.tasks.length, 0);
  const doneCount = Object.values(done).filter(Boolean).length;

  return (
    <div className="studio-panel">
      {plan.overview && <p className="studio-overview"><Icon name="sparkle" size={13} /> {plan.overview}</p>}
      <div className="plan-progress">
        <span>{doneCount}/{totalTasks} tarefas</span>
        <div className="plan-progress-bar"><i style={{ width: `${totalTasks ? (doneCount / totalTasks) * 100 : 0}%` }} /></div>
      </div>

      <div className="plan-sessions">
        {plan.sessions.map((session, sIndex) => (
          <div className="plan-session" key={sIndex}>
            <div className="plan-session-head">
              <span className="plan-session-day">{session.label}</span>
              <span className="plan-session-meta"><Icon name="clock" size={12} /> {session.durationMinutes} min</span>
            </div>
            <strong className="plan-session-focus">{session.focus}</strong>
            <div className="plan-tasks">
              {session.tasks.map((task, tIndex) => {
                const key = `${sIndex}-${tIndex}`;
                return (
                  <button key={key} className={`plan-task${done[key] ? ' done' : ''}`} onClick={() => toggle(key)} aria-pressed={!!done[key]}>
                    <span className="plan-check"><Icon name="check" size={12} /></span>{task}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!!plan.spacedReview?.length && (
        <div className="plan-spaced">
          <span className="studio-subtitle"><Icon name="history" size={13} /> Revisão espaçada</span>
          {plan.spacedReview.map((item, index) => (
            <div className="plan-spaced-row" key={index}><span>{item.topic}</span><b>{item.when}</b></div>
          ))}
        </div>
      )}

      <button className="studio-ghost wide" onClick={generate}><Icon name="rotate" size={14} /> Gerar novo plano</button>
    </div>
  );
}
