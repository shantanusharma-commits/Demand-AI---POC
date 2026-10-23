// Account Scoring on the server: a run scores a saved list against an uploaded signal file as of a validated date
// (G-061), as a job with real stages; results are stored so a run reloads without re-scoring and the hand-off reads
// the same ranking. Person-level rows are owner-scoped like the list's (G-014).
import 'server-only';
import { and, asc, desc, eq, gt, inArray, like, ne, or, sql } from 'drizzle-orm';
import { CONFIG, customSignalProblem, processSignals, scoreList, type CustomSignalType } from '../../demandai-engine.ts';
import { ENGINE_VERSION } from '../../engine/config.ts';
import { SIGNAL_SHEET } from '../../engine/sheets.ts';
import { buildProspects, sendable, signalStepResults, type SignalStepResult } from '../../engine/prospects.ts';
import type { Account, Contact, Issue, PersonScore, ScoreResult, Signal, Tier } from '../../../types/demandai';
import { accountScores, accounts, configVersions, contacts, issues, leadLists, nbaRuns, prospectScores, scoringRuns, signals, TIERS } from '../db/schema.ts';
import { withTenant, type TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { enqueueJob, JobError, jobContext } from '../jobs/queue.ts';
import type { JobRun } from '../jobs/worker.ts';
import { readUpload, UploadReadError, type FileNote } from '../uploads/parse.ts';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.ts';
import { logger } from '../logger.ts';
import { loadUpload, type UploadLimits } from './uploads.ts';
import { chunks, containsPattern, deleteUnusedUploads, isManager, loadLeadList, NBA_KEEPS, ownerOnly, PAGE_DEFAULT, PAGE_MAX, type Actor, type Page, type PageQuery } from './lists.ts';

export const SCORING_STAGES = ['parse', 'check', 'score', 'save'];

/* ─── The as-of date (G-061): a real calendar date, never silently replaced by today ─── */

export const AS_OF_MIN = '2000-01-01';

/** Null when valid, otherwise what is wrong, in words for the person. `today` is the server's date (YYYY-MM-DD). */
export function asOfProblem(value: unknown, today: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return 'Choose the date to score as of.';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return 'Write the scoring date as YYYY-MM-DD.';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return `${value} is not a real date.`;
  if (value < AS_OF_MIN) return `The scoring date can't be before ${AS_OF_MIN}.`;
  // One day of slack for time zones ahead of the server's.
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10);
  if (value > tomorrow) return "The scoring date can't be in the future.";
  return null;
}

export const todayUtc = () => new Date().toISOString().slice(0, 10);

/* ─── Signal settings (G-023): types switched off in Setup and types added there ─── */

export type SignalSettings = { off: string[]; custom: CustomSignalType[] };

const LEVELS = Object.keys(CONFIG.customStrength);

/** The signal settings in a configuration body (`signalsOff`, `signalsCustom`), checked as Setup checks them; throws
 *  with the reason when they can't be used, so a run is never scored with settings other than the ones shown. */
export function signalSettingsOf(body: unknown): SignalSettings {
  const b = (body && typeof body === 'object' ? body : {}) as { signalsOff?: unknown; signalsCustom?: unknown };
  const offIn = b.signalsOff ?? [], customIn = b.signalsCustom ?? [];
  if (!Array.isArray(customIn)) throw new Error('the added signal types are not a list');
  const custom: CustomSignalType[] = [];
  for (const c of customIn as Partial<CustomSignalType>[]) {
    if (!c || typeof c !== 'object') throw new Error('an added signal type has no definition');
    const def: CustomSignalType = {
      name: String(c.name ?? '').trim(), segment: String(c.segment ?? ''), level: c.level as CustomSignalType['level'], full: Number(c.full), zero: Number(c.zero),
      ...(c.about ? { about: String(c.about) } : {}), ...(c.data ? { data: String(c.data) } : {}), ...(c.source ? { source: String(c.source) } : {}),
    };
    const problem = customSignalProblem(def, custom) ?? (LEVELS.includes(def.level) ? null : `Pick how strong "${def.name}" is (${LEVELS.join(', ')})`);
    if (problem) throw new Error(problem);
    custom.push(def);
  }
  if (!Array.isArray(offIn) || offIn.some(t => typeof t !== 'string')) throw new Error('the switched-off signal types are not a list of names');
  const known = new Set([...Object.keys(CONFIG.signalTypes), ...custom.map(c => c.name)]);
  const unknown = (offIn as string[]).find(t => !known.has(t));
  if (unknown !== undefined) throw new Error(`"${unknown}" is switched off but is not a signal type`);
  return { off: [...new Set(offIn as string[])], custom };
}

