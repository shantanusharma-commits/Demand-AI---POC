// Analytics on the server (G-011; legacy 13-analytics.html, D-21, D-27, D-38): the pilot measured from the shared
// decision log and the stored lists, scoring runs and builds, organised by the six success areas. Every number is
// worked out here from stored data. Reps see their own results (G-014); managers the unit's, or one rep's; a Viewer
// the unit's aggregates only (no account, contact or message records). The weekly summary and the readout are built
// here as Markdown, so the screen shows exactly what the download says. Changing the gate settings makes a new
// configuration version (D-21).
import 'server-only';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { CODES, CONFIG, toCSV } from '../../demandai-engine.ts';
import { estimateDealSize, type Draft, type NbaAccount, type Rec } from '../../engine/nba.ts';
import * as G from '../../engine/gates.ts';
import * as R from '../../engine/review.ts';
import type { DqCode } from '../../../types/demandai';
import {
  accountTransfers, brandVersions, businessUnitMembers, configChanges, configVersions, decisionLog, drafts, leadLists, nbaRuns, recommendations,
  routingRules, scoringRuns, signalTypeChanges, users,
} from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { badRequest, conflict, forbidden } from '../http/errors.ts';
import { logger } from '../logger.ts';
import { isManager, ownerOnly, type Actor } from './lists.ts';
import { activeValidation, pilotFacts, type ActiveValidation } from './measures.ts';
import { checkedSql, stateOf } from './recommendations.ts';
import { isoWeek } from './review.ts';
import { nextVersion } from './setup.ts';
import { ownerEmailsOf, ownerNames, unitReps } from './users.ts';

/* ─── Whose results: a rep's own, one rep's for a manager, or the unit's ─── */

export type Lens = { ownerEmails: string[] | null; rep: { email: string; name: string } | null; manager: boolean; viewer: boolean; own: boolean };

export async function lensOf(scope: TenantScope, actor: Actor, repEmail?: string | null): Promise<Lens> {
  const manager = isManager(actor.role), viewer = actor.role === 'Viewer', own = scope.ctx.scope === 'own';
  if (repEmail) {
    if (!manager) throw forbidden('Only a manager can look at one rep’s results.');
    const [u] = await scope.tx.select({ id: users.id, email: sql<string>`lower(${users.email})`, name: users.displayName }).from(businessUnitMembers)
      .innerJoin(users, eq(users.id, businessUnitMembers.userId))
      .where(and(eq(businessUnitMembers.businessUnitId, scope.ctx.businessUnitId), eq(businessUnitMembers.role, 'Sales rep'), eq(businessUnitMembers.status, 'active'),
        sql`lower(${users.email}) = ${repEmail.trim().toLowerCase()}`));
    if (!u) throw badRequest('Pick one of the unit’s sales reps.', { rep: ['Pick a sales rep.'] });
    return { ownerEmails: await ownerEmailsOf(scope.tx, u.id, u.email), rep: { email: u.email, name: u.name }, manager, viewer, own };
  }
  return { ownerEmails: own ? scope.ctx.ownerEmails : null, rep: null, manager, viewer, own };
}
const ownerIn = (col: AnyPgColumn, lens: Lens): SQL | undefined =>
  (lens.ownerEmails ? (lens.ownerEmails.length ? inArray(col, lens.ownerEmails) : sql`false`) : undefined);
const uuids = (ids: string[]) => sql`string_to_array(${ids.join(',')}, ',')::uuid[]`;

/* ─── What the measures read: the items and the log in view, and the lists, runs and builds behind them ─── */

type ItemFact = {
  id: string; runId: string; accountId: string; passed: boolean; status: string; released: string | null; outcome: string | null; spot: string | null; segment: string | null;
  assigned: string | null; ownerEmail: string | null; alternativeUsed: boolean; tier: string | null; account: NbaAccount; confidence: string | null; signals: string[];
  channel: string; noProof: boolean;
};
type LogFact = R.LogFacts & {
  id: string; seq: number; recommendationId: string; at: Date; createdBy: string; decision: string; reasonCode: string | null; tags: string[]; note: string; ownerEmail: string | null;
};

async function load(scope: TenantScope, lens: Lens): Promise<{ items: ItemFact[]; logs: LogFact[] }> {
  const bu = scope.ctx.businessUnitId;
  const items = await scope.tx.select({
    id: recommendations.id, runId: recommendations.nbaRunId, accountId: recommendations.accountId, passed: recommendations.passed, status: recommendations.status, released: recommendations.released,
    outcome: recommendations.outcome, spot: recommendations.spot, segment: recommendations.segment, assigned: recommendations.assignedSegment,
    ownerEmail: recommendations.ownerEmail, alternativeUsed: recommendations.alternativeUsed,
    tier: sql<string | null>`"recommendations"."rec"->'person'->>'tier'`,
    account: sql<NbaAccount>`"recommendations"."rec"->'account'`,
    confidence: sql<string | null>`"recommendations"."rec"->'result'->>'confidence'`,
    signals: sql<string[]>`array(select distinct s->>'type' from jsonb_array_elements(coalesce("recommendations"."rec"->'result'->'people', '[]'::jsonb)) p,
      jsonb_array_elements(coalesce(p->'signals', '[]'::jsonb)) s order by 1)`,
    channel: drafts.channel, noProof: sql<boolean>`coalesce(("drafts"."draft"->>'noProof')::boolean, false)`,
  }).from(recommendations).innerJoin(drafts, and(eq(drafts.recommendationId, recommendations.id), eq(drafts.version, recommendations.draftVersion)))
    .where(and(eq(recommendations.businessUnitId, bu), ownerOnly(scope, recommendations.ownerEmail), ownerIn(recommendations.ownerEmail, lens)));
  const logs = await scope.tx.select({
    id: decisionLog.id, seq: decisionLog.seq, recommendationId: decisionLog.recommendationId, at: decisionLog.createdAt, createdBy: decisionLog.createdBy,
    decision: decisionLog.decision, kind: decisionLog.kind, decisive: decisionLog.decisive, firstPass: decisionLog.firstPass, accepted: decisionLog.accepted,
    flag: decisionLog.flag, checked: checkedSql, segment: decisionLog.segment, reason: decisionLog.reason, reasonCode: decisionLog.reasonCode, cause: decisionLog.cause,
    compliance: decisionLog.compliance, intervention: decisionLog.intervention, editRating: decisionLog.editRating, seconds: decisionLog.seconds, tags: decisionLog.tags,
    note: decisionLog.note, ownerEmail: decisionLog.ownerEmail,
  }).from(decisionLog).where(and(eq(decisionLog.businessUnitId, bu), ownerIn(decisionLog.ownerEmail, lens))).orderBy(asc(decisionLog.seq));
  return { items, logs };
}

