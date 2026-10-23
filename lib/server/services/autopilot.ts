// Autopilot (G-013; the guide's Copilot section and legacy demandai-copilot.js): it does what a person approved in
// Copilot, and nothing else. It rates spot-checks that still pass every check, and accepts an exception only when its
// sole reason is below deal size; sensitive content, unsupported claims, brand or rule checks, low confidence and
// anyone who can't be reached always stay with a person. Every item is checked again before it acts, logged under the
// person's name as "Accepted by Autopilot" with their instruction, and never counts toward G2 (the entries are not
// decisive). The person who ran it can undo the run; an item someone has changed since is left as it is.
// Spec 6.4 asks for one decision per item with no bulk accept; the guide (which wins, prompt §3.3) keeps Autopilot
// for low-risk items only. The conflict is reported in the Phase 6 report.
import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { blockedWhy, type QItem } from '../../copilot/rules.ts';
import * as R from '../../engine/review.ts';
import { autopilotRuns, recommendations } from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { conflict, HttpError, notFound } from '../http/errors.ts';
import { logger } from '../logger.ts';
import type { Actor } from './lists.ts';
import { catsOf, liveReasons, loadItem, logItem, pausedSegments, segKey, type Item } from './recommendations.ts';

export type AutopilotKind = 'spot' | 'exception';
type Before = { status: string; released: string | null; spot: string | null; decidedAt: string | null; decidedBy: string | null; holdWhy: string | null; holdNote: string | null; holdAt: string | null; holdBy: string | null };

const labelOf = (item: Item) => `${R.liveRec(item.rec, item.state).contact.name} · ${item.rec.account.name}`;

/** Why Autopilot leaves this item for a person now, or null when it may act. */
async function leaveWhy(scope: TenantScope, item: Item, kind: AutopilotKind): Promise<string | null> {
  if ((await pausedSegments(scope, item.run.id)).has(segKey(item.rec))) return 'its micro-segment is paused';
  if (kind === 'spot' && item.state.spot !== 'pending') return 'not a spot-check waiting to be rated';
  if (kind === 'exception' && (item.state.spot === 'pending' || item.state.status !== 'Waiting')) return 'already decided';
  if (item.draft.draft.unreachable) return "there is no way to reach them yet";
  const q = { status: item.state.status, spot: item.state.spot, cats: catsOf(item), reasons: liveReasons(item), sensitive: R.isSensitive(item.draft.checks) } as QItem;
  return blockedWhy(q);
}

