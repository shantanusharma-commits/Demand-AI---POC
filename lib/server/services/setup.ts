// Setup on the server (G-002, D-41): the unit's configuration versions, sign-offs per section, the signal switches,
// and (30 Oct 2026, replacing the D-13 lock) the scoring settings, the action library and the measurement criteria an
// Admin edits. Every change makes a new configuration version with what changed in words, so new lists and runs are
// stamped with it and earlier ones keep the version they used. The scoring settings can be locked for the measurement
// weeks, or opened only with the sponsor's sign-off; a preview says how many accounts of the newest scored list would
// change tier before a change is saved.
import 'server-only';
import { and, asc, desc, eq, inArray, max, or, sql } from 'drizzle-orm';
import {
  CONFIG, DEFAULT_SCORING, decayFactor, fitFor, round1, signalTypesFor, stack, tierFor, type Account, type Contact, type CustomSignalType, type ScoringSettings, type Signal, type Tier,
} from '../../demandai-engine.ts';
import { ENGINE_VERSION } from '../../engine/config.ts';
import { ActionsInput, actionChanges, actionsOf, type LibraryAction } from '../../engine/actions.ts';
import { ScoringSettingsInput, scoringChanges, scoringSettingsOf } from '../../engine/settings.ts';
import * as G from '../../engine/gates.ts';
import {
  accounts, accountScores, CONFIG_SECTIONS, configChanges, configSignoffs, configVersions, contacts, decisionLog, leadLists, scoringRuns, signals, signalTypeChanges, users,
  type ConfigSection,
} from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { badRequest, conflict } from '../http/errors.ts';
import { logger } from '../logger.ts';
import type { Actor } from './lists.ts';
import { signalSettingsOf } from './scoring.ts';
import { signalMonitoring } from './signal-monitoring.ts';

export type SectionState = { status: 'done' | 'review'; by: string | null; at: Date | null; note: string };
export type SignalChange = { type: string; change: 'off' | 'on' | 'added' | 'removed'; reason: string; by: string; at: Date; versionNo: number };
export type ConfigVersionRow = { versionNo: number; status: string; activatedAt: Date | null; activatedBy: string | null; engineVersion: string; changes: string[] };
export type AddedType = CustomSignalType & { by: string | null; at: Date | null };

/** The scoring settings' lock (Setup): open, locked for the measurement weeks, or open only with the sponsor's sign-off. */
export type ScoringLock = { mode: 'open' | 'locked' | 'sponsor'; note: string; by: string | null; at: string | null };
export const lockOf = (body: unknown): ScoringLock => {
  const l = (body && typeof body === 'object' ? (body as { scoringLock?: Partial<ScoringLock> }).scoringLock : null) ?? {};
  return { mode: l.mode === 'locked' || l.mode === 'sponsor' ? l.mode : 'open', note: String(l.note ?? ''), by: l.by ?? null, at: l.at ?? null };
};
/** An action in the library with how often people accepted it (decisive decisions on items recommending it). */
export type ActionRow = LibraryAction & { judged: number; accepted: number };

export type SetupState = {
  version: { versionNo: number; activatedAt: Date | null; activatedBy: string | null; engineVersion: string };
  sections: Record<ConfigSection, SectionState>;
  signals: { off: string[]; custom: AddedType[]; problem: string | null };
  /** Newest first: the audit trail of the signal switches. */
  changes: SignalChange[];
  versions: ConfigVersionRow[];
  /** Tags seen in scored signal files that are not signal types yet: candidates to add. */
  unknownTags: { tag: string; rows: number }[];
  /** The rubric, personas, knock-outs and signal weights in use; `problem` when the stored ones can't be used. */
  scoring: { settings: ScoringSettings; lock: ScoringLock; problem: string | null; changes: { at: Date; by: string; versionNo: number; kind: string; changes: string[] }[] };
  actions: { list: ActionRow[]; problem: string | null };
  measurement: G.ValidationSettings;
};

const nameOf = sql<string | null>`coalesce(${users.displayName}, 'A former member')`;

async function activeVersion(scope: TenantScope, lock = false) {
  const q = scope.tx.select().from(configVersions)
    .where(and(eq(configVersions.businessUnitId, scope.ctx.businessUnitId), eq(configVersions.status, 'active')));
  const [v] = lock ? await q.for('update') : await q;
  if (!v) throw conflict('This business unit has no active configuration. Ask the platform admin to set it up.');
  return v;
}

