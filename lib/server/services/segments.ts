// The micro-segments list in Setup (product owner, 30 Oct 2026): every segment the AI or a person created, its theme,
// where it stands (waiting for approval, approved, retired), and how many accounts and lists use it; the rules' own
// segments are listed beside them, read-only. A sales manager approves, renames, merges or retires one. Approving a
// new one releases the items that waited only for it; renaming or merging moves its items to the name it has now, and
// builds made before show them under it (former_names). Every decision is kept with who made it and audited.
import 'server-only';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { CONFIG } from '../../demandai-engine.ts';
import { microSegments, recommendations } from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.ts';
import { logger } from '../logger.ts';
import { isManager, type Actor } from './lists.ts';

export type SegmentStatus = 'waiting' | 'approved' | 'retired';
export type SegmentRow = {
  id: string | null; name: string; theme: string; why: string; origin: 'rules' | 'ai' | 'person'; status: SegmentStatus; mergedInto: string | null;
  createdBy: string | null; createdAt: Date | null; decidedBy: string | null; decidedAt: Date | null; formerNames: string[];
  accounts: number; lists: number; waiting: number;
};

const nameOf = (col: typeof microSegments.createdBy | typeof microSegments.decidedBy) => sql<string | null>`(select coalesce(display_name, 'A former member') from users u where u.id = ${col})`;

/** Usage per segment name (lower case), over the unit's recommendations: accounts, builds, and items waiting for a person. */
async function usage(scope: TenantScope): Promise<Map<string, { accounts: number; lists: number; waiting: number }>> {
  const { rows } = await scope.tx.execute<{ seg: string; accounts: number; lists: number; waiting: number }>(sql`
    select lower(coalesce(segment, assigned_segment)) as seg, count(distinct account_id)::int as accounts, count(distinct nba_run_id)::int as lists,
      (count(*) filter (where status in ('Waiting', 'Awaiting approval')))::int as waiting
    from recommendations where business_unit_id = ${scope.ctx.businessUnitId} and coalesce(segment, assigned_segment) is not null group by 1`);
  return new Map(rows.map(r => [r.seg, { accounts: Number(r.accounts), lists: Number(r.lists), waiting: Number(r.waiting) }]));
}

/** The rules' segments first, then the AI's and people's: waiting ones at the top, retired ones last. */
export async function listSegments(scope: TenantScope): Promise<SegmentRow[]> {
  const used = await usage(scope);
  const made = await scope.tx.select({
    id: microSegments.id, name: microSegments.name, theme: microSegments.theme, why: microSegments.why, origin: microSegments.origin, status: microSegments.status,
    mergedInto: microSegments.mergedInto, formerNames: microSegments.formerNames, createdAt: microSegments.createdAt, decidedAt: microSegments.decidedAt,
    createdBy: nameOf(microSegments.createdBy), decidedBy: nameOf(microSegments.decidedBy),
  }).from(microSegments).where(eq(microSegments.businessUnitId, scope.ctx.businessUnitId));
  const into = new Map(made.map(m => [m.id, m.name]));
  const rules: SegmentRow[] = Object.keys(CONFIG.segmentLibrary).map(name => ({
    id: null, name, theme: name, why: 'One of the rules’ starting segments: used when the AI is off or fails its checks', origin: 'rules', status: 'approved', mergedInto: null,
    createdBy: null, createdAt: null, decidedBy: null, decidedAt: null, formerNames: [], ...(used.get(name.toLowerCase()) ?? { accounts: 0, lists: 0, waiting: 0 }),
  }));
  const order: Record<string, number> = { waiting: 0, approved: 1, retired: 2 };
  const others = made.map((m): SegmentRow => ({ ...m, origin: m.origin as 'ai' | 'person', status: m.status as SegmentStatus, mergedInto: m.mergedInto ? into.get(m.mergedInto) ?? null : null,
    ...(used.get(m.name.toLowerCase()) ?? { accounts: 0, lists: 0, waiting: 0 }) }))
    .sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  return [...rules, ...others];
}

