// Users and roles within the caller's business unit (G-003, D-26, D-32): invite, change role or manager,
// remove from the unit and restore, history, owner aliases, and one-time links. Every change writes the role
// history and an audit entry in the same transaction. Users are never deleted. User data leaves the server only
// through the explicit column lists below, so password data never does.
import 'server-only';
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { can, type BuRole } from '../../auth/permissions.ts';
import { businessUnitMembers, businessUnits, userOwnerAliases, userRoleHistory, users } from '../db/schema.ts';
import type { Db, TenantScope, Tx } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { revokeUserSessions } from '../auth/sessions.ts';
import { INVITE_HOURS, issueToken, linkFor, RESET_MINUTES } from '../auth/tokens.ts';
import { inviteMessage, passwordResetMessage } from '../mail/templates.ts';
import type { Mailer } from '../mail/mailer.ts';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.ts';
import { currentLogContext } from '../logger.ts';

export type UsersDeps = { db: Db; mailer: Mailer; appBaseUrl: string; supportEmail?: string };
export type Actor = { userId: string; role: BuRole };

export type MemberRow = {
  id: string; email: string; displayName: string; accountStatus: string; role: BuRole; membershipStatus: string;
  managerUserId: string | null; managerName: string | null; lastLoginAt: Date | null; invitedAt: Date; aliases: string[];
};

/** A one-time link the Admin can copy when email is off (or failed). Null when the email went out. */
export type LinkOutcome = { emailed: boolean; link: string | null };

const manager = alias(users, 'manager');

export async function listMembers(scope: TenantScope): Promise<MemberRow[]> {
  const rows = await scope.tx
    .select({
      id: users.id, email: users.email, displayName: users.displayName, accountStatus: users.status,
      role: businessUnitMembers.role, membershipStatus: businessUnitMembers.status, managerUserId: businessUnitMembers.managerUserId,
      managerName: manager.displayName, lastLoginAt: users.lastLoginAt, invitedAt: businessUnitMembers.createdAt,
      aliases: sql<string[]>`coalesce((select array_agg(a.owner_email::text order by a.owner_email) from ${userOwnerAliases} a where a.user_id = ${users.id}), '{}')`,
    })
    .from(businessUnitMembers)
    .innerJoin(users, eq(users.id, businessUnitMembers.userId))
    .leftJoin(manager, eq(manager.id, businessUnitMembers.managerUserId))
    .where(eq(businessUnitMembers.businessUnitId, scope.ctx.businessUnitId))
    .orderBy(asc(businessUnitMembers.status), asc(users.displayName));
  return rows.map(r => ({ ...r, role: r.role as BuRole }));
}

async function memberOrNotFound(tx: Tx, businessUnitId: string, userId: string) {
  const [m] = await tx
    .select({ role: businessUnitMembers.role, status: businessUnitMembers.status, managerUserId: businessUnitMembers.managerUserId,
      email: users.email, displayName: users.displayName, accountStatus: users.status, hasPassword: sql<boolean>`${users.passwordHash} is not null` })
    .from(businessUnitMembers)
    .innerJoin(users, eq(users.id, businessUnitMembers.userId))
    .where(and(eq(businessUnitMembers.businessUnitId, businessUnitId), eq(businessUnitMembers.userId, userId)))
    .for('update', { of: businessUnitMembers });
  if (!m) throw notFound('That person is not a member of this business unit.');
  return { ...m, role: m.role as BuRole };
}

/** The last active Admin of a unit can't be demoted or removed (plan §4 item 3, D-26). */
async function assertAnotherAdmin(tx: Tx, businessUnitId: string, leavingUserId: string): Promise<void> {
  const [row] = await tx.select({ n: sql<number>`count(*)::int` })
    .from(businessUnitMembers).innerJoin(users, eq(users.id, businessUnitMembers.userId))
    .where(and(eq(businessUnitMembers.businessUnitId, businessUnitId), eq(businessUnitMembers.role, 'Admin'), eq(businessUnitMembers.status, 'active'),
      eq(users.status, 'active'), ne(businessUnitMembers.userId, leavingUserId)));
  if (row.n === 0) throw conflict('This is the last active Admin of the business unit. Make someone else Admin first.');
}

function assertMayAssign(actor: Actor, from: BuRole | null, to: BuRole | null): void {
  if ((from === 'Admin' || to === 'Admin') && !can(actor.role, 'users.grantAdmin')) {
    throw forbidden('Only an Admin can grant or remove the Admin role.');
  }
}

