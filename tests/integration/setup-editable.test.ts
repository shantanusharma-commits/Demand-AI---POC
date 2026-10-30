// Setup an Admin edits (product owner, 30 Oct 2026; replaces the D-13 lock), against PostgreSQL on the full sample:
// the scoring settings saved as a new version with what changed and the sections reopened, the preview of tier changes,
// the lock for the measurement weeks and the sponsor's sign-off; the action library; the micro-segments list with a
// manager's approval releasing what waited only for it; the NBA and For Review downloads.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { DEFAULT_SCORING } from '../../lib/demandai-engine.ts';
import { DEFAULT_ACTIONS } from '../../lib/engine/actions.ts';
import { editableCopy, newPart } from '../../lib/engine/settings.ts';
import { NEW_SEGMENT } from '../../lib/engine/review.ts';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import type { Actor } from '../../lib/server/services/lists.ts';
import { getSetup, previewScoring, saveActions, saveScoring, setScoringLock, signOffSection } from '../../lib/server/services/setup.ts';
import { decideSegment, listSegments } from '../../lib/server/services/segments.ts';
import { acceptItem, queueRows, releaseForSegment, reviewExport, needsPersonSql } from '../../lib/server/services/review.ts';
import { nbaRunCsv } from '../../lib/server/services/nba.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';
import { buildPilot } from './pilot.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics, runId = '';
const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const adminActor = (): Actor => ({ userId: ids.adminA, role: 'Admin' });
const as = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, admin(), fn);
const status = (code: number, re?: RegExp) => (e: HttpError) => e.status === code && (!re || re.test(e.message));
const one = async (q: string, p: unknown[] = []) => (await owner.query(q, p)).rows[0];

before(async () => {
  db = await freshDatabase('setup-editable');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
  ({ runId } = await buildPilot(app, owner, ids));
});
after(async () => { await db?.drop(); });

test('scoring settings: the starting values are shown; a change is previewed, saved as a version with its words, and reopens the rubric', async () => {
  const s0 = await as(s => getSetup(s));
  assert.deepEqual(s0.scoring.settings, DEFAULT_SCORING, 'a unit that never edited them scores with the starting values');
  assert.equal(s0.scoring.lock.mode, 'open');
  await as(s => signOffSection(s, adminActor(), 'rubric', 'sign_off'));
  const next = editableCopy(DEFAULT_SCORING);
  next.parts.find(p => p.key === 'site')!.weight = 10;
  next.parts.push({ ...newPart(next.parts, 'Home market'), weight: 10, column: 'country', rules: [{ when: 'is', value: 'Singapore', points: 100 }], otherwise: 20 });
  next.tiers = { A: 30, B: 15 };
  const pv = await as(s => previewScoring(s, next));
  assert.ok(pv.run && pv.accounts > 0, 'previewed on the newest scored list');
  assert.ok(pv.changed > 0 && pv.moves.length, 'lower cut-offs move accounts up');
  assert.equal(pv.moves.reduce((t, m) => t + m.n, 0), pv.changed);
  await assert.rejects(as(s => previewScoring(s, { ...next, tiers: { A: 10, B: 20 } })), status(400, /Tier B must start below tier A/));
  await assert.rejects(as(s => saveScoring(s, adminActor(), { settings: next, reason: '' })), status(400, /Say why/));
  const saved = await as(s => saveScoring(s, adminActor(), { settings: next, reason: 'Agreed on the call' }));
  assert.ok(saved.changes.includes('Site profile weight: 20% → 10%') && saved.changes.includes('Part added: Home market (10%, reads Country)') && saved.changes.includes('Tier A from: 35 → 30'));
  const s1 = await as(s => getSetup(s));
  assert.equal(s1.version.versionNo, saved.versionNo);
  assert.deepEqual(s1.scoring.settings.tiers, { A: 30, B: 15 });
  assert.equal(s1.sections.rubric.status, 'review', 'a signed-off rubric goes back to review');
  const ch = await one(`SELECT kind, changes FROM config_changes WHERE kind = 'scoring'`);
  assert.ok(ch.changes.includes('Why: Agreed on the call'));
  await assert.rejects(as(s => saveScoring(s, adminActor(), { settings: next, reason: 'again' })), status(409, /Nothing changed/));
  await assert.rejects(as(s => saveScoring(s, adminActor(), { settings: { ...next, parts: next.parts.slice(1) }, reason: 'x' })), status(400, /add up to/));
});