/** The unit's builds, the scoring runs behind them and the lists those scored (shared in the unit). */
async function pipeline(scope: TenantScope) {
  const bu = scope.ctx.businessUnitId;
  const builds = await scope.tx.select({ id: nbaRuns.id, name: nbaRuns.name, handoffId: nbaRuns.handoffId, scoringRunId: nbaRuns.scoringRunId, asOf: nbaRuns.asOf,
    configVersionId: nbaRuns.configVersionId, segments: nbaRuns.segments, engaged: nbaRuns.engaged, createdAt: nbaRuns.createdAt })
    .from(nbaRuns).where(eq(nbaRuns.businessUnitId, bu)).orderBy(desc(nbaRuns.createdAt));
  const runIds = [...new Set(builds.map(b => b.scoringRunId))];
  const runs = runIds.length ? await scope.tx.select({ id: scoringRuns.id, listId: scoringRuns.listId, stats: scoringRuns.stats }).from(scoringRuns).where(inArray(scoringRuns.id, runIds)) : [];
  const listIds = [...new Set(runs.map(r => r.listId))];
  const lists = listIds.length ? await scope.tx.select({ id: leadLists.id, uploadId: leadLists.uploadId, stats: leadLists.stats, quality: leadLists.quality }).from(leadLists).where(inArray(leadLists.id, listIds)) : [];
  // Accounts scored with a live signal, by the best tier among their prospects (owner-scoped for reps).
  const tiers: Record<string, number> = {};
  if (runIds.length) {
    const { rows } = await scope.tx.execute<{ best: string; n: number }>(sql`select best, count(*)::int as n from (
      select min(tier) as best from prospect_scores where business_unit_id = ${bu} and run_id = any(${uuids(runIds)}) and sendable group by run_id, account_id) x group by best`);
    for (const r of rows) tiers[r.best] = r.n;
  }
  return { builds, runIds, runs: runs.map(r => ({ ...r, stats: r.stats as Record<string, number> })), lists: lists.map(l => ({ ...l, stats: l.stats as Record<string, number>, quality: l.quality as { rowsRead: number; uncleanRows: number } | null })), tiers };
}
type Pipeline = Awaited<ReturnType<typeof pipeline>>;

const sum = <T>(xs: T[], f: (x: T) => number | undefined) => xs.reduce((t, x) => t + (f(x) || 0), 0);
const pct0 = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Math.round(v) + '%');
const pl = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const counts = (l: LogFact) => !l.flag || l.checked;
const REASON_CODE: Record<string, string> = Object.fromEntries(R.REJECT.map(([c, l]) => [l, c]));

/** The first decisive decision on each item (first pass when there is one), the rows that judge it. */
function firstDecisions(logs: LogFact[]): Map<string, LogFact> {
  const out = new Map<string, LogFact>();
  for (const l of logs) {
    if (!l.decisive) continue;
    const cur = out.get(l.recommendationId);
    if (!cur || (!cur.firstPass && l.firstPass)) out.set(l.recommendationId, l);
  }
  return out;
}

/* ─── Work-done funnel (7.2) ─── */

export type Stage = { k: string; n: number; sub: string; of?: number; note?: string; nobase?: boolean };

function funnelStages(p: Pipeline, items: ItemFact[], logs: LogFact[]): Stage[] {
  const found = sum(p.runs, r => r.stats.signals), qualified = sum(p.runs, r => r.stats.qualified), rejected = sum(p.runs, r => r.stats.rejected);
  const t = (k: string) => p.tiers[k] || 0;
  const decided = logs.filter(l => l.decisive);
  return [
    { k: 'Records received', n: sum(p.lists, l => l.stats.rowsRead), sub: `${sum(p.lists, l => l.stats.contacts)} valid contacts` },
    { k: 'Accounts in scope', of: 0, n: sum(p.lists, l => l.stats.accountsPass), sub: 'after the checks and knock-outs' },
    { k: 'Signals found', n: found, sub: `${qualified} qualified · ${rejected} rejected · ${found - qualified - rejected} not used`, note: `${found ? Math.round(qualified / found * 100) : 0}% qualified`, nobase: true },
    { k: 'Accounts scored', of: 1, n: t('A') + t('B') + t('C'), sub: `with a live signal: ${t('A')} A · ${t('B')} B · ${t('C')} C` },
    // Each build forms its own micro-segments; an account recommended in several builds counts once.
    { k: 'Accounts in micro-segments', of: 3, n: new Set(items.filter(x => x.segment).map(x => x.accountId)).size,
      sub: `${sum(p.builds, b => (b.segments as unknown[]).length)} micro-segments formed in ${pl(p.builds.length, 'build')} · ${items.filter(x => !x.segment).length} with no micro-segment · ${sum(p.builds, b => (b.engaged as unknown[]).length)} set aside by engage-once` },
    { k: 'Actions and drafts', of: 3, n: items.length, sub: `${items.filter(x => x.channel !== 'Task').length} drafts · ${items.filter(x => x.channel === 'Task').length} tasks · ${logs.filter(l => /^Regenerated once/.test(l.decision)).length} regenerated once` },
    { k: 'Completed on their own', of: 5, n: items.filter(x => x.passed).length, sub: `${items.filter(x => !x.passed).length} went to a person` },
    { k: 'Decided by a person', n: decided.length, sub: `${decided.filter(l => l.kind === 'exception').length} exceptions · ${decided.filter(l => l.kind === 'spot').length} spot-checks · ${decided.filter(l => l.kind === 'alternative').length} alternatives`, nobase: true },
    { k: 'Released, ready to use', of: 5, n: items.filter(x => x.status === 'Released').length, sub: `${items.filter(x => x.outcome).length} with an outcome · ${items.filter(x => x.outcome === 'Meeting booked').length} meetings booked` },
  ];
}

