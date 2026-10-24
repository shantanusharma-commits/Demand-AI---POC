// The AI evaluation (remediation prompt §7.9; plan §9 item 6): each capability measured on the fictional sample in
// test-data/ with whatever model the gateway points at. Run live with `npm run ai:evaluate` (scripts/ai/evaluate.ts);
// in CI the same scoring runs against fake models (tests/ai-evaluation.test.ts), never a live call.
// - Classification, against the Account key's true_vertical: the share of in-ICP accounts with the right core vertical
//   (target to agree with the Client: at least 95%), and out-of-ICP accounts classified core (target: none).
// - Why-now lines for tier A and B: how many the model wrote that passed grounding (every name, number and date in
//   the cited rows), and how many fell back to the rules' line.
// - First messages: how many AI drafts passed the brand, claim and grounding checks, how many carry only the sensitive
//   term the rules' draft also has (the gate lets those through to a person, as it would the rules' draft), and how
//   many fell back.
import 'server-only';
import * as E from '../demandai-engine.ts';
import { buildProspects } from '../engine/prospects.ts';
import { buildSegments, defaultBrand, checkDraft, type NbaResult } from '../engine/nba.ts';
import * as R from '../engine/review.ts';
import type { Grid } from '../../types/demandai';
import { classifyIndustries } from './classify.ts';
import { eligible, writeDraft } from './draft.ts';
import type { AiCallRecord, AiGateway, CallContext } from './gateway.ts';
import { wordWhyNow } from './why-now.ts';

export const TARGETS = { inIcpCorrect: 95, outOfIcpCore: 0 };
const CORE = /^(Refining|Petrochemicals|Gas processing)/;
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export type EvalInput = { leadGrid: Grid; signalGrid: Grid; accountKey: Record<string, unknown>[]; asOf: string };
export type EvalResult = {
  classification: { asked: number; answered: number; fallbacks: Record<string, number>; inIcp: number; inIcpCorrect: number; inIcpPct: number; outOfIcpCore: number;
    unmatchedCorrect: { n: number; ok: number }; needsReviewBefore: number; needsReviewAfter: number; met: boolean };
  whyNow: { asked: number; worded: number; fallbacks: Record<string, number> };
  drafts: { asked: number; written: number; fallbacks: Record<string, number>; passing: number; sensitive: number };
};

/** The key's vertical as the pilot's choices: core verticals as they are, influencers as Other, the rest Out of ICP. */
export function expectedVertical(trueVertical: unknown): string {
  const t = String(trueVertical ?? '');
  const core = t.match(CORE);
  return core ? core[1] : /^Influencer/.test(t) ? 'Other' : 'Out of ICP';
}

export async function evaluate(gw: AiGateway, ctx: CallContext, data: EvalInput, opts: { drafts?: number } = {}): Promise<EvalResult> {
  // Classification: the rules first, the model for what they can't match, then the whole list scored against the key.
  const base = E.processLeads(data.leadGrid, { file: 'sample', sheet: 'Lead template' });
  const ask = new Map<string, { key: string; industry: string; siteProcess: string }>();
  for (const a of base.accounts) if (a.needsReview && !E.lookupDecides(a.industry, a.siteProcess)) ask.set(E.industryKey(a.industry, a.siteProcess), { key: E.industryKey(a.industry, a.siteProcess), industry: a.industry, siteProcess: a.siteProcess });
  const cls = await classifyIndustries(gw, ctx, [...ask.values()]);
  const leads = E.processLeads(data.leadGrid, { file: 'sample', sheet: 'Lead template', aiVerticals: new Map([...cls.answers].map(([k, v]) => [k, v])) });
  const byName = new Map(leads.accounts.map(a => [norm(a.name), a]));
  let inIcp = 0, inIcpCorrect = 0, outOfIcpCore = 0, un = 0, unOk = 0;
  for (const k of data.accountKey) {
    const a = byName.get(norm(k.company_name));
    if (!a) continue;
    const want = expectedVertical(k.true_vertical);
    if (CORE.test(String(k.true_vertical))) { inIcp++; if (a.vertical === want) inIcpCorrect++; }
    else if (a.verticalLevel === 'core') outOfIcpCore++;
    if (a.aiAssisted) { un++; if (a.vertical === want) unOk++; }
  }
  const inIcpPct = inIcp ? Math.round(inIcpCorrect / inIcp * 1000) / 10 : 0;

  // Why-now and drafts are measured on the rules' list, so each capability is judged on its own.
  const list = JSON.parse(JSON.stringify({ accounts: base.accounts, contacts: base.contacts }));
  const scored = E.scoreList(list, E.processSignals(data.signalGrid, list, { file: 'sample', sheet: 'Signal template', asOf: data.asOf }));
  const ab = buildProspects(scored).filter(x => (x.tier === 'A' || x.tier === 'B') && x.p?.signals.length);
  const wn = await wordWhyNow(gw, ctx, ab.map(x => ({ key: String(x.c.row), jobTitle: x.c.jobTitle, persona: x.c.persona,
    signals: x.p!.signals.map(s => ({ row: s.row, type: s.type, date: s.date, detail: s.detail, source: s.source, weight: Number(s.weight) || 0 })) })));

  const pack = defaultBrand();
  const recs = buildSegments(scored as unknown as NbaResult[]).recs;
  const asks = recs.map(rec => ({ rec, rules: R.generatedDraft(rec, R.initialState(), pack, data.asOf) })).filter(a => eligible(a.rules)).slice(0, opts.drafts ?? 40);
  const drafts = { asked: asks.length, written: 0, fallbacks: {} as Record<string, number>, passing: 0, sensitive: 0 };
  await Promise.all(asks.map(async a => {
    const r = await writeDraft(gw, ctx, { rec: a.rec, action: a.rec.action, pack, checkDate: data.asOf, rules: a.rules });
    if (r.ok === true) {
      drafts.written++;
      const c = checkDraft(r.draft, pack, data.asOf);
      const rulesSensitive = checkDraft(a.rules, pack, data.asOf).flags.some(f => f.rule === 'Sensitive term');
      if (!c.flags.length && !c.unsupported.length) drafts.passing++;
      else if (rulesSensitive && !c.unsupported.length && c.flags.every(f => f.rule === 'Sensitive term')) drafts.sensitive++;
    } else drafts.fallbacks[r.reason] = (drafts.fallbacks[r.reason] ?? 0) + 1;
  }));

  return {
    classification: { asked: ask.size, answered: cls.answers.size, fallbacks: cls.fallbacks as Record<string, number>, inIcp, inIcpCorrect, inIcpPct, outOfIcpCore,
      unmatchedCorrect: { n: un, ok: unOk }, needsReviewBefore: base.accounts.filter(a => a.needsReview).length, needsReviewAfter: leads.accounts.filter(a => a.needsReview).length,
      met: inIcpPct >= TARGETS.inIcpCorrect && outOfIcpCore <= TARGETS.outOfIcpCore },
    whyNow: { asked: ab.length, worded: wn.lines.size, fallbacks: wn.fallbacks as Record<string, number> },
    drafts,
  };
}

