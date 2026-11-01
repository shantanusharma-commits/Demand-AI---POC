// Runs the POC test sets through legacy/demandai-engine.js and writes what the engine produces, for the answer keys.
// Usage: node run_engine.js <inputs.json> <results.json>
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'legacy', 'demandai-engine.js'));
const inp = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const asOf = inp.asOf;
const out = {};

// TS1: leads → signals → scores → segments
const g1 = [inp.leadCols, ...inp.ts1];
const L1 = E.processLeads(g1, { file: 'TS1', sheet: 'Lead template' });
const list1 = { accounts: L1.accounts, contacts: L1.contacts };
const S1 = E.processSignals([inp.sigCols, ...inp.ts1sig], list1, { file: 'TS1 signals', sheet: 'Signal template', asOf });
const R1 = E.scoreList(list1, S1);
const G1 = E.buildSegments(R1);
const segOf = new Map();
(G1.segments || []).forEach(s => s.accountIds.forEach(id => segOf.set(id, s.name)));
const recOf = new Map((G1.recommendations || G1.recs || []).map(r => [r.account.id, r]));
out.ts1 = {
  stats: L1.stats, issues: L1.issues.map(i => ({ row: i.row, field: i.field, code: i.code, severity: i.severity, issue: i.issue })),
  accounts: R1.map(r => ({ name: r.account.name, vertical: r.account.vertical, level: r.account.verticalLevel, excluded: r.excluded, excludedReason: r.excludedReason,
    fit: r.fit, timing: r.timing, score: r.score, tier: r.tier, signals: r.signalCount || 0, confidence: r.confidence || '', segment: segOf.get(r.account.id) || '',
    action: (recOf.get(r.account.id) || {}).action || '', exception: (recOf.get(r.account.id) || {}).exception || '', runnerUp: ((recOf.get(r.account.id) || {}).runnerUp || {}).action || '' })),
  signals: S1.signals.map(s => ({ row: s.row, company: s.company, type: s.type, status: s.status, code: s.code, age: s.age, weight: s.weight })),
  segments: (G1.segments || []).map(s => ({ name: s.name, n: s.accountIds.length })),
  segKeys: Object.keys(G1),
};

// TS2: prospecting edge cases
const L2 = E.processLeads([inp.leadCols, ...inp.ts2.map(x => x[0])], { file: 'TS2', sheet: 'Lead template' });
out.ts2 = { stats: L2.stats,
  issues: L2.issues.map(i => ({ row: i.row, field: i.field, code: i.code, severity: i.severity, issue: i.issue, outcome: i.outcome })),
  contacts: L2.contacts.map(c => ({ row: c.row, name: c.name, status: c.status, reachableBy: c.reachableBy, contactable: c.contactable })),
  accounts: L2.accounts.map(a => ({ name: a.name, excluded: a.excluded, excludedReason: a.excludedReason, vertical: a.vertical, confidence: a.confidence, needsReview: a.needsReview })) };

// TS3: signal edge cases against the TS1 list
const S3 = E.processSignals([inp.sigCols, ...inp.ts3.map(x => x[0])], list1, { file: 'TS3', sheet: 'Signal template', asOf });
out.ts3 = { signals: S3.signals.map(s => ({ row: s.row, company: s.company, type: s.type, status: s.status, code: s.code, reason: s.reason, assigned: s.assigned })),
  suggested: S3.suggested, knockouts: [...S3.knockouts.entries()] };

// TS4: direct scored-prospects file into Micro-segments
const P4 = E.processScoredProspects([inp.segCols, ...inp.ts4.map(x => x[0])], { file: 'TS4', sheet: 'Signal template', asOf });
const G4 = E.buildSegments(P4.results);
const seg4 = new Map(); (G4.segments || []).forEach(s => s.accountIds.forEach(id => seg4.set(id, s.name)));
const rec4 = new Map((G4.recommendations || G4.recs || []).map(r => [r.account.id, r]));
out.ts4 = { stats: P4.stats, issues: P4.issues.map(i => ({ row: i.row, field: i.field, code: i.code, issue: i.issue, outcome: i.outcome })),
  accounts: P4.results.map(r => ({ name: r.account.name, score: r.score, scoreFrom: r.people[0].scoreFrom, tier: r.tier, segment: seg4.get(r.account.id) || '',
    exception: (rec4.get(r.account.id) || {}).exception || '' })),
  segments: (G4.segments || []).map(s => ({ name: s.name, n: s.accountIds.length })) };

fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log('segments TS1:', JSON.stringify(out.ts1.segments), 'keys', out.ts1.segKeys.join(','));
console.log('segments TS4:', JSON.stringify(out.ts4.segments));
