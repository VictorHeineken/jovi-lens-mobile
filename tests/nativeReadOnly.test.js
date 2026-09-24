import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const NATIVE_DIR = join(ROOT, 'modules/jovi-native/android');

function kotlinFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return kotlinFiles(path);
    return path.endsWith('.kt') ? [path] : [];
  });
}

test('the native module only queries content providers (no writes)', () => {
  const files = kotlinFiles(NATIVE_DIR);
  assert.ok(files.length > 0, 'expected Kotlin sources in modules/jovi-native/android');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const forbidden of ['.insert(', '.update(', '.delete(', 'applyBatch', 'WRITE_CALENDAR']) {
      assert.ok(!source.includes(forbidden), `${file} must not contain ${forbidden}`);
    }
  }
});

test('app.json blocks WRITE_CALENDAR', () => {
  const config = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
  assert.ok(config.expo.android.blockedPermissions.includes('android.permission.WRITE_CALENDAR'));
  assert.ok(!config.expo.android.permissions.includes('android.permission.WRITE_CALENDAR'));
});