export async function getSetup(scope: TenantScope): Promise<SetupState> {
  const v = await activeVersion(scope);
  const [activator] = v.activatedBy ? await scope.tx.select({ name: users.displayName }).from(users).where(eq(users.id, v.activatedBy)) : [];
  const signoffs = await scope.tx.select({ section: configSignoffs.section, action: configSignoffs.action, note: configSignoffs.note, at: configSignoffs.createdAt, by: nameOf })
    .from(configSignoffs).leftJoin(users, eq(users.id, configSignoffs.createdBy))
    .where(eq(configSignoffs.businessUnitId, scope.ctx.businessUnitId)).orderBy(asc(configSignoffs.seq));
  const sections = Object.fromEntries(CONFIG_SECTIONS.map(s => [s, { status: 'review', by: null, at: null, note: '' } as SectionState])) as Record<ConfigSection, SectionState>;
  for (const r of signoffs) sections[r.section as ConfigSection] = { status: r.action === 'sign_off' ? 'done' : 'review', by: r.by, at: r.at, note: r.note };
  const changeRows = await scope.tx.select({ type: signalTypeChanges.signalType, change: signalTypeChanges.change, reason: signalTypeChanges.reason, at: signalTypeChanges.createdAt, by: nameOf, versionNo: configVersions.versionNo })
    .from(signalTypeChanges).innerJoin(configVersions, eq(configVersions.id, signalTypeChanges.configVersionId)).leftJoin(users, eq(users.id, signalTypeChanges.createdBy))
    .where(eq(signalTypeChanges.businessUnitId, scope.ctx.businessUnitId)).orderBy(desc(signalTypeChanges.seq));
  const changes = changeRows.map(r => ({ ...r, by: r.by ?? 'A former member', change: r.change as SignalChange['change'] }));
  let off: string[] = [], custom: CustomSignalType[] = [], problem: string | null = null;
  try { ({ off, custom } = signalSettingsOf(v.body)); } catch (err) { problem = `The signal settings can't be used: ${(err as Error).message}.`; }
  const addedBy = (name: string) => changes.find(c => c.type === name && c.change === 'added');
  const versionRows = await scope.tx.select({ id: configVersions.id, versionNo: configVersions.versionNo, status: configVersions.status, activatedAt: configVersions.activatedAt, engineVersion: configVersions.engineVersion, by: nameOf })
    .from(configVersions).leftJoin(users, eq(users.id, configVersions.activatedBy))
    .where(eq(configVersions.businessUnitId, scope.ctx.businessUnitId)).orderBy(desc(configVersions.versionNo));
  const word = { off: 'switched off', on: 'switched on', added: 'added', removed: 'removed' } as const;
  // Changes to the success-gate settings (Analytics › Validation) make versions too.
  const gateChanges = await scope.tx.select({ versionNo: configVersions.versionNo, changes: configChanges.changes }).from(configChanges)
    .innerJoin(configVersions, eq(configVersions.id, configChanges.configVersionId)).where(eq(configChanges.businessUnitId, scope.ctx.businessUnitId));
  const monitoring = await signalMonitoring(scope);
  let scoring: ScoringSettings = DEFAULT_SCORING, scoringProblem: string | null = null;
  try { scoring = scoringSettingsOf(v.body); } catch (err) { scoringProblem = `The scoring settings can't be used: ${(err as Error).message}.`; }
  let library: LibraryAction[] = [], actionsProblem: string | null = null;
  try { library = actionsOf(v.body); } catch (err) { actionsProblem = `The action library can't be used: ${(err as Error).message}.`; }
  const judged = await scope.tx.select({ action: decisionLog.action, n: sql<number>`count(*)::int`, a: sql<number>`(count(*) filter (where ${decisionLog.accepted}))::int` })
    .from(decisionLog).where(and(eq(decisionLog.businessUnitId, scope.ctx.businessUnitId), eq(decisionLog.decisive, true))).groupBy(decisionLog.action);
  const settingChanges = await scope.tx.select({ at: configChanges.createdAt, by: nameOf, versionNo: configVersions.versionNo, kind: configChanges.kind, changes: configChanges.changes })
    .from(configChanges).innerJoin(configVersions, eq(configVersions.id, configChanges.configVersionId)).leftJoin(users, eq(users.id, configChanges.createdBy))
    .where(and(eq(configChanges.businessUnitId, scope.ctx.businessUnitId), inArray(configChanges.kind, ['scoring', 'lock', 'actions', 'validation']))).orderBy(desc(configChanges.seq)).limit(100);
  return {
    version: { versionNo: v.versionNo, activatedAt: v.activatedAt, activatedBy: activator?.name ?? null, engineVersion: v.engineVersion },
    sections,
    signals: { off, custom: custom.map(c => ({ ...c, by: addedBy(c.name)?.by ?? null, at: addedBy(c.name)?.at ?? null })), problem },
    changes,
    versions: versionRows.map(r => ({ versionNo: r.versionNo, status: r.status, activatedAt: r.activatedAt, activatedBy: r.by, engineVersion: r.engineVersion,
      changes: [...changes.filter(c => c.versionNo === r.versionNo).map(c => `${c.type} ${word[c.change]}`), ...gateChanges.filter(c => c.versionNo === r.versionNo).flatMap(c => c.changes)] })),
    unknownTags: monitoring.types.filter(t => t.status === 'Not a known tag').map(t => ({ tag: t.type, rows: t.records })),
    scoring: { settings: scoring, lock: lockOf(v.body), problem: scoringProblem, changes: settingChanges.map(c => ({ ...c, by: c.by ?? 'A former member' })) },
    actions: { list: library.map(a => { const j = judged.find(x => x.action.toLowerCase() === a.name.toLowerCase()); return { ...a, judged: j?.n ?? 0, accepted: j?.a ?? 0 }; }), problem: actionsProblem },
    measurement: G.validationOf(v.body),
  };
}

