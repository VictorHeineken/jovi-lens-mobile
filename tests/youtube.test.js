import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackYouTubeQuery, rankYouTubeResults } from '../api/_lib/youtube.js';

test('fallbackYouTubeQuery keeps the subject and learning style in the search', () => {
  const query = fallbackYouTubeQuery({ name: 'Física', notes: [{ subtheme: 'Cinemática' }], weakTopics: ['Lançamento oblíquo'] }, { videoStyle: 'animated' });
  assert.match(query, /Física/);
  assert.match(query, /Cinemática/);
  assert.match(query, /Lançamento oblíquo/);
  assert.match(query, /animada/);
});

test('rankYouTubeResults favors the requested style without losing stable ordering', () => {
  const results = rankYouTubeResults([
    { id: 'calm', title: 'Aula completa passo a passo', description: '' },
    { id: 'animated', title: 'Cinemática animada com exemplos visuais', description: '' },
  ], { videoStyle: 'animated' });
  assert.equal(results[0].id, 'animated');
  assert.equal(results[1].id, 'calm');
});
