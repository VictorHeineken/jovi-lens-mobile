import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/video-recommendations.js';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function mockReq({ method = 'POST', body = {}, ip = 'video-handler-test' } = {}) {
  return { method, body, headers: {}, ip };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('video recommendations handler rejects missing subject context', async () => {
  try {
    delete process.env.JOVI_API_KEY;
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /matéria ausente/i);
  } finally {
    restoreEnv();
  }
});

test('video recommendations handler returns demo search cards without external API keys', async () => {
  try {
    delete process.env.JOVI_API_KEY;
    process.env.JOVI_LENS_DEMO_MODE = 'true';

    const res = mockRes();
    await handler(mockReq({
      ip: 'video-handler-demo-test',
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
  } finally {
    restoreEnv();
  }
});
