// Today on the server against PostgreSQL (G-010): the empty state before anything is built, what waits for the
// signed-in person (a rep's own items; a manager's team queue and approvals), outcomes to mark, the success gates,
// this week's spot-checks, what the system did, recent lists, the set-up card, and the blockers (a rep's held items,
// a scheduled run that didn't run, readiness gaps, an expired claim an open action needs). Full sample from test-data/.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import type { Actor } from '../../lib/server/services/lists.ts';
import { setSegmentPaused } from '../../lib/server/services/nba.ts';
import { markOutcome, openItem } from '../../lib/server/services/recommendations.ts';
import { acceptItem, isoWeek, rejectItem, stepIn } from '../../lib/server/services/review.ts';
import { today, type TodayView } from '../../lib/server/services/today.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';
import { buildPilot } from './pilot.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics, runId = '', scoringRunId = '';
let repEmails: string[] = [];
const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const mgr = (): Actor => ({ userId: ids.adminA, role: 'Admin' });
const rep = (): TenantContext => ({ userId: ids.repA, businessUnitId: ids.buA, scope: 'own', ownerEmails: repEmails });
const repActor = (): Actor => ({ userId: ids.repA, role: 'Sales rep' });
const as = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, ctx, fn);
const one = async (q: string, p: unknown[] = []) => (await owner.query(q, p)).rows[0];
type Full = Extract<TodayView, { nothing: false }>;
const full = (v: TodayView): Full => { assert.equal(v.nothing, false); return v as Full; };

before(async () => {
  db = await freshDatabase('today');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
});
after(async () => { await db?.drop(); });

test('before anything is built, Today says so (and draws nothing)', async () => {
  const v = await as({ userId: ids.repB, businessUnitId: ids.buB, scope: 'own', ownerEmails: ['rep.b@demandai.test'] }, s => today(s, { userId: ids.repB, role: 'Sales rep' }));
  assert.equal(v.nothing, true);
  ({ runId, scoringRunId } = await buildPilot(app, owner, ids));
  const o = await one(`SELECT owner_email FROM recommendations WHERE nba_run_id = $1 AND status = 'Waiting' GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`, [runId]);
  repEmails = [o.owner_email];
  assert.equal((await one(`SELECT count(*)::int n FROM spot_checks`)).n, 0);
});

