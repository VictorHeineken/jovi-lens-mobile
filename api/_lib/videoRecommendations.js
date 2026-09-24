const STYLE_TERMS = {
  animated: ['animada', 'visual', 'dinâmica', 'mapa mental', 'exemplos'],
  balanced: ['aula', 'explicação', 'didática'],
  calm: ['passo a passo', 'aula completa', 'explicação detalhada'],
  exam: ['exercícios', 'questões', 'resolução', 'revisão', 'prova'],
};

const GOAL_TERMS = {
  vestibular: ['vestibular', 'questões', 'revisão'],
  enem: ['enem', 'competências', 'questões contextualizadas'],
  school_exam: ['prova', 'resumo', 'conteúdo escolar'],
  general: ['revisão', 'fundamentos', 'aula'],
};

const PRACTICE_TERMS = {
  concept_first: ['conceitos', 'explicação'],
  questions_first: ['questões', 'resolução'],
  mixed: ['explicação exercícios'],
};

const REVIEW_TERMS = {
  spaced: ['revisão espaçada'],
  retrieval: ['teste ativo', 'questões'],
  interleaved: ['comparação de temas'],
  flashcards: ['flashcards', 'resumo'],
};

const STYLE_REASONS = {
  animated: 'prioriza ritmo, recursos visuais e exemplos dinâmicos',
  balanced: 'equilibra explicação, exemplos e ritmo de estudo',
  calm: 'prioriza explicação detalhada e passo a passo',
  exam: 'prioriza exercícios, revisão e resolução de questões',
};

const GOAL_REASONS = {
  vestibular: 'com foco em vestibular',
  enem: 'com foco em ENEM',
  school_exam: 'com foco em prova da escola',
  general: 'com foco em revisão geral',
};

const PRACTICE_REASONS = {
  concept_first: 'começando por conceito',
  questions_first: 'começando por questões',
  mixed: 'alternando explicação e prática',
};

const REVIEW_REASONS = {
  spaced: 'com revisão espaçada',
  retrieval: 'com teste ativo',
  interleaved: 'misturando subtemas',
  flashcards: 'com flashcards',
};

const DURATION_HINTS = {
  short: 'até 15 minutos',
  standard: '15 a 40 minutos',
  long: 'mais de 40 minutos',
};

const asText = (value, fallback = '', max = 240) => String(value ?? fallback).replace(/[\r\n]+/g, ' ').trim().slice(0, max);

const asList = (value, max = 4) => Array.isArray(value)
  ? value.map((item) => asText(item, '', 120)).filter(Boolean).slice(0, max)
  : [];

function preferenceTerms(preferences = {}) {
  const goal = GOAL_TERMS[preferences.studyGoal] || GOAL_TERMS.vestibular;
  const style = STYLE_TERMS[preferences.videoStyle] || STYLE_TERMS.balanced;
  const practice = PRACTICE_TERMS[preferences.practiceMode] || PRACTICE_TERMS.mixed;
  const review = REVIEW_TERMS[preferences.reviewMethod] || REVIEW_TERMS.spaced;
  return [goal[0], practice[0], review[0], ...style.slice(0, 1)].filter(Boolean);
}

