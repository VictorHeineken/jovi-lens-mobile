import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCalendarEvent, DEFAULT_SUBJECTS, norm } from '../shared/examDetection.js';

test('prova, P2 and simulado are exams; entrega is an assignment; others are null', () => {
  assert.equal(classifyCalendarEvent({ title: 'Prova de História' }).type, 'exam');
  assert.equal(classifyCalendarEvent({ title: 'P2 - Química' }).type, 'exam');
  assert.equal(classifyCalendarEvent({ title: 'Simulado ENEM' }).type, 'exam');
  assert.equal(classifyCalendarEvent({ title: 'Avaliação bimestral' }).type, 'exam');
  assert.equal(classifyCalendarEvent({ title: 'Recuperação de Física' }).type, 'exam');
  assert.equal(classifyCalendarEvent({ title: 'Entrega do trabalho de Artes' }).type, 'assignment');
  assert.equal(classifyCalendarEvent({ title: 'Seminário de Sociologia' }).type, 'assignment');
  assert.equal(classifyCalendarEvent({ title: 'Aniversário da Ana' }).type, null);
  assert.equal(classifyCalendarEvent({ title: 'Reunião', description: 'prova' }).type, null, 'type comes from the title only');
  assert.equal(classifyCalendarEvent({ title: 'Protesto' }).type, null, 'whole words only');
});

test('subject match is accent-insensitive and returns the canonical name', () => {
  assert.equal(classifyCalendarEvent({ title: 'Prova de historia' }, DEFAULT_SUBJECTS).subject, 'História');
  assert.equal(classifyCalendarEvent({ title: 'PROVA DE MATEMÁTICA' }, DEFAULT_SUBJECTS).subject, 'Matemática');
  assert.equal(classifyCalendarEvent({ title: 'Prova', description: 'Conteúdo de Geografia' }, DEFAULT_SUBJECTS).subject, 'Geografia');
  assert.equal(classifyCalendarEvent({ title: 'Prova de Robótica' }, [...DEFAULT_SUBJECTS, 'Robótica']).subject, 'Robótica');
  assert.equal(classifyCalendarEvent({ title: 'Prova surpresa' }, DEFAULT_SUBJECTS).subject, null);
});

test('aliases map to the canonical subject as whole words', () => {
  assert.equal(classifyCalendarEvent({ title: 'P1 Mat' }).subject, 'Matemática');
  assert.equal(classifyCalendarEvent({ title: 'Prova de Redação' }).subject, 'Português');
  assert.equal(classifyCalendarEvent({ title: 'Teste bio' }).subject, 'Biologia');
  assert.equal(classifyCalendarEvent({ title: 'Prova English' }).subject, 'Inglês');
  assert.equal(classifyCalendarEvent({ title: 'Prova de matemágica' }).subject, null, 'alias must be a whole word');
  assert.equal(classifyCalendarEvent({ title: 'Prova de hist' }, ['Biologia']).subject, null, 'canonical name must be in subjectNames');
});

test('topics come from bullet lines, stripped, capped at 80 chars and 8 items', () => {
  const description = [
    'Estudar para a prova:',
    '- Revolução Industrial',
    '• Movimento operário',
    '* Máquinas a vapor',
    `- ${'x'.repeat(120)}`,
    'Sem marcador',
    ...Array.from({ length: 6 }, (_, i) => `- Tópico ${i}`),
  ].join('\n');
  const { topics } = classifyCalendarEvent({ title: 'Prova de História', description });
  assert.deepEqual(topics.slice(0, 3), ['Revolução Industrial', 'Movimento operário', 'Máquinas a vapor']);
  assert.equal(topics[3].length, 80);
  assert.equal(topics.length, 8);
});

test('norm strips accents, lowercases and collapses whitespace', () => {
  assert.equal(norm('  Avaliação   de  Química '), 'avaliacao de quimica');
});