export async function runAutopilot(scope: TenantScope, actor: Actor, input: { kind: AutopilotKind; ids: string[]; instruction: string }) {
  const ids = [...new Set(input.ids)].slice(0, 200), instruction = R.cleanNote(input.instruction, 300);
  const done: { id: string; label: string }[] = [], skipped: { id: string; label: string; why: string }[] = [];
  const items: { id: string; before: Before }[] = [];
  for (const id of ids) {
    let item: Item;
    try { item = await loadItem(scope, id, { lock: true }); } catch (err) {
      if (err instanceof HttpError && err.status === 404) { skipped.push({ id, label: 'An item', why: 'not yours, or not there any more' }); continue; }
      throw err;
    }
    const why = await leaveWhy(scope, item, input.kind);
    if (why) { skipped.push({ id, label: labelOf(item), why }); continue; }
    const r = item.row;
    const before: Before = { status: r.status, released: r.released, spot: r.spot, decidedAt: r.decidedAt?.toISOString() ?? null, decidedBy: r.decidedBy, holdWhy: r.holdWhy,
      holdNote: r.holdNote, holdAt: r.holdAt?.toISOString() ?? null, holdBy: r.holdBy };
    const cats = catsOf(item);
    if (input.kind === 'spot') {
      await scope.tx.update(recommendations).set({ spot: 'accepted', updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(recommendations.id, id));
    } else {
      await scope.tx.update(recommendations).set({ status: 'Released', released: 'accepted', holdWhy: null, holdNote: null, holdAt: null, holdBy: null,
        decidedAt: sql`now()`, decidedBy: actor.userId, updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(recommendations.id, id));
    }
    await logItem(scope, item, actor, { decision: 'Accepted by Autopilot', kind: 'autopilot', decisive: false, accepted: true,
      note: `${input.kind === 'spot' ? 'Spot-check' : `Exception (${cats.map(c => R.REASON_CATS[c] || c).join(', ')})`} · instruction: "${instruction}" · checked again before acting · not counted toward G2` });
    items.push({ id, before });
    done.push({ id, label: labelOf(item) });
  }
  const [run] = await scope.tx.insert(autopilotRuns).values({ businessUnitId: scope.ctx.businessUnitId, kind: input.kind, instruction, items,
    skipped: skipped.map(s => ({ id: s.id, why: s.why })), createdBy: actor.userId }).returning({ id: autopilotRuns.id });
  await recordAudit(scope, { action: 'autopilot.run', actorRole: actor.role, targetType: 'autopilot_run', targetId: run.id, details: { kind: input.kind, done: done.length, skipped: skipped.length } });
  logger.info({ event: 'autopilot.run', autopilotRunId: run.id, kind: input.kind, done: done.length, skipped: skipped.length }, 'Autopilot ran');
  return { runId: run.id, done, skipped };
}

/** Puts every item Autopilot changed back where it was, unless someone has changed it since. */
export async function undoAutopilot(scope: TenantScope, actor: Actor, runId: string) {
  const [run] = await scope.tx.select().from(autopilotRuns)
    .where(and(eq(autopilotRuns.id, runId), eq(autopilotRuns.businessUnitId, scope.ctx.businessUnitId), eq(autopilotRuns.createdBy, actor.userId))).for('update');
  if (!run) throw notFound('That Autopilot run is not there, or is not yours to undo.');
  if (run.undoneAt) throw conflict('That Autopilot run has been undone already.');
  const restored: string[] = [], kept: { id: string; why: string }[] = [];
  for (const { id, before } of run.items as { id: string; before: Before }[]) {
    let item: Item;
    try { item = await loadItem(scope, id, { lock: true }); } catch (err) {
      if (err instanceof HttpError && err.status === 404) { kept.push({ id, why: 'not yours any more' }); continue; }
      throw err;
    }
    const s = item.row;
    const untouched = run.kind === 'spot' ? s.spot === 'accepted' : s.status === 'Released' && s.released === 'accepted' && s.decidedBy === actor.userId && !s.outcome;
    if (!untouched) { kept.push({ id, why: 'changed since Autopilot ran' }); continue; }
    await scope.tx.update(recommendations).set({
      status: before.status, released: before.released, spot: before.spot, decidedAt: before.decidedAt ? new Date(before.decidedAt) : null, decidedBy: before.decidedBy,
      holdWhy: before.holdWhy, holdNote: before.holdNote, holdAt: before.holdAt ? new Date(before.holdAt) : null, holdBy: before.holdBy, updatedAt: sql`now()`, updatedBy: actor.userId,
    }).where(eq(recommendations.id, id));
    item.state = { ...item.state, status: before.status as R.RecStatus, spot: before.spot as R.RecState['spot'] };
    await logItem(scope, item, actor, { decision: 'Autopilot run undone', kind: 'autopilot', decisive: false, note: 'Back in For Review for a person to decide' });
    restored.push(id);
  }
  await scope.tx.update(autopilotRuns).set({ undoneAt: sql`now()`, undoneBy: actor.userId }).where(and(eq(autopilotRuns.id, runId), isNull(autopilotRuns.undoneAt)));
  await recordAudit(scope, { action: 'autopilot.undone', actorRole: actor.role, targetType: 'autopilot_run', targetId: runId, details: { restored: restored.length, kept: kept.length } });
  return { restored: restored.length, kept };
}
