// Owner scoping inside a business unit (G-014, D-33) at the database level: a Sales rep's transaction sees only the
// accounts, contacts and other person-level rows whose owner_email is theirs or an alias; managers see all of the
// unit; rows without an owner are for managers only; whole-file issues are visible to everyone in the unit.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type pg from 'pg';
import { accounts, contacts, issues } from '../../lib/server/db/schema.ts';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics;
const list = { a: randomUUID(), b: randomUUID() };
const acc = { repA: randomUUID(), repA2: randomUUID(), alias: randomUUID(), none: randomUUID(), unitB: randomUUID() };
const con = { repA: randomUUID(), repA2: randomUUID(), alias: randomUUID(), none: randomUUID(), unitB: randomUUID() };

const rep = (emails: string[]): TenantContext => ({ userId: ids.repA, businessUnitId: ids.buA, scope: 'own', ownerEmails: emails });
const manager = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });

before(async () => {
  db = await freshDatabase('owner_scoping');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
  const q = (text: string, values: unknown[]) => owner.query(text, values);
  for (const [l, bu] of [[list.a, ids.buA], [list.b, ids.buB]]) {
    const up = randomUUID();
    await q(`INSERT INTO uploads (id, business_unit_id, kind, file_name, format, media_type, byte_size, sha256, created_by) VALUES ($1, $2, 'lead', 'f.csv', 'csv', 'text/csv', 1, 'x', $3)`, [up, bu, ids.adminA]);
    await q(`INSERT INTO lead_lists (id, business_unit_id, upload_id, name, source_file, sheet_name, engine_version, stats, checks, created_by, updated_by)
             VALUES ($1, $2, $3, 'L', 'f.csv', '(CSV)', 't', '{}', '[]', $4, $4)`, [l, bu, up, ids.adminA]);
  }
  const rows: [string, string, string, string, string | null][] = [
    [acc.repA, con.repA, ids.buA, list.a, 'rep.a@demandai.test'],
    [acc.repA2, con.repA2, ids.buA, list.a, 'rep.a2@demandai.test'],
    [acc.alias, con.alias, ids.buA, list.a, 'old.crm.name@client-sample.com'],
    [acc.none, con.none, ids.buA, list.a, null],
    [acc.unitB, con.unitB, ids.buB, list.b, 'rep.a@demandai.test'],
  ];
  let n = 0;
  for (const [a, c, bu, l, mail] of rows) {
    n++;
    await q(`INSERT INTO accounts (id, business_unit_id, list_id, seq, engine_id, name, owner_email, excluded, needs_review, search, data, created_by)
             VALUES ($1, $2, $3, $4, $5, 'Acme', $6, false, false, 'acme', '{}', $7)`, [a, bu, l, n, `acc-${n}`, mail, ids.adminA]);
    await q(`INSERT INTO contacts (id, business_unit_id, list_id, account_id, row_no, status_group, owner_email, search, data, created_by)
             VALUES ($1, $2, $3, $4, $5, 'in', $6, 'x', '{}', $7)`, [c, bu, l, a, n + 3, mail, ids.adminA]);
    await q(`INSERT INTO issues (business_unit_id, list_id, seq, row_no, attach_row_no, owner_email, check_key, severity, data, created_by)
             VALUES ($1, $2, $3, $4, $4, $5, 'required', 'flag', '{}', $6)`, [bu, l, n, n + 3, mail, ids.adminA]);
  }
  await q(`INSERT INTO issues (business_unit_id, list_id, seq, row_no, owner_email, check_key, severity, data, created_by)
           VALUES ($1, $2, 0, NULL, NULL, 'columns', 'info', '{}', $3)`, [ids.buA, list.a, ids.adminA]);
});
after(async () => { await db?.drop(); });

const contactIds = (ctx: TenantContext) => withTenant(app, ctx, async ({ tx }) => (await tx.select({ id: contacts.id }).from(contacts)).map(r => r.id).sort());
const accountIds = (ctx: TenantContext) => withTenant(app, ctx, async ({ tx }) => (await tx.select({ id: accounts.id }).from(accounts)).map(r => r.id).sort());

test('a rep sees only rows they own; a manager sees the whole unit and nothing of another unit', async () => {
  assert.deepEqual(await contactIds(rep(['rep.a@demandai.test'])), [con.repA]);
  assert.deepEqual(await accountIds(rep(['rep.a@demandai.test'])), [acc.repA]);
  assert.deepEqual(await contactIds(manager()), [con.repA, con.repA2, con.alias, con.none].sort());
});

test('an alias counts as the rep’s own; matching ignores case in the alias list', async () => {
  assert.deepEqual(await contactIds(rep(['rep.a@demandai.test', 'Old.CRM.Name@client-sample.com'])), [con.repA, con.alias].sort());
});

test('rows with no owner are for managers only; a rep with no emails sees nothing', async () => {
  assert.ok(!(await contactIds(rep(['rep.a@demandai.test']))).includes(con.none));
  assert.deepEqual(await contactIds(rep([])), []);
});

test('IDOR: asking for another rep’s contact or account by ID returns nothing', async () => {
  const got = await withTenant(app, rep(['rep.a@demandai.test']), ({ tx }) => tx.select().from(contacts).where(eq(contacts.id, con.repA2)));
  assert.deepEqual(got, []);
  const gotAcc = await withTenant(app, rep(['rep.a@demandai.test']), ({ tx }) => tx.select().from(accounts).where(eq(accounts.id, acc.repA2)));
  assert.deepEqual(gotAcc, []);
});

test('issues: a rep sees their rows’ issues and the whole-file ones, not other reps’ or unowned rows’', async () => {
  const seen = await withTenant(app, rep(['rep.a@demandai.test']), async ({ tx }) =>
    (await tx.select({ row: issues.rowNo, owner: issues.ownerEmail }).from(issues)).map(r => `${r.row}:${r.owner}`).sort());
  assert.deepEqual(seen, ['4:rep.a@demandai.test', 'null:null']);
});

test('a rep cannot write a row owned by someone else, or delete one they cannot see', async () => {
  await assert.rejects(withTenant(app, rep(['rep.a@demandai.test']), ({ tx }) => tx.insert(contacts).values({
    businessUnitId: ids.buA, listId: list.a, accountId: acc.repA2, rowNo: 99, statusGroup: 'in', ownerEmail: 'rep.a2@demandai.test', search: 'x', data: {}, createdBy: ids.repA,
  })), (e: { cause?: { code?: string } }) => e.cause?.code === '42501');
  const deleted = await withTenant(app, rep(['rep.a@demandai.test']), ({ tx }) => tx.delete(contacts).where(eq(contacts.id, con.repA2)).returning());
  assert.deepEqual(deleted, []);
  assert.equal((await owner.query('SELECT count(*)::int n FROM contacts WHERE id = $1', [con.repA2])).rows[0].n, 1);
});

test('every table with an owner_email column has row-level security that applies app_owns()', async () => {
  const { rows } = await owner.query(`
    SELECT c.table_name, bool_or(p.qual LIKE '%app_owns(owner_email)%') AS scoped
    FROM information_schema.columns c LEFT JOIN pg_policies p ON p.tablename = c.table_name AND p.schemaname = 'public'
    WHERE c.table_schema = 'public' AND c.column_name = 'owner_email' AND c.table_name <> 'user_owner_aliases'
    GROUP BY c.table_name ORDER BY 1`);
  assert.ok(rows.length >= 7, `owner-scoped tables: ${rows.map(r => r.table_name)}`);
  assert.deepEqual(rows.filter(r => !r.scoped).map(r => r.table_name), []);
});
