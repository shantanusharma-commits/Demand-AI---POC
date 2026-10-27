// Prospecting features ported in Phase 4c (G-015): % clean, the validation report's counts per D-code, and the
// readiness checks. Rows are fictional and built here; the full sample gives the reference figures.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../lib/demandai-engine.ts';
import { dqScore, listQuality, readinessChecks } from '../lib/prospecting/quality.ts';
import { loadDataset } from './helpers/answer-key.ts';

const HEADER = E.LEAD_COLUMNS;
type Row = Partial<Record<(typeof E.LEAD_COLUMNS)[number], string>>;
const BASE: Row = {
  first_name: 'Ann', last_name: 'Lee', job_title: 'Instrumentation Manager', email: 'ann.lee@acme-refining.com', email_verified: 'Y',
  linkedin_url: 'https://www.linkedin.com/in/ann-lee', company_name: 'Acme Refining', company_domain: 'acme-refining.com', country: 'Singapore',
  industry: 'Refining', annual_revenue_usd: '2000000000', employee_count: '3000', account_type: 'Owner-operator', existing_customer: 'N',
  managed_separately: 'N', consent_basis: 'Legitimate interest', opt_out: 'N', owner_email: 'rep@client.example',
};
const grid = (...rows: Row[]) => [HEADER, ...rows.map(r => HEADER.map(h => ({ ...BASE, ...r })[h] ?? ''))];
const leads = (...rows: Row[]) => E.processLeads(grid(...rows), { file: 'f.csv', sheet: 'Sheet1' });
/** The sheet rows the engine reads as data (not the title, header or format-hints rows). */
const dataRows = (g: E.Grid) => new Set(E.readTable(g, { file: 'f', sheet: 's', columns: E.LEAD_COLUMNS, required: E.LEAD_REQUIRED, anchor: 'company_name' }).records.map(r => r.__row));
const quality = (...rows: Row[]) => { const g = grid(...rows); return listQuality(E.processLeads(g, { file: 'f.csv', sheet: 'Sheet1' }), dataRows(g)); };
const issue = (row: E.Issue['row'], severity: E.Issue['severity'], code: E.Issue['code'] = 'D3'): E.Issue =>
  ({ file: 'f', sheet: 's', row, field: 'x', issue: 'x', outcome: 'x', code, fix: 'x', severity });

test('% clean is the legacy dqScore: rows with a stop or flag finding over rows read; information and whole-file notes do not count', () => {
  assert.equal(dqScore([], 10), 100);
  assert.equal(dqScore([issue(2, 'flag'), issue(2, 'stop'), issue(3, 'info'), issue('—', 'stop')], 10), 90, 'row 2 counted once; info and the whole file ignored');
  assert.equal(dqScore([issue(2, 'flag'), issue(3, 'flag'), issue(4, 'flag')], 7), 57, 'rounded');
  assert.equal(dqScore([issue(2, 'flag')], 0), 0, 'an empty file is not clean');
});

test('listQuality counts only data rows: a finding on the header row is about the whole file, not an unclean row', () => {
  // The required column "opt_out" is missing: flagged on the header row (row 1), and every row is fine otherwise.
  const g = grid({}, { first_name: 'Bo', email: 'bo@acme-refining.com', linkedin_url: '' }).map(r => r.filter((_, i) => HEADER[i] !== 'opt_out'));
  const r = E.processLeads(g, { file: 'f.csv', sheet: 'Sheet1' });
  assert.ok(r.issues.some(i => i.row === 1 && i.severity === 'flag'), 'the missing column is flagged on the header row');
  const q = listQuality(r, dataRows(g));
  assert.equal(q.rowsRead, 2);
  assert.equal(q.uncleanRows, 0, 'the header row is not a data row');
  assert.equal(q.clean, 100);
});

