// For Review on the server (G-008; legacy 14-review.html and demandai-nba.js): what the system could not decide alone
// waits in the owning rep's queue, sensitive content waits for the sales manager, and every decision is made one item
// at a time and written to the append-only decision log, with how long it took, its place in the queue and the
// integrity flags. The weekly spot-check draw, hold and send back, versioned edits, the reasons fixed on the account,
// R-codes with their follow-ups (R3 added, D-18) and the exports (through the neutralising CSV writer, G-052).
import 'server-only';
import { randomInt } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { CONFIG, toCSV, type CsvText } from '../../demandai-engine.ts';
import { briefFor, callScript, type Draft, type Rec } from '../../engine/nba.ts';
import * as R from '../../engine/review.ts';
import { customSegments, decisionLog, drafts, nbaRuns, recommendations, reviewViews, SYSTEM_USER_ID, spotChecks, users } from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { badRequest, conflict, forbidden } from '../http/errors.ts';
import { logger } from '../logger.ts';
import { chunks, containsPattern, isManager, ownerOnly, type Actor } from './lists.ts';
import {
  addDraftVersion, checkDateOf, checkedSql, loadItem, logFacts, logItem, optionFacts, pausedSegments, redraft, segKey, segmentChoices, stateOf, statePatch,
  type Item, type LogInput, type RecRow, type SegmentChoice,
} from './recommendations.ts';
import { ownerNames, unitReps } from './users.ts';
import { activeValidation } from './measures.ts';

const byName = sql<string>`coalesce(${users.displayName}, 'A former member')`;

/* ─── Step 2 · The weekly spot-check draw ─── */

