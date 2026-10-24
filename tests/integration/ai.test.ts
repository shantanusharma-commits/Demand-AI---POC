// AI on the server against PostgreSQL (Phase 6): every gateway call leaves one metadata row in its business unit
// (D-6: no prompt, no reply), append-only and invisible to other units. Run with --conditions=react-server.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { z } from 'zod';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { aiCalls } from '../../lib/server/db/schema.ts';
import { readFileSync } from 'node:fs';
import { setAiGatewayForTests } from '../../lib/server/ai.ts';
import { createAppWorker } from '../../lib/server/jobs/handlers.ts';
import { enqueueJob, getJob } from '../../lib/server/jobs/queue.ts';
import { createHandoff } from '../../lib/server/services/handoffs.ts';
import { NBA_STAGES } from '../../lib/server/services/nba-ai.ts';
import { changeItemWithAi, createItemWithAi, saveBlocks } from '../../lib/server/services/studio.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { aiStatus, healthCheck } from '../../lib/server/services/ai-admin.ts';
import { AiGateway } from '../../lib/ai/gateway.ts';
import { recordAiCall } from '../../lib/server/ai.ts';
import { receiveUpload } from '../../lib/server/services/uploads.ts';
import { addCorrections } from '../../lib/server/services/corrections.ts';
import { saveList } from '../../lib/server/services/lists.ts';
import { getRun, startScoringRun } from '../../lib/server/services/scoring.ts';
import { AS_OF } from '../helpers/answer-key.ts';
import { DATASET } from '../helpers/answer-key.ts';
import { draftWriter, pieceWriter, rewriteIds, rewriteParts, sensibleClassifier, whyNowWriter } from '../helpers/ai-fakes.ts';
import { FakeModel, fail, json, reply } from '../helpers/fake-model.ts';
import { limits } from './pilot.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';
import { ALL_ON, fakeGateway } from './ai-fixtures.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics;
const unitA = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const unitB = (): TenantContext => ({ userId: ids.repB, businessUnitId: ids.buB, scope: 'all', ownerEmails: [] });
const SECRET = 'Words-From-A-Prompt-Or-Reply';
const Schema = z.object({ vertical: z.string() });

before(async () => {
  db = await freshDatabase('ai');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
});
after(async () => { await db?.drop(); });

test('each call leaves one metadata row in its unit: no prompt or reply anywhere in it', async () => {
  const fake = new FakeModel([json({ vertical: SECRET }, { model: 'gpt-5.4-2026-03-05' }), json({ nope: SECRET }), json({ nope: SECRET })], { deployment: 'gpt-5.4' });
  const gw = fakeGateway(app, fake);
  const ok = await gw.json('classify', { id: 'classify.industry', version: 1 }, { system: `S ${SECRET}`, messages: [{ role: 'user', content: SECRET }], maxTokens: 50, reasoning: 'low' }, Schema,
    { businessUnitId: ids.buA, userId: ids.adminA, requestId: 'req-ai-1' });
  const bad = await gw.json('classify', { id: 'classify.industry', version: 1 }, { system: 'S', messages: [{ role: 'user', content: 'x' }], maxTokens: 50 }, Schema,
    { businessUnitId: ids.buA, userId: ids.adminA });
  assert.deepEqual([ok.ok, bad.ok], [true, false]);
  const rows = (await owner.query(`SELECT * FROM ai_calls ORDER BY seq`)).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => [r.capability, r.template_id, r.template_version, r.provider, r.deployment, r.model, r.reasoning_effort, r.outcome, r.fallback_reason, r.attempts]),
    [['classify', 'classify.industry', 1, 'azure-openai', 'gpt-5.4', 'gpt-5.4-2026-03-05', 'low', 'ok', null, 1],
      ['classify', 'classify.industry', 1, 'azure-openai', 'gpt-5.4', null, null, 'fallback', 'schema', 2]]);
  assert.equal(rows[0].id, ok.ok ? ok.callId : null);
  assert.deepEqual([rows[0].prompt_tokens, rows[0].completion_tokens, rows[0].est_cost_usd, rows[0].request_id, rows[0].created_by], [120, 40, 0.0012, 'req-ai-1', ids.adminA]);
  assert.ok(!JSON.stringify(rows).includes(SECRET), 'nothing said is stored');
});

