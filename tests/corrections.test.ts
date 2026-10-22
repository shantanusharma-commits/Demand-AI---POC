// Corrections (G-015) and the decisions people make on held rows and accounts (D-17, G-021): replayed onto the
// uploaded file's grid, in order, every time a list is built. Rows are fictional and built here.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../lib/demandai-engine.ts';
import { applyCorrections, correctionProblem, rowValues, severityOf, PUT_BACK, TAKEN_OUT, type Correction } from '../lib/engine/corrections.ts';
import { buildProspects, handoffSelection } from '../lib/engine/prospects.ts';
import { allowedChannels, recommendChannel } from '../lib/engine/nba.ts';

const HEADER = E.LEAD_COLUMNS;
type Row = Partial<Record<(typeof E.LEAD_COLUMNS)[number], string>>;
const BASE: Row = {
  first_name: 'Ann', last_name: 'Lee', job_title: 'Instrumentation Manager', email: 'ann.lee@acme-refining.com', email_verified: 'Y',
  linkedin_url: 'https://www.linkedin.com/in/ann-lee', company_name: 'Acme Refining', company_domain: 'acme-refining.com', country: 'Singapore',
  industry: 'Refining', annual_revenue_usd: '2000000000', employee_count: '3000', account_type: 'Owner-operator', existing_customer: 'N',
  managed_separately: 'N', consent_basis: 'Legitimate interest', opt_out: 'N', owner_email: 'rep@client.example',
};
const BO: Row = { first_name: 'Bo', last_name: 'Tan', email: 'bo.tan@acme-refining.com', linkedin_url: 'https://www.linkedin.com/in/bo-tan' };
const OTHER_CO: Row = { first_name: 'Cy', last_name: 'Ng', email: 'cy@delta-gas.com', linkedin_url: '', company_name: 'Delta Gas', company_domain: 'delta-gas.com', industry: 'LNG', employee_count: '900' };
const grid = (...rows: Row[]) => [HEADER, ...rows.map(r => HEADER.map(h => ({ ...BASE, ...r })[h] ?? ''))] as E.Grid;
const run = (g: E.Grid, ks: Correction[]) => { const x = applyCorrections(g, ks); return E.processLeads(x.grid, { removed: x.removed, verticals: x.verticals }); };
const k = (row: number, field: Correction['field'], to: string, reason = 'Other'): Correction => ({ row, field, to, reason });

test('a person’s field is corrected on their row only, the file’s grid is never changed, and the checks run again', () => {
  const g = grid({ email: 'ann.lee@acme-refining' }, BO);
  const before = JSON.stringify(g);
  const r0 = E.processLeads(g);
  assert.equal(r0.contacts[0].email, '', 'malformed before');
  const r = run(g, [k(2, 'email', 'ann.lee@acme-refining.com', 'Wrong or bounced email')]);
  assert.equal(JSON.stringify(g), before, 'the uploaded grid is untouched');
  assert.equal(r.contacts[0].email, 'ann.lee@acme-refining.com');
  assert.equal(r.contacts[0].status, 'In the final list');
  assert.equal(r.contacts[1].email, 'bo.tan@acme-refining.com', 'the colleague’s row is untouched');
  assert.ok(!r.issues.some(i => i.row === 2 && /malformed/.test(i.issue)), 'the row is checked again');
});

test('corrections replay in order: the later one wins', () => {
  const r = run(grid({}), [k(2, 'job_title', 'Accountant'), k(2, 'job_title', 'Control Systems Lead')]);
  assert.equal(r.contacts[0].jobTitle, 'Control Systems Lead');
  assert.equal(r.contacts[0].persona, 'Primary');
});

