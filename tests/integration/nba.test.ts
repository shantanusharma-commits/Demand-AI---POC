// Micro-segments and next best action on the server against PostgreSQL (G-006): a build from a stored hand-off is what
// the engine itself makes of those prospects (segments, one action per account, routing), stamped with the live brand
// pack and configuration; drafts, the decision log and pauses are append-only and the system output immutable;
// recommendations are owner-scoped (G-014); engage-once works across builds; outcomes; and the evidence keeps the
// list and run it came from. Uses the full sample from test-data/.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import * as E from '../../lib/demandai-engine.ts';
import * as N from '../../lib/engine/nba.ts';
import * as R from '../../lib/engine/review.ts';
import { serializeConfig } from '../../lib/engine/config.ts';
import { buildProspects, handoffSelection } from '../../lib/engine/prospects.ts';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { createAppWorker } from '../../lib/server/jobs/handlers.ts';
import { getJob } from '../../lib/server/jobs/queue.ts';
import { receiveUpload, uploadLimits, type UploadLimits } from '../../lib/server/services/uploads.ts';
import { deleteList, saveList, type Actor } from '../../lib/server/services/lists.ts';
import { deleteRun, listProspects, saveRun, startScoringRun } from '../../lib/server/services/scoring.ts';
import { createHandoff } from '../../lib/server/services/handoffs.ts';
import { buildNbaRun, getNbaRun, listNbaRuns, setSegmentPaused } from '../../lib/server/services/nba.ts';
import { checkDateOf, itemDetail, markOutcome, openItem } from '../../lib/server/services/recommendations.ts';
import { getBrand, PackInput, publishDraft, saveDraft } from '../../lib/server/services/brand.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';
import { AS_OF, DATASET, loadDataset } from '../helpers/answer-key.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics;
const limits: UploadLimits = uploadLimits({ UPLOAD_MAX_BYTES: 25 * 1024 * 1024, UPLOAD_MAX_ROWS: 50_000, UPLOAD_TIME_LIMIT_MS: 120_000, UPLOAD_MAX_UNZIPPED_BYTES: 200 * 1024 * 1024 });
const dataset = loadDataset();
const sample = readFileSync(DATASET);
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const adminActor = (): Actor => ({ userId: ids.adminA, role: 'Admin' });
const repCtx = (emails: string[]): TenantContext => ({ userId: ids.repA, businessUnitId: ids.buA, scope: 'own', ownerEmails: emails });
const repActor = (): Actor => ({ userId: ids.repA, role: 'Sales rep' });
const as = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, ctx, fn);
const status = (code: number, re?: RegExp) => (e: HttpError) => e.status === code && (!re || re.test(e.message));
const pgCode = (code: string) => (err: unknown) => (err as { code?: string }).code === code || (err as { cause?: { code?: string } }).cause?.code === code;

/** The engine's own answer for the sample hand-off: segments, recommendations and where each is routed. */
function engineBuild(brand: N.BrandPack, keys?: Set<string>) {
  const leads = E.processLeads(dataset.leadGrid, { file: 'Lead_Research_Sample_Dataset.xlsx', sheet: 'Lead template' });
  const sig = E.processSignals(dataset.signalGrid, leads, { file: 'Lead_Research_Sample_Dataset.xlsx', sheet: 'Signal template', asOf: AS_OF });
  const scored = E.scoreList(leads, sig);
  const h = handoffSelection(buildProspects(scored));
  const handed = h.items.map(p => p.key).filter(k => !keys || keys.has(k));
  const seg = N.buildSegments(scored as unknown as N.NbaResult[], { keys: handed });
  const when = checkDateOf(AS_OF);
  const routed = new Map(seg.recs.map(r => {
    const st = R.initialState();
    let d = R.generatedDraft(r, st, brand, when);
    if (N.checkDraft(d, brand, when).flags.some(f => f.rule !== 'Sensitive term')) { st.variant = 'clean'; d = R.generatedDraft(r, st, brand, when); }
    const rs = R.exceptionReasons(r, d, N.checkDraft(d, brand, when));
    return [r.key, { status: rs.some(t => /^Sensitive/.test(t)) ? 'Awaiting approval' : rs.length ? 'Waiting' : 'Released', channel: d.channel, owner: r.contact.owner.toLowerCase() || null }];
  }));
  return { seg, routed, handed: handed.length };
}