test('a unit sees only its own calls, and the record is append-only', async () => {
  const mine = await withTenant(app, unitA(), s => s.tx.select().from(aiCalls));
  const theirs = await withTenant(app, unitB(), s => s.tx.select().from(aiCalls));
  assert.deepEqual([mine.length, theirs.length], [2, 0]);
  await assert.rejects(withTenant(app, unitA(), s => s.tx.update(aiCalls).set({ outcome: 'ok' })), (e: Error & { cause?: Error }) => /permission denied/.test(e.cause?.message ?? ''));
  await assert.rejects(owner.query(`DELETE FROM ai_calls`), /append-only/);
  // An "ok" with a reason, or a fallback without one, is refused by the database.
  await assert.rejects(owner.query(`INSERT INTO ai_calls (id, business_unit_id, capability, template_id, template_version, provider, deployment, latency_ms, prompt_tokens,
    completion_tokens, attempts, outcome, fallback_reason, created_by) VALUES (gen_random_uuid(), $1, 'classify', 't', 1, 'bedrock', 'm', 1, 0, 0, 1, 'fallback', null, $2)`, [ids.buA, ids.adminA]), /ai_calls_reason_check/);
});

test('a record that cannot be stored never breaks the call', async () => {
  const fake = new FakeModel([json({ vertical: 'Chemicals' })]);
  const gw = fakeGateway(app, fake);
  const r = await gw.json('classify', { id: 'classify.industry', version: 1 }, { system: 'S', messages: [{ role: 'user', content: 'x' }], maxTokens: 50 }, Schema,
    { businessUnitId: '00000000-0000-4000-8000-00000000dead', userId: ids.adminA });
  assert.equal(r.ok, true, 'the answer is used even though the unit does not exist');
});

/* ─── Industry classification in the lead job (spec 3.4, G-021) ─── */

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function uploadSample(): Promise<string> {
  const up = await withTenant(app, unitA(), s => receiveUpload(s, { kind: 'lead', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: readFileSync(DATASET) }, limits));
  await createAppWorker(app, limits).drain();
  const job = await withTenant(app, unitA(), s => getJob(s, up.jobId!));
  assert.equal(job?.status, 'succeeded', JSON.stringify(job));
  return job!.progress.result!.listId;
}
const listAccounts = async (listId: string) => (await owner.query(`SELECT count(*)::int n, count(*) FILTER (WHERE data->>'aiAssisted' = 'true')::int ai,
  count(*) FILTER (WHERE needs_review)::int review FROM accounts WHERE list_id = $1`, [listId])).rows[0];

test('with the flag off the lead job sends nothing and the rules stand', async () => {
  const fake = new FakeModel([], { otherwise: sensibleClassifier });
  setAiGatewayForTests(fakeGateway(app, fake, { ...ALL_ON, classify: false }));
  try {
    const counts = await listAccounts(await uploadSample());
    assert.deepEqual([counts.n, counts.ai, counts.review], [1401, 0, 698]);
    assert.equal(fake.requests.length, 0);
  } finally { setAiGatewayForTests(undefined); }
});

test('the lead job asks about each unmatched industry text once, keeps the answers, and a later list reuses them', async () => {
  const fake = new FakeModel([], { otherwise: sensibleClassifier });
  setAiGatewayForTests(fakeGateway(app, fake));
  try {
    const before = (await owner.query(`SELECT coalesce(max(seq), 0) n FROM ai_calls`)).rows[0].n;
    const first = await listAccounts(await uploadSample());
    const texts = (await owner.query(`SELECT count(*)::int n FROM ai_verticals WHERE business_unit_id = $1`, [ids.buA])).rows[0].n;
    assert.ok(texts > 50, `${texts} industry texts kept`);
    assert.equal(fake.requests.length, Math.ceil(texts / 25), 'batches of 25');
    assert.deepEqual([first.n, first.ai], [1401, 698]);
    assert.ok(first.review < 100, `needs review now ${first.review}`);
    const calls = (await owner.query(`SELECT outcome, count(*)::int n FROM ai_calls WHERE capability = 'classify' AND template_id = 'classify.industry' AND seq > $1 GROUP BY 1`, [before])).rows;
    assert.deepEqual(calls, [{ outcome: 'ok', n: fake.requests.length }]);
    const sample = (await owner.query(`SELECT data->>'classReason' reason, data->>'vertical' vertical FROM accounts WHERE data->>'aiAssisted' = 'true' LIMIT 1`)).rows[0];
    assert.match(sample.reason, /^AI-assisted \((high|medium) confidence\): /);
    const asked = fake.requests.length;
    const second = await listAccounts(await uploadSample());
    assert.equal(fake.requests.length, asked, 'no new model call: the kept answers are used');
    assert.deepEqual([second.ai, second.review], [first.ai, first.review], 'the same answers');
    // Another model is asked again: its answers are its own.
    const other = new FakeModel([], { otherwise: sensibleClassifier, deployment: 'another-deployment' });
    setAiGatewayForTests(fakeGateway(app, other));
    await uploadSample();
    assert.equal(other.requests.length, asked);
  } finally { setAiGatewayForTests(undefined); }
});

