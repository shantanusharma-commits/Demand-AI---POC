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

/* ─── G-005, G-050, D-16: one consent gate, applied wherever someone is picked for outreach ─── */

test('G-005: canContact refuses each suppression reason and accepts a clean contact', async () => {
  const { canContact } = await import('../lib/demandai-engine.ts');
  const cases: [string, Row, boolean][] = [
    ['clean', {}, true],
    ['opted out', { opt_out: 'Y' }, false],
    ['opt-out blank', { opt_out: '' }, false],
    ['opt-out unreadable', { opt_out: 'Unknown' }, false],
    ['no consent basis', { consent_basis: '' }, false],
    ['unrecognised consent basis', { consent_basis: 'Business card' }, false],
    ['no usable channel', { email: '', linkedin_url: '' }, false],
    ['email not verified and no LinkedIn', { email_verified: 'N', linkedin_url: '' }, false],
  ];
  for (const [why, row, want] of cases) {
    const c = leads(row, OTHER).contacts.find(x => x.row === 2)!;
    assert.equal(canContact(c), want, why);
    assert.equal(c.contactable, want, `${why}: contactable agrees`);
  }
});

const SIGNALS = ['company_name', 'contact_email_or_linkedin', 'signal_type', 'event_date', 'detail', 'source', 'product'];

test('G-050 / D-16: a signal with no person goes to someone who can be contacted, never to a suppressed contact', () => {
  // The primary-persona contact has no consent basis; the only contactable person is a secondary persona.
  const r = leads({ consent_basis: '' }, { ...OTHER, job_title: 'Plant Manager' });
  const list = { accounts: r.accounts, contacts: r.contacts };
  const sig = E.processSignals([SIGNALS, ['Acme Refining', '', 'Capital project', '2026-09-01', 'New unit', 'Plan', '']], list, { asOf: '2026-09-30' });
  const s = sig.signals[0];
  assert.equal(s.status, 'Qualified');
  assert.equal(s.contactRow, 3, 'assigned to the contactable colleague');
  assert.match(s.assigned, /^Auto-assigned/);
  const none = leads({ consent_basis: '' }, { ...OTHER, opt_out: '' });
  const sig2 = E.processSignals([SIGNALS, ['Acme Refining', '', 'Capital project', '2026-09-01', 'New unit', 'Plan', '']], { accounts: none.accounts, contacts: none.contacts }, { asOf: '2026-09-30' });
  assert.equal(sig2.signals[0].status, 'Rejected', 'nobody at the account can be contacted');
  assert.match(sig2.signals[0].reason, /no one at this account can be contacted/i);
});

test('G-005: the hand-off takes only prospects who can be contacted and says how many it held back', async () => {
  const { buildProspects, handoffSelection } = await import('../lib/engine/prospects.ts');
  const r = leads({}, { ...OTHER, consent_basis: '' });
  const list = { accounts: r.accounts, contacts: r.contacts };
  const sig = E.processSignals([SIGNALS,
    ['Acme Refining', 'ann.lee@acme-refining.com', 'Inquiry or RFQ', '2026-09-20', 'RFQ', 'CRM', ''],
    ['Acme Refining', 'bo.tan@acme-refining.com', 'Inquiry or RFQ', '2026-09-20', 'RFQ', 'CRM', '']], list, { asOf: '2026-09-30' });
  const prospects = buildProspects(E.scoreList(list, sig));
  assert.equal(prospects.filter(p => p.score !== undefined).length, 2, 'both are scored and stay visible in Scoring');
  const picked = handoffSelection(prospects);
  assert.deepEqual(picked.items.map(p => p.c.row), [2]);
  assert.equal(picked.heldBack, 1);
});

/* ─── D-14 synonyms (provisional v1): country G-016, account type and consent G-042, signal type G-045 ─── */

test('G-016: country codes, long forms, diacritics and known misspellings read as the pilot country, with a note', () => {
  const cases: [string, string][] = [['SG', 'Singapore'], ['Republic of Singapore', 'Singapore'], ['MY', 'Malaysia'], ['Malasia', 'Malaysia'],
    ['TH', 'Thailand'], ['Kingdom of Thailand', 'Thailand'], ['Thai', 'Thailand'], ['PH', 'Philippines'], ['Phillipines', 'Philippines'],
    ['Philippine', 'Philippines'], ['The Philippines', 'Philippines'], ['ID', 'Indonesia'], ['Republic of Indonesia', 'Indonesia'],
    ['VN', 'Vietnam'], ['Viet Nam', 'Vietnam'], ['Việt Nam', 'Vietnam'], ['singapore', 'Singapore']];
  for (const [raw, want] of cases) {
    const r = leads({ country: raw }, OTHER);
    assert.equal(r.accounts[0].country, want, raw);
    assert.equal(r.accounts[0].excluded, false, `${raw} is in the pilot region`);
    if (raw !== want && raw.toLowerCase() !== want.toLowerCase()) assert.ok(r.issues.some(i => i.row === 2 && i.field === 'country' && i.severity === 'info' && i.issue.includes(`read as ${want}`)), raw);
  }
  for (const out of ['India', 'Asia', 'Taiwan']) assert.equal(leads({ country: out }, { ...OTHER, country: out }).accounts[0].excluded, true, out);
});

test('G-042: account-type and consent wordings read through the agreed synonyms; others stay rejected', () => {
  for (const raw of ['Owner operator', 'Owner/Operator', 'Operator', 'End user']) {
    const r = leads({ account_type: raw }, OTHER);
    assert.equal(r.contacts[0].accountType, 'owner-operator', raw);
    assert.ok(r.issues.some(i => i.row === 2 && i.field === 'account_type' && i.severity === 'info' && /read as Owner-operator/.test(i.issue)), raw);
  }
  assert.equal(leads({ account_type: 'SI' }, OTHER).contacts[0].accountType, 'system integrator');
  const optIn = leads({ consent_basis: 'Opt-in' }, OTHER);
  assert.equal(optIn.contacts[0].consentOk, true);
  assert.ok(optIn.issues.some(i => i.row === 2 && i.field === 'consent_basis' && i.severity === 'info' && /read as opted in/i.test(i.issue)));
  for (const raw of ['Business card', 'Trade show', 'Consent', 'Implied', 'Contract']) assert.equal(leads({ consent_basis: raw }, OTHER).contacts[0].consentOk, false, raw);
});

test('G-045: RFQ and Inquiry signals read as "Inquiry or RFQ"; other unknown types stay D3', () => {
  const r = leads({}, OTHER);
  const run = (type: string) => E.processSignals([SIGNALS, ['Acme Refining', 'ann.lee@acme-refining.com', type, '2026-09-20', 'Asked for a quote', 'CRM', '']],
    { accounts: r.accounts, contacts: r.contacts }, { asOf: '2026-09-30' });
  for (const t of ['RFQ', 'Inquiry', 'rfq']) {
    const sig = run(t);
    assert.equal(sig.signals[0].status, 'Qualified', t);
    assert.equal(sig.signals[0].type, 'Inquiry or RFQ', t);
    assert.ok(sig.issues.some(i => i.field === 'signal_type' && i.severity === 'info' && /read as Inquiry or RFQ/.test(i.issue)), t);
  }
  for (const t of ['Demo request', 'Site visit', 'Webinar', 'Price request']) assert.equal(run(t).signals[0].code, 'D3', t);
});
