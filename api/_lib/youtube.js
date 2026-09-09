const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';

const STYLE_TERMS = {
  animated: ['animada', 'visual', 'dinâmica', 'mapa mental', 'exemplos'],
  balanced: ['aula', 'explicação', 'didática'],
  calm: ['passo a passo', 'aula completa', 'explicação detalhada'],
  exam: ['exercícios', 'questões', 'resolução', 'revisão', 'prova'],
};

const DURATION_FILTERS = {
  short: 'short',
  standard: 'medium',
  long: 'long',
};

function youtubeError(message, code, status) {
  return Object.assign(new Error(message), { code, status });
}

function getApiKey() {
  return String(process.env.YOUTUBE_API_KEY || '').trim();
}

export function isYouTubeConfigured() {
  return Boolean(getApiKey());
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function preferenceTerms(preferences = {}) {
  return STYLE_TERMS[preferences.videoStyle] || STYLE_TERMS.balanced;
}

export function fallbackYouTubeQuery(subject, preferences = {}) {
  const name = String(subject?.name || subject?.subject || 'matéria').trim().slice(0, 100);
  const subthemes = Array.isArray(subject?.notes)
    ? [...new Set(subject.notes.flatMap((note) => [note?.subtheme, note?.subcategory]).filter(Boolean))].slice(0, 3)
    : [];
  const weakTopics = Array.isArray(subject?.weakTopics) ? subject.weakTopics.slice(0, 2) : [];
  return [name, ...weakTopics, ...subthemes, ...preferenceTerms(preferences).slice(0, 2), 'aula'].join(' ').slice(0, 180);
}

function searchDuration(preferences = {}) {
  return DURATION_FILTERS[preferences.duration] || DURATION_FILTERS.standard;
}

function searchOrder(preferences = {}) {
  return ['relevance', 'viewCount', 'date'].includes(preferences.sort) ? preferences.sort : 'relevance';
}

export function rankYouTubeResults(items = [], preferences = {}) {
  const terms = preferenceTerms(preferences).map((term) => term.toLocaleLowerCase('pt-BR'));
  return items
    .map((item, index) => {
      const haystack = `${item.title || ''} ${item.description || ''}`.toLocaleLowerCase('pt-BR');
      const styleScore = terms.reduce((total, term) => total + (haystack.includes(term) ? 3 : 0), 0);
      const educationScore = ['aula', 'explicação', 'curso', 'revisão', 'professor'].reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { ...item, matchScore: styleScore + educationScore, _index: index };
    })
    .sort((a, b) => b.matchScore - a.matchScore || a._index - b._index)
    .map(({ _index, ...item }) => item);
}

async function fetchYouTube(path, params, timeoutMs = 12000) {
  const apiKey = getApiKey();
  if (!apiKey) throw youtubeError('YouTube não está configurado.', 'YOUTUBE_NOT_CONFIGURED', 503);
  const url = `${YOUTUBE_API_URL}${path}?${new URLSearchParams({ ...params, key: apiKey })}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: 'error', signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = payload?.error?.errors?.[0]?.reason;
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw youtubeError('A cota diária do YouTube foi atingida.', 'YOUTUBE_QUOTA_EXCEEDED', 429);
      throw youtubeError('Falha na busca do YouTube.', 'YOUTUBE_PROVIDER_ERROR', response.status);
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw youtubeError('Tempo limite da busca do YouTube excedido.', 'YOUTUBE_TIMEOUT', 504);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchYouTubeVideos({ query, preferences = {}, maxResults = 10 } = {}) {
  const payload = await fetchYouTube('/search', {
    part: 'snippet',
    q: String(query || '').trim().slice(0, 180),
    type: 'video',
    maxResults: String(Math.min(25, Math.max(1, maxResults))),
    order: searchOrder(preferences),
    relevanceLanguage: 'pt',
    regionCode: 'BR',
    safeSearch: 'moderate',
    videoDuration: searchDuration(preferences),
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
  });
  const results = (Array.isArray(payload.items) ? payload.items : [])
    .map((item) => {
      const id = item?.id?.videoId;
      if (!id) return null;
      return {
        id,
        title: decodeHtml(item.snippet?.title || 'Vídeo recomendado'),
        description: decodeHtml(item.snippet?.description || ''),
        channelTitle: decodeHtml(item.snippet?.channelTitle || 'Canal do YouTube'),
        publishedAt: item.snippet?.publishedAt || null,
        thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
      };
    })
    .filter(Boolean);
  return rankYouTubeResults(results, preferences).slice(0, 6);
}

export function styleMatchReason(preferences = {}) {
  const reasons = {
    animated: 'prioriza ritmo, recursos visuais e exemplos dinâmicos',
    balanced: 'equilibra explicação, exemplos e ritmo de estudo',
    calm: 'prioriza explicação detalhada e passo a passo',
    exam: 'prioriza exercícios, revisão e resolução de questões',
  };
  return reasons[preferences.videoStyle] || reasons.balanced;
}