test("a person can still set the vertical of an account the classifier chose, and the person's choice is kept", async () => {
  const fake = new FakeModel([], { otherwise: sensibleClassifier });
  setAiGatewayForTests(fakeGateway(app, fake));
  try {
    const listId = await uploadSample();
    const a = (await owner.query(`SELECT name, (data->'contactIds'->>0)::int row FROM accounts WHERE list_id = $1 AND data->>'aiAssisted' = 'true' AND NOT needs_review ORDER BY seq LIMIT 1`, [listId])).rows[0];
    const { jobId } = await withTenant(app, unitA(), s => addCorrections(s, { userId: ids.adminA, role: 'Admin' }, listId, { row: a.row, changes: { vertical: 'Refining' }, reason: 'Wrong industry', source: 'Known from the account team', note: '' }));
    await createAppWorker(app, limits).drain();
    const next = (await withTenant(app, unitA(), s => getJob(s, jobId)))!.progress.result!.listId;
    const after = (await owner.query(`SELECT data->>'vertical' vertical, data->>'aiAssisted' ai, data->>'classReason' reason FROM accounts WHERE list_id = $1 AND name = $2`, [next, a.name])).rows[0];
    assert.deepEqual([after.vertical, after.ai], ['Refining', null]);
    assert.match(after.reason, /^Set by a person: /);
  } finally { setAiGatewayForTests(undefined); }
});

/* ─── The why-now line in the scoring job (spec 4.14, G-025) ─── */

test('the scoring job words the tier A and B why-now lines from their own rows, and says how many', async () => {
  const fake = new FakeModel([], { otherwise: whyNowWriter() });
  setAiGatewayForTests(fakeGateway(app, fake, { ...ALL_ON, classify: false }));
  try {
    const listId = await uploadSample();
    const actor = { userId: ids.adminA, role: 'Admin' as const };
    await withTenant(app, unitA(), s => saveList(s, actor, listId, { name: 'Why-now sample' }));
    const sig = await withTenant(app, unitA(), s => receiveUpload(s, { kind: 'signal', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: readFileSync(DATASET) }, limits));
    const started = await withTenant(app, unitA(), s => startScoringRun(s, actor, { listId, signalUploadId: sig.uploadId, asOf: AS_OF }));
    await createAppWorker(app, limits).drain();
    const rows = (await owner.query(`SELECT tier, data->'person'->'whyNowAi' ai, data->'person'->>'whyNow' rules, data->'summary'->>'whyNowAi' shown
      FROM prospect_scores WHERE run_id = $1 AND data->'person' IS NOT NULL AND jsonb_array_length(data->'person'->'signals') > 0`, [started.runId])).rows;
    const ab = rows.filter(r => r.tier === 'A' || r.tier === 'B');
    assert.equal(ab.length, 144);
    assert.ok(ab.every(r => r.ai && r.ai.line === r.shown && r.ai.rows.length && ['High', 'Medium', 'Low'].includes(r.ai.confidence) && r.rules), 'each tier A and B prospect has a grounded line and keeps the rules\' one');
    assert.ok(rows.filter(r => r.tier !== 'A' && r.tier !== 'B').every(r => r.ai === null), 'tier C and the watch list keep the rules\' line only');
    assert.equal(fake.requests.length, 15);
    const run = await withTenant(app, unitA(), s => getRun(s, actor, started.runId));
    assert.deepEqual(run.stats.aiWhyNow, { asked: 144, worded: 144, fallbacks: {} });
  } finally { setAiGatewayForTests(undefined); }
});

/* ─── First messages written with AI, in a build job (spec 5.12–5.14, G-026) ─── */

