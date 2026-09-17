import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fallbackVideoSearchQuery,
  normalizeVideoRecommendations,
} from '../api/_lib/videoRecommendations.js';

test('fallbackVideoSearchQuery keeps the subject, weak topics and learning preferences', () => {
  const query = fallbackVideoSearchQuery(
    { name: 'Física', notes: [{ subtheme: 'Cinemática' }], weakTopics: ['Lançamento oblíquo'] },
    { studyGoal: 'vestibular', videoStyle: 'animated', practiceMode: 'questions_first', reviewMethod: 'retrieval' },
  );
  assert.match(query, /Física/);
  assert.match(query, /Cinemática/);
  assert.match(query, /Lançamento oblíquo/);
  assert.match(query, /vestibular/);
  assert.match(query, /questões/);
  assert.match(query, /teste ativo/);
  assert.match(query, /animada/);
});

test('normalizeVideoRecommendations returns safe searchable cards without provider links', () => {
  const result = normalizeVideoRecommendations({
    query: 'cinemática lançamento oblíquo aula',
    focus: 'Retomar lançamento oblíquo com exemplos.',
    recommendations: [{
      title: 'Aula com desenho e exercícios',
      searchQuery: 'lançamento oblíquo desenho exercícios',
      description: 'Comece por uma explicação visual.',
      didacticReason: 'Acompanhe se a aula separa decomposição horizontal e vertical.',
      watchFor: ['decomposição', 'exemplo resolvido'],
      estimatedMinutes: 18,
    }],
  }, { name: 'Física' }, { duration: 'short' }, { mode: 'live', provider: 'test', model: 'fake', fallbackQuery: 'Física aula' });

  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].channelTitle, 'Busca sugerida');
  assert.match(result.videos[0].url, /^https:\/\/www\.youtube\.com\/results\?search_query=/);
  assert.equal(result.videos[0].estimatedMinutes, 18);
  assert.deepEqual(result.videos[0].watchFor, ['decomposição', 'exemplo resolvido']);
});
