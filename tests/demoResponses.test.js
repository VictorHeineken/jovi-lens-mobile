import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisFromNote, getDemoAction, getDemoAnalysis, getSubjectDemo } from '../shared/demoResponses.js';

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
  });
  assert.equal(result.subject, 'História');
  assert.equal(result.questions.length, 1);
  assert.match(result.questions[0].question, /Revolução Industrial/);
  assert.match(result.questions[0].question, /As fábricas de Viena/);
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
  });
  // Assert the flat `questions` field specifically: components/SubjectExam.jsx
  // reads `exam.questions` and nothing else, so nesting it (say, under `.exam`)
  // would break the screen. Accepting either shape here would hide that.
  assert.equal(result.subject, 'História');
  assert.equal(typeof result.durationMinutes, 'number');
  assert.ok(Array.isArray(result.questions), 'questions must be a flat array on the result');
  assert.equal(result.questions.length, 2);

  result.questions.forEach((item) => {
    assert.ok(Array.isArray(item.options) && item.options.length > 1);
    assert.equal(typeof item.answerIndex, 'number');
    assert.ok(item.answerIndex >= 0 && item.answerIndex < item.options.length);
    // SubjectExam scores by `answers[index] === q.answerIndex` and groups by
    // `q.topic`, so both fields are load-bearing, not decorative.
    assert.ok(item.topic, 'each question needs a topic for the per-topic breakdown');
  });
});

const locomotiveNote = {
  title: 'A engenharia das primeiras locomotivas a vapor',
  summary: 'As primeiras locomotivas a vapor usavam soluções diferentes das ferrovias modernas.',
  keyPoints: ['A tração por engrenagem foi testada cedo', 'O carvão foi um dos primeiros usos', 'A ferrovia barateou o transporte'],
  text: 'Esta gravura de 1814 mostra uma roda dentada central.',
  category: 'História',
  subcategory: 'Transporte e máquinas a vapor',
};

test('analysisFromNote builds an analysis about the note, not the circle fixture', () => {
  const analysis = analysisFromNote(locomotiveNote, { distractors: ['Variáveis guardam valores', 'HTML estrutura o conteúdo', 'Grifar ajuda a fixar'] });
  assert.equal(analysis.title, locomotiveNote.title);
  assert.equal(analysis.category, 'História');
  assert.deepEqual(analysis.keyPoints, locomotiveNote.keyPoints);
  assert.doesNotMatch(JSON.stringify(analysis), /πr²|círculo/);

  const { practice } = analysis.learning;
  assert.equal(practice.options.length, 4);
  assert.equal(practice.options[practice.answerIndex], locomotiveNote.keyPoints[0]);
  assert.ok(analysis.learning.flashcards.length > 0);
  assert.ok(analysis.learning.understand.steps.length === locomotiveNote.keyPoints.length);
});

test('getDemoAction uses the image context instead of the circle script when given one', () => {
  const context = analysisFromNote(locomotiveNote);
  const reply = getDemoAction({ action: 'ask', question: 'Por que usavam carvão?', context }).reply;
  assert.doesNotMatch(reply, /πr²/);
  assert.match(reply, /carvão/);
  assert.equal(getDemoAction({ action: 'quiz', context }).learning.practice.question, context.learning.practice.question);
});