export type ActiveSignalSettings = SignalSettings & { configVersionId: string | null; problem: string | null };

/** The signal settings a new run of the caller's unit would take, from its active configuration version. When they
 *  can't be used, `problem` says why (and no run starts until Setup fixes them). */
export async function activeSignalSettings(scope: TenantScope): Promise<ActiveSignalSettings> {
  const [c] = await scope.tx.select({ id: configVersions.id, body: configVersions.body }).from(configVersions)
    .where(and(eq(configVersions.businessUnitId, scope.ctx.businessUnitId), eq(configVersions.status, 'active')));
  if (!c) return { configVersionId: null, off: [], custom: [], problem: null };
  try {
    return { configVersionId: c.id, ...signalSettingsOf(c.body), problem: null };
  } catch (err) {
    logger.warn({ event: 'config.signals.invalid', configVersionId: c.id, problem: (err as Error).message }, 'Active signal settings cannot be used');
    return { configVersionId: c.id, off: [], custom: [], problem: `The signal settings in Setup can't be used: ${(err as Error).message}. Fix them in Setup, then score again.` };
  }
}

/* ─── Starting a run ─── */

export async function startScoringRun(scope: TenantScope, actor: Actor, input: { listId: string; signalUploadId: string; asOf: string }): Promise<{ runId: string; jobId: string }> {
  const problem = asOfProblem(input.asOf, todayUtc());
  if (problem) throw badRequest(problem, { asOf: [problem] });
  const [list] = await scope.tx.select({ id: leadLists.id, status: leadLists.status, sandbox: leadLists.sandbox }).from(leadLists)
    .where(and(eq(leadLists.id, input.listId), eq(leadLists.businessUnitId, scope.ctx.businessUnitId)));
  if (!list) throw notFound("That prospect list isn't saved any more.");
  if (list.status === 'replaced') throw conflict('This list has been corrected since. Score its current version.');
  if (list.status !== 'saved') throw conflict('Save the prospect list before scoring it.');
  const upload = await loadUpload(scope, input.signalUploadId);
  if (!upload || upload.kind !== 'signal') throw notFound('That signal file is not there any more. Upload it again.');
  if (upload.sandbox !== list.sandbox) throw conflict('Sample signals only go with a list built from sample data.');
  // The run keeps the signal settings it started with: a type switched off later still counts here (G-023).
  const settings = await activeSignalSettings(scope);
  if (settings.problem) throw conflict(settings.problem);
  const [run] = await scope.tx.insert(scoringRuns).values({
    businessUnitId: scope.ctx.businessUnitId, listId: list.id, signalUploadId: upload.id, asOf: input.asOf, status: 'draft', sandbox: list.sandbox,
    sourceFile: upload.fileName, configVersionId: settings.configVersionId, engineVersion: ENGINE_VERSION, signalsOff: settings.off, signalsCustom: settings.custom,
    createdBy: actor.userId, updatedBy: actor.userId,
  }).returning({ id: scoringRuns.id });
  const jobId = await enqueueJob(scope, 'scoring.run', { runId: run.id }, SCORING_STAGES);
  await recordAudit(scope, { action: 'scoring.started', actorRole: actor.role, targetType: 'scoring_run', targetId: run.id,
    details: { listId: list.id, uploadId: upload.id, asOf: input.asOf, jobId, signalsOff: settings.off, signalsAdded: settings.custom.map(c => c.name) } });
  logger.info({ event: 'scoring.started', runId: run.id, listId: list.id, signalsOff: settings.off.length, signalsAdded: settings.custom.length }, 'Scoring run queued');
  return { runId: run.id, jobId };
}

