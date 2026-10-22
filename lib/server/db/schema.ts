// Database schema (Drizzle). drizzle-kit generates the table DDL in drizzle/ from this file; row-level security,
// triggers, grants and functions live in the hand-written SQL migrations next to it. docs/DATA_MODEL.md explains
// the model. Conventions: UUID keys, created_at/created_by on every table, enumerations as text + CHECK.
// No `server-only` import here: drizzle-kit and the migration tests load this file outside Next.js.
import { sql } from 'drizzle-orm';
import {
  boolean, check, customType, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
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

/* ─── Uploads (D-7, D-8). The file as received is the input of record; rows are re-read from it on demand. ─── */

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const UPLOAD_KINDS = ['lead', 'signal'] as const;
export const UPLOAD_FORMATS = ['xlsx', 'xls', 'csv'] as const;

export const uploads = pgTable('uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  kind: text('kind').notNull(),
  fileName: text('file_name').notNull(),
  format: text('format').notNull(),
  mediaType: text('media_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  sha256: text('sha256').notNull(),
  /** Built from the fictional sample, never mixed with real data. */
  sandbox: boolean('sandbox').notNull().default(false),
  sheetName: text('sheet_name'),
  rowsRead: integer('rows_read'),
  retentionUntil: tsz('retention_until'),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('uploads_kind_check', sql`${t.kind} in (${inList(UPLOAD_KINDS)})`),
  check('uploads_format_check', sql`${t.format} in (${inList(UPLOAD_FORMATS)})`),
  check('uploads_size_check', sql`${t.byteSize} > 0`),
  index('uploads_bu_time_idx').on(t.businessUnitId, t.createdAt),
]);

export const uploadFiles = pgTable('upload_files', {
  uploadId: uuid('upload_id').primaryKey().references(() => uploads.id, { onDelete: 'cascade' }),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  bytes: bytea('bytes').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [index('upload_files_bu_idx').on(t.businessUnitId)]);

/* ─── Prospecting: lead lists and what the checks built from them (derived from the upload + config + engine) ─── */

export const LIST_STATUSES = ['draft', 'saved'] as const;
/** Final-list groups: in the final list, in the list but not contactable, not in the list. */
export const CONTACT_GROUPS = ['in', 'nc', 'out'] as const;
const lowerOwner = (name: string, col: AnyPgColumn) => check(name, sql`${col} is null or ${col} = lower(${col})`);

export const leadLists = pgTable('lead_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  uploadId: uuid('upload_id').notNull().references(() => uploads.id, { onDelete: 'cascade' }),
  /** Set when the list was saved from a selection of another list's prospects. */
  parentListId: uuid('parent_list_id').references((): AnyPgColumn => leadLists.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'),
  sandbox: boolean('sandbox').notNull().default(false),
  sourceFile: text('source_file').notNull(),
  sheetName: text('sheet_name').notNull(),
  configVersionId: uuid('config_version_id').references(() => configVersions.id),
  engineVersion: text('engine_version').notNull(),
  stats: jsonb('stats').notNull(),
  checks: jsonb('checks').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
  updatedAt: updatedAt(),
  updatedBy: updatedBy(),
  savedAt: tsz('saved_at'),
}, t => [
  check('lead_lists_status_check', sql`${t.status} in (${inList(LIST_STATUSES)})`),
  index('lead_lists_bu_status_idx').on(t.businessUnitId, t.status, t.createdAt),
  index('lead_lists_upload_idx').on(t.uploadId),
  index('lead_lists_parent_idx').on(t.parentListId),
]);

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  listId: uuid('list_id').notNull().references(() => leadLists.id, { onDelete: 'cascade' }),
  /** Position in the engine's output, for stable paging. */
  seq: integer('seq').notNull(),
  /** The engine's own ID within the list (acc-N), which contacts and signals refer to. */
  engineId: text('engine_id').notNull(),
  name: text('name').notNull(),
  ownerEmail: text('owner_email'),
  excluded: boolean('excluded').notNull(),
  needsReview: boolean('needs_review').notNull(),
  search: text('search').notNull(),
  data: jsonb('data').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  uniqueIndex('accounts_list_engine_key').on(t.listId, t.engineId),
  index('accounts_list_seq_idx').on(t.listId, t.seq),
  index('accounts_list_owner_idx').on(t.listId, t.ownerEmail),
  index('accounts_bu_idx').on(t.businessUnitId),
  lowerOwner('accounts_owner_lower_check', t.ownerEmail),
]);

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  listId: uuid('list_id').notNull().references(() => leadLists.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  rowNo: integer('row_no').notNull(),
  statusGroup: text('status_group').notNull(),
  ownerEmail: text('owner_email'),
  search: text('search').notNull(),
  data: jsonb('data').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('contacts_status_group_check', sql`${t.statusGroup} in (${inList(CONTACT_GROUPS)})`),
  uniqueIndex('contacts_list_row_key').on(t.listId, t.rowNo),
  index('contacts_list_owner_idx').on(t.listId, t.ownerEmail),
  index('contacts_account_idx').on(t.accountId),
  index('contacts_bu_idx').on(t.businessUnitId),
  lowerOwner('contacts_owner_lower_check', t.ownerEmail),
]);

