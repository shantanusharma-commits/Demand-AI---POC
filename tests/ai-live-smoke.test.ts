// An optional live smoke test of the configured model (remediation prompt §7.9). It runs only when AI_LIVE_SMOKE=1 and
// AI_PROVIDER with its settings are in the environment (npm run test:ai-live reads .env.local); otherwise every test
// is skipped. CI never sets it. It sends only fictional text, and nothing is stored. Run with --conditions=react-server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AiGateway } from '../lib/ai/gateway.ts';
import { classifyIndustries } from '../lib/ai/classify.ts';
import { wordWhyNow } from '../lib/ai/why-now.ts';
import { Aliases, answerCopilot } from '../lib/ai/copilot.ts';
import { CAPABILITIES } from '../lib/ai/types.ts';
import { parseEnv } from '../lib/server/env.ts';
import { gatewayOptions } from '../lib/server/ai.ts';

const parsed = parseEnv(process.env);
const env = parsed.ok ? parsed.env : null;
const opts = env?.AI_LIVE_SMOKE ? gatewayOptions(env) : null;
const skip = !opts?.client ? 'set AI_LIVE_SMOKE=1 and an AI provider in .env.local to run the live smoke test' : false;
// Built as the app builds it (D-44: the small model for its capabilities), every capability on.
const gw = opts?.client ? new AiGateway({ ...opts, flags: Object.fromEntries(CAPABILITIES.map(c => [c, true])), maxConcurrency: 2 }) : null;
const CTX = { businessUnitId: '00000000-0000-4000-8000-000000000000', userId: '00000000-0000-0000-0000-000000000001', deadlineMs: 60_000 };

test('each configured model answers a one-word check', { skip }, async () => {
  for (const route of gw!.small ? (['main', 'small'] as const) : (['main'] as const)) {
    const r = await gw!.text('healthcheck', { id: 'healthcheck', version: 1 }, { system: 'Reply with the single word OK.', messages: [{ role: 'user', content: 'Reply with OK.' }],
      maxTokens: 16, reasoning: 'none', route }, CTX);
    assert.equal(r.ok, true, `${route}: ${JSON.stringify(r)}`);
  }
});

test('structured outputs, validation and the checks work end to end: three industry texts classified', { skip }, async () => {
  const r = await classifyIndustries(gw!, CTX, [{ key: 'a', industry: 'Crude oil refinery', siteProcess: 'Atmospheric distillation' },
    { key: 'b', industry: 'EPC contractor', siteProcess: '' }, { key: 'c', industry: 'Pulp and paper', siteProcess: 'Tissue' }]);
  assert.equal(r.answers.size, 3, JSON.stringify(r.fallbacks));
  assert.equal(r.answers.get('a')?.vertical, 'Refining');
  assert.notEqual(r.answers.get('c')?.vertical, 'Refining');
});

test('a why-now line grounded in its row', { skip }, async () => {
  const r = await wordWhyNow(gw!, CTX, [{ key: 'p', jobTitle: 'Instrument Engineer', persona: 'Primary',
    signals: [{ row: 12, type: 'Inquiry or RFQ', date: '2026-09-17', detail: 'Asked about migrating a legacy control system during the 2028 turnaround', source: 'Website form', weight: 100 }] }]);
  assert.equal(r.lines.size, 1, JSON.stringify(r.fallbacks));
});

test('Copilot answers from the data, with people as tokens', { skip }, async () => {
  const al = new Aliases();
  const data = `Items in the queue (2):\n- ${al.token('Ana Example')} (Plant Manager) · Northwind Refining · Unsupported claim · Due by 17:00 today\n- ${al.token('Budi Example')} (Engineer) · Andaman Petroleum · Low confidence · Due by Mon 27 Oct`;
  const r = await answerCopilot(gw!, CTX, { screen: 'For Review', about: '', data, partial: [] }, al, 'Which one is due first?', []);
  assert.equal(r.ok, true, JSON.stringify(r));
});