/* ─── Sign-offs ─── */

export async function signOffSection(scope: TenantScope, actor: Actor, section: ConfigSection, action: 'sign_off' | 'reopen', note = ''): Promise<void> {
  const v = await activeVersion(scope);
  const [last] = await scope.tx.select({ action: configSignoffs.action }).from(configSignoffs)
    .where(and(eq(configSignoffs.businessUnitId, scope.ctx.businessUnitId), eq(configSignoffs.section, section))).orderBy(desc(configSignoffs.seq)).limit(1);
  const done = last?.action === 'sign_off';
  if (action === 'sign_off' && done) throw conflict('This section is already signed off.');
  if (action === 'reopen' && !done) throw conflict('This section is not signed off, so there is nothing to reopen.');
  if (action === 'sign_off' && (section === 'rubric' || section === 'personas')) {
    try { scoringSettingsOf(v.body); } catch (err) { throw conflict(`The scoring settings can't be used: ${(err as Error).message}. Fix them first.`); }
  }
  if (action === 'sign_off' && section === 'actions') {
    try { actionsOf(v.body); } catch (err) { throw conflict(`The action library can't be used: ${(err as Error).message}. Fix it first.`); }
  }
  if (action === 'sign_off' && section === 'signals') {
    try { signalSettingsOf(v.body); } catch (err) { throw conflict(`The signal settings can't be used: ${(err as Error).message}. Fix them first.`); }
  }
  await scope.tx.insert(configSignoffs).values({ businessUnitId: scope.ctx.businessUnitId, configVersionId: v.id, section, action, note, createdBy: actor.userId });
  await recordAudit(scope, { action: `config.${action === 'sign_off' ? 'signed_off' : 'reopened'}`, actorRole: actor.role, targetType: 'config_version', targetId: v.id, details: { section, versionNo: v.versionNo } });
  logger.info({ event: 'config.signoff', section, action, versionNo: v.versionNo }, 'Setup section ' + action);
}

/* ─── Signal switches and added types: each makes the next configuration version ─── */

/** Retires the active version and activates the next one with the changed body; returns it. */
export async function nextVersion(scope: TenantScope, actor: Actor, change: (body: Record<string, unknown>) => Record<string, unknown>) {
  const cur = await activeVersion(scope, true);
  const [{ top }] = await scope.tx.select({ top: max(configVersions.versionNo) }).from(configVersions).where(eq(configVersions.businessUnitId, scope.ctx.businessUnitId));
  await scope.tx.update(configVersions).set({ status: 'retired' }).where(eq(configVersions.id, cur.id));
  const [next] = await scope.tx.insert(configVersions).values({
    businessUnitId: scope.ctx.businessUnitId, versionNo: (top ?? cur.versionNo) + 1, status: 'active', body: change(cur.body as Record<string, unknown>), engineVersion: ENGINE_VERSION,
    createdBy: actor.userId, activatedAt: sql`now()`, activatedBy: actor.userId,
  }).returning({ id: configVersions.id, versionNo: configVersions.versionNo });
  return { ...next, previous: cur.versionNo };
}

