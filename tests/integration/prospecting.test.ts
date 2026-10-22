// Prospecting and Scoring on the server against PostgreSQL, with the full sample from test-data/:
// G-004 (the full sample saves and reloads), G-061 (as-of date validated), G-049 (hand-off IDs), G-014 (owner
// scoping in the services, IDOR), G-043 (real job stages), the answer-key tier snapshot through the server path,
// job failure and retry, and timings at 7.5k and 20k rows.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import * as E from '../../lib/demandai-engine.ts';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { createAppWorker } from '../../lib/server/jobs/handlers.ts';
import { createWorker } from '../../lib/server/jobs/worker.ts';
import { enqueueJob, getJob } from '../../lib/server/jobs/queue.ts';
import { receiveSample, receiveUpload, uploadLimits, type UploadLimits } from '../../lib/server/services/uploads.ts';
import { checkCsv, deleteList, getList, issuesForCheck, listAccounts, listContacts, reportCsv, saveList, savedLists, unattachedIssues, type Actor } from '../../lib/server/services/lists.ts';
import { checkOf } from '../../lib/prospecting/checks.ts';
import { asOfProblem, getProspect, getRun, listProspects, listSignals, saveRun, startScoringRun } from '../../lib/server/services/scoring.ts';
import { createHandoff, getHandoff } from '../../lib/server/services/handoffs.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';
import { DATASET, loadDataset } from '../helpers/answer-key.ts';
import { listQuality, readinessChecks } from '../../lib/prospecting/quality.ts';
import { scaledLeadCsv } from '../helpers/volume.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics;
const limits: UploadLimits = uploadLimits({ UPLOAD_MAX_BYTES: 25 * 1024 * 1024, UPLOAD_MAX_ROWS: 50_000, UPLOAD_TIME_LIMIT_MS: 120_000, UPLOAD_MAX_UNZIPPED_BYTES: 200 * 1024 * 1024 });
const dataset = loadDataset();
const sample = readFileSync(DATASET);
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const adminActor = (): Actor => ({ userId: ids.adminA, role: 'Admin' });
const repCtx = (emails: string[]): TenantContext => ({ userId: ids.repA, businessUnitId: ids.buA, scope: 'own', ownerEmails: emails });
const repActor = (): Actor => ({ userId: ids.repA, role: 'Sales rep' });
const as = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, ctx, fn);

// The engine on the same workbook, as the reference for what the server must store.
const leads = E.processLeads(dataset.leadGrid, { file: 'Lead_Research_Sample_Dataset.xlsx', sheet: 'Lead template' });
const ownerCounts = new Map<string, number>();
for (const c of leads.contacts) if (c.owner) ownerCounts.set(c.owner, (ownerCounts.get(c.owner) ?? 0) + 1);
const [someOwner, otherOwner] = [...ownerCounts.keys()].sort();
const leadRows = new Set(E.readTable(dataset.leadGrid, { file: 'f', sheet: 's', columns: E.LEAD_COLUMNS, required: E.LEAD_REQUIRED, anchor: 'company_name' }).records.map(r => r.__row));

before(async () => {
  db = await freshDatabase('prospecting');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
});
after(async () => { await db?.drop(); });

async function runJobs(): Promise<number> {
  return createAppWorker(app, limits).drain();
}

async function uploadLeads(bytes: Buffer, fileName = 'Lead_Research_Sample_Dataset.xlsx', mediaType = XLSX_TYPE, ctx = admin()) {
  const r = await as(ctx, s => receiveUpload(s, { kind: 'lead', fileName, mediaType, bytes }, limits));
  assert.ok(r.jobId);
  const started = performance.now();
  await runJobs();
  const ms = Math.round(performance.now() - started);
  const job = (await as(ctx, s => getJob(s, r.jobId!)))!;
  return { ...r, job, ms };
}

let listId = '', runId = '';

