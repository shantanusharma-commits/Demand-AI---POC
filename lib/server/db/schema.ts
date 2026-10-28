// Database schema (Drizzle). drizzle-kit generates the table DDL in drizzle/ from this file; row-level security,
// triggers, grants and functions live in the hand-written SQL migrations next to it. docs/DATA_MODEL.md explains
// the model. Conventions: UUID keys, created_at/created_by on every table, enumerations as text + CHECK.
// No `server-only` import here: drizzle-kit and the migration tests load this file outside Next.js.
import { sql } from 'drizzle-orm';
import {
  bigint, boolean, check, customType, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const citext = customType<{ data: string }>({ dataType: () => 'citext' });
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

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

/* ─── Setup (G-002, D-13): sign-offs per section and signal-type changes, both append-only ─── */

/** The Setup sections, as the original page numbered them. */
export const CONFIG_SECTIONS = ['scope', 'rubric', 'personas', 'signals', 'actions', 'brand', 'users'] as const;
export type ConfigSection = (typeof CONFIG_SECTIONS)[number];

/** Who signed a Setup section off, or reopened it, and on which configuration version. A section's state is its
 *  latest row. */
export const configSignoffs = pgTable('config_signoffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  configVersionId: uuid('config_version_id').notNull().references(() => configVersions.id),
  section: text('section').notNull(),
  action: text('action').notNull(),
  note: text('note').notNull().default(''),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('config_signoffs_section_check', sql`${t.section} in (${inList(CONFIG_SECTIONS)})`),
  check('config_signoffs_action_check', sql`${t.action} in ('sign_off', 'reopen')`),
  index('config_signoffs_bu_seq_idx').on(t.businessUnitId, t.seq),
  index('config_signoffs_version_idx').on(t.configVersionId),
]);

export const SIGNAL_CHANGES = ['off', 'on', 'added', 'removed'] as const;

/** A signal type switched off or on, added or removed in Setup, with why. Each change made the configuration version
 *  it names, so every run can be traced to the switches it was scored with (G-023). */
export const signalTypeChanges = pgTable('signal_type_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  configVersionId: uuid('config_version_id').notNull().references(() => configVersions.id),
  signalType: text('signal_type').notNull(),
  change: text('change').notNull(),
  reason: text('reason').notNull().default(''),
  /** The definition of a type added in Setup. */
  definition: jsonb('definition'),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('signal_type_changes_change_check', sql`${t.change} in (${inList(SIGNAL_CHANGES)})`),
  index('signal_type_changes_bu_seq_idx').on(t.businessUnitId, t.seq),
  index('signal_type_changes_version_idx').on(t.configVersionId),
]);

/** A change to the success-gate settings (D-21: G1 baseline and threshold, G2 threshold, the "too early to call"
 *  number, the spot-check share) and the configuration version it made: the change in words, and the settings before
 *  and after. Append-only; Setup's version history and Analytics' validation tab show it. */
export const configChanges = pgTable('config_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  configVersionId: uuid('config_version_id').notNull().references(() => configVersions.id),
  kind: text('kind').notNull(),
  changes: text('changes').array().notNull(),
  before: jsonb('before').notNull(),
  after: jsonb('after').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('config_changes_kind_check', sql`${t.kind} in ('validation')`),
  index('config_changes_bu_seq_idx').on(t.businessUnitId, t.seq),
  index('config_changes_version_idx').on(t.configVersionId),
]);

/* ─── Content library (G-009): brand-pack versions, the unit's working draft, guideline documents ─── */

/** Every saved brand pack, append-only: the highest version is the one new drafts follow; earlier ones are kept for
 *  lists already drafted with them, and can be restored (as a new version). */
export const brandVersions = pgTable('brand_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  versionNo: integer('version_no').notNull(),
  pack: jsonb('pack').notNull(),
  note: text('note').notNull().default(''),
  sections: text('sections').array().notNull().default(sql`'{}'::text[]`),
  changes: text('changes').array().notNull().default(sql`'{}'::text[]`),
  restoredFrom: integer('restored_from'),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [uniqueIndex('brand_versions_bu_version_key').on(t.businessUnitId, t.versionNo)]);

/** The unit's unsaved changes to the brand pack: one working draft, shared by the people who maintain it. */
export const brandDrafts = pgTable('brand_drafts', {
  businessUnitId: uuid('business_unit_id').primaryKey().references(() => businessUnits.id),
  baseVersionNo: integer('base_version_no').notNull(),
  pack: jsonb('pack').notNull(),
  updatedAt: updatedAt(),
  updatedBy: updatedBy(),
});

