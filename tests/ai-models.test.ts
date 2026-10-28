// The models behind the gateway (D-44): gpt-5.4 as the main model and gpt-5.4-mini for the capabilities routed to
// it, on API version 2025-04-01-preview with structured outputs (strict JSON schemas made from the zod schemas),
// reasoning effort per call, and the APIM gateway's own refusals. The Azure adapter is tested against responses
// captured from the pilot's gateway on 24 Oct 2026 (tests/fixtures/ai/azure-openai.json). Run with --conditions=react-server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { AiGateway, type AiCallRecord, type GatewayOptions } from '../lib/ai/gateway.ts';
import { createAzureClient, REASONING_ROOM } from '../lib/ai/providers/azure-openai.ts';
import { strictSchema } from '../lib/ai/schema.ts';
import { classifySchema } from '../lib/ai/classify.ts';
import { whyNowSchema } from '../lib/ai/why-now.ts';
import { emailSchema, noteSchema } from '../lib/ai/draft.ts';
import { briefSchema, pieceSchema, rewriteSchema } from '../lib/ai/studio.ts';
import { ModelError, type ModelRequest } from '../lib/ai/types.ts';
import { parseEnv } from '../lib/server/env.ts';
import { gatewayOptions } from '../lib/server/ai.ts';
import { createLogger } from '../lib/server/logger.ts';
import { FakeModel, fail, json, reply } from './helpers/fake-model.ts';

const repo = resolve(import.meta.dirname, '..');
const TPL = { id: 'test.classify', version: 1 };
const CTX = { businessUnitId: '00000000-0000-4000-8000-0000000000b1', userId: '00000000-0000-4000-8000-0000000000a1' };
const PROMPT = { system: 'Classify the industry.', messages: [{ role: 'user' as const, content: 'Industry: crude distillation' }], maxTokens: 200 };
const Schema = z.object({ vertical: z.enum(['Refining', 'Other']), confidence: z.enum(['high', 'low']) });
const OK = { vertical: 'Refining', confidence: 'high' };

function harness(over: Partial<GatewayOptions> = {}) {
  const records: AiCallRecord[] = [];
  const main = new FakeModel([], { deployment: 'gpt-5.4', otherwise: json(OK, { model: 'gpt-5.4-2026-03-05' }) });
  const small = new FakeModel([], { deployment: 'gpt-5.4-mini', otherwise: json(OK, { model: 'gpt-5.4-mini-2026-03-17' }) });
  let clock = 1_000_000;
  const gw = new AiGateway({
    client: main, small, smallFor: ['classify'], flags: { classify: true, why_now: true, copilot: true, healthcheck: true }, timeoutMs: 30_000, maxConcurrency: 4,
    prices: { inputPerMTok: 2.5, outputPerMTok: 15 }, smallPrices: { inputPerMTok: 0.75, outputPerMTok: 4.5 }, record: r => { records.push(r); },
    sleep: async ms => { clock += ms; }, random: () => 0.5, now: () => clock, log: createLogger({ level: 'silent' }), ...over,
  });
  return { gw, main, small, records };
}

/* ─── Routing: main and small models ─── */

test('a capability routed to the small model goes there; the others go to the main model; each record names its deployment and served model', async () => {
  const h = harness();
  assert.equal((await h.gw.json('classify', TPL, PROMPT, Schema, CTX)).ok, true);
  assert.equal((await h.gw.json('why_now', TPL, PROMPT, Schema, CTX)).ok, true);
  assert.deepEqual([h.small.requests.length, h.main.requests.length], [1, 1]);
  assert.deepEqual(h.records.map(r => [r.capability, r.deployment, r.model]), [['classify', 'gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17'], ['why_now', 'gpt-5.4', 'gpt-5.4-2026-03-05']]);
  assert.equal(h.gw.deploymentFor('classify'), 'gpt-5.4-mini');
  assert.equal(h.gw.deploymentFor('why_now'), 'gpt-5.4');
  const d = h.gw.describe();
  assert.deepEqual([d.deployment, d.small?.deployment, d.small?.for], ['gpt-5.4', 'gpt-5.4-mini', ['classify']]);
});

test('each model is priced at its own rate', async () => {
  const h = harness();
  h.small.otherwise(json(OK, { promptTokens: 1_000_000, completionTokens: 1_000_000 }));
  h.main.otherwise(json(OK, { promptTokens: 1_000_000, completionTokens: 1_000_000 }));
  await h.gw.json('classify', TPL, PROMPT, Schema, CTX);
  await h.gw.json('why_now', TPL, PROMPT, Schema, CTX);
  assert.deepEqual(h.records.map(r => r.estCostUsd), [5.25, 17.5]);
});

