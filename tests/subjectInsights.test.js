import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_SUBJECT_ARTIFACTS } from '../shared/demoSubjectArtifacts.js';
import { buildSubjectInsights } from '../shared/subjectInsights.js';

const historySubject = {
  name: 'História',
  count: 2,
  subthemes: ['Mecanização têxtil', 'Trabalhadores e movimento operário'],
  notes: [
    {
      title: 'Spinning Jenny',
      summary: 'A mecanização acelerou a produção de fios.',
      keyPoints: ['Uma pessoa operava vários fusos', 'A produção têxtil ganhou escala'],
      subtheme: 'Mecanização têxtil',
    },
    {
      title: 'Movimento operário',
      summary: 'A concentração de trabalhadores favoreceu organização coletiva.',
      keyPoints: ['Greves e sindicatos crescem com problemas comuns'],
      subtheme: 'Trabalhadores e movimento operário',
    },
  ],
};

test('buildSubjectInsights creates map, radar, daily review and flashcards', () => {
  const insights = buildSubjectInsights(historySubject, DEMO_SUBJECT_ARTIFACTS.História);

  assert.ok(insights.map.length >= 2);
  assert.ok(insights.map.some((item) => item.topic === 'Mecanização têxtil'));
  assert.equal(insights.radar[0].topic, 'Trabalhadores e movimento operário');
  assert.ok(insights.reviewToday.length >= 3);
  assert.ok(insights.flashcards.some((card) => /Spinning Jenny/.test(card.front)));
  assert.ok(insights.timeline.some((item) => item.topic === 'Mecanização têxtil'));
});

test('buildSubjectInsights falls back for subjects without exam results', () => {
  const insights = buildSubjectInsights({ name: 'Geografia', subthemes: ['Cartografia'], notes: [] }, {});

  assert.equal(insights.map[0].topic, 'Cartografia');
  assert.equal(insights.radar[0].label, 'Pouca base');
  assert.ok(insights.reviewToday[0].text.includes('Cartografia'));
  assert.equal(insights.timeline[0].topic, 'Cartografia');
});
