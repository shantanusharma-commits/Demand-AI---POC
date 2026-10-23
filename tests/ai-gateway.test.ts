// The AI gateway (D-5, D-35, D-40; remediation prompt §7.2–7.4, §7.7): resilience, structured output, metadata
// records, and the two provider adapters against recorded-format responses and a fake Bedrock client. CI never calls
// a live model. Run with --conditions=react-server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { AiGateway, Breaker, parseJsonObject, type AiCallRecord, type GatewayOptions } from '../lib/ai/gateway.ts';
import { azureBase, createAzureClient } from '../lib/ai/providers/azure-openai.ts';
import { createBedrockClient } from '../lib/ai/providers/bedrock.ts';
import { ModelError, retryAfterMs, type ModelRequest } from '../lib/ai/types.ts';
import { parseEnv } from '../lib/server/env.ts';
import { createLogger } from '../lib/server/logger.ts';
import { FakeModel, fail, hang, json, reply } from './helpers/fake-model.ts';

const repo = resolve(import.meta.dirname, '..');
const TPL = { id: 'test.classify', version: 3 };
const CTX = { businessUnitId: '00000000-0000-4000-8000-0000000000b1', userId: '00000000-0000-4000-8000-0000000000a1', requestId: 'req-test-1' };
const SECRET_PROMPT = 'Prompt-Text-That-Must-Never-Be-Logged';
const SECRET_REPLY = 'Reply-Text-That-Must-Never-Be-Logged';
const PROMPT = { system: `Classify the industry. ${SECRET_PROMPT}`, messages: [{ role: 'user' as const, content: 'Industry: crude distillation' }], maxTokens: 200 };
const Schema = z.object({ vertical: z.enum(['Oil refining', 'Chemicals', 'Other']), confidence: z.enum(['high', 'medium', 'low']) });

function harness(client: FakeModel | null, over: Partial<GatewayOptions> = {}) {
  const records: AiCallRecord[] = [], sleeps: number[] = [], lines: Record<string, unknown>[] = [], raw: string[] = [];
  let clock = 1_000_000;
  const log = createLogger({ level: 'trace', destination: { write: (s: string) => { raw.push(s); lines.push(JSON.parse(s)); } } });
  const gw = new AiGateway({
    client, flags: { classify: true, copilot: true }, timeoutMs: 30_000, maxConcurrency: 4, prices: { inputPerMTok: 5, outputPerMTok: 15 },
    record: r => { records.push(r); }, sleep: async ms => { sleeps.push(ms); clock += ms; }, random: () => 0.5, now: () => clock, log, ...over,
  });
  return { gw, records, sleeps, lines, raw, tick: (ms: number) => { clock += ms; } };
}

test('a capability whose flag is off, or with no provider, never reaches a model and leaves no record', async () => {
  const fake = new FakeModel([json({ vertical: 'Other', confidence: 'low' })]);
  const h = harness(fake);
  assert.equal(h.gw.enabled('why_now'), false);
  const off = await h.gw.json('why_now', TPL, PROMPT, Schema, CTX);
  assert.deepEqual(off, { ok: false, reason: 'disabled', callId: null });
  const none = await harness(null).gw.json('classify', TPL, PROMPT, Schema, CTX);
  assert.deepEqual(none, { ok: false, reason: 'not_configured', callId: null });
  assert.equal(fake.requests.length, 0);
  assert.equal(h.records.length, 0);
});

