// Corrections on the server (G-015; D-17 confirmations; G-021 vertical set by a person). A correction is kept in the
// append-only corrections log with who made it, what changed, why and how they know, then the list is checked again
// from the stored upload with every correction of that upload (the lead job), and the new version replaces it.
// Only the uploader or a manager may correct a list, as for rename and delete; reps only reach their own rows (G-014).
import 'server-only';
import { and, asc, desc, eq, lt, sql, type SQL } from 'drizzle-orm';
import { yesNo, type Account, type Contact } from '../../demandai-engine.ts';
import {
  correctionProblem, EDIT_REASONS, EDIT_SOURCES, fieldLabel, PUT_BACK, severityOf, TAKEN_OUT, type CorrectionField, type CorrectionSeverity,
} from '../../engine/corrections.ts';
import { accounts, contacts, corrections, uploads, users } from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { enqueueJob } from '../jobs/queue.ts';
import { badRequest, conflict, notFound } from '../http/errors.ts';
import { logger } from '../logger.ts';
import { LEAD_STAGES } from './uploads.ts';
import { editableList, getList, ownerOnly, PAGE_MAX, rebuildPending, type Actor, type Page } from './lists.ts';

/** Corrections per person: each queues a rebuild of the list, so a brake on scripted floods. */
export const CORRECTION_RATE = { name: 'correct:user', limit: 60, windowSeconds: 10 * 60 };

export type CorrectionInput = {
  row: number;
  changes: Partial<Record<CorrectionField, string>>;
  reason: (typeof EDIT_REASONS)[number];
  source: (typeof EDIT_SOURCES)[number] | '';
  note: string;
};

const YN_FIELDS: CorrectionField[] = ['email_verified', 'opt_out', 'managed_separately'];
/** Held because no row says Y or N (D-17), as opposed to excluded on a Y. */
const managedHeld = (a: Account) => !a.managedSeparately && a.checks?.some(k => k.rule === 'Not managed separately' && k.pass === false);
const verticalByPerson = (a: Account) => a.classReason.startsWith('Set by a person: ');

/** The fields as the file has them, for lists built before they were kept with each contact. */
function rawOf(c: Contact, a: Account | null): Record<string, string> {
  const yn = (b: boolean) => (b ? 'Y' : 'N');
  return {
    first_name: c.firstName, last_name: c.lastName, job_title: c.jobTitle, email: c.emailRaw, email_verified: c.emailRaw ? yn(c.emailVerified) : '',
    linkedin_url: c.linkedinRaw, city: c.city, country: c.country, owner_email: c.owner, employee_count: c.employees === null ? '' : String(c.employees),
    industry: c.industry, opt_out: c.optOutUnknown ? '' : yn(c.optOut), managed_separately: a ? yn(a.managedSeparately) : '',
  };
}

type Loaded = { contact: Contact; account: Account; raw: Record<string, string> };

async function loadRow(scope: TenantScope, listId: string, row: number): Promise<Loaded | null> {
  const [r] = await scope.tx.select({ data: contacts.data, raw: contacts.raw, account: accounts.data }).from(contacts)
    .innerJoin(accounts, eq(accounts.id, contacts.accountId))
    .where(and(eq(contacts.listId, listId), eq(contacts.rowNo, row), ownerOnly(scope, contacts.ownerEmail)));
  if (!r) return null;
  const contact = r.data as Contact, account = r.account as Account;
  return { contact, account, raw: (r.raw as Record<string, string> | null) ?? rawOf(contact, account) };
}

/** What a field is now, in the form a correction's "to" takes. */
function currentValue(field: CorrectionField, x: Loaded): string {
  if (field === 'take_out') return x.contact.takenOut ? TAKEN_OUT : PUT_BACK;
  if (field === 'vertical') return x.account.vertical;
  const v = x.raw[field] ?? '';
  return YN_FIELDS.includes(field) ? (yesNo(v) || v) : v;
}