async function runJobs() { await createAppWorker(app, limits).drain(); }
let listId = '', scoringRunId = '', handoffId = '', runId = '', someOwner = '';

before(async () => {
  db = await freshDatabase('nba');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
  await owner.query(`INSERT INTO config_versions (business_unit_id, version_no, status, body, engine_version, created_by, activated_at, activated_by)
    VALUES ($1, 1, 'active', $2, 't', $3, now(), $3)`, [ids.buA, JSON.stringify(serializeConfig()), ids.adminA]);
  const up = await as(admin(), s => receiveUpload(s, { kind: 'lead', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: sample }, limits));
  await runJobs();
  listId = (await as(admin(), s => getJob(s, up.jobId!)))!.progress.result!.listId;
  await as(admin(), s => saveList(s, adminActor(), listId, { name: 'Full sample' }));
  const sig = await as(admin(), s => receiveUpload(s, { kind: 'signal', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: sample }, limits));
  const started = await as(admin(), s => startScoringRun(s, adminActor(), { listId, signalUploadId: sig.uploadId, asOf: AS_OF }));
  await runJobs();
  assert.equal((await as(admin(), s => getJob(s, started.jobId)))!.status, 'succeeded');
  scoringRunId = started.runId;
  await as(admin(), s => saveRun(s, adminActor(), scoringRunId, 'Sample scored'));
  handoffId = (await as(admin(), s => createHandoff(s, adminActor(), { runId: scoringRunId }))).handoffId;
  const owners = await owner.query(`SELECT owner_email, count(*) n FROM handoff_items WHERE handoff_id = $1 AND owner_email IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1`, [handoffId]);
  someOwner = owners.rows[0].owner_email;
});
after(async () => { await db?.drop(); });

test('G-006: a build is what the engine makes of the hand-off: micro-segments, one action per account, and each item routed', async () => {
  const brand = (await as(admin(), s => getBrand(s))).live;
  const want = engineBuild(brand.pack);
  const built = await as(admin(), s => buildNbaRun(s, adminActor(), { handoffId }));
  runId = built.runId;
  const run = await as(admin(), s => getNbaRun(s, runId));
  // With the AI off every segment is the rules' own (F3: who made it shows on its tile).
  assert.deepEqual(run.segments, want.seg.segments.map(s => ({ name: s.name, accounts: s.accountIds.length, theme: s.name, madeBy: 'rules', waiting: false })));
  assert.equal(run.recs.length, want.seg.recs.length);
  assert.equal(run.recs.length, 107, 'the sample: 135 prospects handed off, one recommendation per account');
  for (const r of run.recs) {
    const w = want.routed.get(r.key);
    assert.ok(w, r.key);
    assert.deepEqual([r.status, r.channel, r.ownerEmail], [w.status, w.channel, w.owner], r.key);
  }
  const by = (s: string) => run.recs.filter(r => r.status === s).length;
  assert.ok(by('Released') > 0 && by('Waiting') > 0 && by('Awaiting approval') > 0, 'the sample has all three paths');
  assert.deepEqual(built.stats, { ...built.stats, prospects: 107, auto: by('Released'), approvals: by('Awaiting approval') });
  const stamp = await owner.query(`SELECT brand_version_id, config_version_id, engine_version, as_of::text as_of FROM nba_runs WHERE id = $1`, [runId]);
  const cv = await owner.query(`SELECT id FROM config_versions WHERE business_unit_id = $1 AND status = 'active'`, [ids.buA]);
  assert.deepEqual([stamp.rows[0].brand_version_id, stamp.rows[0].config_version_id, stamp.rows[0].as_of], [brand.id, cv.rows[0].id, AS_OF]);
  // Every item has its first draft and a System log line saying where it went.
  const d = await owner.query(`SELECT count(*)::int n FROM drafts d JOIN recommendations r ON r.id = d.recommendation_id WHERE r.nba_run_id = $1 AND d.version = 1`, [runId]);
  assert.equal(d.rows[0].n, 107);
  const logs = await owner.query(`SELECT decision, count(*)::int n FROM decision_log WHERE nba_run_id = $1 AND kind = 'system' GROUP BY 1 ORDER BY 1`, [runId]);
  assert.deepEqual(Object.fromEntries(logs.rows.map(r => [r.decision, r.n])), { 'Proceeded on its own': by('Released'), 'To approvals': by('Awaiting approval'), 'To the exception queue': by('Waiting') });
  assert.deepEqual(run.checks.map(c => c.key), ['read', 'engage', 'group', 'fallback', 'except', 'action', 'channel', 'proof', 'draft', 'brand', 'claims', 'confidence', 'send', 'spot']);
});