test('a valid JSON reply comes back typed, with one metadata record: template, tokens, cost, outcome', async () => {
  const fake = new FakeModel([json({ vertical: 'Oil refining', confidence: 'high' }, { promptTokens: 1000, completionTokens: 200, providerRequestId: 'prov-1' })]);
  const h = harness(fake);
  const r = await h.gw.json('classify', TPL, PROMPT, Schema, CTX);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { vertical: 'Oil refining', confidence: 'high' });
  assert.equal(fake.requests[0].json, true);
  assert.match(fake.requests[0].system, /Reply with one JSON object only/);
  assert.equal(h.records.length, 1);
  const rec = h.records[0];
  assert.equal(rec.id, r.callId);
  assert.deepEqual({ cap: rec.capability, t: rec.templateId, v: rec.templateVersion, out: rec.outcome, why: rec.fallbackReason, n: rec.attempts, p: rec.promptTokens, c: rec.completionTokens },
    { cap: 'classify', t: 'test.classify', v: 3, out: 'ok', why: null, n: 1, p: 1000, c: 200 });
  assert.equal(rec.estCostUsd, 0.008); // 1000 × $5/M + 200 × $15/M
  assert.equal(rec.providerRequestId, 'prov-1');
  assert.equal(rec.requestId, 'req-test-1');
  assert.equal(rec.businessUnitId, CTX.businessUnitId);
});

test('invalid JSON gets one repair call that quotes the problem; a second failure falls back with the reason', async () => {
  const repaired = new FakeModel([reply('Sure! The vertical is oil refining.'), json({ vertical: 'Oil refining', confidence: 'medium' })]);
  const h = harness(repaired);
  const r = await h.gw.json('classify', TPL, PROMPT, Schema, CTX);
  assert.equal(r.ok, true);
  assert.equal(repaired.requests.length, 2);
  const second = repaired.requests[1].messages;
  assert.equal(second.at(-2)?.role, 'assistant');
  assert.match(second.at(-1)!.content, /not valid JSON/);
  assert.equal(h.records[0].attempts, 2);

  const bad = new FakeModel([json({ vertical: 'Shipbuilding', confidence: 'high' }), json({ vertical: 'Shipbuilding', confidence: 'high' })]);
  const h2 = harness(bad);
  const r2 = await h2.gw.json('classify', TPL, PROMPT, Schema, CTX);
  assert.equal(r2.ok, false);
  if (r2.ok) return;
  assert.equal(r2.reason, 'schema');
  assert.match(bad.requests[1].messages.at(-1)!.content, /vertical/);
  assert.equal(bad.requests.length, 2, 'never more than one repair');
  assert.deepEqual([h2.records[0].outcome, h2.records[0].fallbackReason], ['fallback', 'schema']);
});

test("the capability's own checks get the same single repair, then the rules", async () => {
  const fake = new FakeModel([json({ vertical: 'Other', confidence: 'high' }), json({ vertical: 'Other', confidence: 'high' })]);
  const h = harness(fake);
  const check = (v: z.infer<typeof Schema>) => (v.vertical === 'Other' && v.confidence === 'high' ? { reason: 'checks_failed' as const, problems: ['"Other" cannot be high confidence.'] } : null);
  const r = await h.gw.json('classify', TPL, PROMPT, Schema, CTX, check);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'checks_failed');
  assert.deepEqual(r.problems, ['"Other" cannot be high confidence.']);
  assert.match(fake.requests[1].messages.at(-1)!.content, /cannot be high confidence/);
});

test('a reply cut off at the token limit is repaired as "answer more briefly"', async () => {
  const fake = new FakeModel([reply('{"vertical":"Oil re', { finish: 'length' }), json({ vertical: 'Oil refining', confidence: 'high' })]);
  const r = await harness(fake).gw.json('classify', TPL, PROMPT, Schema, CTX);
  assert.equal(r.ok, true);
  assert.match(fake.requests[1].messages.at(-1)!.content, /cut off/);
});

test('an attempt that hangs is cut off at the timeout and the rules take over (not retried)', async () => {
  const fake = new FakeModel([hang()]);
  const h = harness(fake, { timeoutMs: 40, now: Date.now, sleep: undefined });
  const t0 = Date.now();
  const r = await h.gw.json('classify', TPL, PROMPT, Schema, { ...CTX, deadlineMs: 5_000 });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'timeout');
  assert.ok(Date.now() - t0 < 2_000);
  assert.equal(fake.requests.length, 1);
  assert.ok(fake.requests[0].signal.aborted, 'the request is cancelled, not left running');
  assert.deepEqual([h.records[0].outcome, h.records[0].fallbackReason], ['error', 'timeout']);
});

