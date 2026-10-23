// A micro-segment build with its first messages written by AI (spec 5.12–5.14, G-026, D-5). Writing a hundred
// drafts takes longer than a request, so with AI_FEATURE_DRAFTING on the build is a job, run as the person who asked
// (a rep builds from their own prospects): the plan is read in one transaction, the drafts are written with no
// transaction open, and the build is stored in a second one, which uses an AI draft only for exactly the
// recommendation, action, channel and person it was written for. Every draft the AI couldn't write stays the rules'.
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { eligible, writeDraft } from '../../ai/draft.ts';
import type { AiGateway } from '../../ai/gateway.ts';
import { can, scopeFor, type BuRole } from '../../auth/permissions.ts';
import type { Draft } from '../../engine/nba.ts';
import * as R from '../../engine/review.ts';
import { businessUnitMembers, users } from '../db/schema.ts';
import { withTenant, type Db, type TenantContext } from '../db/tenant.ts';
import { HttpError } from '../http/errors.ts';
import { JobError, jobContext } from '../jobs/queue.ts';
import type { JobRun } from '../jobs/worker.ts';
import { aiGateway, callContext } from '../ai.ts';
import { logger } from '../logger.ts';
import type { Actor } from './lists.ts';
import { aiDraftKey, buildNbaRun, planNbaBuild, type AiDrafts } from './nba.ts';
import { ownerEmailsOf } from './users.ts';

export const NBA_STAGES = ['prepare', 'draft', 'save'];
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
export async function draftsForPlan(ai: AiGateway, ctx: TenantContext, plan: Awaited<ReturnType<typeof planNbaBuild>>, budgetMs: number): Promise<AiDrafts & { stats: AiDraftStats }> {
  const drafts = new Map<string, Draft>(), missed = new Map<string, string>();
  const stats: AiDraftStats = { asked: 0, written: 0, fallbacks: {} };
  const asks = plan.seg.recs.map(rec => ({ rec, rules: R.generatedDraft(rec, R.initialState(), plan.pack, plan.checkDate) })).filter(a => eligible(a.rules));
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

export function createNbaBuildJob() {
  return async function runBuild(run: JobRun): Promise<Record<string, string>> {
    const { db, job } = run;
    try {
      const person = await personOf(db, job.businessUnitId, job.createdBy);
      await run.stage('prepare');
      const input = job.payload.handoffId ? { handoffId: job.payload.handoffId } : { scoringRunId: job.payload.scoringRunId };
      const plan = await withTenant(db, person.ctx, s => planNbaBuild(s, person.actor, input), { label: 'nba.plan', slowMs: 5_000 });
      await run.stage('draft', { prospects: plan.seg.recs.length });
      const ai = await draftsForPlan(aiGateway(), person.ctx, plan, run.deadline - Date.now() - 30_000);
      await run.stage('save', { drafts: ai.stats.asked, aiDrafts: ai.stats.written });
      const built = await withTenant(db, person.ctx, s => buildNbaRun(s, person.actor, { handoffId: plan.handoffId }, ai), { label: 'nba.build', slowMs: 10_000 });
      logger.info({ event: 'ai.drafts.step', nbaRunId: built.runId, ...ai.stats }, 'First messages written');
      return { runId: built.runId };
    } catch (err) {
      // A refusal (nothing yours to group, the hand-off is gone) is the answer, not something to retry.
      if (err instanceof HttpError && err.status < 500) throw new JobError(err.code, err.message);
      throw err;
    }
  };
}
