// Every database read or write by the app runs inside withTenant() (business-unit work) or withUser()
// (sign-in, choosing a unit, platform administration). Both open a transaction and set the request's identity
// as transaction-local settings, which the row-level security policies read (drizzle/0002_tenancy_security.sql).
// Repositories take the resulting scope object, so no query can run without an identity (D-32, D-33).
import 'server-only';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase, type NodePgTransaction } from 'drizzle-orm/node-postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type pg from 'pg';
import * as schema from './schema.ts';
import { logger, withLogContext } from '../logger.ts';

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;
export type Tx = NodePgTransaction<Schema, ExtractTablesWithRelations<Schema>>;

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}

/** Who is acting, in which business unit, and how widely they may see (owner scoping, D-33). */
export type TenantContext = {
  userId: string;
  businessUnitId: string;
  /** 'all': every row of the unit (Admin, Sales manager, Viewer aggregates, System). 'own': rows the user owns. */
  scope: 'all' | 'own';
  /** Lead-file owner addresses that count as this user's (their sign-in email and aliases), lower-case. */
  ownerEmails: string[];
};

export type UserContext = { userId: string; platformAdmin: boolean };

/** A transaction bound to one tenant context. Repositories accept only this. */
export type TenantScope = { readonly tx: Tx; readonly ctx: TenantContext };
export type UserScope = { readonly tx: Tx; readonly ctx: UserContext };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkContext(ctx: TenantContext): void {
  if (!UUID.test(ctx.userId) || !UUID.test(ctx.businessUnitId)) throw new Error('tenant context needs a user ID and a business-unit ID');
  if (ctx.scope !== 'all' && ctx.scope !== 'own') throw new Error('tenant scope must be all or own');
  if (ctx.ownerEmails.some(e => e.includes(','))) throw new Error('owner emails cannot contain commas');
}

async function timedTransaction<T>(db: Db, label: string, slowMs: number, run: (tx: Tx) => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await db.transaction(run);
  } finally {
    const durationMs = Math.round(performance.now() - started);
    if (durationMs >= slowMs) logger.warn({ event: 'db.transaction.slow', label, durationMs }, 'Slow database transaction');
    else logger.trace({ event: 'db.transaction', label, durationMs }, 'Database transaction');
  }
}

export type ScopeOptions = { label?: string; slowMs?: number };

/** Sets the transaction's identity for the row-level security policies. */
async function setTenant(tx: Tx, ctx: TenantContext): Promise<void> {
  checkContext(ctx);
  const emails = ctx.ownerEmails.map(e => e.trim().toLowerCase()).filter(Boolean).join(',');
  await tx.execute(sql`select
    set_config('app.user_id', ${ctx.userId}, true),
    set_config('app.business_unit_id', ${ctx.businessUnitId}, true),
    set_config('app.scope', ${ctx.scope}, true),
    set_config('app.owner_emails', ${emails}, true),
    set_config('app.platform_admin', 'off', true)`);
}

export function withTenant<T>(db: Db, ctx: TenantContext, fn: (scope: TenantScope) => Promise<T>, opts: ScopeOptions = {}): Promise<T> {
  checkContext(ctx);
  return withLogContext({ userId: ctx.userId, businessUnitId: ctx.businessUnitId }, () =>
    timedTransaction(db, opts.label ?? 'tenant', opts.slowMs ?? 500, async tx => {
      await setTenant(tx, ctx);
      return fn({ tx, ctx });
    }));
}

/** Runs part of a transaction as another business unit, then returns to the first: the one place work crosses units
 *  (moving an account, D-34), so both sides commit or roll back together. The caller checks the person's role in the
 *  other unit first. */
export async function inOtherUnit<T>(scope: TenantScope, ctx: TenantContext, fn: (other: TenantScope) => Promise<T>): Promise<T> {
  await setTenant(scope.tx, ctx);
  // On an error the transaction rolls back as a whole, so there is nothing to switch back.
  const result = await fn({ tx: scope.tx, ctx });
  await setTenant(scope.tx, scope.ctx);
  return result;
}

export function withUser<T>(db: Db, ctx: UserContext, fn: (scope: UserScope) => Promise<T>, opts: ScopeOptions = {}): Promise<T> {
  if (!UUID.test(ctx.userId)) throw new Error('user context needs a user ID');
  return withLogContext({ userId: ctx.userId }, () =>
    timedTransaction(db, opts.label ?? 'user', opts.slowMs ?? 500, async tx => {
      await tx.execute(sql`select
        set_config('app.user_id', ${ctx.userId}, true),
        set_config('app.business_unit_id', '', true),
        set_config('app.scope', '', true),
        set_config('app.owner_emails', '', true),
        set_config('app.platform_admin', ${ctx.platformAdmin ? 'on' : 'off'}, true)`);
      return fn({ tx, ctx });
    }));
}