test('429 waits at least retry-after (plus jitter) and retries; up to 3 retries, then the rules', async () => {
  const fake = new FakeModel([fail('rate_limited', { status: 429, retryAfterMs: 6000 }), json({ vertical: 'Chemicals', confidence: 'medium' })]);
  const h = harness(fake);
  const r = await h.gw.json('classify', TPL, PROMPT, Schema, CTX);
  assert.equal(r.ok, true);
  assert.equal(h.sleeps.length, 1);
  assert.ok(h.sleeps[0] >= 6000 && h.sleeps[0] <= 6250, `slept ${h.sleeps[0]}`);

  const always = new FakeModel([], { otherwise: fail('rate_limited', { status: 429 }) });
  const h2 = harness(always);
  const r2 = await h2.gw.json('classify', TPL, PROMPT, Schema, CTX);
  assert.equal(r2.ok, false);
  assert.equal(always.requests.length, 4, 'one try and three retries');
  assert.deepEqual(h2.sleeps, [250, 500, 1000], 'full jitter (random 0.5) on 500 ms × 2^n');
  assert.deepEqual([h2.records[0].outcome, h2.records[0].fallbackReason, h2.records[0].attempts], ['error', 'rate_limited', 4]);
});

test('5xx is retried with backoff; 400, auth and an over-long retry-after are not', async () => {
  const flaky = new FakeModel([fail('server', { status: 503 }), fail('server', { status: 500 }), json({ vertical: 'Other', confidence: 'low' })]);
  const h = harness(flaky);
  assert.equal((await h.gw.json('classify', TPL, PROMPT, Schema, CTX)).ok, true);
  assert.equal(flaky.requests.length, 3);
  for (const [step, reason] of [[fail('bad_request', { status: 400 }), 'bad_request'], [fail('auth', { status: 401 }), 'auth'],
    [fail('rate_limited', { status: 429, retryAfterMs: 60_000 }), 'rate_limited']] as const) {
    const f = new FakeModel([step, json({ vertical: 'Other', confidence: 'low' })]);
    const r = await harness(f).gw.json('classify', TPL, PROMPT, Schema, CTX);
    assert.equal(r.ok, false);
    if (r.ok === false) assert.equal(r.reason, reason);
    assert.equal(f.requests.length, 1, `${reason} is not retried`);
  }
});

test('retries stop at the caller deadline', async () => {
  const fake = new FakeModel([], { otherwise: fail('server', { status: 502 }) });
  const h = harness(fake, { random: () => 1 });
  const r = await h.gw.json('classify', TPL, PROMPT, Schema, { ...CTX, deadlineMs: 1_400 });
  assert.equal(r.ok, false);
  assert.equal(fake.requests.length, 1, 'a 500 ms backoff would leave under a second before the deadline, so no retry');
});

test('a content-filter result (reply or prompt) is "filtered": categories are kept and logged, the content never', async () => {
  const fake = new FakeModel([reply(SECRET_REPLY, { finish: 'content_filter', filtered: ['violence'] }), fail('content_filter', { status: 400, filtered: ['jailbreak'] })]);
  const h = harness(fake);
  const a = await h.gw.json('classify', TPL, PROMPT, Schema, CTX);
  const b = await h.gw.text('copilot', TPL, PROMPT, CTX);
  assert.deepEqual([a.ok, b.ok], [false, false]);
  assert.equal(fake.requests.length, 2, 'never retried');
  assert.deepEqual(h.records.map(r => [r.outcome, r.fallbackReason, r.filterCategories]), [['filtered', 'content_filter', ['violence']], ['filtered', 'content_filter', ['jailbreak']]]);
  const calls = h.lines.filter(l => l.event === 'ai.call');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(l => l.filterCategories), [['violence'], ['jailbreak']]);
  for (const s of h.raw) { assert.ok(!s.includes(SECRET_PROMPT), 'no prompt text in logs'); assert.ok(!s.includes(SECRET_REPLY), 'no reply text in logs'); }
});