/* ─── Supporting evidence: prioritisation accuracy, reasons, edits, data quality, decision time ─── */

function evidenceOf(items: ItemFact[], logs: LogFact[], dq: { code: string; n: number }[]) {
  const judged = logs.filter(l => l.decisive && l.firstPass && counts(l));
  const tierOf = new Map(items.map(x => [x.id, x.tier]));
  const byTier = ['A', 'B', 'C'].map(t => {
    const its = items.filter(x => x.tier === t), j = judged.filter(l => tierOf.get(l.recommendationId) === t);
    return { tier: t, n: its.length, judged: j.length, accepted: j.filter(l => l.accepted).length, replies: its.filter(x => x.outcome === 'Replied').length,
      meetings: its.filter(x => x.outcome === 'Meeting booked').length };
  });
  const reviewed = byTier.filter(x => x.judged);
  const ordered = reviewed.length ? reviewed.every((x, i, a) => !i || a[i - 1].accepted / a[i - 1].judged >= x.accepted / x.judged) : null;
  const tally = (xs: string[]) => { const o: Record<string, number> = {}; xs.forEach(k => { o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
  const reasons = tally(logs.filter(l => l.decisive && !l.accepted).map(l => l.reason)).map(([reason, n]) => ({ code: REASON_CODE[reason] || '', reason, n, cause: R.causeOf(REASON_CODE[reason] || '') }));
  const tags = tally(logs.filter(l => l.accepted).flatMap(l => l.tags)).map(([tag, n]) => ({ tag, n }));
  const median = (kind: string | null) => {
    const v = logs.filter(l => l.decisive && (!kind || l.kind === kind) && l.seconds !== null).map(l => l.seconds!).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };
  return {
    byTier, ordered, reasons, tags,
    edits: { none: logs.filter(l => l.accepted && l.editRating === 'none').length, minor: logs.filter(l => l.editRating === 'minor').length, major: logs.filter(l => l.editRating === 'major').length },
    dq: dq.map(d => ({ label: `${d.code} ${CODES[d.code as DqCode] || ''}`.trim(), n: d.n })),
    seconds: { exception: median('exception'), spot: median('spot'), alternative: median('alternative'), all: median(null) },
  };
}

async function signalReasons(scope: TenantScope, runIds: string[]): Promise<{ code: string; n: number }[]> {
  if (!runIds.length) return [];
  const { rows } = await scope.tx.execute<{ code: string; n: number }>(sql`select coalesce(data->>'code', '') as code, count(*)::int as n from signals
    where business_unit_id = ${scope.ctx.businessUnitId} and run_id = any(${uuids(runIds)}) and status = 'Rejected' group by 1 order by 2 desc, 1`);
  return rows;
}

/* ─── Acceptance by group: actions in segments, segments, signals, fit (the learning loop's evidence, 8.2–8.4) ─── */

type Judged = { n: number; j: number; a: number; w: number; rate: number | null };
function judgedOf(its: ItemFact[], first: Map<string, LogFact>): Judged {
  const j = its.filter(x => first.has(x.id)), a = j.filter(x => first.get(x.id)!.accepted).length;
  return { n: its.length, j: j.length, a, w: its.filter(x => x.outcome === 'Replied' || x.outcome === 'Meeting booked').length, rate: j.length ? a / j.length * 100 : null };
}
function signalRows(items: ItemFact[], first: Map<string, LogFact>) {
  return [...new Set(items.flatMap(x => x.signals))].map(k => ({ k, ...judgedOf(items.filter(x => x.signals.includes(k)), first) }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.j - a.j);
}

/* ─── The pilot in one place: everything the tabs and the six areas read ─── */

async function pilot(scope: TenantScope, actor: Actor, repEmail?: string | null) {
  const lens = await lensOf(scope, actor, repEmail);
  const validation = await activeValidation(scope), settings = validation.settings;
  const { items, logs } = await load(scope, lens);
  const p = await pipeline(scope);
  const m = R.measure(items, logs, settings.g1BaselineMinutes);
  const facts = await pilotFacts(scope);
  const checks = facts ? G.pilotReadiness(facts, settings) : [];
  return { lens, validation, settings, items, logs, p, m, gates: G.gates(m, settings), facts, checks, first: firstDecisions(logs) };
}
type Pilot = Awaited<ReturnType<typeof pilot>>;

const lensInfo = (x: Pilot) => ({ rep: x.lens.rep, own: x.lens.own, manager: x.lens.manager, viewer: x.lens.viewer });
async function repsFor(scope: TenantScope, lens: Lens) { return lens.manager ? unitReps(scope) : []; }

export async function gatesView(scope: TenantScope, actor: Actor, rep?: string | null) {
  const x = await pilot(scope, actor, rep);
  return { ...lensInfo(x), reps: await repsFor(scope, x.lens), settings: x.settings, configVersion: x.validation.versionNo, measure: x.m, gates: x.gates, builds: x.p.builds.length };
}

export async function funnelView(scope: TenantScope, actor: Actor, rep?: string | null) {
  const x = await pilot(scope, actor, rep);
  return { ...lensInfo(x), reps: await repsFor(scope, x.lens), builds: x.p.builds.length, stages: funnelStages(x.p, x.items, x.logs) };
}

export async function evidenceView(scope: TenantScope, actor: Actor, rep?: string | null) {
  const x = await pilot(scope, actor, rep);
  return { ...lensInfo(x), reps: await repsFor(scope, x.lens), builds: x.p.builds.length, ...evidenceOf(x.items, x.logs, await signalReasons(scope, x.p.runIds)) };
}

/* ─── The six success areas (D-38), each with its measured evidence ─── */

export const AREAS = [
  { key: 'discovery', title: 'Lead research and account discovery', question: 'Does it find the right accounts, and the right people in them (persona fit)?', tab: 'funnel' },
  { key: 'qualification', title: 'Lead qualification accuracy', question: 'Do stakeholders accept the score and the recommendations it leads to?', tab: 'evidence' },
  { key: 'intent', title: 'Intent detection (limited for the pilot)', question: 'Do the signals pick out accounts with a reason to buy now?', tab: 'loop' },
  { key: 'routing', title: 'Lead routing and segmentation', question: 'Does each lead reach the right owner, unit and micro-segment (priority, geography, industry)?', tab: 'funnel' },
  { key: 'content', title: 'Content production efficiency', question: 'Is there less effort per usable message?', tab: 'gates' },
  { key: 'value', title: 'Business value validation', question: 'Do stakeholders see enough value to recommend adoption?', tab: 'loop' },
] as const;
export type AreaKey = (typeof AREAS)[number]['key'];
export type Evidence = { label: string; value: string; sub?: string };
export type Area = { key: AreaKey; title: string; question: string; tab: string; state: G.GateState | null; stateLabel: string | null; evidence: Evidence[] };

const checkState = (cs: G.PilotCheck[]): G.GateState | null => (!cs.length ? null : cs.every(c => c.ok) ? 'met' : 'below');
const stateWord: Record<G.GateState, string> = { none: 'No data yet', early: 'Too early to call', met: 'Meets the agreed level', below: 'Below the agreed level' };

async function areasOf(scope: TenantScope, x: Pilot): Promise<Area[]> {
  const bu = scope.ctx.businessUnitId, { p, items, logs, m, gates, checks, first } = x;
  const check = (k: string) => checks.find(c => c.k === k);
  const listIds = p.lists.map(l => l.id), uploadIds = [...new Set(p.lists.map(l => l.uploadId))];
  // Discovery: accounts still waiting for a person's vertical check, and the corrections people made.
  const [{ review }] = listIds.length ? (await scope.tx.execute<{ review: number }>(sql`select count(*)::int as review from accounts
    where business_unit_id = ${bu} and list_id = any(${uuids(listIds)}) and needs_review and not excluded`)).rows : [{ review: 0 }];
  const [{ fixes }] = uploadIds.length ? (await scope.tx.execute<{ fixes: number }>(sql`select count(*)::int as fixes from corrections
    where business_unit_id = ${bu} and upload_id = any(${uuids(uploadIds)})`)).rows : [{ fixes: 0 }];
  const read = sum(p.lists, l => l.quality?.rowsRead), unclean = sum(p.lists, l => l.quality?.uncleanRows);
  // Routing: the unit's rules, owners a rule filled at hand-off, accounts moved between units.
  const [{ rules }] = await scope.tx.select({ rules: sql<number>`count(*)::int` }).from(routingRules).where(and(eq(routingRules.businessUnitId, bu), eq(routingRules.active, true)));
  const handoffIds = [...new Set(p.builds.map(b => b.handoffId))];
  const [{ ruled }] = handoffIds.length ? (await scope.tx.execute<{ ruled: number }>(sql`select count(*)::int as ruled from handoff_items hi join contacts c on c.id = hi.contact_id
    where hi.business_unit_id = ${bu} and hi.handoff_id = any(${uuids(handoffIds)}) and hi.owner_email is not null and c.owner_email is null`)).rows : [{ ruled: 0 }];
  const [moved] = await scope.tx.select({ out: sql<number>`count(*) filter (where ${accountTransfers.businessUnitId} = ${bu})::int`, in: sql<number>`count(*) filter (where ${accountTransfers.toBusinessUnitId} = ${bu})::int` }).from(accountTransfers);
  // Value: who decided, and what happened after release.
  const deciders = new Set(logs.filter(l => l.decisive).map(l => l.createdBy)).size;
  const out = (o: string) => items.filter(i => i.outcome === o).length;
  const marked = items.filter(i => i.outcome && i.outcome !== 'Sent');
  const ev = evidenceOf(items, logs, []);
  const sig = signalRows(items, first).filter(s => s.j >= 3).slice(0, 3);
  const stages = funnelStages(p, items, logs);
  const g = (gate: G.Gate) => (gate.value === null ? '—' : Math.round(gate.value) + '%');
  const area = (key: AreaKey, state: G.GateState | null, evidence: Evidence[]): Area => {
    const a = AREAS.find(z => z.key === key)!;
    return { key, title: a.title, question: a.question, tab: a.tab, state, stateLabel: state ? (state === 'early' ? G.gateLabel(gates.g2) : stateWord[state]) : null, evidence };
  };
  const contact = check('Contactability'), coverage = check('Signal coverage'), recency = check('Recency'), collateral = check('Collateral');
  return [
    area('discovery', contact ? (contact.ok ? 'met' : 'below') : null, [
      { label: 'Records received', value: String(stages[0].n), sub: stages[0].sub },
      { label: 'Accounts in scope', value: String(stages[1].n), sub: 'after the checks and knock-outs' },
      { label: 'Accounts with a reachable primary-persona contact', value: contact ? contact.show : '—', sub: contact ? `needs ${contact.need}` : 'Measured once micro-segments are built' },
      { label: 'Rows clean on arrival', value: read ? pct0((read - unclean) / read * 100) : '—', sub: read ? `${read - unclean} of ${read} rows` : 'Not kept for these lists' },
      { label: 'Accounts waiting for a vertical check', value: String(review) },
      { label: 'Corrections made by people', value: String(fixes) },
    ]),
    area('qualification', gates.g2.state, [
      { label: 'G2 first-pass acceptance', value: g(gates.g2), sub: `${G.gateLabel(gates.g2)} · ${m.pooled.a} of ${m.pooled.n} counted decisions, weighted across both paths · threshold ${gates.g2.threshold}%` },
      { label: 'Acceptance by tier', value: ev.byTier.map(t => `${t.tier} ${t.judged ? pct0(t.accepted / t.judged * 100) : '—'}`).join(' · '),
        sub: ev.ordered === null ? 'Not judged yet' : ev.ordered ? 'Higher tiers are accepted at least as often as lower ones: the ranking holds' : 'A lower tier is accepted more often than a higher one: the rubric or the weights need a look' },
      { label: 'Rejected as the wrong fit or a weak signal', value: String(ev.reasons.filter(r => r.code === 'R1' || r.code === 'R2').reduce((t, r) => t + r.n, 0)), sub: 'rejections that point at the score' },
      { label: 'Accepted within one alternative', value: pct0(m.alternatives.pct), sub: `${m.alternatives.a} of ${m.alternatives.n}` },
    ]),
    area('intent', checkState([coverage, recency].filter((c): c is G.PilotCheck => !!c)), [
      { label: 'Signals found', value: String(stages[2].n), sub: stages[2].sub },
      { label: 'Signal coverage', value: coverage ? coverage.show : '—', sub: coverage ? `needs ${coverage.need}` : 'Measured once micro-segments are built' },
      { label: 'Recency', value: recency ? recency.show : '—', sub: recency ? `needs ${recency.need}` : 'Measured once micro-segments are built' },
      { label: 'Signals behind accepted recommendations', value: sig.length ? sig.map(s => `${s.k} ${pct0(s.rate)}`).join(' · ') : '—', sub: sig.length ? 'acceptance of recommendations each signal sat behind, 3 or more judged' : 'Not enough judged yet' },
    ]),
    area('routing', null, [
      { label: 'Micro-segments formed', value: String(sum(p.builds, b => (b.segments as unknown[]).length)),
        sub: `in ${pl(p.builds.length, 'build')} · ${stages[4].n} accounts in them · ${items.filter(i => !i.segment).length} recommendations with none · ${sum(p.builds, b => (b.engaged as unknown[]).length)} set aside by engage-once` },
      { label: 'Active routing rules', value: String(rules) },
      { label: 'Prospects given an owner by a routing rule', value: String(ruled), sub: 'at hand-off, where the lead file named nobody' },
      { label: 'Accounts moved to another business unit', value: String(moved.out), sub: `${moved.in} received from other units` },
      { label: 'Recommendations without an owner', value: String(items.filter(i => !i.ownerEmail).length) },
    ]),
    area('content', gates.g1.state, [
      { label: 'G1 review effort saved', value: g(gates.g1), sub: `${G.gateLabel(gates.g1)} · ${m.minutes === null ? 'no usable first actions yet' : `${Math.round(m.minutes * 10) / 10} min per usable first action`} against a ${m.base} min baseline · threshold ${gates.g1.threshold}% less` },
      { label: 'Drafts and tasks generated', value: String(items.length), sub: stages[5].sub },
      { label: 'Released, ready to use', value: String(m.released) },
      { label: 'Edits before use', value: `${m.edits.none} as they were · ${m.edits.minor} minor · ${m.edits.major} major` },
      { label: 'Actions with approved proof', value: collateral ? collateral.show : '—', sub: collateral && !collateral.ok ? collateral.fix : collateral ? 'every action in the set' : 'Measured once micro-segments are built' },
    ]),
    area('value', null, [
      { label: 'Outcomes marked', value: String(items.filter(i => i.outcome).length), sub: `${out('Replied')} replied · ${out('Meeting booked')} meetings booked · ${out('No response')} no response · ${out('Sent')} sent` },
      { label: 'Replied or booked a meeting', value: marked.length ? pct0((out('Replied') + out('Meeting booked')) / marked.length * 100) : '—', sub: `of ${pl(marked.length, 'message')} with a result` },
      { label: 'People deciding in For Review', value: String(deciders), sub: pl(logs.filter(l => l.decisive).length, 'decision') },
    ]),
  ];
}

export async function areasView(scope: TenantScope, actor: Actor, rep?: string | null) {
  const x = await pilot(scope, actor, rep);
  return { ...lensInfo(x), reps: await repsFor(scope, x.lens), builds: x.p.builds.length, configVersion: x.validation.versionNo, areas: await areasOf(scope, x) };
}

/* ─── Weekly summary (7.4), for the business-unit lead ─── */

function weekData(logs: LogFact[], week: string, s: G.ValidationSettings) {
  const ls = logs.filter(l => isoWeek(l.at) === week), dec = ls.filter(l => l.decisive);
  const first = dec.filter(l => l.firstPass && counts(l));
  const rate = (xs: LogFact[]) => (xs.length ? Math.round(xs.filter(l => l.accepted).length / xs.length * 100) : null);
  const reasons: Record<string, number> = {}; dec.filter(l => !l.accepted).forEach(l => { reasons[l.reason] = (reasons[l.reason] || 0) + 1; });
  const exceptions: Record<string, number> = {};
  ls.filter(l => l.decision === 'To the exception queue' || l.decision === 'To approvals').forEach(l => l.note.split(' · ').forEach(n => { const k = n.replace(/:.*$/, ''); if (k) exceptions[k] = (exceptions[k] || 0) + 1; }));
  const secs = dec.reduce((t, l) => t + (l.seconds || 0), 0);
  const released = ls.filter(l => /^Proceeded on its own|^Accepted|^Approved and released/.test(l.decision) && l.kind !== 'spot').length;
  const rows: [string, string][] = [
    ['Recommendations built', String(ls.filter(l => l.kind === 'system' && /^Proceeded on its own|^To the exception queue|^To approvals/.test(l.decision)).length)],
    ['Proceeded on their own', String(ls.filter(l => l.decision === 'Proceeded on its own').length)],
    ['Sent to the exception queue', String(ls.filter(l => l.decision === 'To the exception queue').length)],
    ["Sent to the sales manager's approvals", String(ls.filter(l => l.decision === 'To approvals').length)],
    ['Decisions made', `${dec.length} (${dec.filter(l => l.kind === 'spot').length} spot-check ratings)`],
    ['G2 first-pass acceptance', first.length ? `${rate(first)}% of ${first.length} (exceptions ${rate(first.filter(l => l.kind === 'exception')) ?? '—'}%, spot-checks ${rate(first.filter(l => l.kind === 'spot')) ?? '—'}%)` : '—'],
    ['G1 review time', `${Math.round(secs / 60 * 10) / 10} min${released ? ` · ${Math.round(secs / 60 / released * 10) / 10} min per usable first action (baseline ${s.g1BaselineMinutes})` : ''}`],
    ['Outcomes marked', String(ls.filter(l => /^Outcome/.test(l.decision)).length)],
    ['Interventions on items that proceeded', String(ls.filter(l => l.intervention).length)],
    ['Flagged decisions waiting for a check', String(dec.filter(l => l.flag && !l.checked).length)],
  ];
  const sorted = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }));
  return { rows, exceptions: sorted(exceptions), reasons: sorted(reasons) };
}

export async function weeklyView(scope: TenantScope, actor: Actor, query: { rep?: string | null; week?: string | null }) {
  const x = await pilot(scope, actor, query.rep);
  const weeks = [...new Set([...x.logs.map(l => isoWeek(l.at)), isoWeek(new Date())])].sort().reverse();
  if (query.week && !weeks.includes(query.week)) throw badRequest('There is nothing logged in that week.', { week: ['Pick one of the weeks listed.'] });
  const week = query.week || weeks[0], prev = weeks[weeks.indexOf(week) + 1] ?? null;
  const cur = weekData(x.logs, week, x.settings), before = prev ? weekData(x.logs, prev, x.settings) : null;
  return { ...lensInfo(x), reps: await repsFor(scope, x.lens), builds: x.p.builds.length, weeks, week, previous: prev, ...cur, previousRows: before?.rows ?? null };
}

export function weeklyMarkdown(w: Awaited<ReturnType<typeof weeklyView>>, now = new Date()): string {
  const list = (xs: { k: string; n: number }[]) => (xs.length ? xs.map(x => `- ${x.k}: ${x.n}`) : ['- None']);
  return [`# Weekly summary · ${w.week}`, '', `For the business-unit lead${w.rep ? ` · ${w.rep.name}` : ''}. Generated ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC.`, '',
    '## Gates and work done', ...w.rows.map(([k, v]) => `- ${k}: ${v}`), '', '## Why items went to a person', ...list(w.exceptions), '', '## Rejection reasons', ...list(w.reasons)].join('\n');
}

/* ─── Learning loop (8.1–8.4): one record per recommendation; the POC records, production learns ─── */

export type OutcomeRecord = {
  list: string; account: string; vertical: string; status: string; tier: string; segment: string; groupedOn: string; signals: string[]; action: string; recommended: string;
  runnerUp: string; contact: string; contactTitle: string; channel: string; draft: string; path: string; exceptions: string; decision: string; reasonCode: string;
  reason: string; cause: string; tags: string; alternativeNeeded: boolean; alternativeAccepted: boolean | null; outcome: string; finalStatus: string; owner: string;
  config: string; brand: string;
};

async function outcomeRecords(scope: TenantScope, x: Pilot): Promise<OutcomeRecord[]> {
  const rows = await scope.tx.select({ row: recommendations, draft: drafts.draft, runName: nbaRuns.name, configNo: configVersions.versionNo, brandNo: brandVersions.versionNo })
    .from(recommendations).innerJoin(drafts, and(eq(drafts.recommendationId, recommendations.id), eq(drafts.version, recommendations.draftVersion)))
    .innerJoin(nbaRuns, eq(nbaRuns.id, recommendations.nbaRunId)).leftJoin(configVersions, eq(configVersions.id, nbaRuns.configVersionId))
    .innerJoin(brandVersions, eq(brandVersions.id, nbaRuns.brandVersionId))
    .where(and(eq(recommendations.businessUnitId, scope.ctx.businessUnitId), ownerOnly(scope, recommendations.ownerEmail), ownerIn(recommendations.ownerEmail, x.lens)))
    .orderBy(desc(nbaRuns.createdAt), asc(recommendations.position));
  const names = await ownerNames(scope, rows.map(r => r.row.ownerEmail ?? ''));
  const byRec = new Map<string, LogFact[]>();
  for (const l of x.logs) { if (l.decisive) { const a = byRec.get(l.recommendationId) ?? []; a.push(l); byRec.set(l.recommendationId, a); } }
  return rows.map(({ row, draft, runName, configNo, brandNo }) => {
    const rec = row.rec as Rec, st = stateOf(row), d = draft as Draft, lr = R.liveRec(rec, st), dec = byRec.get(row.id) ?? [];
    const first = dec.find(l => l.firstPass) ?? dec[0], alt = dec.find(l => l.kind === 'alternative');
    const decision = first ? (first.accepted ? (first.editRating === 'minor' ? 'Edited (minor)' : first.editRating === 'major' ? 'Edited (major)' : 'Accepted') : 'Rejected')
      : row.passed ? 'Not judged (proceeded)' : 'Not decided yet';
    return {
      list: runName, account: rec.account.name, vertical: rec.account.vertical || '', status: rec.account.existingCustomer ? 'Existing customer' : 'Net-new', tier: rec.person.tier || '',
      segment: R.segOf(rec, st) || 'No micro-segment', groupedOn: (rec as { groupedOn?: { type?: string } }).groupedOn?.type || '',
      signals: [...new Set((rec.result.people || []).flatMap(pp => (pp.signals || []).map(s => s.type)))], action: R.chosenAction(rec, st), recommended: rec.action,
      runnerUp: rec.runnerUp ? rec.runnerUp.action : '', contact: lr.contact.name, contactTitle: lr.contact.jobTitle || '', channel: d.channel, draft: R.draftText(d),
      path: row.passed ? 'Proceeded on its own' : 'Went to a person', exceptions: row.reasons.join(' · '), decision,
      reasonCode: first && !first.accepted ? first.reasonCode || '' : '', reason: first && !first.accepted ? first.reason : '', cause: first?.cause || '', tags: first ? first.tags.join('; ') : '',
      alternativeNeeded: row.alternativeUsed, alternativeAccepted: alt ? !!alt.accepted : null, outcome: row.outcome || '', finalStatus: row.status,
      owner: row.ownerEmail ? names.get(row.ownerEmail) ?? row.ownerEmail : 'Unassigned', config: configNo ? `Config v${configNo}` : 'Config not recorded', brand: `Brand v${brandNo}`,
    };
  });
}

function loopTables(rs: OutcomeRecord[]) {
  const judged = (o: OutcomeRecord) => /^Accepted|^Edited|^Rejected/.test(o.decision), ok = (o: OutcomeRecord) => /^Accepted|^Edited/.test(o.decision);
  const won = (o: OutcomeRecord) => o.outcome === 'Replied' || o.outcome === 'Meeting booked';
  const stat = (list: OutcomeRecord[]): Judged => { const j = list.filter(judged); return { n: list.length, j: j.length, a: j.filter(ok).length, w: list.filter(won).length, rate: j.length ? j.filter(ok).length / j.length * 100 : null }; };
  const group = (key: (o: OutcomeRecord) => string) => { const m = new Map<string, OutcomeRecord[]>(); rs.forEach(o => { const k = key(o); m.set(k, [...(m.get(k) ?? []), o]); }); return [...m.entries()]; };
  const all = rs.filter(judged);
  return {
    actions: group(o => `${o.segment} · ${o.action}`).map(([k, l]) => ({ k, ...stat(l) })).sort((a, b) => b.n - a.n),
    segments: group(o => o.segment).map(([k, l]) => {
      const rr: Record<string, number> = {}; l.filter(o => o.decision === 'Rejected').forEach(o => { rr[o.reason] = (rr[o.reason] || 0) + 1; });
      const top = Object.entries(rr).sort((a, b) => b[1] - a[1])[0];
      return { k, ...stat(l), top: top ? { reason: top[0], n: top[1] } : null };
    }),
    signals: [...new Set(rs.flatMap(o => o.signals))].map(k => ({ k, ...stat(rs.filter(o => o.signals.includes(k))) })).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1)),
    fit: [...group(o => o.status), ...group(o => 'Tier ' + o.tier), ...group(o => o.vertical || 'No vertical')].map(([k, l]) => ({ k, ...stat(l) })),
    allRate: all.length ? all.filter(ok).length / all.length * 100 : null,
    complete: rs.filter(o => o.signals.length && o.action && o.contact && o.channel && o.draft && o.config).length,
  };
}

