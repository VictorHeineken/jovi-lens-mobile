import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { generateSubjectContent } from '../services/subjectStudy.js';

function formatClock(seconds) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function computeByTopic(questions, answers) {
  const byTopic = {};
  (questions || []).forEach((q, index) => {
    const topic = q.topic || 'Geral';
    byTopic[topic] = byTopic[topic] || { correct: 0, total: 0 };
    byTopic[topic].total += 1;
    if (answers[index] === q.answerIndex) byTopic[topic].correct += 1;
  });
  return byTopic;
}

export default function SubjectExam({ subject, savedResult, onResult }) {
  const [phase, setPhase] = useState('idle'); // idle | loading | running | done
  const [exam, setExam] = useState(null);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef(null);
  const answersRef = useRef({});
  const examRef = useRef(null);
  const finishedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; window.clearInterval(timerRef.current); }, []);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { examRef.current = exam; }, [exam]);
  // Auto-submit when the clock runs out (kept out of the setState updater so
  // StrictMode's double-invocation can't double-fire it).
  useEffect(() => { if (phase === 'running' && secondsLeft === 0) finish(); }, [phase, secondsLeft]);

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    window.clearInterval(timerRef.current);
    const questions = examRef.current?.questions || [];
    const picked = answersRef.current;
    const correct = questions.filter((q, i) => picked[i] === q.answerIndex).length;
    const summary = {
      subject: examRef.current?.subject || subject.name,
      score: correct,
      total: questions.length,
      percent: questions.length ? Math.round((correct / questions.length) * 100) : 0,
      byTopic: computeByTopic(questions, picked),
      answers: picked,
      questions,
      takenAt: new Date().toISOString(),
    };
    setResult(summary);
    setPhase('done');
    onResult?.(summary);
  }

  async function start() {
    setPhase('loading');
    setError('');
    setAnswers({});
    answersRef.current = {};
    finishedRef.current = false;
    setResult(null);
    setCurrent(0);
    try {
      const generated = await generateSubjectContent(subject, { action: 'exam' });
      if (!mountedRef.current) return; // unmounted during the request — don't start a leaked timer
      if (!generated.questions?.length) throw new Error('Não foi possível montar o simulado agora.');
      setExam(generated);
      examRef.current = generated;
      setSecondsLeft((generated.durationMinutes || 10) * 60);
      setPhase('running');
      timerRef.current = window.setInterval(() => {
        setSecondsLeft((value) => Math.max(0, value - 1));
      }, 1000);
    } catch (err) {
      setError(err.message || 'Falha ao gerar o simulado.');
      setPhase('idle');
    }
  }

  if (phase === 'idle') {
    return (
      <div className="studio-panel">
        <div className="studio-hero">
          <span className="studio-panel-kicker"><Icon name="target" size={13} /> Simulado da matéria</span>
          <h3>Prova rápida de {subject.name}</h3>
          <p>Questões de múltipla escolha cobrindo os {subject.subthemes.length} subtemas que você estudou, com nota e diagnóstico dos pontos fracos.</p>
        </div>
        {savedResult && <div className="studio-recall"><Icon name="history" size={14} /><span>Último resultado: <strong>{savedResult.percent}%</strong> ({savedResult.score}/{savedResult.total})</span></div>}
        {error && <div className="studio-error" role="alert">{error}</div>}
        <button className="studio-primary" onClick={start}><Icon name="target" size={16} /> Iniciar simulado</button>
      </div>
    );
  }

  if (phase === 'loading') {
    return <div className="studio-loading"><span className="loading-orbit" /> Montando seu simulado de {subject.name}...</div>;
  }

  if (phase === 'done' && result) {
    const weakTopics = Object.entries(result.byTopic).filter(([, v]) => v.correct < v.total);
    return (
      <div className="studio-panel">
        <div className={`exam-score${result.percent >= 60 ? ' pass' : ''}`}>
          <strong>{result.percent}%</strong>
          <span>{result.score} de {result.total} corretas</span>
        </div>
        <div className="exam-diagnosis">
          <span className="studio-subtitle"><Icon name="target" size={13} /> Diagnóstico por subtema</span>
          {Object.entries(result.byTopic).map(([topic, v]) => (
            <div className="exam-topic-row" key={topic}>
              <span>{topic}</span>
              <b className={v.correct === v.total ? 'ok' : v.correct === 0 ? 'bad' : ''}>{v.correct}/{v.total}</b>
            </div>
          ))}
        </div>
        {!!weakTopics.length && <p className="exam-tip"><Icon name="sparkle" size={13} /> Priorize revisar: {weakTopics.map(([t]) => t).join(', ')}.</p>}
        <div className="exam-review">
          <span className="studio-subtitle">Revisão das questões</span>
          {result.questions.map((q, index) => {
            const right = result.answers[index] === q.answerIndex;
            return (
              <div className={`exam-review-item${right ? ' right' : ' wrong'}`} key={index}>
                <div className="exam-review-head"><Icon name={right ? 'check' : 'close'} size={14} /><strong>{q.question}</strong></div>
                <p><b>Correta:</b> {q.options[q.answerIndex]}</p>
                {!right && result.answers[index] != null && <p className="exam-your"><b>Você:</b> {q.options[result.answers[index]]}</p>}
                {q.explanation && <p className="exam-expl">{q.explanation}</p>}
              </div>
            );
          })}
        </div>
        <button className="studio-primary" onClick={start}><Icon name="rotate" size={15} /> Refazer simulado</button>
      </div>
    );
  }

  // running
  const question = exam.questions[current];
  const selected = answers[current];
  const isLast = current === exam.questions.length - 1;
  const answeredCount = Object.keys(answers).length;
  return (
    <div className="studio-panel">
      <div className="exam-topbar">
        <span className="exam-progress">Questão {current + 1}/{exam.questions.length}</span>
        <span className={`exam-timer${secondsLeft <= 30 ? ' urgent' : ''}`}><Icon name="clock" size={13} /> {formatClock(secondsLeft)}</span>
      </div>
      <div className="exam-progress-bar"><i style={{ width: `${((current + 1) / exam.questions.length) * 100}%` }} /></div>
      <div className="exam-question">
        <span className="exam-topic-tag">{question.topic}</span>
        <h3>{question.question}</h3>
      </div>
      <div className="quiz-options">
        {question.options.map((option, index) => (
          <button key={index} className={selected === index ? 'selected' : ''} onClick={() => setAnswers((a) => ({ ...a, [current]: index }))}>
            <span>{String.fromCharCode(65 + index)}</span>{option}<Icon name={selected === index ? 'check' : 'chevron'} size={16} />
          </button>
        ))}
      </div>
      <div className="exam-nav">
        <button className="studio-ghost" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>Anterior</button>
        {isLast
          ? <button className="studio-primary" onClick={finish} disabled={answeredCount === 0}><Icon name="check" size={15} /> Finalizar ({answeredCount}/{exam.questions.length})</button>
          : <button className="studio-primary" onClick={() => setCurrent((c) => Math.min(exam.questions.length - 1, c + 1))}>Próxima</button>}
      </div>
    </div>
  );
}
