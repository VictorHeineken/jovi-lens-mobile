import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_SUBJECT_ARTIFACTS, mergeDemoSubjectArtifacts } from '../shared/demoSubjectArtifacts.js';

test('História demo studio is preloaded with presentation artifacts', () => {
  const history = DEMO_SUBJECT_ARTIFACTS.História;

  assert.ok(history.questions.data.questions.length >= 7);
  assert.ok(history.exam.data.questions.length >= 6);
  assert.ok(history.examResult.data.percent > 0);
  assert.equal(history.podcast.data.format, 'dialogue');
  assert.equal(history.podcast.data.durationMinutes, 10);
  assert.ok(history.podcast.data.segments.some((segment) => segment.speaker === 'A'));
  assert.ok(history.podcast.data.segments.some((segment) => segment.speaker === 'B'));
  assert.equal(history.podcasts.data.formats.dialogue.format, 'dialogue');
  assert.equal(history.podcasts.data.formats.single.format, 'single');
  assert.equal(history.podcasts.data.formats.drive.format, 'drive');
  assert.ok(history.podcasts.data.formats.single.segments.every((segment) => segment.speaker === 'narrator'));
  assert.ok(history.podcasts.data.formats.drive.durationMinutes === 10);
  assert.ok(history.podcasts.data.formats.drive.segments.some((segment) => segment.speaker === 'coach'));
  assert.ok(history.podcasts.data.formats.drive.segments.some((segment) => segment.speaker === 'feedback'));
  assert.ok(history.podcasts.data.formats.drive.interactions.length >= 3);
  assert.ok(history.questions.data.questions.some((item) => item.topic === 'Mecanização têxtil'));
  assert.ok(history.questions.data.questions.some((item) => item.topic === 'Trabalho infantil e leis fabris'));
  assert.ok(history.videoRecommendations.data.videos.some((video) => video.saved && video.url.includes('youtube.com/watch?v=')));
  assert.ok(history.videoRecommendations.data.videos.every((video) => video.channelTitle && video.thumbnail));
  assert.ok(history.lesson.data.slides.length >= 8);
  assert.ok(history.plan.data.sessions.length >= 4);
  assert.equal(history.plan.data.calendarEvent.source, 'Outlook');
  assert.match(history.plan.data.overview, /Outlook/);
});

test('mergeDemoSubjectArtifacts fills missing demo data without overwriting user artifacts', () => {
  const customQuestions = { data: { subject: 'História', questions: [{ question: 'custom' }] }, savedAt: 'user' };
  const { artifacts, changed } = mergeDemoSubjectArtifacts({ História: { questions: customQuestions } });

  assert.equal(changed, true);
  assert.equal(artifacts.História.questions, customQuestions);
  assert.ok(artifacts.História.podcast.data.segments.length > 0);
});

test('mergeDemoSubjectArtifacts refreshes legacy seeded demo artifacts', () => {
  const legacyPodcast = {
    savedAt: '2026-09-17T12:00:00.000Z',
    data: { subject: 'História', mode: 'demo', provider: 'demo', model: 'seeded-demo', format: 'dialogue', title: 'antigo', segments: [] },
  };
  const { artifacts, changed } = mergeDemoSubjectArtifacts({ História: { podcast: legacyPodcast } });

  assert.equal(changed, true);
  assert.notEqual(artifacts.História.podcast.data.title, 'antigo');
  assert.ok(artifacts.História.podcast.data.segments.length > 0);
});
