// Database-level security: row-level isolation between business units (D-32), append-only tables, the runtime
// role's privileges, and transaction-local identity that never leaks between pooled requests.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import type pg from 'pg';
import { auditLog, businessUnitMembers, configVersions, SYSTEM_USER_ID } from '../../lib/server/db/schema.ts';
import { createDb, withTenant, withUser, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { recordAudit } from '../../lib/server/db/audit.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';

// Tables shared by every unit; everything else must carry business_unit_id and row-level security.
const GLOBAL_TABLES = ['business_units', 'user_owner_aliases', 'user_role_history', 'users'];
const APPEND_ONLY = ['audit_log', 'user_role_history'];

let db: TestDatabase, owner: pg.Pool, appPool: pg.Pool, app: Db, ids: Basics;
const ctxA = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const ctxB = (): TenantContext => ({ userId: ids.repB, businessUnitId: ids.buB, scope: 'all', ownerEmails: [] });
const body = { rubric: 'v1' };

before(async () => {
  db = await freshDatabase('security');
  owner = db.pool('demandai_owner');
  appPool = db.pool('demandai_app');
  app = createDb(appPool);
  ids = await seedBasics(owner);
});
after(async () => { await db?.drop(); });

const pgCode = (code: string) => (err: unknown) => (err as { code?: string; cause?: { code?: string } }).code === code || (err as { cause?: { code?: string } }).cause?.code === code;

test('every table outside the global list carries business_unit_id and has row-level security enabled', async () => {
  const { rows } = await owner.query(`
    SELECT c.relname AS table, c.relrowsecurity AS rls,
           EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = 'public' AND k.table_name = c.relname AND k.column_name = 'business_unit_id') AS has_bu
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`);
  const offenders = rows.filter(r => !GLOBAL_TABLES.includes(r.table) && (!r.rls || !r.has_bu)).map(r => r.table);
  assert.deepEqual(offenders, []);
  assert.deepEqual(rows.filter(r => GLOBAL_TABLES.includes(r.table)).map(r => r.table).sort(), GLOBAL_TABLES);
});

test('the app role cannot change schema, and has no UPDATE, DELETE or TRUNCATE on append-only tables', async () => {
  const { rows } = await owner.query(`SELECT has_schema_privilege('demandai_app', 'public', 'CREATE') AS ddl`);
  assert.equal(rows[0].ddl, false);
  for (const t of APPEND_ONLY) {
    const p = (await owner.query(`SELECT has_table_privilege('demandai_app', $1, 'SELECT') s, has_table_privilege('demandai_app', $1, 'INSERT') i,
      has_table_privilege('demandai_app', $1, 'UPDATE') u, has_table_privilege('demandai_app', $1, 'DELETE') d, has_table_privilege('demandai_app', $1, 'TRUNCATE') t`, [t])).rows[0];
    assert.deepEqual(p, { s: true, i: true, u: false, d: false, t: false }, t);
  }
  const truncatable = (await owner.query(`SELECT table_name FROM information_schema.role_table_grants WHERE grantee = 'demandai_app' AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')`)).rows;
  assert.deepEqual(truncatable, []);
  const roles = (await owner.query(`SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname LIKE 'demandai_%' ORDER BY 1`)).rows;
  for (const r of roles) assert.deepEqual([r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb], [false, false, false, false], r.rolname);
});

test('append-only: the app role is refused UPDATE and DELETE; the owner is stopped by the trigger', async () => {
  await withTenant(app, ctxA(), s => recordAudit(s, { action: 'test.probe', details: { n: 1 } }));
  await assert.rejects(appPool.query(`UPDATE audit_log SET action = 'x'`), pgCode('42501'));
  await assert.rejects(appPool.query(`DELETE FROM audit_log`), pgCode('42501'));
  await assert.rejects(owner.query(`UPDATE audit_log SET action = 'x'`), /append-only: UPDATE is not allowed/);
  await assert.rejects(owner.query(`DELETE FROM audit_log`), /append-only: DELETE is not allowed/);
  await assert.rejects(owner.query(`TRUNCATE audit_log`), /append-only: TRUNCATE is not allowed/);
  // Even the app role setting the purge flag gets nowhere: it has no DELETE privilege, and the trigger wants the owner.
  await assert.rejects(appPool.query(`BEGIN; SELECT set_config('app.allow_purge', 'on', true); DELETE FROM audit_log; COMMIT;`), pgCode('42501'));
  await appPool.query('ROLLBACK').catch(() => {});
  // The purge path (owner with app.allow_purge) may delete; done in a rolled-back transaction.
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.allow_purge', 'on', true)`);
    const r = await c.query(`DELETE FROM audit_log WHERE action = 'test.probe'`);
    assert.equal(r.rowCount, 1);
    await c.query('ROLLBACK');
  } finally {
    c.release();
  }
  assert.equal((await owner.query(`SELECT count(*)::int n FROM audit_log WHERE action = 'test.probe'`)).rows[0].n, 1);
});

