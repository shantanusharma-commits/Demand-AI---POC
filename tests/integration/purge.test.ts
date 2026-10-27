// The end-of-pilot data lifecycle against PostgreSQL (D-20; plan §7, §8 Operations, §9 item 3; remediation prompt §6
// Phase 7, §8 item 6). The full sample is taken through the whole flow (upload, correction, scoring, hand-off, micro-
// segments, a decision, the weekly spot-check), then: the append-only tables open to the purge alone; only the ops
// role runs the purge, the retention report and the export; a dry run counts and changes nothing; the export returns
// the files as received and the rows made from them; a purge by date, by unit when its readout is past the retention
// period, and by upload each remove exactly their data and record it in the audit log. The CLI scripts run as they
// would in production (scripts/data/purge.mjs, export.mjs), as child processes.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type pg from 'pg';
import { sql } from 'drizzle-orm';
import * as E from '../../lib/demandai-engine.ts';
import { serializeConfig } from '../../lib/engine/config.ts';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { createAppWorker } from '../../lib/server/jobs/handlers.ts';
import { getJob } from '../../lib/server/jobs/queue.ts';
import { receiveUpload, uploadLimits, type UploadLimits } from '../../lib/server/services/uploads.ts';
import { saveList, type Actor } from '../../lib/server/services/lists.ts';
import { addCorrections } from '../../lib/server/services/corrections.ts';
import { saveRun, startScoringRun } from '../../lib/server/services/scoring.ts';
import { createHandoff } from '../../lib/server/services/handoffs.ts';
import { buildNbaRun } from '../../lib/server/services/nba.ts';
import { openItem } from '../../lib/server/services/recommendations.ts';
import { acceptItem, reviewQueue } from '../../lib/server/services/review.ts';
import { SYSTEM_USER_ID } from '../../lib/server/db/schema.ts';
import { purge } from '../../scripts/data/purge.mjs';
import { exportData } from '../../scripts/data/export.mjs';
import { freshDatabase, REPO, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';
import { AS_OF, DATASET } from '../helpers/answer-key.ts';

const run = promisify(execFile);
let db: TestDatabase, owner: pg.Pool, appPool: pg.Pool, ops: pg.Pool, app: Db, ids: Basics;
const limits: UploadLimits = uploadLimits({ UPLOAD_MAX_BYTES: 25 * 1024 * 1024, UPLOAD_MAX_ROWS: 50_000, UPLOAD_TIME_LIMIT_MS: 120_000, UPLOAD_MAX_UNZIPPED_BYTES: 200 * 1024 * 1024 });
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const mgr = (): Actor => ({ userId: ids.adminA, role: 'Admin' });
const repB = (): TenantContext => ({ userId: ids.repB, businessUnitId: ids.buB, scope: 'own', ownerEmails: ['rep.b@demandai.test'] });
const as = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, ctx, fn);
const n = async (q: string, p: unknown[] = []) => Number((await owner.query(q, p)).rows[0].n);
const pgCode = (code: string) => (err: unknown) => (err as { code?: string }).code === code;
const drain = () => createAppWorker(app, limits).drain();
const DAY = 86_400_000;
const CUTOFF = new Date(Date.now() - 30 * DAY).toISOString();
const cli = (script: string, args: string[]) => run(process.execPath, [join(REPO, 'scripts', 'data', script), ...args],
  { env: { PATH: process.env.PATH, DATABASE_OPS_URL: db.url('demandai_ops'), DATABASE_SSL_MODE: 'disable' }, maxBuffer: 64 * 1024 * 1024 });

// The old pilot data (back-dated 45 days), a recent upload in unit A, and one in unit B.
let leadUpload = '', signalUpload = '', recentUpload = '', unitBUpload = '', nbaRunId = '';
const BASE = { job_title: 'Instrumentation Manager', email_verified: 'Y', country: 'Singapore', industry: 'Refining', annual_revenue_usd: '2000000000', employee_count: '3000',
  account_type: 'Owner-operator', existing_customer: 'N', managed_separately: 'N', consent_basis: 'Legitimate interest', opt_out: 'N', owner_email: 'rep.b@demandai.test' } as Record<string, string>;
