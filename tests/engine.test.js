// Golden tests: the worked examples in the Stage_Input_Reasoning_Output sheet, run through the engine.
// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../demandai-engine.js');
const S = require('../demandai-sample-data.js');

function run() {
  const leads = E.processLeads(S.LEADS, { file: S.LEAD_FILE, sheet: 'Lead template' });
  const list = { accounts: leads.accounts, contacts: leads.contacts };
  const sig = E.processSignals(S.SIGNALS, list, { file: S.SIGNAL_FILE, sheet: 'Signal template', asOf: S.SAMPLE_AS_OF });
  const scored = E.scoreList(list, sig);
  const acc = name => scored.find(r => r.account.name === name);
  const signal = id => sig.signals.find(s => s.id === id);
  return { leads, sig, scored, acc, signal };
}

test('stage 1: 18 rows in, duplicate merged, malformed email flagged, 17 clean contacts', () => {
  const { leads } = run();
  assert.equal(leads.stats.rowsRead, 18);
  assert.equal(leads.stats.contacts, 17);
  assert.equal(leads.stats.merged, 1);
  const dup = leads.issues.find(i => i.code === 'D5');
  assert.match(dup.issue, /Rizal Hamid/);
  const kiet = leads.issues.find(i => i.field === 'email' && i.code === 'D3');
  assert.match(kiet.issue, /kiet\.pham@coralbayrefinery/);
  assert.ok(leads.issues.some(i => i.field === 'opt_out' && i.issue === 'Opted out'));
  // The template's format-hint row is not data; the title row is skipped by the header search.
  assert.equal(leads.issues.filter(i => i.severity === 'stop').length, 0);
});

test('stage 3: classification from the mapping table', () => {
  const { leads } = run();
  const a = n => leads.accounts.find(x => x.name === n);
  assert.equal(leads.accounts.length, 12);
  assert.deepEqual([a('Northwind Refining').vertical, a('Northwind Refining').verticalLevel, a('Northwind Refining').confidence], ['Refining', 'core', 'high']);
  assert.equal(a('Meridian Petrochem').verticalLevel, 'adjacent');
  assert.equal(a('Mekong Process Systems').verticalLevel, 'other');
  assert.ok(a('Mekong Process Systems').needsReview);
});

test('stage 4: knock-outs at Prospecting, installed base at Scoring', () => {
  const { leads, acc } = run();
  const a = n => leads.accounts.find(x => x.name === n);
  assert.equal(a('Pacific Rim Fuels').excludedReason, 'Outside the pilot region (Australia)');
  assert.equal(a('Straits Energy').excludedReason, 'Managed separately by Client');
  assert.equal(a('Palm Delta Oleochem').excludedReason, 'No contactable contacts after suppression');
  assert.equal(leads.stats.accountsPass, 9);
  assert.match(acc('Sunda Refining').excludedReason, /Pilot product already installed/);
});

test('stage 6: weighted fit matches the worked example', () => {
  const { acc } = run();
  assert.equal(acc('Northwind Refining').fit, 91);
  assert.equal(acc('Meridian Petrochem').fit, 66);
  assert.equal(acc('Borneo Gas Processing').fit, 60);
  assert.equal(acc('Harbourline EPC').fit, 34);
  assert.equal(acc('Lotus Chemicals').fit, 32);
  assert.equal(acc('Mekong Process Systems').fit, 24);
  for (const n of ['Harbourline EPC', 'Lotus Chemicals', 'Mekong Process Systems']) assert.equal(acc(n).tier, 'Below fit floor');
});

test('stage 7: 21 events, 13 qualified, 6 rejected with the right codes, 2 not used or knock-out', () => {
  const { sig, signal } = run();
  const count = st => sig.signals.filter(s => s.status === st).length;
  assert.equal(sig.signals.length, 21);
  assert.equal(count('Qualified'), 13);
  assert.equal(count('Rejected'), 6);
  assert.equal(count('Not used') + count('Used for a knock-out'), 2);
  assert.deepEqual(['SIG-10', 'SIG-15', 'SIG-16', 'SIG-18', 'SIG-20', 'SIG-21'].map(id => signal(id).code), ['D5', 'D1', 'D2', 'D3', 'D4', 'D4']);
  assert.equal(signal('SIG-16').age, 332);
  assert.equal(signal('SIG-12').status, 'Used for a knock-out');
  assert.equal(signal('SIG-19').status, 'Not used');
  assert.equal(E.round1(signal('SIG-02').weight), 21.5);   // Wei Lim's leadership change: 60 × 0.75 × 0.478
  assert.equal(Math.round(signal('SIG-02').decay * 1000) / 1000, 0.478);
  assert.equal(signal('SIG-11').personName, 'Maria Santos'); // no person given: auto-assigned
  assert.equal(E.round1(signal('SIG-11').weight), 73.6);
  assert.deepEqual(sig.suggested.map(s => s.person), ['k.tan@northwindrefining.com']);
});