/** A brand guideline document, kept as the reference the pack names (never personal data). */
export const brandDocuments = pgTable('brand_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  fileName: text('file_name').notNull(),
  mediaType: text('media_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  sha256: text('sha256').notNull(),
  bytes: bytea('bytes').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [check('brand_documents_size_check', sql`${t.byteSize} > 0`), index('brand_documents_bu_idx').on(t.businessUnitId)]);

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

/** A list corrected since (G-015) is 'replaced' by its new version and kept only as the pointer to it, with the scoring
 *  runs made on it. */
export const LIST_STATUSES = ['draft', 'saved', 'replaced'] as const;
export const RUN_STATUSES = ['draft', 'saved'] as const;
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
  /** % clean, findings per D-code and readiness counts over the whole file (G-015); null on lists built before they were kept. */
  quality: jsonb('quality'),
  /** The file's own column names (its header row, or its fullest early row), for mapping them (G-040). */
  fileColumns: jsonb('file_columns').notNull().default([]),
  mappingId: uuid('mapping_id').references((): AnyPgColumn => columnMappings.id, { onDelete: 'set null' }),
  /** The version built when this list was corrected (status 'replaced'). */
  replacedByListId: uuid('replaced_by_list_id').references((): AnyPgColumn => leadLists.id, { onDelete: 'set null' }),
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
  index('lead_lists_replaced_by_idx').on(t.replacedByListId),
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
  /** The row's editable fields as the file (with its corrections) has them, for the edit form; null on older lists. */
  raw: jsonb('raw'),
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
  /** The signal settings this run was scored with (G-023), copied from the active configuration when it started:
   *  types switched off in Setup (their rows rejected as OFF) and types added there. Later changes leave the run as it was. */
  signalsOff: text('signals_off').array().notNull().default(sql`'{}'::text[]`),
  signalsCustom: jsonb('signals_custom').notNull().default([]),
  stats: jsonb('stats').notNull().default({}),
  checks: jsonb('checks').notNull().default([]),
  createdAt: createdAt(),
  createdBy: createdBy(),
  updatedAt: updatedAt(),
  updatedBy: updatedBy(),
  savedAt: tsz('saved_at'),
}, t => [
  check('scoring_runs_status_check', sql`${t.status} in (${inList(RUN_STATUSES)})`),
  index('scoring_runs_bu_status_idx').on(t.businessUnitId, t.status, t.createdAt),
  index('scoring_runs_list_idx').on(t.listId),
  index('scoring_runs_upload_idx').on(t.signalUploadId),
]);

/* ─── Corrections (G-015, D-17, G-021): append-only, replayed onto the upload's grid whenever a list is built ─── */

export const CORRECTION_FIELD_NAMES = ['first_name', 'last_name', 'job_title', 'email', 'email_verified', 'linkedin_url', 'city', 'country',
  'owner_email', 'employee_count', 'industry', 'opt_out', 'managed_separately', 'vertical', 'take_out'] as const;

export const corrections = pgTable('corrections', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** The order corrections are replayed in. */
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  uploadId: uuid('upload_id').notNull().references(() => uploads.id, { onDelete: 'cascade' }),
  /** The list it was made on, as history: no foreign key, because the log outlives a list version (it goes with its upload). */
  listId: uuid('list_id').notNull(),
  rowNo: integer('row_no').notNull(),
  field: text('field').notNull(),
  fromValue: text('from_value').notNull(),
  toValue: text('to_value').notNull(),
  severity: text('severity').notNull(),
  /** What was wrong, how the person knows, and their note. */
  reason: text('reason').notNull(),
  source: text('source').notNull(),
  note: text('note').notNull(),
  contactName: text('contact_name').notNull(),
  company: text('company').notNull(),
  /** The contact's owner when the correction was made: reps see the corrections to their own rows. */
  ownerEmail: text('owner_email'),
  actorRole: text('actor_role').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('corrections_field_check', sql`${t.field} in (${inList(CORRECTION_FIELD_NAMES)})`),
  check('corrections_severity_check', sql`${t.severity} in ('major', 'minor')`),
  check('corrections_row_check', sql`${t.rowNo} > 0`),
  uniqueIndex('corrections_seq_key').on(t.seq),
  index('corrections_upload_seq_idx').on(t.uploadId, t.seq),
  index('corrections_bu_seq_idx').on(t.businessUnitId, t.seq),
  index('corrections_list_idx').on(t.listId),
  lowerOwner('corrections_owner_lower_check', t.ownerEmail),
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

/* ─── Micro-segments and next best action (G-006, plan §7): built from a stored hand-off ─── */

/** A micro-segment build: the hand-off it grouped, as of the scoring run's date, stamped with the configuration and
 *  brand versions its actions, drafts and checks used. Never deleted by the app: its recommendations' decision log is
 *  the evidence for the success gates (purged with the pilot data, Phase 7). */
export const nbaRuns = pgTable('nba_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  handoffId: uuid('handoff_id').notNull().references(() => handoffs.id),
  scoringRunId: uuid('scoring_run_id').notNull().references(() => scoringRuns.id),
  name: text('name').notNull(),
  asOf: date('as_of', { mode: 'string' }).notNull(),
  configVersionId: uuid('config_version_id').references(() => configVersions.id),
  brandVersionId: uuid('brand_version_id').notNull().references(() => brandVersions.id),
  engineVersion: text('engine_version').notNull(),
  /** Seeds the order within a priority tier, so position doesn't decide the outcome. */
  seed: text('seed').notNull(),
  /** The micro-segments formed: [{ name, accounts }]. */
  segments: jsonb('segments').notNull().default([]),
  /** Accounts set aside by engage-once: [{ name, label, ownerEmail }]. */
  engaged: jsonb('engaged').notNull().default([]),
  /** Each build step's result, for the checks pop-up. */
  checks: jsonb('checks').notNull().default([]),
  stats: jsonb('stats').notNull().default({}),
  createdAt: createdAt(),
  createdBy: createdBy(),
  updatedAt: updatedAt(),
  updatedBy: updatedBy(),
}, t => [
  index('nba_runs_bu_time_idx').on(t.businessUnitId, t.createdAt),
  index('nba_runs_handoff_idx').on(t.handoffId),
  index('nba_runs_scoring_run_idx').on(t.scoringRunId),
]);

