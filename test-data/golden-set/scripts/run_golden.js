// Reads the golden workbook the way the POC does, runs it Prospecting -> Scoring -> Micro-segments -> For Review with
// legacy/demandai-engine.js, checks every account against its design, and writes the results for the answer key.
// Usage: node run_golden.js <folder> <golden_spec.json> <results.json>
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..', '..');
const E = require(path.join(root, 'legacy', 'demandai-engine.js'));
const XLSX = require(path.join(root, 'node_modules', 'xlsx'));
const [dir, specPath, outPath] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

const has = (g, a) => g.grid.slice(0, 10).some(r => (r || []).some(c => String(c).trim().toLowerCase().replace(/\*/g, '').replace(/\s+/g, '_') === a));
const pick = (gs, re, a) => gs.find(g => re.test(g.sheet) && has(g, a)) || gs.find(g => has(g, a)) || gs[0];
const wb = XLSX.read(fs.readFileSync(path.join(dir, spec.file)), { type: 'buffer', cellDates: true });
const gs = wb.SheetNames.map(n => ({ sheet: n, grid: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
const asOf = spec.asOf;
const L = E.processLeads(pick(gs, /lead template/i, 'company_name').grid, {});
const list = { accounts: L.accounts, contacts: L.contacts };
const S = E.processSignals(pick(gs, /signal template/i, 'signal_type').grid, list, { asOf });
const R = E.scoreList(list, S);
// The default hand-off from Scoring (legacy/demandai-nba.js compute): every prospect in tier A or B with a signal.
const keys = R.flatMap(r => (r.people || []).filter(p => p.signals.length && (p.tier === 'A' || p.tier === 'B')).map(p => r.account.id + '|' + p.contact.row));
const G = E.buildSegments(R, { keys });
const seg = new Map(); G.segments.forEach(s => s.accountIds.forEach(id => seg.set(id, s.name)));
const recOf = new Map(G.recs.map(r => [r.account.id, r]));
// The For Review exception check, as in legacy/demandai-nba.js (exceptionReasons, reasonCats, dueOf), for an untouched item.
// Routing as in routeRun: a draft failing a brand or rule check is regenerated once ('clean' variant) before the check;
// sensitive content goes straight to the sales manager's Approvals.
function review(r) {
  const first = E.draftFor(r, r.action, { asOf });
  const brandFirst = E.checkDraft(first).flags.filter(f => f.rule !== 'Sensitive term');
  const d = brandFirst.length ? E.draftFor(r, r.action, { asOf, variant: 'clean' }) : first, chk = E.checkDraft(d), cats = [], reasons = [];
  const add = (c, t) => { if (!cats.includes(c)) cats.push(c); reasons.push(t); };
  if (!r.segment) add('small', 'Segment too small');
  const deal = E.estimateDealSize(r.account);
  if (deal && deal.below) add('deal', `Below the deal-size threshold: about USD ${Math.round(deal.value / 1000)}k`);
  if (r.result.confidence === 'low') add('low', 'Low confidence: no contact in the primary persona');
  if (chk.flags.some(f => f.rule === 'Sensitive term')) add('sensitive', 'Sensitive content');
  if (d.unreachable) add('reach', "Can't reach them: " + d.why.replace(/\.$/, ''));
  if (chk.unsupported.length) add('claim', "A claim can't be verified");
  const brand = chk.flags.filter(f => f.rule !== 'Sensitive term');
  if (brand.length) add('brand', 'Brand or rule check: ' + brand.map(f => f.rule.toLowerCase()).join(', '));
  const D = E.CONFIG.reviewDue;
  let due = cats.length ? Math.min(...cats.map(c => D[c] ?? D.other)) : null;
  if (due !== null && r.segment === 'Inquiry') due = Math.min(due, D.inquiry);
  const conf = E.confidenceFor(r, d, chk, r.action);
  return { regenerated: brandFirst.length ? brandFirst.map(f => f.rule + ': ' + f.detail).join('; ') : '', route: cats.includes('sensitive') ? 'Approvals' : cats.length ? 'Queue' : 'Goes ahead', cats, reasons, due, channel: d.unreachable ? 'None' : d.channel, subject: d.subject || '', note: d.note || '', why: d.why, deal: deal ? deal.value : null, conf: conf.level, confWhy: conf.reason, flags: chk.flags.map(f => f.rule + ': ' + f.detail) };
}
const out = { stats: L.stats, segments: G.segments.map(s => ({ name: s.name, n: s.accountIds.length })), exceptions: G.exceptions.length, accounts: [] };
let fails = 0;
for (const a of spec.accounts) {
  const r = R.find(x => x.account.name === a.name), x = recOf.get(r.account.id), rv = x ? review(x) : null;
  const got = { tier: r.tier, fit: r.fit ?? null, score: r.score ?? null, confidence: r.confidence || '', segment: seg.get(r.account.id) || '', rec: !!x,
    fallback: x ? x.fallback : false, action: x ? x.action : '', runnerUp: x && x.runnerUp ? x.runnerUp.action : '', runnerWhy: x && x.runnerUp ? x.runnerUp.reason : '',
    contact: x ? x.contact.name : '', persona: x ? x.persona : '', owner: x ? x.contact.owner : '', status: x ? x.status : '', why: x ? x.reason : '',
    channel: rv ? rv.channel : '', subject: rv ? rv.subject : '', cats: rv ? rv.cats : [], reasons: rv ? rv.reasons : [], dueDays: rv ? rv.due : null,
    route: rv ? rv.route : '', regenerated: rv ? rv.regenerated : '', deal: rv ? rv.deal : null, conf: rv ? rv.conf : '', confWhy: rv ? rv.confWhy : '', flags: rv ? rv.flags : [], exception: x ? x.exception : '' };
  const checks = [];
  for (const [k, want] of Object.entries(a.expect)) {
    if (k === 'gap') continue;
    const have = got[k], ok = JSON.stringify(have) === JSON.stringify(want);
    checks.push({ k, want, have, ok });
    if (!ok) { if (a.expect.gap) console.log(`KNOWN GAP ${a.id} ${k}: should be ${JSON.stringify(want)}, POC gives ${JSON.stringify(have)}`); else { fails++; console.log(`MISMATCH ${a.id} ${a.name} ${k}: designed ${JSON.stringify(want)}, engine ${JSON.stringify(have)}`); } }
  }
  out.accounts.push({ ...a, got, checks });
}
const recs = out.accounts.filter(a => a.got.rec);
console.log('segments', JSON.stringify(out.segments), '| exceptions', out.exceptions, '| for review', recs.filter(a => a.got.cats.length).length, '| go ahead', recs.filter(a => !a.got.cats.length).length);
console.log(fails ? fails + ' designed results differ' : 'All designed results match the engine');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