async function history(scope: TenantScope, userId: string, field: string, from: string | null, to: string | null, reason?: string) {
  await scope.tx.insert(userRoleHistory).values({
    userId, businessUnitId: scope.ctx.businessUnitId, field, fromValue: from, toValue: to, reason: reason ?? null,
    requestId: currentLogContext().requestId, createdBy: scope.ctx.userId,
  });
}

async function assertManagerInUnit(tx: Tx, businessUnitId: string, managerUserId: string | null | undefined) {
  if (!managerUserId) return;
  const [m] = await tx.select({ status: businessUnitMembers.status }).from(businessUnitMembers)
    .where(and(eq(businessUnitMembers.businessUnitId, businessUnitId), eq(businessUnitMembers.userId, managerUserId)));
  if (!m || m.status !== 'active') throw badRequest('The manager must be an active member of this business unit.', { managerUserId: ['Not an active member'] });
}

async function unitName(tx: Tx, businessUnitId: string): Promise<string> {
  const [bu] = await tx.select({ name: businessUnits.name }).from(businessUnits).where(eq(businessUnits.id, businessUnitId));
  return bu?.name ?? 'your business unit';
}

async function sendInvite(deps: UsersDeps, email: string, unit: string, token: string): Promise<LinkOutcome> {
  const link = linkFor(deps.appBaseUrl, 'invite', token);
  const sent = await deps.mailer.send(inviteMessage(email, { link, unitName: unit, expiresHours: INVITE_HOURS, support: deps.supportEmail }));
  return { emailed: sent.delivered, link: sent.delivered ? null : link };
}

export type InviteInput = { email: string; displayName: string; role: BuRole; managerUserId?: string | null };

/** Invites a new person, or adds an existing account to this unit. */
export async function inviteMember(deps: UsersDeps, scope: TenantScope, actor: Actor, input: InviteInput): Promise<{ userId: string; existingAccount: boolean } & LinkOutcome> {
  assertMayAssign(actor, null, input.role);
  const email = input.email.trim().toLowerCase();
  await assertManagerInUnit(scope.tx, scope.ctx.businessUnitId, input.managerUserId);
  let [user] = await scope.tx.select({ id: users.id, status: users.status, kind: users.kind, hasPassword: sql<boolean>`${users.passwordHash} is not null` })
    .from(users).where(eq(users.email, email)).for('update');
  const existingAccount = !!user;
  if (user) {
    if (user.kind !== 'person' || user.status === 'deactivated') throw conflict('That account is deactivated. Ask the platform administrator to reactivate it.');
    const [member] = await scope.tx.select({ status: businessUnitMembers.status }).from(businessUnitMembers)
      .where(and(eq(businessUnitMembers.businessUnitId, scope.ctx.businessUnitId), eq(businessUnitMembers.userId, user.id)));
    if (member?.status === 'active') throw conflict('That person is already a member of this business unit.');
    if (member) throw conflict('That person was removed from this business unit. Restore them instead.');
  } else {
    [user] = await scope.tx.insert(users).values({ email, displayName: input.displayName.trim(), status: 'invited', createdBy: actor.userId, updatedBy: actor.userId })
      .returning({ id: users.id, status: users.status, kind: users.kind, hasPassword: sql<boolean>`${users.passwordHash} is not null` });
  }
  await scope.tx.insert(businessUnitMembers).values({
    businessUnitId: scope.ctx.businessUnitId, userId: user.id, role: input.role, managerUserId: input.managerUserId ?? null,
    createdBy: actor.userId, updatedBy: actor.userId,
  });
  await history(scope, user.id, 'membership', null, input.role, existingAccount ? 'Added to the business unit' : 'Invited');
  await recordAudit(scope, { action: 'user.invited', actorRole: actor.role, targetType: 'user', targetId: user.id, details: { role: input.role, existingAccount } });
  if (user.hasPassword) return { userId: user.id, existingAccount, emailed: false, link: null };
  const token = await issueToken(scope.tx, { userId: user.id, purpose: 'invite', businessUnitId: scope.ctx.businessUnitId, createdBy: actor.userId });
  const outcome = await sendInvite(deps, email, await unitName(scope.tx, scope.ctx.businessUnitId), token);
  return { userId: user.id, existingAccount, ...outcome };
}

export type UpdateInput = { role?: BuRole; managerUserId?: string | null; displayName?: string; reason?: string };