/* ─── The job ─── */

const lower = (s: string | undefined | null) => (s ? s.trim().toLowerCase() : '') || null;

export type ProspectSummary = {
  name: string; jobTitle: string; company: string; vertical: string; country: string;
  excluded: boolean; excludedReason: string; belowFloor: boolean; whyNow: string; types: string[];
};
type StoredPerson = Omit<PersonScore, 'contact'>;
type StoredResult = Omit<ScoreResult, 'account' | 'contacts' | 'people'>;

export function createScoringJob(limits: UploadLimits) {
  return async function runScoring(run: JobRun): Promise<Record<string, string>> {
    const { db, job } = run;
    const ctx = jobContext(job.businessUnitId);
    const runId = job.payload.runId;
    await run.stage('parse');
    const loaded = await withTenant(db, ctx, async s => {
      const [r] = await s.tx.select().from(scoringRuns).where(eq(scoringRuns.id, runId));
      if (!r) return null;
      const upload = await loadUpload(s, r.signalUploadId);
      const list = await loadLeadList(s, r.listId);
      return upload && list ? { r, upload, list } : null;
    }, { label: 'scoring.load', slowMs: 10_000 });
    if (!loaded) throw new JobError('gone', 'The list or the signal file was deleted before scoring finished.');
    const { r, upload, list } = loaded;
    let read;
    try {
      read = readUpload(upload.bytes, upload.format, { ...SIGNAL_SHEET, maxRows: limits.maxRows });
    } catch (err) {
      if (err instanceof UploadReadError) throw new JobError(err.code, err.message);
      throw err;
    }
    await run.stage('check', { sheetRows: read.grid.length, accounts: list.accounts.length, contacts: list.contacts.length });
    const sig = processSignals(read.grid, list, { file: upload.fileName, sheet: read.sheet, asOf: r.asOf, off: r.signalsOff, custom: r.signalsCustom as CustomSignalType[] });
    sig.issues.unshift(...noteIssues(read.notes, upload.fileName, read.sheet));
    await run.stage('score', { signals: sig.signals.length });
    const scored = scoreList(list, sig);
    const prospects = buildProspects(scored);
    const checks = signalStepResults(sig, scored, prospects);
    const tiers = Object.fromEntries(TIERS.map(t => [t, prospects.filter(p => p.tier === t).length]));
    const stats = {
      rowsRead: sig.rowsRead, qualified: sig.signals.filter(s => s.status === 'Qualified').length, rejected: sig.signals.filter(s => s.status === 'Rejected').length,
      scored: prospects.filter(sendable).length, A: tiers.A, tiers, prospects: prospects.length, signals: sig.signals.length,
    };
    await run.stage('save', { prospects: prospects.length, scored: stats.scored });
    await withTenant(db, ctx, async s => {
      const bu = job.businessUnitId, by = job.createdBy;
      const accountId = (engineId: string | null) => (engineId ? list.accountIds.get(engineId) ?? null : null);
      const contactById = new Map(list.contacts.map(c => [c.row, c]));
      const accountByEngine = new Map(list.accounts.map(a => [a.id, a]));
      for (const part of chunks(sig.signals.map((x, seq) => {
        const contact = x.contactRow !== null ? contactById.get(x.contactRow) : undefined;
        const account = x.accountId ? accountByEngine.get(x.accountId) : undefined;
        return {
          businessUnitId: bu, runId, seq, rowNo: x.row, accountId: accountId(x.accountId), contactId: x.contactRow !== null ? list.contactIds.get(x.contactRow) ?? null : null,
          ownerEmail: lower(contact?.owner ?? account?.owner), status: x.status,
          search: `${x.company} ${x.personName} ${x.personRef} ${x.type}`.toLowerCase(), data: x, createdBy: by,
        };
      }))) await s.tx.insert(signals).values(part);
      for (const part of chunks(scored.map(res => {
        const { account, contacts: _c, people: _p, ...rest } = res;
        void _c; void _p;
        return { runId, accountId: list.accountIds.get(account.id)!, businessUnitId: bu, ownerEmail: lower(account.owner), tier: res.tier as string, data: rest as StoredResult, createdBy: by };
      }))) await s.tx.insert(accountScores).values(part);
      for (const part of chunks(prospects.map((x, rankNo) => {
        const person: StoredPerson | null = x.p ? (({ contact: _contact, ...p }) => { void _contact; return p; })(x.p) : null;
        const summary: ProspectSummary = {
          name: x.c.name, jobTitle: x.c.jobTitle, company: x.r.account.name, vertical: x.r.account.vertical, country: x.r.account.country,
          excluded: x.r.excluded, excludedReason: x.r.excludedReason, belowFloor: !!x.r.belowFloor, whyNow: x.p?.whyNow ?? '',
          types: x.p ? [...new Set(x.p.signals.map(g => g.type))].slice(0, 2) : [],
        };
        return {
          runId, contactId: list.contactIds.get(x.c.row)!, businessUnitId: bu, accountId: list.accountIds.get(x.r.account.id)!, ownerEmail: lower(x.c.owner),
          rankNo, tier: x.tier, score: x.score ?? null, fit: x.fit ?? null, timing: x.timing ?? null, sendable: sendable(x),
          search: `${x.c.name} ${x.r.account.name} ${x.c.jobTitle}`.toLowerCase(), data: { summary, person }, createdBy: by,
        };
      }))) await s.tx.insert(prospectScores).values(part);
      const signalByRow = new Map(sig.signals.map(x => [x.row, x]));
      for (const part of chunks(sig.issues.map((i, seq) => {
        const rowSignal = typeof i.row === 'number' ? signalByRow.get(i.row) : undefined;
        const contact = rowSignal?.contactRow != null ? contactById.get(rowSignal.contactRow) : undefined;
        const account = rowSignal?.accountId ? accountByEngine.get(rowSignal.accountId) : undefined;
        return {
          businessUnitId: bu, runId, seq, rowNo: typeof i.row === 'number' ? i.row : null, attachRowNo: null,
          ownerEmail: typeof i.row === 'number' ? lower(contact?.owner ?? account?.owner) : null, checkKey: 'signals', severity: i.severity, data: i, createdBy: by,
        };
      }))) await s.tx.insert(issues).values(part);
      await s.tx.update(scoringRuns).set({ stats, checks, sheetName: read.sheet, updatedAt: sql`now()` }).where(eq(scoringRuns.id, runId));
    }, { label: 'scoring.save', slowMs: 30_000 });
    return { runId };
  };
}

