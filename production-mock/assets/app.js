/* DemandAI production mock: the sales workspace (rep and manager).
   Today is the only page: the chat sits in the middle with the to-do list beside it. Every other screen (lists, accounts,
   segments, campaigns, approvals, content studio, an account record) opens in a panel beside the chat, the way the
   reference tool docks its chat next to the work. Close the panel to get back to the to-do list.
   Chats are sessions: "New chat" starts one and it stays under Chats. Replies are scripted against mock-data.js. */
(function () {
  const { USERS, REPS, ACCOUNTS, SEGMENTS, LISTS, CONTENT, PROSPECTS_FOUND, CAMPAIGNS, REPLIES, BLOCKERS, LEARNED, SCHEDULED, TEAM_STATS } = window.MOCK;

  /* ─── Session (storage can be blocked; the mock still works without it) ─── */
  const store = {
    get(k, s) { try { return (s ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } },
    set(k, v, s) { try { (s ? sessionStorage : localStorage).setItem(k, v); } catch (e) { /* not saved */ } },
  };
  let me = USERS[store.get('dmock_user') || 'sofia'] || USERS.sofia;
  if (me.role === 'admin') { location.href = 'admin/index.html'; return; }
  const isMgr = me.role === 'manager';
  const STATE_KEY = 'dmock_state_v3_' + me.id;
  let saved = {};
  try { saved = JSON.parse(store.get(STATE_KEY, true) || '{}'); } catch (e) { saved = {}; }
  const S = Object.assign({ chats: null, cur: 'brief', decisions: {}, todosDone: {}, notes: {}, outcomes: {}, drafts: {}, runs: [], camp: {}, handled: {}, lists: [], seq: {}, content: [], written: null }, saved);
  const save = () => store.set(STATE_KEY, JSON.stringify(S), true);
  if (!S.chats) {
    S.chats = [
      { id: 'brief', title: 'Today\'s brief', when: 'Today', thread: [{ who: 'ai', kind: 'brief' }] },
      { id: 'flow', title: 'Lookalikes of my last 10 wins', when: 'Mon', thread: [{ who: 'me', text: 'Find refiners and petrochem plants like my last 10 wins' }, { who: 'ai', kind: 'prospects', steps: FIND_STEPS() }] },
      { id: 'cedar', title: 'Cedar renewal prep', when: 'Fri', thread: [{ who: 'me', text: 'What should I do with Cedar?' }, { who: 'ai', kind: 'nba', id: 'cedar' }] },
    ];
  }
  function FIND_STEPS() { return ['Turned your request into an ICP filter: refining, petrochemicals and gas · SEA · 500+ staff · reliability, operations and I&amp;C leaders', 'Searched the primary contact provider, then the fallback for the misses', 'Cross-checked fallback hits and gave everyone an identity tier', 'Removed 4 existing customers and 3 accounts another rep owns (CRM, read-only)', 'Ranked by similarity to your last 10 wins']; }
  const chat = () => S.chats.find(c => c.id === S.cur) || S.chats[0];
  let ctx = null;
  let accView = 'ranked', scope = isMgr ? 'team' : 'mine', apprTab = isMgr ? 'needs' : 'todo', apprRep = 'all', campSel = 'c1', recTab = 'next', recId = null, listSel = null;
  let segPath = { seg: null, acc: null, act: null };

  /* ─── Helpers ─── */
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const js = v => esc(JSON.stringify(v));
  const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatar = (u, sz) => `<span class="av" style="background:${u.color}${sz ? `;width:${sz}px;height:${sz}px;font-size:${Math.round(sz / 2.7)}px` : ''}">${initials(u.name)}</span>`;
  const first = n => n.split(' ')[0];
  const acct = id => ACCOUNTS.find(a => a.id === id);
  const segOf = id => SEGMENTS.find(s => s.id === id);
  const campOf = id => CAMPAIGNS.find(c => c.id === id);
  const mine = a => isMgr || a.owner === me.id;
  const fmt = n => Number(n).toLocaleString('en-US');
  const toast = msg => { document.querySelectorAll('.toast').forEach(t => t.remove()); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); };
  const IC = {
    send: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    left: '<polyline points="15 18 9 12 15 6"/>',
    right: '<polyline points="9 18 15 12 9 6"/>',
    upa: '<polyline points="18 15 12 9 6 15"/>',
    downa: '<polyline points="6 9 12 15 18 9"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>',
    li: '<rect x="3" y="3" width="18" height="18" rx="3"/><line x1="8" y1="10" x2="8" y2="16"/><line x1="8" y1="7" x2="8" y2="7.01"/><path d="M12 16v-3.5a2 2 0 0 1 4 0V16"/><line x1="12" y1="10" x2="12" y2="16"/>',
    task: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    up: '<path d="M7 10v12"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z"/>',
    down: '<path d="M17 14V2"/><path d="M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.6l2.3-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.8a2 2 0 0 0-1.8 1.1L12 22a3.1 3.1 0 0 1-3-3.9z"/>',
    expand: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.3 1.7 1.4 2.7 2.5 2.7z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    reply: '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
    bolt: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    home: '<path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  };
  const ic = (n, sz = 15, sw = 2) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
  const chIc = ch => ic(ch === 'LinkedIn' ? 'li' : 'mail', 13);
  const tierBadge = t => t === '—' ? '<span class="muted">—</span>' : `<span class="tier ${t}">${t}</span>`;
  const ID_TIER = { 1: ['Tier 1', 'b-pos', 'Found on the primary provider, first try'], 2: ['Tier 2', 'b-pos', 'Fallback provider, confirmed by a second'], 3: ['Tier 3', 'b-warn', 'Fallback provider, not yet confirmed'], 4: ['Tier 4', 'b-neg', 'Providers disagree: held'], 5: ['Tier 5', 'b-grey', 'Last-resort provider only'] };
  const idBadge = t => `<span class="badge ${ID_TIER[t][1]}" title="${ID_TIER[t][2]}">${ID_TIER[t][0]}</span>`;
  const REASON = { 'Ready': 'b-pos', 'Medium confidence': 'b-warn', 'Unproven message': 'b-ter', 'Sensitive': 'b-neg', 'Spot-check': 'b-sec' };
  const reasonOf = a => a.nba.reason || 'Ready';
  const ago = d => d === 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
  const MODE = { NBC: ['Campaign · NBC', 'b-brand'], NBA: ['My actions · NBA', 'b-sec'], Building: ['Building toward a campaign', 'b-grey'] };
  const modeBadge = s => `<span class="badge ${MODE[s.mode][1]}">${s.mode === 'Building' ? `Building · ${s.building} of 10` : MODE[s.mode][0]}</span>`;
  const CSTAT = { 'Ready to confirm': 'b-ter', Running: 'b-pos', Completed: 'b-grey', Draft: 'b-warn' };
  const campStatus = c => S.camp[c.id] || c.status;
  const campBadge = c => `<span class="badge ${S.camp[c.id] ? (S.camp[c.id] === 'Confirmed' ? 'b-pos' : 'b-ter') : CSTAT[c.status] || 'b-grey'}">${esc(campStatus(c))}</span>`;
  const stateBadge = st => { const k = /Meeting|positive/.test(st) ? 'b-pos' : /objection|Bounced|Taken out/.test(st) ? 'b-warn' : /Out of office|Draft/.test(st) ? 'b-grey' : /Waiting/.test(st) ? 'b-ter' : 'b-sec'; return `<span class="badge ${k}">${esc(st)}</span>`; };
  const KIND_B = { Positive: 'b-pos', 'Meeting booked': 'b-pos', Objection: 'b-warn', 'Out of office': 'b-grey' };
  const decLabel = d => ({ approved: 'Approved · scheduled', 'with-manager': 'With Pavan', skipped: 'Skipped', 'sent-back': 'Sent back', signed: 'Signed off' }[d] || d);

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
  function badgeCount() { return isMgr ? apprItems('needs').length + (campStatus(campOf('c1')) === 'Ready to confirm' ? 1 : 0) : apprItems('todo').length; }
  const myReplies = () => REPLIES.filter(r => (isMgr || r.owner === me.id) && !S.handled[r.id]);
  const myBlockers = () => BLOCKERS.filter(b => b.who === 'all' || (isMgr ? b.who === 'manager' : b.who === me.id)).filter(b => !(b.go === 'campaign:c1' && S.camp.c1));
  function todayNBA() { return openItems().filter(a => mine(a) && /^Today/.test(a.nba.due || '') && (!isMgr || a.nba.sensitive)); }

  function todos() {
    const t = [];
    myReplies().filter(r => r.kind === 'Positive').forEach(r => t.push({ id: 'rep-' + r.id, t: `Reply to ${r.from}: said yes`, d: `${acct(r.acc).name} · ${r.sourceKind === 'Campaign' ? 'campaign: ' + r.source : 'your action'}${isMgr ? ' · ' + first(USERS[r.owner].name) : ''}`, due: r.at.startsWith('Today') ? 'By 11:00' : 'Overdue', cls: 'hot', go: () => openRecord(r.acc, 'activity') }));
    if (isMgr) {
      const sens = apprItems('needs');
      if (sens.length) t.push({ id: 'm1', t: `Sign off ${sens.length} sensitive message${sens.length > 1 ? 's' : ''}`, d: sens.map(a => `${a.name} (${first(USERS[a.owner].name)})`).join(' · '), due: 'Today 15:00', cls: 'hot', go: () => go('approvals') });
      if (!S.camp.c1) t.push({ id: 'm2', t: 'Confirm campaign: Turnaround season 2027', d: '11 accounts are held until you decide', due: 'Today', cls: 'soon', go: () => goCampaign('c1') });
      if (S.camp.c5 === 'Sent for confirmation') t.push({ id: 'm6', t: 'Confirm campaign: Control-systems hiring surge', d: 'Sent by Sofia from her prospect list', due: 'Today', cls: 'soon', go: () => goCampaign('c5') });
      t.push({ id: 'm3', t: 'Kenji has 3 overdue items and no meetings yet', d: 'Reassign or nudge. The AI suggests moving 2 to Aisha', due: 'Overdue', cls: 'hot', go: () => ask('How is my team doing?') });
      t.push({ id: 'm5', t: 'Read the weekly pilot readout', d: 'Ready Friday 16:00', due: 'Fri', cls: 'ok', go: () => ask('What did we learn this week?') });
      return t;
    }
    const ready = apprItems('todo').filter(a => !a.nba.reason);
    if (ready.length) t.push({ id: 't2', t: `Approve ${ready.length} ready action${ready.length > 1 ? 's' : ''}`, d: ready.map(a => a.name).join(' · '), due: 'Today 12:00', cls: 'soon', go: () => go('approvals') });
    const unsure = apprItems('todo').filter(a => a.nba.reason && !a.nba.sensitive);
    if (unsure.length) t.push({ id: 't3', t: `Review ${unsure.length} item${unsure.length > 1 ? 's' : ''} the AI wasn't sure about`, d: unsure.map(a => `${a.name} · ${reasonOf(a).toLowerCase()}`).join(' · '), due: 'Today 17:00', cls: 'soon', go: () => go('approvals') });
    if (!S.camp.c5) t.push({ id: 't6', t: 'Review the draft campaign from your list', d: 'Control-systems hiring surge · 4 touches, email and LinkedIn', due: 'Today', cls: 'soon', go: () => goCampaign('c5') });
    const sens = apprItems('todo').filter(a => a.nba.sensitive);
    if (sens.length) t.push({ id: 't4', t: `Check ${sens.length} sensitive message${sens.length > 1 ? 's' : ''} before they go to Pavan`, d: sens.map(a => a.name).join(' · '), due: 'Fri 30 Oct', cls: 'ok', go: () => openRecord(sens[0].id, 'next') });
    t.push({ id: 't5', t: 'Follow up on Sapphire Aromatics', d: 'Opened the renewal comparison 3 times; no reply yet', due: 'Today', cls: 'ok', go: () => openRecord('sapphire', 'activity') });
    return t;
  }
  function updates() {
    const u = [];
    myReplies().filter(r => r.kind === 'Positive' || r.kind === 'Meeting booked').forEach(r => u.push({ k: 'pos', icon: 'reply', when: r.at, t: `${r.from} ${r.kind === 'Positive' ? 'replied: interested' : 'booked a meeting'}`, d: `${acct(r.acc).name} · ${r.sourceKind === 'Campaign' ? 'campaign' : 'your action'}${isMgr ? ' · ' + first(USERS[r.owner].name) : ''}`, on: `App.openRecord('${r.acc}','activity')` }));
    if (!S.camp.c1) u.push({ k: 'brand', icon: 'megaphone', when: 'Today 06:05', t: 'New campaign proposed: Turnaround season 2027', d: isMgr ? '11 accounts crossed the threshold. Needs your confirmation.' : '5 of your accounts are in it. Pavan confirms.', on: "App.goCampaign('c1')" });
    u.push({ k: 'info', icon: 'bolt', when: 'Today 06:00', t: isMgr ? '3 accounts moved into tier A' : 'Juniper Petrochem moved into tier A', d: 'New VP Reliability plus pricing-page visits. A warm path was found through a champion who moved.', on: "App.openRecord('juniper','why')" });
    myBlockers().filter(b => b.k === 'neg').forEach(b => u.push({ k: 'neg', icon: 'alert', when: 'Now', t: b.t, d: b.d, on: b.go ? `App.goTo(${js(b.go)})` : '' }));
    u.push({ k: 'pos', icon: 'megaphone', when: 'Fri 23 Oct', t: 'Control-system renewal: first meeting booked', d: 'Ironwood Refining (Marco). 4 replies from 14 accounts so far.', on: "App.goCampaign('c2')" });
    u.push({ k: 'warn', icon: 'alert', when: 'Thu 22 Oct', t: 'Status watch took 1 account out of a campaign', d: 'Another rep opened an opportunity there. No double outreach.', on: "App.goCampaign('c3')" });
    return u;
  }

  /* ─── Routing: Today is the page; a #name opens that screen beside the chat ─── */
  const VIEWS = { lists: 'Lists', accounts: 'Accounts', segments: 'Segments', campaigns: 'Campaigns', approvals: 'Approvals', studio: 'Content studio' };
  const VIEW_IC = { lists: 'list', accounts: 'users', segments: 'layers', campaigns: 'megaphone', approvals: 'task', studio: 'pen' };
  function view() { const r = (location.hash || '').slice(1); return VIEWS[r] ? r : null; }
  function go(r) { recId = null; if (view() === r) renderAll(); else location.hash = '#' + r; }
  function closeView() { recId = null; if (location.hash && location.hash !== '#today') location.hash = '#today'; else renderAll(); }
  window.addEventListener('hashchange', () => { recId = null; renderAll(); });

  /* ─── Side navigation: chats first, screens second ─── */
  function renderNav() {
    const v = recId ? null : view(), n = badgeCount();
    $('side').innerHTML = `
      <div class="side-brand"><img src="assets/logo.png" alt=""><div><div class="nm">DemandAI</div><div class="org">Sales workspace</div></div></div>
      <button class="side-new" onclick="App.newChat()">${ic('plus', 14)}<span>New chat</span></button>
      <a class="side-item ${!v && !recId ? 'on' : ''}" href="#today" onclick="App.closeView();return false" title="Today">${ic('home', 16)}<span class="lbl-t">Today</span></a>
      <div class="side-sec">Open beside the chat</div>
      <nav class="side-nav" aria-label="Screens">${Object.keys(VIEWS).map(k => `<a class="side-item ${v === k ? 'on' : ''}" href="#${k}" title="${VIEWS[k]}">${ic(VIEW_IC[k], 16)}<span class="lbl-t">${VIEWS[k]}</span>${k === 'approvals' && n ? `<span class="cnt">${n}</span>` : ''}</a>`).join('')}</nav>
      <div class="side-sec">Chats</div>
      <div class="side-recent">${S.chats.map(c => `<button class="${c.id === S.cur ? 'on' : ''}" onclick="App.openChat('${c.id}')" title="${esc(c.title)}">${ic('chat', 13)}<span>${esc(c.title)}</span><i>${esc(c.when)}</i></button>`).join('')}</div>
      <button class="side-item side-runs" onclick="App.openRuns()" title="Scheduled runs">${ic('clock', 16)}<span class="lbl-t">Scheduled runs</span><span class="cnt grey">${SCHEDULED.length + S.runs.length}</span></button>
      <div class="side-foot">
        <div class="side-user">${avatar(me, 30)}<div class="lbl-t"><div class="nm">${esc(me.name)}</div><div class="rl">${isMgr ? 'Sales manager · 4 reps' : 'Sales rep'}</div></div></div>
        <div class="side-links lbl-t"><button onclick="App.switchUser('${isMgr ? 'sofia' : 'pavan'}')">Switch to ${isMgr ? 'Sofia (rep)' : 'Pavan (manager)'}</button><a href="story.html">What we're selling</a><a href="index.html" onclick="App.signOut()">Sign out</a></div>
      </div>`;
  }

  /* ─── Chat ─── */
  const lastKind = () => { const t = chat().thread.filter(m => m.who === 'ai'); return t.length ? t[t.length - 1].kind : null; };
  const NEXT = { prospects: ['Score this list', 'Save as a list'], rankedList: ['Create micro-segments', 'Save the scored list'], listSegments: ['Prepare the next actions', 'Build the campaign'], nbaList: ['Build the campaign', 'How are the campaigns doing?'], flowCampaign: ['How are the campaigns doing?', 'What did we learn this week?'], campaigns: ['What did we learn this week?', 'Any replies?'] };
  function hints() {
    const nx = NEXT[lastKind()] || [];
    const base = isMgr ? ['How is my team doing?', 'How are the campaigns doing?', 'Which segments are campaigns?', 'What needs my approval?', 'Find prospects like our last 10 wins']
      : ['Find prospects like my last 10 wins', 'What should I do first today?', 'How are the campaigns doing?', 'Which segments are campaigns?', 'Write a LinkedIn post for the turnaround segment'];
    return nx.concat(base.filter(b => !nx.includes(b))).slice(0, 5);
  }
  function renderChat() {
    const c = chat(), wide = !$('ws').classList.contains('canvas-open');
    $('chat').innerHTML = `
      <div class="chat-h">
        <span class="ai-mark">${ic('spark', 13)}</span>
        <div class="ttl">${esc(c.title)}</div>
        <div class="sp"></div>
        <button class="ic-btn" title="Scheduled runs" onclick="App.openRuns()">${ic('clock', 15)}</button>
        <button class="ic-btn" title="New chat" onclick="App.newChat()">${ic('plus', 15)}</button>
      </div>
      <div class="thread" id="thread"><div class="thread-in">${wide && c.id === 'brief' ? `<div class="greet"><h1>${greeting()}, ${esc(first(me.name))}</h1><div class="sub">${isMgr ? 'Your team\'s day, prepared overnight. Reps act; you oversee and can step in on anything.' : 'Your day is ready. I\'ve done the research; you approve, edit or ask.'}</div></div>` : ''}${c.thread.map(renderMsg).join('')}</div></div>
      <div class="composer-wrap">
        <div class="hints">${hints().map(h => `<button class="chip" onclick="App.ask(${js(h)})">${esc(h)}</button>`).join('')}</div>
        <div class="composer">
          <div class="ctx" id="ctx">${ctxChip()}</div>
          <label class="sr" for="composer">Message DemandAI</label>
          <textarea id="composer" rows="1" placeholder="Find, score, segment, act, track… type @ to add an account" onkeydown="App.key(event)" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
          <div class="composer-f">
            <button class="ic-btn" title="Add an account" onclick="App.focusComposer('@')">@</button>
            <span class="muted" style="font-size:11px">Scripted demo · nothing is sent</span>
            <div class="sp"></div>
            <button class="send" onclick="App.send()" title="Send">${ic('send', 16)}</button>
          </div>
        </div>
      </div>`;
    const th = $('thread'); th.scrollTop = c.id === 'brief' && c.thread.length < 2 ? 0 : th.scrollHeight;
  }
  function ctxChip() { return ctx ? `<span class="badge b-brand" onclick="App.setCtx(null)" title="Remove">@${esc(acct(ctx).name)} ✕</span>` : ''; }
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  function stepsHtml(steps) { return steps && steps.length ? `<div class="steps">${steps.map(x => `<div class="st"><span class="ok">✓</span><span>${x}</span></div>`).join('')}</div>` : ''; }
  function fbHtml() { return `<div class="fb"><button class="ic-btn" title="Good" onclick="App.toast('Thanks. Feedback goes into the learning loop')">${ic('up', 13)}</button><button class="ic-btn" title="Not good" onclick="App.toast('Thanks. Tell me what to change and I\\'ll redo it')">${ic('down', 13)}</button></div>`; }
  function renderMsg(m) {
    if (m.who === 'me') return `<div class="msg me"><div class="bub">${esc(m.text)}</div></div>`;
    if (m.who === 'typing') return `<div class="msg"><span class="ai-av">${ic('spark', 14)}</span><div class="bub">${m.step ? `<div class="steps"><div class="st"><span class="typing"><i></i><i></i><i></i></span><span>${m.step}</span></div></div>` : '<span class="typing"><i></i><i></i><i></i></span>'}</div></div>`;
    const R = RENDER[m.kind] || RENDER.text;
    return `<div class="msg"><span class="ai-av">${ic('spark', 14)}</span><div class="bub">${stepsHtml(m.steps)}${R(m)}${fbHtml()}</div></div>`;
  }
  const btn = (label, q, pri) => `<button class="btn sm ${pri ? 'pri' : ''}" onclick="App.ask(${js(q)})">${label}</button>`;
  const openBtn = (label, call) => `<button class="btn sm" onclick="${call}">${ic('expand', 12)} ${label}</button>`;
  const listAccounts = () => ACCOUNTS.filter(a => a.fromList === 'L1');

  const RENDER = {
    text: m => `<p>${m.html}</p>`,
    brief: () => {
      const today = todayNBA(), later = openItems().filter(a => mine(a) && !today.includes(a) && !S.decisions[a.id]).length;
      const hot = myReplies().filter(r => r.kind === 'Positive');
      const auto = ACCOUNTS.filter(a => a.nba && a.nba.status === 'auto' && mine(a)).length;
      const c1 = campOf('c1'), mineIn = ACCOUNTS.filter(a => a.campaign === 'c1' && a.owner === me.id).length, bld = SEGMENTS.find(x => x.mode === 'Building');
      return `${stepsHtml(isMgr ? ['Overnight sweep 06:00 · 61 new signals across the team, 24 qualified', 'Re-scored 81 accounts and re-built 9 micro-segments', '31 next actions prepared · 22 went ahead on their own'] : ['Overnight sweep 06:00 · 23 new signals on your accounts, 9 qualified', 'Re-scored your accounts · Juniper Petrochem moved into tier A', `Prepared your next actions · ${auto} went ahead on their own`])}
        <p>${isMgr ? `Here's the team's day. <b>${today.length}</b> action${today.length === 1 ? ' needs' : 's need'} you today, <b>${hot.length}</b> prospects said yes, and <b>one new campaign</b> is ready for you to confirm.` : `Here's your day. <b>${today.length}</b> action${today.length === 1 ? '' : 's'} to decide today and <b>${hot.length}</b> prospect${hot.length === 1 ? '' : 's'} to answer. Everything else went ahead on its own.`}</p>
        ${hot.length ? `<div class="ccard" style="border-color:#F1D3D3"><div class="ccard-h"><span class="t" style="color:var(--neg)">${ic('flame', 14)} Answer first · they said yes</span><span class="muted" style="font-size:11px">fast lane</span></div><div class="ccard-b" style="padding:2px 14px">${hot.map(r => `<div class="mini-row"><div class="grow row-link" onclick="App.openRecord('${r.acc}','activity')"><div class="nm">${esc(r.from)} · ${esc(acct(r.acc).name)}${isMgr ? ` <span class="muted" style="font-weight:400">· ${esc(first(USERS[r.owner].name))}</span>` : ''}</div><div class="sm">"${esc(r.text)}"</div></div><span class="due ${r.at.startsWith('Today') ? 'hot' : 'soon'}" style="font-size:11px">${esc(r.at)}</span>${isMgr ? '' : btn('Draft reply', r.acc === 'eastgate' ? 'Draft a reply to Dian with 3 times next week' : 'What should I do with ' + acct(r.acc).name.split(' ')[0] + '?', true)}</div>`).join('')}</div></div>` : ''}
        <div class="ccard"><div class="ccard-h"><span class="t">${ic('bolt', 14)} Next best actions · due today</span><span class="badge b-sec nodot">${today.length}</span></div>
          <div class="ccard-b" style="padding:0">${today.length ? `<div class="tbl-wrap"><table class="tbl nba-tbl"><thead><tr><th>Account · contact</th><th>Action</th><th>Why it needs you</th><th></th></tr></thead><tbody>${today.map(a => { const d = S.decisions[a.id]; return `<tr><td class="row-link" onclick="App.openRecord('${a.id}','next')"><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.contact.name)}${isMgr ? ' · ' + esc(first(USERS[a.owner].name)) : ''}</div></td><td>${esc(a.nba.action)}<div class="sm">${a.nba.channel} · ${esc(a.segment)}</div></td><td><span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span></td><td style="white-space:nowrap">${d ? `<span class="badge b-grey nodot">${decLabel(d)}</span>` : `${!a.nba.reason || (isMgr && a.nba.sensitive) ? `<button class="btn sm pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : 'Approve'}</button> ` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','next')">Review</button>`}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Nothing to decide today.</div>'}</div>
          <div class="ccard-f"><span class="muted" style="font-size:11.5px">${auto} went ahead on their own${later ? ` · ${later} more due later this week` : ''}</span><div style="flex:1"></div>${today.some(a => !a.nba.reason && !S.decisions[a.id]) && !isMgr ? '<button class="btn sm pri" onclick="App.approveAll()">Approve all ready</button>' : ''}${openBtn('Approvals', "App.go('approvals')")}</div></div>
        <div class="ccard"><div class="ccard-h"><span class="t">${ic('megaphone', 14)} Campaigns to create today · NBC</span><span class="muted" style="font-size:11px">from today's scored list</span></div>
          <div class="ccard-b">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b style="font-size:13px">${esc(c1.name)}</b><div class="sm" style="font-size:12px;color:var(--i2);margin-top:2px">11 accounts announced a planned shutdown in 6 days, which crosses the threshold (10 in 7 days). One campaign instead of 11 separate actions${isMgr ? '' : `; <b>${mineIn} are yours</b>`}.</div></div>${campBadge(c1)}</div>
            <div class="touch-mini">${seqOf(c1).map(t => `<span>${chIc(t.ch)} <b>Day ${t.day}</b> ${t.fmt}</span>`).join('')}</div>
            <div class="sm" style="font-size:11.5px;color:var(--i3);margin-top:8px">Also waiting: <a href="#campaigns" onclick="App.goCampaign('c5');return false">Control-systems hiring surge</a>, drafted from ${isMgr ? 'Sofia\'s' : 'your'} Monday list (${esc(campStatus(campOf('c5')))}). Almost a campaign: <a href="#segments" onclick="App.openSegment('${bld.id}');return false">${esc(bld.name)}</a> has ${bld.building} of 10.</div>
          </div>
          <div class="ccard-f">${isMgr && !S.camp.c1 ? '<button class="btn sm pri" onclick="App.confirmCampaign(\'c1\')">Confirm campaign</button><button class="btn sm" onclick="App.toast(\'Kept as 11 separate next actions (mock)\')">Send as separate actions</button>' : !isMgr && !S.camp.c1 ? '<span class="muted" style="font-size:11.5px">Pavan confirms campaigns.</span><button class="btn sm" onclick="App.toast(\'Your accounts were taken out; they get their own actions (mock)\')">Take mine out</button>' : ''}<div style="flex:1"></div>${openBtn('Edit the sequence', "App.goCampaign('c1')")}</div></div>
        <p style="margin-top:8px">I can run the whole flow here: find prospects, score them, build micro-segments, prepare next actions and campaigns, then track them. Try "Find prospects like my last 10 wins".</p>`;
    },
    prospects: () => {
      const accs = listAccounts();
      const rows = accs.slice(0, 8).map(a => `<tr class="row-link" onclick="App.openRecord('${a.id}','why')"><td><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.contact.title)}</div></td><td>${esc(a.name)}<div class="sm">${esc(a.country)}</div></td><td>${idBadge(a.contact.idTier)}</td></tr>`).join('');
      return `<p>I found <b>24 people at ${accs.length} accounts</b> that match your ICP and look like your recent wins. <b>2 are held</b> for a person to check, and I removed 4 existing customers.</p>
        <div class="ccard"><div class="ccard-h"><span class="t">${ic('list', 14)} Lookalikes of your last 10 wins</span><span class="badge b-brand nodot">${accs.length} accounts</span></div>
        <div class="tbl-wrap" style="max-height:260px;overflow:auto"><table class="tbl"><thead><tr><th>Person</th><th>Account</th><th>Identity</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="ccard-f">${btn('Score this list', 'Score this list', true)}${btn('Save as a list', 'Save as a list')}${openBtn('Open the list', "App.openList('L1')")}</div></div>`;
    },
    savedList: m => `<p>Saved as <b>${esc(m.name)}</b>. It's in Lists, ready to score, segment or use in a campaign.</p><div class="ccard-f" style="border:1px solid var(--border);border-radius:8px">${openBtn('Open in Lists', `App.openList('${m.id}')`)}${btn(m.next || 'Score this list', m.next || 'Score this list', true)}</div>`,
    rankedList: () => {
      const accs = listAccounts().filter(a => a.score > 0).sort((p, q) => q.score - p.score);
      return `<p>Scored by <b>Fit × Timing</b>. ${accs.length} of ${listAccounts().length} have a live signal; the one with none waits and stays watched.</p>
        <div class="ccard"><div class="ccard-b" style="padding:2px 14px">${accs.slice(0, 7).map((a, i) => `<div class="mini-row row-link" onclick="App.openRecord('${a.id}','why')"><span class="mono muted" style="width:16px">${i + 1}</span>${tierBadge(a.tier)}<div class="grow"><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.whyNow.type)} · ${ago(a.whyNow.age)}</div></div><span class="mono" style="font-size:12px">${fmt(a.score)}</span></div>`).join('')}</div>
        <div class="ccard-f">${btn('Create micro-segments', 'Create micro-segments', true)}${btn('Save the scored list', 'Save the scored list')}${openBtn('Ranked view', "App.openList('L1')")}</div></div>`;
    },
    listSegments: () => {
      const accs = listAccounts(), by = {};
      accs.forEach(a => { const k = a.seg || 'none'; (by[k] = by[k] || []).push(a); });
      return `<p>Grouped by each account's strongest trigger. <b>10 accounts share a control-systems hiring surge</b>, which crosses the campaign threshold, so I drafted one campaign. The rest get their own next best action.</p>
        <div class="ccard"><div class="ccard-b" style="padding:2px 14px">${Object.entries(by).map(([k, v]) => { const s = segOf(k); return `<div class="mini-row ${s ? 'row-link' : ''}" ${s ? `onclick="App.openSegment('${k}')"` : ''}><div class="grow"><div class="nm">${s ? esc(s.name) : 'No live signal'}</div><div class="sm">${v.length} account${v.length > 1 ? 's' : ''} · ${v.slice(0, 3).map(a => esc(a.name)).join(', ')}${v.length > 3 ? '…' : ''}</div></div>${s ? (s.mode === 'NBC' ? '<span class="badge b-brand">Campaign · NBC</span>' : '<span class="badge b-sec">Next best action · NBA</span>') : '<span class="badge b-grey nodot">Watch</span>'}</div>`; }).join('')}</div>
        <div class="ccard-f">${btn('Prepare the next actions', 'Prepare the next actions', true)}${btn('Build the campaign', 'Build the campaign')}${openBtn('Segments', "App.go('segments')")}</div></div>`;
    },
    nbaList: () => {
      const accs = listAccounts().filter(a => a.nba);
      return `<p>Next best actions for the ${accs.length} list accounts that aren't in the campaign. Each has a contact, a channel and a draft; the ones on a proven message go ahead on their own.</p>
        <div class="ccard"><div class="ccard-b" style="padding:2px 14px">${accs.map(a => `<div class="mini-row row-link" onclick="App.openRecord('${a.id}','next')">${chIc(a.nba.channel)}<div class="grow"><div class="nm">${esc(a.name)} <span class="muted" style="font-weight:400">· ${esc(a.contact.name)}</span></div><div class="sm">${esc(a.nba.action)} · ${esc(a.segment)}</div></div>${stepBadge(a)}</div>`).join('')}</div>
        <div class="ccard-f">${btn('Build the campaign', 'Build the campaign', true)}${openBtn('Approvals', "App.go('approvals')")}</div></div>`;
    },
    flowCampaign: () => {
      const c = campOf('c5');
      return `<p>Here's the campaign for the 10 hiring-surge accounts: <b>${seqOf(c).length} touches over ${seqOf(c)[seqOf(c).length - 1].day} days</b>, email and LinkedIn. You can add, remove, reorder or rewrite any touch.</p>
        <div class="ccard"><div class="ccard-h"><span class="t">${ic('megaphone', 14)} ${esc(c.name)}</span>${campBadge(c)}</div><div class="ccard-b" style="padding:2px 14px">
        ${seqOf(c).map((t, i) => `<div class="mini-row">${chIc(t.ch)}<div class="grow"><div class="nm">Touch ${i + 1} · Day ${t.day} · ${t.ch} · ${t.fmt}</div><div class="sm">${esc(t.t)}</div></div></div>`).join('')}</div>
        <div class="ccard-f">${openBtn('Edit the sequence', "App.goCampaign('c5')")}${isMgr ? `<button class="btn sm pri" onclick="App.confirmCampaign('c5')">Confirm campaign</button>` : `<button class="btn sm pri" onclick="App.sendForConfirm('c5')">Send to Pavan to confirm</button>`}</div></div>`;
    },
    ranked: () => {
      const list = ACCOUNTS.filter(mine).filter(a => a.score > 0).slice(0, 6);
      return `<p>Ranked by <b>Fit × Timing</b>. A great fit with no live signal scores zero.</p>
        <div class="ccard"><div class="ccard-b" style="padding:2px 14px">${list.map((a, i) => `<div class="mini-row row-link" onclick="App.openRecord('${a.id}','why')"><span class="mono muted" style="width:16px">${i + 1}</span>${tierBadge(a.tier)}<div class="grow"><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.whyNow.type)} · ${ago(a.whyNow.age)}</div></div><span class="mono" style="font-size:12px">${fmt(a.score)}</span></div>`).join('')}</div>
        <div class="ccard-f">${openBtn('Ranked list', "App.goAccounts('ranked')")}${btn('By segment', 'Which segments are campaigns?')}</div></div>`;
    },
    why: m => {
      const a = acct(m.id), sig = a.signals.slice().sort((p, q) => q.weight - p.weight);
      return `<p><b>${esc(a.name)}</b> is #${a.rank}: it fits well <i>and</i> something changed.</p>
        <div class="ccard"><div class="ccard-b"><div class="formula sm-f"><div class="box"><div class="v">${a.fit}</div><div class="k">Fit</div></div><span class="op">×</span><div class="box"><div class="v">${a.timing}</div><div class="k">Timing</div></div><span class="op">=</span><div class="box hl"><div class="v">${fmt(a.score)}</div><div class="k">Tier ${a.tier}</div></div></div>
          ${sig.map((x, i) => `<div class="mini-row"><span class="badge ${x.tier === 1 ? 'b-pos' : x.tier === 2 ? 'b-sec' : 'b-grey'} nodot">T${x.tier}</span><div class="grow"><div class="nm">${esc(x.type)}</div><div class="sm">${ago(x.age)} · ${esc(x.source)}</div></div><span class="mono" style="font-size:12px">${i === 0 ? '' : i === 1 ? '½×' : '¼×'}${x.weight}</span></div>`).join('')}
        </div><div class="ccard-f">${btn('What should I do?', 'What should I do with ' + a.name.split(' ')[0] + '?', true)}${openBtn('Open', `App.openRecord('${a.id}','why')`)}</div></div>`;
    },
    segments: () => {
      const row = s => { const n = ACCOUNTS.filter(a => a.seg === s.id && mine(a)).length; return `<div class="mini-row row-link" onclick="App.openSegment('${s.id}')"><div class="grow"><div class="nm">${esc(s.name)}</div><div class="sm">${n} ${isMgr ? '' : 'of yours · '}${s.mode === 'NBC' ? esc(campStatus(campOf(s.campaign))) : s.proven + ' message'}</div></div>${modeBadge(s)}</div>`; };
      return `<p>Segments with <b>10 or more accounts in 7 days</b> run as a campaign once ${isMgr ? 'you confirm' : 'Pavan confirms'}. The rest are next best actions, one account at a time. Sensitive segments never become campaigns.</p>
        <div class="ccard"><div class="ccard-h"><span class="t">${ic('megaphone', 14)} Campaigns (NBC)</span></div><div class="ccard-b" style="padding:2px 14px">${SEGMENTS.filter(s => s.mode === 'NBC').map(row).join('')}</div></div>
        <div class="ccard"><div class="ccard-h"><span class="t">${ic('bolt', 14)} ${isMgr ? 'Next best actions (NBA)' : 'My actions (NBA)'}</span></div><div class="ccard-b" style="padding:2px 14px">${SEGMENTS.filter(s => s.mode !== 'NBC').map(row).join('')}</div>
        <div class="ccard-f">${openBtn('Segments', "App.go('segments')")}</div></div>`;
    },
    campaigns: () => `<p>${CAMPAIGNS.filter(c => c.status === 'Running').length} campaigns running, ${CAMPAIGNS.filter(c => /Ready|Draft/.test(c.status)).length} waiting to start.</p>
      ${CAMPAIGNS.filter(c => c.status !== 'Completed').map(c => { const st = scopedStats(c); return `<div class="ccard row-link" onclick="App.goCampaign('${c.id}')"><div class="ccard-h"><span class="t">${esc(c.name)}</span>${campBadge(c)}</div><div class="ccard-b"><div class="sm" style="font-size:12px;color:var(--i2)">${progressText(c)}</div><div class="mstats">${statCells(st)}</div><div class="sm" style="font-size:11.5px;color:var(--i3);margin-top:6px">Latest: ${esc(c.updates[0].x)}</div></div></div>`; }).join('')}`,
    replies: () => { const rp = myReplies(); return rp.length ? `<p>${rp.length} repl${rp.length === 1 ? 'y' : 'ies'}, newest first:</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${rp.map(r => `<div class="mini-row row-link" onclick="App.openRecord('${r.acc}','activity')"><span class="badge ${KIND_B[r.kind]}">${r.kind}</span><div class="grow"><div class="nm">${esc(r.from)} · ${esc(acct(r.acc).name)}</div><div class="sm">"${esc(r.text)}"</div></div></div>`).join('')}</div></div>` : '<p>No new replies.</p>'; },
    blockers: () => { const b = myBlockers(); return b.length ? `<p>What's in the way right now:</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${b.map(x => `<div class="mini-row"><span class="badge b-${x.k === 'neg' ? 'neg' : 'warn'} nodot">!</span><div class="grow"><div class="nm">${esc(x.t)}</div><div class="sm" style="white-space:normal">${esc(x.d)}</div></div></div>`).join('')}</div></div>` : '<p>Nothing is blocked.</p>'; },
    nba: m => nbaCard(acct(m.id), m.note),
    campaign: m => {
      const c = campOf(m.id);
      return `<p>${esc(segOf(c.seg).why)}</p>
        <div class="ccard"><div class="ccard-h"><span class="t">${esc(c.name)}</span>${campBadge(c)}</div><div class="ccard-b" style="padding:2px 14px">
        ${seqOf(c).map((t, i) => `<div class="mini-row">${chIc(t.ch)}<div class="grow"><div class="nm">Touch ${i + 1} · Day ${t.day} · ${t.ch} · ${t.fmt}</div><div class="sm">${esc(t.t)}</div></div></div>`).join('')}
        </div><div class="ccard-f">${isMgr && /Ready|Draft/.test(c.status) && S.camp[c.id] !== 'Confirmed' ? `<button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm</button>` : ''}${openBtn('Edit the sequence', `App.goCampaign('${c.id}')`)}</div></div>`;
    },
    learned: () => `<p>What the system learned from this month's outcomes (misses count too):</p>
      <div class="ccard"><div class="ccard-b" style="padding:2px 14px">${LEARNED.map(l => `<div class="mini-row"><span class="badge b-${l.k} nodot">${l.k === 'pos' ? '↑' : l.k === 'neg' ? '↓' : l.k === 'warn' ? '!' : 'i'}</span><div class="grow"><div class="nm">${esc(l.t)}</div><div class="sm" style="white-space:normal">${esc(l.d)}</div></div></div>`).join('')}</div></div>`,
    team: () => `<p>Your team this week: <b>7 meetings booked</b> against a target of 15; reps accepted <b>77%</b> of recommendations first time. <b>Kenji</b> is behind: 3 overdue, no meetings. I suggest moving Banyan Gas and Coral Bay Refining to Aisha.</p>
      <div class="ccard"><div class="ccard-b" style="padding:2px 14px">${REPS.map(r => { const t = TEAM_STATS[r]; return `<div class="mini-row row-link" onclick="App.repApprovals('${r}')">${avatar(USERS[r], 24)}<div class="grow"><div class="nm">${esc(USERS[r].name)}</div><div class="sm">${t.todo} to do · ${t.replies} replies · ${t.meetings}/${t.target} meetings</div></div>${t.overdue ? `<span class="badge b-neg">${t.overdue} overdue</span>` : '<span class="badge b-pos">On track</span>'}</div>`; }).join('')}</div>
      <div class="ccard-f"><button class="btn sm pri" onclick="App.toast('Banyan Gas and Coral Bay Refining moved to Aisha (mock)')">Move 2 to Aisha</button><button class="btn sm" onclick="App.toast('Nudge sent to Kenji (mock)')">Nudge Kenji</button></div></div>`,
    todo: () => `<p>Your list, most urgent first:</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${todos().map(x => `<div class="mini-row row-link" onclick="App.runTodo('${x.id}')"><div class="grow"><div class="nm">${esc(x.t)}</div><div class="sm">${esc(x.d)}</div></div><span class="due ${x.cls}" style="font-size:11px">${esc(x.due)}</span></div>`).join('')}</div></div>`,
    scheduled: m => `<p>Done. I'll run this on a schedule and put the results in your brief.</p>
      <div class="ccard"><div class="ccard-b"><b style="font-size:13px">${esc(m.name)}</b><div class="sm" style="font-size:12px;color:var(--i2);margin:4px 0">${esc(m.prompt)}</div><div class="sm" style="font-size:11px;color:var(--i3)">${esc(m.freq)} · next run ${esc(m.next)}</div></div><div class="ccard-f"><button class="btn sm" onclick="App.openRuns()">Scheduled runs</button></div></div>`,
    approvalsList: () => { const items = apprItems(isMgr ? 'needs' : 'todo'); return items.length ? `<p>${isMgr ? 'These need your sign-off:' : 'Waiting for you:'}</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${items.map(apprMini).join('')}</div></div>` : '<p>Nothing is waiting for you right now.</p>'; },
    content: m => `<p>Here's a first draft of the ${esc(m.type.toLowerCase())} in the client's brand voice. Every claim comes from the approved list.</p>
      <div class="ccard"><div class="ccard-h"><span class="t">${ic('pen', 14)} ${esc(m.title)}</span><span class="badge b-pos">All checks pass</span></div><div class="ccard-b"><div class="draft">${esc(m.body)}</div></div>
      <div class="ccard-f">${openBtn('Edit in Content studio', "App.go('studio')")}<button class="btn sm" onclick="App.toast('Saved to your content (mock)')">Save</button></div></div>`,
    help: () => `<p>I can run the whole flow. Try:</p><div class="hints" style="margin:4px 0">${['Find prospects like my last 10 wins', 'Score this list', 'Create micro-segments', 'Prepare the next actions', 'Build the campaign', 'How are the campaigns doing?', 'What did we learn this week?', 'Write a LinkedIn post for the turnaround segment', 'Every weekday at 7am, check my accounts for new signals'].map(h => `<button class="chip" onclick="App.ask(${js(h)})">${esc(h)}</button>`).join('')}</div>`,
  };
  function apprMini(a) {
    const d = S.decisions[a.id];
    return `<div class="mini-row"><div class="grow row-link" onclick="App.openRecord('${a.id}','next')"><div class="nm">${esc(a.contact.name)} · ${esc(a.name)}</div><div class="sm">${esc(a.nba.action)}${isMgr ? ' · ' + esc(first(USERS[a.owner].name)) : ''}</div></div>
      <span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span>
      ${d ? `<span class="badge b-grey nodot">${decLabel(d)}</span>` : `${!a.nba.reason || (isMgr && a.nba.sensitive) ? `<button class="btn sm pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : 'Approve'}</button>` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','next')">Review</button>`}</div>`;
  }
  function nbaCard(a, note) {
    if (a.campaign) { const c = campOf(a.campaign); return `<p><b>${esc(a.name)}</b> is in the campaign <b>${esc(c.name)}</b>, so it follows the campaign's touches instead of its own action. Current state: ${esc(a.campState)}.</p><div class="ccard-f" style="border:1px solid var(--border);border-radius:8px">${openBtn('Campaign', `App.goCampaign('${c.id}')`)}${openBtn('Activity', `App.openRecord('${a.id}','activity')`)}</div>`; }
    if (!a.nba) return `<p>${esc(a.name)} has no live signal, so there's no next action yet. It stays watched.</p>`;
    const d = draftOf(a), dec = S.decisions[a.id];
    const rec = d.option === 'run' ? a.nba.runnerUp : a.nba.action;
    return `${note ? `<p>${note}</p>` : `<p>For <b>${esc(a.name)}</b> I recommend <b>${esc(rec)}</b>, by ${d.channel === 'LinkedIn' ? 'LinkedIn' : 'email'} to ${esc(a.contact.name)}. ${a.nba.proven ? 'It follows the <b>proven</b> structure for its segment.' : 'There\'s <b>no proven structure</b> yet, so treat it as a first try.'}</p>`}
      <div class="ccard"><div class="ccard-h"><span class="t">${chIc(d.channel)} ${esc(rec)}</span><span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span></div>
        <div class="ccard-b"><div class="draft">${d.channel === 'Email' ? `<div class="subj">${esc(d.subject)}</div>` : ''}${esc(d.body)}</div>
        <div class="checks"><span class="badge b-pos">Brand voice</span><span class="badge b-pos">Approved claims</span>${idBadge(a.contact.idTier)}</div></div>
        <div class="ccard-f">${a.nba.status === 'sent' || a.nba.status === 'auto' ? `<span class="badge b-sec">${a.nba.status === 'sent' ? esc(a.outcome || 'Sent') : 'Went ahead on its own'}</span>` : dec ? `<span class="badge b-grey nodot">${decLabel(dec)}</span>` : `<button class="btn sm pri" onclick="App.approve('${a.id}')">${a.nba.sensitive && !isMgr ? 'Approve → to Pavan' : a.nba.sensitive ? 'Sign off' : 'Approve'}</button>`}
          ${openBtn('Edit', `App.openRecord('${a.id}','next')`)}${btn('Shorter', 'Make it shorter')}<button class="btn sm" onclick="App.useRunnerUp('${a.id}')">Runner-up</button></div></div>`;
  }

  /* Scripted understanding of what the seller typed. */
  function findAccount(t) {
    const word = w => new RegExp('\\b' + w.toLowerCase() + '\\b').test(t);
    return ACCOUNTS.find(a => word(a.name.split(' ')[0])) || ACCOUNTS.find(a => !a.generated && word(a.contact.name.split(' ')[0]));
  }
  function addList(name, kind, note) { const id = 'U' + (S.lists.length + 1); S.lists.unshift({ id, name, kind, by: 'Chat', when: 'Today', note }); return id; }
  function respond(text) {
    const t = text.toLowerCase(), lk = lastKind();
    if (/save (as a |the )?(scored )?list|save it/.test(t)) {
      const scored = /scored/.test(t) || lk === 'rankedList';
      const name = scored ? 'Lookalikes of my last 10 wins · scored 27 Oct' : 'Lookalikes of my last 10 wins · 27 Oct';
      return { kind: 'savedList', id: addList(name, scored ? 'Scored list' : 'Prospect list', scored ? '16 of 17 accounts with a live signal, ranked' : '24 people at 17 accounts'), name, next: scored ? 'Create micro-segments' : 'Score this list' };
    }
    if (/score (this|the|that|these|them)|rank (this|them|these)|score (my )?list/.test(t)) return { kind: 'rankedList', steps: ['Pulled live signals for the 17 list accounts from 23 sources', 'Kept 21 of 30 signals (observable, predictive, time-bound)', 'Applied tier, decay and stacking', 'Fit × Timing = Score'] };
    if (/micro|segment (this|the|them)|create.*segment|group (this|them|the list)/.test(t)) return { kind: 'listSegments', steps: ['Tagged each account by its strongest trigger', 'Checked each group against the campaign threshold (10 in 7 days)', 'Checked the outcome cache for a proven message structure per group'] };
    if (/prepare.*(next )?action|next actions|\bnba\b/.test(t) && !/which/.test(t)) return { kind: 'nbaList', steps: ['De-dup check: no open opportunities, owners confirmed', 'Read CRM history and warm paths', 'Chose email or LinkedIn per contact and wrote the drafts', 'Brand, claims and banned-word checks passed'] };
    if (/build.*campaign|create.*campaign|draft.*campaign|\bnbc\b/.test(t) && !/which/.test(t)) return { kind: 'flowCampaign', steps: ['Used the proven structure closest to this trigger (provisional: no outcomes yet)', 'Planned 4 touches across email and LinkedIn', 'Checked nobody is already in another sequence'] };
    if (/draft a reply|reply to dian/.test(t)) return { kind: 'text', html: 'Here\'s a reply with three times from your calendar:<div class="draft" style="margin-top:8px">Hi Dian,\n\nGreat to hear from you. I can do Tuesday 3 Nov at 10:00, Wednesday 4 Nov at 14:00 or Thursday 5 Nov at 09:30 (Jakarta time). I\'ll bring our lead engineer for hydrocracker projects.\n\nBest,\nSofia</div><div class="ccard-f" style="margin-top:8px;border:1px solid var(--border);border-radius:8px"><button class="btn sm pri" onclick="App.handleReply(\'reastgate\')">Approve &amp; send</button></div>', steps: ['Read the reply: positive, asks for times next week', 'Checked your calendar for free slots', 'Wrote the reply'] };
    if (/write|post|blog|whitepaper|case study|one-pager/.test(t)) { const type = /blog/.test(t) ? 'Blog' : /whitepaper/.test(t) ? 'Whitepaper' : /case/.test(t) ? 'Case study' : 'LinkedIn post'; const w = writeContent(type, /emission/.test(t) ? 's3' : 's8', text); return Object.assign({ kind: 'content', steps: ['Read the brand guidelines, approved claims and banned words', 'Used the segment\'s message structure', 'Ran brand and claim checks'] }, w); }
    const a = findAccount(t) || (ctx ? acct(ctx) : null);
    if (/which.*(segment|campaign)|segments|segment/.test(t) && !a) return { kind: 'segments', steps: ['Re-built micro-segments from each account\'s strongest trigger', 'Checked each segment against the campaign threshold (10 in 7 days)'] };
    if (/campaign/.test(t) && /how|status|doing|running|track/.test(t) || /^track/.test(t)) return { kind: 'campaigns', steps: ['Pulled touch, open, reply and meeting counts for every campaign'] };
    if (/repl/.test(t)) return { kind: 'replies' };
    if (/block|stuck|in the way/.test(t)) return { kind: 'blockers' };
    if (isMgr && /team|reps?\b|overdue|coach|kenji|marco|aisha/.test(t) && !/rank/.test(t)) return { kind: 'team', steps: ['Pulled each rep\'s queue, outcomes and approvals this week'] };
    if (/approv|waiting|needs me|needs my/.test(t) && !/approve all/.test(t)) return { kind: 'approvalsList' };
    if (/campaign|sequence|turnaround/.test(t)) return { kind: 'campaign', id: /renewal/.test(t) ? 'c2' : /expansion|capex/.test(t) ? 'c3' : /hiring|surge/.test(t) ? 'c5' : 'c1' };
    if (/learn|worked|working|what changed|readout/.test(t)) return { kind: 'learned', steps: ['Read 214 outcomes logged this month (wins and misses)', 'Re-ran pattern promotion and demotion', 'Compared signal sources by conversion'] };
    if (/schedul|every (day|weekday|mon|tue|wed|thu|fri|week|morning)|each (day|morning)|7am/.test(t)) {
      const run = { name: /prospect/.test(t) ? 'Monday prospect refresh' : 'Weekday signal check', prompt: text, freq: /mon/.test(t) ? 'Every Mon at 07:00' : 'Every weekday at 07:00', next: /mon/.test(t) ? 'Mon 2 Nov 07:00' : 'Tomorrow 07:00' };
      S.runs.push(run); return Object.assign({ kind: 'scheduled' }, run);
    }
    if (/to ?do|what should i do first|my day|first today/.test(t)) return { kind: 'todo' };
    if (/approve all/.test(t)) { approveAll(true); return { kind: 'text', html: 'Done. Every ready, high-confidence item is approved and scheduled for the next send window (a placeholder in the mock).' }; }
    if (/find|prospect|look ?alike|new accounts|like my|like our|more accounts/.test(t)) return { kind: 'prospects', steps: FIND_STEPS() };
    if (/rank|score|prioriti|who should i call|top accounts/.test(t)) return { kind: 'ranked', steps: ['Pulled live signals from 23 sources', 'Applied tier, decay and stacking', 'Fit × Timing = Score'] };
    if (/thailand.*jump|spike/.test(t)) return { kind: 'text', html: 'Five Thai accounts posted control-systems roles within 2 days, far outside the normal range. The system gave them a temporary tier-1 boost, alerted Marco, and logged the event so signal research can check whether it\'s a new pattern.' };
    if (a && /shorter|cost|formal|friendl|rewrite|runner/.test(t)) return rewrite(a, t);
    if (a && /why/.test(t)) { ctx = a.id; return { kind: 'why', id: a.id, steps: ['Read the audit trail for this account (thresholds version 2026.10)'] }; }
    if (a) { ctx = a.id; return { kind: 'nba', id: a.id, steps: [`De-dup check: no open opportunity, owner is ${esc(USERS[a.owner].name)}`, 'Read CRM history and the warm path', 'Brand, claims and banned-word checks passed'] }; }
    if (/shorter|cost|formal|rewrite/.test(t)) return { kind: 'text', html: 'Which message? Open an account or type @ and its name.' };
    return { kind: 'help' };
  }
  function rewrite(a, t) {
    if (!a.nba) return { kind: 'nba', id: a.id };
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
    if (!text || !text.trim()) return;
    const c = chat();
    c.thread = c.thread.filter(m => m.who !== 'typing');
    if (c.title === 'New chat') c.title = text.length > 38 ? text.slice(0, 36) + '…' : text;
    c.thread.push({ who: 'me', text });
    const reply = respond(text);
    const steps = reply.steps || [];
    save(); renderChat(); renderNav();
    let i = 0;
    const tick = () => {
      c.thread = c.thread.filter(m => m.who !== 'typing');
      if (i < steps.length) { c.thread.push({ who: 'typing', step: steps[i] }); i++; renderChat(); setTimeout(tick, 360); return; }
      c.thread.push(Object.assign({ who: 'ai' }, reply));
      save(); renderAll();
    };
    c.thread.push({ who: 'typing' }); renderChat(); setTimeout(tick, steps.length ? 260 : 550);
  }

  /* ─── Campaign sequences (email and LinkedIn only; editable) ─── */
  const FORMATS = { Email: ['Plain text', 'Case study', 'Comparison document', 'Checklist', 'Infographic', 'Whitepaper'], LinkedIn: ['Connection request', 'Message', 'Comment on their post', 'Carousel post'] };
  function seqOf(c) { return S.seq[c.id] || c.touches.map(t => ({ day: t.day, ch: t.ch, fmt: t.fmt, subject: t.subject || (t.ch === 'Email' ? c.name : ''), t: t.t, state: t.state })); }
  const locked = (c, t) => /Sent|Done/.test(t.state || '') || c.status === 'Completed';
  function scopedStats(c) {
    if (c.final) return c.final;
    const accs = ACCOUNTS.filter(a => a.campaign === c.id && mine(a));
    const has = re => accs.filter(a => re.test(a.campState)).length;
    const touchesDone = seqOf(c).filter(t => /Sent|Done/.test(t.state)).length;
    return { accounts: accs.length, sent: accs.length * touchesDone, opened: has(/Opened|Clicked|Replied|Meeting/), replies: has(/Replied|Meeting|Out of office/), meetings: has(/Meeting/) };
  }
  function statCells(st) { return [['Accounts', st.accounts], ['Sent', st.sent], ['Opened', st.opened != null ? st.opened : '—'], ['Replies', st.replies], ['Meetings', st.meetings]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join(''); }
  function progressText(c) {
    if (S.camp[c.id] === 'Confirmed') return 'Confirmed · touch 1 goes out tomorrow 09:00';
    if (S.camp[c.id] === 'Sent for confirmation') return 'Sent to Pavan to confirm';
    if (c.status === 'Draft') return `Draft from a prospect list · ${c.accounts.length} accounts · needs a review`;
    if (c.status === 'Ready to confirm') return `${c.accounts.length} accounts held · needs ${isMgr ? 'your' : 'Pavan\'s'} confirmation`;
    if (c.status === 'Completed') return `Ran ${c.launched} · completed`;
    const sq = seqOf(c), done = sq.filter(t => /Sent|Done/.test(t.state)).length, next = sq.find(t => !/Sent|Done/.test(t.state));
    return `Day ${c.day} · touch ${done} of ${sq.length} done${next ? ` · next: ${(next.state || 'not scheduled').replace('Scheduled ', '')}` : ' · all touches done'}`;
  }
  function touchBar(c) {
    const sq = seqOf(c), done = S.camp[c.id] ? 0 : sq.filter(t => /Sent|Done/.test(t.state)).length;
    return `<div class="tbar">${sq.map((t, i) => `<i class="${i < done ? 'on' : ''}" title="Touch ${i + 1}: ${esc(t.ch)} · ${esc(t.state || 'not started')}"></i>`).join('')}</div>`;
  }

  /* ─── Today panel (beside the chat when nothing else is open) ─── */
  function renderToday() {
    const k = isMgr ? [['7/15', 'Meetings', 'team, this week'], [String(myReplies().length), 'Replies', 'to answer'], ['22/31', 'Went ahead', 'on their own'], ['77%', 'Accepted', 'first time (G2)']]
      : [['2/4', 'Meetings', 'this week'], [String(myReplies().length), 'Replies', 'to answer'], [String(todayNBA().length), 'To decide', 'today'], ['83%', 'Accepted', 'first time (G2)']];
    const td = todos();
    $('main').className = 'tpanel';
    $('main').innerHTML = `
      <div class="tp-h"><span>Today</span><span class="muted">Tue 27 Oct</span></div>
      <div class="tp-kpis">${k.map(x => `<div><b>${x[0]}</b><span>${x[1]}</span><i>${x[2]}</i></div>`).join('')}</div>
      <section class="tp-sec"><div class="tp-sec-h"><span class="lbl">To do</span><span class="muted" style="font-size:11px">${td.filter(x => !S.todosDone[x.id]).length} open</span></div>
        <table class="tbl todo-tbl"><thead><tr><th style="width:26px"><span class="sr">Done</span></th><th>Task</th><th>Due</th></tr></thead><tbody>
        ${td.map(x => `<tr class="${S.todosDone[x.id] ? 'done' : ''}"><td><button class="ck" aria-label="Mark done" onclick="App.doneTodo('${x.id}')">${S.todosDone[x.id] ? ic('check', 11, 3) : ''}</button></td><td class="row-link" onclick="App.runTodo('${x.id}')"><div class="nm">${esc(x.t)}</div><div class="sm">${esc(x.d)}</div></td><td><span class="due ${x.cls}">${esc(x.due)}</span></td></tr>`).join('')}
        </tbody></table></section>
      <section class="tp-sec"><div class="tp-sec-h"><span class="lbl">Most important updates</span></div>
        ${updates().slice(0, 6).map(u => `<button class="upd-i" ${u.on ? `onclick="${u.on}"` : ''}><span class="ic k-${u.k}">${ic(u.icon, 13)}</span><div class="grow"><div class="nm">${esc(u.t)}</div><div class="sm">${esc(u.d)}</div></div><span class="when">${esc(u.when)}</span></button>`).join('')}
      </section>
      <section class="tp-sec"><div class="tp-sec-h"><span class="lbl">Open beside the chat</span></div><div class="tp-views">${Object.keys(VIEWS).map(v => `<a href="#${v}">${ic(VIEW_IC[v], 14)} ${VIEWS[v]}</a>`).join('')}</div></section>`;
  }

  /* ─── Canvas: a screen opened beside the chat ─── */
  function canvasFrame(title, sub) {
    $('main').className = 'canvas';
    $('main').innerHTML = `<div class="cv-h"><div><div class="cv-t">${title}</div>${sub ? `<div class="cv-s">${sub}</div>` : ''}</div><div class="cv-a"><button class="btn sm" onclick="App.closeView()" title="Back to the to-do list">${ic('x', 13)} Close</button></div></div><div class="cv-b" id="cv"></div>`;
    return $('cv');
  }

  /* Lists */
  function listMembers(l) {
    if (l.id === 'L1' || /^U/.test(l.id)) return listAccounts();
    if (l.seg) return ACCOUNTS.filter(a => a.seg === l.seg);
    return ACCOUNTS.filter(a => a.score > 0);
  }
  function renderLists() {
    const all = S.lists.concat(LISTS);
    if (listSel) {
      const l = all.find(x => x.id === listSel), accs = listMembers(l).slice().sort((p, q) => q.score - p.score);
      const cv = canvasFrame(esc(l.name), `${esc(l.kind)} · ${accs.length} accounts · saved by ${esc(l.by)} · ${esc(l.when)}`);
      cv.innerHTML = `<nav class="crumbs"><a href="#lists" onclick="App.openList(null);return false">Lists</a><span class="sep">${ic('right', 12)}</span><span>${esc(l.name)}</span></nav>
        <div class="toolbar">${btn('Score this list', 'Score this list', true)}${btn('Create micro-segments', 'Create micro-segments')}${btn('Build the campaign', 'Build the campaign')}<span class="muted" style="font-size:12px;margin-left:auto">${esc(l.note)}</span></div>
        <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Contact</th><th>Identity</th><th>Tier</th><th>Score</th><th>Segment</th><th>Owner</th><th>Status</th></tr></thead><tbody>
        ${accs.map(a => `<tr class="row-link" onclick="App.openRecord('${a.id}','why')"><td><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.industry)} · ${esc(a.country)}</div></td><td>${esc(a.contact.name)}<div class="sm">${esc(a.contact.title)}</div></td><td>${idBadge(a.contact.idTier)}</td><td>${tierBadge(a.tier)}</td><td class="mono">${fmt(a.score)}</td><td>${a.seg ? esc(a.segment) : '—'}</td><td>${esc(first(USERS[a.owner].name))}</td><td>${stepBadge(a)}</td></tr>`).join('')}</tbody></table></div>`;
      return;
    }
    const cv = canvasFrame('Lists', 'Prospect lists, scored lists and segments you saved. Each one can be scored, segmented or used in a campaign.');
    cv.innerHTML = `<div class="toolbar">${btn('Find new prospects', 'Find prospects like my last 10 wins', true)}<span class="muted" style="font-size:12px;margin-left:auto">Save any result in the chat with "Save as a list"</span></div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>List</th><th>Type</th><th>Size</th><th>Saved by</th><th>When</th><th></th></tr></thead><tbody>
      ${all.map(l => `<tr class="row-link" onclick="App.openList('${l.id}')"><td><div class="nm">${esc(l.name)}</div><div class="sm">${esc(l.note)}</div></td><td><span class="badge ${l.kind === 'Segment' ? 'b-brand' : l.kind === 'Scored list' ? 'b-sec' : 'b-grey'} nodot">${esc(l.kind)}</span></td><td class="mono">${listMembers(l).length}</td><td>${esc(l.by)}</td><td>${esc(l.when)}</td><td style="white-space:nowrap" onclick="event.stopPropagation()">${l.kind === 'Prospect list' ? `<button class="btn sm" onclick="App.openList('${l.id}');App.ask('Score this list')">Score</button>` : l.kind === 'Scored list' ? `<button class="btn sm" onclick="App.openList('${l.id}');App.ask('Create micro-segments')">Segment</button>` : `<button class="btn sm" onclick="App.openSegment('${l.seg}')">Open segment</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /* Segments: micro-segments → segment → account → activity */
  function crumbs() {
    const c = [`<a href="#segments" onclick="App.segNav(0);return false">Micro-segments</a>`];
    if (segPath.seg) c.push(`<a href="#segments" onclick="App.segNav(1);return false">${esc(segOf(segPath.seg).name)}</a>`);
    if (segPath.acc) c.push(`<a href="#segments" onclick="App.segNav(2);return false">${esc(acct(segPath.acc).name)}</a>`);
    if (segPath.act != null) c.push(`<span>${esc(acct(segPath.acc).activity[segPath.act].t)}</span>`);
    return `<nav class="crumbs" aria-label="Breadcrumb">${c.join(`<span class="sep">${ic('right', 12)}</span>`)}</nav>`;
  }
  function renderSegments() {
    const cv = canvasFrame('Segments', 'Micro-segments → segment → account → activity');
    if (segPath.act != null) return renderActivityDetail(cv);
    if (segPath.acc) return renderSegAccount(cv);
    if (segPath.seg) return renderSegment(cv);
    const card = s => {
      const accs = ACCOUNTS.filter(a => a.seg === s.id), my = accs.filter(mine);
      const c = s.campaign ? campOf(s.campaign) : null;
      const status = c ? `${esc(campStatus(c))} · ${progressText(c)}` : `${accs.filter(a => a.nba && /ready|review/.test(a.nba.status)).length} waiting for a person · ${accs.filter(a => a.nba && /auto|sent/.test(a.nba.status)).length} went ahead or sent`;
      return `<button class="seg-card" onclick="App.openSegment('${s.id}')">
        <div class="seg-card-h"><span class="nm">${esc(s.name)}</span>${modeBadge(s)}</div>
        <div class="sm">Trigger: ${esc(s.trigger)}${s.sensitive ? ' · sensitive' : ''}${s.fromList ? ' · from a prospect list' : ''}</div>
        ${s.mode === 'Building' ? `<div class="bar" style="margin:8px 0 2px"><i style="width:${s.building * 10}%"></i></div>` : ''}
        <div class="seg-nums"><div><b>${isMgr ? accs.length : my.length}</b><span>${isMgr ? 'accounts' : `yours of ${accs.length}`}</span></div><div><b>${s.rate}%</b><span>${s.proven.toLowerCase()} message</span></div><div><b>${s.outcomes}</b><span>outcomes so far</span></div></div>
        <div class="sm st">${status}</div></button>`;
    };
    cv.innerHTML = `${crumbs()}
      <div class="rule"><b>Campaign or my action?</b> When 10 or more accounts land in one segment within 7 days, the system proposes a campaign (NBC) and ${isMgr ? 'you confirm it' : 'Pavan confirms it'}. Below that, each account gets its own next best action (NBA). Sensitive segments never become campaigns.</div>
      <div class="seg-grp"><h2>${ic('megaphone', 15)} Run as campaigns · NBC</h2><div class="seg-grid">${SEGMENTS.filter(s => s.mode === 'NBC').map(card).join('')}</div></div>
      <div class="seg-grp"><h2>${ic('bolt', 15)} ${isMgr ? 'Next best actions · NBA' : 'My actions · NBA'}</h2><div class="seg-grid">${SEGMENTS.filter(s => s.mode !== 'NBC').map(card).join('')}</div></div>`;
  }
  function lastAct(a) { const x = a.activity[a.activity.length - 1]; return x ? `${esc(x.t)}<div class="sm">${esc(x.when)}</div>` : '—'; }
  function renderSegment(cv) {
    const s = segOf(segPath.seg), c = s.campaign ? campOf(s.campaign) : null;
    const accs = ACCOUNTS.filter(a => a.seg === s.id && (isMgr || scope === 'team' || a.owner === me.id)).sort((p, q) => q.score - p.score);
    const total = ACCOUNTS.filter(a => a.seg === s.id).length;
    cv.innerHTML = `${crumbs()}
      <div class="page-h"><div><h1>${esc(s.name)}</h1><div class="sub">Trigger: ${esc(s.trigger)} · ${total} accounts · ${modeBadge(s)}</div></div></div>
      <div class="seg-detail">
        <div class="card"><div class="card-b">
          <div class="lbl" style="margin-bottom:6px">Why these accounts are together</div><p class="p">${esc(s.why)}</p>
          <div class="lbl" style="margin:12px 0 6px">Message structure (from the outcome cache)</div><p class="p">${esc(s.structure)}</p>
          <div class="seg-nums" style="margin-top:10px"><div><b>${s.proven}</b><span>pattern</span></div><div><b>${s.rate}%</b><span>positive outcomes</span></div><div><b>${s.outcomes}</b><span>outcomes logged</span></div></div>
        </div></div>
        <div class="card"><div class="card-b">
          ${c ? `<div class="lbl" style="margin-bottom:6px">Campaign · NBC</div><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>${esc(c.name)}</b>${campBadge(c)}</div><div class="sm" style="font-size:12px;color:var(--i2);margin:4px 0 8px">${progressText(c)}</div>${touchBar(c)}<div class="mstats">${statCells(scopedStats(c))}</div><div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm pri" onclick="App.goCampaign('${c.id}')">Open campaign and sequence</button></div>`
            : s.mode === 'Building' ? `<div class="lbl" style="margin-bottom:6px">Building toward a campaign</div><div class="bar" style="margin:6px 0"><i style="width:${s.building * 10}%"></i></div><p class="p">${s.building} of 10 accounts in the 7-day window. Until then each account has its own next best action below.</p>`
            : `<div class="lbl" style="margin-bottom:6px">${isMgr ? 'Next best actions · NBA' : 'My actions · NBA'}</div><p class="p">Each account gets its own action, contact, channel and draft. ${s.sensitive ? 'Sensitive: every message goes to the sales manager first.' : 'High-confidence ones on a proven pattern go ahead on their own.'}</p><div class="seg-nums"><div><b>${accs.filter(a => a.nba && /ready|review/.test(a.nba.status)).length}</b><span>waiting for a person</span></div><div><b>${accs.filter(a => a.nba && /auto|sent/.test(a.nba.status)).length}</b><span>went ahead or sent</span></div></div>`}
        </div></div>
      </div>
      <div class="toolbar" style="margin-top:16px"><b style="font-size:14px">Accounts</b>${isMgr ? '' : `<div class="seg" style="margin-left:8px">${[['mine', 'Mine'], ['team', 'Whole segment']].map(([k, l]) => `<button class="${scope === k ? 'on' : ''}" onclick="App.setScope('${k}')">${l}</button>`).join('')}</div>`}<button class="btn sm" style="margin-left:auto" onclick="App.saveSegList('${s.id}')">Save as a list</button></div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Contact</th><th>Tier</th><th>Score</th><th>Signal</th>${isMgr || scope === 'team' ? '<th>Owner</th>' : ''}<th>Status</th><th>Last activity</th></tr></thead><tbody>
        ${accs.map(a => `<tr class="row-link" onclick="App.segAccount('${a.id}')"><td><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.industry)} · ${esc(a.country)}</div></td><td>${esc(a.contact.name)}<div class="sm">${esc(a.contact.title)}</div></td><td>${tierBadge(a.tier)}</td><td class="mono">${fmt(a.score)}</td><td>${a.whyNow ? esc(a.whyNow.type) + `<div class="sm">${ago(a.whyNow.age)}</div>` : '—'}</td>${isMgr || scope === 'team' ? `<td>${esc(first(USERS[a.owner].name))}</td>` : ''}<td>${stepBadge(a)}</td><td>${lastAct(a)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">None of your accounts are in this segment. Switch to "Whole segment".</td></tr>'}
      </tbody></table></div>`;
  }
  const ACT_IC = { signal: 'bolt', score: 'layers', segment: 'layers', campaign: 'megaphone', sent: 'mail', open: 'mail', reply: 'reply', watch: 'alert', nba: 'spark', wait: 'clock', crm: 'clock' };
  function renderSegAccount(cv) {
    const a = acct(segPath.acc), c = a.campaign ? campOf(a.campaign) : null;
    cv.innerHTML = `${crumbs()}
      <div class="page-h"><div><h1>${esc(a.name)}</h1><div class="sub">${esc(a.industry)} · ${esc(a.country)} · ${esc(a.size)} · owner ${esc(USERS[a.owner].name)}</div></div>
        <div style="display:flex;gap:8px"><button class="btn" onclick="App.openRecord('${a.id}','${c ? 'activity' : 'next'}')">${ic('expand', 13)} Full record</button></div></div>
      <div class="seg-detail">
        <div class="card"><div class="card-b">
          <div class="who" style="margin-bottom:10px">${avatar(USERS[a.owner], 40)}<div><div class="nm" style="font-family:var(--fd);font-weight:600">${esc(a.contact.name)}</div><div class="tl" style="font-size:12px;color:var(--i2)">${esc(a.contact.title)} · ${idBadge(a.contact.idTier)}</div></div></div>
          <div class="formula sm-f"><div class="box"><div class="v">${a.fit}</div><div class="k">Fit</div></div><span class="op">×</span><div class="box"><div class="v">${a.timing}</div><div class="k">Timing</div></div><span class="op">=</span><div class="box hl"><div class="v">${fmt(a.score)}</div><div class="k">Tier ${a.tier}</div></div></div>
        </div></div>
        <div class="card"><div class="card-b">
          ${c ? `<div class="lbl" style="margin-bottom:6px">In campaign · NBC</div><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${esc(c.name)}</b>${stateBadge(a.campState)}</div><div class="sm" style="font-size:12px;color:var(--i2);margin:4px 0 8px">${progressText(c)}</div>${touchBar(c)}<div style="margin-top:10px;display:flex;gap:6px"><button class="btn sm" onclick="App.goCampaign('${c.id}')">Open campaign</button><button class="btn sm" onclick="App.toast('Taken out of the campaign; it gets its own next action instead (mock)')">Take out</button></div>`
            : a.nba ? `<div class="lbl" style="margin-bottom:6px">Next best action · NBA</div><b>${esc(a.nba.action)}</b><div class="sm" style="font-size:12px;color:var(--i2);margin:4px 0 8px">${a.nba.channel} · runner-up: ${esc(a.nba.runnerUp)}</div>${stepBadge(a)}<div style="margin-top:10px"><button class="btn sm pri" onclick="App.openRecord('${a.id}','next')">Review the action</button></div>`
            : '<p class="p">No live signal, so no action yet.</p>'}
        </div></div>
      </div>
      <h2 class="sec-h">Activity</h2>
      <div class="card"><div class="card-b timeline">${a.activity.map((x, i) => `<button class="tl-row" onclick="App.segActivity(${i})"><span class="ic k-${x.k}">${ic(ACT_IC[x.k] || 'clock', 13)}</span><div class="grow"><div class="nm">${esc(x.t)}</div><div class="sm">${esc(x.d)}</div></div><span class="when">${esc(x.when)}</span>${ic('right', 14)}</button>`).join('')}</div></div>`;
  }
  function renderActivityDetail(cv) {
    const a = acct(segPath.acc), x = a.activity[segPath.act];
    let body = `<p class="p">${esc(x.d)}</p>`;
    if (x.k === 'signal') { const sg = a.signals.find(s => x.t.endsWith(s.type)); if (sg) body += `<div class="seg-nums" style="margin-top:12px"><div><b>Tier ${sg.tier}</b><span>signal tier</span></div><div><b>${sg.weight}</b><span>weight after decay</span></div><div><b>${Math.round(sg.strength * 100)}%</b><span>strength (AI read)</span></div></div><p class="p muted" style="margin-top:10px">Passed all three checks: observable from a public source, predictive of buying in this category, and time-bound.</p>`; }
    if (x.k === 'score') body += `<div class="formula" style="margin-top:12px"><div class="box"><div class="v">${a.fit}</div><div class="k">Fit</div></div><span class="op">×</span><div class="box"><div class="v">${a.timing}</div><div class="k">Timing</div></div><span class="op">=</span><div class="box hl"><div class="v">${fmt(a.score)}</div><div class="k">Score · tier ${a.tier}</div></div></div>`;
    if (x.msg) body += `<div class="lbl" style="margin:14px 0 6px">What was sent</div><div class="draft"><div class="subj">${esc(x.msg.subject)}</div>${esc(x.msg.body)}</div>`;
    if (x.reply) body += `<div class="lbl" style="margin:14px 0 6px">Suggested next step</div><div style="display:flex;gap:6px;flex-wrap:wrap">${x.reply.kind === 'Positive' ? btn('Draft a reply', a.id === 'eastgate' ? 'Draft a reply to Dian with 3 times next week' : 'What should I do with ' + a.name.split(' ')[0] + '?', true) : ''}<button class="btn sm" onclick="App.toast('The sequence for this account is stopped; replies always go to the owner (mock)')">Stop the sequence</button></div>`;
    cv.innerHTML = `${crumbs()}
      <div class="page-h"><div><h1>${esc(x.t)}</h1><div class="sub">${esc(a.name)} · ${esc(x.when)}</div></div><button class="btn" onclick="App.segNav(2)">${ic('left', 13)} Back to activity</button></div>
      <div class="card" style="max-width:760px"><div class="card-b">${body}<div class="muted" style="font-size:11px;margin-top:16px">Audit trail · thresholds version 2026.10 · recorded automatically</div></div></div>`;
  }

  /* Campaigns, with the sequence editor */
  function renderCampaigns() {
    const c = campOf(campSel) || CAMPAIGNS[0];
    const accs = ACCOUNTS.filter(a => a.campaign === c.id).sort((p, q) => (isMgr ? 0 : (q.owner === me.id) - (p.owner === me.id)));
    const st = scopedStats(c), s = c.seg ? segOf(c.seg) : null, sq = seqOf(c);
    const building = SEGMENTS.find(x => x.mode === 'Building');
    const grp = (label, list) => list.length ? `<div class="grp-l" style="padding:10px 14px 4px">${label}</div>${list.map(x => `<div class="camp ${x.id === c.id ? 'on' : ''}" onclick="App.goCampaign('${x.id}')"><div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:13px">${esc(x.name)}</b>${campBadge(x)}</div><div class="sm muted" style="font-size:11.5px;margin:3px 0 6px">${progressText(x)}</div>${touchBar(x)}</div>`).join('')}` : '';
    const editable = c.status !== 'Completed';
    const cv = canvasFrame('Campaigns · NBC', 'One campaign per micro-segment that crossed 10 accounts in 7 days, or drafted from a list. The AI writes the sequence; you edit it.');
    cv.innerHTML = `
      <div class="placeholder-note" style="margin-bottom:14px">${ic('mail', 16)}<div><b>Placeholder.</b> Sending through email and LinkedIn connects after the pilot. Nothing is sent from the mock.</div></div>
      <div class="camp-grid">
        <div class="card" style="overflow:hidden">
          ${grp('Needs confirmation', CAMPAIGNS.filter(x => x.status === 'Ready to confirm'))}
          ${grp('Draft', CAMPAIGNS.filter(x => x.status === 'Draft'))}
          ${grp('Running', CAMPAIGNS.filter(x => x.status === 'Running'))}
          <div class="grp-l" style="padding:10px 14px 4px">Building</div><div class="camp" onclick="App.openSegment('${building.id}')"><b style="font-size:13px">${esc(building.name)}</b><div class="sm muted" style="font-size:11.5px;margin:3px 0 6px">${building.building} of 10 accounts · each gets its own action until then</div><div class="bar"><i style="width:${building.building * 10}%"></i></div></div>
          ${grp('Completed', CAMPAIGNS.filter(x => x.status === 'Completed'))}
        </div>
        <div class="card"><div class="card-h"><div><div style="font-family:var(--fd);font-size:16px;font-weight:600">${esc(c.name)}</div><div class="muted" style="font-size:12px">${s ? `Segment: <a href="#segments" onclick="App.openSegment('${s.id}');return false">${esc(s.name)}</a> · ${s.proven.toLowerCase()} message structure` : 'Archived segment'}${c.fromList ? ' · from the list "Lookalikes of my last 10 wins"' : ''} · ${c.launched ? 'launched ' + esc(c.launched) : 'not launched'}</div></div>${campBadge(c)}</div>
          <div class="card-b">
            <div class="mstats big">${statCells(st)}</div>
            <div class="muted" style="font-size:11.5px;margin:-4px 0 12px">${isMgr ? 'Whole team' : `Your ${st.accounts} accounts in this campaign`}</div>
            ${c.blockers.map(b => `<div class="blk ${b.k}" style="margin-bottom:10px">${ic('alert', 15)}<div class="grow"><b>Blocker</b><span>${esc(b.x)}</span></div></div>`).join('')}
            <div class="seq-h"><span class="sec-t" style="border:none;padding:0">Sequence · ${sq.length} touches · email and LinkedIn</span>${editable ? `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" onclick="App.seqAdd('${c.id}','Email')">${ic('plus', 12)} Email touch</button><button class="btn sm" onclick="App.seqAdd('${c.id}','LinkedIn')">${ic('plus', 12)} LinkedIn touch</button>${S.seq[c.id] ? `<button class="btn sm ghost" onclick="App.seqReset('${c.id}')">Reset to the AI draft</button>` : ''}</div>` : ''}</div>
            <div class="seq">${sq.map((t, i) => touchEditor(c, t, i, sq.length)).join('')}</div>
            <div class="muted" style="font-size:11.5px;margin:10px 0 0">Explore / exploit: ${esc(c.explore)}</div>
            <div class="sec-t" style="margin-top:16px">Updates</div>
            ${c.updates.map(u => `<div class="upd"><span class="when">${esc(u.t)}</span><div class="sm" style="font-size:12.5px;color:var(--i1)">${esc(u.x)}</div></div>`).join('')}
            ${accs.length ? `<div class="sec-t" style="margin-top:16px">Accounts (${accs.length})</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Contact</th><th>Owner</th><th>Where it is</th></tr></thead><tbody>${accs.map(a => `<tr class="row-link ${!isMgr && a.owner !== me.id ? 'dim' : ''}" onclick="App.openRecord('${a.id}','activity')"><td class="nm">${esc(a.name)}</td><td>${esc(a.contact.name)}<div class="sm">${esc(a.contact.title)}</div></td><td>${esc(first(USERS[a.owner].name))}</td><td>${stateBadge(a.campState)}</td></tr>`).join('')}</tbody></table></div>` : ''}
          </div>
          <div class="ccard-f" style="padding:12px 16px">${campActions(c)}</div>
        </div>
      </div>`;
  }
  function campActions(c) {
    const done = S.camp[c.id];
    if (c.status === 'Running') return isMgr ? '<button class="btn" onclick="App.toast(\'Paused (mock)\')">Pause</button><button class="btn pri" onclick="App.seqSave(\'' + c.id + '\')">Save sequence changes</button>' : '<button class="btn" onclick="App.toast(\'Your accounts were taken out (mock)\')">Take my accounts out</button><button class="btn pri" onclick="App.seqSave(\'' + c.id + '\')">Suggest these changes to Pavan</button>';
    if (c.status === 'Completed') return '<span class="muted" style="font-size:12px">Completed. Its sequence is now a proven structure for similar segments.</span>';
    if (done === 'Confirmed') return '<span class="badge b-pos">Confirmed · touch 1 goes out tomorrow 09:00</span>';
    if (isMgr) return `<button class="btn pri" onclick="App.confirmCampaign('${c.id}')">Confirm and schedule</button><button class="btn" onclick="App.toast('Each account gets its own next best action instead (mock)')">Send as separate actions</button>`;
    if (done === 'Sent for confirmation') return '<span class="badge b-ter">Sent to Pavan to confirm</span>';
    return c.status === 'Draft' ? `<button class="btn pri" onclick="App.sendForConfirm('${c.id}')">Send to Pavan to confirm</button><span class="muted" style="font-size:12px">Your edits are saved with it.</span>` : '<span class="muted" style="font-size:12px">Pavan confirms campaigns. You can edit the touches for your accounts.</span>';
  }
  function touchEditor(c, t, i, n) {
    if (locked(c, t)) return `<div class="tedit locked"><div class="tedit-h">${chIc(t.ch)}<b>Touch ${i + 1} · Day ${t.day}</b><span>${t.ch} · ${esc(t.fmt)}</span><span class="badge b-pos nodot" style="margin-left:auto">${esc(t.state)}</span></div><div class="tedit-t">${esc(t.t)}</div></div>`;
    const id = `${c.id}-${i}`;
    return `<div class="tedit">
      <div class="tedit-h">${chIc(t.ch)}<b>Touch ${i + 1}</b>
        <label class="sr" for="day-${id}">Day</label><span class="muted" style="font-size:12px">Day</span><input id="day-${id}" type="number" min="0" max="60" value="${t.day}" onchange="App.seqEdit('${c.id}',${i},'day',this.value)">
        <label class="sr" for="ch-${id}">Channel</label><select id="ch-${id}" class="sel" onchange="App.seqEdit('${c.id}',${i},'ch',this.value)">${['Email', 'LinkedIn'].map(x => `<option ${t.ch === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <label class="sr" for="fmt-${id}">Format</label><select id="fmt-${id}" class="sel" onchange="App.seqEdit('${c.id}',${i},'fmt',this.value)">${FORMATS[t.ch].map(x => `<option ${t.fmt === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <span class="tedit-tools"><button class="ic-btn" title="Move up" ${i === 0 ? 'disabled' : ''} onclick="App.seqMove('${c.id}',${i},-1)">${ic('upa', 14)}</button><button class="ic-btn" title="Move down" ${i === n - 1 ? 'disabled' : ''} onclick="App.seqMove('${c.id}',${i},1)">${ic('downa', 14)}</button><button class="ic-btn" title="Remove touch" onclick="App.seqRemove('${c.id}',${i})">${ic('trash', 14)}</button></span>
      </div>
      ${t.ch === 'Email' ? `<label class="sr" for="subj-${id}">Subject</label><input class="edit" id="subj-${id}" value="${esc(t.subject || '')}" placeholder="Subject" onchange="App.seqEdit('${c.id}',${i},'subject',this.value)" style="margin-bottom:6px">` : ''}
      <label class="sr" for="msg-${id}">Message</label><textarea class="edit" id="msg-${id}" style="min-height:64px" onchange="App.seqEdit('${c.id}',${i},'t',this.value)">${esc(t.t)}</textarea>
      <div class="tedit-f"><button class="chip" onclick="App.seqRewrite('${c.id}',${i})">${ic('spark', 12)} Rewrite with AI</button>${t.ch === 'LinkedIn' && t.fmt === 'Connection request' ? '<span class="muted" style="font-size:11px">LinkedIn notes are limited to 300 characters</span>' : ''}<span class="muted" style="font-size:11px;margin-left:auto">${esc(t.state || 'Not started')}</span></div>
    </div>`;
  }

  /* Approvals */
  function renderApprovals() {
    const tabs = isMgr ? [['needs', 'Needs me'], ['team', 'Whole team'], ['done', 'Decided']] : [['todo', 'To do'], ['waiting', 'With Pavan'], ['done', 'Done']];
    const items = apprItems(apprTab);
    const readyIds = items.filter(a => !a.nba.reason && !S.decisions[a.id]).map(a => a.id);
    const cv = canvasFrame('Approvals', isMgr ? 'Your team\'s items that need a person. Sensitive messages and campaigns need you; you can step in on any rep\'s item.' : 'Only the items that need you. Everything else went ahead on its own because every check passed.');
    cv.innerHTML = `
      <div class="toolbar"><div class="seg">${tabs.map(([k, l]) => `<button class="${apprTab === k ? 'on' : ''}" onclick="App.setApprTab('${k}')">${l} (${apprItems(k).length})</button>`).join('')}</div>
        ${isMgr && apprTab === 'team' ? `<label class="sr" for="repSel">Rep</label><select class="sel" id="repSel" onchange="App.setApprRep(this.value)"><option value="all">All reps</option>${REPS.map(r => `<option value="${r}" ${apprRep === r ? 'selected' : ''}>${USERS[r].name}</option>`).join('')}</select>` : ''}
        ${readyIds.length ? `<button class="btn pri sm" style="margin-left:auto" onclick="App.approveAll()">Approve ${readyIds.length} ready</button>` : ''}</div>
      ${isMgr && apprTab === 'needs' ? CAMPAIGNS.filter(c => (c.status === 'Ready to confirm' || S.camp[c.id] === 'Sent for confirmation') && S.camp[c.id] !== 'Confirmed').map(c => `<div class="card" style="margin-bottom:10px"><div class="card-b" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="badge b-ter">Campaign</span><div class="grow" style="min-width:200px"><b>${esc(c.name)}</b><div class="sm muted" style="font-size:12px">${c.accounts.length} accounts · ${seqOf(c).length} touches · email and LinkedIn</div></div><button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm</button><button class="btn sm" onclick="App.goCampaign('${c.id}')">Review sequence</button></div></div>`).join('') : ''}
      <div class="card tbl-wrap">${items.length ? `<table class="tbl"><thead><tr><th>Person · account</th><th>Next best action</th><th>Segment</th><th>Why it's here</th>${isMgr ? '<th>Rep</th>' : ''}<th>Due</th><th></th></tr></thead><tbody>
        ${items.map(a => { const d = S.decisions[a.id]; return `<tr class="row-link" onclick="App.openRecord('${a.id}','next')"><td><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.name)} · ${esc(a.country)}</div></td><td>${esc(a.nba.action)}<div class="sm">${a.nba.channel} · runner-up: ${esc(a.nba.runnerUp)}</div></td><td><span class="seg-link" onclick="event.stopPropagation();App.openSegment('${a.seg}')">${esc(a.segment)}</span></td><td><span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span>${a.nba.reasonNote ? `<div class="sm" style="max-width:240px;white-space:normal;margin-top:3px">${esc(a.nba.reasonNote)}</div>` : ''}</td>${isMgr ? `<td>${esc(first(USERS[a.owner].name))}</td>` : ''}<td style="white-space:nowrap">${esc(a.nba.due)}</td>
          <td style="white-space:nowrap" onclick="event.stopPropagation()">${d ? `<span class="badge b-grey nodot">${decLabel(d)}</span>` : `${!a.nba.reason || (isMgr && a.nba.sensitive) ? `<button class="btn sm pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : 'Approve'}</button> ` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','next')">Review</button>`}</td></tr>`; }).join('')}
        </tbody></table>` : `<div class="empty">Nothing here. ${apprTab === 'done' ? 'Decisions you make show up here.' : 'You\'re all caught up.'}</div>`}</div>`;
  }

  /* Accounts */
  function renderAccounts() {
    const q = ($('accSearch') && $('accSearch').value || '').toLowerCase();
    const list = ACCOUNTS.filter(a => isMgr || scope === 'team' || a.owner === me.id).filter(a => !q || (a.name + a.contact.name + a.country + a.segment).toLowerCase().includes(q));
    let body;
    if (accView === 'ranked') {
      body = `<table class="tbl"><thead><tr><th>#</th><th>Account</th><th>Tier</th><th>Fit</th><th>Timing</th><th>Score</th><th>Why now</th><th>Segment</th>${isMgr || scope === 'team' ? '<th>Owner</th>' : ''}<th>Status</th></tr></thead><tbody>
        ${list.map((a, i) => `<tr class="row-link" onclick="App.openRecord('${a.id}','why')"><td class="mono">${i + 1}</td><td><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.industry)} · ${esc(a.country)}</div></td><td>${tierBadge(a.tier)}</td><td class="mono">${a.fit}</td><td class="mono">${a.timing}</td><td class="mono" style="font-weight:600">${fmt(a.score)}</td><td>${a.whyNow ? `${esc(a.whyNow.type)}<div class="sm">${ago(a.whyNow.age)}</div>` : '<span class="muted">No live signal</span>'}</td><td>${a.seg ? `<span class="seg-link" onclick="event.stopPropagation();App.openSegment('${a.seg}')">${esc(a.segment)}</span>` : '—'}</td>${isMgr || scope === 'team' ? `<td>${esc(first(USERS[a.owner].name))}</td>` : ''}<td>${stepBadge(a)}</td></tr>`).join('')}</tbody></table>`;
    } else {
      const people = list.map(a => ({ name: a.contact.name, title: a.contact.title, account: a.name, country: a.country, idTier: a.contact.idTier, crm: 'In your book', note: '', id: a.id })).concat(PROSPECTS_FOUND.filter(p => !q || (p.name + p.account).toLowerCase().includes(q)).filter(p => /Held|Name-only/.test(p.crm)));
      body = `<table class="tbl"><thead><tr><th>Person</th><th>Account</th><th>Identity</th><th>CRM check</th><th>Note</th></tr></thead><tbody>
        ${people.map(p => `<tr class="${p.id ? 'row-link' : ''}" ${p.id ? `onclick="App.openRecord('${p.id}','why')"` : ''}><td><div class="nm">${esc(p.name)}</div><div class="sm">${esc(p.title)}</div></td><td>${esc(p.account)}<div class="sm">${esc(p.country)}</div></td><td>${idBadge(p.idTier)}</td><td>${/Held|Name-only/.test(p.crm) ? `<span class="badge b-neg">${esc(p.crm)}</span>` : `<span class="badge b-grey nodot">${esc(p.crm)}</span>`}</td><td class="sm" style="white-space:normal">${esc(p.note)}</td></tr>`).join('')}</tbody></table>`;
    }
    const cv = canvasFrame('Accounts', 'Every account and person, ranked. Prospecting and scoring are done for you; open a row to see why.');
    cv.innerHTML = `
      <div class="toolbar"><div class="seg">${[['ranked', 'Ranked'], ['prospects', 'People']].map(([k, l]) => `<button class="${accView === k ? 'on' : ''}" onclick="App.setAccView('${k}')">${l}</button>`).join('')}</div>
        ${isMgr ? '' : `<div class="seg">${[['mine', 'Mine'], ['team', 'Team']].map(([k, l]) => `<button class="${scope === k ? 'on' : ''}" onclick="App.setScope('${k}')">${l}</button>`).join('')}</div>`}
        <div class="search">${ic('search', 14)}<label class="sr" for="accSearch">Search</label><input id="accSearch" placeholder="Search accounts, people, segments" value="${esc(q)}" oninput="App.refreshAccounts()"></div>
        <span class="muted" style="font-size:12px;margin-left:auto">${list.length} accounts · Score = Fit × Timing</span></div>
      <div class="card tbl-wrap">${body}</div>`;
    const s = $('accSearch'); if (q) { s.focus(); s.setSelectionRange(q.length, q.length); }
  }
  function stepBadge(a) {
    if (a.campaign) return stateBadge(a.campState);
    if (!a.nba) return '<span class="badge b-grey nodot">Waiting for a signal</span>';
    const d = S.decisions[a.id];
    if (d) return `<span class="badge b-grey nodot">${decLabel(d)}</span>`;
    if (a.nba.status === 'auto') return '<span class="badge b-pos">Went ahead</span>';
    if (a.nba.status === 'sent') return `<span class="badge b-sec">${esc(a.outcome || 'Sent')}</span>`;
    return `<span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a) === 'Ready' ? 'Ready for OK' : reasonOf(a)}</span>`;
  }

  /* Content studio (from the POC: writing in the client's brand voice, with checks and sign-off) */
  const CONTENT_TYPES = ['LinkedIn post', 'Blog', 'Whitepaper', 'Case study', 'Email template'];
  function writeContent(type, segId, brief) {
    const s = segOf(segId);
    const title = { 'LinkedIn post': `${s.trigger}: what peers do in the first 90 days`, Blog: `${s.name}: a practical guide for plant leaders`, Whitepaper: `${s.name}: risks, costs and a readiness checklist`, 'Case study': `How a peer site handled ${s.trigger.toLowerCase()}`, 'Email template': `${s.name}: first touch` }[type];
    const body = type === 'LinkedIn post'
      ? `Three things we see at every site preparing for a ${s.trigger.toLowerCase()}:\n\n1. The plan is set before the instrument health is known.\n2. Spares and specialists are booked late.\n3. Restart takes longer than the shutdown itself.\n\nThe sites that do best start with a two-week health baseline. Happy to share the checklist we use.`
      : `${title}\n\nWho this is for: ${s.name.toLowerCase()} accounts in South-East Asia.\n\n1. What is changing and why it matters now\n2. Where peers lost time and money\n3. A readiness checklist\n4. How Client helps (approved claims only)\n\n[Full draft continues: about ${type === 'Whitepaper' ? '2,400' : '900'} words]`;
    return { type, title, body, seg: segId, brief };
  }
  function renderStudio() {
    const all = S.content.concat(CONTENT);
    const w = S.written;
    const cv = canvasFrame('Content studio', 'Write posts, blogs, whitepapers and case studies in the client\'s brand voice. Checks run as you write; sensitive pieces go for sign-off.');
    cv.innerHTML = `<div class="studio">
      <div class="card"><div class="card-h"><span class="lbl">Write</span></div><div class="card-b">
        <div class="field"><label for="cType">Type</label><select id="cType">${CONTENT_TYPES.map(t => `<option ${w && w.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label for="cSeg">Audience</label><select id="cSeg">${SEGMENTS.map(s => `<option value="${s.id}" ${w && w.seg === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="cBrief">What should it say?</label><textarea id="cBrief" rows="3">${esc(w ? w.brief : 'Help plant leaders get ready for a turnaround: the three risks, and a checklist.')}</textarea></div>
        <button class="btn pri" onclick="App.writeIt()">${ic('spark', 14)} Write it</button>
        ${w ? `<div class="sec-t" style="margin-top:16px">Draft</div><label class="sr" for="cTitle">Title</label><input class="edit" id="cTitle" value="${esc(w.title)}" style="margin:10px 0 6px"><label class="sr" for="cBody">Body</label><textarea class="edit" id="cBody" style="min-height:220px">${esc(w.body)}</textarea>
          <div class="checks"><span class="badge b-pos">Brand voice</span><span class="badge b-pos">Approved claims only</span><span class="badge b-pos">No banned words</span>${w.type === 'Whitepaper' ? '<span class="badge b-warn">Whitepapers download as Word</span>' : ''}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px"><button class="btn pri sm" onclick="App.saveContent('Sent for sign-off')">Send for sign-off</button><button class="btn sm" onclick="App.saveContent('Draft')">Save draft</button><button class="btn sm" onclick="App.useInCampaign()">Use in a campaign touch</button><button class="btn sm" onclick="App.copyContent()">Copy text</button></div>` : ''}
      </div></div>
      <div class="card"><div class="card-h"><span class="lbl">Your content and what it led to</span></div><div class="card-b" style="padding:0">
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Piece</th><th>Status</th><th>What it led to</th></tr></thead><tbody>
        ${all.map(k => `<tr><td><div class="nm">${esc(k.title)}</div><div class="sm">${esc(k.type)} · ${esc(segOf(k.seg) ? segOf(k.seg).name : '')} · ${esc(k.by)}</div></td><td><span class="badge ${k.status === 'Approved' || k.status === 'In Content library' ? 'b-pos' : k.status === 'Sent for sign-off' ? 'b-ter' : 'b-grey'} nodot">${esc(k.status)}</span></td><td class="sm" style="white-space:normal">${esc(k.led)}</td></tr>`).join('')}
        </tbody></table></div></div></div>
    </div>`;
  }

  /* Account record, opened beside the chat */
  function renderRecord() {
    const a = acct(recId), o = USERS[a.owner];
    const tabs = [['next', a.campaign ? 'Campaign' : 'Next action'], ['why', 'Why now'], ['activity', 'Activity'], ['notes', 'Notes']];
    const cv = canvasFrame(esc(a.name), `${a.seg ? `<a href="#segments" onclick="App.openSegment('${a.seg}');return false">${esc(a.segment)}</a> · ` : ''}${esc(a.industry)} · ${esc(a.country)} · owner ${esc(o.name)}`);
    cv.classList.add('rec-cv');
    cv.innerHTML = `<div class="rec-body">
        <div class="rec-left">
          <div class="who"><span class="av" style="background:${o.color}">${initials(a.contact.name)}</span><div><div class="nm">${esc(a.contact.name)}</div><div class="tl">${esc(a.contact.title)}</div><div class="tl">${a.campaign ? stateBadge(a.campState) : a.nba ? `<span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span>` : ''} ${tierBadge(a.tier)}</div></div></div>
          <div class="qa" style="grid-template-columns:repeat(4,1fr)"><button title="Email" onclick="App.toast('Email: placeholder until the inbox is connected')">${ic('mail')}</button><button title="LinkedIn" onclick="App.toast('LinkedIn: placeholder')">${ic('li')}</button><button title="Add a task" onclick="App.toast('Task added (mock)')">${ic('task')}</button><button title="Ask about this account" onclick="App.focusComposer('')">${ic('spark')}</button></div>
          <div class="sec-t">Person</div>
          <dl class="kv"><dt>Email</dt><dd>${esc(a.contact.email)}</dd><dt>LinkedIn</dt><dd>${a.contact.linkedin ? 'Profile matched' : '—'}</dd><dt>Identity</dt><dd>${idBadge(a.contact.idTier)}<div class="muted" style="font-size:11px;margin-top:3px">${ID_TIER[a.contact.idTier][2]}</div></dd><dt>Owner</dt><dd>${esc(o.name)}</dd></dl>
          <div class="sec-t">Company</div>
          <dl class="kv"><dt>Industry</dt><dd>${esc(a.industry)}</dd><dt>Size</dt><dd>${esc(a.size)}</dd><dt>Segment</dt><dd>${a.seg ? esc(a.segment) : '—'}</dd><dt>Framing</dt><dd>${esc(a.motivation)}</dd>${a.fromList ? '<dt>Found in</dt><dd>Lookalikes of my last 10 wins</dd>' : ''}</dl>
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
      return `<div class="formula"><div class="box"><div class="v">${a.fit}</div><div class="k">Fit: how well they match</div></div><span class="op">×</span><div class="box"><div class="v">${a.timing}</div><div class="k">Timing: what changed</div></div><span class="op">=</span><div class="box hl"><div class="v">${fmt(a.score)}</div><div class="k">Score · #${a.rank} · tier ${a.tier}</div></div></div>
        ${sig.length ? `<div class="sec-t">Signals, strongest first</div>${sig.map((x, i) => `<div class="sig"><div><div style="font-weight:600">${esc(x.type)}</div><div class="muted" style="font-size:11.5px">${esc(x.text)} · ${esc(x.source)}</div></div><span class="badge ${x.tier === 1 ? 'b-pos' : x.tier === 2 ? 'b-sec' : 'b-grey'} nodot">Tier ${x.tier}</span><div><div class="bar"><i style="width:${Math.min(100, x.weight)}%"></i></div><div class="muted" style="font-size:10.5px;margin-top:3px">${ago(x.age)}</div></div><span class="mono" style="text-align:right">${i ? (i === 1 ? '½×' : '¼×') : ''}${x.weight}</span></div>`).join('')}
          <div class="placeholder-note" style="margin-top:12px">Timing = ${sig.map((x, i) => (i ? (i === 1 ? '½ × ' : '¼ × ') : '') + x.weight).join(' + ')} = <b>${a.timing}</b>. Fit and timing multiply, so a perfect fit with no live signal scores zero.</div>`
          : '<div class="placeholder-note">No live signal, so the score is zero and nothing is suggested. The account stays watched.</div>'}`;
    }
    if (recTab === 'activity') {
      const out = S.outcomes[a.id];
      return `<div class="sec-t">What happened</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px">${['Sent', 'Replied', 'Meeting booked', 'No response'].map(x => `<button class="chip" style="${out === x ? 'border-color:var(--brand);color:var(--brand-dk);background:var(--brand-lt)' : ''}" onclick="App.logOutcome('${a.id}','${x}')">${x}</button>`).join('')}</div>
        <div class="muted" style="font-size:11.5px;margin-bottom:12px">Every outcome, including no response, goes back into the learning loop.</div>
        <div class="sec-t">Timeline</div>
        <div class="timeline">${a.activity.slice().reverse().map(x => `<div class="tl-row static"><span class="ic k-${x.k}">${ic(ACT_IC[x.k] || 'clock', 13)}</span><div class="grow"><div class="nm">${esc(x.t)}</div><div class="sm">${esc(x.d)}</div></div><span class="when">${esc(x.when)}</span></div>`).join('')}</div>`;
    }
    if (recTab === 'notes') {
      return `<label class="sr" for="noteBox">Note</label><textarea class="edit" style="min-height:90px" id="noteBox" placeholder="Add a note…"></textarea><div style="margin:8px 0 16px"><button class="btn pri sm" onclick="App.addNote('${a.id}')">Save note</button></div>
        ${(S.notes[a.id] || []).map(n => `<div class="tl-row static"><span class="ic">${ic('book', 13)}</span><div class="grow"><div>${esc(n.t)}</div><div class="sm">${esc(me.name)} · ${esc(n.d)}</div></div></div>`).join('') || '<div class="empty">No notes yet.</div>'}`;
    }
    if (a.campaign) {
      const c = campOf(a.campaign);
      return `<div class="ready"><div class="grow"><b>In campaign: ${esc(c.name)}.</b> This account follows the campaign's touches instead of its own action. ${esc(a.campState)}.</div><button class="btn pri" onclick="App.goCampaign('${c.id}')">Open sequence</button></div>
        <div class="sec-t">Touches</div>${seqOf(c).map((t, i) => `<div class="touch"><div class="day">Day ${t.day}</div><div><div style="font-size:12.5px;font-weight:600">${chIc(t.ch)} Touch ${i + 1} · ${t.ch} · ${esc(t.fmt)} <span class="badge ${/Sent|Done/.test(t.state) ? 'b-pos' : 'b-grey'} nodot">${esc(t.state || 'Not started')}</span></div><div style="font-size:12.5px;color:var(--i2);margin-top:2px">${esc(t.t)}</div></div></div>`).join('')}
        <div style="margin-top:14px;display:flex;gap:8px"><button class="btn" onclick="App.toast('Taken out of the campaign; it gets its own next action instead (mock)')">Take out of campaign</button></div>`;
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
        <button class="opt ${d.option === 'rec' ? 'on' : ''}" onclick="App.setOption('${a.id}','rec')"><div class="h">${esc(a.nba.action)}<span class="badge b-brand nodot">Recommended</span></div><div class="d">${a.nba.confidence} confidence · ${a.nba.proven ? 'proven structure for ' + esc(a.segment) : 'provisional structure (first try)'}</div></button>
        <button class="opt ${d.option === 'run' ? 'on' : ''}" onclick="App.setOption('${a.id}','run')"><div class="h">${esc(a.nba.runnerUp)}<span class="badge b-grey nodot">Runner-up</span></div><div class="d">The next best option.</div></button>
        <button class="opt ${d.option === 'own' ? 'on' : ''}" onclick="App.setOption('${a.id}','own')"><div class="h">Write your own<span class="badge b-grey nodot">You decide</span></div><div class="d">Your choice is logged so the system learns from it.</div></button></div>
      <div class="sec-t" style="margin-top:8px">Message</div>
      <div style="display:flex;gap:8px;margin:10px 0 8px;align-items:center;flex-wrap:wrap"><label class="sr" for="chanSel">Channel</label><select class="sel" id="chanSel" onchange="App.setChannel('${a.id}',this.value)">${['Email', 'LinkedIn'].map(c => `<option ${d.channel === c ? 'selected' : ''}>${c}</option>`).join('')}</select><span class="muted" style="font-size:11.5px">Chosen from verified contact data, warm path and what worked before</span></div>
      ${d.channel === 'Email' ? `<label class="sr" for="dSubj">Subject</label><input class="edit" id="dSubj" value="${esc(d.subject)}" onchange="App.saveDraft('${a.id}')" style="margin-bottom:8px">` : ''}
      <label class="sr" for="dBody">Message</label><textarea class="edit" id="dBody" onchange="App.saveDraft('${a.id}')">${esc(d.body)}</textarea>
      <div class="checks"><span class="badge b-pos">Brand voice</span><span class="badge b-pos">Approved claims only</span><span class="badge b-pos">No banned words</span><span class="badge b-pos">Not in another sequence</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px"><span class="muted" style="font-size:11.5px;align-self:center">Ask AI:</span>${['Make it shorter', 'Use cost framing', 'More formal', 'Friendlier'].map(x => `<button class="chip" onclick="App.ask('${x}')">${x}</button>`).join('')}</div>
      ${dec || /auto|sent/.test(a.nba.status) ? '' : `<div style="display:flex;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border);flex-wrap:wrap"><button class="btn pri" onclick="App.saveDraft('${a.id}');App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : a.nba.sensitive ? 'Approve → to Pavan' : 'Approve'}</button>${isMgr && a.owner !== me.id ? `<button class="btn" onclick="App.decide('${a.id}','sent-back')">Send back to ${esc(first(USERS[a.owner].name))}</button>` : ''}<button class="btn" onclick="App.decide('${a.id}','skipped')">Skip</button></div>`}`;
  }

  /* ─── Actions ─── */
  function decide(id, d, msg) { S.decisions[id] = d; save(); toast(msg || decLabel(d)); renderAll(); }
  function approve(id) {
    const a = acct(id);
    if (a.nba.sensitive && !isMgr) return decide(id, 'with-manager', 'Approved. Sent to Pavan for sign-off because it\'s sensitive.');
    decide(id, isMgr && a.nba.sensitive ? 'signed' : 'approved', `Approved: ${a.name}. Scheduled for the next send window (placeholder).`);
  }
  function approveAll(silent) {
    apprItems(isMgr ? 'team' : 'todo').filter(a => !a.nba.reason && !S.decisions[a.id]).forEach(a => { S.decisions[a.id] = 'approved'; });
    save(); if (!silent) { toast('Approved all ready items. Scheduled for the next send window (placeholder).'); renderAll(); }
  }
  function goCampaign(id) { campSel = id; go('campaigns'); }
  function openRecord(id, tab) { recId = id; recTab = tab || 'next'; ctx = id; if (!acct(id).nba && !acct(id).campaign && recTab === 'next') recTab = 'why'; renderAll(); }
  function editSeq(cid, fn) { const c = campOf(cid); const sq = seqOf(c).map(t => Object.assign({}, t)); fn(sq, c); S.seq[cid] = sq; save(); if (view() === 'campaigns' && !recId) renderCampaigns(); }
  let lastKey = null;
  function renderAll() {
    const v = view(), key = (recId ? 'rec:' + recId : v || 'today') + (listSel || '') + JSON.stringify(segPath);
    const open = !!(v || recId);
    $('ws').classList.toggle('canvas-open', open);
    renderNav(); renderChat();
    if (recId) renderRecord();
    else if (v) ({ lists: renderLists, accounts: renderAccounts, segments: renderSegments, campaigns: renderCampaigns, approvals: renderApprovals, studio: renderStudio })[v]();
    else renderToday();
    if (key !== lastKey) { const cv = $('cv'); if (cv) cv.scrollTop = 0; $('main').scrollTop = 0; lastKey = key; }
  }
  function openRuns() {
    const runs = SCHEDULED.concat(S.runs.map(r => Object.assign({ scope: 'Mine' }, r)));
    $('drawer').innerHTML = `
      <div class="drawer-h"><div class="t">Scheduled runs</div><button class="ic-btn" onclick="App.closeDrawer()" title="Close">${ic('x', 16)}</button></div>
      <div class="drawer-b">
        <p style="margin:0 0 14px;font-size:12.5px;color:var(--i2);line-height:1.5">How the work gets done before you arrive. Each run is a saved instruction on a timer; results land in Today's brief. ${isMgr ? 'Runs you create for the team apply to every rep.' : 'Team defaults are set by your admin; you can add your own.'}</p>
        ${runs.map(r => `<div class="run"><div class="h">${esc(r.name)}<span class="badge ${r.scope === 'Mine' ? 'b-brand' : 'b-grey'} nodot">${r.scope === 'Mine' ? 'Yours' : 'Set by admin'}</span></div><div class="p">${esc(r.prompt)}</div><div class="m">${ic('clock', 12)} ${esc(r.freq)} · next ${esc(r.next)}</div></div>`).join('')}
        <div class="sec-t" style="margin:18px 0 12px">Create a run</div>
        <div class="field"><label for="runName">Name</label><input id="runName" value="Research new job postings"></div>
        <div class="field"><label for="runPrompt">What should it do?</label><textarea id="runPrompt" rows="3">Show me accounts that posted reliability or control-systems roles in the last 30 days and prepare next actions for the new leaders.</textarea></div>
        <div class="field"><label>When</label><div class="days">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `<button class="${i === 0 ? 'on' : ''}" onclick="this.classList.toggle('on')">${d}</button>`).join('')}</div></div>
      </div>
      <div class="drawer-f"><button class="btn" onclick="App.closeDrawer();App.ask(document.getElementById('runPrompt').value)">Try it in chat</button><button class="btn pri" onclick="App.createRun()">Create</button></div>`;
    $('drawer').classList.add('open'); $('scrim').classList.add('open');
  }

  window.App = {
    ask, toast, go, closeView, openRecord, approve, approveAll: () => approveAll(false), openRuns, goCampaign, decide,
    send() { const el = $('composer'); const v = el.value; el.value = ''; ask(v); },
    key(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); App.send(); } },
    focusComposer(v) { const el = $('composer'); el.focus(); if (v) el.value = v; },
    setCtx(id) { ctx = id; $('ctx').innerHTML = ctxChip(); },
    switchUser(id) { store.set('dmock_user', id); location.hash = ''; location.reload(); },
    signOut() { try { localStorage.removeItem('dmock_user'); } catch (e) { /* ignore */ } },
    newChat() {
      const id = 'n' + Date.now();
      S.chats.splice(1, 0, { id, title: 'New chat', when: 'Now', thread: [{ who: 'ai', kind: 'text', html: 'New chat. What should I work on? I can find prospects, score them, build micro-segments, prepare next actions and campaigns, track them, and tell you what the system learned.' }] });
      S.cur = id; ctx = null; save(); renderAll(); setTimeout(() => $('composer').focus(), 0);
    },
    openChat(id) { S.cur = id; save(); renderAll(); },
    doneTodo(id) { S.todosDone[id] = !S.todosDone[id]; save(); renderAll(); },
    runTodo(id) { const t = todos().find(x => x.id === id); if (t) t.go(); },
    goTo(target) { const [k, v] = target.split(':'); if (k === 'campaign') goCampaign(v); else if (k === 'record') openRecord(v, 'next'); else if (k === 'ask') ask(v); },
    repApprovals(r) { apprTab = 'team'; apprRep = r; go('approvals'); },
    setApprTab(k) { apprTab = k; renderAll(); },
    setApprRep(r) { apprRep = r; renderAll(); },
    setAccView(k) { accView = k; renderAll(); },
    setScope(k) { scope = k; renderAll(); },
    refreshAccounts: renderAccounts,
    goAccounts(v) { accView = v; go('accounts'); },
    openList(id) { listSel = id; go('lists'); },
    openSegment(id) { segPath = { seg: id, acc: null, act: null }; go('segments'); },
    segAccount(id) { segPath.acc = id; segPath.act = null; renderAll(); },
    segActivity(i) { segPath.act = i; renderAll(); },
    segNav(level) { if (level === 0) segPath = { seg: null, acc: null, act: null }; if (level === 1) segPath = { seg: segPath.seg, acc: null, act: null }; if (level === 2) segPath.act = null; go('segments'); },
    saveSegList(segId) { const s = segOf(segId); addList(s.name + ' · 27 Oct', 'Segment', 'Saved from Segments'); S.lists[0].seg = segId; save(); toast('Saved to Lists'); },
    confirmCampaign(id) { S.camp[id] = 'Confirmed'; save(); toast('Campaign confirmed. Touch 1 goes out tomorrow 09:00 (placeholder: nothing is sent).'); renderAll(); },
    sendForConfirm(id) { S.camp[id] = 'Sent for confirmation'; save(); toast('Sent to Pavan to confirm, with your edits.'); renderAll(); },
    handleReply(id, msg) { S.handled[id] = true; save(); toast(msg || 'Reply sent (placeholder). The sequence for this account is stopped.'); renderAll(); },
    seqEdit(cid, i, f, v) { editSeq(cid, sq => { sq[i][f] = f === 'day' ? Math.max(0, parseInt(v, 10) || 0) : v; if (f === 'ch') { sq[i].fmt = FORMATS[v][0]; if (v === 'Email' && !sq[i].subject) sq[i].subject = campOf(cid).name; } if (f === 'day') sq.sort((p, q) => p.day - q.day); }); },
    seqMove(cid, i, d) { editSeq(cid, sq => { const j = i + d; if (j < 0 || j >= sq.length || /Sent|Done/.test(sq[j].state || '')) return; [sq[i], sq[j]] = [sq[j], sq[i]]; const days = sq.map(t => t.day).sort((p, q) => p - q); sq.forEach((t, k) => { t.day = days[k]; }); }); },
    seqRemove(cid, i) { editSeq(cid, sq => { sq.splice(i, 1); }); toast('Touch removed'); },
    seqAdd(cid, ch) { editSeq(cid, (sq, c) => { const last = sq.length ? sq[sq.length - 1].day : 0; sq.push({ day: last + 4, ch, fmt: FORMATS[ch][ch === 'LinkedIn' ? 1 : 0], subject: ch === 'Email' ? c.name + ': a last note' : '', t: ch === 'LinkedIn' ? 'Short follow-up on LinkedIn, referencing the earlier touches.' : 'A final, short note: offer a 20-minute call and make it easy to say no.', state: '' }); }); toast(`${ch} touch added at the end`); },
    seqRewrite(cid, i) { editSeq(cid, sq => { const t = sq[i]; t.t = t.ch === 'LinkedIn' ? `Hi {first_name}, saw the news at {company}. ${t.t.split('.')[0]}. Worth a quick chat?` : `Hi {first_name},\n\n${t.t}\n\nWould 20 minutes next week help?\n\nBest,\n{sender}`; }); toast('Rewritten. Brand and claim checks still pass'); },
    seqReset(cid) { delete S.seq[cid]; save(); renderCampaigns(); toast('Back to the AI draft'); },
    seqSave() { toast(isMgr ? 'Sequence saved. Future touches use the new version.' : 'Suggested to Pavan with your changes.'); },
    writeIt() { S.written = writeContent($('cType').value, $('cSeg').value, $('cBrief').value); save(); renderAll(); toast('Draft written. Checks pass'); },
    saveContent(status) { const w = S.written; if (!w) return; S.content.unshift({ id: 'u' + Date.now(), type: w.type, title: $('cTitle').value, status, seg: w.seg, led: status === 'Sent for sign-off' ? 'Waiting for Pavan' : '—', by: first(me.name) }); S.written = null; save(); renderAll(); toast(status === 'Draft' ? 'Saved as a draft' : 'Sent for sign-off'); },
    useInCampaign() { const w = S.written; editSeq('c5', sq => sq.push({ day: (sq.length ? sq[sq.length - 1].day : 0) + 4, ch: w.type === 'LinkedIn post' ? 'LinkedIn' : 'Email', fmt: w.type === 'LinkedIn post' ? 'Carousel post' : w.type === 'Whitepaper' ? 'Whitepaper' : 'Case study', subject: w.title, t: `Share: ${w.title}`, state: '' })); campSel = 'c5'; go('campaigns'); toast('Added as a touch to Control-systems hiring surge'); },
    copyContent() { const v = $('cBody').value; try { navigator.clipboard.writeText(v).then(() => toast('Copied'), () => { $('cBody').select(); toast('Selected. Press Ctrl+C to copy'); }); } catch (e) { $('cBody').select(); toast('Selected. Press Ctrl+C to copy'); } },
    setRecTab(k) { recTab = k; renderAll(); },
    setOption(id, o) { S.drafts[id] = Object.assign(draftOf(acct(id)), { option: o }); if (o === 'own') S.drafts[id].body = ''; save(); renderAll(); },
    setChannel(id, c) { S.drafts[id] = Object.assign(draftOf(acct(id)), { channel: c }); save(); renderAll(); },
    saveDraft(id) { const d = draftOf(acct(id)); if ($('dSubj')) d.subject = $('dSubj').value; if ($('dBody')) d.body = $('dBody').value; S.drafts[id] = d; save(); },
    undo(id) { delete S.decisions[id]; save(); renderAll(); },
    logOutcome(id, o) { S.outcomes[id] = o; save(); toast(`Logged: ${o}. It feeds the learning loop.`); renderAll(); },
    addNote(id) { const v = $('noteBox').value.trim(); if (!v) return; (S.notes[id] = S.notes[id] || []).unshift({ t: v, d: 'just now' }); save(); renderAll(); },
    useRunnerUp(id) { ctx = id; ask('Use the runner-up'); },
    closeDrawer() { $('drawer').classList.remove('open'); $('scrim').classList.remove('open'); },
    createRun() { S.runs.push({ name: $('runName').value, prompt: $('runPrompt').value, freq: 'Every Mon at 07:00', next: 'Mon 2 Nov 07:00' }); save(); toast('Scheduled run created'); openRuns(); renderNav(); },
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('drawer').classList.contains('open')) App.closeDrawer(); else if (recId || view()) closeView(); } });
  renderAll();
})();
