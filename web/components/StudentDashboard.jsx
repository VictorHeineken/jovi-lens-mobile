import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { buildStudentDashboard, gradeDiscursiveAnswer, searchStudyMemory } from '../../shared/studentDashboard.js';
import { daysUntilEvent, formatEventDate } from '../../shared/studyCalendar.js';

const DEFAULT_ANSWER = 'A fábrica juntou máquinas e trabalhadores no mesmo espaço, dividindo tarefas. Isso aumentou a produção, mas também criou uma rotina mais controlada para os operários.';

function formatTimer(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export default function StudentDashboard({ subjects, notes, aiHistory, subjectArtifacts, studyCalendar }) {
  const [query, setQuery] = useState('Revolução Industrial');
  const [answer, setAnswer] = useState(DEFAULT_ANSWER);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(10 * 60);
  const dashboard = useMemo(
    () => buildStudentDashboard({ subjects, subjectArtifacts, studyCalendar }),
    [subjects, subjectArtifacts, studyCalendar],
  );
  const searchResults = useMemo(
    () => searchStudyMemory({ query, subjects, notes, aiHistory, subjectArtifacts, studyCalendar }),
    [query, subjects, notes, aiHistory, subjectArtifacts, studyCalendar],
  );
  const correction = useMemo(
    () => gradeDiscursiveAnswer({
      subjectName: dashboard.urgentSubject?.name || 'História',
      prompt: 'Explique como a fábrica mudou o trabalho no século 19.',
      answer,
    }),
    [answer, dashboard.urgentSubject?.name],
  );

  useEffect(() => {
    if (!sessionActive) return undefined;
    const timer = window.setInterval(() => {
      setSessionSeconds((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          setSessionActive(false);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sessionActive]);

  function toggleSession() {
    if (!sessionActive && sessionSeconds === 0) setSessionSeconds(dashboard.studySession.minutes * 60);
    else if (!sessionActive && sessionSeconds === 10 * 60 && dashboard.studySession.minutes !== 10) setSessionSeconds(dashboard.studySession.minutes * 60);
    setSessionActive((value) => !value);
  }

  return (
    <section className="student-dashboard-card">
      <div className="dashboard-head">
        <div>
          <span className="plan-label">Painel geral</span>
          <h2>Seu plano inteligente</h2>
          <p>{dashboard.headline}</p>
        </div>
        <Icon name="sparkle" size={20} />
      </div>

      <section className={`today-focus-card ${dashboard.readiness.tone}`}>
        <div>
          <span className="plan-label">Hoje</span>
          <h3>{dashboard.today.title}</h3>
          <p>{dashboard.today.reason}</p>
        </div>
        <button onClick={toggleSession}>
          <Icon name={sessionActive ? 'pause' : 'play'} size={14} />
          {sessionActive ? 'Pausar revisão' : dashboard.today.cta}
        </button>
      </section>

      <div className="dashboard-compact-row">
        <article className={`readiness-pill ${dashboard.readiness.tone}`}>
          <span>Pronto para a prova</span>
          <strong>{dashboard.readiness.level}</strong>
          <small>{dashboard.readiness.text}</small>
        </article>
        <article className="subject-alert-pill">
          <span>{dashboard.subjectAlert.label}</span>
          <strong>{dashboard.subjectAlert.subject}</strong>
          <small>{dashboard.subjectAlert.action}</small>
        </article>
      </div>

      {dashboard.nextExam && (
        <div className="dashboard-next-exam">
          <Icon name="calendar" size={17} />
          <div>
            <span>Próximo compromisso</span>
            <strong>{dashboard.nextExam.title}</strong>
            <small>{formatEventDate(dashboard.nextExam)} · em {daysUntilEvent(dashboard.nextExam)} dias</small>
          </div>
        </div>
      )}

      <div className="dashboard-subject-grid">
        {dashboard.subjectCards.slice(0, 3).map((card) => (
          <article key={card.name}>
            <div><strong>{card.name}</strong><span>{card.status}</span></div>
            <b>{card.progress}%</b>
            <div className="dashboard-progress"><i style={{ width: `${Math.max(8, card.progress)}%` }} /></div>
            <small>{card.nextAction}</small>
          </article>
        ))}
      </div>

      <details className="dashboard-details">
        <summary><Icon name="history" size={15} /> Jornada do aluno</summary>
        <section className="dashboard-section">
        <div className="dashboard-section-head"><Icon name="history" size={15} /><strong>Jornada do aluno</strong></div>
        <div className="learning-journey">
          {dashboard.timeline.map((item) => (
            <article key={item.id}>
              <span>{item.label}</span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </article>
          ))}
        </div>
        </section>
      </details>

      <div className="dashboard-duo-grid">
        <section className="dashboard-mini-card streak-card">
          <div className="dashboard-section-head"><Icon name="flash" size={15} /><strong>Streak e meta</strong></div>
          <b>{dashboard.streak.days}</b>
          <span>dias seguidos</span>
          <div className="streak-dots" aria-label={`${dashboard.streak.completedThisWeek} de ${dashboard.streak.weeklyGoal} metas concluídas`}>
            {Array.from({ length: dashboard.streak.weeklyGoal }).map((_, index) => <i key={index} className={index < dashboard.streak.completedThisWeek ? 'done' : ''} />)}
          </div>
          <small>{dashboard.streak.nextMilestone}</small>
        </section>

        <section className="dashboard-mini-card comparison-card">
          <div className="dashboard-section-head"><Icon name="target" size={15} /><strong>Antes e depois</strong></div>
          <div className="comparison-bars">
            <span style={{ '--bar': `${dashboard.comparison.before}%` }}><b>{dashboard.comparison.before}%</b><small>Antes</small></span>
            <span className="after" style={{ '--bar': `${dashboard.comparison.after}%` }}><b>{dashboard.comparison.after}%</b><small>Agora</small></span>
          </div>
          <small>+{dashboard.comparison.delta} pts em {dashboard.comparison.subject}. {dashboard.comparison.caption}</small>
        </section>
      </div>

      <section className="audio-briefing-card">
        <div><Icon name="waveform" size={16} /><strong>{dashboard.audioBriefing.title}</strong></div>
        <p>{dashboard.audioBriefing.script}</p>
        <span>{dashboard.audioBriefing.durationSeconds}s · pronto para ouvir</span>
      </section>

      <details className="dashboard-details">
        <summary><Icon name="route" size={15} /> Plano semanal</summary>
        <section className="dashboard-section">
        <div className="dashboard-section-head"><Icon name="route" size={15} /><strong>Plano semanal unificado</strong></div>
        <div className="weekly-plan-list">
          {dashboard.weeklyPlan.map((item) => (
            <article key={item.id}>
              <span>{item.day}</span>
              <div><strong>{item.title}</strong><small>{item.subject} · {item.focus} · {item.minutes} min</small></div>
            </article>
          ))}
        </div>
        </section>
      </details>

      <section className="dashboard-section quick-review-card">
        <div className="dashboard-section-head"><Icon name="clock" size={15} /><strong>{dashboard.quickReview.title}</strong></div>
        <div className="quick-review-top">
          <div><span>Tema foco</span><strong>{dashboard.quickReview.topic}</strong></div>
          <button className={sessionActive ? 'running' : ''} onClick={toggleSession}>
            <b>{formatTimer(sessionSeconds)}</b>
            <small>{sessionActive ? 'Pausar sessão' : 'Iniciar sessão'}</small>
          </button>
        </div>
        <div className="quick-review-steps">
          {dashboard.quickReview.steps.map((step) => (
            <article key={step.label}><span>{step.label}</span><small>{step.text}</small></article>
          ))}
        </div>
        <div className="session-phases">
          {dashboard.studySession.phases.map((phase) => (
            <span key={phase.label}>{phase.label} · {phase.minutes} min</span>
          ))}
        </div>
      </section>

      <details className="dashboard-details">
        <summary><Icon name="layers" size={15} /> Mapa mental</summary>
        <section className="dashboard-section">
        <div className="dashboard-section-head"><Icon name="layers" size={15} /><strong>Mapa mental visual</strong></div>
        <div className="mind-map-card">
          <div className="mind-map-center">{dashboard.mindMap.center}</div>
          <div className="mind-map-nodes">
            {dashboard.mindMap.nodes.map((node) => (
              <article key={node.id} className={`status-${node.status.toLowerCase()}`}>
                <span>{node.connection}</span>
                <strong>{node.topic}</strong>
                <small>{node.status}</small>
              </article>
            ))}
          </div>
        </div>
        </section>
      </details>

      <details className="dashboard-details">
        <summary><Icon name="cards" size={15} /> Flashcards</summary>
        <section className="dashboard-section">
        <div className="dashboard-section-head"><Icon name="cards" size={15} /><strong>Flashcards inteligentes</strong></div>
        <div className="smart-flashcards">
          {dashboard.flashcards.slice(0, 4).map((card) => (
            <article key={card.id}>
              <span>{card.priority} · {card.topic}</span>
              <strong>{card.front}</strong>
              <p>{card.back}</p>
            </article>
          ))}
        </div>
        </section>
      </details>

      <section className="dashboard-section">
        <div className="dashboard-section-head"><Icon name="search" size={15} /><strong>Busca global com IA</strong></div>
        <label className="ai-search-box">
          <Icon name="search" size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar em notas, provas, vídeos e plano" />
        </label>
        <div className="ai-search-results">
          {searchResults.map((result, index) => (
            <article key={`${result.type}-${result.title}-${index}`}>
              <span>{result.type} · {result.subject}</span>
              <strong>{result.title}</strong>
              <small>{result.description}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-head"><Icon name="note" size={15} /><strong>Correção discursiva</strong></div>
        <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={4} />
        <div className="discursive-report">
          <strong>{correction.score}/10 · {correction.level}</strong>
          <p>{correction.feedback}</p>
          <small>{correction.missing[0] || 'Resposta pronta para apresentação.'}</small>
        </div>
      </section>

      <details className="dashboard-details">
        <summary><Icon name="scan" size={15} /> Correção por foto</summary>
        <section className="dashboard-section handwritten-card">
        <div className="dashboard-section-head"><Icon name="scan" size={15} /><strong>Correção por foto manuscrita</strong></div>
        <div className="handwritten-preview">
          <span>{dashboard.handwrittenCorrection.imageLabel}</span>
          <p>{dashboard.handwrittenCorrection.detectedText}</p>
        </div>
        <div className="discursive-report">
          <strong>{dashboard.handwrittenCorrection.score}/10 · {dashboard.handwrittenCorrection.source}</strong>
          <p>{dashboard.handwrittenCorrection.feedback}</p>
        </div>
        </section>
      </details>

      <details className="dashboard-details">
        <summary><Icon name="target" size={15} /> Ver ranking completo</summary>
        <section className="dashboard-section">
        <div className="dashboard-section-head"><Icon name="target" size={15} /><strong>Ranking pessoal por matéria</strong></div>
        <div className="subject-ranking">
          {dashboard.ranking.map((item) => (
            <article key={item.subject}>
              <span>{String(item.position).padStart(2, '0')}</span>
              <div><strong>{item.subject}</strong><small>{item.risk} · {item.action}</small></div>
              <b>{item.progress}%</b>
            </article>
          ))}
        </div>
        </section>
      </details>
    </section>
  );
}
