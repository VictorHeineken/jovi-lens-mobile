const DEFAULT_STATUS = 'Em estudo';

function asText(value, fallback = '') {
  return String(value || fallback).trim();
}

function percentOf(topicResult) {
  if (!topicResult?.total) return null;
  return Math.round((Number(topicResult.correct || 0) / Number(topicResult.total || 1)) * 100);
}

function statusForPercent(percent) {
  if (percent === null) return DEFAULT_STATUS;
  if (percent >= 80) return 'Dominado';
  if (percent >= 50) return 'Revisar';
  return 'Ponto fraco';
}

function notesByTopic(subject) {
  const map = new Map();
  (subject?.notes || []).forEach((note) => {
    const topic = asText(note.subtheme || note.subcategory || note.topicPath?.[0], 'Geral');
    if (!map.has(topic)) map.set(topic, []);
    map.get(topic).push(note);
  });
  return map;
}

function buildMap(subject, examResult) {
  const byTopic = notesByTopic(subject);
  const topics = subject?.subthemes?.length ? subject.subthemes : [...byTopic.keys()];
  return topics.slice(0, 8).map((topic, index) => {
    const percent = percentOf(examResult?.byTopic?.[topic]);
    const notes = byTopic.get(topic) || [];
    return {
      topic,
      order: index + 1,
      noteCount: notes.length,
      status: statusForPercent(percent),
      mastery: percent,
      detail: notes[0]?.summary || notes[0]?.title || 'Subtema pronto para revisar.',
    };
  });
}

function buildRadar(subject, examResult) {
  const fromExam = Object.entries(examResult?.byTopic || {}).map(([topic, result]) => {
    const percent = percentOf(result);
    return {
      topic,
      percent,
      label: statusForPercent(percent),
      hint: percent >= 80 ? 'Mantenha com uma revisão curta.' : percent >= 50 ? 'Faça uma questão e revise a explicação.' : 'Volte ao conceito antes de tentar novo simulado.',
    };
  });
  if (fromExam.length) return fromExam.sort((a, b) => a.percent - b.percent);
  return buildMap(subject, null).map((item) => ({
    topic: item.topic,
    percent: item.noteCount ? 60 : 30,
    label: item.noteCount ? 'Em estudo' : 'Pouca base',
    hint: item.noteCount ? 'Revise a nota e responda uma pergunta.' : 'Adicione uma nota ou explicação primeiro.',
  }));
}

function buildReviewToday(subject, artifacts, radar) {
  const weak = radar.filter((item) => item.percent < 80).slice(0, 2);
  const plan = artifacts?.plan?.data || {};
  const reviews = Array.isArray(plan.spacedReview) ? plan.spacedReview : [];
  const questions = artifacts?.questions?.data?.questions || [];
  const videos = artifacts?.videoRecommendations?.data?.videos || [];
  const firstWeak = weak[0]?.topic || reviews[0]?.topic || subject?.subthemes?.[0] || subject?.name || 'matéria';
  const tasks = [
    {
      label: 'Pergunta ativa',
      text: questions[0]?.question || `Explique ${firstWeak} sem consultar a nota.`,
      topic: questions[0]?.topic || firstWeak,
      minutes: 4,
    },
    {
      label: 'Ponto fraco',
      text: weak[0] ? `Revisar ${weak[0].topic}: ${weak[0].hint}` : `Revisar a nota principal de ${firstWeak}.`,
      topic: firstWeak,
      minutes: 6,
    },
    {
      label: 'Vídeo ou áudio',
      text: videos.find((video) => video.saved)?.title || 'Ouvir o podcast salvo ou abrir uma aula recomendada.',
      topic: videos.find((video) => video.saved)?.searchQuery || subject?.name || 'Revisão',
      minutes: 10,
    },
  ];
  if (reviews[0]) {
    tasks.push({
      label: 'Revisão espaçada',
      text: `${reviews[0].topic}: ${reviews[0].when}.`,
      topic: reviews[0].topic,
      minutes: 3,
    });
  }
  return tasks.slice(0, 4);
}

function buildFlashcards(subject) {
  const cards = [];
  (subject?.notes || []).forEach((note) => {
    const topic = asText(note.subtheme || note.subcategory || note.topicPath?.[0], 'Geral');
    const title = asText(note.title, topic);
    if (title && note.summary) cards.push({ front: `O que lembrar sobre ${title}?`, back: note.summary, topic });
    (note.keyPoints || []).slice(0, 2).forEach((point) => {
      cards.push({ front: `Ideia-chave de ${topic}`, back: point, topic });
    });
  });
  return cards.slice(0, 10);
}

function buildTimeline(subject) {
  if (subject?.name === 'História') {
    const preferred = [
      ['Mecanização têxtil', 'A máquina acelera a produção e muda o ritmo do trabalho.'],
      ['Indústria e fábricas', 'A fábrica concentra trabalhadores, máquinas e supervisão.'],
      ['Trabalhadores e movimento operário', 'A vida urbana industrial favorece organização coletiva.'],
      ['Trabalho infantil e leis fabris', 'A exploração vira debate público e pressiona reformas.'],
      ['Transporte e máquinas a vapor', 'Ferrovias conectam minas, fábricas e mercados.'],
      ['Exposições industriais e consumo', 'A indústria vira vitrine de progresso e poder econômico.'],
    ];
    const available = new Set(subject.subthemes || []);
    return preferred
      .filter(([topic]) => available.has(topic))
      .map(([topic, text], index) => ({ marker: `${index + 1}`, topic, text }));
  }
  return (subject?.subthemes || []).slice(0, 6).map((topic, index) => ({
    marker: `${index + 1}`,
    topic,
    text: `Revise ${topic} e conecte com o próximo subtema da matéria.`,
  }));
}

export function buildSubjectInsights(subject = {}, artifacts = {}) {
  const examResult = artifacts.examResult?.data || null;
  const map = buildMap(subject, examResult);
  const radar = buildRadar(subject, examResult);
  return {
    map,
    radar,
    reviewToday: buildReviewToday(subject, artifacts, radar),
    flashcards: buildFlashcards(subject),
    timeline: buildTimeline(subject),
  };
}