export async function updateMember(scope: TenantScope, actor: Actor, userId: string, input: UpdateInput): Promise<void> {
  const m = await memberOrNotFound(scope.tx, scope.ctx.businessUnitId, userId);
  if (m.status !== 'active') throw conflict('Restore this person before changing their details.');
  if (input.role && input.role !== m.role) {
    assertMayAssign(actor, m.role, input.role);
    if (m.role === 'Admin') await assertAnotherAdmin(scope.tx, scope.ctx.businessUnitId, userId);
    await scope.tx.update(businessUnitMembers).set({ role: input.role, updatedAt: new Date(), updatedBy: actor.userId })
      .where(and(eq(businessUnitMembers.businessUnitId, scope.ctx.businessUnitId), eq(businessUnitMembers.userId, userId)));
    await history(scope, userId, 'role', m.role, input.role, input.reason);
    // Their permissions change now: end their sessions so every open tab picks up the new role.
    if (userId !== actor.userId) await revokeUserSessions(scope.tx, userId, 'role_changed');
  }
  if (input.managerUserId !== undefined && input.managerUserId !== m.managerUserId) {
    if (input.managerUserId === userId) throw badRequest('A person cannot be their own manager.', { managerUserId: ['Cannot be the same person'] });
    await assertManagerInUnit(scope.tx, scope.ctx.businessUnitId, input.managerUserId);
    await scope.tx.update(businessUnitMembers).set({ managerUserId: input.managerUserId, updatedAt: new Date(), updatedBy: actor.userId })
      .where(and(eq(businessUnitMembers.businessUnitId, scope.ctx.businessUnitId), eq(businessUnitMembers.userId, userId)));
    await history(scope, userId, 'manager', m.managerUserId, input.managerUserId, input.reason);
  }
  if (input.displayName !== undefined && input.displayName.trim() !== m.displayName) {
    await scope.tx.update(users).set({ displayName: input.displayName.trim(), updatedAt: new Date(), updatedBy: actor.userId }).where(eq(users.id, userId));
    await history(scope, userId, 'display_name', null, null, input.reason ?? 'Name changed');
  }
  await recordAudit(scope, { action: 'user.updated', actorRole: actor.role, targetType: 'user', targetId: userId,
    details: { fields: Object.keys(input).filter(k => k !== 'reason' && input[k as keyof UpdateInput] !== undefined) } });
}

export async function removeMember(scope: TenantScope, actor: Actor, userId: string, reason: string): Promise<void> {
  const m = await memberOrNotFound(scope.tx, scope.ctx.businessUnitId, userId);
  if (m.status === 'removed') return;
  if (m.role === 'Admin') {
    assertMayAssign(actor, 'Admin', null);
    await assertAnotherAdmin(scope.tx, scope.ctx.businessUnitId, userId);
  }
  await scope.tx.update(businessUnitMembers).set({ status: 'removed', updatedAt: new Date(), updatedBy: actor.userId })
    .where(and(eq(businessUnitMembers.businessUnitId, scope.ctx.businessUnitId), eq(businessUnitMembers.userId, userId)));
  await history(scope, userId, 'membership_status', 'active', 'removed', reason);
  await revokeUserSessions(scope.tx, userId, 'removed_from_unit');
  await recordAudit(scope, { action: 'user.removed', actorRole: actor.role, targetType: 'user', targetId: userId });
}

export async function restoreMember(scope: TenantScope, actor: Actor, userId: string, reason: string): Promise<void> {
  const m = await memberOrNotFound(scope.tx, scope.ctx.businessUnitId, userId);
  if (m.status === 'active') return;
  if (m.accountStatus === 'deactivated') throw conflict('That account is deactivated. Ask the platform administrator to reactivate it.');
  assertMayAssign(actor, null, m.role);
  await scope.tx.update(businessUnitMembers).set({ status: 'active', updatedAt: new Date(), updatedBy: actor.userId })
    .where(and(eq(businessUnitMembers.businessUnitId, scope.ctx.businessUnitId), eq(businessUnitMembers.userId, userId)));
  await history(scope, userId, 'membership_status', 'removed', 'active', reason);
  await recordAudit(scope, { action: 'user.restored', actorRole: actor.role, targetType: 'user', targetId: userId });
}

/** A fresh invite link for someone who hasn't set a password yet. */
export async function resendInvite(deps: UsersDeps, scope: TenantScope, actor: Actor, userId: string): Promise<LinkOutcome> {
  const m = await memberOrNotFound(scope.tx, scope.ctx.businessUnitId, userId);
  if (m.status !== 'active') throw conflict('Restore this person first.');
  if (m.hasPassword) throw conflict('This person has already set a password. Send a password reset link instead.');
  const token = await issueToken(scope.tx, { userId, purpose: 'invite', businessUnitId: scope.ctx.businessUnitId, createdBy: actor.userId });
  await recordAudit(scope, { action: 'user.invite_resent', actorRole: actor.role, targetType: 'user', targetId: userId });
  return sendInvite(deps, m.email, await unitName(scope.tx, scope.ctx.businessUnitId), token);
}

