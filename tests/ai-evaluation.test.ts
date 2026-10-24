// The AI evaluation's scoring (lib/ai/evaluation.ts; remediation prompt §7.9), proved with fake models: a classifier
// that knows the answers meets the target, a careless one fails it, and the why-now and drafting measures count what
// a model wrote and what fell back. The live run is scripts/ai/evaluate.ts (AI_LIVE_SMOKE=1). Run with
// --conditions=react-server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AiGateway, type AiCallRecord } from '../lib/ai/gateway.ts';
import { callSummary, evaluate, evaluationMarkdown, expectedVertical } from '../lib/ai/evaluation.ts';
import * as E from '../lib/demandai-engine.ts';
import { AS_OF, loadDataset } from './helpers/answer-key.ts';
import { FakeModel, type StepFn } from './helpers/fake-model.ts';
import { classifier, draftWriter, whyNowWriter } from './helpers/ai-fakes.ts';

const CTX = { businessUnitId: '00000000-0000-4000-8000-0000000000b1', userId: '00000000-0000-4000-8000-0000000000a1' };
const data = loadDataset();
const input = { leadGrid: data.leadGrid, signalGrid: data.signalGrid, accountKey: data.accountKey as Record<string, unknown>[], asOf: AS_OF };

/** One fake for every capability, telling the requests apart by their prompts. */
function model(cls: StepFn): FakeModel {
  const wn = whyNowWriter(), dr = draftWriter();
  return new FakeModel([], { otherwise: (req, n) => (/classify the industry/.test(req.system) ? cls : /why now/.test(req.system) ? wn : dr)(req, n) });
}
const gw = (m: FakeModel) => new AiGateway({ client: m, flags: { classify: true, why_now: true, draft_message: true }, timeoutMs: 5_000, maxConcurrency: 8, sleep: async () => {} });

test("the key's verticals as the pilot's choices", () => {
  assert.deepEqual(['Refining (core)', 'Petrochemicals (core)', 'Influencer (EPC)', 'Out of ICP (power)'].map(expectedVertical), ['Refining', 'Petrochemicals', 'Other', 'Out of ICP']);
});

test('a classifier that knows the answers meets the target; one that calls everything Refining fails it', async () => {
  const base = E.processLeads(data.leadGrid, { file: 'f', sheet: 'Lead template' });
  const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const key = new Map((data.accountKey as Record<string, unknown>[]).map(k => [norm(k.company_name), k.true_vertical]));
  const truth = new Map<string, string>();
  for (const a of base.accounts) if (a.needsReview) truth.set(E.industryKey(a.industry, a.siteProcess), expectedVertical(key.get(norm(a.name))));
  const oracle = await evaluate(gw(model(classifier(it => ({ vertical: truth.get(E.industryKey(it.industry, it.siteProcess)) ?? 'Other' })))), CTX, input, { drafts: 5 });
  assert.equal(oracle.classification.met, true, JSON.stringify(oracle.classification));
  assert.equal(oracle.classification.outOfIcpCore, 0);
  assert.ok(oracle.classification.inIcpPct >= 95);
  assert.equal(oracle.classification.answered, oracle.classification.asked);
  const careless = await evaluate(gw(model(classifier(() => ({ vertical: 'Refining' })))), CTX, input, { drafts: 5 });
  assert.equal(careless.classification.met, false);
  assert.ok(careless.classification.outOfIcpCore > 500, `${careless.classification.outOfIcpCore} out-of-ICP accounts called core`);
  const md = evaluationMarkdown(careless, 'fake');
  assert.match(md, /\| Out-of-ICP accounts classified core \| \d+ \| 0 \|/);
  assert.match(md, /Classification target not met\./);
  assert.equal(oracle.whyNow.worded, oracle.whyNow.asked);
  assert.equal(oracle.drafts.passing, oracle.drafts.written);
});

test('a draft whose only flag is the sensitive term the rules\' draft also has is counted apart, not as failing', async () => {
  // The gate lets such a draft through (it goes to a person, as the rules' draft would); the first live evaluation
  // counted it as not passing, which read as a broken promise.
  const { BRAND_RULES } = await import('../lib/engine/nba.ts');
  const echo = draftWriter(a => (a.channel === 'Email' && BRAND_RULES.sensitive.test(a.signal) ? { subject: 'about your question', opening: 'Thanks for looking at the security material.',
    bridge: 'A short conversation is usually the quickest way to work out what fits your site.', ask: 'Would a short call next week help?', claimId: a.claimIds[0] } : null));
  const m = new FakeModel([], { otherwise: (req, n) => (/classify the industry/.test(req.system) ? classifier(() => ({ vertical: 'Other' })) : /why now/.test(req.system) ? whyNowWriter() : echo)(req, n) });
  const r = await evaluate(gw(m), CTX, input, { drafts: 12 });
  assert.ok(r.drafts.sensitive > 0, JSON.stringify(r.drafts));
  assert.equal(r.drafts.passing + r.drafts.sensitive, r.drafts.written, JSON.stringify(r.drafts));
  assert.match(evaluationMarkdown(r, 'fake'), new RegExp(`\\| ${r.drafts.written} of ${r.drafts.asked} / ${r.drafts.passing} / ${r.drafts.sensitive} `));
});

test('the call summary shows, per capability, the model that answered, the effort, latency, tokens and cost', () => {
  const rec = (capability: AiCallRecord['capability'], model: string | null, latencyMs: number, outcome: AiCallRecord['outcome'] = 'ok'): AiCallRecord => ({
    id: 'x', capability, templateId: 't', templateVersion: 1, provider: 'azure-openai', deployment: model ? model.replace(/-2026.*/, '') : 'gpt-5.4', model,
    reasoningEffort: 'low', latencyMs, promptTokens: 1000, completionTokens: 200, attempts: 1, outcome, fallbackReason: outcome === 'ok' ? null : 'timeout',
    filterCategories: [], estCostUsd: 0.005, requestId: null, providerRequestId: null, businessUnitId: 'b', userId: 'u' });
  const md = callSummary([rec('classify', 'gpt-5.4-mini-2026-03-17', 900), rec('classify', 'gpt-5.4-mini-2026-03-17', 1500), rec('classify', 'gpt-5.4-mini-2026-03-17', 3000),
    rec('why_now', null, 30_000, 'error')]);
  assert.match(md, /\| classify \| gpt-5\.4-mini-2026-03-17 \| low \| 3 \(3 ok\) \| 1\.5 s \/ 3\.0 s \| 3,000 \/ 600 \| 0\.015 \|/);
  assert.match(md, /\| why_now \| gpt-5\.4 \(no answer\) \| low \| 1 \(0 ok\) \| 30\.0 s \/ 30\.0 s \|/);
});
