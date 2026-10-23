// One recommendation at a time (spec 5.16–5.19, 6.x; legacy demandai-nba.js): its frozen recommendation, the decision
// as it stands, every version of its message and its log. Shared by Micro-segments & NBA (G-006) and For Review
// (G-008). Drafts and checks use the brand pack the micro-segments were built with, as of the build's date or today,
// whichever is later, so a claim that has expired since fails its check (G-009). Owner-scoped twice (G-014): the
// row-level security policies, and the repository filter here.
import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { CONFIG } from '../../demandai-engine.ts';
import {
  approvedClaims, briefFor, checkDraft, confidenceFor, draftFor, estimateDealSize, type BrandPack, type CheckResult, type Claim, type Draft, type NbaContact, type Rec,
} from '../../engine/nba.ts';
import * as R from '../../engine/review.ts';
import { brandVersions, decisionLog, drafts, nbaRuns, recommendations, segmentPauses, SYSTEM_USER_ID, users } from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { conflict, notFound } from '../http/errors.ts';
import { currentLogContext, logger } from '../logger.ts';
import { isManager, ownerOnly, type Actor } from './lists.ts';
import { todayUtc } from './scoring.ts';
import { ownerNames, unitReps } from './users.ts';

export type RecRow = typeof recommendations.$inferSelect;
export type StoredDraft = { version: number; draft: Draft; checks: CheckResult; confidence: { level: string; reason: string }; reason: string; at: Date; by: string };
export type RunInfo = { id: string; name: string; asOf: string; brandVersionId: string; configVersionId: string | null; createdAt: Date; segments: { name: string; accounts: number }[] };
export type Item = { row: RecRow; rec: Rec; state: R.RecState; run: RunInfo; pack: BrandPack; draft: StoredDraft; checkDate: string };

/** Drafts and checks are as of the build's date, or today when that is later (an expired claim fails, G-009). */
export const checkDateOf = (asOf: string): string => (todayUtc() > asOf ? todayUtc() : asOf);

export function stateOf(row: RecRow): R.RecState {
  return {
    status: row.status as R.RecStatus, why: row.why as R.RecState['why'], released: row.released as R.RecState['released'], passed: row.passed,
    reasons: row.reasons, fixed: row.fixed, useRunnerUp: row.useRunnerUp, manualAction: row.manualAction, channelPref: row.channelPref, variant: row.variant,
    contactRow: row.contactRow, assignedSegment: row.assignedSegment, alternativeUsed: row.alternativeUsed, alternativeOf: row.alternativeOf,
    rejectCode: row.rejectCode, sentBackNote: row.sentBackNote, spot: row.spot as R.RecState['spot'], holdWhy: row.holdWhy, outcome: row.outcome as R.Outcome | null,
  };
}

/** The state columns a change touches, from a RecState patch. */
export function statePatch(p: Partial<R.RecState>): Partial<RecRow> {
  const out: Partial<RecRow> = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'passed' || k === 'reasons') continue;            // fixed when the micro-segments were built
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

const byName = sql<string>`coalesce(${users.displayName}, 'A former member')`;
/** A flagged decision counts once a manager has checked it: a later row linked to it. */
export const checkedSql = sql<boolean>`exists (select 1 from decision_log c where c.linked_to = ${decisionLog.id} and c.kind = 'manager_check')`;

export async function runInfo(scope: TenantScope, id: string): Promise<RunInfo & { pack: BrandPack }> {
  const [r] = await scope.tx.select({
    id: nbaRuns.id, name: nbaRuns.name, asOf: nbaRuns.asOf, brandVersionId: nbaRuns.brandVersionId, configVersionId: nbaRuns.configVersionId,
    createdAt: nbaRuns.createdAt, segments: nbaRuns.segments, pack: brandVersions.pack,
  }).from(nbaRuns).innerJoin(brandVersions, eq(brandVersions.id, nbaRuns.brandVersionId))
    .where(and(eq(nbaRuns.id, id), eq(nbaRuns.businessUnitId, scope.ctx.businessUnitId)));
  if (!r) throw notFound('Those micro-segments are not there any more.');
  return { ...r, segments: r.segments as RunInfo['segments'], pack: r.pack as BrandPack };
}

