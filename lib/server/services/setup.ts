// Setup on the server (G-002, D-13, D-41): the unit's configuration versions, sign-offs per section and the signal
// switches. The rubric, fit floor and personas are fixed for the pilot (D-13) and shown read-only; an Admin may switch
// signal types off or on (with a reason) and add or remove types. Each signal change makes a new configuration
// version, so new runs are stamped with it and earlier runs keep the version they used.
import 'server-only';
import { and, asc, desc, eq, max, sql } from 'drizzle-orm';
import { CONFIG, type CustomSignalType } from '../../demandai-engine.ts';
import { ENGINE_VERSION } from '../../engine/config.ts';
import { CONFIG_SECTIONS, configChanges, configSignoffs, configVersions, signalTypeChanges, users, type ConfigSection } from '../db/schema.ts';
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

export type SetupState = {
  version: { versionNo: number; activatedAt: Date | null; activatedBy: string | null; engineVersion: string };
  sections: Record<ConfigSection, SectionState>;
  signals: { off: string[]; custom: AddedType[]; problem: string | null };
  /** Newest first: the audit trail of the signal switches. */
  changes: SignalChange[];
  versions: ConfigVersionRow[];
  /** Tags seen in scored signal files that are not signal types yet: candidates to add. */
  unknownTags: { tag: string; rows: number }[];
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
  return {
    version: { versionNo: v.versionNo, activatedAt: v.activatedAt, activatedBy: activator?.name ?? null, engineVersion: v.engineVersion },
    sections,
    signals: { off, custom: custom.map(c => ({ ...c, by: addedBy(c.name)?.by ?? null, at: addedBy(c.name)?.at ?? null })), problem },
    changes,
    versions: versionRows.map(r => ({ versionNo: r.versionNo, status: r.status, activatedAt: r.activatedAt, activatedBy: r.by, engineVersion: r.engineVersion,
      changes: [...changes.filter(c => c.versionNo === r.versionNo).map(c => `${c.type} ${word[c.change]}`), ...gateChanges.filter(c => c.versionNo === r.versionNo).flatMap(c => c.changes)] })),
    unknownTags: monitoring.types.filter(t => t.status === 'Not a known tag').map(t => ({ tag: t.type, rows: t.records })),
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
  if (action === 'sign_off' && section === 'rubric' && CONFIG.rubric.reduce((n, r) => n + r.weight, 0) !== 100) throw conflict('The weights must add up to 100% before sign-off.');
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
  const [last] = await scope.tx.select({ action: configSignoffs.action }).from(configSignoffs)
    .where(and(eq(configSignoffs.businessUnitId, scope.ctx.businessUnitId), eq(configSignoffs.section, 'signals'))).orderBy(desc(configSignoffs.seq)).limit(1);
  if (last?.action === 'sign_off') await scope.tx.insert(configSignoffs).values({ businessUnitId: scope.ctx.businessUnitId, configVersionId: versionId, section: 'signals', action: 'reopen', note, createdBy: actor.userId });
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