test('stage 8: person scores, account timing, rank and tier (raw values match the stage sheet)', () => {
  const { acc } = run();
  const nw = acc('Northwind Refining');
  assert.deepEqual(nw.people.map(p => [p.contact.name, p.raw]), [['Aditi Rao', 145.7], ['Wei Lim', 70.8]]);
  assert.equal(nw.timingRaw, 159.2);
  assert.equal(nw.rank, 144.9);
  assert.equal(nw.tier, 'A');
  assert.match(nw.whyNow, /^Aditi Rao: asked about migrating a legacy control system during the 2027 turnaround; also Aditi Rao: new crude unit/);
  const mp = acc('Meridian Petrochem');
  assert.deepEqual(mp.people.map(p => [p.contact.name, p.raw]), [['Hassan Idris', 100], ['Farah Aziz', 89.4]]);
  assert.equal(mp.rank, 95.5);
  assert.equal(mp.tier, 'A');
  assert.equal(mp.confidence, 'low'); // no primary-persona contact
});

test('scores are normalised to 0–100 and tiers are unchanged by it', () => {
  const { scored, acc } = run();
  const nw = acc('Northwind Refining');
  assert.equal(nw.timing, 79.6);          // 159.2 of a possible 200
  assert.equal(nw.score, 72.4);           // 91 × 79.6 ÷ 100 = rank ÷ 2
  assert.deepEqual(nw.people.map(p => p.score), [72.9, 35.4]);
  // Per prospect: account fit × their own timing
  assert.deepEqual(nw.people.map(p => [p.contact.name, p.final, p.tier]), [['Aditi Rao', 66.3, 'A'], ['Wei Lim', 32.2, 'B']]);
  for (const r of scored.filter(r => r.score !== undefined)) {
    assert.ok(r.score >= 0 && r.score <= 100 && r.timing <= 100);
    assert.equal(r.tier, r.rank >= 70 ? 'A' : r.rank >= 40 ? 'B' : 'C');
  }
});

test('decay is full until F, then a straight line to zero at D', () => {
  const t = E.CONFIG.signalTypes['Leadership change'];
  assert.equal(E.decayFactor(t, 30), 1);
  assert.equal(E.decayFactor(t, 75), 0.5);
  assert.equal(E.decayFactor(t, 120), 0);
});

test('stacking: strongest first, each next one counts half as much', () => {
  assert.equal(E.stack([22.8, 100, 80]), 100 + 40 + 5.7);
});

test('a CSV with quoted commas reads the same as the grid', () => {
  const csv = E.toCSV(S.LEADS);
  const back = E.parseCSV(csv);
  assert.deepEqual(back.slice(1).map(r => r.length), S.LEADS.slice(1).map(r => r.length));
  assert.equal(E.processLeads(back).stats.contacts, 17);
});

test('every row issue carries file, sheet, row, issue, outcome and fix', () => {
  const { leads, sig } = run();
  for (const i of [...leads.issues, ...sig.issues]) {
    for (const k of ['file', 'sheet', 'row', 'field', 'issue', 'outcome', 'code', 'fix', 'severity']) assert.ok(i[k] !== undefined && i[k] !== '', `${k} missing on ${JSON.stringify(i)}`);
  }
});

test('missing required columns are reported once, not per row', () => {
  const grid = [['first_name', 'company_name'], ['Ann', 'Acme Refining']];
  const r = E.processLeads(grid, { file: 'x.csv', sheet: 'Sheet1' });
  assert.equal(r.issues.filter(i => /Required column "country"/.test(i.issue)).length, 1);
  assert.equal(r.issues.filter(i => i.field === 'country' && i.row === 2).length, 0);
});

