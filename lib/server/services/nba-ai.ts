// A micro-segment build with AI (spec 5.12–5.14, G-026, D-5; 30 Oct 2026: the micro-segments and next best actions
// too). Grouping, choosing and writing take longer than a request, so with any of AI_FEATURE_SEGMENTS,
// AI_FEATURE_NEXT_ACTION or AI_FEATURE_DRAFTING on the build is a job, run as the person who asked
// (a rep builds from their own prospects): the plan is read in one transaction, the drafts are written with no
// transaction open, and the build is stored in a second one, which uses an AI draft only for exactly the
// recommendation, action, channel and person it was written for. Every draft the AI couldn't write stays the rules'.
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { eligible, writeDraft } from '../../ai/draft.ts';
import { actionStep, applyAiPlan, factsOf, segmentStep, type AiPlan, type KnownSegment } from '../../ai/nba.ts';
import { CONFIG } from '../../demandai-engine.ts';
import { approvedClaims } from '../../engine/nba.ts';
import type { AiGateway } from '../../ai/gateway.ts';
import { can, scopeFor, type BuRole } from '../../auth/permissions.ts';
import type { Draft } from '../../engine/nba.ts';
import * as R from '../../engine/review.ts';
import { businessUnitMembers, decisionLog, users } from '../db/schema.ts';
import { sql } from 'drizzle-orm';
import { withTenant, type Db, type TenantContext } from '../db/tenant.ts';
import { HttpError } from '../http/errors.ts';
import { JobError, jobContext } from '../jobs/queue.ts';
import type { JobRun } from '../jobs/worker.ts';
import { aiGateway, callContext } from '../ai.ts';
import { logger } from '../logger.ts';
import type { Actor } from './lists.ts';
import { aiDraftKey, buildNbaRun, planNbaBuild, type AiDrafts } from './nba.ts';
import { knownSegments } from './segments.ts';
import { ownerEmailsOf } from './users.ts';

export const NBA_STAGES = ['prepare', 'choose', 'draft', 'save'];
/** The stages a build goes through: "choose" only when the AI groups or chooses, so the screen never says it does. */
export const nbaStages = (gw: AiGateway): string[] => (gw.enabled('segment') || gw.enabled('next_action') ? NBA_STAGES : NBA_STAGES.filter(s => s !== 'choose'));
/** Long enough for a large build's drafts; the AI stops in time to store the build. */
export const NBA_BUILD_TIME_LIMIT_MS = 6 * 60_000;

export type AiDraftStats = { asked: number; written: number; fallbacks: Record<string, number> };

const REASON: Record<string, string> = {
  checks_failed: 'The AI draft failed the brand, claim or grounding checks twice', busy: 'The AI service was busy', timeout: 'The AI service was too slow',
  rate_limited: 'The AI service was busy', circuit_open: 'The AI service kept failing', content_filter: 'The content policy filtered it',
};

/** The person who asked, as they are now: their role in the unit and, for a rep, the owner addresses they see. */
async function personOf(db: Db, businessUnitId: string, userId: string): Promise<{ ctx: TenantContext; actor: Actor }> {
  const who = await withTenant(db, jobContext(businessUnitId), async s => {
    const [m] = await s.tx.select({ role: businessUnitMembers.role, email: users.email, status: users.status }).from(businessUnitMembers)
      .innerJoin(users, eq(users.id, businessUnitMembers.userId))
      .where(and(eq(businessUnitMembers.businessUnitId, businessUnitId), eq(businessUnitMembers.userId, userId), eq(businessUnitMembers.status, 'active')));
    if (!m || m.status !== 'active') return null;
    const role = m.role as BuRole;
    return { role, ownerEmails: scopeFor(role) === 'own' ? await ownerEmailsOf(s.tx, userId, m.email) : [] };
  }, { label: 'nba.person' });
  if (!who || !can(who.role, 'nba.run')) throw new JobError('forbidden', 'You can no longer build micro-segments in this business unit.');
  return { ctx: { userId, businessUnitId, scope: scopeFor(who.role), ownerEmails: who.ownerEmails }, actor: { userId, role: who.role } };
}

