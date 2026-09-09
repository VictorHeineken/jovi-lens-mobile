import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackup } from '../services/dataTransfer.js';

test('createBackup excludes seeded sample media and preserves document metadata', () => {
  const backup = createBackup({
    records: [
      { id: 'sample-1', source: 'sample', src: '/demo.jpg' },
      { id: 'r1', source: 'camera', collectionId: 'document-1', pageNumber: 2, src: 'data:image/jpeg;base64,abc' },
    ],
    notes: [{ id: 'n1' }],
  });

  assert.deepEqual(backup.records, [
    { id: 'r1', source: 'camera', collectionId: 'document-1', pageNumber: 2, src: 'data:image/jpeg;base64,abc' },
  ]);
  assert.deepEqual(backup.notes, [{ id: 'n1' }]);
  assert.equal(backup.app, 'jovi-lens');
  assert.equal(backup.version, 1);
});