test('the log line per call carries the metadata only (D-6, D-39)', async () => {
  const fake = new FakeModel([json({ vertical: 'Oil refining', confidence: 'high', note: SECRET_REPLY })]);
  const h = harness(fake);
  await h.gw.json('classify', TPL, PROMPT, Schema, CTX);
  const line = h.lines.find(l => l.event === 'ai.call')!;
  for (const k of ['aiCallId', 'capability', 'templateId', 'templateVersion', 'provider', 'deployment', 'latencyMs', 'promptTokens', 'completionTokens', 'attempts', 'outcome', 'estCostUsd']) {
    assert.ok(k in line, `log line has ${k}`);
  }
  for (const s of h.raw) { assert.ok(!s.includes(SECRET_PROMPT)); assert.ok(!s.includes(SECRET_REPLY)); }
});

test('the circuit breaker opens after 5 failed calls, sends the rules for the cool-down, then one trial call decides', async () => {
  const fake = new FakeModel([], { otherwise: fail('network') });
  const h = harness(fake, { maxRetries: 0, breakerCooldownMs: 60_000 });
  for (let i = 0; i < 5; i++) await h.gw.json('classify', TPL, PROMPT, Schema, CTX);
  const sent = fake.requests.length;
  const open = await h.gw.json('classify', TPL, PROMPT, Schema, CTX);
  assert.equal(open.ok, false);
  if (open.ok === false) assert.equal(open.reason, 'circuit_open');
  assert.equal(fake.requests.length, sent, 'no request while open');
  assert.deepEqual([h.records.at(-1)!.outcome, h.records.at(-1)!.fallbackReason, h.records.at(-1)!.attempts], ['fallback', 'circuit_open', 0]);
  h.tick(60_000);
  const ok = new FakeModel([json({ vertical: 'Other', confidence: 'low' })]);
  (h.gw as unknown as { client: FakeModel }).client = ok;
  assert.equal((await h.gw.json('classify', TPL, PROMPT, Schema, CTX)).ok, true, 'the trial call goes through');
  assert.equal(ok.requests.length, 1);
});

test('the breaker lets only one trial through when half-open, and reopens if it fails', () => {
  const b = new Breaker(2, 1000);
  b.failure(0); b.failure(0);
  assert.equal(b.state(10), 'open');
  assert.equal(b.allow(10), false);
  assert.equal(b.allow(1000), true);
  assert.equal(b.allow(1000), false, 'a second caller waits for the trial');
  b.failure(1001);
  assert.equal(b.state(1500), 'open');
  assert.equal(b.allow(2001), true);
  b.success();
  assert.equal(b.state(2002), 'closed');
});

test('the per-process limit holds calls in flight; a caller that cannot get a slot in time gets "busy"', async () => {
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  let inFlight = 0, peak = 0;
  const step = async () => { inFlight++; peak = Math.max(peak, inFlight); await gate; inFlight--; return json({ vertical: 'Other', confidence: 'low' }); };
  const fake = new FakeModel([step, step, step]);
  const h = harness(fake, { maxConcurrency: 2, now: Date.now, sleep: undefined });
  const calls = [1, 2, 3].map(() => h.gw.json('classify', TPL, PROMPT, Schema, CTX));
  await new Promise(r => setTimeout(r, 20));
  assert.equal(peak, 2);
  assert.equal(h.gw.slots.inFlight, 2);
  release();
  const out = await Promise.all(calls);
  assert.deepEqual(out.map(o => o.ok), [true, true, true]);

  const stuck = new FakeModel([hang()]);
  const h2 = harness(stuck, { maxConcurrency: 1, now: Date.now, sleep: undefined, timeoutMs: 5_000 });
  const first = h2.gw.json('classify', TPL, PROMPT, Schema, { ...CTX, deadlineMs: 3_000 });
  const second = await h2.gw.json('classify', TPL, PROMPT, Schema, { ...CTX, deadlineMs: 1_200 });
  assert.equal(second.ok, false);
  if (second.ok === false) assert.equal(second.reason, 'busy');
  await first;
});