/** The calls of a run per capability (D-44): which model answered at what effort, how fast, and what it used. */
export function callSummary(records: AiCallRecord[]): string {
  const caps = [...new Set(records.map(r => r.capability))];
  const median = (xs: number[]) => { const v = xs.slice().sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : 0; };
  const rows = caps.map(cap => {
    const rs = records.filter(r => r.capability === cap), lat = rs.map(r => r.latencyMs);
    const models = [...new Set(rs.map(r => r.model ?? `${r.deployment} (no answer)`))].join(', ');
    const efforts = [...new Set(rs.map(r => r.reasoningEffort ?? 'not sent'))].join(', ');
    const sum = (k: 'promptTokens' | 'completionTokens') => rs.reduce((t, r) => t + r[k], 0);
    const cost = rs.reduce((t, r) => t + (r.estCostUsd ?? 0), 0);
    return `| ${cap} | ${models} | ${efforts} | ${rs.length} (${rs.filter(r => r.outcome === 'ok').length} ok) | ${(median(lat) / 1000).toFixed(1)} s / ${(Math.max(0, ...lat) / 1000).toFixed(1)} s | ${sum('promptTokens').toLocaleString('en-US')} / ${sum('completionTokens').toLocaleString('en-US')} | ${cost.toFixed(3)} |`;
  });
  return ['| Capability | Model that answered | Reasoning effort | Calls | Latency median / max | Tokens in / out | Cost (USD) |', '|---|---|---|---|---|---|---|', ...rows].join('\n');
}

/** The result as the Markdown table docs/AI.md keeps. */
export function evaluationMarkdown(r: EvalResult, label: string): string {
  const c = r.classification, f = (o: Record<string, number>) => Object.entries(o).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
  return [`### ${label}`, '', '| Measure | Result | Target |', '|---|---|---|',
    `| In-ICP accounts with the right core vertical | ${c.inIcpCorrect} of ${c.inIcp} (${c.inIcpPct}%) | ≥ ${TARGETS.inIcpCorrect}% |`,
    `| Out-of-ICP accounts classified core | ${c.outOfIcpCore} | ${TARGETS.outOfIcpCore} |`,
    `| AI-classified accounts matching the key (Other for influencers) | ${c.unmatchedCorrect.ok} of ${c.unmatchedCorrect.n} | report |`,
    `| Industry texts asked / answered | ${c.asked} / ${c.answered} (rules kept: ${f(c.fallbacks)}) | report |`,
    `| Accounts needing review, before → after | ${c.needsReviewBefore} → ${c.needsReviewAfter} | report |`,
    `| Why-now lines worded (tier A and B) | ${r.whyNow.worded} of ${r.whyNow.asked} (rules kept: ${f(r.whyNow.fallbacks)}) | report; every line shown is grounded |`,
    `| First messages written / passing every check / sensitive like the rules' draft (to a person) | ${r.drafts.written} of ${r.drafts.asked} / ${r.drafts.passing} / ${r.drafts.sensitive} (rules kept: ${f(r.drafts.fallbacks)}) | every AI draft passes, or carries only the rules' own sensitive flag |`,
    '', `Classification target ${c.met ? 'met' : 'not met'}.`].join('\n');
}
