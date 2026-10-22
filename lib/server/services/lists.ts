// Prospecting on the server (G-004, G-012, G-022): a lead file's checks run as a job and the result is stored as a
// list (draft until saved), so a list of any size saves, reloads and is shared within the business unit. Screens
// read it a page at a time (keyset on the sheet row or the engine's order) with server search. Rows about people
// are owner-scoped twice: row-level security, and the filters here (G-014).
import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNull, like, notExists, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { CODES, LEAD_COLUMNS, LEAD_REQUIRED, missingColumns, processLeads, readTable, toCSV } from '../../demandai-engine.ts';
import { ENGINE_VERSION } from '../../engine/config.ts';
import { LEAD_SHEET } from '../../engine/sheets.ts';
import { CHECKS, STEPS, checkOf, groupIssues, stepResult, type CheckKey, type StepResult } from '../../prospecting/checks.ts';
import { listQuality, readinessChecks, readinessCounts, type ListQuality, type ReadinessCheck } from '../../prospecting/quality.ts';
import { can, type BuRole } from '../../auth/permissions.ts';
import type { Account, Contact, DqCode, Issue, LeadList, LeadResult, LeadStats, Severity } from '../../../types/demandai';
import { accounts, configVersions, contacts, corrections, issues, jobs, leadLists, scoringRuns, uploads, CONTACT_GROUPS } from '../db/schema.ts';
import { applyCorrections, rowValues, type Correction } from '../../engine/corrections.ts';
import { withTenant, type TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { JobError, jobContext } from '../jobs/queue.ts';
import type { Cell, Grid } from '../../../types/demandai';
import type { JobRun } from '../jobs/worker.ts';
import { readUpload, UploadReadError, type FileNote } from '../uploads/parse.ts';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.ts';
import { logger } from '../logger.ts';
import { LEAD_STAGES, loadUpload, type UploadLimits } from './uploads.ts';
import { getMapping } from './mappings.ts';
import { enqueueJob } from '../jobs/queue.ts';

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
    const { upload, mapping, fixes } = await withTenant(db, ctx, async s => ({
      upload: await loadUpload(s, job.payload.uploadId),
      mapping: job.payload.mappingId ? await getMapping(s, job.payload.mappingId) : null,
      fixes: await correctionsOf(s, job.payload.uploadId),
    }), { label: 'lead.load' });
    if (!upload) throw new JobError('gone', 'The uploaded file is no longer there. Upload it again.');
    if (job.payload.mappingId && !mapping) throw new JobError('gone', 'That column mapping is no longer there. Choose the columns again.');
    let read;
    try {
      read = readUpload(upload.bytes, upload.format, { ...LEAD_SHEET, maxRows: limits.maxRows });
    } catch (err) {
      if (err instanceof UploadReadError) throw new JobError(err.code, err.message);
      throw err;
    }
    await run.stage('check', { sheetRows: read.grid.length, corrections: fixes.length });
    // Every correction made to this upload, replayed in order onto the file as received (G-015).
    const opts = { file: upload.fileName, sheet: read.sheet, mapping: mapping ?? undefined };
    const fixed = applyCorrections(read.grid, fixes, opts);
    const whole = withNotes(processLeads(fixed.grid, { ...opts, removed: fixed.removed, verticals: fixed.verticals }), read.notes, upload.fileName, read.sheet);
    // Each data row's owner (read through the same column mapping), so issues on rows that never became contacts are
    // scoped to that owner too.
    const rawOwners = new Map(readTable(fixed.grid, { ...opts, columns: LEAD_COLUMNS, required: LEAD_REQUIRED, anchor: 'company_name' })
      .records.map(r => [r.__row, lower(r.owner_email)]));
    const raw = rowValues(fixed.grid, whole.contacts.map(c => c.row), opts.mapping);
    await run.stage('save', { rowsRead: whole.stats.rowsRead, contacts: whole.stats.contacts, accounts: whole.stats.accounts, issues: whole.issues.length });
    const listId = await withTenant(db, ctx, async s => {
      // A correction rebuilds the list it was made on: the new version takes its place (name, status, uploader, and
      // for a saved selection the same people); the old one points to it.
      const target = job.payload.replaceListId ? await currentVersion(s, job.payload.replaceListId) : null;
      if (job.payload.replaceListId && !target) throw new JobError('gone', 'That list was deleted while it was being checked again.');
      const keep = target?.parentListId ? new Set((await s.tx.select({ row: contacts.rowNo }).from(contacts).where(eq(contacts.listId, target.id))).map(r => r.row)) : null;
      const result = keep ? selectRows(whole, keep, rawOwners) : whole;
      const quality = { ...listQuality(whole, new Set(rawOwners.keys())), ...readinessCounts(result) };
      const id = await insertList(s, {
        upload, sheet: read.sheet, result, quality, rawOwners, raw, fileColumns: fileColumnsOf(read.grid), mappingId: job.payload.mappingId ?? null,
        createdBy: target?.createdBy ?? job.createdBy, updatedBy: job.createdBy,
        ...(target ? { name: target.name, status: target.status, savedAt: target.savedAt, parentListId: target.parentListId } : {}),
      });
      if (target) await retire(s, target.id, id, job.createdBy, fixes.length);
      await s.tx.update(uploads).set({ sheetName: read.sheet, rowsRead: whole.stats.rowsRead }).where(eq(uploads.id, upload.id));
      return id;
    }, { label: 'lead.save', slowMs: 30_000 });
    return { listId };
  };
}