test('a manager sees the team: the whole queue, the approvals, the spot-checks drawn, what the system did, the set-up card', async () => {
  const v = full(await as(admin(), s => today(s, mgr())));
  const week = isoWeek(new Date());
  const drawn = await one(`SELECT coalesce(sum(cardinality(picked)), 0)::int n FROM spot_checks WHERE iso_week = $1`, [week]);
  assert.ok(drawn.n > 0, 'opening Today drew the week’s spot-checks');
  assert.deepEqual([v.spot.week, v.spot.picked, v.spot.rated], [week, drawn.n, 0]);
  const queued = await one(`SELECT count(*)::int n FROM recommendations WHERE status = 'Waiting' OR spot = 'pending'`);
  assert.equal(v.queue.length, queued.n);
  assert.equal(v.queue.filter(x => x.spot === 'pending').length, drawn.n);
  assert.ok(v.queue.every(x => x.cats.length && x.reason && x.whyHere && x.routedAt instanceof Date));
  const held = await one(`SELECT count(*)::int n FROM recommendations WHERE status = 'Awaiting approval'`);
  assert.ok(held.n > 0);
  assert.equal(v.approvals.total, held.n);
  assert.ok(v.approvals.rows.length <= 5 && v.approvals.rows.every(x => x.cats.includes('sensitive')));
  const went = await one(`SELECT count(*) FILTER (WHERE released = 'auto')::int went, count(*)::int n FROM recommendations WHERE nba_run_id = $1`, [runId]);
  assert.deepEqual([v.latest?.id, v.latest?.went, v.latest?.needed], [runId, went.went, went.n - went.went]);
  assert.equal(v.ready.total, went.went - drawn.n, 'released on their own and not picked for a spot-check: waiting for an outcome');
  assert.deepEqual(v.recent.map(r => r.kind), ['Micro-segments', 'Scored list', 'Prospect list']);
  assert.deepEqual([v.setup?.configVersion, v.setup?.brandVersion, v.setup?.brandDraft, v.setup?.readiness?.total, v.setup?.saved], [1, 1, false, 6, 3]);
  assert.deepEqual([v.gates.g2.state, v.gates.g1.state, v.measure.items], ['none', 'none', went.n]);
  assert.equal(v.withManager.total, 0, 'managers approve; they have nothing waiting on someone else');
  // Readiness: the baseline is still the placeholder, so measurement isn't ready yet; that is a manager's blocker.
  const gaps = v.blockers.find(b => b.title === 'Not enough data to measure the pilot yet')!;
  assert.match(gaps.detail, /Baseline: 38 min per usable first action, needs a timed baseline from the Client on the same data/);
  assert.equal(gaps.href, '/analytics?tab=validation');
  assert.ok(!v.blockers.some(b => /didn't run/.test(b.title)), 'everything ran today');
  // Rows the sample fails on hard stops weren't loaded: a manager's blocker while the upload is recent.
  const st = (await one(`SELECT stats FROM lead_lists WHERE status = 'saved'`)).stats;
  const stops = st.notLoaded || st.issuesBySeverity?.stop || 0;
  const upload = v.blockers.find(b => /^Upload partly rejected/.test(b.title));
  if (stops) assert.deepEqual([upload?.title, upload?.href.startsWith('/prospecting?list=')], [`Upload partly rejected: ${stops} row${stops === 1 ? '' : 's'} of "Full sample" failed hard stops`, true]);
  else assert.equal(upload, undefined);
});

test('a paused micro-segment leaves the queue and the approvals until it is resumed', async () => {
  const seg = await one(`SELECT segment FROM recommendations WHERE nba_run_id = $1 AND segment IS NOT NULL AND (status = 'Waiting' OR spot = 'pending' OR status = 'Awaiting approval')
    GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`, [runId]);
  const inSeg = (await owner.query(`SELECT id FROM recommendations WHERE nba_run_id = $1 AND segment = $2`, [runId, seg.segment])).rows.map(r => r.id);
  const v0 = full(await as(admin(), s => today(s, mgr())));
  await as(admin(), s => setSegmentPaused(s, mgr(), runId, seg.segment, true, 'test'));
  const v1 = full(await as(admin(), s => today(s, mgr())));
  assert.ok(!v1.queue.some(x => inSeg.includes(x.id)) && !v1.approvals.rows.some(x => inSeg.includes(x.id)));
  assert.ok(v1.queue.length + v1.approvals.total < v0.queue.length + v0.approvals.total);
  await as(admin(), s => setSegmentPaused(s, mgr(), runId, seg.segment, false));
  const v2 = full(await as(admin(), s => today(s, mgr())));
  assert.deepEqual([v2.queue.length, v2.approvals.total], [v0.queue.length, v0.approvals.total]);
});

test('a rep sees only their own items, what waits on the manager, and no set-up card (G-014)', async () => {
  const v = full(await as(rep(), s => today(s, repActor())));
  const mine = (await owner.query(`SELECT id FROM recommendations WHERE owner_email = ANY($1) AND (status = 'Waiting' OR spot = 'pending')`, [repEmails])).rows.map(r => r.id).sort();
  assert.deepEqual(v.queue.map(x => x.id).sort(), mine);
  const m = full(await as(admin(), s => today(s, mgr())));
  assert.ok(m.queue.length > v.queue.length);
  assert.deepEqual([v.approvals.total, v.setup], [0, null]);
  const held = (await one(`SELECT count(*)::int n FROM recommendations WHERE owner_email = ANY($1) AND status = 'Awaiting approval'`, [repEmails])).n;
  assert.equal(v.withManager.total, held);
  if (held) assert.match(v.blockers[0].title, /held for the sales manager's approval$/);
  assert.ok(!v.blockers.some(b => /Not enough data|Upload partly rejected/.test(b.title)), 'readiness and uploads are the manager’s to fix');
  const own = (await one(`SELECT count(*)::int n FROM recommendations WHERE owner_email = ANY($1)`, [repEmails])).n;
  assert.equal(v.measure.items, own, 'the gates over the rep’s own results');
});

test('deciding and marking outcomes move Today: the gates count decisions, a rated spot-check counts, a marked outcome leaves the list', async () => {
  const v0 = full(await as(rep(), s => today(s, repActor())));
  const spot = v0.queue.find(x => x.spot === 'pending');
  const exc = v0.queue.filter(x => x.spot !== 'pending');
  await as(rep(), s => openItem(s, repActor(), exc[0].id));
  const accepted = await as(rep(), s => acceptItem(s, repActor(), exc[0].id, {}));
  await as(rep(), s => rejectItem(s, repActor(), exc[1].id, { code: 'R1' }));
  if (spot) await as(rep(), s => acceptItem(s, repActor(), spot.id, {}));
  // The rep accepts one with an edit that adds sensitive content: it waits on the manager, never in the rep's approvals.
  const d = (await one(`SELECT d.draft FROM recommendations r JOIN drafts d ON d.recommendation_id = r.id AND d.version = r.draft_version WHERE r.id = $1`, [exc[2].id])).draft;
  const field = d.channel === 'Email' ? 'body' : d.channel === 'LinkedIn' ? 'note' : 'task';
  const sens = await as(rep(), s => acceptItem(s, repActor(), exc[2].id, { draft: { [field]: `${d[field] || ''} Happy to cover the security review too.` } }));
  assert.equal(sens.status, 'Awaiting approval');
  // A step-in on an item that went ahead (this week's draw passed it over) is not a spot-check rating.
  const passed = await one(`SELECT id FROM recommendations WHERE owner_email = ANY($1) AND released = 'auto' AND spot IS NULL AND spot_week IS NOT NULL LIMIT 1`, [repEmails]);
  await as(rep(), s => stepIn(s, repActor(), passed.id));
  await as(rep(), s => rejectItem(s, repActor(), passed.id, { code: 'R12', note: 'Not now' }));
  // Someone else's item decided by the manager stays out of the rep's measures.
  const other = await one(`SELECT id FROM recommendations WHERE NOT (owner_email = ANY($1)) AND status = 'Waiting' LIMIT 1`, [repEmails]);
  await as(admin(), s => rejectItem(s, mgr(), other.id, { code: 'R2' }));
  const v1 = full(await as(rep(), s => today(s, repActor())));
  assert.equal(v1.queue.length, v0.queue.length - 3 - (spot ? 1 : 0));
  assert.equal(v1.spot.rated, spot ? 1 : 0);
  assert.deepEqual([v1.approvals.total, v1.withManager.total >= 1], [0, true]);
  assert.match(v1.blockers[0].title, /held for the sales manager's approval$/);
  // The accept was timed from when the rep opened it, under 5 seconds, so it is flagged and doesn't count until a
  // manager checks it; the others were never opened (no start time, so no flag) and count. Too few to call either way.
  assert.equal(v1.measure.flagged, 1);
  assert.equal(v1.measure.interventions, 1);
  assert.deepEqual([v1.gates.g2.n, v1.gates.g2.state], [spot ? 3 : 2, 'early']);
  if (accepted.status === 'Released') {
    const ready = v1.ready.total;
    await as(rep(), s => markOutcome(s, repActor(), exc[0].id, 'Replied'));
    const v2 = full(await as(rep(), s => today(s, repActor())));
    assert.deepEqual([v2.ready.total, v2.outcomes.marked, v2.outcomes.positive], [ready - 1, 1, 1]);
    assert.ok(!v2.ready.rows.some(r => r.id === exc[0].id));
  }
});

test('blockers: a scheduled run that didn’t run, and an expired claim that open actions need', async () => {
  await owner.query(`UPDATE nba_runs SET created_at = now() - interval '3 days'`);
  await owner.query(`UPDATE scoring_runs SET created_at = now() - interval '10 days' WHERE id = $1`, [scoringRunId]);
  const live = await one(`SELECT pack FROM brand_versions WHERE business_unit_id = $1 ORDER BY version_no DESC LIMIT 1`, [ids.buA]);
  const claim = live.pack.claims.find((c: { status: string }) => c.status === 'approved');
  live.pack.claims = live.pack.claims.map((c: { id: string }) => (c.id === claim.id ? { ...c, expiry: '2020-01-31' } : c));
  await owner.query(`INSERT INTO brand_versions (business_unit_id, version_no, pack, note, created_by) VALUES ($1, 2, $2, 'test: an expired claim', $3)`, [ids.buA, JSON.stringify(live.pack), ids.adminA]);
  const v = full(await as(admin(), s => today(s, mgr())));
  const titles = v.blockers.map(b => b.title);
  assert.ok(titles.includes("Scheduled run didn't run: Micro-segments & NBA build"));
  assert.ok(titles.includes("Scheduled run didn't run: Signal file scoring"));
  assert.match(v.blockers.find(b => /NBA build$/.test(b.title))!.detail, /^Last ran 3d ago; it's expected every day\./);
  const exp = v.blockers.find(b => b.title === `Proof expired: "${claim.title}" (${claim.id})`)!;
  assert.match(exp.detail, /^Expired 2020-01-31\. \d+ open actions? in .+ can't cite it any more/);
  assert.deepEqual([exp.href, exp.who], ['/content?tab=claims', 'Admin']);
  assert.equal(v.setup?.brandVersion, 2);
});
