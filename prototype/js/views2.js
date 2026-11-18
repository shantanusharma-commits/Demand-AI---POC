/* Demand AI prototype: Admin, backtest report, demo-data screens (R2 and R3), Coming tiles, Slack and Teams preview, presenter path. */
(function () {
  const D = window.DM, E = window.DM_ENGINE, U = () => window.UI;
  const esc = s => U().esc(s);
  const sw = (on, js, neg) => `<button class="switch ${neg ? 'neg' : ''} ${on ? 'on' : ''}" role="switch" aria-checked="${on}" onclick="${js}"></button>`;
  const page = (title, sub, extra) => `<div class="page-h"><div class="grow"><h1>${title}</h1><div class="sub">${sub}</div></div>${extra || ''}</div>`;
  const niches = () => [...new Set(D.SEED.accounts.map(a => a.niche).filter(Boolean))].sort();

  /* ─── Admin ─── */
  const ATABS = [['icp', 'ICP'], ['exclusions', 'Exclusions'], ['content', 'Content Library'], ['thresholds', 'Thresholds'], ['autonomy', 'Autonomy policy'], ['failures', 'Simulate failure'], ['connectors', 'Connectors'], ['runs', 'Run log and cost'], ['audit', 'Audit log']];
  function vAdmin(tab) {
    tab = tab || 'icp';
    const body = { icp: aIcp, exclusions: aEx, content: aContent, thresholds: aThr, autonomy: aAuto, failures: aFail, connectors: aConn, runs: aRuns, audit: aAudit }[tab]();
    return page('Admin', 'Configuration for ' + esc(D.SEED.tenant.name) + ' (the seller, invented). Every change is versioned and lands in the audit log.') + `<div class="tabs">${ATABS.map(t => `<button class="${tab === t[0] ? 'on' : ''}" onclick="UI.go('admin/${t[0]}')">${t[1]}</button>`).join('')}</div>${body}`;
  }
  const critTable = cr => `<table class="tbl"><thead><tr><th>Criterion</th><th>Rule</th><th>Weight</th></tr></thead><tbody>${cr.map(c => `<tr><td>${esc(c.label)}${c.key ? ' <span class="badge b-grey">key</span>' : ''}</td><td class="sm">${c.type === 'in' ? esc(c.values.join(', ')) + (c.partial && c.partial.length ? ' <span class="muted">(half: ' + esc(c.partial.join(', ')) + ')</span>' : '') : c.type === 'range' ? c.min + ' to ' + c.max : c.type === 'min' ? 'at least ' + c.min : esc(c.type)}</td><td class="mono">${c.weight}</td></tr>`).join('')}</tbody></table>`;
  /* Path A: a pasted ICP becomes criteria and weights. */
  function parseIcp(t) {
    const base = JSON.parse(JSON.stringify(D.SEED.icp.criteria)), s = t.toLowerCase();
    const N = [[/refiner/, 'Refinery'], [/petrochem/, 'Petrochemical complex'], [/lng/, 'LNG terminal'], [/gas processing/, 'Gas processing plant'], [/chemical/, 'Specialty chemicals plant'], [/water/, 'Water treatment works'], [/power/, 'Power station'], [/hydrogen/, 'Hydrogen project'], [/tank|storage/, 'Tank storage terminal']].filter(([re]) => re.test(s)).map(x => x[1]);
    const R = [[/uk|ireland|britain/, 'UK & Ireland'], [/nordic|norway|sweden|denmark|finland/, 'Nordics'], [/benelux|netherlands|belgium/, 'Benelux'], [/dach|germany|austria|switzerland/, 'DACH'], [/middle east|gulf|uae/, 'Middle East'], [/south east asia|singapore|malaysia/, 'South East Asia']].filter(([re]) => re.test(s)).map(x => x[1]);
    if (N.length) base[0].values = [...new Set(N)].filter(n => n !== 'Specialty chemicals plant' || /speciality|specialty|chemicals plant/.test(s));
    if (R.length) base[1].values = R;
    const st = s.match(/([\d,]+)\s*(?:to|-)\s*([\d,]+)\s*(?:staff|employees|people)/); if (st) { base[2].min = +st[1].replace(/,/g, ''); base[2].max = +st[2].replace(/,/g, ''); }
    const ag = s.match(/older than (\d+)\s*years/); if (ag) base[3].min = +ag[1];
    const si = s.match(/(one|two|three|four|\d+) or more sites/); if (si) base[4].min = ({ one: 1, two: 2, three: 3, four: 4 })[si[1]] || +si[1];
    return base;
  }
  /* The list build: search on free attributes, fit check, pay for enrichment only for those that pass. */
  function coldStart(criteria) {
    const icp = { criteria };
    const scored = D.SEED.candidates.map(c => ({ c, fit: E.fitScore({ attributes: { niche: c.niche, region: c.region, employees: c.employees, controlAge: c.controlAge, sites: c.sites } }, icp).fit }));
    const pass = scored.filter(x => x.fit != null && x.fit >= 50);
    const listIds = new Set(D.SEED.accounts.filter(a => pass.some(p => p.c.name === a.name)).map(a => a.id));
    const cts = D.SEED.contacts.filter(c => listIds.has(c.accountId));
    const tiers = ['I1', 'I2', 'I3', 'I4', 'I5'].map(t => [t, cts.filter(c => c.identityTier === t).length]);
    const cust = D.SEED.exclusions.filter(x => x.kind === 'Customer' && listIds.has(x.accountId)).length;
    return `<div class="grid g4" style="margin:10px 0">${[['Candidates found', D.SEED.candidates.length, 'Free attributes only: no paid call'], ['Passed the fit check', pass.length, 'Fit 50 or more on free attributes'], ['Enrichment spend', pass.length + ' credits', 'One per passing account, so spend = ' + pass.length], ['Dropped before enrichment', D.SEED.candidates.length - pass.length, 'Poor fit, never paid for']].map(k => `<div class="kpi"><div class="k">${k[0]}</div><div class="v">${k[1]}</div><div class="d">${k[2]}</div></div>`).join('')}</div>
      <div class="grid g2"><div class="card"><div class="card-h"><h3>Waterfall and identity tiers</h3></div><div class="card-b">${tiers.map(([t, n]) => `<div class="brk"><div>${U().idTier(t)}<div class="sm muted">${esc({ I1: 'Apollo, first try', I2: 'ZoomInfo after Apollo missed; Lusha agrees', I3: 'ZoomInfo fallback; Lusha silent', I4: 'ZoomInfo fallback; Lusha disagrees (held)', I5: 'Lusha only' }[t])}</div></div><div class="bar"><i style="width:${n / Math.max(1, cts.length) * 100}%"></i></div><div class="mono">${n}</div></div>`).join('')}</div></div>
      <div class="card"><div class="card-h"><h3>CRM deduplication (read-only)</h3></div><div class="card-b"><div class="set"><div class="grow"><div class="k">${cust} customers removed</div><div class="d">Domain match on both sides</div></div></div><div class="set"><div class="grow"><div class="k">1 name-only match held</div><div class="d">Dunmore Chemicals: held with a reason, not dropped</div></div></div><div class="set"><div class="grow"><div class="k">0 write calls to the CRM</div><div class="d">Demand AI reads the CRM and never writes to it</div></div></div></div></div></div>`;
  }
  function aIcp() {
    const S = D.S, icp = D.icp(), a = S.icpFlow.a, b = S.icpFlow.b, P = D.SEED.icpProposal;
    const sample = D.SEED.candidates.map(c => ({ c, fit: E.fitScore({ attributes: { niche: c.niche, region: c.region, employees: c.employees, controlAge: c.controlAge, sites: c.sites } }, { criteria: P.criteria }).fit })).filter(x => x.fit >= 70).slice(0, 8);
    return `<div class="grid g2" style="align-items:start"><div class="card"><div class="card-h"><h3>Active ICP</h3><span class="badge b-pos">${esc(icp.version)}</span>${S.icp ? '<button class="btn sm ghost" onclick="UIX.icpRevert()">Back to v3</button>' : ''}</div><div class="card-b"><p class="sm">${esc(icp.text)}</p>${critTable(icp.criteria)}<div class="sm muted" style="margin-top:6px">Weights: ${esc(D.SEED.icp.weightsSource)}</div></div></div>
      <div class="card"><div class="card-h"><h3>Setup decision: closed-won</h3>${S.closedWon ? '<span class="badge b-pos">Set</span>' : '<span class="badge b-or">Blocks go-live</span>'}</div><div class="card-b"><p class="sm">The CRM field and value that mean closed-won. Decided by the admin with the sales leader.</p>
        <div class="row wrap"><select class="sel" id="cwF"><option>Opportunity.Stage</option><option>Account.Type</option></select><select class="sel" id="cwV"><option>Closed won</option><option>Customer</option></select><button class="btn pri" onclick="UIX.closedWon()">Save</button></div>${S.closedWon ? `<div class="note pos" style="margin-top:10px">Closed-won is ${esc(S.closedWon.field)} = ${esc(S.closedWon.value)}</div>` : ''}</div></div></div>
      <div class="card" style="margin-top:14px"><div class="card-h"><h3>Path A: the customer shares an ICP</h3><span class="sm muted">Scenario 1</span></div><div class="card-b">
        <label class="lbl" for="icpText">Paste the ICP</label><textarea class="inp" id="icpText" style="min-height:80px">${esc(a ? a.text : 'We sell control system upgrades to refineries, petrochemical plants and LNG terminals in the UK, Ireland, the Nordics and Benelux. 1,000 to 10,000 staff, control systems older than 12 years, two or more sites.')}</textarea>
        <div class="row" style="margin-top:8px"><button class="btn" onclick="UIX.parseA()">Show it as criteria</button>${a && a.state === 'parsed' ? '<button class="btn pri" onclick="UIX.confirmA()">Confirm and build the list</button>' : ''}</div>
        ${a ? `<div style="margin-top:12px">${critTable(a.criteria)}</div>${a.state === 'confirmed' ? '<div class="note pos" style="margin-top:10px">Confirmed as a new version. The list was built from it:</div>' : '<div class="note" style="margin-top:10px">Check the criteria and weights, then confirm. Preview of the list build:</div>'}${coldStart(a.criteria)}` : ''}</div></div>
      <div class="card" style="margin-top:14px"><div class="card-h"><h3>Path B: the customer does not know their ICP</h3><span class="sm muted">Scenario 2</span></div><div class="card-b">
        <div class="row wrap"><label class="sm" for="site">Website</label><input class="inp" id="site" value="${esc(P.website)}"><button class="btn" onclick="UIX.pathB()">Read the website and propose</button></div>
        ${b ? `<div class="grid g2" style="margin-top:12px;align-items:start"><div><div class="lbl">What the AI read</div><ul class="sm">${P.read.map(x => '<li>' + esc(x) + '</li>').join('')}</ul><div class="lbl">Short interview</div><ul class="sm">${P.interview.map(x => '<li>' + esc(x) + '</li>').join('')}</ul></div><div><div class="lbl">Proposed ICP</div>${critTable(P.criteria)}</div></div>
          <div class="lbl" style="margin-top:12px">Sample of matching accounts <span class="tag-demo">Sample, nothing searched</span></div><div class="sm">${sample.map(x => esc(x.c.name) + ' (' + esc(x.c.niche) + ', fit ' + x.fit + ')').join(' · ')}</div>
          ${b.state === 'proposed' ? '<div class="note warn" style="margin-top:10px">Nothing is searched until you confirm. This is an escalation for the admin until then.</div><div class="row" style="margin-top:8px"><button class="btn pri" onclick="UIX.confirmB()">Confirm the proposed ICP</button></div>' : '<div class="note pos" style="margin-top:10px">Confirmed. The list builds from the proposed ICP:</div>' + coldStart(P.criteria)}` : ''}</div></div>`;
  }
  function aEx() {
    const L = D.M.exclusions;
    return `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Kind</th><th>Who</th><th>Reason</th><th>Source</th><th>Date</th><th></th></tr></thead><tbody>${L.map(x => `<tr><td><span class="badge b-neg">${esc(x.kind)}</span></td><td>${x.accountId ? esc(D.acct(x.accountId).name) : ''}${x.contactId ? ' · ' + esc(D.contact(x.contactId).name) : ''}${x.segment ? esc(x.segment) : ''}</td><td class="sm">${esc(x.reason)}</td><td class="sm">${esc(x.source)}</td><td class="sm">${esc(x.date)}</td><td>${String(x.id).startsWith('X-u') ? `<button class="btn sm ghost" onclick="UIX.rmEx('${x.id}')">Remove</button>` : ''}</td></tr>`).join('')}
      ${D.S.optOuts.map(o => `<tr><td><span class="badge b-neg">Opt-out</span></td><td>${esc(D.contact(o.contactId).name)}</td><td class="sm">Added by the rep</td><td class="sm">${esc(o.by)}</td><td class="sm">${esc(o.at.slice(0, 10))}</td><td></td></tr>`).join('')}</tbody></table></div>
      <div class="card" style="margin-top:14px"><div class="card-h"><h3>Add an exclusion</h3></div><div class="card-b row wrap"><select class="sel" id="exK"><option>Customer</option><option>Competitor</option><option>Partner</option><option>Do not contact</option></select><select class="sel" id="exA">${D.SEED.accounts.slice().sort((p, q) => p.name.localeCompare(q.name)).map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select><input class="inp" id="exR" placeholder="Reason" value="Signed a partner agreement"><button class="btn pri" onclick="UIX.addEx()">Add</button><span class="sm muted">Applied on the next run; the account leaves every queue.</span></div></div>`;
  }
  function aContent() {
    const C = D.SEED.content;
    return `<div class="grid g2" style="align-items:start"><div class="card"><div class="card-h"><h3>Voice and tone</h3></div><div class="card-b"><ul class="sm">${C.voice.map(v => '<li>' + esc(v) + '</li>').join('')}</ul><div class="lbl">Examples of bad drafts</div><ul class="sm">${C.badExamples.map(v => '<li>' + esc(v) + '</li>').join('')}</ul></div></div>
      <div class="card"><div class="card-h"><h3>Banned phrases</h3><span class="sm muted">Blocked in message verification</span></div><div class="card-b row wrap">${C.banned.map(b => `<span class="badge b-neg">${esc(b)}</span>`).join('')}</div><div class="card-h"><h3>Templates</h3></div><div class="card-b">${C.templates.map(t => `<div class="set"><div class="grow"><div class="k">${esc(t.name)}</div><div class="d">${esc(t.structure)}</div></div><span class="badge b-grey">${esc(t.status)}</span></div>`).join('')}</div></div></div>
      <div class="card" style="margin-top:14px"><div class="card-h"><h3>Approved claims</h3><span class="sm muted">Each with its source and review date</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Claim</th><th>Source</th><th>Reviewed</th></tr></thead><tbody>${C.claims.map(c => `<tr><td class="mono">${c.id}</td><td>${esc(c.text)}</td><td class="sm">${esc(c.source)}</td><td class="sm">${esc(c.reviewDate)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card" style="margin-top:14px"><div class="card-h"><h3>Knowledge Hub: case-study passages</h3></div><div class="card-b">${C.cases.map(k => `<div class="set"><span class="cite">${k.id}</span><div class="grow"><div class="k">${esc(k.title)}</div><div class="d">"${esc(k.passage)}" · ${esc(k.doc)}, ${esc(k.page)}</div></div></div>`).join('')}
        <div class="row wrap" style="margin-top:10px"><input class="inp grow" id="hubQ" placeholder="Ask the Knowledge Hub, e.g. methane or alarm floods"><button class="btn" onclick="UIX.hub()">Search</button></div><div id="hubA" style="margin-top:8px"></div></div></div>`;
  }
  function aThr() {
    const c = D.cfg(), f = (label, path, val, step, d) => `<div class="set"><div class="grow"><div class="k">${label}</div><div class="d">${d}</div></div><input class="inp" type="number" step="${step}" value="${val}" style="width:100px" onchange="UIX.cfg('${path}',this.value)"></div>`;
    return `<div class="grid g2" style="align-items:start"><div class="card"><div class="card-h"><h3>Confidence bands</h3><span class="sm muted">${esc(c.versions.thresholds)}</span></div><div class="card-b">${f('High from', 'confidence.high', c.confidence.high, 0.05, 'At or above: high')}${f('Medium from', 'confidence.medium', c.confidence.medium, 0.05, 'Below this: low, so nurture')}</div></div>
      <div class="card"><div class="card-h"><h3>Campaign rule</h3></div><div class="card-b">${f('Campaign threshold', 'campaign.threshold', c.campaign.threshold, 1, 'Accounts in one microsegment')}${f('Rolling window (days)', 'campaign.windowDays', c.campaign.windowDays, 1, 'Inside this window')}</div></div>
      <div class="card"><div class="card-h"><h3>Account tiers</h3></div><div class="card-b">${f('Tier A share', 'accountTiers.A', c.accountTiers.A, 0.05, 'Top share of ranked accounts')}${f('Tier B share', 'accountTiers.B', c.accountTiers.B, 0.05, 'The next share')}</div></div>
      <div class="card"><div class="card-h"><h3>Escalations and checks</h3></div><div class="card-b">${f('Due time (days)', 'escalationDueDays', c.escalationDueDays, 1, 'Then the default applies')}${f('Recent touch (days)', 'recentTouchDays', c.recentTouchDays, 1, 'A touch inside this holds the account')}</div></div></div>
      <div class="note" style="margin-top:12px">Every value changes the result live: try a campaign threshold of 12, or a high-confidence band of 0.85. Signal tiers, decay and strength factors are in js/config.js.</div>`;
  }
  function aAuto() {
    const S = D.S, bt = D.M.backtest.pass;
    return `<div class="note" style="margin-bottom:12px">Assisted is the default: the rep clicks send. Autopilot can be switched on per segment only after "backtest passed" and "dry run passed" are ticked. A segment set to require approval gives every item an approval card. Policy unreadable falls back to assisted.</div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Segment</th><th>Policy</th><th>Backtest passed</th><th>Dry run passed</th></tr></thead><tbody>${niches().map(n => { const t = S.ticks[n] || {}, p = S.policies[n] || 'assisted'; return `<tr><td class="nm">${esc(n)}</td><td><select class="sel" onchange="UIX.policy('${esc(n)}',this.value)">${[['assisted', 'Assisted (rep clicks send)'], ['approval', 'Requires approval'], ['autopilot', 'Autopilot']].map(o => `<option value="${o[0]}" ${p === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></td><td>${sw(t.backtest, `UIX.tick('${esc(n)}','backtest',${!t.backtest})`)} ${!bt ? '<span class="sm muted">Backtest failing</span>' : ''}</td><td>${sw(t.dryRun, `UIX.tick('${esc(n)}','dryRun',${!t.dryRun})`)}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function aFail() {
    const f = D.S.failures, row = (k, t, d) => `<div class="set">${sw(f[k], `UIX.fail('${k}',${!f[k]})`, true)}<div class="grow"><div class="k">${t}</div><div class="d">${d}</div></div></div>`;
    return `<div class="card"><div class="card-h"><h3>Simulate failure</h3><span class="sm muted">Fail closed: a protective check that cannot run holds the action, never drops it</span></div><div class="card-b">
      ${row('crm', 'CRM unreachable', 'Customer, open-deal and recent-touch checks cannot run: nothing is routed, every item is held, and the rep sees the reason. Scenario 7.')}
      ${row('exclusions', 'Exclusions list unreadable', 'Exclusion and suppression checks cannot run: nothing is routed until they can.')}
      ${row('source', 'A data source is down', 'NewsCatcher and GDELT stop: their signals keep the last good data, marked stale, and the admin is alerted.')}
      ${row('log', 'Decision log unavailable', 'Every action is blocked, because nothing may happen unlogged.')}</div></div>`;
  }
  function aConn() {
    const down = D.S.failures.source;
    return `<div class="note" style="margin-bottom:12px">Every connector takes its key from secrets, declares rate limits, retries (429 and 5xx with backoff; never 400, 401 or 403), stamps source and date, and writes to memory. With no key it serves cached data and says so. ${U().cacheTag}</div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Connector</th><th>Category</th><th>What it gives</th><th>Access</th><th>Release</th><th>Mode</th><th>Fallback</th></tr></thead><tbody>${D.SEED.connectors.map(c => { const isDown = down && /NewsCatcher|GDELT/.test(c.connector); return `<tr><td class="nm">${esc(c.connector)}</td><td class="sm">${esc(c.category)}</td><td class="sm" style="max-width:280px">${esc(c.what_it_gives)}</td><td class="sm">${esc(c.access)}</td><td class="sm">${esc(c.release)}</td><td>${isDown ? '<span class="badge b-neg">Down: last good data, stale</span>' : c.mode === 'Not connected' ? '<span class="badge b-grey">Not connected</span>' : `<span class="tag-cache">${esc(c.mode)} data</span>`}</td><td class="sm">${esc(c.fallback)}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function aRuns() {
    const runs = D.SEED.runs.concat(D.S.runs).sort((a, b) => b.at.localeCompare(a.at)), cap = D.cfg().costCap;
    const month = runs.reduce((t, r) => t + r.cost, 0) * 2.1, share = month / cap.monthly;
    return `<div class="grid g3" style="margin-bottom:14px"><div class="kpi"><div class="k">Cost this month (projected)</div><div class="v">${cap.currency} ${month.toFixed(0)}</div><div class="d">Cap ${cap.currency} ${cap.monthly}</div></div><div class="kpi"><div class="k">Share of cap</div><div class="v">${Math.round(share * 100)}%</div><div class="bar ${share > cap.alertAt ? 'or' : ''}"><i style="width:${Math.min(100, share * 100)}%"></i></div><div class="d">Alerts at ${cap.alertAt * 100}%, stops non-essential runs at 100%</div></div><div class="kpi"><div class="k">Model calls with a prompt version</div><div class="v">100%</div><div class="d">${esc(D.cfg().versions.prompts)}</div></div></div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Agent</th><th>Rows</th><th>Cost</th><th>Prompt version</th><th>Status</th></tr></thead><tbody>${runs.slice(0, 60).map(r => `<tr><td class="sm">${U().fdt(r.at)}</td><td>${esc(r.agent)}</td><td class="mono">${r.rows}</td><td class="mono">${cap.currency} ${r.cost.toFixed(2)}</td><td class="sm">${esc(r.promptVersion)}</td><td class="sm">${esc(r.status)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function aAudit() {
    const L = D.S.audit.slice().reverse();
    return `<div class="row" style="margin-bottom:10px"><span class="sm muted">Append-only. Each record carries the actor and the versions in force, so an older decision still shows the old version.</span><span class="sp"></span><button class="btn" onclick="UIX.exportAudit()">Export</button></div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Actor</th><th>Kind</th><th>What</th><th>Versions</th></tr></thead><tbody>${L.map(x => `<tr><td class="sm">${U().fdt(x.at)}</td><td class="sm">${esc(x.actor)}</td><td><span class="badge b-grey">${esc(x.kind)}</span></td><td class="sm">${esc(x.detail)}${x.diff ? '<div class="draft" style="margin-top:4px;padding:6px 8px">' + x.diff.map(p => p.op === '=' ? esc(p.text.length > 60 ? p.text.slice(0, 25) + ' … ' + p.text.slice(-25) : p.text) : `<span class="${p.op === '+' ? 'diff-add' : 'diff-del'}">${esc(p.text)}</span>`).join('') + '</div>' : ''}</td><td class="sm muted">${esc(x.versions.rules)} · ${esc(x.versions.thresholds)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No decisions yet in this session.</td></tr>'}</tbody></table></div>`;
  }

  /* ─── Backtest report ─── */
  function vBacktest() {
    const B = D.M.backtest, sets = ['won', 'lost', 'random'];
    return page('Scoring backtest', '15 won, 15 lost and 15 random known accounts, scored blind as of their decision date and placed with today\'s tier cut-offs. Nothing reaches reps until this passes.', `<div class="row"><span class="sm">Degrade the rules</span>${sw(D.S.degrade, `UIX.degrade(${!D.S.degrade})`, true)}</div>`) +
      `<div class="note ${B.pass ? 'pos' : 'neg'}" style="margin-bottom:14px"><b>${B.pass ? 'Pass: release allowed.' : 'Fail: release blocked.'}</b> ${B.pass ? 'Scoring can go to reps after a dry run on one rep\'s list.' : B.stop ? 'Below 9 of 15 won: sell research, not scoring. ' : 'Fix and rerun. '}${D.S.degrade ? 'The rules are degraded to rank on fit alone, which is exactly the failure the backtest exists to catch.' : ''}</div>
      <div class="grid g3" style="margin-bottom:14px">${B.bars.map(b => `<div class="kpi"><div class="k">${esc(b.label)}</div><div class="v">${esc(b.value)}</div><div class="d"><span class="badge ${b.pass ? 'b-pos' : 'b-neg'}">${b.pass ? 'Pass' : 'Fail'}</span> bar: ${esc(b.bar)}</div></div>`).join('')}</div>
      <div class="grid g3">${sets.map(s => `<div class="card"><div class="card-h"><h3>${s[0].toUpperCase() + s.slice(1)} (15)</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Fit</th><th>Timing</th><th>Tier</th></tr></thead><tbody>${B.rows.filter(r => r.set === s).map(r => `<tr><td class="sm">${esc(r.name)}<div class="muted">${esc(r.outcome)}</div></td><td class="mono">${r.fit}</td><td class="mono">${U().fmtN(r.timing)}</td><td>${r.tier === 'Unranked' ? '<span class="badge b-grey">Rank 0</span>' : U().tierBadge(r.tier, true)}</td></tr>`).join('')}</tbody></table></div></div>`).join('')}</div>`;
  }

  /* ─── Demo-data screens ─── */
  const DM = () => D.SEED.demo;
  function vReplies() {
    const L = DM().replies, order = ['Hot', 'Further action', 'Not now', 'Wrong person', 'Disqualified', 'Opted out'];
    return page('Who replied since yesterday ' + U().demoTag, 'Six reply statuses, Hot first, each with a default next step and a grounded draft. Ships in R2; seeded here.') +
      `<div class="grid g3" style="margin-bottom:14px">${order.map(s => `<div class="kpi"><div class="k">${s}</div><div class="v">${L.filter(r => r.status === s).length}</div></div>`).join('')}</div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Status</th><th>Account</th><th>Reply</th><th>Default next step</th><th>Draft</th></tr></thead><tbody>${order.flatMap(s => L.filter(r => r.status === s)).map(r => `<tr><td><span class="badge ${r.status === 'Hot' ? 'b-or' : r.status === 'Opted out' || r.status === 'Disqualified' ? 'b-neg' : 'b-grey'}">${r.status}</span></td><td class="nm">${esc(r.account)}</td><td class="sm">"${esc(r.text)}"</td><td class="sm">${esc(r.next)}</td><td class="sm">${r.draft ? U().cite(r.draft) : '<span class="muted">–</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function vFunnel() {
    const F = DM().funnel, S = DM().scorecards;
    return page('Funnel and scorecards ' + U().demoTag, esc(F.note) + ' Ships in R2; seeded here.') +
      `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Per 100 accounts worked</h3><span class="sm"><span class="badge b-pur">Prioritised by Demand AI</span> <span class="badge b-grey">The rest</span></span></div><div class="card-b">${F.per100.map(r => `<div class="brk" style="grid-template-columns:140px 1fr 90px"><div>${r[0]}</div><div><div class="bar"><i style="width:${r[1]}%"></i></div><div class="bar" style="margin-top:3px;background:#F3F1F6"><i style="width:${r[2]}%;background:#B9B3C4"></i></div></div><div class="mono">${r[1]} / ${r[2]}</div></div>`).join('')}</div></div>
      <div class="grid g3">${[['Sales rep (activity)', S.rep], ['Sales manager (rates)', S.manager], ['Sales leader (money)', S.leader]].map(([t, rows]) => `<div class="card"><div class="card-h"><h3>${t}</h3></div><div class="card-b">${rows.map(r => `<div class="set"><div class="grow">${esc(r[0])}</div><b>${esc(r[1])}</b></div>`).join('')}</div></div>`).join('')}</div>`;
  }
  function vAssets() {
    return page('Generated assets ' + U().demoTag, 'One-pagers and decks grounded in the Knowledge Hub, every line cited. Ships in R2; seeded here.') +
      `<div class="grid g2">${DM().assets.map(a => `<div class="card"><div class="card-h"><h3>${esc(a.title)}</h3><span class="badge b-grey">${esc(a.format)}</span></div><div class="card-b"><div style="border:1px solid var(--line);border-radius:8px;padding:18px;background:#FBFAFC"><img src="brand/emplay_mark.png" alt="" style="width:26px;float:right"><h2 style="margin-bottom:10px">${esc(a.title.split(': ')[1])}</h2>${a.lines.map(l => `<p class="sm">${esc(l[0])} ${U().cite('[' + l[1] + ']')}</p>`).join('')}</div><div class="sm muted" style="margin-top:8px">Verified: every line maps to an approved claim or a Knowledge Hub passage.</div></div></div>`).join('')}</div>`;
  }
  function vFirst() {
    return page('First-party signals and fast lane ' + U().demoTag, 'Website visits, content downloads and email clicks, reconciled to the target list. Fast-lane events skip the morning cycle and reach the rep in minutes. Ships in R2; seeded here.') +
      `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Event</th><th>Account</th><th>Signal tier</th><th>When</th><th>Route</th></tr></thead><tbody>${DM().firstParty.map(f => `<tr><td>${esc(f[0])}</td><td class="nm">${esc(f[1])}</td><td class="sm">${esc(f[2])}</td><td class="sm">${esc(f[3])}</td><td>${f[4] ? '<span class="badge b-or">Fast lane: to the rep in minutes</span>' : '<span class="badge b-grey">Next morning queue</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function vLearning() {
    const Q = DM().quota;
    return page('What the system learned ' + U().demoTag, 'The learning ledger, the pattern cache and the quota plan. Ship in R2 and R3; seeded here. Every learned change passes the backtest before it ships.') +
      `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Learning ledger</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>What we saw</th><th>Evidence</th><th>What changed</th></tr></thead><tbody>${DM().learning.map(l => `<tr><td>${esc(l[0])}</td><td class="sm">${esc(l[1])}</td><td class="sm">${esc(l[2])}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="grid g2" style="align-items:start"><div class="card"><div class="card-h"><h3>Pattern cache</h3><span class="sm muted">Validated: 10+ outcomes and (wins + 1) / (attempts + 2) ≥ 0.6</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Microsegment</th><th>Structure</th><th>Attempts</th><th>Wins</th><th>State</th></tr></thead><tbody>${DM().patterns.map(p => `<tr><td class="sm">${esc(p[0])}</td><td class="sm">${esc(p[1])}</td><td class="mono">${p[2]}</td><td class="mono">${p[3]}</td><td><span class="badge ${p[4] === 'Validated' ? 'b-pos' : 'b-grey'}">${p[4]}</span></td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-h"><h3>How far are we from quota?</h3></div><div class="card-b"><div class="grid g3" style="margin-bottom:10px"><div class="kpi"><div class="k">Quota</div><div class="v">${esc(Q.target)}</div></div><div class="kpi"><div class="k">Closed</div><div class="v">${esc(Q.closed)}</div></div><div class="kpi"><div class="k">Gap</div><div class="v" style="color:var(--orange-dk)">${esc(Q.gap)}</div></div></div>${Q.weeks.map(w => `<div class="set"><b style="width:70px">${esc(w[0])}</b><div class="grow sm">${esc(w[1])}<br><span class="muted">${esc(w[2])}</span></div></div>`).join('')}</div></div></div>`;
  }
  function vResearch() {
    return page('Research agent: rival complaint themes ' + U().demoTag, 'Reviews of the rival a prospect uses, clustered into themes and matched to our proof. Ships in R2; seeded here. Rival names are invented.') +
      `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Rival</th><th>Theme</th><th>Reviews</th><th>Our proof</th><th>Account using the rival</th></tr></thead><tbody>${DM().research.map(r => `<tr><td class="nm">${esc(r.rival)}</td><td>${esc(r.theme)}</td><td class="mono">${r.reviews}</td><td class="sm">${U().cite('[' + r.proof + ']')} ${esc(D.SEED.content.claims.find(c => c.id === r.proof).text)}</td><td class="sm">${esc(r.account)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /* ─── Coming tiles ─── */
  /* Features that have a labelled demo screen in this prototype; everything else not in R1 is a Coming tile. */
  const LINK = { 'RSP-02': 'replies', 'WRK-01': 'replies', 'LRN-03': 'funnel', 'LRN-04': 'funnel', 'CON-02': 'assets', 'CON-03': 'assets', 'CON-04': 'assets', 'SIG-07': 'firstparty', 'SIG-17': 'firstparty', 'LRN-06': 'learning', 'NBA-16': 'learning', 'LRN-09': 'learning', 'WRK-07': 'learning', 'RES-02': 'research', 'WRK-03': 'funnel' };
  function vRoadmap() {
    const F = D.SEED.features.filter(f => f.release !== 'R1'), mods = [...new Set(F.map(f => f.module))];
    return page('Coming', 'Everything in the feature map that is not R1 (' + F.length + ' features). The ones with a labelled demo screen link to it; the rest are coming.') +
      mods.map(m => `<h2 style="margin:16px 0 8px">${esc(m)}</h2><div class="grid g3">${F.filter(f => f.module === m).map(f => `<div class="tile"><div class="h"><span class="badge b-grey">${esc(f.release)}</span><b>${esc(f.feature)}</b></div><div class="sm muted">${esc(f.why)}</div><div style="margin-top:6px">${LINK[f.id] ? `<a class="sm" href="#/${LINK[f.id]}">Open the demo screen</a> ${U().demoTag}` : '<span class="badge b-grey">Coming</span>'}</div></div>`).join('')}</div>`).join('');
  }

  /* ─── Slack and Teams push preview ─── */
  function vNotify() {
    const e = D.M.escalations.find(x => x.type === 3) || D.M.escalations[0], r = D.M.rows.find(x => x.route === 'ready');
    const link = h => `<a href="#/${h}" class="btn sm">Open in Demand AI</a>`;
    return page('Slack and Teams', 'R1 pushes notifications with a link back into the app. Interactive cards come in R2. If Slack or Teams is down, the item appears in chat.') +
      `<div class="grid g2"><div class="push slack"><div class="row"><b>Demand AI</b><span class="sm muted">APP · 06:02</span></div><p style="margin:8px 0"><b>Needs your decision:</b> ${esc(e ? D.acct(e.accountId || 'halden').name : '')}. ${esc(e ? e.reason : '')}</p><p class="sm muted">Due ${esc(e && e.due ? U().fdt(e.due) : 'in 3 days')} · default: expires and re-ranks</p>${link(e && e.accountId ? 'card/' + e.accountId : 'escalations')}</div>
      <div class="push teams"><div class="row"><b>Demand AI</b><span class="sm muted">06:02</span></div><p style="margin:8px 0"><b>Ready to send:</b> ${esc(r ? r.a.name : '')}. ${esc(r ? U().whyLine(r) : '')}</p><p class="sm muted">All five criteria met. One click sends from your mailbox.</p>${link(r ? 'account/' + r.id : 'queue')}</div></div>`;
  }

  /* ─── Presenter path ─── */
  const STEPS = [
    ['Rep opens chat: "What should I work on today?"', 'rep', null, "CHAT.ask('What should I work on today?')"],
    ['Opens one account: timeline with stacked, dated, cited signals', 'rep', 'account/harrowgate/timeline'],
    ['Opens the context graph', 'rep', 'account/harrowgate/graph'],
    ['Asks "Why is this Tier A?"', 'rep', 'account/harrowgate/why', "CHAT.ask('Why is Harrowgate Refining ranked here?')"],
    ['Opens the next best action: who, what, channel, why now, draft, signals cited', 'rep', 'account/harrowgate'],
    ['A criterion fails (identity tier): approval card, one edit, logged', 'rep', 'card/halden'],
    ['Sees a Ready to send item: sends, the send is logged with its cause', 'rep', 'account/harrowgate'],
    ['Manager view: a campaign flag for 11 accounts; confirms the three touches', 'manager', 'campaigns'],
    ['Admin: simulate the CRM going down; nothing is sent, the reason is shown', 'admin', 'admin/failures'],
    ['Demo data: replies in six statuses, then the funnel per 100', 'rep', 'replies'],
    ['Demo data: what the system learned', 'leader', 'learning'],
    ['Leader asks "How far are we from quota?"', 'leader', 'learning', "CHAT.ask('How far are we from quota?')"]
  ];
  const SCEN = [
    ['1 · Cold start, ICP shared', 'admin', 'admin/icp', 'Paste the ICP, show it as criteria, confirm: spend equals the accounts that passed the fit check.'],
    ['2 · Cold start, ICP unknown', 'admin', 'admin/icp', 'Enter only the website: a proposed ICP and a sample list; nothing is searched until confirmed.'],
    ['3 · Signal to action', 'rep', 'account/harrowgate', 'Funding, contact I1, all five criteria met: Ready to send. Send logs a row with its signals.'],
    ['4 · Failed criterion', 'rep', 'card/halden', 'The same, but the contact is I3: an approval card names identity tier. Edit and approve: the diff is stored.'],
    ['5 · Exclusion', 'rep', 'account/brightwell', 'A customer with strong signals never reaches the queue.'],
    ['6 · Campaign', 'manager', 'campaigns', '11 LNG terminals in one microsegment: confirm, then as a rep send touch 1, advance 4 days: one contact opted out, so touch 2 is held and escalated. Log a reply to remove pending touches.'],
    ['7 · Fail closed', 'admin', 'admin/failures', 'Switch on "CRM unreachable": nothing is routed and the rep sees why.'],
    ['8 · LinkedIn engagement', 'rep', 'account/kestrel/why', 'A question in a comment on a relevant post is a strong signal with a note; a like on an unrelated post is discarded.'],
    ['9 · Opt-out', 'rep', 'account/fenwick/contacts', 'Add an opt-out: the contact disappears from every queue.'],
    ['10 · Timeout', 'rep', 'card/caldbeck', 'Leave the card and press "Advance 3 days": it expires and the account re-ranks.']
  ];
  function vPath() {
    const b = (role, h, extra) => `<button class="btn sm" onclick="UIX.goAs('${role}','${h || ''}')${extra ? ';setTimeout(function(){' + extra.replace(/"/g, '&quot;') + '},60)' : ''}">Go</button>`;
    return page('Presenter path', 'The 12 steps and the 10 scenarios. Each "Go" switches to the right role and screen. "Reset demo" in the header starts again.') +
      `<div class="grid g2" style="align-items:start"><div class="card"><div class="card-h"><h3>12 steps</h3></div><div class="card-b"><ol class="path">${STEPS.map(s => `<li><div class="row"><span class="grow">${esc(s[0])} ${/Demo data/.test(s[0]) ? U().demoTag : ''}</span>${b(s[1], s[2], s[3])}</div></li>`).join('')}</ol></div></div>
      <div class="card"><div class="card-h"><h3>10 scenarios</h3></div><div class="card-b">${SCEN.map(s => `<div class="set"><div class="grow"><div class="k">${esc(s[0])}</div><div class="d">${esc(s[3])}</div></div>${b(s[1], s[2])}</div>`).join('')}</div></div></div>`;
  }

  const act = (r, m) => U().act(r, m);
  window.UIX = {
    views: { admin: vAdmin, backtest: vBacktest, replies: vReplies, funnel: vFunnel, assets: vAssets, firstparty: vFirst, learning: vLearning, research: vResearch, roadmap: vRoadmap, notify: vNotify, path: vPath },
    parseA: () => { const t = document.getElementById('icpText').value; act(D.A.icpA(t, parseIcp(t)), 'Parsed into criteria and weights. Check them, then confirm.'); },
    confirmA: () => act(D.A.icpAConfirm(), 'ICP confirmed as a new version. The list was rebuilt and rescored.'),
    pathB: () => act(D.A.icpB(document.getElementById('site').value), 'Proposed an ICP and a sample list. Nothing searched yet.'),
    confirmB: () => act(D.A.icpBConfirm(), 'Proposed ICP confirmed. The list builds now.'),
    icpRevert: () => act(D.A.icpRevert(), 'Back to ICP v3.'),
    closedWon: () => act(D.A.setClosedWon(document.getElementById('cwF').value, document.getElementById('cwV').value), 'Closed-won saved. The setup gap is closed.'),
    addEx: () => act(D.A.addExclusion({ kind: document.getElementById('exK').value, accountId: document.getElementById('exA').value, reason: document.getElementById('exR').value }), 'Exclusion added; applied on this run.'),
    rmEx: id => act(D.A.removeExclusion(id), 'Removed.'),
    cfg: (p, v) => act(D.A.setCfg(p, Number(v)), 'Saved. Everything was rescored with the new value.'),
    policy: (s, m) => act(D.A.setPolicy(s, m), 'Policy saved for ' + s + '.'),
    tick: (s, k, v) => { if (k === 'backtest' && v && !D.M.backtest.pass) return U().toast('The backtest is failing, so it cannot be ticked as passed.', true); act(D.A.tick(s, k, v)); },
    fail: (k, v) => { if (k === 'log') { D.A.setLogFailure(v); U().render(); return; } act(D.A.setFailure(k, v), v ? 'Switched on. Watch the queue: held, not dropped.' : 'Switched off.'); },
    degrade: v => act(D.A.setDegrade(v)),
    hub: () => { const q = document.getElementById('hubQ').value.toLowerCase().trim(), hits = D.SEED.content.cases.filter(k => q && (k.title + ' ' + k.passage).toLowerCase().split(/\W+/).some(w => w.length > 3 && q.includes(w))); document.getElementById('hubA').innerHTML = hits.length ? hits.map(k => `<div class="note sm"><span class="cite">${k.id}</span> "${esc(k.passage)}" · ${esc(k.doc)}, ${esc(k.page)}</div>`).join('') : '<div class="note warn sm">Not found. No passage supports an answer, so none is given; the question goes to the content backlog.</div>'; },
    exportAudit: () => { const j = JSON.stringify(D.S.audit, null, 2); U().modal('Audit log export', '<p class="sm">The append-only log as JSON. Copy it into a file or a ticket.</p><textarea class="inp" id="mText" readonly style="min-height:260px;font-family:ui-monospace,monospace;font-size:12px">' + esc(j) + '</textarea><div class="row" style="margin-top:10px"><button class="btn pri" onclick="UIX.copyAudit()">Copy</button></div>'); },
    copyAudit: () => { const el = document.getElementById('mText'); try { navigator.clipboard.writeText(el.value).then(() => U().toast('Copied.'), () => { el.select(); U().toast('Select all and copy.'); }); } catch (e) { el.select(); } },
    goAs: (role, h) => { D.A.setRole(role); if (role === 'rep') D.A.setRep('sofia'); U().go(h || ({ rep: 'queue', manager: 'campaigns', leader: 'backtest', admin: 'admin' })[role]); if (window.CHAT) CHAT.greet(); }
  };
})();