test('with no small model configured, every capability goes to the main model', async () => {
  const h = harness({ small: null });
  await h.gw.json('classify', TPL, PROMPT, Schema, CTX);
  assert.deepEqual([h.main.requests.length, h.small.requests.length], [1, 0]);
  assert.equal(h.gw.describe().small, null);
});

test('a failing small model opens its own circuit breaker, not the main model\'s', async () => {
  const h = harness({ maxRetries: 0 });
  h.small.otherwise(fail('server', { status: 500 }));
  for (let i = 0; i < 5; i++) await h.gw.json('classify', TPL, PROMPT, Schema, CTX);
  const r = await h.gw.json('classify', TPL, PROMPT, Schema, CTX);
  assert.equal(r.ok === false && r.reason, 'circuit_open');
  assert.equal((await h.gw.json('why_now', TPL, PROMPT, Schema, CTX)).ok, true, 'the main model still answers');
  assert.deepEqual([h.gw.describe().breaker, h.gw.describe().small?.breaker], ['closed', 'open']);
});

test('the health check can be sent to either model', async () => {
  const h = harness();
  await h.gw.text('healthcheck', TPL, { ...PROMPT, route: 'small' }, CTX);
  await h.gw.text('healthcheck', TPL, PROMPT, CTX);
  assert.deepEqual([h.small.requests.length, h.main.requests.length], [1, 1]);
});

/* ─── Reasoning effort, token room, truncation, refusals ─── */

test('the prompt\'s reasoning effort is sent and recorded; the configured override wins', async () => {
  const h = harness({ reasoning: { why_now: 'medium' } });
  await h.gw.json('classify', TPL, { ...PROMPT, reasoning: 'low' }, Schema, CTX);
  await h.gw.json('why_now', TPL, { ...PROMPT, reasoning: 'none' }, Schema, CTX);
  assert.deepEqual([h.small.requests[0].reasoning, h.main.requests[0].reasoning], ['low', 'medium']);
  assert.deepEqual(h.records.map(r => r.reasoningEffort), ['low', 'medium']);
});

test('a reply cut off at the token limit is retried once with twice the room', async () => {
  const h = harness();
  h.small.queue(reply('', { finish: 'length' }), json(OK));
  const r = await h.gw.json('classify', TPL, PROMPT, Schema, CTX);
  assert.equal(r.ok, true);
  assert.deepEqual(h.small.requests.map(q => q.maxTokens), [200, 400]);
});

test('a refusal is a known outcome like a content filter: recorded as filtered, never repaired', async () => {
  const h = harness();
  h.main.queue(reply('', { finish: 'refusal' }));
  const r = await h.gw.json('why_now', TPL, PROMPT, Schema, CTX);
  assert.equal(r.ok === false && r.reason, 'refused');
  assert.equal(h.main.requests.length, 1);
  assert.deepEqual([h.records[0].outcome, h.records[0].fallbackReason, h.records[0].filterCategories], ['filtered', 'refused', ['refusal']]);
});

test('a JSON call carries a strict schema made from its zod schema; a schema strict mode cannot express falls back to JSON mode', async () => {
  const h = harness();
  await h.gw.json('why_now', TPL, PROMPT, Schema, CTX);
  const sent = h.main.requests[0];
  assert.equal(sent.json, true);
  assert.equal(sent.schema?.name, 'test_classify');
  assert.deepEqual(sent.schema?.schema, { type: 'object', additionalProperties: false, required: ['vertical', 'confidence'],
    properties: { vertical: { type: 'string', enum: ['Refining', 'Other'] }, confidence: { type: 'string', enum: ['high', 'low'] } } });
  await h.gw.json('why_now', TPL, PROMPT, z.object({ parts: z.record(z.string(), z.string()) }), CTX);
  assert.equal(h.main.requests[1].json, true);
  assert.equal(h.main.requests[1].schema, null);
});

/* ─── Strict schemas from zod ─── */

const objects = (n: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] => {
  if (Array.isArray(n)) n.forEach(x => objects(x, out));
  else if (n && typeof n === 'object') {
    const o = n as Record<string, unknown>;
    if (o.type === 'object') out.push(o);
    Object.values(o).forEach(x => objects(x, out));
  }
  return out;
};

