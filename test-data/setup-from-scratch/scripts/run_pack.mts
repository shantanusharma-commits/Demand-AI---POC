// Generic engine run for test packs: spec = { asOf, leadCols, leads, sigCols, signals, newTypes, settings (patch), library, dealThreshold }
import fs from 'node:fs';
const H = process.argv[2], spec = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const E = await import(H + '/lib/demandai-engine.ts');
const { buildProspects, handoffSelection } = await import(H + '/lib/engine/prospects.ts');
const { buildSegments, defaultBrand, checkDraft, estimateDealSize } = await import(H + '/lib/engine/nba.ts');
const R = await import(H + '/lib/engine/review.ts');
const st: any = E.defaultScoringSettings();
const p = spec.settings || {};
for (const k of Object.keys(p)) {
  if (k === 'addVerticals') st.verticals.push(...p.addVerticals);
  else if (k === 'addPrimary') st.personas.primary.push(...p.addPrimary);
  else if (k === 'addSecondary') st.personas.secondary.push(...p.addSecondary);
  else if (k === 'personasOff') st.personas.off.push(...p.personasOff);
  else if (k === 'weights') st.parts.forEach((x: any) => { if (p.weights[x.key] !== undefined) x.weight = p.weights[x.key]; });
  else if (k === 'addParts') st.parts.push(...p.addParts);
  else if (k === 'tiers') st.tiers = { ...st.tiers, ...p.tiers };
  else if (k === 'signals') st.signals = { ...st.signals, ...p.signals };
  else if (k === 'signalSegments') st.signalSegments = { ...st.signalSegments, ...p.signalSegments };
  else st[k] = p[k];
}
const grid = (c: string[], rows: unknown[][]) => [c, ...rows.map(r => r.map(v => v == null ? '' : String(v)))];
const list = E.processLeads(grid(spec.leadCols, spec.leads) as any, { settings: st });
const sig = E.processSignals(grid(spec.sigCols, spec.signals) as any, list as any, { asOf: spec.asOf, custom: spec.newTypes || [], settings: st, off: spec.off || [] } as any);
const scored = E.scoreList(list as any, sig, st);
const pr = buildProspects(scored); const { items, heldBack } = handoffSelection(pr);
const res = scored.map((r: any) => ({ account: r.account, people: r.people || [], signalCount: r.signalCount, score: r.score, tier: r.tier, confidence: r.confidence }));
const library = spec.library ? { ...E.CONFIG.segmentLibrary, ...spec.library } : undefined;
const seg = buildSegments(res as any, { keys: items.map((x: any) => x.key), engaged: new Map(), library });
const pack = defaultBrand(); const thr = spec.dealThreshold;
const recs = seg.recs.map((rec: any) => { const d = R.generatedDraft(rec, R.initialState(), pack, spec.asOf);
  const rs = R.exceptionReasons(rec, d, checkDraft(d, pack, spec.asOf), thr === undefined ? {} : { dealThreshold: thr } as any);
  const deal = estimateDealSize(rec.account, thr === undefined ? undefined : thr);
  return { account: rec.account.name, contact: rec.contact.name, segment: rec.segment || null, action: rec.action, channel: d.channel, claim: d.proof?.id || '', deal: deal?.value ?? null,
    route: rs.some((t: string) => /^Sensitive/.test(t)) ? 'Approvals' : rs.length ? 'For Review' : 'Released', reasons: rs }; });
console.log(JSON.stringify({
  accounts: scored.map((r: any) => ({ name: r.account.name, vertical: r.account.vertical, fit: r.fit, tier: r.tier, score: r.score, ex: r.excludedReason || '',
    breakdown: (r.fitBreakdown || r.breakdown || []).map((b: any) => [b.key, b.points]), people: (r.people || []).map((q: any) => ({ name: q.contact.name, tier: q.tier, score: q.final })) })),
  signals: sig.signals.map((s: any) => ({ row: s.row, company: s.company, type: s.type, status: s.status, reason: s.reason || '', weight: s.weight })),
  issues: (list as any).issues.map((i: any) => `${i.row}|${i.field}|${i.issue}|${i.outcome}`),
  handoff: items.map((x: any) => x.c.name), heldBack, segments: seg.segments.map((s: any) => [s.name, s.accountIds.length]), recs }));
