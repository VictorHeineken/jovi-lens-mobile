// Offline correction of a written answer against the question's model answer.
// Used by Demo Mode (and as the shape the live AI grader is normalized to):
// the key concepts are the content words of the model answer, compared by
// stem so "fábrica"/"fabricas" or "dividiu"/"dividindo" still match.

const STOPWORDS = new Set([
  'sobre', 'entre', 'quando', 'porque', 'porem', 'ainda', 'tambem', 'muito', 'mesmo', 'mesma', 'outro', 'outra', 'outros', 'outras',
  'esses', 'essas', 'aquele', 'aquela', 'podem', 'pode', 'sendo', 'foram', 'seria', 'depois', 'antes', 'assim', 'entao', 'cada',
  'todos', 'todas', 'desde', 'apenas', 'sempre', 'nunca', 'coisa', 'coisas', 'forma', 'parte', 'epoca', 'naquela', 'naquele',
]);

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function stem(word) {
  return word.slice(0, 5);
}

// Content words with their original spelling for display. Hyphenated terms
// ("matéria-prima") stay one concept instead of splitting into two.
function contentWords(text) {
  return String(text || '')
    .split(/[^\p{L}\p{N}-]+/u)
    .map((display) => display.replace(/^-+|-+$/g, ''))
    .map((display) => ({ display: display.toLowerCase(), key: normalize(display) }))
    .filter(({ key }) => key.replace(/-/g, '').length >= 5 && !STOPWORDS.has(key));
}

function levelFor(score) {
  if (score === 0) return 'Escreva sua resposta';
  if (score >= 8) return 'Resposta completa';
  if (score >= 6) return 'Boa base, faltam conceitos';
  return 'Precisa desenvolver';
}

export function gradeAgainstModel({ answer = '', modelAnswer = '' } = {}) {
  const expected = [...new Map(contentWords(modelAnswer).map((word) => [stem(word.key), word.display])).entries()];
  if (!normalize(answer).trim()) {
    return {
      score: 0,
      level: levelFor(0),
      feedback: 'Escreva sua resposta com suas palavras antes de conferir a resposta-modelo.',
      strengths: [],
      missing: expected.slice(0, 3).map(([, word]) => word),
    };
  }
  const given = new Set(contentWords(answer).map((word) => stem(word.key)));
  const hits = expected.filter(([key]) => given.has(key));
  const coverage = expected.length ? hits.length / expected.length : 0;
  const score = Math.max(1, Math.min(10, Math.round(2 + coverage * 8)));
  const missing = expected.filter(([key]) => !given.has(key)).slice(0, 3).map(([, word]) => word);
  return {
    score,
    level: levelFor(score),
    feedback: score >= 8
      ? 'Você cobriu as ideias centrais da resposta-modelo.'
      : score >= 6
        ? 'Boa base. Conecte os conceitos que faltaram para completar o raciocínio.'
        : 'Retome a resposta-modelo: faltaram ideias centrais para explicar o tema.',
    strengths: hits.slice(0, 3).map(([, word]) => word),
    missing,
  };
}
