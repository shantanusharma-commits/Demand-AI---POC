// For Review on the server against PostgreSQL (G-008, G-062, G-052): the queue and the weekly spot-check draw, the
// two-user flow (a rep decides; sensitive content waits for the sales manager, who approves or sends it back), one
// alternative after a rejection and R3, versioned edits rated minor or major, integrity flags and the manager's check,
// hold, step in, switching the action after release, reassigning, the append-only log, and exports through the
// neutralising CSV writer. Uses the full sample from test-data/.
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
import { saveRun, startScoringRun } from '../../lib/server/services/scoring.ts';
import { createHandoff } from '../../lib/server/services/handoffs.ts';
import { buildNbaRun, getNbaRun, setSegmentPaused } from '../../lib/server/services/nba.ts';
import { itemDetail, openItem } from '../../lib/server/services/recommendations.ts';
import {
  acceptItem, approveItem, checkFlagged, chooseAction, decisionLogRows, drawSpotChecks, fixItem, holdItem, isoWeek, reassign, rejectItem, reviewExport, reviewQueue, sendBack, stepIn, teach,
} from '../../lib/server/services/review.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';
import { AS_OF, DATASET } from '../helpers/answer-key.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics;
const limits: UploadLimits = uploadLimits({ UPLOAD_MAX_BYTES: 25 * 1024 * 1024, UPLOAD_MAX_ROWS: 50_000, UPLOAD_TIME_LIMIT_MS: 120_000, UPLOAD_MAX_UNZIPPED_BYTES: 200 * 1024 * 1024 });
const sample = readFileSync(DATASET);
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const mgr = (): Actor => ({ userId: ids.adminA, role: 'Admin' });
let repEmails: string[] = [];
const rep = (): TenantContext => ({ userId: ids.repA, businessUnitId: ids.buA, scope: 'own', ownerEmails: repEmails });
const repActor = (): Actor => ({ userId: ids.repA, role: 'Sales rep' });
const rep2 = (): TenantContext => ({ userId: ids.repA2, businessUnitId: ids.buA, scope: 'own', ownerEmails: ['rep.a2@demandai.test'] });
const as = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, ctx, fn);
const status = (code: number, re?: RegExp) => (e: HttpError) => e.status === code && (!re || re.test(e.message));
const one = async (q: string, p: unknown[] = []) => (await owner.query(q, p)).rows[0];

let runId = '';
/** The rep's items in the build, by status. */
async function repItems(st: string): Promise<{ id: string; segment: string | null }[]> {
  return (await owner.query(`SELECT id, segment FROM recommendations WHERE nba_run_id = $1 AND owner_email = ANY($2) AND status = $3 ORDER BY position`, [runId, repEmails, st])).rows;
}
const draftOf = async (id: string) => one(`SELECT d.version, d.reason, d.draft, d.action FROM recommendations r JOIN drafts d ON d.recommendation_id = r.id AND d.version = r.draft_version WHERE r.id = $1`, [id]);
const lastLog = async (id: string) => one(`SELECT * FROM decision_log WHERE recommendation_id = $1 ORDER BY seq DESC LIMIT 1`, [id]);

before(async () => {
  db = await freshDatabase('review');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
  await owner.query(`INSERT INTO config_versions (business_unit_id, version_no, status, body, engine_version, created_by, activated_at, activated_by)
    VALUES ($1, 1, 'active', $2, 't', $3, now(), $3)`, [ids.buA, JSON.stringify(serializeConfig()), ids.adminA]);
  const drain = () => createAppWorker(app, limits).drain();
  const up = await as(admin(), s => receiveUpload(s, { kind: 'lead', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: sample }, limits));
  await drain();
  const listId = (await as(admin(), s => getJob(s, up.jobId!)))!.progress.result!.listId;
  await as(admin(), s => saveList(s, mgr(), listId, { name: 'Full sample' }));
  const sig = await as(admin(), s => receiveUpload(s, { kind: 'signal', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: sample }, limits));
  const started = await as(admin(), s => startScoringRun(s, mgr(), { listId, signalUploadId: sig.uploadId, asOf: AS_OF }));
  await drain();
  await as(admin(), s => saveRun(s, mgr(), started.runId, 'Sample scored'));
  const handoffId = (await as(admin(), s => createHandoff(s, mgr(), { runId: started.runId }))).handoffId;
  runId = (await as(admin(), s => buildNbaRun(s, mgr(), { handoffId }))).runId;
  // The rep owns the account owner with the most items waiting in the build.
  const o = await one(`SELECT owner_email FROM recommendations WHERE nba_run_id = $1 AND status = 'Waiting' GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`, [runId]);
  repEmails = [o.owner_email];
});
after(async () => { await db?.drop(); });

