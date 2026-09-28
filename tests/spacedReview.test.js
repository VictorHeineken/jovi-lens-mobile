import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX_INTERVAL_DAYS, cardIdFor, dueAcrossSubjects, gradeCard, isDue, reviewQueue, reviewSummary } from '../shared/spacedReview.js';

const now = new Date('2026-09-26T10:00:00');
const day = (n) => new Date(now.getTime() + n * 86_400_000);

test('card ids ignore accents, case and spacing so a regenerated question keeps its history', () => {
  assert.equal(cardIdFor('Por que a fábrica  mudou o TRABALHO?'), cardIdFor('por que a fabrica mudou o trabalho?'));
  assert.notEqual(cardIdFor('pergunta A'), cardIdFor('pergunta B'));
});

test('right answers climb the Leitner boxes and wrong answers reset to tomorrow', () => {
  let card = gradeCard(null, true, now);
  assert.equal(card.box, 1);
  assert.equal(isDue(card, now), false, 'not due again today');
  assert.equal(isDue(card, day(1)), true);
  card = gradeCard(card, true, day(1));
  assert.equal(card.box, 2);
  assert.equal(isDue(card, day(1 + BOX_INTERVAL_DAYS[2] - 1)), false);
  assert.equal(isDue(card, day(1 + BOX_INTERVAL_DAYS[2])), true);
  card = gradeCard(card, false, day(4));
  assert.equal(card.box, 0);
  assert.equal(card.lapses, 1);
  assert.equal(isDue(card, day(5)), true);
});

test('the box never exceeds the last interval', () => {
  let card = null;
  for (let i = 0; i < 12; i += 1) card = gradeCard(card, true, day(i * 40));
  assert.equal(card.box, BOX_INTERVAL_DAYS.length - 1);
});

test('summary and queue put due cards first, then new ones', () => {
  const questions = [{ question: 'nova' }, { question: 'futura' }, { question: 'vencida' }];
  const cards = {
    [cardIdFor('futura')]: gradeCard(null, true, day(0)),
    [cardIdFor('vencida')]: { ...gradeCard(null, true, day(-5)), due: day(-1).toISOString() },
  };
  const summary = reviewSummary(questions, cards, now);
  assert.deepEqual({ due: summary.due, fresh: summary.fresh, seen: summary.seen }, { due: 1, fresh: 1, seen: 2 });
  assert.deepEqual(reviewQueue(questions, cards, now).map((entry) => entry.item.question), ['vencida', 'nova', 'futura']);
});

test('due counts roll up across subjects for the Hoje tab', () => {
  const artifacts = {
    História: { questions: { data: { questions: [{ question: 'a' }] } }, review: { data: { cards: { [cardIdFor('a')]: { box: 1, due: day(-1).toISOString() } } } } },
    Física: { questions: { data: { questions: [{ question: 'b' }] } } },
  };
  assert.deepEqual(dueAcrossSubjects(artifacts, now).map((entry) => [entry.subject, entry.due]), [['História', 1]]);
});

test('re-grading the same card on the same day replaces the grade instead of stacking it', () => {
  // Regression: three taps on "Acertei" pushed a new card to box 3 ("dominada", +7 days).
  let card = gradeCard(null, true, now);
  card = gradeCard(card, true, new Date(now.getTime() + 60_000));
  card = gradeCard(card, true, new Date(now.getTime() + 120_000));
  assert.equal(card.box, 1);
  assert.equal(card.reviews, 1);
  const corrected = gradeCard(card, false, new Date(now.getTime() + 180_000));
  assert.equal(corrected.box, 0, 'changing the answer the same day still works');
  const nextDay = gradeCard(card, true, day(1));
  assert.equal(nextDay.box, 2);
});

test('a malformed card (from a crafted backup) does not crash grading', () => {
  assert.doesNotThrow(() => gradeCard({ reviews: 3, box: 'x', due: 'nope' }, true, now));
  assert.equal(gradeCard({ reviews: 3, box: 'x' }, true, now).box, 1);
});

test('due dates land on calendar days (DST-safe)', () => {
  const card = gradeCard(null, true, new Date('2026-11-01T10:00:00'));
  const due = new Date(card.due);
  assert.equal(due.getHours(), 0);
  assert.equal(due.getDate(), 2);
});

test('malformed stored questions (from a restored backup) are ignored, not fatal', () => {
  const artifacts = { História: { questions: { data: { questions: 'oops' } } }, Física: { questions: { data: { questions: [null, { question: 42 }, { question: 'ok' }] } } } };
  assert.doesNotThrow(() => dueAcrossSubjects(artifacts, now));
  assert.equal(reviewSummary([null, { question: 'ok' }], {}, now).total, 1);
  assert.deepEqual(reviewQueue([null, { question: 'a' }], {}, now).map((entry) => entry.index), [1]);
});