async function currentSettings(scope: TenantScope) {
  const v = await activeVersion(scope);
  try { return signalSettingsOf(v.body); }
  catch (err) { throw conflict(`The signal settings can't be used: ${(err as Error).message}.`); }
}

/** The types that can be switched: those that are scored (knock-outs and "not scored" types are fixed rules). */
function switchable(name: string, custom: CustomSignalType[]): boolean {
  const c = CONFIG.signalTypes[name];
  return c ? !c.knockout && !c.reject : custom.some(x => x.name === name);
}

export async function switchSignal(scope: TenantScope, actor: Actor, input: { type: string; on: boolean; reason: string }): Promise<{ versionNo: number }> {
  const { off, custom } = await currentSettings(scope);
  if (!switchable(input.type, custom)) throw badRequest(`"${input.type}" can't be switched: only scored signal types can.`, { type: ['Not a signal type that can be switched'] });
  const isOff = off.includes(input.type);
  if (input.on && !isOff) throw conflict(`${input.type} is already on.`);
  if (!input.on && isOff) throw conflict(`${input.type} is already off.`);
  const reason = input.reason.trim();
  if (!input.on && !reason) throw badRequest('Say why, so the audit trail explains it.', { reason: ['Say why, so the audit trail explains it.'] });
  const nextOff = input.on ? off.filter(t => t !== input.type) : [...off, input.type];
  const v = await nextVersion(scope, actor, body => ({ ...body, signalsOff: nextOff }));
  await scope.tx.insert(signalTypeChanges).values({ businessUnitId: scope.ctx.businessUnitId, configVersionId: v.id, signalType: input.type, change: input.on ? 'on' : 'off', reason, createdBy: actor.userId });
  await recordAudit(scope, { action: 'config.signal_switched', actorRole: actor.role, targetType: 'config_version', targetId: v.id, details: { type: input.type, on: input.on, versionNo: v.versionNo } });
  logger.info({ event: 'config.signal_switched', on: input.on, versionNo: v.versionNo }, 'Signal type switched');
  return { versionNo: v.versionNo };
}

export async function addSignalType(scope: TenantScope, actor: Actor, def: CustomSignalType): Promise<{ versionNo: number }> {
  const { off, custom } = await currentSettings(scope);
  let next: { off: string[]; custom: CustomSignalType[] };
  try { next = signalSettingsOf({ signalsOff: off, signalsCustom: [...custom, def] }); }
  catch (err) { throw badRequest((err as Error).message, { name: [(err as Error).message] }); }
  const added = next.custom[next.custom.length - 1];
  const v = await nextVersion(scope, actor, body => ({ ...body, signalsCustom: next.custom }));
  await scope.tx.insert(signalTypeChanges).values({ businessUnitId: scope.ctx.businessUnitId, configVersionId: v.id, signalType: added.name, change: 'added', definition: added, createdBy: actor.userId });
  await reopenSignals(scope, actor, v.id, `${added.name} added`);
  await recordAudit(scope, { action: 'config.signal_added', actorRole: actor.role, targetType: 'config_version', targetId: v.id, details: { type: added.name, versionNo: v.versionNo } });
  logger.info({ event: 'config.signal_added', versionNo: v.versionNo }, 'Signal type added');
  return { versionNo: v.versionNo };
}

export async function removeSignalType(scope: TenantScope, actor: Actor, input: { name: string; reason: string }): Promise<{ versionNo: number }> {
  const { off, custom } = await currentSettings(scope);
  if (!custom.some(c => c.name === input.name)) {
    throw CONFIG.signalTypes[input.name] ? badRequest(`${input.name} is one of the starting types: switch it off instead.`) : conflict(`"${input.name}" is not an added signal type.`);
  }
  const v = await nextVersion(scope, actor, body => ({ ...body, signalsOff: off.filter(t => t !== input.name), signalsCustom: custom.filter(c => c.name !== input.name) }));
  await scope.tx.insert(signalTypeChanges).values({ businessUnitId: scope.ctx.businessUnitId, configVersionId: v.id, signalType: input.name, change: 'removed', reason: input.reason.trim(), createdBy: actor.userId });
  await reopenSignals(scope, actor, v.id, `${input.name} removed`);
  await recordAudit(scope, { action: 'config.signal_removed', actorRole: actor.role, targetType: 'config_version', targetId: v.id, details: { type: input.name, versionNo: v.versionNo } });
  logger.info({ event: 'config.signal_removed', versionNo: v.versionNo }, 'Signal type removed');
  return { versionNo: v.versionNo };
}