/** A password reset link issued by an Admin or manager (the copy-link fallback when email is off). */
export async function issueResetLink(deps: UsersDeps, scope: TenantScope, actor: Actor, userId: string): Promise<LinkOutcome> {
  const m = await memberOrNotFound(scope.tx, scope.ctx.businessUnitId, userId);
  if (m.status !== 'active' || m.accountStatus !== 'active' || !m.hasPassword) throw conflict('This person has no active password yet. Resend their invite instead.');
  if (m.role === 'Admin') assertMayAssign(actor, 'Admin', 'Admin');
  const token = await issueToken(scope.tx, { userId, purpose: 'password_reset', createdBy: actor.userId });
  await recordAudit(scope, { action: 'user.reset_link_issued', actorRole: actor.role, targetType: 'user', targetId: userId });
  const link = linkFor(deps.appBaseUrl, 'password_reset', token);
  const sent = await deps.mailer.send(passwordResetMessage(m.email, { link, expiresMinutes: RESET_MINUTES, support: deps.supportEmail }));
  return { emailed: sent.delivered, link: sent.delivered ? null : link };
}

export type HistoryRow = { at: Date; field: string; fromValue: string | null; toValue: string | null; reason: string | null; changedBy: string };

export async function memberHistory(scope: TenantScope, userId: string): Promise<HistoryRow[]> {
  await memberOrNotFound(scope.tx, scope.ctx.businessUnitId, userId);
  const changer = alias(users, 'changer');
  return scope.tx.select({ at: userRoleHistory.createdAt, field: userRoleHistory.field, fromValue: userRoleHistory.fromValue,
    toValue: userRoleHistory.toValue, reason: userRoleHistory.reason, changedBy: changer.displayName })
    .from(userRoleHistory).innerJoin(changer, eq(changer.id, userRoleHistory.createdBy))
    .where(and(eq(userRoleHistory.userId, userId), or(eq(userRoleHistory.businessUnitId, scope.ctx.businessUnitId), isNull(userRoleHistory.businessUnitId))))
    .orderBy(desc(userRoleHistory.createdAt));
}

export async function addOwnerAlias(scope: TenantScope, actor: Actor, userId: string, ownerEmail: string): Promise<{ id: string }> {
  await memberOrNotFound(scope.tx, scope.ctx.businessUnitId, userId);
  const value = ownerEmail.trim().toLowerCase();
  const [taken] = await scope.tx.select({ id: userOwnerAliases.id }).from(userOwnerAliases).where(eq(userOwnerAliases.ownerEmail, value));
  if (taken) throw conflict('That owner address already belongs to someone.');
  const [row] = await scope.tx.insert(userOwnerAliases).values({ userId, ownerEmail: value, createdBy: actor.userId }).returning({ id: userOwnerAliases.id });
  await history(scope, userId, 'owner_alias', null, 'added');
  await recordAudit(scope, { action: 'user.alias_added', actorRole: actor.role, targetType: 'user', targetId: userId });
  return row;
}

export async function removeOwnerAlias(scope: TenantScope, actor: Actor, userId: string, aliasId: string): Promise<void> {
  await memberOrNotFound(scope.tx, scope.ctx.businessUnitId, userId);
  const removed = await scope.tx.delete(userOwnerAliases).where(and(eq(userOwnerAliases.id, aliasId), eq(userOwnerAliases.userId, userId))).returning({ id: userOwnerAliases.id });
  if (!removed.length) throw notFound('That owner address was not found.');
  await history(scope, userId, 'owner_alias', 'removed', null);
  await recordAudit(scope, { action: 'user.alias_removed', actorRole: actor.role, targetType: 'user', targetId: userId });
}

/** Lead-file owner addresses that count as this user's: their sign-in email and their aliases (D-4, D-33). */
export async function ownerEmailsOf(db: Db | Tx, userId: string, email: string): Promise<string[]> {
  const rows = await db.select({ e: userOwnerAliases.ownerEmail }).from(userOwnerAliases).where(eq(userOwnerAliases.userId, userId));
  return [email, ...rows.map(r => r.e)].map(e => e.toLowerCase());
}

/** Users of this unit by ID, for display; never more than the unit's own members. */
export async function memberNames(scope: TenantScope, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await scope.tx.select({ id: users.id, name: users.displayName }).from(businessUnitMembers)
    .innerJoin(users, eq(users.id, businessUnitMembers.userId))
    .where(and(eq(businessUnitMembers.businessUnitId, scope.ctx.businessUnitId), inArray(users.id, ids)));
  return new Map(rows.map(r => [r.id, r.name]));
}
