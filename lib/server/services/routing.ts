// Lead routing on the server (D-34, success area 4: priority, geography, industry, business unit). A unit's rules, in
// order, say who owns an account the lead file gives no owner (applied when prospects are handed off, so the work lands
// in that rep's queue) and which business unit it belongs to (a suggestion a manager acts on). A manager who is also a
// manager of the other unit can move an account there: its rows, as corrected, go to that unit as a lead file and
// arrive as a saved list; this unit stops handing it off. Both sides commit together and are audited.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import { CONFIG, LEAD_COLUMNS, readTable, VERTICAL_CHOICES } from '../../demandai-engine.ts';
import { applyCorrections } from '../../engine/corrections.ts';
import { describeRule, matchRule, ROUTING_TIERS, ruleProblem, type RoutingRule } from '../../engine/routing.ts';
import { LEAD_SHEET } from '../../engine/sheets.ts';
import type { Account, Tier } from '../../../types/demandai';
import { accounts, accountScores, accountTransfers, businessUnitMembers, businessUnits, contacts, leadLists, routingRules, scoringRuns, users } from '../db/schema.ts';
import { inOtherUnit, type TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { readUpload, UploadReadError } from '../uploads/parse.ts';
import { badRequest, conflict, forbidden, HttpError, notFound } from '../http/errors.ts';
import { logger } from '../logger.ts';
import { correctionsOf, isManager, ownerOnly, type Actor } from './lists.ts';
import { getMapping } from './mappings.ts';
import { csvVerbatim, loadUpload, receiveUpload, type UploadLimits } from './uploads.ts';
import { ownerNames, unitReps } from './users.ts';

const byName = sql<string>`coalesce(${users.displayName}, 'A former member')`;

/* ─── The rules ─── */

export type RuleRow = RoutingRule & { description: string; targetUnit: string | null; ownerName: string | null; by: string; at: Date };
export type RuleInput = { name: string; countries: string[]; verticals: string[]; tiers: string[]; assignOwner: string | null; targetBusinessUnitId: string | null; active: boolean };

export async function rulesOf(scope: TenantScope): Promise<RoutingRule[]> {
  const rows = await scope.tx.select().from(routingRules).where(eq(routingRules.businessUnitId, scope.ctx.businessUnitId)).orderBy(asc(routingRules.position));
  return rows.map(r => ({ id: r.id, position: r.position, name: r.name, countries: r.countries, verticals: r.verticals, tiers: r.tiers,
    assignOwner: r.assignOwner, targetBusinessUnitId: r.targetBusinessUnitId, active: r.active }));
}

async function activeUnits(scope: TenantScope) {
  return scope.tx.select({ id: businessUnits.id, name: businessUnits.name, code: businessUnits.code }).from(businessUnits).where(eq(businessUnits.status, 'active')).orderBy(asc(businessUnits.name));
}

/** The rules with what they say in words, and the choices for writing one. */
export async function getRules(scope: TenantScope) {
  const rows = await scope.tx.select({ r: routingRules, by: byName }).from(routingRules).leftJoin(users, eq(users.id, routingRules.updatedBy))
    .where(eq(routingRules.businessUnitId, scope.ctx.businessUnitId)).orderBy(asc(routingRules.position));
  const units = await activeUnits(scope);
  const names = await ownerNames(scope, rows.map(x => x.r.assignOwner ?? ''));
  const rules: RuleRow[] = rows.map(({ r, by }) => ({
    id: r.id, position: r.position, name: r.name, countries: r.countries, verticals: r.verticals, tiers: r.tiers, assignOwner: r.assignOwner,
    targetBusinessUnitId: r.targetBusinessUnitId, active: r.active, description: describeRule(r),
    targetUnit: units.find(u => u.id === r.targetBusinessUnitId)?.name ?? null, ownerName: r.assignOwner ? names.get(r.assignOwner) ?? r.assignOwner : null, by, at: r.updatedAt,
  }));
  return {
    rules,
    options: { countries: CONFIG.pilotCountries, verticals: VERTICAL_CHOICES, tiers: ROUTING_TIERS as string[], reps: await unitReps(scope),
      units: units.filter(u => u.id !== scope.ctx.businessUnitId) },
  };
}

function requireManager(actor: Actor) {
  if (!isManager(actor.role)) throw forbidden('Only a sales manager or an admin can change the routing rules.');
}

async function checkRule(scope: TenantScope, input: RuleInput): Promise<RuleInput> {
  const clean = (xs: string[]) => [...new Set(xs.map(x => x.trim()).filter(Boolean))];
  const r = { ...input, name: input.name.trim(), countries: clean(input.countries), verticals: clean(input.verticals), tiers: clean(input.tiers),
    assignOwner: input.assignOwner?.trim().toLowerCase() || null, targetBusinessUnitId: input.targetBusinessUnitId || null };
  const problem = ruleProblem(r);
  if (problem) throw badRequest(problem);
  const unknown = r.verticals.find(v => !VERTICAL_CHOICES.includes(v));
  if (unknown) throw badRequest(`"${unknown}" is not a vertical.`, { verticals: ['Pick from the list.'] });
  if (r.assignOwner && !(await unitReps(scope)).some(x => x.email === r.assignOwner)) throw badRequest('Pick one of the unit’s sales reps as the owner.', { assignOwner: ['Pick a sales rep.'] });
  if (r.targetBusinessUnitId) {
    if (r.targetBusinessUnitId === scope.ctx.businessUnitId) throw badRequest('Pick another business unit: matching accounts already belong to this one.', { targetBusinessUnitId: ['Pick another unit.'] });
    if (!(await activeUnits(scope)).some(u => u.id === r.targetBusinessUnitId)) throw badRequest('That business unit is not there, or is archived.', { targetBusinessUnitId: ['Pick an active unit.'] });
  }
  return r;
}

export async function saveRule(scope: TenantScope, actor: Actor, id: string | null, input: RuleInput): Promise<{ id: string }> {
  requireManager(actor);
  const r = await checkRule(scope, input);
  let ruleId = id;
  if (id) {
    const [done] = await scope.tx.update(routingRules).set({ ...r, updatedAt: sql`now()`, updatedBy: actor.userId })
      .where(and(eq(routingRules.id, id), eq(routingRules.businessUnitId, scope.ctx.businessUnitId))).returning({ id: routingRules.id });
    if (!done) throw notFound('That routing rule is not there any more.');
  } else {
    const [m] = await scope.tx.select({ n: max(routingRules.position) }).from(routingRules).where(eq(routingRules.businessUnitId, scope.ctx.businessUnitId));
    const [row] = await scope.tx.insert(routingRules).values({ ...r, businessUnitId: scope.ctx.businessUnitId, position: (m?.n ?? 0) + 1, createdBy: actor.userId, updatedBy: actor.userId })
      .returning({ id: routingRules.id });
    ruleId = row.id;
  }
  await recordAudit(scope, { action: id ? 'routing.rule_changed' : 'routing.rule_added', actorRole: actor.role, targetType: 'routing_rule', targetId: ruleId!,
    details: { countries: r.countries, verticals: r.verticals, tiers: r.tiers, assignsOwner: !!r.assignOwner, targetBusinessUnitId: r.targetBusinessUnitId, active: r.active } });
  return { id: ruleId! };
}

export async function deleteRule(scope: TenantScope, actor: Actor, id: string): Promise<void> {
  requireManager(actor);
  const [done] = await scope.tx.delete(routingRules).where(and(eq(routingRules.id, id), eq(routingRules.businessUnitId, scope.ctx.businessUnitId))).returning({ id: routingRules.id });
  if (!done) throw notFound('That routing rule is not there any more.');
  await recordAudit(scope, { action: 'routing.rule_removed', actorRole: actor.role, targetType: 'routing_rule', targetId: id });
}

/** Moves a rule one place up or down: the first match wins, so order matters. */
export async function moveRule(scope: TenantScope, actor: Actor, id: string, direction: 'up' | 'down'): Promise<void> {
  requireManager(actor);
  const rules = await rulesOf(scope);
  const i = rules.findIndex(r => r.id === id);
  if (i < 0) throw notFound('That routing rule is not there any more.');
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= rules.length) return;
  await scope.tx.update(routingRules).set({ position: rules[j].position, updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(routingRules.id, rules[i].id));
  await scope.tx.update(routingRules).set({ position: rules[i].position, updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(routingRules.id, rules[j].id));
  await recordAudit(scope, { action: 'routing.rule_moved', actorRole: actor.role, targetType: 'routing_rule', targetId: id, details: { direction } });
}

/** For the hand-off: the owner the rules give an account the lead file left without one. */
export async function ruleOwners(scope: TenantScope): Promise<(account: Pick<Account, 'country' | 'vertical'>, tier: string | null | undefined) => string | null> {
  const rules = (await rulesOf(scope)).filter(r => r.assignOwner);
  return (account, tier) => matchRule(rules, account, tier)?.assignOwner ?? null;
}

/* ─── Routing a scored list ─── */

export type RoutingRow = {
  accountId: string; name: string; country: string; vertical: string; tier: Tier; owner: string | null; ownerName: string | null;
  rule: { id: string; name: string } | null; suggestedOwner: string | null; suggestedOwnerName: string | null; suggestedUnit: { id: string; name: string } | null;
  transferred: { to: string; at: Date; by: string } | null;
};

/** Every scored account of a run the caller can see (excluded and below-floor ones left out), with the rule that routes
 *  it, and whether it has been moved to another unit. */
export async function runRouting(scope: TenantScope, runId: string) {
  const [run] = await scope.tx.select({ id: scoringRuns.id }).from(scoringRuns).where(and(eq(scoringRuns.id, runId), eq(scoringRuns.businessUnitId, scope.ctx.businessUnitId)));
  if (!run) throw notFound('That scoring run is not there any more.');
  const rows = await scope.tx.select({ accountId: accounts.id, data: accounts.data, tier: accountScores.tier, owner: accountScores.ownerEmail }).from(accountScores)
    .innerJoin(accounts, eq(accounts.id, accountScores.accountId))
    .where(and(eq(accountScores.runId, runId), inArray(accountScores.tier, ROUTING_TIERS), ownerOnly(scope, accountScores.ownerEmail)));
  const rules = await rulesOf(scope), units = await activeUnits(scope);
  const keys = [...new Set(rows.map(r => (r.data as Account).key))];
  const moved = keys.length ? await scope.tx.select({ key: accountTransfers.accountKey, to: businessUnits.name, at: accountTransfers.createdAt, by: byName }).from(accountTransfers)
    .innerJoin(businessUnits, eq(businessUnits.id, accountTransfers.toBusinessUnitId)).leftJoin(users, eq(users.id, accountTransfers.createdBy))
    .where(and(eq(accountTransfers.businessUnitId, scope.ctx.businessUnitId), inArray(accountTransfers.accountKey, keys))) : [];
  const ruleOwnersList = rules.map(r => r.assignOwner ?? '');
  const names = await ownerNames(scope, [...rows.map(r => r.owner ?? ''), ...ruleOwnersList]);
  const order: Record<string, number> = { A: 0, B: 1, C: 2, 'Watch list': 3 };
  const out: RoutingRow[] = rows.map(r => {
    const a = r.data as Account, rule = matchRule(rules, a, r.tier), t = moved.find(m => m.key === a.key);
    const unit = rule?.targetBusinessUnitId ? units.find(u => u.id === rule.targetBusinessUnitId) ?? null : null;
    return {
      accountId: r.accountId, name: a.name, country: a.country, vertical: a.vertical, tier: r.tier as Tier, owner: r.owner, ownerName: r.owner ? names.get(r.owner) ?? null : null,
      rule: rule ? { id: rule.id, name: rule.name } : null, suggestedOwner: !r.owner ? rule?.assignOwner ?? null : null,
      suggestedOwnerName: !r.owner && rule?.assignOwner ? names.get(rule.assignOwner) ?? rule.assignOwner : null,
      suggestedUnit: unit ? { id: unit.id, name: unit.name } : null, transferred: t ? { to: t.to, at: t.at, by: t.by } : null,
    };
  }).sort((x, y) => order[x.tier] - order[y.tier] || x.name.localeCompare(y.name));
  return { rows: out, rules: rules.length, unassigned: out.filter(r => !r.owner).length, toOtherUnits: out.filter(r => r.suggestedUnit && !r.transferred).length };
}

/* ─── Moving an account to another unit ─── */

/** Moves an account to another business unit where the caller is also a manager: its rows, with this unit's corrections
 *  applied, become a lead file there (checked like any upload, then a saved list); this unit records the move and stops
 *  handing the account off. One transaction for both units. */
export async function transferAccount(scope: TenantScope, actor: Actor, accountId: string, input: { toBusinessUnitId: string; reason: string }, limits: UploadLimits) {
  if (!isManager(actor.role)) throw forbidden('Only a sales manager or an admin can move an account to another unit.');
  const [a] = await scope.tx.select({ id: accounts.id, listId: accounts.listId, data: accounts.data, uploadId: leadLists.uploadId, mappingId: leadLists.mappingId })
    .from(accounts).innerJoin(leadLists, eq(leadLists.id, accounts.listId))
    .where(and(eq(accounts.id, accountId), eq(accounts.businessUnitId, scope.ctx.businessUnitId)));
  if (!a) throw notFound('That account is not there any more.');
  const acc = a.data as Account;
  const to = input.toBusinessUnitId;
  if (to === scope.ctx.businessUnitId) throw badRequest('It is already in this unit. Pick another one.');
  const units = await activeUnits(scope);
  const [source, target] = [units.find(u => u.id === scope.ctx.businessUnitId), units.find(u => u.id === to)];
  if (!target || !source) throw badRequest('That business unit is not there, or is archived.');
  const [member] = await scope.tx.select({ role: businessUnitMembers.role }).from(businessUnitMembers)
    .where(and(eq(businessUnitMembers.businessUnitId, to), eq(businessUnitMembers.userId, actor.userId), eq(businessUnitMembers.status, 'active')));
  if (!member || !['Admin', 'Sales manager'].includes(member.role)) throw forbidden(`You can move accounts only to a unit where you are a sales manager or an admin; you are not one in ${target.name}.`);
  const [already] = await scope.tx.select({ at: accountTransfers.createdAt, to: businessUnits.name }).from(accountTransfers)
    .innerJoin(businessUnits, eq(businessUnits.id, accountTransfers.toBusinessUnitId))
    .where(and(eq(accountTransfers.businessUnitId, scope.ctx.businessUnitId), eq(accountTransfers.accountKey, acc.key)));
  if (already) throw conflict(`${acc.name} was moved to ${already.to} on ${already.at.toISOString().slice(0, 10)}.`);
  // The account's rows as this unit has them: the file as received, with every correction replayed.
  const upload = await loadUpload(scope, a.uploadId);
  if (!upload) throw notFound('The lead file behind it is not there any more.');
  const mapping = a.mappingId ? await getMapping(scope, a.mappingId) : null;
  let read;
  try { read = readUpload(upload.bytes, upload.format, { ...LEAD_SHEET, maxRows: limits.maxRows }); }
  catch (err) { if (err instanceof UploadReadError) throw new HttpError(422, err.code, err.message); throw err; }
  const opts = { file: upload.fileName, sheet: read.sheet, mapping: mapping ?? undefined };
  const fixed = applyCorrections(read.grid, await correctionsOf(scope, a.uploadId), opts);
  const rows = new Set((await scope.tx.select({ row: contacts.rowNo }).from(contacts).where(eq(contacts.accountId, a.id))).map(r => r.row).filter(r => !fixed.removed.has(r)));
  const records = readTable(fixed.grid, { ...opts, columns: LEAD_COLUMNS, required: [], anchor: 'company_name' }).records.filter(r => rows.has(r.__row));
  if (!records.length) throw conflict(`${acc.name} has nobody left on the list to move.`);
  const bytes = Buffer.from(csvVerbatim([LEAD_COLUMNS, ...records.map(r => LEAD_COLUMNS.map(c => r[c] ?? ''))]), 'utf8');
  const reason = input.reason.trim();
  const transferId = randomUUID();
  await scope.tx.insert(accountTransfers).values({ id: transferId, businessUnitId: scope.ctx.businessUnitId, toBusinessUnitId: to, accountKey: acc.key, accountName: acc.name,
    fromListId: a.listId, fromAccountId: a.id, rows: records.length, reason, createdBy: actor.userId });
  await recordAudit(scope, { action: 'account.transferred_out', actorRole: actor.role, targetType: 'account', targetId: a.id, details: { transferId, toBusinessUnitId: to, rows: records.length } });
  const received = await inOtherUnit(scope, { userId: actor.userId, businessUnitId: to, scope: 'all', ownerEmails: [] }, async other => {
    const r = await receiveUpload(other, { kind: 'lead', fileName: `${acc.name} (from ${source.code}).csv`, mediaType: 'text/csv', bytes, sandbox: upload.sandbox, transferId }, limits);
    await recordAudit(other, { action: 'account.transferred_in', actorRole: member.role, targetType: 'upload', targetId: r.uploadId, details: { transferId, fromBusinessUnitId: scope.ctx.businessUnitId, rows: records.length } });
    return r;
  });
  logger.info({ event: 'account.transferred', transferId, toBusinessUnitId: to, rows: records.length }, 'Account moved to another business unit');
  return { transferId, toUnit: target.name, rows: records.length, jobId: received.jobId };
}

/** Accounts moved out of this unit, and into it. */
export async function transfers(scope: TenantScope) {
  const from = sql`(select name from business_units where id = ${accountTransfers.businessUnitId})`;
  const toName = sql`(select name from business_units where id = ${accountTransfers.toBusinessUnitId})`;
  const rows = await scope.tx.select({ id: accountTransfers.id, accountName: accountTransfers.accountName, rows: accountTransfers.rows, reason: accountTransfers.reason,
    at: accountTransfers.createdAt, by: byName, fromUnitId: accountTransfers.businessUnitId, fromUnit: sql<string>`${from}`, toUnit: sql<string>`${toName}` })
    .from(accountTransfers).leftJoin(users, eq(users.id, accountTransfers.createdBy)).orderBy(sql`${accountTransfers.createdAt} desc`);
  return { out: rows.filter(r => r.fromUnitId === scope.ctx.businessUnitId), in: rows.filter(r => r.fromUnitId !== scope.ctx.businessUnitId) };
}