/** Every correction made to an upload, in the order they are replayed. */
async function correctionsOf(scope: TenantScope, uploadId: string): Promise<Correction[]> {
  const rows = await scope.tx.select({ row: corrections.rowNo, field: corrections.field, to: corrections.toValue, reason: corrections.reason })
    .from(corrections).where(eq(corrections.uploadId, uploadId)).orderBy(asc(corrections.seq));
  return rows.map(r => ({ row: r.row, field: r.field as Correction['field'], to: r.to, reason: r.reason }));
}

/** The newest version of a list, following what replaced it; null when it was deleted. */
async function currentVersion(scope: TenantScope, id: string) {
  const { rows } = await scope.tx.execute<{ id: string }>(sql`
    WITH RECURSIVE chain(id, next, depth) AS (
      SELECT id, replaced_by_list_id, 0 FROM lead_lists WHERE id = ${id}
      UNION ALL SELECT l.id, l.replaced_by_list_id, c.depth + 1 FROM lead_lists l JOIN chain c ON l.id = c.next WHERE c.depth < 1000)
    SELECT id FROM chain WHERE next IS NULL`);
  if (!rows[0]) return null;
  const [l] = await scope.tx.select({ id: leadLists.id, name: leadLists.name, status: leadLists.status, savedAt: leadLists.savedAt, parentListId: leadLists.parentListId, createdBy: leadLists.createdBy })
    .from(leadLists).where(eq(leadLists.id, rows[0].id)).for('update');
  return l ?? null;
}

/** A corrected list makes way for its new version. Its rows are dropped unless scoring runs were made on it. */
async function retire(scope: TenantScope, id: string, by: string, updatedBy: string, corrected: number) {
  await scope.tx.update(leadLists).set({ status: 'replaced', replacedByListId: by, updatedAt: sql`now()`, updatedBy }).where(eq(leadLists.id, id));
  const [{ runs }] = await scope.tx.select({ runs: sql<number>`count(*)::int` }).from(scoringRuns).where(eq(scoringRuns.listId, id));
  if (!runs) {
    await scope.tx.delete(issues).where(eq(issues.listId, id));
    await scope.tx.delete(accounts).where(eq(accounts.listId, id)); // contacts go with their accounts
  }
  await recordAudit(scope, { action: 'list.rebuilt', targetType: 'lead_list', targetId: by, details: { replaced: id, corrections: corrected, keptForRuns: runs } });
  logger.info({ event: 'list.rebuilt', listId: by, replaced: id, corrections: corrected }, 'List rebuilt with its corrections');
}

/** The people of a saved selection, with their accounts and findings, from a rebuilt file (as saveList picks them). */
function selectRows(r: LeadResult, rows: Set<number>, dataRows: Map<number, string | null>): LeadResult {
  const cons = r.contacts.filter(c => rows.has(c.row));
  const accIds = new Set(cons.map(c => c.accountId));
  const accs = r.accounts.filter(a => accIds.has(a.id));
  const attachOf = (i: Issue) => { const m = i.code === 'D5' ? /^Merged into row (\d+)$/.exec(i.outcome) : null; return m ? +m[1] : i.row; };
  const iss = r.issues.filter(i => typeof i.row !== 'number' || !dataRows.has(i.row) || rows.has(attachOf(i) as number));
  return { contacts: cons, accounts: accs, issues: iss, stats: { ...r.stats, contacts: cons.length, accounts: accs.length, accountsPass: accs.filter(a => !a.excluded).length, inFinalList: cons.filter(c => c.status === 'In the final list').length } };
}

