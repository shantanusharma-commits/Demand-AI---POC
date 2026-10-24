// Sign-in, sign-out, accepting an invite, and password resets (D-3, plan §4 item 3).
// Replies never reveal whether an email has an account. Failures are counted per address and per email,
// and five wrong passwords in a row lock the account for 15 minutes.
import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { auditLog, userRoleHistory, users } from '../db/schema.ts';
import type { Db, Tx } from '../db/tenant.ts';
import { burnPasswordCheck, hashPassword, passwordProblems, verifyPassword } from '../auth/password.ts';
import { hit, LIMITS } from '../auth/rate-limit.ts';
import { pseudonym } from '../auth/crypto.ts';
import { createSession, revokeSession, revokeUserSessions, type SessionConfig } from '../auth/sessions.ts';
import { issueToken, linkFor, lockValidToken, markUsed, RESET_MINUTES } from '../auth/tokens.ts';
import { passwordChangedMessage, passwordResetMessage } from '../mail/templates.ts';
import type { Mailer } from '../mail/mailer.ts';
import { currentLogContext, logger } from '../logger.ts';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export type AuthDeps = { db: Db; mailer: Mailer; session: SessionConfig; appBaseUrl: string; supportEmail?: string };
export type ClientInfo = { ip: string; userAgent?: string };

export type SignedIn = { ok: true; userId: string; cookie: string; maxAgeSeconds: number };
export type LoginResult = SignedIn | { ok: false; reason: 'invalid' | 'rate_limited'; retryAfterSeconds?: number };
export type PasswordFailure = { ok: false; reason: 'invalid_link' | 'weak_password'; problems?: string[] };
export type PasswordResult = { ok: true } | PasswordFailure;
export type AcceptResult = SignedIn | PasswordFailure;

async function platformAudit(tx: Tx, actorUserId: string, action: string, details: Record<string, unknown> = {}) {
  await tx.execute(sql`select set_config('app.user_id', ${actorUserId}, true), set_config('app.business_unit_id', '', true)`);
  await tx.insert(auditLog).values({ actorUserId, action, targetType: 'user', targetId: actorUserId, requestId: currentLogContext().requestId, details });
}

export async function login(deps: AuthDeps, input: { email: string; password: string } & ClientInfo): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const byIp = await hit(deps.db, LIMITS.loginPerIp, pseudonym(input.ip, deps.session.secret));
  const byEmail = await hit(deps.db, LIMITS.loginPerEmail, pseudonym(email, deps.session.secret));
  if (!byIp.allowed || !byEmail.allowed) {
    logger.warn({ event: 'auth.sign_in.rate_limited', by: byIp.allowed ? 'email' : 'ip' }, 'Sign-in rate limit reached');
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds) };
  }
  const [user] = await deps.db
    .select({ id: users.id, passwordHash: users.passwordHash, status: users.status, kind: users.kind, lockedUntil: users.lockedUntil })
    .from(users).where(eq(users.email, email));
  if (!user || user.kind !== 'person' || user.status !== 'active' || !user.passwordHash) {
    await burnPasswordCheck(input.password);
    logger.info({ event: 'auth.sign_in.failed', reason: user ? 'not_active' : 'unknown_email' }, 'Sign-in failed');
    return { ok: false, reason: 'invalid' };
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await burnPasswordCheck(input.password);
    logger.warn({ event: 'auth.sign_in.locked', userId: user.id }, 'Sign-in refused: account temporarily locked');
    return { ok: false, reason: 'invalid' };
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    const [after] = await deps.db.update(users).set({
      failedLoginCount: sql`case when ${users.failedLoginCount} + 1 >= ${MAX_FAILED_LOGINS} then 0 else ${users.failedLoginCount} + 1 end`,
      lockedUntil: sql`case when ${users.failedLoginCount} + 1 >= ${MAX_FAILED_LOGINS} then now() + make_interval(mins => ${LOCK_MINUTES}) else ${users.lockedUntil} end`,
    }).where(eq(users.id, user.id)).returning({ lockedUntil: users.lockedUntil });
    const locked = !!after?.lockedUntil && after.lockedUntil.getTime() > Date.now();
    if (locked) await deps.db.transaction(tx => platformAudit(tx, user.id, 'auth.locked', { minutes: LOCK_MINUTES }));
    logger.info({ event: locked ? 'auth.sign_in.locked_now' : 'auth.sign_in.failed', reason: 'wrong_password', userId: user.id }, 'Sign-in failed');
    return { ok: false, reason: 'invalid' };
  }
  await deps.db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const session = await createSession(deps.db, deps.session, { userId: user.id, ip: input.ip, userAgent: input.userAgent });
  await deps.db.transaction(tx => platformAudit(tx, user.id, 'auth.sign_in'));
  logger.info({ event: 'auth.sign_in.ok', userId: user.id }, 'Signed in');
  return { ok: true, userId: user.id, cookie: session.cookie, maxAgeSeconds: session.maxAgeSeconds };
}

export async function logout(deps: AuthDeps, sessionId: string, userId: string): Promise<void> {
  await revokeSession(deps.db, sessionId, 'sign_out');
  await deps.db.transaction(tx => platformAudit(tx, userId, 'auth.sign_out'));
  logger.info({ event: 'auth.sign_out', userId }, 'Signed out');
}

