// Runs the scenario sets (make_scenarios.py) through legacy/demandai-engine.js, checks each account against the result it was
// designed for, and writes what the engine produces for the answer keys. With the TS1 inputs (make_inputs.py) it also
// re-scores TS1 at later dates for TS11.
// Usage: node run_scenarios.js <scenarios.json> <ts_inputs.json> <results.json>
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'legacy', 'demandai-engine.js'));
const inp = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ts = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

// The For Review exception check, as in legacy/demandai-nba.js (exceptionReasons and reasonCats), for an item nobody has touched.
function reviewReasons(r, asOf) {
  const d = E.draftFor(r, r.action, { asOf }), chk = E.checkDraft(d), out = [];
  if (!r.segment) out.push('Segment too small');
  const deal = E.estimateDealSize(r.account);
  if (deal && deal.below) out.push(`Below the deal-size threshold: about USD ${Math.round(deal.value / 1000)}k against ${Math.round(E.CONFIG.dealSize.threshold / 1000)}k`);
  if (r.result.confidence === 'low') out.push('Low confidence: no contact in the primary persona');
  if (chk.flags.some(f => f.rule === 'Sensitive term')) out.push('Sensitive content');
  if (d.unreachable) out.push("Can't reach them: " + d.why.replace(/\.$/, ''));
  if (chk.unsupported.length) out.push("A claim can't be verified");
  const brand = chk.flags.filter(f => f.rule !== 'Sensitive term');
  if (brand.length) out.push(`Brand or rule check: ${brand.map(f => f.rule.toLowerCase()).join(', ')}`);
  const cats = [];
  out.forEach(t => {
    const c = /^Sensitive/.test(t) ? 'sensitive' : /claim/.test(t) ? 'claim' : /^Low confidence/.test(t) ? 'low'
      : /^Segment too small/.test(t) ? 'small' : /deal-size/.test(t) ? 'deal' : /^Brand/.test(t) ? 'brand' : /^Can't reach/.test(t) ? 'reach' : 'other';
    if (!cats.includes(c)) cats.push(c);
  });
  const D = E.CONFIG.reviewDue;
  let due = cats.length ? Math.min(...cats.map(c => D[c] ?? D.other)) : null;
  if (due !== null && r.segment === 'Inquiry') due = Math.min(due, D.inquiry);
  return { reasons: out, cats, dueDays: due, channel: d.channel, unreachable: d.unreachable, deal };
}

function runSet(set, leadCols, sigCols, asOf) {
  const L = E.processLeads([leadCols, ...set.leads], { file: set.id, sheet: 'Lead template' });
  const list = { accounts: L.accounts, contacts: L.contacts };
  const S = E.processSignals([sigCols, ...set.signals], list, { file: set.id + ' signals', sheet: 'Signal template', asOf });
  const R = E.scoreList(list, S);
  const G = E.buildSegments(R);
  const segOf = new Map(); G.segments.forEach(s => s.accountIds.forEach(id => segOf.set(id, s.name)));
  const recOf = new Map(G.recs.map(r => [r.account.id, r]));
  const accounts = R.map(r => {
    const rec = recOf.get(r.account.id), rv = rec ? reviewReasons(rec, asOf) : null;
    return { name: r.account.name, vertical: r.account.vertical, level: r.account.verticalLevel, excluded: !!r.excluded, excludedReason: r.excludedReason || '',
      fit: r.fit ?? null, timing: r.timing ?? null, score: r.score ?? null, tier: r.tier, signals: r.signalCount || 0, confidence: r.confidence || '',
      segment: segOf.get(r.account.id) || '', rec: !!rec, contact: rec ? rec.contact.name : '', persona: rec ? rec.persona : '',
      owner: rec ? rec.contact.owner : (r.contacts[0] || {}).owner || '', fallback: rec ? rec.fallback : false,
      action: rec ? rec.action : '', runnerUp: rec && rec.runnerUp ? rec.runnerUp.action : '', exception: rec ? rec.exception : '',
      channel: rv ? rv.channel : '', reach: rv ? rv.unreachable : false, deal: rv && rv.deal ? rv.deal.value : null,
      cats: rv ? rv.cats : [], reasons: rv ? rv.reasons : [], dueDays: rv ? rv.dueDays : null };
  });
  return { L, S, R, G, accounts };
}