const smallFile = (company: string) => Buffer.from(E.toCSV([E.LEAD_COLUMNS, ...[['Ann', 'Lee'], ['Bo', 'Tan']].map(([f, l]) =>
  E.LEAD_COLUMNS.map(h => ({ ...BASE, first_name: f, last_name: l, email: `${f.toLowerCase()}@${company}.example`, company_name: company, company_domain: `${company}.example` } as Record<string, string>)[h] ?? ''))]));

async function upload(ctx: TenantContext, kind: 'lead' | 'signal', fileName: string, bytes: Buffer, mediaType: string) {
  const r = await as(ctx, s => receiveUpload(s, { kind, fileName, mediaType, bytes }, limits));
  await drain();
  return { uploadId: r.uploadId, listId: r.jobId ? (await as(ctx, s => getJob(s, r.jobId!)))!.progress.result?.listId ?? '' : '' };
}
async function correctFirstRow(ctx: TenantContext, listId: string) {
  const row = await n(`SELECT min(row_no) n FROM contacts WHERE list_id = $1`, [listId]);
  await as(ctx, s => addCorrections(s, mgr(), listId, { row, changes: { job_title: 'Plant Manager' }, reason: 'Other', source: '', note: '' }));
  await drain();
}

before(async () => {
  db = await freshDatabase('purge');
  owner = db.pool('demandai_owner');
  appPool = db.pool('demandai_app');
  ops = db.pool('demandai_ops');
  app = createDb(appPool);
  ids = await seedBasics(owner);
  for (const bu of [ids.buA, ids.buB]) {
    await owner.query(`INSERT INTO config_versions (business_unit_id, version_no, status, body, engine_version, created_by, activated_at, activated_by)
      VALUES ($1, 1, 'active', $2, 't', $3, now(), $3)`, [bu, JSON.stringify(serializeConfig()), ids.adminA]);
  }
  const sample = readFileSync(DATASET);
  const lead = await upload(admin(), 'lead', 'Lead_Research_Sample_Dataset.xlsx', sample, XLSX_TYPE);
  leadUpload = lead.uploadId;
  await as(admin(), s => saveList(s, mgr(), lead.listId, { name: 'Full sample' }));
  await correctFirstRow(admin(), lead.listId);
  signalUpload = (await as(admin(), s => receiveUpload(s, { kind: 'signal', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: sample }, limits))).uploadId;
  const listId = (await owner.query(`SELECT id FROM lead_lists WHERE upload_id = $1 AND status <> 'replaced'`, [leadUpload])).rows[0].id;
  const started = await as(admin(), s => startScoringRun(s, mgr(), { listId, signalUploadId: signalUpload, asOf: AS_OF }));
  await drain();
  await as(admin(), s => saveRun(s, mgr(), started.runId, 'Sample scored'));
  const handoffId = (await as(admin(), s => createHandoff(s, mgr(), { runId: started.runId }))).handoffId;
  nbaRunId = (await as(admin(), s => buildNbaRun(s, mgr(), { handoffId }))).runId;
  await as(admin(), s => reviewQueue(s, mgr())); // draws the week's spot-checks
  const item = (await owner.query(`SELECT id FROM recommendations WHERE nba_run_id = $1 AND status = 'Waiting' ORDER BY position LIMIT 1`, [nbaRunId])).rows[0].id;
  await as(admin(), s => openItem(s, mgr(), item));
  await as(admin(), s => acceptItem(s, mgr(), item, { tags: [] }));
  // Records that point at the data without a foreign key: an Autopilot run and an account transfer.
  await owner.query(`INSERT INTO autopilot_runs (business_unit_id, kind, instruction, items, skipped, created_by) VALUES ($1, 'spot', 'rate them', $2, '[]', $3)`,
    [ids.buA, JSON.stringify([{ id: item, before: {} }]), ids.adminA]);
  await owner.query(`INSERT INTO account_transfers (business_unit_id, to_business_unit_id, account_key, account_name, from_list_id, from_account_id, rows, reason, created_by)
    SELECT $1, $2, 'k', a.name, a.list_id, a.id, 1, 'test', $3 FROM accounts a WHERE a.list_id = $4 LIMIT 1`, [ids.buA, ids.buB, ids.adminA, listId]);
  // Copilot's saved chats: one about the old list, one about the queue last used 45 days ago, and one used today.
  const chat = async (list: string | null, daysAgo: number) => {
    const id = (await owner.query(`INSERT INTO copilot_chats (business_unit_id, screen, ref_key, ref, list_id, title, created_by, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'A chat', $6, now() - make_interval(days => $7)) RETURNING id`,
    [ids.buA, list ? 'prospecting' : 'today', list ? `list:${list}` : 'queue:today', JSON.stringify(list ? { listId: list } : {}), list, ids.adminA, daysAgo])).rows[0].id;
    await owner.query(`INSERT INTO copilot_messages (business_unit_id, chat_id, role, text, created_by) VALUES ($1, $2, 'you', 'What is wrong with this file?', $3)`, [ids.buA, id, ids.adminA]);
  };
  await chat(lead.listId, 0);
  await chat(null, 45);
  await chat(null, 0);
  await owner.query(`UPDATE uploads SET created_at = now() - interval '45 days' WHERE id = ANY($1)`, [[leadUpload, signalUpload]]);
  const recent = await upload(admin(), 'lead', 'recent.csv', smallFile('recent-co'), 'text/csv');
  recentUpload = recent.uploadId;
  await correctFirstRow(admin(), recent.listId);
  unitBUpload = (await upload(repB(), 'lead', 'unit-b.csv', smallFile('unit-b-co'), 'text/csv')).uploadId;
});
after(async () => { await db?.drop(); });

