import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAgainstModel } from '../shared/answerGrading.js';
import subjectAI from '../api/subject-ai.js';

const modelAnswer = 'A fábrica concentrou máquinas e trabalhadores no mesmo espaço, dividiu a produção em etapas e impôs uma rotina controlada.';

test('an empty answer scores zero and says what to do', () => {
  const result = gradeAgainstModel({ answer: '   ', modelAnswer });
  assert.equal(result.score, 0);
  assert.ok(result.missing.length > 0);
});

test('an answer covering the model answer scores high; a vague one scores low', () => {
  const strong = gradeAgainstModel({ answer: 'As fábricas juntaram máquinas e trabalhadores, dividindo a produção em etapas com rotina controlada.', modelAnswer });
  const vague = gradeAgainstModel({ answer: 'Mudou bastante coisa naquela época.', modelAnswer });
  assert.ok(strong.score >= 8, `strong scored ${strong.score}`);
  assert.ok(vague.score <= 4, `vague scored ${vague.score}`);
  assert.ok(strong.score > vague.score);
  assert.ok(vague.missing.length > 0);
});

test('grading tolerates accents and inflection (fábrica/fabricas)', () => {
  const result = gradeAgainstModel({ answer: 'fabricas maquinas trabalhador producao etapa rotina controlado espaco concentrou dividiu', modelAnswer });
  assert.ok(result.score >= 8, `scored ${result.score}`);
});

test('the subject-ai handler grades a written answer (demo mode)', async () => {
  const saved = { ...process.env };
  try {
    delete process.env.JOVI_API_KEY;
    process.env.JOVI_LENS_DEMO_MODE = 'true';
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
    await subjectAI({ method: 'POST', ip: 'grade-test', headers: { 'content-type': 'application/json' }, body: { action: 'grade', subject: { name: 'História', notes: [] }, grading: { question: 'Como a fábrica mudou o trabalho?', modelAnswer, answer: 'A fábrica juntou máquinas e trabalhadores e dividiu a produção.' } } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.score > 0 && res.body.score <= 10);
    assert.ok(typeof res.body.feedback === 'string' && res.body.feedback.length > 0);

    const missing = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
    await subjectAI({ method: 'POST', ip: 'grade-test', headers: { 'content-type': 'application/json' }, body: { action: 'grade', subject: { name: 'História' }, grading: { question: 'x', modelAnswer, answer: '' } } }, missing);
    assert.equal(missing.statusCode, 400);
  } finally {
    process.env = saved;
  }
});