let scoredRun = '';
async function scoredSample(): Promise<string> {
  if (scoredRun) return scoredRun;
  const actor = { userId: ids.adminA, role: 'Admin' as const };
  const listId = await uploadSample();
  await withTenant(app, unitA(), s => saveList(s, actor, listId, { name: 'Drafting sample' }));
  const sig = await withTenant(app, unitA(), s => receiveUpload(s, { kind: 'signal', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: readFileSync(DATASET) }, limits));
  scoredRun = (await withTenant(app, unitA(), s => startScoringRun(s, actor, { listId, signalUploadId: sig.uploadId, asOf: AS_OF }))).runId;
  await createAppWorker(app, limits).drain();
  return scoredRun;
}
async function buildJob(ctx: TenantContext, payload: Record<string, string>) {
  const jobId = await withTenant(app, ctx, s => enqueueJob(s, 'nba.build', payload, NBA_STAGES));
  await createAppWorker(app, limits).drain();
  return (await withTenant(app, ctx, s => getJob(s, jobId)))!;
}

test('with AI drafting on, the build job writes each eligible first message with AI as version 2, through every check', async () => {
  const fake = new FakeModel([], { otherwise: draftWriter() });
  setAiGatewayForTests(fakeGateway(app, fake, { ...ALL_ON, classify: false, why_now: false }));
  try {
    const runId = await scoredSample();
    const handoffId = (await withTenant(app, unitA(), s => createHandoff(s, { userId: ids.adminA, role: 'Admin' }, { runId }))).handoffId;
    const job = await buildJob(unitA(), { handoffId });
    assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
    const nbaRunId = job.progress.result!.runId;
    const stats = (await owner.query(`SELECT stats FROM nba_runs WHERE id = $1`, [nbaRunId])).rows[0].stats;
    assert.ok(stats.aiDrafts.written > 50, JSON.stringify(stats.aiDrafts));
    assert.equal(stats.aiDrafts.written, stats.aiDrafts.asked, 'every eligible draft was written');
    assert.equal(fake.requests.length, stats.aiDrafts.asked);
    const ai = (await owner.query(`SELECT d.version, d.ai_call_id, d.checks, d.draft, r.draft_version, c.outcome, c.capability FROM drafts d
      JOIN recommendations r ON r.id = d.recommendation_id LEFT JOIN ai_calls c ON c.id = d.ai_call_id WHERE r.nba_run_id = $1 AND d.ai_assisted`, [nbaRunId])).rows;
    assert.equal(ai.length, stats.aiDrafts.written);
    for (const d of ai) {
      assert.deepEqual([d.version, d.draft_version, d.outcome, d.capability], [2, 2, 'ok', 'draft_message']);
      assert.deepEqual([d.checks.flags, d.checks.unsupported], [[], []], 'an AI draft is stored only once it passes');
      assert.equal(d.draft.ai.template, 'draft.message@2');
    }
    const logged = (await owner.query(`SELECT count(*)::int n FROM decision_log WHERE nba_run_id = $1 AND decision = 'Written with AI'`, [nbaRunId])).rows[0].n;
    assert.equal(logged, ai.length);
    const tasks = (await owner.query(`SELECT count(*)::int n FROM drafts d JOIN recommendations r ON r.id = d.recommendation_id WHERE r.nba_run_id = $1 AND d.channel = 'Task' AND d.ai_assisted`, [nbaRunId])).rows[0].n;
    assert.equal(tasks, 0, 'no task is ever written with AI (D-10)');
  } finally { setAiGatewayForTests(undefined); }
});

