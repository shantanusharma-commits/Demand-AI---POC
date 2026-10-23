// Analytics on the server against PostgreSQL (G-011, D-21, D-38): a seeded decision log gives the expected G2 and G1
// and the "Too early to call" rule (a flagged decision counts once a manager checks it); reps see their own results
// and a manager one rep's; the funnel, evidence, weekly summary, learning loop and readout read the stored data; a
// Viewer gets aggregates without records; the outcome log is neutralised; changing the gate settings makes a new
// configuration version with the change recorded. Full sample from test-data/.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { CODES } from '../../lib/demandai-engine.ts';
import { SYSTEM_USER_ID } from '../../lib/server/db/schema.ts';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import type { Actor } from '../../lib/server/services/lists.ts';
import {
  areasView, evidenceView, funnelView, gatesView, learningLoopView, outcomeLogCsv, readoutView, saveValidation, validationView, weeklyMarkdown, weeklyView,
} from '../../lib/server/services/analytics.ts';
import { getSetup } from '../../lib/server/services/setup.ts';
import { isoWeek } from '../../lib/server/services/review.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';
import { buildPilot } from './pilot.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics, runId = '', viewerId = '';
let repOwner = '';
const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const mgr = (): Actor => ({ userId: ids.adminA, role: 'Admin' });
const rep = (): TenantContext => ({ userId: ids.repA, businessUnitId: ids.buA, scope: 'own', ownerEmails: ['rep.a@demandai.test', repOwner] });
const repActor = (): Actor => ({ userId: ids.repA, role: 'Sales rep' });
const viewer = (): TenantContext => ({ userId: viewerId, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const viewerActor = (): Actor => ({ userId: viewerId, role: 'Viewer' });
const as = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, ctx, fn);
const one = async (q: string, p: unknown[] = []) => (await owner.query(q, p)).rows[0];
const status = (code: number, re?: RegExp) => (e: HttpError) => e.status === code && (!re || re.test(e.message));

type Seed = { kind: string; accepted: boolean; flag?: string; reason?: string; code?: string; cause?: string; tags?: string[]; seconds?: number };
async function seedLog(recId: string, s: Seed): Promise<string> {
  const r = await one(`SELECT nba_run_id, owner_email, coalesce(segment, 'No micro-segment') AS segment FROM recommendations WHERE id = $1`, [recId]);
  const row = await one(`INSERT INTO decision_log (business_unit_id, nba_run_id, recommendation_id, actor_role, decision, kind, decisive, first_pass, accepted, flag,
      reason, reason_code, cause, tags, seconds, owner_email, segment, edit_rating, created_by)
    VALUES ($1, $2, $3, 'Sales rep', $4, $5, true, true, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
  [ids.buA, r.nba_run_id, recId, s.accepted ? 'Accepted' : `Rejected: ${s.reason}`, s.kind, s.accepted, s.flag ?? null, s.reason ?? '', s.code ?? null, s.cause ?? null,
    s.tags ?? [], s.seconds ?? 120, r.owner_email, r.segment, s.accepted ? 'none' : null, ids.repA]);
  return row.id;
}

let flaggedId = '';
before(async () => {
  db = await freshDatabase('analytics');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
  ({ runId } = await buildPilot(app, owner, ids));
  viewerId = randomUUID();
  await owner.query(`INSERT INTO users (id, email, display_name, status, created_by, updated_by) VALUES ($1, 'viewer.a@demandai.test', 'Viewer A', 'active', $2, $2)`, [viewerId, SYSTEM_USER_ID]);
  await owner.query(`INSERT INTO business_unit_members (business_unit_id, user_id, role, created_by, updated_by) VALUES ($1, $2, 'Viewer', $3, $3)`, [ids.buA, viewerId, SYSTEM_USER_ID]);
  // The rep owns the lead-file owner with the most items that went ahead on their own (an alias of theirs).
  repOwner = (await one(`SELECT owner_email FROM recommendations WHERE passed AND owner_email IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`)).owner_email;
  await owner.query(`INSERT INTO user_owner_aliases (user_id, owner_email, created_by) VALUES ($1, $2, $3)`, [ids.repA, repOwner, ids.adminA]);
  // The seeded log: on the spot path 4 accepted and 1 rejected (all the rep's), on the exception path 3 accepted, one
  // rejected as the wrong fit, and one flagged (decided too fast) that only counts once a manager checks it.
  const passed = (await owner.query(`SELECT id FROM recommendations WHERE passed AND owner_email = $1 ORDER BY position LIMIT 5`, [repOwner])).rows.map(r => r.id);
  const waiting = (await owner.query(`SELECT id FROM recommendations WHERE NOT passed AND owner_email <> $1 ORDER BY position LIMIT 5`, [repOwner])).rows.map(r => r.id);
  for (const id of passed.slice(0, 4)) await seedLog(id, { kind: 'spot', accepted: true, tags: id === passed[0] ? ['=HYPERLINK("http://x")'] : [] });
  await seedLog(passed[4], { kind: 'spot', accepted: false, reason: 'Wrong action', code: 'R6', cause: 'system' });
  for (const id of waiting.slice(0, 3)) await seedLog(id, { kind: 'exception', accepted: true });
  await seedLog(waiting[3], { kind: 'exception', accepted: false, reason: 'Wrong fit', code: 'R1', cause: 'data' });
  flaggedId = await seedLog(waiting[4], { kind: 'exception', accepted: false, reason: 'Signal too weak', code: 'R2', cause: 'data', flag: 'Decided in under 5 seconds', seconds: 2 });
});
after(async () => { await db?.drop(); });

const counts = async () => one(`SELECT count(*) FILTER (WHERE passed)::int auto, count(*) FILTER (WHERE NOT passed)::int exc, count(*) FILTER (WHERE status = 'Released')::int released FROM recommendations`);

test('a seeded log gives the expected G2 and G1; below ten counted decisions it is too early to call; a checked flag then counts', async () => {
  const c = await counts(), n = c.auto + c.exc;
  const g = await as(admin(), s => gatesView(s, mgr()));
  assert.deepEqual([g.measure.autoN, g.measure.excN, g.measure.pooled.n, g.measure.flagged], [c.auto, c.exc, 9, 1]);
  assert.equal(g.measure.weighted, 80 * c.auto / n + 75 * c.exc / n);
  assert.deepEqual([g.gates.g2.state, g.gates.g2.n, g.gates.g2.min], ['early', 9, 10]);
  // G1: nine decisions of 120 s and one of 2 s over the released items, against the 38-minute baseline.
  assert.equal(g.measure.minutes, (9 * 120 + 2) / 60 / c.released);
  assert.equal(g.gates.g1.value, (1 - (9 * 120 + 2) / 60 / c.released / 38) * 100);
  assert.equal(g.gates.g1.state, 'early');
  // The manager checks the flagged decision: a new row linked to it, and it counts.
  const f = await one(`SELECT nba_run_id, recommendation_id FROM decision_log WHERE id = $1`, [flaggedId]);
  await owner.query(`INSERT INTO decision_log (business_unit_id, nba_run_id, recommendation_id, actor_role, decision, kind, linked_to, created_by)
    VALUES ($1, $2, $3, 'Admin', 'Flagged decision checked', 'manager_check', $4, $5)`, [ids.buA, f.nba_run_id, f.recommendation_id, flaggedId, ids.adminA]);
  const h = await as(admin(), s => gatesView(s, mgr()));
  assert.deepEqual([h.measure.pooled.n, h.measure.exc.a, h.measure.exc.n, h.measure.flagged], [10, 3, 5, 0]);
  const g2 = 80 * c.auto / n + 60 * c.exc / n;
  assert.equal(h.gates.g2.value, g2);
  assert.equal(h.gates.g2.state, g2 >= 70 ? 'met' : 'below');
  assert.equal(h.gates.g1.state, 'met');
});

test('own results: a rep sees their own; a manager can look at one rep; only managers can, and only at the unit’s reps (G-014)', async () => {
  const mine = (await one(`SELECT count(*)::int n FROM recommendations WHERE owner_email = $1`, [repOwner])).n;
  const r = await as(rep(), s => gatesView(s, repActor()));
  assert.deepEqual([r.measure.items, r.measure.pooled.n, r.measure.auto.a, r.measure.exc.n, r.own, r.reps.length], [mine, 5, 4, 0, true, 0]);
  const m = await as(admin(), s => gatesView(s, mgr(), 'rep.a@demandai.test'));
  assert.deepEqual([m.measure.items, m.measure.pooled.n, m.rep?.email], [mine, 5, 'rep.a@demandai.test']);
  assert.ok(m.reps.some(x => x.email === 'rep.a@demandai.test'));
  await assert.rejects(as(rep(), s => gatesView(s, repActor(), 'rep.a2@demandai.test')), status(403, /Only a manager/));
  await assert.rejects(as(admin(), s => gatesView(s, mgr(), 'admin.a@demandai.test')), status(400, /sales reps/));
  const f = await as(rep(), s => funnelView(s, repActor()));
  assert.equal(f.stages.find(x => x.k === 'Actions and drafts')!.n, mine);
});

test('the funnel and the evidence read the stored lists, runs, builds and log', async () => {
  const f = await as(admin(), s => funnelView(s, mgr()));
  const list = (await one(`SELECT stats FROM lead_lists WHERE status = 'saved'`)).stats;
  const run = (await one(`SELECT stats FROM scoring_runs WHERE status = 'saved'`)).stats;
  const build = await one(`SELECT segments, engaged FROM nba_runs WHERE id = $1`, [runId]);
  const c = await counts();
  const stage = (k: string) => f.stages.find(x => x.k === k)!;
  assert.deepEqual(f.stages.map(x => x.k), ['Records received', 'Accounts in scope', 'Signals found', 'Accounts scored', 'Accounts in micro-segments', 'Actions and drafts',
    'Completed on their own', 'Decided by a person', 'Released, ready to use']);
  assert.deepEqual([stage('Records received').n, stage('Accounts in scope').n, stage('Signals found').n], [list.rowsRead, list.accountsPass, run.signals]);
  assert.equal(stage('Accounts in micro-segments').n, build.segments.reduce((t: number, x: { accounts: number }) => t + x.accounts, 0));
  assert.match(stage('Accounts in micro-segments').sub, new RegExp(`^${build.segments.length} micro-segments formed in 1 build · \\d+ with no micro-segment · ${build.engaged.length} set aside by engage-once$`));
  assert.deepEqual([stage('Actions and drafts').n, stage('Completed on their own').n, stage('Decided by a person').n], [c.auto + c.exc, c.auto, 10]);
  const sendable = (await one(`SELECT count(DISTINCT account_id)::int n FROM prospect_scores WHERE sendable`)).n;
  assert.equal(stage('Accounts scored').n, sendable);
  const e = await as(admin(), s => evidenceView(s, mgr()));
  assert.equal(e.byTier.reduce((t, x) => t + x.judged, 0), 10);
  assert.deepEqual(e.reasons.map(r => [r.code, r.reason, r.cause]).sort(), [['R1', 'Wrong fit', 'data'], ['R2', 'Signal too weak', 'data'], ['R6', 'Wrong action', 'system']]);
  assert.deepEqual([e.edits.none, e.seconds.spot], [7, 120]);
  const rejected = (await one(`SELECT count(*)::int n FROM signals WHERE status = 'Rejected'`)).n;
  assert.equal(e.dq.reduce((t, d) => t + d.n, 0), rejected);
  assert.ok(e.dq.every(d => Object.entries(CODES).some(([k, v]) => d.label === `${k} ${v}`) || d.label === ''), 'labelled with the data-quality codes');
});

test('the weekly summary: this week’s decisions and reasons, as on screen and as a file; an unknown week is refused', async () => {
  const w = await as(admin(), s => weeklyView(s, mgr(), {}));
  const week = isoWeek(new Date());
  assert.deepEqual([w.week, w.weeks[0]], [week, week]);
  const row = (k: string) => w.rows.find(r => r[0] === k)![1];
  assert.equal(row('Decisions made'), '10 (5 spot-check ratings)');
  assert.match(row('G2 first-pass acceptance'), /^70% of 10 \(exceptions 60%, spot-checks 80%\)$/);
  const built = (await one(`SELECT count(*)::int n FROM decision_log WHERE decision IN ('Proceeded on its own', 'To the exception queue', 'To approvals')`)).n;
  assert.equal(row('Recommendations built'), String(built));
  assert.deepEqual(w.reasons.map(r => r.k).sort(), ['Signal too weak', 'Wrong action', 'Wrong fit']);
  assert.ok(w.exceptions.length > 0, 'why items went to a person, from the build');
  const md = weeklyMarkdown(w);
  assert.match(md, new RegExp(`^# Weekly summary · ${week}\\n\\nFor the business-unit lead\\. Generated `));
  assert.match(md, /\n## Rejection reasons\n- /);
  await assert.rejects(as(admin(), s => weeklyView(s, mgr(), { week: '2020-W01' })), status(400));
});

test('the learning loop: one record per recommendation; a Viewer gets the aggregates only; the outcome log is neutralised', async () => {
  const c = await counts();
  const l = await as(admin(), s => learningLoopView(s, mgr()));
  assert.equal(l.total, c.auto + c.exc);
  assert.equal(l.records!.length, Math.min(300, l.total));
  assert.equal(l.records!.filter(o => /^Accepted|^Rejected|^Edited/.test(o.decision)).length, 10);
  assert.ok(l.signals.length > 0 && l.segments.length > 0 && l.actions.length > 0);
  assert.equal(l.allRate, 70);
  const v = await as(viewer(), s => learningLoopView(s, viewerActor()));
  assert.deepEqual([v.records, v.total, v.allRate, v.viewer], [null, l.total, 70, true]);
  const csv = await as(admin(), s => outcomeLogCsv(s, mgr()));
  assert.equal(csv.rows, l.total);
  assert.match(csv.csv.split(/\r?\n/)[0], /^list,account,vertical,status,tier,micro_segment,/);
  assert.ok(csv.csv.includes(`"'=HYPERLINK(""http://x"")"`), 'a formula in a tag is neutralised (G-052)');
  assert.ok(!/(^|,)=HYPERLINK/m.test(csv.csv));
  const audit = await one(`SELECT details FROM audit_log WHERE action = 'analytics.exported' ORDER BY occurred_at DESC LIMIT 1`);
  assert.deepEqual([audit.details.kind, audit.details.rows], ['outcome-log', l.total]);
});

test('the six success areas and the readout: evidence per area, the gates where a threshold exists, the same text as the download', async () => {
  const a = await as(admin(), s => areasView(s, mgr()));
  const g = await as(admin(), s => gatesView(s, mgr()));
  assert.deepEqual(a.areas.map(x => x.key), ['discovery', 'qualification', 'intent', 'routing', 'content', 'value']);
  const area = (k: string) => a.areas.find(x => x.key === k)!;
  assert.deepEqual([area('qualification').state, area('content').state, area('routing').state, area('value').state], [g.gates.g2.state, g.gates.g1.state, null, null]);
  assert.ok(area('discovery').state === 'met' || area('discovery').state === 'below');
  const ev = (k: string, label: string) => area(k).evidence.find(e => e.label === label)!;
  assert.equal(ev('discovery', 'Records received').value, String((await one(`SELECT stats FROM lead_lists WHERE status = 'saved'`)).stats.rowsRead));
  assert.equal(ev('value', 'People deciding in For Review').value, '1');
  assert.equal(ev('routing', 'Active routing rules').value, '0');
  assert.equal(ev('qualification', 'Rejected as the wrong fit or a weak signal').value, '2');
  const r = await as(admin(), s => readoutView(s, mgr()));
  assert.match(r.text, /^# Pilot readout\n\nGenerated .+ UTC from 1 micro-segment build\. Judged by Config v1; builds made under Config v1\./);
  for (const [i, x] of a.areas.entries()) assert.ok(r.text.includes(`\n## ${i + 1} · ${x.title}\n`), x.title);
  assert.match(r.text, /\n- G2 recommendation acceptance: \d+% on first pass, weighted across both paths \(threshold 70%\): (met|not met)\n/);
  assert.ok(!r.text.includes('undefined') && !r.text.includes('NaN'));
  const v = await as(viewer(), s => readoutView(s, viewerActor()));
  assert.equal(v.areas.length, 6, 'a Viewer reads the readout');
});

test('validation: a manager changes the gate settings, which makes a new configuration version with the change recorded (D-21)', async () => {
  const before = await as(admin(), s => validationView(s, mgr()));
  assert.deepEqual([before.configVersion, before.settings.g2Threshold, before.settings.g1BaselineTimed, before.canEdit, before.readiness.length], [1, 70, false, true, 6]);
  assert.equal(before.readiness.find(c => c.k === 'Baseline')!.ok, false);
  await assert.rejects(as(rep(), s => saveValidation(s, repActor(), { g2Threshold: 75 })), status(403));
  await assert.rejects(as(admin(), s => saveValidation(s, mgr(), { g2Threshold: 140, minDecisions: 2.5 })), (e: HttpError) => e.status === 400 && !!e.fields?.g2Threshold && !!e.fields?.minDecisions);
  await assert.rejects(as(admin(), s => saveValidation(s, mgr(), { g2Threshold: 70 })), status(409, /Nothing changed/));
  const saved = await as(admin(), s => saveValidation(s, mgr(), { g2Threshold: 75, g1BaselineMinutes: 42, g1BaselineTimed: true }));
  assert.deepEqual(saved, { versionNo: 2, changes: ['G1 baseline 38 → 42 min per usable first action', 'Baseline marked as timed by the Client', 'G2 threshold 70% → 75% accepted'] });
  const v2 = await one(`SELECT status, body->>'g2Threshold' g2, body->>'g1BaselineMinutes' base, body->>'g1BaselineTimed' timed FROM config_versions WHERE version_no = 2`);
  assert.deepEqual(v2, { status: 'active', g2: '75', base: '42', timed: 'true' });
  assert.equal((await one(`SELECT status FROM config_versions WHERE version_no = 1`)).status, 'retired');
  const ch = await one(`SELECT kind, changes, before->>'g2Threshold' b, after->>'g2Threshold' a, created_by FROM config_changes`);
  assert.deepEqual([ch.kind, ch.changes.length, ch.b, ch.a, ch.created_by], ['validation', 3, '70', '75', ids.adminA]);
  const after = await as(admin(), s => validationView(s, mgr()));
  assert.deepEqual([after.configVersion, after.versions[0].versionNo, after.versions[0].changes], [2, 2, saved.changes]);
  assert.equal(after.readiness.find(c => c.k === 'Baseline')!.ok, true);
  const g = await as(admin(), s => gatesView(s, mgr()));
  assert.deepEqual([g.gates.g2.threshold, g.measure.base, g.configVersion], [75, 42, 2]);
  assert.deepEqual((await as(admin(), s => getSetup(s))).versions[0].changes, saved.changes, 'Setup shows the version and why it was made');
  await assert.rejects(owner.query(`UPDATE config_changes SET changes = '{}'`), /append-only/);
  const audit = await one(`SELECT details FROM audit_log WHERE action = 'config.validation_changed'`);
  assert.deepEqual([audit.details.versionNo, audit.details.changes], [2, 3]);
});
