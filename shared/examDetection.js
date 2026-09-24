// Classifies device calendar events into exams / assignments for a subject
// (prod-implementation-spec.md §6.11). Pure: shared by the app and its tests.

export const DEFAULT_SUBJECTS = ['Matemática', 'Português', 'História', 'Geografia', 'Biologia', 'Química', 'Física', 'Inglês', 'Filosofia', 'Sociologia', 'Artes', 'Programação'];

const EXAM_PATTERN = /\b(prova|avaliacao|teste|simulado|exame|recuperacao|p[1-4])\b/;
const ASSIGNMENT_PATTERN = /\b(trabalho|entrega|seminario|atividade|lista de exercicios)\b/;

// Normalized subject key → aliases (all already normalized).
const SUBJECT_ALIASES = {
  matematica: ['mat'],
  portugues: ['port', 'lingua portuguesa', 'redacao'],
  historia: ['hist'],
  geografia: ['geo'],
  biologia: ['bio'],
  quimica: ['quim'],
  fisica: ['fis'],
  ingles: ['ing', 'english'],
};

export function norm(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsWord(text, phrase) {
  if (!phrase) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}(?=$|[^a-z0-9])`).test(text);
}

function detectSubject(text, subjectNames) {
  const direct = subjectNames.find((name) => containsWord(text, norm(name)));
  if (direct) return direct;
  for (const [key, aliases] of Object.entries(SUBJECT_ALIASES)) {
    if (!aliases.some((alias) => containsWord(text, alias))) continue;
    const canonical = subjectNames.find((name) => norm(name) === key);
    if (canonical) return canonical;
  }
  return null;
}

function bulletTopics(description) {
  return String(description || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-•*]/.test(line))
    .map((line) => line.replace(/^[-•*]\s*/, '').trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 8);
}

export function classifyCalendarEvent({ title = '', description = '' } = {}, subjectNames = DEFAULT_SUBJECTS) {
  const normalizedTitle = norm(title);
  const type = EXAM_PATTERN.test(normalizedTitle) ? 'exam' : ASSIGNMENT_PATTERN.test(normalizedTitle) ? 'assignment' : null;
  const text = norm(`${title} ${description}`);
  return { type, subject: detectSubject(text, subjectNames), topics: bulletTopics(description) };
}
