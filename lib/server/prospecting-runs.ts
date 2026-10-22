/* Prospecting runs on the server (server only).
   An uploaded lead file is screened once; the full result stays here and the browser asks for it a page at a time:
   search, filter and sort are applied here, and a row's heavy detail (nested enrichment, verification sources, every
   issue) is only sent when the detail panel opens. Runs live in memory (a few at a time) and on disk under
   DEMANDAI_DATA_DIR/runs, so a restart or an eviction does not lose an upload for a day. */
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as E from '../demandai-engine.ts';
import { STEPS, groupIssues, stepResult } from '../prospecting/checks.ts';
import type { Account, Contact, Grid, Issue, LeadResult } from '../../types/demandai.ts';
import type {
  AccountRowItem, ContactDetail, ContactRowItem, ExportSummary, Page, PageQuery, RunSummary, StepSummary,
} from '../../types/prospecting-runs.ts';
import { dataDir, writeJson } from './secure-store.ts';
import { getStored } from './verification-store.ts';

const MAX_IN_MEMORY = 4;
const KEEP_ON_DISK_MS = 24 * 3_600_000;
const UNATTACHED_SHOWN = 25;
export const MAX_PAGE = 200;
export const RUN_ID = /^run-[0-9a-f]{12}$/;

interface Run {
  id: string; fileName: string; sheet: string; sandbox: boolean; createdAt: number; touched: number;
  result: LeadResult; steps: StepSummary[]; unattached: Issue[];
  accById: Map<string, Account>; byRow: Map<number, Contact>; issuesByRow: Map<number, Issue[]>;
  contactsByAcc: Map<string, Contact[]>; search: Map<number, string>;
}

const g = globalThis as unknown as { __demandaiRuns?: Map<string, Run> };
const runs = (g.__demandaiRuns ??= new Map<string, Run>());
const runsDir = () => path.join(dataDir(), 'runs');
const runFile = (id: string) => path.join(runsDir(), `${id}.json`);

/* ─── Indexes: built once per run (and again when verification changes contacts) ─── */
function index(run: Run): void {
  const { contacts, accounts, issues } = run.result;
  run.accById = new Map(accounts.map(a => [a.id, a]));
  run.byRow = new Map(contacts.map(c => [c.row, c]));
  run.contactsByAcc = new Map();
  for (const c of contacts) { const l = run.contactsByAcc.get(c.accountId); if (l) l.push(c); else run.contactsByAcc.set(c.accountId, [c]); }
  run.search = new Map(contacts.map(c => [c.row, (c.name + ' ' + c.company + ' ' + c.jobTitle).toLowerCase()]));
  // A merged duplicate's issue sits on the repeated row; show it on the row it was merged into as well.
  run.issuesByRow = new Map();
  const add = (k: number, i: Issue) => { const l = run.issuesByRow.get(k); if (l) l.push(i); else run.issuesByRow.set(k, [i]); };
  for (const i of issues) {
    const own = typeof i.row === 'number' ? i.row : null;
    if (own !== null) add(own, i);
    if (i.code === 'D5' && i.outcome.startsWith('Merged into row ')) { const k = +i.outcome.slice('Merged into row '.length); if (k !== own) add(k, i); }
  }
  const rows = new Set<number | string>(contacts.map(c => c.row));
  run.unattached = issues.filter(i => !rows.has(i.row) && !(i.code === 'D5' && rows.has(+String(i.outcome).replace('Merged into row ', ''))));
}

/** Stored Hunter results for this run's addresses, applied to its contacts. Returns how many contacts changed. */
async function applyStored(run: Run, emails?: string[]): Promise<number> {
  const list = emails ?? run.result.contacts.filter(c => c.email).map(c => c.email);
  const found = await getStored(list);
  if (!Object.keys(found).length) return 0;
  const before = run.result.contacts;
  run.result = E.applyEmailVerification(run.result, found);
  index(run);
  return run.result.contacts.filter((c, i) => c !== before[i]).length;
}