/* ─── Account Scoring (as-of validated, G-061) ─── */

export const scoringRuns = pgTable('scoring_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  listId: uuid('list_id').notNull().references(() => leadLists.id, { onDelete: 'cascade' }),
  signalUploadId: uuid('signal_upload_id').notNull().references(() => uploads.id, { onDelete: 'cascade' }),
  asOf: date('as_of', { mode: 'string' }).notNull(),
  name: text('name'),
  status: text('status').notNull().default('draft'),
  sandbox: boolean('sandbox').notNull().default(false),
  sourceFile: text('source_file').notNull(),
  sheetName: text('sheet_name'),
  configVersionId: uuid('config_version_id').references(() => configVersions.id),
  engineVersion: text('engine_version').notNull(),
  stats: jsonb('stats').notNull().default({}),
  checks: jsonb('checks').notNull().default([]),
  createdAt: createdAt(),
  createdBy: createdBy(),
  updatedAt: updatedAt(),
  updatedBy: updatedBy(),
  savedAt: tsz('saved_at'),
}, t => [
  check('scoring_runs_status_check', sql`${t.status} in (${inList(LIST_STATUSES)})`),
  index('scoring_runs_bu_status_idx').on(t.businessUnitId, t.status, t.createdAt),
  index('scoring_runs_list_idx').on(t.listId),
  index('scoring_runs_upload_idx').on(t.signalUploadId),
]);

/** What the checks found, for a list (lead file) or a scoring run (signal file). */
export const issues = pgTable('issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  listId: uuid('list_id').references(() => leadLists.id, { onDelete: 'cascade' }),
  runId: uuid('run_id').references(() => scoringRuns.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  /** The sheet row the issue is about; null for the whole file. */
  rowNo: integer('row_no'),
  /** The contact row it is shown on (a merged duplicate's issue shows on the row it was merged into). */
  attachRowNo: integer('attach_row_no'),
  ownerEmail: text('owner_email'),
  checkKey: text('check_key').notNull(),
  severity: text('severity').notNull(),
  data: jsonb('data').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('issues_parent_check', sql`num_nonnulls(${t.listId}, ${t.runId}) = 1`),
  check('issues_severity_check', sql`${t.severity} in ('stop', 'flag', 'info')`),
  index('issues_list_attach_idx').on(t.listId, t.attachRowNo),
  index('issues_list_check_idx').on(t.listId, t.checkKey),
  index('issues_run_idx').on(t.runId, t.seq),
  index('issues_bu_idx').on(t.businessUnitId),
  lowerOwner('issues_owner_lower_check', t.ownerEmail),
]);

