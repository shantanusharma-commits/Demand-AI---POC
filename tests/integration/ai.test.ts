// AI on the server against PostgreSQL (Phase 6): every gateway call leaves one metadata row in its business unit
// (D-6: no prompt, no reply), append-only and invisible to other units. Run with --conditions=react-server.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { z } from 'zod';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { aiCalls } from '../../lib/server/db/schema.ts';
import { FakeModel, json } from '../helpers/fake-model.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';
import { fakeGateway } from './ai-fixtures.ts';

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