/** Records a person's corrections to one row and queues the list's rebuild. */
export async function addCorrections(scope: TenantScope, actor: Actor, listId: string, input: CorrectionInput): Promise<{ jobId: string; count: number }> {
  const l = await editableList(scope, actor, listId);
  const x = await loadRow(scope, listId, input.row);
  if (!x) throw notFound('That person is not in this list.');
  if (await rebuildPending(scope, listId)) throw conflict('The last correction to this list is still being checked. Try again in a moment.');
  const changes: { field: CorrectionField; from: string; to: string }[] = [];
  const problems: Record<string, string[]> = {};
  for (const [f, value] of Object.entries(input.changes) as [CorrectionField, string | undefined][]) {
    if (value === undefined) continue;
    const to = YN_FIELDS.includes(f) ? value.trim().toUpperCase() : value.trim();
    const from = currentValue(f, x);
    if (to === from) continue;
    const problem = correctionProblem(f, to)
      // D-17: confirming that someone has not opted out, or that an account is not managed separately, is only for
      // what the checks held; the safe direction (Y) is always allowed.
      ?? (f === 'opt_out' && to === 'N' && !x.contact.optOutUnknown ? "This person's opt-out is already given in the file; it can only be changed to Y." : null)
      ?? (f === 'managed_separately' && to === 'N' && !managedHeld(x.account) ? "This account's managed status is already given in the file; it can only be changed to Y." : null)
      ?? (f === 'vertical' && !x.account.needsReview && !verticalByPerson(x.account) ? 'The mapping table classified this account; correct its industry instead.' : null)
      ?? ((f === 'opt_out' || f === 'managed_separately') && to === 'N' && !input.source ? 'Say how you know: a confirmation is kept with who made it and why.' : null);
    if (problem) { problems[f] = [problem]; continue; }
    changes.push({ field: f, from, to });
  }
  if (Object.keys(problems).length) throw badRequest('Some corrections can’t be made.', problems);
  if (!changes.length) throw badRequest('Nothing changed.');
  const c = x.contact;
  await scope.tx.insert(corrections).values(changes.map(ch => ({
    businessUnitId: scope.ctx.businessUnitId, uploadId: l.uploadId, listId, rowNo: input.row, field: ch.field, fromValue: ch.from, toValue: ch.to,
    severity: severityOf(ch.field, input.reason), reason: input.reason, source: input.source, note: input.note,
    contactName: c.name, company: c.company, ownerEmail: c.owner ? c.owner.toLowerCase() : null, actorRole: actor.role, createdBy: actor.userId,
  })));
  const jobId = await enqueueJob(scope, 'lead.process', { uploadId: l.uploadId, replaceListId: listId, ...(l.mappingId ? { mappingId: l.mappingId } : {}) }, LEAD_STAGES);
  await recordAudit(scope, { action: 'list.corrected', actorRole: actor.role, targetType: 'lead_list', targetId: listId,
    details: { row: input.row, fields: changes.map(ch => ch.field), reason: input.reason, jobId } });
  logger.info({ event: 'list.corrected', listId, fields: changes.map(ch => ch.field), jobId }, 'Correction recorded; list queued to be checked again');
  return { jobId, count: changes.length };
}

/* ─── The corrections log ─── */

export type CorrectionRow = {
  id: string; seq: number; at: Date; who: string; role: string; contact: string; company: string; file: string; row: number; listId: string;
  field: CorrectionField; fieldLabel: string; from: string; to: string; severity: CorrectionSeverity; reason: string; source: string; note: string;
};
export type CorrectionSummary = { corrections: number; people: number; major: number; minor: number; top: { reason: string; n: number } | null };