test('the lock: locked refuses any change; "sponsor" asks who signed it off and records it', async () => {
  const next = editableCopy((await as(s => getSetup(s))).scoring.settings);
  next.fitFloor = 45;
  await as(s => setScoringLock(s, adminActor(), { mode: 'locked', note: 'weeks 3 to 6' }));
  await assert.rejects(as(s => saveScoring(s, adminActor(), { settings: next, reason: 'x' })), status(409, /locked for the measurement weeks \(weeks 3 to 6\)/));
  await as(s => setScoringLock(s, adminActor(), { mode: 'sponsor', note: '' }));
  await assert.rejects(as(s => saveScoring(s, adminActor(), { settings: next, reason: 'x' })), status(400, /sponsor's sign-off/));
  const r = await as(s => saveScoring(s, adminActor(), { settings: next, reason: 'Floor lowered', sponsor: { name: 'Plant director', note: 'by email' } }));
  const ch = await one(`SELECT changes FROM config_changes WHERE kind = 'scoring' ORDER BY seq DESC LIMIT 1`);
  assert.ok(ch.changes.includes('Signed off by the sponsor: Plant director (by email)'));
  assert.ok(r.changes.includes('Fit floor: 50 → 45'));
  await as(s => setScoringLock(s, adminActor(), { mode: 'open', note: '' }));
});

test('the action library: starting actions with their acceptance; an edit is a version; one active action at least', async () => {
  const s0 = await as(s => getSetup(s));
  assert.equal(s0.actions.list.length, DEFAULT_ACTIONS.length);
  assert.ok(s0.actions.list.every(a => a.about.length > 10 && a.status === 'active'));
  const next = s0.actions.list.map(({ judged: _j, accepted: _a, ...a }) => { void _j; void _a; return a; });
  next[0] = { ...next[0], status: 'retired' };
  next.push({ id: 'offer-a-plant-tour', name: 'Offer a plant tour', about: 'Invite them to see a running site. Use for a new project team.', suits: ['Capital project'], segment: '', status: 'active' });
  const r = await as(s => saveActions(s, adminActor(), { actions: next, reason: 'Pilot week 2' }));
  assert.ok(r.changes.includes('Action added: Offer a plant tour') && r.changes.includes(`${next[0].name}: retired`));
  await assert.rejects(as(s => saveActions(s, adminActor(), { actions: next.map(a => ({ ...a, status: 'retired' })), reason: '' })), status(400, /at least one action active/));
  await assert.rejects(as(s => saveActions(s, adminActor(), { actions: [...next, { ...next[1], id: 'dup' }], reason: '' })), status(400, /same name/));
});

test('micro-segments: the rules’ and the new; a new one holds its items until a manager approves it, then what waited only for it goes ahead', async () => {
  // An AI-made segment, waiting, on two items that waited for nothing else.
  const items = (await owner.query(`SELECT id FROM recommendations WHERE nba_run_id = $1 AND NOT passed AND status = 'Waiting' ORDER BY position LIMIT 2`, [runId])).rows.map(r => r.id);
  await owner.query(`UPDATE recommendations SET segment = 'Plant upgrades', reasons = $2 WHERE id = ANY($1)`, [items, [NEW_SEGMENT]]);
  const seg = await one(`INSERT INTO micro_segments (business_unit_id, name, theme, why, origin, status, created_by, updated_by)
    VALUES ($1, 'Plant upgrades', 'Sites upgrading ageing control systems', 'Three accounts with end-of-support and project signals', 'ai', 'waiting', $2, $2) RETURNING id`, [ids.buA, ids.adminA]);
  const list = await as(s => listSegments(s));
  assert.ok(list.some(x => x.origin === 'rules' && x.name === 'Inquiry'));
  const mine = list.find(x => x.name === 'Plant upgrades')!;
  assert.deepEqual([mine.origin, mine.status, mine.waiting], ['ai', 'waiting', 2]);
  const q = (await as(s => queueRows(s, needsPersonSql))).filter(x => items.includes(x.id));
  assert.ok(q.every(x => x.cats.includes('newseg')), 'tagged "New segment: needs approval"');
  await assert.rejects(as(s => acceptItem(s, adminActor(), items[0], {})), status(409, /waits for the sales manager's approval/));
  await assert.rejects(as(s => decideSegment(s, { userId: ids.repA, role: 'Sales rep' }, seg.id, { action: 'approve' })), status(403));
  const r = await as(s => decideSegment(s, adminActor(), seg.id, { action: 'approve' }, releaseForSegment));
  assert.match(r.message, /approved: 2 items that waited only for it went ahead/);
  const after = (await owner.query(`SELECT status, released FROM recommendations WHERE id = ANY($1)`, [items])).rows;
  assert.deepEqual(after.map(x => [x.status, x.released]), [['Released', 'approved'], ['Released', 'approved']]);
  // Renamed, then merged into a rules' segment: its items move with it, and its former names are kept.
  await as(s => decideSegment(s, adminActor(), seg.id, { action: 'rename', name: 'Control upgrades' }));
  assert.equal((await one(`SELECT count(*)::int n FROM recommendations WHERE segment = 'Control upgrades'`)).n, 2);
  await assert.rejects(as(s => decideSegment(s, adminActor(), seg.id, { action: 'rename', name: 'inquiry' })), status(409, /already a micro-segment/));
  await as(s => decideSegment(s, adminActor(), seg.id, { action: 'merge', into: 'Modernisation' }));
  const m = await one(`SELECT status, former_names FROM micro_segments WHERE id = $1`, [seg.id]);
  assert.deepEqual([m.status, m.former_names], ['retired', ['plant upgrades']]);
  assert.equal((await one(`SELECT count(*)::int n FROM recommendations WHERE id = ANY($1) AND segment = 'Modernisation'`, [items])).n, 2);
  await assert.rejects(owner.query(`DELETE FROM micro_segments`), /append-only/);
});

test('downloads: a build as a file and everything in For Review, owner-scoped, formulas neutralised', async () => {
  const n = await as(s => nbaRunCsv(s, adminActor(), runId));
  const head = n.csv.split(/\r?\n/)[0];
  assert.match(head, /^owner,prospect,job_title,persona,company,.*,micro_segment,signal,signal_date,signal_detail,action,runner_up,channel,confidence,where_it_is,why_it_needs_a_person,subject,message/);
  assert.equal(n.rows, (await one(`SELECT count(*)::int n FROM recommendations WHERE nba_run_id = $1`, [runId])).n);
  assert.ok(/Went ahead on its own|Waiting in For Review/.test(n.csv));
  const f = await as(s => reviewExport(s, adminActor(), 'for-review'));
  assert.match(f.csv.split(/\r?\n/)[0], /^owner,prospect,job_title,company,email,linkedin_url,list,micro_segment,action,channel,where_it_is,why_it_needs_a_person,/);
  assert.equal(f.rows, (await as(s => queueRows(s, needsPersonSql))).length);
  const audit = (await owner.query(`SELECT action FROM audit_log WHERE action IN ('nba.exported', 'review.exported')`)).rows.map(r => r.action).sort();
  assert.deepEqual(audit, ['nba.exported', 'review.exported']);
});
