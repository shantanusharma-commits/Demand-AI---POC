// Runs the POC engine over the round-2 new-signals data, with the segments, signal types and actions the Admin sets up
// in advance, and the starting brand pack: Prospecting -> Scoring -> hand-off -> build -> routing.
// Usage: node --experimental-strip-types run_new_signals.mts <branch checkout> <spec.json> > results.json
import fs from 'node:fs';
const H = process.argv[2];
const { processLeads, processSignals, scoreList, CONFIG } = await import(H + '/lib/demandai-engine.ts');
const { buildProspects, handoffSelection } = await import(H + '/lib/engine/prospects.ts');
const { buildSegments, defaultBrand, checkDraft } = await import(H + '/lib/engine/nba.ts');
const R = await import(H + '/lib/engine/review.ts');
const spec = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const grid = (cols: string[], rows: unknown[][]) => [cols, ...rows.map(r => r.map(v => v === '' || v == null ? '' : String(v)))];
const list = processLeads(grid(spec.leadCols, spec.leads) as any, { file: 'New_Signals_1_Prospects.xlsx', sheet: 'Lead template' });
const sig = processSignals(grid(spec.sigCols, spec.signals) as any, list as any, { file: 'New_Signals_2_Signals.xlsx', sheet: 'Signal template', asOf: spec.asOf, custom: spec.newTypes });
const scored = scoreList(list as any, sig);
const prospects = buildProspects(scored);
const { items, heldBack } = handoffSelection(prospects);
const results = scored.map((r: any) => ({ account: r.account, people: r.people || [], signalCount: r.signalCount, score: r.score, tier: r.tier, confidence: r.confidence, confidenceWhy: r.confidenceWhy }));
const library = { ...CONFIG.segmentLibrary, ...Object.fromEntries(spec.segments.map((g: any) => [g.name, g.actions.map((a: any) => a[0])])) };
const seg = buildSegments(results as any, { keys: items.map((p: any) => p.key), engaged: new Map(), library });
const pack = defaultBrand();
const recs = seg.recs.map((rec: any) => {
  const st = R.initialState();
  let d = R.generatedDraft(rec, st, pack, spec.asOf); let regen = '';
  const flags = checkDraft(d, pack, spec.asOf).flags.filter((f: any) => f.rule !== 'Sensitive term');
  if (flags.length) { st.variant = 'clean'; d = R.generatedDraft(rec, st, pack, spec.asOf); regen = flags.map((f: any) => f.rule).join(', '); }
  const rs = R.exceptionReasons(rec, d, checkDraft(d, pack, spec.asOf));
  return { account: rec.account.name, contact: rec.contact.name, title: rec.contact.jobTitle, segment: rec.segment || null, action: rec.action,
    runnerUp: rec.runnerUp?.action || '', channel: d.channel, claim: d.proof?.id || '', claimText: d.proof?.claim || '', subject: d.subject || '',
    text: d.body || d.note || d.task || '', regen, reasons: rs, route: rs.some((t: string) => /^Sensitive/.test(t)) ? 'Approvals' : rs.length ? 'For Review' : 'Released',
    why: rec.reason, task: d.channel === 'Task' || !!d.task };
});
console.log(JSON.stringify({
  accounts: scored.map((r: any) => ({ name: r.account.name, fit: r.fit, tier: r.tier, score: r.score, excludedReason: r.excludedReason,
    people: (r.people || []).map((p: any) => ({ name: p.contact.name, tier: p.tier, score: p.final, timing: p.timing, signals: p.signals.map((s: any) => s.type) })) })),
  handoff: items.map((p: any) => p.c.name), heldBack,
  leadIssues: (list as any).issues.map((i: any) => `${i.row}|${i.field}|${i.issue}|${i.outcome}`),
  signals: sig.signals.map((s: any) => ({ row: s.row, company: s.company, type: s.type, status: s.status, reason: s.reason, weight: s.weight })),
  segments: seg.segments.map((s: any) => [s.name, s.accountIds.length]), recs,
}, null, 1));
