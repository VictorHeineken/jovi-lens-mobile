import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeDataUri, ownMediaPath, rebaseMediaPath } from '../shared/mediaPaths.js';

const MEDIA_DIR = 'file:///data/user/0/com.jovilens.app/files/jovi-media/';

test('a path from another device or container is re-anchored by its file name', () => {
  assert.equal(rebaseMediaPath('file:///var/mobile/Containers/Data/Application/OLD-UUID/Documents/jovi-media/media-1.jpg', MEDIA_DIR), `${MEDIA_DIR}media-1.jpg`);
  assert.equal(rebaseMediaPath('file:///x/jovi-media/media-1-thumb.jpg', MEDIA_DIR), `${MEDIA_DIR}media-1-thumb.jpg`);
  assert.equal(rebaseMediaPath(`${MEDIA_DIR}media-1.jpg`, MEDIA_DIR), `${MEDIA_DIR}media-1.jpg`);
});

test('crafted media paths never resolve outside a single file in the media folder', () => {
  // Regression (security review): "…/jovi-media/../mmkv" was re-anchored to
  // <files>/mmkv and then deleted or embedded in a backup.
  for (const crafted of [
    'data:image/jpeg;base64,x/jovi-media/../mmkv',
    'file:///x/jovi-media/../mmkv',
    'file:///x/jovi-media/../mmkv/jovi-lens',
    'file:///x/jovi-media/',
    'file:///x/jovi-media/sub/dir.jpg',
    'file:///x/jovi-media/a.jpg/../../mmkv',
  ]) {
    const rebased = rebaseMediaPath(crafted, MEDIA_DIR);
    assert.equal(ownMediaPath(rebased, MEDIA_DIR), null, `${crafted} → ${rebased}`);
  }
  assert.equal(ownMediaPath(`${MEDIA_DIR}../mmkv`, MEDIA_DIR), null);
  assert.equal(ownMediaPath(MEDIA_DIR, MEDIA_DIR), null);
  assert.equal(ownMediaPath(`${MEDIA_DIR}media-1.jpg`, MEDIA_DIR), `${MEDIA_DIR}media-1.jpg`);
});

test('only a complete base64 data URI counts as embedded media', () => {
  assert.equal(isSafeDataUri('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
  assert.equal(isSafeDataUri('data:image/jpeg;base64,x/jovi-media/../mmkv'), false);
  assert.equal(isSafeDataUri('data:text/html;base64,PGh0bWw+'), false);
  assert.equal(isSafeDataUri('data:image/jpeg;base64,'), false);
});