test('a cancelled request (the person pressed Stop) ends as "aborted" and does not count against the provider', async () => {
  const fake = new FakeModel([hang()]);
  const h = harness(fake, { now: Date.now, sleep: undefined });
  const ctl = new AbortController();
  const p = h.gw.text('copilot', TPL, PROMPT, { ...CTX, signal: ctl.signal });
  setTimeout(() => ctl.abort(), 10);
  const r = await p;
  assert.equal(r.ok, false);
  if (r.ok === false) assert.equal(r.reason, 'aborted');
  assert.equal(h.gw.breaker.state(Date.now()), 'closed');
});

test('JSON is read out of a code fence or a sentence; anything else is reported', () => {
  assert.deepEqual(parseJsonObject('```json\n{"a":1}\n```'), { ok: true, value: { a: 1 } });
  assert.deepEqual(parseJsonObject('Here it is: {"a":2} hope that helps'), { ok: true, value: { a: 2 } });
  assert.equal(parseJsonObject('[1,2]').ok, false);
  assert.equal(parseJsonObject('no json').ok, false);
  assert.equal(retryAfterMs(n => ({ 'retry-after': '6' } as Record<string, string>)[n]), 6000);
  assert.equal(retryAfterMs(n => ({ 'retry-after-ms': '1500', 'retry-after': '6' } as Record<string, string>)[n]), 1500);
  assert.equal(retryAfterMs(n => ({ 'retry-after': new Date(10_000).toUTCString() } as Record<string, string>)[n], 4_000), 6000);
});

/* ─── Azure OpenAI adapter, against responses in Azure's documented format ─── */

type Fx = { status: number; headers: Record<string, string>; body: unknown };
const AZ: Record<string, Fx> = JSON.parse(readFileSync(join(repo, 'tests/fixtures/ai/azure-openai.json'), 'utf8'));
const KEY = 'test-key-not-a-real-one';

function azure(fx: Fx | Fx[], over: { authHeader?: 'api-key' | 'Ocp-Apim-Subscription-Key'; endpoint?: string } = {}) {
  const queue = Array.isArray(fx) ? fx.slice() : [fx];
  const sent: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? '{}')) });
    const f = queue.shift() ?? queue[0];
    return new Response(JSON.stringify(f.body), { status: f.status, headers: f.headers });
  }) as typeof fetch;
  const client = createAzureClient({ endpoint: over.endpoint ?? 'https://apim.example.test/', apiKey: KEY, deployment: 'gpt-4o', apiVersion: '2024-06-01',
    authHeader: over.authHeader ?? 'api-key', fetch: fetchFn });
  return { client, sent };
}
const req = (json = true): ModelRequest => ({ system: 'sys', messages: [{ role: 'user', content: 'hi JSON' }], json, maxTokens: 150, temperature: 0.2, signal: new AbortController().signal });

test('Azure: the deployment path, api-version 2024-06-01, JSON mode, max_tokens and the api-key header', async () => {
  const { client, sent } = azure(AZ.ok_json);
  const r = await client.complete(req());
  assert.equal(sent.length, 1);
  const u = new URL(sent[0].url);
  assert.equal(u.pathname, '/openai/deployments/gpt-4o/chat/completions');
  assert.equal(u.searchParams.get('api-version'), '2024-06-01');
  assert.equal(sent[0].headers.get('api-key'), KEY);
  assert.equal(sent[0].headers.get('authorization'), null);
  assert.deepEqual(sent[0].body.response_format, { type: 'json_object' });
  assert.equal(sent[0].body.max_tokens, 150);
  assert.deepEqual((sent[0].body.messages as { role: string }[]).map(m => m.role), ['system', 'user']);
  assert.equal(r.finish, 'stop');
  assert.match(r.text, /Oil refining/);
  assert.deepEqual([r.promptTokens, r.completionTokens], [312, 38]);
  assert.equal(r.providerRequestId, '8e7d6c5b-0000-4000-8000-000000000002');
  const text = azure(AZ.ok_text);
  await text.client.complete(req(false));
  assert.equal(text.sent[0].body.response_format, undefined, 'no JSON mode for a text answer');
});

