import { isDemoMode } from './imageAnalysis.js';

const DEMO_STYLE_LABELS = {
  animated: 'animada e visual',
  balanced: 'equilibrada',
  calm: 'calma e detalhada',
  exam: 'focada em exercícios',
};

function demoRecommendations(subject, preferences = {}) {
  const name = String(subject?.name || 'a matéria').trim();
  const style = DEMO_STYLE_LABELS[preferences.videoStyle] || DEMO_STYLE_LABELS.balanced;
  const query = `${name} aula ${style}`.slice(0, 180);
  return {
    mode: 'demo',
    query,
    focus: `Busca de demonstração para ${name}.`,
    reason: `prioriza uma aula ${style}`,
    videos: [{
      id: 'demo-youtube-search',
      title: `Buscar aula de ${name}`,
      description: 'A demonstração abre o YouTube com a matéria e o estilo escolhidos.',
      channelTitle: 'Busca do YouTube',
      thumbnail: '',
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    }],
  };
}

export async function findYouTubeLessons(subject, preferences) {
  if (isDemoMode()) return demoRecommendations(subject, preferences);

  let response;
  try {
    response = await fetch('/api/youtube-recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, preferences }),
    });
  } catch {
    throw new Error('Sem conexão para buscar uma aula agora. Confira a internet ou ative o modo demonstração.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Não foi possível buscar uma aula agora.');
  return data;
}