/** The ISO week of a date (UTC), as 2026-W43. */
export function isoWeek(t: Date): string {
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const w1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return d.getUTCFullYear() + '-W' + String(1 + Math.round(((+d - +w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0');
}

/** Once per week per owner, the first time that week For Review is opened by someone who can see the owner's items:
 *  a random share of what went ahead on its own since the last draw goes back to the rep to rate. Every eligible item
 *  is marked with the week, so it is never drawn twice. */
export async function drawSpotChecks(scope: TenantScope, actor: Actor, now = new Date()): Promise<{ week: string; picked: number }> {
  const week = isoWeek(now);
  const share = (await activeValidation(scope)).settings.spotCheckShare;
  const eligible = await scope.tx.select({ id: recommendations.id, ownerEmail: recommendations.ownerEmail, runId: recommendations.nbaRunId, segment: recommendations.segment })
    .from(recommendations).where(and(eq(recommendations.businessUnitId, scope.ctx.businessUnitId), ownerOnly(scope, recommendations.ownerEmail),
      eq(recommendations.passed, true), eq(recommendations.released, 'auto'), eq(recommendations.status, 'Released'), isNull(recommendations.spotWeek)));
  if (!eligible.length) return { week, picked: 0 };
  const paused = new Map<string, Set<string>>();
  for (const runId of new Set(eligible.map(e => e.runId))) paused.set(runId, new Set((await pausedSegments(scope, runId)).keys()));
  const byOwner = new Map<string, string[]>();
  for (const e of eligible) {
    if (paused.get(e.runId)!.has(e.segment || '')) continue;
    const o = e.ownerEmail || '';
    if (!byOwner.has(o)) byOwner.set(o, []);
    byOwner.get(o)!.push(e.id);
  }
  let total = 0;
  for (const [ownerEmail, ids] of byOwner) {
    const order = ids.map(id => [randomInt(1 << 30), id] as const).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    const n = Math.max(1, Math.round(ids.length * share));
    const picked = order.slice(0, n);
    const [drawn] = await scope.tx.insert(spotChecks).values({ businessUnitId: scope.ctx.businessUnitId, isoWeek: week, ownerEmail, eligible: ids.length, picked, createdBy: actor.userId })
      .onConflictDoNothing().returning({ id: spotChecks.id });
    if (!drawn) continue;      // this owner's week was drawn already
    for (const part of chunks(ids, 500)) await scope.tx.update(recommendations).set({ spotWeek: week }).where(inArray(recommendations.id, part));
    await scope.tx.update(recommendations).set({ spot: 'pending', routedAt: now }).where(inArray(recommendations.id, picked));
    for (const id of picked) {
      const item = await loadItem(scope, id);
      await logItem(scope, item, 'System', { decision: 'Picked for the weekly spot-check', note: week });
    }
    total += picked.length;
  }
  if (total) logger.info({ event: 'review.spot_checks_drawn', week, picked: total }, 'Weekly spot-checks drawn');
  return { week, picked: total };
}

/* ─── The queue ─── */

export type QueueRow = {
  id: string; runId: string; runName: string; contact: { name: string; jobTitle: string }; account: { name: string };
  chosenAction: string; channel: string; segment: string; formedSegment: string | null; status: string; spot: string | null; why: string | null;
  released: string | null; outcome: string | null; hold: { why: string; note: string | null } | null; ownerEmail: string | null; ownerName: string | null;
  routedAt: Date; cats: string[]; stuck: R.Stuck; paused: boolean;
};

function rowItem(row: RecRow, d: { draft: unknown; checks: unknown }, runName: string) {
  return { rec: row.rec as Rec, state: stateOf(row), draft: d.draft as Draft, checks: d.checks as Item['draft']['checks'], runName };
}

/** What needs a person: in a queue (waiting, or a spot-check to rate) or waiting for a manager's approval. */
export const needsPersonSql = or(inArray(recommendations.status, ['Waiting', 'Awaiting approval']), eq(recommendations.spot, 'pending'));

/** The rows a filter picks among the recommendations the caller can see, each with why it needs a person, what is
 *  stuck, and whether its micro-segment is paused. */
export async function queueRows(scope: TenantScope, where: SQL | undefined): Promise<QueueRow[]> {
  const visible = and(eq(recommendations.businessUnitId, scope.ctx.businessUnitId), ownerOnly(scope, recommendations.ownerEmail));
  const rows = await scope.tx.select({ row: recommendations, draft: drafts.draft, checks: drafts.checks, runName: nbaRuns.name })
    .from(recommendations).innerJoin(drafts, and(eq(drafts.recommendationId, recommendations.id), eq(drafts.version, recommendations.draftVersion)))
    .innerJoin(nbaRuns, eq(nbaRuns.id, recommendations.nbaRunId))
    .where(and(visible, where));
  const pausedBy = new Map<string, Set<string>>();
  for (const runId of new Set(rows.map(r => r.row.nbaRunId))) pausedBy.set(runId, new Set((await pausedSegments(scope, runId)).keys()));
  const names = await ownerNames(scope, rows.map(r => r.row.ownerEmail ?? ''));
  return rows.map(({ row, draft, checks, runName }): QueueRow => {
    const x = rowItem(row, { draft, checks }, runName);
    const reasons = R.exceptionReasons(R.liveRec(x.rec, x.state), x.draft, x.checks);
    const cats = R.reasonCats(x.state, { reasons, unreachable: x.draft.unreachable });
    const c = R.liveRec(x.rec, x.state).contact;
    return {
      id: row.id, runId: row.nbaRunId, runName, contact: { name: c.name, jobTitle: c.jobTitle || '' }, account: { name: x.rec.account.name },
      chosenAction: R.chosenAction(x.rec, x.state), channel: x.draft.channel, segment: R.segOf(x.rec, x.state), formedSegment: row.segment, status: row.status, spot: row.spot,
      why: row.why, released: row.released, outcome: row.outcome, hold: row.holdWhy ? { why: row.holdWhy, note: row.holdNote } : null,
      ownerEmail: row.ownerEmail, ownerName: row.ownerEmail ? names.get(row.ownerEmail) ?? null : null, routedAt: row.routedAt,
      cats, stuck: R.stuck(x.rec, x.state, x.draft, x.checks, cats), paused: pausedBy.get(row.nbaRunId)!.has(row.segment || ''),
    };
  });
}

/** Everything in For Review the caller can see: their queue (exceptions, spot-checks, alternatives, items sent back or
 *  stepped into), what waits for a manager's approval, and the measures behind the tiles. Opening the queue draws the
 *  week's spot-checks and starts the clock for decisions made from a row. */
export async function reviewQueue(scope: TenantScope, actor: Actor) {
  await drawSpotChecks(scope, actor);
  const [shown] = await scope.tx.insert(reviewViews).values({ businessUnitId: scope.ctx.businessUnitId, userId: actor.userId })
    .onConflictDoUpdate({ target: [reviewViews.businessUnitId, reviewViews.userId], set: { shownAt: sql`now()` } }).returning({ shownAt: reviewViews.shownAt });
  const items = await queueRows(scope, needsPersonSql);
  const visible = and(eq(recommendations.businessUnitId, scope.ctx.businessUnitId), ownerOnly(scope, recommendations.ownerEmail));
  const all = await scope.tx.select({ passed: recommendations.passed, status: recommendations.status, outcome: recommendations.outcome }).from(recommendations).where(visible);
  const logs = await logFacts(scope, { ownerEmails: scope.ctx.scope === 'own' ? scope.ctx.ownerEmails : undefined });
  const measure = R.measure(all, logs, (await activeValidation(scope)).settings.g1BaselineMinutes);
  return {
    items, shownAt: shown.shownAt, total: all.length, released: all.filter(x => x.status === 'Released').length, auto: all.filter(x => x.passed).length,
    measure, reps: isManager(actor.role) ? await unitReps(scope) : [],
  };
}

/* ─── Deciding one item ─── */

async function itemForChange(scope: TenantScope, id: string, opts: { need: 'decide' | 'approve' | 'released' | 'any' }): Promise<Item> {
  const item = await loadItem(scope, id, { lock: true });
  if ((await pausedSegments(scope, item.run.id)).has(segKey(item.rec))) throw conflict('Its micro-segment is paused: nothing can be used or decided until it is resumed.');
  if (opts.need === 'decide' && !R.inQueue(item.state)) throw conflict('It is not waiting for a decision any more. Reload to see where it is now.');
  if (opts.need === 'approve' && item.state.status !== 'Awaiting approval') throw conflict('It is not waiting for approval any more. Reload to see where it is now.');
  if (opts.need === 'released' && item.state.status !== 'Released') throw conflict('It has not been released.');
  return item;
}

type Extra = Partial<Pick<RecRow, 'segmentAt' | 'holdNote' | 'holdAt' | 'holdBy' | 'decidedAt' | 'decidedBy' | 'approvedBy' | 'edited' | 'editRating' | 'routedAt' | 'ownerEmail'>>;

async function setState(scope: TenantScope, item: Item, actor: Actor, patch: Partial<R.RecState>, extra: Extra = {}): Promise<void> {
  await scope.tx.update(recommendations).set({ ...statePatch(patch), ...extra, updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(recommendations.id, item.row.id));
  item.state = { ...item.state, ...patch };
  item.row = { ...item.row, ...statePatch(patch), ...extra } as RecRow;
}

/** How long the decision took: from when the caller opened the item, or was last shown their queue, whichever is later
 *  (both by the database's clock). */
async function timing(scope: TenantScope, item: Item, actor: Actor): Promise<{ start: Date | null; seconds: number | null }> {
  const opened = item.row.openedBy === actor.userId ? item.row.openedAt : null;
  const { rows } = await scope.tx.execute<{ start: Date | null; seconds: number | null }>(sql`
    select s.start, floor(extract(epoch from now() - s.start))::int as seconds from (
      select greatest(${opened ? opened.toISOString() : null}::timestamptz,
        (select shown_at from review_views where business_unit_id = ${scope.ctx.businessUnitId} and user_id = ${actor.userId})) as start) s`);
  return { start: rows[0].start ? new Date(rows[0].start) : null, seconds: rows[0].seconds === null ? null : Number(rows[0].seconds) };
}

/** A decisive entry: accept or reject, with what the measures need and the integrity flags. */
async function logDecisive(scope: TenantScope, item: Item, actor: Actor, entry: LogInput, opts: { queuePosition?: number }): Promise<{ id: string; flag: string }> {
  const t = await timing(scope, item, actor);
  const recent = await scope.tx.select({ decision: decisionLog.decision }).from(decisionLog)
    .where(and(eq(decisionLog.businessUnitId, scope.ctx.businessUnitId), eq(decisionLog.createdBy, actor.userId), eq(decisionLog.decisive, true)))
    .orderBy(desc(decisionLog.seq)).limit(4);
  const flag = R.integrityFlag(t.seconds, entry.decision, recent.map(r => r.decision));
  const id = await logItem(scope, item, actor, { ...entry, decisive: true, openedAt: t.start, seconds: t.seconds, queuePosition: opts.queuePosition ?? null, flag: flag || null });
  return { id, flag };
}

/** The rejection an alternative came back from, so the alternative's decision links to it. */
async function lastRejection(scope: TenantScope, item: Item): Promise<string | null> {
  const [r] = await scope.tx.select({ id: decisionLog.id }).from(decisionLog)
    .where(and(eq(decisionLog.recommendationId, item.row.id), eq(decisionLog.decisive, true), eq(decisionLog.accepted, false))).orderBy(desc(decisionLog.seq)).limit(1);
  return r?.id ?? null;
}

export type DraftEdit = { subject?: string; body?: string; note?: string; task?: string };

/** A person's edit becomes a new, rated version before the decision (5.19); unchanged text makes no version. */
async function applyEdit(scope: TenantScope, item: Item, actor: Actor, edit: DraftEdit | undefined, who: string): Promise<{ rating: ReturnType<typeof R.editRating> | null }> {
  if (!edit) return { rating: null };
  const before = item.draft.draft, after = R.withEdits(before, edit);
  if (R.sameDraft(before, after)) return { rating: null };
  const rating = R.editRating(before, after);
  await addDraftVersion(scope, item, after, `${who} (${rating.rating}: ${rating.why})`, actor.userId);
  await setState(scope, item, actor, {}, { edited: true, editRating: rating.rating });
  return { rating };
}

/** G-007: nothing is released to someone who can't be contacted. */
function mustReach(item: Item) {
  if (item.draft.draft.unreachable) throw conflict(`There is no way to reach ${R.liveRec(item.rec, item.state).contact.name} yet: ${item.draft.draft.why} Put it on hold until the data is fixed, or reject it.`);
}

export type AcceptInput = { draft?: DraftEdit; assignedSegment?: string; tags?: string[]; note?: string; queuePosition?: number; fromRow?: boolean };

/** Step 3 · Accept (or rate a spot-check), with any edit rated and versioned first. Sensitive content a rep accepts goes
 *  to the sales manager; anything else is released into its micro-segment. */
export async function acceptItem(scope: TenantScope, actor: Actor, id: string, input: AcceptInput): Promise<{ status: string; message: string; flag: string }> {
  const item = await itemForChange(scope, id, { need: 'decide' });
  const manager = isManager(actor.role);
  const kind = R.kindOfItem(item.state), firstPass = kind === 'exception' || kind === 'spot';
  if (!item.rec.segment && item.state.spot !== 'pending') {
    const asked = input.assignedSegment || item.state.assignedSegment;
    if (!asked) throw badRequest('Assign a micro-segment first: it is released into that micro-segment.', { assignedSegment: ['Pick a micro-segment.'] });
    const pick = (await choiceFor(scope, item, asked, 'assignedSegment')).name;
    if (pick !== item.state.assignedSegment) {
      await setState(scope, item, actor, { assignedSegment: pick }, { segmentAt: new Date() });
      await logItem(scope, item, actor, { decision: `Assigned to the ${pick} micro-segment`, note: 'It had no micro-segment of its own' });
    }
  }
  const { rating } = await applyEdit(scope, item, actor, input.draft, 'Edited before accepting');
  mustReach(item);
  const sensitive = R.isSensitive(item.draft.checks);
  const label = rating ? `Accepted with a ${rating.rating} edit` : 'Accepted';
  const now = new Date();
  let status: string, message: string;
  if (kind === 'spot' && sensitive && !manager) {
    // A spot-check went out on its own, so it had nothing sensitive: the rep's edit added it. Rated, and held for the manager.
    await setState(scope, item, actor, { spot: 'accepted', status: 'Awaiting approval', released: null }, { decidedAt: now, decidedBy: actor.userId });
    status = 'Awaiting approval'; message = 'Spot-check rated. Your edit adds sensitive content, so it goes to the sales manager for approval';
  } else if (kind === 'spot') { await setState(scope, item, actor, { spot: 'accepted' }); status = 'Released'; message = 'Spot-check rated and logged'; }
  else if (sensitive && !manager) {
    await setState(scope, item, actor, { status: 'Awaiting approval', holdWhy: null }, { decidedAt: now, decidedBy: actor.userId, holdNote: null, holdAt: null, holdBy: null });
    status = 'Awaiting approval'; message = 'Accepted: sensitive content goes to the sales manager for approval';
  } else {
    await setState(scope, item, actor, { status: 'Released', released: 'accepted', holdWhy: null }, { decidedAt: now, decidedBy: actor.userId, holdNote: null, holdAt: null, holdBy: null });
    status = 'Released'; message = 'Accepted and released';
  }
  const { flag } = await logDecisive(scope, item, actor, {
    decision: label, kind, firstPass, accepted: true, editRating: rating ? rating.rating : 'none', tags: (input.tags ?? []).filter(t => R.ACCEPT_TAGS.includes(t)),
    linkedTo: kind === 'alternative' ? await lastRejection(scope, item) : null,
    note: [rating ? `${rating.rating} edit: ${rating.why}` : '', R.cleanNote(input.note, 500), kind === 'spot' ? 'Spot-check rating' : '',
      sensitive && !manager ? 'Sensitive: sent to the sales manager for approval' : '', input.fromRow ? 'From the queue row' : ''].filter(Boolean).join(' · '),
  }, input);
  logger.info({ event: 'review.accepted', recommendationId: id, kind, status, flagged: !!flag }, 'Recommendation accepted');
  return { status, message, flag };
}

export type RejectInput = { code: string; note?: string; tags?: string[]; queuePosition?: number; fromRow?: boolean };

/** Step 6 · Reject with a reason; the reason decides what comes back (one alternative) or where the account goes. */
export async function rejectItem(scope: TenantScope, actor: Actor, id: string, input: RejectInput): Promise<{ status: string; outcome: string; message: string; flag: string }> {
  const entry = R.REJECT.find(x => x[0] === input.code);
  if (!entry) throw badRequest('Pick a reason.', { code: ['Pick one of the reasons.'] });
  const note = R.cleanNote(input.note, 500);
  if (input.code === 'R12' && !note) throw badRequest('"Other" needs a comment.', { note: ['Say why.'] });
  const item = await itemForChange(scope, id, { need: 'decide' });
  const [, label] = entry;
  const kind = R.kindOfItem(item.state), linkedTo = kind === 'alternative' ? await lastRejection(scope, item) : null;
  const before = { action: R.chosenAction(item.rec, item.state), channel: item.draft.draft.channel, draftVersion: item.row.draftVersion };
  const follow = R.rejectFollowUp(input.code, item.rec, item.state, item.draft.draft);
  await setState(scope, item, actor, { ...follow.patch, holdWhy: null }, { decidedAt: new Date(), decidedBy: actor.userId, holdNote: null, holdAt: null, holdBy: null,
    ...(follow.patch.status === 'Waiting' ? { routedAt: new Date() } : {}) });
  if (follow.redraft) await redraft(scope, item, follow.redraft, actor.userId);
  const { flag } = await logDecisive(scope, item, actor, {
    decision: `Rejected: ${label}`, reasonCode: input.code, reason: label, cause: R.causeOf(input.code), kind, firstPass: kind === 'exception' || kind === 'spot', accepted: false,
    tags: (input.tags ?? []).filter(t => R.WRONG_TAGS.includes(t)), linkedTo, note: [follow.outcome, note, input.fromRow ? 'From the queue row' : ''].filter(Boolean).join(' · '), ...before,
  }, input);
  if (input.code === 'R3') {
    await recordAudit(scope, { action: 'recommendation.data_flagged', actorRole: actor.role, targetType: 'account', targetId: item.row.accountId,
      details: { recommendationId: id, code: 'R3', reason: 'Wrong company or site' } });
  }
  logger.info({ event: 'review.rejected', recommendationId: id, code: input.code, status: follow.patch.status, flagged: !!flag }, 'Recommendation rejected');
  return { status: follow.patch.status!, outcome: follow.outcome, message: `${label}: ${follow.outcome}`, flag };
}

/** Put on hold: data is missing or someone else has to answer first. It stays in the queue, at the end. */
export async function holdItem(scope: TenantScope, actor: Actor, id: string, input: { why: string; note?: string } | null): Promise<void> {
  const item = await itemForChange(scope, id, { need: 'decide' });
  if (input) {
    if (!R.HOLD_WHY.includes(input.why)) throw badRequest('Say why it waits.', { why: ['Pick one of the reasons.'] });
    if (item.state.holdWhy) throw conflict('It is already on hold.');
    const note = R.cleanNote(input.note, 300);
    await setState(scope, item, actor, { holdWhy: input.why }, { holdNote: note || null, holdAt: new Date(), holdBy: actor.userId });
    await logItem(scope, item, actor, { decision: 'Put on hold', note: [input.why, note].filter(Boolean).join(' · ') });
  } else {
    if (!item.state.holdWhy) throw conflict('It is not on hold.');
    await setState(scope, item, actor, { holdWhy: null }, { holdNote: null, holdAt: null, holdBy: null });
    await logItem(scope, item, actor, { decision: 'Taken off hold' });
  }
}

/** The recommended action, the runner-up, or the reviewer's own. After release, only the rep may switch between the
 *  first two, and only to one that passes every check; that counts as stepping in. */
export async function chooseAction(scope: TenantScope, actor: Actor, id: string, input: { use: 'recommended' | 'runner-up' | 'own'; text?: string }): Promise<{ message: string }> {
  const item = await itemForChange(scope, id, { need: 'any' });
  const decide = R.inQueue(item.state), afterRelease = item.state.status === 'Released' && item.state.spot !== 'pending';
  if (!decide && !(afterRelease && !item.state.outcome)) throw conflict('Its action can no longer be changed.');
  if (input.use === 'own') {
    if (!decide) throw conflict('A released message can only be switched to the recommended action or the runner-up. Step in to change it more.');
    const text = R.cleanNote(input.text, 300);
    if (!text) throw badRequest('Write the action first.', { text: ['Write the action.'] });
    await setState(scope, item, actor, { manualAction: text }, { edited: false });
    await redraft(scope, item, 'Manual action added', actor.userId);
    await logItem(scope, item, actor, { decision: 'Added a manual action', note: text });
    return { message: 'Your action is used: the message is redrafted for it' };
  }
  const runner = input.use === 'runner-up';
  if (runner && !item.rec.runnerUp) throw badRequest('There is no runner-up for this one.');
  if (!item.state.manualAction && item.state.useRunnerUp === runner) throw conflict(`The ${runner ? 'runner-up' : 'recommended action'} is already chosen.`);
  const to = runner ? 'runner-up' : 'recommended';
  if (afterRelease) {
    const f = optionFacts(item, runner ? item.rec.runnerUp!.action : item.rec.action, '');
    if (!f.ok) throw conflict(`The ${to} fails ${f.flags.join(', ').toLowerCase()}, so it can't replace a released message. Step in to edit or reject instead.`);
  }
  const wasManual = !!item.state.manualAction;
  await setState(scope, item, actor, { manualAction: null, useRunnerUp: runner }, { edited: false });
  await redraft(scope, item, wasManual ? (runner ? 'Switched to the runner-up' : 'Back to the recommended action') : `Swapped to the ${to}`, actor.userId);
  await logItem(scope, item, actor, { decision: `Swapped to the ${to} action`, ...(afterRelease ? { intervention: true, note: 'After release: the rep switched the action before using it' } : {}) });
  return { message: afterRelease ? `Switched to the ${to}; the message is redrafted and the change is logged` : `The ${to} is chosen: the message is redrafted for it` };
}

export type FixInput = { kind: 'low' | 'deal' | 'small'; contactRow?: number; segment?: string; create?: { name: string; also?: string[] } };

/** The micro-segment a person picked for an item with none, if it is one it may join (segmentChoices). */
async function choiceFor(scope: TenantScope, item: Item, name: string | undefined, field: string): Promise<SegmentChoice> {
  const want = (name ?? '').trim().toLowerCase();
  const c = want ? (await segmentChoices(scope, item.rec.prominent)).find(x => x.name.toLowerCase() === want) : undefined;
  if (!c) throw badRequest(want ? `"${name!.trim()}" is not a micro-segment it can join: pick one with an approved message, or create one.` : 'Pick a micro-segment.', { [field]: ['Pick a micro-segment.'] });
  return c;
}

/** A person's own micro-segment for an item the system could not group: it may hold fewer than
 *  CONFIG.minSegmentAccounts accounts, follows the theme of the item's message, and stays for later lists in the unit.
 *  Its name is unique in the unit and never one of the system's. */
async function createSegment(scope: TenantScope, actor: Actor, item: Item, raw: string): Promise<SegmentChoice> {
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (name.length < 3 || name.length > 60) throw badRequest('Give the micro-segment a name of 3 to 60 characters.', { name: ['3 to 60 characters.'] });
  if ([...Object.keys(CONFIG.segmentLibrary), 'No micro-segment'].some(x => x.toLowerCase() === name.toLowerCase())) {
    throw badRequest(`"${name}" is the name of one of the system's micro-segments: pick it from the list, or choose another name.`, { name: ['Choose another name.'] });
  }
  const theme = item.rec.prominent;
  const [row] = await scope.tx.insert(customSegments).values({ businessUnitId: scope.ctx.businessUnitId, name, theme, createdBy: actor.userId })
    .onConflictDoNothing().returning({ id: customSegments.id });
  if (!row) throw conflict(`There is already a micro-segment called "${name}": pick it from the list.`);
  await recordAudit(scope, { action: 'nba.segment_created', actorRole: actor.role, targetType: 'custom_segment', targetId: row.id, details: { name, theme } });
  logger.info({ event: 'nba.segment_created', customSegmentId: row.id, theme }, 'Micro-segment created by a person');
  return { name, theme, origin: 'person', approved: 0, by: null };
}

/** A reason fixed by a person's call on the account: the contact is right (or switched), the deal is worth it, the
 *  micro-segment is set. Logged, and the reason drops out of why it needs a person. */
export async function fixItem(scope: TenantScope, actor: Actor, id: string, input: FixInput): Promise<void> {
  const item = await itemForChange(scope, id, { need: 'decide' });
  const fixed = [...new Set([...item.state.fixed, input.kind])];
  let note = '';
  if (input.kind === 'low') {
    if (input.contactRow !== undefined) {
      const p = (item.rec.result.people || []).find(z => z.contact.row === input.contactRow);
      if (!p) throw badRequest('That person is not at this account.');
      if (p.contact.optOut) throw badRequest(`${p.contact.name} has opted out.`);
      await setState(scope, item, actor, { contactRow: input.contactRow, channelPref: null, fixed }, { edited: false });
      await redraft(scope, item, `Switched to ${p.contact.name}`, actor.userId);
      note = 'Switched to ' + p.contact.name;
    } else {
      await setState(scope, item, actor, { fixed });
      note = `${R.liveRec(item.rec, item.state).contact.firstName || R.liveRec(item.rec, item.state).contact.name} is the right person`;
    }
  } else if (input.kind === 'small') {
    if (item.rec.segment) throw badRequest(`It is already in the ${item.rec.segment} micro-segment.`);
    // Check the other items before creating anything, so a refusal leaves no micro-segment behind.
    const also = input.create ? await joining(scope, item, input.create.also ?? []) : [];
    const seg = input.create ? await createSegment(scope, actor, item, input.create.name) : await choiceFor(scope, item, input.segment, 'segment');
    await setState(scope, item, actor, { assignedSegment: seg.name, fixed }, { segmentAt: new Date() });
    note = input.create ? `Created the micro-segment ${seg.name} (${seg.theme} theme) and put it there` : 'Micro-segment: ' + seg.name;
    for (const o of also) {
      await setState(scope, o, actor, { assignedSegment: seg.name, fixed: [...new Set([...o.state.fixed, 'small'])] }, { segmentAt: new Date() });
      await logItem(scope, o, actor, { decision: 'Fixed: ' + R.REASON_CATS.small, note: `Micro-segment: ${seg.name}, created for ${item.rec.account.name}` });
    }
  } else {
    await setState(scope, item, actor, { fixed });
    note = 'Worth it anyway';
  }
  await logItem(scope, item, actor, { decision: 'Fixed: ' + (R.REASON_CATS[input.kind] || input.kind), note });
}

/** Other items joining a micro-segment created for this one: the caller's, waiting in the same list, with none of
 *  their own. */
async function joining(scope: TenantScope, item: Item, ids: string[]): Promise<Item[]> {
  const out: Item[] = [];
  for (const id of new Set(ids.filter(x => x !== item.row.id))) {
    const o = await itemForChange(scope, id, { need: 'decide' });
    if (o.run.id !== item.run.id || o.rec.segment) throw badRequest(`${o.rec.account.name} can't join it: only items in the same list with no micro-segment of their own can.`);
    out.push(o);
  }
  return out;
}

/** A rep can step in on an item that went ahead on its own: it comes back to their queue as an intervention. */
export async function stepIn(scope: TenantScope, actor: Actor, id: string): Promise<void> {
  const item = await itemForChange(scope, id, { need: 'released' });
  if (item.state.released !== 'auto' || item.state.spot === 'pending') throw conflict('Only an item that went ahead on its own can be stepped into.');
  await setState(scope, item, actor, { status: 'Waiting', why: 'stepped in', spot: null }, { routedAt: new Date() });
  await logItem(scope, item, actor, { decision: 'Stepped in', note: 'Opened an item that proceeded, to edit or reject', kind: 'intervention', intervention: true });
}

/** Teach the system: what it got right or wrong, for the learning loop. Optional, after a decision. */
export async function teach(scope: TenantScope, actor: Actor, id: string, input: { tags?: string[]; note?: string }): Promise<void> {
  const item = await loadItem(scope, id);
  const tags = (input.tags ?? []).filter(t => R.ACCEPT_TAGS.includes(t) || R.WRONG_TAGS.includes(t));
  const note = R.cleanNote(input.note, 500);
  if (!tags.length && !note) throw badRequest('Pick what it got right or wrong, or write a note.');
  await logItem(scope, item, actor, { decision: 'Taught the system', note, tags });
}

/** Step 5 · The sales manager approves a sensitive item (any edit saved, rated and versioned first) and it is released. */
export async function approveItem(scope: TenantScope, actor: Actor, id: string, input: { draft?: DraftEdit; tags?: string[] }): Promise<{ message: string }> {
  requireManager(actor);
  const item = await itemForChange(scope, id, { need: 'approve' });
  await applyEdit(scope, item, actor, input.draft, 'Edited by the sales manager before approving');
  mustReach(item);
  await setState(scope, item, actor, { status: 'Released', released: 'approved' }, { decidedAt: new Date(), decidedBy: actor.userId, approvedBy: actor.userId });
  await logItem(scope, item, actor, { decision: 'Approved and released', note: 'Sensitive content approved', tags: (input.tags ?? []).filter(t => R.ACCEPT_TAGS.includes(t)) });
  logger.info({ event: 'review.approved', recommendationId: id }, 'Sensitive item approved');
  return { message: 'Approved and released' };
}

/** The sales manager sends a sensitive item back to the rep with what should change. */
export async function sendBack(scope: TenantScope, actor: Actor, id: string, note: string): Promise<void> {
  requireManager(actor);
  const item = await itemForChange(scope, id, { need: 'approve' });
  const text = R.cleanNote(note, 500);
  if (!text) throw badRequest('Say what should change.', { note: ['Say what should change.'] });
  await setState(scope, item, actor, { status: 'Waiting', why: 'sent back', sentBackNote: text }, { routedAt: new Date() });
  await logItem(scope, item, actor, { decision: 'Sent back to the rep', note: text, cause: 'compliance', compliance: true });
}

/** Step 10 · A manager moves an item to another rep's queue ('' leaves it unassigned: managers only). */
export async function reassign(scope: TenantScope, actor: Actor, id: string, ownerEmail: string): Promise<{ owner: string | null }> {
  requireManager(actor);
  const item = await itemForChange(scope, id, { need: 'any' });
  const to = ownerEmail.trim().toLowerCase() || null;
  if (to && !(await unitReps(scope)).some(r => r.email === to)) throw badRequest('Pick one of the unit’s sales reps.', { ownerEmail: ['Pick a sales rep.'] });
  if (to === item.row.ownerEmail) throw conflict('It is already theirs.');
  const names = await ownerNames(scope, [to ?? '', item.row.ownerEmail ?? '']);
  const nameOf = (e: string | null) => (e ? names.get(e) ?? e : 'Unassigned');
  const from = item.row.ownerEmail;
  await setState(scope, item, actor, {}, { ownerEmail: to });
  await logItem(scope, item, actor, { decision: `Reassigned to ${nameOf(to)}`, note: `From ${nameOf(from)}` });
  await recordAudit(scope, { action: 'recommendation.reassigned', actorRole: actor.role, targetType: 'recommendation', targetId: id });
  return { owner: to };
}

/** A flagged decision counts toward G2 only once a manager has checked it: a new row linked to it. */
export async function checkFlagged(scope: TenantScope, actor: Actor, logId: string): Promise<void> {
  requireManager(actor);
  const [l] = await scope.tx.select({ id: decisionLog.id, recommendationId: decisionLog.recommendationId, flag: decisionLog.flag, checked: checkedSql }).from(decisionLog)
    .where(and(eq(decisionLog.id, logId), eq(decisionLog.businessUnitId, scope.ctx.businessUnitId)));
  if (!l) throw badRequest('That decision is not there.');
  if (!l.flag) throw conflict('That decision is not flagged.');
  if (l.checked) throw conflict('That decision has been checked already.');
  const item = await loadItem(scope, l.recommendationId);
  await logItem(scope, item, actor, { decision: 'Flagged decision checked', note: l.flag, kind: 'manager_check', linkedTo: l.id });
}

/* ─── The decision log, and the exports ─── */

export type LogRow = {
  id: string; seq: number; at: Date; who: string; role: string; recommendationId: string; runId: string; prospect: string; company: string; segment: string;
  /** The list (build) the item is in, and the micro-segment it is in now: the one the system formed, or the one a
   *  person picked or created for it (`picked`). '' when it has none. */
  list: string; joined: string; picked: boolean;
  decision: string; kind: string | null; decisive: boolean; firstPass: boolean | null; reason: string; tags: string[]; action: string; channel: string;
  draftVersion: number | null; openedAt: Date | null; seconds: number | null; queuePosition: number | null; flag: string | null; checked: boolean; linkedTo: string; note: string;
};

/** Newest first. Managers see everything; a rep sees the decisions they made themselves. */
export async function decisionLogRows(scope: TenantScope, actor: Actor, query: { flagged?: boolean; q?: string; before?: number; limit?: number }): Promise<{ rows: LogRow[]; next: number | null }> {
  const limit = Math.min(Math.max(1, query.limit ?? 200), 500);
  // An alternative's decision links to the rejection it came back from: "alternative to <that action (channel)>".
  const linked = sql<string>`case when "decision_log"."kind" = 'alternative' then coalesce((select l2.action || ' (' || l2.channel || ')' from decision_log l2 where l2.id = "decision_log"."linked_to"), '') else '' end`;
  const conds: (SQL | undefined)[] = [eq(decisionLog.businessUnitId, scope.ctx.businessUnitId), isManager(actor.role) ? undefined : eq(decisionLog.createdBy, actor.userId),
    query.before ? lt(decisionLog.seq, query.before) : undefined, query.flagged ? and(sql`${decisionLog.flag} is not null`, sql`not ${checkedSql}`) : undefined];
  if (query.q) {
    conds.push(sql`lower(${decisionLog.decision} || ' ' || ${decisionLog.note} || ' ' || ${decisionLog.action} || ' ' || coalesce(${users.displayName}, '') || ' ' ||
      coalesce(${recommendations.rec}->'account'->>'name', '') || ' ' || coalesce(${recommendations.rec}->'contact'->>'name', '')) like ${containsPattern(query.q)}`);
  }
  const rows = await scope.tx.select({
    id: decisionLog.id, seq: decisionLog.seq, at: decisionLog.createdAt, createdBy: decisionLog.createdBy, who: byName, role: decisionLog.actorRole,
    recommendationId: decisionLog.recommendationId, runId: decisionLog.nbaRunId, rec: recommendations.rec, contactRow: decisionLog.contactRow, segment: decisionLog.segment,
    decision: decisionLog.decision, kind: decisionLog.kind, decisive: decisionLog.decisive, firstPass: decisionLog.firstPass, reason: decisionLog.reason, tags: decisionLog.tags,
    action: decisionLog.action, channel: decisionLog.channel, draftVersion: decisionLog.draftVersion, openedAt: decisionLog.openedAt, seconds: decisionLog.seconds,
    queuePosition: decisionLog.queuePosition, flag: decisionLog.flag, checked: checkedSql, linkedTo: linked, note: decisionLog.note,
    list: nbaRuns.name, formed: recommendations.segment, assigned: recommendations.assignedSegment,
  }).from(decisionLog).leftJoin(users, eq(users.id, decisionLog.createdBy)).leftJoin(recommendations, eq(recommendations.id, decisionLog.recommendationId))
    .leftJoin(nbaRuns, eq(nbaRuns.id, decisionLog.nbaRunId))
    .where(and(...conds)).orderBy(desc(decisionLog.seq)).limit(limit + 1);
  const page = rows.slice(0, limit).map(({ rec, contactRow, createdBy, formed, assigned, ...r }) => {
    const re = rec as Rec | null;
    const person = re ? ((re.result.people || []).find(p => p.contact.row === contactRow)?.contact ?? re.contact) : null;
    return { ...r, who: createdBy === SYSTEM_USER_ID ? 'System' : r.who, prospect: person?.name ?? '', company: re?.account.name ?? '',
      list: r.list ?? '', joined: formed || assigned || '', picked: !formed && !!assigned };
  });
  return { rows: page, next: rows.length > limit ? page[page.length - 1].seq : null };
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : '');

/** Step 8 · What was released, as files: messages ready to use, tasks for the team, and the decision log. Each goes
 *  through the CSV writer that neutralises formulas (G-052). */
export async function reviewExport(scope: TenantScope, actor: Actor, kind: 'released-messages' | 'tasks' | 'decision-log'): Promise<{ fileName: string; csv: CsvText; rows: number }> {
  if (kind === 'decision-log') {
    const out: unknown[][] = [['when', 'who', 'role', 'prospect', 'company', 'micro_segment', 'decision', 'item', 'first_pass', 'reason', 'tags', 'action', 'channel', 'version', 'opened_at', 'seconds', 'queue_position', 'flag', 'checked', 'linked_to', 'note', 'list_joined', 'micro_segment_joined']];
    let before: number | undefined, total = 0;
    for (;;) {
      const page = await decisionLogRows(scope, actor, { before, limit: 500 });
      for (const l of page.rows) out.push([iso(l.at), l.who, l.role, l.prospect, l.company, l.segment, l.decision, l.kind || '', l.decisive ? (l.firstPass ? 'yes' : 'no') : '',
        l.reason, l.tags.join('; '), l.action, l.channel, l.draftVersion ?? '', iso(l.openedAt), l.seconds ?? '', l.queuePosition ?? '', l.flag || '', l.flag ? (l.checked ? 'yes' : 'no') : '', l.linkedTo, l.note,
        l.list, l.joined || 'No micro-segment']);
      total += page.rows.length;
      if (page.next === null) break;
      before = page.next;
    }
    await recordAudit(scope, { action: 'review.exported', actorRole: actor.role, details: { kind, rows: total } });
    return { fileName: 'decision_log.csv', csv: toCSV(out), rows: total };
  }
  const rows = await scope.tx.select({ row: recommendations, draft: drafts.draft, runAsOf: nbaRuns.asOf, pack: sql<unknown>`(select pack from brand_versions where id = ${nbaRuns.brandVersionId})`,
    decidedBy: byName }).from(recommendations)
    .innerJoin(drafts, and(eq(drafts.recommendationId, recommendations.id), eq(drafts.version, recommendations.draftVersion)))
    .innerJoin(nbaRuns, eq(nbaRuns.id, recommendations.nbaRunId)).leftJoin(users, eq(users.id, recommendations.decidedBy))
    .where(and(eq(recommendations.businessUnitId, scope.ctx.businessUnitId), ownerOnly(scope, recommendations.ownerEmail), eq(recommendations.status, 'Released'),
      kind === 'tasks' ? eq(drafts.channel, 'Task') : sql`${drafts.channel} <> 'Task'`))
    .orderBy(recommendations.nbaRunId, recommendations.position);
  const names = await ownerNames(scope, rows.map(r => r.row.ownerEmail ?? ''));
  const owner = (e: string | null) => (e ? names.get(e) ?? e : 'Unassigned');
  let out: unknown[][];
  if (kind === 'released-messages') {
    out = [['owner', 'prospect', 'job_title', 'company', 'email', 'linkedin_url', 'micro_segment', 'action', 'channel', 'subject', 'message', 'linkedin_note', 'released', 'released_by', 'released_at', 'outcome']];
    for (const { row, draft, decidedBy } of rows) {
      const rec = row.rec as Rec, st = stateOf(row), c = R.liveRec(rec, st).contact, x = draft as Draft;
      out.push([owner(row.ownerEmail), c.name, c.jobTitle || '', rec.account.name, c.email || '', c.linkedin || '', R.segOf(rec, st) || 'No micro-segment', R.chosenAction(rec, st),
        x.channel, x.subject || '', x.body || '', x.note || '', row.released === 'auto' ? 'On its own' : row.released === 'approved' ? 'Approved by the sales manager' : 'Accepted by the rep',
        row.released === 'auto' ? 'System' : decidedBy, iso(row.decidedAt), row.outcome || '']);
    }
  } else {
    out = [['owner', 'prospect', 'company', 'micro_segment', 'task', 'why', 'call_opener', 'questions', 'objection', 'response', 'ask', 'outcome']];
    for (const { row, draft, runAsOf, pack } of rows) {
      const rec = row.rec as Rec, st = stateOf(row), lr = R.liveRec(rec, st), x = draft as Draft, action = R.chosenAction(rec, st);
      const brand = pack as Parameters<typeof callScript>[3], when = checkDateOf(runAsOf);
      const s = callScript(lr, action, briefFor(lr, action, { asOf: when, brand }).whyNow, brand);
      out.push([owner(row.ownerEmail), lr.contact.name, rec.account.name, R.segOf(rec, st) || 'No micro-segment', x.task || '', x.why || '', s.opener, s.questions.join(' | '), s.objection, s.response, s.ask, row.outcome || '']);
    }
  }
  await recordAudit(scope, { action: 'review.exported', actorRole: actor.role, details: { kind, rows: rows.length } });
  return { fileName: kind === 'tasks' ? 'tasks.csv' : 'released_messages.csv', csv: toCSV(out), rows: rows.length };
}

function requireManager(actor: Actor) {
  if (!isManager(actor.role)) throw forbidden('Only the sales manager can do this.');
}
