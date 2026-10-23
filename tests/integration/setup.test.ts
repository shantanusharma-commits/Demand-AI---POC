// Setup on the server against PostgreSQL (G-002, D-13, G-023): sign-offs per section, signal switches with a reason
// and an audit trail, added types, a new configuration version for each change (new runs only), the export, and
// business-unit isolation. Uses the built-in sample (fictional).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { serializeConfig } from '../../lib/engine/config.ts';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { createAppWorker } from '../../lib/server/jobs/handlers.ts';
import { getJob } from '../../lib/server/jobs/queue.ts';
import { receiveSample, uploadLimits, type UploadLimits } from '../../lib/server/services/uploads.ts';
import { saveList, type Actor } from '../../lib/server/services/lists.ts';
import { startScoringRun } from '../../lib/server/services/scoring.ts';
import { addSignalType, exportConfig, getSetup, removeSignalType, signOffSection, switchSignal } from '../../lib/server/services/setup.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics;
const limits: UploadLimits = uploadLimits({ UPLOAD_MAX_BYTES: 5 * 1024 * 1024, UPLOAD_MAX_ROWS: 50_000, UPLOAD_TIME_LIMIT_MS: 60_000, UPLOAD_MAX_UNZIPPED_BYTES: 50 * 1024 * 1024 });
const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const adminActor = (): Actor => ({ userId: ids.adminA, role: 'Admin' });
const as = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, ctx, fn);
const status = (code: number, re?: RegExp) => (e: HttpError) => e.status === code && (!re || re.test(e.message));
const DEMO = { name: 'Demo request', segment: 'Inquiry', level: 'Strong' as const, full: 30, zero: 90, about: 'Asked for a product demo', data: '', source: 'Web form' };

let listId = '', signalUploadId = '';

async function runJobs() { await createAppWorker(app, limits).drain(); }
async function score(): Promise<string> {
  const started = await as(admin(), s => startScoringRun(s, adminActor(), { listId, signalUploadId, asOf: '2026-09-30' }));
  await runJobs();
  assert.equal((await as(admin(), s => getJob(s, started.jobId)))!.status, 'succeeded');
  return started.runId;
}
const webinarRows = async (runId: string) => (await owner.query(
  `SELECT status, data->>'code' code FROM signals WHERE run_id = $1 AND data->>'type' = 'Webinar attended' ORDER BY seq`, [runId])).rows;

before(async () => {
  db = await freshDatabase('setup');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
  for (const [bu, by] of [[ids.buA, ids.adminA], [ids.buB, ids.repB]]) {
    await owner.query(`INSERT INTO config_versions (business_unit_id, version_no, status, body, engine_version, created_by, activated_at, activated_by)
      VALUES ($1, 1, 'active', $2, 't', $3, now(), $3)`, [bu, JSON.stringify(serializeConfig()), by]);
  }
  const up = await as(admin(), s => receiveSample(s, 'lead', limits));
  await runJobs();
  listId = (await as(admin(), s => getJob(s, up.jobId!)))!.progress.result!.listId;
  await as(admin(), s => saveList(s, adminActor(), listId, { name: 'Sample' }));
  signalUploadId = (await as(admin(), s => receiveSample(s, 'signal', limits))).uploadId;
});
after(async () => { await db?.drop(); });