function searchUrl(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function clampMinutes(value, preferences = {}) {
  const fallback = preferences.duration === 'short' ? 12 : preferences.duration === 'long' ? 45 : 25;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(90, Math.max(5, Math.round(n))) : fallback;
}

export function fallbackVideoSearchQuery(subject, preferences = {}) {
  const name = asText(subject?.name || subject?.subject || 'matéria', 'matéria', 100);
  const subthemes = Array.isArray(subject?.notes)
    ? [...new Set(subject.notes.flatMap((note) => [note?.subtheme, note?.subcategory]).filter(Boolean))].slice(0, 3)
    : [];
  const weakTopics = Array.isArray(subject?.weakTopics) ? subject.weakTopics.slice(0, 2) : [];
  return [name, ...weakTopics, ...subthemes, ...preferenceTerms(preferences).slice(0, 4), 'aula'].join(' ').slice(0, 180);
}

export function styleMatchReason(preferences = {}) {
  const style = STYLE_REASONS[preferences.videoStyle] || STYLE_REASONS.balanced;
  const goal = GOAL_REASONS[preferences.studyGoal] || GOAL_REASONS.vestibular;
  const practice = PRACTICE_REASONS[preferences.practiceMode] || PRACTICE_REASONS.mixed;
  const review = REVIEW_REASONS[preferences.reviewMethod] || REVIEW_REASONS.spaced;
  return `${goal}; ${practice}; ${review}; ${style}`;
}

export function normalizeVideoRecommendations(plan = {}, subject = {}, preferences = {}, meta = {}) {
  const fallbackQuery = asText(meta.fallbackQuery || fallbackVideoSearchQuery(subject, preferences), 'aula', 180);
  const raw = Array.isArray(plan?.recommendations) ? plan.recommendations : [];
  const recommendations = raw.slice(0, 5).map((item, index) => {
    const searchQuery = asText(item?.searchQuery || item?.query || fallbackQuery, fallbackQuery, 180);
    const title = asText(item?.title, `Busca ${index + 1}: ${searchQuery}`, 90);
    return {
      id: `ai-video-${index + 1}-${Buffer.from(searchQuery).toString('base64url').slice(0, 8)}`,
      title,
      description: asText(item?.description, `Procure uma aula sobre ${searchQuery}.`, 320),
      channelTitle: asText(item?.sourceLabel, 'Busca sugerida', 80),
      sourceLabel: asText(item?.sourceLabel, 'Busca sugerida', 80),
      thumbnail: '',
      url: searchUrl(searchQuery),
      searchQuery,
      didacticReason: asText(item?.didacticReason, 'Prefira uma explicação com exemplos resolvidos e revisão ao final.', 260),
      watchFor: asList(item?.watchFor, 4),
      estimatedMinutes: clampMinutes(item?.estimatedMinutes, preferences),
    };
  });

  if (!recommendations.length) {
    recommendations.push({
      id: 'ai-video-fallback',
      title: `Buscar aula de ${asText(subject?.name || 'estudos', 'estudos', 80)}`,
      description: `Use esta busca como ponto de partida e escolha uma aula ${DURATION_HINTS[preferences.duration] || DURATION_HINTS.standard}.`,
      channelTitle: 'Busca sugerida',
      sourceLabel: 'Busca sugerida',
      thumbnail: '',
      url: searchUrl(fallbackQuery),
      searchQuery: fallbackQuery,
      didacticReason: 'Escolha uma aula que explique o conceito antes de resolver exercícios.',
      watchFor: ['Exemplo resolvido', 'Resumo final', 'Explicação em português'],
      estimatedMinutes: clampMinutes(null, preferences),
    });
  }

  return {
    query: asText(plan?.query, fallbackQuery, 180),
    focus: asText(plan?.focus, `Aulas sugeridas para ${subject?.name || 'a matéria'}.`, 240),
    reason: meta.reason || styleMatchReason(preferences),
    mode: meta.mode || 'live',
    provider: meta.provider,
    model: meta.model,
    videos: recommendations,
  };
}

export function demoVideoRecommendations(subject = {}, preferences = {}) {
  const query = fallbackVideoSearchQuery(subject, preferences);
  return normalizeVideoRecommendations({
    query,
    focus: `Busca de demonstração para ${subject.name || 'a matéria'}.`,
    recommendations: [
      {
        title: `Aula-base de ${subject.name || 'estudos'}`,
        searchQuery: query,
        description: 'Use a busca sugerida para encontrar uma aula que combine com seu estilo de aprendizagem.',
        didacticReason: 'Procure uma aula que explique primeiro, resolva depois e termine com uma revisão curta.',
        watchFor: ['Explicação passo a passo', 'Exercício resolvido', 'Resumo no final'],
      },
    ],
  }, subject, preferences, { mode: 'demo', reason: styleMatchReason(preferences), fallbackQuery: query });
}