function noteIssues(notes: FileNote[], file: string, sheet: string): Issue[] {
  return notes.map(n => ({ file, sheet, row: '—', field: '—', issue: n.issue, outcome: n.outcome, code: '—', fix: n.fix, severity: 'info' }));
}

/* ─── Reading runs ─── */

export type RunStats = { rowsRead: number; qualified: number; rejected: number; scored: number; A: number; tiers: Record<Tier, number>; prospects: number; signals: number };

const runColumns = {
  id: scoringRuns.id, name: scoringRuns.name, status: scoringRuns.status, listId: scoringRuns.listId, listName: leadLists.name,
  sourceFile: scoringRuns.sourceFile, sheet: scoringRuns.sheetName, asOf: scoringRuns.asOf, sandbox: scoringRuns.sandbox,
  stats: scoringRuns.stats, createdAt: scoringRuns.createdAt, savedAt: scoringRuns.savedAt, createdBy: scoringRuns.createdBy,
};

export type RunSummary = {
  id: string; name: string | null; status: string; listId: string; listName: string; sourceFile: string; sheet: string | null; asOf: string;
  sandbox: boolean; stats: RunStats; createdAt: Date; savedAt: Date | null;
};

export async function savedRuns(scope: TenantScope): Promise<RunSummary[]> {
  const rows = await scope.tx.select(runColumns).from(scoringRuns).innerJoin(leadLists, eq(leadLists.id, scoringRuns.listId))
    .where(and(eq(scoringRuns.businessUnitId, scope.ctx.businessUnitId), eq(scoringRuns.status, 'saved'))).orderBy(desc(scoringRuns.createdAt));
  return rows.map(({ createdBy: _c, ...r }) => { void _c; return { ...r, stats: r.stats as RunStats }; });
}

