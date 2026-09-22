import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { createDemoOutlookCalendar } from '../../shared/studyCalendar.js';

const DEMO_USER = {
  id: 'demo-student',
  name: 'Ana Beatriz',
  email: 'ana.beatriz@demo.jovi',
  picture: '',
};

const GUIDE_STEPS = [
  {
    time: '0:00-0:30',
    route: '/profile',
    action: 'prepare',
    title: 'Prepare o cenário',
    focus: 'Aluno, Copilot e Outlook ficam prontos em um toque.',
    say: 'Começo mostrando que a demo não depende de criar nada ao vivo: aluno, prova e histórico já entram preparados.',
    cta: 'Preparar demo',
  },
  {
    time: '0:30-1:00',
    route: '/camera',
    title: 'Abra pela câmera',
    focus: 'A proposta nasce no app de câmera do JOVI.',
    say: 'A tese do produto é simples: a câmera deixa de ser só registro e vira entrada para aprender.',
    cta: 'Mostrar câmera',
  },
  {
    time: '1:00-1:35',
    route: '/notes?subject=Hist%C3%B3ria',
    title: 'Mostre a memória',
    focus: 'As fotos viram notas organizadas por matéria e subtema.',
    say: 'Aqui eu mostro que o conteúdo não some depois da análise: ele vira uma biblioteca de estudo.',
    cta: 'Abrir História',
  },
  {
    time: '1:35-2:10',
    route: '/notes?subject=Hist%C3%B3ria&studio=overview',
    title: 'Abra o Estúdio',
    focus: 'Visão geral, mapa da matéria, pontos fracos e revisão do dia.',
    say: 'O Estúdio junta todas as notas de História e transforma isso em um painel de domínio da matéria.',
    cta: 'Abrir visão',
  },
  {
    time: '2:10-3:00',
    route: '/notes?subject=Hist%C3%B3ria&studio=exam',
    title: 'Faça o simulado',
    focus: 'O simulado mockado aparece rápido e cobre todos os 6 subtemas.',
    say: 'Em vez de gerar na hora, a demo simula a criação e abre uma prova pronta em cerca de um segundo.',
    cta: 'Abrir simulado',
  },
  {
    time: '3:00-3:40',
    route: '/notes?subject=Hist%C3%B3ria&studio=podcast&podcast=drive',
    title: 'Use o modo carro',
    focus: 'Podcast vira bate-papo com IA, perguntas e feedback.',
    say: 'Aqui a ferramenta sai da tela: o aluno pode revisar no carro, responder em voz alta e receber feedback.',
    cta: 'Abrir podcast',
  },
  {
    time: '3:40-4:20',
    route: '/notes?subject=Hist%C3%B3ria&studio=lesson',
    title: 'Mostre vídeos reais',
    focus: 'A IA recomenda vídeos do YouTube sem depender da API do YouTube.',
    say: 'A recomendação usa vídeos reais e explica por que cada aula ajuda naquele ponto da matéria.',
    cta: 'Abrir vídeos',
  },
  {
    time: '4:20-5:00',
    route: '/notes?subject=Hist%C3%B3ria&studio=plan',
    title: 'Feche com plano',
    focus: 'O Outlook ajusta o plano pela data real da prova.',
    say: 'Para fechar, mostro a prova em 7 dias e o plano que prioriza o que o aluno precisa revisar agora.',
    cta: 'Abrir plano',
  },
];

const GUIDE_OPEN_KEY = 'jovi_presentation_guide_open';
const GUIDE_STARTED_KEY = 'jovi_presentation_guide_started_at';

function readGuideOpen() {
  try {
    return window.sessionStorage.getItem(GUIDE_OPEN_KEY) === 'true';
  } catch {
    return false;
  }
}