/** Row counts of every table that holds pilot data, to show what a step changed. */
async function snapshot(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of ['uploads', 'upload_files', 'lead_lists', 'accounts', 'contacts', 'issues', 'corrections', 'scoring_runs', 'signals', 'account_scores', 'prospect_scores',
    'handoffs', 'handoff_items', 'nba_runs', 'recommendations', 'drafts', 'decision_log', 'segment_pauses', 'spot_checks', 'autopilot_runs', 'account_transfers', 'jobs', 'audit_log',
    'copilot_chats', 'copilot_messages']) {
    out[t] = await n(`SELECT count(*)::int n FROM ${t}`);
  }
  return out;
}

test('the purge setting opens nothing by itself: not for the app role through a cascade, nor for the owner', async () => {
  const kept = await n(`SELECT count(*)::int n FROM corrections WHERE upload_id = $1`, [recentUpload]);
  assert.ok(kept > 0);
  // The app role may delete uploads (it does when a list's last version goes). With the purge setting on, the cascade
  // into corrections, which are append-only, must still be refused.
  await assert.rejects(as(admin(), async ({ tx }) => {
    await tx.execute(sql`select set_config('app.allow_purge', 'on', true)`);
    await tx.execute(sql`delete from uploads where id = ${recentUpload}`);
    throw new Error('the upload and its corrections were deleted');
  }), (e: Error & { cause?: Error }) => /corrections is append-only: DELETE is not allowed/.test(`${e.message} ${e.cause?.message}`));
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.allow_purge', 'on', true)`);
    await assert.rejects(c.query(`DELETE FROM decision_log`), /decision_log is append-only: DELETE is not allowed/);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
  assert.equal(await n(`SELECT count(*)::int n FROM corrections WHERE upload_id = $1`, [recentUpload]), kept);
});

