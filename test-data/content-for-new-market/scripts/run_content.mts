// Content library runs on the setup-from-scratch BASE set-up: spec = BASE spec + brandRuns: [{id, patch}] + typed: [text]
import fs from 'node:fs';
const H = process.argv[2], spec = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const E = await import(H + '/lib/demandai-engine.ts');
const { buildProspects, handoffSelection } = await import(H + '/lib/engine/prospects.ts');
const N = await import(H + '/lib/engine/nba.ts');
const R = await import(H + '/lib/engine/review.ts');
const st: any = E.defaultScoringSettings(); const p = spec.settings || {};
for (const k of Object.keys(p)) {
  if (k === 'addVerticals') st.verticals.push(...p.addVerticals);
  else if (k === 'addPrimary') st.personas.primary.push(...p.addPrimary);
  else if (k === 'addSecondary') st.personas.secondary.push(...p.addSecondary);
  else if (k === 'weights') st.parts.forEach((x: any) => { if (p.weights[x.key] !== undefined) x.weight = p.weights[x.key]; });
  else if (k === 'addParts') st.parts.push(...p.addParts);
  else st[k] = p[k];
}
const grid = (c: string[], rows: unknown[][]) => [c, ...rows.map(r => r.map(v => v == null ? '' : String(v)))];
const list = E.processLeads(grid(spec.leadCols, spec.leads) as any, { settings: st });
const sig = E.processSignals(grid(spec.sigCols, spec.signals) as any, list as any, { asOf: spec.asOf, custom: spec.newTypes || [], settings: st, off: [] } as any);
const scored = E.scoreList(list as any, sig, st);
const pr = buildProspects(scored); const { items } = handoffSelection(pr);
const res = scored.map((r: any) => ({ account: r.account, people: r.people || [], signalCount: r.signalCount, score: r.score, tier: r.tier, confidence: r.confidence }));
const library = { ...E.CONFIG.segmentLibrary, ...spec.library };
const seg = buildSegments();
function buildSegments() { return N.buildSegments(res as any, { keys: items.map((x: any) => x.key), engaged: new Map(), library }); }
const apply = (pack: any, patch: any) => {
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === 'voice') pack.voice = { ...pack.voice, ...(v as any) };
    else if (k === 'addClaims') pack.claims.push(...(v as any[]));
    else if (k === 'claimStatus') for (const [id, s] of Object.entries(v as any)) { const c = pack.claims.find((x: any) => x.id === id); if (c) Object.assign(c, s); }
    else if (k === 'addNegative') pack.negative.push(...(v as string[]));
    else if (k === 'addCompetitors') pack.competitors.push(...(v as string[]));
    else if (k === 'plays') pack.framework = { ...pack.framework, ...(v as any) };
    else pack[k] = v;
  }
  return pack;
};
const out: any = { runs: [], typed: [] };
let packs: Record<string, any> = {};
for (const run of spec.brandRuns) {
  const base = run.from ? JSON.parse(JSON.stringify(packs[run.from])) : N.defaultBrand();
  const pack = apply(base, run.patch); packs[run.id] = pack;
  const recs = seg.recs.map((rec: any) => {
    const d = R.generatedDraft(rec, R.initialState(), pack, spec.asOf); const chk = N.checkDraft(d, pack, spec.asOf);
    const rs = R.exceptionReasons(rec, d, chk, {});
    const b = N.briefFor(rec, rec.action, { asOf: spec.asOf, brand: pack });
    const sc = N.callScript(rec, rec.action, '', pack);
    return { account: rec.account.name, contact: rec.contact.name, segment: rec.segment, action: rec.action, channel: d.channel, subject: d.subject || '', body: d.body || '', task: d.task || '',
      words: d.words || 0, claim: d.proof?.id || '', flags: chk.flags.map((f: any) => `${f.rule}: ${f.detail}`), unsupported: chk.unsupported.map((c: any) => c.text),
      route: rs.some((t: string) => /^Sensitive/.test(t)) ? 'Approvals' : rs.length ? 'For Review' : 'Released', reasons: rs,
      angle: b.angle, objection: b.objection, response: sc.response, taskWhy: N.taskWhy(rec, rec.action, spec.asOf, pack) };
  });
  out.runs.push({ id: run.id, recs });
}
for (const t of spec.typed || []) { const pk = packs[t.pack]; const c = N.checkContent(t.text, pk, spec.asOf);
  out.typed.push({ text: t.text, pack: t.pack, flags: c.flags.map((f: any) => `${f.rule}: ${f.detail}`), verified: c.claims.filter((x: any) => x.verified).map((x: any) => x.source), unsupported: c.unsupported.map((x: any) => x.text + (x.reason ? ' (' + x.reason + ')' : '')) }); }
console.log(JSON.stringify(out));