export async function learningLoopView(scope: TenantScope, actor: Actor, rep?: string | null) {
  const x = await pilot(scope, actor, rep);
  const rs = await outcomeRecords(scope, x);
  // A Viewer sees the aggregates only: the records name accounts and contacts and carry the messages.
  return { ...lensInfo(x), reps: await repsFor(scope, x.lens), builds: x.p.builds.length, configVersion: x.validation.versionNo, total: rs.length,
    records: x.lens.viewer ? null : rs.slice(0, 300), ...loopTables(rs) };
}

const OUTCOME_COLUMNS: [string, keyof OutcomeRecord][] = [['list', 'list'], ['account', 'account'], ['vertical', 'vertical'], ['status', 'status'], ['tier', 'tier'],
  ['micro_segment', 'segment'], ['grouped_on', 'groupedOn'], ['signals', 'signals'], ['action', 'action'], ['recommended', 'recommended'], ['runner_up', 'runnerUp'],
  ['contact', 'contact'], ['contact_title', 'contactTitle'], ['channel', 'channel'], ['draft', 'draft'], ['path', 'path'], ['exceptions', 'exceptions'], ['decision', 'decision'],
  ['reason_code', 'reasonCode'], ['reason', 'reason'], ['cause', 'cause'], ['tags', 'tags'], ['alternative_needed', 'alternativeNeeded'], ['alternative_accepted', 'alternativeAccepted'],
  ['outcome', 'outcome'], ['final_status', 'finalStatus'], ['owner', 'owner'], ['config_version', 'config'], ['brand_version', 'brand']];