// ─── Stage 9: micro-segments ───
// A small synthetic set so each rule can be checked on its own.
function fake(id, sigs, opts = {}) {
  const contact = { row: 2, name: `Person ${id}`, firstName: 'Pat', email: opts.email === undefined ? `p@${id}.com` : opts.email,
    emailVerified: opts.email !== '', linkedin: opts.linkedin || '' };
  const signals = sigs.map(([type, weight]) => ({ type, weight, detail: '' }));
  return { account: { id, name: `Account ${id}` }, signalCount: signals.length, confidence: 'high',
    people: [{ contact, signals, final: 50 }] };
}

test('micro-segments: three distinct accounts on the strongest signal form a segment', () => {
  const r = E.buildSegments([fake('a', [['Inquiry or RFQ', 100]]), fake('b', [['Inquiry or RFQ', 90]]), fake('c', [['Inquiry or RFQ', 80]])]);
  assert.deepEqual(r.segments.map(s => [s.name, s.accountIds.length]), [['Inquiry', 3]]);
  assert.equal(r.exceptions.length, 0);
  assert.ok(r.recs.every(x => !x.fallback));
});

test('micro-segments: fewer than three accounts on a signal → grouped on the next signal, runner-up is the strongest signal offering', () => {
  const r = E.buildSegments([
    fake('a', [['Inquiry or RFQ', 100], ['Webinar attended', 40]]),
    fake('b', [['Webinar attended', 60]]),
    fake('c', [['Content download', 50]]),
  ]);
  assert.deepEqual(r.segments.map(s => [s.name, s.accountIds.sort()]), [['Engagement', ['a', 'b', 'c']]]);
  const a = r.recs.find(x => x.account.id === 'a');
  assert.equal(a.prominent, 'Inquiry');
  assert.equal(a.fallback, true);
  assert.equal(a.groupedOn.type, 'Webinar attended');
  assert.equal(a.runnerUp.action, E.CONFIG.segmentLibrary.Inquiry[0]);
  assert.ok(a.runnerUp.fromStrongest);
  assert.match(a.runnerUp.reason, /strongest signal is Inquiry or RFQ \(Inquiry\), but fewer than 3 accounts share it/);
});

test('micro-segments: no account is in two segments, and leftovers are exceptions', () => {
  const r = E.buildSegments([
    fake('a', [['Inquiry or RFQ', 100], ['Capital project', 70]]),
    fake('b', [['Inquiry or RFQ', 95], ['Capital project', 70]]),
    fake('c', [['Inquiry or RFQ', 90]]),
    fake('d', [['Capital project', 80]]),
    fake('e', [['Leadership change', 30]]),
  ]);
  const ids = r.segments.flatMap(s => s.accountIds);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(r.segments.map(s => s.name), ['Inquiry']);
  assert.deepEqual(r.exceptions.map(x => x.account.id), ['d', 'e']);
  assert.match(r.exceptions[0].exception, /No micro-segment/);
});

test('micro-segments on the sample: every scored account placed once, all prospects get an action', () => {
  const { sig, leads } = run();
  const scored = E.scoreList({ accounts: leads.accounts, contacts: leads.contacts }, sig);
  const r = E.buildSegments(scored);
  const ids = r.segments.flatMap(s => s.accountIds);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length + new Set(r.exceptions.map(x => x.account.id)).size, r.accountsConsidered);
  assert.ok(r.segments.every(s => s.accountIds.length >= 3));
  assert.ok(r.recs.every(x => x.action && x.signal));
});

test('drafts follow the outreach rules: short subject, short body, interest question, LinkedIn note under 200', () => {
  const { sig, leads } = run();
  const r = E.buildSegments(E.scoreList({ accounts: leads.accounts, contacts: leads.contacts }, sig));
  for (const rec of r.recs) for (const action of [rec.action, rec.runnerUp && rec.runnerUp.action].filter(Boolean)) {
    const d = E.draftFor(rec, action);
    if (d.channel === 'Email') {
      assert.ok(d.subject.split(/\s+/).length <= 4, d.subject);
      assert.ok(d.words <= 90, `${d.words} words`);
      assert.match(d.body, /\?\n/);
      assert.match(d.body, /Client Team$/); // the client appears only as "Client"
    }
    if (d.channel === 'LinkedIn') {
      assert.ok(d.note.length <= 200);
      assert.doesNotMatch(d.note, /\?$/);
    }
  }
  // Farah Aziz has no verified email but a LinkedIn URL
  const meridian = r.recs.find(x => x.account.name === 'Meridian Petrochem');
  const farah = meridian.result.people.find(p => p.contact.name === 'Farah Aziz').contact;
  assert.equal(E.recommendChannel({ ...meridian, contact: farah }, meridian.action).channel, 'LinkedIn');
});

