// Today on the server (G-010; legacy 00-today.html): what the system needs from the signed-in person so work keeps
// moving, worked out from the database on every visit. Blockers first, then what waits for them (the due dates are
// worked out in the browser's own time zone, as in For Review), what was released and needs an outcome, the success
// gates, this week's spot-checks and what the system did on its own. Reps see their own items (G-014); managers see
// the unit's, with the approvals waiting on them. Like For Review, opening it draws the week's spot-checks.
import 'server-only';
import { and, asc, desc, eq, gt, isNull, ne, notInArray, or, sql } from 'drizzle-orm';
import { CONFIG } from '../../demandai-engine.ts';
import { approvedClaims, type Draft } from '../../engine/nba.ts';
import * as G from '../../engine/gates.ts';
import * as R from '../../engine/review.ts';
import { brandDrafts, decisionLog, drafts, leadLists, nbaRuns, recommendations, scoringRuns, spotChecks } from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { liveBrand } from './brand.ts';
import { isManager, ownerOnly, type Actor } from './lists.ts';
import { activeValidation, pilotFacts } from './measures.ts';
import { recOf, logFacts, stateOf } from './recommendations.ts';
import { drawSpotChecks, isoWeek, needsPersonSql, queueRows, type QueueRow } from './review.ts';
import { todayUtc } from './scoring.ts';

/** An item waiting on someone, as Today lists it. */
export type TodayRow = {
  id: string; runId: string; who: string; account: string; action: string; channel: string; cats: string[]; reason: string; whyHere: string;
  routedAt: Date; segment: string | null; spot: string | null; why: string | null; ownerName: string | null;
};
export type ReadyRow = { id: string; runId: string; who: string; account: string; action: string; channel: string; releasedAt: Date | null; outcome: string | null };
export type Blocker = { title: string; detail: string; href: string; cta: string; who: string };
export type Recent = { kind: 'Prospect list' | 'Scored list' | 'Micro-segments'; id: string; name: string; sub: string; at: Date; href: string };