test('Azure behind API Management: the key goes as Ocp-Apim-Subscription-Key only; an /openai path is the base URL', async () => {
  const { client, sent } = azure(AZ.ok_json, { authHeader: 'Ocp-Apim-Subscription-Key', endpoint: 'https://apim.example.test/ai-gateway/openai' });
  await client.complete(req());
  assert.equal(sent[0].headers.get('ocp-apim-subscription-key'), KEY);
  assert.equal(sent[0].headers.get('api-key'), null);
  assert.equal(new URL(sent[0].url).pathname, '/ai-gateway/openai/deployments/gpt-4o/chat/completions');
  assert.deepEqual(azureBase('https://r.openai.azure.com/'), { endpoint: 'https://r.openai.azure.com/' });
  assert.deepEqual(azureBase('https://apim.example.test/x/openai/'), { baseURL: 'https://apim.example.test/x/openai' });
});

test('Azure: filtered replies and prompts, 429, 5xx, a refused key and a missing deployment map to their kinds', async () => {
  const filtered = await azure(AZ.completion_filtered).client.complete(req());
  assert.deepEqual([filtered.finish, filtered.filtered], ['content_filter', ['violence']]);
  assert.equal((await azure(AZ.truncated).client.complete(req())).finish, 'length');
  const kinds: [string, string, Partial<ModelError>][] = [
    ['prompt_filtered', 'content_filter', { filtered: ['jailbreak'] }], ['rate_limited', 'rate_limited', { retryAfterMs: 6000, status: 429 }],
    ['server_error', 'server', { status: 500 }], ['apim_denied', 'auth', { status: 401 }], ['deployment_missing', 'bad_request', { status: 404 }],
  ];
  for (const [name, kind, extra] of kinds) {
    const err = await azure(AZ[name]).client.complete(req()).then(() => null, e => e);
    assert.ok(err instanceof ModelError, `${name} is a ModelError`);
    assert.equal(err.kind, kind, name);
    for (const [k, v] of Object.entries(extra)) assert.deepEqual((err as unknown as Record<string, unknown>)[k], v, `${name} ${k}`);
    assert.ok(!err.message.includes(KEY));
  }
  const ctl = new AbortController(); ctl.abort();
  const aborted = await azure(AZ.ok_json).client.complete({ ...req(), signal: ctl.signal }).then(() => null, e => e);
  assert.equal(aborted?.kind, 'aborted');
});

/* ─── Bedrock adapter, against a fake client ─── */

function bedrock(answer: unknown) {
  const sent: { input: Record<string, unknown>; signal?: AbortSignal }[] = [];
  const client = createBedrockClient({ region: 'ap-southeast-1', modelId: 'anthropic.example-model-v1', client: {
    async send(command, options) {
      sent.push({ input: command.input as unknown as Record<string, unknown>, signal: options?.abortSignal });
      if (answer instanceof Error) throw answer;
      return answer as never;
    },
  } });
  return { client, sent };
}
const awsError = (name: string, status?: number) => Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });

test('Bedrock: one Converse call with the system prompt, the turns and the limits; the reply, tokens and stop reason read back', async () => {
  const { client, sent } = bedrock({ output: { message: { role: 'assistant', content: [{ text: '{"a":' }, { text: '1}' }] } }, stopReason: 'end_turn',
    usage: { inputTokens: 210, outputTokens: 12, totalTokens: 222 }, $metadata: { requestId: 'aws-req-1' } });
  const r = await client.complete(req());
  assert.equal(client.provider, 'bedrock');
  assert.equal(client.deployment, 'anthropic.example-model-v1');
  assert.deepEqual(sent[0].input.system, [{ text: 'sys' }]);
  assert.deepEqual(sent[0].input.messages, [{ role: 'user', content: [{ text: 'hi JSON' }] }]);
  assert.deepEqual(sent[0].input.inferenceConfig, { maxTokens: 150, temperature: 0.2 });
  assert.ok(sent[0].signal, 'the abort signal is passed');
  assert.deepEqual([r.text, r.finish, r.promptTokens, r.completionTokens, r.providerRequestId], ['{"a":1}', 'stop', 210, 12, 'aws-req-1']);
  for (const [stop, finish] of [['max_tokens', 'length'], ['guardrail_intervened', 'content_filter'], ['content_filtered', 'content_filter']]) {
    const x = await bedrock({ output: { message: { content: [{ text: '' }] } }, stopReason: stop, usage: {}, $metadata: {} }).client.complete(req());
    assert.equal(x.finish, finish, stop);
  }
});