/** The outcome log as a file: one record per recommendation, through the CSV writer that neutralises formulas (G-052). */
export async function outcomeLogCsv(scope: TenantScope, actor: Actor, rep?: string | null): Promise<{ fileName: string; csv: string; rows: number }> {
  const x = await pilot(scope, actor, rep);
  const rs = await outcomeRecords(scope, x);
  const cell = (v: unknown) => (Array.isArray(v) ? v.join('; ') : v === null ? '' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v);
  const csv = toCSV([OUTCOME_COLUMNS.map(c => c[0]), ...rs.map(o => OUTCOME_COLUMNS.map(([, k]) => cell(o[k])))]);
  await recordAudit(scope, { action: 'analytics.exported', actorRole: actor.role, details: { kind: 'outcome-log', rows: rs.length, rep: !!x.lens.rep } });
  return { fileName: 'outcome_log.csv', csv, rows: rs.length };
}

/* ─── The pilot readout (7.5): the gates, the six areas with their evidence, and the sponsor's decision ─── */

function betterData(x: Pilot): string[] {
  const out = x.checks.filter(c => !c.ok && c.fix).map(c => `${c.k}: ${c.fix} (now ${c.show})`);
  const low = x.items.filter(i => i.confidence === 'low').length;
  if (low) out.push(`Primary-persona contacts for ${pl(low, 'account')} that went to a person with low confidence`);
  const noProof = x.items.filter(i => i.noProof).length;
  if (noProof) out.push(`Approved proof for ${pl(noProof, 'recommendation')} that became a task because none was found`);
  const unknownDeal = x.items.filter(i => !estimateDealSize(i.account)).length;
  if (unknownDeal) out.push(`Revenue or headcount for ${pl(unknownDeal, 'account')}, so the deal-size rule can be applied`);
  const dataRej = x.logs.filter(l => l.decisive && !l.accepted && l.cause === 'data');
  if (dataRej.length) out.push(`${pl(dataRej.length, 'rejection')} came from gaps in the Client's data (${[...new Set(dataRej.map(l => l.reason))].join(', ')})`);
  return out;
}