test('employees and industry change for every row of the account, a merged repeat included, and for no other account', () => {
  const g = grid({}, BO, { first_name: 'Annie', employee_count: '12' }, OTHER_CO);
  const r = run(g, [k(3, 'employee_count', '4200', 'Wrong headcount or size'), k(3, 'industry', 'Oil & Gas – Downstream')]);
  const x = applyCorrections(g, [k(3, 'employee_count', '4200'), k(3, 'industry', 'Oil & Gas – Downstream')]);
  const col = HEADER.indexOf('employee_count');
  assert.deepEqual([2, 3, 4, 5].map(row => x.grid[row - 1][col]), ['4200', '4200', '4200', '900'], 'rows 2–4 are Acme (row 4 a merged repeat of row 2); row 5 is Delta');
  assert.equal(r.accounts[0].employees, 4200);
  assert.equal(r.accounts[0].industry, 'Oil & Gas – Downstream');
  assert.equal(r.accounts[1].employees, 900);
});

test('D-17: confirming managed separately on a held account changes every row and releases the account', () => {
  const g = grid({ managed_separately: '' }, { ...BO, managed_separately: 'maybe' });
  const held = E.processLeads(g);
  assert.equal(held.accounts[0].excluded, true);
  assert.match(held.accounts[0].excludedReason, /Managed status not confirmed/);
  const r = run(g, [k(2, 'managed_separately', 'N', 'Managed status not confirmed')]);
  assert.equal(r.accounts[0].excluded, false);
  assert.ok(r.contacts.every(c => c.status === 'In the final list'));
  assert.equal(run(g, [k(3, 'managed_separately', 'Y')]).accounts[0].excludedReason, 'Managed separately by Client');
});

test('D-17: confirming an opt-out reaches the rows merged into the person, so an unreadable repeat can’t keep it unconfirmed', () => {
  const g = grid({ opt_out: '' }, { first_name: 'Annie', opt_out: 'perhaps' }, BO);
  const before = E.processLeads(g);
  assert.equal(before.contacts[0].optOutUnknown, true);
  assert.equal(E.canContact(before.contacts[0]), false);
  const r = run(g, [k(2, 'opt_out', 'N', 'Opt-out not confirmed')]);
  assert.equal(r.contacts[0].optOutUnknown, false);
  assert.equal(E.canContact(r.contacts[0]), true);
  assert.equal(run(g, [k(2, 'opt_out', 'Y')]).contacts[0].status, 'Not in the list: opted out');
});

test('taken out by a reviewer: shown with the reason, never contactable, never a prospect, and the account loses them as cover', () => {
  const g = grid({}, { ...BO, job_title: 'Buyer' });
  const r = run(g, [k(2, 'take_out', TAKEN_OUT, 'Moved to another company')]);
  const ann = r.contacts[0];
  assert.equal(ann.takenOut, 'Moved to another company');
  assert.equal(ann.status, 'Not in the list (taken out by a reviewer: moved to another company)');
  assert.equal(ann.contactable, false);
  assert.equal(E.canContact(ann), false);
  assert.deepEqual(allowedChannels(ann), [], 'G-007: no channel opens');
  assert.match(recommendChannel({ contact: ann }, 'x').why, /Taken out of the list/);
  assert.equal(r.stats.inFinalList, 1);
  const list = JSON.parse(JSON.stringify({ accounts: r.accounts, contacts: r.contacts }));
  const scored = E.scoreList(list, { signals: [], knockouts: new Map() });
  assert.ok(!buildProspects(scored).some(p => p.c.row === 2), 'not a prospect');
  assert.equal(scored[0].breakdown?.find(b => b.key === 'contacts')?.level, 40, 'no primary persona left: the taken-out manager no longer counts');
  assert.equal(handoffSelection(buildProspects(scored)).items.length, 0);
  const alone = run(grid({}), [k(2, 'take_out', TAKEN_OUT, 'Duplicate person')]);
  assert.equal(alone.accounts[0].excluded, true, 'nobody left: the account fails the knock-out');
  assert.match(alone.accounts[0].excludedReason, /taken out by a reviewer/);
});