function readGuideStartedAt() {
  try {
    const value = Number(window.sessionStorage.getItem(GUIDE_STARTED_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function formatElapsed(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function currentTimestamp() {
  return Number(new Date());
}

export default function PresentationGuide() {
  const { setUser, setPlan, setStudyCalendar } = useAppData();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpenState] = useState(readGuideOpen);
  const [stepIndex, setStepIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(readGuideStartedAt);
  const [now, setNow] = useState(0);
  const [status, setStatus] = useState('');
  const pointerHandledRef = useRef(false);
  const step = GUIDE_STEPS[stepIndex];

  useEffect(() => {
    if (!open) return;
    const current = `${location.pathname}${location.search}`;
    const matchedIndex = GUIDE_STEPS.findIndex((item) => item.route === current);
    if (matchedIndex >= 0) setStepIndex(matchedIndex);
  }, [location.pathname, location.search, open]);

  useEffect(() => {
    if (!startedAt) return undefined;
    setNow(currentTimestamp());
    const timer = window.setInterval(() => setNow(currentTimestamp()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const elapsed = startedAt ? formatElapsed((now || startedAt) - startedAt) : '0:00';

  function setGuideOpen(value) {
    setOpenState(value);
    try {
      window.sessionStorage.setItem(GUIDE_OPEN_KEY, value ? 'true' : 'false');
    } catch {
      // Ignore private browsing storage errors; the guide still works in memory.
    }
  }

  function startClock() {
    if (startedAt) return;
    const timestamp = currentTimestamp();
    setStartedAt(timestamp);
    setNow(timestamp);
    try {
      window.sessionStorage.setItem(GUIDE_STARTED_KEY, String(timestamp));
    } catch {
      // Ignore storage errors; the visual timer can still run for this session.
    }
  }

  function prepareDemo() {
    setUser(DEMO_USER);
    setPlan({ type: 'pro', demo: true, presentationMode: true, activatedAt: new Date().toISOString() });
    setStudyCalendar(createDemoOutlookCalendar());
  }

  function primeStep(index = stepIndex) {
    const nextStep = GUIDE_STEPS[index];
    startClock();
    setGuideOpen(true);
    setStepIndex(index);
    if (nextStep.action === 'prepare') {
      prepareDemo();
      setStatus('Demo preparada: estudante, Copilot e Outlook já estão ativos.');
    } else {
      setStatus('');
    }
  }

  function openStep(index = stepIndex) {
    const nextStep = GUIDE_STEPS[index];
    primeStep(index);
    navigate(nextStep.route);
  }

  function handlePointerStep(event, index) {
    if (event.button && event.button !== 0) return;
    event.preventDefault();
    pointerHandledRef.current = true;
    openStep(index);
  }

  function handlePrimaryPointer(event) {
    if (event.button && event.button !== 0) return;
    event.preventDefault();
    pointerHandledRef.current = true;
    if (stepIndex === GUIDE_STEPS.length - 1) {
      setGuideOpen(false);
      return;
    }
    openStep(Math.min(stepIndex + 1, GUIDE_STEPS.length - 1));
  }

  function consumePointerClick(event) {
    if (!pointerHandledRef.current) return false;
    event.preventDefault();
    pointerHandledRef.current = false;
    return true;
  }

  if (!open) {
    return (
      <button className="presentation-guide-launcher" onClick={() => openStep(0)} aria-label="Iniciar demo guiada de 5 minutos">
        <Icon name="sparkle" size={15} />
        <span>Demo guiada</span>
        <strong>5 min</strong>
      </button>
    );
  }

  return (
    <aside className="presentation-guide" aria-label="Demo guiada para apresentação">
      <div className="presentation-guide-top">
        <span><Icon name="sparkle" size={13} /> Demo guiada</span>
        <button onClick={() => setGuideOpen(false)} aria-label="Recolher demo guiada"><Icon name="close" size={14} /></button>
      </div>
      <div className="presentation-guide-progress" aria-label={`Passo ${stepIndex + 1} de ${GUIDE_STEPS.length}`}>
        {GUIDE_STEPS.map((item, index) => (
          <Link
            key={item.title}
            to={item.route}
            className={index === stepIndex ? 'active' : index < stepIndex ? 'done' : ''}
            onPointerDown={(event) => handlePointerStep(event, index)}
            onClick={(event) => {
              if (consumePointerClick(event)) return;
              primeStep(index);
            }}
            aria-label={`Abrir passo ${index + 1}: ${item.title}`}
          />
        ))}
      </div>
      <div className="presentation-guide-time">
        <strong>{step.time}</strong>
        <span>{elapsed} / 5:00</span>
      </div>
      <h3>{step.title}</h3>
      <p>{step.focus}</p>
      <blockquote>{step.say}</blockquote>
      {status ? <small className="presentation-guide-status">{status}</small> : null}
      <div className="presentation-guide-actions">
        <button
          type="button"
          className={stepIndex === 0 ? 'disabled' : ''}
          onPointerDown={(event) => {
            if (stepIndex === 0) return;
            handlePointerStep(event, Math.max(stepIndex - 1, 0));
          }}
          onClick={(event) => {
            if (consumePointerClick(event)) return;
            if (stepIndex === 0) {
              event.preventDefault();
              return;
            }
            primeStep(Math.max(stepIndex - 1, 0));
          }}
          aria-disabled={stepIndex === 0}
        >
          <Icon name="chevron" size={13} /> Voltar
        </button>
        <button
          type="button"
          className="primary"
          onPointerDown={handlePrimaryPointer}
          onClick={(event) => {
            if (consumePointerClick(event)) return;
            if (stepIndex === GUIDE_STEPS.length - 1) {
              setGuideOpen(false);
              return;
            }
            openStep(Math.min(stepIndex + 1, GUIDE_STEPS.length - 1));
          }}
        >
          {stepIndex === GUIDE_STEPS.length - 1 ? 'Finalizar' : 'Próximo'}
          <Icon name="arrow-up-right" size={13} />
        </button>
      </div>
    </aside>
  );
}