test('business units are isolated: rows of one unit are invisible and unwritable from another', async () => {
  await withTenant(app, ctxA(), ({ tx }) => tx.insert(configVersions).values({ businessUnitId: ids.buA, versionNo: 1, status: 'active', body, engineVersion: 't', createdBy: ids.adminA }));
  await withTenant(app, ctxB(), ({ tx }) => tx.insert(configVersions).values({ businessUnitId: ids.buB, versionNo: 1, status: 'active', body, engineVersion: 't', createdBy: ids.repB }));
  const inA = await withTenant(app, ctxA(), ({ tx }) => tx.select().from(configVersions));
  assert.deepEqual(inA.map(r => r.businessUnitId), [ids.buA]);
  // Asking for the other unit's row by ID returns nothing, not an error that confirms it exists.
  const otherId = (await owner.query('SELECT id FROM config_versions WHERE business_unit_id = $1', [ids.buB])).rows[0].id;
  assert.deepEqual(await withTenant(app, ctxA(), ({ tx }) => tx.select().from(configVersions).where(eq(configVersions.id, otherId))), []);
  // Updates and writes aimed at the other unit are refused or touch nothing.
  const upd = await withTenant(app, ctxA(), ({ tx }) => tx.update(configVersions).set({ status: 'retired' }).where(eq(configVersions.id, otherId)).returning());
  assert.deepEqual(upd, []);
  await assert.rejects(
    withTenant(app, ctxA(), ({ tx }) => tx.insert(configVersions).values({ businessUnitId: ids.buB, versionNo: 2, body, engineVersion: 't', createdBy: ids.adminA })),
    pgCode('42501'));
  // Moving a row into another unit is refused too.
  const ownId = inA[0].id;
  await assert.rejects(
    withTenant(app, ctxA(), ({ tx }) => tx.update(configVersions).set({ businessUnitId: ids.buB }).where(eq(configVersions.id, ownId))),
    pgCode('42501'));
});

test('without a tenant context the app role sees no unit data at all (fails closed)', async () => {
  assert.equal((await appPool.query('SELECT count(*)::int n FROM config_versions')).rows[0].n, 0);
  assert.equal((await appPool.query('SELECT count(*)::int n FROM audit_log')).rows[0].n, 0);
  assert.equal((await owner.query('SELECT count(*)::int n FROM config_versions')).rows[0].n, 2, 'the rows exist');
});

test('audit entries can only be written as the acting user, in the acting unit', async () => {
  await assert.rejects(withTenant(app, ctxA(), ({ tx }) => tx.insert(auditLog).values({ actorUserId: ids.repB, businessUnitId: ids.buA, action: 'spoof' })), pgCode('42501'));
  await assert.rejects(withTenant(app, ctxA(), ({ tx }) => tx.insert(auditLog).values({ actorUserId: ids.adminA, businessUnitId: ids.buB, action: 'spoof' })), pgCode('42501'));
  const seen = await withTenant(app, ctxB(), ({ tx }) => tx.select().from(auditLog));
  assert.equal(seen.length, 0, "unit B can't read unit A's audit entries");
});

