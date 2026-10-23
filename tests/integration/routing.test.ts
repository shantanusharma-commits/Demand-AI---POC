// Lead routing and moving accounts between business units on the server against PostgreSQL (D-34, success area 4):
// managers keep the unit's rules (audited, in order); a scored run shows how its accounts route; an account the lead
// file gives no owner takes its rule's owner at hand-off; a manager of both units moves an account, which arrives in
// the other unit as a saved list of its own rows and is not handed off here again. Uses the full sample.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { serializeConfig } from '../../lib/engine/config.ts';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { createAppWorker } from '../../lib/server/jobs/handlers.ts';
import { getJob } from '../../lib/server/jobs/queue.ts';
import { receiveUpload, uploadLimits, type UploadLimits } from '../../lib/server/services/uploads.ts';
import { saveList, type Actor } from '../../lib/server/services/lists.ts';
import { startScoringRun } from '../../lib/server/services/scoring.ts';
import { createHandoff } from '../../lib/server/services/handoffs.ts';
import { deleteRule, getRules, moveRule, runRouting, saveRule, transferAccount, transfers, type RuleInput } from '../../lib/server/services/routing.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';
import { AS_OF, DATASET } from '../helpers/answer-key.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics;
const limits: UploadLimits = uploadLimits({ UPLOAD_MAX_BYTES: 25 * 1024 * 1024, UPLOAD_MAX_ROWS: 50_000, UPLOAD_TIME_LIMIT_MS: 120_000, UPLOAD_MAX_UNZIPPED_BYTES: 200 * 1024 * 1024 });
const sample = readFileSync(DATASET);
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const adminInB = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buB, scope: 'all', ownerEmails: [] });
const mgr = (): Actor => ({ userId: ids.adminA, role: 'Admin' });
const repActor = (): Actor => ({ userId: ids.repA, role: 'Sales rep' });
const as = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, ctx, fn);
const status = (code: number, re?: RegExp) => (e: HttpError) => e.status === code && (!re || re.test(e.message));
const one = async (q: string, p: unknown[] = []) => (await owner.query(q, p)).rows[0];
const drain = () => createAppWorker(app, limits).drain();
const rule = (p: Partial<RuleInput>): RuleInput => ({ name: 'Rule', countries: [], verticals: [], tiers: [], assignOwner: null, targetBusinessUnitId: null, active: true, ...p });

let runId = '';
before(async () => {
  db = await freshDatabase('routing');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
  // The admin of unit A is also a sales manager in unit B, so they can move accounts there.
  await owner.query(`INSERT INTO business_unit_members (business_unit_id, user_id, role, created_by, updated_by) VALUES ($1, $2, 'Sales manager', $2, $2)`, [ids.buB, ids.adminA]);
  for (const bu of [ids.buA, ids.buB]) {
    await owner.query(`INSERT INTO config_versions (business_unit_id, version_no, status, body, engine_version, created_by, activated_at, activated_by)
      VALUES ($1, 1, 'active', $2, 't', $3, now(), $3)`, [bu, JSON.stringify(serializeConfig()), ids.adminA]);
  }
  const up = await as(admin(), s => receiveUpload(s, { kind: 'lead', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: sample }, limits));
  await drain();
  const listId = (await as(admin(), s => getJob(s, up.jobId!)))!.progress.result!.listId;
  await as(admin(), s => saveList(s, mgr(), listId, { name: 'Full sample' }));
  const sig = await as(admin(), s => receiveUpload(s, { kind: 'signal', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: sample }, limits));
  runId = (await as(admin(), s => startScoringRun(s, mgr(), { listId, signalUploadId: sig.uploadId, asOf: AS_OF }))).runId;
  await drain();
});
after(async () => { await db?.drop(); });

