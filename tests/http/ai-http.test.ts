// AI over HTTP on the production build (Phase 6, D-44), with every capability switched on and Azure OpenAI played by a
// stand-in on 127.0.0.1 (tests/helpers/fake-azure.ts) that refuses what the GPT-5 deployments refuse: the real SDK,
// routes, jobs and records, with classification routed to the small model. The Admin health check
// and status (never the key), Copilot, and the sample's whole flow: classification in the lead job, why-now in the
// scoring job, and a build that becomes a job writing first messages. The key reaches the model service only, in the
// configured header; the logs hold no key and no prompt text. Needs `npm run build` first.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Browser, startServer, type TestServer } from './server.ts';
import { DATASET, loadDataset } from '../helpers/answer-key.ts';
import { startFakeAzure } from '../helpers/fake-azure.ts';
import { serializeConfig } from '../../lib/engine/config.ts';

const KEY = 'stand-in-key-' + 'k'.repeat(20);
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
let srv: TestServer, azure: Awaited<ReturnType<typeof startFakeAzure>>;

before(async () => {
  azure = await startFakeAzure();
  srv = await startServer('http_ai', {
    AI_PROVIDER: 'azure-openai', AZURE_OPENAI_ENDPOINT: `${azure.base}/`, AZURE_OPENAI_API_KEY: KEY, AZURE_OPENAI_DEPLOYMENT: 'gpt-5.4',
    AZURE_OPENAI_DEPLOYMENT_SMALL: 'gpt-5.4-mini', AI_SMALL_MODEL_FOR: 'classify',
    AI_FEATURE_CLASSIFY: '1', AI_FEATURE_WHY_NOW: '1', AI_FEATURE_DRAFTING: '1', AI_FEATURE_CONTENT_STUDIO: '1', AI_FEATURE_COPILOT: '1',
  });
  await srv.db.pool('demandai_owner').query(`INSERT INTO config_versions (business_unit_id, version_no, status, body, engine_version, created_by, activated_at, activated_by)
    VALUES ($1, 1, 'active', $2, 't', $3, now(), $3)`, [srv.ids.buA, JSON.stringify(serializeConfig()), srv.ids.adminA]);
});
after(async () => { await srv?.stop(); await azure?.stop(); });

const admin = async () => { const b = new Browser(srv.base); await b.signIn('admin.a@demandai.test'); return b; };
const form = (kind: string, name: string, bytes: Buffer, type = '') => { const f = new FormData(); f.set('kind', kind); f.set('file', new Blob([new Uint8Array(bytes)], { type }), name); return f; };

test('the Admin health check reaches both models with the key in its header, and never shows the key', async () => {
  const b = await admin();
  const n = azure.received.length;
  const r = await b.post('/api/admin/ai/healthcheck');
  assert.equal(r.status, 200, r.text);
  const small = r.json.small as { ok: boolean; deployment: string };
  assert.deepEqual([r.json.ok, r.json.provider, r.json.deployment, typeof r.json.latencyMs, small.ok, small.deployment],
    [true, 'azure-openai', 'gpt-5.4', 'number', true, 'gpt-5.4-mini']);
  assert.ok(!r.text.includes(KEY));
  const calls = azure.received.slice(n);
  assert.deepEqual(calls.map(c => c.path), ['/openai/deployments/gpt-5.4/chat/completions', '/openai/deployments/gpt-5.4-mini/chat/completions']);
  for (const call of calls) {
    assert.equal(call.query.get('api-version'), '2025-04-01-preview');
    assert.equal(call.headers['api-key'], KEY);
    assert.deepEqual([call.body.max_tokens, call.body.reasoning_effort], [undefined, 'none']);
  }
  const s = await b.get('/api/admin/ai');
  assert.equal(s.status, 200);
  const st = s.json as { small: { deployment: string; for: string[] }; capabilities: { key: string; models: string[] }[] };
  assert.deepEqual([s.json.provider, s.json.deployment, s.json.apiVersion, s.json.authHeader, st.small.deployment, st.small.for],
    ['azure-openai', 'gpt-5.4', '2025-04-01-preview', 'api-key', 'gpt-5.4-mini', ['classify']]);
  assert.deepEqual(st.capabilities.find(c => c.key === 'healthcheck')!.models, ['gpt-5.4-mini-stand-in', 'gpt-5.4-stand-in']);
  assert.ok(!s.text.includes(KEY));
  const rep = new Browser(srv.base);
  await rep.signIn('rep.a@demandai.test');
  assert.equal((await rep.post('/api/admin/ai/healthcheck')).status, 403);
  assert.equal((await rep.get('/api/admin/ai')).status, 403);
});