/** Adding or removing a type changes what the Signals section says, so a signed-off section goes back to review. */
async function reopenSignals(scope: TenantScope, actor: Actor, versionId: string, note: string) {
  await reopen(scope, actor, versionId, 'signals', note);
}
/** A change to a signed-off section sends it back to review, with what changed as the note. */
async function reopen(scope: TenantScope, actor: Actor, versionId: string, section: ConfigSection, note: string) {
  const [last] = await scope.tx.select({ action: configSignoffs.action }).from(configSignoffs)
    .where(and(eq(configSignoffs.businessUnitId, scope.ctx.businessUnitId), eq(configSignoffs.section, section))).orderBy(desc(configSignoffs.seq)).limit(1);
  if (last?.action === 'sign_off') await scope.tx.insert(configSignoffs).values({ businessUnitId: scope.ctx.businessUnitId, configVersionId: versionId, section, action: 'reopen', note: note.slice(0, 500), createdBy: actor.userId });
}

/* ─── Scoring settings: the rubric and its parts, personas, knock-outs and region, signal weights (30 Oct 2026) ─── */

export type ScoringInput = { settings: unknown; reason: string; sponsor?: { name: string; note: string } | null };

export async function saveScoring(scope: TenantScope, actor: Actor, input: ScoringInput): Promise<{ versionNo: number; changes: string[] }> {
  const cur = await activeVersion(scope, true);
  const lock = lockOf(cur.body);
  if (lock.mode === 'locked') throw conflict(`The scoring settings are locked for the measurement weeks${lock.note ? ` (${lock.note})` : ''}. Unlock them first.`);
  const sponsor = input.sponsor && input.sponsor.name.trim() ? { name: input.sponsor.name.trim().slice(0, 120), note: input.sponsor.note.trim().slice(0, 500) } : null;
  if (lock.mode === 'sponsor' && !sponsor) throw badRequest("During the measurement weeks a change needs the sponsor's sign-off: say who signed it off.", { sponsor: ['Name the sponsor who signed this change off.'] });
  const parsed = ScoringSettingsInput.safeParse(input.settings);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'The scoring settings are not valid.', { settings: parsed.error.issues.slice(0, 5).map(i => i.message) });
  const next = parsed.data as ScoringSettings;
  let before: ScoringSettings;
  try { before = scoringSettingsOf(cur.body); } catch { before = DEFAULT_SCORING; }
  const changes = scoringChanges(before, next);
  if (!changes.length) throw conflict('Nothing changed: these are the scoring settings in use.');
  const reason = input.reason.trim();
  if (!reason) throw badRequest('Say why, so the audit trail explains it.', { reason: ['Say why, so the audit trail explains it.'] });
  const words = [...changes, ...(sponsor ? [`Signed off by the sponsor: ${sponsor.name}${sponsor.note ? ` (${sponsor.note})` : ''}`] : []), `Why: ${reason.slice(0, 300)}`];
  const v = await nextVersion(scope, actor, body => ({ ...body, scoring: next }));
  await scope.tx.insert(configChanges).values({ businessUnitId: scope.ctx.businessUnitId, configVersionId: v.id, kind: 'scoring', changes: words, before, after: next, createdBy: actor.userId });
  // Each signed-off section the change touches goes back to review.
  const same = (k: keyof ScoringSettings) => JSON.stringify(before[k]) === JSON.stringify(next[k]);
  if (!(['parts', 'fitFloor', 'tiers', 'sizeBands', 'verticals', 'knockouts', 'countries'] as const).every(same)) await reopen(scope, actor, v.id, 'rubric', changes.join('; '));
  if (!same('personas')) await reopen(scope, actor, v.id, 'personas', 'Personas changed');
  if (!same('signals')) await reopen(scope, actor, v.id, 'signals', 'Signal weights changed');
  await recordAudit(scope, { action: 'config.scoring_changed', actorRole: actor.role, targetType: 'config_version', targetId: v.id, details: { versionNo: v.versionNo, changes: changes.length, sponsor: !!sponsor } });
  logger.info({ event: 'config.scoring_changed', versionNo: v.versionNo, changes: changes.length }, 'Scoring settings changed');
  return { versionNo: v.versionNo, changes };
}