test('D-34: managers keep the unit’s routing rules, in order, each change audited; a rep can’t change them', async () => {
  await assert.rejects(as(admin(), s => saveRule(s, repActor(), null, rule({ targetBusinessUnitId: ids.buB }))), status(403));
  await assert.rejects(as(admin(), s => saveRule(s, mgr(), null, rule({}))), status(400, /who owns|business unit/));
  await assert.rejects(as(admin(), s => saveRule(s, mgr(), null, rule({ targetBusinessUnitId: ids.buA }))), status(400, /another business unit/));
  await assert.rejects(as(admin(), s => saveRule(s, mgr(), null, rule({ assignOwner: 'stranger@demandai.test' }))), status(400, /sales reps/));
  await assert.rejects(as(admin(), s => saveRule(s, mgr(), null, rule({ verticals: ['Bakery'], targetBusinessUnitId: ids.buB }))), status(400, /not a vertical/));
  await as(admin(), s => saveRule(s, mgr(), null, rule({ name: 'Thailand to unit B', countries: ['Thailand'], targetBusinessUnitId: ids.buB })));
  const catchAll = await as(admin(), s => saveRule(s, mgr(), null, rule({ name: 'Unowned to rep A', assignOwner: 'REP.A@demandai.test' })));
  await as(admin(), s => moveRule(s, mgr(), catchAll.id, 'up'));
  let got = await as(admin(), s => getRules(s));
  assert.deepEqual(got.rules.map(r => [r.name, r.description, r.targetUnit, r.ownerName]),
    [['Unowned to rep A', 'every account', null, 'rep.a'], ['Thailand to unit B', 'in Thailand', 'Unit B', null]]);
  assert.deepEqual(got.options.units.map(u => u.name), ['Unit B'], 'another unit only');
  await as(admin(), s => moveRule(s, mgr(), catchAll.id, 'down'));
  got = await as(admin(), s => getRules(s));
  assert.deepEqual(got.rules.map(r => r.name), ['Thailand to unit B', 'Unowned to rep A']);
  const audit = await owner.query(`SELECT action FROM audit_log WHERE action LIKE 'routing.%' ORDER BY occurred_at`);
  assert.deepEqual(audit.rows.map(r => r.action), ['routing.rule_added', 'routing.rule_added', 'routing.rule_moved', 'routing.rule_moved']);
  // Unit B sees none of unit A's rules.
  assert.deepEqual((await as(adminInB(), s => getRules(s))).rules, []);
  const extra = await as(admin(), s => saveRule(s, mgr(), null, rule({ name: 'Temporary', targetBusinessUnitId: ids.buB, active: false })));
  await as(admin(), s => deleteRule(s, mgr(), extra.id));
  assert.equal((await as(admin(), s => getRules(s))).rules.length, 2);
});

test('D-34: a scored run shows how each account routes; Thai accounts belong to unit B', async () => {
  const r = await as(admin(), s => runRouting(s, runId));
  const scored = await one(`SELECT count(*)::int n FROM account_scores WHERE run_id = $1 AND tier IN ('A', 'B', 'C', 'Watch list')`, [runId]);
  assert.equal(r.rows.length, scored.n);
  const thai = r.rows.filter(x => x.country === 'Thailand');
  assert.ok(thai.length > 0 && thai.every(x => x.suggestedUnit?.name === 'Unit B' && x.rule?.name === 'Thailand to unit B'));
  assert.ok(r.rows.filter(x => x.country !== 'Thailand').every(x => x.suggestedUnit === null));
  assert.equal(r.toOtherUnits, thai.length);
  // A rep sees the routing of their own accounts only.
  const someOwner = r.rows.find(x => x.owner)!.owner!;
  const mine = await as({ userId: ids.repA, businessUnitId: ids.buA, scope: 'own', ownerEmails: [someOwner] }, s => runRouting(s, runId));
  assert.ok(mine.rows.length > 0 && mine.rows.every(x => x.owner === someOwner));
});

test('D-34: at hand-off, a prospect the lead file gives no owner takes the owner its rule names', async () => {
  const unowned = (await owner.query(`UPDATE prospect_scores SET owner_email = NULL WHERE run_id = $1 AND contact_id IN (
    SELECT p.contact_id FROM prospect_scores p JOIN accounts a ON a.id = p.account_id WHERE p.run_id = $1 AND p.tier IN ('A', 'B') AND p.sendable AND a.data->>'country' <> 'Thailand' LIMIT 3)
    RETURNING contact_id`, [runId])).rows.map(r => r.contact_id);
  assert.equal(unowned.length, 3);
  const h = await as(admin(), s => createHandoff(s, mgr(), { runId }));
  const items = await owner.query(`SELECT contact_id, owner_email FROM handoff_items WHERE handoff_id = $1 AND contact_id = ANY($2)`, [h.handoffId, unowned]);
  assert.deepEqual(items.rows.map(r => r.owner_email), ['rep.a@demandai.test', 'rep.a@demandai.test', 'rep.a@demandai.test']);
});

