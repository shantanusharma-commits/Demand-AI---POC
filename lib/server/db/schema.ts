// Database schema (Drizzle). drizzle-kit generates the table DDL in drizzle/ from this file; row-level security,
// triggers, grants and functions live in the hand-written SQL migrations next to it. docs/DATA_MODEL.md explains
// the model. Conventions: UUID keys, created_at/created_by on every table, enumerations as text + CHECK.
// No `server-only` import here: drizzle-kit and the migration tests load this file outside Next.js.
import { sql } from 'drizzle-orm';
import {
  boolean, check, customType, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const citext = customType<{ data: string }>({ dataType: () => 'citext' });

/** Seeded by the first security migration; jobs and imports act as this user. It can never sign in. */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

export const BU_ROLES = ['Admin', 'Sales manager', 'Sales rep', 'Viewer'] as const;
export type BuRole = (typeof BU_ROLES)[number];

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v.replace(/'/g, "''")}'`).join(', '));
const tsz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => tsz('created_at').notNull().defaultNow();
const updatedAt = () => tsz('updated_at').notNull().defaultNow();
const createdBy = () => uuid('created_by').notNull().references((): AnyPgColumn => users.id);
const updatedBy = () => uuid('updated_by').notNull().references((): AnyPgColumn => users.id);

/* ─── Identity and tenancy (D-3, D-32, D-33) ─── */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull().unique('users_email_key'),
  displayName: text('display_name').notNull(),
  kind: text('kind').notNull().default('person'),
  platformAdmin: boolean('platform_admin').notNull().default(false),
  status: text('status').notNull().default('invited'),
  passwordHash: text('password_hash'),
  emailVerifiedAt: tsz('email_verified_at'),
  lastLoginAt: tsz('last_login_at'),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: tsz('locked_until'),
  createdAt: createdAt(),
  createdBy: createdBy(),
  updatedAt: updatedAt(),
  updatedBy: updatedBy(),
}, t => [
  check('users_kind_check', sql`${t.kind} in ('person', 'system')`),
  check('users_status_check', sql`${t.status} in ('invited', 'active', 'deactivated')`),
  check('users_system_has_no_password', sql`${t.kind} = 'person' or ${t.passwordHash} is null`),
]);

export const businessUnits = pgTable('business_units', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique('business_units_code_key'),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: createdAt(),
  createdBy: createdBy(),
  updatedAt: updatedAt(),
  updatedBy: updatedBy(),
}, t => [
  check('business_units_status_check', sql`${t.status} in ('active', 'archived')`),
  check('business_units_code_check', sql`${t.code} ~ '^[a-z0-9][a-z0-9-]{1,39}$'`),
]);

export const businessUnitMembers = pgTable('business_unit_members', {
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: text('role').notNull(),
  managerUserId: uuid('manager_user_id').references(() => users.id),
  status: text('status').notNull().default('active'),
  createdAt: createdAt(),
  createdBy: createdBy(),
  updatedAt: updatedAt(),
  updatedBy: updatedBy(),
}, t => [
  primaryKey({ name: 'business_unit_members_pkey', columns: [t.businessUnitId, t.userId] }),
  check('business_unit_members_role_check', sql`${t.role} in (${inList(BU_ROLES)})`),
  check('business_unit_members_status_check', sql`${t.status} in ('active', 'removed')`),
  index('business_unit_members_user_idx').on(t.userId),
  index('business_unit_members_manager_idx').on(t.managerUserId),
]);

/** Owner addresses used in lead files that belong to a user (D-4: reps see accounts they own or alias). */
export const userOwnerAliases = pgTable('user_owner_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  ownerEmail: citext('owner_email').notNull().unique('user_owner_aliases_owner_email_key'),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [index('user_owner_aliases_user_idx').on(t.userId)]);

/** Append-only: every change to a user's role, status or membership, with who, why and when. */
export const userRoleHistory = pgTable('user_role_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  businessUnitId: uuid('business_unit_id').references(() => businessUnits.id),
  field: text('field').notNull(),
  fromValue: text('from_value'),
  toValue: text('to_value'),
  reason: text('reason'),
  requestId: text('request_id'),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  index('user_role_history_user_idx').on(t.userId, t.createdAt),
  index('user_role_history_bu_idx').on(t.businessUnitId),
]);

/* ─── Audit ─── */

/** Append-only. Written in the same transaction as the change it records. Never holds personal data. */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  occurredAt: tsz('occurred_at').notNull().defaultNow(),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id),
  actorRole: text('actor_role'),
  businessUnitId: uuid('business_unit_id').references(() => businessUnits.id),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  requestId: text('request_id'),
  details: jsonb('details').notNull().default({}),
}, t => [
  index('audit_log_bu_time_idx').on(t.businessUnitId, t.occurredAt),
  index('audit_log_actor_idx').on(t.actorUserId),
]);

/* ─── Background jobs (claimed with FOR UPDATE SKIP LOCKED through claim_job()) ─── */

export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('queued'),
  stage: text('stage'),
  progress: jsonb('progress').notNull().default({}),
  payload: jsonb('payload').notNull().default({}),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  runAfter: tsz('run_after').notNull().defaultNow(),
  lockedAt: tsz('locked_at'),
  lockedBy: text('locked_by'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  startedAt: tsz('started_at'),
  finishedAt: tsz('finished_at'),
  createdAt: createdAt(),
  createdBy: createdBy(),
  updatedAt: updatedAt(),
}, t => [
  check('jobs_status_check', sql`${t.status} in (${inList(JOB_STATUSES)})`),
  check('jobs_attempts_check', sql`${t.attempts} >= 0 and ${t.maxAttempts} >= 1`),
  index('jobs_queue_idx').on(t.status, t.runAfter),
  index('jobs_bu_time_idx').on(t.businessUnitId, t.createdAt),
]);

/* ─── Configuration (versioned per business unit, D-13, D-41) ─── */

export const configVersions = pgTable('config_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  versionNo: integer('version_no').notNull(),
  status: text('status').notNull().default('draft'),
  body: jsonb('body').notNull(),
  engineVersion: text('engine_version').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
  activatedAt: tsz('activated_at'),
  activatedBy: uuid('activated_by').references(() => users.id),
}, t => [
  check('config_versions_status_check', sql`${t.status} in ('draft', 'active', 'retired')`),
  uniqueIndex('config_versions_bu_version_key').on(t.businessUnitId, t.versionNo),
  // At most one active version per business unit.
  uniqueIndex('config_versions_one_active_key').on(t.businessUnitId).where(sql`${t.status} = 'active'`),
]);

/* ─── Sign-in (D-3): sessions, one-time email tokens, rate limits ─── */

/** One row per signed-in browser. The cookie carries the ID, HMAC-signed; every request re-reads the row. */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  activeBusinessUnitId: uuid('active_business_unit_id').references(() => businessUnits.id),
  createdAt: createdAt(),
  lastSeenAt: tsz('last_seen_at').notNull().defaultNow(),
  expiresAt: tsz('expires_at').notNull(),
  idleExpiresAt: tsz('idle_expires_at').notNull(),
  ipHash: text('ip_hash'),
  userAgentHash: text('user_agent_hash'),
  revokedAt: tsz('revoked_at'),
  revokedReason: text('revoked_reason'),
}, t => [
  index('sessions_user_idx').on(t.userId, t.expiresAt),
  index('sessions_bu_idx').on(t.activeBusinessUnitId),
  check('sessions_revoked_reason_check', sql`${t.revokedReason} is null or ${t.revokedReason} in
    ('sign_out', 'password_reset', 'password_set', 'deactivated', 'role_changed', 'removed_from_unit', 'admin')`),
]);

export const EMAIL_TOKEN_PURPOSES = ['invite', 'password_reset'] as const;

/** Single-use links (invite, password reset). Only a SHA-256 of the 256-bit secret is stored. */
export const emailTokens = pgTable('email_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  purpose: text('purpose').notNull(),
  tokenHash: text('token_hash').notNull(),
  businessUnitId: uuid('business_unit_id').references(() => businessUnits.id),
  expiresAt: tsz('expires_at').notNull(),
  usedAt: tsz('used_at'),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('email_tokens_purpose_check', sql`${t.purpose} in (${inList(EMAIL_TOKEN_PURPOSES)})`),
  index('email_tokens_user_idx').on(t.userId, t.purpose),
  index('email_tokens_bu_idx').on(t.businessUnitId),
]);

/** Fixed-window counters for sign-in, reset and other throttled actions; kept in the database so limits hold
 *  across restarts and instances. Keys hold hashes, never raw emails or addresses. */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').notNull(),
  windowStart: tsz('window_start').notNull(),
  count: integer('count').notNull().default(0),
}, t => [
  primaryKey({ name: 'rate_limits_pkey', columns: [t.key, t.windowStart] }),
  index('rate_limits_window_idx').on(t.windowStart),
]);