function remember(run: Run): void {
  run.touched = Date.now();
  runs.set(run.id, run);
  if (runs.size > MAX_IN_MEMORY) {
    const oldest = [...runs.values()].sort((a, b) => a.touched - b.touched)[0];
    if (oldest && oldest.id !== run.id) runs.delete(oldest.id);
  }
}

function build(id: string, meta: { fileName: string; sheet: string; sandbox: boolean; createdAt: number }, result: LeadResult): Run {
  const by = groupIssues(result);
  const steps: StepSummary[] = STEPS.map(([key]) => ({ key, ...stepResult(result, key, by) }));
  const run = { id, ...meta, touched: Date.now(), result, steps } as Run;
  index(run);
  return run;
}

/* ─── Create, find, summarise ─── */
export async function createRun(input: { grid: Grid; fileName: string; sheet: string; sandbox: boolean }): Promise<RunSummary> {
  const result = E.processLeads(input.grid, { file: input.fileName, sheet: input.sheet });
  const id = 'run-' + randomBytes(6).toString('hex');
  const run = build(id, { fileName: input.fileName, sheet: input.sheet, sandbox: input.sandbox, createdAt: Date.now() }, result);
  // Saved before verification is applied: on a reload the stored results are applied again.
  await fs.mkdir(runsDir(), { recursive: true });
  await writeJson(runFile(id), { fileName: run.fileName, sheet: run.sheet, sandbox: run.sandbox, createdAt: run.createdAt, result }, false);
  void prune();
  await applyStored(run);
  remember(run);
  return summarise(run);
}

export async function getRun(id: string): Promise<Run | null> {
  if (!RUN_ID.test(id)) return null;
  const hit = runs.get(id);
  if (hit) { hit.touched = Date.now(); return hit; }
  let saved: { fileName: string; sheet: string; sandbox: boolean; createdAt: number; result: LeadResult };
  try { saved = JSON.parse(await fs.readFile(runFile(id), 'utf8')); } catch { return null; }
  const run = build(id, saved, saved.result);
  await applyStored(run);
  remember(run);
  return run;
}

async function prune(): Promise<void> {
  try {
    for (const f of await fs.readdir(runsDir())) {
      const file = path.join(runsDir(), f);
      if (Date.now() - (await fs.stat(file)).mtimeMs > KEEP_ON_DISK_MS) await fs.rm(file, { force: true });
    }
  } catch { /* nothing to prune */ }
}

export function summarise(run: Run): RunSummary {
  return { runId: run.id, fileName: run.fileName, sheet: run.sheet, sandbox: run.sandbox, createdAt: run.createdAt, stats: run.result.stats,
    steps: run.steps, unattached: run.unattached.slice(0, UNATTACHED_SHOWN), unattachedTotal: run.unattached.length };
}

/* ─── Paging, search, filter, sort ─── */
export function parseQuery(sp: URLSearchParams): PageQuery {
  const num = (k: string, d: number) => { const n = Math.floor(Number(sp.get(k))); return Number.isFinite(n) && sp.get(k) !== null ? n : d; };
  return {
    offset: Math.max(0, num('offset', 0)), limit: Math.min(MAX_PAGE, Math.max(1, num('limit', 50))),
    q: (sp.get('q') || '').trim().toLowerCase().slice(0, 100), filter: sp.get('filter') || 'all',
    sort: sp.get('sort') || '', dir: sp.get('dir') === 'desc' ? 'desc' : 'asc',
  };
}

type Key = string | number | null;
/** Orders by a key, empty values always last, ties by `tie` (file order). */
function order<T>(items: T[], key: ((t: T) => Key) | undefined, dir: 'asc' | 'desc', tie: (t: T) => number): T[] {
  if (!key) return items;
  const sign = dir === 'desc' ? -1 : 1;
  const keyed = items.map(t => ({ t, k: key(t) }));
  keyed.sort((a, b) => {
    const ae = a.k === null || a.k === '', be = b.k === null || b.k === '';
    if (ae || be) return ae && be ? tie(a.t) - tie(b.t) : ae ? 1 : -1;
    const c = typeof a.k === 'number' && typeof b.k === 'number' ? a.k - b.k : String(a.k).localeCompare(String(b.k));
    return c ? c * sign : tie(a.t) - tie(b.t);
  });
  return keyed.map(x => x.t);
}