async function runRow(scope: TenantScope, id: string) {
  const [r] = await scope.tx.select({ ...runColumns, checks: scoringRuns.checks, signalUploadId: scoringRuns.signalUploadId, signalsOff: scoringRuns.signalsOff, signalsCustom: scoringRuns.signalsCustom })
    .from(scoringRuns).innerJoin(leadLists, eq(leadLists.id, scoringRuns.listId))
    .where(and(eq(scoringRuns.id, id), eq(scoringRuns.businessUnitId, scope.ctx.businessUnitId)));
  return r ?? null;
}

export type RunDetail = RunSummary & {
  checks: SignalStepResult[]; scope: 'all' | 'own';
  /** The signal settings the run was scored with (G-023). */
  signalSettings: SignalSettings;
  /** Counts of what the caller can see (reps: their own prospects, D-33). `unused`: signal rows that didn't count. */
  visible: { tiers: Record<Tier, number>; prospects: number; signals: number; unused: number };
  canEdit: boolean;
};

export async function getRun(scope: TenantScope, actor: Actor, id: string): Promise<RunDetail> {
  const r = await runRow(scope, id);
  if (!r) throw notFound('That scoring run is not there any more.');
  const tiers = Object.fromEntries(TIERS.map(t => [t, 0])) as Record<Tier, number>;
  const counts = await scope.tx.select({ tier: prospectScores.tier, n: sql<number>`count(*)::int` }).from(prospectScores)
    .where(and(eq(prospectScores.runId, id), ownerOnly(scope, prospectScores.ownerEmail))).groupBy(prospectScores.tier);
  for (const c of counts) tiers[c.tier as Tier] = c.n;
  const [sg] = await scope.tx.select({ n: sql<number>`count(*)::int`, unused: sql<number>`(count(*) filter (where ${signals.status} <> 'Qualified'))::int` })
    .from(signals).where(and(eq(signals.runId, id), ownerOnly(scope, signals.ownerEmail)));
  const { createdBy, signalUploadId: _s, signalsOff, signalsCustom, ...rest } = r;
  void _s;
  return {
    ...rest, stats: r.stats as RunStats, checks: r.checks as SignalStepResult[], scope: scope.ctx.scope, signalSettings: { off: signalsOff, custom: signalsCustom as CustomSignalType[] },
    visible: { tiers, prospects: counts.reduce((n, c) => n + c.n, 0), signals: sg.n, unused: sg.unused }, canEdit: isManager(actor.role) || createdBy === actor.userId,
  };
}

/** One person in the ranked list: their prospect tier, with their account's tier beside it (D-12). */
export type ProspectRow = { contactId: string; rank: number; tier: Tier; accountTier: Tier | null; score: number | null; fit: number | null; timing: number | null; sendable: boolean; summary: ProspectSummary };
export type TierFilter = Tier | 'out';

const limitOf = (q: PageQuery) => Math.min(Math.max(1, q.limit ?? PAGE_DEFAULT), PAGE_MAX);

