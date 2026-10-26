// Reads each Round 2 workbook the way the POC does (SheetJS, then the sheet picker), runs it Prospecting -> Scoring ->
// Micro-segments -> For Review with legacy/demandai-engine.js, and writes the results for the answer keys.
// Usage: node run_realistic.js <sets folder> <spec.json> <results.json>
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..', '..');
const E = require(path.join(root, 'legacy', 'demandai-engine.js'));
const XLSX = require(path.join(root, 'node_modules', 'xlsx'));
const [dir, specPath, outPath] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

const has = (g, a) => g.grid.slice(0, 10).some(r => (r || []).some(c => String(c).trim().toLowerCase().replace(/\*/g, '').replace(/\s+/g, '_') === a));
const pick = (gs, re, a) => gs.find(g => re.test(g.sheet) && has(g, a)) || gs.find(g => has(g, a)) || gs[0];
// The For Review exception check, as in legacy/demandai-nba.js (exceptionReasons and reasonCats), for an untouched item.
function review(r, asOf) {
  const d = E.draftFor(r, r.action, { asOf }), chk = E.checkDraft(d), cats = [];
  const add = c => { if (!cats.includes(c)) cats.push(c); };
  if (!r.segment) add('small');
  const deal = E.estimateDealSize(r.account);
  if (deal && deal.below) add('deal');
  if (r.result.confidence === 'low') add('low');
  if (chk.flags.some(f => f.rule === 'Sensitive term')) add('sensitive');
  if (d.unreachable) add('reach');
  if (chk.unsupported.length) add('claim');
  if (chk.flags.some(f => f.rule !== 'Sensitive term')) add('brand');
  const D = E.CONFIG.reviewDue;
  let due = cats.length ? Math.min(...cats.map(c => D[c] ?? D.other)) : null;
  if (due !== null && r.segment === 'Inquiry') due = Math.min(due, D.inquiry);
  return { cats, due, channel: d.unreachable ? 'None' : d.channel };
}
function run(file, asOf) {
  const wb = XLSX.read(fs.readFileSync(path.join(dir, file)), { type: 'buffer', cellDates: true });
  const gs = wb.SheetNames.map(n => ({ sheet: n, grid: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
  const lg = pick(gs, /lead template/i, 'company_name'), sg = pick(gs, /signal template/i, 'signal_type');
  const L = E.processLeads(lg.grid, { file, sheet: lg.sheet });
  const list = { accounts: L.accounts, contacts: L.contacts };
  const S = E.processSignals(sg.grid, list, { file, sheet: sg.sheet, asOf });
  const R = E.scoreList(list, S);
  const G = E.buildSegments(R);
  const seg = new Map(); G.segments.forEach(s => s.accountIds.forEach(id => seg.set(id, s.name)));
  const rec = new Map(G.recs.map(r => [r.account.id, r]));
  const count = (xs, f) => xs.reduce((o, x) => (o[f(x)] = (o[f(x)] || 0) + 1, o), {});
  const accounts = R.map(r => {
    const x = rec.get(r.account.id), rv = x ? review(x, asOf) : null;
    return { name: r.account.name, country: r.account.country, vertical: r.account.vertical, owner: r.account.owner, existing: r.account.existingCustomer,
      fit: r.fit ?? null, score: r.score ?? null, tier: r.tier, signals: r.signalCount || 0, confidence: r.confidence || '', why: r.excludedReason || '',
      segment: seg.get(r.account.id) || '', action: x ? x.action : '', contact: x ? x.contact.name : '', channel: rv ? rv.channel : '',
      cats: rv ? rv.cats : [], due: rv ? rv.due : null, rec: !!x };
  });
  const recs = accounts.filter(a => a.rec);
  return { sheets: [lg.sheet, sg.sheet], stats: L.stats, signalRows: S.rowsRead, signalStatus: count(S.signals, s => s.status + (s.status === 'Rejected' ? ' ' + s.code : '')),
    suggested: S.suggested.length, tiers: count(R, r => r.tier), segments: G.segments.map(s => ({ name: s.name, n: s.accountIds.length })), exceptions: G.exceptions.length,
    review: recs.filter(a => a.cats.length).length, ahead: recs.filter(a => !a.cats.length).length,
    reasons: recs.reduce((o, a) => (a.cats.forEach(c => o[c] = (o[c] || 0) + 1), o), {}), accounts };
}
const out = {};
for (const s of spec) {
  const t = Date.now();
  out[s.id] = run(s.file, s.asOf);
  const o = out[s.id];
  console.log(s.id, `${Date.now() - t}ms`, 'sheets', o.sheets.join('/'), JSON.stringify(o.stats.issuesBySeverity), 'pass', o.stats.accountsPass + '/' + o.stats.accounts,
    'final', o.stats.inFinalList, '| signals', JSON.stringify(o.signalStatus), '| tiers', JSON.stringify(o.tiers), '| segs', o.segments.map(x => x.name + ' ' + x.n).join(', '),
    '| review', o.review, 'ahead', o.ahead, JSON.stringify(o.reasons));
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