export async function readoutView(scope: TenantScope, actor: Actor, rep?: string | null, now = new Date()) {
  const x = await pilot(scope, actor, rep);
  const areas = await areasOf(scope, x);
  const { m, gates, settings } = x;
  const said: Record<G.GateState, string> = { none: 'open', early: `too early to call (fewer than ${settings.minDecisions} decisions)`, met: 'met', below: 'not met' };
  const ev = evidenceOf(x.items, x.logs, []);
  const built = [...new Set(x.p.builds.map(b => b.configVersionId).filter(Boolean))] as string[];
  const builtNos = built.length ? (await scope.tx.select({ n: configVersions.versionNo }).from(configVersions).where(inArray(configVersions.id, built))).map(r => `Config v${r.n}`).sort() : [];
  const lines = [
    '# Pilot readout', '',
    `Generated ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC from ${pl(x.p.builds.length, 'micro-segment build')}${x.lens.rep ? ` · ${x.lens.rep.name}` : x.lens.own ? ' · your own results' : ''}. Judged by Config v${x.validation.versionNo ?? '—'}${builtNos.length ? `; builds made under ${builtNos.join(', ')}` : ''}.`, '',
    '## The two success gates',
    `- G1 reduced human effort: ${gates.g1.value === null ? 'not enough data' : Math.round(gates.g1.value) + '% less'} (${m.minutes === null ? '—' : Math.round(m.minutes * 10) / 10 + ' min'} per usable first action against a ${m.base} min baseline; threshold ${settings.g1Threshold}% less): ${said[gates.g1.state]}`,
    `- G2 recommendation acceptance: ${gates.g2.value === null ? 'not enough data' : Math.round(gates.g2.value) + '%'} on first pass, weighted across both paths (threshold ${settings.g2Threshold}%): ${said[gates.g2.state]}`,
    `  - Proceeded path: ${pct0(m.auto.pct)} of ${m.auto.n} spot-checks, from ${m.autoN} items`,
    `  - Exception path: ${pct0(m.exc.pct)} of ${m.exc.n} decisions, from ${m.excN} items`,
    `  - Within one alternative: ${pct0(m.alternatives.pct)} of ${m.alternatives.n}`, '',
    ...areas.flatMap((a, i) => [`## ${i + 1} · ${a.title}`, ...(a.stateLabel ? [`- Measured: ${a.stateLabel}`] : []), ...a.evidence.map(e => `- ${e.label}: ${e.value}${e.sub ? ` (${e.sub})` : ''}`), '']),
    '## Work done', ...funnelStages(x.p, x.items, x.logs).map(s => `- ${s.k}: ${s.n} (${s.sub})`), '',
    '## Decision reasons',
    ...(ev.reasons.length ? ev.reasons.map(r => `- ${r.code ? r.code + ' ' : ''}${r.reason}: ${r.n}`) : ['- No rejections yet']),
    `- By cause: ${m.causes.data} from gaps in the Client's data, ${m.causes.system} from the system's judgement, ${m.causes.other} other; ${m.compliance} compliance send-backs`,
    `- What worked (acceptance tags): ${ev.tags.length ? ev.tags.map(t => `${t.tag} ${t.n}`).join(', ') : 'none yet'}`, '',
    '## What better data would add', ...((d => (d.length ? d.map(s => `- ${s}`) : ['- No data gaps found']))(betterData(x))),
  ];
  return { ...lensInfo(x), reps: await repsFor(scope, x.lens), builds: x.p.builds.length, areas, text: lines.join('\n') };
}

