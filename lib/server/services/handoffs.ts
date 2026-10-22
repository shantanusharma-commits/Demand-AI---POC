// The hand-off from Scoring to Micro-segments & NBA, stored with a UUID per item (G-049: two prospects can no
// longer collapse into one ID). Only prospects with a live signal that the caller can see are handed off.
// Phase 5b's NBA port reads handoff_items; until then the NBA screen shows them in its queue.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { toNbaItem } from '../../engine/handoff.ts';
import type { Prospect } from '../../engine/prospects.ts';
import type { NbaItem } from '../../nba/data.ts';
import type { Account, Contact, PersonScore, ScoreResult, Tier } from '../../../types/demandai';
import { handoffItems, handoffs, scoringRuns } from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { badRequest, notFound } from '../http/errors.ts';
import { logger } from '../logger.ts';
import { chunks, ownerOnly, type Actor } from './lists.ts';
import { handoffCandidates } from './scoring.ts';

export async function createHandoff(scope: TenantScope, actor: Actor, input: { runId: string; contactIds?: string[] }): Promise<{ handoffId: string; count: number }> {
  const [run] = await scope.tx.select({ id: scoringRuns.id }).from(scoringRuns)
    .where(and(eq(scoringRuns.id, input.runId), eq(scoringRuns.businessUnitId, scope.ctx.businessUnitId)));
  if (!run) throw notFound('That scoring run is not there any more.');
  const picked = await handoffCandidates(scope, run.id, input.contactIds ? [...new Set(input.contactIds)] : undefined);
  if (!picked.length) throw badRequest('Select prospects with a live signal first.');
  const [h] = await scope.tx.insert(handoffs).values({
    businessUnitId: scope.ctx.businessUnitId, runId: run.id, selection: input.contactIds ? 'selected' : 'default', itemCount: picked.length, createdBy: actor.userId,
  }).returning({ id: handoffs.id });
  const items = picked.map((p, position) => {
    const id = randomUUID();
    const contact = p.contact as Contact;
    const person = (p.data as { person: Omit<PersonScore, 'contact'> }).person;
    const prospect: Prospect = {
      key: p.contactId, c: contact, tier: p.tier as Tier, score: p.score ?? undefined, fit: p.fit ?? undefined, timing: p.timing ?? undefined,
      r: { ...(p.result as Omit<ScoreResult, 'account' | 'contacts'>), account: p.account as Account, contacts: [] },
      p: { ...person, contact },
    };
    return {
      id, businessUnitId: scope.ctx.businessUnitId, handoffId: h.id, contactId: p.contactId, accountId: p.accountId, ownerEmail: p.ownerEmail,
      position, data: toNbaItem(prospect, id), createdBy: actor.userId,
    };
  });
  for (const part of chunks(items)) await scope.tx.insert(handoffItems).values(part);
  await recordAudit(scope, { action: 'handoff.created', actorRole: actor.role, targetType: 'handoff', targetId: h.id, details: { runId: run.id, count: items.length, selection: input.contactIds ? 'selected' : 'default' } });
  logger.info({ event: 'handoff.created', handoffId: h.id, count: items.length }, 'Prospects handed off to NBA');
  return { handoffId: h.id, count: items.length };
}

export async function getHandoff(scope: TenantScope, id: string): Promise<{ id: string; runId: string; createdAt: Date; items: NbaItem[] }> {
  const [h] = await scope.tx.select().from(handoffs).where(and(eq(handoffs.id, id), eq(handoffs.businessUnitId, scope.ctx.businessUnitId)));
  if (!h) throw notFound('That hand-off is not there any more.');
  const rows = await scope.tx.select({ data: handoffItems.data }).from(handoffItems)
    .where(and(eq(handoffItems.handoffId, id), ownerOnly(scope, handoffItems.ownerEmail))).orderBy(asc(handoffItems.position));
  return { id: h.id, runId: h.runId, createdAt: h.createdAt, items: rows.map(r => r.data as NbaItem) };
}
