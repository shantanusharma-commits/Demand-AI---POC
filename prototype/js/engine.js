/* Demand AI prototype: the engine.
   Pure functions only: no screen code, no state. Scoring, decay, the entry gate, the qualification filter,
   stacking, rank and tiers, confidence, the five criteria, the NBA or NBC rule, message verification,
   edit diffs and the backtest. The app calls these on the seed; the tests call them in Node. */
(function (root) {
  const DAY = 86400000;
  const toDay = d => Math.floor(new Date(d).getTime() / DAY);
  const daysBetween = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / DAY;
  const round = (x, n = 2) => Math.round(x * Math.pow(10, n)) / Math.pow(10, n);

  /* ─── Signals ─── */
  function strengthFactor(strength, cfg) { return cfg.strengthFactor[strength || cfg.defaultStrength] || cfg.strengthFactor[cfg.defaultStrength]; }

  /* Share of full weight left at a given age: full for fullDays, then linear to zero by zeroDays. */
  function decayFactor(tier, ageDays, cfg, zeroOverride) {
    const t = cfg.signalTiers[tier];
    const zero = zeroOverride != null ? zeroOverride : t.zeroDays, full = Math.min(t.fullDays, zero);
    if (ageDays < 0) return 1;
    if (ageDays <= full) return 1;
    if (ageDays >= zero) return 0;
    return 1 - (ageDays - full) / (zero - full);
  }

  /* When a signal stops counting. A date in the signal's own text ("budget frozen to April") overrides the tier window. */
  function expiryOf(sig, cfg) {
    if (sig.expiresOn) return new Date(sig.expiresOn + 'T23:59:59');
    return new Date(new Date(sig.eventDate).getTime() + cfg.signalTiers[sig.tier].zeroDays * DAY);
  }

  /* The qualification filter: all three tests must pass, or the signal is discarded with the failed test. */
  function qualify(sig) {
    if (!sig.observable) return { ok: false, failed: 'Observable', why: 'Cannot be verified from a public source' };
    if (!sig.predictive) return { ok: false, failed: 'Predictive', why: 'No documented link to buying in this category' };
    if (!sig.timeBound) return { ok: false, failed: 'Time-bound', why: 'Has no finite relevance window' };
    return { ok: true };
  }

  /* The same event from several sources is one signal: merge on eventId and keep every source. */
  function mergeEvents(signals) {
    const by = new Map(), out = [];
    signals.forEach(s => {
      const k = s.eventId || s.id;
      if (!by.has(k)) { const m = Object.assign({}, s, { sources: [{ name: s.sourceName, url: s.sourceUrl, id: s.id }], mergedIds: [s.id] }); by.set(k, m); out.push(m); }
      else { const m = by.get(k); m.sources.push({ name: s.sourceName, url: s.sourceUrl, id: s.id }); m.mergedIds.push(s.id); m.strength = Math.max(m.strength || 0, s.strength || 0) || m.strength; }
    });
    return out;
  }

  /* Entry gate, frequency: a repeat of the same type for the same account within the window counts less. */
  function repeatFactors(signals, cfg) {
    const f = new Map(), byType = {};
    signals.slice().sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate)).forEach(s => {
      const list = (byType[s.code] = byType[s.code] || []);
      const recent = list.filter(p => daysBetween(p.eventDate, s.eventDate) <= cfg.repeatWindowDays);
      const n = recent.length;
      f.set(s.id, { factor: cfg.repeatFactors[Math.min(n, cfg.repeatFactors.length - 1)], repeatNo: n + 1 });
      list.push(s);
    });
    return f;
  }

  /* One signal's points today: tier points × strength × repeat factor × decay. */
  function signalValue(sig, now, cfg, repeat) {
    const exp = expiryOf(sig, cfg);
    const age = daysBetween(sig.eventDate, now);
    if (new Date(now) > exp) return { value: 0, age, expired: true, decay: 0, expiresAt: exp };
    const zero = sig.expiresOn ? daysBetween(sig.eventDate, exp) : null;
    const decay = decayFactor(sig.tier, age, cfg, zero);
    const t = cfg.signalTiers[sig.tier];
    const sf = strengthFactor(sig.strength, cfg), rf = repeat ? repeat.factor : 1;
    const value = t.points * sf * rf * decay;
    return { value: round(value, 2), age, expired: value <= 0, decay: round(decay, 3), strengthF: sf, repeatF: rf, points: t.points, expiresAt: exp };
  }

  /* Timing: strongest first, each next one counts half the one before. No cap. */
  function stack(values) {
    return round(values.slice().sort((a, b) => b - a).reduce((t, v, i) => t + v * Math.pow(0.5, i), 0), 2);
  }

  /* Full signal pass for one account: filter, merge, gate, decay, stack. */
  function scoreSignals(signals, now, cfg, opts) {
    opts = opts || {};
    const discarded = [], kept = [];
    signals.forEach(s => {
      if (s.removedBy) { discarded.push(Object.assign({}, s, { failed: 'Disqualified', why: s.removedBy })); return; }
      if (new Date(s.capturedAt || s.eventDate) > new Date(now)) return; /* not captured yet */
      const q = qualify(s);
      if (!q.ok) discarded.push(Object.assign({}, s, { failed: q.failed, why: q.why })); else kept.push(s);
    });
    const merged = mergeEvents(kept);
    const rep = repeatFactors(merged, cfg);
    const live = [], expired = [];
    merged.forEach(s => {
      const v = signalValue(s, now, cfg, rep.get(s.id));
      const row = Object.assign({}, s, v, { repeatNo: rep.get(s.id).repeatNo, stale: opts.downSources && opts.downSources.includes(s.connector) });
      (v.expired ? expired : live).push(row);
    });
    live.sort((a, b) => b.value - a.value);
    live.forEach((s, i) => { s.weight = Math.pow(0.5, i); s.contribution = round(s.value * s.weight, 2); });
    return { live, expired, discarded, timing: stack(live.map(s => s.value)) };
  }

  /* ─── Fit, rank and tiers ─── */
  /* Weighted ICP match, 0 to 100. A missing key attribute holds the account unranked: a fit is never invented. */
  function fitScore(acc, icp) {
    const parts = [], missing = [];
    let total = 0, wsum = 0;
    icp.criteria.forEach(c => {
      const v = acc.attributes ? acc.attributes[c.attr] : undefined;
      wsum += c.weight;
      if (v === undefined || v === null || v === '') { if (c.key) missing.push(c.label); parts.push({ label: c.label, weight: c.weight, match: null, points: 0, value: null }); return; }
      let m = 0;
      if (c.type === 'in') m = c.values.includes(v) ? 1 : (c.partial && c.partial.includes(v) ? 0.5 : 0);
      else if (c.type === 'range') m = v >= c.min && v <= c.max ? 1 : (v >= c.min * 0.5 && v <= c.max * 2 ? 0.5 : 0);
      else if (c.type === 'min') m = v >= c.min ? 1 : (v >= c.min * 0.6 ? 0.5 : 0);
      else if (c.type === 'bool') m = v ? 1 : 0;
      parts.push({ label: c.label, weight: c.weight, match: m, points: round(c.weight * m, 1), value: v });
      total += c.weight * m;
    });
    if (missing.length) return { fit: null, parts, missing };
    return { fit: Math.round(total / wsum * 100), parts, missing };
  }

  function rankOf(fit, timing) { return fit == null ? null : round(fit * timing, 1); }

  /* Account tier A, B, C by percentile of rank among accounts with rank above 0. */
  function assignTiers(rows, cfg) {
    const ranked = rows.filter(r => r.rank > 0).sort((a, b) => b.rank - a.rank);
    const n = ranked.length, nA = Math.max(1, Math.round(n * cfg.accountTiers.A)), nB = Math.round(n * cfg.accountTiers.B);
    const tiers = new Map();
    ranked.forEach((r, i) => tiers.set(r.id, { tier: i < nA ? 'A' : i < nA + nB ? 'B' : 'C', position: i + 1 }));
    const cutA = ranked[nA - 1] ? ranked[nA - 1].rank : Infinity, cutB = ranked[nA + nB - 1] ? ranked[nA + nB - 1].rank : cutA;
    return { tiers, cutA, cutB, count: n };
  }
  function tierForRank(rank, cuts) { return !(rank > 0) ? null : rank >= cuts.cutA ? 'A' : rank >= cuts.cutB ? 'B' : 'C'; }

  /* ─── Confidence ─── */
  function confidence(f, cfg) {
    const C = cfg.confidence;
    const parts = {
      identity: C.identityScore[f.identityTier] != null ? C.identityScore[f.identityTier] : 0,
      sources: Math.min(f.sources || 0, 3) / 3,
      strength: f.strengths && f.strengths.length ? f.strengths.reduce((a, b) => a + b, 0) / f.strengths.length / 5 : 0,
      evidence: f.evidence != null ? f.evidence : 0
    };
    const value = round(Object.keys(C.weights).reduce((t, k) => t + C.weights[k] * parts[k], 0), 2);
    return { value, band: value >= C.high ? 'High' : value >= C.medium ? 'Medium' : 'Low', parts };
  }

  /* ─── Segmentation ─── */
  const TRIGGER = { Co1: 'Funding', P1: 'Exec hire', P2: 'Champion move', P3: 'Role change', M4: 'Compliance deadline', M1: 'Regulatory event', M2: 'Sector news', M3: 'Energy shift', Co3: 'Breach', Co4: 'M&A', Co5: 'Tech-stack change', Co2: 'Hiring surge', Co6: 'Tender or expansion', Co7: 'Filing language', Co8: 'Announcement', Co9: 'New plant head', Cm1: 'Rival renewal', Cm2: 'Rival health', Cm3: 'Researching a rival', Cm4: 'Rival in job posts', Cm5: 'Rival changes', P5: 'LinkedIn engagement', P6: 'LinkedIn engagement', P7: 'LinkedIn engagement' };
  const triggerOf = code => TRIGGER[code] || 'Other';
  const microsegment = (niche, top) => (niche || 'Unclassified') + ' × ' + (top ? triggerOf(top.code) : 'No trigger');

  /* The NBA or NBC rule: count accounts per microsegment whose trigger is inside the rolling window. */
  function nbcFlags(rows, now, cfg) {
    const by = {};
    rows.forEach(r => {
      if (!r.top || !(r.rank > 0)) return;
      if (daysBetween(r.top.eventDate, now) > cfg.campaign.windowDays) return;
      (by[r.microsegment] = by[r.microsegment] || []).push(r.id);
    });
    const flags = [], counts = {};
    Object.keys(by).forEach(k => { counts[k] = by[k].length; if (by[k].length >= cfg.campaign.threshold) flags.push({ microsegment: k, accountIds: by[k] }); });
    return { flags, counts };
  }

  /* ─── Message verification ─── */
  /* Claims must be an approved claim [C#] or a cited signal [S#]; banned phrases are blocked; a sentence with a figure needs a citation. */
  function verifyDraft(text, lib, citable) {
    const issues = [], t = text || '';
    if (!t.trim()) return { ok: false, issues: [{ kind: 'empty', detail: 'No draft' }] };
    lib.banned.forEach(b => { if (t.toLowerCase().includes(b.toLowerCase())) issues.push({ kind: 'Banned phrase', detail: '"' + b + '"' }); });
    const ok = new Set((lib.claims || []).map(c => c.id).concat(citable || []));
    (t.match(/\[([A-Z]+\d+)\]/g) || []).forEach(m => { const id = m.slice(1, -1); if (!ok.has(id)) issues.push({ kind: 'Unsupported claim', detail: m + ' is not an approved claim or a cited signal' }); });
    t.split(/(?<=[.!?])\s+/).forEach(s => { if (/\d+\s?%|£\s?\d|\$\s?\d|\b\d+x\b/i.test(s) && !/\[[A-Z]+\d+\]/.test(s)) issues.push({ kind: 'Unsupported claim', detail: 'A figure without a source: "' + s.trim().slice(0, 70) + '"' }); });
    (lib.toneRules || []).forEach(r => { if (new RegExp(r.pattern, 'i').test(t)) issues.push({ kind: 'Tone', detail: r.label }); });
    return { ok: issues.length === 0, issues };
  }

  /* ─── The five criteria and the route ─── */
  /* ctx: { protective: {ran, ok, reason}, identityTier, conf: {band}, verify: {ok}, policy, hasDraft, channel, campaign } */
  function evaluate(ctx) {
    const criteria = [
      { key: 'confidence', label: 'Confidence is high', ok: ctx.conf.band === 'High', detail: ctx.conf.band + ' (' + ctx.conf.value + ')' },
      { key: 'verification', label: 'Message verification passes', ok: !!ctx.hasDraft && ctx.verify.ok, detail: !ctx.hasDraft ? 'No draft was produced' : ctx.verify.ok ? 'Claims, banned phrases and tone pass' : ctx.verify.issues.map(i => i.kind + ': ' + i.detail).join('; ') },
      { key: 'protective', label: 'Every protective check passes', ok: ctx.protective.ran && ctx.protective.ok, detail: !ctx.protective.ran ? ctx.protective.reason : ctx.protective.ok ? 'Exclusions, suppression, open deal and recent touch pass' : ctx.protective.reason },
      { key: 'identity', label: 'Identity tier is I1 or I2', ok: ctx.identityTier === 'I1' || ctx.identityTier === 'I2', detail: 'Identity tier ' + ctx.identityTier },
      { key: 'policy', label: "The segment's autonomy policy allows it", ok: ctx.policy !== 'approval', detail: ctx.policy === 'approval' ? 'This segment requires a person to approve' : ctx.policy === 'autopilot' ? 'Autopilot' : 'Assisted: the rep clicks send' }
    ];
    const failed = criteria.filter(c => !c.ok);
    let route, reason, escalation = null;
    if (!ctx.protective.ran) { route = 'held'; reason = ctx.protective.reason; escalation = 5; }
    else if (ctx.identityTier === 'I4') { route = 'held'; reason = 'Identity dispute (I4): providers disagree, held until resolved'; escalation = ctx.heldCycles >= ctx.cyclesMax ? 10 : null; }
    else if (!ctx.protective.ok) { route = 'held'; reason = ctx.protective.reason; }
    else if (ctx.conf.band === 'Low') { route = 'nurture'; reason = 'Low confidence (' + ctx.conf.value + '): watched, not worked'; }
    else if (!ctx.hasDraft) { route = 'card'; reason = 'No draft produced'; escalation = 6; }
    else if (!ctx.channel) { route = 'card'; reason = 'No verified channel'; escalation = 7; }
    else if (failed.length) {
      route = 'card'; reason = 'Failed: ' + failed.map(f => f.label).join('; ');
      const k = failed[0].key; escalation = k === 'confidence' ? 1 : k === 'verification' ? 2 : k === 'identity' ? 3 : k === 'policy' ? 4 : 5;
    } else { route = ctx.policy === 'autopilot' ? 'autopilot' : 'ready'; reason = 'All five criteria met'; }
    return { route, reason, criteria, failed, escalation };
  }

  /* ─── Edits are stored as a diff ─── */
  function wordDiff(a, b) {
    const x = (a || '').split(/(\s+)/), y = (b || '').split(/(\s+)/), n = x.length, m = y.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0;
    const push = (op, s) => { const last = out[out.length - 1]; if (last && last.op === op) last.text += s; else out.push({ op, text: s }); };
    while (i < n && j < m) { if (x[i] === y[j]) { push('=', x[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) { push('-', x[i]); i++; } else { push('+', y[j]); j++; } }
    while (i < n) push('-', x[i++]); while (j < m) push('+', y[j++]);
    return out;
  }

  /* ─── Backtest ─── */
  /* Each case is scored as of its decision date, then placed with today's tier cut-offs.
     "degrade" ranks on fit alone (timing ignored), which is what the backtest exists to catch. */
  function backtest(cases, cuts, cfg, degrade) {
    const rows = cases.map(c => {
      const s = scoreSignals(c.signals, c.asOf, cfg);
      const timing = degrade ? 1 : s.timing;
      const rank = degrade ? round(c.fit * (cuts.cutA / 75), 1) : rankOf(c.fit, timing);
      return { id: c.id, set: c.set, name: c.name, outcome: c.outcome, fit: c.fit, timing: s.timing, rank, tier: tierForRank(rank, cuts) || 'Unranked' };
    });
    const inAB = set => rows.filter(r => r.set === set && (r.tier === 'A' || r.tier === 'B')).length;
    const rnd = rows.filter(r => r.set === 'random'), shareA = rnd.length ? rnd.filter(r => r.tier === 'A').length / rnd.length : 0;
    const won = inAB('won'), lost = inAB('lost'), B = cfg.backtest;
    const bars = [
      { label: 'Won accounts in Tier A or B', value: won + ' of 15', pass: won >= B.wonMinAB, bar: 'at least ' + B.wonMinAB + ' of 15' },
      { label: 'Lost accounts in Tier A or B', value: lost + ' of 15', pass: lost <= B.lostMaxAB, bar: 'at most ' + B.lostMaxAB + ' of 15' },
      { label: 'Random accounts in Tier A', value: Math.round(shareA * 100) + '%', pass: shareA <= B.randomMaxShareTierA, bar: 'no more than ' + Math.round(B.randomMaxShareTierA * 100) + '%' }
    ];
    return { rows, bars, pass: bars.every(b => b.pass), stop: won < B.stopBelowWon };
  }

  const ENGINE = { DAY, toDay, daysBetween, round, strengthFactor, decayFactor, expiryOf, qualify, mergeEvents, repeatFactors, signalValue, stack, scoreSignals, fitScore, rankOf, assignTiers, tierForRank, confidence, triggerOf, microsegment, nbcFlags, verifyDraft, evaluate, wordDiff, backtest };
  if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
  else root.DM_ENGINE = ENGINE;
})(typeof window !== 'undefined' ? window : globalThis);
