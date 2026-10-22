// Migrations apply from empty, are idempotent, and refuse an applied file that was edited later.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../../scripts/db/migrate.mjs';
import { freshDatabase, MIGRATIONS_DIR, quiet, type TestDatabase } from './harness.ts';

let db: TestDatabase;
before(async () => { db = await freshDatabase('migrations', { migrated: false }); });
after(async () => { await db?.drop(); });

const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'));

test('every migration applies from an empty database, then a second run applies nothing', async () => {
  const first = await migrate({ url: db.url('demandai_owner'), dir: MIGRATIONS_DIR, ssl: false, log: quiet });
  assert.equal(first.applied.length, journal.entries.length);
  const second = await migrate({ url: db.url('demandai_owner'), dir: MIGRATIONS_DIR, ssl: false, log: quiet });
  assert.deepEqual(second.applied, []);
  const { rows } = await db.pool('demandai_app').query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
  assert.equal(rows[0].n, journal.entries.length, 'the app role can read the journal for /api/ready');
});

test('an applied migration that was edited afterwards is refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dai-mig-'));
  cpSync(MIGRATIONS_DIR, dir, { recursive: true });
  const first = journal.entries[0].tag;
  writeFileSync(join(dir, `${first}.sql`), readFileSync(join(dir, `${first}.sql`), 'utf8') + '\n-- edited\n');
  await assert.rejects(migrate({ url: db.url('demandai_owner'), dir, ssl: false, log: quiet }), /was changed after it was applied/);
});

test('a failing migration rolls back and is not recorded', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dai-mig-'));
  cpSync(MIGRATIONS_DIR, dir, { recursive: true });
  const j = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8'));
  j.entries.push({ idx: j.entries.length, version: '7', when: Date.now(), tag: '9999_broken', breakpoints: true });
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify(j));
  writeFileSync(join(dir, '9999_broken.sql'), 'CREATE TABLE broken_probe (id int);\n--> statement-breakpoint\nSELECT no_such_function();');
  await assert.rejects(migrate({ url: db.url('demandai_owner'), dir, ssl: false, log: quiet }), /9999_broken failed/);
  const owner = db.pool('demandai_owner');
  assert.equal((await owner.query("SELECT to_regclass('public.broken_probe') AS t")).rows[0].t, null, 'partial work rolled back');
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n, journal.entries.length);
});