/** Corrections the caller can see, newest first: one upload's (a list), or the whole unit's. */
export async function listCorrections(scope: TenantScope, query: { listId?: string; row?: number; after?: number; limit?: number; severity?: CorrectionSeverity; reason?: string }):
  Promise<Page<CorrectionRow> & { summary: CorrectionSummary }> {
  let uploadFilter: SQL | undefined;
  if (query.listId) {
    const [l] = await scope.tx.execute<{ upload_id: string }>(sql`select upload_id from lead_lists where id = ${query.listId} and business_unit_id = ${scope.ctx.businessUnitId}`).then(r => r.rows);
    if (!l) throw notFound('That list is not there any more.');
    uploadFilter = eq(corrections.uploadId, l.upload_id);
  }
  const base = and(eq(corrections.businessUnitId, scope.ctx.businessUnitId), uploadFilter, ownerOnly(scope, corrections.ownerEmail));
  const filtered = and(base, query.severity ? eq(corrections.severity, query.severity) : undefined, query.reason ? eq(corrections.reason, query.reason) : undefined,
    query.row !== undefined ? eq(corrections.rowNo, query.row) : undefined);
  const limit = Math.min(Math.max(1, query.limit ?? 200), PAGE_MAX);
  const rows = await scope.tx.select({
    id: corrections.id, seq: corrections.seq, at: corrections.createdAt, who: users.displayName, role: corrections.actorRole, contact: corrections.contactName,
    company: corrections.company, file: uploads.fileName, row: corrections.rowNo, listId: corrections.listId, field: corrections.field,
    from: corrections.fromValue, to: corrections.toValue, severity: corrections.severity, reason: corrections.reason, source: corrections.source, note: corrections.note,
  }).from(corrections).innerJoin(users, eq(users.id, corrections.createdBy)).innerJoin(uploads, eq(uploads.id, corrections.uploadId))
    .where(and(filtered, query.after !== undefined ? lt(corrections.seq, query.after) : undefined)).orderBy(desc(corrections.seq)).limit(limit + 1);
  const page = rows.slice(0, limit);
  const [t] = await scope.tx.select({
    n: sql<number>`count(*)::int`, people: sql<number>`count(distinct (${corrections.uploadId}, ${corrections.rowNo}))::int`,
    major: sql<number>`(count(*) filter (where ${corrections.severity} = 'major'))::int`,
  }).from(corrections).where(base);
  const [top] = await scope.tx.select({ reason: corrections.reason, n: sql<number>`count(*)::int` }).from(corrections).where(base)
    .groupBy(corrections.reason).orderBy(desc(sql`count(*)`), asc(corrections.reason)).limit(1);
  return {
    rows: page.map(r => ({ ...r, field: r.field as CorrectionField, fieldLabel: fieldLabel(r.field as CorrectionField), severity: r.severity as CorrectionSeverity })),
    next: rows.length > limit ? page[page.length - 1].seq : null,
    summary: { corrections: t.n, people: t.people, major: t.major, minor: t.n - t.major, top: top ? { reason: top.reason, n: top.n } : null },
  };
}

/* ─── One row, for the edit form ─── */

export type EditRow = {
  contact: Contact;
  /** The editable fields as the file (with its corrections) has them. */
  raw: Record<string, string>;
  account: { name: string; vertical: string; needsReview: boolean; verticalByPerson: boolean; managedHeld: boolean };
  /** Whether the caller may correct this list (uploader or manager), and whether a correction is still being checked. */
  canEdit: boolean;
  pending: boolean;
  history: CorrectionRow[];
};

export async function getEditRow(scope: TenantScope, actor: Actor, listId: string, row: number): Promise<EditRow> {
  const list = await getList(scope, actor, listId);
  const x = await loadRow(scope, listId, row);
  if (!x) throw notFound('That person is not in this list.');
  const history = (await listCorrections(scope, { listId, row, limit: PAGE_MAX })).rows;
  return {
    contact: x.contact, raw: x.raw, history, pending: await rebuildPending(scope, listId),
    account: { name: x.account.name, vertical: x.account.vertical, needsReview: x.account.needsReview, verticalByPerson: verticalByPerson(x.account), managedHeld: !!managedHeld(x.account) },
    canEdit: list.status !== 'replaced' && list.canEdit,
  };
}
