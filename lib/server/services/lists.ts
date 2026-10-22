// Prospecting on the server (G-004, G-012, G-022): a lead file's checks run as a job and the result is stored as a
// list (draft until saved), so a list of any size saves, reloads and is shared within the business unit. Screens
// read it a page at a time (keyset on the sheet row or the engine's order) with server search. Rows about people
// are owner-scoped twice: row-level security, and the filters here (G-014).
import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNull, like, notExists, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { LEAD_COLUMNS, LEAD_REQUIRED, processLeads, readTable } from '../../demandai-engine.ts';
import { ENGINE_VERSION } from '../../engine/config.ts';
import { LEAD_SHEET } from '../../engine/sheets.ts';
import { STEPS, checkOf, groupIssues, stepResult, type StepResult } from '../../prospecting/checks.ts';
import { can, type BuRole } from '../../auth/permissions.ts';
import type { Account, Contact, Issue, LeadList, LeadResult, LeadStats, Severity } from '../../../types/demandai';
import { accounts, configVersions, contacts, issues, leadLists, scoringRuns, uploads, CONTACT_GROUPS } from '../db/schema.ts';
import { withTenant, type TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { JobError, jobContext } from '../jobs/queue.ts';
import type { JobRun } from '../jobs/worker.ts';
import { readUpload, UploadReadError, type FileNote } from '../uploads/parse.ts';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.ts';
import { logger } from '../logger.ts';
import { loadUpload, type UploadLimits } from './uploads.ts';

export type Actor = { userId: string; role: BuRole };
export type ContactGroup = (typeof CONTACT_GROUPS)[number];

export const PAGE_DEFAULT = 200;
export const PAGE_MAX = 500;
const INSERT_CHUNK = 1000;

/* ─── Small shared helpers (also used by scoring and hand-offs) ─── */

export function chunks<T>(rows: T[], size = INSERT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** A LIKE pattern for a search box: lower-case, with %, _ and \ taken literally. */
export function containsPattern(q: string): string {
  return '%' + q.trim().toLowerCase().replace(/[\\%_]/g, m => '\\' + m) + '%';
}

/** The repository half of owner scoping: reps only get rows they own (row-level security is the other half). */
export function ownerOnly(scope: TenantScope, column: AnyPgColumn): SQL | undefined {
  if (scope.ctx.scope === 'all') return undefined;
  const emails = scope.ctx.ownerEmails.map(e => e.toLowerCase());
  return emails.length ? inArray(column, emails) : sql`false`;
}

export async function activeConfigVersionId(scope: TenantScope): Promise<string | null> {
  const [c] = await scope.tx.select({ id: configVersions.id }).from(configVersions)
    .where(and(eq(configVersions.businessUnitId, scope.ctx.businessUnitId), eq(configVersions.status, 'active')));
  return c?.id ?? null;
}

export const isManager = (role: BuRole) => can(role, 'users.manage');

function groupOf(status: string): ContactGroup {
  return status === 'In the final list' ? 'in' : status.startsWith('In the list') ? 'nc' : 'out';
}

const lower = (s: string | undefined | null) => (s ? s.trim().toLowerCase() : '') || null;

/* ─── The job: parse, check, save ─── */

function withNotes(result: LeadResult, notes: FileNote[], file: string, sheet: string): LeadResult {
  if (!notes.length) return result;
  const noteIssues: Issue[] = notes.map(n => ({ file, sheet, row: '—', field: '—', issue: n.issue, outcome: n.outcome, code: '—', fix: n.fix, severity: 'info' }));
  const all = [...noteIssues, ...result.issues];
  const bySeverity = (['stop', 'flag', 'info'] as Severity[]).reduce((o, s) => (o[s] = all.filter(i => i.severity === s).length, o), {} as Record<Severity, number>);
  return { ...result, issues: all, stats: { ...result.stats, issues: all.length, issuesBySeverity: bySeverity } };
}

export function createLeadJob(limits: UploadLimits) {
  return async function processLeadUpload(run: JobRun): Promise<Record<string, string>> {
    const { db, job } = run;
    const ctx = jobContext(job.businessUnitId);
    await run.stage('parse');
    const upload = await withTenant(db, ctx, s => loadUpload(s, job.payload.uploadId), { label: 'lead.load' });
    if (!upload) throw new JobError('gone', 'The uploaded file is no longer there. Upload it again.');
    let read;
    try {
      read = readUpload(upload.bytes, upload.format, { ...LEAD_SHEET, maxRows: limits.maxRows });
    } catch (err) {
      if (err instanceof UploadReadError) throw new JobError(err.code, err.message);
      throw err;
    }
    await run.stage('check', { sheetRows: read.grid.length });
    const result = withNotes(processLeads(read.grid, { file: upload.fileName, sheet: read.sheet }), read.notes, upload.fileName, read.sheet);
    // Each sheet row's owner, so issues on rows that never became contacts are scoped to that owner too.
    const rawOwners = new Map(readTable(read.grid, { file: upload.fileName, sheet: read.sheet, columns: LEAD_COLUMNS, required: LEAD_REQUIRED, anchor: 'company_name' })
      .records.map(r => [r.__row, lower(r.owner_email)]));
    await run.stage('save', { rowsRead: result.stats.rowsRead, contacts: result.stats.contacts, accounts: result.stats.accounts, issues: result.issues.length });
    const listId = await withTenant(db, ctx, async s => {
      const id = await insertList(s, { upload, sheet: read.sheet, result, rawOwners, createdBy: job.createdBy });
      await s.tx.update(uploads).set({ sheetName: read.sheet, rowsRead: result.stats.rowsRead }).where(eq(uploads.id, upload.id));
      return id;
    }, { label: 'lead.save', slowMs: 30_000 });
    return { listId };
  };
}

type InsertListInput = {
  upload: { id: string; fileName: string; sandbox: boolean };
  sheet: string;
  result: LeadResult;
  rawOwners: Map<number, string | null>;
  createdBy: string;
};

async function insertList(scope: TenantScope, input: InsertListInput): Promise<string> {
  const { upload, result, createdBy } = input;
  const bu = scope.ctx.businessUnitId;
  const checks: StepResult[] = STEPS.map(([k]) => stepResult(result, k, groupIssues(result)));
  const [list] = await scope.tx.insert(leadLists).values({
    businessUnitId: bu, uploadId: upload.id, name: upload.fileName.replace(/\.[^.]+$/, '') || upload.fileName, status: 'draft', sandbox: upload.sandbox,
    sourceFile: upload.fileName, sheetName: input.sheet, configVersionId: await activeConfigVersionId(scope), engineVersion: ENGINE_VERSION,
    stats: result.stats, checks, createdBy, updatedBy: createdBy,
  }).returning({ id: leadLists.id });
  await insertRows(scope, list.id, result.accounts, result.contacts, result.issues, input.rawOwners, createdBy);
  return list.id;
}

/** Writes accounts, contacts and issues for a list. Shared by the job and by saving a selection. */
async function insertRows(scope: TenantScope, listId: string, accs: Account[], cons: Contact[], iss: Issue[], rawOwners: Map<number, string | null>, createdBy: string) {
  const bu = scope.ctx.businessUnitId;
  const accountIds = new Map(accs.map(a => [a.id, randomUUID()]));
  for (const part of chunks(accs.map((a, seq) => ({
    id: accountIds.get(a.id)!, businessUnitId: bu, listId, seq, engineId: a.id, name: a.name, ownerEmail: lower(a.owner),
    excluded: a.excluded, needsReview: a.needsReview, search: a.name.toLowerCase(), data: a, createdBy,
  })))) await scope.tx.insert(accounts).values(part);
  for (const part of chunks(cons.map(c => ({
    businessUnitId: bu, listId, accountId: accountIds.get(c.accountId)!, rowNo: c.row, statusGroup: groupOf(c.status), ownerEmail: lower(c.owner),
    search: `${c.name} ${c.company} ${c.jobTitle}`.toLowerCase(), data: c, createdBy,
  })))) await scope.tx.insert(contacts).values(part);
  // An issue shows on its own contact row; a merged duplicate's on the row it was merged into; others are "not on
  // any contact" (rows not loaded, or the whole file).
  const contactOwner = new Map(cons.map(c => [c.row, lower(c.owner)]));
  const issueRows = iss.map((i, seq) => {
    const rowNo = typeof i.row === 'number' ? i.row : null;
    const merged = i.code === 'D5' && i.outcome.startsWith('Merged into row ') ? Number(i.outcome.slice('Merged into row '.length)) : null;
    const attach = merged !== null && contactOwner.has(merged) ? merged : rowNo !== null && contactOwner.has(rowNo) ? rowNo : null;
    const ownerEmail = attach !== null ? contactOwner.get(attach)! : rowNo !== null ? rawOwners.get(rowNo) ?? null : null;
    return { businessUnitId: bu, listId, seq, rowNo, attachRowNo: attach, ownerEmail, checkKey: checkOf(i), severity: i.severity, data: i, createdBy };
  });
  for (const part of chunks(issueRows)) await scope.tx.insert(issues).values(part);
}

/* ─── Reading lists ─── */

export type ListSummary = {
  id: string; name: string; status: string; sandbox: boolean; sourceFile: string; sheet: string; stats: LeadStats;
  createdAt: Date; savedAt: Date | null; scored: boolean;
};

const listColumns = {
  id: leadLists.id, name: leadLists.name, status: leadLists.status, sandbox: leadLists.sandbox, sourceFile: leadLists.sourceFile,
  sheet: leadLists.sheetName, stats: leadLists.stats, createdAt: leadLists.createdAt, savedAt: leadLists.savedAt,
  scored: sql<boolean>`exists (select 1 from scoring_runs r where r.list_id = lead_lists.id and r.status = 'saved')`,
};

/** Saved lists of the unit, newest first (shared within the unit, D-33). */
export async function savedLists(scope: TenantScope): Promise<ListSummary[]> {
  const rows = await scope.tx.select(listColumns).from(leadLists)
    .where(and(eq(leadLists.businessUnitId, scope.ctx.businessUnitId), eq(leadLists.status, 'saved')))
    .orderBy(desc(leadLists.createdAt));
  return rows.map(r => ({ ...r, stats: r.stats as LeadStats }));
}

export type ListDetail = ListSummary & {
  checks: StepResult[];
  /** What the caller can see: reps only their own rows (D-33). */
  scope: 'all' | 'own';
  visible: { contacts: Record<'all' | ContactGroup, number>; accounts: { all: number; pass: number; excluded: number; review: number } };
  canEdit: boolean;
};

async function listRow(scope: TenantScope, id: string) {
  const [l] = await scope.tx.select({ ...listColumns, checks: leadLists.checks, createdBy: leadLists.createdBy, uploadId: leadLists.uploadId })
    .from(leadLists).where(and(eq(leadLists.id, id), eq(leadLists.businessUnitId, scope.ctx.businessUnitId)));
  return l ?? null;
}

export async function getList(scope: TenantScope, actor: Actor, id: string): Promise<ListDetail> {
  const l = await listRow(scope, id);
  if (!l) throw notFound('That list is not there any more.');
  const groups = await scope.tx.select({ g: contacts.statusGroup, n: sql<number>`count(*)::int` }).from(contacts)
    .where(and(eq(contacts.listId, id), ownerOnly(scope, contacts.ownerEmail))).groupBy(contacts.statusGroup);
  const [a] = await scope.tx.select({
    all: sql<number>`count(*)::int`, pass: sql<number>`(count(*) filter (where not ${accounts.excluded}))::int`,
    excluded: sql<number>`(count(*) filter (where ${accounts.excluded}))::int`, review: sql<number>`(count(*) filter (where ${accounts.needsReview}))::int`,
  }).from(accounts).where(and(eq(accounts.listId, id), ownerOnly(scope, accounts.ownerEmail)));
  const c = { all: 0, in: 0, nc: 0, out: 0 };
  for (const g of groups) { c[g.g as ContactGroup] = g.n; c.all += g.n; }
  return {
    id: l.id, name: l.name, status: l.status, sandbox: l.sandbox, sourceFile: l.sourceFile, sheet: l.sheet, createdAt: l.createdAt, savedAt: l.savedAt,
    scored: l.scored, stats: l.stats as LeadStats, checks: l.checks as StepResult[], scope: scope.ctx.scope, visible: { contacts: c, accounts: a },
    canEdit: isManager(actor.role) || l.createdBy === actor.userId,
  };
}

export type Page<T> = { rows: T[]; next: number | null };
export type PageQuery = { after?: number; limit?: number; q?: string };

const limitOf = (q: PageQuery) => Math.min(Math.max(1, q.limit ?? PAGE_DEFAULT), PAGE_MAX);

export type ContactRow = { id: string; contact: Contact; account: { industry: string; employees: number | null } | null; issues: Issue[] };

export async function listContacts(scope: TenantScope, listId: string, query: PageQuery & { group?: ContactGroup }): Promise<Page<ContactRow>> {
  if (!(await listRow(scope, listId))) throw notFound('That list is not there any more.');
  const limit = limitOf(query);
  const rows = await scope.tx.select({
    id: contacts.id, rowNo: contacts.rowNo, data: contacts.data,
    industry: sql<string | null>`${accounts.data}->>'industry'`, employees: sql<number | null>`(${accounts.data}->>'employees')::float8`, hasAccount: sql<boolean>`${accounts.id} is not null`,
  }).from(contacts).leftJoin(accounts, eq(accounts.id, contacts.accountId))
    .where(and(eq(contacts.listId, listId), ownerOnly(scope, contacts.ownerEmail), query.group ? eq(contacts.statusGroup, query.group) : undefined,
      query.q?.trim() ? like(contacts.search, containsPattern(query.q)) : undefined, query.after !== undefined ? gt(contacts.rowNo, query.after) : undefined))
    .orderBy(asc(contacts.rowNo)).limit(limit + 1);
  const page = rows.slice(0, limit);
  const byRow = new Map<number, Issue[]>();
  if (page.length) {
    const found = await scope.tx.select({ row: issues.attachRowNo, data: issues.data }).from(issues)
      .where(and(eq(issues.listId, listId), inArray(issues.attachRowNo, page.map(r => r.rowNo)))).orderBy(asc(issues.seq));
    for (const f of found) byRow.set(f.row!, [...(byRow.get(f.row!) ?? []), f.data as Issue]);
  }
  return {
    rows: page.map(r => ({ id: r.id, contact: r.data as Contact, account: r.hasAccount ? { industry: r.industry ?? '', employees: r.employees } : null, issues: byRow.get(r.rowNo) ?? [] })),
    next: rows.length > limit ? page[page.length - 1].rowNo : null,
  };
}

export type AccountRow = { id: string; account: Account; contacts: number; primary: number };
export type AccountFilter = 'pass' | 'excluded' | 'review';

export async function listAccounts(scope: TenantScope, listId: string, query: PageQuery & { filter?: AccountFilter }): Promise<Page<AccountRow>> {
  if (!(await listRow(scope, listId))) throw notFound('That list is not there any more.');
  const limit = limitOf(query);
  const f = query.filter;
  const rows = await scope.tx.select({
    id: accounts.id, seq: accounts.seq, data: accounts.data,
    contacts: sql<number>`(select count(*)::int from contacts c where c.account_id = accounts.id)`,
    primary: sql<number>`(select count(*)::int from contacts c where c.account_id = accounts.id and c.data->>'persona' = 'Primary')`,
  }).from(accounts)
    .where(and(eq(accounts.listId, listId), ownerOnly(scope, accounts.ownerEmail),
      f === 'pass' ? eq(accounts.excluded, false) : f === 'excluded' ? eq(accounts.excluded, true) : f === 'review' ? eq(accounts.needsReview, true) : undefined,
      query.q?.trim() ? like(accounts.search, containsPattern(query.q)) : undefined, query.after !== undefined ? gt(accounts.seq, query.after) : undefined))
    .orderBy(asc(accounts.seq)).limit(limit + 1);
  const page = rows.slice(0, limit);
  return { rows: page.map(r => ({ id: r.id, account: r.data as Account, contacts: r.contacts, primary: r.primary })), next: rows.length > limit ? page[page.length - 1].seq : null };
}

/** Issues on no contact in the list: rows not loaded, or the whole file. */
export async function unattachedIssues(scope: TenantScope, listId: string): Promise<Issue[]> {
  if (!(await listRow(scope, listId))) throw notFound('That list is not there any more.');
  const rows = await scope.tx.select({ data: issues.data }).from(issues)
    .where(and(eq(issues.listId, listId), isNull(issues.attachRowNo))).orderBy(asc(issues.seq)).limit(1000);
  return rows.map(r => r.data as Issue);
}

/* ─── Changing lists ─── */

async function editableList(scope: TenantScope, actor: Actor, id: string) {
  const l = await listRow(scope, id);
  if (!l) throw notFound('That list is not there any more.');
  if (!isManager(actor.role) && l.createdBy !== actor.userId) throw forbidden('Only the person who uploaded this list, or a manager, can change it.');
  return l;
}

/** Saves the list under a name; with contact rows, saves just those prospects (and their accounts) as a new list. */
export async function saveList(scope: TenantScope, actor: Actor, id: string, input: { name: string; contactRows?: number[] }): Promise<{ listId: string }> {
  if (!input.contactRows) {
    const l = await editableList(scope, actor, id);
    await scope.tx.update(leadLists).set({ name: input.name, status: 'saved', savedAt: l.savedAt ?? sql`now()`, updatedAt: sql`now()`, updatedBy: actor.userId })
      .where(eq(leadLists.id, id));
    await recordAudit(scope, { action: 'list.saved', actorRole: actor.role, targetType: 'lead_list', targetId: id, details: { status: l.status } });
    logger.info({ event: 'list.saved', listId: id }, 'List saved');
    return { listId: id };
  }
  const l = await listRow(scope, id);
  if (!l) throw notFound('That list is not there any more.');
  const wanted = [...new Set(input.contactRows)];
  // Only prospects the caller can see and that are in the list (contactable or not) can be picked.
  const picked = await scope.tx.select({ data: contacts.data }).from(contacts)
    .where(and(eq(contacts.listId, id), ownerOnly(scope, contacts.ownerEmail), inArray(contacts.rowNo, wanted), inArray(contacts.statusGroup, ['in', 'nc'])))
    .orderBy(asc(contacts.rowNo));
  if (!picked.length) throw badRequest('None of the selected prospects can be saved: pick prospects that are in the list.');
  const cons = picked.map(p => p.data as Contact);
  const accIds = new Set(cons.map(c => c.accountId));
  // The selected people's accounts are copied as they are, whoever owns them: the person picked those prospects.
  const accRows = await scope.tx.select({ data: accounts.data }).from(accounts)
    .where(and(eq(accounts.listId, id), inArray(accounts.engineId, [...accIds]))).orderBy(asc(accounts.seq));
  const accs = accRows.map(a => a.data as Account);
  if (accs.length !== accIds.size && scope.ctx.scope === 'own') {
    throw conflict("Some selected prospects belong to accounts owned by someone else, so they can't be saved on their own. Ask a manager to save them.");
  }
  const rows = new Set(cons.map(c => c.row));
  const iss = (await scope.tx.select({ data: issues.data, attach: issues.attachRowNo, row: issues.rowNo }).from(issues)
    .where(and(eq(issues.listId, id))).orderBy(asc(issues.seq)))
    .filter(i => (i.attach !== null && rows.has(i.attach)) || i.row === null).map(i => i.data as Issue);
  const base = l.stats as LeadStats;
  const stats: LeadStats = { ...base, contacts: cons.length, accounts: accs.length, accountsPass: accs.filter(a => !a.excluded).length, inFinalList: cons.filter(c => c.status === 'In the final list').length };
  const [created] = await scope.tx.insert(leadLists).values({
    businessUnitId: scope.ctx.businessUnitId, uploadId: l.uploadId, parentListId: id, name: input.name, status: 'saved', sandbox: l.sandbox,
    sourceFile: l.sourceFile, sheetName: l.sheet, configVersionId: await activeConfigVersionId(scope), engineVersion: ENGINE_VERSION,
    stats, checks: l.checks, createdBy: actor.userId, updatedBy: actor.userId, savedAt: sql`now()`,
  }).returning({ id: leadLists.id });
  await insertRows(scope, created.id, accs, cons, iss, new Map(), actor.userId);
  await recordAudit(scope, { action: 'list.saved_selection', actorRole: actor.role, targetType: 'lead_list', targetId: created.id, details: { from: id, contacts: cons.length, accounts: accs.length } });
  logger.info({ event: 'list.saved_selection', listId: created.id, contacts: cons.length }, 'Selection saved as a list');
  return { listId: created.id };
}

export async function renameList(scope: TenantScope, actor: Actor, id: string, name: string): Promise<void> {
  await editableList(scope, actor, id);
  await scope.tx.update(leadLists).set({ name, updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(leadLists.id, id));
  await recordAudit(scope, { action: 'list.renamed', actorRole: actor.role, targetType: 'lead_list', targetId: id });
}

/** Deletes a list with its scoring runs and hand-offs, and the uploaded files nothing else uses. */
export async function deleteList(scope: TenantScope, actor: Actor, id: string): Promise<{ runs: number }> {
  const l = await editableList(scope, actor, id);
  const runs = await scope.tx.select({ upload: scoringRuns.signalUploadId }).from(scoringRuns).where(eq(scoringRuns.listId, id));
  await scope.tx.delete(leadLists).where(eq(leadLists.id, id));
  await deleteUnusedUploads(scope, [l.uploadId, ...runs.map(r => r.upload)]);
  await recordAudit(scope, { action: 'list.deleted', actorRole: actor.role, targetType: 'lead_list', targetId: id, details: { runs: runs.length } });
  logger.info({ event: 'list.deleted', listId: id, runs: runs.length }, 'List deleted');
  return { runs: runs.length };
}

export async function deleteUnusedUploads(scope: TenantScope, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await scope.tx.delete(uploads).where(and(inArray(uploads.id, ids),
    notExists(scope.tx.select({ x: sql`1` }).from(leadLists).where(eq(leadLists.uploadId, uploads.id))),
    notExists(scope.tx.select({ x: sql`1` }).from(scoringRuns).where(eq(scoringRuns.signalUploadId, uploads.id)))));
}

/* ─── For scoring: the whole list in the engine's shape ─── */

export type LoadedList = LeadList & { id: string; sandbox: boolean; name: string; status: string; accountIds: Map<string, string>; contactIds: Map<number, string> };

export async function loadLeadList(scope: TenantScope, id: string): Promise<LoadedList | null> {
  const l = await listRow(scope, id);
  if (!l) return null;
  const accs = await scope.tx.select({ id: accounts.id, data: accounts.data }).from(accounts).where(eq(accounts.listId, id)).orderBy(asc(accounts.seq));
  const cons = await scope.tx.select({ id: contacts.id, row: contacts.rowNo, data: contacts.data }).from(contacts).where(eq(contacts.listId, id)).orderBy(asc(contacts.rowNo));
  const accounts_ = accs.map(a => a.data as Account);
  return {
    id, name: l.name, status: l.status, sandbox: l.sandbox, accounts: accounts_, contacts: cons.map(c => c.data as Contact),
    accountIds: new Map(accs.map((a, i) => [accounts_[i].id, a.id])), contactIds: new Map(cons.map(c => [c.row, c.id])),
  };
}