/** A recommendation the caller can see, with everything needed to redraft or decide it. 404 otherwise (no hint
 *  that it exists). `lock` takes a row lock for a change. */
export async function loadItem(scope: TenantScope, id: string, opts: { lock?: boolean } = {}): Promise<Item> {
  const q = scope.tx.select().from(recommendations)
    .where(and(eq(recommendations.id, id), eq(recommendations.businessUnitId, scope.ctx.businessUnitId), ownerOnly(scope, recommendations.ownerEmail)));
  const [row] = opts.lock ? await q.for('update') : await q;
  if (!row) throw notFound('That recommendation is not there, or is not yours.');
  const { pack, ...run } = await runInfo(scope, row.nbaRunId);
  const [d] = await scope.tx.select({ version: drafts.version, draft: drafts.draft, checks: drafts.checks, confidence: drafts.confidence, reason: drafts.reason, at: drafts.createdAt, by: byName })
    .from(drafts).leftJoin(users, eq(users.id, drafts.createdBy)).where(and(eq(drafts.recommendationId, id), eq(drafts.version, row.draftVersion)));
  if (!d) throw new Error(`recommendation ${id} has no draft version ${row.draftVersion}`);
  return { row, rec: row.rec as Rec, state: stateOf(row), run, pack,
    draft: { ...d, draft: d.draft as Draft, checks: d.checks as CheckResult, confidence: d.confidence as StoredDraft['confidence'] }, checkDate: checkDateOf(run.asOf) };
}

/** The checks and confidence of a draft for this item, as of its check date. */
export function assess(item: Pick<Item, 'rec' | 'state' | 'pack' | 'checkDate'>, d: Partial<Draft>) {
  const checks = checkDraft(d, item.pack, item.checkDate);
  const confidence = confidenceFor(R.liveRec(item.rec, item.state), d, checks, R.chosenAction(item.rec, item.state));
  return { checks, confidence };
}

/** Writes the next version of the message and makes it the current one. */
export async function addDraftVersion(scope: TenantScope, item: Item, d: Draft, reason: string, by: string): Promise<StoredDraft> {
  const version = item.row.draftVersion + 1;
  const { checks, confidence } = assess(item, d);
  await scope.tx.insert(drafts).values({
    businessUnitId: scope.ctx.businessUnitId, recommendationId: item.row.id, version, channel: d.channel, action: R.chosenAction(item.rec, item.state),
    contactRow: R.liveRec(item.rec, item.state).contact.row ?? null, draft: d, checks, confidence, reason, brandVersionId: item.run.brandVersionId, createdBy: by,
  });
  await scope.tx.update(recommendations).set({ draftVersion: version }).where(eq(recommendations.id, item.row.id));
  item.row = { ...item.row, draftVersion: version };
  item.draft = { version, draft: d, checks, confidence, reason, at: new Date(), by: by === SYSTEM_USER_ID ? 'System' : '' };
  return item.draft;
}

/** Redrafts the item by the rules after a change to its action, contact, channel or variant. */
export async function redraft(scope: TenantScope, item: Item, reason: string, by: string): Promise<StoredDraft> {
  return addDraftVersion(scope, item, R.generatedDraft(item.rec, item.state, item.pack, item.checkDate), reason, by);
}

export type LogInput = Partial<Omit<typeof decisionLog.$inferInsert, 'id' | 'seq' | 'businessUnitId' | 'recommendationId' | 'nbaRunId'>> & { decision: string };

/** One decision-log row about the item, filled in with what it is now (action, channel, segment, owner, versions). */
export async function logItem(scope: TenantScope, item: Item, actor: Actor | 'System', entry: LogInput): Promise<string> {
  const system = actor === 'System';
  const [row] = await scope.tx.insert(decisionLog).values({
    businessUnitId: scope.ctx.businessUnitId, nbaRunId: item.run.id, recommendationId: item.row.id,
    actorRole: system ? 'System' : actor.role, kind: system ? 'system' : null,
    action: R.chosenAction(item.rec, item.state), channel: item.draft.draft.channel, segment: item.rec.segment || 'No micro-segment',
    contactRow: R.liveRec(item.rec, item.state).contact.row ?? null, draftVersion: item.row.draftVersion, ownerEmail: item.row.ownerEmail,
    configVersionId: item.run.configVersionId, brandVersionId: item.run.brandVersionId, requestId: currentLogContext().requestId ?? null,
    createdBy: system ? SYSTEM_USER_ID : actor.userId,
    ...entry,
  }).returning({ id: decisionLog.id });
  return row.id;
}

