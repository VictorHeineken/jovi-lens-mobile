import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import handler from '../api/video-recommendations.js';
import { issueSession } from '../api/_lib/session.js';
import { resetMemoryStore } from '../api/_lib/store.js';
import { BASE_ENV, makeReq, makeRes, withEnv } from './helpers/http.js';

function headers() {
  return { authorization: `Bearer ${issueSession({ sub: 'video-user', email: 'video@example.com' })}`, 'idempotency-key': randomUUID() };
}

test('video recommendations handler rejects missing subject context', () => withEnv(BASE_ENV, async () => {
  resetMemoryStore();
  const res = makeRes();
  await handler(makeReq({ url: '/api/video-recommendations', headers: headers(), body: {} }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'INVALID_INPUT');
  assert.match(res.body.message, /matéria ausente/i);
}));

test('video recommendations handler returns demo search cards without external API keys', () => withEnv({ ...BASE_ENV, JOVI_LENS_DEMO_MODE: 'true' }, async () => {
  resetMemoryStore();
  const res = makeRes();
  await handler(makeReq({
    url: '/api/video-recommendations',
    headers: headers(),
    body: {
      subject: {
        name: 'Física',
        notes: [{ title: 'Lançamento oblíquo', summary: 'Movimento em duas dimensões.', subtheme: 'Cinemática' }],
        weakTopics: ['decomposição vetorial'],
      },
      preferences: { studyGoal: 'enem', videoStyle: 'exam', duration: 'short', level: 'intermediate', practiceMode: 'questions_first', reviewMethod: 'retrieval' },
    },
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, 'demo');
  assert.ok(res.body.videos.length > 0);
  assert.match(res.body.query, /ENEM/i);
  assert.match(res.body.reason, /questões/i);
  assert.match(res.body.reason, /teste ativo/i);
  assert.match(res.body.videos[0].url, /^https:\/\/www\.youtube\.com\/results\?search_query=/);
  assert.equal(res.body.videos[0].channelTitle, 'Busca sugerida');
  assert.equal(res.headers['x-jovi-credits-remaining'], '2');
}));