test('Bedrock: throttling, server faults, refused roles and bad requests map to their kinds', async () => {
  const cases: [Error, string][] = [[awsError('ThrottlingException', 429), 'rate_limited'], [awsError('ServiceUnavailableException', 503), 'server'],
    [awsError('InternalServerException', 500), 'server'], [awsError('ModelTimeoutException', 408), 'timeout'], [awsError('AccessDeniedException', 403), 'auth'],
    [awsError('CredentialsProviderError'), 'auth'], [awsError('ValidationException', 400), 'bad_request'], [awsError('AbortError'), 'aborted']];
  for (const [e, kind] of cases) {
    const err = await bedrock(e).client.complete(req()).then(() => null, x => x);
    assert.ok(err instanceof ModelError, e.name);
    assert.equal(err.kind, kind, e.name);
  }
});

/* ─── Configuration and boundaries ─── */

test('the endpoint must be https except to this machine; Bedrock refuses static AWS keys', () => {
  const base = { AI_PROVIDER: 'azure-openai', AZURE_OPENAI_API_KEY: 'k', AZURE_OPENAI_DEPLOYMENT: 'gpt-4o' };
  assert.equal(parseEnv({ ...base, AZURE_OPENAI_ENDPOINT: 'http://models.example.test/' }).ok, false);
  assert.equal(parseEnv({ ...base, AZURE_OPENAI_ENDPOINT: 'http://127.0.0.1:4010/' }).ok, true);
  assert.equal(parseEnv({ ...base, AZURE_OPENAI_ENDPOINT: 'https://apim.example.test/' }).ok, true);
  const keys = parseEnv({ AI_PROVIDER: 'bedrock', AWS_REGION: 'ap-southeast-1', BEDROCK_MODEL_ID: 'm', AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE', AWS_SECRET_ACCESS_KEY: 'shh' });
  assert.equal(keys.ok, false);
  if (keys.ok) return;
  assert.deepEqual(keys.errors.map(e => e.split(' ')[0]).sort(), ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']);
  for (const e of keys.errors) assert.ok(!e.includes('AKIAEXAMPLE') && !e.includes('shh'));
  const role = parseEnv({ AI_PROVIDER: 'bedrock', AWS_REGION: 'ap-southeast-1', BEDROCK_MODEL_ID: 'm' });
  assert.equal(role.ok, true);
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'legacy', 'reference_content', 'test-data', 'vendor', 'tests'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(name)) out.push(relative(repo, p));
  }
  return out;
}

test('only the gateway reaches a model: one adapter per SDK, and only the gateway imports the adapters', () => {
  const imports = (f: string) => [...readFileSync(join(repo, f), 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  const files = sourceFiles(repo);
  const using = (re: RegExp) => files.filter(f => imports(f).some(i => re.test(i))).sort();
  assert.deepEqual(using(/^openai(\/|$)/), ['lib/ai/providers/azure-openai.ts']);
  assert.deepEqual(using(/^@aws-sdk\//), ['lib/ai/providers/bedrock.ts']);
  assert.deepEqual(using(/providers\/(azure-openai|bedrock)(\.ts)?$/), ['lib/ai/gateway.ts']);
  for (const f of ['lib/ai/gateway.ts', 'lib/ai/providers/azure-openai.ts', 'lib/ai/providers/bedrock.ts']) {
    assert.match(readFileSync(join(repo, f), 'utf8'), /^import 'server-only';$/m, `${f} is server-only`);
  }
});