/** The segments of a build a manager has paused, with who paused them and when; '' is the no-micro-segment group. */
export async function pausedSegments(scope: TenantScope, runId: string): Promise<Map<string, { by: string; at: Date; reason: string }>> {
  const rows = await scope.tx.selectDistinctOn([segmentPauses.segment], { segment: segmentPauses.segment, action: segmentPauses.action, at: segmentPauses.createdAt, reason: segmentPauses.reason, by: byName })
    .from(segmentPauses).leftJoin(users, eq(users.id, segmentPauses.createdBy))
    .where(and(eq(segmentPauses.nbaRunId, runId), eq(segmentPauses.businessUnitId, scope.ctx.businessUnitId)))
    .orderBy(segmentPauses.segment, desc(segmentPauses.seq));
  return new Map(rows.filter(r => r.action === 'pause').map(r => [r.segment, { by: r.by, at: r.at, reason: r.reason }]));
}
export const segKey = (rec: Pick<Rec, 'segment'>): string => rec.segment || '';

/** The measures' view of the log the caller can see: decisive rows, with whether a manager checked a flagged one. */
export async function logFacts(scope: TenantScope, opts: { ownerEmail?: string | null } = {}): Promise<R.LogFacts[]> {
  const rows = await scope.tx.select({
    decisive: decisionLog.decisive, firstPass: decisionLog.firstPass, accepted: decisionLog.accepted, kind: decisionLog.kind, flag: decisionLog.flag,
    segment: decisionLog.segment, reason: decisionLog.reason, cause: decisionLog.cause, compliance: decisionLog.compliance, intervention: decisionLog.intervention,
    editRating: decisionLog.editRating, seconds: decisionLog.seconds,
    checked: checkedSql,
  }).from(decisionLog).where(and(eq(decisionLog.businessUnitId, scope.ctx.businessUnitId), opts.ownerEmail ? eq(decisionLog.ownerEmail, opts.ownerEmail) : undefined));
  return rows;
}

/* ─── The item as the drawer and the workspace show it ─── */

export type OptionFacts = { action: string; reason: string; channel: string; proof: string; ok: boolean; flags: string[]; conf: string };

/** The recommended or runner-up action as it would go out: channel, proof, confidence and checks. */
export function optionFacts(item: Item, action: string, reason: string): OptionFacts {
  const lr = R.liveRec(item.rec, item.state);
  const x = draftFor(lr, action, { asOf: item.checkDate, variant: item.state.variant || undefined, channel: item.state.channelPref || undefined, brand: item.pack });
  const chk = checkDraft(x, item.pack, item.checkDate), conf = confidenceFor(lr, x, chk, action);
  const brief = briefFor(lr, action, { asOf: item.checkDate, brand: item.pack });
  return { action, reason, channel: x.channel, proof: brief.proof ? brief.proof.title : '', ok: !chk.flags.length && !chk.unsupported.length,
    flags: chk.flags.map(f => f.rule).concat(chk.unsupported.length ? ['Unverified claim'] : []), conf: conf.level };
}

/** The item's reasons now: the exception check over its current draft. */
export function liveReasons(item: Item): string[] {
  return R.exceptionReasons(R.liveRec(item.rec, item.state), item.draft.draft, item.draft.checks);
}
export function catsOf(item: Item): string[] {
  return R.reasonCats(item.state, { reasons: liveReasons(item), unreachable: item.draft.draft.unreachable });
}

const mineOf = (scope: TenantScope, ownerEmail: string | null) => scope.ctx.scope === 'all' || (!!ownerEmail && scope.ctx.ownerEmails.includes(ownerEmail));

export type ItemDetail = Awaited<ReturnType<typeof itemDetail>>;

