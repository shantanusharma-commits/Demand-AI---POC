// Runs the remediation branch's own engine over the two files, with and without the Content library edits.
// Usage: node --experimental-strip-types run_content_check.mts <branch checkout> <spec.json> [base] > out.json
import fs from 'node:fs';
const H = process.argv[2];
const { processLeads, processSignals, scoreList } = await import(H + '/lib/demandai-engine.ts');
const { buildProspects, handoffSelection } = await import(H + '/lib/engine/prospects.ts');
const { buildSegments, defaultBrand, checkDraft } = await import(H + '/lib/engine/nba.ts');
const R = await import(H + '/lib/engine/review.ts');
const spec = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const grid = (cols: string[], rows: unknown[][]) => [cols, ...rows.map(r => r.map(v => v === '' || v == null ? '' : String(v)))];
const list = processLeads(grid(spec.leadCols, spec.leads) as any, { file: 'Content_Check_1_Prospects.xlsx', sheet: 'Lead template' });
const sig = processSignals(grid(spec.sigCols, spec.signals) as any, list as any, { file: 'Content_Check_2_Signals.xlsx', sheet: 'Signal template', asOf: spec.asOf });
const scored = scoreList(list as any, sig);
const prospects = buildProspects(scored);
const { items, heldBack } = handoffSelection(prospects);
const keys = items.map(p => p.key);
const results = scored.map(r => ({ account: r.account, people: r.people || [], signalCount: (r as any).signalCount, score: (r as any).score, tier: r.tier, confidence: (r as any).confidence, confidenceWhy: (r as any).confidenceWhy })) as any;
const seg = buildSegments(results, { keys, engaged: new Map() });
const pack = defaultBrand();
const base = process.argv[4] === 'base'; if (!base) pack.voice.maxWords = 150;
if (!base) pack.claims.push({ id: 'CL-07', type: 'Case study', year: 2026, title: 'Newsletter', segments: ['Inquiry','Modernisation','Service renewal','Project','Leadership','Engagement'], expiry: '2027-12-31',
  claim: 'We have published a newsletter that help to get us 50% more revenue.', status: 'approved', owner: 'Marketing' });
const checkDate = spec.asOf;
const out = seg.recs.map((rec: any) => {
  const st = R.initialState();
  let d = R.generatedDraft(rec, st, pack, checkDate); let regen = '';
  const flags = checkDraft(d, pack, checkDate).flags.filter((f: any) => f.rule !== 'Sensitive term');
  if (flags.length) { st.variant = 'clean'; d = R.generatedDraft(rec, st, pack, checkDate); regen = flags.map((f: any) => f.rule).join(', '); }
  const chk = checkDraft(d, pack, checkDate);
  const rs = R.exceptionReasons(rec, d, chk);
  const route = rs.some(t => /^Sensitive/.test(t)) ? 'Approvals' : rs.length ? 'Queue' : 'Released';
  return { account: rec.account.name, contact: rec.contact.name, tier: rec.person?.tier, score: rec.person?.final, segment: rec.segment, action: rec.action, channel: d.channel,
    claim: d.proof?.id || '', claimText: d.proof?.claim || '', subject: d.subject || '', body: d.body || d.note || d.task || '', words: d.words || 0, flags: chk.flags.map((f: any) => f.rule + ': ' + f.detail), regen, reasons: rs, route };
});
console.log(JSON.stringify({ prospects: prospects.length, handoff: items.length, heldBack, segments: seg.segments?.map((s: any) => [s.name ?? s.segment, s.recs?.length ?? s.count]) , unsegmented: (seg as any).unsegmented?.length, recs: out }, null, 1));
