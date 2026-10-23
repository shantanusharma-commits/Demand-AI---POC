// Copilot on the server against PostgreSQL (G-013): rule answers from the data the person can see (owner-scoped), the
// model only for questions the rules don't cover, with people as tokens and the screen's data within row budgets;
// nothing personal in what is sent; and the record of each model call. Run with --conditions=react-server.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { setAiGatewayForTests } from '../../lib/server/ai.ts';
import { createDb, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { askCopilot, BUDGET, type CopilotInput } from '../../lib/server/services/copilot.ts';
import { runAutopilot, undoAutopilot } from '../../lib/server/services/autopilot.ts';
import { drawSpotChecks } from '../../lib/server/services/review.ts';
import { logFacts } from '../../lib/server/services/recommendations.ts';
import { withTenant } from '../../lib/server/db/tenant.ts';
import * as R from '../../lib/engine/review.ts';
import type { CopilotBlock } from '../../lib/copilot/types.ts';
import { FakeModel, reply } from '../helpers/fake-model.ts';
import { ALL_ON, fakeGateway } from './ai-fixtures.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';
import { buildPilot } from './pilot.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics, built: Awaited<ReturnType<typeof buildPilot>>;
let repEmail = '';
const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const rep = (): TenantContext => ({ userId: ids.repA, businessUnitId: ids.buA, scope: 'own', ownerEmails: ['rep.a@demandai.test', repEmail] });
const ask = (ctx: TenantContext, input: Partial<CopilotInput> & { question: string }, role: 'Admin' | 'Sales rep' = ctx.scope === 'all' ? 'Admin' : 'Sales rep') =>
  askCopilot(app, ctx, { userId: ctx.userId, role }, { screen: 'review', ref: {}, turns: [], chip: false, offset: 0, ...input });
const ids_ = (blocks: CopilotBlock[]) => blocks.flatMap(b => (b.t === 'items' ? b.rows.map(r => r.id) : []));
const EMAIL = /[A-Z0-9._%+'-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;

before(async () => {
  db = await freshDatabase('copilot');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
  built = await buildPilot(app, owner, ids);
  repEmail = (await owner.query(`SELECT owner_email FROM recommendations WHERE nba_run_id = $1 AND (status IN ('Waiting', 'Awaiting approval') OR spot = 'pending') GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`, [built.runId])).rows[0].owner_email;
  await owner.query(`INSERT INTO user_owner_aliases (user_id, owner_email, created_by) VALUES ($1, $2, $1)`, [ids.repA, repEmail]);
});
after(async () => { setAiGatewayForTests(undefined); await db?.drop(); });

test('the queue questions are answered by the rules, from what the person can see', async () => {
  const first = await ask(admin(), { question: 'What should I do first?', chip: true });
  assert.equal(first.source, 'rules');
  assert.match((first.blocks[0] as { text: string }).text, /^Start with \*\*/);
  const href = first.blocks.find(b => b.t === 'items') as Extract<CopilotBlock, { t: 'items' }>;
  assert.match(href.rows[0].href, /^\/review\?item=[0-9a-f-]{36}$/);
  const count = await ask(admin(), { question: 'how many are waiting?' });
  assert.match((count.blocks[0] as { text: string }).text, /^You have \*\*\d+ items\*\* in For Review/);
  // A rep's answers hold their own items only (both layers: the policies and the service's owner filter).
  const mine = await ask(rep(), { question: 'Group my queue by the most common reason' });
  const theirs = (await owner.query(`SELECT id FROM recommendations WHERE owner_email = $1`, [repEmail])).rows.map(r => r.id);
  const repFirst = await ask(rep(), { question: 'What should I do first?' });
  assert.ok(ids_(repFirst.blocks).length > 0 && ids_(repFirst.blocks).every(i => theirs.includes(i)));
  assert.equal(mine.source, 'rules');
});

test("an open item's questions come from the item; someone else's item is not there", async () => {
  const [mineItem] = (await owner.query(`SELECT id FROM recommendations WHERE nba_run_id = $1 AND owner_email = $2 AND status = 'Waiting' LIMIT 1`, [built.runId, repEmail])).rows;
  const [other] = (await owner.query(`SELECT id FROM recommendations WHERE nba_run_id = $1 AND owner_email <> $2 LIMIT 1`, [built.runId, repEmail])).rows;
  const why = await ask(rep(), { question: 'Why is it here?', ref: { itemId: mineItem.id } });
  assert.equal(why.source, 'rules');
  assert.ok(why.blocks.some(b => b.t === 'checks'));
  const conf = await ask(rep(), { question: 'Why is the confidence what it is?', ref: { itemId: mineItem.id } });
  assert.match(JSON.stringify(conf.blocks), /Confidence is \*\*(High|Medium|Low)\*\*/);
  await assert.rejects(ask(rep(), { question: 'Why is it here?', ref: { itemId: other.id } }), (e: HttpError) => e.status === 404);
});

test('Prospecting and Scoring questions come from the list and the run', async () => {
  const list = await ask(admin(), { screen: 'prospecting', ref: { listId: built.listId }, question: "What's wrong with this file?" });
  assert.equal(list.source, 'rules');
  assert.match(JSON.stringify(list.blocks), /of the \d+ rows are clean/);
  const tiers = await ask(admin(), { screen: 'scoring', ref: { runId: built.scoringRunId }, question: 'How many prospects are in each tier?' });
  assert.match(JSON.stringify(tiers.blocks), /"A","\d+"/);
  const [p] = (await owner.query(`SELECT contact_id FROM prospect_scores WHERE run_id = $1 AND tier = 'A' LIMIT 1`, [built.scoringRunId])).rows;
  const why = await ask(admin(), { screen: 'scoring', ref: { runId: built.scoringRunId, contactId: p.contact_id }, question: 'Why is this score what it is?' });
  assert.match(JSON.stringify(why.blocks), /= company fit [\d.]+ × timing [\d.]+ ÷ 100/);
});

test('with the flag off a question the rules miss gets an honest "can\'t answer"; on, the model answers from the data', async () => {
  const off = await ask(admin(), { question: 'Which of these accounts is the biggest opportunity overall?' });
  assert.deepEqual([off.source, (off.blocks[0] as { text: string }).text], ['none', "I can't answer that from the data on this screen yet."]);
  const fake = new FakeModel([], { otherwise: req => reply(`P1 looks like the biggest one; ${/P2\b/.test(req.messages[0].content) ? 'P2 is next' : 'nobody else stands out'}.`) });
  setAiGatewayForTests(fakeGateway(app, fake, { ...ALL_ON, classify: false, why_now: false, draft_message: false, draft_content: false }));
  const keep = BUDGET.queue;
  BUDGET.queue = 10;
  try {
    const before = Number((await owner.query(`SELECT count(*) n FROM ai_calls WHERE capability = 'copilot'`)).rows[0].n);
    const on = await ask(admin(), { question: 'Which of these accounts is the biggest opportunity overall?', turns: [{ role: 'you', text: 'hello' }, { role: 'copilot', text: 'Hi.' }] });
    assert.equal(on.source, 'ai');
    assert.match(on.partial ?? '', /^Answered from 10 of \d+ items in the queue/);
    assert.ok(!/\bP\d+\b/.test(JSON.stringify(on.blocks)), 'tokens are shown as names');
    // Everything sent: no contact's name and no email address.
    const sent = fake.requests.map(FakeModel.sent).join('\n');
    assert.ok(!EMAIL.test(sent), 'no email address is sent');
    const names = (await owner.query(`SELECT DISTINCT rec->'contact'->>'name' n FROM recommendations WHERE nba_run_id = $1`, [built.runId])).rows.map(r => r.n).filter((n: string) => n && n.length > 4);
    for (const n of names) assert.ok(!sent.includes(n), `"${n}" is not sent`);
    assert.match(fake.requests[0].system, /The data is partial: 10 of \d+ items in the queue/);
    const after = (await owner.query(`SELECT outcome, template_id FROM ai_calls WHERE capability = 'copilot' ORDER BY seq DESC LIMIT 1`)).rows[0];
    assert.deepEqual([Number((await owner.query(`SELECT count(*) n FROM ai_calls WHERE capability = 'copilot'`)).rows[0].n) - before, after.outcome, after.template_id], [1, 'ok', 'copilot.answer']);
    // A rule answer never calls the model.
    const n = fake.requests.length;
    assert.equal((await ask(admin(), { question: 'What should I do first?' })).source, 'rules');
    assert.equal(fake.requests.length, n);
  } finally { BUDGET.queue = keep; setAiGatewayForTests(undefined); }
});

test('a model that fails, or keeps claiming it acted, ends in the rules\' "can\'t answer", with the reason in words', async () => {
  const fake = new FakeModel([], { otherwise: reply('I have approved every item for you.') });
  setAiGatewayForTests(fakeGateway(app, fake, { ...ALL_ON, classify: false, why_now: false, draft_message: false, draft_content: false }));
  try {
    const r = await ask(admin(), { question: 'Which of these accounts is the biggest opportunity overall?' });
    assert.deepEqual([r.source, r.fallback], ['none', "the AI's answer broke Copilot's rules, so it was not shown"]);
    assert.equal(fake.requests.length, 2, 'one repair');
  } finally { setAiGatewayForTests(undefined); }
});

/* ─── Autopilot: a plan the person confirms, checked again, logged, not counted, undoable ─── */

test('Autopilot rates the spot-checks that still pass, logs each under the person outside G2, and its runner can undo it once', async () => {
  const actor = { userId: ids.adminA, role: 'Admin' as const };
  await withTenant(app, admin(), s => drawSpotChecks(s, actor));
  const pending = (await owner.query(`SELECT id FROM recommendations WHERE nba_run_id = $1 AND spot = 'pending'`, [built.runId])).rows.map(r => r.id);
  assert.ok(pending.length > 0, 'the week\'s spot-checks were drawn');
  const asked = await ask(admin(), { question: 'Approve all spot-checks that passed every check' });
  const plan = (asked.blocks.find(b => b.t === 'plan') as Extract<CopilotBlock, { t: 'plan' }>).plan;
  assert.equal(plan.kind, 'spot');
  assert.deepEqual([...plan.will.map(w => w.id), ...plan.left.map(l => l.id)].sort(), [...pending].sort());
  const g2 = async () => R.measure([], await withTenant(app, admin(), s => logFacts(s))).pooled;
  const before = await g2();
  // An exception with an unsupported claim slipped into the plan is still left for a person.
  const [risky] = (await owner.query(`SELECT id FROM recommendations WHERE nba_run_id = $1 AND status = 'Waiting' AND spot IS NULL LIMIT 1`, [built.runId])).rows;
  const ran = await withTenant(app, admin(), s => runAutopilot(s, actor, { kind: 'spot', ids: [...plan.will.map(w => w.id), risky.id], instruction: plan.instruction }));
  assert.deepEqual(ran.done.map(d => d.id).sort(), plan.will.map(w => w.id).sort());
  assert.ok(ran.skipped.some(x => x.id === risky.id && /not a spot-check/.test(x.why)));
  const rows = (await owner.query(`SELECT r.spot, l.kind, l.decisive, l.created_by, l.note FROM recommendations r JOIN decision_log l ON l.recommendation_id = r.id AND l.decision = 'Accepted by Autopilot' WHERE r.id = ANY($1)`, [ran.done.map(d => d.id)])).rows;
  assert.equal(rows.length, ran.done.length);
  for (const r of rows) assert.deepEqual([r.spot, r.kind, r.decisive, r.created_by], ['accepted', 'autopilot', false, ids.adminA]);
  assert.match(rows[0].note, /instruction: "Approve all spot-checks that passed every check" · checked again before acting · not counted toward G2/);
  assert.deepEqual(await g2(), before, 'G2 is untouched');
  await assert.rejects(withTenant(app, rep(), s => undoAutopilot(s, { userId: ids.repA, role: 'Sales rep' }, ran.runId)), (e: HttpError) => e.status === 404, 'only its runner undoes it');
  const undone = await withTenant(app, admin(), s => undoAutopilot(s, actor, ran.runId));
  assert.equal(undone.restored, ran.done.length);
  assert.equal(Number((await owner.query(`SELECT count(*) n FROM recommendations WHERE id = ANY($1) AND spot = 'pending'`, [ran.done.map(d => d.id)])).rows[0].n), ran.done.length);
  assert.equal(Number((await owner.query(`SELECT count(*) n FROM decision_log WHERE decision = 'Autopilot run undone'`)).rows[0].n), ran.done.length);
  await assert.rejects(withTenant(app, admin(), s => undoAutopilot(s, actor, ran.runId)), (e: HttpError) => e.status === 409);
  // The record stays: the app role may only mark a run undone; nobody deletes one.
  const appRole = db.pool('demandai_app');
  await assert.rejects(appRole.query(`DELETE FROM autopilot_runs`), /permission denied/);
  await assert.rejects(appRole.query(`UPDATE autopilot_runs SET instruction = 'x'`), /permission denied/);
  await assert.rejects(owner.query(`DELETE FROM autopilot_runs`), /append-only/);
});

test("Autopilot never takes risky or sensitive exceptions, nor another rep's items", async () => {
  const rows = (await owner.query(`SELECT id, owner_email FROM recommendations WHERE nba_run_id = $1 AND status IN ('Waiting', 'Awaiting approval') AND spot IS DISTINCT FROM 'pending'`, [built.runId])).rows;
  const mine = rows.filter(r => r.owner_email === repEmail).map(r => r.id), others = rows.filter(r => r.owner_email !== repEmail).map(r => r.id).slice(0, 3);
  const ran = await withTenant(app, rep(), s => runAutopilot(s, { userId: ids.repA, role: 'Sales rep' }, { kind: 'exception', ids: [...mine, ...others], instruction: 'accept everything' }));
  for (const id of others) assert.ok(ran.skipped.some(x => x.id === id && x.why === 'not yours, or not there any more'));
  const live = (await owner.query(`SELECT r.id, r.status, d.checks FROM recommendations r JOIN drafts d ON d.recommendation_id = r.id AND d.version = r.draft_version WHERE r.id = ANY($1)`, [ran.done.map(d => d.id)])).rows;
  for (const r of live) {
    assert.equal(r.status, 'Released');
    assert.ok(!R.isSensitive(r.checks), 'nothing sensitive is released by Autopilot');
  }
  const why = ran.skipped.filter(x => mine.includes(x.id)).map(x => x.why);
  assert.ok(why.every(w => /needs a person|already decided|no way to reach|paused/.test(w)), why.join(' | '));
});