export async function itemDetail(scope: TenantScope, actor: Actor, id: string) {
  const item = await loadItem(scope, id);
  const { row, rec, state, run } = item;
  const lr = R.liveRec(rec, state), action = R.chosenAction(rec, state), seg = R.segOf(rec, state);
  const paused = (await pausedSegments(scope, run.id)).get(segKey(rec)) ?? null;
  const reasons = liveReasons(item), cats = catsOf(item);
  const brief = briefFor(lr, action, { asOf: item.checkDate, channel: state.channelPref || undefined, brand: item.pack });
  const versions = await scope.tx.select({ version: drafts.version, reason: drafts.reason, channel: drafts.channel, at: drafts.createdAt, by: byName })
    .from(drafts).leftJoin(users, eq(users.id, drafts.createdBy)).where(eq(drafts.recommendationId, id)).orderBy(drafts.version);
  const history = await scope.tx.select({
    id: decisionLog.id, at: decisionLog.createdAt, who: sql<string>`case when ${decisionLog.createdBy} = ${SYSTEM_USER_ID}::uuid then 'System' else ${byName} end`,
    role: decisionLog.actorRole, decision: decisionLog.decision, note: decisionLog.note, reason: decisionLog.reason, tags: decisionLog.tags, flag: decisionLog.flag,
    checked: checkedSql,
  }).from(decisionLog).leftJoin(users, eq(users.id, decisionLog.createdBy)).where(eq(decisionLog.recommendationId, id)).orderBy(desc(decisionLog.seq));
  const facts = await logFacts(scope);
  const manager = isManager(actor.role), mine = mineOf(scope, row.ownerEmail);
  const names = await ownerNames(scope, row.ownerEmail ? [row.ownerEmail] : []);
  const people = (rec.result.people || []).filter(p => p.contact.row !== lr.contact.row).map(p => ({
    row: p.contact.row ?? null, name: p.contact.name, jobTitle: p.contact.jobTitle || '', persona: p.contact.persona || '', optOut: !!p.contact.optOut,
    reach: p.contact.email && p.contact.emailVerified ? 'Email' : p.contact.linkedin ? 'LinkedIn' : 'None',
  }));
  const claimSeg = seg || rec.prominent;
  const reachOf = (c: NbaContact) => ({ name: c.name, firstName: c.firstName || '', jobTitle: c.jobTitle || '', persona: c.persona || '', email: c.email || '',
    emailVerified: !!c.emailVerified, linkedin: c.linkedin || '', row: c.row ?? null });
  const by = await namesOf(scope, [row.decidedBy, row.approvedBy, row.holdBy]);
  return {
    id: row.id, run: { id: run.id, name: run.name, asOf: run.asOf, segments: run.segments.map(s => s.name) }, key: row.engineKey, position: row.position,
    account: { name: rec.account.name, vertical: rec.account.vertical || '', existingCustomer: !!rec.account.existingCustomer, country: rec.account.country || '' },
    contact: reachOf(lr.contact), originalContact: lr.contact.row === rec.contact.row ? null : reachOf(rec.contact),
    person: { tier: lr.person.tier ?? null, final: lr.person.final ?? null, signals: lr.person.signals },
    status: rec.status, segment: rec.segment, prominent: rec.prominent, fallback: rec.fallback, recommended: rec.action, reason: rec.reason,
    runnerUp: rec.runnerUp, signal: rec.signal, resultConfidence: rec.result.confidence ?? null,
    state: {
      ...state, routedAt: row.routedAt, segmentAt: row.segmentAt, decidedAt: row.decidedAt, decidedBy: row.decidedBy ? by.get(row.decidedBy) ?? null : null,
      approvedBy: row.approvedBy ? by.get(row.approvedBy) ?? null : null, holdNote: row.holdNote, holdAt: row.holdAt, holdBy: row.holdBy ? by.get(row.holdBy) ?? null : null,
      meeting: row.meeting as { at: string; seen: boolean; script: R.MeetingScript } | null, edited: row.edited, editRating: row.editRating,
    },
    owner: { email: row.ownerEmail, name: row.ownerEmail ? names.get(row.ownerEmail) ?? null : null },
    chosenAction: action, segOf: seg, segSince: state.status === 'Released' && seg ? (row.segmentAt ?? (state.released === 'auto' ? run.createdAt : row.decidedAt)) : null,
    draft: { ...item.draft.draft, version: item.draft.version, reason: item.draft.reason, at: item.draft.at, by: item.draft.by },
    checks: item.draft.checks, confidence: item.draft.confidence, sensitive: R.isSensitive(item.draft.checks),
    reasons, cats, fourChecks: R.fourChecks(reasons), stuck: R.stuck(rec, state, item.draft.draft, item.draft.checks, cats),
    brief: { who: brief.who, whyNow: brief.whyNow, angle: brief.angle, proof: brief.proof, objection: brief.objection, ask: brief.ask, constraints: brief.constraints },
    options: { recommended: optionFacts(item, rec.action, rec.reason), runnerUp: rec.runnerUp ? optionFacts(item, rec.runnerUp.action, rec.runnerUp.reason) : null },
    versions, history,
    trackRecord: { segment: rec.segment ? R.trackRecord(facts, rec.segment) : null, all: R.trackRecord(facts) },
    deal: estimateDealSize(rec.account), dealThreshold: CONFIG.dealSize.threshold,
    paused: paused ? { by: paused.by, at: paused.at } : null,
    people, claims: approvedClaims(item.pack).filter(c => (c.segments || []).includes(claimSeg)).map((c: Claim) => ({ id: c.id, title: c.title, type: c.type, year: c.year, claim: c.claim, expiry: c.expiry })),
    reps: manager ? await unitReps(scope) : [],
    can: {
      decide: R.inQueue(state) && mine && !paused,
      approve: state.status === 'Awaiting approval' && manager && !paused,
      swap: state.status === 'Released' && !state.outcome && mine && !paused && !!rec.runnerUp,
      outcome: state.status === 'Released' && mine && !paused,
      stepIn: state.status === 'Released' && state.released === 'auto' && state.spot !== 'pending' && mine && !paused,
      reassign: manager && R.inQueue(state),
    },
  };
}

