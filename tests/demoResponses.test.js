import test from 'node:test';
import assert from 'node:assert/strict';
import { getDemoAction, getDemoAnalysis, getSubjectDemo } from '../shared/demoResponses.js';

// This module is the offline fallback behind every AI feature, so in Demo Mode it
// IS the product — a presentation with no network shows nothing but this output.
// It had no tests while it existed as two identical copies; now that there is one
// shared copy, these cover the contracts both clients depend on.

test('getDemoAnalysis returns a fresh deep copy each call', () => {
  const first = getDemoAnalysis();
  first.title = 'mutated';
  first.learning.flashcards.push({ front: 'injected', back: 'injected' });

  const second = getDemoAnalysis();
  assert.notEqual(second.title, 'mutated');
  assert.ok(!second.learning.flashcards.some((card) => card.front === 'injected'));
});

test('getDemoAction returns only the section the requested action needs', () => {
  assert.ok(getDemoAction({ action: 'quiz' }).learning.practice);
  assert.equal(getDemoAction({ action: 'quiz' }).learning.understand, undefined);
  assert.ok(Array.isArray(getDemoAction({ action: 'flashcards' }).learning.flashcards));
  assert.ok(getDemoAction({ action: 'solve' }).learning.solve);
  assert.ok(getDemoAction({ action: 'explain' }).learning.understand);
});

test('getDemoAction falls back to explain for an unknown action', () => {
  const result = getDemoAction({ action: 'not-a-real-action' });
  assert.equal(result.action, 'explain');
  assert.ok(result.learning.understand);
});

test('getDemoAction answers a known question verbatim and still replies to an unknown one', () => {
  const known = getDemoAction({ action: 'ask', question: 'Me dê um exemplo parecido.' });
  assert.match(known.reply, /raio de 5 cm/);

  const unknown = getDemoAction({ action: 'ask', question: 'pergunta que não existe no roteiro' });
  assert.ok(unknown.reply.length > 0, 'an unscripted question must still get an answer, not an empty string');
  assert.match(unknown.reply, /A = πr²/);
});

test('getDemoAction on extract exposes the text fields without the learning payload', () => {
  const result = getDemoAction({ action: 'extract' });
  assert.equal(typeof result.text, 'string');
  assert.equal(result.language, getDemoAnalysis().language);
  assert.equal(result.learning, undefined);
});

test('getSubjectDemo builds questions from the notes it is given', () => {
  const result = getSubjectDemo({
    action: 'questions',
    subject: { name: 'História', notes: [{ subtheme: 'Revolução Industrial', title: 'As fábricas de Viena' }] },
    preferences: { studyGoal: 'enem', practiceMode: 'questions_first', reviewMethod: 'retrieval' },
  });
  assert.equal(result.subject, 'História');
  assert.equal(result.questions.length, 1);
  assert.match(result.questions[0].question, /Revolução Industrial/);
  assert.match(result.questions[0].question, /ENEM/);
  assert.match(result.questions[0].question, /As fábricas de Viena/);
  assert.match(result.questions[0].answer, /questões primeiro/);
  assert.match(result.questions[0].answer, /teste ativo/);
  assert.equal(result.questions[0].topic, 'Revolução Industrial');
});

test('getSubjectDemo still produces content when the subject has no notes', () => {
  // Demo Mode must never render an empty screen — a subject with no usable
  // subthemes falls back to generic topics rather than an empty list.
  const result = getSubjectDemo({ action: 'questions', subject: { name: 'Física', notes: [] } });
  assert.ok(result.questions.length > 0);
  assert.ok(result.questions.every((item) => item.topic && item.question && item.answer));
});

test('getSubjectDemo reads subthemes from any of the three note shapes', () => {
  const result = getSubjectDemo({
    action: 'questions',
    subject: {
      name: 'Mistas',
      notes: [{ subtheme: 'A' }, { subcategory: 'B' }, { topicPath: ['C'] }],
    },
  });
  const topics = result.questions.map((item) => item.topic);
  assert.deepEqual(topics, ['A', 'B', 'C']);
});

test('getSubjectDemo exam returns the flat shape SubjectExam reads', () => {
  const result = getSubjectDemo({
    action: 'exam',
    subject: { name: 'História', notes: [{ subtheme: 'Indústria' }, { subtheme: 'Transporte' }] },
    preferences: { studyGoal: 'school_exam' },
  });
  // Assert the flat `questions` field specifically: components/SubjectExam.jsx
  // reads `exam.questions` and nothing else, so nesting it (say, under `.exam`)
  // would break the screen. Accepting either shape here would hide that.
  assert.equal(result.subject, 'História');
  assert.equal(typeof result.durationMinutes, 'number');
  assert.ok(Array.isArray(result.questions), 'questions must be a flat array on the result');
  assert.equal(result.questions.length, 2);
  assert.match(result.questions[0].question, /prova da escola/);

  result.questions.forEach((item) => {
    assert.ok(Array.isArray(item.options) && item.options.length > 1);
    assert.equal(typeof item.answerIndex, 'number');
    assert.ok(item.answerIndex >= 0 && item.answerIndex < item.options.length);
    // SubjectExam scores by `answers[index] === q.answerIndex` and groups by
    // `q.topic`, so both fields are load-bearing, not decorative.
    assert.ok(item.topic, 'each question needs a topic for the per-topic breakdown');
  });
});

test('getSubjectDemo plan reflects global study strategy, pace and review method', () => {
  const result = getSubjectDemo({
    action: 'plan',
    subject: { name: 'História', notes: [{ subtheme: 'Indústria' }, { subtheme: 'Transporte' }] },
    preferences: { studyContext: 'exam_season', weeklyPace: 'intense', practiceMode: 'questions_first', reviewMethod: 'interleaved' },
  });

  assert.match(result.overview, /período de provas/);
  assert.match(result.overview, /ritmo intensivo/);
  assert.equal(result.sessions[0].durationMinutes, 45);
  assert.ok(result.sessions[0].tasks.some((task) => /Resolver primeiro/.test(task)));
  assert.ok(result.sessions[0].tasks.some((task) => /Comparar este subtema/.test(task)));
});

test('getSubjectDemo podcast drive mode is hands-free friendly', () => {
  const result = getSubjectDemo({
    action: 'podcast-script',
    subject: { name: 'Biologia', format: 'drive', notes: [{ subtheme: 'Citologia' }, { subtheme: 'Mitose' }] },
  });

  assert.equal(result.format, 'drive');
  assert.equal(typeof result.durationMinutes, 'number');
  assert.ok(Array.isArray(result.takeaways));
  assert.ok(result.segments.length >= 4);
  assert.ok(result.segments.every((segment) => segment.speaker === 'narrator' && segment.text));
});
