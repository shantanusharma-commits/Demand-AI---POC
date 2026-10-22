// /api/ready's logic against real databases: ready only when reachable and fully migrated.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readiness, health } from '../../lib/server/health.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';

let migrated: TestDatabase, empty: TestDatabase;
before(async () => {
  migrated = await freshDatabase('ready_ok');
  empty = await freshDatabase('ready_empty', { migrated: false });
});
after(async () => { await migrated?.drop(); await empty?.drop(); });

test('a migrated database is ready', async () => {
  assert.deepEqual(await readiness(migrated.pool('demandai_app')), { status: 'ready', checks: { database: 'ok', migrations: 'ok' } });
});

test('a reachable database without migrations is not ready: migrations pending', async () => {
  assert.deepEqual(await readiness(empty.pool('demandai_app')), { status: 'not-ready', checks: { database: 'ok', migrations: 'pending' } });
});

test('a database behind this build is not ready', async () => {
  const owner = migrated.pool('demandai_owner');
  await owner.query('DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations)');
  assert.deepEqual(await readiness(migrated.pool('demandai_app')), { status: 'not-ready', checks: { database: 'ok', migrations: 'pending' } });
});

test('an unreachable database is reported as down, quickly and without detail', async () => {
  const pool = new pg.Pool({ connectionString: 'postgresql://nobody:x@127.0.0.1:1/none', connectionTimeoutMillis: 500 });
  pool.on('error', () => {});
  const t0 = Date.now();
  const r = await readiness(pool, 1500);
  assert.deepEqual(r, { status: 'not-ready', checks: { database: 'down', migrations: 'unknown' } });
  assert.ok(Date.now() - t0 < 2000);
  await pool.end();
});

test('no database configured is reported as such', async () => {
  assert.deepEqual(await readiness(null), { status: 'not-ready', checks: { database: 'not-configured', migrations: 'unknown' } });
});

test('health reports the build version and uptime only', () => {
  const h = health('1.2.3');
  assert.deepEqual(Object.keys(h).sort(), ['status', 'uptimeSeconds', 'version']);
  assert.equal(h.version, '1.2.3');
});