test('G-004: the full sample (7,498 rows) saves to the database and reloads in full, page by page', async () => {
  const up = await uploadLeads(sample);
  assert.equal(up.job.status, 'succeeded', JSON.stringify(up.job.error));
  assert.deepEqual(up.job.progress.stages, ['parse', 'check', 'save']);
  assert.equal(up.job.progress.done, 3, 'G-043: the job reports its real stages');
  listId = up.job.progress.result!.listId;
  await as(admin(), s => saveList(s, adminActor(), listId, { name: 'Full sample' }));
  const detail = await as(admin(), s => getList(s, adminActor(), listId));
  assert.equal(detail.status, 'saved');
  assert.deepEqual(detail.stats, leads.stats);
  assert.deepEqual(detail.visible.contacts, { all: leads.contacts.length, in: leads.contacts.filter(c => c.status === 'In the final list').length,
    nc: leads.contacts.filter(c => c.status.startsWith('In the list')).length, out: leads.contacts.filter(c => c.status.startsWith('Not in')).length });
  // Reload every contact through the paged API and compare with the engine's own output.
  const got: E.Contact[] = [];
  let after: number | undefined;
  do {
    const page = await as(admin(), s => listContacts(s, listId, { after, limit: 500 }));
    got.push(...page.rows.map(r => r.contact));
    after = page.next ?? undefined;
  } while (after !== undefined);
  assert.deepStrictEqual(got, leads.contacts);
  const accs = await as(admin(), s => listAccounts(s, listId, { limit: 500 }));
  assert.deepStrictEqual(accs.rows.map(r => r.account), leads.accounts.slice(0, 500));
  assert.ok((await as(admin(), s => savedLists(s))).some(l => l.id === listId && l.name === 'Full sample'));
});

test('issues come back on their rows (a merged duplicate on the row it went into), the rest as not on any contact', async () => {
  const first = await as(admin(), s => listContacts(s, listId, { limit: 500 }));
  const want = new Map<number, number>();
  for (const i of leads.issues) {
    if (typeof i.row !== 'number') continue;
    const merged = i.code === 'D5' && i.outcome.startsWith('Merged into row ') ? Number(i.outcome.slice(16)) : null;
    const attach = merged ?? i.row;
    want.set(attach, (want.get(attach) ?? 0) + 1);
  }
  for (const r of first.rows) assert.equal(r.issues.length, want.get(r.contact.row) ?? 0, `row ${r.contact.row}`);
  const un = await as(admin(), s => unattachedIssues(s, listId));
  const contactRows = new Set(leads.contacts.map(c => c.row));
  assert.equal(un.length, leads.issues.filter(i => !contactRows.has(i.row as number) && !(i.code === 'D5' && contactRows.has(Number(i.outcome.slice(16))))).length);
});

test('search and filters run on the server and page by keyset', async () => {
  const q = await as(admin(), s => listContacts(s, listId, { q: 'instrument engineer', limit: 50 }));
  assert.ok(q.rows.length > 0);
  assert.ok(q.rows.every(r => `${r.contact.name} ${r.contact.company} ${r.contact.jobTitle}`.toLowerCase().includes('instrument engineer')));
  const pct = await as(admin(), s => listContacts(s, listId, { q: '%', limit: 5 }));
  assert.equal(pct.rows.length, 0, 'a % in the search box is a literal character, not a wildcard');
  const out = await as(admin(), s => listContacts(s, listId, { group: 'out', limit: 500 }));
  assert.ok(out.rows.every(r => r.contact.status.startsWith('Not in')));
  const excluded = await as(admin(), s => listAccounts(s, listId, { filter: 'excluded', limit: 500 }));
  assert.equal(excluded.rows.length, leads.accounts.filter(a => a.excluded).length);
});

test('G-014: a rep sees only contacts they own (by alias) and the counts say so; others’ by ID are not found', async () => {
  const mine = await as(repCtx([someOwner]), s => listContacts(s, listId, { limit: 500 }));
  assert.ok(mine.rows.length > 0);
  assert.ok(mine.rows.every(r => r.contact.owner === someOwner));
  const detail = await as(repCtx([someOwner]), s => getList(s, repActor(), listId));
  assert.equal(detail.scope, 'own');
  assert.equal(detail.visible.contacts.all, ownerCounts.get(someOwner));
  assert.equal(detail.canEdit, false, 'a rep may not rename or delete a list someone else uploaded');
  await assert.rejects(as(repCtx([someOwner]), s => deleteList(s, repActor(), listId)), (e: HttpError) => e.status === 403);
});