/** The AI draft for each eligible recommendation of a plan, within the time it has. */
export async function draftsForPlan(ai: AiGateway, ctx: TenantContext, plan: Pick<Plan, 'seg' | 'pack' | 'checkDate'>, budgetMs: number): Promise<AiDrafts & { stats: AiDraftStats }> {
  const drafts = new Map<string, Draft>(), missed = new Map<string, string>();
  const stats: AiDraftStats = { asked: 0, written: 0, fallbacks: {} };
  const asks = plan.seg.recs.map(rec => ({ rec, rules: R.generatedDraft(rec, R.initialState(), plan.pack, plan.checkDate) })).filter(a => eligible(a.rules, a.rec, a.rec.action));
  stats.asked = asks.length;
  if (!asks.length || budgetMs < 5_000) {
    for (const a of asks) missed.set(aiDraftKey(a.rec, a.rules), REASON.busy);
    if (asks.length) stats.fallbacks.busy = asks.length;
    return { drafts, missed, stats };
  }
  const cc = callContext(ctx, { deadlineMs: budgetMs });
  await Promise.all(asks.map(async ({ rec, rules }) => {
    const r = await writeDraft(ai, cc, { rec, action: rec.action, pack: plan.pack, checkDate: plan.checkDate, rules });
    const key = aiDraftKey(rec, rules);
    if (r.ok === true) { drafts.set(key, r.draft); stats.written++; return; }
    if (r.reason === 'not_eligible' || r.reason === 'disabled') return;
    stats.fallbacks[r.reason] = (stats.fallbacks[r.reason] ?? 0) + 1;
    missed.set(key, REASON[r.reason] ?? 'The AI service failed');
  }));
  return { drafts, missed, stats };
}

type Plan = Awaited<ReturnType<typeof planNbaBuild>>;

/** What the AI is sent besides the accounts: the unit's segments, the action library with how often each was accepted,
 *  the team's recent decisions (learning from history at each call, not retraining), and each account's past decisions. */
async function aiContext(scope: Parameters<typeof planNbaBuild>[0], plan: Plan) {
  const bu = scope.ctx.businessUnitId;
  const known: KnownSegment[] = [...Object.keys(CONFIG.segmentLibrary).map(name => ({ name, theme: R.SEG_MEANS[name] ?? name, status: 'approved' as const, origin: 'rules' as const })),
    ...(await knownSegments(scope)).map(k => ({ name: k.name, theme: k.theme, status: k.status as 'approved' | 'waiting', origin: k.origin as 'ai' | 'person' }))];
  const judged = await scope.tx.select({ action: decisionLog.action, n: sql<number>`count(*)::int`, a: sql<number>`(count(*) filter (where ${decisionLog.accepted}))::int` })
    .from(decisionLog).where(sql`${decisionLog.businessUnitId} = ${bu} and ${decisionLog.decisive}`).groupBy(decisionLog.action);
  const library = plan.actions.map(a => { const j = judged.find(x => x.action.toLowerCase() === a.name.toLowerCase()); return { ...a, judged: j?.n ?? 0, accepted: j?.a ?? 0 }; });
  // The last 90 days, per micro-segment and action: accepted, rejected (and as "Wrong action"), edited; the outcomes.
  const { rows: hist } = await scope.tx.execute<{ seg: string; action: string; acc: number; rej: number; r6: number; edits: number; replied: number; meetings: number; silent: number }>(sql`
    select coalesce(nullif(d.segment, ''), 'No micro-segment') as seg, d.action,
      (count(*) filter (where d.accepted))::int as acc, (count(*) filter (where d.accepted = false))::int as rej, (count(*) filter (where d.reason_code = 'R6'))::int as r6,
      (count(*) filter (where d.edit_rating in ('minor', 'major')))::int as edits,
      (count(distinct r.id) filter (where r.outcome = 'Replied'))::int as replied, (count(distinct r.id) filter (where r.outcome = 'Meeting booked'))::int as meetings,
      (count(distinct r.id) filter (where r.outcome = 'No response'))::int as silent
    from decision_log d join recommendations r on r.id = d.recommendation_id
    where d.business_unit_id = ${bu} and d.decisive and d.created_at > now() - interval '90 days' group by 1, 2 order by count(*) desc limit 30`);
  const history = hist.map(h => `${h.seg} · ${h.action}: ${h.acc} accepted, ${h.rej} rejected${h.r6 ? ` (${h.r6} as Wrong action, R6)` : ''}${h.edits ? `, ${h.edits} edited` : ''}; outcomes: ${h.meetings} meetings, ${h.replied} replies, ${h.silent} no response`);
  // Each account's past decisions, by name, newest first.
  const names = [...new Set(plan.seg.recs.map(r => r.account.name.toLowerCase()))];
  const { rows: past } = names.length ? await scope.tx.execute<{ name: string; line: string }>(sql`
    select lower(r.rec->'account'->>'name') as name, to_char(d.created_at, 'YYYY-MM-DD') || ' ' || d.action || ': ' || d.decision || coalesce(' (' || nullif(d.reason, '') || ')', '') || coalesce(', outcome ' || r.outcome, '') as line
    from decision_log d join recommendations r on r.id = d.recommendation_id
    where d.business_unit_id = ${bu} and d.decisive and lower(r.rec->'account'->>'name') = any(${'{' + names.map(n => '"' + n.replace(/["\\]/g, m => '\\' + m) + '"').join(',') + '}'}::text[])
    order by d.created_at desc limit 300`) : { rows: [] };
  const pastBy = new Map<string, string[]>();
  for (const p of past) pastBy.set(p.name, [...(pastBy.get(p.name) ?? []), p.line].slice(0, 3));
  return { known, library, history, past: pastBy };
}