test('only the ops role runs the purge, the retention report and the export; it reads no table itself', async () => {
  for (const q of [`SELECT * FROM purge_pilot_data(p_before => now())`, `SELECT * FROM pilot_retention()`, `SELECT * FROM export_pilot_files(p_before => now())`,
    `SELECT * FROM export_pilot_rows('contacts', p_before => now())`, `SELECT * FROM pilot_scope(NULL, now(), NULL)`]) {
    await assert.rejects(appPool.query(q), pgCode('42501'), `app: ${q}`);
  }
  await assert.rejects(ops.query(`SELECT * FROM pilot_scope(NULL, now(), NULL)`), pgCode('42501'), 'the scope helper is internal');
  for (const q of [`SELECT count(*) FROM contacts`, `SELECT count(*) FROM audit_log`, `DELETE FROM decision_log`, `UPDATE uploads SET kind = kind`]) {
    await assert.rejects(ops.query(q), pgCode('42501'), `ops: ${q}`);
  }
  await assert.rejects(ops.query(`SELECT * FROM purge_pilot_data()`), /Name one upload or a date, not both/);
  await assert.rejects(ops.query(`SELECT * FROM purge_pilot_data(p_upload => gen_random_uuid(), p_before => now())`), /Name one upload or a date, not both/);
  await assert.rejects(ops.query(`SELECT * FROM purge_pilot_data(p_before => now(), p_unit_code => 'nope')`), /No business unit has the code nope/);
  await assert.rejects(ops.query(`SELECT * FROM export_pilot_rows('users', p_before => now())`), /Not a table the export returns: users/);
});

test('a dry run counts what a date purge would remove, table by table, and removes nothing', async () => {
  const before = await snapshot();
  const r = await purge(ops, { before: CUTOFF, unit: 'unit-a' });
  assert.deepEqual(await snapshot(), before, 'nothing changed');
  const lists = (await owner.query(`SELECT array_agg(id) a FROM lead_lists WHERE upload_id = $1`, [leadUpload])).rows[0].a;
  const recs = (await owner.query(`SELECT array_agg(id) a FROM recommendations WHERE nba_run_id = $1`, [nbaRunId])).rows[0].a;
  assert.equal(r.uploads, 2);
  assert.equal(r.lead_lists, lists.length);
  assert.ok(lists.length >= 2, 'the corrected list has two versions');
  assert.equal(r.contacts, await n(`SELECT count(*)::int n FROM contacts WHERE list_id = ANY($1)`, [lists]));
  assert.equal(r.recommendations, recs.length);
  assert.equal(r.drafts, await n(`SELECT count(*)::int n FROM drafts WHERE recommendation_id = ANY($1)`, [recs]));
  assert.equal(r.decision_log, await n(`SELECT count(*)::int n FROM decision_log WHERE nba_run_id = $1`, [nbaRunId]));
  assert.equal(r.corrections, await n(`SELECT count(*)::int n FROM corrections WHERE upload_id = $1`, [leadUpload]));
  assert.equal(r.spot_checks, await n(`SELECT count(*)::int n FROM spot_checks WHERE picked && $1::uuid[]`, [recs]));
  for (const k of ['upload_files', 'accounts', 'issues', 'corrections', 'scoring_runs', 'signals', 'account_scores', 'prospect_scores', 'handoffs', 'handoff_items', 'nba_runs',
    'decision_log', 'spot_checks', 'autopilot_runs', 'account_transfers', 'jobs']) assert.ok(r[k] > 0, `${k}: ${r[k]}`);
  assert.equal(r.ai_verticals, 0);
  assert.equal(r.copilot_chats, 2, "Copilot's chat about the old list, and the queue chat last used before the date");
});