test('G-015: a list keeps its % clean, findings per D-code and readiness over the whole file, the same for a rep', async () => {
  const want = listQuality(leads, leadRows);
  const manager = await as(admin(), s => getList(s, adminActor(), listId));
  assert.deepEqual(manager.quality, want);
  assert.deepEqual(manager.readiness, readinessChecks(want));
  const rep = await as(repCtx([someOwner]), s => getList(s, repActor(), listId));
  assert.deepEqual(rep.quality, want, 'a rep sees the file-level figures although they see only their own rows');
  assert.deepEqual((await as(admin(), s => savedLists(s))).find(l => l.id === listId)?.quality, want);
  // A list stored before quality was kept says so instead of showing a figure.
  await owner.query(`UPDATE lead_lists SET quality = NULL WHERE id = $1`, [listId]);
  const old = await as(admin(), s => getList(s, adminActor(), listId));
  assert.equal(old.quality, null);
  assert.equal(old.readiness, null);
  await owner.query(`UPDATE lead_lists SET quality = $2 WHERE id = $1`, [listId, JSON.stringify(want)]);
});

test('G-015 check panes: one check’s findings page in file order; a rep gets their own rows’ findings and the whole-file notes', async () => {
  const dupes = leads.issues.filter(i => checkOf(i) === 'dupes');
  const seen: E.Issue[] = [];
  let after: number | undefined, total = -1;
  do {
    const page = await as(admin(), s => issuesForCheck(s, listId, 'dupes', { after, limit: 200 }));
    total = page.total;
    seen.push(...page.rows);
    after = page.next ?? undefined;
  } while (after !== undefined);
  assert.equal(total, dupes.length);
  assert.deepStrictEqual(seen, dupes, 'every duplicate finding, in file order');
  const repRows = new Set(leads.contacts.filter(c => c.owner === someOwner).map(c => c.row));
  for (const check of ['dupes', 'columns', 'channel'] as const) {
    const mine = await as(repCtx([someOwner]), s => issuesForCheck(s, listId, check, { limit: 500 }));
    assert.equal(mine.rows.length, mine.total);
    assert.ok(mine.rows.every(i => i.row === '—' || repRows.has(i.row) || i.code === 'D5' || !leads.contacts.some(c => c.row === i.row)), check);
    assert.ok(mine.total <= leads.issues.filter(i => checkOf(i) === check).length, check);
  }
  const repDupes = await as(repCtx([someOwner]), s => issuesForCheck(s, listId, 'dupes', { limit: 500 }));
  assert.ok(repDupes.total > 0 && repDupes.total < dupes.length, 'a rep sees some duplicate findings, not every one');
  await assert.rejects(as(admin(), s => issuesForCheck(s, randomUUID(), 'dupes', {})), (e: HttpError) => e.status === 404);
});

test('G-015 CSV: per-check findings as the original pane wrote them, and the validation report with D-codes', async () => {
  const csv = await as(admin(), s => checkCsv(s, listId, 'dupes'));
  assert.equal(csv.fileName, 'Lead_Research_Sample_Dataset-dupes-issues.csv');
  const lines = csv.csv.split('\r\n');
  assert.equal(lines[0], 'Row,Field,Issue,What happens,How to fix,Severity');
  assert.equal(lines.length, 1 + leads.issues.filter(i => checkOf(i) === 'dupes').length);
  const report = await as(admin(), s => reportCsv(s, listId));
  assert.equal(report.fileName, 'Lead_Research_Sample_Dataset-validation-report.csv');
  const rl = report.csv.split('\r\n');
  assert.equal(rl[0], 'Row,Field,Issue,What happens,How to fix,Severity,Check,D-code,What the code means');
  assert.equal(rl.length, 1 + leads.issues.length);
  assert.equal(rl.filter(l => l.endsWith(',D5,Duplicate')).length, leads.issues.filter(i => i.code === 'D5').length);
  const mine = await as(repCtx([someOwner]), s => reportCsv(s, listId));
  assert.ok(mine.csv.split('\r\n').length < rl.length, 'a rep’s report holds only what they can see');
});