const LOCK_WORDS: Record<ScoringLock['mode'], string> = { open: 'Scoring settings unlocked', locked: 'Scoring settings locked for the measurement weeks', sponsor: "Scoring settings open only with the sponsor's sign-off" };

export async function setScoringLock(scope: TenantScope, actor: Actor, input: { mode: ScoringLock['mode']; note: string }): Promise<{ versionNo: number }> {
  const cur = await activeVersion(scope, true);
  if (lockOf(cur.body).mode === input.mode) throw conflict(`${LOCK_WORDS[input.mode]} already.`);
  const [me] = await scope.tx.select({ name: users.displayName }).from(users).where(eq(users.id, actor.userId));
  const lock: ScoringLock = { mode: input.mode, note: input.note.trim().slice(0, 300), by: me?.name ?? null, at: new Date().toISOString() };
  const v = await nextVersion(scope, actor, body => ({ ...body, scoringLock: lock }));
  await scope.tx.insert(configChanges).values({ businessUnitId: scope.ctx.businessUnitId, configVersionId: v.id, kind: 'lock', changes: [LOCK_WORDS[input.mode] + (lock.note ? `: ${lock.note}` : '')],
    before: lockOf(cur.body), after: lock, createdBy: actor.userId });
  await recordAudit(scope, { action: 'config.scoring_lock', actorRole: actor.role, targetType: 'config_version', targetId: v.id, details: { versionNo: v.versionNo, mode: input.mode } });
  return { versionNo: v.versionNo };
}

export type TierPreview = {
  run: { id: string; name: string; asOf: string } | null; accounts: number; changed: number;
  moves: { from: Tier; to: Tier; n: number }[]; examples: { account: string; from: Tier; to: Tier; fitBefore: number | null; fitAfter: number | null }[];
};

/** What a change would do to the newest scored list, before it is saved: each account's tier worked out again from the
 *  stored accounts, contacts and qualified signals with the proposed settings (fit, signal weights, fit floor, tiers).
 *  Knock-outs, personas and vertical words apply when a lead file is processed, so they don't move this preview. */
export async function previewScoring(scope: TenantScope, input: unknown): Promise<TierPreview> {
  const parsed = ScoringSettingsInput.safeParse(input);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'The scoring settings are not valid.', { settings: parsed.error.issues.slice(0, 5).map(i => i.message) });
  const s = parsed.data as ScoringSettings;
  const [run] = await scope.tx.select({ id: scoringRuns.id, name: sql<string>`coalesce(${scoringRuns.name}, ${leadLists.name})`, asOf: scoringRuns.asOf, custom: scoringRuns.signalsCustom })
    .from(scoringRuns).innerJoin(leadLists, eq(leadLists.id, scoringRuns.listId))
    .where(and(eq(scoringRuns.businessUnitId, scope.ctx.businessUnitId), sql`exists (select 1 from account_scores a where a.run_id = ${scoringRuns.id})`))
    .orderBy(desc(scoringRuns.createdAt)).limit(1);
  if (!run) return { run: null, accounts: 0, changed: 0, moves: [], examples: [] };
  const scored = await scope.tx.select({ accountId: accountScores.accountId, tier: accountScores.tier, result: accountScores.data, account: accounts.data })
    .from(accountScores).innerJoin(accounts, eq(accounts.id, accountScores.accountId)).where(eq(accountScores.runId, run.id));
  const people = await scope.tx.select({ accountId: contacts.accountId, data: contacts.data }).from(contacts)
    .where(inArray(contacts.accountId, sql`(select account_id from account_scores where run_id = ${run.id})`));
  const sigs = await scope.tx.select({ accountId: signals.accountId, data: signals.data }).from(signals)
    .where(and(eq(signals.runId, run.id), or(eq(signals.status, 'Qualified'), and(eq(signals.status, 'Not used'), sql`${signals.data}->>'reason' like 'Qualified,%'`))));
  const types = signalTypesFor((run.custom ?? []) as CustomSignalType[], s.signals);
  const byAccount = <T extends { accountId: string | null }>(rows: T[]) => rows.reduce((m, r) => m.set(r.accountId ?? '', [...(m.get(r.accountId ?? '') ?? []), r]), new Map<string, T[]>());
  const cs = byAccount(people), ss = byAccount(sigs);
  const moves = new Map<string, number>(), examples: TierPreview['examples'] = [];
  for (const a of scored) {
    const from = a.tier as Tier, res = a.result as { excluded?: boolean; fit?: number };
    if (res.excluded || from === 'Excluded') continue;
    const fit = fitFor(a.account as Account, (cs.get(a.accountId) ?? []).map(c => c.data as Contact), s);
    const weights = (ss.get(a.accountId) ?? []).map(r => r.data as Signal).flatMap(sg => {
      const t = types[sg.type];
      return t && !t.knockout && !t.reject && sg.age !== undefined && sg.age < (t.zero ?? 0) ? [(t.tier ?? 0) * (t.strength ?? 0) * decayFactor(t as { full: number; zero: number }, sg.age)] : [];
    });
    const score = round1(fit.fit * (stack(weights) / CONFIG.timingMax * 100) / 100);
    const to: Tier = fit.belowFloor ? 'Below fit floor' : tierFor(score, weights.length > 0, s.tiers);
    if (to === from) continue;
    moves.set(`${from}|${to}`, (moves.get(`${from}|${to}`) ?? 0) + 1);
    if (examples.length < 12) examples.push({ account: (a.account as Account).name, from, to, fitBefore: res.fit ?? null, fitAfter: fit.fit });
  }
  const list = [...moves].map(([k, n]) => { const [from, to] = k.split('|') as [Tier, Tier]; return { from, to, n }; }).sort((x, y) => y.n - x.n);
  return { run: { id: run.id, name: run.name, asOf: run.asOf }, accounts: scored.length, changed: list.reduce((t, m) => t + m.n, 0), moves: list, examples };
}

