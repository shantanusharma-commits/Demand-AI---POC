// Platform administration (D-32): business units and their first Admin. A platform admin sees units, not their
// data: everything here is about the units themselves.
import 'server-only';
import { asc, eq, sql } from 'drizzle-orm';
import { businessUnitMembers, businessUnits, configVersions } from '../db/schema.ts';
import type { UserScope } from '../db/tenant.ts';
import { recordPlatformAudit } from '../db/audit.ts';
import { ENGINE_VERSION, serializeConfig } from '../../engine/config.ts';
import { conflict, notFound } from '../http/errors.ts';
import { inviteMember, type LinkOutcome, type UsersDeps } from './users.ts';

export type UnitRow = { id: string; code: string; name: string; status: string; members: number; admins: number; createdAt: Date };

export async function listUnits(scope: UserScope): Promise<UnitRow[]> {
  return scope.tx.select({
    id: businessUnits.id, code: businessUnits.code, name: businessUnits.name, status: businessUnits.status, createdAt: businessUnits.createdAt,
    members: sql<number>`(select count(*)::int from ${businessUnitMembers} m where m.business_unit_id = ${businessUnits.id} and m.status = 'active')`,
    admins: sql<number>`(select count(*)::int from ${businessUnitMembers} m where m.business_unit_id = ${businessUnits.id} and m.status = 'active' and m.role = 'Admin')`,
  }).from(businessUnits).orderBy(asc(businessUnits.name));
}

/** Creates a unit with configuration v1 active (the pilot's fixed starting values, D-13). */
export async function createUnit(scope: UserScope, input: { code: string; name: string }): Promise<{ id: string }> {
  const [exists] = await scope.tx.select({ id: businessUnits.id }).from(businessUnits).where(eq(businessUnits.code, input.code));
  if (exists) throw conflict('A business unit with that code already exists.');
  const [unit] = await scope.tx.insert(businessUnits).values({ code: input.code, name: input.name.trim(), createdBy: scope.ctx.userId, updatedBy: scope.ctx.userId })
    .returning({ id: businessUnits.id });
  // Configuration rows belong to the unit: write them inside its context so row-level security accepts them.
  await scope.tx.execute(sql`select set_config('app.business_unit_id', ${unit.id}, true)`);
  await scope.tx.insert(configVersions).values({
    businessUnitId: unit.id, versionNo: 1, status: 'active', body: serializeConfig(), engineVersion: ENGINE_VERSION,
    createdBy: scope.ctx.userId, activatedAt: new Date(), activatedBy: scope.ctx.userId,
  });
  await scope.tx.execute(sql`select set_config('app.business_unit_id', '', true)`);
  await recordPlatformAudit(scope, { action: 'business_unit.created', targetType: 'business_unit', targetId: unit.id, details: { code: input.code } });
  return unit;
}

/** Invites (or adds) a person as Admin of a unit, acting inside that unit. */
export async function inviteUnitAdmin(deps: UsersDeps, scope: UserScope, businessUnitId: string, input: { email: string; displayName: string }): Promise<{ userId: string } & LinkOutcome> {
  const [unit] = await scope.tx.select({ id: businessUnits.id, status: businessUnits.status }).from(businessUnits).where(eq(businessUnits.id, businessUnitId));
  if (!unit) throw notFound('Business unit not found.');
  if (unit.status !== 'active') throw conflict('That business unit is archived.');
  await scope.tx.execute(sql`select set_config('app.business_unit_id', ${businessUnitId}, true)`);
  const unitScope = { tx: scope.tx, ctx: { userId: scope.ctx.userId, businessUnitId, scope: 'all' as const, ownerEmails: [] } };
  const result = await inviteMember(deps, unitScope, { userId: scope.ctx.userId, role: 'Admin' }, { ...input, role: 'Admin' });
  await scope.tx.execute(sql`select set_config('app.business_unit_id', '', true)`);
  await recordPlatformAudit(scope, { action: 'business_unit.admin_invited', targetType: 'business_unit', targetId: businessUnitId });
  return result;
}