async function namesOf(scope: TenantScope, ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map();
  const rows = await scope.tx.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, want));
  return new Map(rows.map(r => [r.id, r.name]));
}

/* ─── Opening an item, and what happened after it was sent ─── */

/** Records when the caller opened the item (the decision timer runs from here) and clears a booked meeting's "new"
 *  mark. The server's clock, never the browser's. */
export async function openItem(scope: TenantScope, actor: Actor, id: string): Promise<{ openedAt: Date }> {
  const item = await loadItem(scope, id, { lock: true });
  const meeting = item.row.meeting as { at: string; seen: boolean; script: R.MeetingScript } | null;
  const [r] = await scope.tx.update(recommendations).set({ openedAt: sql`now()`, openedBy: actor.userId, ...(meeting && !meeting.seen ? { meeting: { ...meeting, seen: true } } : {}) })
    .where(eq(recommendations.id, id)).returning({ openedAt: recommendations.openedAt });
  return { openedAt: r.openedAt! };
}

/** Step 9 · Outcome update: what happened after the rep sent it themselves. A booked meeting brings the account back
 *  as the next best action, with a call script for the meeting. */
export async function markOutcome(scope: TenantScope, actor: Actor, id: string, outcome: R.Outcome): Promise<{ outcome: R.Outcome; meeting: boolean }> {
  const item = await loadItem(scope, id, { lock: true });
  if (item.state.status !== 'Released') throw conflict('Only a released item has an outcome: it has not gone out yet.');
  if ((await pausedSegments(scope, item.run.id)).has(segKey(item.rec))) throw conflict('Its micro-segment is paused: nothing can be used or decided until it is resumed.');
  const prior = item.row.meeting as { at: string; seen: boolean; script: R.MeetingScript } | null;
  const booked = outcome === 'Meeting booked' && !prior;
  const meeting = outcome === 'Meeting booked' ? (prior ?? { at: new Date().toISOString(), seen: false, script: R.meetingScript(item.rec, item.state, item.draft.draft, item.pack, item.checkDate) }) : null;
  await scope.tx.update(recommendations).set({ outcome, meeting, updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(recommendations.id, id));
  item.state = { ...item.state, outcome };
  await logItem(scope, item, actor, { decision: 'Outcome: ' + outcome });
  if (booked) await logItem(scope, item, 'System', { decision: 'Call script ready for the meeting', note: 'Back on Micro-segments & NBA as the next step' });
  logger.info({ event: 'nba.outcome', recommendationId: id, outcome }, 'Outcome recorded');
  return { outcome, meeting: !!meeting };
}
