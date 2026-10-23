// The hand-off from Scoring to Micro-segments & NBA, stored with a UUID per item (G-049: two prospects can no
// longer collapse into one ID). Only prospects with a live signal that the caller can see, and who pass canContact
// (G-005), are handed off; the others stay in Scoring and are counted as held back.
// Micro-segments & NBA builds from handoff_items (lib/server/services/nba.ts); each item keeps a short summary.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { canContact } from '../../demandai-engine.ts';
import type { Account, Contact } from '../../../types/demandai';
import { handoffItems, handoffs, scoringRuns } from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { badRequest, notFound } from '../http/errors.ts';
import { logger } from '../logger.ts';
import { chunks, ownerOnly, type Actor } from './lists.ts';
import { handoffCandidates } from './scoring.ts';

export async function createHandoff(scope: TenantScope, actor: Actor, input: { runId: string; contactIds?: string[] }): Promise<{ handoffId: string; count: number; heldBack: number }> {
  const [run] = await scope.tx.select({ id: scoringRuns.id }).from(scoringRuns)
    .where(and(eq(scoringRuns.id, input.runId), eq(scoringRuns.businessUnitId, scope.ctx.businessUnitId)));
  if (!run) throw notFound('That scoring run is not there any more.');
  const candidates = await handoffCandidates(scope, run.id, input.contactIds ? [...new Set(input.contactIds)] : undefined);
  const picked = candidates.filter(p => canContact(p.contact as Contact));
  const heldBack = candidates.length - picked.length;
  if (!candidates.length) throw badRequest('Select prospects with a live signal first.');
  if (!picked.length) throw badRequest(`None of the ${candidates.length} prospect${candidates.length === 1 ? '' : 's'} can be contacted (no usable channel, no consent basis, or opt-out not confirmed), so nothing was handed off.`);
  const [h] = await scope.tx.insert(handoffs).values({
    businessUnitId: scope.ctx.businessUnitId, runId: run.id, selection: input.contactIds ? 'selected' : 'default', itemCount: picked.length, createdBy: actor.userId,
  }).returning({ id: handoffs.id });
  const items = picked.map((p, position) => {
    const id = randomUUID();
    const summary: HandoffItem = { id, name: (p.contact as Contact).name, company: (p.account as Account).name, tier: p.tier, score: p.score };
    return {
      id, businessUnitId: scope.ctx.businessUnitId, handoffId: h.id, contactId: p.contactId, accountId: p.accountId, ownerEmail: p.ownerEmail,
      position, data: summary, createdBy: actor.userId,
    };
  });
  for (const part of chunks(items)) await scope.tx.insert(handoffItems).values(part);
  await recordAudit(scope, { action: 'handoff.created', actorRole: actor.role, targetType: 'handoff', targetId: h.id, details: { runId: run.id, count: items.length, heldBack, selection: input.contactIds ? 'selected' : 'default' } });
  logger.info({ event: 'handoff.created', handoffId: h.id, count: items.length, heldBack }, 'Prospects handed off to NBA');
  return { handoffId: h.id, count: items.length, heldBack };
}

/** What a hand-off item records about the prospect, for showing the hand-off. */
export type HandoffItem = { id: string; name: string; company: string; tier: string; score: number | null };

export async function getHandoff(scope: TenantScope, id: string): Promise<{ id: string; runId: string; createdAt: Date; items: HandoffItem[] }> {
  const [h] = await scope.tx.select().from(handoffs).where(and(eq(handoffs.id, id), eq(handoffs.businessUnitId, scope.ctx.businessUnitId)));
  if (!h) throw notFound('That hand-off is not there any more.');
  const rows = await scope.tx.select({ data: handoffItems.data }).from(handoffItems)
    .where(and(eq(handoffItems.handoffId, id), ownerOnly(scope, handoffItems.ownerEmail))).orderBy(asc(handoffItems.position));
  return { id: h.id, runId: h.runId, createdAt: h.createdAt, items: rows.map(r => r.data as HandoffItem) };
}