test('the export returns the files as received and the rows made from them, per unit, records it, and never a password hash', async () => {
  const out = mkdtempSync(join(tmpdir(), 'demandai-export-'));
  try {
    const m = await exportData(ops, { out, unit: 'unit-a', before: CUTOFF });
    assert.deepEqual(Object.keys(m.units), ['unit-a']);
    const u = m.units['unit-a'];
    assert.equal(u.files.length, 2);
    for (const f of u.files) {
      assert.equal(f.matchesUpload, true, f.name);
      assert.equal(createHash('sha256').update(readFileSync(join(out, 'unit-a', 'files', f.name))).digest('hex'), f.sha256);
    }
    const sample = createHash('sha256').update(readFileSync(DATASET)).digest('hex');
    assert.ok(u.files.every(f => f.sha256 === sample), 'the sample file, byte for byte');
    const lines = (t: string) => readFileSync(join(out, 'unit-a', `${t}.jsonl`), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.equal(lines('contacts').length, await n(`SELECT count(*)::int n FROM contacts c JOIN lead_lists l ON l.id = c.list_id WHERE l.upload_id = $1`, [leadUpload]));
    assert.equal(u.tables.recommendations, await n(`SELECT count(*)::int n FROM recommendations WHERE nba_run_id = $1`, [nbaRunId]));
    assert.ok(u.tables.decision_log > 0 && u.tables.corrections > 0 && u.tables.uploads === 2);
    assert.ok(lines('uploads').every(x => !('bytes' in x)), 'the file contents are only in files/');
    const people = lines('people');
    assert.ok(people.some(p => p.email === 'admin.a@demandai.test'));
    assert.ok(people.every(p => Object.keys(p).sort().join() === 'display_name,email,id,role,status'), 'members: no password hash, nothing else');
    assert.ok(!readFileSync(join(out, 'manifest.json'), 'utf8').includes('demandai_ops'), 'no connection details');
    const audit = (await owner.query(`SELECT actor_user_id, actor_role, details FROM audit_log WHERE action = 'data.exported' AND business_unit_id = $1`, [ids.buA])).rows;
    assert.equal(audit.length, 1);
    assert.deepEqual([audit[0].actor_user_id, audit[0].actor_role, audit[0].details.files, audit[0].details.unit], [SYSTEM_USER_ID, 'ops', 2, 'unit-a']);
    await assert.rejects(exportData(ops, { out, unit: 'unit-a', before: CUTOFF }), /--out must be a new or empty folder/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  // The command line, as operations would run it: a recent upload, unit B's, by its ID.
  const out2 = mkdtempSync(join(tmpdir(), 'demandai-export-'));
  try {
    const { stdout } = await cli('export.mjs', ['--out', out2, '--upload', unitBUpload, '--json']);
    const m = JSON.parse(stdout);
    assert.deepEqual([Object.keys(m.units), m.units['unit-b'].files.length, m.units['unit-b'].tables.contacts], [['unit-b'], 1, 2]);
    assert.equal(m.units['unit-b'].tables.people, undefined, 'members and readouts come with a date export only');
  } finally {
    rmSync(out2, { recursive: true, force: true });
  }
});

test('a date purge removes the old uploads and everything made from them, in one go, and nothing else; it is audited', async () => {
  const dry = await purge(ops, { before: CUTOFF, unit: 'unit-a' });
  const before = await snapshot();
  const lists = (await owner.query(`SELECT array_agg(id) a FROM lead_lists WHERE upload_id = $1`, [leadUpload])).rows[0].a;
  const { stdout, stderr } = await cli('purge.mjs', ['--before', CUTOFF, '--unit', 'unit-a', '--yes', '--json']);
  assert.equal(stderr, '');
  const r = JSON.parse(stdout);
  assert.deepEqual([r.mode, r.removed], ['purged', dry], 'the real run removes what the dry run counted');
  const after = await snapshot();
  for (const t of Object.keys(dry)) if (t in after && t !== 'jobs') assert.equal(before[t] - after[t], dry[t], t);
  // Nothing of the old data is left, in any table.
  assert.equal(await n(`SELECT count(*)::int n FROM uploads WHERE id = ANY($1)`, [[leadUpload, signalUpload]]), 0);
  assert.equal(await n(`SELECT count(*)::int n FROM contacts WHERE list_id = ANY($1)`, [lists]), 0);
  assert.equal(await n(`SELECT count(*)::int n FROM corrections WHERE upload_id = $1`, [leadUpload]), 0);
  assert.equal(await n(`SELECT count(*)::int n FROM recommendations WHERE nba_run_id = $1`, [nbaRunId]), 0);
  for (const t of ['nba_runs', 'handoffs', 'scoring_runs', 'decision_log', 'drafts', 'spot_checks', 'autopilot_runs', 'account_transfers', 'signals', 'prospect_scores']) {
    assert.equal(await n(`SELECT count(*)::int n FROM ${t}`), 0, t);
  }
  assert.equal(await n(`SELECT count(*)::int n FROM jobs WHERE payload->>'uploadId' = ANY($1)`, [[leadUpload, signalUpload]]), 0);
  assert.deepEqual([after.copilot_chats, after.copilot_messages], [1, 1], "the chat used today stays; the others' messages went with them");
  // The rest stays: the recent upload with its corrections, unit B, the configuration and the audit trail.
  assert.equal(await n(`SELECT count(*)::int n FROM uploads WHERE id = ANY($1)`, [[recentUpload, unitBUpload]]), 2);
  assert.ok(await n(`SELECT count(*)::int n FROM corrections WHERE upload_id = $1`, [recentUpload]) > 0);
  assert.ok(await n(`SELECT count(*)::int n FROM contacts c JOIN lead_lists l ON l.id = c.list_id WHERE l.upload_id = $1`, [unitBUpload]) > 0);
  assert.equal(await n(`SELECT count(*)::int n FROM config_versions`), 2);
  assert.equal(after.audit_log, before.audit_log + 1, 'the audit trail is kept, with one entry more');
  const a = (await owner.query(`SELECT actor_user_id, actor_role, details FROM audit_log WHERE action = 'data.purged'`)).rows;
  assert.equal(a.length, 1);
  assert.deepEqual([a[0].actor_user_id, a[0].actor_role, a[0].details.uploads, a[0].details.removed.contacts, a[0].details.unit], [SYSTEM_USER_ID, 'ops', 2, dry.contacts, 'unit-a']);
  // Run again: nothing is left to remove.
  const again = await purge(ops, { before: CUTOFF, unit: 'unit-a', yes: true });
  assert.ok(Object.values(again).every(v => v === 0), JSON.stringify(again));
});

test('a unit is due once a sponsor decision that ends the pilot is past the retention period; --due removes its data alone', async () => {
  // Unit B's sponsor stopped the pilot 31 days ago; unit A's chose to extend it 40 days ago, which doesn't start the clock.
  const decide = async (bu: string, by: string, verdict: string, daysAgo: number) => {
    const readout = (await owner.query(`INSERT INTO readouts (business_unit_id, name, created_by) VALUES ($1, 'Pilot readout', $2) RETURNING id`, [bu, by])).rows[0].id;
    await owner.query(`INSERT INTO readout_signoffs (business_unit_id, readout_id, kind, verdict, note, actor_role, evidence, config_version_id, created_at, created_by)
      SELECT $1, $2, 'sponsor', $3, '', 'Admin', '{}', id, now() - make_interval(days => $4), $5 FROM config_versions WHERE business_unit_id = $1`, [bu, readout, verdict, daysAgo, by]);
  };
  await decide(ids.buB, ids.repB, 'Stop', 31);
  await decide(ids.buA, ids.adminA, 'Extend the pilot', 40);
  const status = JSON.parse((await cli('purge.mjs', ['--status', '--json'])).stdout);
  const byUnit = Object.fromEntries(status.units.map((u: { unit: string; decision: string; dueAt: string | null; uploads: number }) => [u.unit, u]));
  assert.deepEqual([byUnit['unit-a'].decision, byUnit['unit-a'].dueAt], ['Extend the pilot', null], 'extending the pilot never makes it due');
  assert.equal(byUnit['unit-b'].decision, 'Stop');
  assert.ok(new Date(byUnit['unit-b'].dueAt) < new Date());
  assert.match((await cli('purge.mjs', ['--status'])).stdout, /unit-a {11}1 upload\(s\); "Extend the pilot" on \d{4}-\d{2}-\d{2}: not due/);
  const dry = JSON.parse((await cli('purge.mjs', ['--due', '--json'])).stdout);
  assert.deepEqual([dry.mode, dry.units.map((u: { unit: string }) => u.unit), dry.units[0].removed.uploads], ['dry-run', ['unit-b'], 1]);
  assert.equal(await n(`SELECT count(*)::int n FROM uploads WHERE id = $1`, [unitBUpload]), 1, 'a dry run');
  // Not due yet with a longer period.
  const longer = await run(process.execPath, [join(REPO, 'scripts', 'data', 'purge.mjs'), '--due', '--json'],
    { env: { PATH: process.env.PATH, DATABASE_OPS_URL: db.url('demandai_ops'), DATABASE_SSL_MODE: 'disable', RETENTION_DAYS_AFTER_READOUT: '60' } });
  assert.deepEqual(JSON.parse(longer.stdout).units, []);
  const real = JSON.parse((await cli('purge.mjs', ['--due', '--yes', '--json'])).stdout);
  assert.deepEqual([real.mode, real.units[0].unit, real.units[0].removed.uploads], ['purged', 'unit-b', 1]);
  assert.equal(await n(`SELECT count(*)::int n FROM uploads WHERE business_unit_id = $1`, [ids.buB]), 0);
  assert.equal(await n(`SELECT count(*)::int n FROM uploads WHERE id = $1`, [recentUpload]), 1, "unit A isn't due");
  assert.equal(await n(`SELECT count(*)::int n FROM readout_signoffs WHERE business_unit_id = $1`, [ids.buB]), 1, 'the readout itself is kept');
  // A later decision is the one that counts: unit A's sponsor now stops it, today, so it is due in 30 days, not now.
  await decide(ids.buA, ids.adminA, 'Stop', 0);
  assert.deepEqual(JSON.parse((await cli('purge.mjs', ['--due', '--json'])).stdout).units, []);
});

test('a purge by upload removes that file and what was made from it; the command line refuses unclear requests', async () => {
  const r = await purge(ops, { upload: recentUpload, yes: true });
  assert.deepEqual([r.uploads, r.lead_lists > 0, r.corrections > 0], [1, true, true]);
  assert.equal(await n(`SELECT count(*)::int n FROM uploads`), 0);
  assert.equal(await n(`SELECT count(*)::int n FROM corrections`), 0);
  for (const args of [['--before', 'yesterday'], ['--due', '--upload', recentUpload], ['--upload', 'not-an-id'], ['--unit', 'unit-a']]) {
    await assert.rejects(cli('purge.mjs', args), (e: { code: number; stderr: string }) => e.code === 1 && /^purge failed: /.test(e.stderr) && !e.stderr.includes('test_ops_pw'), args.join(' '));
  }
  // A connection error never prints the address or password.
  const bad = await run(process.execPath, [join(REPO, 'scripts', 'data', 'purge.mjs'), '--status'], {
    env: { PATH: process.env.PATH, DATABASE_OPS_URL: db.url('demandai_ops').replace('test_ops_pw', 'wrong_pw'), DATABASE_SSL_MODE: 'disable' } }).catch(e => e as { code: number; stderr: string });
  assert.equal((bad as { code: number }).code, 1);
  assert.ok(!(bad as { stderr: string }).stderr.includes('wrong_pw'), (bad as { stderr: string }).stderr);
});