/** Kept in step with lib/engine/review.ts. */
export const REC_STATUSES = ['Waiting', 'Awaiting approval', 'Released', 'Closed', 'Set aside', 'Watch list'] as const;
export const REC_WHY = ['exception', 'sensitive', 'alternative', 'sent back', 'stepped in'] as const;
export const REC_OUTCOMES = ['Sent', 'Replied', 'Meeting booked', 'No response'] as const;
export const REJECT_CODES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12'] as const;

/** One recommendation per account: what the system produced when the micro-segments were built (immutable: the app
 *  role may update only the decision-state columns), and where the decision stands now. Owner-scoped by the
 *  current owner (G-014), who changes only when a manager reassigns it. */
export const recommendations = pgTable('recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  nbaRunId: uuid('nba_run_id').notNull().references(() => nbaRuns.id),
  handoffItemId: uuid('handoff_item_id').notNull().references(() => handoffItems.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  contactId: uuid('contact_id').notNull().references(() => contacts.id),
  /** The engine's key for the prospect: account engine ID | contact row. */
  engineKey: text('engine_key').notNull(),
  position: integer('position').notNull(),
  segment: text('segment'),
  action: text('action').notNull(),
  runnerUp: jsonb('runner_up'),
  /** The engine's recommendation as built (contact, account, people at the account, signals), for redrafting. */
  rec: jsonb('rec').notNull(),
  passed: boolean('passed').notNull().default(false),
  reasons: text('reasons').array().notNull().default(sql`'{}'::text[]`),
  // ── the decision as it stands (UPDATE granted on these columns only) ──
  ownerEmail: text('owner_email'),
  status: text('status').notNull(),
  why: text('why'),
  released: text('released'),
  routedAt: tsz('routed_at').notNull().defaultNow(),
  assignedSegment: text('assigned_segment'),
  segmentAt: tsz('segment_at'),
  useRunnerUp: boolean('use_runner_up').notNull().default(false),
  manualAction: text('manual_action'),
  channelPref: text('channel_pref'),
  variant: text('variant'),
  contactRow: integer('contact_row'),
  draftVersion: integer('draft_version').notNull().default(1),
  edited: boolean('edited').notNull().default(false),
  editRating: text('edit_rating'),
  fixed: text('fixed').array().notNull().default(sql`'{}'::text[]`),
  alternativeUsed: boolean('alternative_used').notNull().default(false),
  alternativeOf: text('alternative_of'),
  rejectCode: text('reject_code'),
  sentBackNote: text('sent_back_note'),
  spot: text('spot'),
  spotWeek: text('spot_week'),
  holdWhy: text('hold_why'),
  holdNote: text('hold_note'),
  holdAt: tsz('hold_at'),
  holdBy: uuid('hold_by').references(() => users.id),
  outcome: text('outcome'),
  meeting: jsonb('meeting'),
  openedAt: tsz('opened_at'),
  openedBy: uuid('opened_by').references(() => users.id),
  decidedAt: tsz('decided_at'),
  decidedBy: uuid('decided_by').references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  /** Content studio pieces a rep added to the email or LinkedIn message (attached, or shared as a link). */
  content: uuid('content').array().notNull().default(sql`'{}'::uuid[]`),
  createdAt: createdAt(),
  createdBy: createdBy(),
  updatedAt: updatedAt(),
  updatedBy: updatedBy(),
}, t => [
  check('recommendations_status_check', sql`${t.status} in (${inList(REC_STATUSES)})`),
  check('recommendations_why_check', sql`${t.why} is null or ${t.why} in (${inList(REC_WHY)})`),
  check('recommendations_released_check', sql`${t.released} is null or ${t.released} in ('auto', 'accepted', 'approved')`),
  check('recommendations_spot_check', sql`${t.spot} is null or ${t.spot} in ('pending', 'accepted', 'rejected')`),
  check('recommendations_outcome_check', sql`${t.outcome} is null or ${t.outcome} in (${inList(REC_OUTCOMES)})`),
  check('recommendations_reject_code_check', sql`${t.rejectCode} is null or ${t.rejectCode} in (${inList(REJECT_CODES)})`),
  check('recommendations_edit_rating_check', sql`${t.editRating} is null or ${t.editRating} in ('minor', 'major')`),
  check('recommendations_channel_check', sql`${t.channelPref} is null or ${t.channelPref} in ('Email', 'LinkedIn')`),
  uniqueIndex('recommendations_run_key').on(t.nbaRunId, t.engineKey),
  index('recommendations_run_position_idx').on(t.nbaRunId, t.position),
  index('recommendations_bu_status_idx').on(t.businessUnitId, t.status),
  index('recommendations_owner_idx').on(t.businessUnitId, t.ownerEmail),
  index('recommendations_handoff_item_idx').on(t.handoffItemId),
  index('recommendations_account_idx').on(t.accountId),
  index('recommendations_contact_idx').on(t.contactId),
  lowerOwner('recommendations_owner_lower_check', t.ownerEmail),
]);