test('G-007: nothing goes ahead on its own to someone who can’t be contacted', async () => {
  const rows = await owner.query(`SELECT r.rec->'contact' c, d.draft FROM recommendations r JOIN drafts d ON d.recommendation_id = r.id AND d.version = r.draft_version
    WHERE r.nba_run_id = $1 AND r.status = 'Released'`, [runId]);
  for (const r of rows.rows) {
    assert.equal(r.draft.unreachable, false);
    assert.ok(E.canContact(r.c), r.c.name);
  }
});

test('G-014: a rep sees only their own recommendations; another owner’s is a 404, at the service and in the database', async () => {
  const rep = repCtx([someOwner]);
  const mine = await as(rep, s => getNbaRun(s, runId));
  assert.ok(mine.recs.length > 0 && mine.recs.every(r => r.ownerEmail === someOwner));
  const other = await owner.query(`SELECT id FROM recommendations WHERE nba_run_id = $1 AND owner_email IS DISTINCT FROM $2 LIMIT 1`, [runId, someOwner]);
  await assert.rejects(as(rep, s => itemDetail(s, repActor(), other.rows[0].id)), status(404));
  await assert.rejects(as(rep, s => markOutcome(s, repActor(), other.rows[0].id, 'Sent')), status(404));
  // The database alone: a rep's transaction sees only their rows, whatever the query asks for.
  const raw = await as(rep, s => s.tx.execute<{ n: number; others: number }>(`SELECT count(*)::int n, count(*) FILTER (WHERE owner_email IS DISTINCT FROM '${someOwner}')::int others FROM recommendations`));
  assert.deepEqual([raw.rows[0].n, raw.rows[0].others], [mine.recs.length, 0]);
  const drafts = await as(rep, s => s.tx.execute<{ n: number }>(`SELECT count(DISTINCT recommendation_id)::int n FROM drafts`));
  assert.equal(drafts.rows[0].n, mine.recs.length, 'drafts follow their recommendation');
  // A rep building from the manager's hand-off gets their own prospects only.
  const repRun = await as(rep, s => buildNbaRun(s, repActor(), { handoffId }));
  const all = await owner.query(`SELECT DISTINCT owner_email FROM recommendations WHERE nba_run_id = $1`, [repRun.runId]);
  assert.deepEqual(all.rows.map(r => r.owner_email), [someOwner]);
});

test('5.9 engage-once: an account released in an earlier build is set aside in the next one, whoever builds it', async () => {
  const released = await owner.query(`SELECT rec->'account'->>'name' name FROM recommendations WHERE nba_run_id = $1 AND status = 'Released'`, [runId]);
  const again = await as(admin(), s => buildNbaRun(s, adminActor(), { handoffId }));
  const next = await as(admin(), s => getNbaRun(s, again.runId));
  const names = new Set(released.rows.map(r => r.name));
  assert.ok(next.engaged.length >= names.size);
  // "Build name · date", plus the date it was engaged only when that's another day: the same date isn't said twice.
  for (const n of names) assert.ok(next.engaged.some(e => e.name === n && /^Sample scored · \d{4}-\d{2}-\d{2}(, \d{4}-\d{2}-\d{2})?$/.test(e.label) && !/(\d{4}-\d{2}-\d{2}), \1$/.test(e.label)), n);
  assert.ok(next.recs.every(r => !names.has(r.account.name)), 'no released account is recommended again');
  assert.equal(again.stats.engagedOnce, next.engaged.length);
});