test('the queue: a rep sees their own exceptions and this week’s spot-checks; the manager also sees the approvals; one draw per week', async () => {
  const q = await as(rep(), s => reviewQueue(s, repActor()));
  assert.ok(q.items.length > 0 && q.items.every(i => i.ownerEmail === repEmails[0]));
  assert.ok(q.items.every(i => i.status === 'Waiting' || i.spot === 'pending'));
  const draw = await one(`SELECT eligible, cardinality(picked) n, iso_week FROM spot_checks WHERE owner_email = $1`, [repEmails[0]]);
  assert.equal(draw.iso_week, isoWeek(new Date()));
  assert.equal(draw.n, Math.max(1, Math.round(draw.eligible * 0.2)), 'a fifth of what went ahead on its own, at least one');
  assert.equal(q.items.filter(i => i.spot === 'pending').length, draw.n);
  assert.ok(q.items.filter(i => i.spot === 'pending').every(i => i.cats[0] === 'spot' && /spot-check/.test(i.stuck.line)));
  assert.deepEqual(await as(rep(), s => drawSpotChecks(s, repActor())), { week: draw.iso_week, picked: 0 }, 'drawn once a week');
  const m = await as(admin(), s => reviewQueue(s, mgr()));
  const approvals = m.items.filter(i => i.status === 'Awaiting approval');
  assert.ok(approvals.length > 0 && approvals.every(i => i.cats.includes('sensitive')));
  assert.ok(m.items.length > q.items.length && m.reps.length === 2 && q.reps.length === 0);
  const drawn = await one(`SELECT count(*)::int n FROM spot_checks`);
  assert.ok(drawn.n > 1, 'the manager’s visit drew the other owners’ weeks');
  assert.equal((await one(`SELECT count(*)::int n FROM decision_log WHERE decision = 'Picked for the weekly spot-check'`)).n,
    (await one(`SELECT sum(cardinality(picked))::int n FROM spot_checks`)).n);
});