/** The name each former name now goes by, for builds made before a rename or a merge. */
export async function currentNames(scope: TenantScope): Promise<Map<string, string>> {
  const rows = await scope.tx.select({ name: microSegments.name, former: microSegments.formerNames }).from(microSegments)
    .where(and(eq(microSegments.businessUnitId, scope.ctx.businessUnitId), sql`cardinality(${microSegments.formerNames}) > 0`));
  return new Map(rows.flatMap(r => r.former.map(f => [f.toLowerCase(), r.name] as [string, string])));
}

export type SegmentDecision = { action: 'approve' | 'retire' | 'restore' } | { action: 'rename'; name: string } | { action: 'merge'; into: string };

/** Moves a segment's items to another name: those it formed in, and those a person assigned to it. */
async function moveItems(scope: TenantScope, from: string, to: string): Promise<number> {
  const bu = scope.ctx.businessUnitId;
  const a = await scope.tx.update(recommendations).set({ segment: to }).where(and(eq(recommendations.businessUnitId, bu), sql`lower(${recommendations.segment}) = ${from.toLowerCase()}`)).returning({ id: recommendations.id });
  const b = await scope.tx.update(recommendations).set({ assignedSegment: to }).where(and(eq(recommendations.businessUnitId, bu), sql`lower(${recommendations.assignedSegment}) = ${from.toLowerCase()}`)).returning({ id: recommendations.id });
  return new Set([...a, ...b].map(r => r.id)).size;
}

const RULE_NAMES = new Set(Object.keys(CONFIG.segmentLibrary).map(n => n.toLowerCase()));