test('the system output is immutable and drafts, the decision log and pauses are append-only for the app role', async () => {
  const appPool = db.pool('demandai_app');
  const one = (await owner.query(`SELECT id FROM recommendations WHERE nba_run_id = $1 LIMIT 1`, [runId])).rows[0].id;
  const tenant = async (sqlText: string) => {
    const c = await appPool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.user_id', $1, true), set_config('app.business_unit_id', $2, true), set_config('app.scope', 'all', true), set_config('app.owner_emails', '', true)`, [ids.adminA, ids.buA]);
      return await c.query(sqlText);
    } finally { await c.query('ROLLBACK'); c.release(); }
  };
  await tenant(`UPDATE recommendations SET hold_why = 'x' WHERE id = '${one}'`);
  // The micro-segment's name can change (30 Oct 2026): a manager's rename or merge moves its items with it.
  await tenant(`UPDATE recommendations SET segment = 'x' WHERE id = '${one}'`);
  for (const col of [`rec = '{}'`, `action = 'x'`, `passed = false`, `reasons = '{}'`, `account_id = account_id`]) {
    await assert.rejects(tenant(`UPDATE recommendations SET ${col} WHERE id = '${one}'`), pgCode('42501'), col);
  }
  await assert.rejects(tenant(`DELETE FROM recommendations WHERE id = '${one}'`), pgCode('42501'));
  for (const t of ['drafts', 'decision_log', 'segment_pauses']) {
    await assert.rejects(tenant(`UPDATE ${t} SET created_at = now()`), pgCode('42501'), t);
    await assert.rejects(tenant(`DELETE FROM ${t}`), pgCode('42501'), t);
    await assert.rejects(owner.query(`TRUNCATE ${t}`), /append-only/, t);
  }
});

test('6.3 a manager pauses a micro-segment: every item is logged, nothing in it can be used until it is resumed', async () => {
  const run = await as(admin(), s => getNbaRun(s, runId));
  const seg = run.segments[0].name;
  const res = await as(admin(), s => setSegmentPaused(s, adminActor(), runId, seg, true, 'Checking the claims'));
  assert.equal(res.items, run.recs.filter(r => r.segment === seg).length);
  await assert.rejects(as(admin(), s => setSegmentPaused(s, adminActor(), runId, seg, true)), status(409, /already paused/));
  await assert.rejects(as(admin(), s => setSegmentPaused(s, adminActor(), runId, 'Nope', true)), status(400));
  const paused = await as(admin(), s => getNbaRun(s, runId));
  assert.equal(paused.paused[seg].reason, 'Checking the claims');
  assert.ok(paused.recs.filter(r => r.segment === seg).every(r => r.paused));
  const item = paused.recs.find(r => r.segment === seg && r.status === 'Released')!;
  await assert.rejects(as(admin(), s => markOutcome(s, adminActor(), item.id, 'Sent')), status(409, /paused/));
  const logged = await owner.query(`SELECT count(*)::int n FROM decision_log WHERE nba_run_id = $1 AND decision = 'Micro-segment paused'`, [runId]);
  assert.equal(logged.rows[0].n, res.items);
  await as(admin(), s => setSegmentPaused(s, adminActor(), runId, seg, false));
  assert.equal(Object.keys((await as(admin(), s => getNbaRun(s, runId))).paused).length, 0);
});

test('step 9 outcomes: a released item records what happened; a booked meeting brings a call script, marked new until opened', async () => {
  const run = await as(admin(), s => getNbaRun(s, runId));
  const released = run.recs.find(r => r.status === 'Released')!;
  const waiting = run.recs.find(r => r.status === 'Waiting')!;
  await assert.rejects(as(admin(), s => markOutcome(s, adminActor(), waiting.id, 'Sent')), status(409, /released/));
  const out = await as(admin(), s => markOutcome(s, adminActor(), released.id, 'Meeting booked'));
  assert.deepEqual(out, { outcome: 'Meeting booked', meeting: true });
  const item = await as(admin(), s => itemDetail(s, adminActor(), released.id));
  assert.equal(item.state.meeting!.seen, false);
  assert.match(item.state.meeting!.script.opener, /thanks for making the time/);
  assert.equal((await as(admin(), s => listNbaRuns(s))).meetings.count, 1);
  await as(admin(), s => openItem(s, adminActor(), released.id));
  assert.equal((await as(admin(), s => itemDetail(s, adminActor(), released.id))).state.meeting!.seen, true);
  assert.equal((await as(admin(), s => listNbaRuns(s))).meetings.count, 0);
  assert.deepEqual(item.history.slice(0, 2).map(h => [h.who, h.decision]), [['System', 'Call script ready for the meeting'], ['admin.a', 'Outcome: Meeting booked']]);
});