test('channel rules: email or LinkedIn only, hard limits on both, consent required, otherwise held for a person', () => {
  const rec = { contact: { name: 'Pat Lee', email: 'p@x.com', emailVerified: true, linkedin: 'https://linkedin.com/in/p', consentOk: true } };
  assert.equal(E.recommendChannel(rec, 'Call to follow up on the inquiry').channel, 'Email');
  assert.equal(E.recommendChannel(rec, 'Offer a renewal review').channel, 'Email');
  assert.equal(E.recommendChannel({ contact: { ...rec.contact, emailVerified: false } }, 'Offer a site assessment').channel, 'LinkedIn');
  const noConsent = E.recommendChannel({ contact: { ...rec.contact, consentOk: false } }, 'Offer a site assessment');
  assert.deepEqual([noConsent.channel, noConsent.unreachable], ['Email', true]);
  assert.equal(E.recommendChannel({ contact: { name: 'Pat Lee' } }, 'Offer a site assessment').unreachable, true);
});

function sampleRecs(opts) {
  const { sig, leads } = run();
  return E.buildSegments(E.scoreList({ accounts: leads.accounts, contacts: leads.contacts }, sig), opts);
}

test('drafts cite one approved proof point and pass the brand and claim checks', () => {
  const r = sampleRecs();
  const rec = r.recs.find(x => x.contact.name === 'Aditi Rao');
  const d = E.draftFor(rec, rec.action, { asOf: S.SAMPLE_AS_OF });
  assert.equal(d.channel, 'Email');
  assert.match(d.body, /\[Webinar recording, 2026\]/);
  const chk = E.checkDraft(d);
  assert.deepEqual([chk.flags.length, chk.claims.length, chk.unsupported.length], [0, 1, 0]);
  assert.match(E.confidenceFor(rec, d, chk).reason, /1 of 1 claim verified, no open flags/);
});

test('no approved proof for the case: the draft goes out without a proof line, and says so', () => {
  const r = sampleRecs();
  const rec = r.recs[0];
  // Leadership's only item expired on 2026-06-30
  const d = E.draftFor(rec, 'Share a peer case study from their sector', { asOf: S.SAMPLE_AS_OF });
  assert.ok(['Email', 'LinkedIn'].includes(d.channel));
  assert.ok(d.noProof);
  assert.doesNotMatch(d.body || d.note, /\[[^\]]+, \d{4}\]/);
});

test('LinkedIn is one connection note, no follow-up message', () => {
  const r = sampleRecs();
  const rec = r.recs[0];
  const d = E.draftFor({ ...rec, contact: { ...rec.contact, emailVerified: false, linkedin: 'https://linkedin.com/in/x', consentOk: true } }, rec.action, { asOf: S.SAMPLE_AS_OF });
  assert.equal(d.channel, 'LinkedIn');
  assert.ok(d.note.length <= 200);
  assert.equal(d.message, undefined);
});

test('brand checks and claim verification catch an edited draft', () => {
  const r = sampleRecs();
  const rec = r.recs.find(x => x.contact.name === 'Aditi Rao');
  const d = E.draftFor(rec, rec.action, { asOf: S.SAMPLE_AS_OF });
  const edited = { ...d, body: d.body.replace('Worth a short conversation?', 'We guarantee 30% less downtime at a discount. Worth a short conversation?') };
  const chk = E.checkDraft(edited);
  assert.ok(chk.flags.some(f => f.rule === 'Banned claim'));
  assert.ok(chk.flags.some(f => f.rule === 'Pricing or commercial terms'));
  assert.equal(chk.unsupported.length, 1);
  assert.equal(E.confidenceFor(rec, edited, chk).level, 'Low');
});

