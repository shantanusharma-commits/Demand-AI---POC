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