test('the validation report counts findings per D-code over the whole file', () => {
  const g = grid({}, { email: 'not an email', first_name: 'Bo', linkedin_url: '' }, { first_name: 'Annie' });
  const r = E.processLeads(g, { file: 'f.csv', sheet: 'Sheet1' });
  const q = listQuality(r, dataRows(g));
  const want: Record<string, number> = {};
  for (const i of r.issues) if (i.code !== '—') want[i.code] = (want[i.code] ?? 0) + 1;
  assert.deepEqual(q.byCode, want);
  assert.equal(q.byCode.D5, 1, 'the repeated row is one D5 finding');
  assert.ok((q.byCode.D3 ?? 0) >= 1, 'the malformed email is a D3 finding');
});

test('N-07 readiness: an account counts as reachable only with a primary-persona contact who passes canContact', () => {
  const blank = leads({ opt_out: '' });
  assert.equal(blank.contacts[0].persona, 'Primary');
  assert.equal(blank.accounts[0].excluded, false, 'the account itself passes the knock-outs');
  assert.equal(quality({ opt_out: '' }).inScope, 1);
  assert.equal(quality({ opt_out: '' }).primaryReachable, 0, 'an unconfirmed opt-out is not reachable (legacy counted it)');
  assert.equal(quality({}).primaryReachable, 1);
  assert.equal(quality({ job_title: 'Accountant' }).primaryReachable, 0, 'no primary persona');
  assert.equal(quality({ consent_basis: 'Business card' }).primaryReachable, 0, 'no recognised consent basis');
  assert.equal(quality({ country: 'France' }).inScope, 0, 'outside the pilot region: not in scope');
});

test('readiness checks use CONFIG.readiness and say what is needed and how to fix it; a list of any size can be ready', () => {
  const R = E.CONFIG.readiness;
  const ok = readinessChecks({ inScope: 20, primaryReachable: Math.ceil(20 * R.contactable / 100) });
  assert.deepEqual(ok.map(c => [c.k, c.ok]), [['Contactability', true]]);
  // No minimum number of accounts (27 Oct 2026): four reachable accounts are ready for measurement.
  assert.deepEqual(readinessChecks({ inScope: 4, primaryReachable: 4 }).map(c => c.ok), [true]);
  assert.equal('accounts' in R, false, 'there is no account minimum to check against');
  const short = readinessChecks({ inScope: 29, primaryReachable: 0 });
  assert.deepEqual(short.map(c => c.ok), [false]);
  assert.equal(short[0].show, '0% of accounts');
  assert.match(short[0].need, new RegExp(`^${R.contactable}%\\+`));
  assert.ok(short.every(c => c.fix.length > 10));
  assert.equal(readinessChecks({ inScope: 0, primaryReachable: 0 })[0].show, '0% of accounts', 'no accounts: 0%, not NaN');
});

test('the full sample: % clean, D-codes and readiness (reference figures)', () => {
  const data = loadDataset();
  const r = E.processLeads(data.leadGrid, { file: 'dataset', sheet: 'Lead template' });
  const rows = dataRows(data.leadGrid);
  const q = listQuality(r, rows);
  assert.equal(q.rowsRead, r.stats.rowsRead);
  assert.equal(q.clean, dqScore(r.issues.filter(i => typeof i.row === 'number' && rows.has(i.row)), r.stats.rowsRead));
  assert.deepEqual(q, SAMPLE_QUALITY);
  const checks = readinessChecks(q);
  assert.deepEqual(checks.map(c => c.ok), [SAMPLE_QUALITY.primaryReachable / SAMPLE_QUALITY.inScope * 100 >= E.CONFIG.readiness.contactable]);
});

// Measured on 23 Oct 2026 (ENGINE_VERSION ts-1.10.0); changes only with a rule change, noted in the commit.
const SAMPLE_QUALITY = { rowsRead: 7498, uncleanRows: 3318, clean: 56, byCode: { D3: 3091, D5: 535 }, inScope: 1191, primaryReachable: 866 };
