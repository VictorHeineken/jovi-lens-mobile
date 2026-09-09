import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateSubjects, subthemeOf } from '../services/subjectStudy.js';

test('subthemeOf prefers the first topic path entry', () => {
  assert.equal(subthemeOf({ topicPath: ['Funções'], subcategory: 'Python' }), 'Funções');
  assert.equal(subthemeOf({ subcategory: 'Python' }), 'Python');
  assert.equal(subthemeOf({}), 'Geral');
});

test('aggregateSubjects groups notes and orders subjects alphabetically', () => {
  const subjects = aggregateSubjects([
    { category: 'História', topicPath: ['Revolução'], createdAt: '2026-08-01', title: 'A', text: 'a' },
    { category: 'Programação', subcategory: 'Python', createdAt: '2026-08-03', title: 'B', text: 'b' },
    { category: 'História', topicPath: ['Fábricas'], createdAt: '2026-08-04', title: 'C', text: 'c' },
  ]);

  assert.deepEqual(subjects.map((subject) => subject.name), ['História', 'Programação']);
  assert.equal(subjects[0].count, 2);
  assert.deepEqual(subjects[0].subthemes, ['Revolução', 'Fábricas']);
  assert.equal(subjects[0].notes[1].title, 'C');
  assert.equal(subjects[0].updatedAt, new Date('2026-08-04').getTime());
});

test('aggregateSubjects places uncategorized notes in Outros', () => {
  const [subject] = aggregateSubjects([{ title: 'Sem matéria', createdAt: '2026-08-01' }]);
  assert.equal(subject.name, 'Outros');
  assert.equal(subject.subthemes[0], 'Geral');
});
