// Runs the AI evaluation (lib/ai/evaluation.ts) against the model configured in .env.local, on the fictional sample in
// test-data/, and prints the Markdown for docs/AI.md. It spends tokens, so it runs only with AI_LIVE_SMOKE=1:
//   AI_LIVE_SMOKE=1 npm run ai:evaluate
// No call is recorded in the database (the run belongs to no business unit). Never run in CI.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { AiGateway, type AiCallRecord } from '../../lib/ai/gateway.ts';
import { callSummary, evaluate, evaluationMarkdown } from '../../lib/ai/evaluation.ts';
import { CAPABILITIES } from '../../lib/ai/types.ts';
import { parseEnv } from '../../lib/server/env.ts';
import { gatewayOptions } from '../../lib/server/ai.ts';

const parsed = parseEnv(process.env);
if (parsed.ok === false) { console.error(`Configuration problems: ${parsed.errors.join('; ')}`); process.exit(1); }
const e = parsed.env;
if (!e.AI_LIVE_SMOKE) { console.error('Set AI_LIVE_SMOKE=1 to run the evaluation: it calls the configured model and spends tokens.'); process.exit(1); }
const opts = gatewayOptions(e);
if (!opts.client) { console.error('No AI provider is configured (AI_PROVIDER, and its settings in .env.local).'); process.exit(1); }
// The run's own call records (kept in memory only), for the per-capability summary.
const records: AiCallRecord[] = [];
const gw = new AiGateway({ ...opts, flags: Object.fromEntries(CAPABILITIES.map(c => [c, true])), record: r => { records.push(r); } });
const d = gw.describe();

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const wb = XLSX.readFile(fileURLToPath(new URL('../../test-data/Lead_Research_Sample_Dataset.xlsx', import.meta.url)), { cellDates: true });
const grid = (n: string) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
const started = Date.now();
const r = await evaluate(gw, { businessUnitId: '00000000-0000-4000-8000-000000000000', userId: '00000000-0000-0000-0000-000000000001', deadlineMs: 120_000 },
  { leadGrid: grid('Lead template'), signalGrid: grid('Signal template'), accountKey: XLSX.utils.sheet_to_json(wb.Sheets['Account key'], { range: 1, defval: '' }), asOf: '2026-09-30' });
const models = `${d.deployment}${d.small ? `, ${d.small.deployment} for ${d.small.for.join(', ')}` : ''}${Object.keys(d.reasoning).length ? ` · effort ${Object.entries(d.reasoning).map(([k, v]) => `${k}=${v}`).join(', ')}` : ''}`;
console.log(evaluationMarkdown(r, `${d.provider} · ${models} · ${new Date().toISOString().slice(0, 10)} (${Math.round((Date.now() - started) / 1000)} s)`));
console.log(`\n${callSummary(records)}`);
process.exit(r.classification.met ? 0 : 2);