const pl = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const ago = (t: Date, now: Date) => { const h = (+now - +t) / 36e5; return h < 1 ? 'just now' : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`; };

const toRow = (q: QueueRow): TodayRow => ({
  id: q.id, runId: q.runId, who: q.contact.name, account: q.account.name, action: q.chosenAction, channel: q.channel, cats: q.cats,
  reason: R.REASON_CATS[q.cats[0]] || 'Exception', whyHere: R.whyHere({ spot: q.spot as R.RecState['spot'], why: q.why as R.RecState['why'] }),
  routedAt: q.routedAt, segment: q.formedSegment, spot: q.spot, why: q.why, ownerName: q.ownerName,
});

export async function today(scope: TenantScope, actor: Actor) {
  const bu = scope.ctx.businessUnitId, manager = isManager(actor.role), now = new Date();
  const { rows: [built] } = await scope.tx.execute<{ lists: number; runs: number; builds: number }>(sql`select
    (select count(*) from lead_lists where business_unit_id = ${bu} and status = 'saved')::int as lists,
    (select count(*) from scoring_runs where business_unit_id = ${bu} and status = 'saved')::int as runs,
    (select count(*) from nba_runs where business_unit_id = ${bu})::int as builds`);
  if (!built.lists && !built.runs && !built.builds) return { nothing: true as const, manager, now };

  await drawSpotChecks(scope, actor, now);
  const validation = await activeValidation(scope), settings = validation.settings;
  const visible = and(eq(recommendations.businessUnitId, bu), ownerOnly(scope, recommendations.ownerEmail));

  // What waits on a person: the queue (everyone's for a manager), the approvals, a rep's items with the manager.
  const waiting = await queueRows(scope, needsPersonSql);
  const queue = waiting.filter(x => R.inQueue({ status: x.status as R.RecStatus, spot: x.spot as R.RecState['spot'] }) && !x.paused).map(toRow);
  const held = waiting.filter(x => x.status === 'Awaiting approval');
  const approvals = manager ? held.filter(x => !x.paused).sort((a, b) => +a.routedAt - +b.routedAt) : [];

  // Released, and nothing marked yet beyond "Sent": oldest first.
  const readyWhere = and(visible, eq(recommendations.status, 'Released'), or(isNull(recommendations.outcome), eq(recommendations.outcome, 'Sent')),
    or(isNull(recommendations.spot), ne(recommendations.spot, 'pending')));
  const [{ readyTotal }] = await scope.tx.select({ readyTotal: sql<number>`count(*)::int` }).from(recommendations).where(readyWhere);
  const readyRows = await scope.tx.select({ row: recommendations, draft: drafts.draft }).from(recommendations)
    .innerJoin(drafts, and(eq(drafts.recommendationId, recommendations.id), eq(drafts.version, recommendations.draftVersion)))
    .where(readyWhere).orderBy(asc(recommendations.decidedAt), asc(recommendations.position)).limit(4);
  const ready: ReadyRow[] = readyRows.map(({ row, draft }) => {
    const rec = recOf(row), st = stateOf(row);
    return { id: row.id, runId: row.nbaRunId, who: R.liveRec(rec, st).contact.name, account: rec.account.name, action: R.chosenAction(rec, st),
      channel: (draft as Draft).channel, releasedAt: row.decidedAt, outcome: row.outcome };
  });

  // The measures: outcomes, the gates and the track record over what the caller can see.
  const items = await scope.tx.select({ passed: recommendations.passed, status: recommendations.status, outcome: recommendations.outcome }).from(recommendations).where(visible);
  const logs = await logFacts(scope, { ownerEmails: scope.ctx.scope === 'own' ? scope.ctx.ownerEmails : undefined });
  const measure = R.measure(items, logs, settings.g1BaselineMinutes);
  const marked = items.filter(x => x.outcome && x.outcome !== 'Sent');
  const trust = {
    all: R.trackRecord(logs, undefined, settings.minDecisions),
    segments: Object.keys(R.SEG_MEANS).map(s => ({ segment: s, ...R.trackRecord(logs, s, settings.minDecisions) })).filter(x => x.n >= 2)
      .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).slice(0, 3),
  };

  // This week's spot-checks: how many were drawn for the caller's owners, how many of those are rated.
  const week = isoWeek(now);
  const [{ picked }] = await scope.tx.select({ picked: sql<number>`coalesce(sum(cardinality(${spotChecks.picked})), 0)::int` }).from(spotChecks)
    .where(and(eq(spotChecks.businessUnitId, bu), eq(spotChecks.isoWeek, week), ownerOnly(scope, spotChecks.ownerEmail)));
  const [{ rated }] = await scope.tx.select({ rated: sql<number>`count(distinct ${decisionLog.recommendationId})::int` }).from(decisionLog)
    .innerJoin(recommendations, eq(recommendations.id, decisionLog.recommendationId))
    .where(and(visible, eq(decisionLog.kind, 'spot'), eq(decisionLog.decisive, true), eq(recommendations.spotWeek, week)));

  // What the system did in the newest build the caller has items in.
  const [latestRun] = await scope.tx.select({ id: nbaRuns.id, name: nbaRuns.name, createdAt: nbaRuns.createdAt }).from(nbaRuns)
    .where(and(eq(nbaRuns.businessUnitId, bu), sql`exists (select 1 from recommendations r where r.nba_run_id = ${nbaRuns.id})`)).orderBy(desc(nbaRuns.createdAt)).limit(1);
  let latest: { id: string; name: string; createdAt: Date; went: number; needed: number } | null = null;
  if (latestRun) {
    const [c] = await scope.tx.select({ went: sql<number>`count(*) filter (where ${recommendations.released} = 'auto')::int`, all: sql<number>`count(*)::int` })
      .from(recommendations).where(and(visible, eq(recommendations.nbaRunId, latestRun.id)));
    latest = { ...latestRun, went: c.went, needed: c.all - c.went };
  }

  // Recent lists of every kind (shared in the unit).
  const lists = await scope.tx.select({ id: leadLists.id, name: leadLists.name, stats: leadLists.stats, at: leadLists.createdAt }).from(leadLists)
    .where(and(eq(leadLists.businessUnitId, bu), eq(leadLists.status, 'saved'))).orderBy(desc(leadLists.createdAt)).limit(4);
  const runs = await scope.tx.select({ id: scoringRuns.id, name: scoringRuns.name, stats: scoringRuns.stats, at: scoringRuns.createdAt }).from(scoringRuns)
    .where(and(eq(scoringRuns.businessUnitId, bu), eq(scoringRuns.status, 'saved'))).orderBy(desc(scoringRuns.createdAt)).limit(4);
  const builds = await scope.tx.select({ id: nbaRuns.id, name: nbaRuns.name, stats: nbaRuns.stats, at: nbaRuns.createdAt }).from(nbaRuns)
    .where(eq(nbaRuns.businessUnitId, bu)).orderBy(desc(nbaRuns.createdAt)).limit(4);
  const st = (x: unknown) => (x ?? {}) as Record<string, number>;
  const recent: Recent[] = [
    ...lists.map(l => ({ kind: 'Prospect list' as const, id: l.id, name: l.name, sub: pl(st(l.stats).accounts ?? 0, 'account'), at: l.at, href: `/scoring?list=${l.id}` })),
    ...runs.map(r => ({ kind: 'Scored list' as const, id: r.id, name: r.name || 'Scored list', sub: `${st(r.stats).scored ?? 0} scored · ${st(r.stats).A ?? 0} tier A`, at: r.at, href: `/scoring?run=${r.id}` })),
    ...builds.map(b => ({ kind: 'Micro-segments' as const, id: b.id, name: b.name, sub: `${pl(st(b.stats).segments ?? 0, 'micro-segment')} · ${pl(st(b.stats).prospects ?? 0, 'recommendation')}`, at: b.at, href: `/nba?run=${b.id}` })),
  ].sort((a, b) => +b.at - +a.at).slice(0, 4);

  // Blockers: anything that stops work from moving, with where it is fixed and by whom.
  const blockers: Blocker[] = [];
  if (!manager && held.length) {
    blockers.push({ title: `${pl(held.length, 'message')} held for the sales manager's approval`,
      detail: `Sensitive content: nothing is released until the sales manager approves (${[...new Set(held.map(x => x.account.name))].slice(0, 5).join(', ')}${held.length > 5 ? ', …' : ''}).`,
      href: `/nba?run=${encodeURIComponent(held[0].runId)}&show=waiting`, cta: 'See them', who: 'Sales manager' });
  }
  const last = { nba: builds[0]?.at ?? null, scoring: runs[0]?.at ?? null };
  for (const s of CONFIG.schedule) {
    const t = last[s.id];
    if (t && +now - +t > s.everyDays * 864e5 + 4 * 36e5) {
      blockers.push({ title: `Scheduled run didn't run: ${s.name}`, detail: `Last ran ${ago(t, now)}; it's expected ${s.everyDays === 1 ? 'every day' : `every ${s.everyDays} days`}. Until it runs, new signals don't reach the reps.`,
        href: s.href, cta: 'Run it now', who: s.owner });
    }
  }
  const facts = await pilotFacts(scope), checks = facts ? G.pilotReadiness(facts, settings) : [];
  if (manager) {
    // An upload in the last two weeks where rows failed hard stops and weren't loaded.
    const fresh = await scope.tx.select({ id: leadLists.id, name: leadLists.name, stats: leadLists.stats }).from(leadLists)
      .where(and(eq(leadLists.businessUnitId, bu), eq(leadLists.status, 'saved'), gt(leadLists.createdAt, new Date(+now - 14 * 864e5)))).orderBy(desc(leadLists.createdAt));
    for (const l of fresh) {
      const s = l.stats as { notLoaded?: number; issuesBySeverity?: { stop?: number } };
      const n = s.notLoaded || s.issuesBySeverity?.stop || 0;
      if (n) blockers.push({ title: `Upload partly rejected: ${pl(n, 'row')} of "${l.name}" failed hard stops`, detail: 'Those rows weren\'t loaded, so their contacts can\'t be scored or recommended. Fix the file and upload it again.',
        href: `/prospecting?list=${encodeURIComponent(l.id)}`, cta: 'See the rejected rows', who: 'Sales manager' });
    }
    const gaps = checks.filter(x => !x.ok && x.k !== 'Collateral');
    if (gaps.length) blockers.push({ title: 'Not enough data to measure the pilot yet', detail: gaps.map(x => `${x.k}: ${x.show}, needs ${x.need.replace(/^A /, 'a ')}`).join(' · '),
      href: '/analytics?tab=validation', cta: 'See the readiness checks', who: 'Sales manager with the Client' });
  }
  // An approved claim that has expired while open actions in its segments would cite it.
  const brand = await liveBrand(scope), todayIso = todayUtc();
  const expired = approvedClaims(brand.pack).filter(c => c.expiry && c.expiry < todayIso);
  if (expired.length) {
    const open = await scope.tx.select({ seg: sql<string>`coalesce(${recommendations.segment}, ${recommendations.assignedSegment})`, n: sql<number>`count(*)::int` })
      .from(recommendations).where(and(visible, notInArray(recommendations.status, ['Closed', 'Set aside']))).groupBy(sql`1`);
    for (const c of expired) {
      const hit = open.filter(o => o.seg && (c.segments || []).includes(o.seg));
      const n = hit.reduce((t, o) => t + o.n, 0);
      if (n) blockers.push({ title: `Proof expired: "${c.title}" (${c.id})`, detail: `Expired ${c.expiry}. ${pl(n, 'open action')} in ${hit.map(o => o.seg).join(', ')} can't cite it any more: a draft that does fails the claims check and goes to a person.`,
        href: '/content?tab=claims', cta: 'Renew or replace the claim', who: 'Admin' });
    }
  }

  let setup: { configVersion: number | null; brandVersion: number; brandDraft: boolean; readiness: { ok: number; total: number } | null; saved: number } | null = null;
  if (manager) {
    const [draft] = await scope.tx.select({ at: brandDrafts.updatedAt }).from(brandDrafts).where(eq(brandDrafts.businessUnitId, bu));
    setup = { configVersion: validation.versionNo, brandVersion: brand.versionNo, brandDraft: !!draft,
      readiness: checks.length ? { ok: checks.filter(x => x.ok).length, total: checks.length } : null, saved: built.lists + built.runs + built.builds };
  }

  return {
    nothing: false as const, manager, now, settings, configVersion: validation.versionNo,
    queue, approvals: { total: approvals.length, rows: approvals.slice(0, 5).map(toRow) },
    withManager: { total: manager ? 0 : held.length, runId: held[0]?.runId ?? latest?.id ?? null },
    ready: { total: readyTotal, rows: ready },
    outcomes: { marked: marked.length, positive: marked.filter(x => x.outcome === 'Replied' || x.outcome === 'Meeting booked').length,
      meetings: items.filter(x => x.outcome === 'Meeting booked').length },
    measure, gates: G.gates(measure, settings), trust,
    spot: { week, picked, rated, rows: queue.filter(x => x.spot === 'pending').slice(0, 3) },
    latest, recent, setup, blockers,
  };
}

export type TodayView = Awaited<ReturnType<typeof today>>;
