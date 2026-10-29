/* Demand AI production mock: the sales workspace (rep and manager).
   Every module is chat-based. Today: the chat in the middle, the to-do list beside it. Accounts, Segments, Campaigns and
   Approvals: the module's own chat on the left and its view on the right. Content studio: a "what should we write?" start
   page, then a chat beside the document. Results in any chat (tables, sequences) come back as cards that open in a canvas
   beside the chat. Replies are scripted against mock-data.js. */
(function () {
  const { USERS, REPS, ACCOUNTS, SEGMENTS, LISTS, CONTENT, CAMPAIGNS, REPLIES, BLOCKERS, LEARNED, TEAM_STATS, decayed } = window.MOCK;

  /* ─── Session (storage can be blocked; the mock still works without it) ─── */
  const store = {
    get(k, s) { try { return (s ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } },
    set(k, v, s) { try { (s ? sessionStorage : localStorage).setItem(k, v); } catch (e) { /* not saved */ } },
  };
  let me = USERS[store.get('dmock_user') || 'sofia'] || USERS.sofia;
  if (me.role === 'admin') { location.href = 'admin/index.html'; return; }
  const isMgr = me.role === 'manager';
  const STATE_KEY = 'dmock_state_v10_' + me.id;
  let saved = {};
  try { saved = JSON.parse(store.get(STATE_KEY, true) || '{}'); } catch (e) { saved = {}; }
  const S = Object.assign({ chats: null, cur: 'home', mchat: {}, studio: { doc: null, thread: [] }, decisions: {}, todosDone: {}, notes: {}, outcomes: {}, drafts: {}, runs: [], camp: {}, handled: {}, lists: [], genLists: [], read: {}, archived: {}, pseq: {}, cop: {}, seq: {}, content: [], enrollOK: {}, starred: {}, today: null, auto: {}, skipR: {} }, saved);
  const save = () => store.set(STATE_KEY, JSON.stringify(S), true);
  /* Shared across sign-ins in this tab: what the manager assigns shows up for the rep */
  let shared = {};
  try { shared = JSON.parse(store.get('dmock_shared', true) || '{}'); } catch (e) { shared = {}; }
  shared = Object.assign({ assign: {}, tasks: [] }, shared);
  const saveShared = () => store.set('dmock_shared', JSON.stringify(shared), true);
  /* A next best action goes ahead on its own when it passes every check; only the ones that don't wait for a person */
  ACCOUNTS.forEach(a => { if (a.nba && a.nba.status === 'ready' && !a.nba.reason) { if (a.contact.idTier <= 2) a.nba.status = 'auto'; else Object.assign(a.nba, { status: 'review', reason: 'Identity unconfirmed', reasonNote: `The contact is identity tier ${a.contact.idTier}: not confirmed by a second provider.` }); } });
  Object.keys(shared.assign).forEach(id => { const a = ACCOUNTS.find(x => x.id === id); if (a) a.owner = shared.assign[id]; });
  const FIND_STEPS = () => ['Turned your request into an ICP filter: refining, petrochemicals and gas · SEA · 500+ staff · reliability, operations and I&amp;C leaders', 'Searched the primary contact provider, then the fallback for the misses', 'Cross-checked fallback hits and gave everyone an identity tier', 'Removed 4 existing customers and 3 accounts another rep owns (CRM, read-only)', 'Ranked by similarity to your last 10 wins'];
  if (!S.chats) {
    S.chats = [
      { id: 'red', title: 'Red accounts · week of 26 Oct', when: 'Mon', attn: true, readUpTo: 5, readAt: 'Mon 17:20', reminder: 'Today 09:00', notes: ['Cedar is the one to save'],
        obj: { total: 10, ids: ['cedar', 'sapphire', 'eastgate', 'meridian', 'kingfisher', 'aurora', 'ironwood', 'halcyon', 'tidewater', 'saltmarsh'], done: ['kingfisher', 'aurora', 'ironwood', 'halcyon', 'tidewater', 'saltmarsh'] },
        thread: [{ who: 'me', text: 'Let\'s get our 10 red accounts to a next step this week' }, { who: 'ai', kind: 'objective', at: 'Mon 14:05', done: ['saltmarsh', 'kingfisher', 'aurora'] },
          { who: 'me', text: 'Remind me tomorrow at 9 to pick up the rest. Note: Cedar is the one to save.' }, { who: 'ai', kind: 'reminder', when: 'Tue 09:00' }, { who: 'ai', kind: 'note', text: 'Cedar is the one to save' },
          { who: 'ai', kind: 'objCatchup' }] },
      { id: 'flow', title: 'Lookalikes of my last 10 wins', when: 'Mon', thread: [{ who: 'me', text: 'Find refiners and petrochem plants like my last 10 wins' }, { who: 'ai', kind: 'prospects', steps: FIND_STEPS() }] },
      { id: 'cedar', title: 'Cedar renewal prep', when: 'Fri', attn: !isMgr, attnText: 'Mei Tan opened your comparison twice', readUpTo: 2, readAt: 'Fri 16:10', thread: [{ who: 'me', text: 'What should I do with Cedar?' }, { who: 'ai', kind: 'nba', id: 'cedar' }, { who: 'ai', kind: 'text', html: 'Since Friday, <b>Mei Tan opened the migration-path comparison twice</b> and forwarded it to procurement. Now is the time to offer the 30-minute walkthrough. The draft is ready; it needs you because the warm path is weak. <br><button class="btn sm pri" style="margin-top:8px" onclick="App.openRecord(\'cedar\',\'engage\')">Review the draft</button>' }] },
    ];
    if (!isMgr) S.chats = S.chats.filter(c => !c.obj);
  }
  let navCol = false; try { navCol = localStorage.getItem('dmock_nav') === '1'; } catch (e) {}
  document.body.classList.toggle('nav-col', navCol);
  document.addEventListener('click', () => document.querySelectorAll('.dd.open').forEach(x => x.classList.remove('open')));
  /* Chat width: drag the edge between the chat and the view; double-click resets. Remembered per browser. */
  (function chatResize() {
    const setW = w => document.body.style.setProperty('--chat-w', w + 'px');
    try { const w = +localStorage.getItem('dmock_chatw'); if (w >= 320) setW(w); } catch (e) {}
    const rs = document.createElement('div'); rs.className = 'chat-rs'; rs.title = 'Drag to resize the chat · double-click to reset'; rs.setAttribute('role', 'separator'); rs.setAttribute('aria-orientation', 'vertical');
    document.body.appendChild(rs);
    const fab = document.createElement('button'); fab.className = 'cop-fab'; setTimeout(() => { fab.innerHTML = `<span>${ic('spark', 14)}</span>Copilot`; }, 0); fab.title = 'Open Copilot'; fab.onclick = () => App.chatOpen(true); document.body.appendChild(fab);
    rs.addEventListener('dblclick', () => { document.body.style.removeProperty('--chat-w'); try { localStorage.removeItem('dmock_chatw'); } catch (e) {} });
    rs.addEventListener('mousedown', e => {
      e.preventDefault(); const left = $('chat').getBoundingClientRect().left; document.body.classList.add('rs-drag');
      const mv = ev => { const w = Math.round(Math.max(320, Math.min(window.innerWidth - left - 420, ev.clientX - left))); setW(w); };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); document.body.classList.remove('rs-drag'); try { localStorage.setItem('dmock_chatw', parseInt(getComputedStyle(document.body).getPropertyValue('--chat-w'), 10)); } catch (e) {} };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
  })();
  let notesOpen = false, speech = null, chatClosed = false, dayView = 'day', dayFilt = 'all', daySel = 1;
  let cuF = 'since', skipOpen = null, listening = false, focusFull = false, anPer = 'week', copOpen = false, pEdit = null, thrId = null, ibCh = 'all', ownerF = 'all', inboxTab = 'all', homeMet = 'team', showProc = false, loadTok = 0, expanded = false, ctx = null, art = null, recId = null, recTab = 'engage', listSel = 'all', campSel = null, campTab = 'enroll', segSel = null, segTab = 'accounts', apprTab = isMgr ? 'needs' : 'todo', apprRep = 'all', scope = isMgr ? 'team' : 'mine', studioTab = 'write', studioType = 'Blog', actOpen = null, artMore = false;

  /* ─── Helpers ─── */
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const js = v => esc(JSON.stringify(v));
  const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatar = (u, sz) => `<span class="av" style="background:${u.color}${sz ? `;width:${sz}px;height:${sz}px;font-size:${Math.round(sz / 2.7)}px` : ''}">${initials(u.name)}</span>`;
  const pAvatar = (a, sz = 30) => `<span class="av" style="background:${USERS[a.owner].color};width:${sz}px;height:${sz}px;font-size:${Math.round(sz / 2.7)}px">${initials(a.contact.name)}</span>`;
  const first = n => n.split(' ')[0];
  const acct = id => ACCOUNTS.find(a => a.id === id);
  const segOf = id => SEGMENTS.find(s => s.id === id);
  const campOf = id => CAMPAIGNS.find(c => c.id === id);
  const mine = a => isMgr || a.owner === me.id;
  const visible = a => isMgr ? ownerF === 'all' || a.owner === ownerF : a.owner === me.id;
  const fmt = n => Number(n).toLocaleString('en-US');
  const sc = a => `${a.score}<span class="of">/100</span>`;
  const pct = (n, d) => d ? Math.round(n / d * 1000) / 10 + '%' : '--';
  const toast = msg => { document.querySelectorAll('.toast').forEach(t => t.remove()); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); };
  const IC = {
    send: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
    plane: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
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
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    home: '<path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>',
    savei: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    dl: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    dots: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    bars: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
    chev: '<polyline points="6 9 12 15 18 9"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="22"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    hour: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22"/><path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
  };
  const ic = (n, sz = 15, sw = 2) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
  const chIc = ch => ic(ch === 'LinkedIn' ? 'li' : 'mail', 13);
  /* Who did it: the AI on its own, a person, or waiting for a person. Used on every list. */
  const mkAI = (t = 'On its own') => `<span class="mk ai" title="Done by the AI on its own">${t}</span>`;
  const mkHu = t => `<span class="mk hu" title="Done or decided by a person">${t}</span>`;
  const mkWait = (t = 'Needs you') => `<span class="mk wait">${t}</span>`;
  const tierBadge = t => t === '–' ? '<span class="muted">–</span>' : `<span class="tier ${t}">${t}</span>`;
  const ID_TIER = { 1: ['Tier 1', 'b-pos', 'Found on the primary provider, first try'], 2: ['Tier 2', 'b-pos', 'Fallback provider, confirmed by a second'], 3: ['Tier 3', 'b-warn', 'Fallback provider, not yet confirmed'], 4: ['Tier 4', 'b-neg', 'Providers disagree: held'], 5: ['Tier 5', 'b-grey', 'Last-resort provider only'] };
  const idBadge = t => `<span class="badge ${ID_TIER[t][1]}" title="${ID_TIER[t][2]}">${ID_TIER[t][0]}</span>`;
  const REASON = { 'Ready': 'b-pos', 'Medium confidence': 'b-warn', 'Unproven message': 'b-ter', 'Sensitive': 'b-neg', 'Spot-check': 'b-sec', 'Identity unconfirmed': 'b-warn' };
  const reasonOf = a => a.nba.reason || 'Ready';
  const ago = d => d === 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
  const MODE = { NBC: ['Campaign · NBC', 'b-brand'], NBA: ['My actions · NBA', 'b-sec'], Building: ['Building toward a campaign', 'b-grey'] };
  const modeBadge = s => `<span class="badge ${MODE[s.mode][1]}">${s.mode === 'Building' ? `Building · ${s.building} of 10` : MODE[s.mode][0]}</span>`;
  const CSTAT = { 'Ready to confirm': 'b-ter', Running: 'b-pos', Completed: 'b-grey', Draft: 'b-warn' };
  const campStatus = c => S.camp[c.id] || c.status;
  const campBadge = c => `<span class="badge ${S.camp[c.id] ? (S.camp[c.id] === 'Confirmed' ? 'b-pos' : 'b-ter') : CSTAT[c.status] || 'b-grey'}">${esc(campStatus(c))}</span>`;
  const stateBadge = st => { const k = /Meeting|positive/.test(st) ? 'b-pos' : /objection|Bounced|Taken out/.test(st) ? 'b-warn' : /Out of office|Draft/.test(st) ? 'b-grey' : /Waiting/.test(st) ? 'b-ter' : 'b-sec'; return `<span class="badge ${k}">${esc(st)}</span>`; };
  const KIND_B = { Positive: 'b-pos', 'Meeting booked': 'b-pos', Objection: 'b-warn', 'Out of office': 'b-grey' };
  const decLabel = d => ({ approved: 'Approved · scheduled', 'with-manager': 'With Daniel', skipped: 'Skipped', 'sent-back': 'Sent back', signed: 'Signed off' }[d] || d);
  const mailbox = a => `${USERS[a.owner].name.toLowerCase().replace(' ', '.')}@client.example`;

  /* ─── Work items ─── */
  function draftOf(a) { return Object.assign({ subject: a.nba.subject, body: a.nba.body, channel: a.nba.channel, option: 'rec' }, S.drafts[a.id] || {}); }
  function openItems() { return ACCOUNTS.filter(a => a.nba && (a.nba.status === 'ready' || a.nba.status === 'review')); }
  function apprItems(tab) {
    if (tab === 'ahead') return ACCOUNTS.filter(a => a.nba && a.nba.status === 'auto' && !a.campaign && (isMgr ? apprRep === 'all' || a.owner === apprRep : a.owner === me.id));
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
  /* ─── Prospecting from any request: role, place and industry become a list that is scored and routed like any other ─── */
  const listOf = () => { const c = chat(); return c && c.listId ? c.listId : 'L1'; };
  const listAccounts = () => ACCOUNTS.filter(a => a.fromList === listOf());
  const listTitle = () => { const g = S.genLists.find(x => x.id === listOf()); return g ? g.title : 'Lookalikes of your last 10 wins'; };
  const CITIES = { sydney: ['Sydney', 'Australia'], melbourne: ['Melbourne', 'Australia'], brisbane: ['Brisbane', 'Australia'], perth: ['Perth', 'Australia'], auckland: ['Auckland', 'New Zealand'], singapore: ['Singapore', 'Singapore'], 'kuala lumpur': ['Kuala Lumpur', 'Malaysia'], jakarta: ['Jakarta', 'Indonesia'], bangkok: ['Bangkok', 'Thailand'], manila: ['Manila', 'Philippines'], 'ho chi minh': ['Ho Chi Minh City', 'Vietnam'], london: ['London', 'United Kingdom'], 'new york': ['New York', 'United States'], 'san francisco': ['San Francisco', 'United States'], dubai: ['Dubai', 'United Arab Emirates'], mumbai: ['Mumbai', 'India'], bangalore: ['Bengaluru', 'India'], bengaluru: ['Bengaluru', 'India'], tokyo: ['Tokyo', 'Japan'], 'hong kong': ['Hong Kong', 'Hong Kong'] };
  const COUNTRIES = { australia: ['Sydney', 'Australia'], 'new zealand': ['Auckland', 'New Zealand'], malaysia: ['Kuala Lumpur', 'Malaysia'], indonesia: ['Jakarta', 'Indonesia'], thailand: ['Bangkok', 'Thailand'], philippines: ['Manila', 'Philippines'], vietnam: ['Ho Chi Minh City', 'Vietnam'], india: ['Mumbai', 'India'], uk: ['London', 'United Kingdom'], 'united kingdom': ['London', 'United Kingdom'], usa: ['New York', 'United States'], 'united states': ['New York', 'United States'], japan: ['Tokyo', 'Japan'], uae: ['Dubai', 'United Arab Emirates'] };
  const INDUSTRIES = [[/\b(tech|technology|software|saas|digital|cloud|it)\b/, 'Technology'], [/fintech|bank|financ|insur/, 'Financial services'], [/retail|e-?commerce|consumer/, 'Retail'], [/health|medic|pharma/, 'Healthcare'], [/manufactur|industrial/, 'Manufacturing'], [/logistic|shipping|transport/, 'Logistics'], [/energy|utilit|power/, 'Energy'], [/telecom/, 'Telecommunications'], [/refin|petro|chemical|oil and gas/, 'Refining & petrochemicals'], [/educat|universit/, 'Education']];
  const FUNCS = [[/mark|maket|brand|growth|demand gen/, 'Marketing'], [/\bsales|revenue|business dev/, 'Sales'], [/\bproduct/, 'Product'], [/engineer|develop/, 'Engineering'], [/\bhr\b|people|talent|human res/, 'People'], [/\bfinance|\bcfo|accounting/, 'Finance'], [/operat|\bops\b/, 'Operations'], [/\bcio\b|\bcto\b|security|\bit (manager|director|head)/, 'IT'], [/reliab|maint/, 'Reliability'], [/procure|purchas/, 'Procurement']];
  function parseICP(text) {
    const t = ' ' + text.toLowerCase().replace(/[,.]/g, ' ') + ' ';
    const ck = Object.keys(CITIES).find(k => t.includes(' ' + k + ' ')), nk = Object.keys(COUNTRIES).find(k => t.includes(' ' + k + ' '));
    const loc = ck ? CITIES[ck] : nk ? COUNTRIES[nk] : null;
    const ind = (INDUSTRIES.find(([re]) => re.test(t)) || [])[1], fn = (FUNCS.find(([re]) => re.test(t)) || [])[1];
    const lvl = /\b(cmo|chief)\b/.test(t) ? 'Chief' : /\b(vp|vice president)\b/.test(t) ? 'VP' : /\bheads?\b/.test(t) ? 'Head' : /director/.test(t) ? 'Director' : /manager/.test(t) ? 'Manager' : /\blead\b/.test(t) ? 'Lead' : 'Manager';
    if (!loc && !fn) return null;
    return { city: loc ? loc[0] : null, country: loc ? loc[1] : null, industry: ind || null, fn: fn || null, lvl };
  }
  const FIRST = ['Olivia', 'Jack', 'Charlotte', 'Liam', 'Amelia', 'Noah', 'Isla', 'Lucas', 'Mia', 'Ethan', 'Chloe', 'Oscar', 'Grace', 'Leo', 'Zoe', 'Henry', 'Ruby', 'Thomas', 'Sophie', 'Max', 'Priya', 'Arjun', 'Mei', 'James'];
  const LAST = ['Nguyen', 'Smith', 'Patel', 'Wilson', 'Chen', 'Taylor', 'Brown', 'Singh', 'Walker', 'Kelly', 'Murphy', 'Lee', 'Harris', 'Martin', 'Wong', 'Clarke', 'Ryan', 'Thompson', 'Kaur', 'Edwards'];
  const PRE = ['Harbourline', 'Bluegum', 'Wattlebird', 'Opalcrest', 'Coastline', 'Kestrel', 'Ironbark', 'Northshore', 'Brightwater', 'Saltbush', 'Redgum', 'Silverleaf', 'Tidewell', 'Southwind', 'Lyrebird', 'Cobalt Bay', 'Emberline', 'Paperbark', 'Highfield', 'Riverstone'];
  const SUF = { Technology: ['Software', 'Labs', 'Cloud', 'Analytics', 'Digital', 'Systems', 'Data', 'AI'], 'Financial services': ['Capital', 'Finance', 'Payments', 'Wealth', 'Lending'], Retail: ['Retail', 'Brands', 'Commerce', 'Stores'], Healthcare: ['Health', 'Medical', 'Care', 'Diagnostics'], Manufacturing: ['Industries', 'Manufacturing', 'Fabrication', 'Works'], Logistics: ['Logistics', 'Freight', 'Transport'], Energy: ['Energy', 'Power', 'Renewables'], Telecommunications: ['Telecom', 'Networks', 'Connect'], Education: ['Learning', 'Education', 'Academy'], 'Refining & petrochemicals': ['Refining', 'Petrochem', 'Olefins'] };
  const GSIG = [['Funding round', 1, 'Raised a new funding round this month', 'News'], ['New leader in the team', 1, 'A new head of the team started two weeks ago', 'LinkedIn'], ['Hiring in the team', 2, 'Three open roles in the team', 'Job boards'], ['Visited your pricing page', 1, 'Pricing and case-study pages, twice this week', 'Website visitor ID'], ['Tech stack change', 2, 'Switched a core platform', 'Technographics'], ['Event attendance', 3, 'Registered for an industry event', 'Events']];
  const GACT = { 'New leader in the team': ['Congratulate the new leader and share a 90-day plan', 'LinkedIn', true], 'Visited your pricing page': ['Send a short comparison with a peer example', 'Email', true], 'Hiring in the team': ['Share how peers scaled the team', 'Email', false], 'Tech stack change': ['Share a migration checklist', 'Email', false], 'Event attendance': ['Suggest meeting at the event', 'LinkedIn', false] };
  function seeded(str) { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }
  function genList(g) {
    if (ACCOUNTS.some(a => a.fromList === g.id)) return;
    const r = seeded(g.id + g.q), icp = g.icp, ind = icp.industry || 'Technology', fn = icp.fn || 'Marketing', city = icp.city || 'Sydney', country = icp.country || 'Australia', sufs = SUF[ind] || SUF.Technology;
    const title = icp.lvl === 'Head' ? `Head of ${fn}` : icp.lvl === 'Chief' ? `Chief ${fn} Officer` : icp.lvl === 'VP' ? `VP ${fn}` : `${fn} ${icp.lvl}`;
    const used = new Set();
    for (let i = 0; i < 16; i++) {
      let name; do { name = `${PRE[Math.floor(r() * PRE.length)]} ${sufs[Math.floor(r() * sufs.length)]}`; } while (used.has(name)); used.add(name);
      const fnm = FIRST[Math.floor(r() * FIRST.length)], lnm = LAST[Math.floor(r() * LAST.length)], slug = name.toLowerCase().replace(/[^a-z]+/g, '');
      const lead = i < 10 ? GSIG[0] : GSIG[1 + (i % 5)];
      const sigs = [lead].concat(GSIG.filter(x => x !== lead && r() > 0.6).slice(0, 2)).map(([type, tier, text, source]) => { const age = 1 + Math.floor(r() * (tier === 1 ? 6 : tier === 2 ? 20 : 40)), strength = Math.round((0.6 + r() * 0.35) * 100) / 100; return { type, tier, text, source, age, strength, weight: Math.round(decayed(tier, age) * strength * 10) / 10 }; });
      sigs.slice(1).forEach(x => { x.weight = Math.min(x.weight, Math.max(0, sigs[0].weight - 5)); });
      const ws = sigs.map(x => x.weight).sort((p, q) => q - p);
      const a = { id: `g${g.id}${i}`, name, generated: true, custom: true, fromList: g.id, owner: g.owner, country, city, industry: ind, size: `${(150 + Math.floor(r() * 4800)).toLocaleString('en-US')} staff`, contact: { name: `${fnm} ${lnm}`, title, email: `${fnm.toLowerCase()}.${lnm.toLowerCase()}@${slug}.example`, idTier: [1, 1, 2, 1, 2, 3, 1, 2, 1, 4, 2, 1, 1, 2, 3, 1][i] }, warm: { score: 15 + Math.floor(r() * 60), note: r() > 0.7 ? 'A 2nd-degree connection through a former colleague.' : 'No connection found.' }, signals: sigs, fit: 52 + Math.floor(r() * 44), seg: null, segment: '', nba: null, campaign: null, campState: '', activity: [{ k: 'crm', when: 'Today', t: 'Found by prospecting', d: `"${g.q}"` }] };
      a.points = Math.round(ws.reduce((t, w, k) => t + w / Math.pow(2, k), 0) * 10) / 10; a.timing = Math.min(100, Math.round(a.points / 2)); a.score = Math.round(a.fit * a.timing / 100); a.tier = a.score >= 40 ? 'A' : a.score >= 20 ? 'B' : a.score > 0 ? 'C' : '—';
      a.whyNow = Object.assign({}, sigs.slice().sort((p, q) => q.weight - p.weight)[0]);
      a.activity.push({ k: 'signal', when: ago(a.whyNow.age), t: 'Signal: ' + a.whyNow.type, d: a.whyNow.text }, { k: 'score', when: 'Today', t: `Scored ${a.score}/100 · tier ${a.tier}`, d: `Fit ${a.fit} × Timing ${a.timing} ÷ 100` });
      ACCOUNTS.push(a);
    }
    ACCOUNTS.filter(a => a.fromList === g.id).sort((p, q) => q.score - p.score).forEach((a, k) => { a.rank = k + 1; if (shared.assign[a.id]) a.owner = shared.assign[a.id]; });
  }
  /* Route a generated list: a trigger shared by 10+ accounts becomes a draft campaign (NBC); every other account gets a next best action (NBA) that goes ahead only if it passes every check */
  function routeList(gid) {
    const g = S.genLists.find(x => x.id === gid); if (!g || g.routedNow) return;
    const by = {};
    ACCOUNTS.filter(a => a.fromList === gid && a.score > 0).forEach(a => { (by[a.whyNow.type] = by[a.whyNow.type] || []).push(a); });
    Object.entries(by).forEach(([type, accs], k) => {
      const sid = `gs${gid}${k}`, nbc = accs.length >= 10, place = [g.icp.city, g.icp.industry].filter(Boolean).join(' · ');
      let s = SEGMENTS.find(x => x.id === sid);
      if (!s) { s = { id: sid, name: `${type} · ${place}`, mode: nbc ? 'NBC' : 'NBA', trigger: type, why: `${accs.length} accounts from your list "${g.title}" share this trigger${nbc ? ', which crosses the campaign threshold (10 in 7 days)' : ': below the campaign threshold, so each gets its own next best action'}.`, structure: nbc ? 'Congratulate on the news → what peers did next → offer a 20-minute call' : 'Reference the trigger → one useful resource → one ask', proven: GACT[type] && GACT[type][2] ? 'Proven' : 'Provisional', rate: null, outcomes: 0, fromList: true, building: 0 }; SEGMENTS.push(s); }
      if (nbc) {
        const cid = 'gc' + gid; let c = campOf(cid);
        if (!c) { const steps = ['A short note on the news, and one question', 'Connect on LinkedIn, referencing the news', 'A one-page example from a peer', 'Offer a 20-minute call; easy to say no']; c = { id: cid, name: `${type}: ${(g.icp.fn || 'team').toLowerCase()} leaders in ${g.icp.city || 'the region'}`, status: 'Draft', seg: sid, touches: campOf('c5').touches.map((t, i) => Object.assign({}, t, { state: '', t: steps[i] || t.t, subject: t.ch === 'Email' ? (i ? 'How a peer handled the next step' : 'Congratulations on the news') : '' })), accounts: accs.map(a => a.id), updates: [{ t: 'Today', x: `Drafted from your list "${g.title}" after ${accs.length} accounts showed the same trigger.` }], blockers: [], explore: 'Provisional: the first outcomes will set the structure for this audience.', fromList: true, launched: null, day: 0 }; CAMPAIGNS.push(c); }
        s.campaign = cid;
        accs.forEach(a => { a.seg = sid; a.segment = s.name; a.campaign = cid; a.campState = 'Draft · not started'; a.activity.push({ k: 'campaign', when: 'Today', t: 'Added to the draft campaign: ' + c.name, d: 'Waiting for confirmation' }); });
      } else accs.forEach(a => {
        const [action, ch, proven] = GACT[type] || ['Send a short, relevant note', 'Email', false];
        a.seg = sid; a.segment = s.name;
        a.nba = { action, runnerUp: 'Share a peer case study', channel: ch, confidence: a.contact.idTier <= 2 ? 'High' : 'Medium', proven, reason: null, status: 'review', due: 'Today 17:00', subject: ch === 'Email' ? `${type} at ${a.name}` : '', body: `Hi ${first(a.contact.name)},\n\nI noticed this at ${a.name}: ${a.whyNow.text.charAt(0).toLowerCase() + a.whyNow.text.slice(1)}.\n\n${action}: it's short and specific to ${a.industry.toLowerCase()} teams in ${a.city}.\n\nWorth a 20-minute conversation next week?\n\nBest,\n${first(USERS[a.owner].name)}` };
        const fails = gate(a).filter(x => !x[1]);
        if (fails.length) Object.assign(a.nba, { reason: { 'High confidence': 'Medium confidence', 'Proven message': 'Unproven message', 'Identity confirmed': 'Identity unconfirmed' }[fails[0][0]] || 'Spot-check', reasonNote: `It didn't pass: ${fails.map(x => x[0].toLowerCase()).join(', ')}.` });
        else a.nba.status = 'auto';
        a.activity.push({ k: 'nba', when: 'Today', t: 'Next best action: ' + action, d: `${ch} · ${fails.length ? 'waiting for a person' : 'went ahead on its own'}` });
      });
    });
    g.routed = true; g.routedNow = true;
  }

  function todos() {
    const t = [];
    myReplies().filter(r => r.kind === 'Positive').forEach(r => t.push({ id: 'rep-' + r.id, t: `Reply to ${r.from}: said yes`, d: `${acct(r.acc).name} · ${r.sourceKind === 'Campaign' ? 'campaign: ' + r.source : 'your action'}${isMgr ? ' · ' + first(USERS[r.owner].name) : ''}`, due: r.at.startsWith('Today') ? 'By 11:00' : 'Overdue', cls: 'hot', go: () => openThread(r.id) }));
    if (isMgr) {
      const sens = apprItems('needs');
      if (sens.length) t.push({ id: 'm1', t: `Sign off ${sens.length} sensitive message${sens.length > 1 ? 's' : ''}`, d: sens.map(a => `${a.name} (${first(USERS[a.owner].name)})`).join(' · '), due: 'Today 15:00', cls: 'hot', go: () => openMod('approvals') });
      if (!S.camp.c1) t.push({ id: 'm2', t: 'Confirm campaign: Turnaround season 2027', d: '11 accounts are held until you decide', due: 'Today', cls: 'soon', go: () => goCampaign('c1') });
      if (S.camp.c5 === 'Sent for confirmation') t.push({ id: 'm6', t: 'Confirm campaign: Control-systems hiring surge', d: 'Sent by Sofia from her prospect list', due: 'Today', cls: 'soon', go: () => goCampaign('c5') });
      t.push({ id: 'm3', t: 'Kenji has 3 overdue items and no meetings yet', d: 'Reassign or nudge. The AI suggests moving 2 to Aisha', due: 'Overdue', cls: 'hot', go: () => ask('How is my team doing?') });
      t.push({ id: 'm5', t: 'Read the weekly pilot readout', d: 'Ready Friday 16:00', due: 'Fri', cls: 'ok', go: () => ask('What did we learn this week?') });
      return t;
    }
    shared.tasks.forEach((x, i) => { if (x.to === me.id) t.push({ id: 'as-' + i, t: x.t, d: x.acc ? acct(x.acc).name : 'Assigned to you', due: x.due, cls: x.due === 'Today' ? 'soon' : 'ok', from: 'Daniel', go: () => x.acc ? openRecord(x.acc, 'engage') : toast('Assigned by Daniel') }); });
    const ready = apprItems('todo').filter(a => !a.nba.reason);
    if (ready.length) t.push({ id: 't2', t: `Approve ${ready.length} ready action${ready.length > 1 ? 's' : ''}`, d: ready.map(a => a.name).join(' · '), due: 'Today 12:00', cls: 'soon', go: () => openMod('approvals') });
    const unsure = apprItems('todo').filter(a => a.nba.reason && !a.nba.sensitive);
    if (unsure.length) t.push({ id: 't3', t: `Review ${unsure.length} item${unsure.length > 1 ? 's' : ''} the AI wasn't sure about`, d: unsure.map(a => `${a.name} · ${reasonOf(a).toLowerCase()}`).join(' · '), due: 'Today 17:00', cls: 'soon', go: () => openMod('approvals') });
    if (!S.camp.c5) t.push({ id: 't6', t: 'Review the draft campaign from your list', d: 'Control-systems hiring surge · 4 touches, email and LinkedIn', due: 'Today', cls: 'soon', go: () => goCampaign('c5', 'steps') });
    const sens = apprItems('todo').filter(a => a.nba.sensitive);
    if (sens.length) t.push({ id: 't4', t: `Check ${sens.length} sensitive message${sens.length > 1 ? 's' : ''} before they go to Daniel`, d: sens.map(a => a.name).join(' · '), due: 'Fri 30 Oct', cls: 'ok', go: () => openRecord(sens[0].id, 'engage') });
    t.push({ id: 't5', t: 'Follow up on Sapphire Aromatics', d: 'Opened the renewal comparison 3 times; no reply yet', due: 'Today', cls: 'ok', go: () => openRecord('sapphire', 'activity') });
    return t;
  }
  function updates() {
    const u = [];
    myReplies().filter(r => r.kind === 'Positive' || r.kind === 'Meeting booked').forEach(r => u.push({ k: 'pos', icon: 'reply', when: r.at, t: `${r.from} ${r.kind === 'Positive' ? 'replied: interested' : 'booked a meeting'}`, d: `${acct(r.acc).name} · ${r.sourceKind === 'Campaign' ? 'campaign' : 'your action'}${isMgr ? ' · ' + first(USERS[r.owner].name) : ''}`, on: `App.openThread('${r.id}')` }));
    if (!S.camp.c1) u.push({ k: 'brand', icon: 'megaphone', when: 'Today 06:05', t: 'New campaign proposed: Turnaround season 2027', d: isMgr ? '11 accounts crossed the threshold. Needs your confirmation.' : '5 of your accounts are in it. Daniel confirms.', on: "App.goCampaign('c1')" });
    u.push({ k: 'info', icon: 'bolt', when: 'Today 06:00', t: isMgr ? '3 accounts moved into tier A' : 'Juniper Petrochem moved into tier A', d: 'New VP Reliability plus pricing-page visits. A warm path was found through a champion who moved.', on: "App.openRecord('juniper','overview')" });
    myBlockers().filter(b => b.k === 'neg').forEach(b => u.push({ k: 'neg', icon: 'alert', when: 'Now', t: b.t, d: b.d, on: b.go ? `App.goTo(${js(b.go)})` : '' }));
    u.push({ k: 'pos', icon: 'megaphone', when: 'Fri 23 Oct', t: 'Control-system renewal: first meeting booked', d: 'Ironwood Refining (Marco). 4 replies from 14 accounts so far.', on: "App.goCampaign('c2')" });
    u.push({ k: 'warn', icon: 'alert', when: 'Thu 22 Oct', t: 'Status watch took 1 account out of a campaign', d: 'Another rep opened an opportunity there. No double outreach.', on: "App.goCampaign('c3')" });
    return u;
  }

  /* ─── Routing: #today or a module; a result or a record opens in the canvas beside the chat ─── */
  const MODULES = Object.assign({ inbox: 'Inbox', accounts: 'Accounts', segments: 'Segments', campaigns: 'Campaigns', approvals: 'Approvals', studio: 'Content studio' }, isMgr ? { analytics: 'Analytics' } : {});
  const MOD_IC = { inbox: 'inbox', accounts: 'users', segments: 'layers', campaigns: 'megaphone', approvals: 'task', studio: 'pen', analytics: 'bars' };
  /* Where you came from: jumping from a chat or Analytics into a module keeps a way back */
  let backs = [], keep = null;
  function remember(to) {
    const v = view();
    if (v === to && !(v === 'campaigns' && campSel) && !(v === 'segments' && segSel)) return;
    const c = chat();
    backs.push(v ? { v, label: v === 'campaigns' && campSel ? campOf(campSel).name : v === 'segments' && segSel ? segOf(segSel).name : MODULES[v], campSel, segSel, listSel } : { v: null, cur: S.cur, art, label: c ? c.title : 'Today' });
    if (backs.length > 6) backs.shift();
    /* The chat you came from stays on the left while you look at what it made */
    if (!v && c && to !== 'studio' && to !== 'inbox') keep = c;
  }
  const backChip = () => backs.length ? `<button class="back-chip" onclick="App.goBack()" title="Back to ${esc(backs[backs.length - 1].label)}">${ic('left', 13)}<span>${esc(backs[backs.length - 1].label)}</span></button>` : '';
  function view() { const r = (location.hash || '').slice(1); return MODULES[r] ? r : null; }
  function go(r) { if (view() === r || (!r && !view())) renderAll(); else location.hash = r ? '#' + r : '#today'; }
  function nav(r) { backs = []; keep = null; art = null; recId = null; thrId = null; ctx = null; expanded = false; if (!r) S.cur = 'home'; if (r === 'campaigns') campSel = null; if (r === 'segments') segSel = null; if (r === 'studio') S.studio.doc = null; go(r); }
  function openMod(r) { remember(r); art = null; recId = null; thrId = null; expanded = true; go(r); }
  window.addEventListener('hashchange', () => renderAll());

  /* ─── Side navigation ─── */
  function renderNav() {
    const v = view(), n = badgeCount();
    $('side').innerHTML = `
      <div class="side-brand"><img src="assets/logo.png" alt="Zinger" ${navCol ? 'onclick="App.toggleNav()" title="Expand the menu" style="cursor:pointer"' : ''}><div class="lockup"><span class="wm">Zinger</span><i></i><span class="prod">Demand AI</span></div><button class="side-pin" onclick="App.toggleNav()" title="${navCol ? 'Pin the menu open' : 'Collapse the menu to icons'}" aria-label="${navCol ? 'Expand menu' : 'Collapse menu'}">${ic('panel', 15)}</button></div>
      ${navCol ? `<button class="side-item side-exp" onclick="App.toggleNav()" title="Expand the menu">${ic('panel', 16)}</button>` : ''}
      <button class="side-new" onclick="App.newChat()" title="New chat">${ic('plus', 14)}<span>New chat</span></button>
      <a class="side-item ${!v ? 'on' : ''}" href="#today" onclick="App.nav(null);return false" title="Today">${ic('home', 16)}<span class="lbl-t">Today</span></a>
      <div class="side-sep"></div>
      <nav class="side-nav" aria-label="Modules">${Object.keys(MODULES).map(k => `<a class="side-item ${v === k ? 'on' : ''}" href="#${k}" onclick="App.nav('${k}');return false" title="${MODULES[k]}">${ic(MOD_IC[k], 16)}<span class="lbl-t">${MODULES[k]}</span>${(k === 'approvals' ? n : k === 'inbox' ? threads().filter(needsReply).length : 0) ? `<span class="cnt">${k === 'approvals' ? n : threads().filter(needsReply).length}</span>` : ''}</a>`).join('')}</nav>
      <div class="side-sec">Recent chats${S.chats.some(c => c.attn) ? '<span class="side-attn">Needs you</span>' : ''}</div>
      <div class="side-recent">${S.chats.map(c => c.obj ? `<button class="obj ${!v && c.id === S.cur ? 'on' : ''} ${c.attn ? 'hot' : ''}" onclick="App.openChat('${c.id}')" title="${esc(c.title)}">${ic('flag', 13)}<span><b>${esc(c.title)}</b><em>${c.attn ? attnLine(c) : `${objDone(c).length} of ${c.obj.total}${c.reminder ? ' · reminder ' + esc(c.reminder) : ''}`}</em><u><s style="width:${Math.round(objDone(c).length / c.obj.total * 100)}%"></s></u></span>${c.attn ? '<i class="attn" title="Needs your attention">' + (c.obj.total - objDone(c).length) + '</i>' : `<i>${esc(c.when)}</i>`}</button>` : `<button class="${!v && c.id === S.cur ? 'on' : ''} ${c.attn ? 'obj hot' : ''}" onclick="App.openChat('${c.id}')" title="${esc(c.title)}">${ic('chat', 13)}${c.attn ? `<span><b>${esc(c.title)}</b><em>${esc(attnLine(c))}</em></span><i class="attn" title="Needs your attention">1</i>` : `<span>${esc(c.title)}</span><i>${esc(c.when)}</i>`}</button>`).join('')}</div>
      <div class="side-foot">
        <div class="side-user">${avatar(me, 30)}<div class="lbl-t"><div class="nm">${esc(me.name)}</div><div class="rl">${isMgr ? 'Sales manager · 4 reps' : 'Sales rep'}</div></div></div>
        <div class="side-links lbl-t"><button onclick="App.switchUser('${isMgr ? 'sofia' : 'pavan'}')">Switch to ${isMgr ? 'Sofia (rep)' : 'Daniel (manager)'}</button><a href="index.html" onclick="App.signOut()">Sign out</a></div>
      </div>`;
  }

  /* ─── Chats: Today sessions, one chat per module, one per document ─── */
  const MOD_INTRO = {
    inbox: () => `Replies from email and LinkedIn in one place${isMgr ? ', for the whole team' : ''}. Each comes with a suggested answer; when someone replies, their remaining campaign steps pause.`,
    analytics: () => 'The dashboard is beside this chat, showing the past week. Ask me a question and I answer here, then take you to the account or the rep behind the number.',
    accounts: () => `This is every account ${isMgr ? 'on the team' : 'you own'}, ranked by Fit × Timing. Saved lists are the tabs above the table. Ask me to find more, score a list, or save what you're looking at.`,
    segments: () => 'Accounts grouped by why they\'re ready. Campaign segments (NBC) run as one sequence; the rest are next best actions (NBA). Open one, or ask me.',
    campaigns: () => `${CAMPAIGNS.filter(c => c.status === 'Running').length} campaigns running, ${CAMPAIGNS.filter(c => /Ready|Draft/.test(c.status)).length} waiting to start. Email and LinkedIn only. Ask me to build one, change a sequence, or explain the results.`,
    approvals: () => !isMgr ? 'Next best actions go ahead on their own when they pass every check. Only the ones that don\'t come here, with the reason. Ask me why any item is here.' : isMgr ? 'Sensitive messages and campaigns wait here for you. Ask me why any item needs a person.' : 'Only the items that need you. Everything else went ahead on its own. Ask me why any item is here.',
  };
  const MOD_HINTS = {
    inbox: ['Any replies?', 'Which replies are objections?', 'Draft a reply to Dian with 3 times next week', 'What should I do with Greystone?'],
    analytics: ['Where are we stuck?', 'What moved into pipeline last week?', 'How is my team doing?', 'Where is the funnel leaking?'],
    accounts: ['Find prospects like my last 10 wins', 'Score this list', 'Save as a list', 'Who should I call first?'],
    segments: ['Which segments are campaigns?', 'Create micro-segments', 'What\'s close to becoming a campaign?', 'Why is Juniper ranked first?'],
    campaigns: ['How are the campaigns doing?', 'Build the campaign', 'Add a LinkedIn touch to the turnaround campaign', 'Any replies?'],
    approvals: ['What needs me?', 'What went ahead today?', 'Why is Cedar here?', 'Any blockers?'],
  };
  function chat() {
    const v = view();
    if (v === 'studio') return S.studio.doc ? S.studio : null;
    if (v && keep) return keep;
    if (v) { if (!S.mchat[v]) S.mchat[v] = { title: `${MODULES[v]} chat`, thread: [{ who: 'ai', kind: 'modIntro', v }] }; return S.mchat[v]; }
    if (S.cur === 'home') { if (!S.today) { const h = todayHistory(); S.today = { id: 'home', title: 'Today', thread: h.concat(todayThread()), readUpTo: h.length, readAt: 'Mon 26 Oct 18:40' }; } return S.today; }
    return S.chats.find(c => c.id === S.cur) || S.chats[0];
  }
  function todayHistory() { return isMgr
      ? [{ who: 'me', text: 'How did the team do today?' }, { who: 'ai', kind: 'text', html: 'A quiet Monday: <b>3 replies</b> and <b>1 meeting booked</b> (Ironwood Refining, Marco). Kenji has 3 items overdue; if nothing moves overnight I will bring it to you first thing.' }]
      : [{ who: 'me', text: "What's left for today?" }, { who: 'ai', kind: 'text', html: 'Two follow-ups went out on their own. <b>Cedar Petrochemicals</b> is still waiting on you; I will have it at the top of your catch-up in the morning.' }]; }
  function todayThread() { return [{ who: 'ai', kind: 'greet' }]; }
  const objName = t => { const k = /\bred\b/i.test(t) ? 'Red accounts' : /renewal/i.test(t) ? 'Renewals' : /meeting/i.test(t) ? 'Meetings' : /campaign/i.test(t) ? 'Campaign' : 'Objective'; let n = k + ' · week of 26 Oct', i = 2; while (S.chats.some(c => c.title === n)) n = `${k} · week of 26 Oct (${i++})`; return n; };
  const OBJ_RE = /^(let'?s |help me |i want to |we need to )?(work|get|close|clear|reach|move|push)\b.*(accounts?|deals?|week|friday|list)|\b(objective|goal)\b/i;
  const lastKind = () => { const c = chat(); const t = c ? c.thread.filter(m => m.who === 'ai') : []; return t.length ? t[t.length - 1].kind : null; };
  const NEXT = { prospects: ['Score this list', 'Save as a list'], rankedList: ['Route to NBA and NBC', 'Save the scored list'], listSegments: ['Approve all ready', 'Send the campaign to Daniel'], nbaList: ['Build the campaign', 'How are the campaigns doing?'], flowCampaign: ['How are the campaigns doing?', 'What did we learn this week?'], campaigns: ['What did we learn this week?', 'Any replies?'] };
  function hints() {
    const v = view(), nx = NEXT[lastKind()] || [];
    if (recId) { const a = acct(recId); return ['Why is this here?', a.nba && !a.campaign ? 'Use the runner-up' : 'Why these messages?', 'Pull the last touchpoint', 'Make it shorter']; }
    if (!v && chat() && chat().obj) return ['What\'s left on this objective?', 'Remind me Friday at 9', 'Note: call Cedar before the renewal', 'Which of these went ahead on their own?'];
    if (v === 'studio') return ['Make it shorter', 'Add proof', 'More formal', 'Rewrite the intro', 'Add a section on lifecycle planning'];
    const base = v ? MOD_HINTS[v] : isMgr ? ['Let\'s get our red accounts to a next step this week', 'Where are we stuck?', 'Pull the emails we received today', 'How much do agents do on their own?', 'How is my team doing?']
      : ['Find prospects like my last 10 wins', 'What should I do first today?', 'How are the campaigns doing?', 'Which segments are campaigns?', 'Write a blog on planning a control system migration'];
    return nx.concat(base.filter(b => !nx.includes(b))).slice(0, v ? 4 : 5);
  }
  function renderChat() {
    const c = chat(), v = view();
    if (!c) { $('chat').innerHTML = ''; return; }
    const ph = v === 'studio' ? (S.studio.sel != null ? 'Change this paragraph…' : 'Ask for a change…') : recId ? `Ask about ${esc(acct(recId).name)}, or tell me what to change…` : v ? `Ask about ${MODULES[v].toLowerCase()}, or pick something to start…` : 'Ask anything, or pick something to start…';
    const nn = (c.notes || []).length;
    $('chat').innerHTML = `
      <div class="chat-h">
        <span class="ai-mark">${ic('spark', 13)}</span>
        ${c.naming ? `<input class="ttl-in" id="ttlIn" value="${c.title === 'New chat' ? '' : esc(c.title)}" placeholder="Name this chat" aria-label="Chat name" onkeydown="if(event.key==='Enter'){event.preventDefault();App.nameChat(this.value)}if(event.key==='Escape'){App.nameChat(null)}" onblur="App.nameChat(this.value)">` : ''}
        <div class="ttl" ${c.naming ? 'hidden' : ''} ${!v && S.chats.includes(c) ? `onclick="App.renameChat()" title="Rename this chat"` : ''}>${v === 'studio' ? `<button class="back-l" onclick="App.nav('studio')">${ic('left', 13)} Content studio</button>` : esc(c.title)}${!v && S.cur === 'home' ? '<span class="ttl-sub">Tuesday 27 October · ' + (isMgr ? 'your team' : 'your accounts') + '</span>' : c.obj ? `<span class="ttl-sub">Objective · ${objDone(c).length} of ${c.obj.total} done${c.reminder ? ' · reminder ' + esc(c.reminder) : ''}</span>` : ''}</div>
        <div class="sp"></div>
        ${v && v !== 'studio' && !expanded && v !== 'inbox' && v !== 'analytics' ? `<button class="btn sm" onclick="App.expand()">${ic('expand', 12)} Open ${MODULES[v]}</button>` : ''}
        <button class="ic-btn notes-b ${notesOpen ? 'on' : ''}" title="Notes on this chat" onclick="App.notes()">${ic('pen', 15)}${nn ? `<i>${nn}</i>` : ''}</button>
        <a class="ic-btn" href="story.html" title="What we're selling: the battle card">${ic('help', 15)}</a>
        <button class="ic-btn" title="New chat" onclick="App.newChat()">${ic('plus', 15)}</button>
        <button class="ic-btn cop-x" title="Close Copilot: give the view the full width" onclick="App.chatOpen(false)">${ic('x', 15)}</button>
      </div>
      ${notesOpen ? `<div class="notes-p"><div class="notes-h"><b>${ic('pen', 13)} Notes on this chat</b><span class="muted">Only you see these. They come back with every catch-up.</span><button class="ic-btn" title="Close notes" onclick="App.notes(false)">${ic('x', 14)}</button></div>
        <div class="notes-l">${nn ? c.notes.map((n, i) => `<div class="note-r"><span>${esc(noteTxt(n))}</span><time>${esc(noteAt(n))}</time><button class="ic-btn" title="Remove" onclick="App.delChatNote(${i})">${ic('x', 12)}</button></div>`).join('') : '<div class="muted" style="font-size:12px;padding:4px 0">No notes yet. Add what you want to remember about this chat.</div>'}</div>
        <div class="notes-add"><label class="sr" for="noteIn">Add a note</label><input id="noteIn" placeholder="Add a note, for example: call Cedar before the renewal" onkeydown="if(event.key==='Enter'){event.preventDefault();App.addChatNote()}"><button class="btn sm pri" onclick="App.addChatNote()">Add note</button></div></div>` : ''}
      ${isHero(c) ? heroHtml(c, ph) : ''}<div class="thread" id="thread" ${isHero(c) ? 'hidden' : ''}><div class="thread-in">${c.thread.map((m, i) => (i === unreadAt(c) ? `<div class="unread-line" id="unreadLine"><span>New since you last looked${c.readAt ? ' · ' + esc(c.readAt) : ''}</span></div>` : '') + renderMsg(m).replace('<div class="msg', `<div data-i="${i}" class="msg`)).join('')}</div></div>
      <div class="composer-wrap" ${isHero(c) ? 'hidden' : ''}>
        <div class="hints">${hints().slice(0, 3).map(h => `<button class="chip" onclick="App.ask(${js(h)})">${esc(h)}</button>`).join('')}</div>
        ${isHero(c) ? '' : composerBox({ id: 'composer', ph, send: 'App.send()', actions: v === 'studio' ? null : recId ? personActs(acct(recId)) : mainActs(), scope: v !== 'studio' })}
      </div>`;
    placeThread(c, v);
  }
  /* Every thread opens where you left off: at the "new since" line when there is something new, otherwise at your last position. */
  const isHero = c => !view() && !art && !!c && S.chats.includes(c) && !c.obj && !c.thread.some(m => m.who === 'me');
  const unreadAt = c => (c.readUpTo > 0 && c.readUpTo < c.thread.length) ? c.readUpTo : -1;
  let lastR = { key: null, len: 0, top: 0, c: null };
  function placeThread(c, v) {
    const th = $('thread'), key = (v || '') + '|' + (c.id || c.title), same = lastR.key === key, grew = same && c.thread.length > lastR.len, prevLen = lastR.len, top = lastR.top;
    if (!same && lastR.c && lastR.c !== c) { lastR.c.readUpTo = lastR.c.thread.length; lastR.c.readAt = null; lastR.c.top = lastR.top; }
    lastR = { key, len: c.thread.length, top, c, pad: same ? lastR.pad : '' };
    const to = el => { if (!el) return; const tin = th.firstElementChild, below = tin.getBoundingClientRect().bottom - el.getBoundingClientRect().top; tin.style.paddingBottom = lastR.pad = Math.max(0, th.clientHeight - below - 24) + 'px'; th.scrollTop += el.getBoundingClientRect().top - th.getBoundingClientRect().top - 6; };
    requestAnimationFrame(() => {
      if (same && !grew) { if (lastR.pad) th.firstElementChild.style.paddingBottom = lastR.pad; th.scrollTop = top; }
      else if (grew) { const me = [...th.querySelectorAll('.msg.me')].pop(); const i = me ? +me.dataset.i : -1; to(i >= prevLen - 1 ? me : th.querySelector(`[data-i="${prevLen}"]`) || me); }
      else if ($('unreadLine')) to($('unreadLine'));
      else if (c.top != null) th.scrollTop = c.top;
      else th.scrollTop = 0;
      lastR.top = th.scrollTop;
      th.onscroll = () => { lastR.top = th.scrollTop; };
    });
  }
  /* One composer everywhere: attach, quick actions, scope, then talk and send on the right */
  function heroHtml(c, ph) {
    const ac = attnChats(), sugg = isMgr ? ['Where are we stuck?', 'How is my team doing?', "Let's get our red accounts to a next step this week", 'Pull the emails we received today'] : ['What should I do first today?', 'Find prospects like my last 10 wins', 'How are the campaigns doing?', 'Pull the emails we received today'];
    return `<div class="hero-v"><div class="hero-in">
      <span class="hero-ic">${ic('spark', 20)}</span>
      <h1>${greeting()}, ${esc(first(me.name))}</h1>
      <p>What do you want to work on? Ask anything, or drop in a contact list, a call transcript or a price sheet.</p>
      ${composerBox({ id: 'composer', ph: 'Ask anything, or pick something to start…', send: 'App.send()', actions: mainActs(), scope: true })}
      ${ac.length ? `<div class="hero-attn">${ac.map(x => `<button onclick="App.openChat('${x.id}')"><i></i>${esc(x.title)}: ${esc(attnLine(x))}</button>`).join('')}</div>` : ''}
      <div class="hero-sg">${sugg.map(h => `<button onclick="App.ask(${js(h)})">${esc(h)}</button>`).join('')}</div>
      <div class="hero-ln"><span>Pick up where you left off:</span>${S.chats.filter(x => x !== c && x.thread.length).slice(0, 3).map(x => `<button onclick="App.openChat('${x.id}')">${esc(x.title)}</button>`).join('')}<button class="go" onclick="App.nav(null)">See today's plan</button></div>
    </div></div>`;
  }
  function composerBox(o) {
    return `<div class="composer">
      <label class="sr" for="${o.id}">${o.label || 'Message Demand AI'}</label>
      <textarea id="${o.id}" rows="1" placeholder="${o.ph}" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();${o.send}}" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
      <div class="composer-f">
        <button class="ic-btn" title="Add a file: a call transcript, a contact list, a price sheet" onclick="App.toast('Attach a file (mock)')">${ic('plus', 15)}</button>
        ${o.actions ? actDD(o.id, o.actions) : ''}
        ${o.scope ? scopeDD() : ''}
        <div class="sp"></div>
        <button class="ic-btn mic" id="${o.id}Mic" title="Talk: say it and it is sent" onclick="App.dictate('${o.id}')">${ic('mic', 16)}</button>
        <button class="send" onclick="${o.send}" title="Send">${ic('send', 16)}</button>
      </div></div>`;
  }
  const actDD = (id, items) => `<div class="dd"><button class="cmp-pill" onclick="App.dd(event,this)">${ic('spark', 12)}<span>Start something new</span>${ic('chev', 12)}</button><div class="dd-m"><div class="dd-h">Start something new</div>${items.map(([i, t, d, run]) => `<button class="dd-i" onclick="App.ddRun(event,${js(run)},'${id}')"><span class="dd-ic">${ic(i, 15)}</span><span><b>${esc(t)}</b><em>${esc(d)}</em></span></button>`).join('')}</div></div>`;
  function scopeDD() {
    const c = chat(), lbl = ctx ? acct(ctx).name : c && c.obj ? c.obj.total + ' accounts in this objective' : isMgr ? 'Team portfolio' : 'My accounts';
    const accs = ACCOUNTS.filter(mine).filter(a => a.score > 0).sort((p, q) => q.score - p.score).slice(0, 7);
    return `<div class="dd"><button class="cmp-pill ${ctx ? 'on' : ''}" onclick="App.dd(event,this)">${ic('users', 12)}<span>${esc(lbl)}</span>${ic('chev', 12)}</button><div class="dd-m"><div class="dd-h">What the AI looks at</div>
      <button class="dd-i" onclick="App.ddScope(event,null)"><span class="dd-ic">${ic('users', 15)}</span><span><b>${c && c.obj ? 'This objective' : isMgr ? 'Team portfolio' : 'My accounts'}</b><em>${c && c.obj ? c.obj.total + ' accounts' : 'Everything you can see'}</em></span></button>
      ${accs.map(a => `<button class="dd-i" onclick="App.ddScope(event,'${a.id}')">${pAvatar(a, 24)}<span><b>${esc(a.name)}</b><em>${esc(a.contact.name)} · ${esc(first(USERS[a.owner].name))}</em></span></button>`).join('')}</div></div>`;
  }
  const mainActs = () => [
    ['search', 'Find prospects', 'Lookalikes of your wins from signals, CRM and news · lands in Accounts', 'Find prospects like my last 10 wins'],
    ['bars', 'Score a list', 'Fit and timing for every account · opens in Accounts', 'Score this list'],
    ['layers', 'Build micro-segments', 'Groups accounts by trigger and motivation · opens in Segments', 'Create micro-segments'],
    ['bolt', 'Prepare next best actions', 'One checked action per account · waits in Approvals if it needs you', 'Prepare the next actions'],
    ['megaphone', 'Build a campaign', 'For segments of 10 or more accounts · opens in Campaigns', 'Build the campaign'],
    ['inbox', 'Answer replies', 'Every reply with a suggested answer · opens Inbox', 'Pull the emails we received today'],
    ['doc', 'Write content', 'Blog or whitepaper from approved sources · opens Content studio', 'Write a blog on planning a control system migration'],
    ['bars', 'Ask about results', isMgr ? 'Where the pipeline is stuck and what to fix · Analytics' : 'How your campaigns are doing · Analytics', isMgr ? 'Where are we stuck?' : 'How are the campaigns doing?'],
    ['flag', 'Set an objective', 'A goal the AI tracks in its own chat, with progress', "Let's get our red accounts to a next step this week"],
  ];
  const personActs = a => [
    ['mail', 'Draft a follow-up', `For ${first(a.contact.name)}, from the last touchpoint`, 'Make it shorter'],
    ['help', 'Why is this here?', 'The signal and the checks behind it', 'Why is this here?'],
    ['right', 'Use the runner-up', 'The next best action instead', 'Use the runner-up'],
    ['hour', 'Pull the last touchpoint', 'What was sent and what happened', 'Pull the last touchpoint'],
  ];
  function sendFrom(id) { if (id === 'copIn') App.copSend(); else if (id === 'composer') App.send(); }
  function ctxChip() { return ctx ? `<span class="badge b-brand" onclick="App.setCtx(null)" title="Remove">@${esc(acct(ctx).name)} ✕</span>` : ''; }
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  function stepsHtml(steps) { return steps && steps.length ? `<div class="steps">${steps.map(x => `<div class="st"><span class="ok">✓</span><span>${x}</span></div>`).join('')}</div>` : ''; }
  function fbHtml() { return `<div class="fb"><button class="ic-btn" title="Good" onclick="App.toast('Thanks. Feedback goes into the learning loop')">${ic('up', 13)}</button><button class="ic-btn" title="Not good" onclick="App.toast('Thanks. Tell me what to change and I\\'ll redo it')">${ic('down', 13)}</button></div>`; }
  function renderMsg(m) {
    if (m.who === 'me') return `<div class="msg me"><div class="bub">${esc(m.text)}</div></div>`;
    if (m.who === 'typing') return `<div class="msg"><span class="ai-av">${ic('spark', 14)}</span><div class="bub">${m.step ? `<div class="steps"><div class="st"><span class="typing"><i></i><i></i><i></i></span><span>${m.step}</span></div></div>` : '<span class="typing"><i></i><i></i><i></i></span>'}</div></div>`;
    const R = RENDER[m.kind] || RENDER.text;
    return `<div class="msg${m.fresh ? ' enter' : ''}"><span class="ai-av">${ic('spark', 14)}</span><div class="bub">${stepsHtml(m.steps)}${R(m)}${m.kind === 'modIntro' ? '' : fbHtml()}</div></div>`;
  }
  const btn = (label, q, pri) => `<button class="btn sm ${pri ? 'pri' : ''}" onclick="App.ask(${js(q)})">${label}</button>`;
  const openBtn = (label, call) => `<button class="btn sm" onclick="${call}">${ic('expand', 12)} ${label}</button>`;

  /* Result tables: a card in the chat that opens in the canvas */
  const TABLES = {
    prospects: () => ({ title: listTitle(), rows: listAccounts(), cols: ['company', 'contact', 'title', 'country', 'size', 'industry', 'identity', 'linkedin'] }),
    scored: () => ({ title: listTitle() + ' · scored', rows: listAccounts().slice().sort((p, q) => q.score - p.score), cols: ['company', 'tier', 'score', 'fit', 'timing', 'whynow', 'owner', 'contact'] }),
    segmented: () => ({ title: listTitle() + ' · by micro-segment', rows: listAccounts().slice().sort((p, q) => (p.seg || 'z').localeCompare(q.seg || 'z')), cols: ['company', 'segment', 'mode', 'tier', 'score', 'contact', 'owner'] }),
    sent: () => ({ title: `Emails sent this week · ${isMgr ? 'team' : 'you'}`, rows: ACCOUNTS.filter(a => mine(a) && (a.campaign || (a.nba && /auto|sent/.test(a.nba.status)))), cols: ['company', 'contact', 'status', 'owner'] }),
    ranked: () => ({ title: `Who to contact first · ${isMgr ? 'team' : 'your accounts'}`, rows: ACCOUNTS.filter(mine).filter(a => a.score > 0), cols: ['company', 'tier', 'score', 'whynow', 'segment', 'status', 'owner'] }),
  };
  const COL = {
    company: ['Company', a => `<div style="display:flex;align-items:center;gap:8px"><span class="logo-dot">${esc(a.name[0])}</span><span class="nm">${esc(a.name)}</span></div>`],
    contact: ['Contact', a => esc(a.contact.name)],
    title: ['Title', a => `<span class="sm">${esc(a.contact.title)}</span>`],
    country: ['Country', a => esc(a.country)],
    size: ['Employees', a => esc(a.size.replace(' staff', ''))],
    industry: ['Industry', a => esc(a.industry)],
    identity: ['Identity', a => idBadge(a.contact.idTier)],
    linkedin: ['LinkedIn', () => `<span class="li-ic">${ic('li', 14)}</span>`],
    tier: ['Tier', a => tierBadge(a.tier)],
    score: ['Score', a => `<span class="mono">${sc(a)}</span>`],
    fit: ['Fit', a => `<span class="mono">${a.fit}</span>`],
    timing: ['Timing', a => `<span class="mono">${a.timing}</span>`],
    whynow: ['Why now', a => a.whyNow ? `${esc(a.whyNow.type)}<div class="sm">${ago(a.whyNow.age)}</div>` : '<span class="muted">No live signal</span>'],
    owner: ['Owner', a => esc(first(USERS[a.owner].name))],
    segment: ['Micro-segment', a => a.seg ? esc(a.segment) : '<span class="muted">–</span>'],
    mode: ['Mode', a => a.seg ? modeBadge(segOf(a.seg)) : '<span class="badge b-grey nodot">Watch</span>'],
    status: ['Status', a => stepBadge(a)],
  };
  function tableCard(key, note) {
    const t = TABLES[key]();
    return `<div class="tcard"><div class="tcard-h"><span class="t">${ic('table', 15)} ${esc(t.title)}</span><span class="muted" style="font-size:12px;white-space:nowrap">${t.rows.length} records</span><div class="sp"></div>
        <button class="ic-btn" title="Save as a list" onclick="App.ask('Save as a list')">${ic('savei', 15)}</button><button class="ic-btn" title="Download" onclick="App.toast('Downloads are a placeholder in the mock')">${ic('dl', 15)}</button>
        <button class="btn sm" onclick="App.ask('Build the campaign')">${ic('plane', 13)} Add to campaign</button><button class="ic-btn" title="Open beside the chat" onclick="App.openArt('${key}')">${ic('expand', 15)}</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${t.cols.slice(0, 4).map(c => `<th>${COL[c][0]}</th>`).join('')}</tr></thead><tbody>${t.rows.slice(0, 6).map((a, i) => `<tr class="row-link" onclick="App.openRecord('${a.id}','overview')"><td class="mono muted">${i + 1}</td>${t.cols.slice(0, 4).map(c => `<td>${COL[c][1](a)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      ${t.rows.length > 6 ? `<button class="tcard-more" onclick="App.openArt('${key}')">Show all ${t.rows.length} ${ic('expand', 12)}</button>` : ''}</div>${note || ''}`;
  }

  const RENDER = {
    text: m => `<p>${m.html}</p>`,
    modIntro: m => `<p>${MOD_INTRO[m.v]()}</p>${modCard(m.v)}`,
    brief: (m) => {
      const today = todayNBA(), later = openItems().filter(a => mine(a) && !today.includes(a) && !S.decisions[a.id]).length;
      const hot = myReplies().filter(r => r.kind === 'Positive');
      const auto = ACCOUNTS.filter(a => a.nba && a.nba.status === 'auto' && !a.campaign && mine(a)).length, prep = ACCOUNTS.filter(a => a.nba && /auto|sent|review|ready/.test(a.nba.status) && !a.campaign && mine(a)).length;
      const c1 = campOf('c1'), mineIn = ACCOUNTS.filter(a => a.campaign === 'c1' && a.owner === me.id).length, bld = SEGMENTS.find(x => x.mode === 'Building');
      return `${stepsHtml(isMgr ? ['Overnight sweep 06:00 · 61 new signals across the team, 24 qualified', 'Re-scored 81 accounts and re-built 9 micro-segments', `${prep} next actions prepared · ${auto} went ahead on their own`] : ['Overnight sweep 06:00 · 23 new signals on your accounts, 9 qualified', 'Re-scored your accounts · Juniper Petrochem moved into tier A', `Prepared your next actions · ${auto} went ahead on their own`])}
        <p>${isMgr ? `Here's the team's day. <b>${today.length}</b> action${today.length === 1 ? ' needs' : 's need'} you today, <b>${hot.length}</b> prospects said yes, and <b>one new campaign</b> is ready for you to confirm.` : `Here's your day. <b>${today.length}</b> action${today.length === 1 ? '' : 's'} to decide today and <b>${hot.length}</b> prospect${hot.length === 1 ? '' : 's'} to answer. Everything else went ahead on its own.`}</p>
        ${hot.length ? `<div class="ccard" style="border-color:#F1D3D3"><div class="ccard-h"><span class="t" style="color:var(--neg)">${ic('flame', 14)} Answer first · they said yes</span><span class="muted" style="font-size:11px">fast lane</span></div><div class="ccard-b" style="padding:2px 14px">${hot.map(r => `<div class="mini-row"><div class="grow row-link" onclick="App.openThread('${r.id}')"><div class="nm">${esc(r.from)} · ${esc(acct(r.acc).name)}${isMgr ? ` <span class="muted" style="font-weight:400">· ${esc(first(USERS[r.owner].name))}</span>` : ''}</div><div class="sm">"${esc(r.text)}"</div></div><span class="due ${r.at.startsWith('Today') ? 'hot' : 'soon'}" style="font-size:11px">${esc(r.at)}</span><button class="btn sm pri" onclick="App.openThread('${r.id}')">${isMgr ? 'Open' : 'Reply'}</button></div>`).join('')}</div></div>` : ''}
        <div class="ccard"><div class="ccard-h"><span class="t">${ic('bolt', 14)} Next best actions that need you today</span><span class="badge b-sec nodot">${today.length}</span></div>
          <div class="ccard-b" style="padding:0">${today.length ? `<div class="tbl-wrap"><table class="tbl nba-tbl"><thead><tr><th>Account · contact</th><th>Action</th><th>Why it needs you</th><th></th></tr></thead><tbody>${today.map(a => { const d = S.decisions[a.id]; return `<tr><td class="row-link" onclick="App.openRecord('${a.id}','engage')"><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.contact.name)}${isMgr ? ' · ' + esc(first(USERS[a.owner].name)) : ''}</div></td><td>${esc(a.nba.action)}<div class="sm">${a.nba.channel} · ${esc(a.segment)}</div></td><td><span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span></td><td style="white-space:nowrap">${d ? `<span class="badge b-grey nodot">${decLabel(d)}</span>` : /auto|sent/.test(a.nba.status) ? '<span class="badge b-pos">Went ahead</span>' : `${!a.nba.reason || (isMgr && a.nba.sensitive) ? `<button class="btn sm pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : 'Approve'}</button> ` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','engage')">Review</button>`}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Nothing to decide today.</div>'}</div>
          <div class="ccard-f"><span class="muted" style="font-size:11.5px">${auto} went ahead on their own${later ? ` · ${later} more due later this week` : ''}</span><div style="flex:1"></div>${today.some(a => !a.nba.reason && !S.decisions[a.id]) && !isMgr ? '<button class="btn sm pri" onclick="App.approveAll()">Approve all ready</button>' : ''}${openBtn('Approvals', "App.openMod('approvals')")}</div></div>
        <div class="ccard"><div class="ccard-h"><span class="t">${ic('megaphone', 14)} Campaigns to create today · NBC</span><span class="muted" style="font-size:11px">from today's scored list</span></div>
          <div class="ccard-b">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b style="font-size:13px">${esc(c1.name)}</b><div class="sm" style="font-size:12px;color:var(--i2);margin-top:2px">11 accounts announced a planned shutdown in 6 days, which crosses the threshold (10 in 7 days). One campaign instead of 11 separate actions${isMgr ? '' : `; <b>${mineIn} are yours</b>`}.</div></div>${campBadge(c1)}</div>
            <div class="touch-mini">${seqOf(c1).map(t => `<span>${chIc(t.ch)} <b>Day ${t.day}</b> ${t.fmt}</span>`).join('')}</div>
            <div class="sm" style="font-size:11.5px;color:var(--i3);margin-top:8px">Also waiting: <a href="#campaigns" onclick="App.goCampaign('c5');return false">Control-systems hiring surge</a>, drafted from ${isMgr ? 'Sofia\'s' : 'your'} Monday list (${esc(campStatus(campOf('c5')))}). Almost a campaign: <a href="#segments" onclick="App.openSegment('${bld.id}');return false">${esc(bld.name)}</a> has ${bld.building} of 10.</div>
          </div>
          <div class="ccard-f">${isMgr && !S.camp.c1 ? '<button class="btn sm pri" onclick="App.confirmCampaign(\'c1\')">Confirm campaign</button><button class="btn sm" onclick="App.toast(\'Kept as 11 separate next actions (mock)\')">Send as separate actions</button>' : !isMgr && !S.camp.c1 ? '<span class="muted" style="font-size:11.5px">Daniel confirms campaigns.</span><button class="btn sm" onclick="App.toast(\'Your accounts were taken out; they get their own actions (mock)\')">Take mine out</button>' : ''}<div style="flex:1"></div>${openBtn('Review the sequence', "App.goCampaign('c1','steps')")}</div></div>
        ${m && m.home ? '' : '<p style="margin-top:8px">I can run the whole flow here: find prospects, score them, build micro-segments, prepare next actions and campaigns, then track them. Try "Find prospects like my last 10 wins".</p>'}`;
    },
    prospects: () => `${listOf() === 'L1' ? `<p>I found <b>24 people at ${listAccounts().length} accounts</b> that match your ICP and look like your recent wins. <b>2 are held</b> for a person to check, and I removed 4 existing customers.</p>` : (() => { const ls = listAccounts(), held = ls.filter(a => a.contact.idTier >= 4).length; return `<p>I found <b>${ls.length} people</b>: ${esc(listTitle())}. ${held ? `<b>${held}</b> ${held === 1 ? 'is' : 'are'} held for a person to check (identity not confirmed). ` : ''}The list is open on the right. Next, I can score it, group it into micro-segments, and route it to campaigns (NBC) and next best actions (NBA), all in this chat.</p>`; })()}${tableCard('prospects')}<div class="next-row">${btn('Score this list', 'Score this list', true)}${btn('Save as a list', 'Save as a list')}</div>`,
    savedList: m => `<p>Saved as <b>${esc(m.name)}</b>. It's a tab in Accounts now, ready to score, segment or use in a campaign.</p><div class="next-row">${openBtn('Open in Accounts', `App.openList('${m.id}')`)}${btn(m.next || 'Score this list', m.next || 'Score this list', true)}</div>`,
    rankedList: () => { const ls = listAccounts().slice().sort((p, q) => q.score - p.score), n = ls.filter(a => a.score > 0).length; return `<p>Scored with the Score flow. ${n} of ${ls.length} have a live signal${n < ls.length ? '; the ones with none score zero and stay watched' : ''}.</p>${tableCard('scored')}${scoreProcess(ls[0])}<div class="next-row">${btn('Route to NBA and NBC', 'Route to NBA and NBC', true)}${btn('Save the scored list', 'Save the scored list')}</div>`; },
    listSegments: () => {
      const accs = listAccounts(), cid = (accs.find(a => a.campaign) || {}).campaign, c = cid ? campOf(cid) : null, nbc = accs.filter(a => a.campaign), nba = accs.filter(a => a.nba && !a.campaign), watch = accs.filter(a => !a.nba && !a.campaign), trig = c && segOf(c.seg) ? segOf(c.seg).trigger.toLowerCase() : '';
      return `<p>Grouped the scored list by each account's strongest trigger, then routed it. ${c ? `<b>${nbc.length} accounts share the same trigger (${esc(trig)})</b>, which crosses the threshold (10 in 7 days), so they go to <b>one campaign (NBC)</b>. ` : 'No trigger reached the campaign threshold (10 in 7 days). '}<b>${nba.length}</b> get their own <b>next best action (NBA)</b>${watch.length ? `; ${watch.length} with no live signal stay${watch.length === 1 ? 's' : ''} watched` : ''}.</p>
        <div class="route">
          ${c ? `<div class="route-col"><div class="route-h"><span class="badge b-brand">NBC · one campaign</span><b>${nbc.length} accounts</b></div>
            <div class="nm">${esc(c.name)}</div><div class="touch-mini">${seqOf(c).map(t => `<span>${chIc(t.ch)} <b>Day ${t.day}</b> ${esc(t.fmt)}</span>`).join('')}</div>
            <div class="sm">${nbc.slice(0, 4).map(a => esc(a.name)).join(', ')}${nbc.length > 4 ? ` and ${nbc.length - 4} more` : ''}</div>
            <div class="sm" style="margin-top:4px">Owners: ${[...new Set(nbc.map(a => first(USERS[a.owner].name)))].join(', ')}</div>
            <div class="next-row">${openBtn('Open campaign', `App.goCampaign('${c.id}')`)}${assignAll(nbc.map(a => a.id), 'the campaign')}${isMgr ? `<button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm</button>` : S.camp[c.id] ? `<span class="badge b-ter">${esc(S.camp[c.id])}</span>` : `<button class="btn sm pri" onclick="App.sendForConfirm('${c.id}')">Send to Daniel</button>`}</div></div>` : ''}
          <div class="route-col"><div class="route-h"><span class="badge b-sec">NBA · one at a time</span><b>${nba.length} accounts</b></div>
            ${nba.map(a => { const fails = gate(a).filter(x => !x[1]); return `<div class="mini-row row-link nba-d" onclick="App.openRecord('${a.id}','engage')">${chIc(a.nba.channel)}<div class="grow"><div class="nm">${esc(a.name)} <span class="muted" style="font-weight:400">· ${esc(a.contact.name)}, ${esc(a.contact.title)}</span></div><div class="sm">${esc(a.nba.action)} · ${esc(a.nba.channel)} · due ${esc(a.nba.due || 'today')}</div><div class="sm">${fails.length ? `Waiting: didn't pass ${esc(fails.map(x => x[0].toLowerCase()).join(', '))}` : 'Passed all six checks'}</div></div><div class="nba-r">${stepBadge(a)}${ownerPick(a)}</div></div>`; }).join('')}
            <div class="next-row">${btn('Send them', 'Send them', true)}${assignAll(nba.map(a => a.id), 'the next actions')}${openBtn('Approvals', "App.openMod('approvals')")}</div></div>
        </div>${tableCard('segmented')}`;
    },
    nbaList: () => {
      const accs = listAccounts().filter(a => a.nba);
      return `<p>Next best actions for the ${accs.length} list accounts that aren't in the campaign. Each has a contact, a channel and a draft; the ones on a proven message go ahead on their own.</p>
        <div class="ccard"><div class="ccard-b" style="padding:2px 14px">${accs.map(a => `<div class="mini-row row-link" onclick="App.openRecord('${a.id}','engage')">${chIc(a.nba.channel)}<div class="grow"><div class="nm">${esc(a.name)} <span class="muted" style="font-weight:400">· ${esc(a.contact.name)}</span></div><div class="sm">${esc(a.nba.action)} · ${esc(a.segment)}</div></div>${stepBadge(a)}</div>`).join('')}</div></div>
        <div class="next-row">${btn('Build the campaign', 'Build the campaign', true)}${openBtn('Approvals', "App.openMod('approvals')")}</div>`;
    },
    flowCampaign: () => { const c = campOf((listAccounts().find(a => a.campaign) || {}).campaign || 'c5'); return seqCard(c, `Here's the campaign for the ${c.accounts.length} accounts that share a trigger: <b>${seqOf(c).length} touches</b>, email and LinkedIn, personalised per person. Add, remove, reorder or rewrite any touch.`); },
    campaign: m => seqCard(campOf(m.id), esc(segOf(campOf(m.id).seg).why)),
    seqChanged: m => seqCard(campOf(m.id), m.note),
    ranked: () => `<p>Ranked by <b>Fit × Timing</b>. A great fit with no live signal scores zero.</p>${tableCard('ranked')}${scoreProcess()}`,
    why: m => {
      const a = acct(m.id), sig = a.signals.slice().sort((p, q) => q.weight - p.weight);
      return `<p><b>${esc(a.name)}</b> is #${a.rank}: it fits well <i>and</i> something changed.</p>
        <div class="ccard"><div class="ccard-b"><div class="formula sm-f"><div class="box"><div class="v">${a.fit}</div><div class="k">Fit</div></div><span class="op">×</span><div class="box"><div class="v">${a.timing}</div><div class="k">Timing</div></div><span class="op">=</span><div class="box hl"><div class="v">${sc(a)}</div><div class="k">Tier ${a.tier}</div></div></div>
          ${sig.map((x, i) => `<div class="mini-row"><span class="badge ${x.tier === 1 ? 'b-pos' : x.tier === 2 ? 'b-sec' : 'b-grey'} nodot">T${x.tier}</span><div class="grow"><div class="nm">${esc(x.type)}</div><div class="sm">${ago(x.age)} · ${esc(x.source)}</div></div><span class="mono" style="font-size:12px">${i === 0 ? '' : i === 1 ? '½×' : '¼×'}${x.weight}</span></div>`).join('')}
        </div><div class="ccard-f">${btn('What should I do?', 'What should I do with ' + a.name.split(' ')[0] + '?', true)}${openBtn('Open', `App.openRecord('${a.id}','overview')`)}</div></div>`;
    },
    segments: () => {
      const row = s => { const n = ACCOUNTS.filter(a => a.seg === s.id && mine(a)).length; return `<div class="mini-row row-link" onclick="App.openSegment('${s.id}')"><div class="grow"><div class="nm">${esc(s.name)}</div><div class="sm">${n} ${isMgr ? '' : 'of yours · '}${s.mode === 'NBC' ? esc(campStatus(campOf(s.campaign))) : s.proven + ' message'}</div></div>${modeBadge(s)}</div>`; };
      return `<p>Segments with <b>10 or more accounts in 7 days</b> run as a campaign once ${isMgr ? 'you confirm' : 'Daniel confirms'}. The rest are next best actions, one account at a time. Sensitive segments never become campaigns.</p>
        <div class="ccard"><div class="ccard-h"><span class="t">${ic('megaphone', 14)} Campaigns (NBC)</span></div><div class="ccard-b" style="padding:2px 14px">${SEGMENTS.filter(s => s.mode === 'NBC').map(row).join('')}</div></div>
        <div class="ccard"><div class="ccard-h"><span class="t">${ic('bolt', 14)} ${isMgr ? 'Next best actions (NBA)' : 'My actions (NBA)'}</span></div><div class="ccard-b" style="padding:2px 14px">${SEGMENTS.filter(s => s.mode !== 'NBC').map(row).join('')}</div></div>`;
    },
    campaigns: () => `<p>${CAMPAIGNS.filter(c => c.status === 'Running').length} campaigns running, ${CAMPAIGNS.filter(c => /Ready|Draft/.test(c.status)).length} waiting to start.</p>
      ${CAMPAIGNS.filter(c => c.status !== 'Completed').map(c => { const st = campStats(c); return `<div class="ccard row-link" onclick="App.goCampaign('${c.id}')"><div class="ccard-h"><span class="t">${esc(c.name)}</span>${campBadge(c)}</div><div class="ccard-b"><div class="sm" style="font-size:12px;color:var(--i2)">${progressText(c)}</div><div class="mstats">${[['Enrolled', st.total], ['Replies', st.replies], ['Positive', st.positive], ['Meetings', st.meetings], ['Reply rate', pct(st.replies, st.started)]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div><div class="sm" style="font-size:11.5px;color:var(--i3);margin-top:6px">Latest: ${esc(c.updates[0].x)}</div></div></div>`; }).join('')}`,
    replies: () => { const rp = myReplies(); return rp.length ? `<p>${rp.length} repl${rp.length === 1 ? 'y' : 'ies'}, newest first:</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${rp.map(r => `<div class="mini-row row-link" onclick="App.openThread('${r.id}')"><span class="badge ${KIND_B[r.kind]}">${r.kind}</span><div class="grow"><div class="nm">${esc(r.from)} · ${esc(acct(r.acc).name)}</div><div class="sm">"${esc(r.text)}"</div></div></div>`).join('')}</div></div>` : '<p>No new replies.</p>'; },
    blockers: () => { const b = myBlockers(); return b.length ? `<p>What's in the way right now:</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${b.map(x => `<div class="mini-row"><span class="badge b-${x.k === 'neg' ? 'neg' : 'warn'} nodot">!</span><div class="grow"><div class="nm">${esc(x.t)}</div><div class="sm" style="white-space:normal">${esc(x.d)}</div></div></div>`).join('')}</div></div>` : '<p>Nothing is blocked.</p>'; },
    nba: m => nbaCard(acct(m.id), m.note),
    learned: () => `<p>What the system learned from this month's outcomes (misses count too):</p>
      <div class="ccard"><div class="ccard-b" style="padding:2px 14px">${LEARNED.map(l => `<div class="mini-row"><span class="badge b-${l.k} nodot">${l.k === 'pos' ? '↑' : l.k === 'neg' ? '↓' : l.k === 'warn' ? '!' : 'i'}</span><div class="grow"><div class="nm">${esc(l.t)}</div><div class="sm" style="white-space:normal">${esc(l.d)}</div></div></div>`).join('')}</div></div>`,
    team: () => `<p>Your team this week: <b>7 meetings booked</b> against a target of 15; reps accepted <b>77%</b> of recommendations first time. <b>Kenji</b> is behind: 3 overdue, no meetings. I suggest moving Banyan Gas and Coral Bay Refining to Aisha.</p>
      <div class="ccard"><div class="ccard-b" style="padding:2px 14px">${REPS.map(r => { const t = TEAM_STATS[r]; return `<div class="mini-row row-link" onclick="App.repApprovals('${r}')">${avatar(USERS[r], 24)}<div class="grow"><div class="nm">${esc(USERS[r].name)}</div><div class="sm">${t.todo} to do · ${t.replies} replies · ${t.meetings}/${t.target} meetings</div></div>${t.overdue ? `<span class="badge b-neg">${t.overdue} overdue</span>` : '<span class="badge b-pos">On track</span>'}</div>`; }).join('')}</div>
      <div class="ccard-f"><button class="btn sm pri" onclick="App.reassign(['banyan','coralbay'],'aisha')">Move 2 to Aisha</button><button class="btn sm" onclick="App.toast('Nudge sent to Kenji (mock)')">Nudge Kenji</button></div></div>`,
    todo: () => `<p>Your list, most urgent first:</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${todos().map(x => `<div class="mini-row row-link" onclick="App.runTodo('${x.id}')"><div class="grow"><div class="nm">${esc(x.t)}</div><div class="sm">${esc(x.d)}</div></div><span class="due ${x.cls}" style="font-size:11px">${esc(x.due)}</span></div>`).join('')}</div></div>`,
    approvalsList: () => { const items = apprItems(isMgr ? 'needs' : 'todo'); return items.length ? `<p>${isMgr ? 'These need your sign-off:' : 'Waiting for you:'}</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${items.map(apprMini).join('')}</div></div>` : '<p>Nothing is waiting for you right now.</p>'; },
    docCard: () => { const d = S.studio.doc; return d ? `<button class="doc-card" onclick="App.focusDoc()"><span class="doc-ic">${ic(d.type === 'Whitepaper' ? 'doc' : 'pen', 18)}</span><span><b>${esc(d.title)}</b><span class="sm">${esc(d.type)} · Open in the canvas</span></span></button>` : ''; },
    catchup: () => catchupTile(),
    standing: () => standingTile(),
    needsYou: () => needsYouList(),
    teamTile: () => `<p>Your team, with work you can move between reps:</p>${teamCard()}`,
    greet: () => greetMsg(),
    lastTouch: m => lastTouchCard(acct(m.id)),
    followUp: m => { const a = acct(m.id), fn = first(a.contact.name), rep = first(USERS[a.owner].name); return `<p>A follow-up for <b>${esc(a.contact.name)}</b>, built from the last touchpoint. It passed the brand voice and approved-claims checks.</p>
      <div class="lt"><div class="lt-h">${chIc('Email')}<b>Re: ${esc(a.whyNow ? a.whyNow.type : 'our last note')}</b>${mkAI('Drafted by the AI')}</div>
      <div class="lt-m"><div class="lt-b">Hi ${esc(fn)},<br><br>Following up on the comparison I sent: most teams in your position start with a 30-minute walkthrough of the lifecycle cost and the outage windows for their own site. Would Tuesday or Wednesday next week work?<br><br>Best,<br>${esc(rep)}</div></div>
      <div class="lt-f"><button class="btn sm pri" onclick="App.toast('Sent for approval: it waits in Approvals (mock)')">Send for approval</button><button class="btn sm" onclick="App.ask('Make it shorter')">Make it shorter</button><button class="btn sm" onclick="App.openRecord('${a.id}','engage')">Open in the panel</button></div></div>`; },
    objective: m => { const c = chat(); return `<p>I've named this chat for the goal and will track it here. ${c.obj.total} accounts ${/^Red/.test(c.title) ? 'are red this week' : 'are in scope'}, most urgent first; the list is on the right. I work what I can on my own and bring you the rest.</p>`; },
    objectiveFull: m => { const c = chat(); return `<p>I've named this chat for the goal and will track it here. ${c.obj.total} accounts ${/^Red/.test(c.title) ? 'are red this week' : 'are in scope'}, most urgent first. I work what I can on my own and bring you the rest.</p>${objList(c, m.done || [])}`; },
    objCatchup: () => { const c = chat(), d = objDone(c), need = c.obj.ids.filter(id => !d.includes(id));
      const bar = `<div class="zmini"><div class="zt-bar"><i style="width:${Math.round(d.length / c.obj.total * 100)}%"></i></div><span>${d.length} of ${c.obj.total} done · the full list is on the right</span></div>`;
      if (c.id === 'red') return `<p>Picking up where you left off on Monday at 17:20. Since then I worked this objective on my own: <b>2 follow-ups</b> went out (Halcyon, Tidewater), <b>Ironwood</b> booked a meeting and <b>Eastgate</b> said yes. <b>${need.length} accounts still need you</b>, starting with Cedar: the renewal offer has to be chosen before Friday.</p>${bar}<div class="hints" style="margin:8px 0 0"><button class="chip" onclick="App.openRecord('cedar','engage')">Start with Cedar</button><button class="chip" onclick="App.openThread('reastgate')">Answer Eastgate</button></div>`;
      return `<p>Here is where this objective stands: <b>${d.length} done</b>, <b>${need.length} open</b>. I work the ones that pass every check on my own and hold the rest for you.</p>${bar}`; },
    objCatchupFull: () => { const c = chat(); const d = objDone(c), need = c.obj.ids.filter(id => !d.includes(id));
      if (c.id !== 'red') { const auto = c.obj.ids.filter(id => !d.includes(id) && acct(id).nba && acct(id).nba.status === 'auto').length;
        return `<p>Here is where this objective stands. I am working the ones that pass every check on my own and holding the rest for you.</p>
        <div class="zt"><div class="zt-h"><b>Catch-up on this objective</b><span class="muted">Started today</span></div><div class="zt-stats">
        ${zStat(d.length, 'done so far', mkAI(), '')}${zStat(auto, 'being worked on its own', mkAI(), "App.openAppr('ahead')")}${zStat(need.length - auto, 'need you before they go', mkWait(), `App.openAppr('${isMgr ? 'needs' : 'todo'}')`, 'zgap')}</div>
        <div class="zt-bar"><i style="width:${Math.round(d.length / c.obj.total * 100)}%"></i></div><div class="zt-f"><span>${d.length} of ${c.obj.total} done${c.notes && c.notes.length ? ' · your note: ' + esc(c.notes[c.notes.length - 1]) : ''}</span></div></div>${objList(c, d)}`; }
      return `<p>Picking up where you left off on Monday at 17:20. Since then I worked this objective on my own.</p>
        <div class="zt"><div class="zt-h"><b>Catch-up on this objective</b><span class="muted">Mon 17:20 to now</span></div><div class="zt-stats">
        ${zStat(2, 'follow-ups sent: Halcyon, Tidewater', mkAI(), "App.ask('Which of these went ahead on their own?')")}${zStat(1, 'meeting booked: Ironwood Refining', mkAI(), "App.openRecord('ironwood','activity')")}${zStat(1, 'said yes: Eastgate Refinery', mkHu('From the customer'), "App.openThread('reastgate')")}${zStat(need.length, 'left that need you', mkWait(), '', 'zgap')}</div>
        <div class="zt-bar"><i style="width:${Math.round(d.length / c.obj.total * 100)}%"></i></div><div class="zt-f"><span>${d.length} of ${c.obj.total} done${c.notes && c.notes.length ? ' · your note: ' + esc(c.notes[c.notes.length - 1]) : ''}</span></div></div>${objList(c, d)}`; },
    reminder: m => `<div class="zn">${ic('clock', 14)}<span><b>Reminder set</b> for ${esc(m.when)}, in this chat. When you come back it opens with a catch-up.</span></div>${m.extra ? `<div class="zn">${ic('pen', 14)}<span><b>Note to self:</b> ${esc(m.extra)}</span></div>` : ''}`,
    note: m => `<div class="zn">${ic('pen', 14)}<span><b>Note to self:</b> ${esc(m.text)}</span></div>`,
    autonomy: () => autonomyCard(),
    stuck: () => stuckCard(),
    help: () => `<p>I can run the whole flow. Try:</p><div class="hints" style="margin:4px 0">${['Find prospects like my last 10 wins', 'Score this list', 'Create micro-segments', 'Prepare the next actions', 'Build the campaign', 'How are the campaigns doing?', 'What did we learn this week?', 'Write a blog on planning a control system migration'].map(h => `<button class="chip" onclick="App.ask(${js(h)})">${esc(h)}</button>`).join('')}</div>`,
  };
  const attnChats = () => S.chats.filter(c => c.attn);
  const attnLine = c => c.obj ? `Catch-up ready · ${c.obj.total - objDone(c).length} need you` : (c.attnText || 'Something new since you left');
  const callouts = () => attnChats().map(c => `<button class="zcall" onclick="App.openChat('${c.id}')"><span class="zcall-ic">${ic(c.obj ? 'flag' : 'chat', 15)}</span><span class="zcall-m"><b>${esc(c.title)}</b><em>${esc(attnLine(c))}</em></span><span class="btn sm pri">Pick up</span></button>`).join('');
  function lastTouchCard(a) {
    const act = a.activity || [], touchK = /sent|open|reply|click|meeting|call|out/;
    const touches = act.filter(x => touchK.test(x.k)), sent = act.filter(x => x.k === 'sent' || x.msg), last = sent[sent.length - 1];
    const after = last ? act.slice(act.indexOf(last) + 1).filter(x => touchK.test(x.k)) : [];
    const ch = last ? (/LinkedIn/i.test(last.t) ? 'LinkedIn' : 'Email') : (a.nba && a.nba.channel) || 'Email';
    const byAI = a.campaign || (a.nba && /auto|sent/.test(a.nba.status));
    const replied = after.some(x => /reply/.test(x.k)), opened = after.filter(x => /open|click/.test(x.k)).length;
    const verdict = replied ? 'They replied: answer first.' : opened ? `Opened ${opened > 1 ? opened + ' times' : 'it'}, no reply yet: same channel ${sent.length} times, so change the channel.` : 'No response yet.';
    if (!last) return `<p>No touches have gone to <b>${esc(a.contact.name)}</b> at ${esc(a.name)} yet. ${a.nba ? `The next best action is ready: <b>${esc(a.nba.action)}</b> by ${esc(a.nba.channel)}.` : ''}</p><div class="hints" style="margin:6px 0 0"><button class="chip" onclick="App.openRecord('${a.id}','engage')">Open the next best action</button></div>`;
    return `<p>The last touchpoint with <b>${esc(a.contact.name)}</b> at ${esc(a.name)}:</p>
      <div class="lt"><div class="lt-h">${chIc(ch)}<b>${esc(last.t)}</b><span class="lt-w">${esc(last.when)}</span>${byAI ? mkAI('Sent on its own') : mkHu('Sent by ' + first(USERS[a.owner].name))}</div>
        ${last.msg ? `<div class="lt-m"><div class="lt-s">${esc(last.msg.subject)}</div><div class="lt-b">${esc(last.msg.body).replace(/\n+/g, ' ').slice(0, 220)}${last.msg.body.length > 220 ? '…' : ''}</div></div>` : `<div class="lt-m"><div class="lt-b">${esc(last.d)}</div></div>`}
        <div class="lt-a"><b>What happened</b>${after.length ? after.slice(-3).map(x => `<div class="lt-r"><i class="${/reply/.test(x.k) ? 'pos' : ''}"></i><span>${esc(x.t)}</span><em>${esc(x.when)}</em></div>`).join('') : '<div class="lt-r"><i></i><span>Delivered, nothing since</span></div>'}</div>
        <div class="lt-v">${ic('spark', 13)}<span>${verdict}</span></div>
        <div class="lt-t"><b>Earlier</b>${touches.filter(x => x !== last && !after.includes(x)).slice(-3).reverse().map(x => `<span>${esc(x.when)} · ${esc(x.t)}</span>`).join('') || '<span>No earlier touches</span>'}</div>
        <div class="lt-f"><button class="btn sm pri" onclick="App.ask(${js('Draft a follow-up for ' + a.name)})">Draft a follow-up</button>${!replied && opened ? `<button class="btn sm" onclick="App.ask(${js('Change the channel for ' + a.name)})">Change the channel</button>` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','activity')">Open the full activity</button></div></div>`;
  }
  function greetMsg() {
    const auto = ACCOUNTS.filter(a => a.nba && a.nba.status === 'auto' && !a.campaign && mine(a)).length, reps = isMgr ? REPS : [me.id];
    const meet = reps.reduce((n, r) => n + TEAM_STATS[r].meetings, 0), tgt = reps.reduce((n, r) => n + TEAM_STATS[r].target, 0), k = CU.since;
    const ac = attnChats();
    return `<p>${greeting()}, ${esc(first(me.name))}. Since you last logged in the AI found <b>${k.sig.split(',')[0]}</b>, sent <b>${auto} next best actions</b> on its own and booked <b>${k.meet} meeting</b>. ${isMgr ? 'The team is' : 'You are'} <b>${tgt - meet} meetings short</b> of this week's target. <b>${badgeCount() + myReplies().filter(r => r.kind === 'Positive').length} things need you</b>; the full catch-up is on the right.</p>
      ${ac.length ? `<div class="zcall-l"><div class="lbl">Picking up from your chats</div>${callouts()}</div>` : ''}`;
  }
  /* ─── Today tiles and the shared list (one component for every list with actions) ─── */
  const zStat = (v, l, mark, on, cls) => `<button class="zs ${cls || ''}" ${on ? `onclick="${on}"` : 'disabled'}><b>${v}</b><span>${l}</span>${mark || ''}</button>`;
  const CU = {
    since: { when: 'Mon 26 Oct 18:40', sig: isMgr ? '61 new signals, 24 qualified' : '23 new signals, 9 qualified', sc: isMgr ? 81 : 19, segs: isMgr ? 9 : 4, camp: 1, meet: 1 },
    today: { when: 'Today since 00:00', sig: isMgr ? '58 new signals, 22 qualified' : '21 new signals, 8 qualified', sc: isMgr ? 78 : 18, segs: isMgr ? 9 : 4, camp: 1, meet: 1 },
    week: { when: 'This week, Mon to now', sig: isMgr ? '212 new signals, 87 qualified' : '64 new signals, 25 qualified', sc: isMgr ? 214 : 52, segs: isMgr ? 9 : 4, camp: 2, meet: isMgr ? 7 : 2 },
  };
  function catchupTile() {
    const k = CU[cuF], auto = ACCOUNTS.filter(a => a.nba && a.nba.status === 'auto' && !a.campaign && mine(a)).length, prep = ACCOUNTS.filter(a => a.nba && /auto|sent|review|ready/.test(a.nba.status) && !a.campaign && mine(a)).length;
    const blk = myBlockers().find(b => b.k === 'neg'), wk = cuF === 'week' ? 3 : 1;
    return `<p>${greeting()}, ${esc(first(me.name))}. Here is what the AI did while you were away${isMgr ? ', across the team' : ''}. Every number opens its list.</p>
      <div class="zt"><div class="zt-h"><b>What happened · ${k.when}</b><span class="zseg">${[['since', 'Since you last logged in'], ['today', 'Today'], ['week', 'This week']].map(([x, l]) => `<button class="${cuF === x ? 'on' : ''}" onclick="App.setCu('${x}')">${l}</button>`).join('')}</span></div>
      <div class="zt-stats">
        ${zStat(k.sig.split(',')[0].replace(' new signals', ''), 'new signals found, ' + k.sig.split(', ')[1], mkAI('AI'), "App.openArt('ranked')")}
        ${zStat(k.sc, `accounts re-scored, ${k.segs} micro-segments rebuilt`, mkAI('AI'), "App.openArt('ranked')")}
        ${zStat(prep * wk, 'next best actions prepared', mkAI('AI'), "App.openMod('segments')")}
        ${zStat(auto * wk, 'went out on their own after passing all six checks', mkAI(), "App.openAppr('ahead')")}
        ${zStat(k.camp, k.camp > 1 ? 'campaigns proposed' : 'campaign proposed: Turnaround season 2027', mkAI('AI'), "App.goCampaign('c1')")}
        ${zStat(myReplies().length, 'replies from prospects', mkHu('From customers'), "App.nav('inbox')")}
        ${zStat(k.meet, k.meet > 1 ? 'meetings booked' : 'meeting booked: Ironwood Refining', mkAI(), "App.openRecord('ironwood','activity')")}
        ${zStat(badgeCount(), 'held for a person because a check failed', mkWait(), `App.openAppr('${isMgr ? 'needs' : 'todo'}')`, 'zgap')}
      </div>
      ${blk ? `<div class="zt-warn">${ic('alert', 14)}<span><b>${esc(blk.t)}.</b> ${esc(blk.d)}</span></div>` : ''}
      <div class="zt-f"><span>${mkAI('AI')} done by the AI on its own · ${mkHu('Person')} done by a person · ${mkWait('Needs you')} waiting for you</span><button onclick="App.ask('How much do agents do on their own?')">How much the AI does alone</button></div></div>`;
  }
  function standingTile() {
    const ts = TEAM_STATS, reps = isMgr ? REPS : [me.id], sum = f => reps.reduce((n, r) => n + ts[r][f], 0);
    const meet = sum('meetings'), tgt = sum('target'), sentN = sum('sent'), cap = isMgr ? 160 : 40;
    return `<p>${isMgr ? 'Where the team stands this week, outcomes first.' : 'Where you stand this week, outcomes first.'} You are <b>${tgt - meet} meeting${tgt - meet === 1 ? '' : 's'} short</b> of the target${isMgr ? '; the replies waiting below could close part of that' : ''}.</p>
      <div class="zt"><div class="zt-bar big" role="img" aria-label="${meet} of ${tgt} meetings"><i style="width:${Math.round(meet / tgt * 100)}%"></i></div>
      <div class="zt-stats">
        ${zStat(`${meet}<small> / ${tgt}</small>`, 'meetings booked against target', '', "App.nav('inbox')", 'zgap')}
        ${zStat(isMgr ? 'USD 1.2M' : 'USD 0.3M', 'pipeline the AI influenced', '', isMgr ? "App.nav('analytics')" : "App.openArt('ranked')")}
        ${zStat(sum('replies'), `replies, ${isMgr ? 8 : myReplies().filter(r => /Positive|Meeting/.test(r.kind)).length} positive or booked`, '', "App.nav('inbox')")}
        ${zStat(`${sentN}<small> / ${cap}</small>`, 'emails sent: the activity behind it', '', "App.openArt('sent')")}
      </div></div>`;
  }
  function needsYouList() {
    const rows = [];
    myReplies().filter(r => r.kind === 'Positive').forEach(r => rows.push(`<div class="zr" onclick="App.openThread('${r.id}')"><span class="av" style="background:${USERS[r.owner].color}">${initials(r.from)}</span><div class="zr-m"><div class="zr-t">${esc(r.from)} · ${esc(acct(r.acc).name)}${isMgr ? ` <span>· ${esc(first(USERS[r.owner].name))}</span>` : ''}</div><div class="zr-d">"${esc(r.text)}"</div><div class="zr-why">Said yes: answer first</div></div><div class="zr-m2">${mkHu('Positive reply')}<time>${esc(r.at)}</time></div><button class="btn sm pri" onclick="event.stopPropagation();App.openThread('${r.id}')">${isMgr ? 'Open' : 'Reply'}</button></div>`));
    apprItems(isMgr ? 'needs' : 'todo').forEach(a => rows.push(`<div class="zr" onclick="App.openRecord('${a.id}','engage')">${pAvatar(a, 30)}<div class="zr-m"><div class="zr-t">${esc(a.contact.name)} · ${esc(a.name)}${isMgr ? ` <span>· ${esc(first(USERS[a.owner].name))}</span>` : ''}</div><div class="zr-d">${esc(a.nba.action)} · ${a.nba.channel}</div><div class="zr-why">${esc(reasonOf(a))}: ${esc(a.nba.reasonNote || 'check before it goes out')}</div></div><div class="zr-m2">${S.decisions[a.id] ? mkHu(decLabel(S.decisions[a.id])) : mkWait()}<time>${esc(a.nba.due || '')}</time></div><button class="btn sm" onclick="event.stopPropagation();App.openRecord('${a.id}','engage')">Review</button></div>`));
    if (isMgr && !S.camp.c1) rows.push(`<div class="zr" onclick="App.goCampaign('c1')"><span class="av" style="background:var(--brand)">${ic('megaphone', 13)}</span><div class="zr-m"><div class="zr-t">Turnaround season 2027 <span>· campaign</span></div><div class="zr-d">11 accounts announced a planned shutdown in 6 days</div><div class="zr-why">Campaigns of 10 or more accounts start only when you confirm</div></div><div class="zr-m2">${mkWait()}<time>Today</time></div><button class="btn sm" onclick="event.stopPropagation();App.goCampaign('c1','steps')">Review</button></div>`);
    return `<p>${rows.length} thing${rows.length === 1 ? ' needs' : 's need'} a person. Everything else went ahead on its own.</p>
      <div class="zl"><div class="zl-h"><b>Needs you</b><span class="zl-f"><span class="on">All ${rows.length}</span><span>Replies</span><span>Approvals</span>${isMgr ? '<span>Campaigns</span>' : ''}</span></div>${rows.slice(0, 6).join('')}
      <div class="zl-ft"><button onclick="App.openAppr('${isMgr ? 'needs' : 'todo'}')">Open all beside the chat ${ic('expand', 12)}</button><span>Same list, every row and column</span></div></div>`;
  }
  const objDone = c => (c.obj && c.obj.done) || [];
  const OBJ_NEED = { cedar: 'Renewal: choose the offer before Friday', sapphire: 'Opened 3 times, no reply: change the channel?', eastgate: 'Said yes: answer by 11:00', meridian: 'Medium confidence: sign off or send back' };
  function objList(c, done) {
    return `<div class="zl"><div class="zl-h"><b>${esc(c.title)}</b><span class="zl-f"><span class="on">All ${c.obj.total}</span><span>Done ${done.length}</span><span>Open ${c.obj.total - done.length}</span></span></div>${c.obj.ids.map(id => { const a = acct(id), d = done.includes(id);
      const mark = d ? (id === 'saltmarsh' ? mkHu('Done by ' + first(USERS.pavan.name)) : id === 'ironwood' ? mkAI('Meeting booked on its own') : mkAI('Follow-up sent on its own')) : OBJ_NEED[id] && done.length > 3 ? mkWait() : '';
      return `<div class="zr ${d ? 'done' : ''}" onclick="App.openRecord('${id}','${d ? 'activity' : 'engage'}')">${pAvatar(a, 28)}<div class="zr-m"><div class="zr-t">${esc(a.name)} <span>· ${esc(first(USERS[a.owner].name))}</span></div><div class="zr-d">${esc(a.whyNow ? a.whyNow.text : a.industry)}</div>${!d && OBJ_NEED[id] && done.length > 3 ? `<div class="zr-why">${esc(OBJ_NEED[id])}</div>` : ''}</div><div class="zr-m2">${mark}</div>${d ? '' : `<button class="btn sm" onclick="event.stopPropagation();App.openRecord('${id}','engage')">Work it</button>`}</div>`; }).join('')}
      <div class="zl-ft"><span>Most urgent first. Done items stay so you can see who did them.</span></div></div>`;
  }
  const AUTO = [['status', 'Status updates and follow-ups after a reply', 'From approved templates only', 'Autopilot'], ['nba', 'Next best actions', 'Go out alone when all six checks pass', 'Autopilot'], ['tier1', 'Tier 1 and C-level contacts', 'Always prepared, sent by the rep', 'Assist'], ['camp', 'Campaigns of 10 or more accounts', 'The manager confirms before step 1', 'Assist'], ['price', 'Anything with a price or a commitment', 'Never alone', 'Manual']];
  function autonomyCard() {
    return `<p>This is how much the AI does on its own for ${isMgr ? 'your team' : 'you'}. ${isMgr ? 'You set it for the team; admins set the ceiling.' : 'Your manager sets the ceiling.'} Anything that fails a check comes to a person.</p>
      <div class="zl"><div class="zl-h"><b>How much the AI does alone</b></div>${AUTO.map(([k, t, g, def]) => { const cur = S.auto[k] || def; return `<div class="zr static"><div class="zr-m"><div class="zr-t">${t}</div><div class="zr-d">${g}</div></div><span class="dial">${['Manual', 'Assist', 'Autopilot'].map(x => `<button class="${cur === x ? 'on' : ''}" ${isMgr && k !== 'price' ? `onclick="App.setAuto('${k}','${x}')"` : 'disabled'}>${x}</button>`).join('')}</span></div>`; }).join('')}
      <div class="zl-ft"><span>${mkAI()} marks work done this way on every list.</span></div></div>`;
  }
  function stuckCard() {
    const vals = [0.62, 0.78, 0.91, 1.08, 1.2], labs = ['29 Sep', '6 Oct', '13 Oct', '20 Oct', '27 Oct'], W = 460, H = 150, L = 34, B = 22, T = 18, mx = 1.4, bw = 48, st = (W - L - 8) / vals.length;
    let g = '', bars = '';
    [0, 0.5, 1].forEach(v => { const y = T + (1 - v / mx) * (H - T - B); g += `<line x1="${L}" x2="${W - 4}" y1="${y}" y2="${y}" stroke="#ECEFF3"/><text x="${L - 6}" y="${y + 3}" text-anchor="end">${v}</text>`; });
    vals.forEach((v, i) => { const x = L + i * st + (st - bw) / 2, h = v / mx * (H - T - B), y = H - B - h; bars += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" style="fill:${i === 4 ? 'var(--brand)' : 'var(--brand-mid)'}"/><text x="${x + bw / 2}" y="${H - 7}" text-anchor="middle">${labs[i]}</text><text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" fill="#4A5664">${v}</text>`; });
    const ov = ACCOUNTS.filter(a => a.owner === 'kenji' && a.nba && /ready|review/.test(a.nba.status) && !S.decisions[a.id]).slice(0, 2);
    return `<p>Pipeline the AI influenced is up for the fifth week, to <b>USD 1.2M</b>. Two places are stuck.</p>
      <div class="zt"><div class="zt-h"><b>Pipeline influenced, by week</b><span class="muted">USD M</span></div><div class="zchart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pipeline influenced by week, rising from 0.62 to 1.2 million US dollars">${g}${bars}</svg></div></div>
      <div class="zl"><div class="zl-h"><b>Stuck</b></div>
        <div class="zr" onclick="App.openRecord('sapphire','activity')">${pAvatar(acct('sapphire'), 28)}<div class="zr-m"><div class="zr-t">Sapphire Aromatics <span>· ${esc(first(USERS[acct('sapphire').owner].name))}</span></div><div class="zr-d">Opened the renewal comparison 3 times, no reply</div><div class="zr-why">Same channel three times</div></div><div class="zr-m2">${mkAI('Sent on its own')}</div><button class="btn sm" onclick="event.stopPropagation();App.openRecord('sapphire','activity')">Last touchpoint</button></div>
        ${isMgr && ov.length ? `<div class="zr" onclick="App.viewRep('kenji')"><span class="av" style="background:${USERS.kenji.color}">KM</span><div class="zr-m"><div class="zr-t">Kenji Mori <span>· 3 overdue, no meetings yet</span></div><div class="zr-d">${ov.map(a => esc(a.name)).join(' and ')} ${ov.length > 1 ? 'are' : 'is'} waiting on him</div><div class="zr-why">Aisha has room this week</div></div><div class="zr-m2">${mkWait()}</div><button class="btn sm pri" onclick="event.stopPropagation();App.reassign(${js(ov.map(a => a.id))},'aisha')">Move to Aisha</button></div>` : ''}
      </div>`;
  }
  /* ─── Your day: meetings and the decisions around them, as a day, a week or a list ─── */
  const WEEK = [['Mon', 26], ['Tue', 27], ['Wed', 28], ['Thu', 29], ['Fri', 30]], TODAYI = 1;
  const MEETS = [
    { d: 0, s: '09:00', m: 45, t: 'Team pipeline review', k: 'Internal', w: 'Sofia, Marco, Aisha, Kenji', r: 100, who: ['pavan', 'sofia'] },
    { d: 0, s: '16:00', m: 30, t: '1:1 with Kenji', k: 'Internal', w: 'Kenji Mori', r: 80, who: ['pavan'] },
    { d: 1, s: '09:30', m: 30, t: 'Weekly forecast', k: 'Internal', w: 'Sofia, Marco, Aisha, Kenji', r: 100, who: ['pavan'] },
    { d: 1, s: '11:00', m: 45, t: 'Cedar renewal strategy', acc: 'cedar', k: 'Internal', w: 'Daniel Brooks, Sofia Ahlgren', r: 60, g: 'Choose the offer: extend the support contract or propose the migration path', who: ['pavan', 'sofia'] },
    { d: 1, s: '15:30', m: 30, t: 'Meridian Olefins · intro to the new COO', acc: 'meridian', k: 'Client call', w: 'Somchai Rattana, Marco Lindqvist', r: 40, g: 'Agree a first working session with the new COO', who: ['pavan'] },
    { d: 2, s: '10:00', m: 30, t: 'Turnaround season 2027 · campaign review', k: 'Internal', w: 'Sofia, Marco', r: 70, g: 'Confirm the 11 accounts and step 1', who: ['pavan', 'sofia'] },
    { d: 2, s: '14:00', m: 45, t: 'Juniper Petrochem · discovery call', acc: 'juniper', k: 'Client call', w: 'Budi Hartono, Sofia Ahlgren', r: 55, g: 'Confirm the reliability priorities of the new VP', who: ['pavan', 'sofia'] },
    { d: 3, s: '11:00', m: 45, t: 'Halcyon Gas Processing · scoping', acc: 'halcyon', k: 'Client call', w: 'Sofia Ahlgren', r: 30, g: 'Scope the historian platform question from their job posts', who: ['sofia'] },
    { d: 3, s: '16:00', m: 30, t: '1:1 with Aisha', k: 'Internal', w: 'Aisha Rahman', r: 90, who: ['pavan'] },
    { d: 4, s: '09:00', m: 45, t: 'Weekly team review', k: 'Internal', w: 'Sofia, Marco, Aisha, Kenji', r: 20, who: ['pavan', 'sofia'] },
    { d: 4, s: '14:00', m: 30, t: 'Kingfisher Refining · plant manager intro', acc: 'kingfisher', k: 'Client call', w: 'Linh Pham, Sofia Ahlgren', r: 35, g: 'Introduce the team to the new plant manager', who: ['pavan', 'sofia'] },
  ];
  const myMeets = () => MEETS.filter(x => x.who.includes(me.id));
  const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
  const hhmm = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  const dayIx = str => { if (!str || /Today/.test(str)) return TODAYI; if (/Tomorrow/.test(str)) return TODAYI + 1; const m = str.match(/\b(Mon|Tue|Wed|Thu|Fri)\b/); return m ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(m[1]) : TODAYI; };
  const KIND_ORD = { Decide: 0, Approve: 1, Reply: 2, Review: 3, Ready: 4 };
  function dayItems() {
    const it = [];
    if (isMgr && !S.camp.c1) it.push({ k: 'Decide', t: 'Confirm the Turnaround season 2027 campaign', m: '11 accounts announced a planned shutdown in 6 days · campaigns of 10 or more start only when you confirm', d: TODAYI, due: 'Today', btn: 'Decide', go: "App.goCampaign('c1','steps')" });
    if (isMgr && !ACCOUNTS.find(a => a.id === 'banyan' && a.owner === 'aisha')) it.push({ k: 'Decide', t: 'Move Banyan Gas from Kenji to Aisha', m: 'Kenji has 3 items overdue and no meetings yet · Aisha has room this week', d: TODAYI, due: 'Today', btn: 'Decide', go: "App.reassign(['banyan','coralbay'],'aisha')" });
    it.push({ k: 'Decide', t: 'Choose the Cedar renewal offer: extend or migrate', m: 'Cedar Petrochemicals · Mei Tan opened the comparison twice · decide before Friday', d: 3, due: 'Thu 29 Oct', acc: 'cedar', btn: 'Decide', go: "App.openRecord('cedar','engage')" });
    myReplies().filter(r => r.kind === 'Positive' && !S.handled[r.id]).forEach(r => it.push({ k: 'Reply', t: `Answer ${r.from} · ${acct(r.acc).name}`, m: `Said yes: "${r.text.length > 80 ? r.text.slice(0, 78) + '…' : r.text}"${isMgr ? ' · ' + first(USERS[r.owner].name) : ''}`, d: TODAYI, due: /Today/.test(r.at) ? 'Today' : 'Overdue', acc: r.acc, btn: isMgr ? 'Open' : 'Reply', go: `App.openThread('${r.id}')` }));
    apprItems(isMgr ? 'needs' : 'todo').forEach(a => { if (S.decisions[a.id]) return; it.push({ k: 'Approve', t: `${a.nba.action} · ${a.name}`, m: `${a.contact.name} · ${reasonOf(a)}${isMgr ? ' · ' + first(USERS[a.owner].name) : ''}`, d: dayIx(a.nba.due), due: a.nba.due || 'Today', acc: a.id, btn: isMgr ? 'Sign off' : 'Approve', go: `App.openRecord('${a.id}','engage')`, sc: a.score }); });
    if (isMgr || acct('sapphire').owner === me.id) it.push({ k: 'Review', t: 'Going cold · Sapphire Aromatics', m: 'Opened the renewal comparison 3 times, no reply · a LinkedIn nudge is drafted', d: TODAYI, due: 'Today', acc: 'sapphire', btn: 'Review the nudge', go: "App.openRecord('sapphire','activity')" });
    it.push({ k: 'Review', t: 'What happened? · Quartz Olefins comparison', m: 'Downloaded 4 days ago, nothing logged since · one click tells the AI', d: 2, due: 'Wed 28 Oct', btn: 'Log the outcome', go: "App.ask('What happened with the Quartz Olefins comparison?')" });
    it.push({ k: 'Ready', t: 'Follow-ups after the Ironwood meeting', m: 'Ironwood Refining · the AI drafted the recap and the next step from the call notes', d: 2, due: 'Wed 28 Oct', acc: 'ironwood', btn: 'Open follow-ups', go: "App.openRecord('ironwood','activity')" });
    it.push({ k: 'Review', t: '5 new prospects to qualify', m: 'Found by the weekly prospect refresh · best fit 81%', d: 3, due: 'Thu 29 Oct', btn: 'Review', go: "App.ask('Find prospects like my last 10 wins')" });
    return it.map(x => Object.assign(x, { d: Math.max(TODAYI, Math.min(4, x.d)) })).sort((p, q) => p.d - q.d || KIND_ORD[p.k] - KIND_ORD[q.k] || (q.sc || 0) - (p.sc || 0));
  }
  const KTAG = { Decide: 'neg', Approve: 'warn', Reply: 'pos', Review: 'sec', Ready: 'pos' };
  const ktag = k => `<span class="yk ${KTAG[k]}">${k}</span>`;
  function yourDay() {
    const all = dayItems(), items = all.filter(x => dayFilt === 'all' || x.k === dayFilt), cnt = k => all.filter(x => x.k === k).length;
    const kinds = ['Decide', 'Approve', 'Reply', 'Review'].filter(cnt);
    const head = `<div class="yd-h"><div><div class="bsec-t">Your ${dayView === 'day' ? 'day' : 'week'}</div><div class="yd-s">${kinds.map(k => `${cnt(k)} to ${k.toLowerCase()}`).join(' · ')} · placed where you have time, most urgent first</div></div>
      <div class="yd-c"><span class="yd-f">${[['all', `All · ${all.length}`]].concat(kinds.map(k => [k, `${k} · ${cnt(k)}`])).map(([k, l]) => `<button class="${dayFilt === k ? 'on' : ''}" onclick="App.setDay(null,'${k}')">${l}</button>`).join('')}</span>
      <span class="zseg">${[['day', 'Day'], ['week', 'Week'], ['list', 'List']].map(([k, l]) => `<button class="${dayView === k ? 'on' : ''}" onclick="App.setDay('${k}')">${l}</button>`).join('')}</span></div></div>`;
    return head + (dayView === 'week' ? weekView(items) : dayView === 'list' ? listView(items) : dayViewH(items));
  }
  const yRow = (x, n) => `<div class="yr ${x.k === 'Decide' ? 'dec' : ''}">${n != null ? `<span class="yr-n">${n}</span>` : ''}${ktag(x.k)}<div class="yr-m"><b>${esc(x.t)}</b><span>${esc(x.m)}</span></div><span class="yr-due ${/Today|Overdue/.test(x.due) ? 'now' : ''}">${esc(x.due)}</span><button class="btn sm ${x.k === 'Decide' ? 'pri' : ''}" onclick="${x.go}">${x.btn} ${ic('right', 12)}</button></div>`;
  function meetCard(mt, items) {
    const linked = items.filter(x => mt.acc && x.acc === mt.acc), end = hhmm(toMin(mt.s) + mt.m), past = mt.d < TODAYI;
    return `<div class="ym-row"><div class="ym-t">${mt.s}<br>${end}</div><div class="ym ${mt.k === 'Client call' ? 'client' : ''} ${past ? 'past' : ''}">
      <div class="ym-h"><i></i><b>${esc(mt.t)}</b></div><div class="ym-s">${mt.k} · ${mt.m} min · ${esc(mt.w)}</div>
      ${mt.g ? `<div class="ym-g"><span class="badge ${mt.r >= 60 ? 'b-pos' : 'b-warn'}">${mt.r >= 60 ? 'Prep ready' : 'Prep in progress'}</span><span>Goal: ${esc(mt.g)}</span></div>` : ''}
      <div class="ym-p"><span class="ym-bar"><i style="width:${mt.r}%"></i></span><b>${mt.r}%</b><span>${mt.r >= 100 ? 'Everything is ready' : mt.r >= 60 ? 'Prep ready · practice not done yet' : 'The AI is still preparing'}</span></div>
      ${linked.map(x => `<div class="ym-l">${ktag(x.k)}<span>${esc(x.t)}</span><em>${esc(x.due)}</em><button onclick="${x.go}">${x.btn} ${ic('right', 11)}</button></div>`).join('')}
      <div class="ym-a">${mt.acc ? `<button class="btn sm pri" onclick="App.openRecord('${mt.acc}','overview')">Open prep</button>` : `<button class="btn sm pri" onclick="App.ask(${js('Prep me for ' + mt.t)})">Open prep</button>`}${mt.k === 'Client call' ? `<button class="btn sm" onclick="App.ask(${js('Let me practise the objections for ' + mt.t)})">Practise objections</button>` : ''}<button class="btn sm" onclick="App.notes(true)">Add context</button>${mt.k === 'Client call' ? `<button class="btn sm" onclick="App.toast('Joins the call from your calendar (mock)')">Join call</button>` : ''}${mt.acc ? `<button class="ym-acc" onclick="App.openRecord('${mt.acc}','overview')">${esc(acct(mt.acc).name)}</button>` : ''}</div>
    </div></div>`;
  }
  function dayViewH(items) {
    const ms = myMeets(), strip = `<div class="yd-strip">${WEEK.map(([d, n], i) => { const c = ms.filter(x => x.d === i).length; return `<button class="${daySel === i ? 'on' : ''} ${i < TODAYI ? 'past' : ''}" onclick="App.setDay(null,null,${i})"><span>${i === TODAYI ? 'Today' : d}</span><b>${n}</b><em>${c} meeting${c === 1 ? '' : 's'}</em></button>`; }).join('')}</div>`;
    const dm = ms.filter(x => x.d === daySel).sort((p, q) => toMin(p.s) - toMin(q.s)), di = items.filter(x => x.d === daySel);
    const linked = new Set(dm.filter(m => m.acc).map(m => m.acc)), free = di.filter(x => !x.acc || !linked.has(x.acc));
    const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
    let out = '', freeAt = dm.findIndex((m, i) => dm[i + 1] && toMin(dm[i + 1].s) - (toMin(m.s) + m.m) >= 90);
    if (freeAt < 0) freeAt = dm.length - 1;
    let nowShown = daySel !== TODAYI;
    dm.forEach((m, i) => {
      if (!nowShown && toMin(m.s) > nowM) { out += `<div class="yd-now"><span>Now · ${hhmm(nowM)}</span></div>`; nowShown = true; }
      out += meetCard(m, di);
      if (i === freeAt && free.length) { const gap = dm[i + 1] ? toMin(dm[i + 1].s) - (toMin(m.s) + m.m) : null; out += `<div class="yd-free"><div class="yd-fh">${gap ? `${Math.floor(gap / 60)}h ${gap % 60 ? (gap % 60) + 'm ' : ''}free · good time for these` : 'After your meetings · good time for these'}</div>${free.map(x => yRow(x)).join('')}</div>`; }
    });
    if (!nowShown) out += `<div class="yd-now"><span>Now · ${hhmm(nowM)}</span></div>`;
    if (!dm.length) out += `<div class="yd-free"><div class="yd-fh">No meetings · good time for these</div>${free.map(x => yRow(x)).join('') || '<div class="muted" style="padding:8px 0">Nothing due this day.</div>'}</div>`;
    return `<div class="yd-card">${strip}<div class="yd-body">${out}</div></div>`;
  }
  function weekView(items) {
    const ms = myMeets(), H0 = 8, H1 = 18, PX = 52;
    const cols = WEEK.map(([d, n], i) => {
      const due = items.filter(x => x.d === i && /Decide|Reply/.test(x.k));
      return `<div class="wk-col ${i === TODAYI ? 'today' : ''} ${i < TODAYI ? 'past' : ''}"><div class="wk-dh" onclick="App.setDay('day',null,${i})">${d} <b>${n}</b></div>
        <div class="wk-due">${due.slice(0, 1).map(x => `<button class="wk-chip ${KTAG[x.k]}" onclick="${x.go}" title="${esc(x.t)}">${esc(x.t)}</button>`).join('')}${due.length > 1 ? `<button class="wk-more" onclick="App.setDay('list')">+${due.length - 1}</button>` : ''}</div>
        <div class="wk-grid" style="height:${(H1 - H0) * PX}px">${i === TODAYI ? (() => { const n = new Date(), m = n.getHours() * 60 + n.getMinutes(); return m > H0 * 60 && m < H1 * 60 ? `<div class="wk-now" style="top:${(m / 60 - H0) * PX}px"></div>` : ''; })() : ''}
        ${ms.filter(x => x.d === i).map(x => `<button class="wk-ev ${x.k === 'Client call' ? 'client' : ''} ${x.m < 45 ? 'short' : ''}" style="top:${(toMin(x.s) / 60 - H0) * PX}px;height:${Math.max(26, x.m / 60 * PX - 2)}px" onclick="App.setDay('day',null,${i})"><b>${esc(x.t)}</b><span>${x.m < 45 ? x.s : x.s + ' · ' + x.r + '% ready'}</span><i style="width:${x.r}%"></i></button>`).join('')}</div></div>`;
    }).join('');
    const hrs = Array.from({ length: H1 - H0 }, (_, h) => `<div style="height:${PX}px">${String(H0 + h).padStart(2, '0')}:00</div>`).join('');
    const needs = items.filter(x => /Decide|Approve|Reply/.test(x.k));
    return `<div class="yd-card"><div class="wk"><div class="wk-hrs"><div class="wk-dh"></div><div class="wk-due"><span>Due</span></div>${hrs}</div>${cols}</div>
      <div class="wk-ft">Click a meeting or a day to open it with its prep.</div>
      <div class="yd-sub">Needs you this week</div>${needs.map(x => yRow(x)).join('') || '<div class="muted" style="padding:10px 16px">Nothing needs you this week.</div>'}</div>`;
  }
  function listView(items) {
    let n = 0;
    const dec = items.filter(x => x.k === 'Decide').length, apr = items.filter(x => x.k === 'Approve').length;
    const groups = WEEK.map(([d, num], i) => { const g = items.filter(x => x.d === i); return g.length ? `<div class="yl-g"><div class="yl-gh"><b>${i === TODAYI ? 'Today' : i === TODAYI + 1 ? 'Tomorrow' : d + ' ' + num + ' Oct'}</b><span>${d} ${num} Oct</span><em>${g.length} action${g.length === 1 ? '' : 's'}</em></div>${g.map(x => yRow(x, ++n)).join('')}</div>` : ''; }).join('');
    return `<div class="yd-card"><div class="yl-h"><div><b>This week, in priority order</b><span>Decisions first, then approvals, replies, and what the AI prepared for you to review.</span></div><span class="badge b-grey nodot">${items.length} actions · ${dec} decisions · ${apr} approvals</span></div>${groups || '<div class="muted" style="padding:16px">Nothing this week.</div>'}</div>`;
  }
  const noLead = h => h.replace(/^\s*<p>[\s\S]*?<\/p>/, '');
  const noteTxt = n => typeof n === 'string' ? n : n.t;
  const noteAt = n => typeof n === 'string' ? 'Earlier' : n.at;
  function renderBoard() {
    const c = chat();
    $('main').className = 'canvas board-pg';
    let t, sb, body;
    if (c && c.obj) {
      t = esc(c.title); sb = `Objective · ${objDone(c).length} of ${c.obj.total} done${c.reminder ? ' · reminder ' + esc(c.reminder) : ''}`;
      body = `<section class="bsec">${noLead(RENDER.objCatchupFull())}</section>${(c.notes || []).length ? `<section class="bsec"><div class="bsec-h">Your notes</div><div class="zl">${c.notes.map(n => `<div class="zr static"><div class="zr-m"><div class="zr-t" style="white-space:normal">${esc(noteTxt(n))}</div><div class="zr-d">${esc(noteAt(n))}</div></div>${mkHu('Note')}</div>`).join('')}</div></section>` : ''}`;
    } else {
      t = 'Today'; sb = `Tuesday 27 October · ${isMgr ? 'your team' : 'your accounts'}`;
      body = `${attnChats().length ? `<section class="bsec"><div class="bsec-h">Picking up from your chats</div><div class="zcall-l">${callouts()}</div></section>` : ''}
        <section class="bsec"><div class="bsec-h">Where ${isMgr ? 'the team stands' : 'you stand'}</div>${standingTile()}</section>
        <section class="bsec"><div class="bsec-h">While you were away</div>${noLead(catchupTile())}</section>
        <section class="bsec" id="yourDay">${yourDay()}</section>
        ${isMgr ? `<section class="bsec"><div class="bsec-h">Your team</div>${teamCard()}</section>` : ''}`;
    }
    $('main').innerHTML = `<div class="cv-h"><div class="cv-ht"><div class="cv-t">${t}</div><div class="cv-s">${sb}</div></div><div class="cv-a">${chatClosed ? `<button class="btn sm" onclick="App.chatOpen(true)">${ic('spark', 13)} Copilot</button>` : ''}</div></div><div class="cv-b" id="cv"><div class="board">${body}</div></div>`;
  }
  function modCard(v) {
    const card = (title, count, rows) => `<div class="tcard"><div class="tcard-h"><span class="t">${ic(MOD_IC[v], 15)} ${title}</span><span class="muted" style="font-size:12px;white-space:nowrap">${count}</span><div class="sp"></div><button class="ic-btn" title="Open beside the chat" onclick="App.expand()">${ic('expand', 15)}</button></div><div style="padding:2px 14px">${rows}</div><button class="tcard-more" onclick="App.expand()">Open ${MODULES[v]} beside the chat ${ic('expand', 12)}</button></div>`;
    if (v === 'accounts') { const acc = ACCOUNTS.filter(mine).filter(a => a.score > 0).sort((p, q) => q.score - p.score); return card(isMgr ? 'Team accounts' : 'Your accounts', `${acc.length} with a live signal · ${S.lists.length + LISTS.length} saved lists`, acc.slice(0, 5).map(a => `<div class="mini-row row-link" onclick="App.openRecord('${a.id}','overview')">${tierBadge(a.tier)}<div class="grow"><div class="nm">${esc(a.name)} <span class="muted" style="font-weight:400">· ${esc(a.contact.name)}</span></div><div class="sm">${a.whyNow ? esc(a.whyNow.type) + ' · ' + ago(a.whyNow.age) : ''}</div></div>${stepBadge(a)}</div>`).join('')); }
    if (v === 'segments') return card('Micro-segments', `${SEGMENTS.length} segments`, SEGMENTS.filter(s => s.fromList).reverse().concat(SEGMENTS.filter(s => !s.fromList)).slice(0, 6).map(s => `<div class="mini-row row-link" onclick="App.openSegment('${s.id}')"><div class="grow"><div class="nm">${esc(s.name)}</div><div class="sm">${ACCOUNTS.filter(a => a.seg === s.id).length} accounts · ${esc(s.trigger)}</div></div>${modeBadge(s)}</div>`).join(''));
    if (v === 'campaigns') return card('Campaigns', `${CAMPAIGNS.length} campaigns`, CAMPAIGNS.map(c => `<div class="mini-row row-link" onclick="App.goCampaign('${c.id}')"><div class="grow"><div class="nm">${esc(c.name)}</div><div class="sm">${esc(progressText(c))}</div></div>${campBadge(c)}</div>`).join(''));
    if (v === 'inbox') { const th = threads(); return card('Inbox', `${th.filter(needsReply).length} need a reply`, th.slice(0, 6).map(r => `<div class="mini-row row-link" onclick="App.openThread('${r.id}')">${chIc(r.ch)}<div class="grow"><div class="nm">${esc(r.from)} <span class="muted" style="font-weight:400">· ${esc(acct(r.acc).name)}</span></div><div class="sm">"${esc(r.text)}"</div></div><span class="badge ${KIND_B[r.kind]}">${r.kind}</span></div>`).join('') || '<div class="empty">No replies yet.</div>'); }
    if (v === 'analytics') return card('Pilot week 3', 'whole team', (sum => [['Meetings this week', `${sum('meetings')} / ${sum('target')}`], ['Reply rate', pct(sum('replies'), sum('sent'))], ['Accepted first time', Math.round(sum('accept') / REPS.length) + '%'], ['Overdue items', sum('overdue')]])(k => REPS.reduce((x, r) => x + TEAM_STATS[r][k], 0)).map(([k, x]) => `<div class="mini-row"><div class="grow nm">${k}</div><b class="mono">${x}</b></div>`).join(''));
    const items = apprItems(isMgr ? 'needs' : 'todo');
    return card('Needs you', `${items.length} waiting`, items.length ? items.map(apprMini).join('') : '<div class="empty">Nothing is waiting for you.</div>');
  }
  function seqCard(c, intro) {
    return `<p>${intro}</p><div class="ccard"><div class="ccard-h"><span class="t">${ic('megaphone', 14)} ${esc(c.name)}</span>${campBadge(c)}</div><div class="ccard-b" style="padding:2px 14px">
      ${seqOf(c).map((t, i) => `<div class="mini-row">${chIc(t.ch)}<div class="grow"><div class="nm">Step ${i + 1} · Day ${t.day} · ${t.ch} · ${esc(t.fmt)}</div><div class="sm">${esc(t.t)}</div></div></div>`).join('')}</div>
      <div class="ccard-f">${openBtn('Edit the steps', `App.goCampaign('${c.id}','steps')`)}${c.status === 'Running' || c.status === 'Completed' || S.camp[c.id] ? '' : isMgr ? `<button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm campaign</button>` : c.status === 'Draft' ? `<button class="btn sm pri" onclick="App.sendForConfirm('${c.id}')">Send to Daniel to confirm</button>` : ''}</div></div>`;
  }
  function apprMini(a) {
    const d = S.decisions[a.id];
    return `<div class="mini-row"><div class="grow row-link" onclick="App.openRecord('${a.id}','engage')"><div class="nm">${esc(a.contact.name)} · ${esc(a.name)}</div><div class="sm">${esc(a.nba.action)}${isMgr ? ' · ' + esc(first(USERS[a.owner].name)) : ''}</div></div>
      <span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span>
      ${d ? `<span class="badge b-grey nodot">${decLabel(d)}</span>` : /auto|sent/.test(a.nba.status) ? '<span class="badge b-pos">Went ahead</span>' : `${!a.nba.reason || (isMgr && a.nba.sensitive) ? `<button class="btn sm pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : 'Approve'}</button>` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','engage')">Review</button>`}</div>`;
  }
  function nbaCard(a, note) {
    if (a.campaign) { const c = campOf(a.campaign); return `<p><b>${esc(a.name)}</b> is in the campaign <b>${esc(c.name)}</b>, so it follows the campaign's steps instead of its own action. Current state: ${esc(a.campState)}.</p><div class="next-row">${openBtn('Campaign', `App.goCampaign('${c.id}')`)}${openBtn('Person', `App.openRecord('${a.id}','engage')`)}</div>`; }
    if (!a.nba) return `<p>${esc(a.name)} has no live signal, so there's no next action yet. It stays watched.</p>`;
    const d = draftOf(a), dec = S.decisions[a.id];
    const rec = d.option === 'run' ? a.nba.runnerUp : a.nba.action;
    return `${note ? `<p>${note}</p>` : `<p>For <b>${esc(a.name)}</b> I recommend <b>${esc(rec)}</b>, by ${d.channel === 'LinkedIn' ? 'LinkedIn' : 'email'} to ${esc(a.contact.name)}. ${a.nba.proven ? 'It follows the <b>proven</b> structure for its segment.' : 'There\'s <b>no proven structure</b> yet, so treat it as a first try.'}</p>`}
      <div class="ccard"><div class="ccard-h"><span class="t">${chIc(d.channel)} ${esc(rec)}</span><span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span></div>
        <div class="ccard-b"><div class="draft">${d.channel === 'Email' ? `<div class="subj">${esc(d.subject)}</div>` : ''}${esc(d.body)}</div>
        <div class="checks"><span class="badge b-pos">Brand voice</span><span class="badge b-pos">Approved claims</span>${idBadge(a.contact.idTier)}</div></div>
        <div class="ccard-f">${a.nba.status === 'sent' || a.nba.status === 'auto' ? `<span class="badge b-sec">${a.nba.status === 'sent' ? esc(a.outcome || 'Sent') : 'Went ahead on its own'}</span>` : dec ? `<span class="badge b-grey nodot">${decLabel(dec)}</span>` : `<button class="btn sm pri" onclick="App.approve('${a.id}')">${a.nba.sensitive && !isMgr ? 'Approve → to Daniel' : a.nba.sensitive ? 'Sign off' : 'Approve'}</button>`}
          ${openBtn('Edit', `App.openRecord('${a.id}','engage')`)}${btn('Shorter', 'Make it shorter')}<button class="btn sm" onclick="App.useRunnerUp('${a.id}')">Runner-up</button></div></div>`;
  }

  /* Scripted understanding of what the seller typed. */
  function findAccount(t) {
    const word = w => new RegExp('\\b' + w.toLowerCase() + '\\b').test(t);
    return ACCOUNTS.find(a => word(a.name.split(' ')[0])) || ACCOUNTS.find(a => !a.generated && word(a.contact.name.split(' ')[0]));
  }
  function findCampaign(t) { return /turnaround/.test(t) ? 'c1' : /renewal/.test(t) ? 'c2' : /expansion|capex/.test(t) ? 'c3' : /hiring|surge/.test(t) ? 'c5' : null; }
  function addList(name, kind, note, ids) { const id = 'U' + (S.lists.length + 1); S.lists.unshift({ id, name, kind, by: 'Chat', when: 'Today', note, ids }); return id; }
  function respond(text) {
    const t = text.toLowerCase(), lk = lastKind(), v = view();
    const soon = t.match(/\b(ppt|powerpoint|slides?|deck|pdf|brochure|infographic|carousel|podcast|video|single image|image post|linkedin (text )?post)\b/);
    if (soon && /write|make|create|generate|draft|build|turn|design|produce/.test(t)) return { kind: 'text', html: `<b>${esc(soon[0].charAt(0).toUpperCase() + soon[0].slice(1))}</b> is coming soon in Content studio. Today I can write a <b>blog</b> or a <b>whitepaper</b> in the brand voice: say "Write a blog on …".` };
    if (v === 'studio') return studioRespond(t, text);
    if (v === 'analytics' && !/stuck|moved into pipeline|what moved|autonomy|agents do/.test(t) || /\banalytics\b|dashboard|\bkpis?\b|\bmetrics\b/.test(t)) { const r = anRespond(t); if (r) return r; }
    const cc = chat();
    if (/remind me/.test(t)) { const when = (text.match(/remind me (on |at )?(.+?)( to |\.|$)/i) || [])[2] || 'tomorrow 09:00'; if (cc) cc.reminder = when.replace(/\bat\b/, '').trim(); const nt = text.match(/note:?\s*(.+)$/i); if (nt && cc) (cc.notes = cc.notes || []).push(nt[1]); return { kind: 'reminder', when: cc ? cc.reminder : when, extra: nt ? nt[1] : '' }; }
    if (/^note:|note to self|make a note/.test(t)) { const n = text.replace(/^(note:|note to self:?|make a note:?)\s*/i, ''); if (cc) (cc.notes = cc.notes || []).push(n); return { kind: 'note', text: n }; }
    if (/catch me up|what happened|since (i|you) (last )?logged/.test(t)) return { kind: 'catchup' };
    if (cc && cc.obj && /left|progress|where are we|status/.test(t)) return { kind: 'objCatchup' };
    if (cc && cc.obj && /on (their|its) own|went ahead/.test(t)) return { kind: 'text', html: `On this objective the AI did ${objDone(cc).filter(id => id !== 'saltmarsh').length} of the ${objDone(cc).length} done items on its own (marked ${mkAI()}). The rest were done or decided by a person (${mkHu('Person')}).` };
    if (/autonomy|how much .*(on (their|its) own|alone)|agents do (alone|on their own)/.test(t)) return { kind: 'autonomy' };
    if (/stuck|moved into pipeline|what moved|pipeline .*(moved|influenc)/.test(t)) return { kind: 'stuck', steps: ['Pulled pipeline influenced by the AI, week by week', 'Looked for accounts with touches but no reply, and reps with overdue work', 'Ranked them by what is at stake'] };
    if (/draft a follow-?up/.test(t)) { const ac = findAccount(t) || (ctx ? acct(ctx) : null) || (recId ? acct(recId) : null) || acct('sapphire'); return { kind: 'followUp', id: ac.id, steps: ['Read the last touchpoint and what happened after it', 'Picked the proven structure for ' + (ac.segment || 'this account'), 'Ran the brand voice and approved-claims checks'] }; }
    if (/change the channel/.test(t)) { const ac = findAccount(t) || (ctx ? acct(ctx) : null) || acct('sapphire'); return { kind: 'text', html: `Done: the next touch for <b>${esc(ac.name)}</b> goes by <b>LinkedIn</b> from ${esc(first(USERS[ac.owner].name))}'s own account, referencing the comparison ${esc(first(ac.contact.name))} opened. It waits for ${isMgr && ac.owner !== me.id ? first(USERS[ac.owner].name) : 'you'} to approve, because the channel changed. <br><button class="btn sm" style="margin-top:8px" onclick="App.openRecord('${ac.id}','engage')">Open the draft</button>` }; }
    if (/last touch/.test(t)) { const ac = findAccount(t) || (ctx ? acct(ctx) : null) || (recId ? acct(recId) : null) || acct('sapphire'); return { kind: 'lastTouch', id: ac.id, steps: ['Pulled the activity for ' + ac.name, 'Matched opens and replies to each touch', 'Checked what went out on its own and what a person sent'] }; return { kind: 'text', html: `The last touchpoints for <b>${esc(ac.name)}</b> are open beside the chat, newest first. Open any step to read the message.` }; }
    if (/emails? .*(receiv|today|got)|my inbox|pull .*(emails|repl)/.test(t)) return { kind: 'replies' };
    const tch = t.match(/add an? (email|linkedin) (touch|step)/);
    if (tch) {
      const cid = findCampaign(t) || campSel || 'c5', ch = tch[1] === 'email' ? 'Email' : 'LinkedIn';
      editSeq(cid, (sq, c) => sq.push(newTouch(sq, c, ch)));
      return { kind: 'seqChanged', id: cid, note: `Added a ${ch} step at the end of <b>${esc(campOf(cid).name)}</b>. The brand checks still pass. Open the steps to edit the wording.` };
    }
    if (/remove (the )?(last )?(touch|step)/.test(t)) { const cid = findCampaign(t) || campSel || 'c5'; editSeq(cid, sq => { const i = sq.map(x => !/Sent|Done/.test(x.state || '')).lastIndexOf(true); if (i >= 0) sq.splice(i, 1); }); return { kind: 'seqChanged', id: cid, note: `Removed the last unsent step from <b>${esc(campOf(cid).name)}</b>.` }; }
    const findIcp = /\b(find|look for|search|show me|get me|prospect|who are)\b/.test(t) && !/like (my|our) last|replies|analytics|emails sent|meetings|linkedin touches|sequence|pipeline|hot|stuck/.test(t) ? parseICP(text) : null;
    if (findIcp) {
      const id = 'Q' + (S.genLists.length + 1) + Date.now().toString(36).slice(-4), place = [findIcp.city, findIcp.country !== findIcp.city ? findIcp.country : null].filter(Boolean).join(', ');
      const who = findIcp.lvl === 'Head' ? `Heads of ${findIcp.fn || 'the team'}` : findIcp.lvl === 'Chief' ? `Chief ${findIcp.fn || ''} Officers` : findIcp.lvl === 'VP' ? `VPs of ${findIcp.fn || 'the team'}` : `${findIcp.fn || 'Team'} ${findIcp.lvl.toLowerCase()}s`;
      const g = { id, q: text, icp: findIcp, owner: me.id, title: [who, place, findIcp.industry].filter(Boolean).join(' · ') };
      S.genLists.push(g); genList(g); if (cc) { cc.listId = id; if (S.chats.includes(cc) && cc.thread.filter(m => m.who === 'me').length <= 1) { cc.title = g.title; cc.naming = false; } }
      return { kind: 'prospects', open: 'prospects', steps: [`Turned your request into a filter: ${esc(who)}${place ? ' · ' + esc(place) : ''}${findIcp.industry ? ' · ' + esc(findIcp.industry) : ''}`, 'Searched the primary contact provider, then the fallback for the misses', 'Cross-checked fallback hits and gave everyone an identity tier', 'Removed existing customers and accounts another rep owns (CRM, read-only)'] };
    }
    const asc = t.match(/assign (the )?(campaign|nbc|next (best )?actions|nbas?|actions) to (sofia|marco|aisha|kenji)/);
    if (asc) { if (!isMgr) return { kind: 'text', html: 'Daniel assigns work. I can send him a note: say "send an update to Daniel".' }; const camp = /campaign|nbc/.test(asc[2]), ids = listAccounts().filter(a => camp ? a.campaign : a.nba && !a.campaign).map(a => a.id); if (!ids.length) return { kind: 'text', html: `There ${camp ? 'is no campaign' : 'are no next best actions'} on this list yet. Say "Route to NBA and NBC" first.` }; ids.forEach(id => { acct(id).owner = asc[4]; shared.assign[id] = asc[4]; }); saveShared(); return { kind: 'text', html: `Assigned ${camp ? `the campaign (${ids.length} accounts)` : `${ids.length} next best actions`} to <b>${esc(USERS[asc[4]].name)}</b>. It shows in their Today and their Approvals.` }; }
    const asl = t.match(/assign (them|these|this list|the list|all of them|everyone|those) to (sofia|marco|aisha|kenji)/);
    if (asl) { if (!isMgr) return { kind: 'text', html: 'Daniel assigns accounts. I can send him the list with a note: say "send an update to Daniel".' }; listAccounts().forEach(a => { a.owner = asl[2]; shared.assign[a.id] = asl[2]; }); saveShared(); return { kind: 'text', html: `Assigned all ${listAccounts().length} accounts on this list to ${USERS[asl[2]].name}. Their next actions and the campaign move with them.` }; }
    if (/^send( them| it| all| everything)?\.?$|send (them|the (next best )?actions|everything) ?(out|now)?/.test(t)) {
      const ls = listAccounts(), wait = ls.filter(a => a.nba && a.nba.status === 'review' && !S.decisions[a.id]), cid = (ls.find(a => a.campaign) || {}).campaign;
      wait.forEach(a => { S.decisions[a.id] = a.nba.sensitive && !isMgr ? 'with-manager' : 'approved'; });
      if (cid && !S.camp[cid]) S.camp[cid] = isMgr ? 'Confirmed' : 'Sent for confirmation';
      const went = ls.filter(a => a.nba && a.nba.status === 'auto').length;
      return { kind: 'text', html: `Done. ${went ? `<b>${went}</b> next best actions had already gone ahead on their own. ` : ''}I approved the other <b>${wait.length}</b>; they go out in the next send window.${cid ? ` The campaign is ${isMgr ? '<b>confirmed</b>: step 1 goes out tomorrow 09:00' : '<b>with Daniel to confirm</b>'}.` : ''} (Nothing leaves the mock.)` };
    }
    if (/send (an |a )?update|update (daniel|my manager|the team)/.test(t)) {
      const ls = listAccounts(), went = ls.filter(a => a.nba && a.nba.status === 'auto').length, wait = ls.filter(a => a.nba && a.nba.status === 'review' && !S.decisions[a.id]).length, inC = ls.filter(a => a.campaign).length;
      return { kind: 'text', html: `Sent ${isMgr ? 'the team' : 'Daniel'} an update:</p><div class="draft" style="margin-top:8px">${esc(listTitle())}: ${ls.length} people found and scored (${ls.filter(a => a.tier === 'A').length} in tier A). ${inC ? `${inC} share a trigger and are in a draft campaign. ` : ''}${went} next best actions went ahead on their own, ${wait} wait for approval.</div><p>` };
    }
    if (/save (as a |the )?(scored )?list|save it/.test(t)) {
      const scored = /scored/.test(t) || lk === 'rankedList';
      const name = `${listTitle()}${scored ? ' · scored' : ''} · 27 Oct`, n = listAccounts().length;
      return { kind: 'savedList', id: addList(name, scored ? 'Scored list' : 'Prospect list', scored ? `${listAccounts().filter(a => a.score > 0).length} of ${n} accounts with a live signal, ranked` : `${n} accounts`, listAccounts().map(a => a.id)), name, next: scored ? 'Create micro-segments' : 'Score this list' };
    }
    if (/score (this|the|that|these|them)|rank (this|them|these)|score (my )?list/.test(t)) return { kind: 'rankedList', steps: [`Collected live signals for the ${listAccounts().length} list accounts from 23 sources`, 'Qualified 21 of 30 signals: observable, predictive, time-bound', 'Weighed by tier (100 / 60 / 30) and applied decay', 'Stacked into Timing: strongest + ½ second + ¼ third', 'Fit × Timing = Score, then tiers A / B / C'] };
    if (/send (the campaign|it) to pavan/.test(t)) { S.camp.c5 = 'Sent for confirmation'; return { kind: 'text', html: 'Sent <b>Control-systems hiring surge</b> to Daniel to confirm. You\'ll see it in Today once he decides.' }; }
    if (/confirm the campaign/.test(t) && isMgr) { S.camp.c5 = 'Confirmed'; return { kind: 'text', html: 'Confirmed <b>Control-systems hiring surge</b>. Step 1 goes out tomorrow 09:00 (placeholder: nothing is sent).' }; }
    if (/objection/.test(t)) { const ob = threads().filter(r => r.kind === 'Objection'); return { kind: 'text', html: ob.length ? `${ob.length} objection${ob.length > 1 ? 's' : ''}: ${ob.map(r => `<a href="#inbox" onclick="App.openThread('${r.id}');return false">${esc(r.from)} · ${esc(acct(r.acc).name)}</a>`).join(', ')}. Each has a suggested reply that doesn't push.` : 'No objections right now.' }; }
    if (/funnel|leak/.test(t)) return { kind: 'text', html: 'The biggest drop is <b>with a live signal → contacted</b>: 33 accounts had a signal but only 24 were contacted within 2 days, mostly because 3 rep mailboxes aren\'t connected. Replies to positive is healthy (8 of 15).' };
    if (/route|nba and nbc|nbc and nba|micro|segment (this|the|them|it)|create.*segment|group (this|them|the list)/.test(t)) { if (listOf() !== 'L1') routeList(listOf()); const ls = listAccounts(); return { kind: 'listSegments', steps: ['Tagged each account by its strongest trigger', 'Checked each micro-segment against the campaign threshold (10 in 7 days)', `Routed: ${ls.filter(a => a.campaign).length} accounts → one campaign (NBC), ${ls.filter(a => a.nba && !a.campaign).length} → next best actions (NBA)`, 'Drafted the campaign sequence and the next actions · brand checks passed'] }; }
    if (/prepare.*(next )?action|next actions|\bnba\b/.test(t) && !/which/.test(t)) return { kind: 'nbaList', steps: ['De-dup check: no open opportunities, owners confirmed', 'Read CRM history and warm paths', 'Chose email or LinkedIn per contact and wrote the drafts', 'Brand, claims and banned-word checks passed'] };
    if (/build.*campaign|create.*campaign|draft.*campaign|\bnbc\b/.test(t) && !/which/.test(t)) return { kind: 'flowCampaign', steps: ['Used the structure closest to this trigger (provisional: no outcomes yet)', 'Planned 4 steps across email and LinkedIn', 'Personalised each step per person', 'Checked nobody is already in another sequence'] };
    if (/draft a reply|reply to dian/.test(t)) return { kind: 'text', html: 'Here\'s a reply with three times from your calendar:<div class="draft" style="margin-top:8px">Hi Dian,\n\nGreat to hear from you. I can do Tuesday 3 Nov at 10:00, Wednesday 4 Nov at 14:00 or Thursday 5 Nov at 09:30 (Jakarta time). I\'ll bring our lead engineer for hydrocracker projects.\n\nBest,\nSofia</div><div class="next-row"><button class="btn sm pri" onclick="App.handleReply(\'reastgate\')">Approve &amp; send</button></div>', steps: ['Read the reply: positive, asks for times next week', 'Checked your calendar for free slots', 'Wrote the reply'] };
    if (/write|blog|whitepaper/.test(t)) { startDoc(/whitepaper/.test(t) ? 'Whitepaper' : 'Blog', text); return { kind: 'text', html: `Started it in Content studio: <b>${esc(S.studio.doc.title)}</b>.` }; }
    const a = findAccount(t) || (ctx ? acct(ctx) : null);
    if (/close to|almost/.test(t)) { const b = SEGMENTS.find(s => s.mode === 'Building'); return { kind: 'text', html: `<b>${esc(b.name)}</b> has ${b.building} of the 10 accounts it needs in the 7-day window. If two more arrive this week, it becomes a campaign; until then each account has its own next best action.` }; }
    if (/which.*(segment|campaign)|segments|segment/.test(t) && !a) return { kind: 'segments', steps: ['Re-built micro-segments from each account\'s strongest trigger', 'Checked each segment against the campaign threshold (10 in 7 days)'] };
    if (/campaign/.test(t) && /how|status|doing|running|track|working|best/.test(t) || /^track/.test(t)) return { kind: 'campaigns', steps: ['Pulled send, open, reply and meeting counts for every campaign'] };
    if (/repl/.test(t)) return { kind: 'replies' };
    if (/block|stuck|in the way/.test(t)) return { kind: 'blockers' };
    if (isMgr && /team|reps?\b|overdue|coach|kenji|marco|aisha/.test(t) && !/rank/.test(t)) return { kind: 'team', steps: ['Pulled each rep\'s queue, outcomes and approvals this week'] };
    if (/next best actions doing|how are my (next|actions)|nba.*(doing|deliver)|bounc/.test(t)) { const all = nbaRows(), T = track, b = all.filter(a => T(a).cls === 'b-neg'); if (/bounc/.test(t)) return { kind: 'text', html: b.length ? `${b.length} bounced: ${b.map(a => `<a href="#segments" onclick="App.openRecord('${a.id}','engage');return false">${esc(a.contact.name)} · ${esc(a.name)}</a>`).join(', ')}. The address is being re-checked with the second provider before a retry.` : 'Nothing bounced.' }; return { kind: 'text', html: `${all.length} next best actions this week: ${all.filter(a => T(a).how === 'Went ahead on its own').length} went ahead on their own, ${all.filter(a => T(a).stage === 0).length} wait for approval. ${all.filter(a => T(a).stage >= 2).length} delivered, ${all.filter(a => T(a).stage >= 3).length} opened, ${all.filter(a => T(a).stage >= 4).length} replied, ${b.length} bounced. <a href="#segments" onclick="App.openMod('segments');return false">See them by segment</a>` }; }
    if (/went ahead/.test(t)) { const w = apprItems('ahead'); return { kind: 'text', html: `${w.length} next best actions went ahead on their own${isMgr ? ' across the team' : ''}, because they passed all six checks: ${w.slice(0, 5).map(a => `<a href="#approvals" onclick="App.openRecord('${a.id}','engage');return false">${esc(a.name)}</a>`).join(', ')}${w.length > 5 ? ' and more' : ''}.` }; }
    if (/approv|waiting|needs me|needs my/.test(t) && !/approve all/.test(t)) return { kind: 'approvalsList' };
    if (/campaign|sequence|turnaround/.test(t)) return { kind: 'campaign', id: findCampaign(t) || 'c1' };
    if (/learn|worked|working|what changed|readout/.test(t)) return { kind: 'learned', steps: ['Read 214 outcomes logged this month (wins and misses)', 'Re-ran pattern promotion and demotion', 'Compared signal sources by conversion'] };
    if (/to ?do|what should i do first|my day|first today/.test(t)) return { kind: 'todo' };
    if (/approve all/.test(t)) { approveAll(true); return { kind: 'text', html: 'Done. Every ready, high-confidence item is approved and scheduled for the next send window (a placeholder in the mock).' }; }
    if (/find|prospect|look ?alike|new accounts|like my|like our|more accounts/.test(t)) { if (cc) cc.listId = null; return { kind: 'prospects', steps: FIND_STEPS() }; }
    if (/rank|score|prioriti|who should i call|call first|top accounts/.test(t)) return { kind: 'ranked', steps: ['Pulled live signals from 23 sources', 'Applied tier, decay and stacking', 'Fit × Timing = Score'] };
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
    /* From Today, a goal becomes its own chat (named for the goal, with progress); everything else is answered in Today */
    if (!view() && S.cur === 'home' && OBJ_RE.test(text)) { const id = 'n' + Date.now(), nm = text.match(/\d+/); const o = { id, title: objName(text), when: 'Now', obj: { ids: ACCOUNTS.filter(mine).filter(a => a.nba && /auto|ready|review/.test(a.nba.status) && !a.campaign).slice(0, nm ? +nm[0] : 10).map(a => a.id), done: [] }, thread: [] }; o.obj.total = o.obj.ids.length; S.chats.unshift(o); S.cur = id; renderAll(); }
    const c = chat();
    if (!c) return;
    if (c.title === 'New chat' && S.chats.includes(c)) { c.title = text.trim().split(/\s+/).slice(0, 6).join(' ').replace(/[?.!,]+$/, ''); c.naming = false; }
    c.thread = c.thread.filter(m => m.who !== 'typing');
    if (c.title === 'New chat') c.title = text.length > 38 ? text.slice(0, 36) + '…' : text;
    c.thread.push({ who: 'me', text });
    const reply = respond(text);
    const steps = reply.steps || [];
    save(); renderAll();
    const finish = () => { c.thread = c.thread.filter(m => m.who !== 'typing'); const m = Object.assign({ who: 'ai', fresh: true }, reply); c.thread.push(m); save(); renderAll(); m.fresh = false;
      if (!view() && !c.obj && (S.chats.includes(c) || c === S.today) && (!art || /^(prospects|rankedList|listSegments)$/.test(reply.kind))) { const last = [...document.querySelectorAll('#thread .msg')].pop(), b = last && last.querySelector('[onclick*="App.openArt("]'); if (b) { const k = (b.getAttribute('onclick').match(/openArt\('(\w+)'/) || [])[1]; if (k) { c.art = k; save(); App.openArt(k); } } } };
    const box = document.querySelector('#thread .thread-in'), th = $('thread');
    if (!box) { finish(); return; }
    /* Steps appear one by one in place, then the answer fades in: no full redraw while thinking */
    const el = document.createElement('div');
    el.className = 'msg think';
    el.innerHTML = `<span class="ai-av pulse">${ic('spark', 14)}</span><div class="bub"><div class="steps live"></div></div>`;
    box.appendChild(el);
    const list = el.querySelector('.steps');
    const tickAll = () => list.querySelectorAll('.typing').forEach(x => { x.outerHTML = '<span class="ok">✓</span>'; });
    const row = txt => { tickAll(); const d = document.createElement('div'); d.className = 'st'; d.innerHTML = `<span class="typing"><i></i><i></i><i></i></span><span>${txt}</span>`; list.appendChild(d); };
    row(steps.length ? steps[0] : 'Thinking…');
    let i = 1;
    const tick = () => { if (i < steps.length) { row(steps[i++]); setTimeout(tick, 420); return; } tickAll(); setTimeout(finish, 240); };
    setTimeout(tick, steps.length ? 420 : 520);
  }

  /* ─── Campaign sequences: email and LinkedIn steps, personalised per person ─── */
  const FORMATS = { Email: ['Plain text', 'Case study', 'Comparison document', 'Checklist', 'Infographic', 'Whitepaper'], LinkedIn: ['Connection request', 'Message', 'Comment on their post', 'Carousel post'] };
  function seqOf(c) { return S.seq[c.id] || c.touches.map(t => ({ day: t.day, ch: t.ch, fmt: t.fmt, subject: t.subject || (t.ch === 'Email' ? c.name : ''), t: t.t, state: t.state })); }
  const sent = t => /Sent|Done/.test(t.state || '');
  function newTouch(sq, c, ch) { const last = sq.length ? sq[sq.length - 1].day : 0; return { day: last + 4, ch, fmt: FORMATS[ch][ch === 'LinkedIn' ? 1 : 0], subject: ch === 'Email' ? 'Re: ' + (([...sq].reverse().find(x => x.ch === 'Email' && x.subject) || {}).subject || c.name).replace(/^Re: /, '') : '', t: ch === 'LinkedIn' ? 'Short follow-up on LinkedIn, referencing the earlier steps.' : 'A final, short note: offer a 20-minute call and make it easy to say no.', state: '' }; }
  function editSeq(cid, fn) { const c = campOf(cid); const sq = seqOf(c).map(t => Object.assign({}, t)); fn(sq, c); S.seq[cid] = sq; save(); }
  function personal(t, a) {
    const f = first(a.contact.name), sig = a.whyNow ? a.whyNow.text.replace(/\.$/, '') : '';
    if (t.ch === 'LinkedIn') return `Hi ${f}, ${t.fmt === 'Connection request' ? `saw the news at ${a.name} (${sig.toLowerCase()}). ` : ''}${t.t} ${t.fmt === 'Connection request' ? 'Would be good to connect.' : 'Worth a short chat?'}`;
    return `Hi ${f},\n\n${sig ? `I noticed this at ${a.name}: ${sig.charAt(0).toLowerCase() + sig.slice(1)}.` : ''}\n\n${t.t}\n\nWould a 20-minute conversation next week be useful?\n\nBest,\n${first(USERS[a.owner].name)}`;
  }
  function campStats(c) {
    if (c.final) return { total: c.final.accounts, started: c.final.accounts, progress: 0, queued: 0, finished: c.final.accounts, replies: c.final.replies, positive: c.final.meetings + 1, objection: 1, opened: 9, clicked: 4, meetings: c.final.meetings, optout: 0 };
    const accs = ACCOUNTS.filter(a => a.campaign === c.id && mine(a)), has = re => accs.filter(a => re.test(a.campState)).length;
    const sq = seqOf(c), done = sq.filter(sent).length, live = c.status === 'Running';
    return { total: accs.length, started: live ? accs.length : 0, progress: live ? accs.length - has(/Replied|Meeting|Taken out/) : accs.length, queued: live ? (done < sq.length ? accs.length - has(/Replied|Meeting|Taken out/) : 0) : accs.length, finished: has(/Replied|Meeting|Taken out/), replies: has(/Replied|Meeting|Out of office/), positive: has(/positive|Meeting/), objection: has(/objection/), opened: has(/Opened|Clicked|Replied|Meeting/), clicked: has(/Clicked/), meetings: has(/Meeting/), optout: 0 };
  }
  function progressText(c) {
    if (S.camp[c.id] === 'Confirmed') return 'Confirmed · step 1 goes out tomorrow 09:00';
    if (S.camp[c.id] === 'Sent for confirmation') return 'Sent to Daniel to confirm';
    if (c.status === 'Draft') return `Draft from a prospect list · ${c.accounts.length} people · needs a review`;
    if (c.status === 'Ready to confirm') return `${c.accounts.length} people held · needs ${isMgr ? 'your' : 'Daniel\'s'} confirmation`;
    if (c.status === 'Completed') return `Ran ${c.launched} · completed`;
    const sq = seqOf(c), done = sq.filter(sent).length, next = sq.find(t => !sent(t));
    return `Day ${c.day} · step ${done} of ${sq.length} done${next ? ` · next: ${(next.state || 'not scheduled').replace('Scheduled ', '')}` : ''}`;
  }
  const seqSpan = c => { const sq = seqOf(c); return `${sq.length} steps · ${sq.length ? sq[sq.length - 1].day + 1 : 0} days`; };

  /* ─── Home (Today): the greeting and the chat box first; the brief, to-do and numbers below ─── */
  function metrics() {
    const own = a => a.owner === me.id, ts = TEAM_STATS, sum = k => REPS.reduce((n, r) => n + ts[r][k], 0);
    if (!isMgr) return [['users', 'Sequenced', ACCOUNTS.filter(a => a.campaign && own(a)).length, 30], ['mail', 'Emails sent', ts[me.id].sent, 40], ['li', 'LinkedIn touches', 5, 20], ['reply', 'Replies to answer', myReplies().filter(r => r.kind !== 'Out of office').length, null], ['task', 'To decide today', todayNBA().length, null], ['check', 'Meetings this week', ts[me.id].meetings, ts[me.id].target], ['up', 'Accepted first time', ts[me.id].accept + '%', null]];
    if (homeMet === 'mine') return [['task', 'Sign-offs waiting', apprItems('needs').length, null], ['megaphone', 'Campaigns to confirm', CAMPAIGNS.filter(c => (c.status === 'Ready to confirm' || S.camp[c.id] === 'Sent for confirmation') && S.camp[c.id] !== 'Confirmed').length, null], ['check', 'Decided today', Object.keys(S.decisions).length, null], ['users', 'Work reassigned', Object.keys(shared.assign).length, null], ['pen', 'Tasks assigned', shared.tasks.length, null], ['reply', 'Replies across the team', myReplies().length, null]];
    return [['mail', 'Emails sent', sum('sent'), 160], ['reply', 'Replies', sum('replies'), null], ['check', 'Meetings this week', sum('meetings'), sum('target')], ['up', 'Accepted first time', Math.round(sum('accept') / REPS.length) + '%', null], ['task', 'Open items', sum('todo'), null], ['alert', 'Overdue', sum('overdue'), null]];
  }
  function renderHome() {
    const td = todos(), blk = myBlockers().find(b => b.k === 'neg');
    const q = ($('todoQ') && $('todoQ').value || '').toLowerCase();
    const tdRows = td.filter(x => !q || (x.t + x.d).toLowerCase().includes(q));
    $('main').className = 'home-pg';
    $('main').innerHTML = `<div class="hm"><div class="hm-main">
        <h1 class="hm-greet">${greeting()}, ${esc(first(me.name))}. ${isMgr ? 'Here\'s your team\'s day.' : 'Ready to prospect?'}</h1>
        <div class="hm-box ${blk ? 'warn' : ''}">${blk ? `<div class="hm-note"><b>${esc(blk.t)}</b><span>${esc(blk.d)}</span></div>` : ''}
          <div class="composer"><div class="ctx" id="ctx">${ctxChip()}</div><label class="sr" for="composer">Message Demand AI</label>
            <textarea id="composer" rows="2" placeholder="Find, score, segment, act, track… type @ to add an account" onkeydown="App.key(event)" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
            <div class="composer-f"><div class="sp"></div><button class="send" onclick="App.send()" title="Send">${ic('send', 16)}</button></div></div></div>
        <div class="hints hm-hints">${hints().map(h => `<button class="chip" onclick="App.ask(${js(h)})">${esc(h)}</button>`).join('')}</div>
        <section class="hm-card"><div class="hm-card-h"><span class="hm-ic">${ic('spark', 15)}</span><b>Today's brief</b><span class="muted">prepared overnight · 06:00</span></div><div class="hm-brief">${RENDER.brief({ home: true })}</div></section>
        <section class="hm-card"><div class="hm-card-h"><span class="hm-ic">${ic('task', 15)}</span><b>To do</b><span class="badge b-grey nodot">${td.filter(x => !S.todosDone[x.id]).length} open</span><div class="sp"></div><div class="search">${ic('search', 14)}<label class="sr" for="todoQ">Search</label><input id="todoQ" placeholder="Search…" value="${esc(q)}" oninput="App.renderAll()"></div></div>
          <div class="tbl-wrap"><table class="tbl todo-tbl"><thead><tr><th style="width:34px"><span class="sr">Done</span></th><th>Task</th><th>Details</th><th>Due</th></tr></thead><tbody>
          ${tdRows.map(x => `<tr class="${S.todosDone[x.id] ? 'done' : ''}"><td><button class="ck" aria-label="Mark done" onclick="App.doneTodo('${x.id}')">${S.todosDone[x.id] ? ic('check', 11, 3) : ''}</button></td><td class="row-link" onclick="App.runTodo('${x.id}')"><div class="nm">${esc(x.t)}</div>${x.from ? `<span class="badge b-ter nodot" style="margin-top:4px">From ${esc(x.from)}</span>` : ''}</td><td class="row-link" onclick="App.runTodo('${x.id}')"><div class="sm">${esc(x.d)}</div></td><td><span class="due ${x.cls}">${esc(x.due)}</span></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No tasks match.</td></tr>'}
          </tbody></table></div></section>
        ${isMgr ? teamCard() : ''}
      </div>
      <aside class="hm-side">
        <section class="hm-card"><div class="hm-card-h"><b>${isMgr ? (homeMet === 'mine' ? 'My metrics' : 'Team metrics') : 'My metrics'}</b><div class="sp"></div>${isMgr ? `<div class="seg">${[['team', 'Team'], ['mine', 'Mine']].map(([k, l]) => `<button class="${homeMet === k ? 'on' : ''}" onclick="App.setHomeMet('${k}')">${l}</button>`).join('')}</div>` : '<span class="muted" style="font-size:12px">This week</span>'}</div>
          ${metrics().map(([i, k, v, t]) => `<div class="met"><span class="met-ic">${ic(i, 15)}</span><span class="grow">${k}</span><b>${v}${t ? `<i> / ${t}</i>` : ''}</b></div>`).join('')}</section>
        <section class="hm-card"><div class="hm-card-h"><b>Most important updates</b></div><div style="padding:2px 14px 6px">${updates().slice(0, 5).map(u => `<button class="upd-i" ${u.on ? `onclick="${u.on}"` : ''}><span class="ic k-${u.k}">${ic(u.icon, 13)}</span><div class="grow"><div class="nm">${esc(u.t)}</div><div class="sm">${esc(u.d)}</div></div><span class="when">${esc(u.when)}</span></button>`).join('')}</div></section>
      </aside></div>`;
    if (q) { const s = $('todoQ'); s.focus(); s.setSelectionRange(q.length, q.length); }
  }
  /* The manager's team card: each rep's work, and assigning work to anyone */
  function teamCard() {
    const opts = sel => REPS.map(r => `<option value="${r}" ${sel === r ? 'selected' : ''}>${esc(USERS[r].name)}</option>`).join('');
    const overdue = ACCOUNTS.filter(a => a.owner === 'kenji' && a.nba && /ready|review/.test(a.nba.status) && !S.decisions[a.id]).slice(0, 2);
    return `<section class="hm-card"><div class="hm-card-h"><span class="hm-ic">${ic('users', 15)}</span><b>Team</b><span class="muted">each rep's work · assign to anyone</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Rep</th><th>Open</th><th>Overdue</th><th>Replies</th><th>Meetings</th><th>Accepted</th><th></th></tr></thead><tbody>
        ${REPS.map(r => { const t = TEAM_STATS[r]; return `<tr><td><div style="display:flex;gap:8px;align-items:center">${avatar(USERS[r], 24)}<span class="nm">${esc(USERS[r].name)}</span></div></td><td>${t.todo + shared.tasks.filter(x => x.to === r).length}</td><td>${t.overdue ? `<span class="badge b-neg">${t.overdue}</span>` : '0'}</td><td>${t.replies}</td><td>${t.meetings} / ${t.target}</td><td>${t.accept}%</td><td style="white-space:nowrap"><button class="btn sm" onclick="App.viewRep('${r}')">View work</button></td></tr>`; }).join('')}
      </tbody></table></div>
      ${overdue.length ? `<div class="assign-sug">${ic('spark', 14)}<div class="grow"><b>Kenji is behind.</b> Move ${overdue.map(a => esc(a.name)).join(' and ')} to Aisha?</div><button class="btn sm pri" onclick="App.reassign(${js(overdue.map(a => a.id))},'aisha')">Move to Aisha</button></div>` : ''}
      <div class="assign-f"><div class="lbl">Assign a task</div>
        <div class="assign-row"><label class="sr" for="asT">Task</label><input class="edit" id="asT" placeholder="e.g. Call back Larkspur about the comparison" style="flex:2 1 220px">
          <label class="sr" for="asR">Rep</label><select class="sel" id="asR">${opts('kenji')}</select>
          <label class="sr" for="asA">Account</label><select class="sel" id="asA"><option value="">No account</option>${ACCOUNTS.filter(a => !a.generated || a.nba).slice(0, 30).map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>
          <label class="sr" for="asD">Due</label><select class="sel" id="asD"><option>Today</option><option>Tomorrow</option><option>Fri 30 Oct</option></select>
          <button class="btn sm pri" onclick="App.assignTask()">Assign</button></div>
        ${shared.tasks.length ? `<div style="margin-top:10px">${shared.tasks.map(x => `<div class="mini-row"><span class="badge b-ter nodot">${esc(first(USERS[x.to].name))}</span><div class="grow"><div class="nm">${esc(x.t)}</div><div class="sm">${x.acc ? esc(acct(x.acc).name) + ' · ' : ''}due ${esc(x.due)}</div></div><span class="muted" style="font-size:11px">${x.done ? 'Done' : 'Open'}</span></div>`).join('')}</div>` : ''}
      </div></section>`;
  }

  /* ─── Scoring, shown as the process it follows ─── */
  const RAW = { 1: 100, 2: 60, 3: 30 };
  function scoreProcess(a, open) {
    const sig = a ? a.signals.slice().sort((p, q) => q.weight - p.weight) : [];
    return `<details class="proc-i" ${open ? 'open' : ''}><summary title="How the score is calculated">${ic('help', 14)}<span>How the score is calculated</span></summary><div class="ccard proc"><div class="ccard-h"><span class="t">${ic('layers', 14)} How the score is calculated</span><span class="muted" style="font-size:11px">thresholds v2026.10</span></div>
      <div class="ccard-b"><ol class="proc-steps">
        <li><b>Collect signals</b><span>23 sources: hiring, news, website visits, tech stack, CRM</span></li>
        <li><b>Qualify</b><span>Keep a signal only if it's observable, predictive and time-bound</span></li>
        <li><b>Weigh by tier</b><span>Tier 1 = 100 · Tier 2 = 60 · Tier 3 = 30 points</span></li>
        <li><b>Decay</b><span>Older signals count for less</span></li>
        <li><b>Stack into Timing</b><span>Strongest + ½ × second + ¼ × third, as a share of 200 points: 0–100</span></li>
        <li><b>Fit × Timing ÷ 100 = Score</b><span>Out of 100 · tier A ≥ 40 · B ≥ 20 · C above 0</span></li>
      </ol>
      ${a ? `<div class="proc-ex"><div class="lbl">Worked example · ${esc(a.name)}</div>
        ${sig.map((x, i) => `<div class="pe-r"><span class="badge ${x.tier === 1 ? 'b-pos' : x.tier === 2 ? 'b-sec' : 'b-grey'} nodot">T${x.tier}</span><span class="grow">${esc(x.type)} <span class="muted">· ${ago(x.age)}</span></span><span class="mono">${RAW[x.tier]} → ${x.weight}</span><span class="mono pe-m">${i === 0 ? '× 1' : i === 1 ? '× ½' : '× ¼'}</span></div>`).join('')}
        <div class="pe-sum mono">${a.points} points ÷ 2 = Timing ${a.timing} · Fit ${a.fit} × ${a.timing} ÷ 100 = <b>${a.score} / 100</b> → tier ${a.tier}</div></div>` : ''}
      </div></div></details>`;
  }

  /* ─── Inbox: replies from email and LinkedIn in one place ─── */
  REPLIES.forEach((r, i) => { if (!r.ch) r.ch = r.acc === 'eastgate' ? 'Email' : i % 3 === 1 ? 'LinkedIn' : 'Email'; });
  const threads = () => REPLIES.filter(r => isMgr ? ownerF === 'all' || r.owner === ownerF : r.owner === me.id);
  const needsReply = r => !S.handled[r.id] && r.kind !== 'Out of office';
  function suggestReply(r, a) {
    const f = first(r.from), me1 = first(USERS[a.owner].name);
    if (r.kind === 'Positive') return `Hi ${f},\n\nGreat to hear from you. I can do Tuesday 3 Nov at 10:00, Wednesday 4 Nov at 14:00 or Thursday 5 Nov at 09:30. I'll bring a short comparison for ${a.name} so we can use the time well.\n\nBest,\n${me1}`;
    if (r.kind === 'Objection') return `Hi ${f},\n\nThanks for being straight with me, that's helpful. I won't push. Would it be useful if I checked in closer to your next planning cycle with a one-page view of what comparable sites did?\n\nBest,\n${me1}`;
    if (r.kind === 'Meeting booked') return `Hi ${f},\n\nThanks for booking. I'll send a short agenda the day before. Anything you'd like us to cover first?\n\nBest,\n${me1}`;
    return 'No reply needed. The remaining steps resume when they\'re back (4 Nov).';
  }
  /* Inbox: folders, the message list and a reading pane, like a mail client */
  const unread = r => !S.read[r.id] && !S.handled[r.id];
  function subjOf(r) { const out = acct(r.acc).activity.filter(x => x.msg).pop(); return r.ch === 'Email' ? 'Re: ' + (out ? out.msg.subject : r.source) : 'LinkedIn message · ' + r.source; }
  const FOLDERS = [['all', 'Inbox', 'inbox'], ['needs', 'Needs a reply', 'reply'], ['Positive', 'Positive', 'up'], ['Objection', 'Objection', 'alert'], ['Meeting booked', 'Meetings', 'check'], ['Out of office', 'Out of office', 'clock'], ['sent', 'Sent', 'plane'], ['archived', 'Archived', 'savei']];
  const inFolder = (r, k) => k === 'archived' ? !!S.archived[r.id] : k === 'sent' ? !!S.handled[r.id] : !S.archived[r.id] && (k === 'all' || (k === 'needs' ? needsReply(r) : r.kind === k));
  function renderInbox() {
    const src = threads(), q = ($('ibQ') && $('ibQ').value || '').toLowerCase();
    const list = src.filter(r => inFolder(r, inboxTab) && (ibCh === 'all' || r.ch === ibCh) && (!q || (r.from + acct(r.acc).name + r.text).toLowerCase().includes(q)));
    if (!thrId && innerWidth > 900 && list.length) thrId = list[0].id;
    const cur = thrId ? REPLIES.find(x => x.id === thrId) : null;
    $('main').className = 'ibx-pg';
    $('main').innerHTML = `<div class="ibx ${cur ? 'has-sel' : ''}">
      <aside class="ibx-f">
        <div class="ibx-ttl">Inbox</div>
        <button class="btn pri ibx-new" onclick="App.toast('New messages start from a campaign step or a next best action (mock)')">${ic('pen', 14)} <span>New message</span></button>
        <nav class="ibx-nav">${FOLDERS.map(([k, l, i]) => { const n = k === 'all' ? src.filter(r => inFolder(r, 'all') && unread(r)).length : src.filter(r => inFolder(r, k)).length; return `<button class="${inboxTab === k ? 'on' : ''}" onclick="App.setInboxTab('${k}')" title="${l}">${ic(i, 15)}<span>${l}</span><i>${n || ''}</i></button>`; }).join('')}</nav>
        <div class="ibx-sec">Channel</div>
        <nav class="ibx-nav">${[['all', 'All channels', 'layers'], ['Email', 'Email', 'mail'], ['LinkedIn', 'LinkedIn', 'li']].map(([k, l, i]) => `<button class="${ibCh === k ? 'on' : ''}" onclick="App.setIbCh('${k}')" title="${l}">${ic(i, 15)}<span>${l}</span></button>`).join('')}</nav>
        <div class="ibx-sec">Mailbox</div>${isMgr ? `<div class="ibx-mb">${ownerSel()}</div>` : `<div class="ibx-mb muted">${esc(mailbox({ owner: me.id }))}</div>`}
      </aside>
      <section class="ibx-l">
        <div class="ibx-lh">${backChip()}<div class="search">${ic('search', 14)}<label class="sr" for="ibQ">Search mail</label><input id="ibQ" placeholder="Search mail" value="${esc(q)}" oninput="App.renderAll()"></div></div>
        <div class="ibx-lt"><b>${FOLDERS.find(f => f[0] === inboxTab)[1]}</b><span class="muted">${list.length} conversation${list.length === 1 ? '' : 's'}</span></div>
        <div class="ibx-rows">${list.map(r => { const a = acct(r.acc); return `<button class="ibx-r ${unread(r) ? 'unread' : ''} ${thrId === r.id ? 'on' : ''}" onclick="App.openThread('${r.id}')">${pAvatar(a, 34)}<div class="grow"><div class="ibx-r1"><span class="fr">${esc(r.from)}</span><span class="when">${esc(r.at)}</span></div><div class="ibx-r2">${esc(subjOf(r))}</div><div class="ibx-r3">${esc(r.text)}</div><div class="ibx-r4">${chIc(r.ch)}<span class="badge ${KIND_B[r.kind]}">${r.kind}</span>${isMgr ? `<span>${esc(first(USERS[r.owner].name))}</span>` : ''}${S.handled[r.id] ? '<span>· replied</span>' : ''}</div></div></button>`; }).join('') || '<div class="empty">No conversations here.</div>'}</div>
      </section>
      <section class="ibx-v">${cur ? readingPane(cur) : `<div class="ibx-empty">${ic('inbox', 40, 1.5)}<div>Select a conversation to read it</div></div>`}</section>
    </div>`;
    if (q) { const s = $('ibQ'); s.focus(); s.setSelectionRange(q.length, q.length); }
  }
  function readingPane(r) {
    const a = acct(r.acc), out = a.activity.filter(x => x.msg).pop(), done = S.handled[r.id], rep = USERS[a.owner];
    return `<div class="rp-h"><div class="rp-top"><button class="ic-btn rp-back" title="Back to the list" onclick="App.closeThread()">${ic('left', 16)}</button><h2>${esc(subjOf(r))}</h2>
        <div class="rp-tools"><button class="ic-btn" title="Archive" onclick="App.archive('${r.id}')">${ic('savei', 16)}</button><button class="ic-btn" title="Mark as unread" onclick="App.markUnread('${r.id}')">${ic('mail', 16)}</button><button class="btn sm" onclick="App.openRecord('${a.id}','activity')">${ic('users', 13)} Open account</button></div></div>
        <div class="rp-labels"><span class="badge ${KIND_B[r.kind]}">${r.kind}</span><span class="badge b-grey nodot">${chIc(r.ch)} ${r.ch}</span><span class="badge b-brand nodot">${r.sourceKind === 'Campaign' ? 'Campaign: ' + esc(r.source) : 'Next best action'}</span></div></div>
      <div class="rp-b">
        <article class="rp-m"><div class="rp-mh">${pAvatar(a, 38)}<div class="grow"><div><b>${esc(r.from)}</b> <span class="muted">&lt;${esc(r.ch === 'Email' ? a.contact.email : 'via LinkedIn')}&gt;</span></div><div class="muted sm">to ${esc(rep.name)} · ${esc(a.contact.title)}, ${esc(a.name)}</div></div><span class="when">${esc(r.at)}</span></div>
          <div class="rp-t">${esc(r.text)}</div>
          ${out ? `<details class="rp-q"><summary>Show earlier message · ${esc(out.when)}</summary><div class="rp-qh"><b>${esc(rep.name)}</b> wrote:</div><div class="rp-t">${r.ch === 'Email' ? `<b>${esc(out.msg.subject)}</b>\n\n` : ''}${esc(out.msg.body)}</div></details>` : ''}
        </article>
        ${r.sourceKind === 'Campaign' && !done ? `<div class="tv-note">${ic('megaphone', 13)} The remaining steps of ${esc(r.source)} are paused for ${esc(first(r.from))} while you answer.</div>` : ''}
        ${done ? `<article class="rp-m mine"><div class="rp-mh">${avatar(rep, 38)}<div class="grow"><div><b>${esc(rep.name)}</b></div><div class="muted sm">to ${esc(r.from)} · via ${r.ch}</div></div><span class="when">Just now</span></div><div class="rp-t">${esc(S.drafts['thr-' + r.id] || suggestReply(r, a))}</div></article>`
        : `<div class="rp-reply"><div class="rp-rh">${ic('reply', 14)} Reply to ${esc(r.from)} · ${r.ch}<span class="badge b-brand nodot">${ic('spark', 11)} Drafted by AI</span></div>
          <label class="sr" for="thrBody">Reply</label><textarea id="thrBody" onchange="App.saveThread('${r.id}')">${esc(S.drafts['thr-' + r.id] || suggestReply(r, a))}</textarea>
          <div class="rp-rf"><span class="badge b-pos">Brand voice</span><span class="badge b-pos">Approved claims</span><div class="sp"></div>
            ${isMgr ? `<label class="sr" for="thrOwner">Owner</label><select class="sel" id="thrOwner" onchange="App.reassign(['${a.id}'],this.value)">${REPS.map(x => `<option value="${x}" ${a.owner === x ? 'selected' : ''}>${esc(USERS[x].name)}</option>`).join('')}</select>` : ''}
            ${r.kind === 'Positive' ? `<button class="btn" onclick="App.handoff('${r.id}')">${ic('right', 13)} Hand to proposals</button>` : ''}<button class="btn" onclick="App.handleReply('${r.id}','Marked as handled')">Mark handled</button>
            <button class="ic-btn mic" id="thrBodyMic" title="Talk to add to the reply" onclick="App.dictate('thrBody')">${ic('mic', 16)}</button>${r.kind === 'Out of office' ? `<button class="btn pri" onclick="App.handleReply('${r.id}','Steps resume on 4 Nov')">Resume on 4 Nov</button>` : `<button class="btn pri" onclick="App.saveThread('${r.id}');App.handleReply('${r.id}','Reply sent (placeholder: nothing is sent)')">${ic('plane', 13)} Send</button>`}</div></div>`}
      </div>`;
  }

  /* ─── Analytics (sales manager) ─── */
  function renderAnalytics() {
    const reps = ownerF === 'all' ? REPS : [ownerF], sum = k => reps.reduce((n, r) => n + TEAM_STATS[r][k], 0);
    /* A dashboard page, not a chat: the important numbers first as cards, then the detail */
    $('main').className = 'an-pg';
    $('main').innerHTML = `<div class="an-h"><div style="display:flex;align-items:center;gap:4px">${backChip()}<div><h1>Analytics</h1><div class="sub">Pilot week 3 · ${ownerF === 'all' ? 'whole team' : esc(USERS[ownerF].name)} · ${anPer === 'week' ? 'Mon 26 Oct – Sun 1 Nov' : 'October 2026'}</div></div></div><div class="an-ctl"><div class="seg">${[['week', 'This week'], ['month', 'This month']].map(([k, l]) => `<button class="${anPer === k ? 'on' : ''}" onclick="App.setAnPer('${k}')">${l}</button>`).join('')}</div>${ownerSel()}</div></div><div class="an-b" id="cv"></div>`;
    const cv = $('cv'), mo = anPer === 'month' ? 3.6 : 1, n = x => Math.round(x * mo), share = ownerF === 'all' ? 1 : 0.27;
    const spark = (pts, up) => { const mx = Math.max(...pts), mn = Math.min(...pts), w = 88, h = 30, xy = pts.map((v, i) => `${(i / (pts.length - 1) * w).toFixed(1)},${(h - 3 - (v - mn) / ((mx - mn) || 1) * (h - 6)).toFixed(1)}`); return `<svg class="spk" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${xy.join(' ')}" fill="none" stroke="${up ? 'var(--pos)' : 'var(--neg)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${xy[xy.length - 1].split(',')[0]}" cy="${xy[xy.length - 1].split(',')[1]}" r="2.5" fill="${up ? 'var(--pos)' : 'var(--neg)'}"/></svg>`; };
    /* Each card: the value, its last five periods, and the change against the previous period (green when it moved the right way) */
    const kpi = (icn, k, shown, v, sub, unit, betterUp, steady, goal) => {
      const pts = (steady ? [1.06, 1.03, 1.02, 0.99, 1] : betterUp ? [0.5, 0.62, 0.76, 0.9, 1] : [1.5, 1.3, 1.2, 0.9, 1]).map(x => v * x);
      if (!v) pts.splice(0, 5, 1, 1, 0, 0, 0);
      const d = pts[4] - pts[3], good = d === 0 ? true : (d > 0) === betterUp, dtxt = d === 0 ? 'No change' : `${d > 0 ? '+' : '−'}${unit === '%' ? Math.abs(d).toFixed(1) + ' pts' : unit === 'min' ? Math.round(Math.abs(d)) + ' min' : unit === 'M' ? Math.abs(d).toFixed(2) + 'M' : Math.round(Math.abs(d)) || 1}`;
      return `<div class="kpi"><div class="kpi-h"><span class="kpi-ic">${ic(icn, 15)}</span>${k}${goal ? `<span class="badge ${goal[1] ? 'b-pos' : 'b-warn'} nodot" style="margin-left:auto">${goal[0]}</span>` : ''}</div><div class="kpi-m"><div class="kpi-v">${shown}</div>${spark(pts, good)}</div><div class="kpi-f"><span class="dl ${good ? 'up' : 'down'}">${d === 0 ? '■' : d > 0 ? '▲' : '▼'} ${dtxt}</span><span class="muted">vs last ${anPer} · ${sub}</span></div></div>`;
    };
    const m = n(sum('meetings')), tg = n(sum('target')), rr = sum('replies') / sum('sent') * 100, acc = Math.round(sum('accept') / reps.length), od = sum('overdue');
    const own = ACCOUNTS.filter(a => a.nba && !a.campaign && reps.includes(a.owner)), went = own.filter(a => a.nba.status === 'auto').length, tot = own.filter(a => /auto|sent|ready|review/.test(a.nba.status)).length || 1;
    const g1 = ownerF === 'all' ? 12 : { sofia: 10, marco: 14, aisha: 9, kenji: 21 }[ownerF], pipe = 1.2 * (ownerF === 'all' ? 1 : TEAM_STATS[ownerF].meetings / 7 || 0.1) * mo;
    const kpis = `<div class="kpis">
      ${kpi('check', 'Meetings booked', `${m}<span class="of"> / ${tg}</span>`, m, 'target ' + tg, '', true, false, [m >= tg ? 'On target' : 'Below target', m >= tg])}
      ${kpi('reply', 'Reply rate', rr.toFixed(1) + '%', rr, `${n(sum('replies'))} of ${n(sum('sent'))} sent`, '%', true)}
      ${kpi('up', 'Positive replies', n(Math.round(sum('replies') * 0.53)), n(Math.round(sum('replies') * 0.53)), 'interested or booked', '', true)}
      ${kpi('task', 'Accepted first time · G2', acc + '%', acc, 'target 70%', '%', true, false, [acc >= 70 ? 'Passing' : 'Below target', acc >= 70])}
      ${kpi('bolt', 'Went ahead on their own', Math.round(went / tot * 100) + '%', went / tot * 100, `${went} of ${tot} next actions`, '%', true)}
      ${kpi('clock', 'Time to a first action · G1', g1 + ' min', g1, 'was 38 min before the pilot', 'min', false, false, [g1 <= 19 ? 'Passing' : 'Below target', g1 <= 19])}
      ${kpi('layers', 'Pipeline influenced', 'USD ' + pipe.toFixed(1) + 'M', pipe, 'open opportunities touched', 'M', true)}
      ${kpi('alert', 'Overdue items', od, od, 'past their due time', '', false, od === 0)}
    </div>`;
    const card = (k, v, d) => `<div class="mcard"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const f = ownerF === 'all' ? 1 : 0.27, funnel = [['People found', 412], ['Identity checked', 368], ['Accounts scored', 81], ['With a live signal', 33], ['Next actions (NBA)', 31], ['In campaigns (NBC)', 44], ['Contacted', 58], ['Replied', 15], ['Positive', 8], ['Meetings', sum('meetings')]].map(([k, v], i) => [k, i === 9 ? v : Math.round(v * f)]);
    cv.innerHTML = `${kpis}
      <div class="an-grid">
        <section class="card"><div class="card-h"><span class="lbl">Funnel · this month</span></div><div class="card-b">${funnel.map(([k, v]) => `<div class="fn-r"><span>${k}</span><div class="fn-b"><i style="width:${Math.max(3, v / funnel[0][1] * 100)}%"></i></div><b class="mono">${v}</b></div>`).join('')}</div></section>
        <section class="card"><div class="card-h"><span class="lbl">By rep</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Rep</th><th>Sent</th><th>Replies</th><th>Meetings</th><th>Accepted</th><th>Overdue</th></tr></thead><tbody>${REPS.map(r => { const t = TEAM_STATS[r]; return `<tr class="row-link ${ownerF === r ? 'sel-row' : ''}" onclick="App.setOwner('${r}')"><td><div style="display:flex;gap:8px;align-items:center">${avatar(USERS[r], 22)}${esc(USERS[r].name)}</div></td><td>${t.sent}</td><td>${t.replies}</td><td>${t.meetings}/${t.target}</td><td>${t.accept}%</td><td>${t.overdue ? `<span class="badge b-neg">${t.overdue}</span>` : '0'}</td></tr>`; }).join('')}</tbody></table></div></section>
      </div>
      <section class="card" style="margin-top:14px"><div class="card-h"><span class="lbl">Campaigns</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Campaign</th><th>Status</th><th>Accounts</th><th>Reply rate</th><th>Positive</th><th>Meetings</th></tr></thead><tbody>${CAMPAIGNS.map(c => { const st = campStats(c); return `<tr class="row-link" onclick="App.goCampaign('${c.id}')"><td class="nm">${esc(c.name)}</td><td>${campBadge(c)}</td><td>${st.total}</td><td>${pct(st.replies, st.started)}</td><td>${st.positive}</td><td>${st.meetings}</td></tr>`; }).join('')}</tbody></table></div></section>
      <section class="card" style="margin-top:14px"><div class="card-h"><span class="lbl">What the system learned</span></div><div class="card-b" style="padding:2px 16px">${LEARNED.map(l => `<div class="mini-row"><span class="badge b-${l.k} nodot">${l.k === 'pos' ? '↑' : l.k === 'neg' ? '↓' : l.k === 'warn' ? '!' : 'i'}</span><div class="grow"><div class="nm">${esc(l.t)}</div><div class="sm" style="white-space:normal">${esc(l.d)}</div></div></div>`).join('')}</div></section>`;
  }
  /* ─── The Analytics chat: answers from the same numbers as the dashboard, and moves the dashboard to match ─── */
  function anNums() {
    const reps = isMgr ? (ownerF === 'all' ? REPS : [ownerF]) : [me.id], sum = k => reps.reduce((n, r) => n + TEAM_STATS[r][k], 0), mo = anPer === 'month' ? 3.6 : 1, n = x => Math.round(x * mo);
    const own = ACCOUNTS.filter(a => a.nba && !a.campaign && reps.includes(a.owner)), went = own.filter(a => a.nba.status === 'auto').length, tot = own.filter(a => /auto|sent|ready|review/.test(a.nba.status)).length || 1;
    const one = reps.length === 1 ? reps[0] : null;
    return { reps, who: one ? (one === me.id ? 'you' : USERS[one].name) : 'the team', per: anPer === 'month' ? 'this month' : 'this week', meet: n(sum('meetings')), target: n(sum('target')), sent: n(sum('sent')), replies: n(sum('replies')), rr: sum('replies') / sum('sent') * 100, pos: n(Math.round(sum('replies') * 0.53)), acc: Math.round(sum('accept') / reps.length), od: sum('overdue'), went, tot, g1: one ? { sofia: 10, marco: 14, aisha: 9, kenji: 21 }[one] : 12, pipe: 1.2 * (one ? TEAM_STATS[one].meetings / 7 || 0.1 : 1) * mo };
  }
  function anRespond(t) {
    const rp = REPS.find(r => new RegExp('\\b' + first(USERS[r].name).toLowerCase() + '\\b').test(t));
    if (/month/.test(t)) anPer = 'month'; else if (/week/.test(t)) anPer = 'week';
    if (isMgr) { if (rp) ownerF = rp; else if (/team|everyone|all reps|whole|\bwe\b|\bour\b|\bus\b/.test(t)) ownerF = 'all'; }
    const N = anNums(), link = (l, js) => `<a href="#analytics" onclick="${js};return false">${l}</a>`, open = view() === 'analytics' ? '' : `<div class="next-row">${openBtn('Open Analytics', "App.openMod('analytics')")}</div>`;
    const steps = [`Pulled ${N.per}'s numbers for ${N.who === 'you' ? 'your accounts' : esc(N.who)}`, 'Compared them with the previous period'];
    const kc = (k, v, d, js) => `<div class="mcard ${js ? 'row-link' : ''}" ${js ? `onclick="${js}"` : ''}><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const say = (html, cs) => ({ kind: 'text', html: html + (cs ? `<div class="mcards an-c">${cs.join('')}</div>` : '') + open, steps });
    const C = { meet: kc('Meetings', `${N.meet}<span class="muted" style="font-size:13px"> / ${N.target}</span>`, N.meet >= N.target ? 'on target' : `${N.target - N.meet} short`), rr: kc('Reply rate', N.rr.toFixed(1) + '%', `${N.replies} of ${N.sent} sent`), pos: kc('Positive', N.pos, 'interested or booked', "App.openMod('inbox')"), auto: kc('Went ahead', Math.round(N.went / N.tot * 100) + '%', `${N.went} of ${N.tot} next actions`), acc: kc('Accepted · G2', N.acc + '%', 'target 70%'), g1: kc('First action · G1', N.g1 + ' min', 'target 19 min'), pipe: kc('Pipeline', 'USD ' + N.pipe.toFixed(1) + 'M', 'influenced'), od: kc('Overdue', N.od, 'past due') };
    const repRows = () => REPS.map(r => [r, TEAM_STATS[r]]).sort((p, q) => q[1].meetings / q[1].target - p[1].meetings / p[1].target);
    if (/meeting|target|booked/.test(t)) return say(`<b>${N.meet} of ${N.target}</b> meetings booked ${N.per} for ${esc(N.who)}, ${N.meet >= N.target ? 'on target' : `<b>${N.target - N.meet} short</b>`}. ${isMgr && !rp ? `Behind: ${repRows().filter(([, s]) => s.meetings < s.target).map(([r, s]) => `${link(esc(first(USERS[r].name)), `App.setOwner('${r}')`)} ${s.meetings}/${s.target}`).join(', ')}. The quickest gain is the 8 positive replies still waiting for an answer.` : ''}`, [C.meet, C.pos]);
    if (/reply|response|open rate/.test(t)) return say(`Reply rate ${N.per} is <b>${N.rr.toFixed(1)}%</b> (${N.replies} replies from ${N.sent} sent), up 2.7 points on last ${anPer}. ${N.pos} were positive. ${isMgr && !rp ? `Best: ${esc(USERS[REPS.slice().sort((p, q) => TEAM_STATS[q].replies / TEAM_STATS[q].sent - TEAM_STATS[p].replies / TEAM_STATS[p].sent)[0]].name)}.` : ''} Short plain-text first touches are still doing best.`, [C.rr, C.pos]);
    if (/positive|interested/.test(t)) return say(`<b>${N.pos}</b> positive replies ${N.per} for ${esc(N.who)}: interested or a meeting booked. ${link('See them in Inbox', "App.openMod('inbox')")}.`, [C.pos, C.rr]);
    if (/accept|first time|\bg2\b|override/.test(t)) return say(`Reps accepted <b>${N.acc}%</b> of recommendations first time (G2, target 70%): ${N.acc >= 70 ? 'passing' : 'below target'}. Skips and edits come back as signals, so the next run starts better.`, [C.acc, C.auto]);
    if (/went ahead|on (their|its) own|autonom|auto/.test(t)) return say(`<b>${Math.round(N.went / N.tot * 100)}%</b> of next best actions went ahead on their own (${N.went} of ${N.tot}), because they passed all six checks. The rest waited for a person. ${link('See the autonomy dial', "App.ask('How much do agents do on their own?')")}.`, [C.auto, C.acc]);
    if (/time to|first action|\bg1\b|speed|fast/.test(t)) return say(`Time to a first action is <b>${N.g1} minutes</b> (G1, target 19), down from 38 before the pilot.`, [C.g1, C.auto]);
    if (/pipeline|revenue|usd|opportunit/.test(t)) return say(`Pipeline influenced ${N.per}: <b>USD ${N.pipe.toFixed(1)}M</b> of open opportunities the AI touched for ${esc(N.who)}.`, [C.pipe, C.meet]);
    if (/overdue|late|behind/.test(t)) return say(N.od ? `<b>${N.od}</b> items are overdue: ${repRows().filter(([r, s]) => s.overdue && N.reps.includes(r)).map(([r, s]) => `${esc(first(USERS[r].name))} ${s.overdue}`).join(', ')}. ${isMgr ? "Moving Kenji's Banyan Gas to Aisha clears the oldest." : ''}` : 'Nothing is overdue.');
    if (/funnel|leak|drop|convert/.test(t)) return say('The biggest drop is <b>live signal → contacted</b>: 33 accounts had a signal but only 24 were contacted within 2 days, mostly because 3 rep mailboxes aren\'t connected. Replies → positive is healthy (8 of 15).');
    if (/campaign/.test(t)) { const cs = CAMPAIGNS.map(c => [c, campStats(c)]).filter(([, s]) => s.started), b = cs.slice().sort((p, q) => q[1].replies / q[1].started - p[1].replies / p[1].started); return b.length ? say(`Best campaign by reply rate: ${link('<b>' + esc(b[0][0].name) + '</b>', `App.goCampaign('${b[0][0].id}')`)} at ${pct(b[0][1].replies, b[0][1].started)} (${b[0][1].meetings} meetings). ${b.length > 1 ? `Weakest: ${esc(b[b.length - 1][0].name)} at ${pct(b[b.length - 1][1].replies, b[b.length - 1][1].started)}.` : ''}`, b.slice(0, 4).map(([c, s]) => kc(esc(c.name), pct(s.replies, s.started), `reply rate · ${s.meetings} meeting${s.meetings === 1 ? "" : "s"}`, `App.goCampaign('${c.id}')`))) : say('No campaign has started sending yet.'); }
    if (/learn|worked|lesson/.test(t)) return say(LEARNED.slice(0, 3).map(l => `<b>${esc(l.t)}</b>: ${esc(l.d)}`).join('<br>'));
    if (isMgr && (rp || /\brep|who('s| is) (best|top|behind)|team|compare|leaderboard/.test(t))) { if (rp) { const s = TEAM_STATS[rp]; return say(`<b>${esc(USERS[rp].name)}</b> ${N.per}: ${s.meetings}/${s.target} meetings, ${s.replies} ${s.replies === 1 ? 'reply' : 'replies'} from ${s.sent} sent, ${s.accept}% accepted first time, ${s.overdue} overdue. The dashboard now shows only their numbers; ${link('back to the whole team', "App.setOwner('all')")}.`, [C.meet, C.rr, C.acc, C.od]); } return say(`By meetings against target: ${repRows().map(([r, s]) => `${link(esc(first(USERS[r].name)), `App.setOwner('${r}')`)} ${s.meetings}/${s.target}`).join(' · ')}. ${esc(first(USERS[repRows().pop()[0]].name))} needs help most.`, repRows().map(([r, s]) => kc(esc(USERS[r].name), `${s.meetings}<span class="muted" style="font-size:13px"> / ${s.target}</span>`, `meetings · ${s.overdue} overdue`, `App.setOwner('${r}')`))); }
    if (/summar|overview|how are we|how am i|how('s| is) it going|doing|analytics|dashboard|numbers|kpi|metric|show/.test(t)) return say(`${N.per.charAt(0).toUpperCase() + N.per.slice(1)} for ${esc(N.who)}: <b>${N.meet}/${N.target}</b> meetings, reply rate <b>${N.rr.toFixed(1)}%</b>, <b>${N.pos}</b> positive ${N.pos === 1 ? 'reply' : 'replies'}, <b>${Math.round(N.went / N.tot * 100)}%</b> of next actions went ahead on their own, pipeline influenced <b>USD ${N.pipe.toFixed(1)}M</b>, ${N.od} overdue. ${N.meet < N.target ? 'Meetings are the gap; ask "Where are we stuck?" for the fixes.' : ''}`, [C.meet, C.rr, C.pos, C.auto, C.pipe, C.od]);
    return view() === 'analytics' ? say('I can answer from the dashboard: meetings against target, reply rate, positive replies, accepted first time, what went ahead on its own, time to a first action, pipeline, overdue items, the funnel, campaigns or one rep. Add "this month" to switch the period.') : null;
  }
  function ownerSel() { return isMgr ? `<label class="sr" for="ownF">Rep</label><select class="sel" id="ownF" onchange="App.setOwner(this.value)"><option value="all">All reps</option>${REPS.map(r => `<option value="${r}" ${ownerF === r ? 'selected' : ''}>${esc(USERS[r].name)}</option>`).join('')}</select>` : ''; }
  function skeleton() {
    $('main').className = 'canvas';
    $('main').innerHTML = `<div class="cv-h"><div class="sk" style="width:220px;height:20px"></div><div class="sk" style="width:90px;height:28px"></div></div><div class="cv-b"><div class="mcards">${'<div class="sk" style="height:84px"></div>'.repeat(5)}</div><div class="sk" style="height:20px;width:180px;margin:22px 0 12px"></div>${'<div class="sk" style="height:46px;margin-bottom:8px"></div>'.repeat(6)}</div>`;
  }

  /* ─── Module and canvas frames ─── */
  function frame(title, sub, actions, closable) {
    $('main').className = 'canvas';
    $('main').innerHTML = `<div class="cv-h">${backChip()}<div class="cv-ht"><div class="cv-t">${title}</div>${sub ? `<div class="cv-s">${sub}</div>` : ''}</div><div class="cv-a">${actions || ''}<button class="ic-btn" onclick="App.closeCanvas()" title="Close">${ic('x', 16)}</button></div></div><div class="cv-b" id="cv"></div>`;
    return $('cv');
  }
  const filt = (label, ic2, on) => `<button class="fchip ${on ? 'on' : ''}">${ic2 ? ic(ic2, 13) : ''}${label}</button>`;

  /* Result table opened beside the chat */
  function renderArt() {
    const t = TABLES[art]();
    const cv = frame(`${ic('table', 16)} ${esc(t.title)}`, `${t.rows.length} records`, `<button class="ic-btn" title="Save as a list" onclick="App.ask('Save as a list')">${ic('savei', 16)}</button><button class="ic-btn" title="Download" onclick="App.toast('Downloads are a placeholder in the mock')">${ic('dl', 16)}</button><button class="btn sm pri" onclick="App.ask('Build the campaign')">${ic('plane', 13)} Add to campaign</button>`, true);
    const q = ($('artQ') && $('artQ').value || '').toLowerCase();
    const cols = artMore ? Object.keys(COL).filter(k => !['status'].includes(k) || art === 'ranked') : t.cols;
    const rows = t.rows.filter(a => !q || (a.name + a.contact.name + a.country).toLowerCase().includes(q));
    cv.innerHTML = `<div class="search wide">${ic('search', 14)}<label class="sr" for="artQ">Search table</label><input id="artQ" placeholder="Search table" value="${esc(q)}" oninput="App.renderAll()"></div>
      <div class="card tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th></th>${cols.map(c => `<th>${COL[c][0]}</th>`).join('')}</tr></thead><tbody>${rows.map((a, i) => `<tr class="row-link" onclick="App.openRecord('${a.id}','overview')"><td class="mono muted">${i + 1}</td>${cols.map(c => `<td>${COL[c][1](a)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <button class="more-cols" onclick="App.toggleMore()">${artMore ? 'Fewer columns' : 'More columns'} ${ic(artMore ? 'left' : 'right', 13)}</button>`;
    if (q) { const s = $('artQ'); s.focus(); s.setSelectionRange(q.length, q.length); }
  }

  /* Accounts (lists are saved selections: tabs above the table) */
  function renderAccounts() {
    const lists = [{ id: 'all', name: 'All accounts' }].concat(S.lists, LISTS);
    const l = lists.find(x => x.id === listSel) || lists[0];
    let rows = l.id === 'all' ? ACCOUNTS : l.ids ? l.ids.map(acct) : l.seg ? ACCOUNTS.filter(a => a.seg === l.seg) : l.id === 'L1' ? listAccounts() : ACCOUNTS.filter(a => a.score > 0);
    const q = ($('accQ') && $('accQ').value || '').toLowerCase(), tf = ($('accT') && $('accT').value) || 'all';
    rows = rows.filter(a => visible(a) && (!q || (a.name + a.contact.name + a.country + a.segment).toLowerCase().includes(q)) && (tf === 'all' || a.tier === tf));
    const cv = frame('Accounts', `${rows.length} accounts${l.id === 'all' ? '' : ' in this list'} · Score = Fit × Timing`, `<button class="btn sm" onclick="App.saveView()">${ic('savei', 13)} Save as a list</button><button class="btn sm pri" onclick="App.ask('Find prospects like my last 10 wins')">${ic('search', 13)} Find prospects</button>`);
    cv.innerHTML = `<div class="list-tabs">${lists.map(x => `<button class="${x.id === l.id ? 'on' : ''}" onclick="App.openList('${x.id}')">${esc(x.name)}${x.kind ? `<i>${esc(x.kind)}</i>` : ''}</button>`).join('')}</div>
      ${l.note ? `<div class="list-note">${esc(l.note)} · saved by ${esc(l.by)} · ${esc(l.when)}<span style="flex:1"></span>${btn('Score this list', 'Score this list')}${btn('Create micro-segments', 'Create micro-segments')}</div>` : ''}
      <div class="toolbar">${ownerSel()}
        <label class="sr" for="accT">Tier</label><select class="sel" id="accT" onchange="App.renderAll()">${[['all', 'All tiers'], ['A', 'Tier A'], ['B', 'Tier B'], ['C', 'Tier C']].map(([k, lb]) => `<option value="${k}" ${tf === k ? 'selected' : ''}>${lb}</option>`).join('')}</select>
        <div class="search">${ic('search', 14)}<label class="sr" for="accQ">Search</label><input id="accQ" placeholder="Search accounts, people, segments" value="${esc(q)}" oninput="App.renderAll()"></div><button class="btn sm ghost" onclick="App.toggleProc()">${ic('layers', 13)} ${showProc ? 'Hide' : 'How scoring works'}</button></div>
      ${showProc ? scoreProcess(rows.find(a => a.score > 0), true) : ''}
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Account</th><th>Person</th><th>Tier</th><th>Score</th><th>Why now</th><th>Micro-segment</th>${isMgr ? '<th>Owner</th>' : ''}<th>Status</th></tr></thead><tbody>
        ${rows.map((a, i) => `<tr class="row-link" onclick="App.openRecord('${a.id}','overview')"><td class="mono muted">${i + 1}</td><td><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.industry)} · ${esc(a.country)}</div></td><td>${esc(a.contact.name)}<div class="sm">${esc(a.contact.title)}</div></td><td>${tierBadge(a.tier)}</td><td class="mono">${sc(a)}</td><td>${a.whyNow ? `${esc(a.whyNow.type)}<div class="sm">${ago(a.whyNow.age)}</div>` : '<span class="muted">No live signal</span>'}</td><td>${a.seg ? `<span class="seg-link" onclick="event.stopPropagation();App.openSegment('${a.seg}')">${esc(a.segment)}</span>` : '–'}</td>${isMgr ? `<td>${ownerPick(a)}</td>` : ''}<td>${stepBadge(a)}</td></tr>`).join('')}</tbody></table></div>`;
    const s = $('accQ'); if (q) { s.focus(); s.setSelectionRange(q.length, q.length); }
  }
  const ownerPick = a => isMgr ? `<label class="sr" for="own-${a.id}">Owner</label><select class="sel own-sel" id="own-${a.id}" onclick="event.stopPropagation()" onchange="App.reassign(['${a.id}'],this.value)">${(REPS.includes(a.owner) ? REPS : [a.owner].concat(REPS)).map(r => `<option value="${r}" ${a.owner === r ? 'selected' : ''}>${esc(first(USERS[r].name))}</option>`).join('')}</select>` : `<span class="sm">${esc(first(USERS[a.owner].name))}</span>`;
  const assignAll = (ids, what) => isMgr && ids.length ? `<label class="sr" for="asg-${what}">Assign ${what}</label><select class="sel own-sel" id="asg-${what}" onclick="event.stopPropagation()" onchange="if(this.value)App.reassign(${esc(JSON.stringify(ids))},this.value)"><option value="">Assign ${what} to…</option>${REPS.map(r => `<option value="${r}">${esc(USERS[r].name)}</option>`).join('')}</select>` : '';
  function stepBadge(a) {
    if (a.campaign) return stateBadge(a.campState);
    if (!a.nba) return '<span class="badge b-grey nodot">Waiting for a signal</span>';
    const d = S.decisions[a.id];
    if (d) return `<span class="badge b-grey nodot">${decLabel(d)}</span>`;
    if (a.nba.status === 'auto') return '<span class="badge b-pos">Went ahead</span>';
    if (a.nba.status === 'sent') return `<span class="badge b-sec">${esc(a.outcome || 'Sent')}</span>`;
    return `<span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a) === 'Ready' ? 'Ready for OK' : reasonOf(a)}</span>`;
  }

  /* Segments: list → segment detail → person drawer → activity */
  function segStats(s) {
    const accs = ACCOUNTS.filter(a => a.seg === s.id), my = accs.filter(mine);
    return { total: accs.length, mine: my.length, waiting: accs.filter(a => a.nba && /ready|review/.test(a.nba.status) && !S.decisions[a.id]).length, ahead: accs.filter(a => a.nba && /auto|sent/.test(a.nba.status)).length, replies: REPLIES.filter(r => acct(r.acc).seg === s.id).length };
  }
  function renderSegments() {
    if (segSel) return renderSegment();
    const cv = frame('Micro-segments', `${SEGMENTS.length} segments`, `<button class="btn sm pri" onclick="App.ask('Create micro-segments')">${ic('spark', 13)} Segment a list</button>`);
    cv.innerHTML = `<div class="toolbar">${ownerSel()}${filt('Campaign · NBC', '', false)}${filt('My actions · NBA', '', false)}${filt('Building', '', false)}<div class="search" style="margin-left:auto">${ic('search', 14)}<input placeholder="Search…" aria-label="Search segments"></div></div>
      <div class="rule"><b>Campaign or my action?</b> 10 or more accounts in one segment within 7 days become a campaign (NBC) once ${isMgr ? 'you confirm' : 'Daniel confirms'}. Fewer, and each account gets its own next best action (NBA). Sensitive segments never become campaigns.</div>
      <div class="seg-grp-h">${ic('megaphone', 15)} Campaign segments · NBC<span>one sequence for the whole segment; delivery is tracked in Campaigns</span></div>
      <div class="srow-list">${SEGMENTS.filter(x => x.mode === 'NBC').map(segRow).join('')}</div>
      <div class="seg-grp-h">${ic('bolt', 15)} Next best action segments · NBA<span>one action per account, from the segment's message structure; delivery is tracked here</span></div>
      <div class="srow-list">${SEGMENTS.filter(x => x.mode !== 'NBC').map(segRow).join('')}</div>`;
  }
  /* Segments track both: a campaign segment (NBC) through its campaign, every other segment (NBA) through the delivery of each account's action */
  const segNba = s => ACCOUNTS.filter(a => a.seg === s.id && a.nba && !a.campaign && /auto|sent|review|ready/.test(a.nba.status) && visible(a));
  function nbaCounts(rows) {
    const t = rows.map(track);
    return { all: rows.length, went: t.filter(x => x.how === 'Went ahead on its own').length, wait: t.filter(x => x.stage === 0 && x.how === 'Needs a person').length, sent: t.filter(x => x.stage >= 1).length, deliv: t.filter(x => x.stage >= 2).length, opened: t.filter(x => x.stage >= 3).length, replied: t.filter(x => x.stage >= 4).length, bounced: t.filter(x => x.cls === 'b-neg').length };
  }
  function segRowM(s, st, c) {
    const m = (v, k) => `<div><b>${v}</b><span>${k}</span></div>`;
    if (c) { const cs = campStats(c); return `<div class="srow-m">${m(cs.total, 'Enrolled')}${m(cs.progress, 'In progress')}${m(pct(cs.replies, cs.started), 'Reply rate')}${m(cs.positive || '-', 'Positive')}${m(cs.meetings || '-', 'Meetings')}${m(esc(campStatus(c)), 'Campaign')}</div>`; }
    const n = nbaCounts(segNba(s));
    return `<div class="srow-m">${m(n.all, 'Actions')}${m(n.went, 'Went ahead')}${m(n.wait, 'Waiting')}${m(n.deliv, 'Delivered')}${m(n.opened, 'Opened')}${m(n.replied, 'Replied')}</div>`;
  }
  function segRow(s) {
    const st = segStats(s), c = s.campaign ? campOf(s.campaign) : null;
    return `<div class="srow" onclick="App.openSegment('${s.id}')">
        <div class="srow-n"><div class="nm">${esc(s.name)} ${modeBadge(s)}</div><div class="sm">${esc(s.trigger)} · ${c ? `${esc(campStatus(c))} · ${seqSpan(c)}` : s.mode === 'Building' ? `${s.building} of 10 toward a campaign · ${s.proven.toLowerCase()} message` : `${s.proven.toLowerCase()} message`}${s.sensitive ? ' · sensitive' : ''}</div></div>
        ${segRowM(s, st, c)}
        <button class="ic-btn" title="Star" onclick="event.stopPropagation();App.star('${s.id}')" style="color:${S.starred[s.id] ? 'var(--ter)' : 'inherit'}">${ic('star', 15)}</button></div>`;
  }
  function nbaTop(s, rows) {
    const n = nbaCounts(rows), card = (k, v, d, icn) => `<div class="mcard"><div class="k">${icn ? ic(icn, 13) : ''} ${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const bar = ['Prepared', 'Sent', 'Delivered', 'Opened', 'Replied'].map((x, i) => { const v = [n.all, n.sent, n.deliv, n.opened, n.replied][i]; return `<div class="dlv-s"><b>${v}</b><span>${x}</span><i style="width:${Math.max(4, v / (n.all || 1) * 100)}%"></i></div>`; }).join(`<span class="dlv-a">${ic('right', 14)}</span>`);
    return `<div class="mcards">${card('Next best actions', n.all, 'one per account', 'bolt')}${card('Went ahead on their own', n.went, 'passed every check', 'check')}${card('Waiting for approval', n.wait, 'in Approvals', 'task')}${card('Delivered', n.deliv, `${pct(n.deliv, n.sent)} of sent${n.bounced ? ` · ${n.bounced} bounced` : ''}`, 'mail')}${card('Open rate', pct(n.opened, n.deliv), `${n.opened} opened`)}${card('Reply rate', pct(n.replied, n.deliv), `${n.replied} replied · ${s.rate ? s.rate + '% positive historically' : 'no history yet'}`, 'reply')}</div>
      <div class="dlv">${bar}</div>`;
  }
  function nbaTable(rows) {
    return `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Next best action</th><th>How it went out</th><th>Delivery</th><th>When</th>${isMgr ? '<th>Rep</th>' : ''}</tr></thead><tbody>
      ${rows.map(a => { const t = track(a); return `<tr class="row-link" onclick="App.openRecord('${a.id}','engage')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.name)} · ${tierBadge(a.tier)} ${sc(a)}</div></div></div></td><td>${esc(a.nba.action)}<div class="sm">${chIc(a.nba.channel)} ${a.nba.channel}</div></td><td><span class="badge ${t.how === 'Went ahead on its own' ? 'b-pos' : t.how === 'Needs a person' ? 'b-ter' : 'b-sec'} nodot">${t.how}</span></td><td><div class="dlv-c">${dots(t)}<span class="badge ${t.cls}">${esc(t.label)}</span></div></td><td class="sm">${esc(t.when || '–')}</td>${isMgr ? `<td>${ownerPick(a)}</td>` : ''}</tr>`; }).join('') || `<tr><td colspan="6" class="empty">${isMgr ? 'No next best actions here.' : 'None of your accounts have a next best action in this segment.'}</td></tr>`}
    </tbody></table></div>`;
  }
  function renderSegment() {
    const s = segOf(segSel), c = s.campaign ? campOf(s.campaign) : null, st = segStats(s);
    const accs = ACCOUNTS.filter(a => a.seg === s.id && visible(a)).sort((p, q) => q.score - p.score);
    const cv = frame(`<button class="back-l" onclick="App.openSegment(null)">${ic('left', 14)}</button> ${esc(s.name)} ${modeBadge(s)}`, `${esc(s.trigger)} · ${st.total} accounts${s.fromList ? ' · from a prospect list' : ''}`, c ? `<button class="btn sm pri" onclick="App.goCampaign('${c.id}')">${ic('megaphone', 13)} Open campaign</button>` : `<button class="btn sm" onclick="App.saveSegList('${s.id}')">${ic('savei', 13)} Save as a list</button>`);
    const nrows = segNba(s);
    cv.innerHTML = `${s.mode !== 'NBC' ? nbaTop(s, nrows) : `<div class="mcards">${[['Accounts', isMgr ? st.total : `${st.mine} of ${st.total}`, isMgr ? 'in this segment' : 'are yours'], ['Waiting on you', st.waiting, 'need a person'], ['Went ahead', st.ahead, 'on their own'], ['Positive rate', s.rate ? s.rate + '%' : '--', `${s.outcomes} outcomes`], ['Message', s.proven, 'from the outcome cache']].map(([k, v, d]) => `<div class="mcard"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('')}</div>${c ? `<div class="tv-note" style="margin-top:12px">${ic('megaphone', 13)} This segment runs as one campaign. Each person's steps and delivery are in <a href="#campaigns" onclick="App.goCampaign('${c.id}');return false">${esc(c.name)}</a>.</div>` : ''}`}
      <div class="seg-why"><div><div class="lbl">Why these accounts are together</div><p class="p">${esc(s.why)}</p></div><div><div class="lbl">Message structure</div><p class="p">${esc(s.structure)}</p></div></div>
      <div class="dtabs">${[['accounts', s.mode === 'NBC' ? 'Accounts' : 'Next best actions'], ['activity', 'Activity'], ['replies', 'Replies']].map(([k, lb]) => `<button class="${segTab === k ? 'on' : ''}" onclick="App.setSegTab('${k}')">${lb}</button>`).join('')}${isMgr ? `<span style="margin-left:auto">${ownerSel()}</span>` : ''}</div>
      ${segTab === 'accounts' && s.mode !== 'NBC' ? nbaTable(nrows) : segTab === 'accounts' ? `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Links</th><th>Status</th><th>Company</th><th>Tier · score</th><th>${s.mode === 'NBC' ? 'Signal' : 'Next best action'}</th>${isMgr ? '<th>Owner</th>' : ''}<th>Last activity</th></tr></thead><tbody>
        ${accs.map(a => `<tr class="row-link" onclick="App.openRecord('${a.id}','engage')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.contact.title)}</div></div></div></td><td><span class="li-ic">${ic('li', 14)}</span></td><td>${stepBadge(a)}</td><td>${esc(a.name)}</td><td>${tierBadge(a.tier)} <span class="mono" style="font-size:12px">${sc(a)}</span></td><td>${s.mode !== 'NBC' && a.nba ? esc(a.nba.action) + `<div class="sm">${a.nba.channel} · ${gate(a).every(x => x[1]) ? 'passed every check' : /sent/.test(a.nba.status) ? 'approved by a person' : 'needs you'}</div>` : a.whyNow ? esc(a.whyNow.type) + `<div class="sm">${ago(a.whyNow.age)}</div>` : '–'}</td>${isMgr ? `<td>${ownerPick(a)}</td>` : ''}<td class="sm">${esc((a.activity[a.activity.length - 1] || {}).t || '–')}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">None of your accounts are in this segment.</td></tr>'}
      </tbody></table></div>`
      : segTab === 'activity' ? `<div class="card"><div class="card-b timeline">${accs.flatMap(a => a.activity.slice(-2).map(x => ({ a, x }))).slice(0, 14).map(({ a, x }) => `<button class="tl-row" onclick="App.openRecord('${a.id}','activity')"><span class="ic k-${x.k}">${ic(ACT_IC[x.k] || 'clock', 13)}</span><div class="grow"><div class="nm">${esc(a.name)} · ${esc(x.t)}</div><div class="sm">${esc(x.d)}</div></div><span class="when">${esc(x.when)}</span></button>`).join('') || '<div class="empty">No activity yet.</div>'}</div></div>`
      : repliesTable(REPLIES.filter(r => acct(r.acc).seg === s.id))}`;
  }
  function repliesTable(list) { return list.length ? `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Reply</th><th>Type</th><th>When</th></tr></thead><tbody>${list.map(r => { const a = acct(r.acc); return `<tr class="row-link" onclick="App.openRecord('${a.id}','activity')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(r.from)}</div><div class="sm">${esc(a.name)}</div></div></div></td><td>"${esc(r.text)}"</td><td><span class="badge ${KIND_B[r.kind]}">${r.kind}</span></td><td class="sm">${esc(r.at)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="card"><div class="empty">No replies yet.</div></div>'; }

  /* Campaigns: list → campaign (Enrollments, Steps, Outbox, Replies) → person drawer */
  function renderCampaigns() {
    if (campSel) return renderCampaign();
    const order = ['Ready to confirm', 'Draft', 'Running', 'Completed'];
    const list = CAMPAIGNS.slice().sort((p, q) => order.indexOf(p.status) - order.indexOf(q.status));
    const cv = frame('Campaigns', `${list.length} campaigns · email and LinkedIn`, `<button class="btn sm pri" onclick="App.ask('Build the campaign')">${ic('plus', 13)} New campaign</button>`);
    cv.innerHTML = `<div class="toolbar">${ownerSel()}${filt('Starred', 'star', false)}${filt('Active', '', false)}<div class="search" style="margin-left:auto">${ic('search', 14)}<input placeholder="Search…" aria-label="Search campaigns"></div></div>
      <div class="placeholder-note" style="margin:6px 0 12px">${ic('mail', 16)}<div><b>Placeholder.</b> Sending through email and LinkedIn connects after the pilot. Nothing is sent from the mock.</div></div>
      <div class="srow-list">${list.map(c => { const st = campStats(c); return `<div class="srow" onclick="App.goCampaign('${c.id}')">
        <div class="srow-n"><div class="nm">${esc(c.name)} ${campBadge(c)}${c.status === 'Running' ? '<span class="live-dot" title="Active"></span>' : ''}</div><div class="sm">${seqSpan(c)} · ${esc(c.seg ? segOf(c.seg).trigger : 'archived segment')}</div></div>
        <div class="srow-m"><div><b>${st.total}</b><span>Total enrollments</span></div><div><b>${st.progress}</b><span>In progress</span></div><div><b>${st.finished}</b><span>Finished</span></div><div><b>${pct(st.replies, st.started)}</b><span>Reply rate</span></div><div><b>${st.positive || '-'}</b><span>Positive</span></div><div><b>${st.positive + st.objection || '-'}</b><span>Positive + objection</span></div></div>
        <button class="ic-btn" title="Star" onclick="event.stopPropagation();App.star('${c.id}')" style="color:${S.starred[c.id] ? 'var(--ter)' : 'inherit'}">${ic('star', 15)}</button></div>`; }).join('')}</div>`;
  }
  function renderCampaign() {
    const c = campOf(campSel), st = campStats(c), sq = seqOf(c), s = c.seg ? segOf(c.seg) : null;
    const accs = ACCOUNTS.filter(a => a.campaign === c.id && visible(a));
    const live = c.status === 'Running', canConfirm = !live && c.status !== 'Completed' && S.camp[c.id] !== 'Confirmed';
    const chans = [...new Set(sq.map(t => t.ch))], nCh = ch => sq.filter(t => t.ch === ch).length;
    const needsOK = a => !live && c.status !== 'Completed' && !S.enrollOK[a.id];
    const todo = accs.filter(needsOK);
    const cv = frame(`<button class="back-l" onclick="App.goCampaign(null)">${ic('left', 14)}</button> ${esc(c.name)} ${campBadge(c)}`, `${seqSpan(c)} · ${chans.join(' + ')} · ${s ? `micro-segment <a href="#campaigns" onclick="App.openSegment('${s.id}');return false">${esc(s.name)}</a>` : 'archived segment'}${c.fromList ? ' · from the list "Lookalikes of my last 10 wins"' : ''}`,
      `${live ? `<span class="toggle-lbl">${ic('check', 12)} Active</span><span class="switch on" title="Pause" onclick="App.toast('Paused (mock)')"></span>` : ''}${canConfirm ? (isMgr ? `<button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm and schedule</button>` : c.status === 'Draft' && !S.camp[c.id] ? `<button class="btn sm pri" onclick="App.sendForConfirm('${c.id}')">Send to Daniel to confirm</button>` : '') : ''}`);
    const card = (k, v, d, icn) => `<div class="mcard"><div class="k">${icn ? ic(icn, 13) : ''} ${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const msgs = `${chans.map(ch => `<span class="chn">${chIc(ch)} ${ch} ×${nCh(ch)}</span>`).join('')}`;
    cv.innerHTML = `<div class="mcards">${card('Accounts', st.total, isMgr ? 'in this campaign' : 'yours in this campaign', 'users')}${card('Reply rate', pct(st.replies, st.started), `${st.replies} replied`, 'reply')}${card('Positive', st.positive, `${pct(st.positive, st.replies)} of replies`)}${card('Open rate', pct(st.opened, st.started), `${st.opened} opened`, 'mail')}${card('Meetings', st.meetings, 'booked')}${card('Approved', live || c.status === 'Completed' ? 'All' : `${accs.length - todo.length} of ${accs.length}`, live ? 'running' : 'sequences approved', 'check')}</div>
      ${c.blockers.map(b => `<div class="blk ${b.k}" style="margin-top:10px">${ic('alert', 15)}<div class="grow"><b>Blocker</b><span>${esc(b.x)}</span></div></div>`).join('')}
      <div class="sec-row"><div class="lbl">Accounts in this campaign · ${accs.length}</div><div class="sp"></div>${isMgr ? ownerSel() : ''}${assignAll(accs.map(a => a.id), 'the campaign')}${todo.length ? `<button class="btn sm pri" onclick="App.approveEnrollAll('${c.id}')">Approve all ${todo.length}</button>` : ''}</div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Company</th><th>Messages</th><th>Current step</th><th>Status</th>${isMgr ? '<th>Owner</th>' : ''}<th></th></tr></thead><tbody>
        ${accs.map(a => { const done = sq.filter(sent).length, cur = sq[Math.min(done, sq.length - 1)]; return `<tr class="row-link" onclick="App.openRecord('${a.id}','engage')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.contact.title)}</div></div></div></td><td>${esc(a.name)}</td><td><div class="chns">${msgs}</div></td><td class="sm">${cur ? `Step ${Math.min(done + 1, sq.length)} of ${sq.length}<div>${cur.ch === 'Email' ? 'Email · ' + esc(cur.fmt) : 'LinkedIn · ' + esc(cur.fmt)}</div>` : '–'}</td><td>${S.enrollOK[a.id] ? '<span class="badge b-pos">Approved</span>' : stateBadge(a.campState)}</td>${isMgr ? `<td>${ownerPick(a)}</td>` : ''}<td style="white-space:nowrap" onclick="event.stopPropagation()">${needsOK(a) ? `<button class="btn sm pri" onclick="App.approveEnroll('${a.id}')">Approve</button> ` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','engage')">Open</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">None of your accounts are in this campaign.</td></tr>'}</tbody></table></div>
      <div class="sec-row" style="margin-top:20px"><div class="lbl">Sequence · ${seqSpan(c)}</div><div class="sp"></div>${c.status !== 'Completed' ? `<button class="btn sm" onclick="App.setCampTab('${campTab === 'steps' ? 'enroll' : 'steps'}')">${ic('edit', 13)} ${campTab === 'steps' ? 'Done editing' : 'Edit sequence'}</button>` : ''}</div>
      ${campTab === 'steps' ? `<div class="seq-h"><span class="muted" style="font-size:12px">Written by the AI from the ${s ? s.proven.toLowerCase() : ''} message structure, personalised per person. Sent steps are locked.</span><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" onclick="App.seqAdd('${c.id}','Email')">${ic('plus', 12)} Email step</button><button class="btn sm" onclick="App.seqAdd('${c.id}','LinkedIn')">${ic('plus', 12)} LinkedIn step</button>${S.seq[c.id] ? `<button class="btn sm ghost" onclick="App.seqReset('${c.id}')">Reset to the AI draft</button>` : ''}</div></div>
          <div class="seq">${sq.map((t, i) => touchEditor(c, t, i, sq.length)).join('')}</div>
          <div class="muted" style="font-size:11.5px;margin-top:10px">Explore / exploit: ${esc(c.explore)}</div>`
      : `<div class="seq-basis">${ic('spark', 14)}<div>Built from the <b>${s ? esc(s.trigger.toLowerCase()) : 'segment'}</b> signals, the ${s ? esc(s.proven.toLowerCase()) : 'provisional'} message structure, and outreach best practice: one ask per step, a short plain-text first touch, proof in the middle, email and LinkedIn alternating 3–5 days apart. Each person's messages are personalised; open a person to edit theirs.</div></div>${seqTrack(c, sq)}`}
      <div class="lbl" style="margin:18px 0 6px">Updates</div>${c.updates.map(u => `<div class="upd"><span class="when">${esc(u.t)}</span><div class="sm" style="font-size:12.5px;color:var(--i1)">${esc(u.x)}</div></div>`).join('')}`;
  }
  function touchEditor(c, t, i, n) {
    if (sent(t) || c.status === 'Completed') return `<div class="tedit locked"><div class="tedit-h">${chIc(t.ch)}<b>Step ${i + 1} · Day ${t.day}</b><span>${t.ch} · ${esc(t.fmt)}</span><span class="badge b-pos nodot" style="margin-left:auto">${esc(t.state || 'Done')}</span></div><div class="tedit-t">${esc(t.t)}</div></div>`;
    const id = `${c.id}-${i}`;
    return `<div class="tedit">
      <div class="tedit-h">${chIc(t.ch)}<b>Step ${i + 1}</b>
        <span class="muted" style="font-size:12px">Day</span><label class="sr" for="day-${id}">Day</label><input id="day-${id}" type="number" min="0" max="60" value="${t.day}" onchange="App.seqEdit('${c.id}',${i},'day',this.value)">
        <label class="sr" for="ch-${id}">Channel</label><select id="ch-${id}" class="sel" onchange="App.seqEdit('${c.id}',${i},'ch',this.value)">${['Email', 'LinkedIn'].map(x => `<option ${t.ch === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <label class="sr" for="fmt-${id}">Format</label><select id="fmt-${id}" class="sel" onchange="App.seqEdit('${c.id}',${i},'fmt',this.value)">${FORMATS[t.ch].map(x => `<option ${t.fmt === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <span class="tedit-tools"><button class="ic-btn" title="Move up" ${i === 0 ? 'disabled' : ''} onclick="App.seqMove('${c.id}',${i},-1)">${ic('upa', 14)}</button><button class="ic-btn" title="Move down" ${i === n - 1 ? 'disabled' : ''} onclick="App.seqMove('${c.id}',${i},1)">${ic('downa', 14)}</button><button class="ic-btn" title="Remove step" onclick="App.seqRemove('${c.id}',${i})">${ic('trash', 14)}</button></span>
      </div>
      ${t.ch === 'Email' ? `<label class="sr" for="subj-${id}">Subject</label><input class="edit" id="subj-${id}" value="${esc(t.subject || '')}" placeholder="Subject" onchange="App.seqEdit('${c.id}',${i},'subject',this.value)" style="margin-bottom:6px">` : ''}
      <label class="sr" for="msg-${id}">Message</label><textarea class="edit" id="msg-${id}" style="min-height:60px" onchange="App.seqEdit('${c.id}',${i},'t',this.value)">${esc(t.t)}</textarea>
      <div class="tedit-f"><button class="chip" onclick="App.seqRewrite('${c.id}',${i})">${ic('spark', 12)} Rewrite with AI</button>${t.ch === 'LinkedIn' && t.fmt === 'Connection request' ? '<span class="muted" style="font-size:11px">LinkedIn notes are limited to 300 characters</span>' : ''}<span class="muted" style="font-size:11px;margin-left:auto">${esc(t.state || 'Not started')}</span></div>
    </div>`;
  }

  /* Approvals */
  /* ─── Delivery of each next best action: prepared → sent → delivered → opened → replied ─── */
  const STAGES = ['Prepared', 'Sent', 'Delivered', 'Opened', 'Replied'];
  const hsh = id => [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);
  function track(a) {
    const n = a.nba, d = S.decisions[a.id], h = hsh(a.id);
    if (n.status === 'review' && !d) return { stage: 0, label: 'Waiting for approval', cls: 'b-ter', how: 'Needs a person', when: n.due };
    if (d === 'with-manager') return { stage: 0, label: 'With Daniel', cls: 'b-ter', how: 'Needs a person', when: n.due };
    if (d === 'skipped' || d === 'sent-back') return { stage: 0, label: decLabel(d) + (S.skipR && S.skipR[a.id] ? ': ' + S.skipR[a.id].toLowerCase() : ''), cls: 'b-grey', how: d === 'skipped' ? 'Skipped by a person' : 'Sent back by a person', when: 'Today' };
    if (d) return { stage: 1, label: 'Scheduled · next send window', cls: 'b-sec', how: 'Approved by a person', when: 'Today 14:00' };
    if (n.status === 'sent') { const o = a.outcome || 'Delivered'; return { stage: /Replied|Meeting/.test(o) ? 4 : /Opened|Clicked/.test(o) ? 3 : 2, label: o, cls: /positive|Meeting/.test(o) ? 'b-pos' : /objection/.test(o) ? 'b-warn' : 'b-sec', how: 'Approved by a person', when: 'Last week' }; }
    if (h % 13 === 5) return { stage: 1, label: 'Bounced · fixing the address', cls: 'b-neg', how: 'Went ahead on its own', when: 'Today 06:05' };
    const st = [2, 3, 2, 3, 3][h % 5];
    return { stage: st, label: st === 3 ? 'Opened' : 'Delivered', cls: st === 3 ? 'b-pos' : 'b-sec', how: 'Went ahead on its own', when: st === 3 ? 'Today ' + ['08:14', '09:02', '10:37'][h % 3] : 'Today 06:05' };
  }
  const nbaRows = () => ACCOUNTS.filter(a => a.nba && /auto|sent|review|ready/.test(a.nba.status) && !a.campaign && visible(a));
  const dots = t => `<span class="stg" title="${STAGES.slice(0, t.stage + 1).join(' → ')}">${STAGES.map((x, i) => `<i class="${i <= t.stage ? (t.cls === 'b-neg' && i === t.stage ? 'bad' : 'on') : ''}"></i>`).join('')}</span>`;
  function deliveryRow(a) {
    const t = track(a);
    return `<div class="dlv-p">${STAGES.map((x, i) => `<div class="${i <= t.stage ? (t.cls === 'b-neg' && i === t.stage ? 'bad' : 'on') : ''}"><span></span><b>${x}</b></div>`).join('')}</div><div class="sm muted" style="margin-top:4px">${/own/.test(t.how) ? mkAI(t.how) : /Needs/.test(t.how) ? mkWait(t.how) : mkHu(t.how)} ${esc(t.label)}${t.when ? ' · ' + esc(t.when) : ''}</div>`;
  }

  function renderApprovals() {
    const tabs = isMgr ? [['needs', 'Needs me'], ['team', 'Team exceptions'], ['ahead', 'Went ahead'], ['done', 'Decided']] : [['todo', 'Needs you'], ['waiting', 'With Daniel'], ['ahead', 'Went ahead'], ['done', 'Decided']];
    const items = apprItems(apprTab), readyIds = items.filter(a => !a.nba.reason && !S.decisions[a.id]);
    const cv = frame('Approvals', isMgr ? 'Sensitive messages and campaigns need you; you can step in on any rep\'s item.' : 'Next best actions go ahead on their own when they pass every check. Only the ones that don\'t come here for your approval.', readyIds.length ? `<button class="btn sm pri" onclick="App.approveAll()">Approve ${readyIds.length} ready</button>` : '');
    cv.innerHTML = `<div class="rule"><b>How a next best action is decided.</b> The AI picks the action, the channel and the message for each account from its strongest signal. It goes ahead on its own when it passes all six checks; if any fails, it waits here with the reason.<div class="gate-r" style="margin-top:8px">${['High confidence', 'Proven message', 'Not sensitive', 'Identity confirmed', 'Not in another sequence', 'Not picked for a spot-check'].map(k => `<span class="gc ok">✓ ${k}</span>`).join('')}</div></div>
      <div class="dtabs" style="margin-top:0">${tabs.map(([k, l]) => `<button class="${apprTab === k ? 'on' : ''}" onclick="App.setApprTab('${k}')">${l} (${apprItems(k).length})</button>`).join('')}
        ${isMgr && apprTab === 'team' ? `<label class="sr" for="repSel">Rep</label><select class="sel" id="repSel" style="margin-left:auto" onchange="App.setApprRep(this.value)"><option value="all">All reps</option>${REPS.map(r => `<option value="${r}" ${apprRep === r ? 'selected' : ''}>${USERS[r].name}</option>`).join('')}</select>` : ''}</div>
      ${isMgr && apprTab === 'needs' ? CAMPAIGNS.filter(c => (c.status === 'Ready to confirm' || S.camp[c.id] === 'Sent for confirmation') && S.camp[c.id] !== 'Confirmed').map(c => `<div class="card" style="margin-bottom:10px"><div class="card-b" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="badge b-ter">Campaign</span><div class="grow" style="min-width:200px"><b>${esc(c.name)}</b><div class="sm muted" style="font-size:12px">${c.accounts.length} people · ${seqSpan(c)} · email and LinkedIn</div></div><button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm</button><button class="btn sm" onclick="App.goCampaign('${c.id}','steps')">Review steps</button></div></div>`).join('') : ''}
      <div class="card tbl-wrap">${items.length ? `<table class="tbl"><thead><tr><th>Person</th><th>Next best action</th><th>Micro-segment</th><th>Checks</th>${isMgr ? '<th>Rep</th>' : ''}<th>Due</th><th></th></tr></thead><tbody>
        ${items.map(a => { const d = S.decisions[a.id]; return `<tr class="row-link" onclick="App.openRecord('${a.id}','engage')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.name)}</div></div></div></td><td>${esc(a.nba.action)}<div class="sm">${chIc(a.nba.channel)} ${a.nba.channel}</div></td><td><span class="seg-link" onclick="event.stopPropagation();App.openSegment('${a.seg}')">${esc(a.segment)}</span></td><td><div class="gcell">${gateCell(a)}</div>${a.nba.reasonNote && !/auto|sent/.test(a.nba.status) ? `<div class="sm" style="max-width:260px;white-space:normal;margin-top:4px">${esc(a.nba.reasonNote)}</div>` : ''}</td>${isMgr ? `<td>${ownerPick(a)}</td>` : ''}<td style="white-space:nowrap">${esc(a.nba.due)}</td>
          <td style="white-space:nowrap" onclick="event.stopPropagation()">${d ? mkHu(decLabel(d)) : /auto|sent/.test(a.nba.status) ? mkAI('Went ahead on its own') : `${!a.nba.reason || (isMgr && a.nba.sensitive) ? `<button class="btn sm pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : 'Approve'}</button> ` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','engage')">Review</button>`}</td></tr>`; }).join('')}
        </tbody></table>` : `<div class="empty">Nothing here. ${apprTab === 'done' ? 'Decisions you make show up here.' : 'You\'re all caught up.'}</div>`}</div>`;
  }

  /* Person drawer (opens over the module, beside the chat) */
  const ACT_IC = { signal: 'bolt', score: 'layers', segment: 'layers', campaign: 'megaphone', sent: 'mail', open: 'mail', reply: 'reply', watch: 'alert', nba: 'spark', wait: 'clock', crm: 'clock' };
  function renderRecord() {
    const a = acct(recId), o = USERS[a.owner];
    const tabs = [['overview', 'Overview'], ['engage', 'Engagement'], ['activity', 'Activity'], ['notes', 'Notes']];
    $('focus').innerHTML = `<div class="pdrawer ${copOpen ? 'cop-on' : ''}">
      <div class="pd-left">
        <div class="pd-top"><button class="ic-btn" title="Close and go back to the chat" onclick="App.closeFocus()">${ic('x', 16)}</button><button class="ic-btn" title="${focusFull ? 'Back beside the chat' : 'Full screen'}" onclick="App.focusFull()">${ic('expand', 15)}</button><span class="li-ic" style="margin-left:auto">${ic('li', 16)}</span></div>
        <div class="who"><span class="av" style="background:${o.color};width:54px;height:54px;font-size:18px">${initials(a.contact.name)}</span><div><div class="nm" style="font-family:var(--fd);font-size:19px">${esc(a.contact.name)}</div><div class="tl">${esc(a.contact.title)}</div><div class="tl"><span class="logo-dot">${esc(a.name[0])}</span> ${esc(a.name)}</div></div></div>
        <div class="pd-cta"><button class="btn pri" onclick="App.sendNow('${a.id}')">${ic('plane', 14)} Send</button><button class="btn ${copOpen ? 'on' : ''}" onclick="App.toggleCop()">${ic('spark', 14)} Copilot</button></div>
        <div class="sec-t">Details</div>
        <dl class="kv"><dt>Name</dt><dd>${esc(a.contact.name)}</dd><dt>Title</dt><dd>${esc(a.contact.title)}</dd><dt>Email</dt><dd>${esc(a.contact.email)}</dd><dt>Identity</dt><dd>${idBadge(a.contact.idTier)}</dd><dt>Record owner</dt><dd>${isMgr ? `<label class="sr" for="recOwner">Owner</label><select class="sel" id="recOwner" onchange="App.reassign(['${a.id}'],this.value)">${REPS.map(r => `<option value="${r}" ${a.owner === r ? 'selected' : ''}>${esc(USERS[r].name)}</option>`).join('')}</select>` : esc(o.name)}</dd><dt>Score</dt><dd>${tierBadge(a.tier)} ${sc(a)}</dd><dt>Lead source</dt><dd>${a.fromList ? 'Prospecting · Lookalikes of my last 10 wins' : 'Signals · overnight sweep'}</dd></dl>
        <div class="sec-t">Company</div>
        <dl class="kv"><dt>Name</dt><dd>${esc(a.name)}</dd><dt>Industry</dt><dd>${esc(a.industry)}</dd><dt>Country</dt><dd>${esc(a.country)}</dd><dt>Size</dt><dd>${esc(a.size)}</dd><dt>Micro-segment</dt><dd>${a.seg ? `<a href="#segments" onclick="App.openSegment('${a.seg}');return false">${esc(a.segment)}</a>` : '–'}</dd><dt>Warm path</dt><dd>${a.warm.score} · ${esc(a.warm.note)}</dd></dl>
      </div>
      <div class="pd-right">
        <div class="rec-tabs pill">${tabs.map(([k, l]) => `<button class="rec-tab ${recTab === k ? 'on' : ''}" onclick="App.setRecTab('${k}')">${l}</button>`).join('')}</div>
        <div class="rec-pane">${recPane(a)}</div>
      </div>
      ${copOpen ? copPane(a) : ''}</div>`;
    const t = $('copT'); if (t) t.scrollTop = t.scrollHeight;
  }

  /* Each person's own copy of the campaign sequence: their messages can be edited, and steps added or removed */
  function pseqOf(a) { return S.pseq[a.id] || seqOf(campOf(a.campaign)).map(t => Object.assign({}, t, { body: personal(t, a) })); }
  function editPseq(id, fn) { const a = acct(id), sq = pseqOf(a).map(t => Object.assign({}, t)); fn(sq, a); S.pseq[id] = sq; save(); }
  const BEST = { 'Plain text': 'Plain text, under 120 words, one ask', 'Case study': 'Peer proof from an approved claim', 'Comparison document': 'Side by side, approved figures only', Checklist: 'Practical checklist, no pitch', Infographic: 'One visual, one takeaway', Whitepaper: 'Depth for evaluators', 'Connection request': 'Under 300 characters, no pitch', Message: 'Short, builds on the earlier step', 'Comment on their post': 'Adds to their post, no link', 'Carousel post': 'Visual, 5–7 slides' };
  function basis(a, t, i, sq) {
    const sg = a.signals.slice().sort((p, q) => q.weight - p.weight)[0], s = a.seg ? segOf(a.seg) : null;
    return [['sig', `${ic('bolt', 11)} Signal: ${sg ? `${esc(sg.type)} · tier ${sg.tier} · ${ago(sg.age)}` : 'none yet'}`],
      ['str', `${ic('layers', 11)} ${s ? esc(s.proven) : 'Provisional'} structure${s ? ' for ' + esc(s.name) : ''}`],
      ['bp', `${ic('check', 11)} ${BEST[t.fmt] || 'One ask'}`],
      ['bp', i ? `${ic('hour', 11)} ${t.ch !== sq[i - 1].ch ? 'Switches channel' : 'Same channel'} after ${t.day - sq[i - 1].day} days` : `${ic('check', 11)} Opens with their news`]];
  }
  function stepView(a, c, t, i, sq) {
    const done = sq.filter(sent).length, isSent = sent(t), editing = pEdit === `${a.id}:${i}`;
    return `<div class="sv ${t.ch === 'Email' ? 'em' : 'lk'} ${isSent ? 'done' : ''} ${i === done ? 'next' : ''}">
      <div class="sv-rail"><span class="sv-day">Day ${t.day}</span><span class="sv-node">${isSent ? ic('check', 13, 3) : chIc(t.ch)}</span></div>
      <div class="sv-card">
        <div class="sv-h"><span class="sv-ch">${t.ch} · ${esc(t.fmt)}</span><span class="sv-st">${isSent ? esc(t.state) : i === done ? 'Next step' : 'Scheduled'}</span>${isSent ? '' : `<span class="sv-tools"><button class="ic-btn" title="Edit this message" onclick="App.pEditStep('${a.id}',${i})">${ic('edit', 13)}</button><button class="ic-btn" title="Remove this step for ${esc(first(a.contact.name))}" onclick="App.pRemove('${a.id}',${i})">${ic('trash', 13)}</button></span>`}</div>
        ${t.ch === 'Email' ? `<div class="sv-subj"><span class="sv-k">Subject</span>${esc(t.subject || c.name)}</div><div class="sv-to">From ${esc(USERS[a.owner].name)} · to ${esc(a.contact.name)}</div>` : ''}
        ${editing ? `<label class="sr" for="pBody">Message</label><textarea class="edit" id="pBody" style="min-height:150px">${esc(t.body)}</textarea><div class="sv-ed"><button class="btn sm pri" onclick="App.pSave('${a.id}',${i})">Save</button><button class="btn sm" onclick="App.pEditStep(null)">Cancel</button><span class="muted">The brand and claim checks run when you save</span></div>` : `<div class="sv-body">${esc(t.body)}</div>`}
        <div class="sv-why"><span class="muted">Built from</span>${basis(a, t, i, sq).map(x => `<span class="why ${x[0]}">${x[1]}</span>`).join('')}</div>
      </div></div>
      ${i < sq.length - 1 ? `<div class="sv-wait">${ic('hour', 12)} wait ${sq[i + 1].day - t.day} days</div>` : ''}`;
  }
  function campEngage(a) {
    const c = campOf(a.campaign), sq = pseqOf(a), ok = S.enrollOK[a.id] || c.status === 'Running' || S.camp[c.id] === 'Confirmed';
    const chans = [...new Set(sq.map(t => t.ch))];
    return `<div class="eng-h"><div class="lbl">${ic('plane', 13)} Campaign</div><div class="eng-grid"><div><span>Campaign</span><a href="#campaigns" onclick="App.goCampaign('${c.id}');return false">${esc(c.name)}</a></div><div><span>Status</span>${S.enrollOK[a.id] ? '<span class="badge b-pos">Approved</span>' : stateBadge(a.campState)}</div><div><span>Mailbox</span>${esc(mailbox(a))}</div><div><span>Messages</span><div class="chns">${chans.map(ch => `<span class="chn">${chIc(ch)} ${ch} ×${sq.filter(t => t.ch === ch).length}</span>`).join('')}</div></div></div></div>
      ${ok ? '' : `<div class="ready"><div class="grow">${esc(first(a.contact.name))}'s personalised sequence is ready to launch. Approve to continue.</div><button class="btn pri" onclick="App.approveEnroll('${a.id}')">Approve</button></div>`}
      ${S.pseq[a.id] ? `<div class="tv-note">${ic('edit', 13)} You changed ${esc(first(a.contact.name))}'s sequence. The rest of the campaign is unchanged. <button class="btn sm ghost" onclick="App.pReset('${a.id}')">Reset to the campaign sequence</button></div>` : ''}
      <div class="seqv-top"><span class="lbl">Sequence · ${sq.length} steps</span><span class="sp"></span><button class="btn sm" onclick="App.pAdd('${a.id}','Email')">${ic('plus', 12)} Email step</button><button class="btn sm" onclick="App.pAdd('${a.id}','LinkedIn')">${ic('plus', 12)} LinkedIn step</button></div>
      <div class="seqv">${sq.map((t, i) => stepView(a, c, t, i, sq)).join('')}</div>
      <div class="seqv-add"><button class="btn sm" onclick="App.pAdd('${a.id}','Email')">${ic('plus', 12)} Email step</button><button class="btn sm" onclick="App.pAdd('${a.id}','LinkedIn')">${ic('plus', 12)} LinkedIn step</button><span class="sp"></span><label class="muted" for="addSeq" style="font-size:12px">Add to another sequence</label><select class="sel" id="addSeq" onchange="App.addToSeq('${a.id}',this.value)"><option value="">Choose…</option>${CAMPAIGNS.filter(x => x.id !== c.id && x.status !== 'Completed').map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>`;
  }

  /* The checks that decide whether a next best action goes ahead on its own */
  const gate = a => [['High confidence', a.nba.confidence === 'High'], ['Proven message', !!a.nba.proven], ['Not sensitive', !a.nba.sensitive], ['Identity confirmed', a.contact.idTier <= 2], ['Not in another sequence', !a.campaign], ['Not picked for a spot-check', a.nba.reason !== 'Spot-check']];
  ACCOUNTS.forEach(a => {
    if (!a.nba || a.nba.status !== 'auto') return;
    if (a.generated && !a.fromList && !a.nba.sensitive) { a.nba.confidence = 'High'; a.nba.proven = true; a.contact.idTier = Math.min(a.contact.idTier, 2); }
    const f = gate(a).find(x => !x[1]);
    if (f) Object.assign(a.nba, { status: 'review', due: a.nba.due || 'Today 17:00', reason: { 'High confidence': 'Medium confidence', 'Proven message': 'Unproven message', 'Not sensitive': 'Sensitive', 'Identity confirmed': 'Identity unconfirmed', 'Not picked for a spot-check': 'Spot-check' }[f[0]] || 'Spot-check', reasonNote: f[0] === 'Identity confirmed' ? `The contact is identity tier ${a.contact.idTier}: not confirmed by a second provider.` : `It didn't pass: ${f[0].toLowerCase()}.` });
  });
  function gateBlock(a) {
    const g = gate(a), fails = g.filter(x => !x[1]);
    return `<div class="gate ${fails.length ? 'no' : 'ok'}"><div class="gate-t">${fails.length ? `${ic('alert', 14)} ${/sent/.test(a.nba.status) ? 'A person approved it, because it didn\'t pass' : 'Needs you: it didn\'t pass'} ${fails.map(x => x[0].toLowerCase()).join(', ')}` : `${ic('check', 14)} Passed every check, so it goes ahead on its own`}</div><div class="gate-r">${g.map(([k, ok]) => `<span class="gc ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✕'} ${k}</span>`).join('')}</div></div>`;
  }
  const gateCell = a => { const f = gate(a).filter(x => !x[1]); return f.length ? f.map(x => `<span class="badge b-warn nodot">✕ ${x[0]}</span>`).join(' ') : '<span class="badge b-pos nodot">✓ All 6 checks</span>'; };

  /* Copilot inside the person panel: change this person's messages and steps by asking */
  function copPane(a) {
    const th = S.cop[a.id] || [];
    const chips = a.campaign ? ['Make step 1 shorter', 'Add a LinkedIn step', 'Use cost framing in step 1', 'Why these messages?'] : ['Make it shorter', 'Use cost framing', 'Why this action?', 'Use the runner-up'];
    return `<aside class="cop"><div class="cop-h"><span class="ai-mark">${ic('spark', 12)}</span><b>Copilot</b><span class="muted">· ${esc(a.contact.name)}</span><span class="sp"></span><button class="ic-btn" title="Close Copilot" onclick="App.toggleCop()">${ic('x', 14)}</button></div>
      <div class="cop-t" id="copT"><div class="cm ai">I can rewrite ${esc(first(a.contact.name))}'s messages, add or remove steps, explain what each message is built from, or send now.</div>${th.map(m => `<div class="cm ${m.who}">${m.who === 'me' ? esc(m.text) : m.html}</div>`).join('')}</div>
      <div class="cop-c"><div class="cop-chips">${chips.map(h => `<button class="chip" onclick="App.copAsk(${js(h)})">${esc(h)}</button>`).join('')}</div>
        ${composerBox({ id: 'copIn', label: 'Ask Copilot', ph: 'Ask for a change, or pick something to start…', send: 'App.copSend()', actions: chips.map(h => ['spark', h, 'Copilot', h]) })}</div></aside>`;
  }
  function copRespond(a, t) {
    if (/send/.test(t)) { App.sendNow(a.id); return 'Sent (placeholder: nothing leaves the mock).'; }
    if (a.campaign) {
      const sq = pseqOf(a), n = Math.min(sq.length, Math.max(1, +((t.match(/step (\d)/) || [])[1] || (sq.findIndex(x => !sent(x)) + 1) || 1))) - 1;
      const add = t.match(/add an? (email|linkedin)/);
      if (add) { App.pAdd(a.id, add[1] === 'email' ? 'Email' : 'LinkedIn', true); return `Added a ${add[1] === 'email' ? 'email' : 'LinkedIn'} step at the end of ${esc(first(a.contact.name))}'s sequence, 4 days after the last one.`; }
      if (/remove/.test(t)) { editPseq(a.id, sq2 => sq2.splice(n, 1)); return `Removed step ${n + 1} for ${esc(first(a.contact.name))}.`; }
      if (/short/.test(t)) { editPseq(a.id, sq2 => { const p = sq2[n].body.split('\n\n').filter(Boolean); sq2[n].body = p.length > 3 ? [p[0], p[1].split('. ')[0].replace(/\.?$/, '.'), p[p.length - 2], p[p.length - 1]].join('\n\n') : sq2[n].body; }); return `Made step ${n + 1} shorter. The brand checks still pass.`; }
      if (/cost/.test(t)) { editPseq(a.id, sq2 => { const p = sq2[n].body.split('\n\n'); p.splice(Math.max(1, p.length - 2), 0, 'Most sites we work with start from cost: an hour of unplanned downtime on a unit this size typically costs well over USD 100k.'); sq2[n].body = p.join('\n\n'); }); return `Added cost framing to step ${n + 1}, using an approved claim.`; }
      if (/why|signal|built|best practice/.test(t)) { const sg = a.signals.slice().sort((p, q) => q.weight - p.weight)[0], s = segOf(a.seg); return `Each message is built from three things:<br>1. <b>The signal</b>: ${sg ? esc(sg.type.toLowerCase()) + ` (tier ${sg.tier}, ${ago(sg.age)})` : 'none yet'}. Step 1 opens with it.<br>2. <b>The message structure</b> for ${esc(s.name)}: ${esc(s.structure)} (${esc(s.proven.toLowerCase())}).<br>3. <b>Outreach best practice</b>: one ask per step, short plain-text first touch, proof in the middle, alternate email and LinkedIn, 3–5 days apart, LinkedIn notes under 300 characters.`; }
      return 'Tell me what to change: "make step 2 shorter", "use cost framing in step 1", "add a LinkedIn step", "remove step 3", or "why these messages?".';
    }
    if (!a.nba) return 'There\'s no live signal for this account yet, so there\'s nothing to send.';
    if (/why/.test(t)) { const f = gate(a).filter(x => !x[1]); return `<b>${esc(a.nba.action)}</b> fits the strongest signal (${esc(a.whyNow ? a.whyNow.type.toLowerCase() : 'none')}) and the ${a.nba.proven ? 'proven' : 'provisional'} structure for ${esc(a.segment)}. ${f.length ? `It came to you because it didn't pass: ${f.map(x => x[0].toLowerCase()).join(', ')}.` : 'It passed every check, so it went ahead on its own.'}`; }
    const r = rewrite(a, t);
    return r.note || 'Tell me what to change: "make it shorter", "use cost framing", "more formal", or "use the runner-up".';
  }
  /* The campaign sequence as a journey: day, channel and wait between steps */
  function seqTrack(c, sq) {
    return `<div class="trk">${sq.map((t, i) => `<div class="trk-s ${t.ch === 'Email' ? 'em' : 'lk'} ${sent(t) ? 'done' : ''}"><div class="trk-d">Day ${t.day}</div><div class="trk-n"><span class="trk-dot">${sent(t) ? ic('check', 13, 3) : chIc(t.ch)}</span>${i < sq.length - 1 ? `<span class="trk-l"><i>${sq[i + 1].day - t.day} days</i></span>` : ''}</div><div class="trk-c"><b>Step ${i + 1} · ${t.ch}</b><span class="f">${esc(t.fmt)}</span><span class="x">${esc(t.ch === 'Email' ? (t.subject || c.name) : t.t)}</span><em>${esc(t.state || 'Not started')}</em></div></div>`).join('')}</div>`;
  }
  function recPane(a) {
    if (recTab === 'overview') {
      const sig = a.signals.slice().sort((p, q) => q.weight - p.weight);
      return `<div class="formula"><div class="box"><div class="v">${a.fit}</div><div class="k">Fit /100: how well they match</div></div><span class="op">×</span><div class="box"><div class="v">${a.timing}</div><div class="k">Timing /100: what changed</div></div><span class="op">=</span><div class="box hl"><div class="v">${sc(a)}</div><div class="k">Score · #${a.rank} · tier ${a.tier}</div></div></div>
        ${sig.length ? `<div class="sec-t">Why now · signals, strongest first</div>${sig.map((x, i) => `<div class="sig"><div><div style="font-weight:600">${esc(x.type)}</div><div class="muted" style="font-size:11.5px">${esc(x.text)} · ${esc(x.source)}</div></div><span class="badge ${x.tier === 1 ? 'b-pos' : x.tier === 2 ? 'b-sec' : 'b-grey'} nodot">Tier ${x.tier}</span><div><div class="bar"><i style="width:${Math.min(100, x.weight)}%"></i></div><div class="muted" style="font-size:10.5px;margin-top:3px">${ago(x.age)}</div></div><span class="mono" style="text-align:right">${i ? (i === 1 ? '½×' : '¼×') : ''}${x.weight}</span></div>`).join('')}
          <div class="placeholder-note" style="margin-top:12px"><div>Timing = ${sig.map((x, i) => (i ? (i === 1 ? '½ × ' : '¼ × ') : '') + x.weight).join(' + ')} = ${a.points} points, ÷ 2 = <b>${a.timing}</b> out of 100. Score = Fit × Timing ÷ 100 = <b>${a.score}</b> out of 100, so a perfect fit with no live signal scores zero.</div></div>`
          : '<div class="placeholder-note">No live signal, so the score is zero and nothing is suggested. The account stays watched.</div>'}${a.signals.length ? scoreProcess(a) : ''}`;
    }
    if (recTab === 'activity') {
      const out = S.outcomes[a.id], list = a.activity.slice().reverse();
      return `<div class="sec-t">What happened</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px">${['Sent', 'Replied', 'Meeting booked', 'No response'].map(x => `<button class="chip" style="${out === x ? 'border-color:var(--brand);color:var(--brand-dk);background:var(--brand-lt)' : ''}" onclick="App.logOutcome('${a.id}','${x}')">${x}</button>`).join('')}</div>
        <div class="sec-t">Timeline · open any step for detail</div>
        <div class="timeline">${list.map((x, i) => `<button class="tl-row" onclick="App.toggleAct(${i})"><span class="ic k-${x.k}">${ic(ACT_IC[x.k] || 'clock', 13)}</span><div class="grow"><div class="nm">${esc(x.t)}</div><div class="sm">${esc(x.d)}</div>${actOpen === i ? actDetail(a, x) : ''}</div><span class="when">${esc(x.when)}</span></button>`).join('')}</div>`;
    }
    if (recTab === 'notes') {
      return `<label class="sr" for="noteBox">Note</label><textarea class="edit" style="min-height:90px" id="noteBox" placeholder="Add a note…"></textarea><div style="margin:8px 0 16px"><button class="btn pri sm" onclick="App.addNote('${a.id}')">Save note</button></div>
        ${(S.notes[a.id] || []).map(n => `<div class="tl-row"><span class="ic">${ic('book', 13)}</span><div class="grow"><div>${esc(n.t)}</div><div class="sm">${esc(me.name)} · ${esc(n.d)}</div></div></div>`).join('') || '<div class="empty">Create your first note. Keep track of important details about this person.</div>'}`;
    }
    if (a.campaign) return campEngage(a);
    if (!a.nba) return '<div class="placeholder-note">No next action: there\'s no live signal for this account yet.</div>';
    const d = draftOf(a), dec = S.decisions[a.id];
    const banner = dec ? `<div class="ready" style="background:var(--s50)"><div class="grow"><b>${decLabel(dec)}</b></div><button class="btn sm" onclick="App.undo('${a.id}')">Undo</button></div>`
      : a.nba.status === 'auto' ? '<div class="ready" style="background:var(--pos-lt)"><div class="grow"><b>Went ahead on its own.</b> Every check passed, so it was sent without waiting for a person.</div></div>'
      : a.nba.status === 'sent' ? `<div class="ready" style="background:var(--sec-lt)"><div class="grow"><b>Sent.</b> ${esc(a.outcome || '')}</div></div>`
      : a.nba.reason ? `<div class="ready" style="background:var(--warn-lt)"><div class="grow"><b>${reasonOf(a)}.</b> ${esc(a.nba.reasonNote)}</div><button class="btn pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : a.nba.sensitive ? 'Approve → to Daniel' : 'Approve'}</button></div>`
      : `<div class="ready"><div class="grow">Your next best action is ready. Approve to continue.</div><button class="btn pri" onclick="App.approve('${a.id}')">Approve</button></div>`;
    return `<div class="eng-h"><div class="lbl">${ic('bolt', 13)} Next best action</div><div class="eng-grid"><div><span>Action</span>${esc(d.option === 'run' ? a.nba.runnerUp : a.nba.action)}</div><div><span>Status</span>${stepBadge(a)}</div><div><span>Channel</span>${a.nba.channel}</div><div><span>Due</span>${esc(a.nba.due || '–')}</div></div><div class="lbl" style="margin:12px 0 6px">Delivery</div>${deliveryRow(a)}</div>${gateBlock(a)}${banner}
      <div style="margin-top:10px">
        <button class="opt ${d.option === 'rec' ? 'on' : ''}" onclick="App.setOption('${a.id}','rec')"><div class="h">${esc(a.nba.action)}<span class="badge b-brand nodot">Recommended</span></div><div class="d">${a.nba.confidence} confidence · ${a.nba.proven ? 'proven structure for ' + esc(a.segment) : 'provisional structure (first try)'}</div></button>
        <button class="opt ${d.option === 'run' ? 'on' : ''}" onclick="App.setOption('${a.id}','run')"><div class="h">${esc(a.nba.runnerUp)}<span class="badge b-grey nodot">Runner-up</span></div><div class="d">The next best option.</div></button></div>
      <div style="display:flex;gap:8px;margin:10px 0 8px;align-items:center;flex-wrap:wrap"><label class="sr" for="chanSel">Channel</label><select class="sel" id="chanSel" onchange="App.setChannel('${a.id}',this.value)">${['Email', 'LinkedIn'].map(c => `<option ${d.channel === c ? 'selected' : ''}>${c}</option>`).join('')}</select><span class="muted" style="font-size:11.5px">${esc(USERS[a.owner].name)} to ${esc(a.contact.name)}</span></div>
      ${d.channel === 'Email' ? `<label class="sr" for="dSubj">Subject</label><input class="edit" id="dSubj" value="${esc(d.subject)}" onchange="App.saveDraft('${a.id}')" style="margin-bottom:8px">` : ''}
      <label class="sr" for="dBody">Message</label><textarea class="edit" id="dBody" onchange="App.saveDraft('${a.id}')">${esc(d.body)}</textarea>
      <div class="checks"><span class="badge b-pos">Brand voice</span><span class="badge b-pos">Approved claims only</span><span class="badge b-pos">Not in another sequence</span></div>
      ${dec || /auto|sent/.test(a.nba.status) ? '' : `<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">${isMgr && a.owner !== me.id ? `<button class="btn" onclick="App.decide('${a.id}','sent-back')">Send back to ${esc(first(USERS[a.owner].name))}</button>` : ''}<button class="btn" onclick="App.skipAsk('${a.id}')">Skip</button><span class="muted" style="font-size:11.5px;align-self:center">Ask the chat to change it: "make it shorter", "use cost framing"</span></div>${skipOpen === a.id ? `<div class="skip-r"><span>Why skip? One tap. It teaches the next recommendation.</span><div>${['Wrong timing', 'Not our offer', 'The data is wrong', 'Already in talks', 'Customer at risk'].map(x => `<button class="chip" onclick="App.skipWith('${a.id}',${js(x)})">${x}</button>`).join('')}</div></div>` : ''}`}`;
  }
  function actDetail(a, x) {
    if (x.msg) return `<div class="draft" style="margin-top:8px"><div class="subj">${esc(x.msg.subject)}</div>${esc(x.msg.body)}</div>`;
    if (x.reply) return `<div class="draft" style="margin-top:8px">"${esc(x.reply.text)}"</div>`;
    if (x.k === 'signal') { const sg = a.signals.find(s => x.t.endsWith(s.type)); return sg ? `<div class="seg-nums" style="margin-top:8px"><div><b>Tier ${sg.tier}</b><span>signal tier</span></div><div><b>${sg.weight}</b><span>weight after decay</span></div><div><b>${Math.round(sg.strength * 100)}%</b><span>strength (AI read)</span></div></div>` : ''; }
    return '<div class="sm muted" style="margin-top:6px">Recorded in the audit trail · thresholds version 2026.10</div>';
  }

  /* ─── Content studio: start page, then a chat beside the document ─── */
  const TOPICS = [
    { re: /renewal|service/, title: 'Before Your Service Renewal: Three Questions Worth Asking', audience: 'Sites with a service renewal coming up', intro: 'A service renewal is easy to sign without a second look. It is also the one moment each year when the cost of standing still is on the table.', h: ['Why it matters now', 'Questions worth asking', 'What comparable sites did', 'A sensible next step'], qs: ['What will support cost once the platform reaches end of life?', 'Which units would a migration touch first?', 'Who needs to be in the decision?'] },
    { re: /scope|project|expansion/, title: 'Settle Control Scope Early in a New Project', audience: 'Sites starting a new unit or expansion', intro: 'In a new project, control scope is often settled after the mechanical design. That is usually where cost and schedule risk start to grow.', h: ['Why it matters now', 'Decisions to make in the first 90 days', 'What comparable sites did', 'A sensible next step'], qs: ['Which systems must integrate on day one?', 'Who owns the control scope?', 'What does start-up depend on?'] },
    { re: /turnaround|shutdown/, title: 'Get Ready for Your Next Turnaround', audience: 'Sites with a planned turnaround', intro: 'Turnaround plans are usually set before the condition of the instruments is known. That gap is where most restart delays come from.', h: ['Why it matters now', 'Questions worth asking', 'What comparable sites did', 'A sensible next step'], qs: ['When is your next planned shutdown?', 'Which instruments have the least health data?', 'Who signs off restart readiness?'] },
    { re: /./, title: 'Plan Your Control System Migration Early', audience: 'Sites planning a control system migration', intro: 'Your current system may still be running fine. That is often why migration planning gets pushed back. This piece covers why early planning matters, what to ask your team now, and how to avoid having support timing set the schedule for you.', h: ['Why it matters now', 'Questions worth asking', 'What comparable sites did', 'A sensible next step'], qs: ['When is your next planned shutdown?', 'What would you need to see to start planning the migration?', 'Who else would be part of that decision?'] },
  ];
  function makeDoc(type, brief) {
    const tp = TOPICS.find(x => x.re.test(brief.toLowerCase()));
    const b = [{ k: 'p', t: tp.intro }, { k: 'h2', t: tp.h[0] }, { k: 'p', t: 'End of support can force decisions on someone else\'s timeline. Planning early gives your site more room to align the work with a planned shutdown. What changes if you set the timing before the timing gets set for you?' },
      { k: 'h2', t: tp.h[1] }, { k: 'ul', items: tp.qs }, { k: 'h2', t: tp.h[2] }, { k: 'p', t: 'A comparable refinery moved its legacy control system to a current platform within one planned shutdown. [Case study, 2025] A site assessment takes two days on site and gives a phased plan the team can defend. [CS-01]' },
      { k: 'h2', t: tp.h[3] }, { k: 'p', t: 'Start with a two-day site assessment. It maps what you have, what it depends on, and a phased path that fits your shutdown calendar. [OP-02]' }];
    if (type === 'Whitepaper') b.splice(0, 0, { k: 'h2', t: 'Executive summary' }, { k: 'p', t: 'This paper sets out the risks of late planning, the questions plant leaders should ask now, and a phased approach that comparable sites have used. Every figure is drawn from approved sources. [BR-03]' });
    return { title: tp.title, type, audience: tp.audience, tone: 'Direct', length: type === 'Whitepaper' ? 'Long' : 'Medium', status: 'Draft', blocks: b, sel: null };
  }
  function startDoc(type, brief) {
    const d = makeDoc(type, brief);
    S.studio = { doc: d, sel: null, thread: [{ who: 'me', text: brief }, { who: 'ai', kind: 'text', html: `I'll write a ${d.length.toLowerCase()} ${type.toLowerCase()} on <b>${esc(d.title.toLowerCase())}</b> for ${esc(d.audience.toLowerCase())}, in a direct voice, using the ${type.toLowerCase()} instructions and Brand v3. It can cite CS-01, OP-02 and BR-03, the approved sources for this audience.` }, { who: 'ai', kind: 'docCard' }, { who: 'ai', kind: 'text', html: 'Written with AI from the brief and the brand pack. Any proof is an approved claim, word for word, and every part went through the same brand and claim checks.<br><br>Tell me what to change, or click a paragraph in the canvas to change just that one. Add it to the Content library when it\'s right; reps can then add it to an email or LinkedIn step in a campaign.' }] };
    save(); location.hash = '#studio'; renderAll();
  }
  const wc = d => d.blocks.reduce((n, b) => n + (b.k === 'ul' ? b.items.join(' ') : b.t).split(/\s+/).length, 0);
  function studioRespond(t) {
    const d = S.studio.doc, sel = S.studio.sel;
    if (sel != null && d.blocks[sel] && !/shorter|proof|formal|intro|section/.test(t)) { const bl = d.blocks[sel]; if (bl.k === 'p') bl.t = bl.t.split('. ')[0].replace(/\.$/, '') + '. ' + 'In practice, the sites that move first keep the most options open.'; S.studio.sel = null; return { kind: 'text', html: 'Rewrote that paragraph. The brand checks still pass.' }; }
    if (/shorter/.test(t)) { d.blocks = d.blocks.filter((b, i) => !(b.k === 'p' && i > 0 && i < d.blocks.length - 1 && b.t.length > 200)); d.length = 'Short'; return { kind: 'text', html: `Made it shorter: ${wc(d)} words now. The proof and the next step stay.` }; }
    if (/proof/.test(t)) { const i = d.blocks.findIndex(b => /Case study/.test(b.t || '')); d.blocks.splice(i + 1, 0, { k: 'p', t: 'Sites that plan the work around a planned shutdown typically cut cut-over time by about a third. [Operating data, OP-02]', nw: true }); return { kind: 'text', html: 'Added an approved proof point, word for word, with its source (OP-02).' }; }
    if (/formal/.test(t)) { d.tone = 'Formal'; d.blocks[0].t = d.blocks[0].t.replace('Your current system may still be running fine.', 'Existing control systems frequently continue to perform adequately.').replace('That is often why', 'This is commonly why'); return { kind: 'text', html: 'Switched the tone to formal and reworded the opening.' }; }
    if (/intro/.test(t)) { d.blocks[0].t = 'Most migrations are decided by a support deadline, not by the plant. This piece shows how to turn that around: what to ask now, what comparable sites did, and the first step that keeps your options open.'; d.blocks[0].nw = true; return { kind: 'text', html: 'Rewrote the intro to lead with the risk.' }; }
    const sec = t.match(/section on (.+)/);
    if (sec) { const name = sec[1].replace(/[?.!]$/, ''); d.blocks.splice(d.blocks.length - 2, 0, { k: 'h2', t: name.charAt(0).toUpperCase() + name.slice(1), nw: true }, { k: 'p', t: `Treat ${name} as a plan, not a one-off: map each system's end-of-support date, group the work by planned shutdown, and budget for it year by year. [BR-03]`, nw: true }); return { kind: 'text', html: `Added a section on ${esc(name)} before the next step.` }; }
    return { kind: 'text', html: 'Tell me what to change: shorter, more formal, add proof, rewrite the intro, or add a section on a topic. You can also click a paragraph to change just that one.' };
  }
  function renderStudio() {
    const d = S.studio.doc;
    if (!d) {
      const all = S.content.concat(CONTENT);
      $('main').className = 'canvas studio-home';
      $('main').innerHTML = `<div class="cv-h"><div class="cv-ht" style="display:flex;flex-direction:row;align-items:baseline;gap:14px"><div class="cv-t">Content studio</div><div class="cv-s">Blogs and whitepapers in the Client's brand voice · more formats coming soon</div></div></div>
        <div class="dtabs" style="margin:0;padding:0 22px;background:var(--surf)">${[['write', 'Write'], ['saved', `Saved content <i>${all.length}</i>`]].map(([k, l]) => `<button class="${studioTab === k ? 'on' : ''}" onclick="App.setStudioTab('${k}')">${l}</button>`).join('')}</div>
        <div class="cv-b" id="cv">${studioTab === 'write' ? `<div class="st-hero"><h1>What should we write?</h1><p>Describe it in your own words. It's written in a canvas beside the chat, and you change it by talking to it.</p>
          <div class="st-box"><label class="sr" for="stBrief">Brief</label><textarea id="stBrief" rows="2" placeholder="e.g. A whitepaper on legacy control system modernisation for plant managers" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();App.studioGo()}"></textarea>
            <div class="st-f"><div class="seg">${['Blog', 'Whitepaper'].map(x => `<button class="${studioType === x ? 'on' : ''}" onclick="App.setStudioType('${x}')">${ic(x === 'Blog' ? 'pen' : 'doc', 13)} ${x}</button>`).join('')}</div><button class="send" onclick="App.studioGo()" title="Write">${ic('send', 16)}</button></div></div>
            <div class="st-soon"><span class="muted">Coming soon</span>${['PPT / PDF', 'Brochure', 'Infographic', 'Single image', 'Carousel', 'LinkedIn text post', 'Podcast', 'Video'].map(x => `<button class="chip" disabled aria-disabled="true" title="${x}: coming soon">${x}<span class="soon">Soon</span></button>`).join('')}</div>
          <div class="st-sugg">${['A blog on planning a control system migration for plant managers', 'A short blog for customers with a service renewal coming up', 'A blog on settling control scope early in a new project', 'A whitepaper on getting ready for the next turnaround'].map(s => `<button class="chip" onclick="App.studioGo(${js(s)})">${esc(s)}</button>`).join('')}</div></div>`
          : `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Piece</th><th>Type</th><th>Status</th><th>Audience</th><th>What it led to</th></tr></thead><tbody>${all.map(k => `<tr class="row-link" onclick="App.studioGo(${js(k.title)},${js(k.type === 'Whitepaper' ? 'Whitepaper' : 'Blog')})"><td class="nm">${esc(k.title)}</td><td>${esc(k.type)}</td><td><span class="badge ${/Approved|library/.test(k.status) ? 'b-pos' : /sign-off/.test(k.status) ? 'b-ter' : 'b-grey'} nodot">${esc(k.status)}</span></td><td class="sm">${esc(segOf(k.seg) ? segOf(k.seg).name : '')}</td><td class="sm" style="white-space:normal">${esc(k.led)}</td></tr>`).join('')}</tbody></table></div>`}</div>`;
      return;
    }
    $('main').className = 'canvas';
    $('main').innerHTML = `<div class="cv-h doc-h"><div class="cv-ht" style="display:flex;flex-direction:row;align-items:center;gap:10px;flex-wrap:wrap"><span class="doc-ic">${ic(d.type === 'Whitepaper' ? 'doc' : 'pen', 16)}</span><div class="cv-t">${esc(d.title)}</div><span class="badge ${d.status === 'Draft' ? 'b-grey' : 'b-pos'}">${esc(d.status)}</span><span class="muted" style="font-size:12px">Saved</span></div>
        <div class="cv-a"><div style="position:relative"><button class="btn sm" onclick="App.toggleDl()">Download ${ic('downa', 12)}</button><div class="menu" id="dlMenu" style="top:36px;right:0;width:170px"><button onclick="App.toast('Downloads are a placeholder in the mock')">Word (.docx)</button><button onclick="App.toast('Downloads are a placeholder in the mock')">PDF</button><button onclick="App.toast('Downloads are a placeholder in the mock')">Markdown</button></div></div>${d.status === 'Draft' ? '<button class="btn sm pri" onclick="App.addToLibrary()">Add to Content library</button>' : '<span class="badge b-pos">In Content library</span>'}<button class="ic-btn" title="Close" onclick="App.nav(\'studio\')">${ic('x', 16)}</button></div></div>
      <div class="doc-bar"><label for="dTone">Tone</label><select id="dTone" class="sel" onchange="App.docSet('tone',this.value)">${['Direct', 'Warm', 'Technical', 'Formal'].map(x => `<option ${d.tone === x ? 'selected' : ''}>${x}</option>`).join('')}</select><label for="dLen">Length</label><select id="dLen" class="sel" onchange="App.docSet('length',this.value)">${['Short', 'Medium', 'Long'].map(x => `<option ${d.length === x ? 'selected' : ''}>${x}</option>`).join('')}</select><span class="muted" style="margin-left:auto;font-size:12px">${wc(d)} words · ${Math.max(1, Math.round(wc(d) / 230))} min read</span></div>
      <div class="cv-b doc-bg" id="cv"><div class="doc-tags"><span class="badge b-grey">${esc(d.audience)}</span><span class="badge b-sec">Brand v3</span><span class="badge b-brand">AI-assisted · High</span></div>
        <article class="doc-paper"><h1>${esc(d.title)}</h1>${d.blocks.map((b, i) => b.k === 'h2' ? `<h2 class="${b.nw ? 'nw' : ''}">${esc(b.t)}</h2>` : b.k === 'ul' ? `<ul>${b.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="${S.studio.sel === i ? 'sel' : ''} ${b.nw ? 'nw' : ''}" onclick="App.selPara(${i})" title="Click to change just this paragraph">${esc(b.t).replace(/\[([^\]]+)\]/g, '<span class="cite">[$1]</span>')}</p>`).join('')}</article></div>`;
  }

  /* ─── Actions ─── */
  function decide(id, d, msg) { S.decisions[id] = d; save(); toast(msg || decLabel(d)); renderAll(); }
  function approve(id) {
    const a = acct(id);
    if (a.nba.sensitive && !isMgr) return decide(id, 'with-manager', 'Approved. Sent to Daniel for sign-off because it\'s sensitive.');
    decide(id, isMgr && a.nba.sensitive ? 'signed' : 'approved', `Approved: ${a.name}. Scheduled for the next send window (placeholder).`);
  }
  function approveAll(silent) {
    apprItems(isMgr ? 'team' : 'todo').filter(a => !a.nba.reason && !S.decisions[a.id]).forEach(a => { S.decisions[a.id] = 'approved'; });
    save(); if (!silent) { toast('Approved all ready items. Scheduled for the next send window (placeholder).'); renderAll(); }
  }
  function goCampaign(id, tab) { remember('campaigns'); art = null; recId = null; thrId = null; expanded = true; campSel = id; campTab = tab || 'enroll'; go('campaigns'); }
  function openRecord(id, tab) { recId = id; thrId = null; recTab = tab || 'engage'; actOpen = null; ctx = id; if (recTab === 'engage' && !acct(id).nba && !acct(id).campaign) recTab = 'overview'; renderAll(); }
  let lastKey = null;
  function openThread(id) { recId = null; thrId = id; S.read[id] = true; save(); if (view() !== 'inbox') location.hash = '#inbox'; else renderAll(); }
  /* A person or a reply opens in a focused panel; everything behind it is blurred */
  function renderFocus() {
    const on = !!recId;
    $('ws').classList.toggle('focused', on);
    $('focus').classList.toggle('full', on && focusFull);
    $('fscrim').classList.toggle('open', on);
    if (recId) { const keep = [...$('focus').querySelectorAll('*')].filter(e => e.scrollTop > 0).map(e => [e.className, e.scrollTop]); renderRecord(); keep.forEach(([cls, top]) => { const e = cls && $('focus').getElementsByClassName(cls.split(' ')[0])[0]; if (e) e.scrollTop = top; }); }
    $('focus').classList.toggle('open', on);
  }
  function renderAll() {
    const v = view(), tok = ++loadTok;
    const cc = chat(), home = false, studioHome = v === 'studio' && !S.studio.doc, inboxV = false, board = !v && !art && !!cc && (S.cur === 'home' || !!cc.obj);
    $('ws').classList.toggle('hero', isHero(cc));
    const split = board || !!art || !!(v && v !== 'studio' && v !== 'inbox' && v !== 'analytics' && expanded) || (v === 'analytics' && !art) || (v === 'inbox' && !art) || (v === 'studio' && !!S.studio.doc);
    $('ws').classList.toggle('bview', board);
    $('ws').classList.toggle('chat-closed', chatClosed && split);
    $('ws').classList.toggle('today', !v && S.cur === 'home');
    $('ws').classList.toggle('canvas-open', split);
    $('ws').classList.toggle('home', home);
    $('ws').classList.toggle('nochat', studioHome || inboxV);
    $('ws').classList.toggle('solo', !split && !home && !studioHome && !inboxV);
    renderNav(); renderChat();
    const MODR = { inbox: renderInbox, accounts: renderAccounts, segments: renderSegments, campaigns: renderCampaigns, approvals: renderApprovals, studio: renderStudio, analytics: renderAnalytics };
    const draw = art ? renderArt : v === 'studio' || v === 'inbox' || v === 'analytics' || (v && expanded) ? MODR[v] : board ? renderBoard : () => { $('main').className = ''; $('main').innerHTML = ''; };
    const key = [v, home, expanded, art, campSel, segSel, listSel, studioTab, !!S.studio.doc, board ? S.cur : ''].join('|');
    const fresh = key !== lastKey;
    lastKey = key;
    const keepTop = !fresh && $('cv') ? $('cv').scrollTop : 0;
    if (fresh && split && v !== 'studio' && !board) {
      skeleton();
      setTimeout(() => { if (tok !== loadTok) return; draw(); $('main').classList.add('fadein'); }, 280);
    } else {
      draw();
      if (fresh) { const cv = $('cv'); if (cv) cv.scrollTop = 0; $('main').scrollTop = 0; } else if ($('cv')) $('cv').scrollTop = keepTop;
    }
    renderFocus();
  }

  window.App = {
    ask, toast, nav, openRecord, openThread, approve, approveAll: () => approveAll(false), goCampaign, decide, renderAll,
    send() { const el = $('composer'); const v = el.value; el.value = ''; ask(v); },
    key(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); App.send(); } },
    focusComposer(v) { const el = $('composer'); if (!el) return; el.focus(); if (v) el.value = v; },
    setCtx(id) { ctx = id; renderChat(); },
    switchUser(id) { store.set('dmock_user', id); location.hash = ''; location.reload(); },
    signOut() { try { localStorage.removeItem('dmock_user'); } catch (e) { /* ignore */ } },
    newChat() {
      const v = view();
      if (v === 'studio') { S.studio = { doc: null, thread: [] }; save(); return nav('studio'); }
      const id = 'n' + Date.now();
      S.chats.unshift({ id, title: 'New chat', naming: true, when: 'Now', thread: [] });
      S.cur = id; ctx = null; art = null; recId = null; thrId = null; expanded = false; chatClosed = false; save(); go(null); setTimeout(() => $('composer') && $('composer').focus(), 0);
    },
    openChat(id) { backs = []; keep = null; S.cur = id; const oc = S.chats.find(x => x.id === id); art = oc && oc.art ? oc.art : null; recId = null; thrId = null; const c = S.chats.find(x => x.id === id); if (c) setTimeout(() => { c.attn = false; save(); renderNav(); }, 1200); save(); go(null); },
    goBack() { const b = backs.pop(); if (!b) return; if (!b.v || !backs.length) keep = null; recId = null; thrId = null; art = null; if (b.v) { campSel = b.campSel; segSel = b.segSel; listSel = b.listSel; expanded = b.v !== 'analytics' && b.v !== 'inbox' && b.v !== 'studio'; location.hash = '#' + b.v; renderAll(); } else { S.cur = b.cur; art = b.art || null; expanded = false; save(); go(null); } },
    closeCanvas() { if (art) art = null; else expanded = false; renderAll(); },
    expand() { art = null; recId = null; thrId = null; expanded = true; renderAll(); },
    openMod,
    openArt(k) { art = k; recId = null; thrId = null; artMore = false; renderAll(); },
    toggleMore() { artMore = !artMore; renderAll(); },
    doneTodo(id) { S.todosDone[id] = !S.todosDone[id]; if (id.startsWith('as-')) { const x = shared.tasks[+id.slice(3)]; if (x) { x.done = S.todosDone[id]; saveShared(); } } save(); renderAll(); },
    runTodo(id) { const t = todos().find(x => x.id === id); if (t) t.go(); },
    goTo(target) { const [k, v] = target.split(':'); if (k === 'campaign') goCampaign(v); else if (k === 'record') openRecord(v, 'engage'); else if (k === 'ask') ask(v); },
    repApprovals(r) { apprTab = 'team'; apprRep = r; openMod('approvals'); },
    setApprTab(k) { apprTab = k; renderAll(); },
    setApprRep(r) { apprRep = r; renderAll(); },
    setIbCh(k) { ibCh = k; thrId = null; renderAll(); },
    closeThread() { thrId = null; renderAll(); },
    archive(id) { S.archived[id] = true; thrId = null; save(); toast('Archived'); renderAll(); },
    markUnread(id) { S.read[id] = false; thrId = null; save(); toast('Marked as unread'); renderAll(); },
    closeFocus() { recId = null; thrId = null; pEdit = null; ctx = null; focusFull = false; renderAll(); },
    focusFull() { focusFull = !focusFull; renderAll(); },
    toggleNav() { navCol = !navCol; try { localStorage.setItem('dmock_nav', navCol ? '1' : ''); } catch (e) {} document.body.classList.toggle('nav-col', navCol); renderNav(); },
    setCu(k) { cuF = k; renderAll(); },
    openAppr(tab) { apprTab = tab; art = null; recId = null; thrId = null; expanded = true; go('approvals'); },
    setAuto(k, v) { S.auto[k] = v; save(); toast(`Set to ${v}. Work done this way is marked on every list.`); renderAll(); },
    chatOpen(on) { chatClosed = !on; renderAll(); if (on) setTimeout(() => $('composer') && $('composer').focus(), 0); },
    setDay(v, f, d) { if (v) dayView = v; if (f) dayFilt = f; if (d != null) daySel = d; const y = $('yourDay'); if (y) y.innerHTML = yourDay(); else renderAll(); },
    renameChat() { const c = chat(); if (!c || !S.chats.includes(c)) return; c.naming = true; renderChat(); setTimeout(() => { const el = $('ttlIn'); if (el) { el.focus(); el.select(); } }, 0); },
    nameChat(v) { const c = chat(); if (!c || !c.naming) return; c.naming = false; if (v != null && v.trim()) c.title = v.trim().slice(0, 60); save(); renderNav(); renderChat(); if (v != null) setTimeout(() => $('composer') && $('composer').focus(), 0); },
    notes(on) { notesOpen = on == null ? !notesOpen : !!on; renderChat(); if (notesOpen) setTimeout(() => $('noteIn') && $('noteIn').focus(), 0); },
    addChatNote() { const el = $('noteIn'), t = el && el.value.trim(); if (!t) return; const c = chat(); const d = new Date(); (c.notes = c.notes || []).push({ t, at: 'Today ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }); save(); renderAll(); toast('Note pinned to this chat'); setTimeout(() => $('noteIn') && $('noteIn').focus(), 0); },
    delChatNote(i) { const c = chat(); c.notes.splice(i, 1); save(); renderAll(); },
    dd(e, b) { e.stopPropagation(); const d = b.parentNode, open = d.classList.contains('open'); document.querySelectorAll('.dd.open').forEach(x => x.classList.remove('open')); if (!open) d.classList.add('open'); },
    ddRun(e, run, id) { e.stopPropagation(); document.querySelectorAll('.dd.open').forEach(x => x.classList.remove('open'));
      if (run === '#notes') return App.notes(true);
      if (run[0] === '>') { const el = $(id); if (el) { el.value = run.slice(1); el.focus(); } return; }
      if (id === 'copIn') App.copAsk(run); else ask(run); },
    ddScope(e, id) { e.stopPropagation(); document.querySelectorAll('.dd.open').forEach(x => x.classList.remove('open')); ctx = id; renderChat(); },
    copSend() { const el = $('copIn'); if (el) App.copAsk(el.value); },
    skipAsk(id) { skipOpen = skipOpen === id ? null : id; renderAll(); },
    skipWith(id, why) { S.skipR[id] = why; skipOpen = null; decide(id, 'skipped', `Skipped: ${why.toLowerCase()}. It feeds the learning loop.`); },
    handoff(id) { const r = REPLIES.find(x => x.id === id); S.handled[id] = true; if (!S.today) S.today = { id: 'home', title: 'Today', thread: todayThread() }; S.today.thread.push({ who: 'ai', kind: 'text', html: `Handed <b>${esc(acct(r.acc).name)}</b> to the proposal team with the reply, the signals and the account history, so they start from context, not a form. ${esc(first(USERS[acct(r.acc).owner].name))} stays the owner.` }); save(); toast('Handed to proposals with the full context (placeholder)'); renderAll(); },
    dictate(id) {
      id = id || 'composer'; const el = $(id), mic = $(id + 'Mic'); if (!el) return;
      if (speech) { speech.stop(); return; }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const fake = () => { el.value = id === 'thrBody' ? el.value : (recId ? 'Why is this here?' : 'Where are we stuck this week?'); toast('Dictation needs microphone access in Chrome; filled a sample question'); if (id !== 'thrBody') setTimeout(() => sendFrom(id), 700); };
      if (!SR) return fake();
      speech = new SR(); speech.lang = 'en-US'; speech.interimResults = true; speech.continuous = false;
      const base = id === 'thrBody' ? el.value + (el.value ? ' ' : '') : ''; let said = '', failed = false;
      if (mic) mic.classList.add('live'); toast('Listening…');
      speech.onresult = ev => { said = [...ev.results].map(r => r[0].transcript).join(''); el.value = base + said; el.dispatchEvent(new Event('input')); };
      speech.onerror = () => { failed = true; };
      speech.onend = () => { speech = null; if (mic) mic.classList.remove('live'); if (failed && !said) return fake(); if (said && id !== 'thrBody') sendFrom(id); };
      try { speech.start(); } catch (e) { speech = null; if (mic) mic.classList.remove('live'); fake(); }
    },
    toggleCop() { if (!focusFull && innerWidth > 1100) { copOpen = false; ctx = recId; renderChat(); const el = $('composer'); if (el) { el.focus(); el.closest('.composer').classList.add('flash'); setTimeout(() => el.closest('.composer') && el.closest('.composer').classList.remove('flash'), 1200); } toast('Ask in the chat on the left. It is looking at ' + acct(recId).contact.name + ' now.'); return; } copOpen = !copOpen; renderAll(); if (copOpen) setTimeout(() => $('copIn') && $('copIn').focus(), 0); },
    copAsk(text) { if (!text || !text.trim() || !recId) return; const a = acct(recId), th = S.cop[a.id] = S.cop[a.id] || []; th.push({ who: 'me', text }); th.push({ who: 'ai', html: copRespond(a, text.toLowerCase()) }); save(); renderAll(); },
    sendNow(id) { const a = acct(id); if (a.campaign) { S.enrollOK[id] = true; save(); toast(`Next step sent to ${a.contact.name} now (placeholder: nothing is sent)`); renderAll(); } else if (a.nba && !/auto|sent/.test(a.nba.status) && !S.decisions[id]) approve(id); else toast('Nothing is waiting to send for this person'); },
    pEditStep(id, i) { pEdit = id ? `${id}:${i}` : null; renderAll(); },
    pSave(id, i) { const v = $('pBody').value; editPseq(id, sq => { sq[i].body = v; }); pEdit = null; toast('Saved. The brand and claim checks pass'); renderAll(); },
    pRemove(id, i) { editPseq(id, sq => sq.splice(i, 1)); toast('Step removed for this person'); renderAll(); },
    pAdd(id, ch, silent) { editPseq(id, (sq, a) => { const t = newTouch(sq, campOf(a.campaign), ch); t.body = personal(t, a); sq.push(t); }); if (!silent) { pEdit = `${id}:${S.pseq[id].length - 1}`; toast(`${ch} step added at the end · edit it below`); renderAll(); setTimeout(() => { const el = $('pBody'); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); } }, 60); } },
    pReset(id) { delete S.pseq[id]; save(); renderAll(); },
    addToSeq(id, cid) { if (cid) toast(`${acct(id).contact.name} joins ${campOf(cid).name} when this sequence ends (mock)`); },
    setOwner(r) { ownerF = r; renderAll(); },
    setAnPer(k) { anPer = k; renderAll(); },
    setInboxTab(k) { inboxTab = k; thrId = null; renderAll(); },
    setHomeMet(k) { homeMet = k; renderAll(); },
    toggleProc() { showProc = !showProc; renderAll(); },
    viewRep(r) { ownerF = r; toast(`Showing ${USERS[r].name}'s accounts`); openMod('accounts'); },
    reassign(ids, r) { ids.forEach(id => { const a = acct(id); if (a) { a.owner = r; shared.assign[id] = r; } }); saveShared(); toast(`Moved ${ids.length === 1 ? acct(ids[0]).name : ids.length + ' accounts'} to ${USERS[r].name}`); renderAll(); },
    assignTask() { const t = $('asT').value.trim(), to = $('asR').value; if (!t) { toast('Write the task first'); return; } shared.tasks.push({ t, to, acc: $('asA').value, due: $('asD').value, done: false }); saveShared(); toast(`Assigned to ${USERS[to].name}. It's in their to-do list`); renderAll(); },
    approveEnrollAll(cid) { ACCOUNTS.filter(a => a.campaign === cid && visible(a)).forEach(a => { S.enrollOK[a.id] = true; }); save(); toast('Approved. Each sequence starts once the campaign is confirmed.'); renderAll(); },
    saveThread(id) { const el = $('thrBody'); if (el) { S.drafts['thr-' + id] = el.value; save(); } },
    setCampTab(k) { campTab = k; renderAll(); },
    setSegTab(k) { segTab = k; renderAll(); },
    setRecTab(k) { recTab = k; actOpen = null; renderAll(); },
    toggleAct(i) { actOpen = actOpen === i ? null : i; renderAll(); },
    star(id) { S.starred[id] = !S.starred[id]; save(); renderAll(); },
    openList(id) { remember('accounts'); listSel = id || 'all'; art = null; recId = null; thrId = null; expanded = true; go('accounts'); },
    saveView() { const name = `My view · ${listSel === 'all' ? 'all accounts' : 'list'} · 27 Oct`; const ids = Array.from(document.querySelectorAll('#cv tbody tr')).length; addList(name, 'Saved view', `${ids} accounts saved from the Accounts view`, ACCOUNTS.filter(mine).map(a => a.id)); listSel = S.lists[0].id; save(); toast('Saved as a list. It\'s a tab now'); renderAll(); },
    openSegment(id) { remember('segments'); segSel = id; segTab = 'accounts'; art = null; recId = null; thrId = null; expanded = true; go('segments'); },
    saveSegList(segId) { const s = segOf(segId); addList(s.name + ' · 27 Oct', 'Segment', 'Saved from Segments', ACCOUNTS.filter(a => a.seg === segId).map(a => a.id)); save(); toast('Saved. It\'s a tab in Accounts'); },
    confirmCampaign(id) { S.camp[id] = 'Confirmed'; save(); toast('Campaign confirmed. Step 1 goes out tomorrow 09:00 (placeholder: nothing is sent).'); renderAll(); },
    sendForConfirm(id) { S.camp[id] = 'Sent for confirmation'; save(); toast('Sent to Daniel to confirm, with your edits.'); renderAll(); },
    approveEnroll(id) { S.enrollOK[id] = true; save(); toast('Approved. The first step is scheduled once the campaign is confirmed.'); renderAll(); },
    handleReply(id, msg) { S.handled[id] = true; save(); toast(msg || 'Reply sent (placeholder). The sequence for this account is stopped.'); renderAll(); },
    seqEdit(cid, i, f, v) { editSeq(cid, sq => { sq[i][f] = f === 'day' ? Math.max(0, parseInt(v, 10) || 0) : v; if (f === 'ch') { sq[i].fmt = FORMATS[v][0]; if (v === 'Email' && !sq[i].subject) sq[i].subject = campOf(cid).name; } if (f === 'day') sq.sort((p, q) => p.day - q.day); }); renderAll(); },
    seqMove(cid, i, d) { editSeq(cid, sq => { const j = i + d; if (j < 0 || j >= sq.length || sent(sq[j])) return; [sq[i], sq[j]] = [sq[j], sq[i]]; const days = sq.map(t => t.day).sort((p, q) => p - q); sq.forEach((t, k) => { t.day = days[k]; }); }); renderAll(); },
    seqRemove(cid, i) { editSeq(cid, sq => { sq.splice(i, 1); }); toast('Step removed'); renderAll(); },
    seqAdd(cid, ch) { editSeq(cid, (sq, c) => sq.push(newTouch(sq, c, ch))); toast(`${ch} step added at the end`); renderAll(); setTimeout(() => { const el = [...document.querySelectorAll('.tedit:not(.locked)')].pop(); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); const m = el.querySelector('textarea'); if (m) m.focus({ preventScroll: true }); } }, 60); },
    seqRewrite(cid, i) { editSeq(cid, sq => { const t = sq[i]; t.t = t.ch === 'LinkedIn' ? `Saw the news at your site. ${t.t.split('.')[0]}. Worth a quick chat?` : `${t.t.split('.')[0]}. Here is what a comparable site learned, in one page, and the first step that kept its options open.`; }); toast('Rewritten. Brand and claim checks still pass'); renderAll(); },
    seqReset(cid) { delete S.seq[cid]; save(); toast('Back to the AI draft'); renderAll(); },
    setStudioTab(k) { studioTab = k; renderAll(); },
    setStudioType(x) { studioType = x; renderAll(); },
    studioGo(text, type) { const v = text || ($('stBrief') && $('stBrief').value) || ''; if (!v.trim()) { toast('Describe what to write first'); return; } const soon = !text && v.match(/\b(ppt|powerpoint|slides?|deck|pdf|brochure|infographic|carousel|podcast|video|single image|linkedin (text )?post)\b/i); if (soon) { toast(`${soon[0].charAt(0).toUpperCase() + soon[0].slice(1)} is coming soon. For now, pick Blog or Whitepaper.`); return; } startDoc(type || (/whitepaper/i.test(v) ? 'Whitepaper' : studioType), v); },
    focusDoc() { if (view() !== 'studio') location.hash = '#studio'; },
    selPara(i) { S.studio.sel = S.studio.sel === i ? null : i; save(); renderAll(); if (S.studio.sel != null) $('composer').focus(); },
    docSet(f, v) { const d = S.studio.doc; d[f] = v; if (f === 'length' && v === 'Short') studioRespond('shorter'); if (f === 'length' && v === 'Long') studioRespond('add a section on lifecycle planning'); if (f === 'tone' && v === 'Formal') studioRespond('formal'); S.studio.thread.push({ who: 'ai', kind: 'text', html: `${f === 'tone' ? 'Tone' : 'Length'} set to ${esc(v.toLowerCase())}. The brand checks still pass.` }); save(); renderAll(); },
    toggleDl() { $('dlMenu').classList.toggle('open'); },
    addToLibrary() { const d = S.studio.doc; d.status = 'In Content library'; S.content.unshift({ id: 'u' + Date.now(), type: d.type, title: d.title, status: 'In Content library', seg: 's8', led: 'Available to reps in email and LinkedIn steps', by: first(me.name) }); S.studio.thread.push({ who: 'ai', kind: 'text', html: 'Added to the Content library. Reps can now add it to an email or LinkedIn step in Campaigns, or to a next best action.' }); save(); toast('Added to the Content library'); renderAll(); },
    setOption(id, o) { S.drafts[id] = Object.assign(draftOf(acct(id)), { option: o }); save(); renderAll(); },
    setChannel(id, c) { S.drafts[id] = Object.assign(draftOf(acct(id)), { channel: c }); save(); renderAll(); },
    saveDraft(id) { const d = draftOf(acct(id)); if ($('dSubj')) d.subject = $('dSubj').value; if ($('dBody')) d.body = $('dBody').value; S.drafts[id] = d; save(); },
    undo(id) { delete S.decisions[id]; save(); renderAll(); },
    logOutcome(id, o) { S.outcomes[id] = o; save(); toast(`Logged: ${o}. It feeds the learning loop.`); renderAll(); },
    addNote(id) { const v = $('noteBox').value.trim(); if (!v) return; (S.notes[id] = S.notes[id] || []).unshift({ t: v, d: 'just now' }); save(); renderAll(); },
    useRunnerUp(id) { ctx = id; ask('Use the runner-up'); },
    closeDrawer() { $('drawer').classList.remove('open'); $('scrim').classList.remove('open'); },
  };
  document.addEventListener('click', e => { if (!e.target.closest('.menu,.btn')) document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open')); });
  document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if ($('drawer').classList.contains('open')) App.closeDrawer(); else if (recId) App.closeFocus(); else if (art || (view() && view() !== 'studio' && expanded)) App.closeCanvas(); });
  S.genLists.forEach(g => { genList(g); if (g.routed) routeList(g.id); });
  renderAll();
})();