/* ─── Validation: method, baseline, sample and threshold per gate; the readiness checks; changing the settings ─── */

export async function validationView(scope: TenantScope, actor: Actor) {
  const x = await pilot(scope, actor);
  const bu = scope.ctx.businessUnitId;
  const versions = await scope.tx.select({ id: configVersions.id, versionNo: configVersions.versionNo, status: configVersions.status, activatedAt: configVersions.activatedAt,
    by: sql<string | null>`coalesce(${users.displayName}, 'A former member')` })
    .from(configVersions).leftJoin(users, eq(users.id, configVersions.activatedBy)).where(eq(configVersions.businessUnitId, bu)).orderBy(desc(configVersions.versionNo));
  const gateChanges = await scope.tx.select({ id: configChanges.configVersionId, changes: configChanges.changes }).from(configChanges).where(eq(configChanges.businessUnitId, bu));
  const signalChanges = await scope.tx.select({ id: signalTypeChanges.configVersionId, type: signalTypeChanges.signalType, change: signalTypeChanges.change }).from(signalTypeChanges)
    .where(eq(signalTypeChanges.businessUnitId, bu));
  const word: Record<string, string> = { off: 'switched off', on: 'switched on', added: 'added', removed: 'removed' };
  return {
    ...lensInfo(x), canEdit: isManager(actor.role), settings: x.settings, configVersion: x.validation.versionNo, dealThreshold: CONFIG.dealSize.threshold, builds: x.p.builds.length,
    sample: { released: x.m.released, minutes: Math.round(x.logs.filter(l => l.decisive).reduce((t, l) => t + (l.seconds || 0), 0) / 60 * 10) / 10, exceptions: x.m.exc.n, spotChecks: x.m.auto.n },
    versions: versions.map(v => ({ versionNo: v.versionNo, status: v.status, activatedAt: v.activatedAt, by: v.versionNo === 1 && !v.activatedAt ? null : v.by,
      changes: [...signalChanges.filter(c => c.id === v.id).map(c => `${c.type} ${word[c.change]}`), ...gateChanges.filter(c => c.id === v.id).flatMap(c => c.changes)] })),
    readiness: x.checks, verdict: x.checks.length ? G.pilotVerdict(x.checks) : null,
  };
}