const PERSONA_RANK = { Primary: 0, Secondary: 1, None: 2 } as const;
const CONTACT_SORT: Record<string, (c: Contact, a: Account | undefined) => Key> = {
  name: c => c.name.toLowerCase(), company: c => c.company.toLowerCase(), jobTitle: c => c.jobTitle.toLowerCase(),
  persona: c => PERSONA_RANK[c.persona], email: c => c.emailRaw.toLowerCase(), linkedin: c => c.linkedinRaw.toLowerCase(),
  location: c => [c.city, c.country].filter(Boolean).join(', ').toLowerCase(), industry: (_c, a) => a ? a.industry.toLowerCase() : '',
  employees: (_c, a) => a ? a.employees : null, reachableBy: c => c.reachableBy, consent: c => c.consent.toLowerCase(),
  owner: c => c.owner, status: c => c.status,
};
const ACCOUNT_SORT: Record<string, (a: Account, n: number) => Key> = {
  name: a => a.name.toLowerCase(), location: a => [a.city, a.country].filter(Boolean).join(', ').toLowerCase(), industry: a => a.industry.toLowerCase(),
  vertical: a => a.vertical.toLowerCase(), confidence: a => ({ high: 0, medium: 1, low: 2 })[a.confidence], accountType: a => a.accountType,
  size: a => a.revenue ?? a.employees, customer: a => a.existingCustomer ? 0 : 1, contacts: (_a, n) => n, owner: a => a.owner,
  knockouts: a => a.excluded ? 1 : 0,
};

function contactPasses(c: Contact, filter: string): boolean {
  if (filter === 'in') return c.status === 'In the final list';
  if (filter === 'nc') return c.status.startsWith('In the list');
  if (filter === 'out') return c.status.startsWith('Not in');
  return true;
}
const selectable = (c: Contact) => c.status.startsWith('In the');

function matchingContacts(run: Run, q: string, filter: string): Contact[] {
  return run.result.contacts.filter(c => contactPasses(c, filter) && (!q || run.search.get(c.row)!.includes(q)));
}

function toContactItem(run: Run, c: Contact): ContactRowItem {
  const a = run.accById.get(c.accountId), issues = run.issuesByRow.get(c.row) || [], first = issues[0];
  return {
    row: c.row, name: c.name, company: c.company, jobTitle: c.jobTitle, persona: c.persona,
    email: c.email, emailRaw: c.emailRaw, emailVerified: c.emailVerified, emailOutcome: c.emailVerification ? c.emailVerification.outcome : null,
    linkedinRaw: c.linkedinRaw, city: c.city, country: c.country, industry: a ? a.industry : '', employees: a ? a.employees : null,
    reachableBy: c.reachableBy, optOut: c.optOut, consent: c.consent, owner: c.owner, status: c.status, selectable: selectable(c),
    issueCount: issues.length, firstIssue: first ? { issue: first.issue, outcome: first.outcome, severity: first.severity } : null,
  };
}

export function queryContacts(run: Run, p: PageQuery): Page<ContactRowItem> {
  const hits = matchingContacts(run, p.q, p.filter);
  const key = CONTACT_SORT[p.sort];
  const sorted = order(hits, key && (c => key(c, run.accById.get(c.accountId))), p.dir, c => c.row);
  return { total: sorted.length, offset: p.offset, limit: p.limit, rows: sorted.slice(p.offset, p.offset + p.limit).map(c => toContactItem(run, c)) };
}

