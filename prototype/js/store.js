/* Demand AI prototype: the store.
   Holds what people do in this session (decisions, sends, opt-outs, the clock, switches, settings) and runs the
   whole pipeline on the seed every time something changes: exclusions → signals → fit, timing, rank and tiers →
   segmentation and the NBA or NBC rule → the five criteria → routes and escalations.
   State is kept in this browser only; "Reset demo" clears it. */
(function () {
  const E = window.DM_ENGINE, BASE = window.DM_CONFIG, SEED = window.SEED;
  const KEY = 'dmproto_state_v1';
  const DAY = E.DAY;
  const clone = o => JSON.parse(JSON.stringify(o));
  const fresh = () => ({
    role: 'rep', repUser: 'sofia', offsetDays: 0, failures: { crm: false, exclusions: false, source: false, log: false }, cfg: {},
    decisions: [], sends: [], optOuts: [], cards: {}, expired: [], campaigns: {}, loggedReplies: [], draftEdits: {}, icp: null,
    icpFlow: { a: null, b: null }, policies: { 'Hydrogen project': 'approval' }, ticks: {}, autopilotRequests: [], degrade: false,
    nicheSet: {}, personaSet: {}, resolved: {}, matched: {}, runs: [], audit: [], exclusionsAdded: [], closedWon: null
  });
  let S;
  try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || 'null') || {}); } catch (e) { S = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* not saved */ } };

  const cfg = () => { const c = clone(BASE); const o = S.cfg || {}; Object.keys(o).forEach(k => { if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) c[k] = Object.assign(c[k] || {}, o[k]); else c[k] = o[k]; }); return c; };
  const now = () => new Date(new Date(BASE.baseNow).getTime() + S.offsetDays * DAY);
  const nowIso = () => now().toISOString().slice(0, 19);
  const users = SEED.users;
  const acct = id => SEED.accounts.find(a => a.id === id);
  const contact = id => SEED.contacts.find(c => c.id === id);
  const icp = () => S.icp || SEED.icp;

  /* ─── Audit: append-only. A failed write blocks the action (nothing happens unlogged). ─── */
  function log(kind, detail, extra) {
    if (S.failures.log) throw new Error('The decision log cannot be written, so the action was not taken.');
    const c = cfg();
    S.audit.push(Object.assign({ id: 'd' + (S.audit.length + 1), at: nowIso(), actor: actorName(), role: S.role, kind, detail, versions: Object.assign({}, c.versions) }, extra || {}));
  }
  const actorName = () => users[S.role === 'rep' ? S.repUser : BASE.roles[S.role].user].name;
  const userId = () => S.role === 'rep' ? S.repUser : BASE.roles[S.role].user;

  /* ─── The pipeline ─── */
  let M = null;
  function compute() {
    const c = cfg(), t = now(), T = nowIso();
    const pausedSeg = new Set(SEED.pausedSegments);
    /* Contact-level suppression: opt-outs added by the rep, do-not-contact, and opt-outs that have happened by now. */
    const suppressed = new Map();
    SEED.exclusions.filter(x => x.contactId).forEach(x => suppressed.set(x.contactId, x.kind + ': ' + x.reason));
    S.optOuts.forEach(o => suppressed.set(o.contactId, 'Opted out (' + o.by + ', ' + o.at.slice(0, 10) + ')'));
    SEED.futureEvents.filter(e => e.kind === 'opt-out' && e.at <= T).forEach(e => suppressed.set(e.contactId, 'Opted out: ' + e.text));
    const exclusions = SEED.exclusions.concat(S.exclusionsAdded);
    const accEx = id => exclusions.find(x => x.accountId === id && !x.contactId && x.kind !== 'Open deal');
    const downSources = S.failures.source ? ['NewsCatcher', 'GDELT'] : [];

    const rows = SEED.accounts.map(a => {
      const niche = S.nicheSet[a.id] !== undefined ? S.nicheSet[a.id] : (a.nicheConfidence < c.nicheConfidenceMin ? null : a.niche);
      const ex = accEx(a.id) || (pausedSeg.has(a.niche) ? { kind: 'Paused segment', reason: a.niche + ' is paused', source: 'Admin' } : null);
      const sig = E.scoreSignals(SEED.signals.filter(s => s.accountId === a.id), T, c, { downSources });
      const f = E.fitScore(a, icp());
      const rank = E.rankOf(f.fit, sig.timing);
      const top = sig.live[0] || null;
      return { id: a.id, a, niche, ex, sig, fit: f.fit, fitParts: f.parts, fitMissing: f.missing, timing: sig.timing, rank, top, microsegment: E.microsegment(niche, top) };
    });
    const tiering = E.assignTiers(rows.filter(r => !r.ex), c);
    rows.forEach(r => { const x = tiering.tiers.get(r.id); r.tier = r.ex ? null : x ? x.tier : null; r.position = x ? x.position : null; });

    /* NBA or NBC: new flags become campaigns; an existing campaign keeps its accounts. */
    const flags = E.nbcFlags(rows.filter(r => !r.ex), T, c);
    flags.flags.forEach(fl => { if (!S.campaigns[fl.microsegment]) S.campaigns[fl.microsegment] = { key: fl.microsegment, createdAt: T, state: 'pending', accountIds: fl.accountIds, touchesDone: {}, held: {}, replies: {}, edits: null }; });
    const campOf = id => Object.values(S.campaigns).find(k => k.accountIds.includes(id) && (k.state === 'pending' || k.state === 'confirmed'));

    const lastSend = id => S.sends.concat(SEED.sends).filter(s => s.accountId === id).sort((p, q) => q.at.localeCompare(p.at))[0];
    const decided = id => S.decisions.filter(d => d.accountId === id && d.cycle === cycleOf(id));
    rows.forEach(r => {
      const a = r.a;
      r.contacts = SEED.contacts.filter(x => x.accountId === a.id).map(x => Object.assign({}, x, { persona: S.personaSet[x.id] || x.persona, personaFlagged: S.personaSet[x.id] ? false : x.personaFlagged, suppressed: suppressed.get(x.id) || null }));
      const usable = r.contacts.filter(x => !x.stale && !x.suppressed);
      r.contact = (r.top && usable.find(x => x.persona === r.top.persona && x.identityTier !== 'I4')) || usable.find(x => x.persona === 'buyer' && x.identityTier !== 'I4') || usable.find(x => x.identityTier !== 'I4') || usable[0] || null;
      const ct = r.contact;
      const top3 = r.sig.live.slice(0, 3);
      r.conf = E.confidence({ identityTier: ct ? ct.identityTier : 'I5', sources: new Set(top3.flatMap(s => s.sources.map(x => x.name))).size, strengths: top3.map(s => s.strength || c.defaultStrength), evidence: top3.length ? top3.filter(s => s.evidence && s.sourceUrl).length / top3.length : 0 }, c);
      r.draft = Object.assign({}, SEED.drafts[a.id], S.draftEdits[a.id] ? { body: S.draftEdits[a.id].body, edited: true } : {});
      const citable = r.sig.live.flatMap(s => s.mergedIds).concat(SEED.content.cases.map(k => k.id));
      r.verify = E.verifyDraft(r.draft.body, SEED.content, citable);
      r.channel = !ct ? null : ct.emailVerified && !ct.failedChannels.includes('Email') ? 'Email' : ct.linkedin ? 'LinkedIn' : null;
      r.policy = S.policies[r.niche || a.niche] || 'assisted';
      if (r.policy === 'autopilot' && !(S.ticks[r.niche] && S.ticks[r.niche].backtest && S.ticks[r.niche].dryRun)) r.policy = 'assisted';
      /* Protective checks, failing closed. */
      const ls = lastSend(a.id), touchedDays = ls ? E.daysBetween(ls.at, T) : null;
      let protective = { ran: true, ok: true };
      const openDeal = exclusions.find(x => x.accountId === a.id && x.kind === 'Open deal');
      if (S.failures.crm) protective = { ran: false, ok: false, reason: 'CRM unreachable: the customer, open-deal and recent-touch checks could not run' };
      else if (S.failures.exclusions) protective = { ran: false, ok: false, reason: 'Exclusions list unreadable: the exclusion and suppression checks could not run' };
      else if (openDeal) protective = { ran: true, ok: false, reason: 'Open opportunity in the CRM: ' + openDeal.reason.replace(/^Open opportunity /, '') };
      else if (a.crm && a.crm.nameOnlyMatch && !S.resolved['name-' + a.id]) protective = { ran: true, ok: false, reason: 'Name-only match with a CRM account (' + a.crm.nameOnlyMatch + '): held until confirmed or rejected' };
      else if (touchedDays != null && touchedDays < c.recentTouchDays && !S.sends.some(s => s.accountId === a.id)) protective = { ran: true, ok: false, reason: 'Recent touch: ' + ls.channel.toLowerCase() + ' sent ' + Math.floor(touchedDays) + ' days ago' };
      r.protective = protective;
      r.lastSend = ls || null;
      if (r.ex) { r.route = 'excluded'; r.reason = r.ex.kind + ': ' + r.ex.reason; return; }
      if (r.fit == null) { r.route = 'unranked'; r.reason = 'Held unranked: missing ' + r.fitMissing.join(', ') + ' (a fit is never invented)'; return; }
      if (!(r.rank > 0)) { r.route = 'watch'; r.reason = r.sig.expired.length ? 'No live signal: everything has expired' : 'No live signal'; return; }
      if (!ct) { r.route = 'watch'; r.reason = 'No contact left to reach: every contact is suppressed or stale'; return; }
      const ev = E.evaluate({ protective, identityTier: ct.identityTier, heldCycles: ct.heldCycles, cyclesMax: c.heldRecordCycles, conf: r.conf, verify: r.verify, policy: r.policy, hasDraft: !r.draft.llmFailed && !!r.draft.body, channel: r.channel });
      Object.assign(r, { route: ev.route, reason: ev.reason, criteria: ev.criteria, failed: ev.failed, escalation: ev.escalation });
      const camp = campOf(a.id);
      if (camp && ['ready', 'card', 'autopilot'].includes(r.route)) { r.route = 'campaign'; r.campaign = camp.key; r.reason = camp.state === 'pending' ? 'In a campaign flag, waiting for the sales manager' : 'In a confirmed campaign'; }
      const d = decided(a.id);
      const sent = d.find(x => x.decision === 'sent' || x.decision === 'approved' || x.decision === 'edited');
      const skipped = d.find(x => x.decision === 'skipped');
      if (sent) { r.route = 'sent'; r.reason = 'Sent ' + sent.at.slice(0, 10) + (sent.decision === 'edited' ? ' after an edit' : sent.decision === 'approved' ? ' after approval' : ''); }
      else if (skipped) { r.route = 'skipped'; r.reason = 'Skipped: ' + (skipped.reason || 'no reason'); }
    });

    /* Approval cards: each has a due time; an untouched card expires and the account re-ranks. */
    rows.filter(r => r.route === 'card').forEach(r => { if (!S.cards[r.id]) S.cards[r.id] = { createdAt: T, cycle: cycleOf(r.id), rankAt: r.rank }; r.card = S.cards[r.id]; r.due = addDays(r.card.createdAt, c.escalationDueDays); });
    Object.keys(S.cards).forEach(id => { const r = rows.find(x => x.id === id); if (!r || r.route !== 'card') delete S.cards[id]; });
    rows.forEach(r => { r.expiredBefore = S.expired.filter(x => x.accountId === r.id).slice(-1)[0] || null; });

    M = { cfg: c, now: t, T, rows, byId: new Map(rows.map(r => [r.id, r])), tiering, flags, suppressed, exclusions, downSources };
    M.campaigns = Object.values(S.campaigns).map(k => campaignView(k));
    M.backtest = E.backtest(SEED.backtest, tiering, c, S.degrade);
    M.escalations = escalations();
    save();
    return M;
  }
  const cycleOf = id => S.expired.filter(x => x.accountId === id).length;
  const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * DAY).toISOString().slice(0, 19);

  /* ─── Campaigns ─── */
  function campaignView(k) {
    const c = cfg(), T = nowIso();
    const accs = k.accountIds.map(id => M.byId.get(id)).filter(Boolean);
    const trig = accs[0] && accs[0].top ? accs[0].top : null;
    const due = addDays(k.createdAt, c.escalationDueDays);
    const touches = c.campaign.touches.map(tc => Object.assign({}, tc, { message: touchText(tc, k, trig) }));
    const tasks = [];
    if (k.state === 'confirmed') accs.forEach(r => touches.forEach(tc => {
      const dueAt = addDays(k.confirmedAt, tc.day), key = r.id + ':' + tc.n;
      const done = k.touchesDone[key], replied = k.replies[r.id];
      let status = done ? 'Sent' : replied ? 'Removed: a reply was logged' : dueAt > T ? 'Scheduled' : 'Due';
      let hold = null;
      if (status === 'Due') {
        /* Before each touch the protective checks and message verification run again. */
        if (r.protective && !r.protective.ran) hold = r.protective.reason;
        else if (r.ex) hold = r.ex.kind + ': ' + r.ex.reason;
        else { const cid = k.contacts && k.contacts[r.id], ct = cid ? r.contacts.find(x => x.id === cid) : r.contact; if (!ct || ct.suppressed || ct.stale) hold = 'The contact ' + (ct ? ct.name + ' ' : '') + 'is now excluded (' + (ct ? ct.suppressed || ct.staleReason : 'none left') + ')'; }
        if (hold) status = 'Held';
      }
      tasks.push({ accountId: r.id, owner: r.a.owner, n: tc.n, day: tc.day, channel: tc.channel, dueAt, status, hold, key });
    }));
    return { key: k.key, state: k.state, createdAt: k.createdAt, due, confirmedAt: k.confirmedAt || null, accounts: accs, trigger: trig, touches, tasks, declinedReason: k.declinedReason || null, edits: k.edits };
  }
  function touchText(tc, k, trig) {
    const t = trig ? trig.title : 'the shared trigger', kase = SEED.content.cases.find(x => x.id === 'K1'), claim = SEED.content.claims.find(x => x.id === 'C9');
    if (k.edits && k.edits[tc.n]) return k.edits[tc.n];
    if (tc.n === 1) return `Hi {first},\n\n${t}: with the new date set, terminals like {account} are deciding how to collect and report the data [${trig ? trig.id : ''}]. Is the control system part of your plan?\n\nBest regards,\n{rep}`;
    if (tc.n === 2) return `Hi {first}, a short follow-up on the methane rules. ${claim.text.replace(/\.$/, '')} [${claim.id}]. ${kase.passage.replace(/\.$/, '')} [${kase.id}]. Happy to share how.`;
    return `Hi {first},\n\nWith the reporting date fixed [${trig ? trig.id : ''}] and monitoring possible without new cabling [${claim.id}], would 20 minutes next week help you size the work at {account}?\n\nBest regards,\n{rep}`;
  }

  /* ─── Escalations: owner, reason, due time, default ─── */
  function escalations() {
    const c = cfg(), out = [], T = nowIso();
    const TYPES = Object.fromEntries(SEED.escalationTypes.map(e => [e.n, e]));
    const add = (n, o) => out.push(Object.assign({ type: Number(n), label: TYPES[n].escalation, decide: TYPES[n].what_they_decide, defaultText: TYPES[n].due_and_default }, o));
    M.rows.forEach(r => {
      if (r.route === 'card') add(r.escalation, { id: 'card-' + r.id, owner: r.a.owner, accountId: r.id, reason: r.reason, due: r.due, overdue: r.due <= T, kind: 'card' });
      if (r.route === 'held' && r.escalation === 5) add(5, { id: 'held-' + r.id, owner: r.a.owner, accountId: r.id, reason: r.reason, due: null, kind: 'held' });
      if (r.contacts) r.contacts.filter(x => x.identityTier === 'I4' && x.heldCycles >= c.heldRecordCycles && !S.resolved['i4-' + x.id]).forEach(x => add(10, { id: 'i4-' + x.id, owner: r.a.owner, accountId: r.id, contactId: x.id, reason: x.name + ': providers disagree (' + x.foundBy + '), held for ' + x.heldCycles + ' refresh cycles', due: null, kind: 'record' }));
      if (r.a.crm && r.a.crm.nameOnlyMatch && !S.resolved['name-' + r.id] && !r.ex) add(10, { id: 'name-' + r.id, owner: r.a.owner, accountId: r.id, reason: 'Name-only CRM match: ' + r.a.crm.nameOnlyMatch, due: null, kind: 'record' });
      if (!r.niche && !r.ex && !S.resolved['niche-' + r.id]) add(12, { id: 'niche-' + r.id, owner: r.a.owner, accountId: r.id, reason: 'Niche unclear (classifier confidence ' + r.a.nicheConfidence + '): ' + (r.a.description || ''), due: null, kind: 'niche' });
      if (r.contacts && !r.ex) r.contacts.filter(x => x.personaFlagged).forEach(x => add(12, { id: 'persona-' + x.id, owner: r.a.owner, accountId: r.id, contactId: x.id, reason: 'Persona unclear for "' + x.title + '" (' + x.name + '): generic persona used', due: null, kind: 'persona' }));
    });
    SEED.replies.filter(x => !x.matched && !S.matched[x.id]).forEach(x => add(11, { id: 'reply-' + x.id, owner: 'sofia', reason: 'A reply from ' + x.from + ' could not be matched to a send: "' + x.text + '"', due: null, kind: 'reply', replyId: x.id }));
    M.campaigns.filter(k => k.state === 'pending').forEach(k => add(8, { id: 'camp-' + k.key, owner: 'daniel', campaign: k.key, reason: k.accounts.length + ' accounts share "' + k.key + '" inside ' + c.campaign.windowDays + ' days', due: k.due, overdue: k.due <= T, kind: 'campaign' }));
    M.campaigns.forEach(k => k.tasks.filter(t => t.status === 'Held').forEach(t => add(9, { id: 'touch-' + t.key, owner: t.owner, accountId: t.accountId, campaign: k.key, reason: 'Touch ' + t.n + ' held: ' + t.hold, due: null, kind: 'touch', task: t })));
    if (S.icpFlow.b && S.icpFlow.b.state === 'proposed') add(13, { id: 'icp-b', owner: 'rajiv', reason: 'An ICP was proposed from the website ' + SEED.icpProposal.website + ' and an interview; nothing is searched until it is confirmed', due: null, kind: 'icp' });
    if (!S.closedWon) add(14, { id: 'setup-closedwon', owner: 'rajiv', reason: 'The CRM field and value that mean closed-won are not set (with the sales leader)', due: null, kind: 'setup' });
    if (!M.backtest.pass) add(15, { id: 'backtest', owner: 'helen', reason: 'The scoring backtest is below the bar: ' + M.backtest.bars.filter(b => !b.pass).map(b => b.label + ' ' + b.value).join('; '), due: null, kind: 'backtest' });
    S.autopilotRequests.filter(x => !x.done).forEach(x => add(16, { id: 'auto-' + x.segment, owner: 'rajiv', reason: 'Autopilot requested for ' + x.segment + '; it can be enabled only after the backtest and a dry run pass', due: null, kind: 'autopilot', segment: x.segment }));
    return out;
  }

  /* ─── Actions ─── */
  function guard(fn) { return function () { try { const r = fn.apply(null, arguments); compute(); return r; } catch (e) { return { error: e.message }; } }; }
  const A = {
    setRole: r => { S.role = r; save(); },
    setRep: u => { S.repUser = u; save(); },
    advance: guard(days => {
      const before = M;
      S.offsetDays += days; log('Clock', 'Advanced time by ' + days + ' day' + (days > 1 ? 's' : ''));
      /* Untouched approval cards past their due time expire, and the account re-ranks. Checked before rescoring. */
      const T = nowIso();
      Object.entries(S.cards).forEach(([id, card]) => { const due = addDays(card.createdAt, M.cfg.escalationDueDays); if (due <= T) { const was = before.byId.get(id); S.expired.push({ accountId: id, at: due, rankBefore: was ? was.rank : null, positionBefore: was ? was.position : null }); delete S.cards[id]; log('Expired', 'Approval card for ' + acct(id).name + ' expired after ' + M.cfg.escalationDueDays + ' days; the account re-ranks', { accountId: id }); } });
      /* An unconfirmed campaign falls back to individual NBAs. */
      Object.values(S.campaigns).forEach(k => { if (k.state === 'pending' && addDays(k.createdAt, M.cfg.escalationDueDays) <= T) { k.state = 'fallback'; log('Campaign', 'No answer in ' + M.cfg.escalationDueDays + ' days: "' + k.key + '" fell back to individual next best actions'); } });
    }),
    reset: () => { const role = S.role, rep = S.repUser; S = fresh(); S.role = role; S.repUser = rep; save(); compute(); },
    send: guard((id, how) => {
      const r = M.byId.get(id);
      if (r.route === 'card' && how !== 'approved' && how !== 'edited') throw new Error('Refused: this send needs an approval first.');
      if (!r.protective.ran) throw new Error('Held: ' + r.protective.reason);
      const decision = how || 'sent';
      log('Send', (decision === 'sent' ? 'Sent' : decision === 'edited' ? 'Edited and sent' : 'Approved and sent') + ' to ' + r.contact.name + ' at ' + r.a.name + ' by ' + r.channel, { accountId: id });
      S.decisions.push({ accountId: id, decision, at: nowIso(), by: actorName(), cycle: cycleOf(id), diff: how === 'edited' ? S.draftEdits[id] && S.draftEdits[id].diff : null });
      S.sends.push({ id: 'snd-n' + (S.sends.length + 1), accountId: id, contactId: r.contact.id, channel: r.channel, at: nowIso(), by: userId(), signalIds: r.sig.live.slice(0, 3).map(s => s.id), messageVersion: 'm-' + (S.draftEdits[id] ? 2 : 1), ruleVersion: M.cfg.versions.rules, segment: r.microsegment, capture: 'Write-time capture', kind: 'NBA' });
      S.runs.push({ id: 'run-n' + S.runs.length, agent: 'Campaign agent (interim send)', at: nowIso(), rows: 1, cost: 0.02, promptVersion: M.cfg.versions.prompts, status: 'OK' });
    }),
    editDraft: guard((id, body) => {
      const r = M.byId.get(id), orig = SEED.drafts[id].body;
      S.draftEdits[id] = { body, diff: E.wordDiff(orig, body), at: nowIso(), by: actorName() };
      log('Edit', 'Edited the draft for ' + r.a.name + ' (stored as a diff)', { accountId: id, diff: S.draftEdits[id].diff });
    }),
    skip: guard((id, reason) => { log('Skip', 'Skipped ' + acct(id).name + ': ' + reason, { accountId: id }); S.decisions.push({ accountId: id, decision: 'skipped', reason, at: nowIso(), by: actorName(), cycle: cycleOf(id) }); }),
    optOut: guard(cid => { const c = contact(cid); log('Opt-out', c.name + ' at ' + acct(c.accountId).name + ' opted out; suppressed in every queue', { accountId: c.accountId }); S.optOuts.push({ contactId: cid, at: nowIso(), by: actorName() }); }),
    confirmCampaign: guard(key => { const k = S.campaigns[key]; k.state = 'confirmed'; k.confirmedAt = nowIso(); k.contacts = Object.fromEntries(k.accountIds.map(id => [id, M.byId.get(id).contact ? M.byId.get(id).contact.id : null])); log('Campaign', 'Confirmed "' + key + '": three touches for ' + k.accountIds.length + ' accounts, scheduled as tasks for each owner'); }),
    declineCampaign: guard((key, why) => { const k = S.campaigns[key]; k.state = 'declined'; k.declinedReason = why; log('Campaign', 'Declined "' + key + '": accounts go back to individual next best actions'); }),
    editTouch: guard((key, n, text) => { const k = S.campaigns[key]; k.edits = k.edits || {}; k.edits[n] = text; log('Campaign', 'Edited touch ' + n + ' of "' + key + '"'); }),
    sendTouch: guard((key, accountId, n) => { const k = S.campaigns[key], r = M.byId.get(accountId); const t = M.campaigns.find(x => x.key === key).tasks.find(x => x.accountId === accountId && x.n === n); if (t.status === 'Held') throw new Error('Held: ' + t.hold); k.touchesDone[accountId + ':' + n] = nowIso(); S.sends.push({ id: 'snd-n' + (S.sends.length + 1), accountId, contactId: r.contact && r.contact.id, channel: t.channel, at: nowIso(), by: userId(), signalIds: r.top ? [r.top.id] : [], messageVersion: 'campaign-t' + n, ruleVersion: M.cfg.versions.rules, segment: key, capture: 'Write-time capture', kind: 'Campaign touch ' + n }); log('Send', 'Campaign touch ' + n + ' sent to ' + r.a.name, { accountId }); }),
    skipTouch: guard((key, accountId, n) => { S.campaigns[key].touchesDone[accountId + ':' + n] = 'skipped'; log('Campaign', 'Skipped held touch ' + n + ' for ' + acct(accountId).name, { accountId }); }),
    logReply: guard((key, accountId) => { S.campaigns[key].replies[accountId] = nowIso(); S.loggedReplies.push({ accountId, at: nowIso(), by: actorName() }); log('Reply', 'Reply logged for ' + acct(accountId).name + '; its pending touches were removed', { accountId }); }),
    setFailure: guard((k, v) => { S.failures[k] = v; if (k !== 'log') log('Failure switch', (v ? 'On: ' : 'Off: ') + { crm: 'CRM unreachable', exclusions: 'Exclusions unreadable', source: 'A data source down' }[k]); }),
    setLogFailure: v => { S.failures.log = v; save(); compute(); },
    setCfg: guard((path, value) => { const parts = path.split('.'); let o = S.cfg; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {}; o[parts[parts.length - 1]] = value; log('Setting', path + ' set to ' + value + ' (new thresholds version)'); }),
    setPolicy: guard((seg, mode) => {
      if (mode === 'autopilot' && !(S.ticks[seg] && S.ticks[seg].backtest && S.ticks[seg].dryRun)) { if (!S.autopilotRequests.some(x => x.segment === seg && !x.done)) S.autopilotRequests.push({ segment: seg, at: nowIso() }); throw new Error('Autopilot stays off for ' + seg + ' until "backtest passed" and "dry run passed" are ticked.'); }
      S.policies[seg] = mode; S.autopilotRequests.forEach(x => { if (x.segment === seg) x.done = true; }); log('Policy', seg + ' set to ' + mode);
    }),
    tick: guard((seg, k, v) => { S.ticks[seg] = Object.assign({}, S.ticks[seg], { [k]: v }); log('Policy', seg + ': ' + (k === 'backtest' ? 'backtest passed' : 'dry run passed') + (v ? ' ticked' : ' cleared')); }),
    resolve: guard((id, text) => { S.resolved[id] = { at: nowIso(), by: actorName(), text }; log('Resolved', text); }),
    setNiche: guard((accId, niche) => { S.nicheSet[accId] = niche; log('Niche', acct(accId).name + ' set to ' + niche, { accountId: accId }); }),
    setPersona: guard((cid, p) => { S.personaSet[cid] = p; log('Persona', contact(cid).name + ' set to ' + p); }),
    matchReply: guard((rid, accId) => { S.matched[rid] = accId; log('Reply', 'Unmatched reply matched to ' + acct(accId).name, { accountId: accId }); }),
    confirmNameMatch: guard((accId, isCustomer) => { S.resolved['name-' + accId] = { at: nowIso(), by: actorName(), text: isCustomer ? 'Confirmed as a customer' : 'Rejected: not the same company' }; if (isCustomer) S.exclusionsAdded.push({ id: 'X-n-' + accId, kind: 'Customer', accountId: accId, reason: 'Confirmed CRM match', source: 'Rep', date: nowIso().slice(0, 10) }); log('CRM match', acct(accId).name + ': ' + S.resolved['name-' + accId].text, { accountId: accId }); }),
    addExclusion: guard(x => { S.exclusionsAdded.push(Object.assign({ id: 'X-u' + (S.exclusionsAdded.length + 1), date: nowIso().slice(0, 10), source: 'Admin' }, x)); log('Exclusion', 'Added: ' + x.kind + ' ' + (x.accountId ? acct(x.accountId).name : '') + ' (' + x.reason + ')'); }),
    removeExclusion: guard(id => { S.exclusionsAdded = S.exclusionsAdded.filter(x => x.id !== id); log('Exclusion', 'Removed ' + id); }),
    setDegrade: guard(v => { S.degrade = v; log('Backtest', v ? 'Rules degraded (rank on fit alone) to show the failure state' : 'Rules restored'); }),
    icpA: guard((text, criteria) => { S.icpFlow.a = { state: 'parsed', text, criteria, at: nowIso() }; }),
    icpAConfirm: guard(() => { const f = S.icpFlow.a; S.icp = Object.assign(clone(SEED.icp), { version: 'ICP v4 · confirmed ' + nowIso().slice(0, 10), text: f.text, criteria: f.criteria, path: 'A' }); f.state = 'confirmed'; log('ICP', 'Path A: ICP confirmed as v4; the list was built from it'); }),
    icpB: guard(site => { S.icpFlow.b = { state: 'proposed', site, at: nowIso() }; log('ICP', 'Path B: ICP proposed from ' + site + '; nothing searched until confirmed'); }),
    icpBConfirm: guard(() => { S.icp = Object.assign(clone(SEED.icp), { version: 'ICP v4 · proposed from the website, confirmed ' + nowIso().slice(0, 10), criteria: clone(SEED.icpProposal.criteria), path: 'B', text: 'Proposed from ' + SEED.icpProposal.website + ' and an interview, edited and confirmed by the admin.' }); S.icpFlow.b.state = 'confirmed'; log('ICP', 'Path B: proposed ICP confirmed; the list builds now'); }),
    icpRevert: guard(() => { S.icp = null; S.icpFlow = { a: null, b: null }; log('ICP', 'Back to ICP v3'); }),
    setClosedWon: guard((field, value) => { S.closedWon = { field, value }; log('Setup', 'Closed-won is "' + field + ' = ' + value + '"'); })
  };

  window.DM = { get S() { return S; }, get M() { return M; }, compute, A, now, nowIso, cfg, acct, contact, users, SEED, addDays, icp, userId, actorName, KEY };
  compute();
})();
