import { isDemoMode } from './imageAnalysis.js';
import { apiFetch } from './apiClient.js';

const DEMO_STYLE_LABELS = {
  animated: 'animada e visual',
  balanced: 'equilibrada',
  calm: 'calma e detalhada',
  exam: 'focada em exercícios',
};
const DEMO_GOAL_LABELS = {
  vestibular: 'vestibular',
  enem: 'ENEM',
  school_exam: 'prova da escola',
  general: 'revisão geral',
};

function searchUrl(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function demoRecommendations(subject, preferences = {}) {
  const name = String(subject?.name || 'a matéria').trim();
  const style = DEMO_STYLE_LABELS[preferences.videoStyle] || DEMO_STYLE_LABELS.balanced;
  const goal = DEMO_GOAL_LABELS[preferences.studyGoal] || DEMO_GOAL_LABELS.vestibular;
  const query = `${name} aula ${goal} ${style}`.slice(0, 180);
  return {
    mode: 'demo',
    query,
    focus: `Busca de demonstração para ${name}.`,
    reason: `prioriza ${goal} e uma aula ${style}`,
    videos: [{
      id: 'demo-video-search',
      title: `Aula-base de ${name}`,
      description: 'Use a busca sugerida para encontrar uma aula que combine com seu estilo de aprendizagem.',
      channelTitle: 'Busca sugerida',
      sourceLabel: 'Busca sugerida',
      thumbnail: '',
      url: searchUrl(query),
      searchQuery: query,
      didacticReason: 'Procure uma aula que explique primeiro, resolva depois e termine com uma revisão curta.',
      watchFor: ['Explicação passo a passo', 'Exercício resolvido', 'Resumo no final'],
      estimatedMinutes: preferences.duration === 'short' ? 12 : preferences.duration === 'long' ? 45 : 25,
    }],
  };
}

export async function findVideoLessons(subject, preferences) {
  if (isDemoMode()) return demoRecommendations(subject, preferences);

  let response;
  try {
    response = await apiFetch('/api/video-recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, preferences }),
    });
  } catch {
    throw new Error('Sem conexão para recomendar aulas agora. Confira a internet ou ative o modo demonstração.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Não foi possível recomendar uma aula agora.');
  return data;
}
