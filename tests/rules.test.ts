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

/* ─── G-017 account attributes by rule; G-018 / D-17 managed separately fails closed ─── */

test('G-017: account details come from the first non-blank value, not just the first row; differences are flagged', () => {
  const r = leads({ country: '', industry: '', annual_revenue_usd: '', employee_count: '' }, { ...OTHER, country: 'Malaysia', industry: 'Refining', employee_count: '4000' });
  const a = r.accounts[0];
  assert.equal(a.country, 'Malaysia');
  assert.equal(a.excluded, false, 'a blank country on the first row no longer knocks the account out');
  assert.equal(a.industry, 'Refining');
  assert.equal(a.employees, 4000);
  const diff = leads({ country: 'Singapore' }, { ...OTHER, country: 'Malaysia' });
  assert.equal(diff.accounts[0].country, 'Singapore', 'the first value given wins');
  assert.ok(diff.issues.some(i => i.row === 3 && i.field === 'country' && /^Differs from row 2/.test(i.issue)));
});

test('G-018 / D-17: managed separately fails closed: with no readable answer the account is held; Y on any row excludes', () => {
  const held = (rows: Row[]) => { const a = leads(...rows).accounts[0]; return [a.excluded, a.excludedReason] as const; };
  assert.deepEqual(held([{ managed_separately: 'N' }, { ...OTHER, managed_separately: '' }]), [false, ''], 'one N confirms; a blank does not undo it');
  const stray = leads({ managed_separately: 'N' }, { ...OTHER, managed_separately: 'maybe' });
  assert.equal(stray.accounts[0].excluded, false, 'an N on another row confirms the account');
  assert.ok(stray.issues.some(i => i.row === 3 && i.field === 'managed_separately' && /isn't Y or N/.test(i.issue)), 'the unreadable row is still flagged');
  for (const rows of [[{ managed_separately: 'X' }], [{ managed_separately: 'maybe' }, { ...OTHER, managed_separately: '' }],
    [{ managed_separately: '' }, { ...OTHER, managed_separately: '' }]] as Row[][]) {
    const [excluded, why] = held(rows);
    assert.equal(excluded, true, JSON.stringify(rows.map(r => r.managed_separately)));
    assert.match(why, /Managed status not confirmed/);
  }
  const [ex, why] = held([{ managed_separately: 'N' }, { ...OTHER, managed_separately: 'Y' }]);
  assert.equal(ex, true);
  assert.match(why, /Managed separately by Client/);
  assert.ok(leads({ managed_separately: 'N' }, { ...OTHER, managed_separately: 'Y' }).issues.some(i => i.row === 3 && i.field === 'managed_separately'
    && /^Differs from row 2/.test(i.issue) && /Y kept/.test(i.outcome)), 'the Y row is flagged as differing, and Y is kept');
});

/* ─── G-019 email syntax and review flags; G-039 LinkedIn normalisation ─── */

test('G-019: double dots, edge dots, decorations and stray punctuation make an email malformed (not used)', () => {
  for (const bad of ['ann..lee@acme-refining.com', '.ann@acme-refining.com', 'ann.lee@acme-refining.com.', 'ann.lee@acme-refining.com,', 'mailto:ann.lee@acme-refining.com',
    '<ann.lee@acme-refining.com>', 'ann.lee@acme-refining.com;', 'ann.lee@acme..com', 'ann lee@acme-refining.com']) {
    const r = leads({ email: bad }, OTHER);
    const c = r.contacts.find(x => x.row === 2)!;
    assert.equal(c.email, '', bad);
    assert.equal(c.reachableBy, 'LinkedIn', `${bad}: LinkedIn only`);
    assert.ok(r.issues.some(i => i.row === 2 && i.field === 'email' && /is malformed/.test(i.issue)), bad);
  }
});

test('G-019: personal webmail, shared mailboxes, another domain and likely typos are flagged for review, still usable', () => {
  const cases: [string, RegExp][] = [['ann.lee@gmail.com', /personal/], ['ann.lee@yahoo.com.sg', /personal/], ['sales@acme-refining.com', /shared mailbox/],
    ['procurement@acme-refining.com', /shared mailbox/], ['ann.lee@other-company.com', /not the company domain/], ['ann.lee@acme-refning.com', /typo/], ['ann.lee@acme-refining.co', /typo/]];
  for (const [email, re] of cases) {
    const r = leads({ email }, OTHER);
    assert.equal(r.contacts[0].email, email, `${email} stays usable`);
    assert.ok(r.issues.some(i => i.row === 2 && i.field === 'email' && i.severity === 'flag' && re.test(i.issue)), email);
  }
  assert.deepEqual(leads({}, OTHER).issues.filter(i => i.row === 2 && i.field === 'email'), [], 'a clean work address has no email issue');
});

test('G-039: LinkedIn URLs that differ only by country sub-domain, scheme, query or case are the same person', () => {
  const r = leads({ email: '', linkedin_url: 'https://sg.linkedin.com/in/Ann-Lee/' }, { email: '', linkedin_url: 'http://www.linkedin.com/in/ann-lee?trk=public' }, OTHER);
  assert.equal(r.contacts.length, 2, 'the two Ann Lee rows merged');
  assert.ok(r.issues.some(i => i.row === 3 && i.code === 'D5'));
});

test('duplicates: the same malformed address is one person; placeholders like "N/A" never merge two people', () => {
  const same = leads({ email: 'ann.lee@acme-refining..com' }, { email: 'ann.lee@acme-refining..com', first_name: 'Annie' }, OTHER);
  assert.equal(same.contacts.length, 2, 'the two rows with the same malformed address merged');
  const placeholders = leads({ email: 'N/A', linkedin_url: 'https://www.linkedin.com/in/ann-lee' }, { ...OTHER, email: 'N/A' });
  assert.equal(placeholders.contacts.length, 2, 'two people with "N/A" stay two people');
});

test('a signal naming a merged repeat by its own LinkedIn URL reaches the merged person', () => {
  const r = leads({}, { linkedin_url: 'https://www.linkedin.com/in/ann-lee-old', first_name: 'Annie' }, OTHER);
  assert.equal(r.contacts.length, 2);
  const sig = E.processSignals([SIGNALS, ['Acme Refining', 'https://www.linkedin.com/in/ann-lee-old', 'Webinar attended', '2026-09-20', 'Webinar', 'Events', '']],
    { accounts: r.accounts, contacts: r.contacts }, { asOf: '2026-09-30' });
  assert.equal(sig.signals[0].status, 'Qualified');
  assert.equal(sig.signals[0].contactRow, 2);
});

/* ─── D-15 persona dictionary v1 (G-020) and industry mapping v1 with exclusions (G-021), provisional ─── */

test('G-020: instrument and control titles, their abbreviations and local-language titles get a persona', () => {
  const primary = ['Instrument Engineer', 'Senior Instrument Engineer', 'Sr. Instrument Engr', 'Snr Inst Engineer', 'Lead Instr. Eng.', 'Instr. Mgr',
    'Inst. & Ctrl Manager', 'Control Sys. Engr.', 'Sr. Ctrl Sys Engr', 'Ctrl Systems Eng', 'Kỹ sư điều khiển', 'Kepala Instrumentasi', 'ผู้จัดการแผนกเครื่องมือวัด',
    'Head of Instrumentation', 'Automation Head'];
  const secondary = ['Plant Mgr', 'GM - Plant', 'Factory Manager', 'Maint. Mgr.', 'Purchasing Mgr', 'Head - Purchasing', 'Manajer Pengadaan', 'Kepala Pemeliharaan',
    'Kepala Pabrik', 'ผู้จัดการโรงงาน', 'ผู้จัดการฝ่ายซ่อมบำรุง', 'Trưởng phòng bảo trì', 'Plant Manager'];
  for (const t of primary) assert.equal(E.personaOf(t), 'Primary', t);
  for (const t of secondary) assert.equal(E.personaOf(t), 'Secondary', t);
  for (const t of ['HR Manager', 'Finance Manager', 'Institute Director', 'Sales Manager', '']) assert.equal(E.personaOf(t), 'None', t);
});

test('G-021: the v1 industry table maps the agreed industries and site processes; oleochemical and edible-oil refiners are out', () => {
  const cases: [string, string, string, string][] = [
    ['Plastics & Polymers', '', 'Petrochemicals', 'adjacent'], ['Olefins & Polymers', 'Polypropylene production', 'Petrochemicals', 'adjacent'],
    ['Basic Chemicals', 'Aromatics (BTX)', 'Petrochemicals', 'adjacent'], ['Oil & Gas - Downstream', '', 'Refining', 'core'],
    ['Downstream Oil & Gas', 'Residue upgrading', 'Refining', 'core'], ['Fuels & Lubricants', 'Condensate splitting', 'Refining', 'core'],
    ['Natural Gas', '', 'Gas processing', 'adjacent'], ['Midstream Gas', 'Gas separation', 'Gas processing', 'adjacent'],
    ['', 'Hydrocracking', 'Refining', 'core'], ['Oil & Gas - Refining', 'Crude refining', 'Refining', 'core'],
  ];
  for (const [industry, site, vertical, level] of cases) {
    const c = E.classify(industry, site);
    assert.deepEqual([c.vertical, c.level, !!c.needsReview], [vertical, level, false], `${industry} / ${site}`);
  }
  for (const [industry, site] of [['Palm Oil Refining', 'Palm oil refining'], ['Oleochemicals', 'Palm oil refining'], ['Edible Oils', 'Fatty acid distillation'], ['Sugar Refining', '']]) {
    const c = E.classify(industry, site);
    assert.deepEqual([c.level, !!c.needsReview], ['other', false], `${industry}: out of the ICP, no review needed`);
    assert.match(c.reason, /out of the ICP/i);
  }
  assert.equal(E.classify('Mining', '').needsReview, true, 'an unmapped industry still goes to review');
});
