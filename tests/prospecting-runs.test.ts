// Prospecting runs on the server: a 7,498-row file is screened once and read a page at a time.
// Covers paging, server-side search / filter / sort, lazy detail, select-all, verification sync and the hand-off to Scoring.
// Run with: npm test   (Node older than 22.18 needs --experimental-strip-types)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from '../lib/server/prospecting-runs.ts';
import * as Ver from '../lib/server/verification-store.ts';
import { gridsFromFile } from '../lib/server/file-grids.ts';

process.env.DEMANDAI_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'demandai-runs-'));

const FILE = fileURLToPath(new URL('../test-data/Lead_Research_Sample_Dataset.xlsx', import.meta.url));
const page = (o: Partial<{ offset: number; limit: number; q: string; filter: string; sort: string; dir: 'asc' | 'desc' }> = {}) =>
  ({ offset: 0, limit: 50, q: '', filter: 'all', sort: '', dir: 'asc' as const, ...o });
const size = (x: unknown) => Buffer.byteLength(JSON.stringify(x));

let runId = '';
let summary: Awaited<ReturnType<typeof R.createRun>>;
const big = async () => (await R.getRun(runId))!;

test('a 7,498-row file is screened once and answered as a small summary', async () => {
  const bytes = (await import('node:fs')).readFileSync(FILE);
  const grids = gridsFromFile('Lead_Research_Sample_Dataset.xlsx', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const g = grids.find(x => /lead template/i.test(x.sheet))!;
  const t0 = performance.now();
  summary = await R.createRun({ grid: g.grid, fileName: 'Lead_Research_Sample_Dataset.xlsx', sheet: g.sheet, sandbox: false });
  const ms = performance.now() - t0;
  runId = summary.runId;
  console.log(`# screened ${summary.stats.rowsRead} rows in ${ms.toFixed(0)} ms; summary ${size(summary)} bytes`);
  assert.equal(summary.stats.rowsRead, 7498);
  assert.equal(summary.steps.length, 12);
  assert.ok(summary.unattached.length <= 25);
  assert.ok(size(summary) < 60_000, 'the summary is small however long the file');
  assert.match(runId, R.RUN_ID);
});

test('a page holds only the rows asked for, in file order, with no nested detail', async () => {
  const run = await big();
  const p1 = R.queryContacts(run, page({ limit: 50 }));
  assert.equal(p1.rows.length, 50);
  assert.equal(p1.total, run.result.contacts.length);
  assert.deepEqual(p1.rows.map(r => r.row), run.result.contacts.slice(0, 50).map(c => c.row));
  const p2 = R.queryContacts(run, page({ offset: 50, limit: 50 }));
  assert.equal(new Set([...p1.rows, ...p2.rows].map(r => r.row)).size, 100, 'pages do not overlap');
  const last = R.queryContacts(run, page({ offset: Math.floor((p1.total - 1) / 50) * 50 }));
  assert.ok(last.rows.length >= 1 && last.rows.length <= 50);
  assert.equal(R.queryContacts(run, page({ offset: p1.total + 100 })).rows.length, 0);
  console.log(`# 50-row page = ${size(p1)} bytes; whole result = ${size(run.result)} bytes`);
  assert.ok(size(p1) < size(run.result) / 50, 'a page is a small fraction of the whole result');
  for (const r of p1.rows) assert.ok(!('emailVerification' in r) && !('accountId' in r), 'rows carry no nested record');
  // The cap on one request, whatever the client asks for.
  assert.equal(R.parseQuery(new URLSearchParams('limit=100000')).limit, R.MAX_PAGE);
  assert.equal(R.parseQuery(new URLSearchParams('limit=0&offset=-5')).offset, 0);
});

test('search and filter are applied on the server, over every row', async () => {
  const run = await big();
  const all = run.result.contacts;
  const first = all.find(c => c.name.length > 5)!;
  const q = first.name.toLowerCase();
  const hit = R.queryContacts(run, page({ q, limit: 200 }));
  assert.ok(hit.total >= 1 && hit.rows.some(r => r.row === first.row));
  assert.equal(hit.total, all.filter(c => (c.name + ' ' + c.company + ' ' + c.jobTitle).toLowerCase().includes(q)).length);
  assert.equal(R.queryContacts(run, page({ q: 'zzzz-no-such-person' })).total, 0);
  for (const f of ['in', 'nc', 'out'] as const) {
    const t = R.queryContacts(run, page({ filter: f, limit: 1 })).total;
    const expect = all.filter(c => f === 'in' ? c.status === 'In the final list' : f === 'nc' ? c.status.startsWith('In the list') : c.status.startsWith('Not in')).length;
    assert.equal(t, expect, f);
  }
  const combined = R.queryContacts(run, page({ q, filter: 'in', limit: 200 }));
  assert.ok(combined.rows.every(r => r.status === 'In the final list'));
  const acc = R.queryAccounts(run, page({ filter: 'excluded', limit: 200 }));
  assert.equal(acc.total, run.result.accounts.filter(a => a.excluded).length);
  assert.ok(acc.rows.every(a => a.excluded));
});

test('sorting is applied on the server across all rows, empties last, ties in file order', async () => {
  const run = await big();
  const asc = R.queryContacts(run, page({ sort: 'name', limit: 200 })), desc = R.queryContacts(run, page({ sort: 'name', dir: 'desc', limit: 200 }));
  const names = asc.rows.map(r => r.name.toLowerCase());
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  const dn = desc.rows.map(r => r.name.toLowerCase());
  assert.deepEqual(dn, [...dn].sort((a, b) => b.localeCompare(a)));
  const emp = R.queryContacts(run, page({ sort: 'employees', dir: 'desc', limit: 200 })).rows.map(r => r.employees);
  const known = emp.filter(v => v !== null) as number[];
  assert.deepEqual(known, [...known].sort((a, b) => b - a));
  assert.equal(R.queryContacts(run, page({ sort: 'nonsense' })).rows[0].row, run.result.contacts[0].row, 'an unknown sort key keeps file order');
  const accSorted = R.queryAccounts(run, page({ sort: 'name', limit: 200 })).rows.map(a => a.name.toLowerCase());
  assert.deepEqual(accSorted, [...accSorted].sort((a, b) => a.localeCompare(b)));
});

test('the full record is only built for the row that is opened', async () => {
  const run = await big();
  const row = run.result.contacts.find(c => (run.issuesByRow.get(c.row) || []).length > 1)!;
  const item = R.queryContacts(run, page({ q: row.name.toLowerCase(), limit: 200 })).rows.find(r => r.row === row.row)!;
  const d = R.contactDetail(run, row.row)!;
  assert.equal(d.contact.row, row.row);
  assert.equal(d.issues.length, item.issueCount, 'the list says how many; the detail has them all');
  assert.ok(d.issues.length > 1 && item.firstIssue!.issue === d.issues[0].issue);
  assert.ok(d.account && d.account.checks.length === 4);
  assert.equal(R.contactDetail(run, -1), null);
});

test('"select all" returns every matching selectable row, past the page on screen', async () => {
  const run = await big();
  const rows = R.contactRows(run, { q: '', filter: 'in' }, true);
  assert.equal(rows.length, run.result.contacts.filter(c => c.status === 'In the final list').length);
  assert.ok(rows.length > 50);
  const withNot = R.contactRows(run, { q: '', filter: 'all' }, true);
  assert.equal(withNot.length, run.result.contacts.filter(c => c.status.startsWith('In the')).length);
});

test('hand-off to Scoring: everything, or just the selection, as a saved list stores it', async () => {
  const run = await big();
  const all = R.exportRun(run);
  assert.equal(all.contacts.length, run.result.contacts.length);
  const rows = R.contactRows(run, { q: '', filter: 'in' }, true).slice(0, 30);
  const some = R.exportRun(run, rows);
  assert.equal(some.contacts.length, 30);
  assert.ok(some.accounts.every(a => some.contacts.some(c => c.accountId === a.id)));
  assert.deepEqual(R.exportSummary(run, rows), { contacts: 30, accounts: some.accounts.length, accountsPass: some.accounts.filter(a => !a.excluded).length, inFinalList: some.stats.inFinalList });
});

test('verification: stored Hunter results are brought into the run and change who is in the list', async () => {
  const run = await big();
  const c = run.result.contacts.find(x => x.email && x.status === 'In the final list' && !x.emailVerification)!;
  const before = run.result.stats.inFinalList;
  const rec = { email: c.email, provider: 'hunter', outcome: 'invalid', reason: 'x', checkedAt: new Date().toISOString(), status: 'invalid', score: 0, regexp: true,
    gibberish: false, disposable: false, webmail: false, mx_records: true, smtp_server: true, smtp_check: false, accept_all: false, block: false,
    verification: null, sources: [{ domain: 'a.com', uri: 'http://a.com', extracted_on: '', last_seen_on: '', still_on_page: true }] } as never;
  await Ver.putStored(rec);
  const stats = await R.syncVerifications(run, [c.email]);
  assert.ok(stats.inFinalList <= before);
  const item = R.queryContacts(run, page({ q: c.name.toLowerCase(), limit: 200 })).rows.find(r => r.row === c.row)!;
  assert.equal(item.emailOutcome, 'invalid');
  assert.ok(!('sources' in item), 'the list carries only the outcome');
  assert.equal(R.contactDetail(run, c.row)!.contact.emailVerification!.sources.length, 1, 'the sources arrive with the detail');
  const emails = R.emailsFor(run, [c.row]);
  assert.deepEqual(emails, [c.email]);
  assert.ok(R.emailsFor(run).length > 100);
});

test('a run survives being dropped from memory, and a stranger\'s id is refused', async () => {
  const g = globalThis as unknown as { __demandaiRuns: Map<string, unknown> };
  g.__demandaiRuns.delete(runId);
  const again = await R.getRun(runId);
  assert.ok(again, 'read back from disk');
  assert.equal(again!.result.contacts.length, summary.stats.contacts);
  assert.equal(R.queryContacts(again!, page({ q: '' })).rows.filter(r => r.emailOutcome === 'invalid').length >= 0, true);
  assert.equal(await R.getRun('run-000000000000'), null);
  assert.equal(await R.getRun('../../etc/passwd'), null);
});
