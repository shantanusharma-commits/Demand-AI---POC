/* Demand AI prototype: shell, routing and the R1 working screens
   (morning queue, account page with context graph, approval card, escalation queue, campaigns, campaign tasks, accounts, signals). */
(function () {
  const D = window.DM, E = window.DM_ENGINE;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fd = iso => { if (!iso) return ''; const d = new Date(iso); return d.getDate() + ' ' + MON[d.getMonth()] + (d.getFullYear() !== 2026 ? ' ' + d.getFullYear() : ''); };
  const fdt = iso => { const d = new Date(iso); return fd(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const ageTxt = d => d < 1 ? 'today' : Math.floor(d) === 1 ? '1 day ago' : Math.floor(d) + ' days ago';
  const dueTxt = iso => { if (!iso) return '<span class="muted">No due time</span>'; const d = E.daysBetween(D.nowIso(), iso); return d <= 0 ? '<span class="badge b-neg">Overdue</span>' : fdt(iso) + ' <span class="muted">(' + (d < 1 ? Math.round(d * 24) + ' h' : Math.round(d * 10) / 10 + ' days') + ')</span>'; };
  const user = id => D.users[id] || { name: id };
  const first = n => (n || '').split(' ')[0];
  const fmtN = n => n == null ? '–' : Number(n).toLocaleString('en-GB', { maximumFractionDigits: 1 });

  const tierBadge = (t, short) => t ? `<span class="badge tier${t}" title="Account tier ${t}">${short ? t : 'Account tier ' + t}</span>` : '<span class="badge b-grey">Not tiered</span>';
  const sigTier = n => `<span class="badge ${n === 1 ? 'b-pur' : n === 2 ? 'b-blue' : 'b-grey'}" title="Signal tier ${n}">Signal tier ${n}</span>`;
  const idTier = t => `<span class="badge ${t === 'I1' || t === 'I2' ? 'b-pos' : t === 'I4' ? 'b-neg' : 'b-or'}" title="Identity tier ${t}">Identity tier ${t}</span>`;
  const confHtml = c => `<span class="badge ${c.band === 'High' ? 'b-pos' : c.band === 'Medium' ? 'b-or' : 'b-grey'} hint" title="Identity ${Math.round(c.parts.identity * 100)}% · sources ${Math.round(c.parts.sources * 100)}% · strength ${Math.round(c.parts.strength * 100)}% · evidence ${Math.round(c.parts.evidence * 100)}%  →  ${c.value}">${c.band} ${c.value.toFixed(2)}</span>`;
  const ROUTE = { ready: ['Ready to send', 'st-ready'], autopilot: ['Sent by autopilot', 'st-ready'], card: ['Needs your decision', 'st-card'], nurture: ['Nurture', 'st-nurture'], held: ['Held', 'st-held'], campaign: ['In a campaign', 'st-campaign'], sent: ['Sent', 'st-sent'], skipped: ['Skipped', 'st-nurture'], excluded: ['Excluded', 'st-held'], unranked: ['Held unranked', 'st-held'], watch: ['Watched', 'st-nurture'] };
  const statusHtml = r => `<div class="status ${ROUTE[r.route][1]}">${ROUTE[r.route][0]}</div><div class="sm muted">${esc(r.reason)}</div>`;
  const demoTag = '<span class="tag-demo" title="Simulated: seeded data, not driven by the rules">Demo data</span>';
  const cacheTag = '<span class="tag-cache" title="Served from cached or seeded data, not live">Cached data</span>';

  /* Citations: [S12] → the signal, [C3] → an approved claim, [K1] → a Knowledge Hub passage. */
  function cite(text) {
    return esc(text).replace(/\[([SCK]\d+)\]/g, (m, id) => {
      let t = id;
      if (id[0] === 'S') { const s = D.SEED.signals.find(x => x.id === id); t = s ? s.title + ' · ' + s.sourceName + ' · ' + s.eventDate : 'Signal ' + id; }
      if (id[0] === 'C') { const c = D.SEED.content.claims.find(x => x.id === id); t = c ? 'Approved claim: ' + c.text + ' (source: ' + c.source + ', reviewed ' + c.reviewDate + ')' : 'Not an approved claim'; }
      if (id[0] === 'K') { const k = D.SEED.content.cases.find(x => x.id === id); t = k ? 'Knowledge Hub: ' + k.doc + ', ' + k.page : id; }
      return `<span class="cite" title="${esc(t)}">${id}</span>`;
    });
  }
  function whyLine(r) {
    const L = r.sig.live; if (!L.length) return r.sig.expired.length ? 'Nothing live: ' + r.sig.expired.length + ' signal' + (r.sig.expired.length > 1 ? 's' : '') + ' expired' : 'No signal yet';
    const part = s => s.title.replace(r.a.name, '').replace(/^\s*(at|for)\s+/i, '').trim().replace(/^./, c => c.toUpperCase()) + ' (' + ageTxt(s.age) + (s.sources.length > 1 ? ', ' + s.sources.length + ' sources' : '') + ')';
    const soon = L.find(s => E.daysBetween(D.nowIso(), s.expiresAt) < 4);
    return part(L[0]) + (L[1] ? '; ' + part(L[1]).replace(/^./, c => c.toLowerCase()) : '') + '.' + (soon ? ' ' + soon.title.split(' ').slice(0, 3).join(' ') + '… expires in ' + Math.max(1, Math.ceil(E.daysBetween(D.nowIso(), soon.expiresAt))) + ' days.' : '');
  }
  function toast(m, err) { document.querySelectorAll('.toast').forEach(t => t.remove()); const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), err ? 5000 : 3200); }
  function act(res, ok) { if (res && res.error) { toast(res.error, true); return false; } if (ok) toast(ok); render(); return true; }

  /* ─── Visibility: a rep sees their own territory; others see everyone ─── */
  const me = () => D.userId();
  const mine = r => D.S.role !== 'rep' || r.a.owner === D.S.repUser;
  const myEsc = () => D.M.escalations.filter(e => e.owner === me() || (D.S.role === 'manager' && e.type === 8));

  /* ─── Routing ─── */
  /* The route lives in the page; the address shows only the view name (#queue), which is all a shared link keeps. */
  let route = null;
  const parts = () => (route || location.hash.replace(/^#\/?/, '') || defaultRoute()).split('/');
  const defaultRoute = () => ({ rep: 'queue', manager: 'campaigns', leader: 'backtest', admin: 'admin' })[D.S.role];
  const go = h => { route = h; try { history.replaceState(null, '', '#' + h.split('/')[0]); } catch (e) { /* the address cannot change here */ } render(); };

  const ICONS = { queue: 'M4 6h16M4 12h16M4 18h10', esc: 'M12 3l9 16H3zM12 10v4M12 17h.01', camp: 'M3 11l18-8-8 18-2-8z', tasks: 'M9 11l3 3 8-8M4 12v7a1 1 0 001 1h14', acc: 'M3 21V7l9-4 9 4v14M9 21v-6h6v6', sig: 'M2 12h4l3-8 4 16 3-8h6', admin: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-2-4-2 1-2-1V5h-4v2l-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1v2h4v-2l2-1 2 1 2-4-2-1z', test: 'M9 3h6M10 3v6L4 20h16L14 9V3', demo: 'M4 4h16v12H4zM8 20h8', road: 'M4 19l4-14h8l4 14M12 6v3M12 12v3', bell: 'M6 16V11a6 6 0 1112 0v5l2 2H4zM10 21h4', path: 'M5 19c4-8 10-6 14-14' };
  const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[n]}"/></svg>`;
  function navItems() {
    const r = D.S.role, n = myEsc().length, camps = D.M.campaigns.filter(k => k.state === 'pending').length;
    const due = D.M.campaigns.flatMap(k => k.tasks).filter(t => (t.status === 'Due' || t.status === 'Held') && (r !== 'rep' || t.owner === D.S.repUser)).length;
    const common = [['sec', 'Demo data (R2 and R3)'], ['replies', 'Replies', 'demo', 1], ['funnel', 'Funnel and scorecards', 'demo', 1], ['assets', 'Generated assets', 'demo', 1], ['firstparty', 'First-party signals', 'demo', 1], ['learning', 'Learning and quota', 'demo', 1], ['research', 'Research agent', 'demo', 1], ['sec', 'More'], ['roadmap', 'Coming (roadmap)', 'road'], ['notify', 'Slack and Teams', 'bell'], ['path', 'Presenter path', 'path']];
    const by = {
      rep: [['queue', 'Morning queue', 'queue'], ['escalations', 'Needs my decision', 'esc', 0, n], ['tasks', 'Campaign tasks', 'tasks', 0, due], ['accounts', 'Accounts', 'acc'], ['signals', 'Signals', 'sig']],
      manager: [['campaigns', 'Campaigns', 'camp', 0, camps], ['queue', 'Team queue', 'queue'], ['escalations', 'Needs my decision', 'esc', 0, n], ['tasks', 'Campaign tasks', 'tasks'], ['accounts', 'Accounts', 'acc']],
      leader: [['backtest', 'Backtest report', 'test'], ['escalations', 'Needs my decision', 'esc', 0, n], ['queue', 'Team queue', 'queue'], ['accounts', 'Accounts', 'acc']],
      admin: [['admin', 'Admin', 'admin'], ['escalations', 'Needs my decision', 'esc', 0, n], ['backtest', 'Backtest report', 'test'], ['signals', 'Signals and registry', 'sig'], ['accounts', 'Accounts', 'acc']]
    };
    return by[r].concat(common);
  }
  function renderNav() {
    const p = parts()[0];
    $('nav').innerHTML = navItems().map(i => i[0] === 'sec' ? `<div class="nav-sec">${i[1]}</div>` : `<a href="#/${i[0]}" class="${p === i[0] ? 'on' : ''}" title="${esc(i[1])}">${ic(i[2])}<span>${esc(i[1])}</span>${i[4] ? `<b class="n">${i[4]}</b>` : i[3] ? '<span class="demo">demo</span>' : ''}</a>`).join('');
  }
  function renderTop() {
    const S = D.S, t = D.now();
    const reps = ['sofia', 'marco', 'aisha', 'kenji'];
    $('top').innerHTML = `<div class="roles" role="tablist" aria-label="View as">${Object.entries(D.cfg().roles).map(([k, v]) => `<button class="${S.role === k ? 'on' : ''}" onclick="UI.role('${k}')" title="${v.label}">${({ rep: 'Rep', manager: 'Manager', leader: 'Leader', admin: 'Admin' })[k]}</button>`).join('')}</div>
      ${S.role === 'rep' ? `<label class="sr" for="repSel">Rep</label><select id="repSel" class="sel" onchange="UI.rep(this.value)">${reps.map(r => `<option value="${r}" ${S.repUser === r ? 'selected' : ''}>${esc(user(r).name)}</option>`).join('')}</select>` : `<span class="sm muted">${esc(user(me()).name)}</span>`}
      <div class="clock" title="The demo clock. Advancing it decays signals, expires untouched cards and runs due campaign touches."><b>${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.getDay()]} ${fd(t)}, 06:00</b><button class="btn sm" onclick="UI.advance(1)" title="Advance the demo clock by one day">+1 day</button><button class="btn sm" onclick="UI.advance(3)" title="Advance the demo clock by three days">+3 days</button><button class="btn sm ghost" onclick="UI.reset()" title="Reset every decision and switch">Reset</button></div>`;
    const f = S.failures, b = [];
    if (f.crm) b.push('CRM unreachable: nothing is routed. Checks that need the CRM are held, not dropped.');
    if (f.exclusions) b.push('Exclusions list unreadable: nothing is routed until the check can run.');
    if (f.source) b.push('A data source is down (NewsCatcher, GDELT): last good data is used and marked stale; an admin alert was raised.');
    if (f.log) b.push('Decision log unavailable: every action is blocked, because nothing may happen unlogged.');
    $('banner').innerHTML = b.map(x => `<div class="banner neg">${ic('esc')}<span>${esc(x)}</span><a href="#/admin/failures" class="btn sm" style="margin-left:auto">Simulate failure panel</a></div>`).join('');
  }

  /* ─── Morning queue ─── */
  function vQueue() {
    const M = D.M, mgr = D.S.role !== 'rep';
    const rows = M.rows.filter(r => mine(r) && (r.tier === 'A' || r.tier === 'B') && !['excluded', 'unranked', 'watch'].includes(r.route)).sort((a, b) => b.rank - a.rank);
    const cnt = k => rows.filter(r => r.route === k).length;
    const out = M.rows.filter(r => mine(r) && ['excluded', 'unranked'].includes(r.route));
    return `<div class="page-h"><div class="grow"><h1>${mgr ? 'Team queue' : 'Morning queue'}</h1><div class="sub">Built at 06:00 for ${mgr ? 'every rep' : esc(user(D.S.repUser).name)}: Account tier A and B in rank order, each with a drafted action. Rank = Fit × Timing.</div></div>${cacheTag}</div>
      <div class="grid g4" style="margin-bottom:14px">${[['Ready to send', cnt('ready') + cnt('autopilot'), 'All five criteria met: one click'], ['Needs your decision', cnt('card'), 'A criterion failed: approval card'], ['Held', cnt('held'), 'A check could not run or did not pass'], ['In a campaign', cnt('campaign'), 'Waiting for or run by the manager']].map(k => `<div class="kpi"><div class="k">${k[0]}</div><div class="v">${k[1]}</div><div class="d">${k[2]}</div></div>`).join('')}</div>
      <div class="qlist">${rows.map(r => `<div class="qrow">
        <div class="q-a"><div class="row"><span class="q-n">${r.position}</span><a class="nm" href="#/account/${r.id}">${esc(r.a.name)}</a></div><div class="row wrap" style="margin-top:4px">${tierBadge(r.tier)}${confHtml(r.conf)}</div><div class="sm muted" style="margin-top:3px">Rank ${fmtN(r.rank)} · fit ${r.fit} × timing ${fmtN(r.timing)}${mgr ? ' · ' + esc(first(user(r.a.owner).name)) : ''}</div>${r.expiredBefore ? `<div class="sm" style="color:var(--orange-dk)">Re-ranked: card expired ${fd(r.expiredBefore.at)} (was #${r.expiredBefore.positionBefore})</div>` : ''}</div>
        <div class="q-w"><div class="why">${esc(whyLine(r))}</div><div class="sig-mini" style="margin-top:4px">${r.sig.live.slice(0, 3).map(s => `<a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener" title="${esc(s.evidence)}">T${s.tier} · ${esc(s.title)} <span class="muted">(${esc(s.sourceName)})</span>${s.stale ? ' <span class="badge b-or">stale</span>' : ''}</a>`).join('')}</div></div>
        <div class="q-c">${r.contact ? `<div><b>${esc(r.contact.name)}</b> <span class="sm muted">${esc(r.contact.persona)}</span></div><div class="row wrap">${idTier(r.contact.identityTier)}<span class="badge b-grey">${r.channel || 'No verified channel'}</span></div>` : '<span class="muted">No usable contact</span>'}<div class="sm muted q-d">${r.draft.llmFailed ? '<span class="badge b-neg">No draft</span>' : cite((r.draft.body.split('\n').find(l => l.length > 30) || '').slice(0, 120)) + '…'}</div></div>
        <div class="q-s">${statusHtml(r)}<div class="row wrap" style="margin-top:6px">${actions(r)}</div></div></div>`).join('') || `<div class="card empty">Nothing in Account tier A or B${D.S.failures.crm || D.S.failures.exclusions ? ' can be routed while a protective check cannot run' : ''}.</div>`}</div>
      <details style="margin-top:14px"><summary class="sm muted">${out.length} accounts never reach the queue (excluded or held unranked) · Account tier C and accounts with no live signal are watched, not worked</summary>
        <div class="card tbl-wrap" style="margin-top:8px"><table class="tbl"><tbody>${out.map(r => `<tr><td><a href="#/account/${r.id}">${esc(r.a.name)}</a></td><td>${statusHtml(r)}</td><td class="sm muted">${r.sig.live.length} live signals</td></tr>`).join('')}</tbody></table></div></details>`;
  }
  function actions(r) {
    const can = D.S.role === 'rep' || D.S.role === 'manager';
    if (r.route === 'ready' && can) return `<button class="btn sm pri" onclick="UI.send('${r.id}')">Send</button><a class="btn sm" href="#/account/${r.id}">Open</a><button class="btn sm ghost" onclick="UI.skip('${r.id}')">Skip</button>`;
    if (r.route === 'card' && can) return `<a class="btn sm pri" href="#/card/${r.id}">Decide</a><a class="btn sm" href="#/account/${r.id}/why">Why</a>`;
    if (r.route === 'campaign') return `<a class="btn sm" href="#/campaigns">Campaign</a>`;
    return `<a class="btn sm" href="#/account/${r.id}">Open</a><a class="btn sm ghost" href="#/account/${r.id}/why">Why</a>`;
  }

  /* ─── Account page ─── */
  function vAccount(id, tab) {
    const r = D.M.byId.get(id); if (!r) return '<div class="empty">Account not found.</div>';
    D.ctx = id; tab = tab || 'next';
    const tabs = [['next', 'Next step'], ['why', 'Why this rank'], ['timeline', 'Timeline'], ['graph', 'Context graph'], ['contacts', 'Contacts'], ['holds', 'Holds and exclusions']];
    const body = { next: aNext, why: aWhy, timeline: aTimeline, graph: aGraph, contacts: aContacts, holds: aHolds }[tab](r);
    return `<div class="page-h"><div class="grow"><div class="row wrap"><h1>${esc(r.a.name)}</h1>${tierBadge(r.tier)}${r.ex ? `<span class="badge b-neg">${esc(r.ex.kind)}</span>` : ''}</div>
      <div class="sub">${esc(r.niche || 'Niche unclassified')} · ${esc(r.a.country)} · ${esc(r.a.region)} · owner ${esc(user(r.a.owner).name)} · microsegment <b>${esc(r.microsegment)}</b></div></div>
      <a class="btn" href="#/queue">Back to the queue</a></div>
      <div class="grid g4" style="margin-bottom:12px">
        <div class="kpi"><div class="k">Rank (Fit × Timing)</div><div class="v">${fmtN(r.rank)}</div><div class="d">${r.position ? '#' + r.position + ' of ' + D.M.tiering.count + ' ranked' : esc(r.reason)}</div></div>
        <div class="kpi"><div class="k">Fit</div><div class="v">${r.fit == null ? '–' : r.fit}</div><div class="d">${esc(D.icp().version)}</div></div>
        <div class="kpi"><div class="k">Timing</div><div class="v">${fmtN(r.timing)}</div><div class="d">${r.sig.live.length} live, ${r.sig.expired.length} expired</div></div>
        <div class="kpi"><div class="k">Confidence</div><div class="v" style="font-size:18px">${confHtml(r.conf)}</div><div class="d">Hover for the four factors</div></div></div>
      <div class="note" style="margin-bottom:14px"><b>Why now:</b> ${esc(whyLine(r))}</div>
      <div class="tabs">${tabs.map(t => `<button class="${tab === t[0] ? 'on' : ''}" onclick="UI.go('account/${id}/${t[0]}')">${t[1]}</button>`).join('')}</div>${body}`;
  }
  function criteriaHtml(r) { return r.criteria ? r.criteria.map(c => `<div class="crit ${c.ok ? 'ok' : 'no'}"><span class="ic">${c.ok ? '✓' : '✕'}</span><div><b>${esc(c.label)}</b><div class="sm muted">${esc(c.detail)}</div></div></div>`).join('') : ''; }
  function signalsCited(r, ids) {
    const list = ids ? r.sig.live.filter(s => ids.includes(s.id)) : r.sig.live.slice(0, 3);
    return list.map(s => `<div style="padding:8px 0;border-bottom:1px dashed var(--line)"><div class="row wrap"><span class="cite">${s.id}</span><b>${esc(s.title)}</b>${sigTier(s.tier)}<span class="sm muted">${esc(s.level)} · ${fd(s.eventDate)} · ${ageTxt(s.age)}</span></div>
      <div class="sm" style="margin:4px 0">"${esc(s.evidence)}"</div><div class="sm muted">${s.sources.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>`).join(' · ')}${s.sources.length > 1 ? ' (one event, ' + s.sources.length + ' sources, merged)' : ''} · persona ${esc(s.persona)}${s.relevance ? ' · ' + esc(s.relevance) : ''}</div></div>`).join('');
  }
  function aNext(r) {
    if (['excluded', 'unranked', 'watch'].includes(r.route)) return `<div class="note ${r.route === 'excluded' ? 'neg' : 'warn'}"><b>${ROUTE[r.route][0]}.</b> ${esc(r.reason)}${r.route === 'excluded' ? '. Checked before everything else; this account never reaches a queue, whatever its signals.' : ''}</div>`;
    const ct = r.contact, d = r.draft;
    const brief = `<div class="card"><div class="card-h"><h3>Next best action</h3><span class="sp"></span><span class="badge b-grey">${esc(d.structureStatus || '')}</span></div><div class="card-b"><div style="margin-bottom:10px">${statusHtml(r)}</div>
      <div class="grid g2" style="margin-bottom:12px"><div><div class="lbl">Who</div>${ct ? `<b>${esc(ct.name)}</b><div class="sm">${esc(ct.title)} · ${esc(ct.persona)}</div>${idTier(ct.identityTier)}` : '–'}</div>
        <div><div class="lbl">What</div><div class="sm">A ${esc((d.format || 'plain text').toLowerCase())} first touch: ${esc(d.structure)}</div></div>
        <div><div class="lbl">Channel</div>${r.channel ? '<b>' + r.channel + '</b><div class="sm muted">' + (r.channel === 'Email' ? 'Verified email' : 'No verified email, so LinkedIn') + (ct && ct.failedChannels.length ? '; email failed before, not repeated' : '') + '</div>' : '<span class="badge b-neg">No verified channel</span>'}</div>
        <div><div class="lbl">Why now</div><div class="sm">${esc(whyLine(r))}</div></div></div>
      <div class="lbl" style="margin-bottom:4px">Draft ${r.draft.edited ? '<span class="badge b-or">Edited</span>' : ''}</div>
      ${d.llmFailed ? `<div class="note neg">${esc(d.error)}</div>` : `<div class="draft">${cite(d.body)}</div>`}
      ${r.verify.ok ? '<div class="sm" style="color:var(--pos);margin-top:6px">Message verification passed: every claim maps to an approved claim or a cited signal.</div>' : `<div class="note neg" style="margin-top:8px">Message verification: ${r.verify.issues.map(i => esc(i.kind + ': ' + i.detail)).join('<br>')}</div>`}
      <div class="row wrap" style="margin-top:12px">${r.route === 'ready' ? `<button class="btn pri" onclick="UI.send('${r.id}')">Send (${r.channel})</button><span class="sm muted">All five criteria met: no approval card. The send is logged with its cause.</span>` : r.route === 'card' ? `<a class="btn pri" href="#/card/${r.id}">Open the approval card</a>` : r.route === 'campaign' ? `<a class="btn" href="#/campaigns">Open the campaign</a>` : ''}</div></div></div>`;
    return `<div class="grid g2" style="align-items:start">${brief}<div class="grid"><div class="card"><div class="card-h"><h3>The five criteria</h3></div><div class="card-b">${criteriaHtml(r) || '<span class="muted">Not evaluated</span>'}</div></div><div class="card"><div class="card-h"><h3>Signals cited</h3></div><div class="card-b" style="padding-top:4px">${signalsCited(r) || '<span class="muted">None live</span>'}</div></div></div></div>`;
  }
  function aWhy(r) {
    const mx = Math.max(1, ...r.sig.live.map(s => s.value));
    const fitRows = r.fitParts.map(p => `<div class="brk"><div>${esc(p.label)}<div class="sm muted">${p.value == null ? 'missing' : esc(p.value)}</div></div><div class="bar blue"><i style="width:${(p.match || 0) * 100}%"></i></div><div class="mono">${p.points} / ${p.weight}</div></div>`).join('');
    const sigRows = r.sig.live.map((s, i) => `<div class="brk"><div><span class="cite">${s.id}</span> ${esc(s.title)}<div class="sm muted">${sigTier(s.tier)} ${s.points} pts × strength ${s.strengthF} × repeat ${s.repeatF} × decay ${s.decay} (${ageTxt(s.age)}, expires ${fd(s.expiresAt)})</div></div><div class="bar"><i style="width:${s.value / mx * 100}%"></i></div><div class="mono">${s.value} × ${i === 0 ? '1' : '½'.repeat(0) + (1 / Math.pow(2, i))}</div></div>`).join('');
    return `<div class="grid g2" style="align-items:start"><div class="card"><div class="card-h"><h3>Fit: ${r.fit == null ? 'held unranked' : r.fit + ' of 100'}</h3><span class="sm muted">${esc(D.icp().version)}</span></div><div class="card-b">${fitRows}${r.fitMissing.length ? `<div class="note warn" style="margin-top:8px">Missing: ${esc(r.fitMissing.join(', '))}. A fit is never invented; the account is held unranked.</div>` : ''}</div></div>
      <div class="card"><div class="card-h"><h3>Timing: ${fmtN(r.timing)}</h3><span class="sm muted">S1 + ½ S2 + ¼ S3 …, no cap</span></div><div class="card-b">${sigRows || '<div class="muted">No live signal: timing 0, rank 0.</div>'}
        <div class="note" style="margin-top:10px">Rank = Fit ${r.fit == null ? '–' : r.fit} × Timing ${fmtN(r.timing)} = <b>${fmtN(r.rank)}</b> → ${r.tier ? 'Account tier ' + r.tier + ' (A is the top ' + Math.round(D.cfg().accountTiers.A * 100) + '%, B the next ' + Math.round(D.cfg().accountTiers.B * 100) + '%)' : 'not tiered'}</div></div></div></div>
      <div class="grid g2" style="margin-top:14px;align-items:start"><div class="card"><div class="card-h"><h3>Expired: no longer counted</h3></div><div class="card-b">${r.sig.expired.map(s => `<div class="sm" style="padding:4px 0">${sigTier(s.tier)} ${esc(s.title)} <span class="muted">· ${fd(s.eventDate)}, expired ${fd(s.expiresAt)}${s.expiresOn ? ' (date in the text)' : ''}</span></div>`).join('') || '<span class="muted">None</span>'}</div></div>
      <div class="card"><div class="card-h"><h3>Discarded by the filter</h3></div><div class="card-b">${r.sig.discarded.map(s => `<div class="sm" style="padding:4px 0"><span class="badge b-neg">${esc(s.failed)}</span> ${esc(s.title)} <span class="muted">· ${esc(s.why)}${s.relevance ? ' · ' + esc(s.relevance) : ''}</span></div>`).join('') || '<span class="muted">None</span>'}</div></div></div>`;
  }
  function timelineItems(r) {
    const it = [];
    D.SEED.signals.filter(s => s.accountId === r.id).forEach(s => it.push({ at: s.capturedAt, k: 'signal', h: (s.removedBy ? 'Signal removed: ' : 'Signal captured: ') + s.title, d: s.sourceName + ' · event ' + fd(s.eventDate) + (s.removedBy ? ' · ' + s.removedBy : ''), link: s.sourceUrl }));
    D.SEED.sends.concat(D.S.sends).filter(s => s.accountId === r.id).forEach(s => it.push({ at: s.at, k: 'send', h: (s.kind || 'Send') + ' by ' + s.channel + (s.subject ? ': ' + s.subject : ''), d: 'by ' + user(s.by).name + ' · ' + s.capture + ' · signals ' + (s.signalIds.join(', ') || 'none') + ' · ' + s.ruleVersion + (s.bounced ? ' · bounced' : '') }));
    D.SEED.replies.filter(x => x.accountId === r.id).forEach(x => it.push({ at: x.at, k: 'reply', h: 'Reply logged', d: '"' + x.text + '"' }));
    D.S.loggedReplies.filter(x => x.accountId === r.id).forEach(x => it.push({ at: x.at, k: 'reply', h: 'Reply logged by ' + x.by, d: 'Pending campaign touches removed' }));
    D.SEED.outcomes.filter(x => x.accountId === r.id).forEach(x => it.push({ at: x.at, k: 'decision', h: 'Outcome: ' + x.type, d: x.segment + ' · ' + x.structure + ' · ' + x.channel }));
    D.S.audit.filter(x => x.accountId === r.id).forEach(x => it.push({ at: x.at, k: 'decision', h: x.kind + ': ' + x.detail, d: x.actor + ' · ' + x.versions.rules }));
    if (D.S.failures.crm) it.push({ at: D.nowIso(), k: 'gap', h: 'Gap: CRM history unavailable', d: 'The CRM could not be read; this is a gap, not silence' });
    return it.sort((a, b) => b.at.localeCompare(a.at));
  }
  function aTimeline(r) {
    const it = timelineItems(r);
    return `<div class="card"><div class="card-h"><h3>From first touch to today</h3><span class="sm muted">${it.length} items, each linked to its source row</span></div><div class="card-b"><div class="tl">${it.map(x => `<div class="tl-i ${x.k}"><div class="when">${fdt(x.at)}</div><div class="nm" style="font-weight:600">${esc(x.h)}</div><div class="sm muted">${esc(x.d)}${x.link ? ` · <a href="${esc(x.link)}" target="_blank" rel="noopener">source</a>` : ''}</div></div>`).join('')}</div></div></div>`;
  }
  function aGraph(r) {
    const W = 900, H = 430, cx = W / 2, cy = H / 2;
    const groups = [
      ['People', r.contacts.map(c => c.name + ' (' + c.persona + ')'), '#0094DA'],
      ['Signals', r.sig.live.concat(r.sig.expired).slice(0, 6).map(s => s.title.slice(0, 30)), '#7D52A2'],
      ['Deals', [].concat(r.a.crm.openDeal ? [r.a.crm.openDeal.name + ' (' + r.a.crm.openDeal.stage + ')'] : [], r.a.crm.status ? ['Closed won ' + (r.a.crm.since || '')] : [], D.SEED.outcomes.filter(o => o.accountId === r.id).map(o => o.type)), '#1F7A4D'],
      ['Actions', D.SEED.sends.concat(D.S.sends).filter(s => s.accountId === r.id).map(s => (s.kind || 'Send') + ' ' + fd(s.at)).concat(r.route === 'ready' || r.route === 'card' ? ['Next best action (' + ROUTE[r.route][0] + ')'] : []), '#FF8820'],
      ['Documents', (r.draft.body.match(/\[K\d\]/g) || []).map(k => D.SEED.content.cases.find(c => '[' + c.id + ']' === k).title), '#4A4458']
    ];
    let svg = '', nodes = '';
    groups.forEach((g, gi) => {
      const ang = -Math.PI / 2 + gi * 2 * Math.PI / groups.length, gx = cx + Math.cos(ang) * 150, gy = cy + Math.sin(ang) * 120;
      svg += `<line x1="${cx}" y1="${cy}" x2="${gx}" y2="${gy}" stroke="#D6CFDF" stroke-width="2"/>`;
      g[1].slice(0, 4).forEach((n, i) => { const a2 = ang + (i - (Math.min(g[1].length, 4) - 1) / 2) * 0.32, x = cx + Math.cos(a2) * 265, y = cy + Math.sin(a2) * 175; svg += `<line x1="${gx}" y1="${gy}" x2="${x}" y2="${y}" stroke="${g[2]}" stroke-opacity=".35"/>`; nodes += `<circle cx="${x}" cy="${y}" r="5" fill="${g[2]}"/><text x="${x + (x < cx ? -8 : 8)}" y="${y + 4}" text-anchor="${x < cx ? 'end' : 'start'}"><title>${esc(n)}</title>${esc(n.length > 24 ? n.slice(0, 23) + '…' : n)}</text>`; });
      nodes += `<circle cx="${gx}" cy="${gy}" r="26" fill="#fff" stroke="${g[2]}" stroke-width="2"/><text x="${gx}" y="${gy + 4}" text-anchor="middle" style="font-weight:600">${g[0]}</text><text x="${gx}" y="${gy + 40}" text-anchor="middle" style="fill:#7A7389">${g[1].length}</text>`;
    });
    nodes += `<circle cx="${cx}" cy="${cy}" r="40" fill="#7D52A2"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" style="fill:#fff;font-weight:600">${esc(r.a.name.split(' ')[0])}</text>`;
    return `<div class="card"><div class="card-h"><h3>Context graph</h3><span class="sm muted">People, the account, deals, signals and actions, linked. Every agent reads this before it acts and writes back after.</span></div><div class="card-b tbl-wrap"><svg class="graph" viewBox="0 0 ${W} ${H}" style="width:100%;min-width:560px;height:auto">${svg}${nodes}</svg></div></div>`;
  }
  function aContacts(r) {
    const can = D.S.role === 'rep' || D.S.role === 'manager';
    return `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Persona</th><th>Identity</th><th>Found by</th><th>Channels</th><th>State</th><th></th></tr></thead><tbody>${r.contacts.map(c => `<tr><td><b>${esc(c.name)}</b><div class="sm muted">${esc(c.title)}</div>${c.mergedFrom ? `<div class="sm muted">Merged record: ${c.mergedFrom.map(m => esc(m.field + ' from ' + m.source)).join('; ')}</div>` : ''}</td>
      <td>${esc(c.persona)}${c.personaFlagged ? ' <span class="badge b-or">Unclear title</span>' : ''}</td><td>${idTier(c.identityTier)}${c.heldCycles ? `<div class="sm muted">held ${c.heldCycles} cycles</div>` : ''}</td><td class="sm">${esc(c.foundBy)}</td>
      <td class="sm">${c.email ? (c.emailVerified ? 'Email verified' : 'Email unverified') : 'No email'}${c.failedChannels.length ? ' (bounced before)' : ''}<br>${c.linkedin ? `<a href="${esc(c.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : 'No LinkedIn'}</td>
      <td class="sm">${c.suppressed ? `<span class="badge b-neg">Suppressed</span> ${esc(c.suppressed)}` : c.stale ? `<span class="badge b-or">Stale</span> ${esc(c.staleReason)}` : r.contact && r.contact.id === c.id ? '<span class="badge b-pur">Chosen for the next action</span>' : ''}</td>
      <td>${can && !c.suppressed ? `<button class="btn sm" onclick="UI.optOut('${c.id}')">Add opt-out</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="sm muted" style="margin-top:8px">Same name, company and title with a different LinkedIn URL stays two people. A bounce or a job change marks a contact stale until re-verified.</div>`;
  }
  function aHolds(r) {
    const ex = D.M.exclusions.filter(x => x.accountId === r.id);
    return `<div class="card"><div class="card-b">${ex.map(x => `<div class="set"><span class="badge b-neg">${esc(x.kind)}</span><div class="grow"><div class="k">${esc(x.reason)}</div><div class="d">${esc(x.source)} · ${esc(x.date)}</div></div></div>`).join('')}
      ${r.protective && !r.protective.ok ? `<div class="set"><span class="badge b-or">Hold</span><div class="grow"><div class="k">${esc(r.protective.reason)}</div><div class="d">${r.protective.ran ? 'Protective check' : 'Fail closed: held, not dropped'}</div></div></div>` : ''}
      ${r.contacts.filter(c => c.suppressed || c.stale).map(c => `<div class="set"><span class="badge b-grey">Contact</span><div class="grow"><div class="k">${esc(c.name)}: ${esc(c.suppressed || c.staleReason)}</div></div></div>`).join('')}
      ${!ex.length && (!r.protective || r.protective.ok) && !r.contacts.some(c => c.suppressed || c.stale) ? '<div class="muted">No holds or exclusions. Exclusions, suppression, open deals and recent touches are checked before segmentation, before any recommendation and before any send.</div>' : ''}</div></div>`;
  }

  /* ─── Approval card (escalations only) ─── */
  function vCard(id) {
    const r = D.M.byId.get(id); if (!r) return '';
    if (r.route !== 'card') return `<div class="note">${esc(r.a.name)} has no approval card: ${esc(ROUTE[r.route][0])}. ${esc(r.reason)}</div><p><a href="#/account/${id}">Open the account</a></p>`;
    const ed = D.S.draftEdits[id], body = r.draft.body;
    return `<div class="page-h"><div class="grow"><h1>Approval card: ${esc(r.a.name)}</h1><div class="sub">An escalation for ${esc(user(r.a.owner).name)}. Approve, edit or skip. Edits are stored as a diff; the decision is logged with the rules in force.</div></div><a class="btn" href="#/escalations">All decisions</a></div>
      <div class="failed-top">Failed criterion: ${esc(r.failed.map(f => f.label).join('; ') || r.reason)}</div>
      <div class="grid g2" style="align-items:start"><div class="card"><div class="card-h"><h3>Draft to ${esc(r.contact.name)}</h3><span class="sm muted">${esc(r.contact.title)} · ${idTier(r.contact.identityTier)} · ${r.channel || 'no channel'}</span></div><div class="card-b">
        ${r.draft.llmFailed ? `<div class="note neg" style="margin-bottom:8px">${esc(r.draft.error)} Write the message, or retry.</div>` : ''}
        <label class="lbl" for="cardBody">Message (edit here)</label><textarea class="inp" id="cardBody" oninput="UI.liveVerify('${id}')">${esc(body)}</textarea>
        <div id="liveVer" style="margin-top:6px">${verHtml(r.verify)}</div>
        ${ed ? `<div style="margin-top:10px"><div class="lbl">Stored diff</div><div class="draft">${ed.diff.map(p => p.op === '=' ? esc(p.text) : `<span class="${p.op === '+' ? 'diff-add' : 'diff-del'}">${esc(p.text)}</span>`).join('')}</div></div>` : ''}
        ${!r.channel ? `<div class="row" style="margin-top:10px"><label class="sm" for="chSel">Choose a channel</label><select id="chSel" class="sel"><option>Phone (manual)</option><option>Ask the admin for enrichment</option></select></div>` : ''}
        <div class="row wrap" style="margin-top:12px"><button class="btn pri" onclick="UI.approve('${id}')">${ed ? 'Approve and send the edit' : 'Approve and send'}</button><button class="btn" onclick="UI.saveEdit('${id}')">Save edit</button><button class="btn ghost" onclick="UI.skip('${id}')">Skip</button>${r.contact.identityTier === 'I3' || r.contact.identityTier === 'I5' ? '<button class="btn ghost" onclick="UI.toast(\'Asked the admin to verify the contact (logged).\')">Ask the admin to verify</button>' : ''}</div></div></div>
      <div class="grid"><div class="card"><div class="card-h"><h3>Due and default</h3></div><div class="card-b"><div class="set"><div class="grow"><div class="k">Due</div><div class="d">${dueTxt(r.due)}</div></div></div><div class="set"><div class="grow"><div class="k">If nobody acts</div><div class="d">The card expires after ${D.cfg().escalationDueDays} days and the account re-ranks. Try "Advance 3 days".</div></div></div></div></div>
        <div class="card"><div class="card-h"><h3>The five criteria</h3></div><div class="card-b">${criteriaHtml(r)}</div></div>
        <div class="card"><div class="card-h"><h3>Signals cited</h3></div><div class="card-b" style="padding-top:4px">${signalsCited(r)}</div></div></div></div>`;
  }
  const verHtml = v => v.ok ? '<span class="sm" style="color:var(--pos)">Verification passes.</span>' : `<div class="note neg sm">${v.issues.map(i => esc(i.kind + ': ' + i.detail)).join('<br>')}</div>`;

  /* ─── Escalation queue ─── */
  function vEscalations() {
    const L = myEsc(), role = D.S.role;
    return `<div class="page-h"><div class="grow"><h1>Needs my decision</h1><div class="sub">Every item the AI could not decide, for ${esc(user(me()).name)}: owner, reason, due time and the default if nobody acts.</div></div></div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Escalation</th><th>Item</th><th>Owner</th><th>Reason</th><th>Due</th><th>Default</th><th></th></tr></thead><tbody>
      ${L.map(e => `<tr><td><span class="badge b-or">${e.type}</span> <b>${esc(e.label)}</b></td><td>${e.accountId ? `<a href="#/account/${e.accountId}">${esc(D.acct(e.accountId).name)}</a>` : e.campaign ? esc(e.campaign) : '–'}</td><td class="sm">${esc(user(e.owner).name)}</td><td class="sm" style="max-width:320px">${esc(e.reason)}</td><td class="sm">${e.due ? dueTxt(e.due) : esc(e.defaultText.split(':')[0])}</td><td class="sm">${esc(e.defaultText)}</td><td>${escAction(e)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nothing needs a decision from you right now.</td></tr>'}</tbody></table></div>
      <div class="sm muted" style="margin-top:10px">Not escalations: Ready to send (one click, no card), excluded accounts, low-confidence accounts (nurture) and discarded signals.${role === 'rep' ? '' : ' Reps see their own items.'}</div>`;
  }
  function escAction(e) {
    if (e.kind === 'card') return `<a class="btn sm pri" href="#/card/${e.accountId}">Decide</a>`;
    if (e.kind === 'campaign') return `<a class="btn sm pri" href="#/campaigns">Open</a>`;
    if (e.kind === 'touch') return `<button class="btn sm" onclick="UI.skipTouch('${esc(e.campaign)}','${e.accountId}',${e.task.n})">Skip the touch</button>`;
    if (e.kind === 'held') return `<a class="btn sm" href="#/admin/failures">Why held</a>`;
    if (e.kind === 'record' && e.id.startsWith('name-')) return `<button class="btn sm" onclick="UI.nameMatch('${e.accountId}',true)">It is a customer</button><button class="btn sm" onclick="UI.nameMatch('${e.accountId}',false)">Not the same</button>`;
    if (e.kind === 'record') return `<button class="btn sm" onclick="UI.resolve('${e.id}','Identity dispute resolved: kept the Apollo record')">Resolve</button>`;
    if (e.kind === 'niche') return `<select class="sel" onchange="UI.setNiche('${e.accountId}',this.value)"><option>Set the niche…</option>${['Refinery', 'Petrochemical complex', 'Specialty chemicals plant', 'Gas processing plant'].map(n => `<option>${n}</option>`).join('')}</select>`;
    if (e.kind === 'persona') return `<select class="sel" onchange="UI.setPersona('${e.contactId}',this.value)"><option>Set the persona…</option>${['buyer', 'technical lead', 'operations', 'procurement'].map(n => `<option>${n}</option>`).join('')}</select>`;
    if (e.kind === 'reply') return `<select class="sel" onchange="UI.matchReply('${e.replyId}',this.value)"><option>Match to…</option>${D.M.rows.filter(r => r.a.owner === 'sofia' && r.tier).slice(0, 8).map(r => `<option value="${r.id}">${esc(r.a.name)}</option>`).join('')}</select>`;
    if (e.kind === 'icp' || e.kind === 'setup') return `<a class="btn sm" href="#/admin/icp">Open ICP</a>`;
    if (e.kind === 'backtest') return `<a class="btn sm" href="#/backtest">Open report</a>`;
    if (e.kind === 'autopilot') return `<a class="btn sm" href="#/admin/autonomy">Open policy</a>`;
    return '';
  }

  /* ─── Campaigns (manager) ─── */
  function vCampaigns() {
    const C = D.M.campaigns, counts = D.M.flags.counts, c = D.cfg();
    const near = Object.entries(counts).filter(([k, v]) => v < c.campaign.threshold && v >= 5).sort((a, b) => b[1] - a[1]);
    return `<div class="page-h"><div class="grow"><h1>Campaigns</h1><div class="sub">The NBA or NBC rule: ${c.campaign.threshold} or more accounts in one microsegment within a rolling ${c.campaign.windowDays} days raise one campaign flag. Below that, each account gets its own next best action. Every campaign needs the sales manager's confirmation.</div></div></div>
      ${C.map(k => campaignCard(k)).join('') || '<div class="empty card">No microsegment has reached the threshold.</div>'}
      ${near.length ? `<div class="card" style="margin-top:14px"><div class="card-h"><h3>Close, but not a campaign</h3></div><div class="card-b">${near.map(([k, v]) => `<div class="set"><div class="grow"><div class="k">${esc(k)}</div><div class="d">${v} accounts inside ${c.campaign.windowDays} days: below the threshold, so each gets its own next best action</div></div><span class="badge b-grey">${v} of ${c.campaign.threshold}</span></div>`).join('')}</div></div>` : ''}`;
  }
  function campaignCard(k) {
    const mgr = D.S.role === 'manager', trig = k.trigger;
    const st = { pending: ['Waiting for confirmation', 'b-or'], confirmed: ['Confirmed', 'b-pos'], declined: ['Declined', 'b-grey'], fallback: ['Fell back to individual NBAs', 'b-grey'] }[k.state];
    const fill = (t, r) => t.replace(/\{first\}/g, r && r.contact ? first(r.contact.name) : 'there').replace(/\{account\}/g, r ? r.a.name : '').replace(/\{rep\}/g, r ? first(user(r.a.owner).name) : '');
    return `<div class="card" style="margin-bottom:14px"><div class="card-h"><h2>${esc(k.key)}</h2><span class="badge ${st[1]}">${st[0]}</span><span class="sp"></span><span class="sm muted">Flagged ${fdt(k.createdAt)}</span></div><div class="card-b">
      <div class="grid g3" style="margin-bottom:12px"><div><div class="lbl">Shared trigger</div>${trig ? `<b>${esc(trig.title)}</b><div class="sm muted">${sigTier(trig.tier)} · <a href="${esc(trig.sourceUrl)}" target="_blank" rel="noopener">${esc(trig.sourceName)}</a></div>` : '–'}</div>
        <div><div class="lbl">Accounts</div><b>${k.accounts.length}</b> <span class="sm muted">across ${new Set(k.accounts.map(r => r.a.owner)).size} owners</span></div>
        <div><div class="lbl">${k.state === 'pending' ? 'Due and default' : 'Confirmed'}</div>${k.state === 'pending' ? dueTxt(k.due) + '<div class="sm muted">No answer in 3 days: falls back to individual NBAs</div>' : k.confirmedAt ? fdt(k.confirmedAt) : esc(k.declinedReason || '–')}</div></div>
      <div class="lbl" style="margin-bottom:6px">Three touches</div>
      <div class="grid g3" style="margin-bottom:12px">${k.touches.map(t => `<div class="ccard"><div class="card-h"><b>Touch ${t.n}</b><span class="badge b-blue">Day ${t.day}</span><span class="badge b-grey">${t.channel}</span></div><div class="card-b"><div class="sm muted" style="margin-bottom:6px">${esc(t.kind)}</div><div class="draft sm" id="touch-${t.n}">${cite(fill(t.message, k.accounts[0]))}</div>${mgr && k.state === 'pending' ? `<button class="btn sm ghost" onclick="UI.editTouch('${esc(k.key)}',${t.n})">Edit</button>` : ''}</div></div>`).join('')}</div>
      <details ${k.state === 'pending' ? 'open' : ''}><summary class="lbl">Accounts and owners</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Owner</th><th>Contact</th><th>Tier</th>${k.state === 'confirmed' ? '<th>Touches</th>' : ''}</tr></thead><tbody>${k.accounts.map(r => `<tr><td><a href="#/account/${r.id}">${esc(r.a.name)}</a></td><td class="sm">${esc(user(r.a.owner).name)}</td><td class="sm">${r.contact ? esc(r.contact.name) + ' ' + idTier(r.contact.identityTier) : '–'}</td><td>${tierBadge(r.tier, true)}</td>${k.state === 'confirmed' ? `<td class="sm">${k.tasks.filter(t => t.accountId === r.id).map(t => `<span class="badge ${t.status === 'Sent' ? 'b-pos' : t.status === 'Held' ? 'b-neg' : t.status === 'Due' ? 'b-or' : 'b-grey'}" title="${esc(t.hold || '')}">${t.n}: ${t.status}</span>`).join(' ')}</td>` : ''}</tr>`).join('')}</tbody></table></div></details>
      ${mgr && k.state === 'pending' ? `<div class="row wrap" style="margin-top:12px"><button class="btn pri" onclick="UI.confirmCampaign('${esc(k.key)}')">Confirm the campaign</button><button class="btn" onclick="UI.declineCampaign('${esc(k.key)}')">Decline</button><span class="sm muted">Nothing starts until you confirm. Then each owner gets three scheduled tasks per account.</span></div>` : !mgr && k.state === 'pending' ? '<div class="note" style="margin-top:12px">Waiting for the sales manager. Switch to the sales manager view to confirm.</div>' : ''}
      ${k.state === 'confirmed' ? '<div class="sm muted" style="margin-top:10px">Before each touch the protective checks and message verification run again; a failure holds that touch and escalates it to the owning rep. A logged reply removes that account\'s pending touches.</div>' : ''}</div></div>`;
  }

  /* ─── Campaign tasks (rep) ─── */
  function vTasks() {
    const role = D.S.role, rows = [];
    D.M.campaigns.filter(k => k.state === 'confirmed').forEach(k => k.tasks.filter(t => role !== 'rep' || t.owner === D.S.repUser).forEach(t => rows.push(Object.assign({ camp: k.key }, t))));
    rows.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return `<div class="page-h"><div class="grow"><h1>Campaign tasks</h1><div class="sub">Touches from confirmed campaigns, scheduled for each account owner. The checks run again before each touch.</div></div></div>
      ${rows.length ? `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Due</th><th>Account</th><th>Touch</th><th>Owner</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(t => { const r = D.M.byId.get(t.accountId); return `<tr><td class="sm">${fdt(t.dueAt)}</td><td><a href="#/account/${t.accountId}">${esc(r.a.name)}</a><div class="sm muted">${esc(t.camp)}</div></td><td>Touch ${t.n} · day ${t.day} · ${t.channel}</td><td class="sm">${esc(first(user(t.owner).name))}</td><td><span class="badge ${t.status === 'Sent' ? 'b-pos' : t.status === 'Held' ? 'b-neg' : t.status === 'Due' ? 'b-or' : 'b-grey'}">${t.status}</span>${t.hold ? `<div class="sm" style="color:var(--neg)">${esc(t.hold)}</div>` : ''}</td>
        <td><div class="row wrap">${t.status === 'Due' ? `<button class="btn sm pri" onclick="UI.sendTouch('${esc(t.camp)}','${t.accountId}',${t.n})">Send</button>` : ''}${t.status === 'Held' ? `<button class="btn sm" onclick="UI.skipTouch('${esc(t.camp)}','${t.accountId}',${t.n})">Skip</button>` : ''}${['Due', 'Scheduled'].includes(t.status) ? `<button class="btn sm ghost" onclick="UI.logReply('${esc(t.camp)}','${t.accountId}')">Log a reply</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="card empty">No confirmed campaign yet. The sales manager confirms each campaign first.</div>'}`;
  }

  /* ─── Accounts ─── */
  function vAccounts() {
    const q = (D.accQ || '').toLowerCase();
    const rows = D.M.rows.filter(mine).filter(r => !q || (r.a.name + r.niche + r.a.region + r.route).toLowerCase().includes(q)).sort((a, b) => (b.rank || -1) - (a.rank || -1));
    return `<div class="page-h"><div class="grow"><h1>Accounts</h1><div class="sub">${D.S.role === 'rep' ? 'Your territory only. ' : ''}${rows.length} accounts from the list built on ${esc(D.icp().version)}. Demand AI reads the CRM and never writes to it.</div></div><input class="inp" placeholder="Search accounts" value="${esc(D.accQ || '')}" oninput="UI.accQ(this.value)"></div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Niche</th><th>Region</th><th>Fit</th><th>Timing</th><th>Rank</th><th>Tier</th><th>Status</th><th>Owner</th></tr></thead><tbody>${rows.map(r => `<tr class="link" onclick="UI.go('account/${r.id}')"><td class="nm">${esc(r.a.name)}</td><td class="sm">${esc(r.niche || 'Unclassified')}</td><td class="sm">${esc(r.a.region)}</td><td>${r.fit == null ? '–' : r.fit}</td><td>${fmtN(r.timing)}</td><td class="mono">${fmtN(r.rank)}</td><td>${tierBadge(r.tier, true)}</td><td style="max-width:240px">${statusHtml(r)}</td><td class="sm">${esc(first(user(r.a.owner).name))}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /* ─── Signals: live, discarded (debug), registry ─── */
  function vSignals(tab) {
    tab = tab || 'live';
    const rows = D.M.rows.filter(mine);
    const live = rows.flatMap(r => r.sig.live.map(s => Object.assign({ acc: r }, s))).sort((a, b) => b.value - a.value);
    const disc = rows.flatMap(r => r.sig.discarded.map(s => Object.assign({ acc: r }, s)));
    const exp = rows.flatMap(r => r.sig.expired.map(s => Object.assign({ acc: r }, s)));
    const t = { live: () => `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Signal</th><th>Account</th><th>Level</th><th>Tier</th><th>Age</th><th>Points today</th><th>Source</th></tr></thead><tbody>${live.map(s => `<tr><td><span class="cite">${s.id}</span> ${esc(s.title)}<div class="sm muted">"${esc(s.evidence)}"</div>${s.relevance ? `<div class="sm" style="color:var(--purple-dk)">${esc(s.relevance)}</div>` : ''}</td><td><a href="#/account/${s.acc.id}">${esc(s.acc.a.name)}</a></td><td class="sm">${esc(s.level)}</td><td>${sigTier(s.tier)}</td><td class="sm">${ageTxt(s.age)}</td><td class="mono">${s.value}${s.repeatNo > 1 ? ' <span class="badge b-grey">repeat ' + s.repeatNo + '</span>' : ''}</td><td class="sm">${s.sources.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>`).join(', ')}${s.stale ? ' <span class="badge b-or">stale</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`,
      discarded: () => `<div class="note warn" style="margin-bottom:10px">Debug view. A signal counts only if it is observable, predictive and time-bound. These failed one test and were discarded, with the test recorded. Discards are not escalations.</div><div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Signal</th><th>Account</th><th>Failed test</th><th>Why</th></tr></thead><tbody>${disc.map(s => `<tr><td>${esc(s.title)}<div class="sm muted">"${esc(s.evidence)}"</div></td><td><a href="#/account/${s.acc.id}">${esc(s.acc.a.name)}</a></td><td><span class="badge b-neg">${esc(s.failed)}</span></td><td class="sm">${esc(s.why)}${s.relevance ? '<br>' + esc(s.relevance) : ''}</td></tr>`).join('')}</tbody></table></div>`,
      expired: () => `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Signal</th><th>Account</th><th>Tier</th><th>Event</th><th>Expired</th></tr></thead><tbody>${exp.map(s => `<tr><td>${esc(s.title)}</td><td>${esc(s.acc.a.name)}</td><td>${sigTier(s.tier)}</td><td class="sm">${fd(s.eventDate)}</td><td class="sm">${fd(s.expiresAt)}${s.expiresOn ? ' (date in the text)' : ''}</td></tr>`).join('')}</tbody></table></div>`,
      registry: () => `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Level</th><th>Signal</th><th>Source or API</th><th>Capture</th><th>Signal tier</th><th>Release</th></tr></thead><tbody>${D.SEED.registry.map(x => `<tr><td class="mono">${esc(x.code)}</td><td class="sm">${esc(x.level)}</td><td>${esc(x.signal)}</td><td class="sm">${esc(x.source_or_api)}</td><td class="sm">${esc(x.capture)}</td><td class="sm">${esc(x.signal_tier)}</td><td><span class="badge ${x.release === 'R1' ? 'b-pos' : 'b-grey'}">${esc(x.release)}</span></td></tr>`).join('')}</tbody></table></div>` };
    return `<div class="page-h"><div class="grow"><h1>Signals</h1><div class="sub">Market, company, competitor, personal and LinkedIn engagement signals. Tier 1: 100 points, full for 3 days, zero by day 14. Tier 2: 60, full 14, zero 60. Tier 3: 30, full 60, zero 90.</div></div>${cacheTag}</div>
      <div class="tabs">${[['live', 'Live (' + live.length + ')'], ['discarded', 'Discarded (' + disc.length + ')'], ['expired', 'Expired (' + exp.length + ')'], ['registry', 'Registry']].map(x => `<button class="${tab === x[0] ? 'on' : ''}" onclick="UI.go('signals/${x[0]}')">${x[1]}</button>`).join('')}</div>${t[tab]()}`;
  }

  /* ─── Render ─── */
  function render() {
    D.compute();
    const p = parts();
    document.body.dataset.role = D.S.role;
    renderNav(); renderTop();
    const V = window.UIX || {};
    const views = { queue: vQueue, account: () => vAccount(p[1], p[2]), card: () => vCard(p[1]), escalations: vEscalations, campaigns: vCampaigns, tasks: vTasks, accounts: vAccounts, signals: () => vSignals(p[1]) };
    const fn = views[p[0]] || (V.views && V.views[p[0]] ? () => V.views[p[0]](p[1]) : null) || vQueue;
    const key = parts().join('/'), keep = $('work').scrollTop, same = D.lastRoute === key;
    $('work').innerHTML = fn();
    $('work').scrollTop = same ? keep : 0; D.lastRoute = key;
    if (window.CHAT) CHAT.renderChips();
  }

  window.UI = {
    go, render, toast, esc, cite, fd, fdt, ageTxt, dueTxt, tierBadge, sigTier, idTier, confHtml, statusHtml, whyLine, demoTag, cacheTag, user, first, fmtN, mine, ROUTE, campaignCard, criteriaHtml, signalsCited, timelineItems,
    role: r => { D.A.setRole(r); go(defaultRoute()); if (window.CHAT) CHAT.greet(); },
    rep: u => { D.A.setRep(u); render(); },
    advance: d => act(D.A.advance(d), 'Advanced the clock by ' + d + ' day' + (d > 1 ? 's' : '') + '. Signals decayed; due times checked.'),
    reset: () => { D.A.reset(); toast('Demo reset to the seed.'); go(defaultRoute()); if (window.CHAT) CHAT.reset(); },
    send: id => act(D.A.send(id, 'sent'), 'Sent from the rep\'s mailbox (simulated). Logged with its signals, rule version and message version.'),
    skip: id => modal('Skip ' + D.acct(id).name + '?', '<p class="sm">Pick a reason. It is logged and teaches the next recommendation.</p>' + ['Wrong timing', 'Not our offer', 'The data is wrong', 'Already in talks', 'Customer at risk'].map(w => `<button class="btn" onclick="UI.closeModal();UI.act(DM.A.skip('${id}','${w}'),'Skipped and logged.')">${w}</button>`).join(' ')),
    saveEdit: id => act(D.A.editDraft(id, $('cardBody').value), 'Edit saved as a diff.'),
    approve: id => { const body = $('cardBody').value, r = D.M.byId.get(id); let how = 'approved'; if (body !== r.draft.body) { const e = D.A.editDraft(id, body); if (e && e.error) return act(e); how = 'edited'; } act(D.A.send(id, how), how === 'edited' ? 'Edited, approved and sent. The diff is stored.' : 'Approved and sent. The decision is logged.'); go('queue'); },
    liveVerify: id => { const r = D.M.byId.get(id); const v = E.verifyDraft($('cardBody').value, D.SEED.content, r.sig.live.flatMap(s => s.mergedIds).concat(D.SEED.content.cases.map(k => k.id))); $('liveVer').innerHTML = verHtml(v); },
    optOut: cid => modal('Add an opt-out for ' + D.contact(cid).name + '?', '<p class="sm">They are suppressed in every queue and every later run.</p><button class="btn pri" onclick="UI.closeModal();UI.act(DM.A.optOut(\'' + cid + '\'),\'Opt-out added. The contact is suppressed in every later run.\')">Add the opt-out</button> <button class="btn" onclick="UI.closeModal()">Cancel</button>'),
    confirmCampaign: k => act(D.A.confirmCampaign(k), 'Campaign confirmed. Tasks were scheduled for each owner.'),
    declineCampaign: k => modal('Decline the campaign?', '<label class="lbl" for="mText">Why</label><textarea class="inp" id="mText" style="min-height:70px">Too broad for one message</textarea><div class="row" style="margin-top:10px"><button class="btn pri" onclick="UI.modalDo(t => DM.A.declineCampaign(' + esc(JSON.stringify(k)) + ', t), \'Declined. The accounts get individual next best actions.\')">Decline</button><button class="btn" onclick="UI.closeModal()">Cancel</button></div>'),
    editTouch: (k, n) => { const cur = D.M.campaigns.find(x => x.key === k).touches.find(t => t.n === n).message; modal('Edit touch ' + n, '<p class="sm muted">{first}, {account} and {rep} are filled in for each account.</p><textarea class="inp" id="mText">' + esc(cur) + '</textarea><div class="row" style="margin-top:10px"><button class="btn pri" onclick="UI.modalDo(t => DM.A.editTouch(' + esc(JSON.stringify(k)) + ', ' + n + ', t), \'Touch ' + n + ' edited.\')">Save</button><button class="btn" onclick="UI.closeModal()">Cancel</button></div>'); },
    sendTouch: (k, a, n) => act(D.A.sendTouch(k, a, n), 'Touch ' + n + ' sent and logged.'),
    skipTouch: (k, a, n) => act(D.A.skipTouch(k, a, n), 'Touch skipped and logged.'),
    logReply: (k, a) => act(D.A.logReply(k, a), 'Reply logged. That account\'s pending touches were removed.'),
    resolve: (id, t) => act(D.A.resolve(id, t), 'Resolved and logged.'),
    nameMatch: (a, c) => act(D.A.confirmNameMatch(a, c), c ? 'Confirmed as a customer: excluded.' : 'Rejected: the account continues.'),
    setNiche: (a, n) => act(D.A.setNiche(a, n), 'Niche set.'),
    setPersona: (c, p) => act(D.A.setPersona(c, p), 'Persona set.'),
    matchReply: (r, a) => act(D.A.matchReply(r, a), 'Reply matched.'),
    accQ: q => { D.accQ = q; const pos = document.activeElement && document.activeElement.selectionStart; render(); const el = document.querySelector('.page-h input'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } },
    act, modal,
    closeModal: () => { $('modal').hidden = true; },
    modalDo: (fn, msg) => { const t = $('mText').value; $('modal').hidden = true; act(fn(t), msg); }
  };
  /* In-page links (#/view/…) route inside the page. */
  document.addEventListener('click', e => { const a = e.target.closest('a[href^="#/"]'); if (!a) return; e.preventDefault(); go(a.getAttribute('href').slice(2)); });
  window.addEventListener('hashchange', () => { const h = location.hash.replace(/^#\/?/, ''); if (h && h !== parts()[0]) { route = h; render(); } });
  /* A dialog inside the page (the viewer blocks browser dialogs). */
  function modal(title, html) { const m = $('modal'); m.innerHTML = `<div class="modal-b" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="row"><h2 class="grow">${esc(title)}</h2><button class="btn sm ghost" onclick="UI.closeModal()">Close</button></div><div style="margin-top:10px">${html}</div></div>`; m.hidden = false; const f = m.querySelector('textarea,button.pri'); if (f) f.focus(); }
})();