export async function listProspects(scope: TenantScope, runId: string, query: PageQuery & { tier?: TierFilter }): Promise<Page<ProspectRow>> {
  if (!(await runRow(scope, runId))) throw notFound('That scoring run is not there any more.');
  const limit = limitOf(query);
  const t = query.tier;
  const rows = await scope.tx.select({
    contactId: prospectScores.contactId, rank: prospectScores.rankNo, tier: prospectScores.tier, score: prospectScores.score, fit: prospectScores.fit,
    timing: prospectScores.timing, sendable: prospectScores.sendable, data: prospectScores.data, accountTier: accountScores.tier,
  }).from(prospectScores)
    .leftJoin(accountScores, and(eq(accountScores.runId, prospectScores.runId), eq(accountScores.accountId, prospectScores.accountId)))
    .where(and(eq(prospectScores.runId, runId), ownerOnly(scope, prospectScores.ownerEmail),
      t === 'out' ? inArray(prospectScores.tier, ['Below fit floor', 'Excluded']) : t ? eq(prospectScores.tier, t) : undefined,
      query.q?.trim() ? like(prospectScores.search, containsPattern(query.q)) : undefined, query.after !== undefined ? gt(prospectScores.rankNo, query.after) : undefined))
    .orderBy(asc(prospectScores.rankNo)).limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    rows: page.map(r => ({ contactId: r.contactId, rank: r.rank, tier: r.tier as Tier, accountTier: (r.accountTier as Tier | null) ?? null, score: r.score, fit: r.fit, timing: r.timing, sendable: r.sendable, summary: (r.data as { summary: ProspectSummary }).summary })),
    next: rows.length > limit ? page[page.length - 1].rank : null,
  };
}

/** A signal status, or 'unused': every row that didn't count towards a score. */
export type SignalFilter = 'Qualified' | 'Rejected' | 'Not used' | 'Used for a knock-out' | 'unused';

export async function listSignals(scope: TenantScope, runId: string, query: PageQuery & { status?: SignalFilter }): Promise<Page<Signal & { seq: number }>> {
  if (!(await runRow(scope, runId))) throw notFound('That scoring run is not there any more.');
  const limit = limitOf(query);
  const rows = await scope.tx.select({ seq: signals.seq, data: signals.data }).from(signals)
    .where(and(eq(signals.runId, runId), ownerOnly(scope, signals.ownerEmail),
      query.status === 'unused' ? ne(signals.status, 'Qualified') : query.status ? eq(signals.status, query.status) : undefined,
      query.q?.trim() ? like(signals.search, containsPattern(query.q)) : undefined, query.after !== undefined ? gt(signals.seq, query.after) : undefined))
    .orderBy(asc(signals.seq)).limit(limit + 1);
  const page = rows.slice(0, limit);
  return { rows: page.map(r => ({ ...(r.data as Signal), seq: r.seq })), next: rows.length > limit ? page[page.length - 1].seq : null };
}

export type ProspectDetail = {
  contactId: string; tier: Tier; score: number | null; fit: number | null; timing: number | null;
  contact: Contact; account: Account; result: StoredResult; person: StoredPerson | null; unused: Signal[];
};

/** One prospect with the reasoning behind their score. 404 when it isn't in the run or not the caller's (IDOR). */
export async function getProspect(scope: TenantScope, runId: string, contactId: string): Promise<ProspectDetail> {
  const [p] = await scope.tx.select({
    tier: prospectScores.tier, score: prospectScores.score, fit: prospectScores.fit, timing: prospectScores.timing, data: prospectScores.data,
    contact: contacts.data, account: accounts.data, result: accountScores.data,
  }).from(prospectScores)
    .innerJoin(contacts, eq(contacts.id, prospectScores.contactId))
    .innerJoin(accounts, eq(accounts.id, prospectScores.accountId))
    .innerJoin(accountScores, and(eq(accountScores.runId, prospectScores.runId), eq(accountScores.accountId, prospectScores.accountId)))
    .where(and(eq(prospectScores.runId, runId), eq(prospectScores.contactId, contactId), eq(prospectScores.businessUnitId, scope.ctx.businessUnitId),
      ownerOnly(scope, prospectScores.ownerEmail)));
  if (!p) throw notFound('That prospect is not in this scoring run.');
  const unused = await scope.tx.select({ data: signals.data }).from(signals)
    .where(and(eq(signals.runId, runId), eq(signals.contactId, contactId), ne(signals.status, 'Qualified'), ownerOnly(scope, signals.ownerEmail))).orderBy(asc(signals.seq));
  return {
    contactId, tier: p.tier as Tier, score: p.score, fit: p.fit, timing: p.timing, contact: p.contact as Contact, account: p.account as Account,
    result: p.result as StoredResult, person: (p.data as { person: StoredPerson | null }).person, unused: unused.map(u => u.data as Signal),
  };
}

