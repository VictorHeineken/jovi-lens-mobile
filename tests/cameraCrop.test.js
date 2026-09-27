import test from 'node:test';
import assert from 'node:assert/strict';
import { getAspectCrop, framingAspect } from '../shared/cameraCrop.js';

test('a portrait photo keeps a portrait crop matching the on-screen frame', () => {
  // Regression: "4:3" was always applied as landscape, so a 3000x4000 page
  // came out 3000x2250 — 44% of it cut while the preview frame showed 3:4.
  const crop = getAspectCrop(3000, 4000, '4:3');
  assert.deepEqual(crop, { originX: 0, originY: 0, width: 3000, height: 4000 });
  const tall = getAspectCrop(3000, 4000, '16:9');
  assert.equal(tall.width, Math.round(4000 * 9 / 16));
  assert.equal(tall.height, 4000);
  assert.ok(tall.width < tall.height);
});

test('a landscape photo keeps a landscape crop', () => {
  const crop = getAspectCrop(4000, 3000, '16:9');
  assert.equal(crop.width, 4000);
  assert.equal(crop.height, 2250);
  assert.equal(crop.originY, 375);
});

test('1:1 is centered and never exceeds the source', () => {
  const crop = getAspectCrop(3000, 4000, '1:1');
  assert.deepEqual(crop, { originX: 0, originY: 500, width: 3000, height: 3000 });
  for (const [w, h] of [[1, 1], [3001, 4003], [4003, 3001]]) {
    for (const ratio of ['4:3', '16:9', '1:1']) {
      const c = getAspectCrop(w, h, ratio);
      assert.ok(c.originX >= 0 && c.originY >= 0 && c.originX + c.width <= w && c.originY + c.height <= h, `${w}x${h} ${ratio}`);
    }
  }
});

test('the preview frame uses the same orientation as the crop', () => {
  assert.equal(framingAspect('4:3'), 3 / 4);
  assert.equal(framingAspect('16:9'), 9 / 16);
  assert.equal(framingAspect('1:1'), 1);
});