/** Every version of a recommendation's message (5.19): generated by the rules, regenerated after a rejection, or edited
 *  by a person. Append-only; the recommendation names the current one. */
export const drafts = pgTable('drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  recommendationId: uuid('recommendation_id').notNull().references(() => recommendations.id),
  version: integer('version').notNull(),
  channel: text('channel').notNull(),
  /** The action and contact row it was drafted for. */
  action: text('action').notNull(),
  contactRow: integer('contact_row'),
  /** The draft as the engine shapes it: subject, body, note, task, why, proof, noProof, unreachable. */
  draft: jsonb('draft').notNull(),
  checks: jsonb('checks').notNull(),
  confidence: jsonb('confidence').notNull(),
  /** Why this version exists ("Generated from the action", "Edited before accepting (minor: …)"). */
  reason: text('reason').notNull(),
  aiAssisted: boolean('ai_assisted').notNull().default(false),
  /** The AI call that wrote this version (Phase 6), when it was written with AI. */
  aiCallId: uuid('ai_call_id'),
  brandVersionId: uuid('brand_version_id').notNull().references(() => brandVersions.id),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('drafts_channel_check', sql`${t.channel} in ('Email', 'LinkedIn', 'Task')`),
  check('drafts_version_check', sql`${t.version} > 0`),
  check('drafts_ai_check', sql`(${t.aiCallId} is null) or ${t.aiAssisted}`),
  uniqueIndex('drafts_recommendation_version_key').on(t.recommendationId, t.version),
  index('drafts_bu_idx').on(t.businessUnitId),
]);

export const LOG_KINDS = ['exception', 'spot', 'alternative', 'intervention', 'system', 'manager_check', 'autopilot'] as const;

/** Who decided what about a recommendation, when and why (plan §7). Append-only: a manager's check of a flagged
 *  decision is a new row linked to it. The measures (G1, G2) are computed from it. */