test('two users: the rep accepts with a minor edit; a sensitive edit goes to the manager, who approves it with an edit; another is sent back', async () => {
  const [a, b, c] = await repItems('Waiting');
  // 1 · Accepted with a wording edit: a new version, rated minor, then released.
  const d1 = await draftOf(a.id);
  const field = d1.draft.channel === 'Email' ? 'body' : 'note';
  await as(rep(), s => openItem(s, repActor(), a.id));
  const res = await as(rep(), s => acceptItem(s, repActor(), a.id, { draft: { [field]: d1.draft[field].replace('Hi ', 'Hello ') }, tags: ['Right timing'] }));
  assert.deepEqual([res.status, res.message], ['Released', 'Accepted and released']);
  const v2 = await draftOf(a.id);
  assert.deepEqual([v2.version, /^Edited before accepting \(minor: wording, tone or length only\)$/.test(v2.reason)], [d1.version + 1, true]);
  const l1 = await lastLog(a.id);
  assert.deepEqual([l1.decision, l1.decisive, l1.accepted, l1.kind, l1.first_pass, l1.edit_rating, l1.tags, l1.created_by], ['Accepted with a minor edit', true, true, 'exception', true, 'minor', ['Right timing'], ids.repA]);
  assert.ok(Number.isInteger(l1.seconds) && l1.opened_at, 'timed from when the rep opened it');
  // 2 · The rep's edit mentions a security review: sensitive, so it waits for the manager.
  const d2 = await draftOf(b.id);
  const f2 = d2.draft.channel === 'Email' ? 'body' : 'note';
  const sens = await as(rep(), s => acceptItem(s, repActor(), b.id, { draft: { [f2]: d2.draft[f2] + ' Happy to cover the security review too.' } }));
  assert.deepEqual([sens.status, sens.message], ['Awaiting approval', 'Accepted: sensitive content goes to the sales manager for approval']);
  await assert.rejects(as(rep(), s => approveItem(s, repActor(), b.id, {})), status(403), 'only a manager approves');
  const approvals = (await as(admin(), s => reviewQueue(s, mgr()))).items.filter(i => i.status === 'Awaiting approval').map(i => i.id);
  assert.ok(approvals.includes(b.id));
  const before = await draftOf(b.id);
  const ok = await as(admin(), s => approveItem(s, mgr(), b.id, { draft: { [f2]: before.draft[f2].replace('Happy to cover the security review too.', 'Happy to cover the security review as well.') } }));
  assert.equal(ok.message, 'Approved and released');
  const row = await one(`SELECT status, released, approved_by, edit_rating FROM recommendations WHERE id = $1`, [b.id]);
  assert.deepEqual([row.status, row.released, row.approved_by, row.edit_rating], ['Released', 'approved', ids.adminA, 'minor']);
  assert.match((await draftOf(b.id)).reason, /^Edited by the sales manager before approving \(minor/);
  // 3 · Sent back with a note: back in the rep's queue, saying what the manager asked.
  const d3 = await draftOf(c.id);
  const f3 = d3.draft.channel === 'Email' ? 'body' : 'note';
  await as(rep(), s => acceptItem(s, repActor(), c.id, { draft: { [f3]: d3.draft[f3] + ' We can also discuss the regulatory changes.' } }));
  await assert.rejects(as(admin(), s => sendBack(s, mgr(), c.id, '  ')), status(400));
  await as(admin(), s => sendBack(s, mgr(), c.id, 'Leave out the regulation point'));
  const back = (await as(rep(), s => reviewQueue(s, repActor()))).items.find(i => i.id === c.id)!;
  assert.deepEqual([back.status, back.cats, back.stuck.line], ['Waiting', ['sentback'], 'Sent back by the sales manager: “Leave out the regulation point”.']);
  const l3 = await lastLog(c.id);
  assert.deepEqual([l3.decision, l3.cause, l3.compliance], ['Sent back to the rep', 'compliance', true]);
});

test('step 6–7: R6 brings back the runner-up once, redrafted; rejecting the alternative closes the account; R12 needs a comment', async () => {
  const items = await repItems('Waiting');
  const item = (await Promise.all(items.map(async i => ({ i, d: await as(rep(), s => itemDetail(s, repActor(), i.id)) })))).find(x => x.d.runnerUp && x.d.state.why === 'exception')!;
  await assert.rejects(as(rep(), s => rejectItem(s, repActor(), item.i.id, { code: 'R12' })), status(400, /comment/));
  await assert.rejects(as(rep(), s => rejectItem(s, repActor(), item.i.id, { code: 'R99' })), status(400));
  const r = await as(rep(), s => rejectItem(s, repActor(), item.i.id, { code: 'R6', tags: ['Wrong action'] }));
  assert.deepEqual([r.status, r.outcome], ['Waiting', 'The runner-up action comes back, once']);
  const d = await draftOf(item.i.id);
  assert.deepEqual([d.action, d.reason], [item.d.runnerUp!.action, 'Wrong action: the runner-up']);
  const rejection = await lastLog(item.i.id);
  assert.deepEqual([rejection.reason_code, rejection.cause, rejection.accepted, rejection.action], ['R6', 'system', false, item.d.recommended]);
  const alt = (await as(rep(), s => reviewQueue(s, repActor()))).items.find(i => i.id === item.i.id)!;
  assert.deepEqual([alt.cats, alt.chosenAction], [['alternative'], item.d.runnerUp!.action]);
  const second = await as(rep(), s => rejectItem(s, repActor(), item.i.id, { code: 'R9' }));
  assert.deepEqual([second.status, second.outcome], ['Closed', 'Second rejection: the account is closed for the pilot']);
  const last = await lastLog(item.i.id);
  assert.deepEqual([last.kind, last.linked_to], ['alternative', rejection.id], 'the alternative’s decision links to the rejection it came from');
});

test('G-062 / D-18: R3 sets the account aside and flags its data for the owner; R4 closes it under engage-once', async () => {
  const [x, y] = await repItems('Waiting');
  const r3 = await as(rep(), s => rejectItem(s, repActor(), x.id, { code: 'R3', note: 'The site was sold' }));
  assert.deepEqual([r3.status, r3.message], ['Set aside', 'Wrong company or site: The account is set aside and the data is flagged for its owner']);
  const flagged = await one(`SELECT details FROM audit_log WHERE action = 'recommendation.data_flagged' AND details->>'recommendationId' = $1`, [x.id]);
  assert.equal(flagged.details.code, 'R3');
  assert.equal((await lastLog(x.id)).cause, 'data');
  assert.equal((await as(rep(), s => rejectItem(s, repActor(), y.id, { code: 'R4' }))).status, 'Closed');
});

test('integrity: a decision in under 5 seconds is flagged and counts toward G2 only once a manager has checked it', async () => {
  const [z] = await repItems('Waiting');
  await as(rep(), s => openItem(s, repActor(), z.id));
  const d = await draftOf(z.id);
  if (d.draft.unreachable) return;
  const fast = await as(rep(), s => acceptItem(s, repActor(), z.id, {}));
  assert.match(fast.flag, /^Decided in under 5 seconds/);
  const flaggedRows = await as(admin(), s => decisionLogRows(s, mgr(), { flagged: true }));
  const row = flaggedRows.rows.find(l => l.recommendationId === z.id)!;
  assert.ok(row && !row.checked);
  const g2Before = (await as(admin(), s => reviewQueue(s, mgr()))).measure.flagged;
  await as(admin(), s => checkFlagged(s, mgr(), row.id));
  await assert.rejects(as(admin(), s => checkFlagged(s, mgr(), row.id)), status(409, /already/));
  assert.equal((await as(admin(), s => reviewQueue(s, mgr()))).measure.flagged, g2Before - 1);
  const check = await lastLog(z.id);
  assert.deepEqual([check.kind, check.linked_to, check.decision], ['manager_check', row.id, 'Flagged decision checked']);
});

test('G-007: a message to someone who can’t be contacted is never released, by a rep or a manager', async () => {
  const [w] = await repItems('Waiting');
  const cur = await draftOf(w.id);
  await owner.query(`INSERT INTO drafts (business_unit_id, recommendation_id, version, channel, action, draft, checks, confidence, reason, brand_version_id, created_by)
    SELECT business_unit_id, recommendation_id, version + 1, channel, action, draft || '{"unreachable": true, "why": "Opt-out not confirmed: a person must confirm before anything is sent."}'::jsonb,
      checks, confidence, 'test: unreachable', brand_version_id, created_by FROM drafts WHERE recommendation_id = $1 AND version = $2`, [w.id, cur.version]);
  await owner.query(`UPDATE recommendations SET draft_version = $2 WHERE id = $1`, [w.id, cur.version + 1]);
  await assert.rejects(as(rep(), s => acceptItem(s, repActor(), w.id, {})), status(409, /no way to reach/));
  await assert.rejects(as(admin(), s => acceptItem(s, mgr(), w.id, {})), status(409, /no way to reach/));
  const live = await as(rep(), s => itemDetail(s, repActor(), w.id));
  assert.ok(live.reasons.includes("Can't reach them: Opt-out not confirmed: a person must confirm before anything is sent") && !live.fourChecks.find(f => f.name === 'Reachable')!.ok);
  // Put on hold while the data is fixed: it stays in the queue; taken off hold, it is back.
  await assert.rejects(as(rep(), s => holdItem(s, repActor(), w.id, { why: 'Because' })), status(400));
  await as(rep(), s => holdItem(s, repActor(), w.id, { why: 'Missing contact details', note: 'Asked the account owner' }));
  assert.deepEqual((await as(rep(), s => reviewQueue(s, repActor()))).items.find(i => i.id === w.id)!.hold, { why: 'Missing contact details', note: 'Asked the account owner' });
  await assert.rejects(as(rep(), s => holdItem(s, repActor(), w.id, { why: 'Other' })), status(409));
  await as(rep(), s => holdItem(s, repActor(), w.id, null));
  assert.equal((await lastLog(w.id)).decision, 'Taken off hold');
});

test('after release: the rep steps in (an intervention) or switches to a runner-up that passes; a manager reassigns', async () => {
  const released = await owner.query(`SELECT id FROM recommendations WHERE nba_run_id = $1 AND owner_email = ANY($2) AND released = 'auto' AND spot IS NULL AND runner_up IS NOT NULL ORDER BY position`, [runId, repEmails]);
  const [s1, s2] = released.rows;
  await as(rep(), s => stepIn(s, repActor(), s1.id));
  assert.deepEqual(Object.values(await one(`SELECT status, why FROM recommendations WHERE id = $1`, [s1.id])), ['Waiting', 'stepped in']);
  assert.deepEqual([(await lastLog(s1.id)).kind, (await lastLog(s1.id)).intervention], ['intervention', true]);
  await assert.rejects(as(rep(), s => stepIn(s, repActor(), s1.id)), status(409));
  const item = await as(rep(), s => itemDetail(s, repActor(), s2.id));
  if (item.options.runnerUp!.ok) {
    const sw = await as(rep(), s => chooseAction(s, repActor(), s2.id, { use: 'runner-up' }));
    assert.match(sw.message, /^Switched to the runner-up; the message is redrafted/);
    assert.equal((await lastLog(s2.id)).intervention, true);
  } else {
    await assert.rejects(as(rep(), s => chooseAction(s, repActor(), s2.id, { use: 'runner-up' })), status(409, /can't replace a released message/));
  }
  await assert.rejects(as(rep(), s => chooseAction(s, repActor(), s2.id, { use: 'own', text: 'Call them' })), status(409));
  // Reassigned to the other rep: it leaves this rep's view and joins theirs.
  const [w] = await repItems('Waiting');
  await assert.rejects(as(admin(), s => reassign(s, mgr(), w.id, 'nobody@demandai.test')), status(400));
  await as(admin(), s => reassign(s, mgr(), w.id, 'rep.a2@demandai.test'));
  await assert.rejects(as(rep(), s => itemDetail(s, repActor(), w.id)), status(404));
  assert.equal((await as(rep2(), s => itemDetail(s, { userId: ids.repA2, role: 'Sales rep' }, w.id))).owner.email, 'rep.a2@demandai.test');
  assert.match((await lastLog(w.id)).decision, /^Reassigned to rep\.a2$/);
  const hist = await as(rep2(), s => itemDetail(s, { userId: ids.repA2, role: 'Sales rep' }, w.id));
  assert.ok(hist.history.length >= 2, 'the new owner sees the item’s history');
});

test('fixes on the account: confirming the contact or the deal size drops that reason; a paused micro-segment can’t be decided', async () => {
  const q = (await as(rep(), s => reviewQueue(s, repActor()))).items.filter(i => i.cats.includes('deal') && !i.hold);
  const it = q[0];
  await as(rep(), s => fixItem(s, repActor(), it.id, { kind: 'deal' }));
  const after = (await as(rep(), s => reviewQueue(s, repActor()))).items.find(i => i.id === it.id)!;
  assert.ok(!after.cats.includes('deal'));
  assert.equal((await lastLog(it.id)).note, 'Worth it anyway');
  await assert.rejects(as(rep(), s => fixItem(s, repActor(), it.id, { kind: 'small', segment: 'Nope' })), status(400));
  await as(admin(), s => setSegmentPaused(s, mgr(), runId, it.formedSegment ?? '', true));
  await assert.rejects(as(rep(), s => acceptItem(s, repActor(), it.id, {})), status(409, /paused/));
  assert.ok((await as(rep(), s => reviewQueue(s, repActor()))).items.find(i => i.id === it.id)!.paused);
  await as(admin(), s => setSegmentPaused(s, mgr(), runId, it.formedSegment ?? '', false));
  await as(rep(), s => teach(s, repActor(), it.id, { tags: ['Right action'], note: 'Small sites still buy' }));
  await assert.rejects(as(rep(), s => teach(s, repActor(), it.id, {})), status(400));
});

test('the decision log: a rep sees the decisions they made, the manager sees everyone’s; another rep’s item is a 404', async () => {
  const mine = await as(rep(), s => decisionLogRows(s, repActor(), {}));
  assert.ok(mine.rows.length > 0 && mine.rows.every(r => r.who === 'rep.a'));
  const all = await as(admin(), s => decisionLogRows(s, mgr(), {}));
  assert.ok(all.rows.some(r => r.who === 'System') && all.rows.some(r => r.who === 'admin.a'));
  const page = await as(admin(), s => decisionLogRows(s, mgr(), { limit: 5 }));
  const next = await as(admin(), s => decisionLogRows(s, mgr(), { limit: 5, before: page.next! }));
  assert.ok(next.rows[0].seq < page.rows[4].seq);
  const searched = await as(admin(), s => decisionLogRows(s, mgr(), { q: 'sent back' }));
  assert.ok(searched.rows.length > 0 && searched.rows.every(r => /sent back/i.test(r.decision + r.note)));
  const other = await one(`SELECT id FROM recommendations WHERE nba_run_id = $1 AND owner_email <> ALL($2) AND status = 'Waiting' LIMIT 1`, [runId, repEmails]);
  for (const f of [(s: Parameters<typeof acceptItem>[0]) => acceptItem(s, repActor(), other.id, {}), (s: Parameters<typeof acceptItem>[0]) => rejectItem(s, repActor(), other.id, { code: 'R1' })]) {
    await assert.rejects(as(rep(), f), status(404));
  }
});

test('G-052: exports go through the CSV writer that neutralises formulas; a rep exports their own items only', async () => {
  const v = await one(`SELECT r.id FROM recommendations r JOIN drafts d ON d.recommendation_id = r.id AND d.version = r.draft_version
    WHERE r.nba_run_id = $1 AND r.owner_email = ANY($2) AND r.status = 'Waiting' AND d.channel = 'Email' AND NOT (d.draft->>'unreachable')::boolean ORDER BY r.position LIMIT 1`, [runId, repEmails]);
  const d = await draftOf(v.id);
  await as(rep(), s => acceptItem(s, repActor(), v.id, { draft: { subject: '=HYPERLINK("http://evil.example")' } }));
  const released = await as(rep(), s => reviewExport(s, repActor(), 'released-messages'));
  assert.equal(released.fileName, 'released_messages.csv');
  assert.match(released.csv, /^owner,prospect,job_title,company,email,linkedin_url,micro_segment,action,channel,subject,message,linkedin_note,released,released_by,released_at,outcome\r\n/);
  assert.equal(d.draft.channel, 'Email');
  assert.ok(released.csv.includes(`"'=HYPERLINK(""http://evil.example"")"`), 'a formula is written as text');
  assert.ok(!/(^|,)=HYPERLINK/m.test(released.csv));
  const all = await as(admin(), s => reviewExport(s, mgr(), 'released-messages'));
  assert.ok(all.rows > released.rows);
  const log = await as(admin(), s => reviewExport(s, mgr(), 'decision-log'));
  assert.equal(log.rows, (await one(`SELECT count(*)::int n FROM decision_log`)).n);
  const tasks = await as(admin(), s => reviewExport(s, mgr(), 'tasks'));
  assert.match(tasks.csv, /^owner,prospect,company,micro_segment,task,why,call_opener,questions,objection,response,ask,outcome/);
  assert.equal((await one(`SELECT count(*)::int n FROM audit_log WHERE action = 'review.exported'`)).n, 4);
});

test('the log is append-only even for the database owner, and every decision carries the versions it was made with', async () => {
  await assert.rejects(owner.query(`UPDATE decision_log SET decision = 'x'`), /append-only/);
  await assert.rejects(owner.query(`DELETE FROM decision_log`), /append-only/);
  const missing = await one(`SELECT count(*)::int n FROM decision_log WHERE brand_version_id IS NULL OR config_version_id IS NULL`);
  assert.equal(missing.n, 0);
  const run = await as(admin(), s => getNbaRun(s, runId));
  assert.ok(run.recs.some(r => r.status === 'Set aside') && run.recs.some(r => r.status === 'Closed'));
});
