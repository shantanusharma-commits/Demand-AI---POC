// Reads every file in the upload test pack the way the POC does (CSV with its own parser, Excel with SheetJS and the
// sheet picker), runs it through legacy/demandai-engine.js, and writes the results for the expected-results workbook.
// Usage: node run_pack.js <pack folder> <manifest.json> <results.json>
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..', '..');
const E = require(path.join(root, 'legacy', 'demandai-engine.js'));
const XLSX = require(path.join(root, 'node_modules', 'xlsx'));
const [pack, manifestPath, outPath] = process.argv.slice(2);
const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function grids(file) {
  if (/\.csv$/i.test(file)) return [{ sheet: '(CSV)', grid: E.parseCSV(fs.readFileSync(file, 'utf8')) }];
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellDates: true });
  return wb.SheetNames.map(n => ({ sheet: n, grid: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
}
const has = (g, a) => g.grid.slice(0, 10).some(r => (r || []).some(c => String(c).trim().toLowerCase().replace(/\*/g, '').replace(/\s+/g, '_') === a));
const pick = (gs, re, a) => gs.find(g => re.test(g.sheet) && has(g, a)) || gs.find(g => has(g, a)) || gs[0];
const leadsOf = f => { const g = pick(grids(path.join(pack, f)), /lead template/i, 'company_name'); return { sheet: g.sheet, r: E.processLeads(g.grid, { file: f, sheet: g.sheet }) }; };
const issue = i => ({ row: i.row, field: i.field, code: i.code, severity: i.severity, issue: i.issue, outcome: i.outcome });
const tierCount = R => R.reduce((o, r) => (o[r.tier] = (o[r.tier] || 0) + 1, o), {});

const base = leadsOf(man.files.find(f => f.id === 'S00').path).r;
const out = {};
for (const f of man.files) {
  if (f.kind.startsWith('lead') || f.kind === 'base') {
    const { sheet, r } = leadsOf(f.path);
    out[f.id] = { sheet, stats: r.stats, issues: r.issues.map(issue),
      contacts: r.contacts.map(c => ({ row: c.row, name: c.name, persona: c.persona, status: c.status, reachableBy: c.reachableBy, company: c.company })),
      accounts: r.accounts.map(a => ({ name: a.name, excluded: a.excluded, excludedReason: a.excludedReason, vertical: a.vertical, level: a.verticalLevel,
        confidence: a.confidence, needsReview: a.needsReview, owner: a.owner })) };
  } else if (f.kind.startsWith('signal')) {
    const g = pick(grids(path.join(pack, f.path)), /signal template/i, 'signal_type');
    out[f.id] = { sheet: g.sheet, runs: f.asOf.map(asOf => {
      const own = f.list_path ? leadsOf(f.list_path).r : base;
      const list = { accounts: own.accounts, contacts: own.contacts };
      const S = E.processSignals(g.grid, list, { file: f.file, sheet: g.sheet, asOf });
      const R = E.scoreList(list, S);
      return { asOf, rowsRead: S.rowsRead, tiers: tierCount(R), suggested: S.suggested,
        fileIssues: S.issues.filter(i => i.severity === 'stop' || (i.row === '—') || /column/i.test(i.issue)).map(issue),
        signals: S.signals.map(s => ({ row: s.row, company: s.company, type: s.type, status: s.status, code: s.code, reason: s.reason, assigned: s.assigned,
          person: s.personName, age: s.age ?? null, weight: s.weight === undefined ? null : Math.round(s.weight * 10) / 10 })),
        notes: S.issues.filter(i => i.severity === 'info').map(issue),
        accounts: R.map(r => ({ name: r.account.name, fit: r.fit ?? null, timing: r.timing ?? null, score: r.score ?? null, tier: r.tier, signals: r.signalCount || 0,
          confidence: r.confidence || '', reason: r.excludedReason || '' })) };
    }) };
  } else if (f.kind === 'pair') {
    const { r: L } = leadsOf(f.lead_path);
    const list = { accounts: L.accounts, contacts: L.contacts };
    const g = pick(grids(path.join(pack, f.path)), /signal template/i, 'signal_type');
    const S = E.processSignals(g.grid, list, { asOf: f.asOf[0] }); const R = E.scoreList(list, S); const G = E.buildSegments(R);
    out[f.id] = { stats: L.stats, tiers: tierCount(R), segments: G.segments.map(s => ({ name: s.name, n: s.accountIds.length })), exceptions: G.exceptions.length };
  }
  const o = out[f.id];
  const line = o.stats ? JSON.stringify({ read: o.stats.rowsRead, notLoaded: o.stats.notLoaded, merged: o.stats.merged, acc: o.stats.accounts, pass: o.stats.accountsPass, final: o.stats.inFinalList, issues: o.stats.issuesBySeverity })
    : JSON.stringify(o.runs.map(x => ({ asOf: x.asOf, read: x.rowsRead, tiers: x.tiers, st: x.signals.map(s => (s.status[0] || '?') + (s.code || '')).join(' ') })));
  console.log(f.id, line + (o.segments ? ' ' + JSON.stringify(o.segments) : ''));
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