const out = { sets: {} };
let failures = 0;
const eq = (a, b) => typeof b === 'number' ? Math.abs((a ?? NaN) - b) < 0.051 : JSON.stringify(a) === JSON.stringify(b);
for (const set of inp.sets) {
  const { L, S, G, accounts } = runSet(set, inp.leadCols, inp.sigCols, set.asOf);
  const byName = new Map(accounts.map(a => [a.name, a]));
  const checks = [];
  for (const a of set.accounts) {
    const got = byName.get(a.name);
    for (const [k, want] of Object.entries(a.expect)) {
      if (['gap', 'managerSees'].includes(k)) continue;
      let have;
      if (!got) have = undefined;
      else if (k === 'cats') have = got.cats;
      else if (k === 'repASees') have = got.owner === 'rep.a@client-sample.com';
      else if (k === 'dueSameDay') have = got.dueDays === 0;
      else if (k === 'exception') have = !!got.exception;
      else have = got[k];
      const ok = got && eq(have, want);
      if (!ok && a.expect.gap) console.log(`KNOWN GAP ${set.id} ${a.name} ${k}: should be ${JSON.stringify(want)}, engine ${JSON.stringify(have)}`);
      else if (!ok) { failures++; console.log(`MISMATCH ${set.id} ${a.name} ${k}: designed ${JSON.stringify(want)}, engine ${JSON.stringify(have)}`); }
      checks.push({ account: a.name, key: k, want, have, ok: !!ok, gap: a.expect.gap || '' });
    }
  }
  out.sets[set.id] = {
    stats: L.stats, issues: L.issues.map(i => ({ row: i.row, field: i.field, code: i.code, severity: i.severity, issue: i.issue, outcome: i.outcome })),
    contacts: L.contacts.map(c => ({ row: c.row, company: c.company, name: c.name, status: c.status, reachableBy: c.reachableBy, owner: c.owner })),
    signals: S.signals.map(s => ({ row: s.row, company: s.company, type: s.type, status: s.status, code: s.code, age: s.age, weight: s.weight, reason: s.reason || '' })),
    accounts, segments: G.segments.map(s => ({ name: s.name, n: s.accountIds.length })), exceptions: G.exceptions.length, checks,
  };
  const tiers = {}; accounts.forEach(a => { tiers[a.tier] = (tiers[a.tier] || 0) + 1; });
  console.log(set.id, 'tiers', JSON.stringify(tiers), 'segments', JSON.stringify(out.sets[set.id].segments), 'exceptions', G.exceptions.length,
    'checks', checks.filter(c => c.ok).length + '/' + checks.length);
}

// TS11: TS1 re-scored at later dates (signals age and decay; nothing else changes)
const ts1 = { id: 'TS1', leads: ts.ts1, signals: ts.ts1sig };
out.ts11 = ['2026-10-20', '2026-11-20', '2026-12-20', '2027-01-20', '2027-04-20'].map(asOf => {
  const { accounts, G } = runSet(ts1, ts.leadCols, ts.sigCols, asOf);
  const tiers = {}; accounts.forEach(a => { tiers[a.tier] = (tiers[a.tier] || 0) + 1; });
  console.log('TS11', asOf, JSON.stringify(tiers), JSON.stringify(G.segments.map(s => s.name + ' ' + s.accountIds.length)), 'exceptions', G.exceptions.length);
  return { asOf, tiers, segments: G.segments.map(s => ({ name: s.name, n: s.accountIds.length })), exceptions: G.exceptions.length,
    accounts: accounts.map(a => ({ name: a.name, score: a.score, tier: a.tier, segment: a.segment, signals: a.signals })) };
});

fs.writeFileSync(process.argv[4], JSON.stringify(out, null, 1));
console.log(failures ? `${failures} designed results differ from the engine` : 'All designed results match the engine');
