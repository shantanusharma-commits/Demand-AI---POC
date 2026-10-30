// Micro-segments and next best action on the server (G-006; legacy 12-nba.html and demandai-nba.js): a build groups a
// stored hand-off's prospects into micro-segments, gives each account one recommended action, drafts its first
// message with the unit's live brand pack, checks it, and routes it: on its own when it passes every check, to the
// owning rep's exception queue when it doesn't, and straight to the sales manager when it is sensitive. The build is
// stamped with the configuration and brand versions it used, and the rules' own steps are logged as the System user.
// Builds are shared in the unit; recommendations are owner-scoped (G-014).
import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { toCSV, type CsvText } from '../../demandai-engine.ts';
import { ENGINE_VERSION } from '../../engine/config.ts';
import { actionsOf, DEFAULT_ACTIONS, libraryBySegment, type LibraryAction } from '../../engine/actions.ts';
import { applyAiPlan, type AiPlan } from '../../ai/nba.ts';
import { CONFIG } from '../../demandai-engine.ts';
import { buildSegments, checkDraft, confidenceFor, type CheckResult, type Draft, type NbaAccount, type NbaContact, type NbaPerson, type NbaResult, type Rec } from '../../engine/nba.ts';
import * as R from '../../engine/review.ts';
import type { Account, Contact, Signal, Tier } from '../../../types/demandai';
import {
  accounts, accountScores, configVersions, contacts, decisionLog, microSegments, drafts, handoffItems, handoffs, leadLists, nbaRuns, prospectScores, recommendations,
  scoringRuns, segmentPauses, SYSTEM_USER_ID, users,
} from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.ts';
import { currentLogContext, logger } from '../logger.ts';
import { liveBrand } from './brand.ts';
import { createHandoff } from './handoffs.ts';
import { activeConfigVersionId, chunks, isManager, ownerOnly, type Actor } from './lists.ts';
import { recOf, checkDateOf, pausedSegments, reasonContext, segKey, stateOf } from './recommendations.ts';
import { currentNames } from './segments.ts';
import { ownerNames } from './users.ts';

/* ─── Reading a hand-off back as the engine's scored accounts ─── */

type StoredPerson = { signals: Signal[]; raw: number; score: number; timing?: number; final?: number; tier?: Tier; whyNow?: string };
type HandoffKey = { itemId: string; contactId: string; accountId: string; ownerEmail: string | null };

/** The hand-off's accounts as the engine scored them, each with everyone at the account in rank order (the people a
 *  "wrong contact" alternative can turn to), and the prospects handed off, by the engine's key. Owner-scoped: a rep
 *  builds from their own prospects only. */
async function handoffResults(scope: TenantScope, handoffId: string) {
  const [h] = await scope.tx.select({ id: handoffs.id, runId: handoffs.runId }).from(handoffs)
    .where(and(eq(handoffs.id, handoffId), eq(handoffs.businessUnitId, scope.ctx.businessUnitId)));
  if (!h) throw notFound('That hand-off is not there any more.');
  const items = await scope.tx.select({ itemId: handoffItems.id, contactId: handoffItems.contactId, accountId: handoffItems.accountId, ownerEmail: handoffItems.ownerEmail,
    row: contacts.rowNo, engineId: accounts.engineId })
    .from(handoffItems).innerJoin(contacts, eq(contacts.id, handoffItems.contactId)).innerJoin(accounts, eq(accounts.id, handoffItems.accountId))
    .where(and(eq(handoffItems.handoffId, h.id), ownerOnly(scope, handoffItems.ownerEmail))).orderBy(asc(handoffItems.position));
  const keys = new Map<string, HandoffKey>(items.map(i => [`${i.engineId}|${i.row}`, { itemId: i.itemId, contactId: i.contactId, accountId: i.accountId, ownerEmail: i.ownerEmail }]));
  const accountIds = [...new Set(items.map(i => i.accountId))];
  const results: NbaResult[] = [];
  for (const part of chunks(accountIds, 500)) {
    const accs = await scope.tx.select({ id: accounts.id, account: accounts.data, result: accountScores.data }).from(accounts)
      .innerJoin(accountScores, and(eq(accountScores.accountId, accounts.id), eq(accountScores.runId, h.runId))).where(inArray(accounts.id, part));
    const people = await scope.tx.select({ accountId: prospectScores.accountId, data: prospectScores.data, contact: contacts.data }).from(prospectScores)
      .innerJoin(contacts, eq(contacts.id, prospectScores.contactId))
      .where(and(eq(prospectScores.runId, h.runId), inArray(prospectScores.accountId, part), ownerOnly(scope, prospectScores.ownerEmail)))
      .orderBy(asc(prospectScores.rankNo));
    for (const a of accs) {
      const res = a.result as { signalCount?: number; score?: number; tier?: Tier; confidence?: NbaResult['confidence']; confidenceWhy?: string };
      const ps = people.filter(p => p.accountId === a.id && (p.data as { person: StoredPerson | null }).person)
        .map(p => ({ ...(p.data as { person: StoredPerson }).person, contact: p.contact as Contact as unknown as NbaContact }) as unknown as NbaPerson);
      results.push({ account: a.account as Account as unknown as NbaAccount, people: ps, signalCount: res.signalCount, score: res.score, tier: res.tier,
        confidence: res.confidence, confidenceWhy: res.confidenceWhy });
    }
  }
  return { scoringRunId: h.runId, keys, results };
}

