// Data-quality rules fixed in Phase 4b, one named test per rule (plan §9 item 1). Rows are fictional and built here;
// the answer-key test measures the same rules on the full sample.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../lib/demandai-engine.ts';

const HEADER = E.LEAD_COLUMNS;
type Row = Partial<Record<(typeof E.LEAD_COLUMNS)[number], string>>;
const BASE: Row = {
  first_name: 'Ann', last_name: 'Lee', job_title: 'Instrumentation Manager', email: 'ann.lee@acme-refining.com', email_verified: 'Y',
  linkedin_url: 'https://www.linkedin.com/in/ann-lee', company_name: 'Acme Refining', company_domain: 'acme-refining.com', country: 'Singapore',
  industry: 'Refining', annual_revenue_usd: '2000000000', employee_count: '3000', account_type: 'Owner-operator', existing_customer: 'N',
  managed_separately: 'N', consent_basis: 'Legitimate interest', opt_out: 'N', owner_email: 'rep@client.example',
};
// A colleague at the same company, so the account keeps a contact when the first person is suppressed.
const OTHER: Row = { first_name: 'Bo', email: 'bo.tan@acme-refining.com', linkedin_url: 'https://www.linkedin.com/in/bo-tan' };
const grid = (...rows: Row[]) => [HEADER, ...rows.map(r => HEADER.map(h => ({ ...BASE, ...r })[h] ?? ''))];
const leads = (...rows: Row[]) => E.processLeads(grid(...rows), { file: 'f.csv', sheet: 'Sheet1' });

/* ─── N-01, G-060, G-037: validate every row, then merge ─── */

test('N-01: an opt-out on the repeated row wins, whichever row comes first, and the conflict is flagged', () => {
  for (const [first, second] of [['N', 'Y'], ['Y', 'N']]) {
    const r = leads({ opt_out: first }, { opt_out: second, first_name: 'Annie' }, OTHER);
    assert.equal(r.contacts.length, 2, 'the repeat merged; the colleague stays');
    const c = r.contacts[0];
    assert.equal(c.optOut, true, `${first} then ${second}: opted out`);
    assert.equal(c.contactable, false);
    assert.equal(c.status, 'Not in the list: opted out');
    assert.ok(r.issues.some(i => i.field === 'opt_out' && /differ/i.test(i.issue) && i.severity === 'flag'), `${first} then ${second}: conflict flagged`);
  }
});

test('G-060: a row that is opted out but says opted in is suppressed and the contradiction flagged', () => {
  const r = leads({ opt_out: 'Y', consent_basis: 'Opted in' }, OTHER);
  assert.equal(r.contacts[0].optOut, true);
  assert.ok(r.issues.some(i => i.row === 2 && i.field === 'opt_out' && i.severity === 'flag' && /says opted in/.test(i.issue)));
});

test('N-01: an unreadable opt-out on either duplicate row fails closed (not contactable); blank never confirms', () => {
  for (const [first, second] of [['N', 'maybe'], ['maybe', 'N']]) {
    const c = leads({ opt_out: first }, { opt_out: second }).contacts[0];
    assert.equal(c.optOut, false);
    assert.equal(c.optOutUnknown, true, `${first} then ${second}`);
    assert.equal(c.contactable, false);
  }
  // A blank on the repeat doesn't undo a confirmed N.
  assert.equal(leads({ opt_out: 'N' }, { opt_out: '' }).contacts[0].contactable, true);
});

test('G-037: a duplicate row is checked like any other row before it is merged', () => {
  const r = leads({}, { country: '', industry: '', owner_email: 'not-an-email', consent_basis: 'Business card' });
  const rowIssues = (row: number) => r.issues.filter(i => i.row === row).map(i => i.field);
  for (const f of ['country', 'industry', 'owner_email', 'consent_basis']) assert.ok(rowIssues(3).includes(f), `row 3 ${f} flagged`);
});

test('G-037: managed separately = Y on a duplicate row reaches the account', () => {
  const r = leads({}, { managed_separately: 'Y' });
  assert.equal(r.accounts[0].excluded, true);
  assert.match(r.accounts[0].excludedReason, /Managed separately/);
});

test('G-037: company details that differ between duplicate rows are flagged; name and persona follow the merge', () => {
  const r = leads({ job_title: '' }, { country: 'Malaysia', job_title: 'Instrumentation Engineer' });
  assert.ok(r.issues.some(i => i.row === 3 && i.field === 'country' && /^Differs from row 2/.test(i.issue)));
  assert.equal(r.contacts[0].jobTitle, 'Instrumentation Engineer');
  assert.equal(r.contacts[0].persona, 'Primary', 'persona recomputed after the merge filled the title');
});