test('every capability\'s reply schema becomes a strict JSON schema: closed objects, every field required, no constraint keywords', () => {
  const schemas = { classify: classifySchema, whyNow: whyNowSchema, email: emailSchema(['CS-01', 'PS-02']), note: noteSchema,
    brief: briefSchema, piece: pieceSchema, rewrite: rewriteSchema([{ id: 'b1', list: false }, { id: 'b2', list: true }]) };
  for (const [name, s] of Object.entries(schemas)) {
    const js = strictSchema(s as z.ZodType);
    assert.ok(js, `${name} converts`);
    assert.equal(js!.type, 'object', `${name}: the root is an object`);
    assert.equal(js!.$schema, undefined);
    for (const o of objects(js)) {
      assert.equal(o.additionalProperties, false, `${name}: closed`);
      assert.deepEqual([...(o.required as string[])].sort(), Object.keys(o.properties as object).sort(), `${name}: all required`);
    }
    for (const k of ['minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum', 'exclusiveMinimum', 'pattern', 'format']) {
      assert.ok(!JSON.stringify(js).includes(`"${k}"`), `${name}: no ${k}`);
    }
  }
  assert.equal(strictSchema(z.object({ a: z.string().optional() })), null, 'an optional field cannot be strict');
  assert.equal(strictSchema(z.object({ a: z.record(z.string(), z.string()) })), null, 'nor an open record');
  assert.equal(strictSchema(z.string()), null, 'the root must be an object');
});

test('the rewrite schema names each open part, with null for a part left as it is', () => {
  const s = rewriteSchema([{ id: 'b1', list: false }, { id: 'b2', list: true }]);
  assert.equal(s.safeParse({ parts: { b1: 'A new opening.', b2: null }, reply: 'Rewrote the opening.' }).success, true);
  assert.equal(s.safeParse({ parts: { b1: ['a', 'b'], b2: null }, reply: 'x' }).success, false, 'a paragraph stays a paragraph');
  assert.equal(s.safeParse({ parts: { b1: null, b2: ['one', 'two'], b9: 'x' }, reply: 'Rewrote the list.' }).success, false, 'no unknown part');
});

/* ─── The Azure adapter, against captured responses ─── */

type Fx = { status: number; headers: Record<string, string>; body: unknown };
const AZ: Record<string, Fx> = JSON.parse(readFileSync(join(repo, 'tests/fixtures/ai/azure-openai.json'), 'utf8'));

function azure(fx: Fx | Fx[]) {
  const queue = Array.isArray(fx) ? fx.slice() : [fx];
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) });
    const f = queue.shift() ?? queue[0];
    return new Response(JSON.stringify(f.body), { status: f.status, headers: f.headers });
  }) as typeof fetch;
  const client = createAzureClient({ endpoint: 'https://apim.example.test/', apiKey: 'test-key', deployment: 'gpt-5.4', apiVersion: '2025-04-01-preview', authHeader: 'api-key', fetch: fetchFn });
  return { client, sent };
}
const SCHEMA = { name: 'classify_industry', schema: { type: 'object', additionalProperties: false, required: ['vertical'], properties: { vertical: { type: 'string' } } } };
const req = (over: Partial<ModelRequest> = {}): ModelRequest => ({ system: 'sys', messages: [{ role: 'user', content: 'hi' }], json: true, schema: SCHEMA, maxTokens: 150, temperature: 0.2, reasoning: 'low', signal: new AbortController().signal, ...over });

test('Azure: the request a GPT-5 model accepts: max_completion_tokens with room to reason, reasoning_effort, a strict json_schema, no temperature', async () => {
  const { client, sent } = azure(AZ.reasoning_low);
  const r = await client.complete(req());
  const u = new URL(sent[0].url);
  assert.equal(u.pathname, '/openai/deployments/gpt-5.4/chat/completions');
  assert.equal(u.searchParams.get('api-version'), '2025-04-01-preview');
  const b = sent[0].body;
  assert.equal(b.max_tokens, undefined, 'max_tokens is refused by GPT-5 models');
  assert.equal(b.max_completion_tokens, 150 + REASONING_ROOM.low);
  assert.equal(b.reasoning_effort, 'low');
  assert.equal(b.temperature, undefined, 'temperature is refused unless the effort is none');
  assert.deepEqual(b.response_format, { type: 'json_schema', json_schema: { name: 'classify_industry', strict: true, schema: SCHEMA.schema } });
  assert.equal(r.finish, 'stop');
  assert.equal(r.model, 'gpt-5.4-2026-03-05');
  assert.match(r.text, /"vertical":"Refining"/);
  assert.ok(r.completionTokens > 0 && r.promptTokens > 0);
});

test('Azure: at effort none the temperature is sent; with no schema JSON mode is used; a text call has neither', async () => {
  const a = azure(AZ.ok_json);
  await a.client.complete(req({ reasoning: 'none' }));
  assert.deepEqual([a.sent[0].body.temperature, a.sent[0].body.reasoning_effort, a.sent[0].body.max_completion_tokens], [0.2, 'none', 150]);
  const b = azure(AZ.ok_json);
  await b.client.complete(req({ schema: null }));
  assert.deepEqual(b.sent[0].body.response_format, { type: 'json_object' });
  const c = azure(AZ.ok_text_live);
  const t = await c.client.complete(req({ json: false, schema: null, reasoning: undefined }));
  assert.equal(c.sent[0].body.response_format, undefined);
  assert.equal(c.sent[0].body.reasoning_effort, undefined, 'a model without reasoning gets no effort');
  assert.equal(c.sent[0].body.temperature, 0.2);
  assert.match(t.text, /overdue/);
});