test('G-009: a build uses the live brand pack: a claim that has expired makes the action a task naming it (D-10)', async () => {
  const live = (await as(admin(), s => getBrand(s))).live;
  const pack = JSON.parse(JSON.stringify(live.pack)) as N.BrandPack;
  for (const c of pack.claims) if (c.segments.includes('Inquiry')) c.expiry = '2026-01-31';
  const input = PackInput.parse({ voice: pack.voice, negative: pack.negative, competitors: pack.competitors, claims: pack.claims, frameworks: pack.frameworks, guideline: null });
  await as(admin(), s => saveDraft(s, adminActor(), { pack: input, baseVersionNo: live.versionNo }));
  const v = await as(admin(), s => publishDraft(s, adminActor(), 'Inquiry proof lapsed'));
  const built = await as(admin(), s => buildNbaRun(s, adminActor(), { scoringRunId }));
  const stamp = await owner.query(`SELECT b.version_no FROM nba_runs n JOIN brand_versions b ON b.id = n.brand_version_id WHERE n.id = $1`, [built.runId]);
  assert.equal(stamp.rows[0].version_no, v.versionNo);
  const inquiry = await owner.query(`SELECT d.draft FROM recommendations r JOIN drafts d ON d.recommendation_id = r.id AND d.version = r.draft_version
    WHERE r.nba_run_id = $1 AND r.segment = 'Inquiry'`, [built.runId]);
  assert.ok(inquiry.rows.length > 0);
  for (const r of inquiry.rows) {
    assert.equal(r.draft.channel, 'Task');
    assert.match(r.draft.task, /CS-01 expired 2026-01-31/);
  }
  assert.ok(built.checks.find(c => c.key === 'proof')!.label.endsWith('without proof: tasks'));
});

test('the evidence keeps its sources: a list or scoring run with micro-segments built on it can’t be deleted', async () => {
  await assert.rejects(as(admin(), s => deleteRun(s, adminActor(), scoringRunId)), status(409, /evidence/));
  await assert.rejects(as(admin(), s => deleteList(s, adminActor(), listId)), status(409, /evidence/));
});

test('builds are per business unit: another unit sees none of them', async () => {
  const other: TenantContext = { userId: ids.repB, businessUnitId: ids.buB, scope: 'all', ownerEmails: [] };
  assert.deepEqual((await as(other, s => listNbaRuns(s))).runs, []);
  await assert.rejects(as(other, s => getNbaRun(s, runId)), status(404));
  const raw = await as(other, s => s.tx.execute<{ n: number }>(`SELECT (SELECT count(*) FROM recommendations) + (SELECT count(*) FROM drafts) + (SELECT count(*) FROM decision_log) + (SELECT count(*) FROM nba_runs) AS n`));
  assert.equal(Number(raw.rows[0].n), 0);
});

test('D-12: the ranked list is per person (prospect tier), with the account’s own tier beside it', async () => {
  const want = await owner.query(`SELECT p.contact_id, a.tier FROM prospect_scores p JOIN account_scores a ON a.run_id = p.run_id AND a.account_id = p.account_id WHERE p.run_id = $1`, [scoringRunId]);
  const accountTier = new Map(want.rows.map(r => [r.contact_id, r.tier]));
  const rows = (await as(admin(), s => listProspects(s, scoringRunId, { limit: 500 }))).rows;
  assert.ok(rows.length === 500 && rows.every(r => r.accountTier === accountTier.get(r.contactId)));
  assert.ok(rows.some(r => r.accountTier !== r.tier), 'a person can rank apart from their account');
});