/** Order within a priority tier is shuffled, seeded by the build, so position doesn't decide the outcome. */
function queueOrder(recs: Rec[], seed: string): Rec[] {
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = (k: string) => { let x = h; for (const ch of k) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
  const ti: Record<string, number> = { A: 0, B: 1, C: 2 };
  return recs.slice().sort((a, b) => (a.segment ? 0 : 1) - (b.segment ? 0 : 1) || (ti[a.person.tier || ''] ?? 3) - (ti[b.person.tier || ''] ?? 3) || rnd(a.key) - rnd(b.key));
}

export type BuildStep = { key: string; sev: '' | 'info' | 'warn'; label: string };
const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** Where an account was engaged before: "build name, date". A build's name already ends with the date it was built, so
 *  that date isn't said twice; labels stored before this rule are tidied the same way when read. */
const engagedLabel = (label: string) => label.replace(/ · (\d{4}-\d{2}-\d{2}), \1$/, ' · $1');

/* ─── Building ─── */

/** What a build is made of, before anything is written: the hand-off, its accounts grouped into micro-segments, and
 *  the brand pack and date the drafts are checked against. A build from a saved scoring run makes its hand-off here. */
export async function planNbaBuild(scope: TenantScope, actor: Actor, input: { handoffId?: string; scoringRunId?: string }, now = new Date()) {
  let handoffId = input.handoffId;
  if (!handoffId) {
    if (!input.scoringRunId) throw badRequest('Choose the prospects to group.');
    handoffId = (await createHandoff(scope, actor, { runId: input.scoringRunId })).handoffId;
  }
  const { scoringRunId, keys, results } = await handoffResults(scope, handoffId);
  if (!keys.size) throw badRequest('None of the prospects in that hand-off are yours, so there is nothing to group.');
  const [run] = await scope.tx.select({ asOf: scoringRuns.asOf, name: scoringRuns.name, listName: leadLists.name }).from(scoringRuns)
    .innerJoin(leadLists, eq(leadLists.id, scoringRuns.listId)).where(eq(scoringRuns.id, scoringRunId));
  const brand = await liveBrand(scope), pack = brand.pack;
  const asOf = run.asOf, checkDate = checkDateOf(asOf);
  // The action library in Setup (30 Oct 2026): what the rules recommend from, and what guides the AI.
  const [cv] = await scope.tx.select({ body: configVersions.body }).from(configVersions)
    .where(and(eq(configVersions.businessUnitId, scope.ctx.businessUnitId), eq(configVersions.status, 'active')));
  let actions: LibraryAction[];
  try { actions = actionsOf(cv?.body); } catch { actions = DEFAULT_ACTIONS; }
  const library = libraryBySegment(actions);
  // 5.9 Engage-once, across the whole unit: accounts released or rejected as already engaged in an earlier build.
  const names = [...new Set(results.map(r => r.account.name.toLowerCase()))];
  const { rows: hits } = await scope.tx.execute<{ name: string; run_name: string; engaged_at: string | Date }>(
    sql`select name, run_name, engaged_at from nba_engaged_accounts(${'{' + names.map(n => '"' + n.replace(/["\\]/g, m => '\\' + m) + '"').join(',') + '}'}::text[], ${now.toISOString()}::timestamptz)`);
  const engaged = new Map(hits.map(e => [e.name, engagedLabel(`${e.run_name}, ${new Date(e.engaged_at).toISOString().slice(0, 10)}`)]));
  const seg = buildSegments(results, { keys: [...keys.keys()], engaged, library });
  if (!seg.recs.length && !seg.engagedOnce.length) throw badRequest('No prospects with a live signal to group.');
  return { handoffId, scoringRunId, keys, run, brand, pack, asOf, checkDate, seg, actions, library };
}

/** AI drafts written for a build before it is stored, keyed by aiDraftKey(); and why the rest stayed with the rules. */
export type AiDrafts = { drafts: ReadonlyMap<string, Draft>; missed: ReadonlyMap<string, string>; stats?: { asked: number; written: number; fallbacks: Record<string, number> };
  /** The micro-segments and actions the AI chose (30 Oct 2026), applied to the rules' grouping when the build is stored. */
  plan?: AiPlan };
/** The same recommendation, action, channel and person: an AI draft is used only for exactly what it was written for. */
export const aiDraftKey = (rec: Rec, rules: Pick<Draft, 'channel'>) => `${rec.key}|${rec.action}|${rules.channel}|${rec.contact.row ?? ''}`;

/** Builds micro-segments from a stored hand-off, or from a saved scoring run's tier A and B prospects (a hand-off is
 *  made for it first). With `ai`, an item's first message is the AI draft written for it, when there is one. */
export async function buildNbaRun(scope: TenantScope, actor: Actor, input: { handoffId?: string; scoringRunId?: string }, ai?: AiDrafts): Promise<{ runId: string; name: string; stats: Record<string, unknown>; checks: BuildStep[] }> {
  const started = performance.now();
  const now = new Date();
  const planned = await planNbaBuild(scope, actor, input, now);
  const { handoffId, scoringRunId, keys, run, brand, pack, asOf, checkDate } = planned;
  // The AI's micro-segments and actions, where it chose them; the rules' everywhere else (section A, B, G).
  const seg = ai?.plan ? applyAiPlan(planned.seg, ai.plan, { min: CONFIG.minSegmentAccounts, library: planned.library }) : planned.seg;
  // A new micro-segment that formed waits for the sales manager's approval; until then its items wait in For Review.
  const created: string[] = [];
  for (const sg of seg.segments) {
    const r = sg.recs?.find(x => x.ai?.segment?.isNew);
    if (!r) continue;
    const [row] = await scope.tx.insert(microSegments).values({ businessUnitId: scope.ctx.businessUnitId, name: sg.name, theme: r.ai!.segment!.theme, why: r.ai!.segment!.why,
      origin: 'ai', status: 'waiting', createdBy: actor.userId, updatedBy: actor.userId }).onConflictDoNothing().returning({ id: microSegments.id });
    if (row) created.push(sg.name);
  }
  const rctx = await reasonContext(scope);
  const configVersionId = await activeConfigVersionId(scope);
  const runId = randomUUID();
  const name = `${run.name || run.listName} · ${now.toISOString().slice(0, 10)}`;
  const ordered = queueOrder(seg.recs, runId);

  // Route each item (step 1): a draft that fails a brand or rule check is regenerated once on its own first (5.16).
  // An AI draft (written before the build, already through the same checks) comes second, after the rules' one.
  type Built = { id: string; rec: Rec; key: HandoffKey; st: R.RecState; versions: { d: Draft; reason: string }[]; logs: { decision: string; note: string }[] };
  const built: Built[] = ordered.map(rec => {
    const st = R.initialState();
    const first = R.generatedDraft(rec, st, pack, checkDate);
    const versions = [{ d: first, reason: 'Generated from the action' }];
    const logs: Built['logs'] = [];
    if (rec.ai?.segment) logs.push({ decision: 'Micro-segment chosen by AI', note: `${rec.segment ? rec.segment : `${rec.prominent} (not formed: too few accounts)`}${rec.ai.segment.isNew ? ', a new micro-segment' : ''} · ${rec.ai.segment.confidence} confidence · ${rec.ai.segment.why}` });
    else if (ai?.plan?.stats.segments && ai.plan.stats.segments.asked) logs.push({ decision: 'Micro-segment chosen by the rules', note: 'The AI did not answer for this account; the rules grouped it on its strongest signal' });
    if (rec.ai?.action) logs.push({ decision: 'Action chosen by AI', note: `${rec.action}${rec.ai.action.inLibrary ? '' : ' (not in the action library)'} · ${rec.ai.action.confidence} confidence · ${rec.ai.action.why}${rec.runnerUp ? ` · runner-up: ${rec.runnerUp.action}` : ''}` });
    const written = ai?.drafts.get(aiDraftKey(rec, first)), missed = ai?.missed.get(aiDraftKey(rec, first));
    const flags = written ? [] : checkDraft(first, pack, checkDate).flags.filter(f => f.rule !== 'Sensitive term');
    if (written) {
      versions.push({ d: written, reason: 'Written with AI from the action and the approved claims' });
      logs.push({ decision: 'Written with AI', note: `${written.ai?.template ?? 'AI'}: passed the brand, claim and grounding checks` });
    } else if (missed) {
      logs.push({ decision: 'AI draft not used', note: `${missed}; the rules' draft is used` });
    }
    if (flags.length) {
      st.variant = 'clean';
      const again = R.generatedDraft(rec, st, pack, checkDate);
      const still = checkDraft(again, pack, checkDate).flags.filter(f => f.rule !== 'Sensitive term');
      versions.push({ d: again, reason: `Regenerated once: ${flags.map(f => f.rule.toLowerCase()).join(', ')}` });
      logs.push({ decision: 'Regenerated once after a brand or rule check', note: `${flags.map(f => `${f.rule}: ${f.detail}`).join(' · ')}${still.length ? ' · still failing' : ' · now passes'}` });
    }
    const current = versions[versions.length - 1].d;
    const rs = R.exceptionReasons(rec, current, checkDraft(current, pack, checkDate), rctx);
    st.reasons = rs;
    // Sensitive content goes straight to the sales manager's approvals, never through a rep's queue.
    if (rs.some(t => /^Sensitive/.test(t))) { Object.assign(st, { status: 'Awaiting approval', why: 'sensitive' }); logs.push({ decision: 'To approvals', note: 'Sensitive content: the sales manager approves it before anything goes out' }); }
    else if (rs.length) { Object.assign(st, { status: 'Waiting', why: 'exception' }); logs.push({ decision: 'To the exception queue', note: rs.join(' · ') }); }
    else { Object.assign(st, { status: 'Released', released: 'auto', passed: true }); logs.push({ decision: 'Proceeded on its own', note: 'Passed every check; released to the rep, ready to use' }); }
    const key = keys.get(rec.key);
    if (!key) throw new Error(`recommendation ${rec.key} is not in the hand-off`);
    return { id: randomUUID(), rec, key, st, versions, logs };
  });

  // What each build step found, for the checks pop-up (legacy stepResult).
  const recs = built.map(b => b.rec), cur = (b: Built) => b.versions[b.versions.length - 1].d;
  const chk = new Map(built.map(b => [b.id, checkDraft(cur(b), pack, checkDate)]));
  const confs = built.map(b => confidenceFor(b.rec, cur(b), chk.get(b.id)!, R.chosenAction(b.rec, b.st)).level);
  const byAcc = [...new Map(recs.map(r => [r.account.id, r])).values()];
  const channels: Record<string, number> = {}; built.forEach(b => { channels[cur(b).channel] = (channels[cur(b).channel] || 0) + 1; });
  const conf: Record<string, number> = {}; confs.forEach(l => { conf[l] = (conf[l] || 0) + 1; });
  const tasks = built.filter(b => cur(b).channel === 'Task').length;
  const auto = built.filter(b => b.st.passed).length, approvals = built.filter(b => b.st.status === 'Awaiting approval').length;
  const exceptionAccounts = new Set(seg.exceptions.map(r => r.account.id)).size;
  const fromStrongest = byAcc.filter(r => r.runnerUp && r.runnerUp.fromStrongest).length;
  const fallbacks = byAcc.filter(r => r.fallback).length;
  const flagged = built.filter(b => chk.get(b.id)!.flags.length).length, unsupported = built.filter(b => chk.get(b.id)!.unsupported.length).length;
  const noProof = built.filter(b => cur(b).noProof).length;
  const byAi = { segments: byAcc.filter(r => r.ai?.segment).length, actions: recs.filter(r => r.ai?.action).length, offLibrary: recs.filter(r => r.ai?.action && !r.ai.action.inLibrary).length };
  const steps: BuildStep[] = [
    { key: 'read', sev: '', label: `${pl(seg.accountsConsidered, 'account')} · one recommendation each` },
    { key: 'engage', ...(seg.engagedOnce.length ? { sev: 'info', label: `${pl(seg.engagedOnce.length, 'account')} set aside` } : { sev: '', label: 'None engaged before' }) },
    { key: 'group', ...(seg.segments.length ? { sev: '', label: `${pl(seg.segments.length, 'micro-segment')} formed${byAi.segments ? ` · ${byAi.segments} of ${byAcc.length} accounts grouped by AI` : ''}${created.length ? ` · ${created.length} new, waiting for approval` : ''}` }
      : { sev: 'warn', label: 'None formed' }) },
    { key: 'fallback', ...(fallbacks ? { sev: 'info', label: `${pl(fallbacks, 'account')} on the next signal` } : { sev: '', label: 'Not needed' }) },
    { key: 'except', ...(exceptionAccounts ? { sev: 'warn', label: `${pl(exceptionAccounts, 'account')} to a person` } : { sev: '', label: 'All segments proceed' }) },
    { key: 'action', sev: byAi.offLibrary ? 'info' : '', label: `${pl(recs.length, 'action')}${byAi.actions ? ` · ${byAi.actions} chosen by AI${byAi.offLibrary ? `, ${byAi.offLibrary} outside the library` : ''}` : ''}${fromStrongest ? ` · ${fromStrongest} from strongest` : ''}` },
    { key: 'channel', sev: '', label: Object.entries(channels).map(([k, v]) => `${v} ${k}`).join(' · ') || 'None' },
    { key: 'proof', ...(noProof ? { sev: 'warn', label: `${noProof} without proof: tasks` } : { sev: '', label: 'Found for every draft' }) },
    { key: 'draft', sev: '', label: `${recs.length - tasks} drafts · ${tasks} tasks` },
    { key: 'brand', ...(flagged ? { sev: 'warn', label: `${flagged} flagged` } : { sev: '', label: 'All pass' }) },
    { key: 'claims', ...(unsupported ? { sev: 'warn', label: `${unsupported} unsupported` } : { sev: '', label: 'All verified' }) },
    { key: 'confidence', sev: conf.Low ? 'info' : '', label: ['High', 'Medium', 'Low'].filter(l => conf[l]).map(l => `${conf[l]} ${l.toLowerCase()}`).join(' · ') || 'None' },
    { key: 'send', sev: recs.length - auto ? 'info' : '', label: `${auto} go ahead · ${recs.length - auto} to For Review${approvals ? ` (${approvals} for approval)` : ''}` },
    { key: 'spot', sev: '', label: 'Drawn weekly in For Review' },
  ];
  const stats = {
    accountsConsidered: seg.accountsConsidered, segments: seg.segments.length, prospects: recs.length, auto, exceptions: recs.length - auto - approvals, approvals,
    engagedOnce: seg.engagedOnce.length, tasks, channels, confidence: conf,
    // How many first messages the AI wrote (only those used: the same recommendation, action, channel and person).
    ...(ai?.stats ? { aiDrafts: { ...ai.stats, written: built.filter(b => b.versions.some(v => v.d.ai)).length } } : {}),
    // How many accounts the AI grouped and how many actions it chose, and why the rest used the rules (section G).
    ...(ai?.plan?.stats.segments ? { aiSegments: { ...ai.plan.stats.segments, answered: byAi.segments, newSegments: created } } : {}),
    ...(ai?.plan?.stats.actions ? { aiActions: { ...ai.plan.stats.actions, answered: byAi.actions, offLibrary: byAi.offLibrary } } : {}),
  };

  await scope.tx.insert(nbaRuns).values({
    id: runId, businessUnitId: scope.ctx.businessUnitId, handoffId, scoringRunId, name, asOf, configVersionId, brandVersionId: brand.id, engineVersion: ENGINE_VERSION,
    seed: runId, segments: seg.segments.map(s => ({ name: s.name, accounts: s.accountIds.length, ...(s.recs?.some(r => r.ai?.segment) ? { origin: 'ai' } : {}),
      ...(created.includes(s.name) ? { isNew: true } : {}) })),
    engaged: seg.engagedOnce.map(e => ({ name: e.account.name, label: e.label, ownerEmail: e.result.people?.[0]?.contact.owner?.toLowerCase() || null })),
    checks: steps, stats, createdBy: actor.userId, updatedBy: actor.userId,
  });
  const bu = scope.ctx.businessUnitId, requestId = currentLogContext().requestId ?? null;
  for (const part of chunks(built, 200)) {
    await scope.tx.insert(recommendations).values(part.map((b, i) => ({
      id: b.id, businessUnitId: bu, nbaRunId: runId, handoffItemId: b.key.itemId, accountId: b.key.accountId, contactId: b.key.contactId, engineKey: b.rec.key,
      position: built.indexOf(part[i]), segment: b.rec.segment, action: b.rec.action, runnerUp: b.rec.runnerUp, rec: b.rec, passed: b.st.passed, reasons: b.st.reasons,
      ownerEmail: b.key.ownerEmail, status: b.st.status, why: b.st.why, released: b.st.released, routedAt: now, variant: b.st.variant, draftVersion: b.versions.length,
      decidedAt: b.st.passed ? now : null, decidedBy: b.st.passed ? SYSTEM_USER_ID : null, createdBy: actor.userId, updatedBy: actor.userId,
    })));
    await scope.tx.insert(drafts).values(part.flatMap(b => b.versions.map((v, i) => {
      const c = checkDraft(v.d, pack, checkDate);
      return { businessUnitId: bu, recommendationId: b.id, version: i + 1, channel: v.d.channel, action: b.rec.action, contactRow: b.rec.contact.row ?? null, draft: v.d,
        checks: c, confidence: confidenceFor(b.rec, v.d, c, b.rec.action), reason: v.reason, brandVersionId: brand.id, aiAssisted: !!v.d.ai, aiCallId: v.d.ai?.callId ?? null, createdBy: SYSTEM_USER_ID };
    })));
    await scope.tx.insert(decisionLog).values(part.flatMap(b => b.logs.map((l, i) => ({
      businessUnitId: bu, nbaRunId: runId, recommendationId: b.id, actorRole: 'System', kind: 'system', decision: l.decision, note: l.note,
      action: b.rec.action, channel: (i === 0 && b.versions.length > 1 ? b.versions[0] : b.versions[b.versions.length - 1]).d.channel,
      segment: b.rec.segment || 'No micro-segment', contactRow: b.rec.contact.row ?? null, draftVersion: b.versions.length, ownerEmail: b.key.ownerEmail,
      configVersionId, brandVersionId: brand.id, requestId, createdBy: SYSTEM_USER_ID,
    }))));
  }
  await recordAudit(scope, { action: 'nba.built', actorRole: actor.role, targetType: 'nba_run', targetId: runId,
    details: { handoffId, scoringRunId, brandVersion: brand.versionNo, recommendations: recs.length, auto, approvals, segments: seg.segments.length, engagedOnce: seg.engagedOnce.length } });
  logger.info({ event: 'nba.built', nbaRunId: runId, recommendations: recs.length, auto, approvals, segments: seg.segments.length, durationMs: Math.round(performance.now() - started) }, 'Micro-segments built');
  return { runId, name, stats, checks: steps };
}

/* ─── Reading builds ─── */

export type NbaRunSummary = { id: string; name: string; asOf: string; createdAt: Date; by: string; segments: number; prospects: number; waiting: number; source: string };
export type BuildSource = { kind: 'handoff' | 'run'; id: string; label: string; count: number; createdAt: Date };

const byName = sql<string>`coalesce(${users.displayName}, 'A former member')`;
const waitingSql = sql<number>`count(*) filter (where ${recommendations.status} in ('Waiting', 'Awaiting approval') or ${recommendations.spot} = 'pending')`;

/** Every build in the unit, newest first, with how many of its recommendations the caller can see and how many wait
 *  for a person; and what can be built from: recent hand-offs and saved scoring runs. */
export async function listNbaRuns(scope: TenantScope) {
  const runs = await scope.tx.select({ id: nbaRuns.id, name: nbaRuns.name, asOf: nbaRuns.asOf, createdAt: nbaRuns.createdAt, by: byName, segments: nbaRuns.segments,
    source: scoringRuns.name, listName: leadLists.name })
    .from(nbaRuns).leftJoin(users, eq(users.id, nbaRuns.createdBy)).innerJoin(scoringRuns, eq(scoringRuns.id, nbaRuns.scoringRunId)).innerJoin(leadLists, eq(leadLists.id, scoringRuns.listId))
    .where(eq(nbaRuns.businessUnitId, scope.ctx.businessUnitId)).orderBy(desc(nbaRuns.createdAt));
  const counts = await scope.tx.select({ runId: recommendations.nbaRunId, n: count(), waiting: waitingSql }).from(recommendations)
    .where(and(eq(recommendations.businessUnitId, scope.ctx.businessUnitId), ownerOnly(scope, recommendations.ownerEmail))).groupBy(recommendations.nbaRunId);
  const byRun = new Map(counts.map(c => [c.runId, c]));
  const summaries: NbaRunSummary[] = runs.map(r => ({ id: r.id, name: r.name, asOf: r.asOf, createdAt: r.createdAt, by: r.by, segments: (r.segments as unknown[]).length,
    prospects: Number(byRun.get(r.id)?.n ?? 0), waiting: Number(byRun.get(r.id)?.waiting ?? 0), source: r.source || r.listName }));
  const hs = await scope.tx.select({ id: handoffs.id, createdAt: handoffs.createdAt, runName: scoringRuns.name, listName: leadLists.name, n: count(handoffItems.id) })
    .from(handoffs).innerJoin(scoringRuns, eq(scoringRuns.id, handoffs.runId)).innerJoin(leadLists, eq(leadLists.id, scoringRuns.listId))
    .leftJoin(handoffItems, and(eq(handoffItems.handoffId, handoffs.id), ownerOnly(scope, handoffItems.ownerEmail)))
    .where(eq(handoffs.businessUnitId, scope.ctx.businessUnitId)).groupBy(handoffs.id, scoringRuns.name, leadLists.name).orderBy(desc(handoffs.createdAt)).limit(20);
  const saved = await scope.tx.select({ id: scoringRuns.id, name: scoringRuns.name, listName: leadLists.name, savedAt: scoringRuns.savedAt, createdAt: scoringRuns.createdAt })
    .from(scoringRuns).innerJoin(leadLists, eq(leadLists.id, scoringRuns.listId))
    .where(and(eq(scoringRuns.businessUnitId, scope.ctx.businessUnitId), eq(scoringRuns.status, 'saved'))).orderBy(desc(scoringRuns.savedAt)).limit(50);
  const sources: BuildSource[] = [
    ...hs.filter(h => Number(h.n) > 0).map(h => ({ kind: 'handoff' as const, id: h.id, label: `Sent from Scoring: ${h.runName || h.listName}`, count: Number(h.n), createdAt: h.createdAt })),
    ...saved.map(s => ({ kind: 'run' as const, id: s.id, label: `Scored list: ${s.name || s.listName}`, count: 0, createdAt: s.savedAt ?? s.createdAt })),
  ];
  const [meet] = await scope.tx.select({ n: count(), runId: sql<string | null>`min(${recommendations.nbaRunId}::text)` }).from(recommendations)
    .where(and(eq(recommendations.businessUnitId, scope.ctx.businessUnitId), ownerOnly(scope, recommendations.ownerEmail), sql`(${recommendations.meeting}->>'seen')::boolean = false`));
  return { runs: summaries, sources, meetings: { count: Number(meet?.n ?? 0), runId: meet?.runId ?? null } };
}

export type RecRowView = {
  id: string; key: string; position: number; account: { name: string; vertical: string; existingCustomer: boolean }; contact: { name: string; jobTitle: string; persona: string };
  segment: string | null; assignedSegment: string | null; segSince: Date | null; fallback: boolean; action: string; chosenAction: string; runnerUp: string | null; channel: string;
  status: string; released: string | null; passed: boolean; spot: string | null; outcome: string | null; meeting: { seen: boolean } | null; ownerEmail: string | null; ownerName: string | null; paused: boolean;
};

/** A micro-segment as a build stored it: `origin` 'ai' when the AI grouped accounts into it, `isNew` when the build
 *  created it and it waited for approval. */
type RunSegment = { name: string; accounts: number; origin?: 'ai'; isNew?: boolean };

/** One build: its micro-segments, what engage-once set aside, the pauses, the build steps, and every recommendation the
 *  caller can see, in queue order. */
export async function getNbaRun(scope: TenantScope, id: string) {
  const [r] = await scope.tx.select({ id: nbaRuns.id, name: nbaRuns.name, asOf: nbaRuns.asOf, createdAt: nbaRuns.createdAt, createdBy: nbaRuns.createdBy, by: byName,
    segments: nbaRuns.segments, engaged: nbaRuns.engaged, checks: nbaRuns.checks, stats: nbaRuns.stats, engineVersion: nbaRuns.engineVersion,
    configVersionId: nbaRuns.configVersionId, brandVersionId: nbaRuns.brandVersionId, sourceFile: scoringRuns.sourceFile, scoringName: scoringRuns.name, listName: leadLists.name,
    configVersionNo: sql<number | null>`(select version_no from config_versions where id = ${nbaRuns.configVersionId})`,
    brandVersionNo: sql<number>`(select version_no from brand_versions where id = ${nbaRuns.brandVersionId})` })
    .from(nbaRuns).leftJoin(users, eq(users.id, nbaRuns.createdBy)).innerJoin(scoringRuns, eq(scoringRuns.id, nbaRuns.scoringRunId)).innerJoin(leadLists, eq(leadLists.id, scoringRuns.listId))
    .where(and(eq(nbaRuns.id, id), eq(nbaRuns.businessUnitId, scope.ctx.businessUnitId)));
  if (!r) throw notFound('Those micro-segments are not there any more.');
  const rows = await scope.tx.select({
    id: recommendations.id, key: recommendations.engineKey, position: recommendations.position, rec: recommendations.rec, segment: recommendations.segment,
    assignedSegment: recommendations.assignedSegment, segmentAt: recommendations.segmentAt, action: recommendations.action, runnerUp: recommendations.runnerUp,
    useRunnerUp: recommendations.useRunnerUp, manualAction: recommendations.manualAction, contactRow: recommendations.contactRow, status: recommendations.status,
    released: recommendations.released, passed: recommendations.passed, spot: recommendations.spot, outcome: recommendations.outcome, meeting: recommendations.meeting,
    ownerEmail: recommendations.ownerEmail, decidedAt: recommendations.decidedAt, channel: drafts.channel,
  }).from(recommendations).innerJoin(drafts, and(eq(drafts.recommendationId, recommendations.id), eq(drafts.version, recommendations.draftVersion)))
    .where(and(eq(recommendations.nbaRunId, id), eq(recommendations.businessUnitId, scope.ctx.businessUnitId), ownerOnly(scope, recommendations.ownerEmail)))
    .orderBy(asc(recommendations.position));
  const paused = await pausedSegments(scope, id);
  const names = await ownerNames(scope, rows.map(x => x.ownerEmail ?? ''));
  const recs: RecRowView[] = rows.map(x => {
    const rec = recOf(x), st = { manualAction: x.manualAction, useRunnerUp: x.useRunnerUp, contactRow: x.contactRow, assignedSegment: x.assignedSegment };
    const c = R.liveRec(rec, st).contact, seg = R.segOf(rec, st);
    return {
      id: x.id, key: x.key, position: x.position, account: { name: rec.account.name, vertical: rec.account.vertical || '', existingCustomer: !!rec.account.existingCustomer },
      contact: { name: c.name, jobTitle: c.jobTitle || '', persona: c.persona || '' }, segment: x.segment, assignedSegment: x.assignedSegment,
      segSince: x.status === 'Released' && seg ? (x.segmentAt ?? (x.released === 'auto' ? r.createdAt : x.decidedAt)) : null,
      fallback: rec.fallback, action: x.action, chosenAction: R.chosenAction(rec, st), runnerUp: (x.runnerUp as Rec['runnerUp'])?.action ?? null, channel: x.channel,
      status: x.status, released: x.released, passed: x.passed, spot: x.spot, outcome: x.outcome, meeting: x.meeting ? { seen: !!(x.meeting as { seen: boolean }).seen } : null,
      ownerEmail: x.ownerEmail, ownerName: x.ownerEmail ? names.get(x.ownerEmail) ?? null : null, paused: paused.has(segKey(rec)),
    };
  });
  // The segments it formed, under the names they have now: a renamed segment moved its items, and a merged one joins the
  // segment it went into (former_names).
  const now = await currentNames(scope), formedNow = new Map<string, RunSegment>();
  for (const sg of r.segments as RunSegment[]) {
    const name = now.get(sg.name.toLowerCase()) ?? sg.name, cur = formedNow.get(name);
    formedNow.set(name, cur ? { ...cur, accounts: cur.accounts + sg.accounts, ...(sg.origin ? { origin: sg.origin } : {}), ...(sg.isNew ? { isNew: true } : {}) } : { ...sg, name });
  }
  // Micro-segments its items joined in For Review that this build did not form: the system's, formed in other lists, or
  // ones a person created (which may hold fewer than CONFIG.minSegmentAccounts accounts).
  const formed = new Set(formedNow.keys());
  const joined = [...new Set(recs.filter(x => !x.segment && x.assignedSegment && !formed.has(x.assignedSegment)).map(x => x.assignedSegment!))];
  const wanted = [...formed, ...joined];
  const made = wanted.length ? await scope.tx.select({ name: microSegments.name, theme: microSegments.theme, origin: microSegments.origin, status: microSegments.status, by: byName }).from(microSegments)
    .leftJoin(users, eq(users.id, microSegments.createdBy)).where(and(eq(microSegments.businessUnitId, scope.ctx.businessUnitId), inArray(microSegments.name, wanted))) : [];
  // F3 · Who made each segment it formed: the AI (and whether it still waits for approval), a person, or the rules.
  const segments = [...formedNow.values()].map(sg => {
    const m = made.find(z => z.name.toLowerCase() === sg.name.toLowerCase());
    return { ...sg, theme: m?.theme ?? sg.name, madeBy: m ? (m.origin === 'ai' ? 'ai' as const : 'person' as const) : 'rules' as const, waiting: m?.status === 'waiting' };
  });
  const assigned = joined.map(name => {
    const m = made.find(z => z.name.toLowerCase() === name.toLowerCase());
    return m ? { name, theme: m.theme, origin: m.origin === 'ai' ? 'ai' as const : 'person' as const, by: m.origin === 'ai' ? null : m.by } : { name, theme: name, origin: 'system' as const, by: null };
  });
  const visibleEngaged = (r.engaged as { name: string; label: string; ownerEmail: string | null }[])
    .filter(e => scope.ctx.scope === 'all' || (!!e.ownerEmail && scope.ctx.ownerEmails.includes(e.ownerEmail))).map(({ name, label }) => ({ name, label: engagedLabel(label) }));
  return {
    id: r.id, name: r.name, asOf: r.asOf, createdAt: r.createdAt, by: r.by, createdBy: r.createdBy, source: r.scoringName || r.listName, sourceFile: r.sourceFile,
    configVersionNo: r.configVersionNo, brandVersionNo: r.brandVersionNo, engineVersion: r.engineVersion,
    segments, assigned, engaged: visibleEngaged, checks: r.checks as BuildStep[], stats: r.stats,
    paused: Object.fromEntries([...paused].map(([k, v]) => [k, { by: v.by, at: v.at, reason: v.reason }])), recs,
  };
}

/** A build as a file (product owner, 30 Oct 2026): every recommendation the caller can see, with the person, the
 *  micro-segment, the signal it rests on, the action, where it is now and its message. Formulas neutralised (G-052). */
export async function nbaRunCsv(scope: TenantScope, actor: Actor, id: string): Promise<{ fileName: string; csv: CsvText; rows: number }> {
  const [r] = await scope.tx.select({ name: nbaRuns.name }).from(nbaRuns).where(and(eq(nbaRuns.id, id), eq(nbaRuns.businessUnitId, scope.ctx.businessUnitId)));
  if (!r) throw notFound('Those micro-segments are not there any more.');
  const rows = await scope.tx.select({ row: recommendations, draft: drafts.draft, confidence: drafts.confidence, checks: drafts.checks }).from(recommendations)
    .innerJoin(drafts, and(eq(drafts.recommendationId, recommendations.id), eq(drafts.version, recommendations.draftVersion)))
    .where(and(eq(recommendations.nbaRunId, id), eq(recommendations.businessUnitId, scope.ctx.businessUnitId), ownerOnly(scope, recommendations.ownerEmail)))
    .orderBy(asc(recommendations.position));
  const names = await ownerNames(scope, rows.map(x => x.row.ownerEmail ?? ''));
  const rctx = await reasonContext(scope);
  const out: unknown[][] = [['owner', 'prospect', 'job_title', 'persona', 'company', 'vertical', 'customer', 'email', 'linkedin_url', 'tier', 'score', 'micro_segment',
    'signal', 'signal_date', 'signal_detail', 'action', 'runner_up', 'channel', 'confidence', 'where_it_is', 'why_it_needs_a_person', 'subject', 'message', 'linkedin_note', 'task', 'outcome']];
  for (const { row, draft, confidence, checks } of rows) {
    const rec = recOf(row), st = stateOf(row), lr = R.liveRec(rec, st), c = lr.contact, d = draft as Draft;
    const reasons = R.exceptionReasons(lr, d, checks as CheckResult, rctx);
    const cats = row.status === 'Released' || row.status === 'Closed' ? [] : R.reasonCats(st, { reasons, unreachable: d.unreachable });
    out.push([row.ownerEmail ? names.get(row.ownerEmail) ?? row.ownerEmail : 'Unassigned', c.name, c.jobTitle || '', c.persona || '', rec.account.name, rec.account.vertical || '',
      rec.account.existingCustomer ? 'Existing customer' : 'Net-new', c.email || '', c.linkedin || '', lr.person.tier || '', lr.person.final ?? '',
      R.segOf(rec, st) || 'No micro-segment', rec.signal.type, rec.signal.date || '', rec.signal.detail || '', R.chosenAction(rec, st), rec.runnerUp?.action ?? '', d.channel,
      (confidence as { level?: string }).level ?? '', R.whereItIs(row), cats.map(k => R.REASON_CATS[k] ?? k).join('; '), d.subject || '', d.body || '', d.note || '', d.task || '', row.outcome || '']);
  }
  await recordAudit(scope, { action: 'nba.exported', actorRole: actor.role, targetType: 'nba_run', targetId: id, details: { rows: rows.length } });
  return { fileName: `${r.name.replace(/[^\w\- ·]+/g, '').trim() || 'micro-segments'}.csv`, csv: toCSV(out), rows: rows.length };
}

export async function renameNbaRun(scope: TenantScope, actor: Actor, id: string, name: string): Promise<void> {
  const [r] = await scope.tx.select({ createdBy: nbaRuns.createdBy }).from(nbaRuns).where(and(eq(nbaRuns.id, id), eq(nbaRuns.businessUnitId, scope.ctx.businessUnitId)));
  if (!r) throw notFound('Those micro-segments are not there any more.');
  if (r.createdBy !== actor.userId && !isManager(actor.role)) throw forbidden('Only the person who built them or a sales manager can rename these micro-segments.');
  await scope.tx.update(nbaRuns).set({ name, updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(nbaRuns.id, id));
  await recordAudit(scope, { action: 'nba.renamed', actorRole: actor.role, targetType: 'nba_run', targetId: id });
}

/* ─── 6.3 Step in at any time: a manager pauses a whole micro-segment ─── */

/** Pauses or resumes a micro-segment ('' is the group with no micro-segment): its items stay where they are but can't
 *  be used or decided until it is resumed. Each item's log says so. */
export async function setSegmentPaused(scope: TenantScope, actor: Actor, runId: string, segment: string, pause: boolean, reason = ''): Promise<{ items: number }> {
  const [r] = await scope.tx.select({ id: nbaRuns.id, segments: nbaRuns.segments, configVersionId: nbaRuns.configVersionId, brandVersionId: nbaRuns.brandVersionId })
    .from(nbaRuns).where(and(eq(nbaRuns.id, runId), eq(nbaRuns.businessUnitId, scope.ctx.businessUnitId))).for('update');
  if (!r) throw notFound('Those micro-segments are not there any more.');
  if (segment && !(r.segments as { name: string }[]).some(s => s.name === segment)) throw badRequest(`"${segment}" is not one of these micro-segments.`);
  const paused = await pausedSegments(scope, runId);
  const label = segment || 'No micro-segment';
  if (pause && paused.has(segment)) throw conflict(`${label} is already paused.`);
  if (!pause && !paused.has(segment)) throw conflict(`${label} is not paused.`);
  await scope.tx.insert(segmentPauses).values({ businessUnitId: scope.ctx.businessUnitId, nbaRunId: runId, segment, action: pause ? 'pause' : 'resume', reason, createdBy: actor.userId });
  const items = await scope.tx.select({ id: recommendations.id, action: recommendations.action, ownerEmail: recommendations.ownerEmail, draftVersion: recommendations.draftVersion, contactRow: recommendations.contactRow,
    useRunnerUp: recommendations.useRunnerUp, manualAction: recommendations.manualAction, runnerUp: recommendations.runnerUp, channel: drafts.channel })
    .from(recommendations).innerJoin(drafts, and(eq(drafts.recommendationId, recommendations.id), eq(drafts.version, recommendations.draftVersion)))
    .where(and(eq(recommendations.nbaRunId, runId), segment ? eq(recommendations.segment, segment) : sql`${recommendations.segment} is null`));
  const requestId = currentLogContext().requestId ?? null;
  for (const part of chunks(items, 500)) {
    await scope.tx.insert(decisionLog).values(part.map(i => ({
      businessUnitId: scope.ctx.businessUnitId, nbaRunId: runId, recommendationId: i.id, actorRole: actor.role, decision: pause ? 'Micro-segment paused' : 'Micro-segment resumed',
      note: pause ? `${label} paused${reason ? ': ' + reason : ''}` : '', action: R.chosenAction({ action: i.action, runnerUp: i.runnerUp as Rec['runnerUp'] }, i), channel: i.channel,
      segment: label, contactRow: i.contactRow, draftVersion: i.draftVersion, ownerEmail: i.ownerEmail, configVersionId: r.configVersionId, brandVersionId: r.brandVersionId,
      requestId, createdBy: actor.userId,
    })));
  }
  await recordAudit(scope, { action: pause ? 'nba.segment_paused' : 'nba.segment_resumed', actorRole: actor.role, targetType: 'nba_run', targetId: runId, details: { segment: label, items: items.length } });
  logger.info({ event: pause ? 'nba.segment_paused' : 'nba.segment_resumed', nbaRunId: runId, items: items.length }, pause ? 'Micro-segment paused' : 'Micro-segment resumed');
  return { items: items.length };
}