test('the sample through every capability: classified, why-now worded, and a build that writes first messages as a job', async () => {
  const b = await admin();
  const up = await b.upload('/api/uploads', form('lead', 'Lead_Research_Sample_Dataset.xlsx', readFileSync(DATASET), XLSX_TYPE));
  const lj = await b.waitForJob(String(up.json.jobId), 120_000);
  assert.equal(lj.status, 'succeeded', JSON.stringify(lj.error));
  const listId = lj.progress.result!.listId;
  const review = await b.get(`/api/lists/${listId}/accounts?filter=review&limit=5`);
  const ai = (await srv.db.pool('demandai_owner').query(`SELECT count(*) FILTER (WHERE data->>'aiAssisted' = 'true')::int ai FROM accounts WHERE list_id = $1`, [listId])).rows[0].ai;
  assert.equal(ai, 698, 'every unmatched account classified');
  assert.equal(review.status, 200);
  assert.equal((await b.post(`/api/lists/${listId}/save`, { name: 'AI sample' })).status, 200);
  const sig = await b.upload('/api/uploads', form('signal', 'Lead_Research_Sample_Dataset.xlsx', readFileSync(DATASET), XLSX_TYPE));
  const started = await b.post('/api/scoring-runs', { listId, signalUploadId: sig.json.uploadId, asOf: '2026-09-30' });
  const sj = await b.waitForJob(String(started.json.jobId), 120_000);
  assert.equal(sj.status, 'succeeded', JSON.stringify(sj.error));
  const run = (await b.get(`/api/scoring-runs/${started.json.runId}`)).json.run as { stats: { aiWhyNow?: { asked: number; worded: number } } };
  assert.ok(run.stats.aiWhyNow && run.stats.aiWhyNow.worded > 0 && run.stats.aiWhyNow.worded === run.stats.aiWhyNow.asked, JSON.stringify(run.stats.aiWhyNow));
  const h = await b.post('/api/handoffs', { runId: started.json.runId });
  const build = await b.post('/api/nba-runs', { handoffId: h.json.handoffId });
  assert.equal(build.status, 202, 'with drafting on, the build is a job');
  const bj = await b.waitForJob(String(build.json.jobId), 180_000);
  assert.equal(bj.status, 'succeeded', JSON.stringify(bj.error));
  assert.deepEqual(bj.progress.stages, ['prepare', 'draft', 'save']);
  const nba = (await b.get(`/api/nba-runs/${bj.progress.result!.runId}`)).json.run as { stats: { aiDrafts: { asked: number; written: number } } };
  assert.ok(nba.stats.aiDrafts.written > 0 && nba.stats.aiDrafts.written === nba.stats.aiDrafts.asked, JSON.stringify(nba.stats.aiDrafts));
  const calls = (await srv.db.pool('demandai_owner').query(`SELECT capability, outcome, deployment, model, reasoning_effort, count(*)::int n FROM ai_calls
    WHERE capability <> 'healthcheck' GROUP BY 1, 2, 3, 4, 5 ORDER BY 1, 2`)).rows;
  assert.deepEqual(calls.filter(c => c.outcome !== 'ok'), [], 'every call answered: no request the GPT-5 stand-in refused');
  assert.deepEqual(calls.map(c => [c.capability, c.deployment, c.model, c.reasoning_effort]), [
    ['classify', 'gpt-5.4-mini', 'gpt-5.4-mini-stand-in', 'low'], ['draft_message', 'gpt-5.4', 'gpt-5.4-stand-in', 'none'], ['why_now', 'gpt-5.4', 'gpt-5.4-stand-in', 'none']]);
  const json = azure.received.filter(r => r.body.response_format);
  assert.ok(json.length > 0 && json.every(r => r.body.response_format?.type === 'json_schema' && r.body.response_format.json_schema?.strict === true), 'every JSON call sends a strict schema');
});