test('Azure: the gateway\'s intermittent CheckAccess 400 is a server error (retried); running out of room under a schema is a cut-off reply', async () => {
  const check = await azure(AZ.gateway_check_access).client.complete(req()).then(() => null, e => e);
  assert.ok(check instanceof ModelError);
  assert.deepEqual([check.kind, check.status], ['server', 400]);
  const cut = await azure(AZ.truncated_strict).client.complete(req());
  assert.deepEqual([cut.finish, cut.text], ['length', '']);
  const temp = await azure(AZ.temperature_refused).client.complete(req()).then(() => null, e => e);
  assert.deepEqual([temp?.kind, temp?.status], ['bad_request', 400]);
  const missing = await azure(AZ.deployment_missing).client.complete(req()).then(() => null, e => e);
  assert.deepEqual([missing?.kind, missing?.status], ['bad_request', 404]);
  const denied = await azure(AZ.apim_denied).client.complete(req()).then(() => null, e => e);
  assert.deepEqual([denied?.kind, denied?.status], ['auth', 401]);
});

test('Azure: a structured-outputs refusal comes back as finish "refusal" with no text', async () => {
  const r = await azure(AZ.refusal).client.complete(req());
  assert.deepEqual([r.finish, r.text], ['refusal', '']);
});

test('the gateway retries the CheckAccess refusal and gets an answer from another backend', async () => {
  const { client } = azure([AZ.gateway_check_access, AZ.reasoning_low]);
  const records: AiCallRecord[] = [];
  const gw = new AiGateway({ client, flags: { classify: true }, timeoutMs: 30_000, maxConcurrency: 2, record: r => { records.push(r); }, sleep: async () => {}, log: createLogger({ level: 'silent' }) });
  const r = await gw.json('classify', TPL, PROMPT, z.object({ items: z.array(z.object({ ref: z.number(), vertical: z.string(), confidence: z.string(), reason: z.string() })) }), CTX);
  assert.equal(r.ok, true);
  assert.deepEqual([records[0].attempts, records[0].outcome, records[0].model], [2, 'ok', 'gpt-5.4-2026-03-05']);
});

/* ─── Configuration ─── */

test('configuration: API version 2025-04-01-preview by default, the small deployment and its capabilities, effort overrides, prices per model', () => {
  const base = { AI_PROVIDER: 'azure-openai', AZURE_OPENAI_ENDPOINT: 'https://apim.example.test/', AZURE_OPENAI_API_KEY: 'k', AZURE_OPENAI_DEPLOYMENT: 'gpt-5.4' };
  const p = parseEnv({ ...base, AZURE_OPENAI_DEPLOYMENT_SMALL: 'gpt-5.4-mini', AI_SMALL_MODEL_FOR: 'classify, why_now', AI_REASONING_EFFORT: 'draft_message=medium,copilot=none' });
  if (p.ok === false) return assert.fail(p.errors.join('; '));
  assert.equal(p.env.AZURE_OPENAI_API_VERSION, '2025-04-01-preview');
  assert.deepEqual(p.env.AI_SMALL_MODEL_FOR, ['classify', 'why_now']);
  assert.deepEqual(p.env.AI_REASONING_EFFORT, { draft_message: 'medium', copilot: 'none' });
  assert.deepEqual([p.env.AI_PRICE_INPUT_PER_MTOK, p.env.AI_PRICE_OUTPUT_PER_MTOK, p.env.AI_PRICE_SMALL_INPUT_PER_MTOK, p.env.AI_PRICE_SMALL_OUTPUT_PER_MTOK], [2.5, 15, 0.75, 4.5]);
  const o = gatewayOptions(p.env);
  assert.deepEqual([o.client?.deployment, o.small?.deployment, o.smallFor], ['gpt-5.4', 'gpt-5.4-mini', ['classify', 'why_now']]);
  const plain = parseEnv(base);
  if (plain.ok === false) return assert.fail(plain.errors.join('; '));
  assert.equal(gatewayOptions(plain.env).small, null, 'no small deployment, no small model');
  for (const bad of [{ AI_SMALL_MODEL_FOR: 'classify,summarise' }, { AI_REASONING_EFFORT: 'classify=extreme' }, { AI_REASONING_EFFORT: 'scoring=low' }]) {
    const r = parseEnv({ ...base, ...bad });
    assert.equal(r.ok, false, JSON.stringify(bad));
  }
});