test('G-002: every section starts unsigned; sign-off and reopen are tied to who and the version; repeats are refused; the log is append-only', async () => {
  const start = await as(admin(), s => getSetup(s));
  assert.equal(start.version.versionNo, 1);
  assert.ok(Object.values(start.sections).every(x => x.status === 'review' && x.by === null), 'no demo sign-offs');
  await as(admin(), s => signOffSection(s, adminActor(), 'scope', 'sign_off', 'Checked with the sponsor'));
  const signed = (await as(admin(), s => getSetup(s))).sections.scope;
  assert.deepEqual([signed.status, signed.by, signed.note], ['done', 'admin.a', 'Checked with the sponsor']);
  assert.ok(signed.at instanceof Date);
  await assert.rejects(as(admin(), s => signOffSection(s, adminActor(), 'scope', 'sign_off')), status(409, /already signed off/));
  await as(admin(), s => signOffSection(s, adminActor(), 'scope', 'reopen'));
  assert.equal((await as(admin(), s => getSetup(s))).sections.scope.status, 'review');
  await assert.rejects(as(admin(), s => signOffSection(s, adminActor(), 'scope', 'reopen')), status(409, /nothing to reopen/));
  const rows = (await owner.query(`SELECT action, config_version_id FROM config_signoffs ORDER BY seq`)).rows;
  assert.deepEqual(rows.map(r => r.action), ['sign_off', 'reopen']);
  await assert.rejects(owner.query(`UPDATE config_signoffs SET note = 'x'`), /append-only/);
  await assert.rejects(owner.query(`DELETE FROM config_signoffs`), /append-only/);
  const audit = (await owner.query(`SELECT action, details FROM audit_log WHERE action LIKE 'config.%' ORDER BY occurred_at`)).rows;
  assert.deepEqual(audit.map(a => [a.action, a.details.section]), [['config.signed_off', 'scope'], ['config.reopened', 'scope']]);
});

test('G-002, G-023: switching a type off needs a reason and makes the next version; new runs get OFF, earlier runs keep theirs', async () => {
  const before1 = await score();
  assert.ok((await webinarRows(before1)).length > 0 && (await webinarRows(before1)).every(r => r.code !== 'OFF'));
  await assert.rejects(as(admin(), s => switchSignal(s, adminActor(), { type: 'Webinar attended', on: false, reason: '  ' })), status(400, /Say why/));
  const v2 = await as(admin(), s => switchSignal(s, adminActor(), { type: 'Webinar attended', on: false, reason: 'Legal hold on webinar data' }));
  assert.equal(v2.versionNo, 2);
  const setup = await as(admin(), s => getSetup(s));
  assert.deepEqual([setup.version.versionNo, setup.version.activatedBy, setup.signals.off], [2, 'admin.a', ['Webinar attended']]);
  assert.deepEqual(setup.changes.map(c => [c.type, c.change, c.reason, c.by, c.versionNo]), [['Webinar attended', 'off', 'Legal hold on webinar data', 'admin.a', 2]]);
  assert.deepEqual(setup.versions.map(v => [v.versionNo, v.status, v.changes]), [[2, 'active', ['Webinar attended switched off']], [1, 'retired', []]]);
  const after2 = await score();
  assert.ok((await webinarRows(after2)).every(r => r.status === 'Rejected' && r.code === 'OFF'), 'new runs reject its rows as OFF');
  assert.ok((await webinarRows(before1)).every(r => r.code !== 'OFF'), 'the earlier run is unchanged');
  const stamped = (await owner.query(`SELECT r.id, v.version_no FROM scoring_runs r JOIN config_versions v ON v.id = r.config_version_id`)).rows;
  assert.deepEqual(Object.fromEntries(stamped.map(r => [r.id, r.version_no])), { [before1]: 1, [after2]: 2 }, 'each run names the version it used');
  await assert.rejects(as(admin(), s => switchSignal(s, adminActor(), { type: 'Webinar attended', on: false, reason: 'again' })), status(409, /already off/));
  await assert.rejects(as(admin(), s => switchSignal(s, adminActor(), { type: 'Installed system (current)', on: false, reason: 'x' })), status(400, /only scored signal types/));
  await assert.rejects(as(admin(), s => switchSignal(s, adminActor(), { type: 'Trade show', on: false, reason: 'x' })), status(400));
  const v3 = await as(admin(), s => switchSignal(s, adminActor(), { type: 'Webinar attended', on: true, reason: '' }));
  assert.equal(v3.versionNo, 3);
  assert.deepEqual((await as(admin(), s => getSetup(s))).signals.off, [], 'switched back on, without a reason');
  await assert.rejects(owner.query(`UPDATE signal_type_changes SET reason = 'x'`), /append-only/);
  const active = (await owner.query(`SELECT count(*)::int n FROM config_versions WHERE business_unit_id = $1 AND status = 'active'`, [ids.buA])).rows[0].n;
  assert.equal(active, 1, 'one active version');
});

