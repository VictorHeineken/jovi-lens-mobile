import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSeedNotes, sampleMedia, sampleNotes, sampleRecords } from '../shared/seedLibrary.js';

test('a fresh install gets every example note', () => {
  const { notes, changed } = mergeSeedNotes([], []);
  assert.equal(notes.length, sampleNotes.length);
  assert.equal(changed, true);
});

test('a dismissed example note is not resurrected on the next launch', () => {
  // Regression: deleting an example "worked" until the app reopened, when the
  // merge re-added every example missing from storage.
  const stored = sampleNotes.filter((note) => note.id !== 'sample-note-1');
  const { notes } = mergeSeedNotes(stored, ['sample-note-1']);
  assert.equal(notes.some((note) => note.id === 'sample-note-1'), false);
  assert.equal(notes.length, sampleNotes.length - 1);
});

test('student edits to an example survive while app-owned fields refresh', () => {
  const edited = { ...sampleNotes[0], title: 'Meu título', favorite: true, image: '/old/path.jpg' };
  const { notes } = mergeSeedNotes([edited], []);
  const merged = notes.find((note) => note.id === edited.id);
  assert.equal(merged.title, 'Meu título');
  assert.equal(merged.favorite, true);
  assert.equal(merged.image, sampleNotes[0].image);
});

test('an unchanged library reports no change (no storage rewrite)', () => {
  const { notes } = mergeSeedNotes([], []);
  assert.equal(mergeSeedNotes(notes, []).changed, false);
});

test('each example photo carries its own note as a ready analysis', () => {
  assert.equal(sampleRecords.length, sampleMedia.length);
  for (const record of sampleRecords) {
    const note = sampleNotes.find((item) => item.recordId === record.id);
    assert.ok(note, `sample ${record.id} has no note`);
    assert.equal(record.analysis.sourceNoteId, note.id);
    assert.equal(record.analysis.title, note.title);
  }
});

test('an example the student moved to another subtheme stays there after relaunch', () => {
  // Regression: the merge restored the seed topicPath whenever it had one
  // level, so an edited subtheme snapped back to the original on next launch.
  const moved = { ...sampleNotes[0], subcategory: 'Meu subtema', topicPath: ['Meu subtema'], updatedAt: '2026-09-26T12:00:00.000Z' };
  const { notes } = mergeSeedNotes([moved], []);
  assert.deepEqual(notes.find((note) => note.id === moved.id).topicPath, ['Meu subtema']);
});