test("a build job runs as the person who asked: a rep's build holds only their own prospects; failing drafts stay the rules'", async () => {
  const runId = await scoredSample();
  const ownerEmail = (await owner.query(`SELECT owner_email FROM prospect_scores WHERE run_id = $1 AND tier IN ('A', 'B') AND owner_email IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`, [runId])).rows[0].owner_email;
  await owner.query(`INSERT INTO user_owner_aliases (user_id, owner_email, created_by) VALUES ($1, $2, $1)`, [ids.repA, ownerEmail]);
  const rep: TenantContext = { userId: ids.repA, businessUnitId: ids.buA, scope: 'own', ownerEmails: ['rep.a@demandai.test', ownerEmail] };
  // A model that keeps writing an unsupported claim: every draft falls back to the rules, and the log says why.
  const fake = new FakeModel([], { otherwise: draftWriter(a => (a.channel === 'LinkedIn' ? { note: 'we cut downtime by 40% for sites like yours.' }
    : { subject: 'a quick note', opening: 'Thanks for getting in touch.', bridge: 'We cut downtime by 40% for sites like yours.', ask: 'Would a call help?', claimId: a.claimIds[0] })) });
  setAiGatewayForTests(fakeGateway(app, fake, { ...ALL_ON, classify: false, why_now: false }));
  try {
    // The manager's hand-off holds everyone's prospects; built by the rep, only theirs come through.
    const handoffId = (await withTenant(app, unitA(), s => createHandoff(s, { userId: ids.adminA, role: 'Admin' }, { runId }))).handoffId;
    const everyone = (await owner.query(`SELECT count(DISTINCT owner_email)::int n FROM handoff_items WHERE handoff_id = $1`, [handoffId])).rows[0].n;
    assert.ok(everyone > 1);
    const job = await buildJob(rep, { handoffId });
    assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
    const nbaRunId = job.progress.result!.runId;
    const owners = (await owner.query(`SELECT DISTINCT owner_email FROM recommendations WHERE nba_run_id = $1`, [nbaRunId])).rows.map(r => r.owner_email);
    assert.deepEqual(owners, [ownerEmail]);
    const stats = (await owner.query(`SELECT stats, created_by FROM nba_runs WHERE id = $1`, [nbaRunId])).rows[0];
    assert.equal(stats.created_by, ids.repA);
    assert.equal(stats.stats.aiDrafts.written, 0);
    assert.equal(stats.stats.aiDrafts.fallbacks.checks_failed, stats.stats.aiDrafts.asked);
    const notUsed = (await owner.query(`SELECT count(*)::int n FROM decision_log WHERE nba_run_id = $1 AND decision = 'AI draft not used'`, [nbaRunId])).rows[0].n;
    assert.equal(notUsed, stats.stats.aiDrafts.asked);
    assert.equal((await owner.query(`SELECT count(*)::int n FROM drafts d JOIN recommendations r ON r.id = d.recommendation_id WHERE r.nba_run_id = $1 AND d.ai_assisted`, [nbaRunId])).rows[0].n, 0);
    // Someone who has left the unit can't have a build made for them.
    await owner.query(`UPDATE business_unit_members SET status = 'removed' WHERE user_id = $1 AND business_unit_id = $2`, [ids.repA2, ids.buA]);
    const gone = await buildJob({ userId: ids.repA2, businessUnitId: ids.buA, scope: 'own', ownerEmails: ['rep.a2@demandai.test'] }, { handoffId });
    assert.deepEqual([gone.status, gone.error?.code], ['failed', 'forbidden']);
  } finally { setAiGatewayForTests(undefined); }
});

/* ─── Content studio's AI writer (D-36) ─── */

