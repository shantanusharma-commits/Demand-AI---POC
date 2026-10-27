/* DemandAI production mock: the sales workspace (rep and manager).
   One page with four tabs (#home, #approvals, #accounts, #campaigns). The chat is shared by every tab:
   full width on Home, docked on the left everywhere else. Replies are scripted against mock-data.js. */
(function () {
  const { USERS, REPS, ACCOUNTS, PROSPECTS_FOUND, CAMPAIGNS, LEARNED, SCHEDULED, TEAM_STATS } = window.MOCK;

  /* ─── Session ─── */
  let me = USERS[localStorage.getItem('dmock_user') || 'sofia'] || USERS.sofia;
  if (me.role === 'admin') { location.href = 'admin/index.html'; return; }
  const isMgr = me.role === 'manager';
  const STATE_KEY = 'dmock_state_' + me.id;
  const S = Object.assign({ thread: null, decisions: {}, todosDone: {}, notes: {}, outcomes: {}, drafts: {}, runs: [], camp: {} },
    JSON.parse(sessionStorage.getItem(STATE_KEY) || '{}'));
  const save = () => sessionStorage.setItem(STATE_KEY, JSON.stringify(S));
  let ctx = null;            // account id the chat is focused on (@ chip)
  let accView = 'ranked', accScope = isMgr ? 'team' : 'mine', apprTab = isMgr ? 'needs' : 'todo', apprRep = 'all', campSel = 'c1', recTab = 'next', recId = null;

  /* ─── Helpers ─── */
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatar = (u, sz) => `<span class="av" style="background:${u.color}${sz ? `;width:${sz}px;height:${sz}px;font-size:${Math.round(sz / 2.7)}px` : ''}">${initials(u.name)}</span>`;
  const first = n => n.split(' ')[0];
  const acct = id => ACCOUNTS.find(a => a.id === id);
  const mine = a => isMgr || a.owner === me.id;
  const scoped = scope => ACCOUNTS.filter(a => scope === 'team' ? true : a.owner === me.id);
  const fmt = n => Number(n).toLocaleString('en-US');
  const toast = msg => { document.querySelectorAll('.toast').forEach(t => t.remove()); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); };
  const IC = {
    send: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    hist: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 14"/>',
    left: '<polyline points="15 18 9 12 15 6"/>',
    right: '<polyline points="9 18 15 12 9 6"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    li: '<rect x="3" y="3" width="18" height="18" rx="3"/><line x1="8" y1="10" x2="8" y2="16"/><line x1="8" y1="7" x2="8" y2="7.01"/><path d="M12 16v-3.5a2 2 0 0 1 4 0V16"/><line x1="12" y1="10" x2="12" y2="16"/>',
    task: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    up: '<path d="M7 10v12"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z"/>',
    down: '<path d="M17 14V2"/><path d="M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.6l2.3-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.8a2 2 0 0 0-1.8 1.1L12 22a3.1 3.1 0 0 1-3-3.9z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    expand: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.3 1.7 1.4 2.7 2.5 2.7z"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  };
  const ic = (n, sz = 15, sw = 2) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`;
  const tierBadge = t => t === '—' ? '<span class="muted">—</span>' : `<span class="tier ${t}">${t}</span>`;
  const ID_TIER = { 1: ['Tier 1', 'b-pos', 'Found on the primary provider, first try'], 2: ['Tier 2', 'b-pos', 'Fallback provider, confirmed by a second'], 3: ['Tier 3', 'b-warn', 'Fallback provider, not yet confirmed'], 4: ['Tier 4', 'b-neg', 'Providers disagree: held'], 5: ['Tier 5', 'b-grey', 'Last-resort provider only'] };
  const idBadge = t => `<span class="badge ${ID_TIER[t][1]}" title="${ID_TIER[t][2]}">${ID_TIER[t][0]}</span>`;
  const REASON = { 'Ready': 'b-pos', 'Medium confidence': 'b-warn', 'Unproven message': 'b-ter', 'Sensitive': 'b-neg', 'Spot-check': 'b-sec' };
  const reasonOf = a => a.nba.reason || 'Ready';
  const ago = d => d === 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;

  /* ─── Work items ─── */
  function draftOf(a) { return Object.assign({ subject: a.nba.subject, body: a.nba.body, channel: a.nba.channel, option: 'rec' }, S.drafts[a.id] || {}); }
  function openItems() { return ACCOUNTS.filter(a => a.nba && (a.nba.status === 'ready' || a.nba.status === 'review')); }
  function apprItems(tab) {
    const all = openItems();
    if (isMgr) {
      if (tab === 'needs') return all.filter(a => a.nba.sensitive && !S.decisions[a.id]);
      if (tab === 'done') return all.filter(a => S.decisions[a.id]);
      return all.filter(a => !S.decisions[a.id] && (apprRep === 'all' || a.owner === apprRep));
    }
    const own = all.filter(a => a.owner === me.id);
    if (tab === 'waiting') return own.filter(a => S.decisions[a.id] === 'with-manager');
    if (tab === 'done') return own.filter(a => S.decisions[a.id] && S.decisions[a.id] !== 'with-manager');
    return own.filter(a => !S.decisions[a.id]);
  }
  function badgeCount() { return isMgr ? apprItems('needs').length : apprItems('todo').length; }

  function todos() {
    if (isMgr) {
      const sens = apprItems('needs');
      const t = [];
      if (sens.length) t.push({ id: 'm1', t: `Approve ${sens.length} sensitive message${sens.length > 1 ? 's' : ''}`, d: sens.map(a => `${a.name} (${first(USERS[a.owner].name)})`).join(' · '), due: 'Today 15:00', cls: 'hot', go: () => go('approvals') });
      if (!S.camp.c1) t.push({ id: 'm2', t: 'Confirm a campaign: new reliability & operations leaders', d: '11 accounts crossed the campaign threshold', due: 'Today', cls: 'soon', go: () => { campSel = 'c1'; go('campaigns'); } });
      t.push({ id: 'm3', t: 'Kenji has 3 overdue items and no meetings yet', d: 'Reassign or nudge. The AI suggests moving 2 to Aisha', due: 'Overdue', cls: 'hot', go: () => ask('How is my team doing?') });
      t.push({ id: 'm4', t: 'Marco has 2 overdue items', d: 'Meridian Olefins needs your warm intro first', due: 'Overdue', cls: 'soon', go: () => openRecord('meridian', 'next') });
      t.push({ id: 'm5', t: 'Read the weekly pilot readout', d: 'Ready Friday 16:00', due: 'Fri', cls: 'ok', go: () => ask('What did we learn this week?') });
      return t;
    }
    const t = [];
    const e = acct('eastgate');
    t.push({ id: 't1', t: 'Reply to Dian Putri: she said yes to a call', d: 'Eastgate Refinery · positive reply at 08:12 · fast lane', due: 'By 11:00', cls: 'hot', go: () => openRecord('eastgate', 'activity') });
    const ready = apprItems('todo').filter(a => !a.nba.reason);
    if (ready.length) t.push({ id: 't2', t: `Approve ${ready.length} ready action${ready.length > 1 ? 's' : ''}`, d: ready.map(a => a.name).join(' · '), due: 'Today 12:00', cls: 'soon', go: () => go('approvals') });
    const unsure = apprItems('todo').filter(a => a.nba.reason && !a.nba.sensitive);
    if (unsure.length) t.push({ id: 't3', t: `Review ${unsure.length} item${unsure.length > 1 ? 's' : ''} the AI wasn't sure about`, d: unsure.map(a => `${a.name} · ${reasonOf(a).toLowerCase()}`).join(' · '), due: 'Today 17:00', cls: 'soon', go: () => go('approvals') });
    const sens = apprItems('todo').filter(a => a.nba.sensitive);
    if (sens.length) t.push({ id: 't4', t: `Check ${sens.length} sensitive message${sens.length > 1 ? 's' : ''} before it goes to Pavan`, d: sens.map(a => a.name).join(' · '), due: 'Fri 30 Oct', cls: 'ok', go: () => openRecord(sens[0].id, 'next') });
    t.push({ id: 't5', t: 'Call Paolo-style: log what happened with Sapphire Aromatics', d: 'Email sent Monday, no reply yet. Mark the outcome', due: 'Today', cls: 'ok', go: () => openRecord('sapphire', 'activity') });
    t[t.length - 1].t = 'Log the outcome for Sapphire Aromatics';
    return t;
  }

  /* ─── Routing ─── */
  function route() { return (location.hash || '#home').slice(1).split('?')[0]; }
  function go(r) { location.hash = '#' + r; }
  window.addEventListener('hashchange', () => { closeRecord(true); renderAll(); });

  /* ─── Top bar ─── */
  function renderTop() {
    const r = route(), n = badgeCount();
    const tabs = [['home', 'Home'], ['approvals', 'Approvals'], ['accounts', 'Accounts'], ['campaigns', 'Campaigns']];
    $('tabs').innerHTML = tabs.map(([k, l]) => `<a class="top-tab ${r === k ? 'on' : ''}" href="#${k}">${l}${k === 'approvals' && n ? `<span class="cnt">${n}</span>` : ''}</a>`).join('');
    $('topRight').innerHTML = `
      <button class="top-ic" title="Search" onclick="App.focusComposer('Find ')">${ic('search', 16)}</button>
      <button class="top-ic" title="Alerts" onclick="App.toggleMenu('bellMenu')">${ic('bell', 16)}<span class="dot"></span></button>
      <div class="top-user" onclick="App.toggleMenu('userMenu')">${avatar(me)}<div><div class="nm">${esc(me.name)}</div><div class="rl">${isMgr ? 'Sales manager · 4 reps' : 'Sales rep'}</div></div></div>`;
    $('userMenu').innerHTML = `
      <div style="padding:8px 10px 6px"><div style="font-weight:700;font-size:13px">${esc(me.name)}</div><div class="muted" style="font-size:11.5px">${esc(me.title)}</div></div>
      <div class="sep"></div>
      <button onclick="App.switchUser('${isMgr ? 'sofia' : 'pavan'}')">${ic('users', 14)} Switch to ${isMgr ? 'Sofia (sales rep)' : 'Pavan (sales manager)'} <span class="muted" style="margin-left:auto;font-size:10.5px">demo</span></button>
      <button onclick="App.openRuns()">${ic('clock', 14)} Scheduled runs</button>
      <a href="story.html" target="_blank">${ic('book', 14)} What we're selling</a>
      <div class="sep"></div>
      <a href="index.html" onclick="localStorage.removeItem('dmock_user')">${ic('out', 14)} Sign out</a>`;
    $('bellMenu').innerHTML = `<div class="lbl" style="padding:8px 10px">Alerts</div>${alerts().map(x => `<div class="alert ${x.k}" style="margin:4px 4px 6px" onclick="${x.on}"><div><b>${x.t}</b>${x.d}</div></div>`).join('')}`;
  }
  function alerts() {
    return isMgr ? [
      { k: 'warn', t: 'Unusual spike: control-systems hiring in Thailand', d: '5 accounts posted roles in 2 days. They get a temporary tier-1 boost and Marco has been told.', on: "App.ask('Why did Thailand accounts jump?')" },
      { k: 'neg', t: 'Kenji: 3 items overdue', d: 'Banyan Gas, Coral Bay Refining and one spot-check.', on: "App.ask('How is my team doing?')" },
      { k: 'info', t: 'Champion moved', d: 'Arjun Mehta (ex-Straits Petrochem) is now Head of Reliability at Juniper Petrochem. Added as a warm path for Sofia.', on: "App.openRecord('juniper','why')" },
    ] : [
      { k: 'info', t: 'Champion moved', d: 'Arjun Mehta, your former contact at Straits Petrochem, is now Head of Reliability at Juniper Petrochem. Added as a warm path.', on: "App.openRecord('juniper','why')" },
      { k: 'warn', t: 'Status watch: Orchid Energy', d: 'Marco opened an opportunity there yesterday, so it was taken off your list (no double outreach).', on: "App.toast('Orchid Energy is owned by Marco now')" },
      { k: 'brand', t: 'Sapphire Aromatics: sent, no reply yet', d: 'It\'s been 1 day. The system will suggest a follow-up on day 4.', on: "App.openRecord('sapphire','activity')" },
    ];
  }

  /* ─── Chat ─── */
  function seedThread() {
    S.thread = [{ who: 'ai', kind: 'brief' }];
    save();
  }
  function renderChat() {
    if (!S.thread) seedThread();
    const home = route() === 'home' && !recId;
    const hints = isMgr
      ? ['How is my team doing?', 'What needs my approval?', 'Show the campaign that\'s ready', 'Rank the team\'s accounts', 'What did we learn this week?', 'Schedule a Monday 7am prospect refresh']
      : ['What should I do first today?', 'Find refiners in Thailand like my last 3 wins', 'Rank my accounts for this week', 'Why is Juniper ranked first?', 'Group my accounts by trigger', 'What worked last month?'];
    $('chat').innerHTML = `
      <div class="chat-h">
        <span class="ai-av" style="width:24px;height:24px;border-radius:7px;background:linear-gradient(135deg,var(--brand),#A47FCB);color:#fff;display:inline-flex;align-items:center;justify-content:center">${ic('spark', 13)}</span>
        <div class="ttl" onclick="App.toggleMenu('histMenu')">Today's brief ${ic('right', 12)}</div>
        <div class="sp"></div>
        <button class="ic-btn" title="Scheduled runs" onclick="App.openRuns()">${ic('clock', 15)}</button>
        <button class="ic-btn" title="New chat" onclick="App.newChat()">${ic('plus', 15)}</button>
        ${home ? '' : `<button class="ic-btn" title="Hide chat" onclick="App.toggleChat(false)">${ic('left', 15)}</button>`}
      </div>
      <div class="menu" id="histMenu" style="position:absolute;top:auto;left:14px;right:auto;margin-top:46px;width:280px">
        <div class="lbl" style="padding:6px 10px">Recent chats</div>
        <button onclick="App.toggleMenu('histMenu')">Today's brief <span class="muted" style="margin-left:auto;font-size:11px">now</span></button>
        <button onclick="App.toggleMenu('histMenu');App.ask('Find refiners in Thailand like my last 3 wins')">Refiners in Thailand like my wins <span class="muted" style="margin-left:auto;font-size:11px">Mon</span></button>
        <button onclick="App.toggleMenu('histMenu');App.ask('What should I do with Cedar?')">Cedar renewal prep <span class="muted" style="margin-left:auto;font-size:11px">Fri</span></button>
        <div class="sep"></div>
        <button onclick="App.toggleMenu('histMenu');App.openRuns()">${ic('clock', 14)} Scheduled runs (${SCHEDULED.length + S.runs.length})</button>
      </div>
      <div class="thread" id="thread"><div class="thread-in" id="threadIn">
        ${home ? `<div class="greet"><h1>${greeting()}, ${esc(first(me.name))}</h1><div class="sub">${isMgr ? 'Your team\'s day, prepared overnight. Approve, edit or ask.' : 'Your day is ready. I\'ve done the research; you approve, edit or ask.'}</div></div>` : ''}
        ${S.thread.map(renderMsg).join('')}
      </div></div>
      <div class="composer-wrap"><div class="composer-in">
        <div class="hints">${hints.slice(0, home ? 6 : 3).map(h => `<button class="chip" onclick="App.ask(${esc(JSON.stringify(h))})">${esc(h)}</button>`).join('')}</div>
        <div class="composer">
          <div class="ctx" id="ctx">${ctxChip()}</div>
          <textarea id="composer" rows="1" placeholder="Prospect, score, engage… type @ to add an account" onkeydown="App.key(event)" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
          <div class="composer-f">
            <button class="ic-btn" title="Add an account" onclick="App.focusComposer('@')">@</button>
            <span class="muted" style="font-size:11px">Scripted demo · nothing is sent</span>
            <div class="sp"></div>
            <button class="send" onclick="App.send()" title="Send">${ic('send', 16)}</button>
          </div>
        </div>
      </div></div>`;
    const th = $('thread'); th.scrollTop = home && S.thread.length < 2 ? 0 : th.scrollHeight;
  }
  function ctxChip() { return ctx ? `<span class="badge b-brand" onclick="App.setCtx(null)" title="Remove">@${esc(acct(ctx).name)} ✕</span>` : ''; }
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  function stepsHtml(steps) { return steps && steps.length ? `<div class="steps">${steps.map(x => `<div class="st"><span class="ok">✓</span><span>${x}</span></div>`).join('')}</div>` : ''; }
  function fbHtml() { return `<div class="fb"><button class="ic-btn" title="Copy">${ic('copy', 13)}</button><button class="ic-btn" title="Good" onclick="App.toast('Thanks. Feedback goes into the learning loop')">${ic('up', 13)}</button><button class="ic-btn" title="Not good" onclick="App.toast('Thanks. Tell me what to change and I\\'ll redo it')">${ic('down', 13)}</button></div>`; }
  function aiWrap(inner, steps) { return `<div class="msg"><span class="ai-av">${ic('spark', 14)}</span><div class="bub">${stepsHtml(steps)}${inner}${fbHtml()}</div></div>`; }

  function renderMsg(m) {
    if (m.who === 'me') return `<div class="msg me"><div class="bub">${esc(m.text)}</div></div>`;
    if (m.who === 'typing') return `<div class="msg"><span class="ai-av">${ic('spark', 14)}</span><div class="bub">${m.step ? `<div class="steps"><div class="st"><span class="typing"><i></i><i></i><i></i></span><span>${m.step}</span></div></div>` : '<span class="typing"><i></i><i></i><i></i></span>'}</div></div>`;
    const R = RENDER[m.kind] || RENDER.text;
    return aiWrap(R(m), m.steps);
  }

  const RENDER = {
    text: m => `<p>${m.html}</p>`,
    brief: () => isMgr ? briefManager() : briefRep(),
    prospects: () => {
      const rows = PROSPECTS_FOUND.map(p => `<tr><td><div class="nm">${esc(p.name)}</div><div class="sm">${esc(p.title)}</div></td><td>${esc(p.account)}<div class="sm">${esc(p.country)}</div></td><td>${idBadge(p.idTier)}</td><td>${p.crm === 'New' ? '<span class="badge b-grey nodot">New</span>' : `<span class="badge b-neg">${esc(p.crm)}</span>`}</td></tr>`).join('');
      return `<p>I found <b>24 people at 17 accounts</b> that match your ICP and look like your recent wins. Here are the first 8. <b>2 are held</b> for a person to check, and I removed 4 existing customers.</p>
        <div class="ccard"><div class="ccard-h"><span class="t">Refining &amp; petrochemicals · SEA · lookalikes of your wins</span><span class="badge b-brand nodot">24 people</span></div>
        <div style="max-height:300px;overflow:auto"><table class="tbl"><thead><tr><th>Person</th><th>Account</th><th>Identity</th><th>CRM check</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="ccard-f"><button class="btn sm pri" onclick="App.ask('Rank them for this week')">Score these</button><button class="btn sm" onclick="App.goAccounts('prospects')">${ic('expand', 12)} Open full list</button><button class="btn sm" onclick="App.toast('Saved as “Refiners like my wins · 27 Oct”')">Save as list</button></div></div>`;
    },
    ranked: m => {
      const list = scoped(m.scope || (isMgr ? 'team' : 'mine')).filter(a => a.score > 0).slice(0, 6);
      return `<p>Ranked by <b>Fit × Timing</b>. An account with a great fit but no live signal scores zero, so these are the ones worth calling <i>now</i>.</p>
        <div class="ccard"><div class="ccard-h"><span class="t">Who to contact first · ${isMgr && (m.scope || 'team') === 'team' ? 'whole team' : 'your accounts'}</span><span class="muted" style="font-size:11px">as of today 06:00</span></div>
        <table class="tbl"><thead><tr><th>#</th><th>Account</th><th>Tier</th><th>Score</th><th>Why now</th>${isMgr ? '<th>Owner</th>' : ''}</tr></thead><tbody>
        ${list.map((a, i) => `<tr class="row-link" onclick="App.openRecord('${a.id}','why')"><td class="mono">${i + 1}</td><td><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.country)}</div></td><td>${tierBadge(a.tier)}</td><td class="mono">${fmt(a.score)}</td><td>${esc(a.whyNow.type)}<div class="sm">${ago(a.whyNow.age)}</div></td>${isMgr ? `<td>${esc(first(USERS[a.owner].name))}</td>` : ''}</tr>`).join('')}
        </tbody></table>
        <div class="ccard-f"><button class="btn sm pri" onclick="App.ask('Group them by trigger')">Group by trigger</button><button class="btn sm" onclick="App.goAccounts('ranked')">${ic('expand', 12)} Open ranked list</button><button class="btn sm" onclick="App.ask('Why is ${esc(list[0].name.split(' ')[0])} ranked first?')">Why is #1 first?</button></div></div>`;
    },
    why: m => {
      const a = acct(m.id), sig = a.signals.slice().sort((p, q) => q.weight - p.weight);
      return `<p><b>${esc(a.name)}</b> is #${a.rank} because it fits well <i>and</i> something changed this week.</p>
        <div class="ccard"><div class="ccard-b">
          <div class="formula"><div class="box"><div class="v">${a.fit}</div><div class="k">Fit</div></div><span class="op">×</span><div class="box"><div class="v">${a.timing}</div><div class="k">Timing</div></div><span class="op">=</span><div class="box" style="border-color:var(--brand-mid);background:var(--brand-lt)"><div class="v">${fmt(a.score)}</div><div class="k">Score · tier ${a.tier}</div></div></div>
          ${sig.map((x, i) => `<div class="mini-row"><span class="badge ${x.tier === 1 ? 'b-pos' : x.tier === 2 ? 'b-sec' : 'b-grey'} nodot">T${x.tier}</span><div class="grow"><div class="nm">${esc(x.type)} <span class="muted" style="font-weight:400">· ${ago(x.age)}</span></div><div class="sm">${esc(x.text)}</div></div><span class="mono" style="font-size:12px">${i === 0 ? '' : i === 1 ? '½ × ' : '¼ × '}${x.weight}</span></div>`).join('')}
          <div class="muted" style="font-size:11.5px;margin-top:8px">Each extra signal counts half the one before, so one strong signal beats a pile of weak ones. Signals fade with age.</div>
        </div><div class="ccard-f"><button class="btn sm pri" onclick="App.ask('What should I do with ${esc(a.name.split(' ')[0])}?')">What should I do?</button><button class="btn sm" onclick="App.openRecord('${a.id}','why')">${ic('expand', 12)} Open account</button></div></div>`;
    },
    segments: () => {
      const segs = {};
      scoped(isMgr ? 'team' : 'mine').filter(a => a.segment !== '—' && a.score > 0).forEach(a => (segs[a.segment] = segs[a.segment] || []).push(a));
      const proven = { 'Exec hire': ['Proven', 'b-pos', '64% positive'], 'Contract renewal': ['Proven', 'b-pos', '48% positive'], 'Compliance deadline': ['Provisional', 'b-warn', 'email only'], 'Capex / expansion': ['Proven', 'b-pos', '52% positive'], 'Tech-stack change': ['Provisional', 'b-warn', '6 outcomes'], 'Safety incident': ['Provisional', 'b-warn', 'sensitive'] };
      return `<p>Grouped by the strongest reason each account is ready. A segment with a <b>proven</b> message structure gets that approach (never the same words); a provisional one goes to review first.</p>
        <div class="ccard">${Object.entries(segs).map(([k, v]) => `<div class="mini-row" style="padding:10px 14px"><div class="grow"><div class="nm">${esc(k)} <span class="muted" style="font-weight:400">· ${v.length} account${v.length > 1 ? 's' : ''}</span></div><div class="sm">${v.map(a => esc(a.name)).join(' · ')}</div></div><span class="badge ${(proven[k] || ['', 'b-grey'])[1]}">${(proven[k] || ['New'])[0]}</span><span class="muted" style="font-size:11px;width:76px;text-align:right">${(proven[k] || ['', '', ''])[2]}</span></div>`).join('')}
        <div class="ccard-f"><button class="btn sm" onclick="App.goAccounts('segments')">${ic('expand', 12)} Open segments</button><button class="btn sm" onclick="App.ask('Show the campaign that\\'s ready')">Campaigns</button></div></div>`;
    },
    nba: m => nbaCard(acct(m.id), m.note),
    campaign: m => {
      const c = CAMPAIGNS.find(x => x.id === m.id);
      return `<p>${esc(c.why)}</p>
        <div class="ccard"><div class="ccard-h"><span class="t">${esc(c.name)}</span><span class="badge b-ter">${esc(S.camp[c.id] || c.status)}</span></div><div class="ccard-b">
        ${c.touches.map(t => `<div class="mini-row"><span class="badge b-brand nodot" style="width:56px;justify-content:center">${t.day}</span><div class="grow"><div class="nm">${t.ch} · ${t.fmt}</div><div class="sm">${esc(t.t)}</div></div></div>`).join('')}
        </div><div class="ccard-f">${isMgr ? `<button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm campaign</button>` : ''}<button class="btn sm" onclick="App.goCampaign('${c.id}')">${ic('expand', 12)} Review campaign</button><span class="muted" style="font-size:11px">Sending is a placeholder</span></div></div>`;
    },
    learned: () => `<p>Here's what the system learned from this month's outcomes. It learns from misses as well as wins.</p>
      <div class="ccard"><div class="ccard-b">${LEARNED.map(l => `<div class="mini-row"><span class="badge b-${l.k} nodot" style="width:20px;padding:0;justify-content:center">${l.k === 'pos' ? '↑' : l.k === 'neg' ? '↓' : l.k === 'warn' ? '!' : 'i'}</span><div class="grow"><div class="nm">${esc(l.t)}</div><div class="sm" style="white-space:normal">${esc(l.d)}</div></div></div>`).join('')}</div></div>`,
    team: () => {
      const rows = REPS.map(r => { const t = TEAM_STATS[r]; return `<tr class="row-link" onclick="App.repApprovals('${r}')"><td><div style="display:flex;gap:8px;align-items:center">${avatar(USERS[r], 24)}<span class="nm">${esc(USERS[r].name)}</span></div></td><td class="mono">${t.todo}</td><td>${t.overdue ? `<span class="badge b-neg">${t.overdue}</span>` : '<span class="muted">0</span>'}</td><td class="mono">${t.sent}</td><td class="mono">${t.replies}</td><td><span class="mono">${t.meetings}/${t.target}</span></td><td class="mono">${t.accept}%</td></tr>`; }).join('');
      return `<p>Your team this week: <b>7 meetings booked</b> against a target of 15, and reps accepted <b>77%</b> of the AI's recommendations first time. <b>Kenji</b> is behind: 3 overdue, no meetings yet. I suggest moving Banyan Gas and Coral Bay Refining to Aisha, who has capacity.</p>
        <div class="ccard"><table class="tbl"><thead><tr><th>Rep</th><th>To do</th><th>Overdue</th><th>Sent</th><th>Replies</th><th>Meetings</th><th>Accepted</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="ccard-f"><button class="btn sm pri" onclick="App.toast('Banyan Gas and Coral Bay Refining moved to Aisha (mock)')">Move 2 to Aisha</button><button class="btn sm" onclick="App.toast('Nudge sent to Kenji in the team channel (mock)')">Nudge Kenji</button><button class="btn sm" onclick="App.go('approvals')">${ic('expand', 12)} Team approvals</button></div></div>`;
    },
    todo: () => `<p>Here's your list, most urgent first:</p><div class="ccard"><div class="ccard-b" style="padding:6px">${todoList()}</div></div>`,
    scheduled: m => `<p>Done. I'll run this on a schedule and put the results in your brief.</p>
      <div class="ccard"><div class="ccard-b"><div class="run" style="margin:0;border:none;padding:0"><div class="h">${esc(m.name)}<span class="badge b-pos">Active</span></div><div class="p">${esc(m.prompt)}</div><div class="m">${ic('clock', 12)} ${esc(m.freq)} · next run ${esc(m.next)}</div></div></div>
      <div class="ccard-f"><button class="btn sm" onclick="App.openRuns()">Edit scheduled runs</button></div></div>`,
    approvalsList: () => {
      const items = apprItems(isMgr ? 'needs' : 'todo');
      return items.length ? `<p>${isMgr ? 'These need your approval:' : 'These are waiting for you:'}</p><div class="ccard"><div class="ccard-b" style="padding:4px 14px">${items.map(a => apprMini(a)).join('')}</div><div class="ccard-f"><button class="btn sm" onclick="App.go('approvals')">${ic('expand', 12)} Open approvals</button></div></div>` : '<p>Nothing is waiting for you right now.</p>';
    },
    help: () => `<p>I can do the legwork across the whole flow. Try one of these:</p>
      <div class="hints" style="margin:4px 0">${['Find refiners in Thailand like my last 3 wins', 'Rank my accounts for this week', 'Why is Juniper ranked first?', 'Group them by trigger', 'What should I do with Cedar?', 'Make it shorter', 'What worked last month?', 'Every weekday at 7am, check my accounts for new signals'].map(h => `<button class="chip" onclick="App.ask(${esc(JSON.stringify(h))})">${esc(h)}</button>`).join('')}</div>`,
  };

  function apprMini(a) {
    const d = S.decisions[a.id];
    return `<div class="mini-row"><div class="grow row-link" onclick="App.openRecord('${a.id}','next')"><div class="nm">${esc(a.contact.name)} · ${esc(a.name)}</div><div class="sm">${esc(a.nba.action)} · ${a.nba.channel}${isMgr ? ' · ' + esc(first(USERS[a.owner].name)) : ''}</div></div>
      <span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span>
      ${d ? `<span class="badge b-grey nodot">${decLabel(d)}</span>` : `${!a.nba.reason ? `<button class="btn sm pri" onclick="App.approve('${a.id}')">Approve</button>` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','next')">Review</button>`}</div>`;
  }
  const decLabel = d => ({ approved: 'Approved · scheduled', 'with-manager': 'With Pavan', skipped: 'Skipped', 'sent-back': 'Sent back', signed: 'Signed off' }[d] || d);

  function briefRep() {
    const ready = apprItems('todo').filter(a => !a.nba.reason), unsure = apprItems('todo').filter(a => a.nba.reason);
    const e = acct('eastgate');
    return `${stepsHtml(['Overnight signal sweep at 06:00 · 23 new signals, 9 passed the checks', 'Re-scored your 9 accounts · Juniper Petrochem moved into tier A', 'Prepared 7 next actions · 4 went ahead on their own, 3 need you'])}
      <p>While you were away I checked your accounts, re-scored them and wrote the next actions. <b>4 went ahead on their own</b> because every check passed. Here's what needs you:</p>
      <div class="ccard" style="border-color:var(--neg-lt)"><div class="ccard-h"><span class="t" style="color:var(--neg)">${ic('flame', 14)} Reply first · Dian Putri said yes</span><span class="due hot" style="font-size:11px;font-weight:600">by 11:00</span></div>
        <div class="ccard-b"><div class="sm" style="font-size:12.5px;color:var(--i2)">Eastgate Refinery · Engineering Director · 08:12</div><div class="draft" style="margin-top:6px;background:var(--s50)">"Thanks Sofia, good timing. The expansion team is meeting vendors next week. Can we do Tuesday or Wednesday?"</div></div>
        <div class="ccard-f"><button class="btn sm pri" onclick="App.ask('Draft a reply to Dian with 3 times next week')">Draft a reply with 3 times</button><button class="btn sm" onclick="App.openRecord('eastgate','activity')">Open</button></div></div>
      ${ready.length ? `<div class="ccard"><div class="ccard-h"><span class="t">Ready for your OK · ${ready.length}</span><span class="muted" style="font-size:11px">high confidence, proven messages</span></div><div class="ccard-b" style="padding:4px 14px">${ready.map(apprMini).join('')}</div><div class="ccard-f"><button class="btn sm pri" onclick="App.approveAll()">Approve all ${ready.length}</button><button class="btn sm" onclick="App.go('approvals')">${ic('expand', 12)} Approvals</button></div></div>` : ''}
      ${unsure.length ? `<div class="ccard"><div class="ccard-h"><span class="t">The AI wasn't sure · ${unsure.length}</span><span class="muted" style="font-size:11px">check before anything goes out</span></div><div class="ccard-b" style="padding:4px 14px">${unsure.map(apprMini).join('')}</div></div>` : ''}
      <p style="margin-top:10px">Ask me anything below, for example <i>"why is Juniper first?"</i> or <i>"find more accounts like Eastgate"</i>.</p>`;
  }
  function briefManager() {
    const sens = apprItems('needs');
    return `${stepsHtml(['Overnight signal sweep at 06:00 · 61 new signals across the team, 24 qualified', 'Re-scored 16 team accounts · 3 moved into tier A', 'Prepared 31 next actions · 22 went ahead on their own, 9 need a person'])}
      <p>Here's your team's day. <b>22 of 31 actions went ahead on their own</b>. Of the 9 that need a person, <b>${sens.length} need you</b>, and one campaign is ready to confirm.</p>
      ${sens.length ? `<div class="ccard"><div class="ccard-h"><span class="t">Needs your approval · ${sens.length}</span><span class="muted" style="font-size:11px">sensitive or C-level</span></div><div class="ccard-b" style="padding:4px 14px">${sens.map(apprMini).join('')}</div></div>` : ''}
      <div class="ccard"><div class="ccard-h"><span class="t">Campaign ready · New reliability &amp; operations leaders</span><span class="badge b-ter">${esc(S.camp.c1 || 'Ready to confirm')}</span></div><div class="ccard-b"><div class="sm" style="font-size:12.5px;color:var(--i2)">11 accounts got a new leader in 6 days, which crosses the campaign threshold. 3 touches over 9 days, on a proven message structure.</div></div>
        <div class="ccard-f"><button class="btn sm pri" onclick="App.confirmCampaign('c1')">Confirm</button><button class="btn sm" onclick="App.goCampaign('c1')">${ic('expand', 12)} Review</button><button class="btn sm" onclick="App.toast('Kept as 11 separate next actions (mock)')">Send individually instead</button></div></div>
      ${RENDER.team()}`;
  }

  function nbaCard(a, note) {
    const d = draftOf(a), dec = S.decisions[a.id];
    const rec = d.option === 'run' ? a.nba.runnerUp : a.nba.action;
    return `${note ? `<p>${note}</p>` : `<p>For <b>${esc(a.name)}</b> I recommend: <b>${esc(rec)}</b>, by ${d.channel.toLowerCase()} to ${esc(a.contact.name)} (${esc(a.contact.title)}). ${a.nba.proven ? 'It follows a <b>proven</b> message structure for this segment.' : 'There\'s <b>no proven structure</b> for this yet, so treat it as a first try.'}</p>`}
      <div class="ccard"><div class="ccard-h"><span class="t">${ic(d.channel === 'Email' ? 'mail' : d.channel === 'Phone' ? 'phone' : 'li', 14)} ${esc(rec)}</span><span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span></div>
        <div class="ccard-b"><div class="draft">${d.channel === 'Email' ? `<div class="subj">${esc(d.subject)}</div>` : ''}${esc(d.body)}</div>
        <div class="checks"><span class="badge b-pos">Brand voice</span><span class="badge b-pos">Approved claims only</span><span class="badge b-pos">No banned words</span>${idBadge(a.contact.idTier)}</div></div>
        <div class="ccard-f">${a.nba.status === 'sent' || a.nba.status === 'auto' ? `<span class="badge b-sec">${a.nba.status === 'sent' ? esc(a.outcome || 'Sent') : 'Went ahead on its own'}</span>` : dec ? `<span class="badge b-grey nodot">${decLabel(dec)}</span>` : `<button class="btn sm pri" onclick="App.approve('${a.id}')">${a.nba.sensitive && !isMgr ? 'Approve → to Pavan' : 'Approve'}</button>`}
          <button class="btn sm" onclick="App.openRecord('${a.id}','next')">Edit</button>
          <button class="btn sm" onclick="App.ask('Make it shorter')">Shorter</button>
          <button class="btn sm" onclick="App.ask('Use cost framing')">Cost framing</button>
          <button class="btn sm" onclick="App.useRunnerUp('${a.id}')">Runner-up</button></div></div>`;
  }

  /* Scripted understanding of what the seller typed. */
  function findAccount(t) {
    const word = w => new RegExp('\\b' + w.toLowerCase() + '\\b').test(t);
    return ACCOUNTS.find(a => word(a.name.split(' ')[0])) || ACCOUNTS.find(a => word(a.contact.name.split(' ')[0]));
  }
  function respond(text) {
    const t = text.toLowerCase();
    const a = findAccount(t) || (ctx ? acct(ctx) : null);
    if (/draft a reply|reply to dian/.test(t)) return { kind: 'text', html: 'Here\'s a reply. I checked your calendar and Dian\'s time zone:<div class="draft" style="margin-top:8px">Hi Dian,\n\nGreat to hear from you. I can do Tuesday 3 Nov at 10:00, Wednesday 4 Nov at 14:00 or Thursday 5 Nov at 09:30 (Jakarta time). I\'ll bring our lead engineer for hydrocracker projects.\n\nBest,\nSofia</div><div class="ccard-f" style="margin-top:8px;border:1px solid var(--border);border-radius:8px"><button class="btn sm pri" onclick="App.toast(\'Reply queued. Sending connects after the pilot (mock)\')">Approve &amp; send</button><button class="btn sm" onclick="App.openRecord(\'eastgate\',\'activity\')">Open thread</button></div>', steps: ['Read the reply: positive, asks for times next week', 'Checked your calendar for free slots', 'Wrote the reply'] };
    if (isMgr && /team|reps?\b|overdue|coach|kenji|marco|aisha/.test(t) && !/rank/.test(t)) return { kind: 'team', steps: ['Pulled each rep\'s queue, outcomes and approvals this week'] };
    if (/approv|waiting|needs me|needs my/.test(t) && !/approve all/.test(t)) return { kind: 'approvalsList' };
    if (/campaign|nbc|sequence/.test(t)) return { kind: 'campaign', id: 'c1', steps: ['Checked micro-segments for 10+ accounts in 7 days', 'Found a proven 3-touch structure for this segment'] };
    if (/learn|worked|working|what changed|readout/.test(t)) return { kind: 'learned', steps: ['Read 214 outcomes logged this month (wins and misses)', 'Re-ran pattern promotion and demotion', 'Compared signal sources by conversion'] };
    if (/schedul|every (day|weekday|mon|tue|wed|thu|fri|week|morning)|each (day|morning)|7am/.test(t)) {
      const run = { name: /prospect/.test(t) ? 'Monday prospect refresh' : 'Weekday signal check', prompt: text, freq: /mon/.test(t) ? 'Every Mon at 07:00' : 'Every weekday at 07:00', next: /mon/.test(t) ? 'Mon 2 Nov 07:00' : 'Tomorrow 07:00' };
      S.runs.push(run); return Object.assign({ kind: 'scheduled' }, run);
    }
    if (/to ?do|what should i do first|my day|what's first|what first/.test(t)) return { kind: 'todo' };
    if (/approve all/.test(t)) { approveAll(true); return { kind: 'text', html: 'Done. I approved every ready, high-confidence item. They\'re scheduled for the next send window (sending is a placeholder in the mock).' }; }
    if (/find|prospect|look ?alike|new accounts|like my|more accounts/.test(t)) return { kind: 'prospects', steps: ['Turned your request into an ICP filter: refining &amp; petrochemicals · SEA · 500+ staff · reliability, operations and I&amp;C leaders', 'Searched the primary contact provider (31 people), then the fallback provider for 6 misses', 'Cross-checked fallback hits against a third provider and gave everyone an identity tier', 'Removed 4 existing customers and 3 accounts another rep owns (CRM, read-only)', 'Ranked by similarity to your last 10 wins'] };
    if (/rank|score|prioriti|who should i call|top accounts/.test(t)) return { kind: 'ranked', scope: isMgr && !/my /.test(t) ? 'team' : 'mine', steps: ['Pulled live signals for your accounts from 23 sources', 'Kept 9 of 14 new signals (observable, predictive and time-bound)', 'Applied tier and decay, then stacked the signals', 'Fit × Timing = Score'] };
    if (/group|segment|trigger/.test(t)) return { kind: 'segments', steps: ['Tagged each ready account by its strongest trigger', 'Checked the outcome cache for a proven message structure per segment'] };
    if (/thailand.*jump|spike/.test(t)) return { kind: 'text', html: 'Five Thai accounts posted control-systems roles within 2 days, far outside the normal range for that signal. The system gave them a temporary tier-1 boost and alerted Marco. It also logged the event so the signal research can check whether it\'s a new pattern.' };
    if (a && /shorter|cost|formal|friendl|rewrite|runner/.test(t)) return rewrite(a, t);
    if (a && /why/.test(t)) { ctx = a.id; return { kind: 'why', id: a.id, steps: ['Read the audit trail for this account (thresholds version 2026.10)'] }; }
    if (a) { ctx = a.id; return { kind: 'nba', id: a.id, steps: [`De-dup check: no open opportunity, owner is ${esc(USERS[a.owner].name)}`, 'Read CRM history and the warm path', a.nba && a.nba.proven ? 'Outcome cache: proven structure found for this segment' : 'Outcome cache: no proven structure yet, wrote a provisional one', 'Chose the channel and wrote the draft', 'Brand, claims and banned-word checks passed'] }; }
    if (/shorter|cost|formal|rewrite/.test(t)) return { kind: 'text', html: 'Which message? Open an account or type @ and its name.' };
    return { kind: 'help' };
  }
  function rewrite(a, t) {
    if (!a.nba) return { kind: 'text', html: `${esc(a.name)} has no live signal, so there's no next action to rewrite yet.` };
    const d = draftOf(a);
    let body = d.body;
    if (/runner/.test(t)) { S.drafts[a.id] = Object.assign(d, { option: 'run' }); return { kind: 'nba', id: a.id, note: `Switched to the runner-up: <b>${esc(a.nba.runnerUp)}</b>.` }; }
    if (/shorter/.test(t)) { const p = body.split('\n\n'); body = p.length > 3 ? [p[0], p[1].split('. ')[0] + '.', p[p.length - 2], p[p.length - 1]].join('\n\n') : body; }
    if (/cost/.test(t)) { const p = body.split('\n\n'); p.splice(Math.max(1, p.length - 2), 0, 'Most sites we work with start from cost: an hour of unplanned downtime on a unit this size typically costs well over USD 100k.'); body = p.join('\n\n'); }
    if (/formal/.test(t)) body = body.replace(/^Hi /, 'Dear ').replace(/Best,|Best regards,/, 'Kind regards,');
    if (/friendl/.test(t)) body = body.replace(/^Dear /, 'Hi ').replace(/Kind regards,/, 'Cheers,');
    S.drafts[a.id] = Object.assign(d, { body });
    return { kind: 'nba', id: a.id, note: `Updated the ${esc(a.name)} draft. The checks re-ran and still pass.` };
  }

  function ask(text) {
    if (!text.trim()) return;
    S.thread.push({ who: 'me', text });
    const reply = respond(text);
    const steps = reply.steps || [];
    save(); renderChat();
    let i = 0;
    const tick = () => {
      S.thread = S.thread.filter(m => m.who !== 'typing');
      if (i < steps.length) { S.thread.push({ who: 'typing', step: steps[i] }); i++; renderChat(); setTimeout(tick, 420); return; }
      S.thread.push(Object.assign({ who: 'ai' }, reply));
      save(); renderAll();
    };
    S.thread.push({ who: 'typing' }); renderChat(); setTimeout(tick, steps.length ? 300 : 650);
  }

  /* ─── Home rail ─── */
  function todoList() {
    return todos().map(x => `<div class="todo ${S.todosDone[x.id] ? 'done' : ''}" data-id="${x.id}"><span class="ck" onclick="event.stopPropagation();App.doneTodo('${x.id}')">${S.todosDone[x.id] ? ic('check', 12, 3) : ''}</span><div style="flex:1;min-width:0" onclick="App.runTodo('${x.id}')"><div class="tt">${esc(x.t)}</div><div class="td">${esc(x.d)}</div></div><span class="due ${x.cls}">${esc(x.due)}</span></div>`).join('');
  }
  function renderRail() {
    const hot = scoped(isMgr ? 'team' : 'mine').filter(a => a.score > 0).slice(0, 3);
    const k = isMgr
      ? [['7/15', 'Meetings booked', 'Team target this week', 'warn'], ['15', 'Replies', '+6 vs last week', 'pos'], ['77%', 'Accepted first time', 'G2 · target 70%', 'pos'], ['71%', 'Went ahead on its own', 'G1 · effort saved', 'pos']]
      : [['2/4', 'Meetings booked', 'Your target this week', 'warn'], ['5', 'Replies', '+2 vs last week', 'pos'], ['18', 'Sent', '12 you approved, 6 auto', 'grey'], ['83%', 'Accepted first time', 'Your G2 score', 'pos']];
    $('main').className = 'rail';
    $('main').innerHTML = `
      <div class="rail-sec"><div class="lbl">${isMgr ? 'Your to-do' : 'To do today'} <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">Tue 27 Oct</span></div>${todoList()}</div>
      <div class="rail-sec"><div class="lbl">${isMgr ? 'Team this week' : 'Your week'}</div><div class="kpis">${k.map(x => `<div class="kpi"><div class="v">${x[0]}</div><div class="k">${x[1]}</div><div class="d" style="color:var(--${x[3] === 'grey' ? 'i3' : x[3]})">${x[2]}</div></div>`).join('')}</div></div>
      ${isMgr ? `<div class="rail-sec"><div class="lbl">Reps <a href="#" onclick="App.ask('How is my team doing?');return false" style="text-transform:none;letter-spacing:0;font-weight:600">Ask about the team</a></div>${REPS.map(r => { const t = TEAM_STATS[r]; return `<div class="mini-row row-link" onclick="App.repApprovals('${r}')">${avatar(USERS[r], 26)}<div class="grow"><div class="nm">${esc(USERS[r].name)}</div><div class="sm">${t.todo} to do · ${t.meetings}/${t.target} meetings</div></div>${t.overdue ? `<span class="badge b-neg">${t.overdue} overdue</span>` : '<span class="badge b-pos">On track</span>'}</div>`; }).join('')}</div>`
        : `<div class="rail-sec"><div class="lbl">Hot right now <a href="#accounts" style="text-transform:none;letter-spacing:0;font-weight:600">All accounts</a></div>${hot.map(a => `<div class="mini-row row-link" onclick="App.openRecord('${a.id}','why')">${tierBadge(a.tier)}<div class="grow"><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.whyNow.type)} · ${ago(a.whyNow.age)}</div></div><span class="mono" style="font-size:11.5px;color:var(--i2)">${fmt(a.score)}</span></div>`).join('')}</div>`}
      <div class="rail-sec"><div class="lbl">Alerts</div>${alerts().slice(0, 2).map(x => `<div class="alert ${x.k}" style="margin-bottom:6px" onclick="${x.on}"><div><b>${x.t}</b>${x.d}</div></div>`).join('')}</div>
      <div class="rail-sec"><div class="lbl">What the system learned <a href="#" onclick="App.ask('What worked last month?');return false" style="text-transform:none;letter-spacing:0;font-weight:600">More</a></div>${LEARNED.slice(0, 2).map(l => `<div class="mini-row"><span class="badge b-${l.k} nodot" style="width:20px;padding:0;justify-content:center">${l.k === 'pos' ? '↑' : '↓'}</span><div class="grow"><div class="nm" style="font-size:12px">${esc(l.t)}</div><div class="sm" style="white-space:normal">${esc(l.d)}</div></div></div>`).join('')}</div>`;
  }

  /* ─── Approvals ─── */
  function renderApprovals() {
    const tabs = isMgr ? [['needs', 'Needs me'], ['team', 'Whole team'], ['done', 'Decided']] : [['todo', 'To do'], ['waiting', 'With Pavan'], ['done', 'Done']];
    const items = apprItems(apprTab);
    const readyIds = items.filter(a => !a.nba.reason && !S.decisions[a.id]).map(a => a.id);
    $('main').className = 'page';
    $('main').innerHTML = `
      <div class="page-h"><div><h1>Approvals</h1><div class="sub">${isMgr ? 'Your team\'s items that need a person. Sensitive and C-level messages need you; the rest are your reps\' to decide, and you can step in on any.' : 'Only the items that need you. Everything else already went ahead on its own because every check passed.'}</div></div>
        ${readyIds.length ? `<button class="btn pri" onclick="App.approveAll()">Approve ${readyIds.length} ready</button>` : ''}</div>
      <div class="toolbar"><div class="seg">${tabs.map(([k, l]) => `<button class="${apprTab === k ? 'on' : ''}" onclick="App.setApprTab('${k}')">${l} (${apprItems(k).length})</button>`).join('')}</div>
        ${isMgr && apprTab === 'team' ? `<select class="sel" onchange="App.setApprRep(this.value)"><option value="all">All reps</option>${REPS.map(r => `<option value="${r}" ${apprRep === r ? 'selected' : ''}>${USERS[r].name}</option>`).join('')}</select>` : ''}
        <span class="muted" style="font-size:12px;margin-left:auto">Ready = high confidence + proven message · the rest says why it's here</span></div>
      <div class="card" style="overflow:hidden">${items.length ? `<table class="tbl"><thead><tr><th>Person · account</th><th>Next best action</th><th>Channel</th><th>Why it's here</th>${isMgr ? '<th>Rep</th>' : ''}<th>Due</th><th></th></tr></thead><tbody>
        ${items.map(a => { const d = S.decisions[a.id]; return `<tr class="row-link" onclick="App.openRecord('${a.id}','next')"><td><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.name)} · ${esc(a.country)}</div></td><td>${esc(a.nba.action)}<div class="sm">Runner-up: ${esc(a.nba.runnerUp)}</div></td><td>${a.nba.channel}</td><td><span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span>${a.nba.reasonNote ? `<div class="sm" style="max-width:260px;white-space:normal;margin-top:3px">${esc(a.nba.reasonNote)}</div>` : ''}</td>${isMgr ? `<td>${esc(first(USERS[a.owner].name))}</td>` : ''}<td style="white-space:nowrap">${esc(a.nba.due)}</td>
          <td style="white-space:nowrap" onclick="event.stopPropagation()">${d ? `<span class="badge b-grey nodot">${decLabel(d)}</span>` : `${!a.nba.reason || (isMgr && a.nba.sensitive) ? `<button class="btn sm pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : 'Approve'}</button> ` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','next')">Review</button>`}</td></tr>`; }).join('')}
        </tbody></table>` : `<div class="empty">Nothing here. ${apprTab === 'done' ? 'Decisions you make show up here.' : 'You\'re all caught up.'}</div>`}</div>
      <div class="placeholder-note" style="margin-top:14px">${ic('mail', 16)}<div>Approved items go out in the next send window through the rep's connected email or LinkedIn. <b>Sending is a placeholder in this mock</b>: nothing leaves the browser.</div></div>`;
  }

  /* ─── Accounts ─── */
  function renderAccounts() {
    const q = ($('accSearch') && $('accSearch').value || '').toLowerCase();
    const list = scoped(accScope).filter(a => !q || (a.name + a.contact.name + a.country + a.segment).toLowerCase().includes(q));
    let body = '';
    if (accView === 'ranked') {
      body = `<table class="tbl"><thead><tr><th>#</th><th>Account</th><th>Tier</th><th>Fit</th><th>Timing</th><th>Score</th><th>Why now</th><th>Segment</th>${isMgr || accScope === 'team' ? '<th>Owner</th>' : ''}<th>Next step</th></tr></thead><tbody>
        ${list.map((a, i) => `<tr class="row-link" onclick="App.openRecord('${a.id}','why')"><td class="mono">${i + 1}</td><td><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.industry)} · ${esc(a.country)}</div></td><td>${tierBadge(a.tier)}</td><td class="mono">${a.fit}</td><td class="mono">${a.timing}</td><td class="mono" style="font-weight:600">${fmt(a.score)}</td><td>${a.whyNow ? `${esc(a.whyNow.type)}<div class="sm">${ago(a.whyNow.age)}${a.signals.length > 1 ? ` · +${a.signals.length - 1} more` : ''}</div>` : '<span class="muted">No live signal: waits</span>'}</td><td>${esc(a.segment)}</td>${isMgr || accScope === 'team' ? `<td>${esc(first(USERS[a.owner].name))}</td>` : ''}<td>${stepBadge(a)}</td></tr>`).join('')}</tbody></table>`;
    } else if (accView === 'prospects') {
      const people = list.map(a => ({ name: a.contact.name, title: a.contact.title, account: a.name, country: a.country, idTier: a.contact.idTier, email: !!a.contact.email, crm: 'In your book', note: '', id: a.id })).concat(PROSPECTS_FOUND.filter(p => !q || (p.name + p.account).toLowerCase().includes(q)));
      body = `<table class="tbl"><thead><tr><th>Person</th><th>Account</th><th>Identity</th><th>Email</th><th>CRM check</th><th>Note</th></tr></thead><tbody>
        ${people.map(p => `<tr class="${p.id ? 'row-link' : ''}" ${p.id ? `onclick="App.openRecord('${p.id}','why')"` : ''}><td><div class="nm">${esc(p.name)}</div><div class="sm">${esc(p.title)}</div></td><td>${esc(p.account)}<div class="sm">${esc(p.country)}</div></td><td>${idBadge(p.idTier)}</td><td>${p.email ? '<span class="badge b-pos">Verified</span>' : '<span class="badge b-grey nodot">On demand</span>'}</td><td>${p.crm === 'Held' || p.crm === 'Name-only match' ? `<span class="badge b-neg">${esc(p.crm)}</span>` : `<span class="badge b-grey nodot">${esc(p.crm)}</span>`}</td><td class="sm" style="white-space:normal">${esc(p.note)}</td></tr>`).join('')}</tbody></table>`;
    } else {
      const segs = {};
      list.filter(a => a.segment !== '—').forEach(a => (segs[a.segment] = segs[a.segment] || []).push(a));
      body = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;padding:14px">${Object.entries(segs).map(([k, v]) => `<div class="card"><div class="card-h"><b style="font-size:13px">${esc(k)}</b><span class="badge b-brand nodot">${v.length}</span></div><div class="card-b">${v.map(a => `<div class="mini-row row-link" onclick="App.openRecord('${a.id}','why')">${tierBadge(a.tier)}<div class="grow"><div class="nm">${esc(a.name)}</div><div class="sm">${a.nba ? esc(a.nba.action) : 'No action yet'}</div></div></div>`).join('')}<button class="btn sm ghost" style="margin-top:6px" onclick="App.ask('What should I do with the ${esc(k)} segment?')">Ask about this segment</button></div></div>`).join('')}</div>`;
    }
    $('main').className = 'page';
    $('main').innerHTML = `
      <div class="page-h"><div><h1>Accounts</h1><div class="sub">The full view behind the chat. Prospecting, scoring and segments are done for you; open any row to see why.</div></div>
        <button class="btn" onclick="App.ask('${accView === 'prospects' ? 'Find more accounts like my last 3 wins' : accView === 'segments' ? 'Group my accounts by trigger' : 'Rank my accounts for this week'}')">${ic('spark', 14)} Ask about this list</button></div>
      <div class="toolbar"><div class="seg">${[['ranked', 'Ranked'], ['prospects', 'People'], ['segments', 'Segments']].map(([k, l]) => `<button class="${accView === k ? 'on' : ''}" onclick="App.setAccView('${k}')">${l}</button>`).join('')}</div>
        ${isMgr ? '' : `<div class="seg">${[['mine', 'Mine'], ['team', 'Team']].map(([k, l]) => `<button class="${accScope === k ? 'on' : ''}" onclick="App.setAccScope('${k}')">${l}</button>`).join('')}</div>`}
        <div class="search">${ic('search', 14)}<input id="accSearch" placeholder="Search accounts, people, segments" value="${esc(q)}" oninput="App.refreshAccounts()"></div>
        <span class="muted" style="font-size:12px;margin-left:auto">Score = Fit × Timing · refreshed 06:00 today</span></div>
      <div class="card" style="overflow:auto">${body}</div>`;
    const s = $('accSearch'); if (q) { s.focus(); s.setSelectionRange(q.length, q.length); }
  }
  function stepBadge(a) {
    if (!a.nba) return '<span class="badge b-grey nodot">Waiting for a signal</span>';
    const d = S.decisions[a.id];
    if (d) return `<span class="badge b-grey nodot">${decLabel(d)}</span>`;
    if (a.nba.status === 'auto') return '<span class="badge b-pos">Went ahead</span>';
    if (a.nba.status === 'sent') return `<span class="badge b-sec">${esc(a.outcome || 'Sent')}</span>`;
    return `<span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a) === 'Ready' ? 'Ready for OK' : reasonOf(a)}</span>`;
  }

  /* ─── Campaigns (NBC placeholder) ─── */
  function renderCampaigns() {
    const c = CAMPAIGNS.find(x => x.id === campSel) || CAMPAIGNS[0];
    const st = S.camp[c.id] || c.status;
    $('main').className = 'page';
    $('main').innerHTML = `
      <div class="page-h"><div><h1>Campaigns</h1><div class="sub">When 10 or more accounts become ready for the same reason within 7 days, the system suggests one campaign instead of separate actions. It never launches one without a person confirming.</div></div></div>
      <div class="placeholder-note" style="margin-bottom:14px">${ic('mail', 16)}<div><b>Placeholder.</b> Next best campaign, and sending through email and LinkedIn, come after the pilot. The screens show how it will work; nothing is sent.</div></div>
      <div class="camp-grid">
        <div class="card" style="overflow:hidden">${CAMPAIGNS.map(x => `<div class="camp ${x.id === c.id ? 'on' : ''}" onclick="App.goCampaign('${x.id}')"><div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:13px">${esc(x.name)}</b></div><div class="sm muted" style="font-size:11.5px;margin:3px 0 6px">${esc(x.segment)} · ${esc(x.window)}</div><span class="badge ${(S.camp[x.id] || x.status) === 'Running' || S.camp[x.id] ? 'b-pos' : x.status.startsWith('Building') ? 'b-grey' : 'b-ter'}">${esc(S.camp[x.id] || x.status)}</span></div>`).join('')}</div>
        <div class="card"><div class="card-h"><div><div style="font-family:var(--fd);font-size:16px;font-weight:600">${esc(c.name)}</div><div class="muted" style="font-size:12px">${esc(c.segment)} · ${c.accounts} accounts · ${c.proven ? 'proven message structure' : 'provisional structure: review first'}</div></div><span class="badge ${st === 'Running' || S.camp[c.id] ? 'b-pos' : 'b-ter'}">${esc(st)}</span></div>
          <div class="card-b">
            <p style="margin:0 0 12px;font-size:13px;color:var(--i2);line-height:1.55">${esc(c.why)}</p>
            ${c.stats ? `<div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px"><div class="kpi"><div class="v">${c.stats.sent}</div><div class="k">Touches sent</div></div><div class="kpi"><div class="v">${c.stats.replies}</div><div class="k">Replies</div></div><div class="kpi"><div class="v">${c.stats.meetings}</div><div class="k">Meetings</div></div></div>` : ''}
            <div class="sec-t">Three touches, one sequence</div>
            ${c.touches.map(t => `<div class="touch"><div class="day">${t.day}</div><div><div style="font-size:12.5px;font-weight:600">${t.ch} · ${t.fmt}</div><div style="font-size:12.5px;color:var(--i2);margin-top:2px">${esc(t.t)}</div></div></div>`).join('')}
            <div class="sec-t" style="margin-top:14px">Accounts (${c.list.length})</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${c.list.map(n => `<span class="badge b-grey nodot">${esc(n)}</span>`).join('')}</div>
          </div>
          <div class="ccard-f" style="padding:12px 16px">${c.status === 'Running' ? '<button class="btn" onclick="App.toast(\'Paused (mock)\')">Pause</button>' : isMgr ? `<button class="btn pri" ${S.camp[c.id] || c.status.startsWith('Building') ? 'disabled' : ''} onclick="App.confirmCampaign('${c.id}')">Confirm and schedule</button><button class="btn" onclick="App.toast('Each account keeps its own next action (mock)')">Send individually instead</button>` : '<span class="muted" style="font-size:12px">Your sales manager confirms campaigns. You can take your accounts out of it.</span><button class="btn sm" onclick="App.toast(\'Your accounts were taken out (mock)\')">Take my accounts out</button>'}
            <button class="btn ghost" onclick="App.ask('Show the campaign that\\'s ready')">${ic('spark', 14)} Ask about it</button></div>
        </div>
      </div>`;
  }

  /* ─── Account record (opens beside the chat) ─── */
  function openRecord(id, tab) {
    recId = id; recTab = tab || 'next'; ctx = id;
    if (!acct(id).nba && recTab === 'next') recTab = 'why';
    $('ws').classList.remove('chat-closed');
    renderAll(); renderRecord();
    $('record').classList.add('open');
  }
  function closeRecord(silent) { recId = null; $('record').classList.remove('open'); if (!silent) renderAll(); }
  function renderRecord() {
    if (!recId) return;
    const a = acct(recId), o = USERS[a.owner];
    const tabs = [['next', 'Next action'], ['why', 'Why now'], ['activity', 'Activity'], ['notes', 'Notes']];
    $('record').style.left = 'var(--chat-w)';
    $('record').style.width = 'auto';
    $('record').innerHTML = `
      <div class="rec-top"><button class="ic-btn" onclick="App.closeRecord()" title="Close">${ic('x', 16)}</button><span class="muted" style="font-size:12px">Accounts / ${esc(a.name)}</span><div style="flex:1"></div>${a.nba ? `<span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span>` : ''}${tierBadge(a.tier)}</div>
      <div class="rec-body">
        <div class="rec-left">
          <div class="who"><span class="av" style="background:${o.color}">${initials(a.contact.name)}</span><div><div class="nm">${esc(a.contact.name)}</div><div class="tl">${esc(a.contact.title)}</div><div class="tl"><b>${esc(a.name)}</b></div></div></div>
          <div class="qa"><button title="Email" onclick="App.toast('Email: placeholder until the inbox is connected')">${ic('mail')}</button><button title="Call" onclick="App.toast('Calling: placeholder')">${ic('phone')}</button><button title="LinkedIn" onclick="App.toast('LinkedIn: placeholder')">${ic('li')}</button><button title="Add a task" onclick="App.toast('Task added (mock)')">${ic('task')}</button><button title="Ask AI about this account" onclick="App.focusComposer('')">${ic('spark')}</button></div>
          <div class="sec-t">Person</div>
          <dl class="kv"><dt>Email</dt><dd>${esc(a.contact.email)} <span class="badge b-pos" style="height:18px">Verified</span></dd><dt>Phone</dt><dd>${esc(a.contact.phone || '— (pulled when needed)')}</dd><dt>LinkedIn</dt><dd>${a.contact.linkedin ? 'Profile matched' : '—'}</dd><dt>Identity</dt><dd>${idBadge(a.contact.idTier)}<div class="muted" style="font-size:11px;margin-top:3px">${ID_TIER[a.contact.idTier][2]}</div></dd><dt>Owner</dt><dd>${esc(o.name)}</dd></dl>
          <div class="sec-t">Company</div>
          <dl class="kv"><dt>Industry</dt><dd>${esc(a.industry)}</dd><dt>Country</dt><dd>${esc(a.country)}</dd><dt>Size</dt><dd>${esc(a.size)}</dd><dt>Fit</dt><dd>${a.fit} / 100</dd><dt>Framing</dt><dd>${esc(a.motivation)} <span class="muted" style="font-size:11px">(why buyers like them buy)</span></dd></dl>
          <div class="sec-t">Warm path</div>
          <div style="margin:10px 0 4px;display:flex;align-items:center;gap:10px"><div class="bar" style="flex:1"><i style="width:${a.warm.score}%"></i></div><span class="mono" style="font-size:12px">${a.warm.score}</span></div>
          <div style="font-size:12px;color:var(--i2);line-height:1.5">${esc(a.warm.note)}</div>
        </div>
        <div class="rec-right">
          <div class="rec-tabs">${tabs.map(([k, l]) => `<button class="rec-tab ${recTab === k ? 'on' : ''}" onclick="App.setRecTab('${k}')">${l}</button>`).join('')}</div>
          <div class="rec-pane">${recPane(a)}</div>
        </div>
      </div>`;
  }
  function recPane(a) {
    if (recTab === 'why') {
      const sig = a.signals.slice().sort((p, q) => q.weight - p.weight);
      return `<div class="formula"><div class="box"><div class="v">${a.fit}</div><div class="k">Fit: how well they match</div></div><span class="op">×</span><div class="box"><div class="v">${a.timing}</div><div class="k">Timing: what changed</div></div><span class="op">=</span><div class="box" style="border-color:var(--brand-mid);background:var(--brand-lt)"><div class="v">${fmt(a.score)}</div><div class="k">Score · #${a.rank} · tier ${a.tier}</div></div></div>
        ${sig.length ? `<div class="sec-t">Signals, strongest first</div>${sig.map((x, i) => `<div class="sig"><div><div style="font-weight:600">${esc(x.type)}</div><div class="muted" style="font-size:11.5px">${esc(x.text)} · ${esc(x.source)}</div></div><span class="badge ${x.tier === 1 ? 'b-pos' : x.tier === 2 ? 'b-sec' : 'b-grey'} nodot">Tier ${x.tier}</span><div><div class="bar"><i style="width:${Math.min(100, x.weight)}%;background:${x.tier === 1 ? 'var(--pos)' : 'var(--sec)'}"></i></div><div class="muted" style="font-size:10.5px;margin-top:3px">${ago(x.age)} · ${Math.round(x.weight / (window.MOCK.decayed(x.tier, 0)) * 100 / x.strength)}% fresh</div></div><span class="mono" style="text-align:right">${i ? (i === 1 ? '½×' : '¼×') : ''}${x.weight}</span></div>`).join('')}
          <div class="placeholder-note" style="margin-top:12px">Timing = ${sig.map((x, i) => (i ? (i === 1 ? '½ × ' : '¼ × ') : '') + x.weight).join(' + ')} = <b>${a.timing}</b>. Fit and timing are multiplied, so a perfect fit with no live signal scores zero.</div>`
          : '<div class="placeholder-note">No live signal right now, so the score is zero and nothing is suggested. The account stays watched; the next signal moves it up.</div>'}
        <div class="muted" style="font-size:11px;margin-top:14px">Audit trail · thresholds version 2026.10 · every signal passed the observable, predictive and time-bound checks · ${a.nba && a.nba.proven ? 'proven pattern for this segment' : 'no proven pattern yet'}.</div>`;
    }
    if (recTab === 'activity') {
      const out = S.outcomes[a.id] || a.outcome;
      const h = (a.history || []).slice();
      return `${a.id === 'eastgate' ? `<div class="ready" style="background:var(--pos-lt)"><div class="grow"><b>Positive reply · fast lane</b><div style="font-size:12px;color:var(--i2)">"Thanks Sofia, good timing. The expansion team is meeting vendors next week. Can we do Tuesday or Wednesday?"</div></div><button class="btn pri" onclick="App.ask('Draft a reply to Dian with 3 times next week')">Draft reply</button></div>` : ''}
        <div class="sec-t">What happened</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px">${['Sent', 'Replied', 'Meeting booked', 'No response'].map(x => `<button class="chip" style="${out && out.startsWith(x) ? 'border-color:var(--brand);color:var(--brand-dk);background:var(--brand-lt)' : ''}" onclick="App.logOutcome('${a.id}','${x}')">${x}</button>`).join('')}</div>
        <div class="muted" style="font-size:11.5px;margin-bottom:12px">Every outcome, including no response, goes back into the learning loop.</div>
        <div class="sec-t">History (CRM)</div>
        ${h.length ? h.map(x => `<div class="tl-item"><span class="ic">${ic('clock', 13)}</span><div><div style="font-weight:600">${esc(x.t)}</div><div class="muted" style="font-size:11.5px">${esc(x.d)} · ${esc(x.o)}</div></div></div>`).join('') : '<div class="empty">No earlier activity in the CRM.</div>'}`;
    }
    if (recTab === 'notes') {
      return `<textarea class="edit" style="min-height:90px" id="noteBox" placeholder="Add a note…"></textarea><div style="margin:8px 0 16px"><button class="btn pri sm" onclick="App.addNote('${a.id}')">Save note</button></div>
        ${(S.notes[a.id] || []).map(n => `<div class="tl-item"><span class="ic">${avatar(me, 26)}</span><div><div>${esc(n.t)}</div><div class="muted" style="font-size:11px">${esc(me.name)} · ${esc(n.d)}</div></div></div>`).join('') || '<div class="empty">No notes yet.</div>'}`;
    }
    if (!a.nba) return '<div class="placeholder-note">No next action: there\'s no live signal for this account yet.</div>';
    const d = draftOf(a), dec = S.decisions[a.id];
    const banner = dec ? `<div class="ready" style="background:var(--s50)"><div class="grow"><b>${decLabel(dec)}</b></div><button class="btn sm" onclick="App.undo('${a.id}')">Undo</button></div>`
      : a.nba.status === 'auto' ? '<div class="ready" style="background:var(--pos-lt)"><div class="grow"><b>Went ahead on its own.</b> Every check passed, so it was sent without waiting for a person.</div></div>'
      : a.nba.status === 'sent' ? `<div class="ready" style="background:var(--sec-lt)"><div class="grow"><b>Sent.</b> ${esc(a.outcome || '')}</div></div>`
      : a.nba.reason ? `<div class="ready" style="background:var(--warn-lt)"><div class="grow"><b>${reasonOf(a)}.</b> ${esc(a.nba.reasonNote)}</div><button class="btn pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : a.nba.sensitive ? 'Approve → to Pavan' : 'Approve'}</button></div>`
      : `<div class="ready"><div class="grow"><b>Ready to go.</b> Approve to continue.</div><button class="btn pri" onclick="App.approve('${a.id}')">Approve</button></div>`;
    return `${banner}
      <div class="sec-t">Recommended action</div><div style="margin-top:10px">
        <div class="opt ${d.option === 'rec' ? 'on' : ''}" onclick="App.setOption('${a.id}','rec')"><div class="h">${esc(a.nba.action)}<span class="badge b-brand nodot">Recommended</span></div><div class="d">${a.nba.confidence} confidence · ${a.nba.proven ? 'proven message structure for ' + esc(a.segment) : 'provisional structure (first try)'}</div></div>
        <div class="opt ${d.option === 'run' ? 'on' : ''}" onclick="App.setOption('${a.id}','run')"><div class="h">${esc(a.nba.runnerUp)}<span class="badge b-grey nodot">Runner-up</span></div><div class="d">The next best option, if the first doesn't feel right.</div></div>
        <div class="opt ${d.option === 'own' ? 'on' : ''}" onclick="App.setOption('${a.id}','own')"><div class="h">Write your own<span class="badge b-grey nodot">You decide</span></div><div class="d">Your choice is logged so the system learns from it.</div></div></div>
      <div class="sec-t" style="margin-top:8px">Message</div>
      <div style="display:flex;gap:8px;margin:10px 0 8px;align-items:center"><select class="sel" onchange="App.setChannel('${a.id}',this.value)">${['Email', 'LinkedIn', 'Phone'].map(c => `<option ${d.channel === c ? 'selected' : ''}>${c}</option>`).join('')}</select><span class="muted" style="font-size:11.5px">Chosen from verified contact data, warm path and what worked before</span></div>
      ${d.channel === 'Email' ? `<input class="edit" id="dSubj" value="${esc(d.subject)}" onchange="App.saveDraft('${a.id}')" style="margin-bottom:8px">` : ''}
      <textarea class="edit" id="dBody" onchange="App.saveDraft('${a.id}')">${esc(d.body)}</textarea>
      <div class="checks"><span class="badge b-pos">Brand voice</span><span class="badge b-pos">Approved claims only</span><span class="badge b-pos">No banned words</span><span class="badge b-pos">Not contacted on another channel</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px"><span class="muted" style="font-size:11.5px;align-self:center">Ask AI:</span>${['Make it shorter', 'Use cost framing', 'More formal', 'Friendlier'].map(x => `<button class="chip" onclick="App.ask('${x}')">${x}</button>`).join('')}</div>
      ${dec ? '' : `<div style="display:flex;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)"><button class="btn pri" onclick="App.saveDraft('${a.id}');App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : a.nba.sensitive ? 'Approve → to Pavan' : 'Approve'}</button>${isMgr && a.owner !== me.id ? `<button class="btn" onclick="App.decide('${a.id}','sent-back')">Send back to ${esc(first(USERS[a.owner].name))}</button>` : ''}<button class="btn" onclick="App.decide('${a.id}','skipped')">Skip</button></div>`}`;
  }

  /* ─── Actions ─── */
  function decide(id, d, msg) { S.decisions[id] = d; save(); toast(msg || decLabel(d)); renderAll(); if (recId) renderRecord(); }
  function approve(id) {
    const a = acct(id);
    if (a.nba.sensitive && !isMgr) return decide(id, 'with-manager', `Approved. Sent to Pavan for sign-off because it's sensitive.`);
    decide(id, isMgr && a.nba.sensitive ? 'signed' : 'approved', `Approved: ${a.name}. Scheduled for the next send window (placeholder).`);
  }
  function approveAll(silent) {
    apprItems(isMgr ? 'team' : 'todo').filter(a => !a.nba.reason && !S.decisions[a.id]).forEach(a => { S.decisions[a.id] = 'approved'; });
    save(); if (!silent) { toast('Approved all ready items. Scheduled for the next send window (placeholder).'); renderAll(); }
  }
  function renderAll() {
    const r = route();
    const home = r === 'home' && !recId;
    $('ws').className = 'ws ' + (home ? 'home' : 'docked') + ($('ws').classList.contains('chat-closed') && !home && !recId ? ' chat-closed' : '');
    $('chatOpenTab').innerHTML = ic('spark', 16);
    renderTop(); renderChat();
    if (r === 'approvals') renderApprovals(); else if (r === 'accounts') renderAccounts(); else if (r === 'campaigns') renderCampaigns(); else if (!home) { $('main').className = 'page'; $('main').innerHTML = ''; } else renderRail();
    if (r === 'home' && recId) renderRail();
  }

  /* Scheduled runs drawer (from the "scheduled chats" pattern). */
  function openRuns() {
    document.querySelectorAll('.menu').forEach(m => m.classList.remove('open'));
    const runs = SCHEDULED.concat(S.runs.map(r => Object.assign({ scope: 'Mine', owner: 'me' }, r)));
    $('drawer').innerHTML = `
      <div class="drawer-h"><div class="t">Scheduled runs</div><button class="ic-btn" onclick="App.closeDrawer()">${ic('x', 16)}</button></div>
      <div class="drawer-b">
        <p style="margin:0 0 14px;font-size:12.5px;color:var(--i2);line-height:1.5">This is how the work gets done before you arrive. Each run is a saved instruction that runs on a timer and lands in your brief. ${isMgr ? 'Runs you create for the team apply to every rep.' : 'Team defaults are set by your admin; you can add your own.'}</p>
        ${runs.map(r => `<div class="run"><div class="h">${esc(r.name)}<span class="badge ${r.scope === 'Mine' ? 'b-brand' : 'b-grey'} nodot">${r.scope === 'Mine' ? 'Yours' : 'Set by admin'}</span></div><div class="p">${esc(r.prompt)}</div><div class="m">${ic('clock', 12)} ${esc(r.freq)} · next ${esc(r.next)}</div></div>`).join('')}
        <div class="sec-t" style="margin:18px 0 12px">Create a run</div>
        <div class="field"><label>Name</label><input id="runName" value="Research new job postings"></div>
        <div class="field"><label>What should it do?</label><textarea id="runPrompt" rows="3">Show me accounts that posted reliability or control-systems roles in the last 30 days and prepare next actions for the new leaders.</textarea></div>
        <div class="field"><label>When</label><div class="days">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `<button class="${i === 0 ? 'on' : ''}" onclick="this.classList.toggle('on')">${d}</button>`).join('')}</div><div style="display:flex;gap:8px;margin-top:8px"><select class="sel"><option>07:00</option><option>09:00</option><option>16:00</option></select>${isMgr ? '<select class="sel"><option>For me</option><option>For my whole team</option></select>' : ''}</div></div>
      </div>
      <div class="drawer-f"><button class="btn" onclick="App.closeDrawer();App.ask(document.getElementById('runPrompt').value)">Try it in chat</button><button class="btn pri" onclick="App.createRun()">Create</button></div>`;
    $('drawer').classList.add('open'); $('scrim').classList.add('open');
  }

  window.App = {
    ask, toast, go, openRecord, closeRecord: () => closeRecord(false), approve, approveAll: () => approveAll(false), openRuns,
    send() { const el = $('composer'); const v = el.value; el.value = ''; ask(v); },
    key(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); App.send(); } },
    focusComposer(v) { if ($('ws').classList.contains('chat-closed')) App.toggleChat(true); const el = $('composer'); el.focus(); if (v) el.value = v; },
    setCtx(id) { ctx = id; $('ctx').innerHTML = ctxChip(); },
    toggleChat(open) { $('ws').classList.toggle('chat-closed', !open); },
    toggleMenu(id) { const m = $(id); const o = m.classList.contains('open'); document.querySelectorAll('.menu').forEach(x => x.classList.remove('open')); if (!o) m.classList.add('open'); },
    switchUser(id) { localStorage.setItem('dmock_user', id); location.hash = '#home'; location.reload(); },
    newChat() { S.thread = [{ who: 'ai', kind: 'text', html: 'New chat. What would you like me to work on?' }]; ctx = null; save(); renderAll(); },
    doneTodo(id) { S.todosDone[id] = !S.todosDone[id]; save(); renderAll(); },
    runTodo(id) { const t = todos().find(x => x.id === id); if (t) t.go(); },
    repApprovals(r) { apprTab = 'team'; apprRep = r; go('approvals'); renderAll(); },
    setApprTab(k) { apprTab = k; renderApprovals(); },
    setApprRep(r) { apprRep = r; renderApprovals(); },
    setAccView(k) { accView = k; renderAccounts(); },
    setAccScope(k) { accScope = k; renderAccounts(); },
    refreshAccounts: renderAccounts,
    goAccounts(v) { accView = v; go('accounts'); renderAll(); },
    goCampaign(id) { campSel = id; if (route() !== 'campaigns') go('campaigns'); else renderCampaigns(); },
    confirmCampaign(id) { S.camp[id] = 'Confirmed · starts tomorrow 09:00'; save(); toast('Campaign confirmed. Touch 1 is scheduled for tomorrow 09:00 (placeholder: nothing is sent)'); renderAll(); },
    setRecTab(k) { recTab = k; renderRecord(); },
    setOption(id, o) { S.drafts[id] = Object.assign(draftOf(acct(id)), { option: o }); if (o === 'own') S.drafts[id].body = ''; save(); renderRecord(); },
    setChannel(id, c) { S.drafts[id] = Object.assign(draftOf(acct(id)), { channel: c }); save(); renderRecord(); },
    saveDraft(id) { const d = draftOf(acct(id)); if ($('dSubj')) d.subject = $('dSubj').value; if ($('dBody')) d.body = $('dBody').value; S.drafts[id] = d; save(); },
    decide, undo(id) { delete S.decisions[id]; save(); renderAll(); renderRecord(); },
    logOutcome(id, o) { S.outcomes[id] = o; save(); toast(`Logged: ${o}. It feeds the learning loop.`); renderRecord(); },
    addNote(id) { const v = $('noteBox').value.trim(); if (!v) return; (S.notes[id] = S.notes[id] || []).unshift({ t: v, d: 'just now' }); save(); renderRecord(); },
    useRunnerUp(id) { ctx = id; ask('Use the runner-up'); },
    closeDrawer() { $('drawer').classList.remove('open'); $('scrim').classList.remove('open'); },
    createRun() { S.runs.push({ name: $('runName').value, prompt: $('runPrompt').value, freq: 'Every Mon at 07:00', next: 'Mon 2 Nov 07:00' }); save(); toast('Scheduled run created'); openRuns(); },
  };
  document.addEventListener('click', e => { if (!e.target.closest('.menu,.top-user,.top-ic,.ttl')) document.querySelectorAll('.menu').forEach(m => m.classList.remove('open')); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (recId) closeRecord(false); App.closeDrawer(); } });
  renderAll();
})();