/** The file's own column names: the fullest of its first rows (the header row in a template-shaped file). */
export function fileColumnsOf(grid: Grid): string[] {
  const text = (r: Cell[] | undefined) => (r ?? []).map(c => (c === null || c === undefined ? '' : String(c).trim())).filter(Boolean);
  const best = grid.slice(0, 10).reduce<Cell[] | undefined>((b, r) => (text(r).length > text(b).length ? r : b), undefined);
  return [...new Set(text(best))].slice(0, 200);
}

type InsertListInput = {
  fileColumns?: string[];
  mappingId?: string | null;
  upload: { id: string; fileName: string; sandbox: boolean };
  sheet: string;
  result: LeadResult;
  quality: ListQuality;
  rawOwners: Map<number, string | null>;
  /** Each contact row's editable fields as the file has them (the edit form). */
  raw?: Map<number, Record<string, string>>;
  createdBy: string;
  updatedBy?: string;
  /** A new version of a corrected list keeps these. */
  name?: string; status?: string; savedAt?: Date | null; parentListId?: string | null;
};

async function insertList(scope: TenantScope, input: InsertListInput): Promise<string> {
  const { upload, result, createdBy } = input;
  const bu = scope.ctx.businessUnitId;
  const checks: StepResult[] = STEPS.map(([k]) => stepResult(result, k, groupIssues(result)));
  const [list] = await scope.tx.insert(leadLists).values({
    businessUnitId: bu, uploadId: upload.id, name: input.name ?? (upload.fileName.replace(/\.[^.]+$/, '') || upload.fileName), status: input.status ?? 'draft', sandbox: upload.sandbox,
    sourceFile: upload.fileName, sheetName: input.sheet, configVersionId: await activeConfigVersionId(scope), engineVersion: ENGINE_VERSION,
    stats: result.stats, checks, quality: input.quality, fileColumns: input.fileColumns ?? [], mappingId: input.mappingId ?? null, createdBy, updatedBy: input.updatedBy ?? createdBy,
    savedAt: input.savedAt ?? null, parentListId: input.parentListId ?? null,
  }).returning({ id: leadLists.id });
  await insertRows(scope, list.id, result.accounts, result.contacts, result.issues, input.rawOwners, input.updatedBy ?? createdBy, input.raw);
  return list.id;
}