/* ─── Changing runs ─── */

async function editableRun(scope: TenantScope, actor: Actor, id: string) {
  const r = await runRow(scope, id);
  if (!r) throw notFound('That scoring run is not there any more.');
  if (!isManager(actor.role) && r.createdBy !== actor.userId) throw forbidden('Only the person who ran this scoring, or a manager, can change it.');
  return r;
}

export async function saveRun(scope: TenantScope, actor: Actor, id: string, name: string): Promise<void> {
  const r = await editableRun(scope, actor, id);
  if (typeof (r.stats as Partial<RunStats>).prospects !== 'number') throw conflict('This run is still scoring. Save it when it has finished.');
  await scope.tx.update(scoringRuns).set({ name, status: 'saved', savedAt: r.savedAt ?? sql`now()`, updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(scoringRuns.id, id));
  await recordAudit(scope, { action: 'scoring.saved', actorRole: actor.role, targetType: 'scoring_run', targetId: id });
}

export async function renameRun(scope: TenantScope, actor: Actor, id: string, name: string): Promise<void> {
  await editableRun(scope, actor, id);
  await scope.tx.update(scoringRuns).set({ name, updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(scoringRuns.id, id));
  await recordAudit(scope, { action: 'scoring.renamed', actorRole: actor.role, targetType: 'scoring_run', targetId: id });
}

export async function deleteRun(scope: TenantScope, actor: Actor, id: string): Promise<void> {
  const r = await editableRun(scope, actor, id);
  const [built] = await scope.tx.select({ x: sql`1` }).from(nbaRuns).where(eq(nbaRuns.scoringRunId, id)).limit(1);
  if (built) throw conflict(NBA_KEEPS);
  await scope.tx.delete(scoringRuns).where(eq(scoringRuns.id, id));
  await deleteUnusedUploads(scope, [r.signalUploadId]);
  await recordAudit(scope, { action: 'scoring.deleted', actorRole: actor.role, targetType: 'scoring_run', targetId: id });
  logger.info({ event: 'scoring.deleted', runId: id }, 'Scoring run deleted');
}

/** Prospects for a hand-off, in rank order: the given contacts, or every tier A and B prospect, with a live signal. */
export async function handoffCandidates(scope: TenantScope, runId: string, contactIds?: string[]) {
  return scope.tx.select({
    contactId: prospectScores.contactId, accountId: prospectScores.accountId, ownerEmail: prospectScores.ownerEmail, rank: prospectScores.rankNo,
    tier: prospectScores.tier, score: prospectScores.score, fit: prospectScores.fit, timing: prospectScores.timing, data: prospectScores.data,
    contact: contacts.data, account: accounts.data, result: accountScores.data,
  }).from(prospectScores)
    .innerJoin(contacts, eq(contacts.id, prospectScores.contactId))
    .innerJoin(accounts, eq(accounts.id, prospectScores.accountId))
    .innerJoin(accountScores, and(eq(accountScores.runId, prospectScores.runId), eq(accountScores.accountId, prospectScores.accountId)))
    .where(and(eq(prospectScores.runId, runId), eq(prospectScores.sendable, true), ownerOnly(scope, prospectScores.ownerEmail),
      contactIds ? inArray(prospectScores.contactId, contactIds) : or(eq(prospectScores.tier, 'A'), eq(prospectScores.tier, 'B'))))
    .orderBy(asc(prospectScores.rankNo));
}
