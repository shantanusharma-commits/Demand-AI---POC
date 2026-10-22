// Database sessions behind an HMAC-signed cookie (plan §4 item 2). Every request re-reads the session and the
// user, so expiry, sign-out, a password reset, deactivation and role changes take effect on the next request.
// Sessions end after SESSION_ABSOLUTE_HOURS, or SESSION_IDLE_MINUTES without activity. No "remember me".
import 'server-only';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { BuRole, SessionUser } from '../../auth/permissions.ts';
import { businessUnitMembers, businessUnits, sessions, users } from '../db/schema.ts';
import type { Db, Tx } from '../db/tenant.ts';
import { pseudonym, signSessionId, verifySessionCookie } from './crypto.ts';

export const SESSION_COOKIE = 'demandai_session';

export type SessionConfig = { secret: string; absoluteHours: number; idleMinutes: number; secureCookies: boolean };

export type RevokeReason = 'sign_out' | 'password_reset' | 'password_set' | 'deactivated' | 'role_changed' | 'removed_from_unit' | 'admin';

export type LoadedSession = { sessionId: string; user: SessionUser };

/** Set-Cookie value for a new session. HttpOnly, SameSite=Lax, Path=/, Secure over https. */
export function sessionCookieHeader(value: string, maxAgeSeconds: number, secure: boolean): string {
  return [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`, ...(secure ? ['Secure'] : [])].join('; ');
}

export function clearSessionCookieHeader(secure: boolean): string {
  return [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', ...(secure ? ['Secure'] : [])].join('; ');
}

/** Active memberships in active units, read as the user (row-level security lets a user see their own). */
async function membershipsOf(tx: Tx, userId: string): Promise<SessionUser['memberships']> {
  await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
  const rows = await tx
    .select({ businessUnitId: businessUnitMembers.businessUnitId, code: businessUnits.code, name: businessUnits.name, role: businessUnitMembers.role })
    .from(businessUnitMembers)
    .innerJoin(businessUnits, eq(businessUnits.id, businessUnitMembers.businessUnitId))
    .where(and(eq(businessUnitMembers.userId, userId), eq(businessUnitMembers.status, 'active'), eq(businessUnits.status, 'active')))
    .orderBy(asc(businessUnits.name));
  return rows.map(r => ({ ...r, role: r.role as BuRole }));
}

export async function createSession(
  db: Db,
  cfg: SessionConfig,
  input: { userId: string; ip?: string; userAgent?: string; preferredBusinessUnitId?: string | null },
): Promise<{ sessionId: string; cookie: string; maxAgeSeconds: number }> {
  return db.transaction(async tx => {
    const memberships = await membershipsOf(tx, input.userId);
    const active = memberships.find(m => m.businessUnitId === input.preferredBusinessUnitId) ?? memberships[0] ?? null;
    const now = Date.now();
    const expiresAt = new Date(now + cfg.absoluteHours * 3600_000);
    const [row] = await tx.insert(sessions).values({
      userId: input.userId,
      activeBusinessUnitId: active?.businessUnitId ?? null,
      expiresAt,
      idleExpiresAt: new Date(Math.min(now + cfg.idleMinutes * 60_000, expiresAt.getTime())),
      ipHash: input.ip ? pseudonym(input.ip, cfg.secret) : null,
      userAgentHash: input.userAgent ? pseudonym(input.userAgent, cfg.secret) : null,
    }).returning({ id: sessions.id });
    return { sessionId: row.id, cookie: signSessionId(row.id, cfg.secret), maxAgeSeconds: cfg.absoluteHours * 3600 };
  });
}

/** The signed-in user for a cookie value, or null (bad signature, unknown, revoked, expired, idle, or inactive user). */
export async function loadSession(db: Db, cfg: SessionConfig, cookieValue: string | undefined | null): Promise<LoadedSession | null> {
  const sessionId = verifySessionCookie(cookieValue, cfg.secret);
  if (!sessionId) return null;
  return db.transaction(async tx => {
    const [row] = await tx
      .select({
        sessionId: sessions.id, activeBusinessUnitId: sessions.activeBusinessUnitId, lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt, userId: users.id, email: users.email, displayName: users.displayName, platformAdmin: users.platformAdmin,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt), sql`${sessions.expiresAt} > now()`, sql`${sessions.idleExpiresAt} > now()`,
        eq(users.status, 'active'), eq(users.kind, 'person')));
    if (!row) return null;
    const memberships = await membershipsOf(tx, row.userId);
    const active = memberships.find(m => m.businessUnitId === row.activeBusinessUnitId) ?? memberships[0] ?? null;
    // Refresh the idle window at most once a minute, never past the absolute expiry.
    const stale = Date.now() - row.lastSeenAt.getTime() > 60_000;
    if (stale || (active?.businessUnitId ?? null) !== row.activeBusinessUnitId) {
      await tx.update(sessions).set({
        lastSeenAt: new Date(),
        idleExpiresAt: sql`least(now() + make_interval(mins => ${cfg.idleMinutes}), ${sessions.expiresAt})`,
        activeBusinessUnitId: active?.businessUnitId ?? null,
      }).where(eq(sessions.id, row.sessionId));
    }
    return {
      sessionId: row.sessionId,
      user: {
        id: row.userId, email: row.email, displayName: row.displayName, platformAdmin: row.platformAdmin,
        activeBusinessUnit: active ? { id: active.businessUnitId, code: active.code, name: active.name, role: active.role } : null,
        memberships,
      },
    };
  });
}

export async function revokeSession(db: Db | Tx, sessionId: string, reason: RevokeReason): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date(), revokedReason: reason }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Ends every session of a user (optionally keeping one), for resets, deactivation and role changes. */
export async function revokeUserSessions(db: Db | Tx, userId: string, reason: RevokeReason, keepSessionId?: string): Promise<number> {
  const rows = await db.update(sessions).set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), ...(keepSessionId ? [ne(sessions.id, keepSessionId)] : [])))
    .returning({ id: sessions.id });
  return rows.length;
}

/** Switches the session to another unit the user is an active member of. False if they aren't. */
export async function setActiveBusinessUnit(db: Db, sessionId: string, userId: string, businessUnitId: string): Promise<boolean> {
  return db.transaction(async tx => {
    const memberships = await membershipsOf(tx, userId);
    if (!memberships.some(m => m.businessUnitId === businessUnitId)) return false;
    await tx.update(sessions).set({ activeBusinessUnitId: businessUnitId }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
    return true;
  });
}

/** Deletes sessions that ended more than a day ago (opportunistic housekeeping). */
export async function pruneSessions(db: Db): Promise<number> {
  const r = await db.execute(sql`delete from sessions where expires_at < now() - interval '1 day' or revoked_at < now() - interval '1 day'`);
  return r.rowCount ?? 0;
}