test('G-052 in the check CSV: a column name written as a formula in the uploaded file is neutralised', async () => {
  const header = [...E.LEAD_COLUMNS, '=HYPERLINK("http://x.example","y")'];
  const row = E.LEAD_COLUMNS.map(c => ({ first_name: 'Ann', last_name: 'Lee', company_name: 'Acme', country: 'Singapore', owner_email: 'rep@client.example' } as Record<string, string>)[c] ?? '');
  // Written by hand: toCSV would neutralise the formula before it ever reached the server.
  const raw = [header, [...row, 'x']].map(r => r.map(v => /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\r\n');
  const up = await uploadLeads(Buffer.from(raw), 'formula.csv', 'text/csv');
  assert.equal(up.job.status, 'succeeded', JSON.stringify(up.job.error));
  const csv = await as(admin(), s => checkCsv(s, up.job.progress.result!.listId, 'columns'));
  const line = csv.csv.split('\r\n').find(l => l.includes('HYPERLINK'))!;
  assert.ok(line, 'the unknown column is reported');
  assert.ok(!/(^|,)"?=/.test(line), `no cell starts with = (${line})`);
  assert.match(line, /'=HYPERLINK/);
});

test('G-061: the as-of date must be a real date, not in the future; nothing silently becomes today', () => {
  const today = '2026-10-22';
  assert.equal(asOfProblem('2026-09-30', today), null);
  assert.equal(asOfProblem('2026-10-23', today), null, 'one day of slack for zones ahead of the server');
  for (const bad of ['', '2026-02-30', '30/09/2026', '2026-9-30', '2026-10-25', '1999-12-31', undefined, 20260930]) assert.ok(asOfProblem(bad, today), String(bad));
});

test('scoring the full sample on the server reproduces the answer-key snapshot; the run reloads from the database', async () => {
  const signal = await as(admin(), s => receiveUpload(s, { kind: 'signal', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: sample }, limits));
  assert.equal(signal.jobId, null);
  await assert.rejects(as(admin(), s => startScoringRun(s, adminActor(), { listId, signalUploadId: signal.uploadId, asOf: '2026-02-30' })),
    (e: HttpError) => e.status === 400 && /not a real date/.test(e.message), 'G-061 at the service too');
  const started = await as(admin(), s => startScoringRun(s, adminActor(), { listId, signalUploadId: signal.uploadId, asOf: '2026-09-30' }));
  runId = started.runId;
  await runJobs();
  const job = (await as(admin(), s => getJob(s, started.jobId)))!;
  assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
  assert.deepEqual(job.progress.stages, ['parse', 'check', 'score', 'save']);
  const tiers = await owner.query(`SELECT tier, count(*)::int n FROM account_scores WHERE run_id = $1 GROUP BY tier`, [runId]);
  assert.deepEqual(Object.fromEntries(tiers.rows.map(r => [r.tier, r.n])), { A: 62, B: 57, C: 90, 'Watch list': 375, 'Below fit floor': 566, Excluded: 251 });
  const run = await as(admin(), s => getRun(s, adminActor(), runId));
  assert.equal(run.stats.scored, 330, 'prospects with a live signal');
  const statuses = await owner.query(`SELECT status, data->>'code' code, count(*)::int n FROM signals WHERE run_id = $1 GROUP BY 1, 2`, [runId]);
  const outcome = Object.fromEntries(statuses.rows.map(r => [r.status === 'Rejected' ? `Rejected ${r.code}` : r.status, 0]));
  for (const r of statuses.rows) outcome[r.status === 'Rejected' ? `Rejected ${r.code}` : r.status] += r.n;
  assert.deepEqual(outcome, { Qualified: 475, 'Not used': 514, 'Used for a knock-out': 45, 'Rejected D1': 58, 'Rejected D2': 149, 'Rejected D3': 118, 'Rejected D4': 92, 'Rejected D5': 41 });
  const top = await as(admin(), s => listProspects(s, runId, { tier: 'A', limit: 5 }));
  assert.ok(top.rows.length && top.rows.every(r => r.tier === 'A' && r.sendable && r.score !== null));
  const detail = await as(admin(), s => getProspect(s, runId, top.rows[0].contactId));
  assert.ok(detail.person && detail.person.signals.length > 0 && detail.result.breakdown);
  const ev = await as(admin(), s => listSignals(s, runId, { status: 'Rejected', limit: 500 }));
  assert.equal(ev.rows.length, 458);
  await as(admin(), s => saveRun(s, adminActor(), runId, 'Full sample · scored 2026-09-30'));
  assert.equal((await as(admin(), s => getRun(s, adminActor(), runId))).status, 'saved');
});

test('G-049, G-005: the default hand-off takes the 135 contactable tier A/B prospects with a live signal, each with its own UUID', async () => {
  const h = await as(admin(), s => createHandoff(s, adminActor(), { runId }));
  assert.deepEqual([h.count, h.heldBack], [135, 9]);
  const sent = await owner.query(`SELECT c.data FROM handoff_items i JOIN contacts c ON c.id = i.contact_id WHERE i.handoff_id = $1`, [h.handoffId]);
  assert.ok(sent.rows.every(r => r.data.contactable === true), 'nobody who fails canContact is handed off');
  const got = await as(admin(), s => getHandoff(s, h.handoffId));
  const itemIds = got.items.map(i => i.id);
  assert.equal(new Set(itemIds).size, 135);
  assert.ok(itemIds.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));
  // The old IDs ('sc-' + account|row with punctuation removed) could collide, e.g. acc-1|2345 and acc-12|345.
  assert.equal('sc-' + 'acc-1|2345'.replace(/[^a-z0-9]/gi, ''), 'sc-' + 'acc-12|345'.replace(/[^a-z0-9]/gi, ''));
  const picked = await as(admin(), s => listProspects(s, runId, { tier: 'B', limit: 3 }));
  const sel = await as(admin(), s => createHandoff(s, adminActor(), { runId, contactIds: picked.rows.map(r => r.contactId) }));
  assert.equal(sel.count + sel.heldBack, picked.rows.filter(r => r.sendable).length);
});

test('G-014 IDOR: a rep can’t open another owner’s prospect, and their hand-off holds only their own', async () => {
  const theirs = await owner.query(`SELECT contact_id FROM prospect_scores WHERE run_id = $1 AND owner_email = $2 LIMIT 1`, [runId, otherOwner]);
  await assert.rejects(as(repCtx([someOwner]), s => getProspect(s, runId, theirs.rows[0].contact_id)), (e: HttpError) => e.status === 404);
  const mine = await as(repCtx([someOwner]), s => listProspects(s, runId, { limit: 500 }));
  assert.ok(mine.rows.length > 0);
  const own = await owner.query(`SELECT count(*)::int n FROM prospect_scores WHERE run_id = $1 AND owner_email = $2`, [runId, someOwner]);
  assert.equal(mine.rows.length, own.rows[0].n);
  const run = await as(repCtx([someOwner]), s => getRun(s, repActor(), runId));
  assert.equal(run.visible.prospects, own.rows[0].n);
  try {
    const h = await as(repCtx([someOwner]), s => createHandoff(s, repActor(), { runId }));
    const items = await owner.query(`SELECT DISTINCT owner_email FROM handoff_items WHERE handoff_id = $1`, [h.handoffId]);
    assert.deepEqual(items.rows.map(r => r.owner_email), [someOwner]);
  } catch (err) {
    assert.ok(err instanceof HttpError && err.status === 400, 'this owner has no tier A/B prospect with a live signal');
  }
});

test('the sample can only be scored with the sample signals (sandbox rule kept)', async () => {
  const up = await as(admin(), s => receiveSample(s, 'lead', limits));
  await runJobs();
  const sandboxList = (await as(admin(), s => getJob(s, up.jobId!)))!.progress.result!.listId;
  await as(admin(), s => saveList(s, adminActor(), sandboxList, { name: 'Sample' }));
  const realSignals = await as(admin(), s => receiveUpload(s, { kind: 'signal', fileName: 'signals.xlsx', mediaType: XLSX_TYPE, bytes: sample }, limits));
  await assert.rejects(as(admin(), s => startScoringRun(s, adminActor(), { listId: sandboxList, signalUploadId: realSignals.uploadId, asOf: '2026-09-30' })),
    (e: HttpError) => e.status === 409 && /Sample signals/.test(e.message));
  const sampleSignals = await as(admin(), s => receiveSample(s, 'signal', limits));
  const ok = await as(admin(), s => startScoringRun(s, adminActor(), { listId: sandboxList, signalUploadId: sampleSignals.uploadId, asOf: '2026-09-30' }));
  await runJobs();
  assert.equal((await as(admin(), s => getJob(s, ok.jobId)))!.status, 'succeeded');
  await assert.rejects(as(admin(), s => startScoringRun(s, adminActor(), { listId, signalUploadId: sampleSignals.uploadId, asOf: '2026-09-30' })),
    (e: HttpError) => e.status === 409, 'and sample signals never go with a real list');
});

test('saving a selection makes a new list with just those prospects and their accounts', async () => {
  const page = await as(admin(), s => listContacts(s, listId, { group: 'in', limit: 3 }));
  const rows = page.rows.map(r => r.contact.row);
  const { listId: picked } = await as(admin(), s => saveList(s, adminActor(), listId, { name: 'Three picked', contactRows: rows }));
  const d = await as(admin(), s => getList(s, adminActor(), picked));
  assert.equal(d.stats.contacts, 3);
  assert.equal(d.visible.contacts.all, 3);
  assert.equal(d.stats.rowsRead, 7498, 'the file-level counts stay those of the upload');
  assert.ok(d.visible.accounts.all >= 1 && d.visible.accounts.all <= 3);
  const whole = listQuality(leads, leadRows);
  assert.equal(d.quality?.clean, whole.clean, '% clean stays that of the file');
  assert.equal(d.quality?.inScope, d.visible.accounts.pass, 'readiness counts the selection’s own accounts');
  assert.ok(d.quality!.primaryReachable <= d.quality!.inScope);
});

test('a file that can’t be read fails its job with the reason; deleting a list removes its runs and unused files', async () => {
  const tooMany = scaledLeadCsv(dataset.leadGrid, 60);
  const small = { ...limits, maxRows: 50 };
  const r = await as(admin(), s => receiveUpload(s, { kind: 'lead', fileName: 'big.csv', mediaType: 'text/csv', bytes: tooMany }, small));
  await createAppWorker(app, small).drain();
  const job = (await as(admin(), s => getJob(s, r.jobId!)))!;
  assert.equal(job.status, 'failed');
  assert.equal(job.error!.code, 'too_many_rows');
  assert.match(job.error!.message, /limit is 50/);
  const before = (await owner.query(`SELECT count(*)::int n FROM uploads`)).rows[0].n;
  const removed = await as(admin(), s => deleteList(s, adminActor(), listId));
  assert.equal(removed.runs, 1);
  assert.equal((await owner.query(`SELECT count(*)::int n FROM scoring_runs WHERE list_id = $1`, [listId])).rows[0].n, 0);
  assert.equal((await owner.query(`SELECT count(*)::int n FROM contacts WHERE list_id = $1`, [listId])).rows[0].n, 0);
  // The list's lead file is still used by the saved selection; the run's signal file is gone.
  assert.equal((await owner.query(`SELECT count(*)::int n FROM uploads`)).rows[0].n, before - 1);
});

test('an unexpected failure is retried with backoff, then fails for good after the last attempt', async () => {
  let calls = 0;
  const flaky = createWorker({ db: app, handlers: { 'lead.process': async () => { calls++; throw new Error('database blip'); } } });
  const jobId = await as(admin(), s => enqueueJob(s, 'lead.process', { uploadId: randomUUID() }, ['parse']));
  await flaky.drain();
  let job = (await as(admin(), s => getJob(s, jobId)))!;
  assert.equal(job.status, 'queued', 'retried');
  for (let i = 0; i < 2; i++) {
    await owner.query(`UPDATE jobs SET run_after = now() WHERE id = $1`, [jobId]);
    await flaky.drain();
  }
  job = (await as(admin(), s => getJob(s, jobId)))!;
  assert.equal(calls, 3);
  assert.equal(job.status, 'failed');
  assert.equal(job.error!.code, 'internal');
  assert.doesNotMatch(job.error!.message, /blip/, 'internal error text is not shown to people');
});

test('volume: 7.5k and 20k-row lead files are checked and stored within budget; first page and search stay fast', async () => {
  const timings: Record<string, number> = {};
  for (const rows of [7500, 20000]) {
    const up = await uploadLeads(scaledLeadCsv(dataset.leadGrid, rows), `volume_${rows}.csv`, 'text/csv');
    assert.equal(up.job.status, 'succeeded', JSON.stringify(up.job.error));
    timings[`job ${rows}`] = up.ms;
    const id = up.job.progress.result!.listId;
    let t = performance.now();
    await as(admin(), s => listContacts(s, id, { limit: 200 }));
    timings[`first page ${rows}`] = Math.round(performance.now() - t);
    t = performance.now();
    await as(admin(), s => listContacts(s, id, { q: 'instrument', limit: 200 }));
    timings[`search ${rows}`] = Math.round(performance.now() - t);
    assert.ok(up.ms < 60_000, `${rows} rows took ${up.ms} ms`);
    assert.ok(timings[`first page ${rows}`] < 1000 && timings[`search ${rows}`] < 1000, JSON.stringify(timings));
  }
  console.log('# volume timings (ms):', JSON.stringify(timings));
});