test('engage-once: an account already recommended in the pilot is set aside as a process rule', () => {
  const r = sampleRecs({ engaged: new Map([['northwind refining', 'Earlier list']]) });
  assert.ok(!r.recs.some(x => x.account.name === 'Northwind Refining'));
  assert.deepEqual(r.engagedOnce.map(x => [x.account.name, x.label]), [['Northwind Refining', 'Earlier list']]);
});

test('micro-segments from an uploaded file: prospects with their signals, score optional', () => {
  const g = [E.SEGMENT_COLUMNS,
    ['Aditi', 'Rao', 'Head of Instrumentation', 'aditi@nw.com', 'Y', '', 'Northwind Refining', 'Refining', 'Singapore', 'N', 'Legitimate interest', '72', 'Inquiry or RFQ', '2026-09-20', 'Asked about migration', ''],
    ['Wei', 'Lim', 'Plant Manager', 'wei@nw.com', 'Y', '', 'Northwind Refining', 'Refining', 'Singapore', 'N', 'Legitimate interest', '', 'Webinar attended', '2026-09-10', 'Modernising legacy control systems', ''],
    ['Wei', 'Lim', 'Plant Manager', 'wei@nw.com', 'Y', '', 'Northwind Refining', 'Refining', 'Singapore', 'N', 'Legitimate interest', '', 'Webinar attended', '2026-09-10', 'Modernising legacy control systems', ''],
    ['Ann', 'Lee', 'Engineer', 'ann@acme.com', 'Y', '', 'Acme', 'Petrochemicals', 'Thailand', 'Y', 'Opted in', '', 'Bogus', '2026-09-10', '', ''],
  ];
  const r = E.processScoredProspects(g, { asOf: '2026-09-30' });
  assert.deepEqual(r.stats, { rowsRead: 4, rejected: 2, prospects: 2, accounts: 1 });
  const nw = r.results[0];
  assert.deepEqual(nw.people.map(p => [p.contact.name, p.final, p.scoreFrom]), [['Aditi Rao', 72, 'file'], ['Wei Lim', 30, 'signals']]);
  // One recommendation per account, to the person with the strongest signals
  assert.deepEqual(E.buildSegments(r.results).recs.map(x => x.contact.name), ['Aditi Rao']);
});