export const decisionLog = pgTable('decision_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  nbaRunId: uuid('nba_run_id').notNull().references(() => nbaRuns.id),
  recommendationId: uuid('recommendation_id').notNull().references(() => recommendations.id),
  actorRole: text('actor_role').notNull(),
  decision: text('decision').notNull(),
  kind: text('kind'),
  reasonCode: text('reason_code'),
  reason: text('reason').notNull().default(''),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  action: text('action').notNull().default(''),
  channel: text('channel').notNull().default(''),
  /** The micro-segment the item was in, and the contact row it was about, when it was logged. */
  segment: text('segment').notNull().default(''),
  contactRow: integer('contact_row'),
  note: text('note').notNull().default(''),
  draftVersion: integer('draft_version'),
  openedAt: tsz('opened_at'),
  seconds: integer('seconds'),
  queuePosition: integer('queue_position'),
  decisive: boolean('decisive').notNull().default(false),
  firstPass: boolean('first_pass'),
  accepted: boolean('accepted'),
  flag: text('flag'),
  linkedTo: uuid('linked_to').references((): AnyPgColumn => decisionLog.id),
  cause: text('cause'),
  compliance: boolean('compliance').notNull().default(false),
  intervention: boolean('intervention').notNull().default(false),
  /** The item's owner when it was logged (reps' own results). */
  ownerEmail: text('owner_email'),
  editRating: text('edit_rating'),
  configVersionId: uuid('config_version_id').references(() => configVersions.id),
  brandVersionId: uuid('brand_version_id').references(() => brandVersions.id),
  requestId: text('request_id'),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('decision_log_kind_check', sql`${t.kind} is null or ${t.kind} in (${inList(LOG_KINDS)})`),
  check('decision_log_reason_code_check', sql`${t.reasonCode} is null or ${t.reasonCode} in (${inList(REJECT_CODES)})`),
  check('decision_log_cause_check', sql`${t.cause} is null or ${t.cause} in ('data', 'system', 'other', 'compliance')`),
  check('decision_log_edit_rating_check', sql`${t.editRating} is null or ${t.editRating} in ('none', 'minor', 'major')`),
  uniqueIndex('decision_log_seq_key').on(t.seq),
  index('decision_log_bu_seq_idx').on(t.businessUnitId, t.seq),
  index('decision_log_recommendation_idx').on(t.recommendationId, t.seq),
  index('decision_log_run_idx').on(t.nbaRunId),
  index('decision_log_actor_idx').on(t.businessUnitId, t.createdBy),
  index('decision_log_linked_idx').on(t.linkedTo),
  lowerOwner('decision_log_owner_lower_check', t.ownerEmail),
]);

/** A manager pausing or resuming a micro-segment (6.3); '' is the group with no micro-segment. The state is the latest row. */
export const segmentPauses = pgTable('segment_pauses', {
  id: uuid('id').primaryKey().defaultRandom(),
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  nbaRunId: uuid('nba_run_id').notNull().references(() => nbaRuns.id),
  segment: text('segment').notNull(),
  action: text('action').notNull(),
  reason: text('reason').notNull().default(''),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('segment_pauses_action_check', sql`${t.action} in ('pause', 'resume')`),
  index('segment_pauses_run_seq_idx').on(t.nbaRunId, t.seq),
  index('segment_pauses_bu_idx').on(t.businessUnitId),
]);

/** A micro-segment a person created in For Review for an account the system could not group (fewer than
 *  CONFIG.minSegmentAccounts accounts share its signal), so it may hold fewer accounts. It stays for later lists in the
 *  unit. `theme` is the system segment whose actions and messages it follows. The system's own micro-segments are
 *  formed per build (nba_runs.segments) and never come from here. Append-only. */
export const customSegments = pgTable('custom_segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  name: citext('name').notNull(),
  theme: text('theme').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [uniqueIndex('custom_segments_bu_name_key').on(t.businessUnitId, t.name)]);

/** Step 2 · The weekly spot-check: once per ISO week and owner ('' = unassigned), a random share of what went ahead on
 *  its own since the last draw goes back to its rep to rate. Append-only: the draw is part of the evidence. */
export const spotChecks = pgTable('spot_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  isoWeek: text('iso_week').notNull(),
  ownerEmail: text('owner_email').notNull(),
  eligible: integer('eligible').notNull(),
  picked: uuid('picked').array().notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  uniqueIndex('spot_checks_bu_week_owner_key').on(t.businessUnitId, t.isoWeek, t.ownerEmail),
  lowerOwner('spot_checks_owner_lower_check', t.ownerEmail),
]);

/** When each person was last shown their For Review queue: a decision made from a row is timed from here. */
export const reviewViews = pgTable('review_views', {
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  shownAt: tsz('shown_at').notNull().defaultNow(),
}, t => [primaryKey({ name: 'review_views_pkey', columns: [t.businessUnitId, t.userId] })]);

/* ─── Content studio (D-36): blogs and whitepapers in the brand voice, shared in the unit ─── */

/** Kept in step with lib/content/studio.ts. */
export const STUDIO_TYPES = ['blog', 'whitepaper'] as const;
export const STUDIO_TONES = ['Direct', 'Formal', 'Warm'] as const;
export const STUDIO_LENGTHS = ['Short', 'Medium', 'Long'] as const;
export const STUDIO_STATUSES = ['Draft', 'Ready'] as const;

/** A piece: its brief, its sources (approved claim IDs it may cite) and its blocks of plain text. Ready means it is in
 *  the Content library, where reps add it to messages; only a piece whose checks pass gets there. `rev` guards against
 *  two people overwriting each other. */
