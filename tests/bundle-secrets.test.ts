// The bundle secret check (scripts/check-bundle-secrets.mjs; prompt §9 item 8): it finds a secret's value, or the
// password inside a connection URL, in any built file, names the variable and the file, and ignores short or unset
// values. CI runs the script itself after a build made with dummy secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSecrets, needles } from '../scripts/check-bundle-secrets.mjs';

const ENV = { SESSION_SECRET: 'dummy-session-secret-for-the-build-check', DATABASE_URL: 'postgresql://demandai_app:dummy-db-password-42@db:5432/demandai',
  AZURE_OPENAI_API_KEY: 'short', APP_BASE_URL: 'https://not-a-secret.example' };

test('the values looked for: each secret set, the password inside a connection URL, nothing short or not secret', () => {
  assert.deepEqual(needles(ENV).map((n: { name: string }) => n.name), ['SESSION_SECRET', 'DATABASE_URL', 'DATABASE_URL (password)']);
});

test('a secret in any built file is found and named with its file; a clean build passes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  try {
    mkdirSync(join(dir, 'static', 'chunks'), { recursive: true });
    writeFileSync(join(dir, 'static', 'chunks', 'app.js'), 'console.log("hello")');
    assert.deepEqual(findSecrets([join(dir, 'static')], ENV).found, []);
    writeFileSync(join(dir, 'static', 'chunks', 'leak.js'), 'const p="dummy-db-password-42";');
    const r = findSecrets([join(dir, 'static')], ENV);
    assert.equal(r.checked, 2);
    assert.deepEqual(r.found.map((f: { name: string; file: string }) => [f.name, f.file.endsWith('leak.js')]), [['DATABASE_URL (password)', true]]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
