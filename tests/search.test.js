import test from 'node:test';
import assert from 'node:assert/strict';
import { searchLibrary } from '../services/search.js';

const notes = [
  { id: 'n1', recordId: 'r1', title: 'Revolução Industrial', category: 'História', summary: 'Fábricas e trabalhadores.' },
  { id: 'n2', recordId: 'r2', title: 'Funções em Python', category: 'Programação', text: 'Listas e funções.' },
];

test('searchLibrary ignores accents and ranks title matches first', () => {
  const results = searchLibrary('revolucao', { notes });
  assert.equal(results[0].title, 'Revolução Industrial');
  assert.equal(results[0].kind, 'nota');
});

test('searchLibrary searches notes, history and media without duplicate entries', () => {
  const results = searchLibrary('python', {
    notes,
    aiHistory: [{ id: 'h1', recordId: 'r2', title: 'Pergunta sobre Python', response: 'Como funcionam as funções?' }],
    records: [{ id: 'r2', label: 'python-study.jpg', src: 'data:image/jpeg;base64,abc' }],
  });

  assert.deepEqual(new Set(results.map((result) => result.kind)), new Set(['nota', 'historico', 'foto']));
  assert.equal(new Set(results.map((result) => result.id)).size, results.length);
});