export const studioItems = pgTable('studio_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  topic: text('topic').notNull(),
  /** Who it is written for, in the person's words; empty for a general reader (D-45: not a micro-segment). */
  audience: text('audience').notNull().default(''),
  tone: text('tone').notNull(),
  length: text('length').notNull(),
  sources: text('sources').array().notNull().default(sql`'{}'::text[]`),
  blocks: jsonb('blocks').notNull(),
  status: text('status').notNull().default('Draft'),
  /** The brand version it was written with. */
  brandVersionNo: integer('brand_version_no').notNull(),
  rev: integer('rev').notNull().default(1),
  createdAt: createdAt(),
  createdBy: createdBy(),
  updatedAt: updatedAt(),
  updatedBy: updatedBy(),
}, t => [
  check('studio_items_type_check', sql`${t.type} in (${inList(STUDIO_TYPES)})`),
  check('studio_items_tone_check', sql`${t.tone} in (${inList(STUDIO_TONES)})`),
  check('studio_items_length_check', sql`${t.length} in (${inList(STUDIO_LENGTHS)})`),
  check('studio_items_status_check', sql`${t.status} in (${inList(STUDIO_STATUSES)})`),
  index('studio_items_bu_time_idx').on(t.businessUnitId, t.updatedAt),
]);

/** The conversation that wrote a piece: what was asked and what the writer answered. Append-only. */
export const studioMessages = pgTable('studio_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  itemId: uuid('item_id').notNull().references(() => studioItems.id),
  who: text('who').notNull(),
  text: text('text').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('studio_messages_who_check', sql`${t.who} in ('me', 'ai')`),
  index('studio_messages_item_idx').on(t.itemId, t.seq),
  index('studio_messages_bu_idx').on(t.businessUnitId),
]);

/* ─── The pilot readout (7.5, D-27, D-38): verdicts per success area and the sponsor's decision ─── */

/** The readout the verdicts are recorded against; created with the unit's first sign-off, the newest is current. */
export const readouts = pgTable('readouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  name: text('name').notNull().default('Pilot readout'),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [index('readouts_bu_time_idx').on(t.businessUnitId, t.createdAt)]);

/** Kept in step with AREAS in lib/server/services/analytics.ts. */
export const READOUT_KINDS = ['discovery', 'qualification', 'intent', 'routing', 'content', 'value', 'sponsor'] as const;
export const AREA_VERDICTS = ['Satisfied', 'Satisfied with concerns', 'Not satisfied'] as const;
export const SPONSOR_DECISIONS = ['Go to production', 'Extend the pilot', 'Stop'] as const;

/** A validator's verdict on one success area, or the sponsor's decision, tied to the signed-in Admin or Sales manager
 *  who recorded it and their role then (D-27), with the evidence in front of them. Append-only: a later row of the
 *  same kind supersedes an earlier one, which stays as history. */
export const readoutSignoffs = pgTable('readout_signoffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  readoutId: uuid('readout_id').notNull().references(() => readouts.id),
  kind: text('kind').notNull(),
  verdict: text('verdict').notNull(),
  note: text('note').notNull().default(''),
  actorRole: text('actor_role').notNull(),
  evidence: jsonb('evidence').notNull(),
  configVersionId: uuid('config_version_id').references(() => configVersions.id),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('readout_signoffs_kind_check', sql`${t.kind} in (${inList(READOUT_KINDS)})`),
  check('readout_signoffs_verdict_check', sql`(${t.kind} = 'sponsor' and ${t.verdict} in (${inList(SPONSOR_DECISIONS)})) or (${t.kind} <> 'sponsor' and ${t.verdict} in (${inList(AREA_VERDICTS)}))`),
  index('readout_signoffs_bu_seq_idx').on(t.businessUnitId, t.seq),
  index('readout_signoffs_readout_idx').on(t.readoutId, t.kind, t.seq),
]);

/* ─── Lead routing (D-34): rules that suggest an owner and a business unit, and accounts moved to another unit ─── */

/** A unit's routing rules, in order: the first active rule whose countries, verticals and tiers all match an account
 *  (an empty list matches anything) names who should own it when the lead file names nobody, and the business unit
 *  it belongs to. Changed by managers; every change is audited. */