test('G-002: an added type has its definition, makes a version and reopens a signed-off Signals section; removing it makes the tag unknown again', async () => {
  await as(admin(), s => signOffSection(s, adminActor(), 'signals', 'sign_off'));
  const v = await as(admin(), s => addSignalType(s, adminActor(), DEMO));
  const setup = await as(admin(), s => getSetup(s));
  assert.equal(setup.version.versionNo, v.versionNo);
  assert.deepEqual(setup.signals.custom.map(c => [c.name, c.segment, c.level, c.full, c.zero, c.about, c.source, c.by]),
    [['Demo request', 'Inquiry', 'Strong', 30, 90, 'Asked for a product demo', 'Web form', 'admin.a']]);
  assert.deepEqual([setup.sections.signals.status, setup.sections.signals.note], ['review', 'Demo request added'], 'the section needs signing off again');
  const def = (await owner.query(`SELECT definition FROM signal_type_changes WHERE change = 'added'`)).rows[0].definition;
  assert.equal(def.name, 'Demo request');
  for (const [bad, re] of [[{ ...DEMO }, /already a signal type/], [{ ...DEMO, name: 'email clicked' }, /already a signal type/], [{ ...DEMO, name: 'Site visit', segment: 'Nowhere' }, /micro-segment/],
    [{ ...DEMO, name: 'Site visit', full: 60, zero: 30 }, /gone after/]] as const) {
    await assert.rejects(as(admin(), s => addSignalType(s, adminActor(), bad)), status(400, re), bad.name);
  }
  // An added type can be switched off like the others.
  await as(admin(), s => switchSignal(s, adminActor(), { type: 'Demo request', on: false, reason: 'Form is noisy' }));
  await assert.rejects(as(admin(), s => removeSignalType(s, adminActor(), { name: 'Email clicked', reason: '' })), status(400, /switch it off instead/));
  await assert.rejects(as(admin(), s => removeSignalType(s, adminActor(), { name: 'Trade show', reason: '' })), status(409));
  await as(admin(), s => removeSignalType(s, adminActor(), { name: 'Demo request', reason: 'Not used in the pilot' }));
  const after = await as(admin(), s => getSetup(s));
  assert.deepEqual([after.signals.custom, after.signals.off], [[], []], 'removed, and no longer switched off either');
  assert.deepEqual(after.changes.slice(0, 3).map(c => [c.type, c.change]), [['Demo request', 'removed'], ['Demo request', 'off'], ['Demo request', 'added']]);
});

test('G-002: the export is the active version as JSON, with sign-offs and signal changes, and is audited', async () => {
  const file = await as(admin(), s => exportConfig(s, adminActor()));
  const setup = await as(admin(), s => getSetup(s));
  assert.equal(file.fileName, `demandai-config-v${setup.version.versionNo}.json`);
  const out = JSON.parse(file.json);
  assert.equal(out.version.number, setup.version.versionNo);
  assert.equal(out.configuration.fitFloor, 50);
  assert.deepEqual(out.configuration.rubric.map((r: { key: string }) => r.key), (serializeConfig().rubric as { key: string }[]).map(r => r.key));
  assert.equal(out.signalChanges.length, setup.changes.length);
  assert.equal(out.sections.signals.status, 'review');
  assert.equal((await owner.query(`SELECT count(*)::int n FROM audit_log WHERE action = 'config.exported'`)).rows[0].n, 1);
});

test('D-41: each business unit has its own versions, sign-offs and switches', async () => {
  const b = await as({ userId: ids.repB, businessUnitId: ids.buB, scope: 'all', ownerEmails: [] }, s => getSetup(s));
  assert.equal(b.version.versionNo, 1);
  assert.deepEqual([b.changes, b.signals.off, b.signals.custom], [[], [], []]);
  assert.ok(Object.values(b.sections).every(x => x.status === 'review'));
  assert.deepEqual(b.versions.map(v => v.versionNo), [1]);
});