export async function decideSegment(scope: TenantScope, actor: Actor, id: string, input: SegmentDecision,
  onApproved?: (scope: TenantScope, actor: Actor, name: string) => Promise<number>): Promise<{ message: string }> {
  if (!isManager(actor.role)) throw forbidden('Only the sales manager or an Admin can decide on micro-segments.');
  const [seg] = await scope.tx.select().from(microSegments).where(and(eq(microSegments.id, id), eq(microSegments.businessUnitId, scope.ctx.businessUnitId))).for('update');
  if (!seg) throw notFound('That micro-segment is not there any more.');
  const decided = { decidedAt: sql`now()`, decidedBy: actor.userId, updatedAt: sql`now()`, updatedBy: actor.userId };
  let message: string, details: Record<string, unknown> = { name: seg.name };
  if (input.action === 'approve') {
    if (seg.status !== 'waiting') throw conflict(`${seg.name} is not waiting for approval.`);
    await scope.tx.update(microSegments).set({ status: 'approved', ...decided }).where(eq(microSegments.id, id));
    const released = onApproved ? await onApproved(scope, actor, seg.name) : 0;
    message = `${seg.name} approved${released ? `: ${released} item${released === 1 ? '' : 's'} that waited only for it went ahead` : ''}.`;
    details = { ...details, released };
  } else if (input.action === 'retire' || input.action === 'restore') {
    if (input.action === 'retire' && seg.status === 'retired') throw conflict(`${seg.name} is already retired.`);
    if (input.action === 'restore' && (seg.status !== 'retired' || seg.mergedInto)) throw conflict(seg.mergedInto ? `${seg.name} was merged: its items are in the other segment.` : `${seg.name} is not retired.`);
    await scope.tx.update(microSegments).set({ status: input.action === 'retire' ? 'retired' : 'approved', ...decided }).where(eq(microSegments.id, id));
    message = input.action === 'retire' ? `${seg.name} retired: new lists won't use it; its items stay where they are.` : `${seg.name} is approved again.`;
  } else if (input.action === 'rename') {
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 60) throw badRequest('Give it a name of 2 to 60 characters.', { name: ['Give it a name of 2 to 60 characters.'] });
    if (name.toLowerCase() === seg.name.toLowerCase()) throw conflict('That is already its name.');
    const [taken] = await scope.tx.select({ id: microSegments.id }).from(microSegments)
      .where(and(eq(microSegments.businessUnitId, scope.ctx.businessUnitId), sql`lower(${microSegments.name}) = ${name.toLowerCase()}`));
    if (taken || RULE_NAMES.has(name.toLowerCase())) throw conflict(`There is already a micro-segment called "${name}". Merge into it instead.`);
    await scope.tx.update(microSegments).set({ name, formerNames: sql`array_append(${microSegments.formerNames}, ${seg.name.toLowerCase()})`, updatedAt: sql`now()`, updatedBy: actor.userId })
      .where(eq(microSegments.id, id));
    const moved = await moveItems(scope, seg.name, name);
    message = `Renamed ${seg.name} to ${name}${moved ? ` (${moved} item${moved === 1 ? '' : 's'} moved with it)` : ''}.`;
    details = { ...details, to: name, moved };
  } else {
    if (input.action !== 'merge') throw badRequest('Not a decision on a micro-segment.');
    const into = input.into;
    const [target] = await scope.tx.select().from(microSegments)
      .where(and(eq(microSegments.businessUnitId, scope.ctx.businessUnitId), or(eq(sql`${microSegments.id}::text`, into), sql`lower(${microSegments.name}) = ${into.toLowerCase()}`)));
    const toRules = !target && RULE_NAMES.has(into.toLowerCase());
    if (!target && !toRules) throw notFound('Pick the micro-segment to merge it into.');
    if (target?.id === id) throw conflict('A micro-segment can’t be merged into itself.');
    if (target && target.status === 'retired') throw conflict(`${target.name} is retired: restore it first, or pick another.`);
    const toName = target ? target.name : Object.keys(CONFIG.segmentLibrary).find(n => n.toLowerCase() === into.toLowerCase())!;
    await scope.tx.update(microSegments).set({ status: 'retired', mergedInto: target?.id ?? null, ...decided }).where(eq(microSegments.id, id));
    if (target) await scope.tx.update(microSegments).set({ formerNames: sql`${microSegments.formerNames} || ${[seg.name.toLowerCase(), ...seg.formerNames]}::text[]`, updatedAt: sql`now()`, updatedBy: actor.userId })
      .where(eq(microSegments.id, target.id));
    const moved = await moveItems(scope, seg.name, toName);
    message = `${seg.name} merged into ${toName}${moved ? `: ${moved} item${moved === 1 ? '' : 's'} moved` : ''}.`;
    details = { ...details, into: toName, moved };
  }
  await recordAudit(scope, { action: `segment.${input.action}`, actorRole: actor.role, targetType: 'micro_segment', targetId: id, details });
  logger.info({ event: `segment.${input.action}`, segmentId: id }, message);
  return { message };
}

/** The unit's segments by status, for the AI and the build: approved and waiting ones, lower-case name → row. */
export async function knownSegments(scope: TenantScope) {
  const rows = await scope.tx.select({ id: microSegments.id, name: microSegments.name, theme: microSegments.theme, why: microSegments.why, origin: microSegments.origin, status: microSegments.status })
    .from(microSegments).where(and(eq(microSegments.businessUnitId, scope.ctx.businessUnitId), inArray(microSegments.status, ['waiting', 'approved'])));
  return rows;
}

/** Names of new segments still waiting for a manager's approval (lower case). */
export async function waitingSegmentNames(scope: TenantScope): Promise<Set<string>> {
  const rows = await scope.tx.select({ name: microSegments.name }).from(microSegments)
    .where(and(eq(microSegments.businessUnitId, scope.ctx.businessUnitId), eq(microSegments.status, 'waiting')));
  return new Set(rows.map(r => r.name.toLowerCase()));
}
