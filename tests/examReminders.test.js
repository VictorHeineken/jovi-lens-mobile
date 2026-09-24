import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExamReminders } from '../shared/examReminders.js';

const now = new Date(2026, 8, 24, 10, 0, 0); // 24 Sep 2026, 10:00 local

function exam(overrides = {}) {
  return {
    id: 'evt1-1759150800000',
    type: 'exam',
    subject: 'História',
    title: 'Prova de História',
    startsAt: new Date(2026, 8, 30, 8, 0, 0).toISOString(),
    topics: ['Revolução Industrial', 'Movimento operário', 'Máquinas'],
    ...overrides,
  };
}

test('reminders fire at 19:00 local, 3 days and 1 day before the exam', () => {
  const reminders = buildExamReminders({ events: [exam()] }, now);
  assert.equal(reminders.length, 2);
  assert.deepEqual(reminders[0].fireAt, new Date(2026, 8, 27, 19, 0, 0));
  assert.deepEqual(reminders[1].fireAt, new Date(2026, 8, 29, 19, 0, 0));
  assert.equal(reminders[0].title, 'Prova de História em 3 dias');
  assert.equal(reminders[1].title, 'Prova de História amanhã');
  assert.match(reminders[0].body, /^Prova de História · .+\. Revise Revolução Industrial e Movimento operário hoje\.$/);
  assert.deepEqual(reminders[0].data, { subject: 'História' });
});

test('the id format is exam-<eventId>-<offset>d', () => {
  const ids = buildExamReminders({ events: [exam()] }, now).map((item) => item.id);
  assert.deepEqual(ids, ['exam-evt1-1759150800000-3d', 'exam-evt1-1759150800000-1d']);
});

test('past triggers are skipped', () => {
  const soon = exam({ startsAt: new Date(2026, 8, 26, 8, 0, 0).toISOString() }); // -3d is in the past
  const reminders = buildExamReminders({ events: [soon] }, now);
  assert.deepEqual(reminders.map((item) => item.id), [`exam-${soon.id}-1d`]);

  const lateToday = new Date(2026, 8, 25, 20, 0, 0);
  assert.equal(buildExamReminders({ events: [soon] }, lateToday).length, 0);
});

test('assignments and exams beyond 60 days are ignored; output is sorted by fireAt', () => {
  const later = exam({ id: 'later', startsAt: new Date(2026, 9, 20, 8, 0, 0).toISOString() });
  const far = exam({ id: 'far', startsAt: new Date(2026, 11, 30, 8, 0, 0).toISOString() });
  const assignment = exam({ id: 'hw', type: 'assignment' });
  const reminders = buildExamReminders({ events: [later, far, assignment, exam()] }, now);
  assert.deepEqual(reminders.map((item) => item.id), [
    'exam-evt1-1759150800000-3d',
    'exam-evt1-1759150800000-1d',
    'exam-later-3d',
    'exam-later-1d',
  ]);
});

test('without topics the body falls back to the main topics', () => {
  const [first] = buildExamReminders({ events: [exam({ topics: [] })] }, now);
  assert.match(first.body, /Revise os principais tópicos hoje\.$/);
});
