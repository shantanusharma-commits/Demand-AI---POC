// The development seed, and the real db/backup.sh: a dump restores into a scratch database with the same rows,
// policies and triggers; a failed dump leaves nothing behind; retention keeps the newest N.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { seed, SEED } from '../../scripts/db/seed.ts';
import { configVersions } from '../../lib/server/db/schema.ts';
import { createDb, withTenant } from '../../lib/server/db/tenant.ts';
import { ADMIN_URL, bootstrap, freshDatabase, REPO, type TestDatabase } from './harness.ts';

let db: TestDatabase, scratch: TestDatabase;
before(async () => {
  db = await freshDatabase('seed_backup');
  scratch = await freshDatabase('restored', { migrated: false });
});
after(async () => { await db?.drop(); await scratch?.drop(); });

const admin = new URL(ADMIN_URL);
const backupEnv = (database: string, dir: string, extra: Record<string, string> = {}) => ({
  ...process.env, PGHOST: admin.hostname, PGPORT: admin.port, POSTGRES_USER: decodeURIComponent(admin.username),
  POSTGRES_PASSWORD: decodeURIComponent(admin.password), POSTGRES_DB: database, BACKUP_DIR: dir, BACKUP_RETAIN: '2', ...extra,
});

test('the seed is idempotent and gives each unit its own active config v1', async () => {
  const owner = new pg.Client({ connectionString: db.url('demandai_owner') });
  await owner.connect();
  await seed(owner);
  await seed(owner);
  const counts = (await owner.query(`SELECT (SELECT count(*) FROM business_units)::int bu, (SELECT count(*) FROM users WHERE kind = 'person')::int users,
    (SELECT count(*) FROM business_unit_members)::int members, (SELECT count(*) FROM config_versions WHERE status = 'active')::int active`)).rows[0];
  await owner.end();
  assert.deepEqual(counts, { bu: 2, users: SEED.users.length, members: 6, active: 2 });
  const app = createDb(db.pool('demandai_app'));
  const [unit] = SEED.units;
  const admin = SEED.users.find(u => u.email === 'admin@demandai.test')!;
  const rows = await withTenant(app, { userId: admin.id, businessUnitId: unit.id, scope: 'all', ownerEmails: [] }, ({ tx }) => tx.select().from(configVersions));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].businessUnitId, unit.id);
  const body = rows[0].body as { pilotCountries: string[]; personas: { primary: { regex: string }[] } };
  assert.equal(body.pilotCountries.length, 6);
  assert.equal(typeof body.personas.primary[0].regex, 'string', 'regular expressions are stored as JSON');
});

test('a backup restores into an empty database with identical rows, policies, triggers and functions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dai-backup-'));
  const out = execFileSync('sh', [join(REPO, 'db', 'backup.sh')], { env: backupEnv(db.name, dir), encoding: 'utf8' });
  assert.match(out, /"event":"backup.done"/);
  const dumps = readdirSync(dir).filter(f => f.endsWith('.dump'));
  assert.equal(dumps.length, 1);
  bootstrap(scratch.name);
  execFileSync('pg_restore', ['--exit-on-error', '--dbname', scratch.name, join(dir, dumps[0])], {
    env: { ...process.env, PGHOST: admin.hostname, PGPORT: admin.port, PGUSER: decodeURIComponent(admin.username), PGPASSWORD: decodeURIComponent(admin.password) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const census = async (database: string) => {
    const c = new pg.Client({ connectionString: (() => { const u = new URL(ADMIN_URL); u.pathname = `/${database}`; return u.toString(); })() });
    await c.connect();
    try {
      const tables = (await c.query(`SELECT schemaname || '.' || relname AS t FROM pg_stat_user_tables ORDER BY 1`)).rows.map(r => r.t);
      const counts: Record<string, number> = {};
      for (const t of tables) counts[t] = (await c.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n;
      const policies = (await c.query(`SELECT count(*)::int n FROM pg_policies`)).rows[0].n;
      const triggers = (await c.query(`SELECT count(*)::int n FROM pg_trigger WHERE NOT tgisinternal`)).rows[0].n;
      const functions = (await c.query(`SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`)).rows[0].n;
      const rls = (await c.query(`SELECT count(*)::int n FROM pg_class WHERE relrowsecurity`)).rows[0].n;
      return { counts, policies, triggers, functions, rls };
    } finally {
      await c.end();
    }
  };
  const [source, restored] = await Promise.all([census(db.name), census(scratch.name)]);
  assert.ok(source.counts['public.users'] > 1 && source.counts['public.config_versions'] === 2, 'the source holds seeded rows');
  assert.deepEqual(restored, source);
  // The restored database still enforces isolation for the app role.
  const app = new pg.Client({ connectionString: scratch.url('demandai_app') });
  await app.connect();
  assert.equal((await app.query('SELECT count(*)::int n FROM config_versions')).rows[0].n, 0);
  await app.end();
});

test('a failed backup exits non-zero and leaves no file; retention keeps the newest two', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dai-backup-'));
  const bad = spawnSync('sh', [join(REPO, 'db', 'backup.sh')], { env: backupEnv(db.name, dir, { POSTGRES_PASSWORD: 'wrong-password' }), encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /"event":"backup.failed"/);
  assert.deepEqual(readdirSync(dir), []);
  for (let i = 0; i < 3; i++) {
    execFileSync('sh', [join(REPO, 'db', 'backup.sh')], { env: backupEnv(db.name, dir), stdio: 'ignore' });
    execFileSync('sleep', ['1.1']); // file names carry the second
  }
  assert.equal(readdirSync(dir).filter(f => f.endsWith('.dump')).length, 2);
  assert.equal(readdirSync(dir).filter(f => f.endsWith('.partial')).length, 0);
});