/** The micro-segments and actions the AI chooses for a plan, within the time it has (sections A and B). */
export async function choicesForPlan(ai: AiGateway, ctx: TenantContext, plan: Plan, context: Awaited<ReturnType<typeof aiContext>>, budgetMs: number): Promise<AiPlan | undefined> {
  if (!ai.enabled('segment') && !ai.enabled('next_action')) return undefined;
  const cc = callContext(ctx, { deadlineMs: Math.max(5_000, budgetMs) });
  const facts = plan.seg.recs.map(r => factsOf(r, context.past.get(r.account.name.toLowerCase()) ?? []));
  const seg = ai.enabled('segment') ? await segmentStep(ai, cc, facts, context.known) : null;
  const segments = seg?.choices ?? new Map();
  const grouped = applyAiPlan(plan.seg, { segments, actions: new Map() }, { min: CONFIG.minSegmentAccounts, library: plan.library });
  const act = ai.enabled('next_action') ? await actionStep(ai, cc, grouped.recs.map(r => factsOf(r, context.past.get(r.account.name.toLowerCase()) ?? [])),
    { library: context.library, history: context.history, claims: approvedClaims(plan.pack).filter(c => c.expiry >= plan.checkDate), competitors: plan.pack.competitors ?? [] }) : null;
  return { segments, actions: act?.choices ?? new Map(), stats: { segments: seg?.stats ?? null, actions: act?.stats ?? null } };
}

export function createNbaBuildJob() {
  return async function runBuild(run: JobRun): Promise<Record<string, string>> {
    const { db, job } = run;
    try {
      const person = await personOf(db, job.businessUnitId, job.createdBy);
      await run.stage('prepare');
      const input = job.payload.handoffId ? { handoffId: job.payload.handoffId } : { scoringRunId: job.payload.scoringRunId };
      const { plan, context } = await withTenant(db, person.ctx, async s => { const p = await planNbaBuild(s, person.actor, input); return { plan: p, context: await aiContext(s, p) }; },
        { label: 'nba.plan', slowMs: 5_000 });
      // The AI groups and chooses with no transaction open, leaving time to write the drafts and store the build.
      const gw = aiGateway();
      if (job.progress.stages.includes('choose')) await run.stage('choose', { prospects: plan.seg.recs.length });
      const choices = await choicesForPlan(gw, person.ctx, plan, context, Math.floor((run.deadline - Date.now()) / 2));
      const chosen = choices ? { ...plan, seg: applyAiPlan(plan.seg, choices, { min: CONFIG.minSegmentAccounts, library: plan.library }) } : plan;
      await run.stage('draft', { prospects: chosen.seg.recs.length, ...(choices ? { aiSegments: choices.segments.size, aiActions: choices.actions.size } : {}) });
      const ai = await draftsForPlan(aiGateway(), person.ctx, chosen, run.deadline - Date.now() - 30_000);
      await run.stage('save', { drafts: ai.stats.asked, aiDrafts: ai.stats.written });
      const built = await withTenant(db, person.ctx, s => buildNbaRun(s, person.actor, { handoffId: plan.handoffId }, { ...ai, plan: choices }), { label: 'nba.build', slowMs: 10_000 });
      logger.info({ event: 'ai.drafts.step', nbaRunId: built.runId, ...ai.stats }, 'First messages written');
      if (choices) logger.info({ event: 'ai.nba.step', nbaRunId: built.runId, segments: choices.stats.segments, actions: choices.stats.actions }, 'Micro-segments and actions chosen');
      return { runId: built.runId };
    } catch (err) {
      // A refusal (nothing yours to group, the hand-off is gone) is the answer, not something to retry.
      if (err instanceof HttpError && err.status < 500) throw new JobError(err.code, err.message);
      throw err;
    }
  };
}