export const routingRules = pgTable('routing_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  position: integer('position').notNull(),
  name: text('name').notNull(),
  countries: text('countries').array().notNull().default(sql`'{}'::text[]`),
  verticals: text('verticals').array().notNull().default(sql`'{}'::text[]`),
  tiers: text('tiers').array().notNull().default(sql`'{}'::text[]`),
  /** A sales rep's sign-in email: owns matching accounts the lead file gives no owner. */
  assignOwner: text('assign_owner'),
  targetBusinessUnitId: uuid('target_business_unit_id').references(() => businessUnits.id),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  createdBy: createdBy(),
  updatedAt: updatedAt(),
  updatedBy: updatedBy(),
}, t => [
  index('routing_rules_bu_position_idx').on(t.businessUnitId, t.position),
  check('routing_rules_owner_lower_check', sql`${t.assignOwner} is null or ${t.assignOwner} = lower(${t.assignOwner})`),
]);

/** An account a manager moved to another business unit: its rows (as corrected) went there as a lead file, and this
 *  unit stops handing it off. Append-only; both units see it. */
export const accountTransfers = pgTable('account_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  toBusinessUnitId: uuid('to_business_unit_id').notNull().references(() => businessUnits.id),
  /** The engine's company key: the same company in a later list of this unit is not handed off again. */
  accountKey: text('account_key').notNull(),
  accountName: text('account_name').notNull(),
  fromListId: uuid('from_list_id').notNull(),
  fromAccountId: uuid('from_account_id').notNull(),
  rows: integer('rows').notNull(),
  reason: text('reason').notNull(),
  ruleId: uuid('rule_id'),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  index('account_transfers_bu_key_idx').on(t.businessUnitId, t.accountKey),
  index('account_transfers_to_bu_idx').on(t.toBusinessUnitId),
  check('account_transfers_other_unit_check', sql`${t.toBusinessUnitId} <> ${t.businessUnitId}`),
]);

/* ─── Column mappings (G-040): a person's choice of template column for a source's own column names ─── */

export const columnMappings = pgTable('column_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  /** { "file column name": "template column" } */
  mapping: jsonb('mapping').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
  updatedAt: updatedAt(),
  updatedBy: updatedBy(),
}, t => [
  check('column_mappings_kind_check', sql`${t.kind} in (${inList(UPLOAD_KINDS)})`),
  uniqueIndex('column_mappings_bu_kind_name_key').on(t.businessUnitId, t.kind, t.name),
]);

/* ─── AI (Phase 6; D-5, D-6, D-35): what each model call was, never what it said ─── */

export const AI_CAPABILITIES = ['classify', 'why_now', 'draft_message', 'draft_content', 'copilot', 'healthcheck'] as const;
export const AI_OUTCOMES = ['ok', 'fallback', 'filtered', 'error'] as const;
export const AI_CALL_PROVIDERS = ['azure-openai', 'bedrock'] as const;

/** One row per call the gateway made (its retries and its one repair included): metadata only, no prompt and no reply
 *  (D-6). Append-only; a unit sees its own. */
export const aiCalls = pgTable('ai_calls', {
  id: uuid('id').primaryKey(),
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  capability: text('capability').notNull(),
  templateId: text('template_id').notNull(),
  templateVersion: integer('template_version').notNull(),
  provider: text('provider').notNull(),
  deployment: text('deployment').notNull(),
  /** The model that answered, as the provider named it (D-44); null when none did, and on calls before migration 0038. */
  model: text('model'),
  /** The reasoning effort asked for (GPT-5 models); null for a model that doesn't reason. */
  reasoningEffort: text('reasoning_effort'),
  latencyMs: integer('latency_ms').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  attempts: integer('attempts').notNull(),
  outcome: text('outcome').notNull(),
  fallbackReason: text('fallback_reason'),
  /** Content-filter categories that fired, by name only. */
  filterCategories: text('filter_categories').array().notNull().default(sql`'{}'::text[]`),
  estCostUsd: doublePrecision('est_cost_usd'),
  requestId: text('request_id'),
  providerRequestId: text('provider_request_id'),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('ai_calls_capability_check', sql`${t.capability} in (${inList(AI_CAPABILITIES)})`),
  check('ai_calls_outcome_check', sql`${t.outcome} in (${inList(AI_OUTCOMES)})`),
  check('ai_calls_provider_check', sql`${t.provider} in (${inList(AI_CALL_PROVIDERS)})`),
  check('ai_calls_reason_check', sql`(${t.outcome} = 'ok') = (${t.fallbackReason} is null)`),
  index('ai_calls_bu_seq_idx').on(t.businessUnitId, t.seq),
  index('ai_calls_bu_capability_idx').on(t.businessUnitId, t.capability, t.createdAt),
]);

/** The AI classifier's answer for an industry text the mapping table doesn't match, kept per unit, template version
 *  and model so every rebuild of a list (corrections replayed) reads the same answer instead of asking again. */