export const signals = pgTable('signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  runId: uuid('run_id').notNull().references(() => scoringRuns.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  rowNo: integer('row_no').notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
  ownerEmail: text('owner_email'),
  status: text('status').notNull(),
  search: text('search').notNull(),
  data: jsonb('data').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  index('signals_run_seq_idx').on(t.runId, t.seq),
  index('signals_run_contact_idx').on(t.runId, t.contactId),
  index('signals_account_idx').on(t.accountId),
  index('signals_contact_idx').on(t.contactId),
  index('signals_bu_idx').on(t.businessUnitId),
  lowerOwner('signals_owner_lower_check', t.ownerEmail),
]);

export const accountScores = pgTable('account_scores', {
  runId: uuid('run_id').notNull().references(() => scoringRuns.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  ownerEmail: text('owner_email'),
  tier: text('tier').notNull(),
  data: jsonb('data').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  primaryKey({ name: 'account_scores_pkey', columns: [t.runId, t.accountId] }),
  index('account_scores_account_idx').on(t.accountId),
  index('account_scores_bu_idx').on(t.businessUnitId),
  lowerOwner('account_scores_owner_lower_check', t.ownerEmail),
]);

export const TIERS = ['A', 'B', 'C', 'Watch list', 'Below fit floor', 'Excluded'] as const;

/** One row per prospect (each contact not opted out), in the ranked order the screen shows. */
export const prospectScores = pgTable('prospect_scores', {
  runId: uuid('run_id').notNull().references(() => scoringRuns.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  ownerEmail: text('owner_email'),
  rankNo: integer('rank_no').notNull(),
  tier: text('tier').notNull(),
  score: doublePrecision('score'),
  fit: doublePrecision('fit'),
  timing: doublePrecision('timing'),
  /** Has a live signal, so it can be handed off. */
  sendable: boolean('sendable').notNull(),
  search: text('search').notNull(),
  data: jsonb('data').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  primaryKey({ name: 'prospect_scores_pkey', columns: [t.runId, t.contactId] }),
  check('prospect_scores_tier_check', sql`${t.tier} in (${inList(TIERS)})`),
  uniqueIndex('prospect_scores_run_rank_key').on(t.runId, t.rankNo),
  index('prospect_scores_run_owner_idx').on(t.runId, t.ownerEmail),
  index('prospect_scores_contact_idx').on(t.contactId),
  index('prospect_scores_account_idx').on(t.accountId),
  index('prospect_scores_bu_idx').on(t.businessUnitId),
  lowerOwner('prospect_scores_owner_lower_check', t.ownerEmail),
]);

/* ─── Hand-off from Scoring to Micro-segments & NBA (stable UUIDs, G-049) ─── */

export const handoffs = pgTable('handoffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  runId: uuid('run_id').notNull().references(() => scoringRuns.id, { onDelete: 'cascade' }),
  selection: text('selection').notNull(),
  itemCount: integer('item_count').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('handoffs_selection_check', sql`${t.selection} in ('default', 'selected')`),
  index('handoffs_run_idx').on(t.runId),
  index('handoffs_bu_time_idx').on(t.businessUnitId, t.createdAt),
]);

export const handoffItems = pgTable('handoff_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  handoffId: uuid('handoff_id').notNull().references(() => handoffs.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  ownerEmail: text('owner_email'),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  uniqueIndex('handoff_items_handoff_contact_key').on(t.handoffId, t.contactId),
  index('handoff_items_handoff_position_idx').on(t.handoffId, t.position),
  index('handoff_items_contact_idx').on(t.contactId),
  index('handoff_items_account_idx').on(t.accountId),
  index('handoff_items_bu_idx').on(t.businessUnitId),
  lowerOwner('handoff_items_owner_lower_check', t.ownerEmail),
]);