export type ValidationInput = Partial<G.ValidationSettings>;

/** A manager changes the gate settings: agreed at kickoff, so a change makes a new configuration version, dated and
 *  recorded with what changed (D-21). */
export async function saveValidation(scope: TenantScope, actor: Actor, input: ValidationInput): Promise<{ versionNo: number; changes: string[] }> {
  if (!isManager(actor.role)) throw forbidden('Only the sales manager or an Admin can change the validation settings.');
  const fields = G.validationProblem(input);
  if (fields) throw badRequest('Some settings are out of range.', fields);
  const cur: ActiveValidation = await activeValidation(scope);
  const next: G.ValidationSettings = { ...cur.settings, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
  const changes = G.validationChanges(cur.settings, next);
  if (!changes.length) throw conflict('Nothing changed: these are the settings in use.');
  const v = await nextVersion(scope, actor, body => ({ ...body, ...next }));
  await scope.tx.insert(configChanges).values({ businessUnitId: scope.ctx.businessUnitId, configVersionId: v.id, kind: 'validation', changes, before: cur.settings, after: next, createdBy: actor.userId });
  await recordAudit(scope, { action: 'config.validation_changed', actorRole: actor.role, targetType: 'config_version', targetId: v.id, details: { versionNo: v.versionNo, changes: changes.length } });
  logger.info({ event: 'config.validation_changed', versionNo: v.versionNo, changes: changes.length }, 'Validation settings changed');
  return { versionNo: v.versionNo, changes };
}