/* ─── The action library (30 Oct 2026; was the read-only CONFIG.segmentLibrary) ─── */

export async function saveActions(scope: TenantScope, actor: Actor, input: { actions: unknown; reason: string }): Promise<{ versionNo: number; changes: string[] }> {
  const cur = await activeVersion(scope, true);
  const parsed = ActionsInput.safeParse(input.actions);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'The action library is not valid.', { actions: parsed.error.issues.slice(0, 5).map(i => i.message) });
  let before: LibraryAction[];
  try { before = actionsOf(cur.body); } catch { before = []; }
  const changes = actionChanges(before, parsed.data);
  if (!changes.length) throw conflict('Nothing changed: this is the action library in use.');
  const reason = input.reason.trim();
  const v = await nextVersion(scope, actor, body => ({ ...body, actions: parsed.data }));
  await scope.tx.insert(configChanges).values({ businessUnitId: scope.ctx.businessUnitId, configVersionId: v.id, kind: 'actions', changes: [...changes, ...(reason ? [`Why: ${reason.slice(0, 300)}`] : [])],
    before, after: parsed.data, createdBy: actor.userId });
  await reopen(scope, actor, v.id, 'actions', changes.join('; '));
  await recordAudit(scope, { action: 'config.actions_changed', actorRole: actor.role, targetType: 'config_version', targetId: v.id, details: { versionNo: v.versionNo, changes: changes.length } });
  logger.info({ event: 'config.actions_changed', versionNo: v.versionNo, changes: changes.length }, 'Action library changed');
  return { versionNo: v.versionNo, changes };
}

/* ─── Export: the active configuration as JSON, with what was signed off ─── */

export async function exportConfig(scope: TenantScope, actor: Actor): Promise<{ fileName: string; json: string }> {
  const v = await activeVersion(scope);
  const setup = await getSetup(scope);
  const out = {
    exportedAt: new Date().toISOString(),
    version: { number: v.versionNo, engineVersion: v.engineVersion, activatedAt: v.activatedAt, activatedBy: setup.version.activatedBy },
    sections: setup.sections,
    signals: { off: setup.signals.off, added: setup.signals.custom.map(({ by: _b, at: _a, ...c }) => { void _b; void _a; return c; }) },
    signalChanges: setup.changes,
    configuration: v.body,
  };
  await recordAudit(scope, { action: 'config.exported', actorRole: actor.role, targetType: 'config_version', targetId: v.id, details: { versionNo: v.versionNo } });
  return { fileName: `demandai-config-v${v.versionNo}.json`, json: JSON.stringify(out, null, 2) };
}