export const aiVerticals = pgTable('ai_verticals', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  /** industryKey(industry, site process): the two texts as the lookup reads them. */
  industryKey: text('industry_key').notNull(),
  templateVersion: integer('template_version').notNull(),
  /** The provider and deployment that answered: another model asks again. */
  model: text('model').notNull().default(''),
  vertical: text('vertical').notNull(),
  confidence: text('confidence').notNull(),
  reason: text('reason').notNull(),
  /** The call that answered (no foreign key: a record that failed to store must not lose the answer). */
  aiCallId: uuid('ai_call_id').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('ai_verticals_confidence_check', sql`${t.confidence} in ('high', 'medium', 'low')`),
  uniqueIndex('ai_verticals_bu_key_version_key').on(t.businessUnitId, t.industryKey, t.templateVersion, t.model),
]);

/** A run of Autopilot (G-013, the legacy Copilot contract): what a person asked it to do, what it did and what it
 *  left, and what each item was before, so the person who ran it can undo it. Only the undo columns ever change. */
export const autopilotRuns = pgTable('autopilot_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  kind: text('kind').notNull(),
  instruction: text('instruction').notNull(),
  /** [{ id, before: { status, released, spot, decidedAt, decidedBy, holdWhy, holdNote, holdAt, holdBy } }] */
  items: jsonb('items').notNull(),
  /** [{ id, why }] */
  skipped: jsonb('skipped').notNull(),
  undoneAt: tsz('undone_at'),
  undoneBy: uuid('undone_by').references((): AnyPgColumn => users.id),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('autopilot_runs_kind_check', sql`${t.kind} in ('spot', 'exception')`),
  index('autopilot_runs_bu_idx').on(t.businessUnitId, t.createdAt),
]);

/* ─── Copilot's saved chats (G-013, the legacy panel's saved chats) ─── */

/** Kept in step with COPILOT_SCREENS in lib/copilot/types.ts. */
export const COPILOT_CHAT_SCREENS = ['today', 'review', 'nba', 'prospecting', 'scoring'] as const;

/** One person's conversation with Copilot about a screen and the record open on it (`ref_key`: 'list:<id>',
 *  'run:<id>', 'nba:<id>', 'item:<id>', or 'queue'). Private to the person who had it; they may delete it. A chat about
 *  a list, run, build or item goes with that record, so the end-of-pilot purge removes it with the data it talks about. */
export const copilotChats = pgTable('copilot_chats', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  screen: text('screen').notNull(),
  refKey: text('ref_key').notNull(),
  /** The CopilotRef of the record the chat is about (no focus: a prospect or item picked on the way is per message). */
  ref: jsonb('ref').notNull(),
  listId: uuid('list_id').references(() => leadLists.id, { onDelete: 'cascade' }),
  runId: uuid('run_id').references(() => scoringRuns.id, { onDelete: 'cascade' }),
  nbaRunId: uuid('nba_run_id').references(() => nbaRuns.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').references(() => recommendations.id, { onDelete: 'cascade' }),
  /** What the panel's header said when the chat began (a file, a run, a person and account). */
  title: text('title').notNull(),
  createdAt: createdAt(),
  createdBy: createdBy(),
  updatedAt: updatedAt(),
}, t => [
  check('copilot_chats_screen_check', sql`${t.screen} in (${inList(COPILOT_CHAT_SCREENS)})`),
  index('copilot_chats_owner_idx').on(t.businessUnitId, t.createdBy, t.screen, t.updatedAt),
  index('copilot_chats_ref_idx').on(t.createdBy, t.refKey, t.updatedAt),
  index('copilot_chats_list_idx').on(t.listId),
  index('copilot_chats_run_idx').on(t.runId),
  index('copilot_chats_nba_run_idx').on(t.nbaRunId),
  index('copilot_chats_item_idx').on(t.itemId),
]);

/** A question or an answer in a chat. An answer keeps its blocks as they were shown; `text` is its plain form, sent as
 *  an earlier turn with the next question. `focus` is the prospect or item picked when the question was asked. */
export const copilotMessages = pgTable('copilot_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  businessUnitId: uuid('business_unit_id').notNull().references(() => businessUnits.id),
  chatId: uuid('chat_id').notNull().references(() => copilotChats.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  text: text('text').notNull(),
  answer: jsonb('answer'),
  focus: jsonb('focus'),
  createdAt: createdAt(),
  createdBy: createdBy(),
}, t => [
  check('copilot_messages_role_check', sql`${t.role} in ('you', 'copilot')`),
  check('copilot_messages_answer_check', sql`(${t.role} = 'copilot') = (${t.answer} is not null)`),
  index('copilot_messages_chat_idx').on(t.chatId, t.seq),
  index('copilot_messages_bu_idx').on(t.businessUnitId),
]);
