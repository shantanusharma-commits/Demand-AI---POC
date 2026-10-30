// Runs the remediation branch's own engine over the three golden sets with the starting brand pack, the way the
// server does: Prospecting -> Account Scoring -> hand-off (tier A and B, contactable) -> build -> routing.
// Usage: node --experimental-strip-types run_golden_v2.mts <branch checkout> <spec.json> > results.json
import fs from 'node:fs';
const H = process.argv[2];
const { processLeads, processSignals, scoreList, canContact } = await import(H + '/lib/demandai-engine.ts');
const { buildProspects, handoffSelection } = await import(H + '/lib/engine/prospects.ts');
const { buildSegments, defaultBrand, checkDraft } = await import(H + '/lib/engine/nba.ts');
const R = await import(H + '/lib/engine/review.ts');
const spec = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const grid = (cols: string[], rows: unknown[][]) => [cols, ...rows.map(r => r.map(v => v === '' || v == null ? '' : String(v)))];
const out: Record<string, unknown> = {};
for (const [key, set] of Object.entries<any>(spec.sets)) {
  const list = processLeads(grid(spec.leadCols, set.leads) as any, { file: 'prospects.xlsx', sheet: 'Lead template' });
  const sig = processSignals(grid(spec.sigCols, set.signals) as any, list as any, { file: 'signals.xlsx', sheet: 'Signal template', asOf: spec.asOf });
  const scored = scoreList(list as any, sig);
  const prospects = buildProspects(scored);
  const { items, heldBack } = handoffSelection(prospects);
  const results = scored.map((r: any) => ({ account: r.account, people: r.people || [], signalCount: r.signalCount, score: r.score, tier: r.tier, confidence: r.confidence, confidenceWhy: r.confidenceWhy }));
  const seg = buildSegments(results as any, { keys: items.map((p: any) => p.key), engaged: new Map() });
  const pack = defaultBrand();
  const recs = seg.recs.map((rec: any) => {
    const st = R.initialState();
    let d = R.generatedDraft(rec, st, pack, spec.asOf); let regen = '';
    const flags = checkDraft(d, pack, spec.asOf).flags.filter((f: any) => f.rule !== 'Sensitive term');
    if (flags.length) { st.variant = 'clean'; d = R.generatedDraft(rec, st, pack, spec.asOf); regen = flags.map((f: any) => f.rule).join(', '); }
    const rs = R.exceptionReasons(rec, d, checkDraft(d, pack, spec.asOf));
    return { account: rec.account.name, contact: rec.contact.name, segment: rec.segment || null, action: rec.action, channel: d.channel, claim: d.proof?.id || '',
      task: !!d.task && !d.body && !d.note, regen, reasons: rs, route: rs.some((t: string) => /^Sensitive/.test(t)) ? 'Approvals' : rs.length ? 'Queue' : 'Released',
      text: d.body || d.note || d.task || '' };
  });
  out[key] = {
    accounts: scored.map((r: any) => ({ name: r.account.name, fit: r.fit, tier: r.tier, score: r.score, excludedReason: r.excludedReason,
      people: (r.people || []).map((p: any) => ({ name: p.contact.name, tier: p.tier, score: p.final, timing: p.timing, signals: p.signals.map((s: any) => s.type) })) })),
    prospects: prospects.map((p: any) => ({ key: p.key, name: p.c.name, account: p.r.account.name, tier: p.tier, score: p.score })),
    handoff: items.map((p: any) => p.c.name), heldBack,
    heldBackNames: prospects.filter((p: any) => (p.tier === 'A' || p.tier === 'B') && p.score !== undefined && !canContact(p.c)).map((p: any) => p.c.name),
    leadIssues: (list as any).issues.map((i: any) => `${i.row}|${i.field}|${i.issue}|${i.outcome}`),
    signalIssues: sig.issues.map((i: any) => `${i.row}|${i.field}|${i.issue}|${i.outcome}`),
    signals: sig.signals.map((s: any) => ({ row: s.row, company: s.company, type: s.type, status: s.status, reason: s.reason, weight: s.weight })),
    segments: seg.segments.map((s: any) => [s.name ?? s.segment, s.recs?.length ?? s.count]), recs,
  };
}
console.log(JSON.stringify(out, null, 1));