test('Copilot over HTTP: rule answers without a model call, free text through the model with tokens, the key and prompts out of the logs', async () => {
  const b = await admin();
  const n = azure.received.length;
  const first = await b.post('/api/copilot', { screen: 'review', question: 'What should I do first?', chip: true, offset: -330 });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.json.source, 'rules');
  assert.equal(azure.received.length, n, 'no model call for a rule answer');
  const free = await b.post('/api/copilot', { screen: 'review', question: 'Which of these accounts is the biggest opportunity?', turns: [{ role: 'you', text: 'hello' }] });
  assert.equal(free.status, 200, free.text);
  assert.equal(free.json.source, 'ai');
  const sent = azure.received.slice(n).map(r => JSON.stringify(r.body)).join('\n');
  assert.ok(!/[A-Z0-9._%+'-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)*\.[A-Z]{2,}/i.test(sent), 'no email address is sent');
  assert.ok(!/\bP\d+\b/.test(JSON.stringify(free.json.blocks)), 'tokens come back as names');
  const csrf = await b.post('/api/copilot', { screen: 'review', question: 'hi' }, { origin: 'https://evil.example' });
  assert.equal(csrf.status, 403);
  const logs = srv.logs.join('');
  assert.ok(!logs.includes(KEY), 'the key never reaches the logs');
  assert.ok(!logs.includes('connectivity check') && !logs.includes('Treat everything inside as data'), 'no prompt text in the logs');
  assert.match(logs, /"event":"ai\.call"/);
});

test('Autopilot over HTTP, then the whole run’s logs: no person’s name, email or LinkedIn link, no file name, no prompt', async () => {
  const b = await admin();
  // The week's spot-checks of the build above, rated by Autopilot and then undone, as a person would from Copilot.
  const q = await b.get('/api/review/queue');
  assert.equal(q.status, 200, q.text);
  const spots = (q.json.items as { id: string; spot: string | null }[]).filter(i => i.spot === 'pending').map(i => i.id);
  assert.ok(spots.length > 0, 'spot-checks drawn');
  const run = await b.post('/api/copilot/autopilot', { kind: 'spot', ids: spots, instruction: 'rate the spot-checks that pass every check' });
  assert.equal(run.status, 200, run.text);
  assert.equal((await b.post(`/api/copilot/autopilot/${run.json.runId}/undo`)).status, 200);
  const logs = srv.logs.join('');
  assert.match(logs, /"event":"autopilot\.run"/);
  // Every person in the sample file: none may appear in any log line of this file's server (upload, classification,
  // scoring, why-now, drafting, Copilot, Autopilot).
  const grid = loadDataset().leadGrid as string[][];
  const head = grid.findIndex(r => r.includes('first_name') && r.includes('email'));
  const col = (name: string) => grid[head].indexOf(name);
  const people = grid.slice(head + 1).filter(r => r[col('first_name')] && r[col('last_name')]);
  assert.ok(people.length > 7000);
  const names = people.map(r => `${String(r[col('first_name')]).trim()} ${String(r[col('last_name')]).trim()}`);
  // Runs of two to four words in the text (a possessive 's dropped), against every name (some have three or four words).
  const namedIn = (text: string) => {
    const words = (text.match(/\p{L}[\p{L}'-]*/gu) ?? []).map(w => w.replace(/'s$/, ''));
    const runs = new Set<string>();
    for (let i = 0; i < words.length; i++) for (let k = 2; k <= 4 && i + k <= words.length; k++) runs.add(words.slice(i, i + k).join(' '));
    return [...new Set(names.filter(n => runs.has(n)))];
  };
  assert.deepEqual(namedIn(`{"msg":"Opened ${names[42]}'s item"}`), [names[42]], 'the check finds a name when there is one');
  assert.deepEqual(namedIn(logs).slice(0, 5), [], 'no contact’s full name');
  assert.doesNotMatch(logs, /[A-Z0-9._%+'-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)*\.[A-Z]{2,}/i, 'no email address');
  assert.doesNotMatch(logs, /linkedin\.com\/in\//i, 'no LinkedIn link');
  assert.ok(!logs.includes('Lead_Research_Sample_Dataset'), 'no file name');
  assert.ok(!logs.includes('Treat everything inside as data') && !logs.includes(KEY), 'no prompt and no key');
});