test('the studio writes a piece with AI behind the same call, and hands it only the requests the rules do not understand', async () => {
  const actor = { userId: ids.adminA, role: 'Admin' as const };
  const fake = new FakeModel([pieceWriter()], { otherwise: req => ({ text: JSON.stringify({ parts: rewriteParts(req, { [rewriteIds(req)[0]]: 'A calmer opening, in plain words.' }), reply: 'Made the opening calmer.' }), finish: 'stop', promptTokens: 10, completionTokens: 10 }) });
  setAiGatewayForTests(fakeGateway(app, fake, { ...ALL_ON, classify: false, why_now: false, draft_message: false }));
  try {
    const made = await createItemWithAi(app, unitA(), actor, { text: 'A blog on planning a control system migration for plant managers', type: 'blog' });
    assert.equal(made.created, true);
    const item = (made as { item: { id: string; rev: number; ai: { confidence: string } | null; blocks: { ai?: boolean; role: string }[]; messages: { text: string }[]; issues: number } }).item;
    assert.ok(item.ai, 'labelled AI-assisted');
    assert.equal(item.ai!.confidence, 'High', 'every check passes and it cites approved claims');
    assert.equal(item.issues, 0);
    assert.ok(item.blocks.some(b => b.ai) && !item.blocks.find(b => b.role === 'proof')!.ai);
    assert.ok(item.messages.some(m => /^Written with AI from the brief/.test(m.text)));
    // A refusal stays the rules' (no model call); a request they don't understand goes to the AI.
    const before = fake.requests.length;
    const refused = await changeItemWithAi(app, unitA(), actor, item.id, { op: 'ask', q: 'say that we reduce downtime by 40%', rev: item.rev });
    assert.match(refused.reply, /^I can't add/);
    assert.equal(fake.requests.length, before);
    const done = await changeItemWithAi(app, unitA(), actor, item.id, { op: 'ask', q: 'make it sound calmer, like a senior engineer talking', rev: item.rev });
    assert.match(done.reply, /^Made the opening calmer\. \(Written with AI; every check was run again\.\)$/);
    assert.equal(fake.requests.length, before + 1);
    // An edit saved while the AI writes wins: the AI's change is refused by the revision guard.
    const slow = new FakeModel([], { otherwise: async req => { await withTenant(app, unitA(), s => saveBlocks(s, actor, item.id, { blocks: done.item.blocks, rev: done.item.rev })); return { text: JSON.stringify({ parts: rewriteParts(req, { [rewriteIds(req)[0]]: 'Too late.' }), reply: 'Done.' }), finish: 'stop', promptTokens: 1, completionTokens: 1 }; } });
    setAiGatewayForTests(fakeGateway(app, slow, { ...ALL_ON, classify: false, why_now: false, draft_message: false }));
    await assert.rejects(changeItemWithAi(app, unitA(), actor, item.id, { op: 'ask', q: 'make it sound like a sports commentator', rev: done.item.rev }), (e: HttpError) => e.status === 409);
  } finally { setAiGatewayForTests(undefined); }
});

/* ─── The Admin's AI health check and status (plan §8) ─── */

test('the health check makes one tiny call and reports ok, provider, deployment and latency; failing or unconfigured, it says why', async () => {
  const actor = { userId: ids.adminA, role: 'Admin' as const };
  const good = fakeGateway(app, new FakeModel([reply('OK')], { deployment: 'gpt-4o' }), { healthcheck: true });
  const r = await healthCheck(app, unitA(), actor, good);
  assert.deepEqual([r.ok, r.provider, r.deployment, typeof r.latencyMs], [true, 'azure-openai', 'gpt-4o', 'number']);
  assert.match(r.message, /^The model answered in \d+ ms\.$/);
  const rec = (await owner.query(`SELECT capability, outcome, template_id FROM ai_calls WHERE capability = 'healthcheck' ORDER BY seq DESC LIMIT 1`)).rows[0];
  assert.deepEqual(rec, { capability: 'healthcheck', outcome: 'ok', template_id: 'healthcheck' });
  assert.equal((await owner.query(`SELECT count(*)::int n FROM audit_log WHERE action = 'ai.healthcheck'`)).rows[0].n, 1);
  const bad = fakeGateway(app, new FakeModel([], { otherwise: fail('auth', { status: 401 }) }), { healthcheck: true });
  const r2 = await healthCheck(app, unitA(), actor, bad);
  assert.deepEqual([r2.ok, r2.message], [false, 'The model did not answer: the AI service failed.']);
  const none = new AiGateway({ client: null, flags: {}, timeoutMs: 1000, maxConcurrency: 1, record: x => recordAiCall(app, x) });
  const r3 = await healthCheck(app, unitA(), actor, none);
  assert.deepEqual([r3.ok, r3.provider], [false, 'none']);
});

test('the status shows where calls go, each switch, and the last 30 days of calls in the unit only', async () => {
  const gw = fakeGateway(app, new FakeModel([]), { classify: true, copilot: false, healthcheck: true });
  const s = await withTenant(app, unitA(), sc => aiStatus(sc, gw));
  assert.deepEqual([s.provider, s.deployment, s.breaker], ['azure-openai', 'fake-deployment', 'closed']);
  const by = Object.fromEntries(s.capabilities.map(c => [c.key, c]));
  assert.deepEqual([by.classify.on, by.copilot.on, by.why_now.on], [true, false, false]);
  const calls = (await owner.query(`SELECT count(*)::int n FROM ai_calls WHERE business_unit_id = $1 AND capability = 'classify'`, [ids.buA])).rows[0].n;
  assert.equal(by.classify.calls, calls);
  assert.ok(by.classify.reasons.every(r => r.words));
  const other = await withTenant(app, unitB(), sc => aiStatus(sc, gw));
  assert.equal(other.capabilities.reduce((n, c) => n + c.calls, 0), 0, "another unit's calls are not counted");
});