test('one recommendation per account, to the contact with the strongest signals', () => {
  const r = sampleRecs();
  const ids = r.recs.map(x => x.account.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(r.recs.find(x => x.account.name === 'Northwind Refining').contact.name, 'Aditi Rao');
  assert.equal(r.recs.find(x => x.account.name === 'Meridian Petrochem').contact.name, 'Hassan Idris');
});

test('content touching an incident, security or regulation is flagged as sensitive', () => {
  for (const t of ['after the incident at the plant', 'our cybersecurity review', 'the new emissions regulation']) {
    assert.ok(E.checkDraft({ channel: 'Email', subject: 'hello', body: `Hi, about ${t}. Worth a chat?` }).flags.some(f => f.rule === 'Sensitive term'), t);
  }
});

test('deal size: estimated from vertical, size and account type; below the threshold is flagged', () => {
  const r = sampleRecs();
  const nw = r.recs.find(x => x.account.name === 'Northwind Refining'), mp = r.recs.find(x => x.account.name === 'Meridian Petrochem');
  assert.deepEqual([E.estimateDealSize(nw.account).value, E.estimateDealSize(nw.account).below], [600000, false]);
  assert.deepEqual([E.estimateDealSize(mp.account).value, E.estimateDealSize(mp.account).below], [210000, true]);
  assert.equal(E.estimateDealSize({ name: 'x' }), null); // nothing to go on: the rule isn't applied
});

test('a draft that fails a brand or rule check is regenerated once without the source wording', () => {
  const r = sampleRecs();
  const ap = r.recs.find(x => x.account.name === 'Andaman Petroleum');
  const first = E.draftFor(ap, ap.action, { asOf: S.SAMPLE_AS_OF });
  assert.ok(E.checkDraft(first).flags.some(f => f.rule === 'Pricing or commercial terms'));
  const again = E.draftFor(ap, ap.action, { asOf: S.SAMPLE_AS_OF, variant: 'clean' });
  assert.equal(E.checkDraft(again).flags.length, 0);
});

/* ─── The NBA test-scenario set: every account does what its scenario says ─── */
function scenarios() {
  const asOf = '2026-10-05';
  const file = E.processScoredProspects(S.nbaScenarioGrid(asOf), { asOf });
  const seg = E.buildSegments(file.results);
  const rec = n => seg.recs.find(x => x.account.name.startsWith(n));
  const draft = (n, extra = {}) => { const r = rec(n); return E.draftFor(r, r.action, { asOf, ...extra }); };
  return { asOf, file, seg, rec, draft };
}

test('scenarios: data errors are caught, one recommendation per account', () => {
  const { file, seg } = scenarios();
  assert.deepEqual(file.stats, { rowsRead: 20, rejected: 5, prospects: 13, accounts: 12 });
  assert.deepEqual(file.issues.filter(i => i.outcome === 'Signal not used').map(i => i.code).sort(), ['D1', 'D2', 'D3', 'D3', 'D5']);
  assert.equal(seg.recs.length, 12);
});

test('scenarios: three micro-segments, a fallback and two accounts with no micro-segment', () => {
  const { seg, rec } = scenarios();
  const names = g => g.recs.map(x => x.account.name.split(' ')[0]).sort();
  assert.deepEqual(Object.fromEntries(seg.segments.map(g => [g.name, names(g)])), {
    Modernisation: ['Aurora', 'Bluewater', 'Cedar'], Inquiry: ['Harbor', 'Ironwood', 'Juniper'], Engagement: ['Delta', 'Eastgate', 'Fernhill', 'Granite'] });
  assert.deepEqual(seg.exceptions.map(x => x.account.name.split(' ')[0]).sort(), ['Kingfisher', 'Lantern']);
  const delta = rec('Delta');
  assert.ok(delta.fallback);
  assert.equal(delta.runnerUp.action, 'Offer a renewal review');
  assert.equal(rec('Aurora').contact.name, 'Niran Wattana');
});

test('scenarios: channels, tasks and proof', () => {
  const { draft } = scenarios();
  assert.deepEqual(['Aurora', 'Eastgate', 'Cedar', 'Lantern', 'Harbor', 'Juniper'].map(n => draft(n).channel), ['Email', 'LinkedIn', 'Email', 'Email', 'Email', 'Email']);
  assert.deepEqual(['Cedar', 'Lantern', 'Juniper'].map(n => draft(n).unreachable), [true, true, true]);
  assert.ok(draft('Kingfisher').noProof);
});

test('scenarios: each exception rule is triggered by its account, and only there', () => {
  const { rec, draft, seg } = scenarios();
  const sensitive = n => E.checkDraft(draft(n)).flags.some(f => f.rule === 'Sensitive term');
  const brand = n => E.checkDraft(draft(n)).flags.filter(f => f.rule !== 'Sensitive term').length > 0;
  assert.deepEqual(seg.recs.filter(r => r.result.confidence === 'low').map(r => r.account.name), ['Cedar Petrochemicals']);
  assert.deepEqual(seg.recs.filter(r => E.estimateDealSize(r.account).below).map(r => r.account.name), ['Granite Gas Processing']);
  assert.deepEqual(seg.recs.filter(r => sensitive(r.account.name)).map(r => r.account.name), ['Ironwood Refining']);
  assert.deepEqual(seg.recs.filter(r => brand(r.account.name)).map(r => r.account.name), ['Fernhill Refining']);
  assert.equal(E.checkDraft(draft('Fernhill', { variant: 'clean' })).flags.length, 0); // regenerated once, then passes
  assert.ok(rec('Bluewater').contact.linkedin && rec('Bluewater').contact.emailVerified); // a next channel to fall back to
  assert.equal(rec('Aurora').result.people.length, 2); // a next contact to fall back to
});

test('the configuration version says the scoring weights are fixed in the POC', () => {
  assert.equal(E.configVersion(), 'Config v1 · starting values · scoring weights fixed');
});

// Keep this last: it publishes a brand pack into a stand-in browser store, which the engine then keeps using.
test('a published brand pack changes the drafts and the checks', () => {
  const store = {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const d = E.brandDraft();
  d.voice.preset = 'Formal'; d.voice.signoff = 'Client Sales';
  d.negative.push('synergy'); d.competitors.push('Rivalco');
  d.claims = d.claims.filter(c => c.id !== 'WB-05');
  assert.ok(E.saveBrandDraft(d));
  assert.equal(E.brandVersion(), 'Brand v1');      // a draft isn't live until it's published
  assert.ok(E.publishBrand('Admin', 'Formal voice'));
  assert.equal(E.brandVersion(), 'Brand v2');
  const r = sampleRecs(), rec = r.recs.find(x => x.contact.name === 'Aditi Rao');
  const draft = E.draftFor(rec, rec.action, { asOf: S.SAMPLE_AS_OF });
  assert.match(draft.body, /^Dear Aditi,/);
  assert.match(draft.body, /Kind regards,\nClient Sales$/);
  assert.doesNotMatch(draft.body, /Webinar recording/);   // the withdrawn claim is no longer cited
  const flags = E.checkDraft({ ...draft, body: draft.body.replace('Kind regards', 'Great synergy with Rivalco! Kind regards') }).flags.map(f => f.rule);
  assert.ok(flags.includes('Banned claim') && flags.includes('Competitor name') && flags.includes('Tone of voice'));
  E.useBrand('Brand v1');                               // a list built with v1 keeps drafting with v1
  assert.match(E.draftFor(rec, rec.action, { asOf: S.SAMPLE_AS_OF }).body, /^Hi Aditi,/);
  E.useBrand();
  assert.equal(E.brandVersion(), 'Brand v2');
  delete global.localStorage;
});

test('a signal switched off in Setup is not scored in new runs, and the switch is audited', () => {
  const store = {};
  global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const L = E.processLeads(S.LEADS, { file: 'l', sheet: 's' }), list = () => ({ accounts: L.accounts, contacts: JSON.parse(JSON.stringify(L.contacts)) });
  assert.ok(E.setSignal('Leadership change', false, 'Rajiv Nair', 'Legal hold'));
  assert.deepEqual(E.signalsOff(), ['Leadership change']);
  const sig = E.processSignals(S.SIGNALS, list(), { asOf: S.SAMPLE_AS_OF, off: E.signalsOff() });
  const off = sig.signals.filter(s => s.code === 'OFF');
  assert.ok(off.length > 0 && off.every(s => s.type === 'Leadership change' && s.status === 'Rejected'));
  assert.ok(sig.issues.some(i => i.code === 'OFF'));
  E.setSignal('Leadership change', true, 'Rajiv Nair', 'Cleared');
  assert.deepEqual(E.signalsOff(), []);
  const audit = E.signalAudit('Leadership change');
  assert.equal(audit.length, 2);
  assert.equal(audit.find(a => !a.on).reason, 'Legal hold');
  delete global.localStorage;
});

test('a signal type added in Setup is scored in new runs only', () => {
  const store = {};
  global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const L = E.processLeads(S.LEADS, { file: 'l', sheet: 's' }), list = () => ({ accounts: L.accounts, contacts: JSON.parse(JSON.stringify(L.contacts)) });
  const grid = S.SIGNALS.concat([['Northwind Refining', 'aditi.rao@northwindrefining.com', 'Trade show visit', '2026-09-20', 'Visited the stand', 'Events team', '']]);
  assert.ok(E.addSignal({ name: 'Trade show visit', segment: 'Nope', full: 30, zero: 120 }).error);
  assert.ok(E.addSignal({ name: 'Trade show visit', segment: 'Engagement', level: 'Light', full: 30, zero: 120 }, 'Rajiv Nair').ok);
  assert.ok(E.addSignal({ name: 'trade show visit', segment: 'Engagement', full: 30, zero: 120 }).error);   // no duplicates
  const old = E.processSignals(grid, list(), { asOf: S.SAMPLE_AS_OF });                                   // a run built before it was added
  assert.equal(old.signals.find(s => s.type === 'Trade show visit').code, 'D3');
  const now = E.processSignals(grid, list(), { asOf: S.SAMPLE_AS_OF, custom: E.customSignals().map(c => c.name) });
  const t = now.signals.find(s => s.type === 'Trade show visit');
  assert.equal(t.status, 'Qualified'); assert.equal(t.segment, 'Engagement'); assert.equal(t.tier, 30);
  assert.ok(E.removeSignal('Trade show visit', 'Rajiv Nair'));
  assert.equal(E.CONFIG.signalTypes['Trade show visit'], undefined);
  assert.deepEqual(E.signalAudit('Trade show visit').map(a => a.added ? 'added' : a.removed ? 'removed' : '?').sort(), ['added', 'removed']);
  delete global.localStorage;
});