test('memberships: a user sees all of their own; a unit sees only its members', async () => {
  const own = await withUser(app, { userId: ids.repA, platformAdmin: false }, ({ tx }) => tx.select().from(businessUnitMembers));
  assert.deepEqual(own.map(m => m.businessUnitId).sort(), [ids.buA, ids.buB].sort());
  const unitA = await withTenant(app, ctxA(), ({ tx }) => tx.select().from(businessUnitMembers).where(eq(businessUnitMembers.businessUnitId, ids.buB)));
  assert.deepEqual(unitA.filter(m => m.userId !== ids.adminA), [], 'unit A sees no unit-B membership except rows about its own caller');
  const all = await withUser(app, { userId: ids.platform, platformAdmin: true }, ({ tx }) => tx.select().from(businessUnitMembers));
  assert.equal(all.length, 5);
});

test('identity settings are transaction-local: the next request on the same connection starts clean', async () => {
  const single = createDb(db.pool('demandai_app'));
  const singlePool = (single as unknown as { $client: pg.Pool }).$client;
  singlePool.options.max = 1;
  await withTenant(single, ctxA(), async ({ tx }) => {
    const r = await tx.execute(sql`select current_setting('app.business_unit_id', true) as bu`);
    assert.equal(r.rows[0].bu, ids.buA);
  });
  const after = await singlePool.query(`select coalesce(current_setting('app.business_unit_id', true), '') as bu, coalesce(current_setting('app.user_id', true), '') as u`);
  assert.deepEqual(after.rows[0], { bu: '', u: '' });
  // A failed transaction rolls its settings back too.
  await assert.rejects(withTenant(single, ctxA(), async ({ tx }) => { await tx.execute(sql`select 1/0`); }));
  assert.equal((await singlePool.query(`select coalesce(current_setting('app.business_unit_id', true), '') as bu`)).rows[0].bu, '');
});

test('jobs: two workers never claim the same job; stale running jobs are re-queued, then failed', async () => {
  for (let i = 0; i < 4; i++) {
    await owner.query(`INSERT INTO jobs (business_unit_id, kind, created_by) VALUES ($1, 'probe', $2)`, [i % 2 ? ids.buA : ids.buB, SYSTEM_USER_ID]);
  }
  await owner.query(`INSERT INTO jobs (business_unit_id, kind, created_by, run_after) VALUES ($1, 'probe', $2, now() + interval '1 hour')`, [ids.buA, SYSTEM_USER_ID]);
  const claim = async (worker: string) => (await appPool.query('SELECT * FROM claim_job($1, $2)', [worker, ['probe']])).rows;
  const results = await Promise.all(['w1', 'w2', 'w3', 'w4', 'w5', 'w6'].map(claim));
  const claimed = results.flat().map(r => r.id);
  assert.equal(claimed.length, 4, 'four due jobs, the future one waits');
  assert.equal(new Set(claimed).size, 4, 'no job claimed twice');
  // A job left running by a dead worker goes back to the queue, and fails once attempts run out.
  await owner.query(`UPDATE jobs SET locked_at = now() - interval '1 hour' WHERE status = 'running'`);
  assert.equal((await appPool.query(`SELECT recover_stale_jobs(interval '10 minutes') n`)).rows[0].n, 4);
  assert.equal((await owner.query(`SELECT count(*)::int n FROM jobs WHERE status = 'queued'`)).rows[0].n, 5);
  await owner.query(`UPDATE jobs SET status = 'running', attempts = max_attempts, locked_at = now() - interval '1 hour' WHERE run_after <= now()`);
  await appPool.query(`SELECT recover_stale_jobs(interval '10 minutes')`);
  assert.equal((await owner.query(`SELECT count(*)::int n FROM jobs WHERE status = 'failed' AND error_code = 'abandoned'`)).rows[0].n, 4);
});
