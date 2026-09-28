// Spaced review for the Estúdio's study questions (Leitner boxes). The student
// answers from memory, reveals the model answer and marks "Acertei"/"Errei";
// each right answer pushes the card to a longer interval, a wrong one sends it
// back to tomorrow. Pure functions over a plain { [cardId]: state } map so the
// same schedule works in both clients and is testable without a device.

// Days until the next review for each box. Box 0 = learning (review tomorrow).
export const BOX_INTERVAL_DAYS = [1, 1, 3, 7, 14, 30];
export const MAX_BOX = BOX_INTERVAL_DAYS.length - 1;

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

// Stable id for a question across regenerations of the same text.
export function cardIdFor(question) {
  const text = String(question || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  return `q${(hash >>> 0).toString(36)}`;
}

function sameLocalDay(a, b) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

function sanitize(card) {
  if (!card || typeof card !== 'object') return null;
  const box = Number.isInteger(card.box) ? Math.min(MAX_BOX, Math.max(0, card.box)) : 0;
  const reviews = Number.isInteger(card.reviews) && card.reviews > 0 ? card.reviews : 0;
  return { ...card, box, reviews, lapses: Number.isInteger(card.lapses) ? card.lapses : 0 };
}

// A second grade on the same day replaces the first (the student corrected a
// tap) instead of climbing another box — tapping "Acertei" three times used to
// mark a brand-new card as mastered.
export function gradeCard(card, correct, now = new Date()) {
  let previous = sanitize(card);
  if (previous?.lastReviewedAt && sameLocalDay(previous.lastReviewedAt, now)) previous = sanitize(previous.before);
  const base = previous || { box: 0, reviews: 0, lapses: 0 };
  const box = correct ? Math.min(MAX_BOX, (base.reviews ? base.box : 0) + 1) : 0;
  // Due dates are calendar days from today (setDate, not +N×24h, so a DST
  // change never lands the review on the wrong day).
  const due = startOfDay(now);
  due.setDate(due.getDate() + BOX_INTERVAL_DAYS[box]);
  const { before, ...snapshot } = base;
  return {
    box,
    reviews: (base.reviews || 0) + 1,
    lapses: (base.lapses || 0) + (correct ? 0 : 1),
    lastResult: correct ? 'right' : 'wrong',
    lastReviewedAt: new Date(now).toISOString(),
    due: due.toISOString(),
    before: previous ? snapshot : null,
  };
}

export function isDue(card, now = new Date()) {
  const due = new Date(card?.due).getTime();
  const endOfDay = startOfDay(now);
  endOfDay.setDate(endOfDay.getDate() + 1); // calendar day, not +24h (DST)
  return Number.isFinite(due) && due < endOfDay.getTime();
}

// Questions as stored may come from a restored backup: only well-formed ones count.
function validQuestions(questions) {
  return Array.isArray(questions) ? questions.filter((item) => item && typeof item.question === 'string') : [];
}

// Summary for one subject's question list against its review state.
export function reviewSummary(questions = [], cards = {}, now = new Date()) {
  const ids = validQuestions(questions).map((item) => cardIdFor(item.question));
  const seen = ids.filter((id) => cards[id]);
  const due = seen.filter((id) => isDue(cards[id], now));
  const mastered = seen.filter((id) => cards[id].box >= 3);
  return { total: ids.length, seen: seen.length, due: due.length, fresh: ids.length - seen.length, mastered: mastered.length };
}

// Order for a review session: due cards first (oldest due first), then cards
// never seen, then the rest by how soon they come due.
export function reviewQueue(questions = [], cards = {}, now = new Date()) {
  return (Array.isArray(questions) ? questions : [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item && typeof item.question === 'string')
    .map(({ item, index }) => ({ item, index, card: cards[cardIdFor(item.question)] || null }))
    .sort((a, b) => {
      const rank = (entry) => (entry.card ? (isDue(entry.card, now) ? 0 : 2) : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const dueA = a.card ? new Date(a.card.due).getTime() : 0;
      const dueB = b.card ? new Date(b.card.due).getTime() : 0;
      return dueA - dueB || a.index - b.index;
    });
}

// Due counts across every subject — feeds the "Revisão de hoje" on Hoje.
export function dueAcrossSubjects(subjectArtifacts = {}, now = new Date()) {
  return Object.entries(subjectArtifacts || {})
    .map(([subject, artifacts]) => {
      const questions = artifacts?.questions?.data?.questions || [];
      const cards = artifacts?.review?.data?.cards || {};
      return { subject, ...reviewSummary(questions, cards, now) };
    })
    .filter((entry) => entry.due > 0)
    .sort((a, b) => b.due - a.due);
}
