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
import { getJob } from '../../lib/server/jobs/queue.ts';
import { receiveUpload } from '../../lib/server/services/uploads.ts';
import { addCorrections } from '../../lib/server/services/corrections.ts';
import { saveList } from '../../lib/server/services/lists.ts';
import { getRun, startScoringRun } from '../../lib/server/services/scoring.ts';
import { AS_OF } from '../helpers/answer-key.ts';
import { DATASET } from '../helpers/answer-key.ts';
import { sensibleClassifier, whyNowWriter } from '../helpers/ai-fakes.ts';
import { FakeModel, json } from '../helpers/fake-model.ts';
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
  const fake = new FakeModel([json({ vertical: SECRET }), json({ nope: SECRET }), json({ nope: SECRET })], { deployment: 'gpt-4o' });
  const gw = fakeGateway(app, fake);
  const ok = await gw.json('classify', { id: 'classify.industry', version: 1 }, { system: `S ${SECRET}`, messages: [{ role: 'user', content: SECRET }], maxTokens: 50 }, Schema,
    { businessUnitId: ids.buA, userId: ids.adminA, requestId: 'req-ai-1' });
  const bad = await gw.json('classify', { id: 'classify.industry', version: 1 }, { system: 'S', messages: [{ role: 'user', content: 'x' }], maxTokens: 50 }, Schema,
    { businessUnitId: ids.buA, userId: ids.adminA });
  assert.deepEqual([ok.ok, bad.ok], [true, false]);
  const rows = (await owner.query(`SELECT * FROM ai_calls ORDER BY seq`)).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => [r.capability, r.template_id, r.template_version, r.provider, r.deployment, r.outcome, r.fallback_reason, r.attempts]),
    [['classify', 'classify.industry', 1, 'azure-openai', 'gpt-4o', 'ok', null, 1], ['classify', 'classify.industry', 1, 'azure-openai', 'gpt-4o', 'fallback', 'schema', 2]]);
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