/** Sets a password from an invite link: activates the account, verifies the email, and signs the person in. */
export async function acceptInvite(deps: AuthDeps, input: { token: string; password: string } & ClientInfo): Promise<AcceptResult> {
  const limited = await hit(deps.db, LIMITS.tokenPerIp, pseudonym(input.ip, deps.session.secret));
  if (!limited.allowed) return { ok: false, reason: 'invalid_link' };
  const outcome = await deps.db.transaction(async (tx): Promise<PasswordResult & { userId?: string }> => {
    const t = await lockValidToken(tx, input.token, 'invite');
    if (!t) return { ok: false, reason: 'invalid_link' };
    const [user] = await tx.select().from(users).where(eq(users.id, t.userId));
    if (!user || user.kind !== 'person' || user.status === 'deactivated') return { ok: false, reason: 'invalid_link' };
    const problems = passwordProblems(input.password, { email: user.email, displayName: user.displayName });
    if (problems.length) return { ok: false, reason: 'weak_password', problems };
    await tx.update(users).set({
      passwordHash: await hashPassword(input.password), status: 'active', emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date(), updatedBy: user.id,
    }).where(eq(users.id, user.id));
    await markUsed(tx, t.tokenId);
    await revokeUserSessions(tx, user.id, 'password_set');
    if (user.status !== 'active') {
      await tx.execute(sql`select set_config('app.user_id', ${user.id}, true)`);
      await tx.insert(userRoleHistory).values({ userId: user.id, businessUnitId: t.businessUnitId, field: 'status', fromValue: user.status, toValue: 'active', reason: 'Invite accepted', requestId: currentLogContext().requestId, createdBy: user.id });
    }
    await platformAudit(tx, user.id, 'auth.invite_accepted');
    return { ok: true, userId: user.id };
  });
  if (outcome.ok === false) {
    logger.info({ event: 'auth.invite.refused', reason: outcome.reason }, 'Invite link not accepted');
    return outcome;
  }
  if (!outcome.userId) return { ok: false, reason: 'invalid_link' };
  const session = await createSession(deps.db, deps.session, { userId: outcome.userId, ip: input.ip, userAgent: input.userAgent, preferredBusinessUnitId: null });
  logger.info({ event: 'auth.invite.accepted', userId: outcome.userId }, 'Invite accepted');
  return { ok: true, userId: outcome.userId, cookie: session.cookie, maxAgeSeconds: session.maxAgeSeconds };
}

/** Always answers the same way. Sends a reset link only to an active account, and only within the limits. */
export async function requestPasswordReset(deps: AuthDeps, input: { email: string } & ClientInfo): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const byIp = await hit(deps.db, LIMITS.forgotPerIp, pseudonym(input.ip, deps.session.secret));
  const byEmail = await hit(deps.db, LIMITS.forgotPerEmail, pseudonym(email, deps.session.secret));
  if (!byIp.allowed || !byEmail.allowed) {
    logger.warn({ event: 'auth.reset.rate_limited' }, 'Password reset rate limit reached');
    return;
  }
  const [user] = await deps.db.select({ id: users.id, email: users.email, status: users.status, kind: users.kind, passwordHash: users.passwordHash })
    .from(users).where(eq(users.email, email));
  if (!user || user.kind !== 'person' || user.status !== 'active' || !user.passwordHash) {
    logger.info({ event: 'auth.reset.ignored', reason: user ? 'not_active' : 'unknown_email' }, 'Password reset not sent');
    return;
  }
  const token = await deps.db.transaction(async tx => {
    const t = await issueToken(tx, { userId: user.id, purpose: 'password_reset', createdBy: user.id });
    await platformAudit(tx, user.id, 'auth.reset_requested');
    return t;
  });
  const sent = await deps.mailer.send(passwordResetMessage(user.email, { link: linkFor(deps.appBaseUrl, 'password_reset', token), expiresMinutes: RESET_MINUTES, support: deps.supportEmail }));
  logger.info({ event: 'auth.reset.requested', userId: user.id, emailed: sent.delivered }, 'Password reset requested');
}

/** Sets a new password from a reset link. Ends every session; the person signs in again. */
export async function resetPassword(deps: AuthDeps, input: { token: string; password: string } & ClientInfo): Promise<PasswordResult> {
  const limited = await hit(deps.db, LIMITS.tokenPerIp, pseudonym(input.ip, deps.session.secret));
  if (!limited.allowed) return { ok: false, reason: 'invalid_link' };
  const outcome = await deps.db.transaction(async (tx): Promise<PasswordResult & { email?: string; userId?: string }> => {
    const t = await lockValidToken(tx, input.token, 'password_reset');
    if (!t) return { ok: false, reason: 'invalid_link' };
    const [user] = await tx.select().from(users).where(eq(users.id, t.userId));
    if (!user || user.kind !== 'person' || user.status !== 'active') return { ok: false, reason: 'invalid_link' };
    const problems = passwordProblems(input.password, { email: user.email, displayName: user.displayName });
    if (problems.length) return { ok: false, reason: 'weak_password', problems };
    await tx.update(users).set({ passwordHash: await hashPassword(input.password), failedLoginCount: 0, lockedUntil: null, updatedAt: new Date(), updatedBy: user.id })
      .where(eq(users.id, user.id));
    await markUsed(tx, t.tokenId);
    const ended = await revokeUserSessions(tx, user.id, 'password_reset');
    await platformAudit(tx, user.id, 'auth.password_reset', { sessionsEnded: ended });
    return { ok: true, email: user.email, userId: user.id };
  });
  if (outcome.ok === false) {
    logger.info({ event: 'auth.reset.refused', reason: outcome.reason }, 'Password reset not accepted');
    return outcome;
  }
  if (outcome.email) await deps.mailer.send(passwordChangedMessage(outcome.email, { support: deps.supportEmail }));
  logger.info({ event: 'auth.reset.done', userId: outcome.userId }, 'Password reset');
  return { ok: true };
}