test('a person taken out can be put back; a take-out on a merged repeat reaches the person it was merged into', () => {
  const g = grid({}, BO, { first_name: 'Annie' });
  assert.equal(run(g, [k(2, 'take_out', TAKEN_OUT, 'Moved to another company'), k(2, 'take_out', PUT_BACK)]).contacts[0].status, 'In the final list');
  assert.equal(run(g, [k(4, 'take_out', TAKEN_OUT, 'Moved to another company')]).contacts[0].takenOut, 'Moved to another company');
});

test('G-021: a vertical set by a person replaces the lookup’s, with their reason; the last choice wins', () => {
  const g = grid({ industry: 'Specialty widgets' }, BO);
  const held = E.processLeads(g);
  assert.equal(held.accounts[0].needsReview, true);
  const r = run(g, [k(3, 'vertical', 'Gas processing', 'Wrong industry'), k(2, 'vertical', 'Refining', 'Known from the account team')]);
  const a = r.accounts[0];
  assert.deepEqual([a.vertical, a.verticalLevel, a.confidence, a.needsReview], ['Refining', 'core', 'high', false]);
  assert.equal(a.classReason, 'Set by a person: Known from the account team');
  assert.ok(E.VERTICAL_CHOICES.includes('Out of ICP') && E.VERTICAL_CHOICES.includes('Other'));
  assert.equal(E.verticalLevelOf('Out of ICP'), 'other');
});

test('a column the file lacks is added after every column a row uses, and read as that field', () => {
  const header = HEADER.filter(h => h !== 'city');
  const g: E.Grid = [header, [...header.map(h => (BASE as Record<string, string>)[h] ?? ''), 'stray']];
  const x = applyCorrections(g, [k(2, 'city', 'Jurong')]);
  assert.equal(x.grid[0][header.length + 1], 'city', 'after the stray cell, so the stray value is not read as the city');
  assert.equal(E.processLeads(x.grid).contacts[0].city, 'Jurong');
  assert.equal(E.processLeads(applyCorrections(g, [k(2, 'country', 'Malaysia')]).grid).contacts[0].country, 'Malaysia');
});

test('a mapped file is corrected in its own column (G-040 mapping)', () => {
  const g: E.Grid = [HEADER.map(h => (h === 'email' ? 'Work Mail' : h)), HEADER.map(h => (BASE as Record<string, string>)[h] ?? '')];
  const mapping = { 'Work Mail': 'email' };
  const x = applyCorrections(g, [k(2, 'email', 'ann@acme-refining.com')], { mapping });
  assert.equal(x.grid[1][HEADER.indexOf('email')], 'ann@acme-refining.com');
  assert.equal(x.grid[0].length, HEADER.length, 'no column added');
  assert.equal(rowValues(x.grid, [2], mapping).get(2)!.email, 'ann@acme-refining.com');
});

test('the edit form reads each row’s fields as the file has them, corrections included', () => {
  const g = grid({ employee_count: '3,000', opt_out: '' });
  const v = rowValues(applyCorrections(g, [k(2, 'job_title', 'Lead I&C Engineer')]).grid, [2]).get(2)!;
  assert.equal(v.employee_count, '3,000', 'as written, not as read');
  assert.equal(v.job_title, 'Lead I&C Engineer');
  assert.equal(v.opt_out, '');
  assert.equal(v.managed_separately, 'N');
});

test('values are checked before a correction is kept; severity follows the original rule', () => {
  assert.equal(correctionProblem('opt_out', 'maybe'), 'Use Y or N.');
  assert.equal(correctionProblem('email_verified', 'Y'), null);
  assert.match(correctionProblem('vertical', 'Mining')!, /^Choose one of/);
  assert.equal(correctionProblem('email', 'anything at all'), null, 'free text: the checks run again on the row');
  assert.equal(severityOf('job_title', 'Wrong job title'), 'minor');
  assert.equal(severityOf('job_title', 'Moved to another company'), 'major');
  assert.equal(severityOf('email', 'Other'), 'major');
  assert.equal(severityOf('take_out', 'Duplicate person'), 'major');
  assert.equal(severityOf('opt_out', 'Opt-out not confirmed'), 'major');
  assert.equal(severityOf('vertical', 'Wrong industry'), 'minor');
});