test('D-34: a manager of both units moves an account: it arrives in the other unit as a saved list of its own rows, and is not handed off here again', async () => {
  const r = await as(admin(), s => runRouting(s, runId));
  // A Thai account that a hand-off of this run includes (so "not handed off again" means something).
  const before = await as(admin(), s => createHandoff(s, mgr(), { runId }));
  const inHandoff = new Set((await owner.query(`SELECT account_id FROM handoff_items WHERE handoff_id = $1`, [before.handoffId])).rows.map(x => x.account_id));
  const thai = r.rows.find(x => x.country === 'Thailand' && inHandoff.has(x.accountId))!;
  assert.ok(thai, 'a Thai account in the hand-off');
  const contactsBefore = await one(`SELECT count(*)::int n FROM contacts WHERE account_id = $1`, [thai.accountId]);
  await assert.rejects(as(admin(), s => transferAccount(s, repActor(), thai.accountId, { toBusinessUnitId: ids.buB, reason: 'Thai accounts are unit B’s' }, limits)), status(403));
  await assert.rejects(as(admin(), s => transferAccount(s, mgr(), thai.accountId, { toBusinessUnitId: ids.buA, reason: 'Same unit' }, limits)), status(400));
  // Not a manager in the other unit: refused before anything is written.
  await owner.query(`UPDATE business_unit_members SET role = 'Sales rep' WHERE business_unit_id = $1 AND user_id = $2`, [ids.buB, ids.adminA]);
  await assert.rejects(as(admin(), s => transferAccount(s, mgr(), thai.accountId, { toBusinessUnitId: ids.buB, reason: 'Thai accounts are unit B’s' }, limits)), status(403, /not one in Unit B/));
  await owner.query(`UPDATE business_unit_members SET role = 'Sales manager' WHERE business_unit_id = $1 AND user_id = $2`, [ids.buB, ids.adminA]);
  assert.equal((await one(`SELECT count(*)::int n FROM account_transfers`)).n, 0);
  const moved = await as(admin(), s => transferAccount(s, mgr(), thai.accountId, { toBusinessUnitId: ids.buB, reason: 'Thai accounts are unit B’s' }, limits));
  assert.deepEqual([moved.toUnit, moved.rows], ['Unit B', contactsBefore.n]);
  await assert.rejects(as(admin(), s => transferAccount(s, mgr(), thai.accountId, { toBusinessUnitId: ids.buB, reason: 'Again' }, limits)), status(409, /was moved to Unit B/));
  // Unit B: the job built a saved list named after the account, with the same people.
  await drain();
  const job = (await as(adminInB(), s => getJob(s, moved.jobId!)))!;
  assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
  const list = await one(`SELECT l.name, l.status, l.business_unit_id, (SELECT count(*)::int FROM contacts c WHERE c.list_id = l.id) n FROM lead_lists l WHERE l.id = $1`, [job.progress.result!.listId]);
  assert.deepEqual([list.name, list.status, list.business_unit_id, list.n], [`${thai.name} · from Unit A`, 'saved', ids.buB, contactsBefore.n]);
  const names = await owner.query(`SELECT DISTINCT data->>'company' company FROM contacts WHERE list_id = $1`, [job.progress.result!.listId]);
  assert.ok(names.rows.length >= 1);
  // Both units see the move; unit A no longer hands the account off, and the routing view says where it went.
  assert.deepEqual((await as(adminInB(), s => transfers(s))).in.map(t => [t.accountName, t.fromUnit, t.reason]), [[thai.name, 'Unit A', 'Thai accounts are unit B’s']]);
  assert.equal((await as(admin(), s => transfers(s))).out.length, 1);
  const h = await as(admin(), s => createHandoff(s, mgr(), { runId }));
  const again = await one(`SELECT count(*)::int n FROM handoff_items WHERE handoff_id = $1 AND account_id = $2`, [h.handoffId, thai.accountId]);
  assert.equal(again.n, 0);
  assert.equal((await as(admin(), s => runRouting(s, runId))).rows.find(x => x.accountId === thai.accountId)!.transferred!.to, 'Unit B');
  const audit = await owner.query(`SELECT action, business_unit_id FROM audit_log WHERE action LIKE 'account.transferred%' ORDER BY action`);
  assert.deepEqual(audit.rows.map(x => [x.action, x.business_unit_id]), [['account.transferred_in', ids.buB], ['account.transferred_out', ids.buA]]);
  await assert.rejects(owner.query(`DELETE FROM account_transfers`), /append-only/);
  // A third unit sees nothing of it.
  const buC = (await owner.query(`INSERT INTO business_units (code, name, created_by, updated_by) VALUES ('unit-c', 'Unit C', $1, $1) RETURNING id`, [ids.adminA])).rows[0].id;
  const c = await as({ userId: ids.adminA, businessUnitId: buC, scope: 'all', ownerEmails: [] }, s => transfers(s));
  assert.deepEqual([c.in.length, c.out.length], [0, 0]);
});