/** Writes accounts, contacts and issues for a list. Shared by the job and by saving a selection. */
async function insertRows(scope: TenantScope, listId: string, accs: Account[], cons: Contact[], iss: Issue[], rawOwners: Map<number, string | null>, createdBy: string,
  raw?: Map<number, Record<string, string>> | Map<number, unknown>) {
  const bu = scope.ctx.businessUnitId;
  const accountIds = new Map(accs.map(a => [a.id, randomUUID()]));
  for (const part of chunks(accs.map((a, seq) => ({
    id: accountIds.get(a.id)!, businessUnitId: bu, listId, seq, engineId: a.id, name: a.name, ownerEmail: lower(a.owner),
    excluded: a.excluded, needsReview: a.needsReview, search: a.name.toLowerCase(), data: a, createdBy,
  })))) await scope.tx.insert(accounts).values(part);
  for (const part of chunks(cons.map(c => ({
    businessUnitId: bu, listId, accountId: accountIds.get(c.accountId)!, rowNo: c.row, statusGroup: groupOf(c.status), ownerEmail: lower(c.owner),
    search: `${c.name} ${c.company} ${c.jobTitle}`.toLowerCase(), data: c, raw: raw?.get(c.row) ?? null, createdBy,
  })))) await scope.tx.insert(contacts).values(part);
  // An issue shows on its own contact row; a merged duplicate's on the row it was merged into; others are "not on
  // any contact" (rows not loaded, or the whole file).
  const contactOwner = new Map(cons.map(c => [c.row, lower(c.owner)]));
  const issueRows = iss.map((i, seq) => {
    // An issue on a row that isn't a data row (the header row) is about the whole file: no owner, visible to all.
    const rowNo = typeof i.row === 'number' && (contactOwner.has(i.row) || rawOwners.has(i.row)) ? i.row : null;
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
  /** Over the whole file, whoever is looking; null for lists built before it was kept. */
  quality: ListQuality | null;
  createdAt: Date; savedAt: Date | null; scored: boolean;
};

const listColumns = {
  id: leadLists.id, name: leadLists.name, status: leadLists.status, sandbox: leadLists.sandbox, sourceFile: leadLists.sourceFile,
  sheet: leadLists.sheetName, stats: leadLists.stats, quality: leadLists.quality, createdAt: leadLists.createdAt, savedAt: leadLists.savedAt,
  scored: sql<boolean>`exists (select 1 from scoring_runs r where r.list_id = lead_lists.id and r.status = 'saved')`,
};

/** Saved lists of the unit, newest first (shared within the unit, D-33). */
export async function savedLists(scope: TenantScope): Promise<ListSummary[]> {
  const rows = await scope.tx.select(listColumns).from(leadLists)
    .where(and(eq(leadLists.businessUnitId, scope.ctx.businessUnitId), eq(leadLists.status, 'saved')))
    .orderBy(desc(leadLists.createdAt));
  return rows.map(r => ({ ...r, stats: r.stats as LeadStats, quality: r.quality as ListQuality | null }));
}

export type ListDetail = ListSummary & {
  checks: StepResult[];
  /** The readiness checks a lead list can answer (accounts in scope, contactability); a warning, never a block. */
  readiness: ReadinessCheck[] | null;
  /** The file's column names and the required template columns it lacks, for mapping (G-040). */
  fileColumns: string[];
  missingColumns: string[];
  uploadId: string;
  /** What the caller can see: reps only their own rows (D-33). */
  scope: 'all' | 'own';
  visible: { contacts: Record<'all' | ContactGroup, number>; accounts: { all: number; pass: number; excluded: number; review: number } };
  canEdit: boolean;
  /** For a list corrected since (status 'replaced'): its newest version, to open instead. */
  replacedBy: string | null;
};

async function listRow(scope: TenantScope, id: string) {
  const [l] = await scope.tx.select({ ...listColumns, checks: leadLists.checks, createdBy: leadLists.createdBy, uploadId: leadLists.uploadId, fileColumns: leadLists.fileColumns, mappingId: leadLists.mappingId, parentListId: leadLists.parentListId })
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
    quality: l.quality as ListQuality | null, readiness: l.quality ? readinessChecks(l.quality as ListQuality) : null,
    fileColumns: l.fileColumns as string[], uploadId: l.uploadId,
    missingColumns: missingColumns(l.fileColumns as string[], 'lead', l.mappingId ? (await getMapping(scope, l.mappingId)) ?? undefined : undefined),
    canEdit: isManager(actor.role) || l.createdBy === actor.userId,
    replacedBy: l.status === 'replaced' ? (await currentVersion(scope, id))?.id ?? null : null,
  };
}

export type Page<T> = { rows: T[]; next: number | null };
export type PageQuery = { after?: number; limit?: number; q?: string };

const limitOf = (q: PageQuery) => Math.min(Math.max(1, q.limit ?? PAGE_DEFAULT), PAGE_MAX);

export type ContactRow = { id: string; contact: Contact; account: { industry: string; employees: number | null } | null; issues: Issue[]; corrected: boolean };

export async function listContacts(scope: TenantScope, listId: string, query: PageQuery & { group?: ContactGroup }): Promise<Page<ContactRow>> {
  const l = await listRow(scope, listId);
  if (!l) throw notFound('That list is not there any more.');
  const limit = limitOf(query);
  const rows = await scope.tx.select({
    id: contacts.id, rowNo: contacts.rowNo, data: contacts.data,
    corrected: sql<boolean>`exists (select 1 from corrections k where k.upload_id = ${l.uploadId} and k.row_no = contacts.row_no)`,
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
    rows: page.map(r => ({ id: r.id, contact: r.data as Contact, account: r.hasAccount ? { industry: r.industry ?? '', employees: r.employees } : null, issues: byRow.get(r.rowNo) ?? [], corrected: r.corrected })),
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

/* ─── Check panes, per-check CSV and the validation report (G-015) ─── */

/** The repository half of the issues policy: reps get their own rows' findings and the whole-file notes. */
function visibleIssues(scope: TenantScope): SQL | undefined {
  const own = ownerOnly(scope, issues.ownerEmail);
  return own && or(own, and(isNull(issues.ownerEmail), isNull(issues.rowNo)));
}

export type CheckPage = Page<Issue> & { total: number };

/** One check's findings a page at a time, in file order. `total` is what the caller can see (a rep: their own rows). */
export async function issuesForCheck(scope: TenantScope, listId: string, check: CheckKey, query: PageQuery): Promise<CheckPage> {
  if (!(await listRow(scope, listId))) throw notFound('That list is not there any more.');
  const limit = limitOf(query);
  const where = and(eq(issues.listId, listId), eq(issues.checkKey, check), visibleIssues(scope));
  const rows = await scope.tx.select({ seq: issues.seq, data: issues.data }).from(issues)
    .where(and(where, query.after !== undefined ? gt(issues.seq, query.after) : undefined)).orderBy(asc(issues.seq)).limit(limit + 1);
  const [{ n }] = await scope.tx.select({ n: sql<number>`count(*)::int` }).from(issues).where(where);
  const page = rows.slice(0, limit);
  return { rows: page.map(r => r.data as Issue), next: rows.length > limit ? page[page.length - 1].seq : null, total: n };
}

export type CsvFile = { fileName: string; csv: string };
const fileBase = (sourceFile: string) => sourceFile.replace(/\.[^.]+$/, '') || 'lead-file';
const ISSUE_HEADER = ['Row', 'Field', 'Issue', 'What happens', 'How to fix', 'Severity'];
const issueCells = (i: Issue) => [i.row, i.field || '', i.issue, i.outcome || '', i.fix || '', i.severity];

/** One check's findings as the original pane's CSV, `<file>-<check>-issues.csv`; formulas neutralised (G-052). */
export async function checkCsv(scope: TenantScope, listId: string, check: CheckKey): Promise<CsvFile> {
  const l = await listRow(scope, listId);
  if (!l) throw notFound('That list is not there any more.');
  const rows = await scope.tx.select({ data: issues.data }).from(issues)
    .where(and(eq(issues.listId, listId), eq(issues.checkKey, check), visibleIssues(scope))).orderBy(asc(issues.seq));
  return { fileName: `${fileBase(l.sourceFile)}-${check}-issues.csv`, csv: toCSV([ISSUE_HEADER, ...rows.map(r => issueCells(r.data as Issue))]) };
}

/** Every finding the caller can see, with its check and D-code, in file order: the validation report. */
export async function reportCsv(scope: TenantScope, listId: string): Promise<CsvFile> {
  const l = await listRow(scope, listId);
  if (!l) throw notFound('That list is not there any more.');
  const rows = await scope.tx.select({ data: issues.data, check: issues.checkKey }).from(issues)
    .where(and(eq(issues.listId, listId), visibleIssues(scope))).orderBy(asc(issues.seq));
  const checkName = new Map<string, string>(CHECKS.map(([k, name]) => [k, name]));
  const body = rows.map(r => {
    const i = r.data as Issue;
    return [...issueCells(i), checkName.get(r.check) ?? r.check, i.code === '—' ? '' : i.code, i.code === '—' ? '' : CODES[i.code as DqCode]];
  });
  return { fileName: `${fileBase(l.sourceFile)}-validation-report.csv`, csv: toCSV([[...ISSUE_HEADER, 'Check', 'D-code', 'What the code means'], ...body]) };
}

/* ─── Changing lists ─── */

export async function editableList(scope: TenantScope, actor: Actor, id: string, { replaced = false } = {}) {
  const l = await listRow(scope, id);
  if (!l) throw notFound('That list is not there any more.');
  if (!isManager(actor.role) && l.createdBy !== actor.userId) throw forbidden('Only the person who uploaded this list, or a manager, can change it.');
  if (l.status === 'replaced' && !replaced) throw conflict('This list has been corrected since. Open its current version to change it.');
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
  if (l.status === 'replaced') throw conflict('This list has been corrected since. Open its current version to pick prospects from it.');
  const wanted = [...new Set(input.contactRows)];
  // Only prospects the caller can see and that are in the list (contactable or not) can be picked.
  const picked = await scope.tx.select({ data: contacts.data, raw: contacts.raw }).from(contacts)
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
  // The file's % clean and findings stay those of the whole file (as the original kept them); readiness is the selection's.
  const quality = l.quality ? { ...(l.quality as ListQuality), ...readinessCounts({ accounts: accs, contacts: cons }) } : null;
  const [created] = await scope.tx.insert(leadLists).values({
    businessUnitId: scope.ctx.businessUnitId, uploadId: l.uploadId, parentListId: id, name: input.name, status: 'saved', sandbox: l.sandbox,
    sourceFile: l.sourceFile, sheetName: l.sheet, configVersionId: await activeConfigVersionId(scope), engineVersion: ENGINE_VERSION,
    stats, checks: l.checks, quality, createdBy: actor.userId, updatedBy: actor.userId, savedAt: sql`now()`,
  }).returning({ id: leadLists.id });
  await insertRows(scope, created.id, accs, cons, iss, new Map(), actor.userId, new Map(picked.map(p => [(p.data as Contact).row, p.raw])));
  await recordAudit(scope, { action: 'list.saved_selection', actorRole: actor.role, targetType: 'lead_list', targetId: created.id, details: { from: id, contacts: cons.length, accounts: accs.length } });
  logger.info({ event: 'list.saved_selection', listId: created.id, contacts: cons.length }, 'Selection saved as a list');
  return { listId: created.id };
}

export async function renameList(scope: TenantScope, actor: Actor, id: string, name: string): Promise<void> {
  await editableList(scope, actor, id);
  await scope.tx.update(leadLists).set({ name, updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(leadLists.id, id));
  await recordAudit(scope, { action: 'list.renamed', actorRole: actor.role, targetType: 'lead_list', targetId: id });
}

/** Deletes a list with the versions it replaced, their scoring runs and hand-offs, and the uploaded files nothing else
 *  uses. An upload that corrections refer to stays: the corrections log is append-only and goes with the upload. */
export async function deleteList(scope: TenantScope, actor: Actor, id: string): Promise<{ runs: number }> {
  const l = await editableList(scope, actor, id, { replaced: true });
  const { rows: chain } = await scope.tx.execute<{ id: string }>(sql`
    WITH RECURSIVE chain(id, depth) AS (
      SELECT id, 0 FROM lead_lists WHERE id = ${id}
      UNION ALL SELECT l.id, c.depth + 1 FROM lead_lists l JOIN chain c ON l.replaced_by_list_id = c.id WHERE c.depth < 1000)
    SELECT id FROM chain`);
  const ids = chain.map(r => r.id);
  const runs = await scope.tx.select({ upload: scoringRuns.signalUploadId }).from(scoringRuns).where(inArray(scoringRuns.listId, ids));
  await scope.tx.delete(leadLists).where(inArray(leadLists.id, ids));
  await deleteUnusedUploads(scope, [l.uploadId, ...runs.map(r => r.upload)]);
  await recordAudit(scope, { action: 'list.deleted', actorRole: actor.role, targetType: 'lead_list', targetId: id, details: { runs: runs.length, versions: ids.length } });
  logger.info({ event: 'list.deleted', listId: id, runs: runs.length, versions: ids.length }, 'List deleted');
  return { runs: runs.length };
}

export async function deleteUnusedUploads(scope: TenantScope, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await scope.tx.delete(uploads).where(and(inArray(uploads.id, ids),
    notExists(scope.tx.select({ x: sql`1` }).from(leadLists).where(eq(leadLists.uploadId, uploads.id))),
    notExists(scope.tx.select({ x: sql`1` }).from(scoringRuns).where(eq(scoringRuns.signalUploadId, uploads.id))),
    sql`not upload_has_corrections(${uploads.id})`));
}

/** Is a rebuild of this list queued or running? One correction is checked at a time. */
export async function rebuildPending(scope: TenantScope, listId: string): Promise<boolean> {
  const [r] = await scope.tx.select({ x: sql`1` }).from(jobs)
    .where(and(eq(jobs.kind, 'lead.process'), inArray(jobs.status, ['queued', 'running']), sql`${jobs.payload}->>'replaceListId' = ${listId}`)).limit(1);
  return !!r;
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

/** Checks an uploaded lead file again, with a saved column mapping (G-040): a new draft list, the file not re-sent. */
export async function recheckUpload(scope: TenantScope, uploadId: string, mappingId: string | null): Promise<{ jobId: string }> {
  const upload = await loadUpload(scope, uploadId);
  if (!upload || upload.kind !== 'lead') throw notFound('That lead file is not there any more. Upload it again.');
  if (mappingId && !(await getMapping(scope, mappingId))) throw notFound('That column mapping is not there any more.');
  const jobId = await enqueueJob(scope, 'lead.process', { uploadId, ...(mappingId ? { mappingId } : {}) }, LEAD_STAGES);
  await recordAudit(scope, { action: 'upload.rechecked', targetType: 'upload', targetId: uploadId, details: { mappingId, jobId } });
  return { jobId };
}