/** Every matching contact's row number, so "select all N" can reach past the page on screen. */
export function contactRows(run: Run, p: Pick<PageQuery, 'q' | 'filter'>, selectableOnly: boolean): number[] {
  return matchingContacts(run, p.q, p.filter).filter(c => !selectableOnly || selectable(c)).map(c => c.row);
}

export function queryAccounts(run: Run, p: PageQuery): Page<AccountRowItem> {
  const hits = run.result.accounts.filter(a => {
    if (p.filter === 'pass' && a.excluded) return false;
    if (p.filter === 'excluded' && !a.excluded) return false;
    if (p.filter === 'review' && !a.needsReview) return false;
    return !p.q || a.name.toLowerCase().includes(p.q);
  });
  const count = (a: Account) => (run.contactsByAcc.get(a.id) || []).length;
  const key = ACCOUNT_SORT[p.sort];
  const idx = new Map(run.result.accounts.map((a, i) => [a.id, i]));
  const sorted = order(hits, key && (a => key(a, count(a))), p.dir, a => idx.get(a.id)!);
  const rows = sorted.slice(p.offset, p.offset + p.limit).map((a): AccountRowItem => {
    const cs = run.contactsByAcc.get(a.id) || [];
    return { id: a.id, name: a.name, domain: a.domain, city: a.city, country: a.country, industry: a.industry, vertical: a.vertical, verticalLevel: a.verticalLevel,
      confidence: a.confidence, classReason: a.classReason, accountType: a.accountType, revenue: a.revenue, employees: a.employees, existingCustomer: a.existingCustomer,
      siteName: a.siteName, siteProcess: a.siteProcess, siteCapacity: a.siteCapacity, capacityUnit: a.capacityUnit, owner: a.owner,
      excluded: a.excluded, excludedReason: a.excludedReason, contactCount: cs.length, primaryCount: cs.filter(c => c.persona === 'Primary').length };
  });
  return { total: sorted.length, offset: p.offset, limit: p.limit, rows };
}

/* ─── Detail: loaded only when a row is opened ─── */
export function contactDetail(run: Run, row: number): ContactDetail | null {
  const contact = run.byRow.get(row);
  return contact ? { contact, account: run.accById.get(contact.accountId) || null, issues: run.issuesByRow.get(row) || [] } : null;
}

/* ─── Email verification ─── */
/** Addresses worth verifying: the given contacts (or all), with an address, not opted out. */
export function emailsFor(run: Run, rows?: number[]): string[] {
  const only = rows ? new Set(rows) : null;
  return [...new Set(run.result.contacts.filter(c => c.email && !c.optOut && (!only || only.has(c.row))).map(c => c.email))];
}
/** Pull the stored Hunter results for these addresses into the run. */
export async function syncVerifications(run: Run, emails: string[]): Promise<RunSummary['stats']> {
  await applyStored(run, emails);
  return run.result.stats;
}

/* ─── Hand-off to Scoring: the selected (or all) contacts with their accounts, as a saved list stores them ─── */
export function exportRun(run: Run, rows?: number[]): { stats: RunSummary['stats']; accounts: Account[]; contacts: Contact[] } {
  const res = run.result;
  if (!rows) return { stats: res.stats, accounts: res.accounts, contacts: res.contacts };
  const only = new Set(rows);
  const contacts = res.contacts.filter(c => only.has(c.row));
  const ids = new Set(contacts.map(c => c.accountId));
  const accounts = res.accounts.filter(a => ids.has(a.id));
  return { contacts, accounts, stats: Object.assign({}, res.stats, { contacts: contacts.length, accounts: accounts.length,
    accountsPass: accounts.filter(a => !a.excluded).length, inFinalList: contacts.filter(c => c.status === 'In the final list').length }) };
}
export function exportSummary(run: Run, rows: number[]): ExportSummary {
  const s = exportRun(run, rows).stats;
  return { contacts: s.contacts, accounts: s.accounts, accountsPass: s.accountsPass, inFinalList: s.inFinalList };
}

export type { Run };
