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
  const isMgr = me.role === 'manager' || me.role === 'leader', isLeader = me.role === 'leader';
  const STATE_KEY = 'dmock_state_v10_' + me.id;
  let saved = {};
  try { saved = JSON.parse(store.get(STATE_KEY, true) || '{}'); } catch (e) { saved = {}; }
  const S = Object.assign({ chats: null, cur: 'home', mchat: {}, studio: { doc: null, thread: [] }, decisions: {}, todosDone: {}, notes: {}, outcomes: {}, drafts: {}, runs: [], camp: {}, handled: {}, lists: [], genLists: [], read: {}, archived: {}, pseq: {}, cop: {}, seq: {}, content: [], enrollOK: {}, starred: {}, today: null, auto: {}, skipR: {} }, saved);
  const save = () => { store.set(STATE_KEY, JSON.stringify(S), true); saveShared(); };
  /* Shared across sign-ins in this tab: what the manager assigns shows up for the rep */
  let shared = {};
  try { shared = JSON.parse(store.get('dmock_shared', true) || '{}'); } catch (e) { shared = {}; }
  shared = Object.assign({ assign: {}, tasks: [] }, shared);
  const saveShared = () => store.set('dmock_shared', JSON.stringify(shared), true);
  /* Campaign confirmation, touches, replies and opt-outs are team facts: every sign-in sees the same ones */
  ['camp', 'campDay0', 'ctouch', 'creply', 'optouts'].forEach(k => { shared[k] = Object.assign({}, S[k] || {}, shared[k] || {}); delete S[k]; Object.defineProperty(S, k, { get: () => shared[k], set: v => { shared[k] = v; }, enumerable: false, configurable: true }); });
  /* Keep each next best action's starting state: the rules below decide the route from it */
  ACCOUNTS.forEach(a => { if (a.nba) a.nba.orig = a.nba.orig || a.nba.status; });
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
      { id: 'cedar', title: 'Cedar: rival contract ends', when: 'Fri', attn: !isMgr, attnText: 'Mei Tan opened your comparison twice', readUpTo: 2, readAt: 'Fri 16:10', thread: [{ who: 'me', text: 'What should I do with Cedar?' }, { who: 'ai', kind: 'nba', id: 'cedar' }, { who: 'ai', kind: 'text', html: 'Since Friday, <b>Mei Tan opened the migration-path comparison twice</b> and forwarded it to procurement. Now is the time to offer the 30-minute walkthrough. The draft is ready; it needs you because the warm path is weak. <br><button class="btn sm pri" style="margin-top:8px" onclick="App.openRecord(\'cedar\',\'engage\')">Review the draft</button>' }] },
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
  let funF = 'month', cuF = 'since', skipOpen = null, listening = false, focusFull = false, anPer = 'week', copOpen = false, pEdit = null, thrId = null, ibCh = 'all', ownerF = 'all', inboxTab = 'all', homeMet = 'team', showProc = false, loadTok = 0, expanded = false, ctx = null, art = null, recId = null, recTab = 'engage', listSel = 'all', campSel = null, campTab = 'enroll', segSel = null, segTab = 'accounts', apprTab = isMgr ? 'needs' : 'todo', apprRep = 'all', scope = isMgr ? 'team' : 'mine', studioTab = 'write', studioType = 'Whitepaper', actOpen = null, artMore = false;

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
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    letter: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10"/><path d="M7 13h10"/><path d="M7 17h5"/>',
    clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    plug: '<path d="M9 2v6"/><path d="M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>',
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
  const chIc = ch => ic(ch === 'LinkedIn' ? 'li' : /Phone/.test(ch) ? 'phone' : /WhatsApp|SMS/.test(ch) ? 'chat' : /Direct mail/.test(ch) ? 'letter' : 'mail', 13);
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
  const campStatus = c => S.camp[c.id + 'x'] ? 'Declined' : S.camp[c.id] || (c.status === 'Ready to confirm' && (window.MOCK.SIM.days || 0) >= 3 ? 'Fell back to next best actions' : c.status);
  const campBadge = c => `<span class="badge ${/Declined|Fell back/.test(campStatus(c)) ? 'b-grey' : S.camp[c.id] ? (S.camp[c.id] === 'Confirmed' ? 'b-pos' : 'b-ter') : CSTAT[c.status] || 'b-grey'}">${esc(campStatus(c))}</span>`;
  const stateBadge = st => { const k = /Meeting|positive/.test(st) ? 'b-pos' : /objection|Bounced|Taken out/.test(st) ? 'b-warn' : /Out of office|Draft/.test(st) ? 'b-grey' : /Waiting/.test(st) ? 'b-ter' : 'b-sec'; return `<span class="badge ${k}">${esc(st)}</span>`; };
  const KIND_B = { Positive: 'b-pos', 'Meeting booked': 'b-pos', Objection: 'b-warn', 'Out of office': 'b-grey' };
  const decLabel = d => ({ approved: 'Approved · scheduled', 'with-manager': 'With Daniel', skipped: 'Skipped', 'sent-back': 'Sent back', signed: 'Signed off' }[d] || d);
  const mailbox = a => `${USERS[a.owner].name.toLowerCase().replace(' ', '.')}@client.example`;

  /* ─── Work items ─── */
  /* Each option keeps its own message: the runner-up is a different message, not just a different label */
  function runMsg(a) {
    const f = first(a.contact.name), w = a.whyNow ? a.whyNow.type.toLowerCase() : 'recent news', r = a.nba.runnerUp;
    return { subject: r, body: `Hi ${f},\n\nI saw the ${w} at ${a.name}. Rather than ask for a call, I'd like to ${r.charAt(0).toLowerCase() + r.slice(1)}. A site of a similar size faced the same question last year, and I can share what they did first and what it changed.\n\nIf it's useful, I can send a one-page version to share with your team.\n\nBest,\n${first(USERS[a.owner].name)}` };
  }
  function switchOpt(a, o) {
    const d = draftOf(a); if (d.option === o) return d;
    d['ed_' + d.option] = { subject: d.subject, body: d.body };
    const n = d['ed_' + o] || (o === 'run' ? runMsg(a) : { subject: a.nba.subject, body: a.nba.body });
    Object.assign(d, { option: o, subject: n.subject, body: n.body }); S.drafts[a.id] = d; return d;
  }
  function draftOf(a) { return Object.assign({ subject: a.nba.subject, body: a.nba.body, channel: a.nba.channel, option: 'rec' }, S.drafts[a.id] || {}); }
  function openItems() { return ACCOUNTS.filter(a => a.nba && (a.nba.status === 'ready' || a.nba.status === 'review')); }
  function apprItems(tab) {
    const scope = a => isMgr ? apprRep === 'all' || a.owner === apprRep : a.owner === me.id;
    if (tab === 'ready' || tab === 'ahead') return ACCOUNTS.filter(a => a.nba && a.nba.status === 'auto' && !a.campaign && scope(a));
    if (tab === 'done') return ACCOUNTS.filter(a => a.nba && !a.campaign && (S.decisions[a.id] || a.nba.status === 'expired') && (isMgr || a.owner === me.id));
    const cards = ACCOUNTS.filter(a => a.nba && !a.campaign && !S.decisions[a.id] && (a.nba.status === 'review' || (a.nba.status === 'held' && a.nba.esc)));
    if (isMgr) return tab === 'needs' ? [] : cards.filter(scope);
    return cards.filter(a => a.owner === me.id);
  }
  function badgeCount() { return isMgr ? (campStatus(campOf('c1')) === 'Ready to confirm' ? 1 : 0) + escOther().length : apprItems('todo').length + escOther().length; }
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
  /* The ICP is made and confirmed in chat, remembered, and improved from what reps do. Admin only sees the library and owns the weights. */
  if (!shared.icps) shared.icps = [{ v: 1, crit: ['Refining, petrochemicals, gas processing', '6 SEA countries', '500+ staff', 'Reliability, maintenance, operations leaders'], path: 'Shared by the client (path A)', by: 'Daniel Brooks', at: 'Mon 16 Nov', status: 'In use', used: 'Overnight sweep; Lookalikes of my last 10 wins', res: '81 accounts scored · 4 meetings' }];
  const icpNow = () => shared.icps.filter(x => x.status === 'In use').slice(-1)[0] || shared.icps[shared.icps.length - 1];
  const PROPOSED = ['Petrochemical and refining sites', 'Singapore, Malaysia, Thailand', '1,000–5,000 staff', 'Reliability and operations leaders', 'Control system older than 15 years'];
  function icpCard(crit, path, btn) { return `<div class="ccard"><div class="ccard-b"><div class="lbl" style="margin-bottom:6px">${esc(path)}</div>${crit.map(x => `<div class="mini-row"><div class="grow">${esc(x)}</div></div>`).join('')}</div><div class="ccard-f">${btn}</div></div>`; }
  function perfChat(t) {
    if (/needs? my approval|waiting (for me|in approvals)|what('s| is) in approvals|my approvals/.test(t)) return { kind: 'approvalsList' };
    const say = h => ({ kind: 'text', html: h }), who = isMgr ? 'the team' : 'you';
    const st = k => isMgr ? REPS.reduce((n, r) => n + TEAM_STATS[r][k], 0) : TEAM_STATS[me.id][k];
    const open = (l, js) => `<div class="next-row"><button class="btn sm" onclick="${js}">${l}</button></div>`;
    const cid = /turnaround|rival|renewal|contract|expansion|capex|hiring|surge|debottleneck/.test(t) ? findCampaign(t) : null;
    if (cid && /perform|doing|going|result|stat|numbers|how is|how's/.test(t)) {
      const c = campOf(cid), s = campStats(c), sq = seqOf(c), done = sq.filter(sent).length;
      return say(`<p><b>${esc(c.name)}</b> · ${esc(campStatus(c))}${isMgr ? '' : ' · your accounts'}</p><div class="ccard"><div class="ccard-b">${[['Accounts', s.total], ['Started', s.started], ['Opened', s.opened + ' (' + pct(s.opened, s.started) + ')'], ['Replied', s.replies + ' (' + pct(s.replies, s.started) + ')'], ['Positive', s.positive], ['Meetings', s.meetings], ['Steps sent', done + ' of ' + sq.length]].map(r => `<div class="mini-row"><div class="grow">${r[0]}</div><b>${r[1]}</b></div>`).join('')}</div></div><p>${s.started ? (s.replies ? `Step 2 drew most replies. ${s.positive >= 2 ? 'It is ahead of the team average.' : 'Replies are below the team average: try a shorter step 1.'}` : 'Sent, no replies yet.') : campStatus(c) === 'Ready to confirm' ? 'Not started: it is waiting for Daniel to confirm the campaign and its touch formats.' : 'Not started yet.'}</p>${open('Open the campaign', `App.goCampaign('${cid}')`)}`);
    }
    if (/(best|top|worst|weakest|strongest).*campaign|campaign.*(best|top|perform|compare|ranking)/.test(t)) {
      const rows = CAMPAIGNS.map(c => ({ c, s: campStats(c) })).filter(x => x.s.started).sort((p, q) => q.s.replies / q.s.started - p.s.replies / p.s.started);
      return say(`<p>Campaigns ranked by reply rate${isMgr ? '' : ' on your accounts'}:</p><div class="ccard"><div class="ccard-b">${rows.map((x, i) => `<div class="mini-row row-link" onclick="App.goCampaign('${x.c.id}')"><div class="grow"><div class="nm">${i + 1}. ${esc(x.c.name)}</div><div class="sm">${x.s.started} started · ${x.s.meetings} meetings · ${esc(campStatus(x.c))}</div></div><b>${pct(x.s.replies, x.s.started)}</b></div>`).join('')}</div></div>${rows[0] ? `<p><b>${esc(rows[0].c.name)}</b> performs best; ${rows.length > 1 ? `<b>${esc(rows[rows.length - 1].c.name)}</b> is weakest, so its step 1 is the one to change.` : ''}</p>` : ''}`);
    }
    if (/reply rate|response rate|open rate/.test(t)) return say(`<p>Reply rate this week for ${who}: <b>${pct(st('replies'), st('sent'))}</b> (${st('replies')} replies from ${st('sent')} emails sent). ${isMgr ? '' : 'Team average: ' + pct(REPS.reduce((n, r) => n + TEAM_STATS[r].replies, 0), REPS.reduce((n, r) => n + TEAM_STATS[r].sent, 0)) + '.'}</p>${open('Open Analytics', "App.nav('analytics')")}`);
    if (/how many meetings|meetings (did|have) (i|we)|meetings this week|meetings booked/.test(t)) return say(`<p>${isMgr ? 'The team' : 'You'} booked <b>${st('meetings')} of ${st('target')}</b> meetings this week. ${st('meetings') < st('target') ? `${st('target') - st('meetings')} short; the fastest route is the ${isMgr ? 'Turnaround campaign once you confirm it' : 'Ready to send items on Today'}.` : 'On target.'}</p>${open('Open Analytics', "App.nav('analytics')")}`);
    if (!isMgr && /\bteam\b|other reps|everyone/.test(t) && /doing|perform|numbers|stats|how/.test(t)) return say(`<p>Team numbers are for your manager. Here are yours: <b>${st('meetings')} of ${st('target')}</b> meetings, reply rate <b>${pct(st('replies'), st('sent'))}</b>, ${st('approved')} actions approved, ${st('accept')}% of recommendations accepted.</p>${open('Open Analytics', "App.nav('analytics')")}`);
    return null;
  }
  function icpChat(t, text) {
    const cur = icpNow();
    if (/don.?t know|not sure|help me|propose|suggest|from (our|the) website/.test(t)) return { kind: 'text', html: `<p>Path B: I read your website (products, industries you serve, 6 case studies) and your 15 won accounts in the CRM, and drafted an ICP. Two quick questions would sharpen it; tap an answer or confirm as is.</p>${icpCard(PROPOSED, 'Proposed ICP · nothing is searched until you confirm', `<button class="btn sm pri" onclick="App.icpConfirm('B')">Confirm this ICP</button><button class="chip" onclick="App.ask('Our ICP should include gas processing too')">Include gas processing?</button><button class="chip" onclick="App.ask('Our ICP minimum is 500 staff')">Minimum 500 staff?</button>`)}<p class="sm muted">Sample it would find: Juniper Petrochem, Cedar Petrochemicals, Halcyon Gas Processing, Eastgate Refining, Kingfisher Refining.</p>` };
    if (/should include|minimum/.test(t)) { const d = (S.icpDraft || PROPOSED).slice(); if (/gas/.test(t) && !d.some(x => /gas/i.test(x))) d[0] = d[0] + ', and gas processing'; const n = t.match(/(\d[\d,]*)\s*staff/); if (n) d[2] = n[1] + '+ staff'; S.icpDraft = d; save(); return { kind: 'text', html: `<p>Updated the proposal with your answer.</p>${icpCard(d, 'Proposed ICP · nothing is searched until you confirm', `<button class="btn sm pri" onclick="App.icpConfirm('A')">Confirm this ICP</button>`)}` }; }
    const m = text.match(/(?:icp|ideal customer)[^:]*?(?:is|:)\s*(.+)/i);
    if (m && m[1].length > 12 && !/^(what|which)/i.test(m[1])) { const crit = m[1].split(/,|;| and /).map(s => s.trim()).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)); S.icpDraft = crit; save(); return { kind: 'text', html: `<p>Path A: I turned what you wrote into criteria. Check them, then confirm and I'll remember it for every new list.</p>${icpCard(crit, 'Your ICP, as criteria', `<button class="btn sm pri" onclick="App.icpConfirm('A')">Confirm this ICP</button>`)}` }; }
    const learn = shared.icps.some(x => /Learned/.test(x.path)) ? '' : `<p>I also noticed something from the team's work: reps removed 6 sites under 300 staff from their lists this month. Should the ICP say 300 staff or more?</p><div class="next-row"><button class="btn sm" onclick="App.icpLearn()">Yes, update the ICP</button></div>`;
    return { kind: 'text', html: `<p>We use <b>ICP v${cur.v}</b>, confirmed by ${esc(cur.by)} on ${esc(cur.at)} (${esc(cur.path.toLowerCase())}). Every new list starts from it.</p>${icpCard(cur.crit, 'Current ICP', `<button class="chip" onclick="App.ask('Help me define our ICP from our website')">Propose a new one</button><button class="chip" onclick="App.ask('Our ICP is refineries and petrochemical plants in Singapore and Malaysia, 500+ staff, reliability leaders')">Type a new one</button>`)}${learn}` };
  }
  const sigOfPrompt = t => /new (leader|hire|head|reliability|plant|operations)|joined|appointed/.test(t) ? 'New leader in the team' : /hiring|vacanc|open roles/.test(t) ? 'Hiring in the team' : /pricing|visited|website visit/.test(t) ? 'Visited your pricing page' : /migrat|historian|tech.?stack|dcs/.test(t) ? 'Tech stack change' : /turnaround|shutdown|outage/.test(t) ? 'Turnaround announced' : /rival|contract end|competitor contract/.test(t) ? 'Rival contract ending' : /expansion|capex|new unit/.test(t) ? 'Expansion approved' : /funding|raised/.test(t) ? 'Funding round' : /event|webinar|conference/.test(t) ? 'Event attendance' : '';
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
  const GSIG = [['Funding round', 1, 'Raised a new funding round this month', 'News'], ['New leader in the team', 1, 'A new head of the team started two weeks ago', 'LinkedIn'], ['Hiring in the team', 2, 'Three open roles in the team', 'Job boards'], ['Visited your pricing page', 1, 'Pricing and case-study pages, twice this week', 'Website visitor ID'], ['Tech stack change', 2, 'Switched a core platform', 'Technographics'], ['Event attendance', 3, 'Registered for an industry event', 'Events'], ['Turnaround announced', 1, 'Announced a planned turnaround for next year', 'News'], ['Rival contract ending', 1, 'Support contract with a rival vendor ends within 6 months', 'Procurement data'], ['Expansion approved', 1, 'Capex approved for a new unit', 'News']];
  const GACT = { 'New leader in the team': ['Congratulate the new leader and share a 90-day plan', 'LinkedIn', true], 'Visited your pricing page': ['Send a short comparison with a peer example', 'Email', true], 'Hiring in the team': ['Share how peers scaled the team', 'Email', false], 'Tech stack change': ['Share a migration checklist', 'Email', false], 'Event attendance': ['Suggest meeting at the event', 'LinkedIn', false] , 'Turnaround announced': ['Share the turnaround readiness checklist', 'Email', true], 'Rival contract ending': ['Compare extending with switching before the contract ends', 'Email', true], 'Expansion approved': ['Offer a scope review for the new unit', 'Email', false]};
  function seeded(str) { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }
  function genList(g) {
    if (ACCOUNTS.some(a => a.fromList === g.id)) return;
    const r = seeded(g.id + g.q), icp = g.icp, ind = icp.industry || 'Technology', fn = icp.fn || 'Marketing', city = icp.city || 'Sydney', country = icp.country || 'Australia', sufs = SUF[ind] || SUF.Technology;
    const title = icp.lvl === 'Head' ? `Head of ${fn}` : icp.lvl === 'Chief' ? `Chief ${fn} Officer` : icp.lvl === 'VP' ? `VP ${fn}` : `${fn} ${icp.lvl}`;
    const used = new Set();
    for (let i = 0; i < 16; i++) {
      let name; do { name = `${PRE[Math.floor(r() * PRE.length)]} ${sufs[Math.floor(r() * sufs.length)]}`; } while (used.has(name)); used.add(name);
      const fnm = FIRST[Math.floor(r() * FIRST.length)], lnm = LAST[Math.floor(r() * LAST.length)], slug = name.toLowerCase().replace(/[^a-z]+/g, '');
      const named = GSIG.find(x => x[0] === icp.sig) || (/Refining/.test(ind) ? GSIG.find(x => x[0] === 'Turnaround announced') : GSIG[0]);
      const lead = i < 10 ? named : GSIG[1 + (i % 5)];
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
        a.nba.orig = 'ready'; routeAll();
        a.activity.push({ k: 'nba', when: 'Today', t: 'Next best action: ' + action, d: `${ch} · ${a.nba.status === 'auto' ? 'ready to send with one click' : a.nba.status === 'review' ? 'approval card: ' + a.nba.reason : a.nba.reasonNote || a.nba.status}` });
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
    t.push({ id: 't5', t: 'Follow up on Sapphire Aromatics', d: 'Opened the switch comparison 3 times; no reply yet', due: 'Today', cls: 'ok', go: () => openRecord('sapphire', 'activity') });
    return t;
  }
  function updates() {
    const u = [];
    myReplies().filter(r => r.kind === 'Positive' || r.kind === 'Meeting booked').forEach(r => u.push({ k: 'pos', icon: 'reply', when: r.at, t: `${r.from} ${r.kind === 'Positive' ? 'replied: interested' : 'booked a meeting'}`, d: `${acct(r.acc).name} · ${r.sourceKind === 'Campaign' ? 'campaign' : 'your action'}${isMgr ? ' · ' + first(USERS[r.owner].name) : ''}`, on: `App.openThread('${r.id}')` }));
    if (!S.camp.c1) u.push({ k: 'brand', icon: 'megaphone', when: 'Today 06:05', t: 'New campaign proposed: Turnaround season 2027', d: isMgr ? '11 accounts crossed the threshold. Needs your confirmation.' : '5 of your accounts are in it. Daniel confirms.', on: "App.goCampaign('c1')" });
    u.push({ k: 'info', icon: 'bolt', when: 'Today 06:00', t: isMgr ? '3 accounts moved into tier A' : 'Juniper Petrochem moved into tier A', d: 'New VP Reliability plus pricing-page visits. A warm path was found through a champion who moved.', on: "App.openRecord('juniper','overview')" });
    myBlockers().filter(b => b.k === 'neg').forEach(b => u.push({ k: 'neg', icon: 'alert', when: 'Now', t: b.t, d: b.d, on: b.go ? `App.goTo(${js(b.go)})` : '' }));
    u.push({ k: 'pos', icon: 'megaphone', when: 'Fri 23 Oct', t: 'Rival contract ending: first meeting booked', d: 'Ironwood Refining (Marco). 4 replies from 14 accounts so far.', on: "App.goCampaign('c2')" });
    u.push({ k: 'warn', icon: 'alert', when: 'Thu 22 Oct', t: 'Status watch took 1 account out of a campaign', d: 'Another rep opened an opportunity there. No double outreach.', on: "App.goCampaign('c3')" });
    return u;
  }

  /* ─── Routing: #today or a module; a result or a record opens in the canvas beside the chat ─── */
  const MODULES = Object.assign({ inbox: 'Inbox', accounts: 'Leads', segments: 'Segments', campaigns: 'Campaigns and NBA', approvals: 'Approvals', studio: 'Content studio' }, { analytics: 'Analytics' });
  const MOD_IC = { inbox: 'inbox', accounts: 'users', segments: 'layers', campaigns: 'megaphone', approvals: 'task', studio: 'pen', analytics: 'bars' };
  /* Five screens in the menu. Segments and Signals open as tabs in Accounts; next best actions and content as tabs in Campaigns; Analytics from Today. */
  const NAV5 = isMgr ? ['inbox', 'accounts', 'campaigns', 'studio', 'approvals', 'analytics'] : ['inbox', 'accounts', 'campaigns', 'studio', 'approvals', 'analytics'];
  const R2TAG = '';
  const navOn = v => v === 'segments' ? 'campaigns' : v;
  let accSub = 'list', campSub = 'list', sigTab = 'live';
  function modTabs() {
    const v = view(), G = {
      campaigns: [['campaigns', 'Campaigns and NBA', v === 'campaigns' && campSub !== 'plays'], ['segments', 'Micro-segments', v === 'segments'], ['plays', 'Plays', v === 'campaigns' && campSub === 'plays']]
    }[navOn(v)];
    return G && !segSel && !campSel && !outSel ? `<div class="dtabs mod-tabs">${G.map(([k, l, on]) => `<button class="${on ? 'on' : ''}" onclick="App.modTab('${k}')">${l}</button>`).join('')}</div>` : '';
  }
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
  function nav(r) { if (r && S.mchat) sessionize(r); outSel = null; if (r === 'accounts') accSub = 'list'; if (r === 'campaigns') campSub = 'list'; backs = []; keep = null; art = null; recId = null; thrId = null; ctx = null; expanded = !!r && r !== 'studio'; if (!r) S.cur = 'home'; if (r === 'campaigns') campSel = null; if (r === 'segments') segSel = null; if (r === 'studio') S.studio.doc = null; go(r); }
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
      <nav class="side-nav" aria-label="Modules">${NAV5.map(k => `<a class="side-item ${navOn(v) === k ? 'on' : ''}" href="#${k}" onclick="App.nav('${k}');return false" title="${MODULES[k]}">${ic(MOD_IC[k], 16)}<span class="lbl-t">${MODULES[k]}</span>${k === 'analytics' ? R2TAG : ''}${(k === 'approvals' ? n : k === 'inbox' ? threads().filter(needsReply).length : 0) ? `<span class="cnt">${k === 'approvals' ? n : threads().filter(needsReply).length}</span>` : ''}</a>`).join('')}</nav>
      <div class="side-sec">Recent chats${S.chats.some(c => c.attn) ? '<span class="side-attn">Needs you</span>' : ''}</div>
      <div class="side-recent">${S.chats.map(c => c.obj ? `<button class="obj ${!v && c.id === S.cur ? 'on' : ''} ${c.attn ? 'hot' : ''}" onclick="App.openChat('${c.id}')" title="${esc(c.title)}">${ic('flag', 13)}<span><b>${esc(c.title)}</b><em>${c.attn ? attnLine(c) : `${objDone(c).length} of ${c.obj.total}${c.reminder ? ' · reminder ' + esc(c.reminder) : ''}`}</em><u><s style="width:${Math.round(objDone(c).length / c.obj.total * 100)}%"></s></u></span>${c.attn ? '<i class="attn" title="Needs your attention">' + (c.obj.total - objDone(c).length) + '</i>' : `<i>${esc(c.when)}</i>`}</button>` : `<button class="${!v && c.id === S.cur ? 'on' : ''} ${c.attn ? 'obj hot' : ''}" onclick="App.openChat('${c.id}')" title="${esc(c.title)}">${ic('chat', 13)}${c.attn ? `<span><b>${esc(c.title)}</b><em>${esc(attnLine(c))}</em></span><i class="attn" title="Needs your attention">1</i>` : `<span>${esc(c.title)}</span><i>${esc(c.when)}</i>`}</button>`).join('')}</div>
      <div class="side-foot">
        <div class="side-user">${avatar(me, 30)}<div class="lbl-t"><div class="nm">${esc(me.name)}</div><div class="rl">${isLeader ? 'Sales leader · whole team' : isMgr ? 'Sales manager · 4 reps' : 'Sales rep'}</div></div></div>
        <div class="side-links lbl-t"><button onclick="App.switchUser('${isMgr ? 'sofia' : 'pavan'}')">Switch to ${isMgr ? 'Sofia (rep)' : 'Daniel (manager)'}</button><a href="index.html" onclick="App.signOut()">Sign out</a></div>
      </div>`;
  }

  /* ─── Chats: Today sessions, one chat per module, one per document ─── */
  const MOD_INTRO = {
    inbox: () => `Replies from email and LinkedIn in one place${isMgr ? ', for the whole team' : ''}. Each comes with a suggested answer; when someone replies, their remaining campaign steps pause.`,
    analytics: () => isMgr ? 'The dashboard is beside this chat, showing the past week for the team. Ask me a question and I answer here, then take you to the account or the rep behind the number.' : 'Your numbers are beside this chat: meetings, replies, what you sent and how your campaigns are doing. Only you and your manager see them. Ask me anything about them.',
    accounts: () => `This is every account ${isMgr ? 'on the team' : 'you own'}, ranked by Fit × Timing. Saved lists are the tabs above the table. Ask me to find more, score a list, or save what you're looking at.`,
    segments: () => 'Accounts grouped by why they\'re ready. Campaign segments (NBC) run as one sequence; the rest are next best actions (NBA). Open one, or ask me.',
    campaigns: () => `${CAMPAIGNS.filter(c => c.status === 'Running').length} campaigns running, ${CAMPAIGNS.filter(c => /Ready|Draft/.test(c.status)).length} waiting to start. Email and LinkedIn only. Ask me to build one, change a sequence, or explain the results.`,
    approvals: () => !isMgr ? 'Only what the AI cannot decide comes here: an action that failed one of the five criteria, a check that could not run, a held record, a reply it could not match. Each has a due time and a default. Ask me why any item is here.' : isLeader ? 'The backtest result and the go-live decision wait here, with the weekly summary. You can also see the team\'s escalations.' : isMgr ? 'Every campaign waits here for your confirmation before it starts. You can also see the team\'s escalations. Ask me why any item needs a person.' : 'Only the items that need you. Ask me why any item is here.',
  };
  const MOD_HINTS = {
    inbox: ['Any replies?', 'Which replies are objections?', 'Draft a reply to Dian with 3 times next week', 'What should I do with Greystone?'],
    analytics: isMgr ? ['Where are we stuck?', 'Which campaign is working best?', 'How is my team doing?', 'Which campaign is performing best?'] : ['What\'s my reply rate?', 'How many meetings did I book this week?', 'Which campaign is performing best?', 'How is the turnaround campaign performing?'],
    accounts: ['Build our ICP and find leads', 'Find prospects like my last 10 wins', 'Score this list', 'Who should I call first?'],
    segments: ['Which segments are campaigns?', 'Create micro-segments', 'What\'s close to becoming a campaign?', 'Why is Juniper ranked first?'],
    campaigns: ['How are the campaigns doing?', 'Build the campaign', 'Add a LinkedIn touch to the turnaround campaign', 'Any replies?'],
    approvals: ['What needs me?', 'What is ready to send?', 'Why is Cedar here?', 'Any blockers?'],
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
      : [{ who: 'me', text: "What's left for today?" }, { who: 'ai', kind: 'text', html: 'You sent two follow-ups with one click. <b>Cedar Petrochemicals</b> is still waiting on you; I will have it at the top of your catch-up in the morning.' }]; }
  function todayThread() { return [{ who: 'ai', kind: 'greet' }]; }
  const objName = t => { const k = /\bred\b/i.test(t) ? 'Red accounts' : /renewal|rival/i.test(t) ? 'Rival contracts' : /meeting/i.test(t) ? 'Meetings' : /campaign/i.test(t) ? 'Campaign' : 'Objective'; let n = k + ' · week of 26 Oct', i = 2; while (S.chats.some(c => c.title === n)) n = `${k} · week of 26 Oct (${i++})`; return n; };
  const OBJ_RE = /^(let'?s |help me |i want to |we need to )?(work|get|close|clear|reach|move|push)\b.*(accounts?|deals?|week|friday|list)|\b(objective|goal)\b/i;
  const lastKind = () => { const c = chat(); const t = c ? c.thread.filter(m => m.who === 'ai') : []; return t.length ? t[t.length - 1].kind : null; };
  const NEXT = { prospects: ['Score this list', 'Save as a list'], rankedList: ['Route to NBA and NBC', 'Save the scored list'], listSegments: ['Approve all ready', 'Send the campaign to Daniel'], nbaList: ['Build the campaign', 'How are the campaigns doing?'], flowCampaign: ['How are the campaigns doing?', 'What did we learn this week?'], campaigns: ['What did we learn this week?', 'Any replies?'] };
  function hints() {
    const v = view(), nx = NEXT[lastKind()] || [];
    if (recId) { const a = acct(recId); return ['Why is this here?', a.nba && !a.campaign ? 'Use the runner-up' : 'Why these messages?', 'Pull the last touchpoint', 'Make it shorter']; }
    if (!v && chat() && chat().obj) return ['What\'s left on this objective?', 'Remind me Friday at 9', 'Note: call Cedar before their rival contract ends', 'Which of these did I send with one click?'];
    if (v === 'studio') return ['Make it shorter', 'Add proof', 'More formal', 'Rewrite the intro', 'Add a section on lifecycle planning'];
    const base = v ? MOD_HINTS[v] : isMgr ? ['Let\'s get our red accounts to a next step this week', 'Where are we stuck?', 'Pull the emails we received today', 'How much do agents do on their own?', 'How is my team doing?']
      : ['What should I do first today?', 'Who replied since yesterday?', "Who hasn't replied but looked?", 'How are my campaigns doing?', "Prep me for today's meetings", "Follow up on this week's demos", 'How far am I from quota?', 'Make a deck on control system migration'];
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
        <div class="notes-add"><label class="sr" for="noteIn">Add a note</label><input id="noteIn" placeholder="Add a note, for example: call Cedar before their rival contract ends" onkeydown="if(event.key==='Enter'){event.preventDefault();App.addChatNote()}"><button class="btn sm pri" onclick="App.addChatNote()">Add note</button></div></div>` : ''}
      ${isHero(c) ? heroHtml(c, ph) : ''}<div class="thread" id="thread" ${isHero(c) ? 'hidden' : ''}><div class="thread-in">${c.thread.map((m, i) => (i === unreadAt(c) ? `<div class="unread-line" id="unreadLine"><span>New since you last looked${c.readAt ? ' · ' + esc(c.readAt) : ''}</span></div>` : '') + renderMsg(m).replace('<div class="msg', `<div data-i="${i}" class="msg`)).join('')}</div></div>
      <div class="composer-wrap" ${isHero(c) ? 'hidden' : ''}>
        ${qdHtml()}<div class="hints" ${qdModel() ? 'hidden' : ''}>${hints().slice(0, 3).map(h => `<button class="chip" onclick="App.ask(${js(h)})">${esc(h)}</button>`).join('')}</div>
        ${isHero(c) ? '' : composerBox({ id: 'composer', ph: qdModel() ? 'Or reply directly…' : actSel ? actSel.ph : ph, send: 'App.send()', actions: v === 'studio' ? null : recId ? personActs(acct(recId)) : mainActs(), scope: v !== 'studio' })}
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
    const ac = attnChats(), sugg = isMgr ? ['Where are we stuck?', 'How is my team doing?', 'How far are we from quota?', "Let's get our red accounts to a next step this week"] : ['What should I do first today?', 'Who replied since yesterday?', "Who hasn't replied but looked?", "Prep me for today's meetings", 'How far am I from quota?'];
    return `<div class="hero-v"><div class="hero-in">
      <span class="hero-ic">${ic('spark', 20)}</span>
      <h1>${greeting()}, ${esc(first(me.name))}</h1>
      <p>What do you want to work on? Ask anything, or drop in a contact list, a call transcript or a price sheet.</p>
      ${composerBox({ id: 'composer', ph: actSel ? actSel.ph : 'Ask anything, or pick something to start…', send: 'App.send()', actions: mainActs(), scope: true })}
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
  /* Start something new: picking an action that needs a prompt selects it in the pill; it runs when you send */
  let actSel = null;
  const ACT_SEL = { 'Find prospects: ': { label: 'Find prospects', ph: 'Describe who you want: industry, place, role or a signal' }, 'Build a campaign for ': { label: 'Build a campaign', ph: 'Describe the campaign: who it is for and what it should achieve' } };
  const actDD = (id, items) => `<div class="dd"><button class="cmp-pill ${actSel ? 'on' : ''}" onclick="App.dd(event,this)">${ic(actSel ? 'search' : 'spark', 12)}<span>${actSel ? esc(actSel.label) : 'Start something new'}</span>${actSel ? `<i class="cmp-x" role="button" aria-label="Clear the selected action" onclick="event.stopPropagation();App.actClear()">${ic('x', 11)}</i>` : ic('chev', 12)}</button><div class="dd-m"><div class="dd-h">Start something new</div>${items.map(([i, t, d, run]) => `<button class="dd-i" onclick="App.ddRun(event,${js(run)},'${id}')"><span class="dd-ic">${ic(i, 15)}</span><span><b>${esc(t)}</b><em>${esc(d)}</em></span></button>`).join('')}</div></div>`;
  function scopeDD() {
    const c = chat(), lbl = ctx ? acct(ctx).name : c && c.obj ? c.obj.total + ' accounts in this objective' : isMgr ? 'Team portfolio' : 'My accounts';
    const accs = ACCOUNTS.filter(mine).filter(a => a.score > 0).sort((p, q) => q.score - p.score).slice(0, 7);
    return `<div class="dd"><button class="cmp-pill ${ctx ? 'on' : ''}" onclick="App.dd(event,this)">${ic('users', 12)}<span>${esc(lbl)}</span>${ic('chev', 12)}</button><div class="dd-m"><div class="dd-h">What the AI looks at</div>
      <button class="dd-i" onclick="App.ddScope(event,null)"><span class="dd-ic">${ic('users', 15)}</span><span><b>${c && c.obj ? 'This objective' : isMgr ? 'Team portfolio' : 'My accounts'}</b><em>${c && c.obj ? c.obj.total + ' accounts' : 'Everything you can see'}</em></span></button>
      ${accs.map(a => `<button class="dd-i" onclick="App.ddScope(event,'${a.id}')">${pAvatar(a, 24)}<span><b>${esc(a.name)}</b><em>${esc(a.contact.name)} · ${esc(first(USERS[a.owner].name))}</em></span></button>`).join('')}</div></div>`;
  }
  const mainActs = () => [
    ['search', 'Find prospects', 'Describe who you want, then send · lands in Leads', '>Find prospects: '],
    ['users', 'Lookalikes of my wins', 'Accounts like your last 10 wins, from signals, CRM and news', 'Find prospects like my last 10 wins'],
    ['bars', 'Score a list', 'Fit and timing for every account · opens in Accounts', 'Score this list'],
    ['layers', 'Build micro-segments', 'Groups accounts by trigger and motivation · opens in Segments', 'Create micro-segments'],
    ['bolt', 'Prepare next best actions', 'One checked action per account · waits in Approvals if it needs you', 'Prepare the next actions'],
    ['megaphone', 'Build a campaign', 'Describe it, then send · opens in Campaigns', '>Build a campaign for '],
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
  /* Questions before the AI routes a list and drafts the campaign and the next actions */
  const RQ_OBJ = ['Book meetings', 'Win the switch at contract end', 'Re-open stalled deals', 'Event or webinar sign-ups'];
  const RQ_STOP = ['Stop on any reply', 'Stop when a meeting is booked', 'Stop if an open deal appears', 'Stop on an out-of-office'];
  function rqDefaults(mode) { QSTEP.rq = 0; qdActive = 'rq'; return { mode, done: false, a: { obj: '', ch: ['Email', 'LinkedIn'], seq: '5 touches over 3 weeks', when: 'Next send window', stop: ['Stop on any reply', 'Stop if an open deal appears'], cs: '', note: '', ctN: '', ctA: '' } }; }
  function rqCampSeg() { const accs = listAccounts(), cid = (accs.find(a => a.campaign) || {}).campaign, c = cid ? campOf(cid) : null; return c && segOf(c.seg) ? segOf(c.seg).name : ''; }
  function rqRecs(a) { return { n: recContent('NBC', { obj: a.obj, seg: rqCampSeg(), ch: a.ch, cs: a.cs }), b: recContent('NBA', { obj: a.obj, ch: a.ch[0] || 'Email', cs: a.cs }) }; }
  const assetLink = x => x ? `<a href="#" class="as-open" onclick="App.openAsset('${x.id}');return false" title="Open it in Content studio">${esc(x.t)}</a>` : '';
  function routeQHtml() {
    const q = S.routeQ; if (!q) return '<p>Closed. Say "Route to NBA and NBC" to start again.</p>';
    if (!q.done) return `<p>Before I ${q.mode === 'route' ? 'route the list and draft the campaign and the next actions' : 'prepare the next actions'}, a few questions, just below. ${q.mode === 'route' ? 'Accounts that share a trigger (10 or more in 7 days) go to one campaign; the rest get their own next best action.' : ''}</p>`;
    const a = q.a, R = rqRecs(a), nbcOn = q.mode === 'route', ctN = a.ctN || R.n.best.id, ctA = a.ctA || R.b.best.id, all = libAll(), byId = id => all.find(x => x.id === id);
    if (q.done) return `<p>Answered: <b>${esc(a.obj || 'Book meetings')}</b> · ${esc(a.ch.join(' + '))}${nbcOn ? ' · ' + esc(a.seq) : ''} · ${esc(a.stop.join(', ').toLowerCase() || 'no stop rules')}. Content: ${nbcOn ? `${assetLink(byId(ctN))} for the campaign, ` : ''}${assetLink(byId(ctA))} for the next actions.</p>`;
    const chip = (k, v, multi) => { const on = multi ? a[k].includes(v) : a[k] === v; return `<button class="chip ${on ? 'on' : ''}" aria-pressed="${on}" onclick="App.rqAns('${k}',${js(v)},${multi ? 1 : 0})">${esc(v)}</button>`; };
    const Qd = (n, l, body, hint, k, mu) => `<div class="oq-q" data-k="${k || ''}" data-multi="${mu ? 1 : 0}"><div class="oq-l"><span>${n}</span>${l}${hint ? ` <i>${hint}</i>` : ''}</div>${body}</div>`;
    const rec = (k, r, cur, who) => { const best = r.best, curA = byId(cur) || best; return `<div class="oq-rec"><div class="oq-rec-h">${libThumb({ type: curA.type })}<div class="oq-rec-t"><span class="badge b-brand nodot">${ic('spark', 11)} ${curA.id === best.id ? 'Recommended' : 'Your pick'} · ${who}</span><b>${assetLink(curA)}</b><span>${esc(curA.id === best.id ? r.why : 'Chosen by you instead of the recommendation (' + best.t + ')')}</span></div></div><div class="oq-o"><span class="sm muted">Or use</span>${[best].concat(r.alts).filter(x => x.id !== curA.id).map(x => `<button class="chip" onclick="App.rqAns('${k}',${js(x.id)},0)">${esc(x.t)} · ${esc(x.type)}</button>`).join('')}</div></div>`; };
    let n = 0;
    return `<div class="oq card rq"><div class="oq-h"><span class="ai-mark">${ic('spark', 13)}</span><div><b>Before I ${nbcOn ? 'route the list and draft the campaign and the next actions' : 'prepare the next actions'}, a few questions</b><div class="sm muted">${nbcOn ? 'Accounts that share a trigger (10 or more in 7 days) go to one campaign; the rest get their own next best action. ' : ''}The AI decides the rest: the message from each person's signal and profile, who to reach in each account, sending in the next window, and stopping on any reply or open deal.</div></div></div>
      ${Qd(++n, 'What is the objective?', `<div class="oq-o">${withCustom(RQ_OBJ, a.obj).map(v => chip('obj', v)).join('')}</div>`, '', 'obj')}
      ${Qd(++n, 'Which channels?', `<div class="oq-o">${withCustom(['Email', 'LinkedIn', 'Phone'], a.ch).map(v => chip('ch', v, 1)).join('')}</div>`, 'pick any', 'ch', 1)}
      ${nbcOn ? Qd(++n, 'How many steps in the campaign, and when?', `<div class="oq-plans">${['3 touches over 10 days', '5 touches over 3 weeks', '7 touches over 6 weeks'].map(o => { const on = a.seq === o, st = outSteps({ kind: 'NBC', seq: o, ch: a.ch.length ? a.ch : ['Email'], ct: '' }); return `<button class="oq-plan ${on ? 'on' : ''}" onclick="App.rqAns('seq',${js(o)},0)"><b>${esc(o)}</b>${st.map(s => `<span>${chIc(s.ch)} Day ${s.day} · ${esc(s.step)}</span>`).join('')}</button>`; }).join('')}</div>`, '', 'seq') : ''}
      ${Qd(++n, 'Content: what the AI recommends, and why', `${a.note ? `<div class="oq-o"><button class="chip on" aria-pressed="true">Your note: ${esc(a.note)}</button></div>` : ''}${nbcOn ? rec('ctN', R.n, ctN, 'campaign') : ''}${rec('ctA', R.b, ctA, 'next actions')}`, 'click a title to open it in Content studio', 'ct')}
      <div class="oq-f"><span class="sm muted">${a.obj ? 'Ready' : 'Pick the objective to go on'}</span><button class="btn sm pri" ${a.obj ? '' : 'disabled'} onclick="App.rqGo()">${ic('spark', 13)} ${nbcOn ? 'Route and draft' : 'Prepare the next actions'}</button></div></div>`;
  }
  function stepAsset(c, tc) {
    const ty = /carousel/i.test(tc.fmt) ? 'Carousel' : /one-pager|pdf|comparison|case study|document/i.test(tc.fmt) ? 'PDF one-pager' : /whitepaper/i.test(tc.fmt) ? 'Whitepaper' : /infographic|image/i.test(tc.fmt) ? 'Infographic' : null;
    if (!ty) return null; const seg = c.seg && segOf(c.seg) ? segOf(c.seg).name : '', L = libAll().filter(x => x.st === 'Completed');
    return L.find(x => x.type === ty && x.seg === seg) || L.find(x => x.type === ty) || L.find(x => x.seg === seg) || null;
  }
  /* Questions one at a time, like Claude: a numbered row of questions, one question with its options, Back · Skip · Next, then a review */
  const QSTEP = {};
  let qAdvance = null;
  const qKey = card => card.classList.contains('rq') ? 'rq' : card.classList.contains('icq') ? 'icq' : 'oq';
  function qAnswer(q) {
    const on = [...q.querySelectorAll('.chip.on')].map(x => x.textContent.trim()), plan = q.querySelector('.oq-plan.on b'), rec = q.querySelector('.oq-rec-t b'), inp = q.querySelector('input');
    return on.length ? on.join(', ') : plan ? plan.textContent : rec ? rec.textContent : inp && inp.value.trim() ? inp.value.trim() : '';
  }
  function applySteppers() {
    document.querySelectorAll('.oq').forEach(card => {
      if (card.dataset.applied) return; card.dataset.applied = '1'; card.classList.add('qs');
      const key = qKey(card), qs = [...card.querySelectorAll(':scope > .oq-q')], n = qs.length, foot = card.querySelector(':scope > .oq-f'), msg = card.querySelector(':scope > .oq-msg');
      if (!n) return;
      if (qAdvance === key) { qAdvance = null; QSTEP[key] = Math.min(n, (QSTEP[key] || 0) + 1); }
      const i = Math.min(QSTEP[key] || 0, n); QSTEP[key] = i;
      const lbl = q => { const l = q.querySelector('.oq-l'); return l ? [...l.childNodes].filter(x => x.nodeType === 3 || (x.tagName && !/^(SPAN|I)$/.test(x.tagName))).map(x => x.textContent).join('').trim() : ''; };
      qs.forEach((q, k) => { q.hidden = k !== i; });
      if (foot) foot.hidden = i < n; if (msg) msg.hidden = i < n;
      const tabs = `<div class="qs-tabs" role="tablist">${qs.map((q, k) => `<button role="tab" class="qs-tab ${k === i ? 'on' : ''} ${qAnswer(q) ? 'done' : ''}" onclick="App.qGo('${key}',${k})" title="${esc(lbl(q))}"><span>${qAnswer(q) && k !== i ? '✓' : k + 1}</span>${esc(lbl(q))}</button>`).join('')}<button role="tab" class="qs-tab ${i === n ? 'on' : ''}" onclick="App.qGo('${key}',${n})"><span>✓</span>Review</button></div>`;
      card.querySelector(':scope > .oq-h').insertAdjacentHTML('afterend', tabs);
      if (i < n) {
        const q = qs[i], last = i === n - 1, qk = q.dataset.k, mu = q.dataset.multi === '1';
        q.insertAdjacentHTML('afterbegin', `<div class="qs-of">Question ${i + 1} of ${n}</div>`);
        if (qk) q.insertAdjacentHTML('beforeend', `<div class="qs-other"><span>✎</span><input aria-label="Other: type your own answer" placeholder="Other: type your own answer${mu ? ' (add as many as you like)' : ''}, then press Enter" onkeydown="if(event.key==='Enter'){event.preventDefault();event.stopPropagation();App.qOther('${key}','${qk}',this.value,${mu ? 1 : 0})}"><button class="btn sm ghost" onclick="App.qOther('${key}','${qk}',this.previousElementSibling.value,${mu ? 1 : 0})">Add</button></div>`);
        q.insertAdjacentHTML('afterend', `<div class="qs-nav"><button class="btn sm ghost" ${i ? '' : 'disabled'} onclick="App.qGo('${key}',${i - 1})">Back</button><span class="qs-k">${q.querySelector('.oq-o .chip') ? 'Press a number to choose · Enter for next' : 'Enter for next'}</span><button class="btn sm ghost" onclick="App.qGo('${key}',${i + 1})">Skip</button><button class="btn sm pri" onclick="App.qGo('${key}',${i + 1})">${last ? 'Review' : 'Next'}</button></div>`);
      } else {
        const rows = qs.map((q, k) => `<button class="qs-rv" onclick="App.qGo('${key}',${k})"><span>${esc(lbl(q))}</span><b class="${qAnswer(q) ? '' : 'qs-none'}">${esc(qAnswer(q) || (/Anything else/.test(lbl(q)) ? 'Nothing added' : 'Not answered'))}</b><i>Change</i></button>`).join('');
        (msg || foot).insertAdjacentHTML('beforebegin', `<div class="qs-review"><div class="qs-of">Review your answers</div>${rows}</div>`);
      }
    });
  }
  new MutationObserver(() => { if (document.querySelector('.oq:not([data-applied])')) applySteppers(); }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', e => {
    const c = e.target.closest('.oq.qs .oq-q .chip, .oq.qs .oq-q .oq-plan'); if (!c) return;
    const card = c.closest('.oq'), oc = c.getAttribute('onclick') || '';
    if (/,\s*1\)\s*$/.test(oc) || c.classList.contains('on')) return;
    qAdvance = qKey(card);
  }, true);
  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select')) { if (e.key === 'Enter' && e.target.closest('.oq.qs .oq-q input')) { e.preventDefault(); const card = e.target.closest('.oq'); App.qGo(qKey(card), (QSTEP[qKey(card)] || 0) + 1); } return; }
    const card = [...document.querySelectorAll('.oq.qs')].pop(); if (!card) return;
    const q = card.querySelector(':scope > .oq-q:not([hidden])'), key = qKey(card);
    if (q && /^[1-9]$/.test(e.key)) { const opts = q.querySelectorAll('.oq-o .chip, .oq-plan'), o = opts[+e.key - 1]; if (o) { e.preventDefault(); o.click(); } }
    else if (q && e.key === 'Enter') { e.preventDefault(); App.qGo(key, (QSTEP[key] || 0) + 1); }
  });
  /* ─── Questions, docked above the message box like Claude: question, ‹ 1 of 3 ›, ×, numbered rows, Something else, Skip ─── */
  let qdActive = null, campPick = null;
  const qdFresh = {};
  const qo = (v, label, sub, open) => ({ v, label: label || v, sub: sub || '', open: open || '' });
  const planSub = (o, ch) => outSteps({ kind: 'NBC', seq: o, ch: ch && ch.length ? ch : ['Email'], ct: '' }).map(s => `Day ${s.day} ${s.ch}`).join(' · ');
  function oqModel() {
    const a = outQ.a, kind = outQ.kind, Q = OQ[kind]();
    const qs = Q.map(([k, l, opts, multi]) => {
      let O;
      if (k === 'seq') O = opts.map(o => qo(o, o, planSub(o, a.ch)));
      else if (k === 'ct') { const r = recContent(kind, a); O = [qo(r.best.t, r.best.t, 'Recommended · ' + r.why, r.best.id)].concat(r.alts.map(x => qo(x.t, x.t, `${x.type} · ${x.metric && x.metric !== '–' ? x.metric : 'approved'}`, x.id))); }
      else O = opts.map(o => qo(o));
      const cur = a[k]; (Array.isArray(cur) ? cur : cur ? [cur] : []).forEach(v => { if (!O.some(o => o.v === v)) O.push(qo(v, v, 'Your answer')); });
      return { k, l: k === 'ct' ? 'Which content goes with it? The AI recommends one' : l, multi: !!multi, opts: O, empty: k === 'sig' && !opts.length ? 'Pick the person first; their strongest signals show here.' : '' };
    });
    const need = kind === 'NBC' ? !!(a.obj && (a.seg || []).length && (a.ch || []).length) : !!(a.obj && a.who);
    return { key: 'oq', title: kind === 'NBC' ? 'Campaign' : 'Next best action', qs, get: k => a[k], set: (k, v, m) => App.outAns(k, v, m), build: 'App.outBuild()', buildLabel: kind === 'NBC' ? 'Build the campaign' : 'Build the action', need, needTxt: kind === 'NBC' ? 'Pick the objective, at least one cohort and a channel' : 'Pick the objective and the person', note: `The AI decides the rest: the message from each person's signal and profile${kind === 'NBC' ? ', who to reach in each account' : ''}, sending in the next window, and stopping on any reply or open deal.` };
  }
  function rqModel() {
    const q = S.routeQ, a = q.a, R = rqRecs(a), nbcOn = q.mode === 'route';
    const alts = [...new Map(R.n.alts.concat(R.b.alts).map(x => [x.id, x])).values()].filter(x => x.id !== R.b.best.id).slice(0, 3);
    const qs = [{ k: 'obj', l: 'What is the objective?', opts: withCustom(RQ_OBJ, a.obj).map(o => qo(o)) }, { k: 'ch', l: 'Which channels?', multi: true, opts: withCustom(['Email', 'LinkedIn', 'Phone'], a.ch).map(o => qo(o)) }]
      .concat(nbcOn ? [{ k: 'seq', l: 'How many steps in the campaign, and when?', opts: ['3 touches over 10 days', '5 touches over 3 weeks', '7 touches over 6 weeks'].map(o => qo(o, o, planSub(o, a.ch))) }] : [])
      .concat([{ k: 'ctPick', l: 'Which content goes with it? The AI recommends', opts: [qo('rec', "The AI's picks", `${nbcOn ? R.n.best.t + ' for the campaign · ' : ''}${R.b.best.t} for the next actions. ${R.b.why}`, R.b.best.id)].concat(alts.map(x => qo(x.id, x.t, `Use it for everything · ${x.type} · ${x.metric && x.metric !== '–' ? x.metric : 'approved'}`, x.id)), a.note ? [qo(a.note, a.note, 'Your answer')] : []) }]);
    return { key: 'rq', title: nbcOn ? 'Route and draft' : 'Next best actions', qs, get: k => a[k], set: (k, v, m) => { if (k === 'ctPick') { a.ctPick = v; if (v === 'rec') { a.ctN = ''; a.ctA = ''; } else if (libAll().some(x => x.id === v)) { a.ctN = v; a.ctA = v; } else a.note = v; save(); renderAll(); } else App.rqAns(k, v, m); }, build: 'App.rqGo()', buildLabel: nbcOn ? 'Route and draft' : 'Prepare the next actions', need: !!a.obj, needTxt: 'Pick the objective', note: `The AI decides the rest: the message from each person's signal and profile, who to reach in each account, sending in the next window, and stopping on any reply or open deal.` };
  }
  function icqModel() {
    const q = icpQ, a = q.a, L = [['sell', 'What do you sell, and what problem does it solve?'], ['ind', 'Which industries?', 1], ['geo', 'Where?', 1], ['roles', 'Who buys, and who signs?', 1], ['sig', 'Which signals mean they are ready now?', 1]];
    return { key: 'icq', title: q.path === 'B' ? `ICP drafted from ${q.url}` : 'Prospecting · ICP', qs: L.map(([k, l, m]) => ({ k, l, multi: !!m, opts: withCustom(ICQ[k], a[k]).map(o => qo(o)) })), get: k => a[k], set: (k, v, m) => App.icpAns(k, v, m), build: 'App.icpBuild()', buildLabel: 'Save the ICP and find leads', need: !!(a.ind.length && a.geo.length && a.roles.length), needTxt: 'Pick industries, where, and who buys', note: 'Existing customers, accounts with an open deal and competitors are always left out.' };
  }
  function pickModel() {
    const opts = CAMPAIGNS.filter(c => c.status !== 'Completed').map(c => qo(c.id, c.name, `${campStatus(c)} · ${campStats(c).total} accounts · they join as a new cohort`)).concat([qo('new', 'A new campaign from these accounts', "Drafted with the AI's defaults; change anything after")]);
    return { key: 'pick', title: 'Add to campaign', single: true, qs: [{ k: 'camp', l: `Add these ${campPick.n} accounts to which campaign?`, opts }], get: () => '', set: (k, v) => App.pickCampaign(v) };
  }
  function qdModel() {
    if (qdActive === 'pick' && campPick) return pickModel();
    if (qdActive === 'rq' && S.routeQ && !S.routeQ.done) return rqModel();
    if (qdActive === 'oq' && outQ) return oqModel();
    if (qdActive === 'icq' && icpQ) return icqModel();
    return null;
  }
  const qdAns = (M, q) => { const c = M.get(q.k); return Array.isArray(c) ? c.length > 0 : !!c; };
  const qdAnsText = (M, q) => { const c = M.get(q.k), L = Array.isArray(c) ? c : c ? [c] : []; return L.map(v => (q.opts.find(o => o.v === v) || { label: v }).label).join(', '); };
  function qdHtml() {
    const M = qdModel(); if (!M) return '';
    const n = M.qs.length;
    if (qdFresh[M.key]) { qdFresh[M.key] = false; const f = M.qs.findIndex(q => !qdAns(M, q)); QSTEP[M.key] = f < 0 ? n : f; }
    const i = M.single ? 0 : Math.min(QSTEP[M.key] || 0, n);
    const nav = M.single ? '' : `<span class="qd-nav"><button ${i ? '' : 'disabled'} aria-label="Previous question" onclick="App.qdGo(${i - 1})">${ic('left', 14)}</button><span>${Math.min(i + 1, n)} of ${n}</span><button ${i >= n ? 'disabled' : ''} aria-label="Next question" onclick="App.qdGo(${i + 1})">${ic('right', 14)}</button></span>`;
    const head = tx => `<div class="qd-h"><b>${tx}</b>${nav}<button class="qd-x" title="Close" aria-label="Close the questions" onclick="App.qdClose()">${ic('x', 15)}</button></div>`;
    if (i >= n) return `<div class="qd qd-rv" role="dialog" aria-label="${esc(M.title)}: check your answers"><div class="qd-k">${esc(M.title)}</div>${head('Check your answers')}<div class="qd-o">${M.qs.map((q, k) => `<button class="qd-r" onclick="App.qdGo(${k})"><span class="qd-n">${qdAns(M, q) ? ic('check', 13) : k + 1}</span><span class="qd-t"><i>${esc(q.l)}</i><b class="${qdAns(M, q) ? '' : 'qd-none'}">${esc(qdAnsText(M, q) || 'Not answered')}</b></span><span class="qd-ch">Change</span></button>`).join('')}</div>${M.note ? `<div class="qd-note">${ic('spark', 12)} ${esc(M.note)}</div>` : ''}<div class="qd-f"><span>${M.need ? '' : esc(M.needTxt)}</span><button class="btn sm ghost" onclick="App.qdClose()">Cancel</button><button class="btn sm pri" ${M.need ? '' : 'disabled'} onclick="${M.build}">${ic('spark', 13)} ${esc(M.buildLabel)}</button></div></div>`;
    const q = M.qs[i], cur = M.get(q.k), on = v => Array.isArray(cur) ? cur.includes(v) : cur === v, answered = qdAns(M, q);
    return `<div class="qd" role="dialog" aria-label="${esc(M.title)} questions"><div class="qd-k">${esc(M.title)}${q.multi ? ' · pick any, then Next' : ''}</div>${head(esc(q.l))}
      ${q.empty && !q.opts.length ? `<div class="qd-e">${esc(q.empty)}</div>` : ''}
      <div class="qd-o">${q.opts.map((o, j) => `<button class="qd-r ${on(o.v) ? 'on' : ''}" aria-pressed="${on(o.v)}" onclick="App.qdPick(${j})"><span class="qd-n">${on(o.v) ? ic('check', 13) : j + 1}</span><span class="qd-t"><b>${esc(o.label)}</b>${o.sub ? `<i>${esc(o.sub)}</i>` : ''}</span>${o.open ? `<a class="qd-open" href="#" onclick="event.stopPropagation();App.openAsset('${o.open}');return false">Open</a>` : ''}</button>`).join('')}
        <div class="qd-r qd-other"><span class="qd-n">${ic('pen', 13)}</span><label class="sr" for="qdOther">Something else</label><input id="qdOther" placeholder="${q.multi ? 'Add something else' : 'Something else'}" onkeydown="if(event.key==='Enter'){event.preventDefault();event.stopPropagation();App.qdOther(this.value)}"><button class="qd-skip" onclick="${M.single ? 'App.qdClose()' : `App.qdGo(${i + 1})`}">${M.single ? 'Cancel' : q.multi && answered ? 'Next' : 'Skip'}</button></div></div></div>`;
  }
  document.addEventListener('keydown', e => {
    const M = qdModel(); if (!M) return; const tg = e.target || {}, inC = tg.id === 'composer';
    if (tg.id === 'qdOther') return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName || '') && !(inC && !tg.value)) return;
    const i = M.single ? 0 : Math.min(QSTEP[M.key] || 0, M.qs.length);
    if (/^[1-9]$/.test(e.key) && i < M.qs.length && M.qs[i].opts[+e.key - 1]) { e.preventDefault(); App.qdPick(+e.key - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); App.qdClose(); }
  });
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
        <button class="btn sm" onclick="App.addToCampaign()">${ic('plane', 13)} Add to campaign</button><button class="ic-btn" title="Open beside the chat" onclick="App.openArt('${key}')">${ic('expand', 15)}</button></div>
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
      return `${stepsHtml(isMgr ? ['Overnight sweep 06:00 · 61 new signals across the team, 24 qualified', 'Re-scored 81 accounts and re-built 9 micro-segments', `${prep} next actions prepared · ${auto} ready to send with one click`] : ['Overnight sweep 06:00 · 23 new signals on your accounts, 9 qualified', 'Re-scored your accounts · Juniper Petrochem moved into tier A', `Prepared your next actions · ${auto} ready to send with one click`])}
        <p>${isMgr ? `Here's the team's day. <b>${today.length}</b> action${today.length === 1 ? ' needs' : 's need'} you today, <b>${hot.length}</b> prospects said yes, and <b>one new campaign</b> is ready for you to confirm.` : `Here's your day. <b>${today.length}</b> action${today.length === 1 ? '' : 's'} to decide today and <b>${hot.length}</b> prospect${hot.length === 1 ? '' : 's'} to answer. Everything else is ready to send with one click.`}</p>
        ${hot.length ? `<div class="ccard" style="border-color:#F1D3D3"><div class="ccard-h"><span class="t" style="color:var(--neg)">${ic('flame', 14)} Answer first · they said yes</span><span class="muted" style="font-size:11px">fast lane</span></div><div class="ccard-b" style="padding:2px 14px">${hot.map(r => `<div class="mini-row"><div class="grow row-link" onclick="App.openThread('${r.id}')"><div class="nm">${esc(r.from)} · ${esc(acct(r.acc).name)}${isMgr ? ` <span class="muted" style="font-weight:400">· ${esc(first(USERS[r.owner].name))}</span>` : ''}</div><div class="sm">"${esc(r.text)}"</div></div><span class="due ${r.at.startsWith('Today') ? 'hot' : 'soon'}" style="font-size:11px">${esc(r.at)}</span><button class="btn sm pri" onclick="App.openThread('${r.id}')">${isMgr ? 'Open' : 'Reply'}</button></div>`).join('')}</div></div>` : ''}
        <div class="ccard"><div class="ccard-h"><span class="t">${ic('bolt', 14)} Next best actions that need you today</span><span class="badge b-sec nodot">${today.length}</span></div>
          <div class="ccard-b" style="padding:0">${today.length ? `<div class="tbl-wrap"><table class="tbl nba-tbl"><thead><tr><th>Account · contact</th><th>Action</th><th>Why it needs you</th><th></th></tr></thead><tbody>${today.map(a => { const d = S.decisions[a.id]; return `<tr><td class="row-link" onclick="App.openRecord('${a.id}','engage')"><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.contact.name)}${isMgr ? ' · ' + esc(first(USERS[a.owner].name)) : ''}</div></td><td>${esc(a.nba.action)}<div class="sm">${a.nba.channel} · ${esc(a.segment)}</div></td><td><span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span></td><td style="white-space:nowrap">${d ? `<span class="badge b-grey nodot">${decLabel(d)}</span>` : a.nba.status === 'sent' ? '<span class="badge b-sec">Sent</span>' : a.nba.status === 'auto' ? `<button class="btn sm pri" onclick="event.stopPropagation();App.send1('${a.id}')">Send</button>` : `${!a.nba.reason || (isMgr && a.nba.sensitive) ? `<button class="btn sm pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : 'Approve'}</button> ` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','engage')">Review</button>`}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Nothing to decide today.</div>'}</div>
          <div class="ccard-f"><span class="muted" style="font-size:11.5px">${auto} ready to send with one click${later ? ` · ${later} more due later this week` : ''}</span><div style="flex:1"></div>${today.some(a => !a.nba.reason && !S.decisions[a.id]) && !isMgr ? '<button class="btn sm pri" onclick="App.approveAll()">Approve all ready</button>' : ''}${openBtn('Approvals', "App.openMod('approvals')")}</div></div>
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
    routeQ: () => routeQHtml(),
    listSegments: () => {
      const accs = listAccounts(), cid = (accs.find(a => a.campaign) || {}).campaign, c = cid ? campOf(cid) : null, nbc = accs.filter(a => a.campaign), nba = accs.filter(a => a.nba && !a.campaign), watch = accs.filter(a => !a.nba && !a.campaign), trig = c && segOf(c.seg) ? segOf(c.seg).trigger.toLowerCase() : '';
      const ra = S.routeA, rr = ra ? rqRecs(ra) : null, byId = id => libAll().find(x => x.id === id), cN = ra ? byId(ra.ctN || rr.n.best.id) : null, cA = ra ? byId(ra.ctA || rr.b.best.id) : null;
      const ansHtml = ra ? `<div class="rq-ans"><span><b>Objective</b> ${esc(ra.obj)}</span><span><b>Channels</b> ${esc(ra.ch.join(' + '))}</span><span><b>Campaign</b> ${esc(ra.seq)}</span><span><b>Next actions</b> ${esc(ra.when.toLowerCase())}</span><span><b>Stops</b> ${esc(ra.stop.join(', ').toLowerCase() || 'never')}</span></div>` : '';
      return `${ansHtml}<p>Grouped the scored list by each account's strongest trigger, then routed it. ${c ? `<b>${nbc.length} accounts share the same trigger (${esc(trig)})</b>, which crosses the threshold (10 in 7 days), so they go to <b>one campaign (NBC)</b>. ` : 'No trigger reached the campaign threshold (10 in 7 days). '}<b>${nba.length}</b> get their own <b>next best action (NBA)</b>${watch.length ? `; ${watch.length} with no live signal stay${watch.length === 1 ? 's' : ''} watched` : ''}.</p>
        <div class="route">
          ${c ? `<div class="route-col"><div class="route-h"><span class="badge b-brand">NBC · one campaign</span><b>${nbc.length} accounts</b></div>
            <div class="nm">${esc(c.name)}</div><div class="touch-mini">${seqOf(c).map(t => `<span>${chIc(t.ch)} <b>Day ${t.day}</b> ${esc(t.fmt)}</span>`).join('')}</div>
            <div class="sm">${nbc.slice(0, 4).map(a => esc(a.name)).join(', ')}${nbc.length > 4 ? ` and ${nbc.length - 4} more` : ''}</div>
            <div class="sm" style="margin-top:4px">Owners: ${[...new Set(nbc.map(a => first(USERS[a.owner].name)))].join(', ')}</div>${cN ? `<div class="rq-ct">${ic('doc', 13)} Content: ${assetLink(cN)} <span class="muted">· ${esc(cN.type)}</span></div>` : ''}
            <div class="next-row">${openBtn('Open campaign', `App.goCampaign('${c.id}')`)}${assignAll(nbc.map(a => a.id), 'the campaign')}${isMgr ? `<button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm</button>` : S.camp[c.id] ? `<span class="badge b-ter">${esc(S.camp[c.id])}</span>` : `<button class="btn sm pri" onclick="App.sendForConfirm('${c.id}')">Send to Daniel</button>`}</div></div>` : ''}
          <div class="route-col"><div class="route-h"><span class="badge b-sec">NBA · one at a time</span><b>${nba.length} accounts</b></div>${cA ? `<div class="rq-ct">${ic('doc', 13)} Content: ${assetLink(cA)} <span class="muted">· ${esc(cA.type)} · each action can swap it for one that fits its signal</span></div>` : ''}
            ${nba.map(a => { const fails = gate(a).filter(x => !x[1]); return `<div class="mini-row row-link nba-d" onclick="App.openRecord('${a.id}','engage')">${chIc(a.nba.channel)}<div class="grow"><div class="nm">${esc(a.name)} <span class="muted" style="font-weight:400">· ${esc(a.contact.name)}, ${esc(a.contact.title)}</span></div><div class="sm">${esc(a.nba.action)} · ${esc(a.nba.channel)} · due ${esc(a.nba.due || 'today')}</div><div class="sm">${fails.length ? `Waiting: didn't pass ${esc(fails.map(x => x[0].toLowerCase()).join(', '))}` : 'Meets all five criteria: ready to send'}</div></div><div class="nba-r">${stepBadge(a)}${ownerPick(a)}</div></div>`; }).join('')}
            <div class="next-row">${btn('Send them', 'Send them', true)}${assignAll(nba.map(a => a.id), 'the next actions')}${openBtn('Open next best actions', 'App.openListNBAs()')}</div></div>
        </div>${tableCard('segmented')}`;
    },
    nbaList: () => {
      const accs = listAccounts().filter(a => a.nba);
      return `<p>Next best actions for the ${accs.length} list accounts that aren't in the campaign. Each has a contact, a channel and a draft; the ones that meet all five criteria are ready to send with one click.</p>
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
    replies: () => { const rp = myReplies(); return rp.length ? `<p>${rp.length} repl${rp.length === 1 ? 'y' : 'ies'}, newest first:</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${rp.map(r => `<div class="mini-row row-link" onclick="App.openThread('${r.id}')"><span class="badge ${S6[st6(r)][0]}">${st6(r)}</span><div class="grow"><div class="nm">${esc(r.from)} · ${esc(acct(r.acc).name)}</div><div class="sm">"${esc(r.text)}"</div></div></div>`).join('')}</div></div>` : '<p>No new replies.</p>'; },
    blockers: () => { const b = myBlockers(); return b.length ? `<p>What's in the way right now:</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${b.map(x => `<div class="mini-row"><span class="badge b-${x.k === 'neg' ? 'neg' : 'warn'} nodot">!</span><div class="grow"><div class="nm">${esc(x.t)}</div><div class="sm" style="white-space:normal">${esc(x.d)}</div></div></div>`).join('')}</div></div>` : '<p>Nothing is blocked.</p>'; },
    nba: m => nbaCard(acct(m.id), m.note),
    learned: () => `<p>What the system learned from this month's outcomes (misses count too):</p>
      <div class="ccard"><div class="ccard-b" style="padding:2px 14px">${LEARNED.map(l => `<div class="mini-row"><span class="badge b-${l.k} nodot">${l.k === 'pos' ? '↑' : l.k === 'neg' ? '↓' : l.k === 'warn' ? '!' : 'i'}</span><div class="grow"><div class="nm">${esc(l.t)}</div><div class="sm" style="white-space:normal">${esc(l.d)}</div></div></div>`).join('')}</div></div>`,
    team: () => `<p>Your team this week: <b>7 meetings booked</b> against a target of 15; reps accepted <b>77%</b> of recommendations first time. <b>Kenji</b> is behind: 3 overdue, no meetings. I suggest moving Banyan Gas and Coral Bay Refining to Aisha.</p>
      <div class="ccard"><div class="ccard-b" style="padding:2px 14px">${REPS.map(r => { const t = TEAM_STATS[r]; return `<div class="mini-row row-link" onclick="App.repApprovals('${r}')">${avatar(USERS[r], 24)}<div class="grow"><div class="nm">${esc(USERS[r].name)}</div><div class="sm">${t.todo} to do · ${t.replies} replies · ${t.meetings}/${t.target} meetings</div></div>${t.overdue ? `<span class="badge b-neg">${t.overdue} overdue</span>` : '<span class="badge b-pos">On track</span>'}</div>`; }).join('')}</div>
      <div class="ccard-f"><button class="btn sm pri" onclick="App.reassign(['banyan','coralbay'],'aisha')">Move 2 to Aisha</button><button class="btn sm" onclick="App.toast('Nudge sent to Kenji (mock)')">Nudge Kenji</button></div></div>`,
    todo: () => `<p>Your list, most urgent first:</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${todos().map(x => `<div class="mini-row row-link" onclick="App.runTodo('${x.id}')"><div class="grow"><div class="nm">${esc(x.t)}</div><div class="sm">${esc(x.d)}</div></div><span class="due ${x.cls}" style="font-size:11px">${esc(x.due)}</span></div>`).join('')}</div></div>`,
    approvalsList: () => { const items = apprItems(isMgr ? 'needs' : 'todo'), oth = escOther(); if (!items.length && oth.length) return `<p>Waiting for you:</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${oth.map(escMini).join('')}</div></div>`; return items.length ? `<p>${isMgr ? 'These need your sign-off:' : 'Waiting for you:'}</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${items.map(apprMini).join('')}</div></div>` : '<p>Nothing is waiting for you right now.</p>'; },
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
      if (c.id === 'red') return `<p>Picking up where you left off on Monday at 17:20. Since then I worked this objective on my own: <b>2 follow-ups</b> went out (Halcyon, Tidewater), <b>Ironwood</b> booked a meeting and <b>Eastgate</b> said yes. <b>${need.length} accounts still need you</b>, starting with Cedar: the switch angle has to be chosen before Friday.</p>${bar}<div class="hints" style="margin:8px 0 0"><button class="chip" onclick="App.openRecord('cedar','engage')">Start with Cedar</button><button class="chip" onclick="App.openThread('reastgate')">Answer Eastgate</button></div>`;
      return `<p>Here is where this objective stands: <b>${d.length} done</b>, <b>${need.length} open</b>. I work the ones that pass every check on my own and hold the rest for you.</p>${bar}`; },
    objCatchupFull: () => { const c = chat(); const d = objDone(c), need = c.obj.ids.filter(id => !d.includes(id));
      if (c.id !== 'red') { const auto = c.obj.ids.filter(id => !d.includes(id) && acct(id).nba && acct(id).nba.status === 'auto').length;
        return `<p>Here is where this objective stands. I am working the ones that pass every check on my own and holding the rest for you.</p>
        <div class="zt"><div class="zt-h"><b>Catch-up on this objective</b><span class="muted">Started today</span></div><div class="zt-stats">
        ${zStat(d.length, 'done so far', mkAI(), '')}${zStat(auto, 'ready to send with one click', mkAI(), "App.modTab('nba')")}${zStat(need.length - auto, 'need you before they go', mkWait(), `App.openAppr('${isMgr ? 'needs' : 'todo'}')`, 'zgap')}</div>
        <div class="zt-bar"><i style="width:${Math.round(d.length / c.obj.total * 100)}%"></i></div><div class="zt-f"><span>${d.length} of ${c.obj.total} done${c.notes && c.notes.length ? ' · your note: ' + esc(c.notes[c.notes.length - 1]) : ''}</span></div></div>${objList(c, d)}`; }
      return `<p>Picking up where you left off on Monday at 17:20. Since then I worked this objective on my own.</p>
        <div class="zt"><div class="zt-h"><b>Catch-up on this objective</b><span class="muted">Mon 17:20 to now</span></div><div class="zt-stats">
        ${zStat(2, 'follow-ups sent with one click: Halcyon, Tidewater', mkHu('Person'), "App.ask('Which of these did I send with one click?')")}${zStat(1, 'meeting booked: Ironwood Refining', mkAI(), "App.openRecord('ironwood','activity')")}${zStat(1, 'said yes: Eastgate Refinery', mkHu('From the customer'), "App.openThread('reastgate')")}${zStat(need.length, 'left that need you', mkWait(), '', 'zgap')}</div>
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
      <div class="lt"><div class="lt-h">${chIc(ch)}<b>${esc(last.t)}</b><span class="lt-w">${esc(last.when)}</span>${byAI ? mkHu('Sent with one click') : mkHu('Sent by ' + first(USERS[a.owner].name))}</div>
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
    return `<p>${greeting()}, ${esc(first(me.name))}. Since you last logged in the AI found <b>${k.sig.split(',')[0]}</b>, prepared <b>${auto} next best actions</b> that are ready to send and booked <b>${k.meet} meeting</b>. ${isMgr ? 'The team is' : 'You are'} <b>${tgt - meet} meetings short</b> of this week's target. <b>${badgeCount() + myReplies().filter(r => r.kind === 'Positive').length} things need you</b>; the full catch-up is on the right.</p>
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
        ${zStat(k.sig.split(',')[0].replace(' new signals', ''), 'new signals found, ' + k.sig.split(', ')[1], mkAI('AI'), "App.modTab('signals')")}
        ${zStat(k.sc, `accounts re-scored, ${k.segs} micro-segments rebuilt`, mkAI('AI'), "App.openArt('ranked')")}
        ${zStat(prep * wk, 'next best actions prepared', mkAI('AI'), "App.modTab('nba')")}
        ${zStat(auto * wk, 'ready to send: met all five criteria, no approval card', mkAI('Prepared by AI'), "App.modTab('nba')")}
        ${zStat(k.camp, k.camp > 1 ? 'campaigns proposed' : 'campaign proposed: Turnaround season 2027', mkAI('AI'), "App.goCampaign('c1')")}
        ${zStat(myReplies().length, 'replies from prospects', mkHu('From customers'), "App.nav('inbox')")}
        ${zStat(k.meet, k.meet > 1 ? 'meetings booked' : 'meeting booked: Ironwood Refining', mkAI(), "App.openRecord('ironwood','activity')")}
        ${zStat(badgeCount(), 'approval cards: a criterion failed or a check could not run', mkWait(), `App.openAppr('${isMgr ? 'needs' : 'todo'}')`, 'zgap')}
      </div>
      ${blk ? `<div class="zt-warn">${ic('alert', 14)}<span><b>${esc(blk.t)}.</b> ${esc(blk.d)}</span></div>` : ''}
      <div class="zt-f"><span>${mkAI('AI')} done by the AI on its own · ${mkHu('Person')} done by a person · ${mkWait('Needs you')} waiting for you</span><button onclick="App.ask('How much do agents do on their own?')">How much the AI does alone</button></div></div>`;
  }
  /* ─── Outcome records behind every Today number: one fixed history per account (found → sent → clicked →
     replied → meeting → closed), built to match the team's weekly stats, so each number lists its exact records ─── */
  let FX = null;
  const FX_PER = { week: [6, 'this week'], month: [29, 'this month'], quarter: [89, 'this quarter'] };
  const FX_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], FX_WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fxDay = age => { if (age === 0) return 'Today'; if (age === 1) return 'Yesterday'; const d = new Date(2026, 9, 27 - age); return `${FX_WD[d.getDay()]} ${d.getDate()} ${FX_MON[d.getMonth()]}`; };
  const fxAgeOf = at => { if (/^Today/.test(at)) return 0; if (/^Yesterday/.test(at)) return 1; const m = String(at).match(/(\d+) (Sep|Oct|Nov)/); if (m) return m[2] === 'Oct' ? 27 - +m[1] : m[2] === 'Sep' ? 57 - +m[1] : 0; return 3; };
  const fxH = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
  const fxFrom = a => a.campaign && campOf(a.campaign) ? 'Campaign · ' + campOf(a.campaign).name : 'Next best action';
  const FX_RTXT = { Positive: 'Yes, worth a conversation. Can you send times for next week?', 'Not now': 'Not this quarter; try us again after the budget round.', 'Further action': 'Can you send the comparison to our technical lead first?', Objection: 'We are happy with our current vendor for now.', 'Meeting booked': 'Booked Thursday 10:00, see you then.' };
  function fxBuild() {
    const E = { leads: [], sent: [], clicked: [], responded: [], meetings: [], closed: [], pipeline: [] };
    const assets = libAll().filter(x => x.st !== 'Retired');
    REPS.forEach(r => {
      const ts = TEAM_STATS[r], A = ACCOUNTS.filter(a => a.owner === r && !a.fromList);
      A.forEach(a => { const ages = (a.signals || []).map(s => s.age); E.leads.push({ acc: a.id, age: ages.length ? Math.min(89, Math.min(...ages)) : Math.floor(30 + fxH(a.id) * 59), how: a.whyNow ? a.whyNow.type : 'Matched the ICP', src: a.signals && a.signals[0] ? a.signals[0].source : 'Account data' }); });
      const real = REPLIES.filter(x => x.owner === r), realIds = real.map(x => x.acc);
      const pool = A.filter(a => a.campaign || a.nba || (a.activity || []).some(x => /^Opened/.test(x.t))).sort((p2, q) => (realIds.includes(q.id) - realIds.includes(p2.id)) || ((q.activity || []).some(x => /^Opened/.test(x.t)) - (p2.activity || []).some(x => /^Opened/.test(x.t))) || fxH(p2.id + r) - fxH(q.id + r));
      if (!pool.length) return;
      const W = [[0, 6, 1], [7, 29, 0], [30, 89, 0]], Q = { sent: [ts.sent, ts.sent * 3, ts.sent * 5], clicked: [ts.replies * 2 + 1, ts.replies * 3, ts.replies * 4], responded: [ts.replies, Math.round(ts.replies * 0.6), ts.replies], meetings: [ts.meetings, Math.round(ts.meetings * 0.5), ts.meetings], closed: [ts.meetings >= 3 ? 1 : 0, Math.round(ts.meetings * 0.15), Math.round(ts.meetings * 0.3)] };
      let cur = 0; const nxt = (avoid) => { for (let k = 0; k < pool.length; k++) { const a = pool[(cur + k) % pool.length]; if (!avoid || !avoid.has(a.id)) { cur = (cur + k + 1) % pool.length; return a; } } const a = pool[cur % pool.length]; cur++; return a; };
      const ageIn = (w, s) => w[0] + Math.floor(fxH(s) * (w[1] - w[0] + 1));
      W.forEach((w, wi) => {
        for (let i = 0; i < Q.sent[wi]; i++) { const a = pool[(i * 7 + wi) % pool.length], c0 = a.campaign && campOf(a.campaign), sq = c0 ? seqOf(c0) : [], si = sq.length ? (i + wi) % sq.length : 0, tc = sq[si]; E.sent.push({ acc: a.id, age: ageIn(w, a.id + 's' + i + wi), ch: tc ? tc.ch : (a.nba && a.nba.channel) || 'Email', what: tc ? `Step ${si + 1} · ${tc.t || tc.fmt}` : a.nba ? a.nba.action : 'Follow-up', from: fxFrom(a) }); }
        const cl = new Set(); for (let i = 0; i < Q.clicked[wi]; i++) { const a = nxt(cl); cl.add(a.id); const as = assets[Math.floor(fxH(a.id + 'as') * assets.length)] || { t: 'the comparison page', type: 'Link' }; E.clicked.push({ acc: a.id, age: ageIn(w, a.id + 'c' + wi), what: as.t, type: as.type, ch: fxH(a.id + 'ch') > 0.7 ? 'LinkedIn' : 'Email', from: fxFrom(a) }); }
        const rs = new Set(), rIn = real.filter(x => { const g = fxAgeOf(x.at); return g >= w[0] && g <= w[1]; });
        rIn.slice(0, Q.responded[wi]).forEach(x => { rs.add(x.acc); E.responded.push({ acc: x.acc, age: fxAgeOf(x.at), kind: x.kind, text: x.text, ch: x.ch || 'Email', from: x.source || fxFrom(acct(x.acc)), rid: x.id, who: x.from }); });
        const clArr = [...cl]; let ci = 0;
        while ([...rs].length < Q.responded[wi]) { const id = clArr.find(x => !rs.has(x)) || nxt(rs).id; rs.add(id); const a = acct(id), kinds = ['Positive', 'Not now', 'Further action', 'Positive', 'Objection', 'Meeting booked'], kd = kinds[Math.floor(fxH(id + 'k' + wi) * kinds.length)]; E.responded.push({ acc: id, age: ageIn(w, id + 'r' + wi), kind: kd, text: FX_RTXT[kd], ch: fxH(id + 'rc') > 0.65 ? 'LinkedIn' : 'Email', from: fxFrom(a), who: a.contact.name }); ci++; if (ci > 60) break; }
        const rArr = E.responded.filter(e => rs.has(e.acc) && e.age >= w[0] && e.age <= w[1]).sort((p2, q) => (/Meeting|Positive/.test(q.kind) - /Meeting|Positive/.test(p2.kind)));
        const ms = []; for (let i = 0; i < Q.meetings[wi]; i++) { const e = rArr[i % Math.max(1, rArr.length)]; if (!e) break; const a = acct(e.acc), when = e.age <= 1 ? 2 + Math.floor(fxH(a.id + 'm') * 3) : -Math.floor(fxH(a.id + 'm') * 4); ms.push(a.id); E.meetings.push({ acc: a.id, age: e.age, booked: fxDay(e.age), at: when > 0 ? `${FX_WD[new Date(2026, 9, 27 + when).getDay()]} ${27 + when > 31 ? 27 + when - 31 + ' Nov' : 27 + when + ' Oct'} · 10:00` : fxDay(Math.max(0, e.age - 2)) + ' · held', from: e.from, upcoming: when > 0 }); }
        for (let i = 0; i < Q.closed[wi]; i++) { const id = ms[i % Math.max(1, ms.length)] || pool[i % pool.length].id, a = acct(id), v = 60 + Math.round(fxH(id + 'v' + wi) * 34) * 10; E.closed.push({ acc: id, age: ageIn(w, id + 'cl' + wi), value: v, what: /Gas|LNG/.test(a.industry) ? 'Emissions and analyser package' : /Refin/.test(a.industry) ? 'Control-system migration' : 'Reliability services', from: fxFrom(a) }); }
      });
      /* open pipeline the AI influenced: USD 0.3M per rep, over accounts with a meeting or a positive reply */
      const pp = [...new Set(E.meetings.concat(E.responded.filter(e => /Positive|Meeting/.test(e.kind))).filter(e => acct(e.acc).owner === r).map(e => e.acc))].slice(0, 5);
      if (pp.length) { let left = 300; pp.forEach((id, i) => { const v = i === pp.length - 1 ? left : Math.max(30, Math.round(300 / pp.length / 10 + (fxH(id + 'pv') - 0.5) * 4) * 10); left -= v; E.pipeline.push({ acc: id, value: v, stage: ['Meeting held', 'Proposal sent', 'Technical review', 'Negotiation'][Math.floor(fxH(id + 'st') * 4)], from: fxFrom(acct(id)), age: 0 }); }); }
    });
    return E;
  }
  function fxRows(k, per) {
    if (!FX) FX = fxBuild();
    const max = (FX_PER[per] || FX_PER.week)[0];
    let L = (FX[k] || []).filter(e => e.age <= max && acct(e.acc) && mine(acct(e.acc)));
    if (k === 'leads') L = L.concat(ACCOUNTS.filter(a => a.fromList && mine(a)).map(a => ({ acc: a.id, age: 0, how: 'Generated from your prompt', src: 'Prospect search' })));
    L.sort((p2, q) => p2.age - q.age);
    if (/^(clicked|responded|meetings|closed)$/.test(k)) { const seen = new Set(); L = L.filter(e => !seen.has(e.acc) && seen.add(e.acc)); } /* people, counted once: the newest event */
    return L;
  }
  const FX_META = {
    leads: ['Leads generated', 'users', 'found and scored by the AI'], sent: ['Messages sent', 'mail', 'sent from campaigns and next best actions'], clicked: ['People who clicked', 'spark', 'opened a link or an asset'],
    responded: ['Replies', 'reply', 'replied on any channel'], meetings: ['Meetings booked', 'check', 'booked from a reply'], closed: ['Leads closed', 'up', 'won from this outreach'], pipeline: ['Pipeline the AI influenced', 'up', 'open opportunities'],
  };
  function fxCard(k, per) {
    const rows = fxRows(k, per), M = FX_META[k], perL = k === 'pipeline' ? 'open now' : (FX_PER[per] || FX_PER.week)[1];
    const who = a => `<div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.contact.title)} · ${esc(a.name)}${isMgr ? ` · ${esc(first(USERS[a.owner].name))}` : ''}</div>`;
    const kb = kd => `<span class="badge ${/Positive|Meeting/.test(kd) ? 'b-pos' : /Objection|Opted|Wrong/.test(kd) ? 'b-neg' : 'b-grey'} nodot">${esc(kd)}</span>`;
    const R = {
      leads: e => { const a = acct(e.acc); return [`<div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.contact.name)} · ${esc(a.contact.title)}${isMgr ? ` · ${esc(first(USERS[a.owner].name))}` : ''}</div>`, `${esc(e.how)}<div class="sm">${esc(e.src)}${a.score ? ` · score ${sc(a)}` : ''}</div>`, fxDay(e.age)]; },
      sent: e => { const a = acct(e.acc); return [who(a), `${chIc(e.ch)} ${esc(e.what)}<div class="sm">${esc(e.from)}</div>`, fxDay(e.age)]; },
      clicked: e => { const a = acct(e.acc); return [who(a), `${esc(e.what)}<div class="sm">${esc(e.type)} · ${esc(e.ch)} · ${esc(e.from)}</div>`, fxDay(e.age)]; },
      responded: e => { const a = acct(e.acc); return [who(a), `${kb(e.kind)} <span class="sm">${esc(e.ch)}</span><div class="sm mx-q">"${esc(e.text)}"</div><div class="sm">${esc(e.from)}</div>`, fxDay(e.age)]; },
      meetings: e => { const a = acct(e.acc); return [who(a), `${e.upcoming ? '<span class="badge b-sec nodot">Upcoming</span>' : '<span class="badge b-pos nodot">Held</span>'} ${esc(e.at)}<div class="sm">${esc(e.from)}</div>`, 'Booked ' + esc(e.booked)]; },
      closed: e => { const a = acct(e.acc); return [`<div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.contact.name)}${isMgr ? ` · ${esc(first(USERS[a.owner].name))}` : ''}</div>`, `${esc(e.what)}<div class="sm">${esc(e.from)}</div>`, `<b>USD ${e.value}k</b><div class="sm">${fxDay(e.age)}</div>`]; },
      pipeline: e => { const a = acct(e.acc); return [`<div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.contact.name)}${isMgr ? ` · ${esc(first(USERS[a.owner].name))}` : ''}</div>`, `${esc(e.stage)}<div class="sm">${esc(e.from)}</div>`, `<b>USD ${e.value}k</b>`]; },
    };
    const H3 = { leads: ['Lead', 'Why found', 'Found'], sent: ['Person', 'Message', 'Sent'], clicked: ['Person', 'What they clicked', 'When'], responded: ['Person', 'Reply', 'When'], meetings: ['Person', 'Meeting', 'Booked'], closed: ['Account', 'Won', 'Value'], pipeline: ['Account', 'Stage', 'Value'] }[k];
    const tot = /closed|pipeline/.test(k) ? rows.reduce((n, e) => n + e.value, 0) : null;
    const click = e => e.rid ? `App.openThread('${e.rid}')` : `App.openRecord('${e.acc}','activity')`;
    return { kind: 'text', html: `<p>${k === 'pipeline' ? `The <b>USD ${(tot / 1000).toFixed(1)}M</b> pipeline the AI influenced, ${rows.length} open opportunities` : `The <b>${rows.length}</b> ${esc(M[0].toLowerCase())} ${perL}`}, from every campaign and next best action${isMgr ? ' across the team' : ''}. Newest first; click a row for the full record.</p>
      <div class="tcard mx"><div class="tcard-h"><span class="t">${ic(M[1], 15)} ${esc(M[0])}</span><span class="muted" style="font-size:12px;white-space:nowrap">${rows.length} records · ${esc(perL)}</span></div>
      <div class="mx-w"><table class="tbl mx-t"><thead><tr>${H3.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(e => { const c3 = R[k](e); return `<tr class="row-link" onclick="${click(e)}"><td>${c3[0]}</td><td>${c3[1]}</td><td class="mx-d">${c3[2]}</td></tr>`; }).join('') || `<tr><td colspan="3" class="empty">None ${esc(perL)}.</td></tr>`}</tbody></table></div>
      ${tot != null ? `<div class="mx-f"><span>Total</span><b>USD ${tot.toLocaleString('en-US')}k</b></div>` : ''}</div>` };
  }
  function fxAsk(t) {
    if (/^show me the cost per meeting/.test(t)) return costCard();
    if (/^show me the win rate/.test(t)) return winCard();
    const f = t.match(/^show me (?:the )?(?:\d[\d,]* )?(leads generated|leads scored|leads in nba or campaigns|leads messaged|leads that opened|leads that replied|leads with a meeting booked|leads closed)(?: (this week|this month|this quarter))?/);
    if (f) return fnCard(FN.find(x => x[3] === f[1])[0], /month/.test(f[2] || '') ? 'month' : /quarter/.test(f[2] || '') ? 'quarter' : 'week');
    const m = t.match(/^show me (?:the )?(?:\d[\d,]* )?(leads generated|people who clicked|clicks|replies|meetings booked|meetings|leads closed|messages sent|emails sent)(?: (this week|this month|this quarter))?/);
    if (!m) return null;
    const k = { 'leads generated': 'leads', 'people who clicked': 'clicked', clicks: 'clicked', replies: 'responded', 'meetings booked': 'meetings', meetings: 'meetings', 'leads closed': 'closed', 'messages sent': 'sent', 'emails sent': 'sent' }[m[1]];
    const per = /month/.test(m[2] || '') ? 'month' : /quarter/.test(m[2] || '') ? 'quarter' : 'week';
    return fxCard(k, per);
  }
  /* The funnel: every campaign and next best action together, leads in to leads closed */
  const FUN = {
    week: { l: 'This week', mgr: [312, 104, 37, 9, 2], rep: [78, 26, 9, 2, 1] },
    month: { l: 'This month', mgr: [1240, 412, 138, 31, 9], rep: [318, 104, 36, 8, 2] },
    quarter: { l: 'This quarter', mgr: [3480, 1105, 371, 86, 24], rep: [902, 288, 97, 22, 6] },
  };
  /* The funnel follows the leads found in the period: generated → scored → given a next best action or a
     campaign → messaged → opened → replied → meeting booked → closed. Each stage is a subset of the one before. */
  const FN = [['leads', 'Leads generated', 'found by the AI, or from your prompts', 'leads generated'], ['scored', 'Leads scored', 'fit × timing, with a tier', 'leads scored'], ['engaged', 'In NBA or campaigns', 'given a next best action or a campaign', 'leads in nba or campaigns'], ['messaged', 'Messaged', 'got at least one message', 'leads messaged'], ['opened', 'Opened', 'opened a message or an asset', 'leads that opened'], ['replied', 'Replied', 'replied on any channel', 'leads that replied'], ['meetings', 'Meetings booked', 'booked from a reply', 'leads with a meeting booked'], ['closed', 'Leads closed', 'won from this outreach', 'leads closed']];
  function fnStages(per) {
    if (!FX) FX = fxBuild();
    const mx = (FX_PER[per] || FX_PER.week)[0], ev = k => { const m = {}; (FX[k] || []).filter(e => e.age <= mx).forEach(e => { if (!m[e.acc] || e.age < m[e.acc].age) m[e.acc] = e; }); return m; };
    const SENT = ev('sent'), OPEN = ev('clicked'), REP = ev('responded'), MEET = ev('meetings'), CLOSE = ev('closed');
    const has = (id, L) => L.some(m => m[id]);
    const out = {}; let cur = fxRows('leads', per).filter(e => acct(e.acc)).map(e => ({ acc: e.acc, age: e.age, lead: e }));
    const seen = new Set(); cur = cur.filter(e => !seen.has(e.acc) && seen.add(e.acc));
    out.leads = cur;
    out.scored = cur = cur.filter(e => acct(e.acc).score > 0 || acct(e.acc).fromList);
    out.engaged = cur = cur.filter(e => { const a = acct(e.acc); return a.campaign || a.nba || has(e.acc, [SENT, OPEN, REP, MEET, CLOSE]); });
    out.messaged = cur = cur.filter(e => has(e.acc, [SENT, OPEN, REP, MEET, CLOSE])).map(e => Object.assign({}, e, { ev: SENT[e.acc] }));
    out.opened = cur = cur.filter(e => has(e.acc, [OPEN, REP, MEET, CLOSE])).map(e => Object.assign({}, e, { ev: OPEN[e.acc] }));
    out.replied = cur = cur.filter(e => has(e.acc, [REP, MEET, CLOSE])).map(e => Object.assign({}, e, { ev: REP[e.acc] }));
    out.meetings = cur = cur.filter(e => has(e.acc, [MEET, CLOSE])).map(e => Object.assign({}, e, { ev: MEET[e.acc] }));
    out.closed = cur.filter(e => has(e.acc, [CLOSE])).map(e => Object.assign({}, e, { ev: CLOSE[e.acc] }));
    return out;
  }
  function fnCard(k, per) {
    const st = FN.find(x => x[0] === k), rows = fnStages(per)[k] || [], perL = (FX_PER[per] || FX_PER.week)[1];
    const who = a => `<div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.contact.title)} · ${esc(a.name)}${isMgr ? ` · ${esc(first(USERS[a.owner].name))}` : ''}</div>`;
    const what = e => { const a = acct(e.acc), v = e.ev;
      if (k === 'leads') return `${esc(e.lead.how)}<div class="sm">${esc(e.lead.src)}</div>`;
      if (k === 'scored') return `Score <b>${sc(a)}</b> · ${tierBadge(a.tier)}<div class="sm">Fit ${a.fit} × timing ${a.timing}</div>`;
      if (k === 'engaged') return a.campaign && campOf(a.campaign) ? `Campaign · ${esc(campOf(a.campaign).name)}` : a.nba ? `Next best action · ${esc(a.nba.action)}<div class="sm">${esc(a.nba.channel || '')}</div>` : 'Next best action';
      if (!v) return `<span class="muted">${k === 'messaged' ? 'Messaged' : k === 'opened' ? 'Opened' : 'Done'} (seen from a later step)</span>`;
      if (k === 'messaged') return `${chIc(v.ch)} ${esc(v.what)}<div class="sm">${esc(v.from)}</div>`;
      if (k === 'opened') return `${esc(v.what)}<div class="sm">${esc(v.type || '')} · ${esc(v.ch)}</div>`;
      if (k === 'replied') return `<span class="badge ${/Positive|Meeting/.test(v.kind) ? 'b-pos' : /Objection|Opted|Wrong/.test(v.kind) ? 'b-neg' : 'b-grey'} nodot">${esc(v.kind)}</span><div class="sm mx-q">"${esc(v.text)}"</div>`;
      if (k === 'meetings') return `${v.upcoming ? '<span class="badge b-sec nodot">Upcoming</span>' : '<span class="badge b-pos nodot">Held</span>'} ${esc(v.at)}`;
      return `<b>USD ${v.value}k</b> · ${esc(v.what)}`; };
    const when = e => fxDay(e.ev ? e.ev.age : e.age);
    const click = e => e.ev && e.ev.rid ? `App.openThread('${e.ev.rid}')` : `App.openRecord('${e.acc}','activity')`;
    return { kind: 'text', html: `<p>The <b>${rows.length}</b> ${esc(st[3].replace('nba', 'NBA'))} ${perL}: of the leads found ${perL}, those that got this far, from every campaign and next best action${isMgr ? ' across the team' : ''}. Click a row for the full record.</p>
      <div class="tcard mx"><div class="tcard-h"><span class="t">${ic('users', 15)} ${esc(st[1])}</span><span class="muted" style="font-size:12px;white-space:nowrap">${rows.length} leads · ${esc(perL)}</span></div>
      <div class="mx-w"><table class="tbl mx-t"><thead><tr><th>Lead</th><th>${k === 'leads' ? 'Why found' : k === 'scored' ? 'Score' : k === 'engaged' ? 'Plan' : 'What happened'}</th><th>${k === 'leads' ? 'Found' : 'When'}</th></tr></thead><tbody>${rows.map(e => `<tr class="row-link" onclick="${click(e)}"><td>${who(acct(e.acc))}</td><td>${what(e)}</td><td class="mx-d">${when(e)}</td></tr>`).join('') || `<tr><td colspan="3" class="empty">None ${esc(perL)}.</td></tr>`}</tbody></table></div></div>` };
  }
  function funnelTile() {
    const S8 = fnStages(funF), v = FN.map(x => (S8[x[0]] || []).length), sent = fxRows('sent', funF).length;
    const camps = CAMPAIGNS.length + (S.outGen || []).filter(g => g.kind === 'NBC').length, nbas = ACCOUNTS.filter(a => a.nba && mine(a)).length + (S.outGen || []).filter(g => g.kind !== 'NBC').length, segs = SEGMENTS.length;
    const pct = (a, b) => b ? Math.round(a / b * 100) : 0, fmt = n => n.toLocaleString('en-US');
    return `<div class="zt fn"><div class="zt-h"><b>Funnel · the leads found ${esc(FX_PER[funF][1])}, and how far they got</b><span class="zseg">${Object.entries(FUN).map(([k, x]) => `<button class="${funF === k ? 'on' : ''}" onclick="App.setFun('${k}')">${x.l}</button>`).join('')}</span></div>
      <div class="fn-src"><button onclick="App.modTab('campaigns')"><b>${camps}</b> campaigns</button><button onclick="App.modTab('nba')"><b>${nbas}</b> next best actions</button><button onclick="App.modTab('segments')"><b>${segs}</b> micro-segments</button><button onclick="App.metric('sent')"><b>${fmt(sent)}</b> messages sent</button></div>
      <div class="fn-st fn8">${FN.map(([k, l, d], i) => `<button class="fn-s" onclick="App.fnShow('${k}')"><span class="fn-l"><i class="fn-i">${i + 1}</i>${l}</span><b>${fmt(v[i])}</b><span class="fn-d">${d}</span><span class="fn-bar"><i style="width:${Math.max(3, pct(v[i], v[0]))}%"></i></span>${i ? `<em>${pct(v[i], v[i - 1])}% of ${FN[i - 1][1].toLowerCase().replace("nba", "NBA")}</em>` : '<em>100%</em>'}</button>`).join('')}</div>
      <div class="zt-f"><span>Lead to close: <b>${v[0] ? (v[7] / v[0] * 100).toFixed(1) : '0.0'}%</b> · open rate <b>${pct(v[4], v[3])}%</b> · reply rate <b>${pct(v[5], v[3])}%</b> · every number opens its list</span></div></div>`;
  }
  /* What the week cost, for cost per meeting: every line the customer pays for */
  const COSTW = [['AI runs', 'Overnight scoring, drafting and checks: 7 nights × USD 11.40', 79.8], ['Contact data', 'Apollo, ZoomInfo and Lusha credits used for enrichment', 142], ['Signal sources', 'Job-change alerts, contract data, intent and news feeds', 44.2]];
  function winRate() { const S4 = fnStages('quarter'), won = (S4.closed || []).length, n = (S4.meetings || []).length; return { won, n, pct: n ? Math.round(won / n * 100) : 0, S4 }; }
  function costCard() {
    const ts = TEAM_STATS, meet = REPS.reduce((n, r) => n + ts[r].meetings, 0), tot = COSTW.reduce((n, c) => n + c[2], 0), per = tot / Math.max(1, meet);
    return { kind: 'text', html: `<p>Cost per meeting this week: <b>USD ${Math.round(per)}</b>. The team spent <b>USD ${tot.toFixed(2)}</b> and booked <b>${meet}</b> meetings. Rep time and the sending tools are not included.</p>
      <div class="tcard mx"><div class="tcard-h"><span class="t">${ic('up', 15)} Cost per meeting</span><span class="muted" style="font-size:12px">this week</span></div>
      <div class="mx-w"><table class="tbl mx-t"><thead><tr><th>Cost</th><th>What it covers</th><th>USD</th></tr></thead><tbody>${COSTW.map(c => `<tr><td class="nm">${c[0]}</td><td class="sm">${esc(c[1])}</td><td class="mx-d">${c[2].toFixed(2)}</td></tr>`).join('')}</tbody></table></div>
      <div class="mx-f"><span>Total ÷ ${meet} meetings</span><b>USD ${per.toFixed(2)} a meeting</b></div></div>` };
  }
  function winCard() {
    const w = winRate(), won = new Set(w.S4.closed.map(e => e.acc)), cl = {}; w.S4.closed.forEach(e => { cl[e.acc] = e.ev; });
    return { kind: 'text', html: `<p>Win rate this quarter: <b>${w.pct}%</b>. ${w.won} of the ${w.n} meetings booked from campaigns and next best actions became won deals.</p>
      <div class="tcard mx"><div class="tcard-h"><span class="t">${ic('check', 15)} Win rate</span><span class="muted" style="font-size:12px">${w.n} meetings · this quarter</span></div>
      <div class="mx-w"><table class="tbl mx-t"><thead><tr><th>Lead</th><th>Outcome</th><th>Meeting</th></tr></thead><tbody>${w.S4.meetings.slice().sort((a, b) => won.has(b.acc) - won.has(a.acc)).map(e => { const a = acct(e.acc); return `<tr class="row-link" onclick="App.openRecord('${e.acc}','activity')"><td><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.name)} · ${esc(first(USERS[a.owner].name))}</div></td><td>${won.has(e.acc) ? `<span class="badge b-pos nodot">Won</span> USD ${cl[e.acc] ? cl[e.acc].value : '–'}k` : '<span class="badge b-grey nodot">Still open</span>'}</td><td class="mx-d">${e.ev ? esc(e.ev.at) : fxDay(e.age)}</td></tr>`; }).join('')}</tbody></table></div></div>` };
  }
  function standingTile() {
    const ts = TEAM_STATS, reps = isMgr ? REPS : [me.id], sum = f => reps.reduce((n, r) => n + ts[r][f], 0);
    const meet = sum('meetings'), tgt = sum('target'), sentN = sum('sent'), cap = isMgr ? 160 : 40;
    return `<p>${isMgr ? 'Where the team stands this week, outcomes first.' : 'Where you stand this week, outcomes first.'} You are <b>${tgt - meet} meeting${tgt - meet === 1 ? '' : 's'} short</b> of the target${isMgr ? '; the replies waiting below could close part of that' : ''}.</p>
      <div class="zt"><div class="zt-bar big" role="img" aria-label="${meet} of ${tgt} meetings"><i style="width:${Math.round(meet / tgt * 100)}%"></i></div>
      <div class="zt-stats" style="grid-template-columns:repeat(${isMgr ? 5 : 3},minmax(0,1fr))">
        ${zStat(`${meet}<small> / ${tgt}</small>`, 'meetings booked against target', '', "App.metric('meetings','week')", 'zgap')}
        ${zStat(sum('replies'), `replies, ${fxRows('responded', 'week').filter(e => /Positive|Meeting/.test(e.kind)).length} positive or booked`, '', "App.metric('responded','week')")}
        ${zStat(`${sentN}<small> / ${cap}</small>`, 'emails sent: the activity behind it', '', "App.metric('sent','week')")}
        ${isMgr ? zStat(`USD ${Math.round(COSTW.reduce((n, c) => n + c[2], 0) / Math.max(1, meet))}`, 'cost per meeting this week: AI, data and sources', '', "App.ask('Show me the cost per meeting this week')") + (w => zStat(`${w.pct}%`, `win rate this quarter: ${w.won} of ${w.n} meetings won`, '', "App.ask('Show me the win rate this quarter')"))(winRate()) : ''}
      </div></div>`;
  }
  function needsYouList() {
    const rows = [];
    myReplies().filter(r => r.kind === 'Positive').forEach(r => rows.push(`<div class="zr" onclick="App.openThread('${r.id}')"><span class="av" style="background:${USERS[r.owner].color}">${initials(r.from)}</span><div class="zr-m"><div class="zr-t">${esc(r.from)} · ${esc(acct(r.acc).name)}${isMgr ? ` <span>· ${esc(first(USERS[r.owner].name))}</span>` : ''}</div><div class="zr-d">"${esc(r.text)}"</div><div class="zr-why">Said yes: answer first</div></div><div class="zr-m2">${mkHu('Positive reply')}<time>${esc(r.at)}</time></div><button class="btn sm pri" onclick="event.stopPropagation();App.openThread('${r.id}')">${isMgr ? 'Open' : 'Reply'}</button></div>`));
    apprItems(isMgr ? 'needs' : 'todo').forEach(a => rows.push(`<div class="zr" onclick="App.openRecord('${a.id}','engage')">${pAvatar(a, 30)}<div class="zr-m"><div class="zr-t">${esc(a.contact.name)} · ${esc(a.name)}${isMgr ? ` <span>· ${esc(first(USERS[a.owner].name))}</span>` : ''}</div><div class="zr-d">${esc(a.nba.action)} · ${a.nba.channel}</div><div class="zr-why">${esc(reasonOf(a))}: ${esc(a.nba.reasonNote || 'check before it goes out')}</div></div><div class="zr-m2">${S.decisions[a.id] ? mkHu(decLabel(S.decisions[a.id])) : mkWait()}<time>${esc(a.nba.due || '')}</time></div><button class="btn sm" onclick="event.stopPropagation();App.openRecord('${a.id}','engage')">Review</button></div>`));
    if (isMgr && !S.camp.c1) rows.push(`<div class="zr" onclick="App.goCampaign('c1')"><span class="av" style="background:var(--brand)">${ic('megaphone', 13)}</span><div class="zr-m"><div class="zr-t">Turnaround season 2027 <span>· campaign</span></div><div class="zr-d">11 accounts announced a planned shutdown in 6 days</div><div class="zr-why">Campaigns of 10 or more accounts start only when you confirm</div></div><div class="zr-m2">${mkWait()}<time>Today</time></div><button class="btn sm" onclick="event.stopPropagation();App.goCampaign('c1','steps')">Review</button></div>`);
    return `<p>${rows.length} thing${rows.length === 1 ? ' needs' : 's need'} a person. Everything else is ready to send with one click.</p>
      <div class="zl"><div class="zl-h"><b>Needs you</b><span class="zl-f"><span class="on">All ${rows.length}</span><span>Replies</span><span>Approvals</span>${isMgr ? '<span>Campaigns</span>' : ''}</span></div>${rows.slice(0, 6).join('')}
      <div class="zl-ft"><button onclick="App.openAppr('${isMgr ? 'needs' : 'todo'}')">Open all beside the chat ${ic('expand', 12)}</button><span>Same list, every row and column</span></div></div>`;
  }
  const objDone = c => (c.obj && c.obj.done) || [];
  const OBJ_NEED = { cedar: 'Renewal: choose the offer before Friday', sapphire: 'Opened 3 times, no reply: change the channel?', eastgate: 'Said yes: answer by 11:00', meridian: 'Medium confidence: sign off or send back' };
  function objList(c, done) {
    return `<div class="zl"><div class="zl-h"><b>${esc(c.title)}</b><span class="zl-f"><span class="on">All ${c.obj.total}</span><span>Done ${done.length}</span><span>Open ${c.obj.total - done.length}</span></span></div>${c.obj.ids.map(id => { const a = acct(id), d = done.includes(id);
      const mark = d ? (id === 'saltmarsh' ? mkHu('Done by ' + first(USERS.pavan.name)) : id === 'ironwood' ? mkAI('Meeting booked on its own') : mkHu('Follow-up sent with one click')) : OBJ_NEED[id] && done.length > 3 ? mkWait() : '';
      return `<div class="zr ${d ? 'done' : ''}" onclick="App.openRecord('${id}','${d ? 'activity' : 'engage'}')">${pAvatar(a, 28)}<div class="zr-m"><div class="zr-t">${esc(a.name)} <span>· ${esc(first(USERS[a.owner].name))}</span></div><div class="zr-d">${esc(a.whyNow ? a.whyNow.text : a.industry)}</div>${!d && OBJ_NEED[id] && done.length > 3 ? `<div class="zr-why">${esc(OBJ_NEED[id])}</div>` : ''}</div><div class="zr-m2">${mark}</div>${d ? '' : `<button class="btn sm" onclick="event.stopPropagation();App.openRecord('${id}','engage')">Work it</button>`}</div>`; }).join('')}
      <div class="zl-ft"><span>Most urgent first. Done items stay so you can see who did them.</span></div></div>`;
  }
  const AUTO = [['status', 'Status updates and follow-ups after a reply', 'From approved templates only; autopilot on proven segments', 'Autopilot'], ['nba', 'Next best actions', 'Ready to send when all five criteria are met; the rep clicks Send', 'Assist'], ['tier1', 'Tier 1 and C-level contacts', 'Always prepared, sent by the rep', 'Assist'], ['camp', 'Campaigns of 10 or more accounts', 'The manager confirms before step 1', 'Assist'], ['price', 'Anything with a price or a commitment', 'Never alone', 'Manual']];
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
    return `<p>Two places are stuck this week.</p>
      <div class="zl"><div class="zl-h"><b>Stuck</b></div>
        <div class="zr" onclick="App.openRecord('sapphire','activity')">${pAvatar(acct('sapphire'), 28)}<div class="zr-m"><div class="zr-t">Sapphire Aromatics <span>· ${esc(first(USERS[acct('sapphire').owner].name))}</span></div><div class="zr-d">Opened the switch comparison 3 times, no reply</div><div class="zr-why">Same channel three times</div></div><div class="zr-m2">${mkHu('Sent with one click')}</div><button class="btn sm" onclick="event.stopPropagation();App.openRecord('sapphire','activity')">Last touchpoint</button></div>
        ${isMgr && ov.length ? `<div class="zr" onclick="App.viewRep('kenji')"><span class="av" style="background:${USERS.kenji.color}">KM</span><div class="zr-m"><div class="zr-t">Kenji Mori <span>· 3 overdue, no meetings yet</span></div><div class="zr-d">${ov.map(a => esc(a.name)).join(' and ')} ${ov.length > 1 ? 'are' : 'is'} waiting on him</div><div class="zr-why">Aisha has room this week</div></div><div class="zr-m2">${mkWait()}</div><button class="btn sm pri" onclick="event.stopPropagation();App.reassign(${js(ov.map(a => a.id))},'aisha')">Move to Aisha</button></div>` : ''}
      </div>`;
  }
  /* ─── Your day: meetings and the decisions around them, as a day, a week or a list ─── */
  const WEEK = [['Mon', 26], ['Tue', 27], ['Wed', 28], ['Thu', 29], ['Fri', 30]], TODAYI = 1;
  const MEETS = [
    { d: 0, s: '09:00', m: 45, t: 'Team pipeline review', k: 'Internal', w: 'Sofia, Marco, Aisha, Kenji', r: 100, who: ['pavan', 'sofia'] },
    { d: 0, s: '16:00', m: 30, t: '1:1 with Kenji', k: 'Internal', w: 'Kenji Mori', r: 80, who: ['pavan'] },
    { d: 1, s: '09:30', m: 30, t: 'Weekly forecast', k: 'Internal', w: 'Sofia, Marco, Aisha, Kenji', r: 100, who: ['pavan'] },
    { d: 1, s: '11:00', m: 45, t: 'Cedar switch angle', acc: 'cedar', k: 'Internal', w: 'Daniel Brooks, Sofia Ahlgren', r: 60, g: 'Choose the offer: extend the support contract or propose the migration path', who: ['pavan', 'sofia'] },
    { d: 1, s: '15:30', m: 30, t: 'Meridian Olefins · intro to the new COO', acc: 'meridian', k: 'Client call', w: 'Somchai Rattana, Marco Lindqvist', r: 40, g: 'Agree a first working session with the new COO', who: ['pavan'] },
    { d: 2, s: '10:00', m: 30, t: 'Turnaround season 2027 · campaign review', k: 'Internal', w: 'Sofia, Marco', r: 70, g: 'Confirm the 11 accounts and step 1', who: ['pavan', 'sofia'] },
    { d: 2, s: '14:00', m: 45, t: 'Juniper Petrochem · discovery call', acc: 'juniper', k: 'Client call', w: 'Budi Hartono, Sofia Ahlgren', r: 55, g: 'Confirm the reliability priorities of the new VP', who: ['pavan', 'sofia'] },
    { d: 3, s: '11:00', m: 45, t: 'Halcyon Gas Processing · scoping', acc: 'halcyon', k: 'Client call', w: 'Sofia Ahlgren', r: 30, g: 'Scope the historian platform question from their job posts', who: ['sofia'] },
    { d: 3, s: '16:00', m: 30, t: '1:1 with Aisha', k: 'Internal', w: 'Aisha Rahman', r: 90, who: ['pavan'] },
    { d: 4, s: '09:00', m: 45, t: 'Weekly team review', k: 'Internal', w: 'Sofia, Marco, Aisha, Kenji', r: 20, who: ['pavan', 'sofia'] },
    { d: 4, s: '14:00', m: 30, t: 'Kingfisher Refining · plant manager intro', acc: 'kingfisher', k: 'Client call', w: 'Linh Pham, Sofia Ahlgren', r: 35, g: 'Introduce the team to the new plant manager', who: ['pavan', 'sofia'] },
  ];
  const myMeets = () => MEETS.filter(x => x.who.includes(isLeader ? 'pavan' : me.id));
  const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
  const hhmm = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  const dayIx = str => { if (!str || /Today/.test(str)) return TODAYI; if (/Tomorrow/.test(str)) return TODAYI + 1; const m = str.match(/\b(Mon|Tue|Wed|Thu|Fri)\b/); return m ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(m[1]) : TODAYI; };
  const KIND_ORD = { Decide: 0, Send: 1, Approve: 1, Reply: 2, Review: 3, Ready: 4 };
  function dayItems() {
    const it = [];
    if (isMgr && !S.camp.c1) it.push({ k: 'Decide', t: 'Confirm the Turnaround season 2027 campaign', m: '11 accounts announced a planned shutdown in 6 days · campaigns of 10 or more start only when you confirm', d: TODAYI, due: 'Today', btn: 'Decide', go: "App.goCampaign('c1','steps')" });
    if (isMgr && !(S.resolvedEsc || {}).meet) it.push({ k: 'Decide', t: 'Confirm the Eastgate meeting counts as qualified', m: 'Eastgate Refining · first meeting held Tue 27 Oct with the expansion lead · confirm within five working days', d: TODAYI, due: 'Tue 3 Nov', btn: 'Confirm', go: "App.resolveEsc('meet','Confirmed as a qualified meeting. Logged with who and when.')" });
    if (isMgr) it.push({ k: 'Review', t: 'Coach Marco: 3 approval cards expire Friday', m: 'Meridian, Sunfield and Cinder are waiting on him · open the team view', d: TODAYI, due: 'Fri 30 Oct', btn: 'Open', go: "App.openAppr('team')" });
    if (isMgr && !ACCOUNTS.find(a => a.id === 'banyan' && a.owner === 'aisha')) it.push({ k: 'Decide', t: 'Move Banyan Gas from Kenji to Aisha', m: 'Kenji has 3 items overdue and no meetings yet · Aisha has room this week', d: TODAYI, due: 'Today', btn: 'Decide', go: "App.reassign(['banyan','coralbay'],'aisha')" });
    it.push({ k: 'Decide', t: 'Pick the Cedar angle: switch at contract end, or migrate in phases', m: 'Cedar Petrochemicals · Mei Tan opened the comparison twice · decide before Friday', d: 3, due: 'Thu 29 Oct', acc: 'cedar', btn: 'Decide', go: "App.openRecord('cedar','engage')" });
    myReplies().filter(r => r.kind === 'Positive' && !S.handled[r.id]).forEach(r => it.push({ k: 'Reply', t: `Answer ${r.from} · ${acct(r.acc).name}`, m: `Said yes: "${r.text.length > 80 ? r.text.slice(0, 78) + '…' : r.text}"${isMgr ? ' · ' + first(USERS[r.owner].name) : ''}`, d: TODAYI, due: /Today/.test(r.at) ? 'Today' : 'Overdue', acc: r.acc, btn: isMgr ? 'Open' : 'Reply', go: `App.openThread('${r.id}')` }));
    if (!isMgr) apprItems('todo').forEach(a => { if (S.decisions[a.id]) return; it.push({ k: 'Decide', t: `${a.nba.action} · ${a.name}`, m: `${a.contact.name} · ${reasonOf(a)} · approval card`, d: TODAYI, due: a.nba.due || DUE3, acc: a.id, btn: 'Decide', go: `App.openRecord('${a.id}','engage')`, sc: a.score }); });
    if (!isMgr) campDue().filter(x => x.st.s === 'due' && x.a.owner === me.id).forEach(x => it.push({ k: 'Send', t: `Campaign touch ${x.i + 1} · ${x.a.name}`, m: `${x.a.contact.name} · Turnaround season 2027 · ${campOf('c1').touches[x.i].ch} · re-checked just now`, d: TODAYI, due: 'Today', acc: x.a.id, btn: 'Send', go: `App.campSend('${x.a.id}',${x.i})`, sc: x.a.score }));
    if (!isMgr) apprItems('ready').forEach(a => it.push({ k: 'Send', t: `${a.nba.action} · ${a.name}`, m: `${a.contact.name} · ${a.whyNow ? a.whyNow.type : ''} · confidence: ${conf1(a).band.toLowerCase()} · meets all five criteria, no approval card`, d: TODAYI, due: 'Today', acc: a.id, btn: 'Send', go: `App.send1('${a.id}')`, sc: a.score }));
    if (isMgr || acct('sapphire').owner === me.id) it.push({ k: 'Review', t: 'Going cold · Sapphire Aromatics', m: 'Opened the switch comparison 3 times, no reply · a LinkedIn nudge is drafted', d: TODAYI, due: 'Today', acc: 'sapphire', btn: 'Review the nudge', go: "App.openRecord('sapphire','activity')" });
    it.push({ k: 'Review', t: 'What happened? · Quartz Olefins comparison', m: 'Downloaded 4 days ago, nothing logged since · one click tells the AI', d: 2, due: 'Wed 28 Oct', btn: 'Log the outcome', go: "App.ask('What happened with the Quartz Olefins comparison?')" });
    it.push({ k: 'Ready', t: 'Follow-ups after the Ironwood meeting', m: 'Ironwood Refining · the AI drafted the recap and the next step from the call notes', d: 2, due: 'Wed 28 Oct', acc: 'ironwood', btn: 'Open follow-ups', go: "App.openRecord('ironwood','activity')" });
    it.push({ k: 'Review', t: '5 new prospects to qualify', m: 'Found by the weekly prospect refresh · best fit 81%', d: 3, due: 'Thu 29 Oct', btn: 'Review', go: "App.ask('Find prospects like my last 10 wins')" });
    return it.map(x => Object.assign(x, { d: Math.max(TODAYI, Math.min(4, x.d)) })).sort((p, q) => p.d - q.d || KIND_ORD[p.k] - KIND_ORD[q.k] || (q.sc || 0) - (p.sc || 0));
  }
  const KTAG = { Decide: 'neg', Send: 'pos', Approve: 'warn', Reply: 'pos', Review: 'sec', Ready: 'pos' };
  const ktag = k => `<span class="yk ${KTAG[k]}">${k}</span>`;
  function yourDay() {
    const all = dayItems(), items = all.filter(x => dayFilt === 'all' || x.k === dayFilt), cnt = k => all.filter(x => x.k === k).length;
    const kinds = ['Decide', 'Send', 'Reply', 'Review'].filter(cnt);
    const head = `<div class="yd-h"><div><div class="bsec-t">Your week</div><div class="yd-s">${kinds.map(k => `${cnt(k)} to ${k.toLowerCase()}`).join(' · ')} · most urgent first</div></div>
      <div class="yd-c"><span class="yd-f">${[['all', `All · ${all.length}`]].concat(kinds.map(k => [k, `${k} · ${cnt(k)}`])).map(([k, l]) => `<button class="${dayFilt === k ? 'on' : ''}" onclick="App.setDay(null,'${k}')">${l}</button>`).join('')}</span>
</div></div>`;
    return head + listView(items);
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
        <section class="bsec"><div class="bsec-h">Funnel</div>${funnelTile()}</section>
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
    if (v === 'inbox') { const th = threads(); return card('Inbox', `${th.filter(needsReply).length} need a reply`, th.slice(0, 6).map(r => `<div class="mini-row row-link" onclick="App.openThread('${r.id}')">${chIc(r.ch)}<div class="grow"><div class="nm">${esc(r.from)} <span class="muted" style="font-weight:400">· ${esc(acct(r.acc).name)}</span></div><div class="sm">"${esc(r.text)}"</div></div><span class="badge ${S6[st6(r)][0]}">${st6(r)}</span></div>`).join('') || '<div class="empty">No replies yet.</div>'); }
    if (v === 'analytics') return card('This week', isMgr ? 'whole team' : 'your numbers', (sum => [['Meetings this week', `${sum('meetings')} / ${sum('target')}`], ['Reply rate', pct(sum('replies'), sum('sent'))], ['Accepted first time', Math.round(sum('accept') / (isMgr ? REPS.length : 1)) + '%'], ['Overdue items', sum('overdue')]])(k => (isMgr ? REPS : [me.id]).reduce((x, r) => x + TEAM_STATS[r][k], 0)).map(([k, x]) => `<div class="mini-row"><div class="grow nm">${k}</div><b class="mono">${x}</b></div>`).join(''));
    const items = apprItems(isMgr ? 'needs' : 'todo'), oth = escOther();
    return card('Needs you', `${items.length + oth.length} waiting`, items.length + oth.length ? items.map(apprMini).join('') + oth.map(escMini).join('') : '<div class="empty">Nothing is waiting for you.</div>');
  }
  function seqCard(c, intro) {
    return `<p>${intro}</p><div class="ccard"><div class="ccard-h"><span class="t">${ic('megaphone', 14)} ${esc(c.name)}</span>${campBadge(c)}</div><div class="ccard-b" style="padding:2px 14px">
      ${seqOf(c).map((t, i) => `<div class="mini-row">${chIc(t.ch)}<div class="grow"><div class="nm">Step ${i + 1} · Day ${t.day} · ${t.ch} · ${esc(t.fmt)}</div><div class="sm">${esc(t.t)}</div></div></div>`).join('')}</div>
      <div class="ccard-f">${openBtn('Edit the steps', `App.goCampaign('${c.id}','steps')`)}${c.status === 'Running' || c.status === 'Completed' || S.camp[c.id] ? '' : isMgr ? `<button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm campaign</button>` : c.status === 'Draft' ? `<button class="btn sm pri" onclick="App.sendForConfirm('${c.id}')">Send to Daniel to confirm</button>` : ''}</div></div>`;
  }
  const escMini = x => `<div class="mini-row"><div class="grow"><div class="nm">${esc(x[2])}</div><div class="sm">${esc(x[3])}</div></div><span class="badge b-warn nodot">${esc(x[4])}</span><button class="btn sm" onclick="${x[6] || `App.resolveEsc('${x[0]}','Done. Logged with who and when.')`}">${esc(x[7])}</button></div>`;
  function apprMini(a) {
    const d = S.decisions[a.id];
    return `<div class="mini-row"><div class="grow row-link" onclick="App.openRecord('${a.id}','engage')"><div class="nm">${esc(a.contact.name)} · ${esc(a.name)}</div><div class="sm">${esc(a.nba.action)}${isMgr ? ' · ' + esc(first(USERS[a.owner].name)) : ''}</div></div>
      <span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a)}</span>
      ${d ? `<span class="badge b-grey nodot">${decLabel(d)}</span>` : a.nba.status === 'sent' ? '<span class="badge b-sec">Sent</span>' : a.nba.status === 'auto' ? `<button class="btn sm pri" onclick="event.stopPropagation();App.send1('${a.id}')">Send</button>` : `${!a.nba.reason || (isMgr && a.nba.sensitive) ? `<button class="btn sm pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : 'Approve'}</button>` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','engage')">Review</button>`}</div>`;
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
        <div class="ccard-f">${a.nba.status === 'sent' || a.nba.status === 'auto' ? `<span class="badge b-sec">${a.nba.status === 'sent' ? esc(a.outcome || 'Sent') : 'Ready to send'}</span>` : dec ? `<span class="badge b-grey nodot">${decLabel(dec)}</span>` : `<button class="btn sm pri" onclick="App.approve('${a.id}')">${a.nba.sensitive && !isMgr ? 'Approve → to Daniel' : a.nba.sensitive ? 'Sign off' : 'Approve'}</button>`}
          ${openBtn('Edit', `App.openRecord('${a.id}','engage')`)}${btn('Shorter', 'Make it shorter')}<button class="btn sm" onclick="App.useRunnerUp('${a.id}')">Runner-up</button></div></div>`;
  }

  /* Scripted understanding of what the seller typed. */
  function findAccount(t) {
    const word = w => new RegExp('\\b' + w.toLowerCase() + '\\b').test(t);
    return ACCOUNTS.find(a => word(a.name.split(' ')[0])) || ACCOUNTS.find(a => !a.generated && word(a.contact.name.split(' ')[0]));
  }
  function findCampaign(t) { return /turnaround/.test(t) ? 'c1' : /renewal|rival|contract/.test(t) ? 'c2' : /expansion|capex/.test(t) ? 'c3' : /hiring|surge/.test(t) ? 'c5' : null; }
  function addList(name, kind, note, ids) { const id = 'U' + (S.lists.length + 1); S.lists.unshift({ id, name, kind, by: 'Chat', when: 'Today', note, ids }); return id; }
  /* ─── ICP interview: a conversation. The AI asks open questions one at a time, builds on each answer,
     proposes when the user is unsure, shows the ICP to confirm, then finds prospects in the same chat. ─── */
  const IV_ORDER = ['prod', 'ind', 'geo', 'size', 'roles', 'sig', 'excl'];
  const IV_X = {
    ind: [[/refin/, 'Refining'], [/petro|chemical/, 'Petrochemicals'], [/\bgas\b|gas process/, 'Gas processing'], [/\blng\b/, 'LNG'], [/power|utilit|energy/, 'Power and utilities'], [/software|saas|tech/, 'Software'], [/bank|financ|fintech|insur/, 'Financial services'], [/health|hospital|clinic/, 'Healthcare'], [/pharma|life science/, 'Pharmaceuticals'], [/manufactur|factor/, 'Manufacturing'], [/retail|e-?commerce/, 'Retail'], [/logistic|shipping|freight/, 'Logistics'], [/mining|mine/, 'Mining'], [/telecom/, 'Telecommunications'], [/educat|universit|school/, 'Education'], [/food|beverage/, 'Food and beverage'], [/water|wastewater/, 'Water'], [/steel|metal/, 'Metals'], [/cement|construct/, 'Construction materials']],
    geo: [[/singapore/, 'Singapore'], [/malaysia|kuala/, 'Malaysia'], [/thailand|bangkok/, 'Thailand'], [/indonesia|jakarta/, 'Indonesia'], [/vietnam/, 'Vietnam'], [/philippines|manila/, 'Philippines'], [/australia|sydney|melbourne/, 'Australia'], [/india\b|mumbai|delhi|bangalore/, 'India'], [/japan|tokyo/, 'Japan'], [/korea/, 'South Korea'], [/china/, 'China'], [/middle east|gulf|uae|saudi|qatar/, 'Middle East'], [/europe|\beu\b/, 'Europe'], [/\buk\b|united kingdom|britain/, 'United Kingdom'], [/\bus\b|usa|united states|america/, 'United States'], [/asean|south-?east asia|\bsea\b/, 'Southeast Asia']],
    roles: [[/plant (head|manager)|site (head|manager)/, 'Plant head'], [/reliab/, 'Reliability leader'], [/operat/, 'Operations manager'], [/i&c|instrument|control engineer|technical/, 'Technical lead (I&C)'], [/procure|purchas|sourcing/, 'Procurement'], [/hse|environment|sustainab|esg|safety/, 'HSE and sustainability lead'], [/maint/, 'Maintenance manager'], [/\bcto\b|chief tech/, 'CTO'], [/\bcfo\b|financ/, 'Finance leader'], [/\bceo\b|founder|owner|managing director/, 'CEO or managing director'], [/\bcoo\b/, 'COO'], [/\bit (team|leader|head|manager|director)\b|\bcio\b|information tech/, 'IT leader'], [/marketing|cmo/, 'Marketing leader'], [/sales|revenue|cro\b/, 'Sales leader'], [/engineer/, 'Engineering manager']],
    sig: [[/new (leader|hire|head|coo|ceo|cto|manager)|joined|appoint/, 'New leader'], [/turnaround|shutdown|outage plan/, 'Turnaround announced'], [/rival|competitor|contract (end|renew|expir)|renewal/, 'Rival contract ending'], [/expan|capex|new plant|new site|build/, 'Expansion approved'], [/hiring|recruit|job post/, 'Hiring surge'], [/pricing|website visit|demo request/, 'Pricing-page visit'], [/regulat|complian|deadline|audit|reporting rule|mandate/, 'Regulation deadline'], [/fund|raised|investment round/, 'New funding'], [/acqui|merger|m&a/, 'Merger or acquisition'], [/incident|failure|trip|breakdown|leak|fine\b|penalt/, 'Recent incident']],
    excl: [[/customer/, 'Existing customers (CRM)'], [/open deal|pipeline|in deal/, 'Accounts with an open deal'], [/competitor|partner/, 'Competitors and partners'], [/(under|below|less than|smaller than) ?(\d[\d,]*)/, null]],
  };
  const ivVague = s => /^(not sure|no idea|unsure|idk|dunno|any(thing| of them)?|whatever|no preference|you (tell|decide|suggest|choose|pick)|suggest|help)\b|not sure|don.?t know|no idea|you suggest|up to you/.test(s);
  const ivYes = s => /^(yes|yep|yeah|yup|sure|ok(ay)?|sounds (good|right)|go (with|for) (that|it)|that works|correct|right|fine|perfect|do it|go ahead|agreed|exactly|great)\b/.test(s);
  const ivList = a => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const ivCap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const ivProdShort = a => { const s = (a.prod || 'your product').replace(/^(it|we|our product|the product)\s+(is|does|helps|lets)\s+/i, '').split(/[.;\n]/)[0].trim(); return s.length > 80 ? s.slice(0, 78).replace(/\s+\S*$/, '') + '…' : s; };
  const ivKind = a => { const s = ((a.prod || '') + ' ' + (a.ind || []).join(' ')).toLowerCase(); return /emission|carbon|methane|flare|esg|sustainab/.test(s) ? 'emis' : /migrat|control system|dcs|scada|automation/.test(s) ? 'ctrl' : /reliab|predict|asset.health|vibration|maintenance|condition monitor/.test(s) ? 'rel' : /instrument|analy[sz]er|sensor/.test(s) ? 'inst' : /software|saas|platform|app\b|crm|analytics|\bai\b/.test(s) ? 'sw' : 'gen'; };
  function ivPick(k, text) {
    const s = text.toLowerCase();
    if (k === 'size') { const m = s.match(/(\d[\d,.]*)\s*(k\b)?\s*(?:-|–|to)\s*(\d[\d,.]*)\s*(k\b)?/), one = s.match(/(\d[\d,.]*)\s*(k\b)?\s*\+?\s*(staff|employees|people|headcount)?/);
      if (m) { const f = (n, k2) => Math.round(parseFloat(n.replace(/,/g, '')) * (k2 ? 1000 : 1)).toLocaleString('en-US'); return `${f(m[1], m[2])}–${f(m[3], m[4])} staff`; }
      if (/mid-?(size|market)|medium/.test(s)) return '300–5,000 staff'; if (/enterprise|large|big/.test(s)) return '5,000+ staff'; if (/small|smb|startup/.test(s)) return 'Under 300 staff';
      if (one && /staff|employees|people|headcount|\+|over|more than|at least|above/.test(s)) return `${Math.round(parseFloat(one[1].replace(/,/g, '')) * (one[2] ? 1000 : 1)).toLocaleString('en-US')}+ staff`;
      if (/site|plant/.test(s) && one) return `${one[1]}+ sites`; return ''; }
    if (k === 'prod') return text.trim().replace(/^(find prospects|build a campaign):\s*/i, '');
    const hits = []; (IV_X[k] || []).forEach(([re, v]) => { if (k === 'excl' && !v) { const m = s.match(re); if (m) hits.push(`Sites under ${m[2]} staff`); return; } if (re.test(s) && !hits.includes(v)) hits.push(v); });
    if (k === 'geo' && hits.includes('Southeast Asia')) { const named = hits.filter(x => x !== 'Southeast Asia'); return named.length ? named : ['Singapore', 'Malaysia', 'Thailand', 'Indonesia', 'Vietnam', 'Philippines']; }
    return hits;
  }
  function ivRaw(text) { return text.replace(/^(find prospects|build a campaign):\s*/i, '').split(/,|;|\/|\band\b|\n/).map(x => x.trim().replace(/^(mostly|mainly|probably|maybe|i think|we sell to|in|the)\s+/i, '').replace(/[.!?]+$/, '')).filter(x => x && x.length < 48).slice(0, 4).map(ivCap); }
  const ivEmpty = (a, k) => Array.isArray(a[k]) ? !a[k].length : !a[k];
  function ivPropose(a, k) {
    const kd = ivKind(a), ind0 = (a.ind[0] || 'these').toLowerCase();
    if (k === 'ind') return { v: { emis: ['Gas processing', 'Refining'], ctrl: ['Refining', 'Petrochemicals'], rel: ['Refining', 'LNG'], inst: ['Petrochemicals', 'Gas processing'], sw: ['Software', 'Financial services'], gen: ['Refining', 'Petrochemicals'] }[kd], why: { emis: 'where emissions reporting is tightest', ctrl: 'where ageing control systems are most common', rel: 'where unplanned downtime costs the most', inst: 'where analyser fleets are largest', sw: 'where teams adopt new tools fastest', gen: 'where our current accounts are' }[kd] };
    if (k === 'geo') return { v: ['Singapore', 'Malaysia', 'Thailand'], why: 'where the team already sells and can support customers' };
    if (k === 'size') return { v: kd === 'sw' ? '200–2,000 staff' : '1,000–5,000 staff', why: 'big enough to feel the problem, small enough to decide quickly on something new' };
    if (k === 'roles') return { v: { emis: ['HSE and sustainability lead', 'Plant head'], ctrl: ['Technical lead (I&C)', 'Plant head'], rel: ['Reliability leader', 'Operations manager'], inst: ['Technical lead (I&C)', 'Maintenance manager'], sw: ['IT leader', 'COO'], gen: ['Operations manager', 'Plant head'] }[kd], why: `the person who lives with the problem and the one who usually signs at ${ind0} companies` };
    if (k === 'sig') return { v: { emis: ['Regulation deadline', 'Expansion approved'], ctrl: ['Rival contract ending', 'Turnaround announced'], rel: ['Turnaround announced', 'Recent incident'], inst: ['Expansion approved', 'Turnaround announced'], sw: ['New leader', 'New funding'], gen: ['New leader', 'Expansion approved'] }[kd], why: 'the moments buyers of something like this usually act' };
    return { v: ICX.slice(), why: 'the usual exclusions' };
  }
  function ivQuestion(a, k, lead) {
    const ps = ivProdShort(a), kd = ivKind(a), ind0 = (a.ind[0] || 'a target').toLowerCase();
    const Q = {
      prod: `${lead ? '' : ''}First, tell me about the product. What does it do, and what problem does it solve for the customer?`,
      ind: `Who feels that problem most? Tell me the industries or the kinds of company you have in mind.`,
      geo: `Where should we look? Name the countries or regions you can sell into and support.`,
      size: `How big does a company need to be to buy this? A rough staff count, revenue or number of sites is enough.`,
      roles: `Inside ${/^[aeiou]/.test(ind0) ? 'an' : 'a'} ${ind0} company, who lives with the problem day to day, and who signs off the purchase?`,
      sig: `What usually happens at a company just before it needs ${ps.length > 40 ? 'something like this' : ps.charAt(0).toLowerCase() + ps.slice(1).replace(/[.…]+$/, '')}? That's what I'll watch for as the sign they're ready now.${kd === 'emis' ? " With emissions it's often a new reporting rule or an audit; is that what you see, or something else?" : kd === 'ctrl' ? " For control systems it's often a vendor contract coming up or a planned shutdown; does that match?" : kd === 'rel' ? " For reliability it's often a planned turnaround or a recent unplanned trip; does that match?" : ''}`,
      excl: `Last one: is there anyone I should leave out of the search?`,
    };
    return Q[k];
  }
  function ivAck(a, k) {
    if (k === 'prod') return `Got it: <b>${esc(ivProdShort(a).replace(/[.…]+$/, ''))}</b>.`;
    if (k === 'size') return `${esc(a.size)}, noted.`;
    if (k === 'excl') return a.excl.length ? `I'll leave out ${esc(ivList(a.excl).toLowerCase().replace('(crm)', '(CRM)'))}.` : `No exclusions beyond the usual: I'll still skip your current customers.`;
    return `${esc(ivList(a[k]))}, noted.`;
  }
  function ivCrit(a) {
    return [a.prod ? 'Sells: ' + ivProdShort(a) : null, a.ind.length ? 'Industries: ' + a.ind.join(', ') : null, a.geo.length ? 'Where: ' + a.geo.join(', ') : null, a.size ? 'Size: ' + a.size : null, a.roles.length ? 'Who buys: ' + a.roles.join(', ') : null, a.sig.length ? 'Ready now when: ' + a.sig.join(', ').toLowerCase() : null, a.excl.length ? 'Leave out: ' + a.excl.join(', ').toLowerCase().replace('(crm)', '(CRM)') : null].filter(Boolean);
  }
  function ivCard(a) {
    return `<p>Here's the ICP from what you told me. Nothing is searched until you confirm it.</p>${icpCard(ivCrit(a), 'Proposed ICP · from this conversation', `<button class="btn sm pri" onclick="App.ask('Confirm the ICP')">${ic('check', 13)} Confirm the ICP</button><span class="sm muted" style="margin-left:6px">or tell me what to change, in your own words</span>`)}`;
  }
  /* fill other fields the answer also mentions (e.g. "refineries in Thailand" answers where too) */
  const IV_LBL = { ind: 'industries', geo: 'where', roles: 'who buys', sig: 'buying signals', size: 'size' };
  function ivSpill(a, text, except) { const got = []; (except === 'prod' ? ['ind', 'geo'] : ['ind', 'geo', 'roles', 'sig']).forEach(k => { if (k !== except && ivEmpty(a, k)) { const h = ivPick(k, text); if (h.length) { a[k] = h; got.push(`${IV_LBL[k]}: ${ivList(h)}`); } } }); if (except !== 'size' && !a.size) { const z = ivPick('size', text); if (z && /staff|employ|people|size|sites|plants/.test(text.toLowerCase())) { a.size = z; got.push('size: ' + z); } } return got; }
  const ivAlso = got => got.length ? ` I've also noted ${esc(got.join('; '))}.` : '';
  function ivNext(I, pre) {
    const a = I.a, k = IV_ORDER.find(x => ivEmpty(a, x) && !(I.skip || []).includes(x));
    if (!k) { I.ask = 'confirm'; return { kind: 'text', html: `${pre ? `<p>${pre}</p>` : ''}${ivCard(a)}` }; }
    I.ask = k; return { kind: 'text', html: `${pre ? `<p>${pre}</p>` : ''}<p>${esc(ivQuestion(a, k))}</p>` };
  }
  function icpBegin(text) {
    const c = chat(); if (!c) return null;
    const s = text.toLowerCase(), a = { prod: '', ind: [], geo: [], size: '', roles: [], sig: [], excl: [] };
    ivSpill(a, text, null);
    const launch = /new(ly)?\s+(launched\s+)?products?|launch/.test(s);
    c.icpI = { a, ask: null, skip: [], pend: null, launch };
    const got = ivCrit(a).length;
    const intro = `Let's build the ICP together first; then I'll use it to find the prospects. ${launch ? 'A newly launched product has no wins to learn from yet, so your answers set it. ' : ''}I'll ask a few short questions, one at a time. Answer in your own words; say "not sure" and I'll suggest a starting point.${got ? ` From your message I already have ${esc(ivList(ivCrit(a).map(x => x.split(':')[0].toLowerCase())))}.` : ''}`;
    return ivNext(c.icpI, intro);
  }
  function icpTalk(c, text) {
    const I = c.icpI, a = I.a, s = text.toLowerCase().replace(/^(find prospects|build a campaign):\s*/, '').trim();
    if (/^(stop|cancel|never ?mind|forget it|quit)\b/.test(s)) { delete c.icpI; return { kind: 'text', html: 'Stopped the ICP interview. Nothing was saved.' }; }
    if (/\b[a-z0-9-]+\.(com|net|org|io|ai|co|asia|sg|my|example)(\/\S*)?\b/.test(s) && I.ask !== 'done') { delete c.icpI; return null; } /* a web page: draft from it instead */
    if (I.ask === 'done') {
      if (/\b(find|generate|search|look for|get|build|pull|run)\b.*\b(prospects?|leads?|list|accounts|companies|people)\b|^(yes|yep|sure|ok(ay)?|go ahead|do it|please)\b|find (them|those)|prospects? for (this|the|my) icp/.test(s)) return icpProspects(c);
      return null;
    }
    if (I.ask === 'confirm') {
      const change = /\b(add|remove|drop|without|instead|change|replace|only|just|also|not|exclude|include|swap|make it)\b/.test(s);
      if (!change && /confirm|looks good|look good|that'?s (it|right|good)|save( it)?|perfect|approve|^(yes|yep|ok(ay)?|correct|great|good)\b/.test(s)) {
        shared.icps.forEach(x => { if (x.status === 'In use') x.status = 'Superseded'; });
        const v = shared.icps.length + 1; shared.icps.push({ v, crit: ivCrit(a), path: 'From the ICP interview (path A)', by: me.name, at: 'Today', status: 'In use' }); saveShared();
        I.ask = 'done'; I.v = v;
        return { kind: 'text', html: `<p>Saved as <b>ICP v${v}</b>. It's in the ICP library, and every new list starts from it.</p><p>Whenever you're ready, ask me to find the prospects for it, right here in this chat.</p><div class="next-row"><button class="btn sm pri" onclick="App.ask('Find prospects for this ICP')">${ic('users', 13)} Find prospects for this ICP</button></div>` };
      }
      let hit = false; const rm = /\b(remove|drop|without|not|exclude)\b/.test(s), only = /\b(only|just|instead|replace|change .* to|make it|swap)\b/.test(s);
      ['ind', 'geo', 'roles', 'sig'].forEach(k => { const h = ivPick(k, text); if (!h.length) return; hit = true; a[k] = rm ? a[k].filter(x => !h.includes(x)) : only ? h : a[k].concat(h.filter(x => !a[k].includes(x))); });
      const z = ivPick('size', text); if (z) { a.size = z; hit = true; }
      if (/product|sell/.test(s) && /:/.test(text)) { a.prod = text.split(':').slice(1).join(':').trim(); hit = true; }
      return hit ? { kind: 'text', html: `<p>Updated.</p>${ivCard(a)}` } : { kind: 'text', html: '<p>Which part should change? Tell me in your own words, for example the region, the company size or who buys, and I will update the ICP.</p>' };
    }
    const k = I.ask;
    if (I.pend && I.pend.k === k) {
      const P = I.pend; I.pend = null;
      if (ivYes(s) || ivVague(s)) { a[k] = P.v; return ivNext(I, `Going with ${esc(Array.isArray(P.v) ? ivList(P.v) : P.v)}.`); }
    }
    if (/^(skip|pass|next|no idea, skip)\b/.test(s)) { I.skip.push(k); return ivNext(I, 'Skipped; we can add it later.'); }
    if (k !== 'prod' && ivVague(s)) { const P = ivPropose(a, k); I.pend = { k, v: P.v }; return { kind: 'text', html: `<p>No problem. From what you've told me, I'd start with <b>${esc(Array.isArray(P.v) ? ivList(P.v) : P.v)}</b>: ${esc(P.why)}. Shall I go with that, or would you change it?</p>` }; }
    if (k === 'excl') { const h = ivPick('excl', text); a.excl = /^(no|none|nobody|nothing|no one|not really)\b/.test(s) ? ICX.slice(0, 1) : h.length ? h : ivRaw(text); if (!a.excl.length) a.excl = ICX.slice(0, 1); return ivNext(I, ivAck(a, 'excl')); }
    if (k === 'size') { const z = ivPick('size', text); if (!z) { const P = ivPropose(a, 'size'); I.pend = { k, v: P.v }; return { kind: 'text', html: `<p>I couldn't read a size from that. I'd suggest <b>${esc(P.v)}</b>: ${esc(P.why)}. Shall I go with that, or give me a rough number?</p>` }; } a.size = z; const g2 = ivSpill(a, text, 'size'); return ivNext(I, ivAck(a, 'size') + ivAlso(g2)); }
    if (k === 'prod') { if (ivVague(s) || s.length < 4) return { kind: 'text', html: '<p>Even a sentence helps: what does it do, and who is it for? For example, what a customer could stop worrying about once they have it.</p>' }; a.prod = ivPick('prod', text); const g2 = ivSpill(a, text, 'prod'); return ivNext(I, ivAck(a, 'prod') + ivAlso(g2)); }
    const h = ivPick(k, text); a[k] = h.length ? h : ivRaw(text);
    if (!a[k].length) return { kind: 'text', html: `<p>Sorry, I didn't catch that. ${esc(ivQuestion(a, k))}</p>` };
    const g2 = ivSpill(a, text, k); return ivNext(I, ivAck(a, k) + ivAlso(g2));
  }
  function icpProspects(c) {
    const I = c.icpI, a = I.a, s0 = (a.ind.join(' ') + ' ' + (a.prod || '')).toLowerCase();
    const industry = /refin|petro|chemical|\bgas\b|lng/.test(s0) ? 'Refining & petrochemicals' : /power|energy|utilit/.test(s0) ? 'Energy' : /financ|bank|insur/.test(s0) ? 'Financial services' : /health|pharma/.test(s0) ? 'Healthcare' : /manufactur|metal|cement/.test(s0) ? 'Manufacturing' : /retail/.test(s0) ? 'Retail' : /logistic/.test(s0) ? 'Logistics' : /telecom/.test(s0) ? 'Telecommunications' : /educat/.test(s0) ? 'Education' : /software|saas|tech/.test(s0) ? 'Technology' : 'Refining & petrochemicals';
    const g0 = (a.geo[0] || 'Singapore').toLowerCase(), loc = CITIES[g0] || COUNTRIES[g0] || [a.geo[0] || 'Singapore', a.geo[0] || 'Singapore'], r0 = a.roles[0] || 'Operations manager';
    const fn = /Reliab/.test(r0) ? 'Reliability' : /Operat|Plant|COO/.test(r0) ? 'Operations' : /Technical|Engineer|CTO/.test(r0) ? 'Engineering' : /HSE|sustain/i.test(r0) ? 'Sustainability' : /Maint/.test(r0) ? 'Maintenance' : /IT /.test(r0 + ' ') ? 'IT' : /Finance/.test(r0) ? 'Finance' : /Marketing/.test(r0) ? 'Marketing' : /Sales/.test(r0) ? 'Sales' : /Procure/.test(r0) ? 'Procurement' : 'Operations';
    const lvl = /Plant head|leader|lead\b|CEO|COO|CTO/.test(r0) ? 'Head' : 'Manager';
    const icp = { city: loc[0], country: loc[1], industry, fn, lvl, sig: sigOfPrompt(a.sig.join(' ').toLowerCase()) };
    const id = 'Q' + (S.genLists.length + 1) + Date.now().toString(36).slice(-4), v = I.v || icpNow().v;
    const g = { id, q: `ICP v${v}: ${ivCrit(a).slice(0, 4).join(' · ')}`, icp, owner: me.id, title: `ICP v${v} prospects · ${a.ind.slice(0, 2).join(' & ') || industry} · ${a.geo.slice(0, 2).join(', ') || loc[1]}` };
    S.genLists.push(g); genList(g); listSel = id; accSub = 'list'; c.listId = id; I.listId = id;
    /* keep the list inside the agreed ICP: every country named, and the size range */
    const rng = (a.size.match(/([\d,]+)\D+([\d,]+)/) || []).slice(1).map(x => +x.replace(/,/g, '')), lo1 = (a.size.match(/([\d,]+)\+/) || [])[1];
    ACCOUNTS.filter(x => x.fromList === id).forEach((x, i) => {
      const gname = a.geo.length ? a.geo[i % a.geo.length] : null, L = gname ? CITIES[gname.toLowerCase()] || COUNTRIES[gname.toLowerCase()] : null; if (L) { x.city = L[0]; x.country = L[1]; } else if (gname) { x.country = gname; }
      const sfx = String(x.size).replace(/^[\d,\s]+/, ''), n0 = parseInt(String(x.size).replace(/[^\d]/g, ''), 10) || 1000; if (rng.length === 2) x.size = (rng[0] + (n0 * 7919 + i * 613) % Math.max(1, rng[1] - rng[0])).toLocaleString('en-US') + (sfx ? ' ' + sfx.trim() : ''); else if (lo1) { const lo = +lo1.replace(/,/g, ''); if (n0 < lo) x.size = (lo + n0).toLocaleString('en-US') + (sfx ? ' ' + sfx.trim() : ''); }
    });
    const who = lvl === 'Head' ? `Heads of ${fn}` : `${fn} managers`;
    return { kind: 'prospects', open: 'prospects', steps: [`Used ICP v${v}, the one we just agreed: ${esc(ivCrit(a).slice(1, 4).join(' · '))}`, `Turned it into a filter: ${esc(who)} · ${esc(a.geo.join(', ') || loc[1])} · ${esc(a.ind.join(', ') || industry)}${a.size ? ' · ' + esc(a.size) : ''}${a.sig.length ? ' · ready now: ' + esc(a.sig.join(', ').toLowerCase()) : ''}`, 'Searched the primary contact provider, then the fallback for the misses', 'Cross-checked fallback hits and gave everyone an identity tier', `Removed ${esc(ivList(a.excl.length ? a.excl : ['existing customers']).toLowerCase())}`] };
  }
  function respond(text) {
    { const ci = chat(); if (ci && ci.icpI) { const r = icpTalk(ci, text); if (r) return r; } }
    { const mx = fxAsk(text.toLowerCase().trim()); if (mx) return mx; }
    const t = text.toLowerCase(), lk = lastKind(), v = view();
    if (/datasheet|knowledge hub|what does (the|our) .*(say|claim)|case study say/.test(t)) return /support|sla|response time|downtime|trip/.test(t) ? { kind: 'text', html: `From the Knowledge Hub: <i>"Sites that planned the cut-over around a shutdown cut unplanned trips by 18% in the first year."</i> <span class="badge b-sec nodot">CL-07 case study, page 3</span> Approved claim, reviewed Sep 2026.` } : { kind: 'text', html: 'Not found in the Knowledge Hub, so I won\'t answer from memory. I added the question to the content backlog.' };
    const fmt = fmtOf(t);
    if (fmt && /write|make|create|generate|draft|build|turn|design|produce/.test(t)) { startDoc(fmt, text); return { kind: 'text', html: `Started a <b>${esc(fmt.toLowerCase())}</b> in Content studio, in the brand template, grounded in the Knowledge Hub with every claim cited. Change it by talking to it.` }; }
    const wf = workflow(t); if (wf) return wf;
    if (v === 'studio') return studioRespond(t, text);
    const pf = perfChat(t); if (pf) return pf;
    if (v === 'analytics' && !/stuck|moved into pipeline|what moved|autonomy|agents do/.test(t) || /\banalytics\b|dashboard|\bkpis?\b|\bmetrics\b/.test(t)) { const r = anRespond(t); if (r) return r; }
    const cc = chat();
    if (/remind me/.test(t)) { const when = (text.match(/remind me (on |at )?(.+?)( to |\.|$)/i) || [])[2] || 'tomorrow 09:00'; if (cc) cc.reminder = when.replace(/\bat\b/, '').trim(); const nt = text.match(/note:?\s*(.+)$/i); if (nt && cc) (cc.notes = cc.notes || []).push(nt[1]); return { kind: 'reminder', when: cc ? cc.reminder : when, extra: nt ? nt[1] : '' }; }
    if (/^note:|note to self|make a note/.test(t)) { const n = text.replace(/^(note:|note to self:?|make a note:?)\s*/i, ''); if (cc) (cc.notes = cc.notes || []).push(n); return { kind: 'note', text: n }; }
    if (/catch me up|what happened|since (i|you) (last )?logged/.test(t)) return { kind: 'catchup' };
    if (cc && cc.obj && /left|progress|where are we|status/.test(t)) return { kind: 'objCatchup' };
    if (cc && cc.obj && /on (their|its) own|went ahead/.test(t)) return { kind: 'text', html: `On this objective the AI did ${objDone(cc).filter(id => id !== 'saltmarsh').length} of the ${objDone(cc).length} done items on its own (marked ${mkAI()}). The rest were done or decided by a person (${mkHu('Person')}).` };
    if (/autonomy|how much .*(on (their|its) own|alone)|agents do (alone|on their own)/.test(t)) return { kind: 'autonomy' };
    if (/stuck|moved into pipeline|what moved|pipeline .*(moved|influenc)/.test(t)) return { kind: 'stuck', steps: ["Pulled this week's outcomes from campaigns and next best actions", 'Looked for accounts with touches but no reply, and reps with overdue work', 'Ranked them by what is at stake'] };
    if (/draft a follow-?up/.test(t)) { const ac = findAccount(t) || (ctx ? acct(ctx) : null) || (recId ? acct(recId) : null) || acct('sapphire'); return { kind: 'followUp', id: ac.id, steps: ['Read the last touchpoint and what happened after it', 'Picked the proven structure for ' + (ac.segment || 'this account'), 'Ran the brand voice and approved-claims checks'] }; }
    if (/change the channel/.test(t)) { const ac = findAccount(t) || (ctx ? acct(ctx) : null) || acct('sapphire'); return { kind: 'text', html: `Done: the next touch for <b>${esc(ac.name)}</b> goes by <b>LinkedIn</b> from ${esc(first(USERS[ac.owner].name))}'s own account, referencing the comparison ${esc(first(ac.contact.name))} opened. It waits for ${isMgr && ac.owner !== me.id ? first(USERS[ac.owner].name) : 'you'} to approve, because the channel changed. <br><button class="btn sm" style="margin-top:8px" onclick="App.openRecord('${ac.id}','engage')">Open the draft</button>` }; }
    if (/last touch/.test(t)) { const ac = findAccount(t) || (ctx ? acct(ctx) : null) || (recId ? acct(recId) : null) || acct('sapphire'); return { kind: 'lastTouch', id: ac.id, steps: ['Pulled the activity for ' + ac.name, 'Matched opens and replies to each touch', 'Checked what was sent with one click and what a person approved'] }; return { kind: 'text', html: `The last touchpoints for <b>${esc(ac.name)}</b> are open beside the chat, newest first. Open any step to read the message.` }; }
    if (/emails? .*(receiv|today|got)|my inbox|pull .*(emails|repl)/.test(t)) return { kind: 'replies' };
    const tch = t.match(/add an? (email|linkedin) (touch|step)/);
    if (tch) {
      const cid = findCampaign(t) || campSel || 'c5', ch = tch[1] === 'email' ? 'Email' : 'LinkedIn';
      editSeq(cid, (sq, c) => sq.push(newTouch(sq, c, ch)));
      return { kind: 'seqChanged', id: cid, note: `Added a ${ch} step at the end of <b>${esc(campOf(cid).name)}</b>. The brand checks still pass. Open the steps to edit the wording.` };
    }
    if (/remove (the )?(last )?(touch|step)/.test(t)) { const cid = findCampaign(t) || campSel || 'c5'; editSeq(cid, sq => { const i = sq.map(x => !/Sent|Done/.test(x.state || '')).lastIndexOf(true); if (i >= 0) sq.splice(i, 1); }); return { kind: 'seqChanged', id: cid, note: `Removed the last unsent step from <b>${esc(campOf(cid).name)}</b>.` }; }
    if ((view() === 'accounts' || view() === 'segments') && !/like (my|our) last|score|micro-?segment|save|assign|send|route|campaign|draft|why|explain/.test(t)) {
      const um = text.match(/\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|ai|co|asia|sg|my|example)(?:\/\S*)?)/i), url = um ? um[1].replace(/^https?:\/\//, '').replace(/[.,)]+$/, '') : null;
      if (url || /\b(icp|ideal customer|interview)\b|^(find|get) (me )?(new |some )?(leads|prospects|accounts)\.?$|build (me )?(a )?(lead )?list|^prospect/.test(t)) {
        if (!url) { const r0 = icpBegin(text); if (r0) return r0; }
        icpStart(text, url); if (view() !== 'accounts') location.hash = '#accounts'; accSub = 'list';
        return { kind: 'text', html: url ? `<p>I read <b>${esc(url)}</b>: what you sell, the industries in its case studies and the roles it speaks to, and drafted an ICP. Check it in the questions below, then I'll save it and find the leads.</p>` : `<p>Let's agree the ICP first, then I'll find the leads. A few questions, just below, with what your message already says filled in. If it's easier, paste your website or a product page and I'll draft the ICP from it.</p>` };
      }
    }
    if (/\b(icp|ideal customer)\b/.test(t)) {
      /* No details given: interview first, then the ICP finds the prospects. A website still drafts from the site. */
      if (!/from (our|the|my) (web)?site/.test(t) && !/^(what|show|which)\b/.test(t.replace(/^(find prospects|build a campaign):\s*/, '')) && /help|find|define|build|create|draft|new|launch|work out|figure|propose|suggest|not sure|don.?t know|interview|set up|start/.test(t) && !/should include|minimum|(icp|ideal customer)[^:]*?(\bis\b|:)\s*\S.{12,}/.test(t)) {
        const launch = /new(ly)? (launched )?product|launch/.test(t);
        { const r0 = icpBegin(text); if (r0) return r0; }
        icpStart(text, null); accSub = 'list';
        return { kind: 'text', html: `<p>Let's work out the ICP together first. ${launch ? 'A newly launched product has no wins to learn from yet, so your answers set it. ' : ''}Five short questions, just below, one at a time: what you sell and the problem it solves, which industries, where, who buys, and the signals that mean they're ready now. Answer what you can or type your own.</p><p>Then I'll save the ICP and use it to find the prospects.</p>` };
      }
      return icpChat(t, text);
    }
    const oneAsk = /\b(send|draft|write)\b.*\b(message|note|email|linkedin)\b.*\bto\b/.test(t) && !/follow-?up|reply/.test(t);
    const buildAsk = oneAsk || /\b(build|create|draft|new|start|launch|run|set up|plan|make)\b.*\b(campaign|sequence|nbc|outreach|next best action|nba|action)s?\b/.test(t) || /^(new|another) (campaign|action)/.test(t);
    if ((buildAsk || (view() === 'campaigns' && !campSel && /campaign|\bnbc\b|webinar|invite|re-?open|next best action|\bnba\b|reach out|note to|get a reply|re-?engage|book (a )?meetings?/.test(t))) && !/^(how|why|what|which)\b|doing|perform|status|explain|^add |^remove |assign|confirm|pause|approve|prepare the next/.test(t)) {
      outKind = (oneAsk || /next best action|\bnba\b|\baction\b|note to|reply from|get a reply|re-?engage|reach out to/.test(t)) && !/campaign/.test(t) ? 'NBA' : 'NBC'; outSel = null; obVal.out = text; campSel = null; campSub = 'list';
      if (view() !== 'campaigns' || !expanded) openMod('campaigns');
      setTimeout(() => App.outStart(text), view() === 'campaigns' ? 0 : 350);
      return { kind: 'text', html: `I'll build ${outKind === 'NBC' ? 'a campaign (NBC)' : 'a next best action (NBA)'}. First, a few questions, just below. I've filled in what your message already says.` };
    }
    const leadsV = view() === 'accounts' || view() === 'segments';
    const leadAsk = leadsV && /refiner|petro|chemical|\bgas\b|lng|plant|sites?\b|compan|accounts|leads|prospects|leader|heads?\b|manager|director|\bvp\b|engineer|thailand|malaysia|singapore|indonesia|vietnam|philippines/.test(t) && !/score|segment|call first|save|assign|send|route|campaign|draft|why|how |explain|what is/.test(t);
    const lookAsk = /like (my|our) last|look ?alike|like (my|our) (best |recent )?(wins|customers)/.test(t);
    const findAsk = /\b(find|look for|search|show me|get me|prospects?|who are|build (me )?a list|list of|new leads)\b/.test(t) && !lookAsk && !/replies|analytics|emails sent|meetings|linkedin touches|sequence|pipeline|hot|stuck|campaign|content|asset|signal on|score this|segment/.test(t);
    const hasCrit = /refin|petro|chemical|\bgas\b|lng|power|plant|reliab|operat|maint|procure|engineer|instrument|turnaround|shutdown|expansion|capex|hiring|new (leader|hire|head)|joined|rival|contract|pricing|migrat|historian|staff|tier|thailand|malaysia|singapore|indonesia|vietnam|philippines|australia|india|japan/.test(t);
    let findIcp = (findAsk || leadAsk) ? parseICP(text) || (hasCrit ? parseICP(text + ' singapore') : null) : null;
    const known = [Object.keys(CITIES).concat(Object.keys(COUNTRIES)).some(k => new RegExp('\\b' + k + '\\b').test(t)), INDUSTRIES.some(([re]) => re.test(t)) || /\blng\b|plant|site/.test(t), FUNCS.some(([re]) => re.test(t)) || /plant (head|manager)|leader|head of|manager|director|\bvp\b/.test(t), !!sigOfPrompt(t)].filter(Boolean).length;
    if ((findAsk || leadAsk) && findIcp && known < 2) { const r0 = icpBegin(text); if (r0) return r0; icpStart(text, null); accSub = 'list'; if (view() !== 'accounts') openMod('accounts'); return { kind: 'text', html: `<p>I need a little more to find the right people. A few questions, just below; I've filled in what your message already says and start where it's missing.</p>` }; }
    if (findIcp && !findIcp.industry) findIcp.industry = 'Refining & petrochemicals';
    if (findIcp && /plant (head|manager)/.test(t)) { findIcp.fn = 'Operations'; findIcp.lvl = 'Head'; }
    if (findIcp && !findIcp.fn) findIcp.fn = 'Reliability';
    if (findIcp) findIcp.sig = sigOfPrompt(t);
    if (findAsk && !findIcp && !hasCrit) { const r0 = icpBegin(text); if (r0) return r0; icpStart(text, null); accSub = 'list'; if (view() !== 'accounts') openMod('accounts'); return { kind: 'text', html: `<p>Who should I look for? I'll build the list from your answers, not from old wins. A few questions, just below, one at a time: what you sell, industries, where, size, who buys, the signals that mean they're ready now, and who to leave out.</p><p>Or just tell me in one line, for example: <i>refineries in Thailand with a new reliability leader</i>, or paste your website and I'll draft the ICP.</p>` }; }
    if (findIcp) {
      const id = 'Q' + (S.genLists.length + 1) + Date.now().toString(36).slice(-4), place = [findIcp.city, findIcp.country !== findIcp.city ? findIcp.country : null].filter(Boolean).join(', ');
      const who = findIcp.lvl === 'Head' ? `Heads of ${findIcp.fn || 'the team'}` : findIcp.lvl === 'Chief' ? `Chief ${findIcp.fn || ''} Officers` : findIcp.lvl === 'VP' ? `VPs of ${findIcp.fn || 'the team'}` : `${findIcp.fn || 'Team'} ${findIcp.lvl.toLowerCase()}s`;
      const g = { id, q: text, icp: findIcp, owner: me.id, title: [who, place, findIcp.industry, findIcp.sig ? findIcp.sig.toLowerCase() : ''].filter(Boolean).join(' · ') };
      S.genLists.push(g); genList(g); if (leadsV) { listSel = id; accSub = 'list'; } if (cc) { cc.listId = id; if (S.chats.includes(cc) && cc.thread.filter(m => m.who === 'me').length <= 1) { cc.title = g.title; cc.naming = false; } }
      return { kind: 'prospects', open: 'prospects', steps: [`Used the confirmed ICP v${icpNow().v} (${esc(icpNow().crit.slice(0, 2).join(', '))}) and your request`, `Turned your request into a filter: ${esc(who)}${place ? ' · ' + esc(place) : ''}${findIcp.industry ? ' · ' + esc(findIcp.industry) : ''}${findIcp.sig ? ' · ready now: ' + esc(findIcp.sig.toLowerCase()) : ''}`, 'Searched the primary contact provider, then the fallback for the misses', 'Cross-checked fallback hits and gave everyone an identity tier', 'Removed existing customers and accounts another rep owns (CRM, read-only)'] };
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
      return { kind: 'text', html: `Done. ${went ? `<b>${went}</b> next best actions were ready to send and went out with your click. ` : ''}I approved the other <b>${wait.length}</b>; they go out in the next send window.${cid ? ` The campaign is ${isMgr ? '<b>confirmed</b>: step 1 goes out tomorrow 09:00' : '<b>with Daniel to confirm</b>'}.` : ''} (Nothing leaves the mock.)` };
    }
    if (/send (an |a )?update|update (daniel|my manager|the team)/.test(t)) {
      const ls = listAccounts(), went = ls.filter(a => a.nba && a.nba.status === 'auto').length, wait = ls.filter(a => a.nba && a.nba.status === 'review' && !S.decisions[a.id]).length, inC = ls.filter(a => a.campaign).length;
      return { kind: 'text', html: `Sent ${isMgr ? 'the team' : 'Daniel'} an update:</p><div class="draft" style="margin-top:8px">${esc(listTitle())}: ${ls.length} people found and scored (${ls.filter(a => a.tier === 'A').length} in tier A). ${inC ? `${inC} share a trigger and are in a draft campaign. ` : ''}${went} next best actions ready to send, ${wait} wait for a decision.</div><p>` };
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
    if (/route|nba and nbc|nbc and nba/.test(t) && !(S.routeOK || {})[listOf()]) { S.routeQ = rqDefaults('route'); save(); return { kind: 'routeQ' }; }
    if (/route|nba and nbc|nbc and nba|micro|segment (this|the|them|it)|create.*segment|group (this|them|the list)/.test(t)) { if (listOf() !== 'L1') routeList(listOf()); const ls = listAccounts(); return { kind: 'listSegments', steps: ['Tagged each account by its strongest trigger', 'Checked each micro-segment against the campaign threshold (10 in 7 days)', `Routed: ${ls.filter(a => a.campaign).length} accounts → one campaign (NBC), ${ls.filter(a => a.nba && !a.campaign).length} → next best actions (NBA)`, 'Drafted the campaign sequence and the next actions · brand checks passed'] }; }
    if (/prepare.*(next )?action|next actions/.test(t) && !/which|with these answers/.test(t) && !(S.nbaOK || {})[listOf()]) { S.routeQ = rqDefaults('nba'); save(); return { kind: 'routeQ' }; }
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
    if (/next best actions doing|how are my (next|actions)|nba.*(doing|deliver)|bounc/.test(t)) { const all = nbaRows(), T = track, b = all.filter(a => T(a).cls === 'b-neg'); if (/bounc/.test(t)) return { kind: 'text', html: b.length ? `${b.length} bounced: ${b.map(a => `<a href="#segments" onclick="App.openRecord('${a.id}','engage');return false">${esc(a.contact.name)} · ${esc(a.name)}</a>`).join(', ')}. The address is being re-checked with the second provider before a retry.` : 'Nothing bounced.' }; return { kind: 'text', html: `${all.length} next best actions this week: ${all.filter(a => T(a).how === 'Ready to send').length} ready to send, ${all.filter(a => T(a).how === 'Sent with one click').length} sent with one click, ${all.filter(a => T(a).stage === 0).length} wait for approval. ${all.filter(a => T(a).stage >= 2).length} delivered, ${all.filter(a => T(a).stage >= 3).length} opened, ${all.filter(a => T(a).stage >= 4).length} replied, ${b.length} bounced. <a href="#segments" onclick="App.openMod('segments');return false">See them by segment</a>` }; }
    if (/went ahead|ready to send/.test(t)) { const w = apprItems('ready'); return { kind: 'text', html: `${w.length} next best actions are ready to send with one click${isMgr ? ' across the team' : ''}, because they meet all five criteria: ${w.slice(0, 5).map(a => `<a href="#approvals" onclick="App.openRecord('${a.id}','engage');return false">${esc(a.name)}</a>`).join(', ')}${w.length > 5 ? ' and more' : ''}.` }; }
    if (/approv|waiting|needs me|needs my/.test(t) && !/approve all/.test(t)) return { kind: 'approvalsList' };
    if (/campaign|sequence|turnaround/.test(t)) return { kind: 'campaign', id: findCampaign(t) || 'c1' };
    if (/learn|worked|working|what changed|readout/.test(t)) return { kind: 'learned', steps: ['Read 214 outcomes logged this month (wins and misses)', 'Re-ran pattern promotion and demotion', 'Compared signal sources by conversion'] };
    if (/to ?do|what should i do first|my day|first today/.test(t)) return { kind: 'todo' };
    if (/approve all/.test(t)) { approveAll(true); return { kind: 'text', html: 'Done. Every ready, high-confidence item is approved and scheduled for the next send window (a placeholder in the mock).' }; }
    if (lookAsk || /more accounts like/.test(t)) { if (cc) cc.listId = null; return { kind: 'prospects', steps: FIND_STEPS() }; }
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
    if (/runner/.test(t)) { switchOpt(a, 'run'); return { kind: 'nba', id: a.id, note: `Switched to the runner-up: <b>${esc(a.nba.runnerUp)}</b>. I rewrote the subject and the message for it; switch back any time and your earlier version returns.` }; }
    if (/shorter/.test(t)) { const p = body.split('\n\n'); body = p.length > 3 ? [p[0], p[1].split('. ')[0] + '.', p[p.length - 2], p[p.length - 1]].join('\n\n') : body; }
    if (/cost/.test(t)) { const p = body.split('\n\n'); p.splice(Math.max(1, p.length - 2), 0, 'Most sites we work with start from cost: an hour of unplanned downtime on a unit this size typically costs well over USD 100k.'); body = p.join('\n\n'); }
    if (/formal/.test(t)) body = body.replace(/^Hi /, 'Dear ').replace(/Best,|Best regards,/, 'Kind regards,');
    if (/friendl/.test(t)) body = body.replace(/^Dear /, 'Hi ').replace(/Kind regards,/, 'Cheers,');
    S.drafts[a.id] = Object.assign(d, { body });
    return { kind: 'nba', id: a.id, note: `Updated the ${esc(a.name)} draft. The checks re-ran and still pass.` };
  }
  function sessionize(v) { const c = (S.mchat || {})[v]; if (!c || !c.thread || !c.thread.some(m => m.who === 'me')) return; const f = c.thread.find(m => m.who === 'me').text; S.chats.unshift(Object.assign({}, c, { id: 'p' + Date.now() + v, title: f.length > 38 ? f.slice(0, 36) + '…' : f, when: 'Earlier', page: v, thread: c.thread.slice() })); S.mchat[v] = null; save(); }
  function promotePageChat(c, text) {
    const v = view(), s = Object.assign({}, c, { id: 'p' + Date.now(), title: text.length > 38 ? text.slice(0, 36) + '…' : text, when: 'Now', page: v, thread: c.thread.slice() });
    S.chats.unshift(s); S.mchat[v] = null; keep = s; S.cur = s.id; save(); return s;
  }
  function ask(text) {
    if (!text || !text.trim()) return;
    /* From Today, a goal becomes its own chat (named for the goal, with progress); everything else is answered in Today */
    if (!view() && S.cur === 'home' && OBJ_RE.test(text)) { const id = 'n' + Date.now(), nm = text.match(/\d+/); const o = { id, title: objName(text), when: 'Now', obj: { ids: ACCOUNTS.filter(mine).filter(a => a.nba && /auto|ready|review/.test(a.nba.status) && !a.campaign).slice(0, nm ? +nm[0] : 10).map(a => a.id), done: [] }, thread: [] }; o.obj.total = o.obj.ids.length; S.chats.unshift(o); S.cur = id; renderAll(); }
    let c = chat();
    if (!c) return;
    if (view() && view() !== 'studio' && c === S.mchat[view()]) c = promotePageChat(c, text);
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
  const CHANNELS = Object.keys(FORMATS);
  function seqOf(c) { return S.seq[c.id] || c.touches.map(t => ({ day: t.day, ch: t.ch, fmt: t.fmt, subject: t.subject || (t.ch === 'Email' ? c.name : ''), t: t.t, state: t.state })); }
  const sent = t => /Sent|Done/.test(t.state || '');
  function newTouch(sq, c, ch) { const last = sq.length ? sq[sq.length - 1].day : 0; return { day: last + 4, ch, fmt: FORMATS[ch][ch === 'LinkedIn' ? 1 : 0], subject: ch === 'Email' ? 'Re: ' + (([...sq].reverse().find(x => x.ch === 'Email' && x.subject) || {}).subject || c.name).replace(/^Re: /, '') : '', t: ({ LinkedIn: 'Short follow-up on LinkedIn, referencing the earlier steps.', 'Phone call': 'A short call: follow up on the earlier steps and offer a 20-minute session.', WhatsApp: 'A short WhatsApp message following up on the earlier steps.', SMS: 'A short text following up on the earlier steps.', 'Direct mail': 'A printed one-pager with a short handwritten note.' })[ch] || 'A final, short note: offer a 20-minute call and make it easy to say no.', state: '' }; }
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
  /* Morning workflows in chat: seven questions a rep asks each morning */
  function workflow(t) {
    const say = h => ({ kind: 'text', html: h }), L = (id, x) => `<a href="#" onclick="App.openRecord('${id}','overview');return false">${esc(x || acct(id).name)}</a>`;
    if (/hasn.?t replied but (looked|viewed)|looked but|viewed (my|the) (message|profile)|warm non/.test(t)) {
      const rows = ACCOUNTS.filter(a => a.campaign && (isMgr || a.owner === me.id) && /Opened|Clicked/.test(a.campState || '')).sort((p, q) => q.score - p.score).slice(0, 6);
      return say(`<p>${rows.length} people looked but haven't replied, ranked by fit and signals. Message views come from the LinkedIn export, profile views from Sales Navigator; where neither is available I rank on signals.</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${rows.map((a, i) => `<div class="mini-row"><div class="grow"><div class="nm">${esc(a.contact.name)} · ${L(a.id)}</div><div class="sm">${i % 2 ? 'Viewed your profile twice' : 'Opened the message 3 times'} · ${esc(a.campState)} · score ${a.score}</div></div><span class="badge b-sec nodot">Next: ${i % 2 ? 'LinkedIn note' : 'short email with the checklist'}</span></div>`).join('')}</div></div>`);
    }
    if (/prep me|today.?s meetings|meeting prep/.test(t)) return say(`<p>Two meetings today. Each brief is built from the profiles, the threads and the timeline.</p><div class="ccard"><div class="ccard-b"><b>10:00 · ${L('eastgate', 'Eastgate Refining')}</b><div class="sm">Expansion team, 3 attendees. They said: vendors are compared next week, budget approved for phase 1. Missing stakeholder: the procurement lead, add them. Deck v1 (8 slides) and a one-pager are ready in Content studio.</div><br><b>15:30 · ${L('ironwood', 'Ironwood Refining')}</b><div class="sm">Second meeting. Open questions from the first: outage window and the migration order. Missing: the operations manager. Deck v2 with the comparison is ready.</div></div></div><div class="next-row"><button class="btn sm pri" onclick="App.toast('Opened the decks in Content studio')">Open the decks</button></div>`);
    if (/follow up on (this week.?s )?demos|demo follow|post.?demo/.test(t)) return say(`<p>One demo this week: ${L('ironwood', 'Ironwood Refining')} on Tue.</p><div class="ccard"><div class="ccard-b"><b>Next steps</b><div class="sm">Send the outage-window plan; book the technical review with their controls lead.</div><br><b>Qualification gaps</b><div class="sm">Budget owner not named; decision date unknown.</div><br><b>Risk</b> <span class="badge b-warn nodot">Medium</span><div class="sm">A rival is installed at the sister plant.</div><br><b>Recap</b><div class="sm">Drafted, with a one-page PDF of what was agreed. Approve to send and book the next meeting.</div></div></div><div class="next-row"><button class="btn sm pri" onclick="App.toast('Recap sent from your mailbox. Logged.')">Send the recap</button></div>`);
    if (/quota|how far am i|how far are we/.test(t)) { const team = isMgr; return say(`<p>${team ? 'The team' : 'You'} closed <b>USD ${team ? '1.9M' : '0.42M'}</b> of <b>USD ${team ? '3.6M' : '0.9M'}</b> this quarter: a gap of <b>USD ${team ? '1.7M' : '0.48M'}</b> with 9 weeks left. Pipeline covers the gap ${team ? '2.3' : '2.1'} times at your win rate of 31%.</p><div class="ccard"><div class="ccard-b"><div class="lbl">Plan, week by week</div><div class="sm"><b>This week:</b> push ${L('eastgate', 'Eastgate Refining')} to proposal; book ${L('ironwood', 'Ironwood')}'s technical review.<br><b>Next week:</b> open ${L('juniper', 'Juniper Petrochem')} and ${L('halcyon')}, both Tier A with live signals.<br><b>Weeks 3–4:</b> the turnaround campaign: 11 accounts, about 2 meetings expected.<br><b>Weeks 5–9:</b> close the two proposals; keep 3× coverage.</div></div></div><div class="next-row"><button class="btn sm pri" onclick="App.toast('Plan accepted. Progress is tracked weekly.')">Accept the plan</button><button class="btn sm" onclick="App.ask('Adjust the plan')">Adjust</button></div>`); }
    if (/who replied|replied since|any replies/.test(t)) { const rp = threads().slice(0, 7); return say(`<p>${rp.length} replies, sorted into six statuses, Hot first. Each has a drafted reply.</p><div class="ccard"><div class="ccard-b" style="padding:2px 14px">${rp.sort((p, q) => S6K.indexOf(st6(p)) - S6K.indexOf(st6(q))).map(r => `<div class="mini-row row-link" onclick="App.openThread('${r.id}')"><div class="grow"><div class="nm">${esc(r.from)} · ${esc(acct(r.acc).name)}</div><div class="sm">"${esc(r.text.slice(0, 70))}${r.text.length > 70 ? '…' : ''}" · ${S6[st6(r)][1]}</div></div><span class="badge ${S6[st6(r)][0]} nodot">${st6(r)}${r.unsure ? ' · confirm' : ''}</span></div>`).join('')}</div></div>`); }
    return null;
  }
  /* Six reply statuses, each with a default action and what is saved to memory */
  const S6 = { Hot: ['b-pos', 'Book the meeting or call today', 'Deal opened'], 'Further action': ['b-sec', 'Send the asset within a day', 'Asset logged, account kept warm'], 'Not now': ['b-grey', 'Set a recontact date and nurture', 'Date stored, follow-up scheduled'], 'Wrong person': ['b-ter', 'Thank them, add the new contact and re-route', 'New contact added to the committee'], Disqualified: ['b-warn', 'Close out and watch for the renewal', 'Reason saved as a lesson; score lowered'], 'Opted out': ['b-neg', 'Stop all outreach', 'Added to suppression everywhere'] };
  const S6K = Object.keys(S6);
  const st6 = r => r.status6 || (/Positive|Meeting/.test(r.kind) ? 'Hot' : r.kind === 'Out of office' ? 'Not now' : /next (quarter|year)|later|april|spring|budget/i.test(r.text) ? 'Not now' : 'Disqualified');
  function scoreProcess(a, open) {
    const sig = a ? a.signals.slice().sort((p, q) => q.weight - p.weight) : [];
    return `<details class="proc-i" ${open ? 'open' : ''}><summary title="How the score is calculated">${ic('help', 14)}<span>How the score is calculated</span></summary><div class="ccard proc"><div class="ccard-h"><span class="t">${ic('layers', 14)} How the score is calculated</span><span class="muted" style="font-size:11px">thresholds v2026.10</span></div>
      <div class="ccard-b"><ol class="proc-steps">
        <li><b>Collect signals</b><span>23 sources: hiring, news, website visits, tech stack, CRM</span></li>
        <li><b>Qualify</b><span>Keep a signal only if it's observable, predictive and time-bound</span></li>
        <li><b>Weigh by tier</b><span>Tier 1 = 100 · Tier 2 = 60 · Tier 3 = 30 points</span></li>
        <li><b>Strength and decay</b><span>Strength 1 to 5 gives × 0.6 to × 1.0. Tier 1 is full for 3 days and zero by day 14; tier 2 full 14, zero 60; tier 3 full 60, zero 90</span></li>
        <li><b>Stack into Timing</b><span>Strongest + ½ × second + ¼ × third …, capped at 100</span></li>
        <li><b>Fit × Timing ÷ 100 = Score</b><span>Out of 100 · tier A is the top 15% (≥ ${window.MOCK.TIER_CUTS ? window.MOCK.TIER_CUTS.A : ''}), B the next 25%, C the rest</span></li>
      </ol>
      ${a ? `<div class="proc-ex"><div class="lbl">Worked example · ${esc(a.name)}</div>
        ${sig.map((x, i) => `<div class="pe-r"><span class="badge ${x.tier === 1 ? 'b-pos' : x.tier === 2 ? 'b-sec' : 'b-grey'} nodot">T${x.tier}</span><span class="grow">${esc(x.type)} <span class="muted">· ${ago(x.age)}</span></span><span class="mono">${RAW[x.tier]} → ${x.weight}</span><span class="mono pe-m">${i === 0 ? '× 1' : i === 1 ? '× ½' : '× ¼'}</span></div>`).join('')}
        <div class="pe-sum mono">${a.points} points${a.points > 100 ? ', capped' : ''} = Timing ${a.timing} · Fit ${a.fit} × ${a.timing} ÷ 100 = <b>${a.score} / 100</b> → tier ${a.tier}</div></div>` : ''}
        <div class="pe-sum mono muted" style="margin-top:6px">PRD example: Fit 80; signals 34.5, 6.25, 2.1 → 34.5 + 3.125 + 0.525 = Timing 38.15 → 80 × 38.15 ÷ 100 = <b>30.5</b></div>
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
  const FOLDERS = [['all', 'Inbox', 'inbox'], ['needs', 'Needs a reply', 'reply'], ['Hot', 'Hot', 'up'], ['Further action', 'Further action', 'doc'], ['Not now', 'Not now', 'clock'], ['Wrong person', 'Wrong person', 'users'], ['Disqualified', 'Disqualified', 'alert'], ['Opted out', 'Opted out', 'x'], ['sent', 'Sent', 'plane'], ['tracking', 'Tracking', 'bars'], ['archived', 'Archived', 'savei']];
  const inFolder = (r, k) => k === 'tracking' ? false : k === 'archived' ? !!S.archived[r.id] : k === 'sent' ? !!S.handled[r.id] : !S.archived[r.id] && (k === 'all' || (k === 'needs' ? needsReply(r) : st6(r) === k));
  /* Inbox › Tracking: every next best action and campaign touch, email and LinkedIn, from prepared to replied */
  function trackRows() {
    const nb = nbaRows().filter(a => ibCh === 'all' || a.nba.channel === ibCh).map(a => ({ a, t: track(a), what: a.nba.action, ch: a.nba.channel, src: 'Next best action' }));
    const cp = ACCOUNTS.filter(a => a.campaign && visible(a) && campOf(a.campaign).status === 'Running').map(a => { const h = hsh(a.id), st = /Replied/.test(a.campState || '') ? 4 : [2, 3, 2, 3, 1][h % 5]; return { a, t: { stage: st, label: a.campState || STAGES[st], cls: st === 4 ? 'b-pos' : 'b-sec', how: 'Campaign touch, confirmed by the manager', when: 'This week' }, what: campOf(a.campaign).name, ch: h % 2 ? 'LinkedIn' : 'Email', src: 'Campaign touch' }; }).filter(r => ibCh === 'all' || r.ch === ibCh);
    return nb.concat(cp);
  }
  function trackingPane(rows) {
    const n = k => rows.filter(r => r.t.stage >= k).length;
    const bar = STAGES.map((x, i) => `<div class="dlv-s"><b>${n(i)}</b><span>${x}</span><i style="width:${Math.max(4, n(i) / (rows.length || 1) * 100)}%"></i></div>`).join(`<span class="dlv-a">${ic('right', 14)}</span>`);
    return `<div class="rp-h"><div class="rp-top"><h2>Tracking</h2></div><div class="sm muted" style="padding:0 2px">Every send is captured when it goes out: person, segment, signals, message version and channel.</div></div>
      <div style="padding:14px 18px"><div class="dlv">${bar}</div>
      <div class="sm muted" style="margin-top:12px">${rows.filter(r => r.t.cls === 'b-neg').length} bounced (the address is re-checked before a retry) · a reply pauses that person's remaining campaign steps.</div></div>`;
  }
  function renderInbox() {
    const src = threads(), q = ($('ibQ') && $('ibQ').value || '').toLowerCase();
    const list = src.filter(r => inFolder(r, inboxTab) && (ibCh === 'all' || r.ch === ibCh) && (!q || (r.from + acct(r.acc).name + r.text).toLowerCase().includes(q)));
    const trk = inboxTab === 'tracking' ? trackRows() : null;
    if (!trk && !thrId && innerWidth > 900 && list.length) thrId = list[0].id;
    const cur = thrId ? REPLIES.find(x => x.id === thrId) : null;
    $('main').className = 'ibx-pg';
    $('main').innerHTML = `<div class="ibx ${cur ? 'has-sel' : ''}">
      <aside class="ibx-f">
        <div class="ibx-ttl">Inbox</div>
        <nav class="ibx-nav">${FOLDERS.map(([k, l, i]) => { const n = k === 'tracking' ? '' : k === 'all' ? src.filter(r => inFolder(r, 'all') && unread(r)).length : src.filter(r => inFolder(r, k)).length; return `<button class="${inboxTab === k ? 'on' : ''}" onclick="App.setInboxTab('${k}')" title="${l}">${ic(i, 15)}<span>${l}</span><i>${n || ''}</i></button>`; }).join('')}</nav>
        <div class="ibx-sec">Channel</div>
        <nav class="ibx-nav">${[['all', 'All channels', 'layers'], ['Email', 'Email', 'mail'], ['LinkedIn', 'LinkedIn', 'li']].map(([k, l, i]) => `<button class="${ibCh === k ? 'on' : ''}" onclick="App.setIbCh('${k}')" title="${l}">${ic(i, 15)}<span>${l}</span></button>`).join('')}</nav>
        <div class="ibx-sec">Mailbox</div>${isMgr ? `<div class="ibx-mb">${ownerSel()}</div>` : `<div class="ibx-mb muted">${esc(mailbox({ owner: me.id }))}</div>`}
      </aside>
      <section class="ibx-l">
        <div class="ibx-lh">${backChip()}<div class="search">${ic('search', 14)}<label class="sr" for="ibQ">Search mail</label><input id="ibQ" placeholder="Search mail" value="${esc(q)}" oninput="App.renderAll()"></div></div>
        <div class="ibx-lt"><b>${FOLDERS.find(f => f[0] === inboxTab)[1]}</b><span class="muted">${trk ? trk.length + ' sends' : list.length + ' conversation' + (list.length === 1 ? '' : 's')}</span></div>
        <div class="ibx-rows">${trk ? trk.map(r => `<button class="ibx-r" onclick="App.openRecord('${r.a.id}','engage')">${pAvatar(r.a, 34)}<div class="grow"><div class="ibx-r1"><span class="fr">${esc(r.a.contact.name)}</span><span class="when">${esc(r.t.when || '')}</span></div><div class="ibx-r2">${esc(r.what)}</div><div class="ibx-r3">${esc(r.a.name)} · ${esc(r.src)}</div><div class="ibx-r4">${chIc(r.ch)}${dots(r.t)}<span class="badge ${r.t.cls}">${esc(r.t.label)}</span>${isMgr ? `<span>${esc(first(USERS[r.a.owner].name))}</span>` : ''}</div></div></button>`).join('') : list.map(r => { const a = acct(r.acc); return `<button class="ibx-r ${unread(r) ? 'unread' : ''} ${thrId === r.id ? 'on' : ''}" onclick="App.openThread('${r.id}')">${pAvatar(a, 34)}<div class="grow"><div class="ibx-r1"><span class="fr">${esc(r.from)}</span><span class="when">${esc(r.at)}</span></div><div class="ibx-r2">${esc(subjOf(r))}</div><div class="ibx-r3">${esc(r.text)}</div><div class="ibx-r4">${chIc(r.ch)}<span class="badge ${S6[st6(r)][0]}">${st6(r)}</span>${isMgr ? `<span>${esc(first(USERS[r.owner].name))}</span>` : ''}${S.handled[r.id] ? '<span>· replied</span>' : ''}</div></div></button>`; }).join('') || '<div class="empty">No conversations here.</div>'}</div>
      </section>
      <section class="ibx-v">${trk ? trackingPane(trk) : cur ? readingPane(cur) : `<div class="ibx-empty">${ic('inbox', 40, 1.5)}<div>Select a conversation to read it</div></div>`}</section>
    </div>`;
    if (q) { const s = $('ibQ'); s.focus(); s.setSelectionRange(q.length, q.length); }
  }
  function readingPane(r) {
    const a = acct(r.acc), out = a.activity.filter(x => x.msg).pop(), done = S.handled[r.id], rep = USERS[a.owner];
    return `<div class="rp-h"><div class="rp-top"><button class="ic-btn rp-back" title="Back to the list" onclick="App.closeThread()">${ic('left', 16)}</button><h2>${esc(subjOf(r))}</h2>
        <div class="rp-tools"><button class="ic-btn" title="Archive" onclick="App.archive('${r.id}')">${ic('savei', 16)}</button><button class="ic-btn" title="Mark as unread" onclick="App.markUnread('${r.id}')">${ic('mail', 16)}</button><button class="btn sm" onclick="App.openRecord('${a.id}','activity')">${ic('users', 13)} Open account</button></div></div>
        <div class="rp-labels"><span class="badge ${S6[st6(r)][0]}">${st6(r)}</span>${r.unsure ? `<span class="badge b-warn nodot" title="The classifier is unsure (${r.conf}), so it asks you">Confirm the status</span>` : ''}<span class="badge b-grey nodot">${chIc(r.ch)} ${r.ch}</span><span class="badge b-brand nodot">${r.sourceKind === 'Campaign' ? 'Campaign: ' + esc(r.source) : 'Next best action'}</span></div><div class="sm muted" style="margin-top:6px">Default: ${S6[st6(r)][1]} · Memory: ${S6[st6(r)][2]}</div></div>
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
    renderAnalytics0();
    const cv = $('cv'); if (!cv) return;
    const F = [['Qualified', 100], ['Contacted', 82], ['Replied', 14], ['Meetings', 4.1], ['Won', 0.9]];
    cv.insertAdjacentHTML('beforeend', `<div class="lbl" style="margin:20px 0 8px">Results per 100 accounts worked</div><div class="card"><div class="card-b"><div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">${F.map(f => `<div style="flex:1;min-width:90px"><div style="height:${Math.max(6, f[1] * 1.2)}px;background:var(--brand);opacity:${0.35 + f[1] / 160};border-radius:6px 6px 0 0"></div><div class="nm" style="margin-top:6px">${f[1]}</div><div class="sm muted">${f[0]}</div></div>`).join('')}</div><div class="sm" style="margin-top:12px"><b>Prioritised against the rest:</b> Tier A and B accounts booked 6.2 meetings per 100, Tier C 1.4. Measured in the CRM each quarter.</div></div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:12px">
      <div class="card"><div class="card-b"><div class="lbl" style="margin-bottom:8px">Reply rate by signal type</div><table class="tbl"><tbody>${[['Champion moved', 27], ['New exec hire', 22], ['Rival contract ending', 19], ['Turnaround announced', 17], ['Hiring surge', 11], ['Regulatory deadline', 6]].map(r => `<tr><td>${r[0]}</td><td class="mono">${r[1]} per 100 sends</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-b"><div class="lbl" style="margin-bottom:8px">Each channel against its benchmark</div><table class="tbl"><tbody>${[['Email', '7.9%', '5.1%', 1], ['LinkedIn', '11.2%', '8.0%', 1], ['Phone', '2.1%', '3.5%', 0]].map(r => `<tr><td>${r[0]}</td><td class="mono">${r[1]} vs ${r[2]}</td><td><span class="badge ${r[3] ? 'b-pos' : 'b-neg'} nodot">${r[3] ? 'Above' : 'Below: flagged'}</span></td></tr>`).join('')}</tbody></table></div></div></div>
      <div class="lbl" style="margin:20px 0 8px">Qualified meeting ledger</div><div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Rep</th><th>Held</th><th>Recommended before first touch</th><th>Confirmed</th></tr></thead><tbody>${[['Eastgate Refining', 'Sofia', 'Tue 27 Oct', 'Yes, 9 days before', (S.resolvedEsc || {}).meet ? 'Daniel, today' : 'Waiting (due Tue 3 Nov)'], ['Ironwood Refining', 'Marco', 'Fri 23 Oct', 'Yes, 14 days before', 'Daniel, Mon 26 Oct'], ['Moonstone Aromatics', 'Marco', 'Wed 14 Oct', 'Yes, 6 days before', 'Daniel, Thu 15 Oct'], ['Copperhill Aromatics', 'Kenji', 'Tue 6 Oct', 'No: their own outreach', 'Not counted']].filter(r => isMgr || r[1] === first(me.name)).map(r => `<tr>${r.map((x, i) => `<td class="${i ? 'sm' : 'nm'}">${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="sm muted" style="margin-top:8px">${isMgr ? 'Team routing: accounts go to a team by territory, product line and deal size (Singapore and Malaysia to Sofia\'s pod; deals over USD 1M to Marco\'s). ' : ''}Quarterly true-up on 31 Dec: prioritised accounts must beat the rest in the CRM, or the meeting fee steps down.</div>`);
  }
  function renderAnalytics0() {
    const reps = (isMgr && ownerF === 'all') ? REPS : [isMgr ? ownerF : me.id], sum = k => reps.reduce((n, r) => n + TEAM_STATS[r][k], 0);
    /* A dashboard page, not a chat: the important numbers first as cards, then the detail */
    $('main').className = 'an-pg';
    $('main').innerHTML = `<div class="an-h"><div style="display:flex;align-items:center;gap:4px">${backChip()}<div><h1>Analytics ${R2TAG}</h1><div class="sub">Week 44 · ${(isMgr && ownerF === 'all') ? 'whole team' : esc(USERS[isMgr ? ownerF : me.id].name)} · ${anPer === 'week' ? 'Mon 26 Oct – Sun 1 Nov' : 'October 2026'}</div></div></div><div class="an-ctl"><div class="seg">${[['week', 'This week'], ['month', 'This month']].map(([k, l]) => `<button class="${anPer === k ? 'on' : ''}" onclick="App.setAnPer('${k}')">${l}</button>`).join('')}</div>${isMgr ? ownerSel() : ''}</div></div><div class="an-b" id="cv"></div>`;
    const cv = $('cv'), mo = anPer === 'month' ? 3.6 : 1, n = x => Math.round(x * mo), share = (isMgr && ownerF === 'all') ? 1 : 0.27;
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
    const g1 = (isMgr && ownerF === 'all') ? 12 : { sofia: 10, marco: 14, aisha: 9, kenji: 21 }[isMgr ? ownerF : me.id], pipe = 1.2 * ((isMgr && ownerF === 'all') ? 1 : TEAM_STATS[isMgr ? ownerF : me.id].meetings / 7 || 0.1) * mo;
    const kpis = `<div class="kpis">
      ${kpi('check', 'Meetings booked', `${m}<span class="of"> / ${tg}</span>`, m, 'target ' + tg, '', true, false, [m >= tg ? 'On target' : 'Below target', m >= tg])}
      ${kpi('reply', 'Reply rate', rr.toFixed(1) + '%', rr, `${n(sum('replies'))} of ${n(sum('sent'))} sent`, '%', true)}
      ${kpi('up', 'Positive replies', n(Math.round(sum('replies') * 0.53)), n(Math.round(sum('replies') * 0.53)), 'interested or booked', '', true)}
      ${kpi('task', 'Accepted first time · G2', acc + '%', acc, 'target 70%', '%', true, false, [acc >= 70 ? 'Passing' : 'Below target', acc >= 70])}
      ${kpi('bolt', 'Ready to send with one click', Math.round(went / tot * 100) + '%', went / tot * 100, `${went} of ${tot} next actions`, '%', true)}
      ${kpi('clock', 'Time to a first action · G1', g1 + ' min', g1, 'was 38 min before the pilot', 'min', false, false, [g1 <= 19 ? 'Passing' : 'Below target', g1 <= 19])}
      ${(cl => kpi('layers', 'Leads closed', cl, cl, 'won from outreach', '', true))(fxRows('closed', anPer === 'month' ? 'month' : 'week').filter(e => !(isMgr && ownerF !== 'all') || acct(e.acc).owner === ownerF).length)}
      ${kpi('alert', 'Overdue items', od, od, 'past their due time', '', false, od === 0)}
    </div>`;
    const card = (k, v, d) => `<div class="mcard"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const f = (isMgr && ownerF === 'all') ? 1 : 0.27, funnel = [['People found', 412], ['Identity checked', 368], ['Accounts scored', 81], ['With a live signal', 33], ['Next actions (NBA)', 31], ['In campaigns (NBC)', 44], ['Contacted', 58], ['Replied', 15], ['Positive', 8], ['Meetings', sum('meetings')]].map(([k, v], i) => [k, i === 9 ? v : Math.round(v * f)]);
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
    const C = { meet: kc('Meetings', `${N.meet}<span class="muted" style="font-size:13px"> / ${N.target}</span>`, N.meet >= N.target ? 'on target' : `${N.target - N.meet} short`), rr: kc('Reply rate', N.rr.toFixed(1) + '%', `${N.replies} of ${N.sent} sent`), pos: kc('Positive', N.pos, 'interested or booked', "App.openMod('inbox')"), auto: kc('Ready to send', Math.round(N.went / N.tot * 100) + '%', `${N.went} of ${N.tot} next actions`), acc: kc('Accepted · G2', N.acc + '%', 'target 70%'), g1: kc('First action · G1', N.g1 + ' min', 'target 19 min'), pipe: kc('Pipeline', 'USD ' + N.pipe.toFixed(1) + 'M', 'influenced'), od: kc('Overdue', N.od, 'past due') };
    const repRows = () => REPS.map(r => [r, TEAM_STATS[r]]).sort((p, q) => q[1].meetings / q[1].target - p[1].meetings / p[1].target);
    if (/meeting|target|booked/.test(t)) return say(`<b>${N.meet} of ${N.target}</b> meetings booked ${N.per} for ${esc(N.who)}, ${N.meet >= N.target ? 'on target' : `<b>${N.target - N.meet} short</b>`}. ${isMgr && !rp ? `Behind: ${repRows().filter(([, s]) => s.meetings < s.target).map(([r, s]) => `${link(esc(first(USERS[r].name)), `App.setOwner('${r}')`)} ${s.meetings}/${s.target}`).join(', ')}. The quickest gain is the 8 positive replies still waiting for an answer.` : ''}`, [C.meet, C.pos]);
    if (/reply|response|open rate/.test(t)) return say(`Reply rate ${N.per} is <b>${N.rr.toFixed(1)}%</b> (${N.replies} replies from ${N.sent} sent), up 2.7 points on last ${anPer}. ${N.pos} were positive. ${isMgr && !rp ? `Best: ${esc(USERS[REPS.slice().sort((p, q) => TEAM_STATS[q].replies / TEAM_STATS[q].sent - TEAM_STATS[p].replies / TEAM_STATS[p].sent)[0]].name)}.` : ''} Short plain-text first touches are still doing best.`, [C.rr, C.pos]);
    if (/positive|interested/.test(t)) return say(`<b>${N.pos}</b> positive replies ${N.per} for ${esc(N.who)}: interested or a meeting booked. ${link('See them in Inbox', "App.openMod('inbox')")}.`, [C.pos, C.rr]);
    if (/accept|first time|\bg2\b|override/.test(t)) return say(`Reps accepted <b>${N.acc}%</b> of recommendations first time (G2, target 70%): ${N.acc >= 70 ? 'passing' : 'below target'}. Skips and edits come back as signals, so the next run starts better.`, [C.acc, C.auto]);
    if (/went ahead|on (their|its) own|autonom|auto/.test(t)) return say(`<b>${Math.round(N.went / N.tot * 100)}%</b> of next best actions met all five criteria and were ready to send with one click (${N.went} of ${N.tot}). The rest waited for a person. ${link('See the autonomy dial', "App.ask('How much do agents do on their own?')")}.`, [C.auto, C.acc]);
    if (/time to|first action|\bg1\b|speed|fast/.test(t)) return say(`Time to a first action is <b>${N.g1} minutes</b> (G1, target 19), down from 38 before the pilot.`, [C.g1, C.auto]);
    if (/overdue|late|behind/.test(t)) return say(N.od ? `<b>${N.od}</b> items are overdue: ${repRows().filter(([r, s]) => s.overdue && N.reps.includes(r)).map(([r, s]) => `${esc(first(USERS[r].name))} ${s.overdue}`).join(', ')}. ${isMgr ? "Moving Kenji's Banyan Gas to Aisha clears the oldest." : ''}` : 'Nothing is overdue.');
    if (/funnel|leak|drop|convert/.test(t)) return say('The biggest drop is <b>live signal → contacted</b>: 33 accounts had a signal but only 24 were contacted within 2 days, mostly because 3 rep mailboxes aren\'t connected. Replies → positive is healthy (8 of 15).');
    if (/campaign/.test(t)) { const cs = CAMPAIGNS.map(c => [c, campStats(c)]).filter(([, s]) => s.started), b = cs.slice().sort((p, q) => q[1].replies / q[1].started - p[1].replies / p[1].started); return b.length ? say(`Best campaign by reply rate: ${link('<b>' + esc(b[0][0].name) + '</b>', `App.goCampaign('${b[0][0].id}')`)} at ${pct(b[0][1].replies, b[0][1].started)} (${b[0][1].meetings} meetings). ${b.length > 1 ? `Weakest: ${esc(b[b.length - 1][0].name)} at ${pct(b[b.length - 1][1].replies, b[b.length - 1][1].started)}.` : ''}`, b.slice(0, 4).map(([c, s]) => kc(esc(c.name), pct(s.replies, s.started), `reply rate · ${s.meetings} meeting${s.meetings === 1 ? "" : "s"}`, `App.goCampaign('${c.id}')`))) : say('No campaign has started sending yet.'); }
    if (/learn|worked|lesson/.test(t)) return say(LEARNED.slice(0, 3).map(l => `<b>${esc(l.t)}</b>: ${esc(l.d)}`).join('<br>'));
    if (isMgr && (rp || /\brep|who('s| is) (best|top|behind)|team|compare|leaderboard/.test(t))) { if (rp) { const s = TEAM_STATS[rp]; return say(`<b>${esc(USERS[rp].name)}</b> ${N.per}: ${s.meetings}/${s.target} meetings, ${s.replies} ${s.replies === 1 ? 'reply' : 'replies'} from ${s.sent} sent, ${s.accept}% accepted first time, ${s.overdue} overdue. The dashboard now shows only their numbers; ${link('back to the whole team', "App.setOwner('all')")}.`, [C.meet, C.rr, C.acc, C.od]); } return say(`By meetings against target: ${repRows().map(([r, s]) => `${link(esc(first(USERS[r].name)), `App.setOwner('${r}')`)} ${s.meetings}/${s.target}`).join(' · ')}. ${esc(first(USERS[repRows().pop()[0]].name))} needs help most.`, repRows().map(([r, s]) => kc(esc(USERS[r].name), `${s.meetings}<span class="muted" style="font-size:13px"> / ${s.target}</span>`, `meetings · ${s.overdue} overdue`, `App.setOwner('${r}')`))); }
    if (/summar|overview|how are we|how am i|how('s| is) it going|doing|analytics|dashboard|numbers|kpi|metric|show/.test(t)) return say(`${N.per.charAt(0).toUpperCase() + N.per.slice(1)} for ${esc(N.who)}: <b>${N.meet}/${N.target}</b> meetings, reply rate <b>${N.rr.toFixed(1)}%</b>, <b>${N.pos}</b> positive ${N.pos === 1 ? 'reply' : 'replies'}, <b>${Math.round(N.went / N.tot * 100)}%</b> of next actions ready to send with one click, ${N.od} overdue. ${N.meet < N.target ? 'Meetings are the gap; ask "Where are we stuck?" for the fixes.' : ''}`, [C.meet, C.rr, C.pos, C.auto, C.od]);
    return view() === 'analytics' ? say('I can answer from the dashboard: meetings against target, reply rate, positive replies, accepted first time, what was ready to send, time to a first action, overdue items, the funnel, campaigns or one rep. Add "this month" to switch the period.') : null;
  }
  function ownerSel() { return isMgr ? `<label class="sr" for="ownF">Rep</label><select class="sel" id="ownF" onchange="App.setOwner(this.value)"><option value="all">All reps</option>${REPS.map(r => `<option value="${r}" ${ownerF === r ? 'selected' : ''}>${esc(USERS[r].name)}</option>`).join('')}</select>` : ''; }
  function skeleton() {
    $('main').className = 'canvas';
    $('main').innerHTML = `<div class="cv-h"><div class="sk" style="width:220px;height:20px"></div><div class="sk" style="width:90px;height:28px"></div></div><div class="cv-b"><div class="mcards">${'<div class="sk" style="height:84px"></div>'.repeat(5)}</div><div class="sk" style="height:20px;width:180px;margin:22px 0 12px"></div>${'<div class="sk" style="height:46px;margin-bottom:8px"></div>'.repeat(6)}</div>`;
  }

  /* ─── Module and canvas frames ─── */
  function frame(title, sub, actions, closable) {
    $('main').className = 'canvas';
    $('main').innerHTML = `<div class="cv-h">${backChip()}<div class="cv-ht"><div class="cv-t">${title}</div>${sub ? `<div class="cv-s">${sub}</div>` : ''}</div><div class="cv-a">${actions || ''}<button class="ic-btn" onclick="App.closeCanvas()" title="Close">${ic('x', 16)}</button></div></div>${modTabs()}<div class="cv-b" id="cv"></div>`;
    return $('cv');
  }
  const filt = (label, ic2, on) => `<button class="fchip ${on ? 'on' : ''}">${ic2 ? ic(ic2, 13) : ''}${label}</button>`;

  /* Result table opened beside the chat */
  function renderArt() {
    const t = TABLES[art]();
    const cv = frame(`${ic('table', 16)} ${esc(t.title)}`, `${t.rows.length} records`, `<button class="ic-btn" title="Save as a list" onclick="App.ask('Save as a list')">${ic('savei', 16)}</button><button class="ic-btn" title="Download" onclick="App.toast('Downloads are a placeholder in the mock')">${ic('dl', 16)}</button><button class="btn sm pri" onclick="App.addToCampaign()">${ic('plane', 13)} Add to campaign</button>`, true);
    const q = ($('artQ') && $('artQ').value || '').toLowerCase();
    const cols = artMore ? Object.keys(COL).filter(k => !['status'].includes(k) || art === 'ranked') : t.cols;
    const rows = t.rows.filter(a => !q || (a.name + a.contact.name + a.country).toLowerCase().includes(q));
    cv.innerHTML = `<div class="search wide">${ic('search', 14)}<label class="sr" for="artQ">Search table</label><input id="artQ" placeholder="Search table" value="${esc(q)}" oninput="App.renderAll()"></div>
      <div class="card tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th></th>${cols.map(c => `<th>${COL[c][0]}</th>`).join('')}</tr></thead><tbody>${rows.map((a, i) => `<tr class="row-link" onclick="App.openRecord('${a.id}','overview')"><td class="mono muted">${i + 1}</td>${cols.map(c => `<td>${COL[c][1](a)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <button class="more-cols" onclick="App.toggleMore()">${artMore ? 'Fewer columns' : 'More columns'} ${ic(artMore ? 'left' : 'right', 13)}</button>`;
    if (q) { const s = $('artQ'); s.focus(); s.setSelectionRange(q.length, q.length); }
  }

  /* Filter and sort, Claude style: a search icon and one menu instead of pills and dropdowns */
  const FSM = {}, FSS = {};
  let sgOnly = null, ldTier = '', ldSeg = '', ldSort = 'Score', ldQ = '', sgMode = '', sgSort = 'Most accounts', sgQ = '';
  const FS_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="17" x2="14" y2="17"/></svg>';
  function fsTools(ns, o) {
    const m = FSM[ns] || null, lab = (k, v) => { const e = o.keys.find(x => x[1] === k), f = e && e[2].find(x => x[0] === v); return f ? f[1] : v; };
    const chips = o.keys.filter(([l, k]) => o.val(k)).map(([l, k]) => `<span class="lib-chip">${l}: ${esc(lab(k, o.val(k)))}<button aria-label="Remove ${l} filter" onclick="App.fsPick('${ns}','${k}','')">✕</button></span>`).join('');
    let menu = '';
    if (m === 'root') menu = `<div class="lib-scrim" onclick="App.fsMenu('${ns}',null)"></div><div class="lib-menu" role="menu">${o.keys.map(([l, k]) => `<button class="lib-mi" onclick="App.fsMenu('${ns}','${k}')"><span>${l}</span><span class="lib-mv">${esc(o.val(k) ? lab(k, o.val(k)) : 'Any')} ›</span></button>`).join('')}<div class="lib-msep"></div><button class="lib-mi" onclick="App.fsMenu('${ns}','sort')"><span>Sort by</span><span class="lib-mv">${esc(o.sort)} ›</span></button></div>`;
    else if (m) { const e = o.keys.find(x => x[1] === m), list = m === 'sort' ? o.sorts.map(s => [s, s]) : [['', 'Any']].concat(e[2]), cur = m === 'sort' ? o.sort : o.val(m);
      menu = `<div class="lib-scrim" onclick="App.fsMenu('${ns}',null)"></div><div class="lib-menu" role="menu"><button class="lib-mi lib-mback" onclick="App.fsMenu('${ns}','root')">‹ ${m === 'sort' ? 'Sort by' : e[0]}</button><div class="lib-msep"></div>${list.map(([v, l]) => `<button class="lib-mi" onclick="App.fsPick('${ns}','${m}',${js(v)})"><span>${esc(l)}</span>${cur === v ? '<span class="lib-mv">✓</span>' : ''}</button>`).join('')}</div>`; }
    const search = FSS[ns] || o.q ? `<div class="search lib-q">${ic('search', 14)}<input id="${ns}Q" placeholder="${esc(o.qph)}" aria-label="${esc(o.qph)}" value="${esc(o.q)}" oninput="App.fsPick('${ns}','q',this.value,1)"></div>` : `<button class="lib-ib" title="Search" aria-label="Search" onclick="App.fsSearch('${ns}')">${ic('search', 17)}</button>`;
    return { tools: `<div class="lib-tools">${search}<span class="lib-mw"><button class="lib-ib ${m || chips ? 'on' : ''}" title="Filter and sort" aria-label="Filter and sort" onclick="App.fsMenu('${ns}','${m ? '' : 'root'}')">${FS_SVG}</button>${menu}</span>${o.extra || ''}</div>`, chips };
  }
  const FS_SET = {
    ld: (k, v) => { if (k === 'list') listSel = v || 'all'; else if (k === 'tier') ldTier = v; else if (k === 'own') ownerF = v || 'all'; else if (k === 'seg') ldSeg = v; else if (k === 'sort') ldSort = v || 'Score'; else if (k === 'q') ldQ = v; },
    sg: (k, v) => { if (k === 'mode') sgMode = v; else if (k === 'own') ownerF = v || 'all'; else if (k === 'sort') sgSort = v || 'Most accounts'; else if (k === 'q') sgQ = v; }
  };
  /* Accounts (lists are saved selections: tabs above the table) */
  function renderAccounts() {
    if (accSub === 'signals') return renderSignals();
    const lists = [{ id: 'all', name: 'All leads' }].concat(S.genLists.filter(g => isMgr || g.owner === me.id).map(g => ({ id: g.id, name: g.title, kind: 'Generated', gen: true, note: `Generated from your prompt: “${g.q}”`, by: (USERS[g.owner] || me).name, when: 'today' })).reverse(), S.lists, LISTS);
    const l = lists.find(x => x.id === listSel) || lists[0];
    let rows = l.id === 'all' ? ACCOUNTS : l.gen ? ACCOUNTS.filter(a => a.fromList === l.id) : l.ids ? l.ids.map(acct) : l.seg ? ACCOUNTS.filter(a => a.seg === l.seg) : l.id === 'L1' ? listAccounts() : ACCOUNTS.filter(a => a.score > 0);
    const q = ldQ.toLowerCase();
    rows = rows.filter(a => visible(a) && (!q || (a.name + a.contact.name + a.country + a.segment).toLowerCase().includes(q)) && (!ldTier || a.tier === ldTier) && (!ldSeg || a.seg === ldSeg));
    if (ldSort === 'Newest signal') rows = rows.slice().sort((p, r) => (p.whyNow ? p.whyNow.age : 999) - (r.whyNow ? r.whyNow.age : 999)); else if (ldSort === 'Name A–Z') rows = rows.slice().sort((p, r) => p.name.localeCompare(r.name)); else rows = rows.slice().sort((p, r) => r.score - p.score);
    const fs = fsTools('ld', { keys: [['List', 'list', lists.map(x => [x.id === 'all' ? '' : x.id, x.name])], ['Tier', 'tier', [['A', 'Tier A'], ['B', 'Tier B'], ['C', 'Tier C']]], ['Micro-segment', 'seg', SEGMENTS.map(s => [s.id, s.name])]].concat(isMgr ? [['Rep', 'own', REPS.map(r => [r, USERS[r].name])]] : []), val: k => k === 'list' ? (l.id === 'all' ? '' : l.id) : k === 'tier' ? ldTier : k === 'seg' ? ldSeg : k === 'own' ? (ownerF === 'all' ? '' : ownerF) : '', sorts: ['Score', 'Newest signal', 'Name A–Z'], sort: ldSort, q: ldQ, qph: 'Search accounts, people, segments', extra: `<button class="lib-ib ${showProc ? 'on' : ''}" title="How scoring works" aria-label="How scoring works" onclick="App.toggleProc()">${ic('layers', 17)}</button>` });
    const cv = frame('Leads', `${rows.length} leads${l.id === 'all' ? '' : ' in this list'} · Score = Fit × Timing`, `<button class="btn sm" onclick="App.saveView()">${ic('savei', 13)} Save as a list</button><button class="btn sm pri" onclick="App.pickAct('Find prospects: ')">${ic('search', 13)} Find leads</button>`);
    cv.innerHTML = `<div class="lib-bar ld-bar"><div class="ld-h"><b>${esc(l.name)}</b><span class="sm muted">${rows.length} leads · sorted by ${esc(ldSort.toLowerCase())}</span></div>${fs.tools}</div>${fs.chips ? `<div class="lib-chips">${fs.chips}</div>` : ''}
      ${l.note ? `<div class="list-note">${esc(l.note)} · saved by ${esc(l.by)} · ${esc(l.when)}<span style="flex:1"></span>${btn('Score this list', 'Score this list')}${btn('Create micro-segments', 'Create micro-segments')}</div>` : ''}
      ${showProc ? scoreProcess(rows.find(a => a.score > 0), true) : ''}
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Account</th><th>Person</th><th>Tier</th><th>Score</th><th>Why now</th><th>Micro-segment</th>${isMgr ? '<th>Owner</th>' : ''}<th>Status</th></tr></thead><tbody>
        ${rows.map((a, i) => `<tr class="row-link" onclick="App.openRecord('${a.id}','overview')"><td class="mono muted">${i + 1}</td><td><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.industry)} · ${esc(a.country)}</div></td><td>${esc(a.contact.name)}<div class="sm">${esc(a.contact.title)}</div></td><td>${tierBadge(a.tier)}</td><td class="mono">${sc(a)}</td><td>${a.whyNow ? `${esc(a.whyNow.type)}<div class="sm">${ago(a.whyNow.age)}</div>` : '<span class="muted">No live signal</span>'}</td><td>${a.seg ? `<span class="seg-link" onclick="event.stopPropagation();App.openSegment('${a.seg}')">${esc(a.segment)}</span>` : '–'}</td>${isMgr ? `<td>${ownerPick(a)}</td>` : ''}<td>${stepBadge(a)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const ownerPick = a => isMgr ? `<label class="sr" for="own-${a.id}">Owner</label><select class="sel own-sel" id="own-${a.id}" onclick="event.stopPropagation()" onchange="App.reassign(['${a.id}'],this.value)">${(REPS.includes(a.owner) ? REPS : [a.owner].concat(REPS)).map(r => `<option value="${r}" ${a.owner === r ? 'selected' : ''}>${esc(first(USERS[r].name))}</option>`).join('')}</select>` : `<span class="sm">${esc(first(USERS[a.owner].name))}</span>`;
  const assignAll = (ids, what) => isMgr && ids.length ? `<label class="sr" for="asg-${what}">Assign ${what}</label><select class="sel own-sel" id="asg-${what}" onclick="event.stopPropagation()" onchange="if(this.value)App.reassign(${esc(JSON.stringify(ids))},this.value)"><option value="">Assign ${what} to…</option>${REPS.map(r => `<option value="${r}">${esc(USERS[r].name)}</option>`).join('')}</select>` : '';
  function stepBadge(a) {
    if (a.campaign) return stateBadge(a.campState);
    if (!a.nba) return '<span class="badge b-grey nodot">Waiting for a signal</span>';
    const d = S.decisions[a.id];
    if (d) return `<span class="badge b-grey nodot">${decLabel(d)}</span>`;
    if (a.nba.status === 'auto') return '<span class="badge b-pos">Ready to send</span>';
    if (a.nba.status === 'sent') return `<span class="badge b-sec">${esc(S.sent1 && S.sent1[a.id] ? 'Sent · just now' : a.outcome || 'Sent')}</span>`;
    if (a.nba.status === 'held') return `<span class="badge b-neg" title="${esc(a.nba.reasonNote)}">Held</span>`;
    if (a.nba.status === 'nurture') return '<span class="badge b-grey nodot">Nurture</span>';
    if (a.nba.status === 'expired') return '<span class="badge b-grey nodot">Expired · re-ranked</span>';
    if (a.nba.status === 'excluded') return `<span class="badge b-neg" title="${esc(a.nba.reasonNote)}">Excluded</span>`;
    return `<span class="badge ${REASON[reasonOf(a)]}">${reasonOf(a) === 'Ready' ? 'Ready for OK' : reasonOf(a)}</span>`;
  }

  /* Segments: list → segment detail → person drawer → activity */
  function segStats(s) {
    const accs = ACCOUNTS.filter(a => a.seg === s.id), my = accs.filter(mine);
    return { total: accs.length, mine: my.length, waiting: accs.filter(a => a.nba && /ready|review/.test(a.nba.status) && !S.decisions[a.id]).length, ahead: accs.filter(a => a.nba && /auto|sent/.test(a.nba.status)).length, replies: REPLIES.filter(r => acct(r.acc).seg === s.id).length };
  }
  function renderSegments() {
    if (segSel) return renderSegment();
    const SG = SEGMENTS.filter(x => (!sgOnly || sgOnly.includes(x.id)) && (!sgMode || (sgMode === 'NBA' ? x.mode !== 'NBC' && x.mode !== 'Building' : x.mode === sgMode)) && (!sgQ || (x.name + ' ' + x.trigger).toLowerCase().includes(sgQ.toLowerCase()))).sort(sgSort === 'Name A–Z' ? (p, q) => p.name.localeCompare(q.name) : sgSort === 'Positive rate' ? (p, q) => (q.rate || 0) - (p.rate || 0) : (p, q) => segStats(q).total - segStats(p).total);
    const fs = fsTools('sg', { keys: [['Type', 'mode', [['NBC', 'Campaign · NBC'], ['NBA', 'My actions · NBA'], ['Building', 'Building toward a campaign']]]].concat(isMgr ? [['Rep', 'own', REPS.map(r => [r, USERS[r].name])]] : []), val: k => k === 'mode' ? sgMode : k === 'own' ? (ownerF === 'all' ? '' : ownerF) : '', sorts: ['Most accounts', 'Positive rate', 'Name A–Z'], sort: sgSort, q: sgQ, qph: 'Search segments' });
    const cv = frame('Micro-segments', `${SG.length} of ${SEGMENTS.length} segments`, `<button class="btn sm pri" onclick="App.ask('Create micro-segments')">${ic('spark', 13)} Segment a list</button>`);
    cv.innerHTML = `<div class="lib-bar ld-bar"><div class="ld-h"><b>Micro-segments</b><span class="sm muted">sorted by ${esc(sgSort.toLowerCase())}</span></div>${fs.tools}</div>${fs.chips || sgOnly ? `<div class="lib-chips">${sgOnly ? `<span class="lib-chip">From your list: ${sgOnly.length} micro-segment${sgOnly.length === 1 ? '' : 's'} with next best actions<button aria-label="Show all micro-segments" onclick="App.sgOnlyClear()">✕</button></span>` : ''}${fs.chips}</div>` : ''}
      <div class="rule"><b>Campaign or my action?</b> 10 or more accounts in one segment within 7 days become a campaign (NBC) once ${isMgr ? 'you confirm' : 'Daniel confirms'}. Fewer, and each account gets its own next best action (NBA). Sensitive segments never become campaigns.</div>
      <div class="seg-grp-h">${ic('megaphone', 15)} Campaign segments · NBC<span>one sequence for the whole segment; delivery is tracked in Campaigns</span></div>
      <div class="srow-list">${SG.filter(x => x.mode === 'NBC').map(segRow).join('') || '<div class="empty">No campaign segments match.</div>'}</div>
      <div class="seg-grp-h">${ic('bolt', 15)} Next best action segments · NBA<span>one action per account, from the segment's message structure; delivery is tracked here</span></div>
      <div class="srow-list">${SG.filter(x => x.mode !== 'NBC').map(segRow).join('') || '<div class="empty">No segments match.</div>'}</div>`;
  }
  /* Segments track both: a campaign segment (NBC) through its campaign, every other segment (NBA) through the delivery of each account's action */
  const segNba = s => ACCOUNTS.filter(a => a.seg === s.id && a.nba && !a.campaign && /auto|sent|review|ready/.test(a.nba.status) && visible(a));
  /* ─── Accounts › Signals: every signal by level, first-party included, and what the filter discarded ─── */
  const LEVEL = x => /visitor|website|webinar|download|email (open|click)|g2 buyer/i.test(x.source + ' ' + x.type) ? 'First-party' : /linkedin/i.test(x.source + ' ' + x.type) ? 'Personal · LinkedIn' : /job-change|exec|plant head|champion|role/i.test(x.source + ' ' + x.type) ? 'Personal' : /rival|competitor|renewal|contract/i.test(x.source + ' ' + x.type) ? 'Competitor' : /regulat|market|price|standard|deadline/i.test(x.source + ' ' + x.type) ? 'Market' : 'Company';
  function renderSignals() {
    const rows = ACCOUNTS.filter(visible).flatMap(a => a.signals.map(x => ({ a, x, lv: LEVEL(x) }))).sort((p, q) => q.x.weight - p.x.weight);
    const live = rows.filter(r => r.x.weight > 0), fp = rows.filter(r => r.lv === 'First-party'), exp = rows.filter(r => !(r.x.weight > 0));
    const pick = i => (ACCOUNTS.filter(visible)[i % Math.max(1, ACCOUNTS.filter(visible).length)] || ACCOUNTS[0]).name;
    const DISC = [['Headquartered in Singapore', 'Time-bound', 'Has no end date, so it never makes a conversation timely'], ['Company size inferred from office photos', 'Observable', 'Cannot be verified from a public source'], ['Liked a post about a charity cycling event', 'Predictive', 'A passive like on a post with no link to the category'], ['Sponsors a local football club', 'Predictive', 'No documented link to buying'], ['Rumoured restructuring on a forum', 'Observable', 'No reliable source'], ['Evergreen careers page: "always hiring"', 'Time-bound', 'No finite window']];
    const tabs = [['live', `Live (${live.length})`], ['first', `First-party (${fp.length})`], ['expired', `Expired (${exp.length})`], ['discarded', `Discarded (${DISC.length})`]];
    const cv = frame('Signals', `What makes a conversation timely, at five levels: market, company, competitor, personal and first-party. Every signal keeps its source and date.`, '');
    const row = r => `<tr class="row-link" onclick="App.openRecord('${r.a.id}','overview')"><td><div class="nm">${esc(r.x.type)}</div><div class="sm">${esc(r.x.text)}</div></td><td>${esc(r.a.name)}</td><td><span class="badge ${r.lv === 'First-party' ? 'b-ter' : r.lv === 'Competitor' ? 'b-warn' : 'b-sec'}">${esc(r.lv)}</span></td><td><span class="badge b-grey">Tier ${r.x.tier}</span></td><td class="sm">${ago(r.x.age)}</td><td class="mono">${r.x.weight > 0 ? r.x.weight : '<span class="muted">expired</span>'}</td><td class="sm">${esc(r.x.source)}</td></tr>`;
    const head = '<thead><tr><th>Signal</th><th>Account</th><th>Level</th><th>Signal tier</th><th>Age</th><th>Points today</th><th>Source</th></tr></thead>';
    cv.innerHTML = `<div class="rule"><b>How a signal counts.</b> Only signals that are observable, predictive and time-bound count. Tier 1 is worth 100 points, tier 2 60 and tier 3 30; each fades with age and stops at its expiry. The same event from several sources counts once, and a repeat inside 30 days counts less.</div>
      <div class="dtabs" style="margin-top:0">${tabs.map(([k, l]) => `<button class="${sigTab === k ? 'on' : ''}" onclick="App.setSigTab('${k}')">${l}</button>`).join('')}</div>
      ${sigTab === 'discarded' ? `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>What was found</th><th>Account</th><th>Failed test</th><th>Why</th></tr></thead><tbody>${DISC.map((d, i) => `<tr><td>${esc(d[0])}</td><td>${esc(pick(i * 3))}</td><td><span class="badge b-neg">${d[1]}</span></td><td class="sm">${esc(d[2])}</td></tr>`).join('')}</tbody></table></div><div class="sm muted" style="margin-top:8px">Discarded signals are not escalations; they are kept so anyone can see what the filter dropped and why.</div>`
      : `${sigTab === 'first' ? '<div class="placeholder-note" style="margin:0 0 10px"><div><b>First-party signals</b> come in through GA4, marketing automation, the sequencer, call transcripts and the CRM: website and pricing-page visits, G2 research, downloads, email clicks, webinar attendance and AI-assistant referrals. A pricing-page visit, a live webinar or a positive reply takes the fast lane to the rep within minutes.</div></div>' : ''}<div class="card tbl-wrap"><table class="tbl">${head}<tbody>${(sigTab === 'first' ? fp : sigTab === 'expired' ? exp : live).map(row).join('') || '<tr><td colspan="7" class="empty">None</td></tr>'}</tbody></table></div>`}`;
  }
  /* ─── Campaigns › Next best actions: one action per account, tracked from prepared to replied ─── */
  function renderNbaList() {
    const rows = nbaRows().sort((p, q) => q.score - p.score);
    const cv = frame('Next best actions', 'One account, one action. When it meets all five criteria it is ready to send with one click; the rest wait in Approvals with the failed criterion.', `<button class="btn sm" onclick="App.nav('approvals')">${ic('task', 13)} Approvals</button>`);
    cv.innerHTML = `<div class="placeholder-note" style="margin-bottom:10px"><div><b>Live order.</b> The queue re-orders the moment something happens. 09:42: Halcyon moved up 4 places after a reply on LinkedIn. 08:15: Juniper moved to first after a pricing-page visit.</div></div><div class="rule"><b>Next best action or campaign?</b> When 10 or more accounts share one micro-segment within 7 days, they become one campaign (NBC) that the sales manager confirms. Below that, each account gets its own next best action (NBA), written from its strongest signal.</div>
      ${nbaTop({ rate: null }, rows)}<div style="margin-top:12px">${nbaTable(rows)}</div>`;
  }
  function nbaCounts(rows) {
    const t = rows.map(track);
    return { all: rows.length, went: t.filter(x => x.how === 'Ready to send').length, wait: t.filter(x => x.stage === 0 && x.how === 'Needs a person').length, sent: t.filter(x => x.stage >= 1).length, deliv: t.filter(x => x.stage >= 2).length, opened: t.filter(x => x.stage >= 3).length, replied: t.filter(x => x.stage >= 4).length, bounced: t.filter(x => x.cls === 'b-neg').length };
  }
  function segRowM(s, st, c) {
    const m = (v, k) => `<div><b>${v}</b><span>${k}</span></div>`;
    if (c) { const cs = campStats(c); return `<div class="srow-m">${m(cs.total, 'Enrolled')}${m(cs.progress, 'In progress')}${m(pct(cs.replies, cs.started), 'Reply rate')}${m(cs.positive || '-', 'Positive')}${m(cs.meetings || '-', 'Meetings')}${m(esc(campStatus(c)), 'Campaign')}</div>`; }
    const n = nbaCounts(segNba(s));
    return `<div class="srow-m">${m(n.all, 'Actions')}${m(n.went, 'Ready to send')}${m(n.wait, 'Waiting')}${m(n.deliv, 'Delivered')}${m(n.opened, 'Opened')}${m(n.replied, 'Replied')}</div>`;
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
    return `<div class="mcards">${card('Next best actions', n.all, 'one per account', 'bolt')}${card('Ready to send', n.went, 'met all five criteria', 'check')}${card('Waiting for approval', n.wait, 'in Approvals', 'task')}${card('Delivered', n.deliv, `${pct(n.deliv, n.sent)} of sent${n.bounced ? ` · ${n.bounced} bounced` : ''}`, 'mail')}${card('Open rate', pct(n.opened, n.deliv), `${n.opened} opened`)}${card('Reply rate', pct(n.replied, n.deliv), `${n.replied} replied · ${s.rate ? s.rate + '% positive historically' : 'no history yet'}`, 'reply')}</div>
      <div class="dlv">${bar}</div>`;
  }
  function nbaTable(rows) {
    return `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Next best action</th><th>How it went out</th><th>Delivery</th><th>When</th>${isMgr ? '<th>Rep</th>' : ''}</tr></thead><tbody>
      ${rows.map(a => { const t = track(a); return `<tr class="row-link" onclick="App.openRecord('${a.id}','engage')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.name)} · ${tierBadge(a.tier)} ${sc(a)}</div></div></div></td><td>${esc(a.nba.action)}<div class="sm">${chIc(a.nba.channel)} ${a.nba.channel}</div></td><td><span class="badge ${/Ready|one click/.test(t.how) ? 'b-pos' : t.how === 'Needs a person' ? 'b-ter' : 'b-sec'} nodot">${t.how}</span></td><td><div class="dlv-c">${dots(t)}<span class="badge ${t.cls}">${esc(t.label)}</span></div></td><td class="sm">${esc(t.when || '–')}</td>${isMgr ? `<td>${ownerPick(a)}</td>` : ''}</tr>`; }).join('') || `<tr><td colspan="6" class="empty">${isMgr ? 'No next best actions here.' : 'None of your accounts have a next best action in this segment.'}</td></tr>`}
    </tbody></table></div>`;
  }
  function renderSegment() {
    const s = segOf(segSel), c = s.campaign ? campOf(s.campaign) : null, st = segStats(s);
    const accs = ACCOUNTS.filter(a => a.seg === s.id && visible(a)).sort((p, q) => q.score - p.score);
    const cv = frame(`<button class="back-l" onclick="App.openSegment(null)">${ic('left', 14)}</button> ${esc(s.name)} ${modeBadge(s)}`, `${esc(s.trigger)} · ${st.total} accounts${s.fromList ? ' · from a prospect list' : ''}`, c ? `<button class="btn sm pri" onclick="App.goCampaign('${c.id}')">${ic('megaphone', 13)} Open campaign</button>` : `<button class="btn sm" onclick="App.saveSegList('${s.id}')">${ic('savei', 13)} Save as a list</button>`);
    const nrows = segNba(s);
    cv.innerHTML = `${s.mode !== 'NBC' ? nbaTop(s, nrows) : `<div class="mcards">${[['Accounts', isMgr ? st.total : `${st.mine} of ${st.total}`, isMgr ? 'in this segment' : 'are yours'], ['Waiting on you', st.waiting, 'need a person'], ['Ready to send', st.ahead, 'all five criteria met'], ['Positive rate', s.rate ? s.rate + '%' : '--', `${s.outcomes} outcomes`]].map(([k, v, d]) => `<div class="mcard"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('')}</div>${c ? `<div class="tv-note" style="margin-top:12px">${ic('megaphone', 13)} This segment runs as one campaign. Each person's steps and delivery are in <a href="#campaigns" onclick="App.goCampaign('${c.id}');return false">${esc(c.name)}</a>.</div>` : ''}`}
      <div class="seg-why"><div><div class="lbl">Why these accounts are together</div><p class="p">${esc(s.why)}</p></div><div><div class="lbl">Message structure</div><p class="p">${esc(s.structure)}</p></div></div>
      <div class="dtabs">${[['accounts', s.mode === 'NBC' ? 'Accounts' : 'Next best actions'], ['activity', 'Activity'], ['replies', 'Replies']].map(([k, lb]) => `<button class="${segTab === k ? 'on' : ''}" onclick="App.setSegTab('${k}')">${lb}</button>`).join('')}${isMgr ? `<span style="margin-left:auto">${ownerSel()}</span>` : ''}</div>
      ${segTab === 'accounts' && s.mode !== 'NBC' ? nbaTable(nrows) : segTab === 'accounts' ? `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Links</th><th>Status</th><th>Company</th><th>Tier · score</th><th>${s.mode === 'NBC' ? 'Signal' : 'Next best action'}</th>${isMgr ? '<th>Owner</th>' : ''}<th>Last activity</th></tr></thead><tbody>
        ${accs.map(a => `<tr class="row-link" onclick="App.openRecord('${a.id}','engage')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.contact.title)}</div></div></div></td><td><span class="li-ic">${ic('li', 14)}</span></td><td>${stepBadge(a)}</td><td>${esc(a.name)}</td><td>${tierBadge(a.tier)} <span class="mono" style="font-size:12px">${sc(a)}</span></td><td>${s.mode !== 'NBC' && a.nba ? esc(a.nba.action) + `<div class="sm">${a.nba.channel} · ${gate(a).every(x => x[1]) ? 'passed every check' : /sent/.test(a.nba.status) ? 'approved by a person' : 'needs you'}</div>` : a.whyNow ? esc(a.whyNow.type) + `<div class="sm">${ago(a.whyNow.age)}</div>` : '–'}</td>${isMgr ? `<td>${ownerPick(a)}</td>` : ''}<td class="sm">${esc((a.activity[a.activity.length - 1] || {}).t || '–')}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">None of your accounts are in this segment.</td></tr>'}
      </tbody></table></div>`
      : segTab === 'activity' ? `<div class="card"><div class="card-b timeline">${accs.flatMap(a => a.activity.slice(-2).map(x => ({ a, x }))).slice(0, 14).map(({ a, x }) => `<button class="tl-row" onclick="App.openRecord('${a.id}','activity')"><span class="ic k-${x.k}">${ic(ACT_IC[x.k] || 'clock', 13)}</span><div class="grow"><div class="nm">${esc(a.name)} · ${esc(x.t)}</div><div class="sm">${esc(x.d)}</div></div><span class="when">${esc(x.when)}</span></button>`).join('') || '<div class="empty">No activity yet.</div>'}</div></div>`
      : repliesTable(REPLIES.filter(r => acct(r.acc).seg === s.id))}`;
  }
  function repliesTable(list) { return list.length ? `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Reply</th><th>Type</th><th>When</th></tr></thead><tbody>${list.map(r => { const a = acct(r.acc); return `<tr class="row-link" onclick="App.openRecord('${a.id}','activity')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(r.from)}</div><div class="sm">${esc(a.name)}</div></div></div></td><td>"${esc(r.text)}"</td><td><span class="badge ${S6[st6(r)][0]}">${st6(r)}</span></td><td class="sm">${esc(r.at)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="card"><div class="empty">No replies yet.</div></div>'; }

  /* Campaigns: list → campaign (Enrollments, Steps, Outbox, Replies) → person drawer */
  function renderPlays() {
    const P = [['Turnaround announced', 'Refinery or petrochemical, Tier A or B', 'Operations', [['Log the trigger and set a recontact date', 'auto'], ['Email: the three risks peers hit', 'review'], ['LinkedIn: pre-turnaround checklist (carousel)', 'review'], ['Direct ask for a health check', 'review']], 'Checklist carousel', 'v3', '58 per 100 replied · 12 outcomes'],
      ['New reliability leader', 'Tier A or B, leader joined in the last 30 days', 'Buyer', [['Add the leader to the committee', 'auto'], ['Email: first 90 days', 'review'], ['Case study one-pager', 'review']], 'One-pager PDF', 'v5', '64 per 100 positive · 14 outcomes'],
      ['Rival contract ending', 'Named rival, contract ends within 6 months', 'Technical lead', [['Set the recontact date to 90 days before the end', 'auto'], ['Email: switch now or at contract end', 'review'], ['Comparison document', 'review'], ['Persistent follow-up until a clear answer', 'review']], 'Comparison document', 'v2', '48 per 100 positive · 21 outcomes'],
      ['Low confidence, Tier C', 'Any', 'Any', [['Watch for a stronger signal', 'nurture']], '–', 'v1', 'Nurture']];
    const C = [['Control-system migration, Q2', 'Rival contract ending', 'Technical lead', 'Email + LinkedIn', 'Extend vs migrate', '5 replies, 3 meetings'], ['New leaders, Q3', 'New exec hire', 'Buyer', 'Email', 'First 90 days', '9 replies, 4 meetings'], ['Expansion projects, Sep', 'Capex approved', 'Operations', 'Email', 'Automation for the project', '4 replies, 2 meetings']];
    const cv = frame('Plays', 'Versioned plays: trigger, qualifier, persona, steps and asset. Fixed steps run on their own; anything customer-facing follows the autonomy policy.', '');
    const CD = [{ steps: [['0', 'Email', 'Your contract ends in Q2: extend or migrate?'], ['3', 'LinkedIn', 'Connection note with the peer comparison'], ['7', 'Email', 'Comparison document: extend vs migrate, 5 years'], ['12', 'Email', 'Direct ask: a two-day site assessment']], open: 'Your support contract with the current vendor ends in Q2. Before you sign another three years, here is what a comparable site found when it priced both options.', worked: 'Leading with the contract date; the comparison document drove 4 of the 5 replies', didnt: 'The LinkedIn step got no replies from technical leads', acc: 14, rr: '36%', mt: 3 },
      { steps: [['0', 'Email', 'First 90 days: three things peers did'], ['4', 'Email', 'Case study one-pager'], ['9', 'Email', 'Offer a 30-minute intro']], open: 'Congratulations on the new role. Most new reliability leaders start with the same question: where does the downtime really come from?', worked: 'Short first email within 10 days of the hire; 9 of 21 replied', didnt: 'Sending after 30 days halved the reply rate', acc: 21, rr: '43%', mt: 4 },
      { steps: [['0', 'Email', 'Automation for the new unit'], ['5', 'Email', 'Scope checklist (PDF)'], ['11', 'Email', 'Ask for the control-scope owner']], open: 'Your expansion was approved last month. Control scope is usually settled after the mechanical design, and that is where cost and schedule risk start.', worked: 'Asking for the control-scope owner by name', didnt: 'Generic automation benefits; replies came only after the checklist', acc: 12, rr: '33%', mt: 2 }];
    cv.innerHTML = `<div class="rule" style="margin:0 0 12px"><b>Play, campaign or next best action?</b> A <b>play</b> is the reusable recipe: the trigger, who qualifies, the persona, the steps and the asset. A <b>campaign (NBC)</b> runs a play for a whole micro-segment at once (10 or more accounts with the same signal in 7 days), with one sequence the manager confirms. A <b>next best action (NBA)</b> is one step of a play for one account, when there are fewer. Results from both feed back into the play's next version.</div><div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Trigger</th><th>Qualifier</th><th>Persona</th><th>Steps</th><th>Asset</th><th>Version</th><th>Results</th></tr></thead><tbody>${P.map((p, i) => `<tr><td class="nm">${esc(p[0])}</td><td class="sm">${esc(p[1])}</td><td class="sm">${esc(p[2])}</td><td class="sm">${p[3].map(s => `<div>${esc(s[0])} <span class="badge ${s[1] === 'auto' ? 'b-pos' : s[1] === 'review' ? 'b-ter' : 'b-grey'} nodot">${s[1]}</span></div>`).join('')}</td><td class="sm">${esc(p[4])}${p[4] !== '–' ? `<div><button class="btn sm ghost" onclick="App.toast('Asset swapped on the live campaign. Sent touches keep the old version.')">Swap asset</button></div>` : ''}</td><td class="sm">${p[5]}</td><td class="sm">${esc(p[6])}</td></tr>`).join('')}</tbody></table></div>
      <div class="sm muted" style="margin:8px 2px 16px">Persistent follow-up: on a thread with no clear answer, a short follow-up goes every 5 days, up to 3 times, and stops on any reply or opt-out.</div>
      <div class="lbl" style="margin-bottom:8px">Campaign corpus · new briefs start from what worked for similar accounts · click one to open it</div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Past campaign</th><th>Signal</th><th>Persona</th><th>Channels</th><th>Structure</th><th>Result</th></tr></thead><tbody>${C.map((c, k) => `<tr class="row-link ${corpSel === k ? 'on' : ''}" onclick="App.corpus(${k})">${c.map((x, i) => `<td class="${i ? 'sm' : 'nm'}">${i ? '' : `<span class="corp-car">${corpSel === k ? '▾' : '▸'}</span> `}${esc(x)}</td>`).join('')}</tr>${corpSel === k ? `<tr class="corp-d"><td colspan="6"><div class="corp-g"><div><div class="lbl">Sequence</div>${CD[k].steps.map(s => `<div class="corp-s"><span class="mono">Day ${s[0]}</span>${chIc(s[1])} ${esc(s[1])}<b>${esc(s[2])}</b></div>`).join('')}<div class="lbl" style="margin-top:12px">Opening line</div><p class="corp-q">"${esc(CD[k].open)}"</p></div><div><div class="corp-k"><div><b>${CD[k].acc}</b><span>accounts</span></div><div><b>${CD[k].rr}</b><span>reply rate</span></div><div><b>${CD[k].mt}</b><span>meetings</span></div></div><div class="corp-w"><b>What worked</b><span>${esc(CD[k].worked)}</span></div><div class="corp-w"><b>What did not</b><span>${esc(CD[k].didnt)}</span></div><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn sm pri" onclick="event.stopPropagation();App.corpusUse(${k})">${ic('spark', 13)} Start a campaign from this</button><button class="btn sm" onclick="event.stopPropagation();App.toast('Saved as a new play version (mock)')">Save as a play</button></div></div></div></td></tr>` : ''}`).join('')}</tbody></table></div>`;
  }
  function renderCampaigns() {
    if (campSel) return renderCampaign();
    if (outSel) return renderOutGen();
    if (campSub !== 'plays') { const cv0 = frame('Campaigns and NBA', 'Everything you run, by stage. Ask in the chat to build a campaign or a next best action', ''); cv0.innerHTML = outView(); return; }
    if (campSub === 'plays') return renderPlays();
    const order = ['Ready to confirm', 'Draft', 'Running', 'Completed'];
    const list = CAMPAIGNS.slice().sort((p, q) => order.indexOf(p.status) - order.indexOf(q.status));
    const nrows = nbaRows().sort((p, q) => q.score - p.score);
    const cv = frame('Campaigns and NBA', `${list.length} campaigns · ${nrows.length} next best actions`, `<button class="btn sm pri" onclick="App.ask('Build the campaign')">${ic('plus', 13)} New campaign</button>`);
    cv.innerHTML = `<div class="toolbar">${ownerSel()}${filt('Starred', 'star', false)}${filt('Active', '', false)}<div class="search" style="margin-left:auto">${ic('search', 14)}<input placeholder="Search…" aria-label="Search campaigns"></div></div>
      <div class="placeholder-note" style="margin:6px 0 12px">${ic('mail', 16)}<div><b>Placeholder.</b> Sending through email and LinkedIn connects after the pilot. Nothing is sent from the mock.</div></div>
      <div class="srow-list">${list.map(c => { const st = campStats(c); return `<div class="srow" onclick="App.goCampaign('${c.id}')">
        <div class="srow-n"><div class="nm">${esc(c.name)} ${campBadge(c)}${c.status === 'Running' ? '<span class="live-dot" title="Active"></span>' : ''}</div><div class="sm">${seqSpan(c)} · ${esc(c.seg ? segOf(c.seg).trigger : 'archived segment')}</div></div>
        <div class="srow-m"><div><b>${st.total}</b><span>Total enrollments</span></div><div><b>${st.progress}</b><span>In progress</span></div><div><b>${st.finished}</b><span>Finished</span></div><div><b>${pct(st.replies, st.started)}</b><span>Reply rate</span></div><div><b>${st.positive || '-'}</b><span>Positive</span></div><div><b>${st.positive + st.objection || '-'}</b><span>Positive + objection</span></div></div>
        <button class="ic-btn" title="Star" onclick="event.stopPropagation();App.star('${c.id}')" style="color:${S.starred[c.id] ? 'var(--ter)' : 'inherit'}">${ic('star', 15)}</button></div>`; }).join('')}</div>`;
    cv.insertAdjacentHTML('beforeend', `<div class="lbl" id="nbaSec" style="margin:22px 0 8px">Next best actions · one account, one action</div><div class="placeholder-note" style="margin-bottom:10px"><div><b>Live order.</b> The queue re-orders the moment something happens. 09:42: Halcyon moved up 4 places after a reply on LinkedIn. 08:15: Juniper moved to first after a pricing-page visit.</div></div><div class="rule"><b>Campaign or next best action?</b> When 10 or more accounts share one micro-segment within 7 days they become one campaign above, which the sales manager confirms. Below that, each account gets its own next best action here.</div>${nbaTop({ rate: null }, nrows)}<div style="margin-top:12px">${nbaTable(nrows)}</div>`);
    if (campSub === 'nba') setTimeout(() => { const e = document.getElementById('nbaSec'); if (e) e.scrollIntoView({ block: 'start' }); }, 60);
  }
  function campTasks(c, accs) {
    const conf = S.camp[c.id] === 'Confirmed', fell = campFell(c.id) || S.camp[c.id + 'x'];
    const cls = { sent: 'b-sec', due: 'b-pos', held: 'b-warn', off: 'b-grey', sched: 'b-grey', wait: 'b-grey' };
    const head = fell ? `<div class="blk warn" style="margin-top:12px">${ic('alert', 15)}<div class="grow"><b>${S.camp[c.id + 'x'] ? 'Declined' : 'Not confirmed in 3 days'}</b><span>The campaign did not start. Each of the ${accs.length} accounts went back to its own next best action and was re-ranked.</span></div></div>`
      : conf ? `<div class="placeholder-note" style="margin-top:12px"><div><b>Confirmed.</b> Campaign day ${campDay(c.id)}. Each touch is a task for the account's owner on day 0, 4 and 9. Every touch is re-checked (exclusions, opt-outs, open deals, recent touches) before it is offered; a failed re-check holds the touch and tells the owner. A reply removes the pending touches.</div></div>`
      : `<div class="placeholder-note" style="margin-top:12px"><div><b>Waiting for ${isMgr ? 'you' : first(USERS.pavan.name)} to confirm.</b> ${accs.length} accounts in this micro-segment crossed the threshold (10 or more in 7 days). If nobody confirms in 3 days, the accounts go back to individual next best actions.${isMgr ? `<div style="margin-top:10px"><b>Confirm the format of each touch</b>${c.touches.map((tc, i) => `<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap"><span class="sm" style="min-width:150px">Touch ${i + 1} · day ${tc.day} · ${tc.ch}</span><label class="sr" for="cf${i}">Format</label><select id="cf${i}" class="sel" onchange="App.seqEdit('${c.id}',${i},'fmt',this.value)">${FORMATS[tc.ch].concat(FORMATS[tc.ch].includes(tc.fmt) ? [] : [tc.fmt]).map(x => `<option ${seqOf(c)[i].fmt === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`).join('')}</div>` : ''}${isMgr ? ` <button class="btn sm" onclick="App.declineCampaign('${c.id}')">Decline: use next best actions</button>` : ''}</div></div>`;
    return head + `<div class="sec-row" style="margin-top:14px"><div class="lbl">Touch tasks by owner</div></div><div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Owner</th>${c.touches.map((tc, i) => `<th>Touch ${i + 1} · day ${tc.day} · ${tc.ch}</th>`).join('')}<th></th></tr></thead><tbody>${accs.map(a => `<tr><td class="nm">${esc(a.name)}<div class="sm">${esc(a.contact.name)}</div></td><td class="sm">${esc(first(USERS[a.owner].name))}</td>${c.touches.map((_, i) => { const s = touchState(a, i); return `<td><span class="badge ${cls[s.s]} nodot" title="${esc(s.txt)}">${esc(s.s === 'due' ? 'Due today' : s.s === 'held' ? 'Held' : s.s === 'sent' ? 'Sent' : s.s === 'sched' ? 'Scheduled' : s.s === 'wait' ? 'Waiting' : 'Removed')}</span>${s.s === 'held' || s.s === 'off' || s.s === 'sched' ? `<div class="sm muted" style="max-width:190px">${esc(s.txt)}</div>` : ''}${s.s === 'due' && (a.owner === me.id || isMgr) ? ` <button class="btn sm pri" onclick="App.campSend('${a.id}',${i})">Send</button>` : ''}</td>`; }).join('')}<td>${conf && !(S.creply || {})[a.id] ? `<button class="btn sm" onclick="App.campReply('${a.id}')">Log a reply</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  /* A campaign runs several cohorts: its micro-segment, plus any list or segment added to it */
  const COH_SEED = { c2: [{ id: 'w1', subj: 'After the session: the contract question', struct: 'Reference the session they joined → the contract-end question peers raise → offer the side-by-side comparison', name: 'Webinar attendees on rival platforms', src: 'List · uploaded by Daniel', n: 5, at: 'Joined on day 6', sent: 10, total: 15, rep: 1, pos: 1, meet: 0, sentSteps: 2, line: 'You joined our session on running a mixed vendor estate; the contract question comes up there often.',
    rows: [['Grace Lee', 'Head of Maintenance', 'Harbourline Refining', 'Replied · interested'], ['Arjun Patel', 'Reliability Lead', 'Ironbark Olefins', 'Opened · no reply yet'], ['Mei Wong', 'Plant Manager', 'Tidewell Gas Processing', 'Delivered'], ['Liam Chen', 'Technical Lead (I&C)', 'Saltbush Petrochem', 'Opened · no reply yet'], ['Ruby Singh', 'Operations Manager', 'Cobalt Bay Refining', 'Delivered']] }] };
  /* ─── Outreach copy. Steps and timing are shared by a campaign's cohorts; the copy is written per cohort,
     from its micro-segment's angle. Placeholders fill in per person: {first_name} {company} {signal} {sender}. ─── */
  const COPY_MID = {
    "Reference the announced shutdown window and the three risks peers hit in planning.": "With the shutdown window now set, the next few months decide how much of it goes to plan. Peers who went through a turnaround recently said three things caught them out: spares that weren't staged in time, control-system work that slipped onto the critical path, and permits that took longer than planned.",
    "The pre-turnaround health checklist a peer refinery used.": "A peer refinery used this one-page health checklist six months before their turnaround. Happy to share it if it's useful for {company}.",
    "A direct ask for a pre-turnaround health check, referencing both earlier touches.": "Following up on my note and the checklist. Would a short pre-turnaround health check help? We walk the control system and instrumentation with your team and hand back a prioritised list, in about two hours.",
    "Extend vs. migrate: the cost question, framed for their renewal date.": "Your control-system contract comes up for renewal soon. Before extending, it's worth asking what each path costs over the next ten years, not just the next three.",
    "Migration-path comparison: lifecycle cost and outage windows.": "I've put the two paths side by side: lifecycle cost, and the outage windows each one needs. Page 2 is the one most teams find useful.",
    "Direct ask on LinkedIn, referencing the comparison.": "did the comparison help? If useful, I can walk your team through the numbers for {company} in 20 minutes.",
    "Congratulate on the approval; what peers decided in the first 90 days.": "Congratulations on the approval at {company}. The first 90 days usually set the automation scope for the whole project; here's what peers decided early and were glad they did.",
    "How an expansion kept automation on the critical path.": "here's how one expansion kept automation on the critical path instead of letting it slip to the end. Five slides.",
    "Offer an early design review, referencing both touches.": "Following up on both notes: would an early design review help? Two of our engineers, half a day, and you keep the output whatever you decide.",
    "Reference the new control-systems roles and what they usually mean: a migration or a new unit.": "I saw {company} is hiring several control-systems engineers. That usually means a migration or a new unit is coming, and when it is, the staffing plan often decides the schedule.",
    "Short note to the hiring manager referencing the roles.": "noticed the control-systems roles at {company}. Happy to share how peers staffed similar build-outs.",
    "Case study: how a peer refinery staffed its DCS cut-over without delaying start-up.": "Here's how a peer refinery staffed its DCS cut-over without delaying start-up: who they hired, what they contracted out, and what they'd do differently.",
    "Offer a 60-minute migration workshop, referencing the case study.": "if it would help, we run a 60-minute workshop on staffing and sequencing a migration. Want me to set one up for your team?",
    "Debottlenecking: where automation pays back first.": "Debottlenecking projects pay back fastest where automation removes the constraint. Here's where peers saw the payback first.",
    "Payback timeline from 3 peer projects.": "This one-page timeline shows the payback from three peer projects, month by month.",
    "Direct ask.": "Would it be worth 20 minutes to see how this maps to {company}?",
    "Opening: the risk peers hit first": "Peers in the same position told us the first risk they hit was the one they planned least for. Here's what it was, and what they changed.",
    "Proof: what a comparable site did": "A comparable site in the region faced the same question last year. They cut unplanned trips by 18% in the first twelve months; the one-pager shows how.",
    "The direct ask: a two-day site assessment": "Would a two-day site assessment help? Our engineers walk the plant with your team and you keep the report, whatever you decide.",
    "Short follow-up": "Just bringing this back to the top of your inbox. Is this worth a short conversation?",
    "Second proof: a peer number": "One more number from a peer: 40% less time spent on unplanned work after the change.",
    "A new angle: the cost of waiting": "One thing peers often underestimate is the cost of waiting a year. Happy to share the numbers.",
    "Connection note": "saw the news at {company}. Would be good to connect.",
    "Share the carousel": "sharing a short carousel on what peers did in the same situation. Five slides.",
    "Comment-led follow-up": "following up on my note. Happy to share what we've seen work elsewhere.",
    "Last note: close the loop": "I won't keep filling your inbox. If the timing is wrong, just say so and I'll check back next quarter.",
    "Last note on LinkedIn: close the loop": "last note from me. If the timing is wrong, no problem; I'll check back next quarter.",
    "Reference the session they joined": "Thanks for joining. I wanted to follow up with the one slide most people asked about afterwards.",
    "A short call: follow up on the earlier steps and offer a 20-minute session.": "Peers in your position usually want to see what the first 90 days look like; I can walk your team through it.",
    "A short WhatsApp message following up on the earlier steps.": "following up on my email. Happy to share the one-pager here if that's easier.",
    "A short text following up on the earlier steps.": "following up on my email. Worth a quick call this week?",
    "A printed one-pager with a short handwritten note.": "Planning a change like this is easier with the numbers on paper, so I've put the essentials on one page.",
    "A final, short note: offer a 20-minute call and make it easy to say no.": "One last note from me: if a 20-minute call would help, I'm happy to set it up. If the timing is wrong, just say so.",
    "the contract-end question peers raise": "One question came up more than any other: what to do when the current vendor contract ends. Here's how peers in the session framed it.",
    "offer the side-by-side comparison": "I can send the side-by-side comparison we showed in the session, tailored to {company}. Shall I?",
    "what a comparable site did": "Here's what a comparable site did in the same situation, and what it changed for them.",
    "offer a short working session": "Would a short working session help? 45 minutes with your team, and you keep the output.",
  };
  const COPY_SUBJ = { c1: 'Your 2027 turnaround: three risks peers hit', c2: 'Extend or migrate: the cost question', c3: 'Your expansion: the first 90 days', c4: 'Where debottlenecking pays back first' };
  const cpSentence = s => { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) + (/[.?!]$/.test(s) ? '' : '.') : ''; };
  const cpLow = s => s && !/^I[\s']/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  function copyDraft(cid, x, tc, i, sq) {
    const firstC = !x || x.first, ang = x && !firstC ? cohAngle(x, i) : null, own = x && !firstC && i < cohParts(x).length;
    let mid = own ? (COPY_MID[ang] || cpSentence(ang)) : (COPY_MID[tc.t] || cpSentence(tc.t));
    const signalOpen = 'I noticed this at {company}: {signal}.', open = i === 0 ? (firstC || !x.line || /^Opens with/.test(x.line) ? signalOpen : x.line) : '';
    const prevEmails = sq.slice(0, i).filter(s => s.ch === 'Email').length;
    if (tc.ch === 'LinkedIn') { mid = cpLow(mid); return { subject: '', body: `Hi {first_name}, ${open ? cpLow(open) + ' ' : ''}${mid}`.replace(/\s+/g, ' ').trim() }; }
    if (/Phone/.test(tc.ch)) return { subject: '', body: tc.fmt === 'Voicemail' ? `Hi {first_name}, it's {sender} from Vantera, about {company}. ${cpSentence(mid).split(/(?<=[.?!])\s/)[0]} I'll send a short email so you have my details.` : `Opening: Hi {first_name}, it's {sender} from Vantera. ${i === 0 ? "I'm calling because I saw this at {company}: {signal}." : "I'm following up on my notes."}\n\nWhy now: ${cpSentence(mid)}\n\nAsk: Would a 20-minute session next week help your team?\n\nIf it goes to voicemail: Hi {first_name}, {sender} here about {company}. I'll send a short email so you have my details.` };
    if (/WhatsApp|SMS/.test(tc.ch)) { const m = cpLow(tc.ch === 'SMS' ? cpSentence(mid).split(/(?<=[.?!])\s/)[0] : mid); return { subject: '', body: `Hi {first_name}, it's {sender} from Vantera. ${i === 0 && open ? cpSentence(cpLow(open)) + ' ' : ''}${cpSentence(m)}`.replace(/\s+/g, ' ').trim() }; }
    if (/Direct mail/.test(tc.ch)) return { subject: '', body: ['Dear {first_name},', open, cpSentence(mid), tc.fmt === 'Gift with a note' ? "A small thank-you for your time is enclosed; no strings attached." : "I've enclosed a printed copy of the one-pager. If it's useful, I'd be glad to walk your team through it.", 'Kind regards,\n{sender}'].filter(Boolean).join('\n\n') };
    const s0 = firstC ? (tc.subject && tc.subject !== (campOf(cid) || {}).name ? tc.subject : COPY_SUBJ[cid] || tc.subject || ((campOf(cid) || {}).name || 'A quick question')) : (x.subj || cpSentence(cohAngle(x, 0)).replace(/\.$/, '').slice(0, 64));
    const subject = prevEmails === 0 ? s0 : (tc.subject && firstC && tc.subject !== (campOf(cid) || {}).name ? tc.subject : 'Re: ' + s0);
    return { subject, body: ['Hi {first_name},', open, cpSentence(mid), i === 0 ? 'Would a 20-minute conversation next week be useful?' : '', 'Best,\n{sender}'].filter(Boolean).join('\n\n') };
  }
  const copyKey = (cid, x, i) => `${cid}|${x ? x.id : 'main'}|${i}`;
  const copyOf = (cid, x, tc, i, sq) => (S.copy || {})[copyKey(cid, x, i)] || copyDraft(cid, x, tc, i, sq);
  function copyFill(s, a) { if (!a) return s; const sig = a.whyNow ? cpLow(a.whyNow.text.replace(/\.$/, '')) : 'a recent change'; return String(s).replace(/\{first_name\}/g, first(a.contact.name)).replace(/\{company\}/g, a.name).replace(/\{signal\}/g, sig).replace(/\{sender\}/g, first(USERS[a.owner].name)); }
  function copyPreview(cp, a, ch) {
    const body = esc(copyFill(cp.body, a)).replace(/\n/g, '<br>');
    if (!a) return `<div class="cpv-e">Pick a person to preview.</div>`;
    return ch === 'Email' ? `<div class="cpv-hd"><div><span>To</span>${esc(a.contact.name)} · ${esc(a.name)}</div><div><span>Subject</span><b>${esc(copyFill(cp.subject, a))}</b></div></div><div class="cpv-body">${body}</div>`
      : /Phone|Direct mail/.test(ch) ? `<div class="cpv-hd"><div><span>${/Phone/.test(ch) ? 'Call' : 'Post to'}</span>${esc(a.contact.name)} · ${esc(a.name)}</div><div><span>${/Phone/.test(ch) ? 'Caller' : 'From'}</span><b>${esc(USERS[a.owner].name)}</b></div></div><div class="cpv-body">${body}</div>`
      : `<div class="cpv-li"><span class="cpv-av">${esc(initials(USERS[a.owner].name))}</span><div class="cpv-bub ${ch === 'WhatsApp' ? 'wa' : ch === 'SMS' ? 'sms' : ''}">${body}</div></div><div class="cpv-to">${esc(ch)} · to ${esc(a.contact.name)}</div>`;
  }
  function copyStep(o) {
    const key = copyKey(o.cid, o.x, o.i), sk = key.replace(/[^a-zA-Z0-9]/g, '_'), cp = copyOf(o.cid, o.x, o.tc, o.i, o.sq), edited = !!(S.copy || {})[key];
    const em = o.tc.ch === 'Email', limN = o.tc.ch === 'LinkedIn' && o.tc.fmt === 'Connection request' ? 300 : o.tc.ch === 'SMS' ? 160 : 0, lim = !!limN;
    const badge = /^Sent|Done/.test(o.state) ? `<span class="badge b-pos nodot">${ic('check', 11)} ${esc(o.state)}</span>` : o.state === 'Next' || o.state === 'First to go' ? `<span class="badge b-ter nodot">${esc(o.state)}</span>` : `<span class="badge b-grey nodot">${esc(o.state)}</span>`;
    return `<div class="mst ${o.locked ? 'locked' : ''}">
      <div class="mst-h"><span class="mst-n">${o.i + 1}</span><div class="mst-t"><b>${chIc(o.tc.ch)} ${esc(o.tc.ch)} · ${esc(o.tc.fmt)}</b><span>Day ${o.tc.day}${o.x ? ` · angle from ${esc(o.x.seg ? o.x.seg.name : o.x.name)}: ${esc(cpLow(o.x.first ? (cohAngle(o.x, o.i)) : cohAngle(o.x, o.i)))}` : ''}</span></div>${badge}${o.tools || ''}</div>
      ${stepTags(o, cp, key)}
      <div class="mst-b">
        <div class="mst-ed"><div class="mst-l">Copy ${o.locked ? '<em class="ai">as sent</em>' : edited ? '<em>edited</em>' : '<em class="ai">AI draft</em>'}</div>
          ${em ? `<label class="sr" for="cs-${sk}">Subject</label><input class="mst-sub" id="cs-${sk}" value="${esc(cp.subject)}" placeholder="Subject" ${o.locked ? 'readonly' : `oninput="App.copyEdit('${key}')"`}>` : ''}
          <label class="sr" for="cb-${sk}">Message</label><textarea class="mst-body" id="cb-${sk}" rows="${Math.min(20, Math.max(4, cp.body.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 52)), 0)))}" ${o.locked ? 'readonly' : `oninput="App.copyEdit('${key}')"`}>${esc(cp.body)}</textarea>
          ${o.locked ? `<div class="mst-f"><span class="muted">${ic('check', 12)} Sent, so the copy is locked</span></div>` : `<div class="mst-f"><span class="mst-tok"><span>Insert</span>${['first_name', 'company', 'signal', 'sender'].map(k => `<button type="button" onclick="App.copyIns('${key}','{${k}}')">${k.replace('_', ' ')}</button>`).join('')}</span><span class="sp"></span>${lim ? `<span class="mst-cnt" id="cc-${sk}" data-max="${limN}">${cp.body.length} / ${limN}</span>` : ''}<button class="chip" onclick="App.copyRewrite('${key}')">${ic('spark', 12)} Rewrite with AI</button>${edited ? `<button class="chip" onclick="App.copyReset('${key}')">Back to the AI draft</button>` : ''}</div>`}
          ${o.asset || ''}
        </div>
        <div class="mst-pv"><div class="mst-l">Preview${o.pv ? ` · as ${esc(o.pv.contact.name)}` : ''}</div><div class="cpv ${em || /Phone|Direct mail/.test(o.tc.ch) ? 'em' : 'li'}" id="cpv-${sk}" data-acc="${o.pv ? o.pv.id : ''}" data-ch="${esc(o.tc.ch)}">${copyPreview(cp, o.pv, o.tc.ch)}</div></div>
      </div></div>`;
  }
  function copyShift(cid, i, j, how) {
    const C = S.copy || {}, n = (seqOf(campOf(cid)) || []).length; if (how === 'swap' && (j < 0 || j >= n)) return;
    const N = {}; Object.keys(C).forEach(k => { const [c0, x0, s0] = k.split('|'), si = +s0; if (c0 !== cid) { N[k] = C[k]; return; }
      if (how === 'swap') N[`${c0}|${x0}|${si === i ? j : si === j ? i : si}`] = C[k]; else if (si !== i) N[`${c0}|${x0}|${si > i ? si - 1 : si}`] = C[k]; });
    S.copy = N;
  }
  let ctOpen = null, ctQv = '';
  function ctSlot(key, auto, tc, locked) {
    const v = (S.stepCt || {})[key], a = v === 'none' ? null : v ? libAll().find(x => x.id === v) || auto : auto, open = ctOpen === key;
    const head = a ? `<div class="mst-ct">${ic('doc', 13)} <span class="mst-ctl">Content</span> ${assetLink(a)} <span class="muted">· ${esc(a.type)}${a.metric && a.metric !== '–' ? ' · ' + esc(a.metric) : ''} · ${v && v !== 'none' ? 'chosen by you' : 'picked by the AI'}</span>${locked ? '' : `<span class="sp"></span><button class="chip" onclick="App.ctPick('${key}')">Change</button><button class="chip" onclick="App.ctSet('${key}','none')">Remove</button>`}</div>`
      : `<div class="mst-ct empty">${ic('doc', 13)} <span class="muted">No content in this step</span>${locked ? '' : `<span class="sp"></span><button class="chip" onclick="App.ctPick('${key}')">${ic('plus', 11)} Attach content</button>`}</div>`;
    if (!open || locked) return head;
    const q = ctQv.toLowerCase(), L = libAll().filter(x => x.st !== 'Retired' && (!q || (x.t + ' ' + x.type + ' ' + (x.seg || '')).toLowerCase().includes(q))).slice(0, 8);
    const ty = /carousel/i.test(tc.fmt) ? 'Carousel' : /comparison|case study|document|one-pager/i.test(tc.fmt) ? 'PDF one-pager' : /infographic/i.test(tc.fmt) ? 'Infographic' : /whitepaper/i.test(tc.fmt) ? 'Whitepaper' : 'PDF one-pager';
    return head + `<div class="ctp"><div class="ctp-h"><b>Pick content from the library</b><label class="sr" for="ctq">Search the library</label><input id="ctq" class="ctp-q" placeholder="Search assets" value="${esc(ctQv)}" oninput="App.ctQ(this.value)"></div>
      <div class="ctp-l">${L.map(x => `<button class="ctp-r ${a && a.id === x.id ? 'on' : ''}" onclick="App.ctSet('${key}','${x.id}')">${libThumb({ type: x.type })}<span class="ctp-t"><b>${esc(x.t)}</b><span>${esc(x.type)} · ${esc(x.st === 'Completed' ? 'approved' : (x.st || '').toLowerCase())}${x.metric && x.metric !== '–' ? ' · ' + esc(x.metric) : ''}</span></span><span class="ctp-go">${a && a.id === x.id ? 'Attached' : 'Attach'}</span></button>`).join('') || '<div class="muted sm" style="padding:10px">Nothing matches.</div>'}</div>
      <div class="ctp-f"><button class="btn sm" onclick="App.ctNew('${key}','${ty}')">${ic('spark', 12)} Make a new ${esc(ty.toLowerCase())} in Content studio</button><span class="sp"></span><button class="btn sm ghost" onclick="App.ctPick(null)">Cancel</button></div></div>`;
  }
  /* Variable tags logged on every step, and the offer on the closing step */
  function offersAll() { try { return (window.CONTENT_LIB.offers() || []).filter(x => x.st !== 'Retired'); } catch (e) { return []; } }
  function stepOfferOf(key, o) { const L = offersAll(), v = (S.stepOffer || {})[key]; if (v === 'none') return null; const segN = o.x && o.x.seg ? o.x.seg.name : o.x ? o.x.name : ''; return L.find(x => x.id === v) || L.find(x => x.best && segN && x.best === segN) || L.find(x => x.def) || null; }
  function stepTags(o, cp, key) {
    const words = String(cp.body || '').split(/\s+/).filter(Boolean).length, len = words < 45 ? 'Short' : words < 110 ? 'Medium' : 'Long', last = o.i === o.sq.length - 1;
    const cta = /\?/.test(cp.body) ? (/call|conversation|session|workshop|walk/i.test(cp.body) ? 'Ask for a call' : 'Ask a question') : 'No ask';
    const ang = o.x ? cohAngle(o.x, o.i) : (o.tc.t || ''), of = last ? stepOfferOf(key, o) : null;
    const chip = (k, v) => `<span class="mst-tag"><i>${k}</i>${esc(v)}</span>`;
    return `<div class="mst-tags"><span class="mst-tagl">Tags logged</span>${chip('Angle', ang.length > 48 ? ang.slice(0, 46) + '…' : ang)}${chip('Channel', o.tc.ch)}${chip('Format', o.tc.fmt)}${chip('Length', `${len} · ${words} words`)}${chip('CTA', cta)}${last ? (o.locked ? chip('Offer', of ? of.name : 'None') : `<label class="mst-tag mst-offer"><i>Offer</i><select class="sel" aria-label="Offer on the closing step" onchange="App.stepOffer('${key}', this.value)"><option value="none" ${!of ? 'selected' : ''}>No offer</option>${offersAll().map(x => `<option value="${x.id}" ${of && of.id === x.id ? 'selected' : ''}>${esc(x.name)}${x.def ? ' (default)' : ''}</option>`).join('')}</select></label>`) : ''}</div>`;
  }
  function cohMsgHead(x, pvList, pv, shared) {
    const sg = x.seg;
    return `<div class="cm-card card"><div class="cm-h"><span class="msg-bi">${ic('layers', 15)}</span><div class="cm-t"><b>Messages for ${esc(x.name)}</b><span>${sg ? `Micro-segment · ${esc(sg.trigger)}${sg.proven ? ` · ${esc(sg.proven)}${sg.rate ? `, ${sg.rate}% positive` : ''}` : ''}` : esc(x.src || 'Cohort')}</span></div>${sg ? `<button class="btn sm ghost" onclick="App.openSegment('${sg.id}')">Open the micro-segment</button>` : ''}</div>
      <div class="cm-row"><div class="cm-angle"><span>Angle</span><b>${esc(cohParts(x).join(' → '))}</b></div>${pvList.length ? `<label class="msg-pv"><span>Preview as</span><select class="sel" onchange="App.campPrev(this.value)">${pvList.map(a => `<option value="${a.id}" ${pv && a.id === pv.id ? 'selected' : ''}>${esc(a.contact.name)} · ${esc(a.name)}</option>`).join('')}</select></label>` : ''}</div>
      <div class="cm-note">${ic('spark', 12)} ${shared ? 'Steps and timing are shared by every cohort in this campaign; this copy is written for this cohort only.' : 'This copy is written for this cohort.'} Edits save as you type; first name, company, signal and sender fill in per person.</div></div>`;
  }
  function cohPick(list, cid, sq) {
    return `<div class="cm-pick card"><div class="cm-pick-h"><span class="msg-bi">${ic('layers', 15)}</span><div><b>Each cohort has its own messages</b><span>They share the steps and timing. The copy follows each cohort's micro-segment, so pick one to read or edit its messages.</span></div></div>
      <div class="cm-pick-g">${list.map(x => { const tc0 = (sq && sq[0]) || { ch: 'Email', fmt: 'Plain text', t: '', day: 0 }, d = copyOf(cid, x, tc0, 0, sq || [tc0]), P = d.body.split('\n\n'), mid = (P.length > 3 ? P[2] : P.slice(1).join(' ')).replace(/^Hi \{first_name\},\s*/, '').replace(/\{company\}/g, 'their company').replace(/\{signal\}/g, 'their signal').replace(/\{first_name\}/g, 'there'); return `<button class="cm-pc" onclick="App.campCoh('${x.id}')"><div class="cm-pc-h"><b>${esc(x.name)}</b>${x.first ? '<span class="badge b-brand nodot">First cohort</span>' : '<span class="badge b-sec nodot">Added</span>'}</div><div class="sm muted">${esc(x.seg ? 'Micro-segment · ' + x.seg.trigger : x.src || '')}${x.n != null ? ` · ${x.n} accounts` : ''}</div><div class="cm-pc-a">${esc(cohParts(x).join(' → '))}</div><div class="cm-pc-q">“${esc(mid.length > 150 ? mid.slice(0, 148).replace(/\s+\S*$/, '') + '…' : mid)}”</div><span class="cm-pc-go">Open its messages ${ic('right', 12)}</span></button>`; }).join('')}</div></div>`;
  }
  function timingTools(c, t, i, n) {
    const id = `${c.id}-${i}`;
    return `<span class="mst-tm"><label class="sr" for="day-${id}">Day</label><span class="mst-tml">Day</span><input id="day-${id}" type="number" min="0" max="60" value="${t.day}" onchange="App.seqEdit('${c.id}',${i},'day',this.value)">
      <label class="sr" for="ch-${id}">Channel</label><select id="ch-${id}" class="sel" onchange="App.seqEdit('${c.id}',${i},'ch',this.value)">${CHANNELS.map(x => `<option ${t.ch === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <label class="sr" for="fmt-${id}">Format</label><select id="fmt-${id}" class="sel" onchange="App.seqEdit('${c.id}',${i},'fmt',this.value)">${FORMATS[t.ch].map(x => `<option ${t.fmt === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <button class="ic-btn" title="Move up" ${i === 0 ? 'disabled' : ''} onclick="App.seqMove('${c.id}',${i},-1)">${ic('upa', 14)}</button><button class="ic-btn" title="Move down" ${i === n - 1 ? 'disabled' : ''} onclick="App.seqMove('${c.id}',${i},1)">${ic('downa', 14)}</button><button class="ic-btn" title="Remove step" onclick="App.seqRemove('${c.id}',${i})">${ic('trash', 14)}</button></span>`;
  }
  /* The messages a cohort gets come from its micro-segment: its angle, step by step */
  const COH_STRUCT = 'The signal each account was found for → what a comparable site did → offer a short working session';
  const cohParts = x => (x.struct || COH_STRUCT).split(/\s*(?:→|->)\s*/).filter(Boolean);
  const cohAngle = (x, i) => { const P = cohParts(x); return i < P.length ? P[i] : 'Follow-up on the same angle'; };
  function cohMsgCard(x) {
    const sg = x.seg, row = (k, v) => `<div class="og-r"><span>${k}</span><b>${v}</b></div>`;
    return `<div class="cm-card card"><div class="cm-h"><span class="msg-bi">${ic('layers', 15)}</span><div class="cm-t"><b>Messages for ${esc(x.name)}</b><span>${sg ? `Micro-segment · ${esc(sg.trigger)}${sg.proven ? ` · ${esc(sg.proven)}${sg.rate ? `, ${sg.rate}% positive` : ''}` : ''}` : esc(x.src || 'Cohort')}</span></div>${sg ? `<button class="btn sm ghost" onclick="App.openSegment('${sg.id}')">Open the micro-segment</button>` : ''}</div>
      <div class="og-meta">${row('Message angle', esc(cohParts(x).join(' → ')))}${row('Opening line', esc(x.line || 'Opens with the signal each account was found for'))}</div></div>`;
  }
  const cohAngleRow = (x, i) => `<div class="cm-ang">${ic('layers', 12)} From ${esc(x.seg ? x.seg.name : x.name)}: <b>${esc(cohAngle(x, i))}</b></div>`;
  function campCohorts(c) {
    const s = c.seg ? segOf(c.seg) : null, dv = campDeliv(c), st = campStats(c), steps = seqOf(c).length, L = (S.cohLine || {});
    const main = { id: 'main', name: s ? s.name : c.name, src: 'Micro-segment · ' + (s ? s.trigger : 'archived'), n: st.total, at: c.launched ? 'Since launch, ' + c.launched : 'Starts when the campaign is confirmed', sent: dv.out, total: dv.total, rep: st.replies, pos: st.positive, meet: st.meetings, sentSteps: dv.sentSteps, ids: ACCOUNTS.filter(a => a.campaign === c.id).map(a => a.id), line: s ? `Opens with their own signal: ${s.trigger.toLowerCase()}.` : '', first: true };
    const L2 = [main].concat((COH_SEED[c.id] || []).map(x => Object.assign({}, x)), ((S.cohorts || {})[c.id] || []).map((x, k) => ({ id: 'a' + k, name: x.name, src: `${x.src} · added ${x.at}`, n: x.n, at: 'Starts at step 1 in the next send window', sent: 0, total: x.n * steps, rep: 0, pos: 0, meet: 0, sentSteps: 0, ids: x.ids || [], line: 'Opens with the signal each account was found for.' })));
    L2.forEach(x => { if (L[c.id + ':' + x.id]) x.line = L[c.id + ':' + x.id]; const sg = x.first ? s : SEGMENTS.find(g => g.name === x.name); x.seg = sg || null; x.struct = (sg && sg.structure) || x.struct || COH_STRUCT; });
    return L2;
  }
  function renderCampaign() {
    const c = campOf(campSel), st = campStats(c), sq = seqOf(c), s = c.seg ? segOf(c.seg) : null;
    const accs = ACCOUNTS.filter(a => a.campaign === c.id && visible(a));
    const live = c.status === 'Running', canConfirm = !live && c.status !== 'Completed' && S.camp[c.id] !== 'Confirmed';
    const chans = [...new Set(sq.map(t => t.ch))], nCh = ch => sq.filter(t => t.ch === ch).length;
    const needsOK = a => c.id !== 'c1' && !live && c.status !== 'Completed' && !S.enrollOK[a.id];
    if (c.id === 'c1') accs.forEach(a => { const ss = c.touches.map((_, i) => touchState(a, i)), nx = ss.findIndex(s => s.s !== 'sent'); a.campState = nx < 0 ? 'Touch 3 done' : ss[nx].s === 'wait' ? 'Waiting for confirmation' : ss[nx].s === 'off' ? ss[nx].txt.split(':')[0] : 'Touch ' + (nx + 1) + ': ' + (ss[nx].s === 'held' ? 'held' : ss[nx].s === 'due' ? 'due today' : 'day ' + c.touches[nx].day); });
    const todo = accs.filter(needsOK);
    const cv = frame(`<button class="back-l" onclick="App.goCampaign(null)">${ic('left', 14)}</button> ${esc(c.name)} ${campBadge(c)}`, `${seqSpan(c)} · ${chans.join(' + ')} · ${s ? `micro-segment <a href="#campaigns" onclick="App.openSegment('${s.id}');return false">${esc(s.name)}</a>` : 'archived segment'}${c.fromList ? ' · from the list "Lookalikes of my last 10 wins"' : ''}`,
      `${live ? `<span class="toggle-lbl">${ic('check', 12)} Active</span><span class="switch on" title="Pause" onclick="App.toast('Paused (mock)')"></span>` : ''}${canConfirm ? (isMgr ? `<button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm campaign and touch formats</button>` : c.status === 'Draft' && !S.camp[c.id] ? `<button class="btn sm pri" onclick="App.sendForConfirm('${c.id}')">Send to Daniel to confirm</button>` : '') : ''}`);
    const card = (k, v, d, icn) => `<div class="mcard"><div class="k">${icn ? ic(icn, 13) : ''} ${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const msgs = `${chans.map(ch => `<span class="chn">${chIc(ch)} ${ch} ×${nCh(ch)}</span>`).join('')}`;
    const own = accs.filter(a => S.pseq[a.id]), pv = acct(campPrev && accs.some(a => a.id === campPrev) ? campPrev : (accs[0] || {}).id);
    const dv = campDeliv(c), going = live || S.camp[c.id] === 'Confirmed', COH = campCohorts(c), cur = COH.length > 1 ? COH.find(x => x.id === campCoh) || null : null, ctab = campTab === 'steps' || campTab === 'msgs' ? 'msgs' : campTab === 'acc' ? 'acc' : 'ov';
    const scope = cur ? [cur] : COH, sum = k => scope.reduce((n, x) => n + (x[k] || 0), 0), nAcc = sum('n'), nSent = sum('sent'), nTot = sum('total'), nRep = sum('rep'), mainIn = scope.some(x => x.first), multi = COH.length > 1;
    const R = (k, v, d) => `<div class="cp-r"><span>${k}</span><b>${v}</b>${d ? `<i>${d}</i>` : ''}</div>`;
    const chip = (tc, i) => { const done = cur ? i < cur.sentSteps : sent(tc) || c.status === 'Completed', nx = cur ? i === cur.sentSteps : i === dv.nextI; return `<span class="cp-st ${done ? 'done' : nx ? 'next' : ''}" title="${esc(tc.ch)} · ${esc(tc.fmt)}">${done ? ic('check', 11) : `<em>${i + 1}</em>`}${chIc(tc.ch)} Day ${tc.day}</span>`; };
    const cohOf = id => COH.find(x => (x.ids || []).includes(id)), realIn = scope.flatMap(x => (x.ids || []).map(acct).filter(Boolean)).filter(a => !a.campaign || a.campaign === c.id || true);
    const stepSent = (x, i) => i < x.sentSteps ? x.n : 0, stepRep = (x, i) => x.first ? (i < x.sentSteps ? Math.round(x.rep / Math.max(1, x.sentSteps)) : 0) : i === 0 ? x.rep : 0, stepOpen = (x, i) => x.first ? (i < x.sentSteps ? Math.round(st.opened / Math.max(1, x.sentSteps)) : 0) : i < x.sentSteps ? Math.round(x.n * 0.4) : 0;
    const cohBar = multi ? `<div class="coh-bar"><span class="coh-bl">${ic('layers', 13)} Showing</span>${[{ id: 'all', name: 'All cohorts', n: COH.reduce((s2, x) => s2 + x.n, 0) }].concat(COH).map(x => { const on = x.id === 'all' ? !cur : cur && cur.id === x.id; return `<button class="coh-chip ${on ? 'on' : ''}" aria-pressed="${on}" onclick="App.campCoh('${x.id}')">${esc(x.name)}<i>${x.n}</i></button>`; }).join('')}</div>` : '';
    const pvList = realIn.length ? realIn : accs, pv2 = pvList.find(x => x.id === campPrev) || pvList[0];
    const ovCohorts = multi && !cur ? `<div class="lbl" style="margin:16px 0 8px">Cohorts · click one to see its details</div><div class="coh-g">${COH.map(x => `<button class="coh card" onclick="App.campCoh('${x.id}')"><div class="coh-h"><b>${esc(x.name)}</b>${x.first ? '<span class="badge b-brand nodot">First cohort</span>' : '<span class="badge b-sec nodot">Added</span>'}</div><div class="sm muted">${esc(x.src)}</div><div class="coh-m"><div><b>${x.n}</b><span>accounts</span></div><div><b>${x.sent} of ${x.total}</b><span>messages sent</span></div><div><b>${x.rep}</b><span>replied</span></div></div>${omBar(x.sent, x.total)}<div class="sm muted">${esc(x.at)}</div></button>`).join('')}</div>` : '';
    const ovCur = cur ? `<div class="coh-d card"><div class="coh-h"><b>${esc(cur.name)}</b>${cur.first ? '<span class="badge b-brand nodot">First cohort</span>' : '<span class="badge b-sec nodot">Added</span>'}</div><div class="sm muted">${esc(cur.src)} · ${esc(cur.at)}</div><div class="coh-l">${ic('edit', 12)} <span><b>Opening line for this cohort:</b> ${esc(cur.line || 'Same as the campaign')}</span><button class="btn sm ghost" onclick="App.setCampTab('msgs')">Change</button></div><div class="next-row" style="margin-top:8px"><button class="btn sm" onclick="App.setCampTab('acc')">${ic('users', 12)} See its ${cur.n} accounts</button><button class="btn sm ghost" onclick="App.campCoh('all')">Back to all cohorts</button></div></div>` : '';
    const rowsReal = realIn.map(a => { const x = cohOf(a.id) || COH[0], done = x.first ? sq.filter(sent).length : 0, cs = sq[Math.min(done, sq.length - 1)]; return `<tr class="row-link" onclick="App.openRecord('${a.id}','engage')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.contact.title)}</div></div></div></td><td>${esc(a.name)}</td>${multi && !cur ? `<td><span class="coh-tag">${esc(x.name)}</span></td>` : ''}<td class="sm">${cs ? `Step ${Math.min(done + 1, sq.length)} of ${sq.length}<div>${esc(cs.ch)} · ${esc(cs.fmt)}</div>` : '–'}</td><td>${x.first ? (S.enrollOK[a.id] ? '<span class="badge b-pos">Approved</span>' : stateBadge(a.campState)) : '<span class="badge b-grey nodot">Starts in the next send window</span>'}</td>${isMgr ? `<td>${ownerPick(a)}</td>` : ''}<td style="white-space:nowrap" onclick="event.stopPropagation()">${x.first && needsOK(a) ? `<button class="btn sm pri" onclick="App.approveEnroll('${a.id}')">Approve</button> ` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','engage')">Open</button></td></tr>`; }).join('');
    const rowsSeed = scope.filter(x => x.rows).map(x => x.rows.map(r => `<tr><td><div style="display:flex;gap:9px;align-items:center"><span class="av" style="width:30px;height:30px;font-size:11px;background:var(--sec)">${esc(r[0].split(' ').map(w => w[0]).join(''))}</span><div><div class="nm">${esc(r[0])}</div><div class="sm">${esc(r[1])}</div></div></div></td><td>${esc(r[2])}</td>${multi && !cur ? `<td><span class="coh-tag">${esc(x.name)}</span></td>` : ''}<td class="sm">Step 3 of ${sq.length}<div>${esc(sq[2] ? sq[2].ch : '')}</div></td><td><span class="badge ${/Replied/.test(r[3]) ? 'b-pos' : 'b-sec'}">${esc(r[3])}</span></td>${isMgr ? '<td class="sm muted">From the list</td>' : ''}<td></td></tr>`).join('')).join('');
    cv.innerHTML = `${cohBar}<div class="cp-hero card"><div class="cp-l">${cur ? `<div class="cp-scope">${esc(cur.name)}</div>` : multi ? `<div class="cp-scope">All ${COH.length} cohorts</div>` : ''}<div class="cp-big">${nSent ? `<b>${nSent}</b> of ${nTot} messages sent` : '<b>Nothing sent yet</b>'}</div>${nSent ? omBar(nSent, nTot) : ''}<div class="cp-sub">${esc(cur ? cur.at : dv.txt)}</div><div class="cp-steps">${sq.map(chip).join('')}</div>${todo.length && mainIn ? `<button class="cp-todo" onclick="App.setCampTab('acc')">${ic('task', 13)} ${todo.length} ${todo.length === 1 ? 'person waits' : 'people wait'} for approval · review</button>` : ''}</div>
      <div class="cp-rs">${R('Accounts', nAcc, cur ? 'in this cohort' : multi ? `across ${COH.length} cohorts` : isMgr ? 'in this campaign' : 'yours')}${R('Replied', nSent ? pct(nRep, nAcc) : '–', nSent ? `${nRep} people` : 'after the first send')}${R('Positive', nSent ? sum('pos') : '–', '')}${R('Meetings', nSent ? sum('meet') : '–', nSent ? 'booked' : '')}</div></div>
      <div class="dtabs cp-tabs">${[['ov', 'Overview'], ['msgs', `Messages <i>${sq.length}</i>`], ['acc', `Accounts <i>${nAcc}</i>`]].map(([k, l]) => `<button class="${ctab === k ? 'on' : ''}" onclick="App.setCampTab('${k}')">${l}</button>`).join('')}${cur ? `<span class="cp-tabs-s">for ${esc(cur.name)}</span>` : multi ? '<span class="cp-tabs-s">for all cohorts</span>' : ''}</div>
      ${ctab === 'msgs' ? (multi && !cur ? cohPick(COH, c.id, sq) : (X => { const firstOpen = sq.findIndex(x => !sent(x)), editable = i => c.status !== 'Completed' && !sent(sq[i]);
        const st = i => X.first ? (sent(sq[i]) ? (sq[i].state || 'Sent') : c.status === 'Completed' ? 'Done' : i === firstOpen ? 'Next' : 'Scheduled') : i < (X.sentSteps || 0) ? 'Sent' : i === (X.sentSteps || 0) ? 'Next' : 'Scheduled';
        const lock = i => X.first ? (sent(sq[i]) || c.status === 'Completed') : i < (X.sentSteps || 0);
        return `${cohMsgHead(X, pvList, pv2, multi)}
      ${own.length ? `<div class="camp-own2">${ic('edit', 12)} ${own.length} ${own.length === 1 ? 'person has' : 'people have'} their own edits and keep them: ${own.map(x => esc(first(x.contact.name))).join(', ')}. <button class="btn sm ghost" onclick="App.campApplyAll('${c.id}')">Use the campaign version for them too</button></div>` : ''}
      <div class="sec-row" style="margin-top:14px"><div class="lbl">${sq.length} steps${multi ? ' · timing shared by all cohorts' : ''}</div><div class="sp"></div>${c.status !== 'Completed' ? `<label class="sr" for="addStep-${c.id}">Add a step</label><select id="addStep-${c.id}" class="sel mst-add" onchange="if (this.value) { App.seqAdd('${c.id}', this.value); this.value = ''; }"><option value="">+ Add a step…</option>${CHANNELS.map(x => `<option value="${x}">${x}</option>`).join('')}</select>${S.seq[c.id] ? `<button class="btn sm ghost" onclick="App.seqReset('${c.id}')">Reset to the AI draft</button>` : ''}` : ''}</div>
      <div class="mseq">${sq.map((tc, i) => copyStep({ cid: c.id, x: X, tc, i, sq, locked: lock(i), state: st(i), pv: pv2, tools: editable(i) ? timingTools(c, tc, i, sq.length) : '', asset: ctSlot(copyKey(c.id, X, i), stepAsset(c, tc), tc, lock(i)) })).join('')}</div>
      <div class="muted" style="font-size:11.5px;margin:10px 0 4px">Explore / exploit: ${esc(c.explore)}</div>`; })(cur || COH[0]))
      : ctab === 'acc' ? `<div class="sec-row"><div class="lbl">Accounts · ${cur ? esc(cur.name) : multi ? 'all cohorts' : 'this campaign'} · ${nAcc}</div><div class="sp"></div>${isMgr ? ownerSel() : ''}${assignAll(realIn.map(a => a.id), 'the campaign')}${todo.length && mainIn ? `<button class="btn sm pri" onclick="App.approveEnrollAll('${c.id}')">Approve all ${todo.length}</button>` : ''}</div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Company</th>${multi && !cur ? '<th>Cohort</th>' : ''}<th>Current step</th><th>Status</th>${isMgr ? '<th>Owner</th>' : ''}<th></th></tr></thead><tbody>${rowsReal + rowsSeed || '<tr><td colspan="7" class="empty">No accounts in this cohort yet.</td></tr>'}</tbody></table></div>`
      : `${ovCur}${!cur || cur.first ? c.blockers.map(b2 => `<div class="blk ${b2.k}" style="margin-top:10px">${ic('alert', 15)}<div class="grow"><b>Blocker</b><span>${esc(b2.x)}</span></div></div>`).join('') : ''}${c.id === 'c1' && (!cur || cur.first) ? campTasks(c, accs) : ''}${ovCohorts}
      <div class="lbl" style="margin:16px 0 8px">Delivery by step${cur ? ' · ' + esc(cur.name) : multi ? ' · all cohorts' : ''}</div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Step</th><th>Day</th><th>Sent</th><th>Opened</th><th>Replied</th><th></th></tr></thead><tbody>${sq.map((tc, i) => { const sn = scope.reduce((n2, x) => n2 + stepSent(x, i), 0), op = scope.reduce((n2, x) => n2 + stepOpen(x, i), 0), rp = scope.reduce((n2, x) => n2 + stepRep(x, i), 0), allDone = sn === nAcc && nAcc > 0; return `<tr class="row-link" onclick="App.setCampTab('msgs')"><td><div class="nm">${chIc(tc.ch)} Step ${i + 1} · ${esc(tc.ch)} · ${esc(tc.fmt)}</div><div class="sm">${esc((tc.subject || tc.t).slice(0, 80))}</div>${(x => x ? `<div class="rq-ct sm">${ic('doc', 12)} ${assetLink(x)}</div>` : '')(stepAsset(c, tc))}</td><td class="mono">${tc.day}</td><td>${sn ? `${sn} of ${nAcc}` : '<span class="muted">0</span>'}</td><td>${sn ? op : '–'}</td><td>${sn ? rp : '–'}</td><td>${allDone ? '<span class="badge b-pos nodot">Sent</span>' : sn ? '<span class="badge b-sec nodot">Partly sent</span>' : (cur ? i === cur.sentSteps : i === dv.nextI) ? `<span class="badge b-ter nodot">${going ? 'Next' : 'First to go'}</span>` : '<span class="badge b-grey nodot">Later</span>'}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="sm muted" style="margin:8px 2px 0">Click a step to change its message for every account.</div>
      ${!cur || cur.first ? `<div class="lbl" style="margin:18px 0 6px">Updates</div>${c.updates.map(u => `<div class="upd"><span class="when">${esc(u.t)}</span><div class="sm" style="font-size:12.5px;color:var(--i1)">${esc(u.x)}</div></div>`).join('')}` : ''}
      <details class="lib-guide" style="margin-top:14px"><summary>How it sends</summary><p class="sm" style="margin:0;padding:0 14px 12px;line-height:1.55">Through the team's sequencer and LinkedIn tool, from each rep's own identity. It stops for an account on any reply or opt-out, never uses three channels on one person in 48 hours, and sends between 08:00 and 17:00 local time. Threads with no clear answer get a short follow-up every 5 days, up to 3 times. Nothing is sent from the mock.</p></details>`}`;
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
    if (n.status === 'excluded') return { stage: 0, label: 'Excluded: ' + n.reasonNote, cls: 'b-neg', how: 'Excluded', when: '' };
    if (n.status === 'held') return { stage: 0, label: 'Held: ' + n.reasonNote, cls: 'b-neg', how: 'Held', when: '' };
    if (n.status === 'nurture') return { stage: 0, label: 'Nurture: low confidence', cls: 'b-grey', how: 'Nurture', when: '' };
    if (n.status === 'expired') return { stage: 0, label: 'Expired, re-ranked', cls: 'b-grey', how: 'Expired', when: DUE3 };
    if (S.sent1 && S.sent1[a.id]) return { stage: 1, label: 'Sent · capture logged', cls: 'b-sec', how: 'Sent with one click', when: 'Today' };
    if (n.status === 'auto') return { stage: 0, label: 'Ready to send', cls: 'b-pos', how: 'Ready to send', when: 'Today' };
    if (n.status === 'review' && !d) return { stage: 0, label: 'Needs your decision', cls: 'b-ter', how: 'Needs a person', when: n.due };
    if (d === 'skipped' || d === 'sent-back') return { stage: 0, label: decLabel(d) + (S.skipR && S.skipR[a.id] ? ': ' + S.skipR[a.id].toLowerCase() : ''), cls: 'b-grey', how: d === 'skipped' ? 'Skipped by a person' : 'Sent back by a person', when: 'Today' };
    if (d) return { stage: 1, label: 'Approved · sent', cls: 'b-sec', how: 'Approved by a person', when: 'Today' };
    if (n.orig === 'sent') { const o = a.outcome || 'Delivered'; return { stage: /Replied|Meeting/.test(o) ? 4 : /Opened|Clicked/.test(o) ? 3 : 2, label: o, cls: /positive|Meeting/.test(o) ? 'b-pos' : /objection/.test(o) ? 'b-warn' : 'b-sec', how: 'Approved by a person', when: 'Last week' }; }
    if (h % 13 === 5) return { stage: 1, label: 'Bounced · fixing the address', cls: 'b-neg', how: 'Sent with one click', when: 'Yesterday 09:10' };
    const st = [2, 3, 2, 3, 3][h % 5];
    return { stage: st, label: st === 3 ? 'Opened' : 'Delivered', cls: st === 3 ? 'b-pos' : 'b-sec', how: 'Sent with one click', when: st === 3 ? 'Today ' + ['08:14', '09:02', '10:37'][h % 3] : 'Yesterday' };
  }
  const nbaRows = () => ACCOUNTS.filter(a => a.nba && /auto|sent|review|ready|held|nurture|expired/.test(a.nba.status) && !a.campaign && visible(a));
  const dots = t => `<span class="stg" title="${STAGES.slice(0, t.stage + 1).join(' → ')}">${STAGES.map((x, i) => `<i class="${i <= t.stage ? (t.cls === 'b-neg' && i === t.stage ? 'bad' : 'on') : ''}"></i>`).join('')}</span>`;
  function deliveryRow(a) {
    const t = track(a);
    return `<div class="dlv-p">${STAGES.map((x, i) => `<div class="${i <= t.stage ? (t.cls === 'b-neg' && i === t.stage ? 'bad' : 'on') : ''}"><span></span><b>${x}</b></div>`).join('')}</div><div class="sm muted" style="margin-top:4px">${/own/.test(t.how) ? mkAI(t.how) : /Needs/.test(t.how) ? mkWait(t.how) : mkHu(t.how)} ${esc(t.label)}${t.when ? ' · ' + esc(t.when) : ''}</div>`;
  }

  /* Other things only a person can decide: each with an owner, a reason, a due time and what happens if nobody acts */
  /* Other escalations from the PRD's list (§4): each with an owner, a reason, a due time and a default */
  /* Next best campaign (PRD §7): the manager confirms; each touch becomes a task for the account owner on day 0, 4 and 9;
     every touch is re-checked first; a reply removes the pending touches; with no confirmation in 3 days it falls back to next best actions. */
  const campDay = id => (SIM.days || 0) - ((S.campDay0 || {})[id] || 0);
  const campFell = id => S.camp[id] !== 'Confirmed' && !S.camp[id + 'x'] && (SIM.days || 0) >= 3 && campOf(id).status === 'Ready to confirm';
  function touchState(a, i) {
    const c = campOf(a.campaign), tc = c.touches[i], k = a.id + ':' + i, R = S.ctouch || {};
    if (R[k]) return { s: 'sent', txt: 'Sent ' + R[k] };
    if (S.camp[c.id + 'x']) return { s: 'off', txt: 'Declined: back to next best actions' };
    if (campFell(c.id)) return { s: 'off', txt: 'Not confirmed in 3 days: back to next best actions' };
    if (S.camp[c.id] !== 'Confirmed') return { s: 'wait', txt: 'Waiting for the manager to confirm' };
    if ((S.creply || {})[a.id]) return { s: 'off', txt: 'Removed: ' + first(a.contact.name) + ' replied' };
    const d = campDay(c.id);
    if (i > 0 && !R[a.id + ':' + (i - 1)]) return { s: 'sched', txt: 'After touch ' + i + (d >= tc.day ? '' : ', from day ' + tc.day) };
    if (d < tc.day) return { s: 'sched', txt: 'Day ' + tc.day + ' (in ' + (tc.day - d) + ' day' + (tc.day - d > 1 ? 's' : '') + ')' };
    const ex = excluded1(a), pr = protect1(a);
    if (ex) return { s: 'held', txt: 'Held: re-check failed. ' + ex, why: ex };
    if (!pr.ran || !pr.ok) return { s: 'held', txt: 'Held: ' + pr.reason, why: pr.reason };
    return { s: 'due', txt: 'Due today' };
  }
  const campDue = () => ACCOUNTS.filter(a => a.campaign === 'c1').flatMap(a => campOf('c1').touches.map((_, i) => ({ a, i, st: touchState(a, i) }))).filter(x => /due|held/.test(x.st.s));
  function escOther() {
    const R = S.resolvedEsc || {}, L = [];
    if (isLeader) { L.push(['learn', 10, 'Weekly learning review', '3 changes passed the backtest: raise the weight of "New exec hire"; validate the turnaround structure (12 outcomes, confidence 0.64); demote the LinkedIn compliance structure (31% over 90 days)', 'Fri 30 Oct', 'Nothing ships until reviewed', null, 'Approve the changes']); L.push(['src', 10, 'A source underperforms', 'News feed B: 2 of 31 signals led to a reply in 90 days (6%), against 19% for its level. Flagged for the vendor-renewal review', 'Weekly learning review', 'Reviewed in the weekly learning review', null, 'Flag for renewal']); }
    if (isLeader) L.push(['backtest', 15, 'Backtest result', 'The scoring backtest passed: 12 of 15 won accounts in Tier A or B, 2 of 15 lost, no tier above 40% of the random set', 'Before go-live', 'Blocks go-live if it fails', "App.openAppr('needs')", 'Open the report']);
    else if (isMgr) { L.push(['meet', 'ML', 'Confirm a meeting', 'Eastgate Refining: first meeting held Tue 27 Oct with the expansion lead. Confirm it counts as qualified', 'Tue 3 Nov', 'Not counted', null, 'Confirm']); if (campStatus(campOf('c1')) === 'Ready to confirm' && !campFell('c1')) L.push(['camp', 8, 'A campaign (NBC)', 'Turnaround season 2027: 11 accounts share a turnaround announcement inside 7 days', DUE3, 'Falls back to individual next best actions', "App.goCampaign('c1')", 'Open']); }
    else {
      L.push(['watch', 8, 'Status watch', 'Ironwood Refining: a procurement contact opened the proposal and the CRM stage moved to Evaluation', 'No due time', 'None', "App.openRecord('ironwood','activity')", 'Open']);
      L.push(['anom', 9, 'Anomaly alert', '4 refineries in Johor posted control-systems roles in 48 hours, 5 times the 90-day rate: a temporary tier 1 override for those accounts', 'Today', 'None', null, 'See the accounts']);
      L.push(['nameonly', 10, 'A name-only CRM match', 'Dunmore Gas Processing matches the CRM account "Dunmore Gas Sdn Bhd" by name only, with no domain match. Held, not dropped', 'Stays held', 'Stays held', null, 'Confirm the match']);
      L.push(['reply', 11, 'An unmatched reply', 'r.ellis@unknown-sender.example: "Saw your note about migrations. Who should I speak to?"', 'No due time', 'Stays unmatched', null, 'Match to Juniper Petrochem']);
      ACCOUNTS.filter(a => a.owner === me.id && a.nicheUnclear).forEach(a => L.push(['niche-' + a.id, 12, 'Unclear niche', `${a.name}: ${a.nicheUnclear.why} (confidence ${a.nicheUnclear.conf})`, 'This week', 'No niche', null, 'Set as refinery']));
      ACCOUNTS.filter(a => a.owner === me.id && a.personaUnclear).forEach(a => L.push(['persona-' + a.id, 12, 'Unclear persona', `"${a.personaUnclear}" at ${a.name}: a generic persona is used until you set one`, 'This week', 'A generic persona', null, 'Set as operations']));
      campDue().filter(x => x.st.s === 'held' && x.a.owner === me.id).forEach(x => L.push(['touch-' + x.a.id + x.i, 9, 'A campaign touch failed its re-check', `Touch ${x.i + 1} to ${x.a.contact.name} at ${x.a.name}: ${x.st.why}`, 'Before the touch', 'The touch is skipped', null, 'Skip the touch']));
    }
    return L.filter(x => !R[x[0]]);
  }
  function otherEsc() {
    const L = escOther();
    if (!L.length) return '';
    return `<div class="lbl" style="margin:18px 0 8px">Also needs you · ${L.length}</div><div class="card tbl-wrap"><table class="tbl"><thead><tr><th>What</th><th>Why it needs a person</th><th>Due</th><th>If nobody acts</th><th></th></tr></thead><tbody>${L.map(x => `<tr><td class="nm"><span class="badge b-grey nodot">${x[1]}</span> ${esc(x[2])}</td><td class="sm">${esc(x[3])}</td><td class="sm" style="white-space:nowrap">${esc(x[4])}</td><td class="sm">${esc(x[5])}</td><td><button class="btn sm" onclick="${x[6] || `App.resolveEsc('${x[0]}','Done. Logged with who and when.')`}">${esc(x[7])}</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  /* Leader: the backtest before go-live (PRD §11) and the weekly summary */
  function backtestBlock() {
    const bad = !!(S.btDegrade || CFG1.degrade), won = bad ? 7 : 12, lost = bad ? 6 : 2, topR = bad ? 47 : 13;
    const bars = [['Won accounts in Tier A or B', won + ' of 15', won >= 10, 'At least 10 of 15'], ['Lost accounts in Tier A or B', lost + ' of 15', lost <= 4, 'At most 4 of 15'], ['Random accounts in Tier A', topR + '%', topR <= 40, 'No more than 40%']];
    const pass = bars.every(b => b[2]), W = { scored: 81, ready: apprItems('ready').length + 6, cards: ACCOUNTS.filter(a => a.nba && a.nba.status === 'review').length, sent: 18 + Object.keys(S.sent1 || {}).length, replies: 5, meetings: 2 };
    return `<div class="card" style="margin-bottom:12px"><div class="card-b"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><b>Scoring backtest · 15 won, 15 lost, 15 random</b><span class="badge ${pass ? 'b-pos' : 'b-neg'} nodot">${pass ? 'Passed: go-live allowed' : 'Failed: go-live blocked'}</span><span class="sp" style="flex:1"></span><label class="sm" style="display:flex;gap:6px;align-items:center"><input type="checkbox" ${bad ? 'checked' : ''} onchange="App.btDegrade(this.checked)"> Degrade the rules (demo)</label></div>
      <div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>Bar</th><th>Result</th><th>Needed</th><th></th></tr></thead><tbody>${bars.map(b => `<tr><td>${b[0]}</td><td class="mono">${b[1]}</td><td class="sm">${b[3]}</td><td><span class="badge ${b[2] ? 'b-pos' : 'b-neg'} nodot">${b[2] ? 'Pass' : 'Fail'}</span></td></tr>`).join('')}</tbody></table></div>
      <div class="sm muted" style="margin-top:8px">Run on the current rules (score = Fit × Timing ÷ 100, tiers by percentile). ${pass ? 'Approve go-live to switch the overnight run to live accounts.' : 'Go-live stays blocked until the rules pass all three bars.'}</div>
      ${pass ? `<div style="margin-top:8px"><button class="btn sm pri" onclick="App.resolveEsc('backtest','Go-live approved. Logged with who and when.')">Approve go-live</button></div>` : ''}</div></div>
      <div class="card" style="margin-bottom:12px"><div class="card-b"><b>Weekly summary · Mon 26 Oct – Sun 1 Nov</b><div class="mcards" style="margin-top:10px">${[['Accounts scored', W.scored], ['Ready to send', W.ready], ['Approval cards', W.cards], ['Sent', W.sent], ['Replies', W.replies], ['Meetings', W.meetings]].map(x => `<div class="mcard"><div class="k">${x[0]}</div><div class="v">${x[1]}</div></div>`).join('')}</div></div></div>`;
  }
  function renderApprovals() {
    const tabs = isMgr ? [['needs', isLeader ? 'Needs me' : 'Campaigns to confirm'], ['team', 'Team escalations'], ['done', 'Decided']] : [['todo', 'Needs you'], ['done', 'Decided']];
    const items = apprItems(apprTab), readyIds = [];
    const cv = frame('Approvals', isLeader ? 'The backtest and go-live decisions; you can see the team\'s escalations.' : isMgr ? 'Every campaign waits for your confirmation before it starts. You can also see the team\'s escalations.' : 'Only what the AI cannot decide, each with a due time and a default. Actions that meet all five criteria are ready to send and never come here.', '');
    cv.innerHTML = `<div class="rule"><b>The five criteria.</b> A next best action is ready to send with one click only when all five hold. If any fails, it comes here as an approval card naming the failed criterion. If nobody acts in 3 days, it expires and the account re-ranks.<div class="gate-r" style="margin-top:8px">${['Confidence: high or medium', 'Message verification passes', 'Every protective check passes', 'Identity tier is I1 or I2', "The segment's policy allows it"].map(k => `<span class="gc ok">✓ ${k}</span>`).join('')}</div></div>
      <div class="dtabs" style="margin-top:0">${tabs.map(([k, l]) => `<button class="${apprTab === k ? 'on' : ''}" onclick="App.setApprTab('${k}')">${l} (${apprItems(k).length})</button>`).join('')}
        ${isMgr && apprTab === 'team' ? `<label class="sr" for="repSel">Rep</label><select class="sel" id="repSel" style="margin-left:auto" onchange="App.setApprRep(this.value)"><option value="all">All reps</option>${REPS.map(r => `<option value="${r}" ${apprRep === r ? 'selected' : ''}>${USERS[r].name}</option>`).join('')}</select>` : ''}</div>
      ${isLeader && apprTab === 'needs' ? backtestBlock() : ''}
      ${isMgr && !isLeader && apprTab === 'needs' ? CAMPAIGNS.filter(c => (c.status === 'Ready to confirm' || S.camp[c.id] === 'Sent for confirmation') && S.camp[c.id] !== 'Confirmed').map(c => `<div class="card" style="margin-bottom:10px"><div class="card-b" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="badge b-ter">Campaign</span><div class="grow" style="min-width:200px"><b>${esc(c.name)}</b><div class="sm muted" style="font-size:12px">${c.accounts.length} people · ${seqSpan(c)} · email and LinkedIn</div></div><button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm</button><button class="btn sm" onclick="App.goCampaign('${c.id}','steps')">Review steps</button></div></div>`).join('') : ''}
      ${isMgr && apprTab === 'needs' ? '' : `<div class="card tbl-wrap">${items.length ? `<table class="tbl"><thead><tr><th>Person</th><th>Next best action</th><th>Micro-segment</th><th>Checks</th>${isMgr ? '<th>Rep</th>' : ''}<th>Due</th><th>If nobody acts</th><th></th></tr></thead><tbody>
        ${items.map(a => { const d = S.decisions[a.id]; return `<tr class="row-link" onclick="App.openRecord('${a.id}','engage')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.name)}</div></div></div></td><td>${esc(a.nba.action)}<div class="sm">${chIc(a.nba.channel)} ${a.nba.channel}</div></td><td><span class="seg-link" onclick="event.stopPropagation();App.openSegment('${a.seg}')">${esc(a.segment)}</span></td><td><div class="gcell">${gateCell(a)}</div>${a.nba.reasonNote && !/auto|sent/.test(a.nba.status) ? `<div class="sm" style="max-width:260px;white-space:normal;margin-top:4px">${esc(a.nba.reasonNote)}</div>` : ''}</td>${isMgr ? `<td>${ownerPick(a)}</td>` : ''}<td style="white-space:nowrap">${esc(a.nba.due)}</td><td class="sm" style="min-width:150px">${d || /auto|sent/.test(a.nba.status) ? '<span class="muted">–</span>' : a.nba.status === 'expired' ? 'Expired; re-ranked' : a.nba.status === 'held' ? 'Stays held' : 'Expires in 3 days and the account re-ranks'}</td>
          <td style="white-space:nowrap" onclick="event.stopPropagation()">${isMgr && !d ? `<button class="btn sm" onclick="App.toast('Nudged ${esc(first(USERS[a.owner].name))} in Slack about this card')">Nudge</button>` : `${d ? mkHu(decLabel(d)) : a.nba.status === 'sent' ? mkHu('Sent') : a.nba.status === 'auto' ? `<button class="btn sm pri" onclick="App.send1('${a.id}')">Send</button>` : `${!a.nba.reason || (isMgr && a.nba.sensitive) ? `<button class="btn sm pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : 'Approve'}</button> ` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','engage')">Review</button>`}`}</td></tr>`; }).join('')}
        </tbody></table>` : `<div class="empty">Nothing here. ${apprTab === 'done' ? 'Decisions you make show up here.' : 'You\'re all caught up.'}</div>`}</div>`}${apprTab === 'todo' || apprTab === 'needs' ? otherEsc() : ''}`;
  }

  /* Person drawer (opens over the module, beside the chat) */
  const ACT_IC = { signal: 'bolt', score: 'layers', segment: 'layers', campaign: 'megaphone', sent: 'mail', open: 'mail', reply: 'reply', watch: 'alert', nba: 'spark', wait: 'clock', crm: 'clock' };
  /* Holds and exclusions on the account page: why the account is or isn't in a queue (PRD §4, §6) */
  /* Buying committee, motivation, warm path and the research agent's rival angle */
  function committeeBlock(a) {
    const h = [...a.id].reduce((n, c) => n + c.charCodeAt(0), 0), cs = (a.contacts || []).filter(c => c.name !== a.contact.name);
    const grid = [['Buyer', a.contact.name, a.contact.title], ['Technical lead', cs[0] ? cs[0].name : 'Not found yet', cs[0] ? cs[0].title : 'Ask for enrichment'], ['Operations', cs[1] ? cs[1].name : 'Not found yet', cs[1] ? cs[1].title : 'Ask for enrichment']];
    const rival = /compet|rival|renewal/i.test(a.segment + ' ' + a.signals.map(x => x.type).join(' '));
    return `<div class="sec-t">Buying committee</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Role</th><th>Person</th><th>Title</th></tr></thead><tbody>${grid.map(r => `<tr><td class="sm">${r[0]}</td><td class="nm">${esc(r[1])}</td><td class="sm">${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:12px"><div class="placeholder-note" style="margin:0"><div><b>Motivation: ${esc(a.motivation || (h % 2 ? 'Cost' : 'Growth'))}</b><br>From case studies and reviews. Sets the message framing, never the rank.</div></div><div class="placeholder-note" style="margin:0"><div><b>Warm path: ${a.warm ? a.warm.score : 0}</b><br>${a.warm ? esc(a.warm.note) : 'No connection on the team.'} From each rep's own LinkedIn connections and the CRM.</div></div></div>
      ${rival ? `<div class="sec-t">Rival research</div><div class="placeholder-note"><div>The installed rival's own customers complain most about <b>slow support response</b> (14 of 40 recent reviews) and <b>upgrade cost</b> (9 of 40). Matched to our proof: the 4-hour support SLA (CS-01) and the phased migration (OP-02). The renewal window makes it urgent: the angle is <b>support you can count on through the switch</b>.</div></div>` : ''}`;
  }
  function wdiff(a0, b0) {
    const A = a0.split(/\s+/), B = b0.split(/\s+/), out = []; let i = 0, j = 0;
    while (i < A.length || j < B.length) { if (A[i] === B[j]) { out.push(esc(A[i])); i++; j++; } else if (j < B.length && !A.slice(i).includes(B[j])) { out.push(`<ins class="dif-i">${esc(B[j])}</ins>`); j++; } else if (i < A.length) { out.push(`<del class="dif-d">${esc(A[i])}</del>`); i++; } else { out.push(`<ins class="dif-i">${esc(B[j])}</ins>`); j++; } }
    return out.join(' ');
  }
  function actExtras(a) {
    const caps = (S.captures || []).filter(c => c.account === a.name), dr = S.drafts && S.drafts[a.id], h = [];
    const first = a.signals.slice().sort((p, q) => q.age - p.age)[0];
    if (first) h.push(`<div class="sec-t">Lineage</div><div class="placeholder-note"><div>First touch came from <b>${esc(first.type)}</b> (${esc(first.source)}), then ${a.nba ? 'the next best action "' + esc(a.nba.action) + '"' : 'the campaign'}${a.outcome ? ', which led to: <b>' + esc(a.outcome) + '</b>' : ''}. Reply rate for this signal type across the team: ${12 + (first.tier === 1 ? 9 : first.tier === 2 ? 4 : 0)} per 100 sends.</div></div>`);
    if (caps.length) h.push(`<div class="sec-t">Send record</div>${caps.map(c => `<div class="sig"><div><div style="font-weight:600">${esc(c.channel)} to ${esc(c.person)} · ${esc(c.at)}</div><div class="muted" style="font-size:11.5px">Segment ${esc(c.segment)} · signals ${esc(c.signals.join(', '))} · message ${esc(c.message)} · ${esc(c.rules)}</div></div><span class="badge b-sec nodot">Captured</span></div>`).join('')}`);
    if (dr && dr.body && a.nba && a.nba.body && dr.body !== a.nba.body) h.push(`<div class="sec-t">Your edit, stored as a diff</div><div class="placeholder-note"><div style="white-space:normal">${wdiff(a.nba.body, dr.body)}</div></div>`);
    return h.join('');
  }
  function holdsBlock(a) {
    const L = [], ex = excluded1(a), p = protect1(a);
    if (ex) L.push(['Excluded', ex, 'b-neg']);
    if (!p.ran) L.push(['Held: a check could not run', p.reason, 'b-warn']);
    else if (!p.ok) L.push(['Held', p.reason, 'b-warn']);
    if (a.contact.idTier === 4) L.push(['Identity held (I4)', ID_FOUND[4] + ' · ' + (a.contact.heldCycles || 1) + ' refresh cycles', 'b-warn']);
    if (a.nba && a.nba.status === 'nurture') L.push(['Nurture', 'Low confidence: watched, not worked', 'b-grey']);
    if (a.nicheUnclear) L.push(['Niche unclear', a.nicheUnclear.why, 'b-grey']);
    if (a.personaUnclear) L.push(['Persona unclear', '"' + a.personaUnclear + '": a generic persona is used', 'b-grey']);
    return `<div class="sec-t">Holds and exclusions</div>${L.length ? L.map(x => `<div class="sig"><div><div style="font-weight:600">${esc(x[0])}</div><div class="muted" style="font-size:11.5px">${esc(x[1])}</div></div><span class="badge ${x[2]} nodot">${esc(x[0].split(':')[0])}</span></div>`).join('') : '<div class="placeholder-note">None. Not a customer, no opt-out, no open deal, no touch in the last 14 days, identity verified.</div>'}`;
  }
  /* The context graph (FND): the people, signals, segment, CRM facts and touches the AI knows about this account, each link with its source and date */
  function graphPane(a) {
    const N = (k, l, s, cls) => `<div class="cg-n ${cls || ''}"><span class="cg-k">${esc(k)}</span><b>${esc(l)}</b>${s ? `<span class="cg-s">${esc(s)}</span>` : ''}</div>`;
    const live = a.signals.filter(x => x.weight > 0), dead = a.signals.filter(x => !(x.weight > 0));
    const E = [];
    E.push([a.contact.name, 'works at', a.name, 'I' + a.contact.idTier + ' · ' + ID_FOUND[a.contact.idTier]]);
    (a.contacts || []).filter(c => c.name !== a.contact.name).forEach(c => E.push([c.name, 'works at', a.name, c.title || 'Contact']));
    a.signals.forEach(x => E.push([a.name, x.weight > 0 ? 'shows signal' : 'had signal (expired)', x.type, x.source + ' · ' + ago(x.age) + ' · tier ' + x.tier]));
    if (a.seg) E.push([a.name, 'belongs to', a.segment, 'Micro-segment: niche × strongest trigger']);
    if (a.crm && a.crm.customer) E.push([a.name, 'is a customer', 'CRM', a.crm.field + ' since ' + a.crm.since]);
    if (a.crm && a.crm.openDeal) E.push([a.name, 'has an open deal', a.crm.openDeal.name, a.crm.openDeal.stage + ' · ' + a.crm.openDeal.owner]);
    if (a.lastTouch) E.push([a.contact.name, 'was touched', a.lastTouch.channel, a.lastTouch.days + ' days ago']);
    if (a.nba) E.push([a.name, 'next best action', a.nba.action, stepTxt(a)]);
    if (a.campaign) E.push([a.name, 'is in campaign', campOf(a.campaign).name, 'Next best campaign']);
    E.push([a.name, 'is owned by', USERS[a.owner].name, 'CRM owner']);
    return `<div class="placeholder-note" style="margin-bottom:12px"><div>Everything the AI knows about ${esc(a.name)} and how it is linked. Each link keeps its source and date, so any score, segment or action can be traced back. It refreshes on every overnight run.</div></div>
      ${hubSvg(a)}
      <div class="sec-t">Links · ${E.length}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>From</th><th>Link</th><th>To</th><th>Source and date</th></tr></thead><tbody>${E.map(e => `<tr><td class="nm">${esc(e[0])}</td><td class="sm">${esc(e[1])}</td><td>${esc(e[2])}</td><td class="sm muted">${esc(e[3])}</td></tr>`).join('')}</tbody></table></div>`;
  }
  let hubSel = null;
  function hubSvg(a) {
    const nodes = [];
    nodes.push(['p', 'Contact', a.contact.name, 'I' + a.contact.idTier, `App.setRecTab('overview')`, a.contact.title + ' · ' + ID_FOUND[a.contact.idTier]]);
    (a.contacts || []).filter(c => c.name !== a.contact.name).slice(0, 2).forEach(c => nodes.push(['p', 'Contact', c.name, c.title || '', null, c.title || 'Contact at ' + a.name]));
    a.signals.slice(0, 4).forEach(x => nodes.push([x.weight > 0 ? 's' : 'd', x.weight > 0 ? 'Signal · tier ' + x.tier : 'Expired', x.type, ago(x.age), `App.modTab('signals')`, x.text + ' · ' + x.source + ' · ' + (x.weight > 0 ? 'counts ' + x.weight + ' points' : 'no longer counts')]));
    if (a.seg) nodes.push(['g', 'Micro-segment', a.segment, '', `App.openSegment('${a.seg}')`, 'Niche × strongest trigger; open the segment']);
    if (a.nba) nodes.push(['n', 'Next best action', a.nba.action, stepTxt(a), `App.setRecTab('engage')`, a.nba.action + ' · ' + stepTxt(a)]);
    if (a.campaign) nodes.push(['n', 'Campaign', campOf(a.campaign).name, '', `App.goCampaign('${a.campaign}')`, 'Open the campaign']);
    if (a.crm && (a.crm.customer || a.crm.openDeal)) nodes.push(['x', 'CRM', a.crm.customer ? 'Customer' : 'Open deal', '', `App.setRecTab('overview')`, a.crm.customer ? 'Excluded: ' + a.crm.field : 'Held: ' + a.crm.openDeal.name]);
    if (a.lastTouch) nodes.push(['t', 'Touch', a.lastTouch.channel, a.lastTouch.days + ' days ago', `App.setRecTab('activity')`, 'Recent touch holds new actions for 14 days']);
    if (a.outcome) nodes.push(['o', 'Outcome', a.outcome, '', `App.setRecTab('activity')`, 'See the timeline']);
    nodes.push(['w', 'Owner', USERS[a.owner].name, '', null, 'Record owner in the CRM']);
    const W = 640, H = 560, cx = W / 2, cy = H / 2, rx = 225, ry = 205, n = nodes.length;
    const cut = (s, k) => (s = String(s || '')).length > k ? s.slice(0, k - 1) + '…' : s;
    const pos = nodes.map((_, i) => { const ang = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + rx * Math.cos(ang), cy + ry * Math.sin(ang)]; });
    return `<div class="hub-wrap"><svg class="hub" viewBox="0 0 ${W} ${H}" role="img" aria-label="Context graph for ${esc(a.name)}">
      ${pos.map(([x, y], i) => `<line class="hub-l k-${nodes[i][0]}" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`).join('')}
      <circle class="hub-c" cx="${cx}" cy="${cy}" r="64"/><text class="hub-ct" x="${cx}" y="${cy - 6}" text-anchor="middle">${esc(cut(a.name, 13))}</text><text class="hub-cs" x="${cx}" y="${cy + 14}" text-anchor="middle">${a.score} · tier ${esc(a.tier)}</text>
      ${pos.map(([x, y], i) => { const d = nodes[i]; return `<g class="hub-n k-${d[0]} ${hubSel === i ? 'on' : ''}" role="button" tabindex="0" onclick="App.hubPick(${i})" onkeydown="if(event.key==='Enter')App.hubPick(${i})"><title>${esc(d[1] + ': ' + d[2] + (d[3] ? ' · ' + d[3] : ''))}</title><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/><text class="hub-k" x="${x.toFixed(1)}" y="${(y - 18).toFixed(1)}" text-anchor="middle">${esc(d[1])}</text><text class="hub-t" x="${x.toFixed(1)}" y="${(y + 28).toFixed(1)}" text-anchor="middle">${esc(cut(d[2], 18))}</text>${d[3] ? `<text class="hub-s" x="${x.toFixed(1)}" y="${(y + 45).toFixed(1)}" text-anchor="middle">${esc(cut(d[3], 20))}</text>` : ''}</g>`; }).join('')}
    </svg>${hubSel != null && nodes[hubSel] ? `<div class="hub-det"><span class="badge b-grey nodot">${esc(nodes[hubSel][1])}</span> <b>${esc(nodes[hubSel][2])}</b><div class="sm">${esc(nodes[hubSel][5] || '')}</div>${nodes[hubSel][4] ? `<button class="btn sm" onclick="${nodes[hubSel][4]}">Open</button>` : ''}</div>` : '<div class="hub-det muted sm">Click any circle to see what links it to the account.</div>'}<div class="hub-key"><span class="k-p">People</span><span class="k-s">Live signals</span><span class="k-d">Expired</span><span class="k-g">Segment</span><span class="k-n">Actions and campaigns</span><span class="k-t">Touches and outcomes</span><span class="k-x">CRM</span></div></div>`;
  }
  const stepTxt = a => ({ auto: 'Ready to send', review: 'Approval card', held: 'Held', nurture: 'Nurture', expired: 'Expired', excluded: 'Excluded', sent: 'Sent' })[a.nba.status] || a.nba.status;
  function renderRecord() {
    const a = acct(recId), o = USERS[a.owner];
    const tabs = [['overview', 'Overview'], ['engage', 'Engagement'], ['activity', 'Activity'], ['graph', 'Context graph'], ['notes', 'Notes']];
    $('focus').innerHTML = `<div class="pdrawer ${copOpen ? 'cop-on' : ''}">
      <div class="pd-left">
        <div class="pd-top"><button class="ic-btn" title="Close and go back to the chat" onclick="App.closeFocus()">${ic('x', 16)}</button><button class="ic-btn" title="${focusFull ? 'Back beside the chat' : 'Full screen'}" onclick="App.focusFull()">${ic('expand', 15)}</button><span class="li-ic" style="margin-left:auto">${ic('li', 16)}</span></div>
        <div class="who"><span class="av" style="background:${o.color};width:54px;height:54px;font-size:18px">${initials(a.contact.name)}</span><div><div class="nm" style="font-family:var(--fd);font-size:19px">${esc(a.contact.name)}</div><div class="tl">${esc(a.contact.title)}</div><div class="tl"><span class="logo-dot">${esc(a.name[0])}</span> ${esc(a.name)}</div></div></div>
        <div class="pd-cta"><button class="btn pri" onclick="App.sendNow('${a.id}')">${ic('plane', 14)} Send</button><button class="btn ${copOpen ? 'on' : ''}" onclick="App.toggleCop()">${ic('spark', 14)} Copilot</button></div>
        <div class="sec-t">Details</div>
        <dl class="kv"><dt>Name</dt><dd>${esc(a.contact.name)}</dd><dt>Title</dt><dd>${esc(a.contact.title)}</dd><dt>Email</dt><dd>${esc(a.contact.email)}</dd><dt>Identity</dt><dd>${idBadge(a.contact.idTier)}<div class="muted" style="font-size:11.5px;margin-top:3px">${esc(ID_FOUND[a.contact.idTier])}</div></dd><dt>Persona</dt><dd><label class="sr" for="perSel">Persona</label><select id="perSel" class="sel" onchange="App.setPersona('${a.id}',this.value)">${['Buyer', 'Technical lead', 'Operations', 'Procurement'].map(p => `<option ${((S.persona || {})[a.id] || (/procure/i.test(a.contact.title) ? 'Procurement' : /instrument|control|engineer/i.test(a.contact.title) ? 'Technical lead' : /operat|plant|maint|reliab/i.test(a.contact.title) ? 'Operations' : 'Buyer')) === p ? 'selected' : ''}>${p}</option>`).join('')}</select></dd><dt>Opt-out</dt><dd>${optedOut(a) ? '<span class="badge b-neg nodot">Opted out</span>' : `<button class="btn sm" onclick="App.optOut('${a.id}')">Add opt-out</button>`}</dd><dt>Record owner</dt><dd>${isMgr ? `<label class="sr" for="recOwner">Owner</label><select class="sel" id="recOwner" onchange="App.reassign(['${a.id}'],this.value)">${REPS.map(r => `<option value="${r}" ${a.owner === r ? 'selected' : ''}>${esc(USERS[r].name)}</option>`).join('')}</select>` : esc(o.name)}</dd><dt>Score</dt><dd>${tierBadge(a.tier)} ${sc(a)}</dd><dt>Lead source</dt><dd>${a.fromList ? 'Prospecting · Lookalikes of my last 10 wins' : 'Signals · overnight sweep'}</dd></dl>
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

  /* ─── Rules: the five criteria, fail closed, and the route ─── */
  const SIM = window.MOCK.SIM || {};
  const CFG1 = (() => { try { return JSON.parse(localStorage.getItem('dmock_cfg') || '{}') || {}; } catch (e) { return {}; } })();
  const BANDS = { high: CFG1.high || 0.75, medium: CFG1.medium || 0.5 };
  const POLICY = Object.assign({ s3: 'approval', s7: 'autopilot', s9: 'autopilot' }, CFG1.policy || {});
  /* Approved claims from the Content Library: a figure in one of these counts as sourced. */
  const APPROVED = [['cut unplanned trips by 18%', 'CL-07 case study, approved 2026-09']];
  const ID_FOUND = { 1: 'Apollo, first try', 2: 'ZoomInfo after Apollo missed; Lusha agrees', 3: 'ZoomInfo after Apollo missed; Lusha has no record', 4: 'ZoomInfo after Apollo missed; Lusha disagrees (held)', 5: 'Lusha only (single source)' };
  const BANNED = ['best-in-class', 'world-class', 'game-changer', 'revolutionary', 'cutting-edge', 'synergy', 'guaranteed results', 'no-brainer', 'act now', 'leading provider', 'seamless', 'once-in-a-lifetime'];
  const DUE3 = 'Fri 30 Oct';
  /* Confidence: identity tier, independent sources, strength and evidence, combined into 0 to 1, then banded. */
  function conf1(a) {
    const top = a.signals.filter(x => x.weight > 0).sort((p, q) => q.weight - p.weight).slice(0, 3);
    const parts = { identity: { 1: 1, 2: 0.85, 3: 0.55, 4: 0.2, 5: 0.4 }[a.contact.idTier] || 0.4, sources: Math.min(new Set(top.map(x => x.source)).size, 3) / 3, strength: top.length ? top.reduce((t, x) => t + (x.str5 || 3), 0) / top.length / 5 : 0, evidence: top.length ? top.filter(x => x.text && x.source).length / top.length : 0 };
    let v = 0.4 * parts.identity + 0.2 * parts.sources + 0.2 * parts.strength + 0.2 * parts.evidence;
    const lab = a.nba && a.nba.confidence;
    if (lab === 'High') v = Math.max(v, BANDS.high + 0.03); if (lab === 'Medium') v = Math.min(Math.max(v, BANDS.medium + 0.05), BANDS.high - 0.04); if (lab === 'Low') v = Math.min(v, BANDS.medium - 0.06);
    v = Math.round(v * 100) / 100;
    return { value: v, band: v >= BANDS.high ? 'High' : v >= BANDS.medium ? 'Medium' : 'Low', parts };
  }
  /* Message verification: no banned phrase; a figure needs a source; the Content Library rules (PRD §10). */
  function verify1(a) {
    if (a.nba.llmFailed) return { ok: false, issues: ['No draft was produced: the language model failed'] };
    const body = (S.drafts[a.id] && S.drafts[a.id].body) || a.nba.body || '', issues = [];
    BANNED.forEach(b => { if (body.toLowerCase().includes(b)) issues.push('Banned phrase: "' + b + '"'); });
    body.split(/(?<=[.!?])\s+/).forEach(s => { if (/\d+\s?%/.test(s) && !/\[[A-Z]+\d+\]/.test(s) && !APPROVED.some(c => s.includes(c[0]))) issues.push('A figure without a source: "' + s.trim().slice(0, 60) + '"'); });
    return { ok: !issues.length, issues };
  }
  const optedOut = a => !!(S.optouts && S.optouts[a.id]) || (a.id === 'mangrovearomatics' && (SIM.days || 0) >= 2);
  /* Exclusions come before everything: an excluded account never reaches a queue. */
  function excluded1(a) {
    if (a.crm && a.crm.customer) return 'Customer: ' + a.crm.field + ' since ' + a.crm.since;
    if (optedOut(a)) return 'Opt-out: ' + a.contact.name + (S.optouts && S.optouts[a.id] ? ' (added by ' + S.optouts[a.id].by + ')' : ' replied "please remove me"');
    return null;
  }
  /* Protective checks fail closed: if one cannot run, the action is held and the rep sees why. */
  function protect1(a) {
    if (SIM.crm) return { ran: false, ok: false, reason: 'CRM unreachable: the customer, open-deal and recent-touch checks could not run' };
    if (SIM.exclusions) return { ran: false, ok: false, reason: 'Exclusions list unreadable: the exclusion and suppression checks could not run' };
    if (a.crm && a.crm.openDeal) return { ran: true, ok: false, reason: 'Open opportunity "' + a.crm.openDeal.name + '" (' + a.crm.openDeal.stage + '), owned by ' + a.crm.openDeal.owner };
    if (a.lastTouch && a.lastTouch.days < 14) return { ran: true, ok: false, reason: 'Recent touch: ' + a.lastTouch.channel.toLowerCase() + ' sent ' + a.lastTouch.days + ' days ago' };
    return { ran: true, ok: true };
  }
  const chan1 = a => a.contact.email ? (a.nba && a.nba.channel) || 'Email' : a.contact.linkedin ? 'LinkedIn' : null;
  /* The five criteria, in the PRD's order. */
  const gate = a => { const c = conf1(a), v = verify1(a), p = protect1(a), pol = POLICY[a.seg] || 'assisted';
    return [['Confidence: ' + c.band.toLowerCase(), c.band !== 'Low', `${c.band} (${c.value.toFixed(2)}): high and medium pass, low goes to nurture`], ['Message verification passes', v.ok, v.ok ? 'Approved claims, tone and no banned phrase' : v.issues.join('; ')], ['Every protective check passes', p.ok, p.ok ? 'Exclusions, suppression, open deal and recent touch pass' : p.reason], ['Identity tier is I1 or I2', a.contact.idTier <= 2, 'I' + a.contact.idTier + ': ' + ID_FOUND[a.contact.idTier]], ["The segment's policy allows it", pol !== 'approval', pol === 'approval' ? 'This segment is set to require a person' : pol === 'autopilot' ? 'Autopilot: the AI sends within guardrails' : 'Assisted: the rep sends with one click']]; };
  const SHORT = { 'Message verification passes': 'Message verification', 'Every protective check passes': 'Protective check', 'Identity tier is I1 or I2': 'Identity tier', "The segment's policy allows it": 'Segment policy requires a person' };
  const ESC_OF = { 'Message verification passes': 2, 'Every protective check passes': 5, 'Identity tier is I1 or I2': 3, "The segment's policy allows it": 4 };
  function routeAll() {
    ACCOUNTS.forEach(a => {
      if (!a.nba) return;
      const n = a.nba, o = n.orig; n.esc = null; n.held = null;
      if (a.campaign) return;
      const ex = excluded1(a);
      if (ex) { Object.assign(n, { status: 'excluded', reason: 'Excluded', reasonNote: ex }); return; }
      if (S.sent1 && S.sent1[a.id]) { Object.assign(n, { status: 'sent', reason: null, reasonNote: '' }); return; }
      const p = protect1(a);
      if (!p.ran) { Object.assign(n, { status: 'held', reason: 'A check could not run', reasonNote: p.reason, esc: 5 }); return; }
      if (a.contact.idTier === 4) { Object.assign(n, { status: 'held', reason: 'Identity dispute (I4)', reasonNote: 'Providers disagree (' + ID_FOUND[4] + '); held for ' + (a.contact.heldCycles || 1) + ' refresh cycles', esc: (a.contact.heldCycles || 0) >= 3 ? 10 : null }); return; }
      if (!p.ok) { Object.assign(n, { status: 'held', reason: 'Held', reasonNote: p.reason }); return; }
      if (conf1(a).band === 'Low') { Object.assign(n, { status: 'nurture', reason: 'Low confidence', reasonNote: 'Watched, not worked: nobody is asked to decide.' }); return; }
      if (o === 'sent') { Object.assign(n, { status: 'sent' }); return; }
      if (SIM.days >= 3 && !S.decisions[a.id]) { const f0 = gate(a).filter(x => !x[1]); if (f0.length || n.llmFailed || !chan1(a)) { Object.assign(n, { status: 'expired', reason: 'Expired', reasonNote: 'Nobody acted in 3 days, so the card expired and the account re-ranked (now #' + a.rank + ').' }); return; } }
      if (n.llmFailed) { Object.assign(n, { status: 'review', reason: 'No draft produced', reasonNote: 'The language model failed twice; the signals are attached. Write the message or retry.', esc: 6, due: DUE3 }); return; }
      if (!chan1(a)) { Object.assign(n, { status: 'review', reason: 'No verified channel', reasonNote: 'The contact has no verified email, LinkedIn or phone. Choose a channel or ask for enrichment.', esc: 7, due: DUE3 }); return; }
      const fails = gate(a).filter(x => !x[1]);
      if (fails.length) { Object.assign(n, { status: 'review', reason: SHORT[fails[0][0]] + (fails[0][0] === 'Identity tier is I1 or I2' ? ' I' + a.contact.idTier : ''), reasonNote: fails.map(x => x[0] + ': ' + x[2]).join('. '), esc: ESC_OF[fails[0][0]], due: DUE3 }); return; }
      /* All five met: assisted mode, so it waits as Ready to send. Actions met earlier were sent with one click. */
      if (POLICY[a.seg] === 'autopilot' && conf1(a).band === 'High') { Object.assign(n, { status: 'sent', reason: null, reasonNote: '', autopilot: true }); a.outcome = a.outcome || 'Sent by the AI on autopilot'; return; }
      Object.assign(n, { status: o === 'ready' || o === 'review' ? 'auto' : 'sent', reason: null, reasonNote: '', due: o === 'ready' || o === 'review' ? 'Today' : n.due });
      if (o !== 'ready' && o !== 'review' && !a.outcome) a.outcome = 'Sent with one click';
    });
  }
  routeAll();
  (k => { if (k && k.activity) k.activity.push({ k: 'crm', when: 'Mon 26 Oct', t: 'Champion moved: signal replaced', d: 'Arif Rahman, who championed us at Tidewater, joined Kingfisher Refining as plant head. The signal tied to his old role was removed and a new "champion moved" signal was created here.' }); })(ACCOUNTS.find(a => a.id === 'kingfisher'));
  function gateBlock(a) {
    const g = gate(a), fails = g.filter(x => !x[1]);
    return `<div class="gate ${fails.length ? 'no' : 'ok'}"><div class="gate-t">${fails.length ? `${ic('alert', 14)} ${/sent/.test(a.nba.status) ? 'A person approved it, because it didn\'t pass' : 'Needs you: it didn\'t pass'} ${fails.map(x => x[0].toLowerCase()).join(', ')}` : `${ic('check', 14)} Meets all five criteria: ready to send with one click, no approval card`}</div><div class="gate-r">${g.map(([k, ok]) => `<span class="gc ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✕'} ${k}</span>`).join('')}</div></div>`;
  }
  const gateCell = a => { const f = gate(a).filter(x => !x[1]); return f.length ? f.map(x => `<span class="badge b-warn nodot">✕ ${x[0]}</span>`).join(' ') : '<span class="badge b-pos nodot">✓ All five criteria</span>'; };

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
    if (/why/.test(t)) { const f = gate(a).filter(x => !x[1]); return `<b>${esc(a.nba.action)}</b> fits the strongest signal (${esc(a.whyNow ? a.whyNow.type.toLowerCase() : 'none')}) and the ${a.nba.proven ? 'proven' : 'provisional'} structure for ${esc(a.segment)}. ${f.length ? `It came to you because it didn't pass: ${f.map(x => x[0].toLowerCase()).join(', ')}.` : 'It meets all five criteria, so it is ready to send with one click. No approval card.'}`; }
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
          <div class="placeholder-note" style="margin-top:12px"><div>Timing = ${sig.filter(x => x.weight > 0).map((x, i) => (i ? (i === 1 ? '½ × ' : i === 2 ? '¼ × ' : '1/' + Math.pow(2, i) + ' × ') : '') + x.weight).join(' + ')} = ${a.points} points${a.points > 100 ? ', capped at 100' : ''}, so Timing is <b>${a.timing}</b> out of 100. Score = Fit × Timing ÷ 100 = <b>${a.score}</b> out of 100, so a perfect fit with no live signal scores zero.</div></div>`
          : '<div class="placeholder-note">No live signal, so the score is zero and nothing is suggested. The account stays watched.</div>'}${a.signals.length ? `<div class="placeholder-note" style="margin-top:10px"><div><b>Against its own normal:</b> timing is ${(1.4 + (a.score % 17) / 10).toFixed(1)} times this account's 90-day average, so big accounts don't dominate the list just by being big.</div></div>` : ''}${holdsBlock(a)}${committeeBlock(a)}${a.signals.length ? scoreProcess(a) : ''}`;
    }
    if (recTab === 'activity') {
      const out = S.outcomes[a.id], list = a.activity.slice().reverse();
      return `<div class="sec-t">What happened</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px">${['Sent', 'Replied', 'Meeting booked', 'No response'].map(x => `<button class="chip" style="${out === x ? 'border-color:var(--brand);color:var(--brand-dk);background:var(--brand-lt)' : ''}" onclick="App.logOutcome('${a.id}','${x}')">${x}</button>`).join('')}</div>
        ${S.attach && S.attach[a.id] ? `<div class="placeholder-note"><div><b>Asset attached:</b> ${esc(S.attach[a.id])}. It goes with the next send.</div></div>` : ''}${actExtras(a)}<div class="sec-t">Timeline · open any step for detail</div>
        <div class="timeline">${list.map((x, i) => `<button class="tl-row" onclick="App.toggleAct(${i})"><span class="ic k-${x.k}">${ic(ACT_IC[x.k] || 'clock', 13)}</span><div class="grow"><div class="nm">${esc(x.t)}</div><div class="sm">${esc(x.d)}</div>${actOpen === i ? actDetail(a, x) : ''}</div><span class="when">${esc(x.when)}</span></button>`).join('')}</div>`;
    }
    if (recTab === 'graph') return graphPane(a);
    if (recTab === 'notes') {
      return `<label class="sr" for="noteBox">Note</label><textarea class="edit" style="min-height:90px" id="noteBox" placeholder="Add a note…"></textarea><div style="margin:8px 0 16px"><button class="btn pri sm" onclick="App.addNote('${a.id}')">Save note</button></div>
        ${(S.notes[a.id] || []).map(n => `<div class="tl-row"><span class="ic">${ic('book', 13)}</span><div class="grow"><div>${esc(n.t)}</div><div class="sm">${esc(me.name)} · ${esc(n.d)}</div></div></div>`).join('') || '<div class="empty">Create your first note. Keep track of important details about this person.</div>'}`;
    }
    if (a.campaign) return campEngage(a);
    if (!a.nba) return '<div class="placeholder-note">No next action: there\'s no live signal for this account yet.</div>';
    const d = draftOf(a), dec = S.decisions[a.id];
    const banner = dec ? `<div class="ready" style="background:var(--s50)"><div class="grow"><b>${decLabel(dec)}</b></div><button class="btn sm" onclick="App.undo('${a.id}')">Undo</button></div>`
      : a.nba.status === 'auto' ? `<div class="ready" style="background:var(--pos-lt)"><div class="grow"><b>Ready to send · confidence: ${conf1(a).band.toLowerCase()}.</b> It meets all five criteria, so there is no approval card. Sending from your mailbox logs who, the signals, the message version and the rule version.</div><button class="btn pri" onclick="App.send1('${a.id}')">Send</button></div>`
      : /held|nurture|expired|excluded/.test(a.nba.status) ? `<div class="ready" style="background:var(--warn-lt)"><div class="grow"><b>${esc(a.nba.status === 'held' ? 'Held' : a.nba.status === 'nurture' ? 'Nurture' : a.nba.status === 'expired' ? 'Expired' : 'Excluded')}.</b> ${esc(a.nba.reasonNote)}</div></div>`
      : a.nba.status === 'sent' ? `<div class="ready" style="background:var(--sec-lt)"><div class="grow"><b>Sent.</b> ${esc(a.outcome || '')}</div></div>`
      : a.nba.reason ? `<div class="ready" style="background:var(--warn-lt)"><div class="grow"><b>${reasonOf(a)}.</b> ${esc(a.nba.reasonNote)}</div><button class="btn pri" onclick="App.approve('${a.id}')">Approve and send</button></div>`
      : `<div class="ready"><div class="grow">Your next best action is ready. Approve to continue.</div><button class="btn pri" onclick="App.approve('${a.id}')">Approve</button></div>`;
    return `<div class="eng-h"><div class="lbl">${ic('bolt', 13)} Next best action</div><div class="eng-grid"><div><span>Action</span>${esc(d.option === 'run' ? a.nba.runnerUp : a.nba.action)}</div><div><span>Status</span>${stepBadge(a)}</div><div><span>Channel</span>${a.nba.channel}</div><div><span>Due</span>${esc(a.nba.due || '–')}</div></div><div class="lbl" style="margin:12px 0 6px">Delivery</div>${deliveryRow(a)}</div>${gateBlock(a)}${banner}
      <div style="margin-top:10px">
        <button class="opt ${d.option === 'rec' ? 'on' : ''}" onclick="App.setOption('${a.id}','rec')"><div class="h">${esc(a.nba.action)}<span class="badge b-brand nodot">Recommended</span></div><div class="d">${a.nba.confidence} confidence · ${a.nba.proven ? 'proven structure for ' + esc(a.segment) : 'provisional structure (first try)'}</div></button>
        <button class="opt ${d.option === 'run' ? 'on' : ''}" onclick="App.setOption('${a.id}','run')"><div class="h">${esc(a.nba.runnerUp)}<span class="badge b-grey nodot">Runner-up</span></div><div class="d">A lighter touch: something useful instead of a meeting ask. Picking it rewrites the message.</div></button></div>
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
    { re: /downtime|trip|reliab/, title: 'Where Unplanned Downtime Really Comes From', audience: 'Reliability leaders', intro: 'Most unplanned trips trace back to a small set of ageing instruments and alarms nobody owns. Fixing those first gives back more uptime than any single project.', h: ['Why it matters now', 'Questions worth asking', 'What a peer site did', 'A sensible next step'], qs: ['Which instruments have tripped the unit more than once this year?', 'Who owns alarm rationalisation?', 'What does an hour of downtime cost on your worst unit?'], st: [['18%', 'fewer unplanned trips at a peer refinery in year one', 'OP-02'], ['3 in 5', 'trips trace back to instruments past end of support', 'BR-03'], ['2 days', 'on site to map the worst offenders', 'CS-01']], bars: [['Ageing instruments', 41], ['Alarm floods', 24], ['Operator workarounds', 19], ['Mechanical', 16]] },
    { re: /staff|hiring|skill/, title: 'Staffing a Control-System Upgrade', audience: 'Plant heads', intro: 'Upgrades slip when the same five engineers run the plant and the project. Planning the people side early keeps both on track.', h: ['Why it matters now', 'Questions worth asking', 'What a peer site did', 'A sensible next step'], qs: ['Who runs the plant while the project team cuts over?', 'Which skills do you buy in, and which do you keep?', 'When does training need to start?'], st: [['5', 'engineers usually carry the whole cut-over', 'BR-03'], ['30%', 'of upgrade delays come from staffing gaps', 'OP-02'], ['12 weeks', 'lead time to train operators on a new platform', 'CS-01']], bars: [['Project engineers', 38], ['Operators trained', 27], ['Vendor specialists', 21], ['Contractors', 14]] },
    { re: /emission|compliance|reporting/, title: 'The 2027 Emissions-Reporting Checklist', audience: 'Plant heads', intro: 'The 2027 rules ask for continuous, auditable data. Most sites have the instruments but not the trail behind them.', h: ['What changes in 2027', 'Check these now', 'What a peer site did', 'A sensible next step'], qs: ['Can you show where every reported figure came from?', 'Which analysers are past end of support?', 'Who signs off the annual report?'], st: [['2027', 'first reporting year under the new rules', 'BR-03'], ['6', 'data checks auditors ask for first', 'OP-02'], ['1 shutdown', 'to bring a comparable site into line', 'CS-01']], bars: [['Data trail', 36], ['Analyser health', 28], ['Sign-off process', 20], ['Reporting tools', 16]] },
    { re: /historian|tech-stack/, title: 'Historian Migration: A Phased Path', audience: 'Technical leads (I&C)', intro: 'A historian holds years of process data that every other system leans on. Moving it in phases keeps that data usable throughout.', h: ['Why it matters now', 'Questions worth asking', 'What a peer site did', 'A sensible next step'], qs: ['Which systems read from the historian today?', 'How much history must move on day one?', 'Who validates the migrated tags?'], st: [['14 yrs', 'of process data at a typical site', 'BR-03'], ['3 phases', 'to move without losing a shift of data', 'CS-01'], ['0', 'hours of lost history at a peer site', 'OP-02']], bars: [['Tag mapping', 34], ['Interfaces', 29], ['Validation', 22], ['Cut-over', 15]] },
    { re: /rival|switch|contract end|vendor support|extend vs/, title: 'Switch at Contract End: The Decision in Five Steps', audience: 'Sites whose rival contract ends soon', intro: 'A contract end is the cheapest moment to change platform. Waiting a year usually means another renewal at a higher price.', h: ['Why it matters now', 'Questions worth asking', 'What a peer site did', 'A sensible next step'], qs: ['What does slow support cost per incident?', 'Which units would move first?', 'What would you need to see to switch?'], st: [['4 hrs', 'average wait for vendor support on a legacy platform', 'OP-02'], ['1 shutdown', 'to switch a comparable refinery', 'CS-01'], ['22%', 'lower five-year support cost after switching', 'BR-03']], bars: [['Support delays', 37], ['Licence cost', 26], ['Spare parts', 21], ['Training', 16]] },
    { re: /restart|delay/, title: 'What a Delayed Restart Really Costs', audience: 'Procurement leads', intro: 'A restart that runs two days late costs more than most instrument budgets. Most of that delay is known before the shutdown starts.', h: ['Why it matters now', 'Questions worth asking', 'What a peer site did', 'A sensible next step'], qs: ['What does one extra day offline cost?', 'Which checks hold up restart sign-off?', 'Who owns restart readiness?'], st: [['2 days', 'typical restart overrun', 'OP-02'], ['$1.2M', 'lost margin per day on a mid-size unit', 'BR-03'], ['⅓', 'less overrun when checks start early', 'CS-01']], bars: [['Instrument checks', 39], ['Permits', 23], ['Spares', 22], ['Staffing', 16]] },
    { re: /renewal|service/, title: 'Before Your Support Contract Ends: Three Questions Worth Asking', audience: 'Sites whose support contract ends soon', intro: 'A service renewal is easy to sign without a second look. It is also the one moment each year when the cost of standing still is on the table.', h: ['Why it matters now', 'Questions worth asking', 'What comparable sites did', 'A sensible next step'], qs: ['What will support cost once the platform reaches end of life?', 'Which units would a migration touch first?', 'Who needs to be in the decision?'] },
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
    return { title: tp.title, type, audience: tp.audience, tone: 'Direct', length: type === 'Whitepaper' ? 'Long' : 'Short', status: 'Draft', blocks: b, sel: null, st: tp.st || [['1 shutdown', 'to move a legacy system at a comparable refinery', 'Case study'], ['2 days', 'on site for an assessment and a phased plan', 'CS-01'], ['⅓', 'less cut-over time when work follows the shutdown', 'OP-02']], bars: tp.bars || [['Support timing', 38], ['Shutdown calendar', 27], ['Budget cycle', 20], ['Staffing', 15]] };
  }
  /* ─── A canvas per asset type: whitepaper pages, an infographic poster, carousel slides, a one-page PDF ─── */
  const cite = s => esc(s).replace(/\[([^\]]+)\]/g, '<span class="cite">[$1]</span>');
  const BRANDN = 'Vantera';
  function docParts(d) {
    const B = d.blocks, H = (i) => (B.filter(x => x.k === 'h2')[i] || {}).t || '', P = B.filter(x => x.k === 'p'), Q = (B.find(x => x.k === 'ul') || { items: [] }).items;
    return { H, P, Q, intro: (P[0] || {}).t || '', proof: (P.find(x => /Case study|peer|comparable/i.test(x.t)) || P[P.length - 2] || {}).t || '', next: (P[P.length - 1] || {}).t || '' };
  }
  function docMeta(d) {
    return d.type === 'Infographic' ? `Poster · ${d.st.length} numbers · 1 chart` : d.type === 'Carousel' ? '6 slides · 1080 × 1080' : d.type === 'PDF one-pager' ? '1 page · A4' : `${wc(d)} words · ${Math.max(1, Math.round(wc(d) / 230))} min read`;
  }
  function docDl(d) {
    return d.type === 'Infographic' ? ['PNG image', 'PDF', 'Email-ready image'] : d.type === 'Carousel' ? ['PDF for LinkedIn', 'PNG slides (.zip)', 'PowerPoint (.pptx)'] : d.type === 'PDF one-pager' ? ['PDF', 'Word (.docx)', 'Tracked link'] : ['Word (.docx)', 'PDF', 'Markdown'];
  }
  function docBody(d) {
    const x = docParts(d), maxB = Math.max(...d.bars.map(b => b[1]));
    if (d.type === 'Infographic') return `<article class="ig-paper"><header class="ig-hd"><span class="ig-ey">${esc(BRANDN)} · Infographic</span><h1>${esc(d.title)}</h1><p>${cite(x.intro)}</p></header>
      <div class="ig-stats">${d.st.map(s => `<div class="ig-st"><b>${esc(s[0])}</b><span>${esc(s[1])}</span><i class="cite">[${esc(s[2])}]</i></div>`).join('')}</div>
      <section class="ig-sec"><h2>${esc(x.H(0) || 'Where it comes from')}</h2><div class="ig-bars">${d.bars.map(b => `<div class="ig-bar"><span>${esc(b[0])}</span><div class="ig-track"><i style="width:${Math.round(b[1] / maxB * 100)}%"></i></div><b>${b[1]}%</b></div>`).join('')}</div></section>
      <section class="ig-sec"><h2>${esc(x.H(1) || 'Questions worth asking')}</h2><div class="ig-qs">${x.Q.map((q, i) => `<div class="ig-q"><span>${i + 1}</span>${esc(q)}</div>`).join('')}</div></section>
      <footer class="ig-ft"><div><b>${esc(x.H(3) || 'Next step')}</b><span>${cite(x.next)}</span></div><span class="ig-logo">${esc(BRANDN)}</span></footer></article>`;
    if (d.type === 'Carousel') {
      const S6 = [`<div class="ca-s ca-cover"><span class="ig-ey">${esc(BRANDN)}</span><h1>${esc(d.title)}</h1><span class="ca-sw">Swipe →</span></div>`,
        `<div class="ca-s"><h2>${esc(x.H(0))}</h2><p>${cite(x.intro)}</p></div>`,
        `<div class="ca-s ca-num"><b>${esc(d.st[0][0])}</b><p>${esc(d.st[0][1])}</p><i class="cite">[${esc(d.st[0][2])}]</i></div>`,
        `<div class="ca-s"><h2>${esc(x.H(1))}</h2><ol>${x.Q.map(q => `<li>${esc(q)}</li>`).join('')}</ol></div>`,
        `<div class="ca-s"><h2>${esc(x.H(2))}</h2><p>${cite(x.proof)}</p></div>`,
        `<div class="ca-s ca-cta"><h2>${esc(x.H(3))}</h2><p>${cite(x.next)}</p><span class="ca-btn">Book a site assessment</span></div>`];
      return `<div class="ca-row">${S6.map((s, i) => `<div class="ca-w">${s}<span class="ca-n">${i + 1}/6</span></div>`).join('')}</div><div class="ca-post"><b>Post copy</b><p>${esc(x.intro.split('. ')[0])}. Six slides on what to ask and what a peer site did. #reliability #operations</p></div>`;
    }
    if (d.type === 'PDF one-pager') return `<article class="op-paper"><header class="op-hd"><div><span class="ig-ey">${esc(BRANDN)} · One-pager</span><h1>${esc(d.title)}</h1><p>For ${esc(d.audience.toLowerCase())}</p></div><span class="ig-logo">${esc(BRANDN)}</span></header>
      <div class="op-grid"><div class="op-main"><p class="op-lead">${cite(x.intro)}</p><h2>${esc(x.H(0))}</h2><p>${cite((x.P[1] || {}).t || '')}</p><h2>${esc(x.H(1))}</h2><ul class="op-chk">${x.Q.map(q => `<li>${esc(q)}</li>`).join('')}</ul><h2>${esc(x.H(2))}</h2><p>${cite(x.proof)}</p></div>
      <aside class="op-side">${d.st.map(s => `<div class="op-st"><b>${esc(s[0])}</b><span>${esc(s[1])}</span><i class="cite">[${esc(s[2])}]</i></div>`).join('')}</aside></div>
      <footer class="op-ft"><b>${esc(x.H(3))}</b><span>${cite(x.next)}</span></footer></article>`;
    return `<article class="doc-paper"><div class="wp-cover"><span class="ig-ey">${esc(BRANDN)} · Whitepaper</span><h1>${esc(d.title)}</h1><p>For ${esc(d.audience.toLowerCase())}</p></div>${d.blocks.map((b, i) => b.k === 'h2' ? `<h2 class="${b.nw ? 'nw' : ''}">${esc(b.t)}</h2>` : b.k === 'ul' ? `<ul>${b.items.map(y => `<li>${esc(y)}</li>`).join('')}</ul>` : `<p class="${S.studio.sel === i ? 'sel' : ''} ${b.nw ? 'nw' : ''}" onclick="App.selPara(${i})" title="Click to change just this paragraph">${cite(b.t)}</p>`).join('')}</article>`;
  }
  const STUDIO_TYPES = ['Blog', 'Whitepaper', 'PPT deck', 'One-pager PDF', 'Case study', 'Brochure', 'Infographic', 'Single image post', 'Carousel', 'LinkedIn post', 'ROI sheet', 'Short video', 'Podcast', 'Landing page'];
  const fmtOf = v => { const m = v.match(/\b(ppt|powerpoint|slides?|deck|one-pager|pdf|case study|brochure|infographic|single image|carousel|linkedin (text )?post|roi sheet|video|podcast|landing page)\b/i); if (!m) return null; const k = m[0].toLowerCase(); return /ppt|powerpoint|slide|deck/.test(k) ? 'PPT deck' : /one-pager|pdf/.test(k) ? 'One-pager PDF' : /case/.test(k) ? 'Case study' : /brochure/.test(k) ? 'Brochure' : /infographic/.test(k) ? 'Infographic' : /single image/.test(k) ? 'Single image post' : /carousel/.test(k) ? 'Carousel' : /linkedin/.test(k) ? 'LinkedIn post' : /roi/.test(k) ? 'ROI sheet' : /video/.test(k) ? 'Short video' : /podcast/.test(k) ? 'Podcast' : 'Landing page'; };
  function startDoc(type, brief) {
    const d = makeDoc(type, brief); d.tpl = S.dsT || ''; d.tplName = (window.CONTENT_LIB.defTemplate(type) || {}).name || '';
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
  /* ─── Content studio › Library: every saved asset as an artifact, with status, where it is used, and Claude-style search, filter and view controls ─── */
  const FMT = { 'Outbound email': ['Outbound', 'Starting a conversation with a named contact', 'Reply rate, meetings'], 'Newsletter': ['Inbound / owned', 'Ongoing nurture across the buying committee', 'Clicks, account-level engagement'], 'Blog email': ['Inbound / owned', 'Problem-led education, one topic at a time', 'Clicks, read-through'], 'LinkedIn DM': ['Outbound', 'Personal outreach to a connected contact', 'Reply rate, meetings'], 'LinkedIn post': ['Community / social', 'Visibility, peer proof, warming accounts before outreach', 'Engagement from target-account people'] };
  const AST = { 'Whitepaper': ['Consideration → evaluation', 'Technical evaluators and analytical buyers; deep proof of the value proposition'], 'Infographic': ['Awareness → consideration', 'Busy executives; one problem or stat at a glance'], 'Carousel': ['Awareness', 'LinkedIn feed; a problem → solution story in 5–8 slides'], 'PDF one-pager': ['Consideration', 'A leave-behind any role can forward internally'] };
  const COMBO = { 'Whitepaper': { 'Outbound email': 'link, later in the sequence', 'Newsletter': 'featured link', 'Blog email': '"go deeper" link', 'LinkedIn DM': 'after a reply' }, 'Infographic': { 'Outbound email': 'best opener', 'Newsletter': 'inline image', 'Blog email': 'inline', 'LinkedIn DM': 'opener', 'LinkedIn post': 'yes' }, 'Carousel': { 'LinkedIn DM': 'yes', 'LinkedIn post': 'native format' }, 'PDF one-pager': { 'Outbound email': 'tracked link', 'Newsletter': 'featured link', 'LinkedIn DM': 'attachment' } };
  const UK = { 'Daniel Brooks': 'pavan', 'Sofia Ahlgren': 'sofia', 'Marco Lindqvist': 'marco', 'Kenji Watanabe': 'kenji', 'Aisha Rahman': 'aisha' };
  const LIB0 = window.CONTENT_LIB.seed();
  const libF = { ind: '', seg: '', per: '', topicK: '', type: '', fmt: '', q: '' };
  let libTabK = 'All', libSort = 'Last updated', libMenu = null, libSearch = false, libList = true;
  function libAll() {
    return window.CONTENT_LIB.all().filter(a => a.st !== 'Retired');
  }
  const libPass = a => (!libF.ind || a.ind === libF.ind) && (!libF.seg || a.seg === libF.seg) && (!libF.per || a.per === libF.per) && (!libF.topicK || a.topicK === libF.topicK) && (!libF.type || a.type === libF.type) && (!libF.fmt || a.fmt.includes(libF.fmt)) && (!libF.q || (a.t + ' ' + a.topic + ' ' + a.seg).toLowerCase().includes(libF.q.toLowerCase()));
  const libSorted = L => L.slice().sort(libSort === 'Top performing' ? (p, q) => libPerf(q) - libPerf(p) : libSort === 'Most used' ? (p, q) => q.used - p.used : libSort === 'Title A–Z' ? (p, q) => p.t.localeCompare(q.t) : (p, q) => p.age - q.age);
  const uAv = (k, s) => USERS[k] ? `<span class="av lib-av" title="${esc(USERS[k].name)}" style="background:${USERS[k].color};width:${s || 22}px;height:${s || 22}px;font-size:${Math.round((s || 22) * 0.4)}px">${initials(USERS[k].name)}</span>` : '';
  function libThumb(a) {
    const k = { Whitepaper: 'wp', Infographic: 'ig', Carousel: 'ca', 'PDF one-pager': 'pdf' }[a.type];
    const inner = k === 'wp' ? '<div class="lt-pg"><i class="lt-h"></i><i></i><i></i><i class="s"></i><i></i><i class="s"></i></div>'
      : k === 'ig' ? '<div class="lt-pg"><i class="lt-h"></i><div class="lt-bars"><b style="height:40%"></b><b style="height:72%"></b><b style="height:55%"></b><b style="height:90%"></b></div><i class="s"></i></div>'
      : k === 'ca' ? '<div class="lt-ca"><div class="lt-sl"></div><div class="lt-sl"></div><div class="lt-sl"><i class="lt-h"></i><i></i><i class="s"></i></div></div>'
      : '<div class="lt-pg"><div class="lt-band"></div><i></i><i class="s"></i><i></i></div>';
    const tt = a.t ? `<b class="lt-tt">${esc(a.t.length > 46 ? a.t.slice(0, 44) + '…' : a.t)}</b>` : '';
    return `<div class="lt th-${k}">${a.t ? inner.replace('<i class="lt-h"></i>', tt).replace('<div class="lt-band"></div>', '<div class="lt-band"></div>' + tt) : inner}</div>`;
  }
  const LIB_KEYS = [['Sort by', null], ['Industry', 'ind'], ['Segment', 'seg'], ['Persona', 'per'], ['Topic', 'topicK'], ['Asset type', 'type'], ['Format', 'fmt']];
  function libMenuHtml(all) {
    if (!libMenu) return '';
    const vals = k => k === 'topicK' ? ['Pain point', 'Initiative', 'Need'] : k === 'type' ? Object.keys(AST) : k === 'fmt' ? Object.keys(FMT) : [...new Set(all.map(a => a[k]))].sort();
    if (libMenu === 'root') return `<div class="lib-scrim" onclick="App.libMenu(null)"></div><div class="lib-menu" role="menu">${LIB_KEYS.map(([l, k], i) => `${i === 1 ? '<div class="lib-msep"></div>' : ''}<button class="lib-mi" onclick="App.libMenu('${k || 'sort'}')"><span>${l}</span><span class="lib-mv">${k ? esc(libF[k] || 'Any') : esc(libSort)} ›</span></button>`).join('')}${Object.values(libF).some(Boolean) ? '<div class="lib-msep"></div><button class="lib-mi" onclick="App.libClear()"><span>Clear filters</span></button>' : ''}</div>`;
    const k = libMenu, list = k === 'sort' ? ['Last updated', 'Top performing', 'Most used', 'Title A–Z'] : [''].concat(vals(k)), cur = k === 'sort' ? libSort : libF[k];
    return `<div class="lib-scrim" onclick="App.libMenu(null)"></div><div class="lib-menu" role="menu"><button class="lib-mi lib-mback" onclick="App.libMenu('root')">‹ ${k === 'sort' ? 'Sort by' : LIB_KEYS.find(x => x[1] === k)[0]}</button><div class="lib-msep"></div>${list.map(v => `<button class="lib-mi" onclick="App.libPick('${k}',${js(v)})"><span>${esc(v || 'Any')}</span>${cur === v ? '<span class="lib-mv">✓</span>' : ''}</button>`).join('')}</div>`;
  }
  function libView() {
    const all = libAll(), base = libSorted(all.filter(libPass)), vis = libTabK === 'All' ? base : libTabK === 'In outreach' ? base.filter(a => a.inC.length) : base.filter(a => a.st === libTabK), n = s => all.filter(a => a.st === s).length;
    const inUse = all.filter(a => a.inC.length).length;
    const chips = LIB_KEYS.filter(([l, k]) => k && libF[k]).map(([l, k]) => `<span class="lib-chip">${l}: ${esc(libF[k])}<button aria-label="Remove ${l} filter" onclick="App.libPick('${k}','')">✕</button></span>`).join('');
    const stPill = s => `<span class="lc-st st-${s.replace(/ /g, '').toLowerCase()}">${esc(s)}</span>`;
    const act = a => a.st === 'To approve' ? (isMgr ? `<button class="btn sm pri" onclick="event.stopPropagation();App.libApprove('${a.id}')">Approve</button>` : '<span class="sm muted">Waiting for Daniel</span>') : a.st === 'Under review' ? '<span class="sm muted">Checks 2 of 3</span>' : '';
    const open = a => `App.openAsset('${a.id}')`;
    const usage = (L, cap) => `<div class="lib-ut card"><div class="tbl-wrap"><table class="tbl lib-tbl"><thead><tr><th>Asset</th><th>Used in</th><th>Used by</th><th>Created</th><th>Status</th></tr></thead><tbody>${L.slice(0, cap || L.length).map(a => `<tr class="row-link" onclick="${open(a)}"><td><div class="lib-ua">${libThumb({ type: a.type })}<div><div class="nm">${esc(a.t)}</div><div class="sm muted">${esc(a.type)} · ${esc(a.per)}</div></div></div></td><td>${a.inC.length ? a.inC.map(c => `<span class="lib-use">${esc(c)}</span>`).join('') : '<span class="sm muted">Not used yet</span>'}</td><td>${a.usedBy.length ? `<span class="lib-stack">${a.usedBy.map(k => uAv(k, 22)).join('')}</span>` : '<span class="sm muted">–</span>'}</td><td><div class="lib-by">${uAv(UK[a.by], 22)}<div><div class="sm">${esc(a.by)}</div><div class="sm muted">${esc(a.created)}</div></div></div></td><td style="white-space:nowrap">${stPill(a.st)} ${act(a)}</td></tr>`).join('') || `<tr><td colspan="5" class="sm muted">No assets match.</td></tr>`}</tbody></table></div>${cap && L.length > cap ? `<button class="lib-more" onclick="App.libListView(true)">Show all ${L.length} as a list</button>` : ''}</div>`;
    const card = a => `<button class="lc" onclick="${open(a)}">${libThumb(a)}<div class="lc-b"><div class="lc-t">${esc(a.t)}</div><div class="lc-m">${esc(a.type)} · ${esc(a.ind)} · ${esc(a.at)}</div><div class="lc-tags"><span class="badge b-grey nodot">${esc(a.per)}</span><span class="badge ${a.topicK === 'Pain point' ? 'b-warn' : a.topicK === 'Initiative' ? 'b-sec' : 'b-ter'} nodot">${esc(a.topicK)}: ${esc(a.topic)}</span></div><div class="lc-f"><span class="lib-by">${uAv(UK[a.by], 20)}<span class="sm muted">${a.inC.length ? 'In ' + a.inC.length + (a.inC.length > 1 ? ' campaigns' : ' campaign') : 'Not used yet'}</span></span>${stPill(a.st)}</div></div></button>`;
    return `<div class="lib" id="lib">
      <div class="lib-top">
        <div class="lib-bar"><div class="lib-tabs">${['All', 'To approve', 'Under review', 'Completed', 'In outreach'].map(s => `<button class="${libTabK === s ? 'on' : ''}" onclick="App.libTab('${s}')">${s}</button>`).join('')}</div>
          <div class="lib-tools">${libSearch || libF.q ? `<div class="search lib-q">${ic('search', 14)}<input id="libQ" placeholder="Search assets" aria-label="Search assets" value="${esc(libF.q)}" oninput="App.libSet('q',this.value,true)"></div>` : `<button class="lib-ib" title="Search" aria-label="Search" onclick="App.libSearch()">${ic('search', 17)}</button>`}
            <span class="lib-mw"><button class="lib-ib ${libMenu || chips ? 'on' : ''}" title="Filter and sort" aria-label="Filter and sort" onclick="App.libMenu('${libMenu ? '' : 'root'}')"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg></button>${libMenuHtml(all)}</span>
            <button class="lib-ib ${libList ? 'on' : ''}" title="${libList ? 'Grid view' : 'List view'}" aria-label="Switch view" onclick="App.libListView(${!libList})"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg></button>
            <button class="lib-ib" title="Make something new" aria-label="Make something new" onclick="App.setStudioTab('write')">${ic('plus', 17)}</button></div></div>
        ${chips ? `<div class="lib-chips">${chips}</div>` : ''}
      </div>
      ${libList ? `<div class="lib-grid-h"><span class="lbl">Assets · ${vis.length}</span></div>${usage(vis)}` : `
      <div class="lib-grid-h"><span class="lbl">Assets · ${vis.length}</span><span class="sm muted">${libSort === 'Top performing' ? 'ranked by campaign response' : 'newest first'}</span></div><div class="lib-grid">${vis.map(card).join('') || '<div class="empty">No assets match these filters.</div>'}</div>
      <div class="lib-grid-h"><span class="lbl">Where assets are used</span><span class="sm muted">which campaign, who used it, who made it and when</span></div>${usage(vis)}`}
      <details class="lib-guide"><summary>Which format for which asset?</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Format</th><th>Channel type</th><th>Best for</th><th>Main metric</th>${Object.keys(AST).map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>${Object.keys(FMT).map(v => `<tr><td class="nm">${v}</td><td class="sm">${FMT[v][0]}</td><td class="sm">${FMT[v][1]}</td><td class="sm">${FMT[v][2]}</td>${Object.keys(AST).map(t => `<td class="sm">${COMBO[t][v] ? '✓ ' + COMBO[t][v] : '<span class="muted">–</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="sm muted" style="margin-top:6px">${Object.keys(AST).map(t => `<b>${t}</b>: ${AST[t][0]}, ${AST[t][1]}.`).join(' ')} Attach files in LinkedIn DMs; in cold email send a tracked link instead.</div></details></div>`;
  }
  function libHook() {
    if (S.studio.doc || view() !== 'studio') return;
    const cv = $('cv'); if (!cv) return;
    const keep = cv.scrollTop; cv.innerHTML = studioHome(); cv.scrollTop = keep;
  }
  /* Write: one asset-type pill; only the four asset types; prompts that fit the chosen type */
  const ST_PROMPTS = { 'Whitepaper': ['A whitepaper on turnaround readiness for refinery operations managers', 'A whitepaper on a phased historian migration for I&C leads', 'A whitepaper benchmarking LNG terminal reliability against peers'], 'Infographic': ['An infographic on where unplanned downtime really comes from, for reliability leaders', 'An infographic on staffing a control-system upgrade, for plant heads', 'An infographic with three peer reliability numbers for the monthly newsletter'], 'Carousel': ['A 6-slide carousel on switching at the end of a rival contract', 'A carousel on scoping expansion automation in 30 days', 'A carousel on what slow vendor support costs a plant'], 'PDF one-pager': ['A PDF one-pager: the 2027 emissions-reporting checklist for plant heads', 'A PDF one-pager on the cost of a delayed restart, for procurement', 'A PDF one-pager comparing extend vs switch for I&C leads'] };
  let stPillOpen = false;
  function stPill() {
    return `<span class="st-pw"><button class="st-pill pl-2" onclick="App.stPill()" aria-haspopup="menu" aria-expanded="${stPillOpen}"><span class="pl-ic">${ic('doc', 15)}</span><span class="pl2"><i>Format <span class="st-car">▾</span></i><b>${esc(studioType)}</b></span></button>${stPillOpen ? `<div class="lib-scrim" onclick="App.stPill()"></div><div class="lib-menu st-pm" role="menu">${Object.keys(AST).map(x => `<button class="lib-mi" onclick="App.setStudioType(${js(x)})"><span><b>${x}</b></span>${studioType === x ? '<span class="lib-mv">✓</span>' : ''}</button>`).join('')}</div>` : ''}</span>`;
  }
  /* ─── Open screens: one Claude-style box at the top of Leads, Campaigns and NBA, and Content studio ─── */
  const obVal = {}, obAtt = {};
  let obMenu = null, obPillK = null, obIcp = null;
  const OB_PLUS = {
    leads: [['Upload a list (CSV)', 'Scored and de-duplicated against the CRM', 'prospects-nov.csv'], ['Pull a CRM view', 'A saved view, kept in sync', 'CRM view: open pipeline, SEA'], ['Start from a website', 'Proposes an ICP from the site (path B)', 'Website: sea-refining.example'], ['Use my last 10 wins', 'Finds look-alikes of closed-won accounts', 'Last 10 wins']],
    out: [['Pick a micro-segment', 'Run it for one segment', 'Segment: Turnaround season 2027'], ['Upload a list', 'Event attendees, a partner list', 'event-attendees.csv'], ['Attach a library asset', 'Send approved content with it', 'Asset: A peer site cut unplanned trips by 18%'], ['Start from a play', 'Reuse a proven sequence', 'Play: Rival contract ending v2']],
    studio: [['Attach a file', 'PDF, Word or slides to draw from', 'site-visit-notes.pdf'], ['Add from the Knowledge Hub', 'Approved sources and claims', 'Knowledge Hub: CS-01, OP-02'], ['Reference a library asset', 'Reuse its structure or numbers', 'Asset: A peer site cut unplanned trips by 18%'], ['Brand voice and claims', 'What it must and must not say', 'Brand voice v3']]
  };
  const OB_SAMPLE = { ob_leads: 'Refineries in Thailand and Malaysia with a new reliability leader in the last 30 days', ob_out: 'A campaign for sites whose rival contract ends in the next 6 months, to book meetings' };
  /* The + menu: grouped like Claude; "Reference an asset" and "Knowledge Hub" open a picker */
  const HUB = [['SharePoint', 'Sales enablement site', '128 documents', 1], ['Google Drive', 'Marketing shared drive', '64 documents', 1], ['Confluence', 'Product and solutions wiki', '41 pages', 1], ['Company website', 'vantera.example, synced daily', '212 pages', 1], ['Approved claims', 'Managed by Rajiv (admin)', '42 claims', 1], ['Case studies', 'Approved for external use', '9 studies', 1], ['Notion', 'Not connected', 'Ask your admin', 0], ['Box', 'Not connected', 'Ask your admin', 0]];
  const OB_MENU = {
    studio: [['Files', [['clip', 'Attach a file', { att: 'site-visit-notes.pdf' }], ['folder', 'Attach a folder', { att: 'Folder: Q4 field notes (6 files)' }]]], ['Library', [['book', 'Reference an asset', { sub: 'asset' }]]], ['Knowledge Hub', [['plug', 'Add from the Knowledge Hub', { sub: 'hub' }]]]],
    out: [['Files', [['clip', 'Upload a list', { att: 'event-attendees.csv' }]]], ['Audience', [['layers', 'Pick a micro-segment', { sub: 'seg' }]]], ['Library', [['book', 'Attach an asset', { sub: 'asset' }], ['megaphone', 'Start from a play', { sub: 'play' }]]]],
    leads: [['Files', [['clip', 'Upload a list (CSV)', { att: 'prospects-nov.csv' }]]]]
  };
  function obMenuHtml(k) {
    const [mk, sub] = (obMenu || '').split(':'); if (mk !== k) return '';
    const head = `<div class="lib-scrim" onclick="App.obMenu(null)"></div><div class="lib-menu ob-pm" role="menu">`, att = obAtt[k] || [];
    const tick = lab => att.includes(lab) ? `<span class="lib-mv">${ic('check', 14)}</span>` : '';
    const back = l => `<button class="lib-mi lib-mback" onclick="App.obMenu('${k}')">‹ ${l}</button><div class="lib-msep"></div>`;
    const manage = `<div class="lib-msep"></div><button class="lib-mi ob-mi" onclick="App.obMenu(null);App.toast('Connectors are set up by your admin in Admin › Connections')"><span class="ob-mi-l">${ic('plug', 15)} Manage connectors</span></button>`;
    if (!sub) return head + OB_MENU[k].map(([h, items], i) => `${i ? '<div class="lib-msep"></div>' : ''}<div class="ob-mh">${h}</div>${items.map(([icn, l, a], j) => `<button class="lib-mi ob-mi" onclick="App.obAct('${k}',${i},${j})"><span class="ob-mi-l">${ic(icn, 15)} ${l}</span>${a.sub ? '<span class="lib-mv">›</span>' : ''}</button>`).join('')}`).join('') + (k === 'studio' ? manage : '') + '</div>';
    if (sub === 'asset') return head + back(k === 'out' ? 'Attach an asset' : 'Reference an asset') + `<div class="ob-note">${k === 'out' ? 'It goes out with the campaign or action.' : 'The new asset reuses its structure, numbers and sources.'} Only approved assets are listed.</div>` + libAll().filter(a => a.st === 'Completed').map(a => { const lab = 'Asset: ' + a.t; return `<button class="lib-mi ob-mi" onclick="App.obPick('${k}',${js(lab)})"><span class="ob-mi-l">${libThumb({ type: a.type })}<span class="ob-mt"><b>${esc(a.t)}</b><span>${esc(a.type)} · ${esc(a.metric)}</span></span></span>${tick(lab)}</button>`; }).join('') + '</div>';
    if (sub === 'hub') return head + back('Knowledge Hub') + `<div class="ob-note">Pick the sources it may draw on. Brand voice and approved claims always apply.</div>` + HUB.map(h => { const lab = 'Knowledge Hub: ' + h[0]; return h[3] ? `<button class="lib-mi ob-mi" onclick="App.obPick('${k}',${js(lab)})"><span class="ob-mi-l"><span class="ob-cn">${esc(h[0][0])}</span><span class="ob-mt"><b>${esc(h[0])}</b><span>${esc(h[1])} · ${esc(h[2])}</span></span></span>${tick(lab) || '<span class="ob-ok">Connected</span>'}</button>` : `<div class="lib-mi ob-mi ob-off"><span class="ob-mi-l"><span class="ob-cn">${esc(h[0][0])}</span><span class="ob-mt"><b>${esc(h[0])}</b><span>${esc(h[1])}</span></span></span><span class="sm muted">${esc(h[2])}</span></div>`; }).join('') + manage + '</div>';
    if (sub === 'seg') return head + back('Pick a micro-segment') + SEGMENTS.map(s => { const lab = 'Segment: ' + s.name; return `<button class="lib-mi ob-mi" onclick="App.obPick('${k}',${js(lab)})"><span class="ob-mt"><b>${esc(s.name)}</b><span>${segStats(s).total} accounts · ${esc(s.trigger)}</span></span>${tick(lab)}</button>`; }).join('') + '</div>';
    if (sub === 'play') return head + back('Start from a play') + ['Turnaround announced · v3', 'New reliability leader · v5', 'Rival contract ending · v2'].map(pl => { const lab = 'Play: ' + pl; return `<button class="lib-mi ob-mi" onclick="App.obPick('${k}',${js(lab)})"><span>${esc(pl)}</span>${tick(lab)}</button>`; }).join('') + '</div>';
    return '';
  }
  function obBox(k, o) {
    const id = o.id || 'ob_' + k, att = obAtt[k] || [];
    return `<div class="ob" id="obWrap_${k}"><h1 class="ob-h">${o.h}</h1><div class="ob-box">
      ${att.length ? `<div class="ob-att">${att.map((a, i) => `<span class="lib-chip">${ic('doc', 12)} ${esc(a)}<button aria-label="Remove ${esc(a)}" onclick="App.obRm('${k}',${i})">✕</button></span>`).join('')}</div>` : ''}
      <label class="sr" for="${id}">${esc(o.label || 'Describe it')}</label><textarea id="${id}" rows="2" placeholder="${esc(o.ph)}" oninput="App.obIn('${k}',this.value)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();${o.send}}">${esc(obVal[k] || '')}</textarea>
      <div class="ob-f"><span class="st-pw"><button class="ob-plus ${(obMenu || '').split(':')[0] === k ? 'on' : ''}" title="Add files and sources" aria-label="Add files and sources" aria-haspopup="menu" onclick="App.obMenu('${(obMenu || '').split(':')[0] === k ? '' : k}')">${ic((obMenu || '').split(':')[0] === k ? 'x' : 'plus', 16)}</button>${obMenuHtml(k)}</span>
        ${o.pills || ''}<span style="flex:1"></span>
        <button class="ic-btn mic" id="${id}Mic" title="Talk: say it, then press send" onclick="App.dictate('${id}')">${ic('mic', 16)}</button><button class="send" onclick="${o.send}" title="Send">${ic('send', 16)}</button></div></div>${o.below || ''}</div>`;
  }
  const obText = k => { const v = (obVal[k] || '').trim(), a = obAtt[k] || []; return v + (a.length ? ` (using ${a.join(', ')})` : ''); };
  const pillMenu = (k, label, icn, body, cap) => `<span class="st-pw"><button class="st-pill ${cap ? 'pl-2' : ''}" onclick="App.obPill('${k}')" aria-haspopup="menu" aria-expanded="${obPillK === k}">${cap ? `<span class="pl-ic">${ic(icn, 15)}</span><span class="pl2"><i>${cap} <span class="st-car">▾</span></i><b>${label}</b></span>` : `${ic(icn, 13)} ${label} <span class="st-car">▾</span>`}</button>${obPillK === k ? `<div class="lib-scrim" onclick="App.obPill(null)"></div>${body}` : ''}</span>`;

  /* Leads: the open box, then Leads, Signals and Segments */
  function leadsTop() {
    const cur = obIcp ? shared.icps.find(x => x.v === obIcp) || icpNow() : icpNow();
    const pill = pillMenu('icp', `ICP v${cur.v}`, 'users', `<div class="lib-menu st-pm ob-wide" role="menu"><div class="ob-mh">ICP library · ${shared.icps.length} versions</div>${shared.icps.slice().reverse().map(x => `<button class="lib-mi" onclick="App.icpPick(${x.v})"><span class="ob-mt"><b>Version ${x.v}${x.status === 'In use' ? ' · in use' : ''}</b><span>${esc(x.crit.slice(0, 3).join(' · '))}</span></span>${cur.v === x.v ? '<span class="lib-mv">✓</span>' : ''}</button>`).join('')}<div class="lib-msep"></div><button class="lib-mi" onclick="App.obPill(null);App.ask('Update our ICP')"><span>Change the ICP in the chat</span></button></div>`);
    const sugg = `<div class="st-sugg">${['Find prospects like my last 10 wins', 'Score this list', 'Create micro-segments'].map(s => `<button class="chip" onclick="App.ask(${js(s)})">${esc(s)}</button>`).join('')}</div>`;
    const v = view(), on = k => k === 'signals' ? v === 'accounts' && accSub === 'signals' : k === 'segments' ? v === 'segments' : v === 'accounts' && accSub !== 'signals';
    return `<div class="dtabs ob-tabs">${[['accounts', 'Leads'], ['signals', 'Signals']].map(([k, l]) => `<button class="${on(k) ? 'on' : ''}" onclick="App.modTab('${k}')">${l}</button>`).join('')}</div>`;
  }
  /* ICP interview: asks, or drafts from a web page, then saves the ICP and finds the leads */
  let icpQ = null;
  const ICQ = { sell: ['Control-system migration', 'Reliability and asset-health services', 'Instrumentation and analysers', 'Emissions monitoring'], ind: ['Refining', 'Petrochemicals', 'Gas processing', 'LNG', 'Power'], geo: ['Singapore', 'Malaysia', 'Thailand', 'Indonesia', 'Vietnam', 'Philippines'], size: ['300+ staff', '1,000–5,000 staff', '5,000+ staff'], roles: ['Plant head', 'Reliability leader', 'Operations manager', 'Technical lead (I&C)', 'Procurement'], sig: ['New leader', 'Turnaround announced', 'Rival contract ending', 'Expansion approved', 'Hiring surge', 'Pricing-page visit'], excl: ['Existing customers (CRM)', 'Accounts with an open deal', 'Competitors and partners', 'Sites under 300 staff'] };
  const ICRE = { 'Control-system migration': /migrat|control system|dcs/, 'Reliability and asset-health services': /reliab.*service|asset.health/, 'Instrumentation and analysers': /instrument|analy[sz]er/, 'Emissions monitoring': /emission/, Refining: /refin/, Petrochemicals: /petro|chemical/, 'Gas processing': /\bgas\b/, LNG: /\blng\b/, Power: /power|utilit/, Singapore: /singapore/, Malaysia: /malaysia|kuala/, Thailand: /thailand|bangkok/, Indonesia: /indonesia|jakarta/, Vietnam: /vietnam/, Philippines: /philippines|manila/, 'Plant head': /plant (head|manager)/, 'Reliability leader': /reliab/, 'Operations manager': /operat/, 'Technical lead (I&C)': /technical|i&c|instrument/, Procurement: /procure|purchas/, 'New leader': /new (leader|hire|head)|joined/, 'Turnaround announced': /turnaround|shutdown/, 'Rival contract ending': /rival|contract end/, 'Expansion approved': /expansion|capex/, 'Hiring surge': /hiring/, 'Pricing-page visit': /pricing/ };
  const ICX = ['Existing customers (CRM)', 'Accounts with an open deal', 'Competitors and partners'];
  function icpStart(text, url) {
    const tl = text.toLowerCase(), pick = k => ICQ[k].filter(o => ICRE[o] && ICRE[o].test(tl)), one = k => pick(k)[0] || '';
    QSTEP.icq = 0; qdActive = 'icq'; qdFresh.icq = true; icpQ = { path: url ? 'B' : 'A', url, a: url ? { sell: 'Control-system migration', ind: ['Refining', 'Petrochemicals'], geo: ['Singapore', 'Malaysia', 'Thailand'], size: '1,000–5,000 staff', roles: ['Reliability leader', 'Operations manager'], sig: ['Rival contract ending', 'Turnaround announced'], excl: ICX.slice(), note: '' }
      : { sell: one('sell'), ind: pick('ind'), geo: pick('geo'), size: /5,?000\+/.test(tl) ? '5,000+ staff' : /1,?000/.test(tl) ? '1,000–5,000 staff' : '', roles: pick('roles'), sig: pick('sig'), excl: ICX.slice(), note: '' } };
  }
  function icpQCard() {
    const q = icpQ, a = q.a, need = a.ind.length && a.geo.length && a.roles.length;
    const Q = [['sell', 'What do you sell, and what problem does it solve?', ICQ.sell], ['ind', 'Which industries?', ICQ.ind, 1], ['geo', 'Where?', ICQ.geo, 1], ['roles', 'Who buys, and who signs?', ICQ.roles, 1], ['sig', 'Which signals mean they are ready now?', ICQ.sig, 1]];
    return `<div class="oq card icq"><div class="oq-h"><span class="ai-mark">${ic('spark', 13)}</span><div><b>${q.path === 'B' ? `ICP drafted from ${esc(q.url)}` : 'ICP interview'}</b><div class="sm muted">${q.path === 'B' ? 'I read the page: what you sell, the industries in its case studies and the roles it speaks to. Check the draft and change anything; then I will save it and find the leads.' : 'Five questions; answer what you can, or type your own answer. Existing customers, accounts with an open deal, and competitors are always left out. You can also paste your website or a product page and I will draft it for you.'}</div></div></div>
      ${Q.map(([k, l, opts, multi], i) => `<div class="oq-q" data-k="${k}" data-multi="${multi ? 1 : 0}"><div class="oq-l"><span>${i + 1}</span>${esc(l)}${multi ? ' <i>pick any</i>' : ''}</div><div class="oq-o">${withCustom(opts, a[k]).map(o => { const on = multi ? a[k].includes(o) : a[k] === o; return `<button class="chip ${on ? 'on' : ''}" aria-pressed="${on}" onclick="App.icpAns('${k}',${js(o)},${multi ? 1 : 0})">${esc(o)}</button>`; }).join('')}</div></div>`).join('')}
      <div class="oq-f"><button class="btn sm ghost" onclick="App.icpCancel()">Cancel</button><span class="sm muted">${need ? `Ready: I will save it as ICP v${shared.icps.length + 1} and find the leads` : 'Pick the industries, where, and who buys to go on'}</span><button class="btn sm pri" ${need ? '' : 'disabled'} onclick="App.icpBuild()">${ic('search', 13)} Save the ICP and find leads</button></div></div>`;
  }
  function leadsHook() { if (segSel) return; const cv = $('cv'); if (cv && !cv.querySelector('.ob')) cv.insertAdjacentHTML('afterbegin', leadsTop()); }

  /* Campaigns and NBA: three status cards, the open box with clarifying questions, then every campaign and action */
  let campPrev = null, corpSel = null, campCoh = 'all';
  let outTab = 'All', outMenu = null, outSort = 'Most recent', outSearch = false, outList = true, outKind = 'NBC', outQ = null, outSel = null;
  const outF = { kind: '', ch: '', seg: '', q: '' };
  const OUT_KEYS = [['Type', 'kind'], ['Channel', 'ch'], ['Segment', 'seg'], ['Sort by', '']];
  /* Stage of a campaign or action, shown at the top of its card and its page */
  function stageOf(x) {
    if (x.kind === 'NBC' && x.camp) { const c = x.camp, i = c.status === 'Completed' ? 3 : c.status === 'Running' ? 2 : S.camp[c.id] === 'Confirmed' ? 1 : 0; return { L: ['Drafted', 'Confirmed', 'Running', 'Completed'], i, note: c.status === 'Running' || c.status === 'Completed' ? campStatus(c) === c.status ? seqSpan(c) : campStatus(c) : i === 1 ? 'Starts in the next send window' : c.status === 'Draft' ? 'Draft, not sent for confirmation' : 'Waiting for the manager to confirm' }; }
    if (x.kind === 'NBA' && x.acc) { const tr = track(x.acc), i = tr.stage >= 4 ? 3 : tr.stage >= 1 ? 2 : tr.how === 'Ready to send' ? 1 : 0; return { L: ['Prepared', 'Approved', 'Sent', 'Replied'], i, note: tr.label }; }
    const i = x.b === 'In outreach' ? 2 : x.b === 'Approved' ? 1 : 0; return { L: ['Built', 'Approved', 'In outreach', 'Done'], i, note: x.res };
  }
  const stageBar = (s, big) => `<div class="stg-bar ${big ? 'big' : ''}"><div class="stg-steps">${s.L.map((l, k) => `<span class="${k < s.i ? 'done' : k === s.i ? 'now' : ''}"><i></i>${l}</span>`).join('')}</div>${s.note ? `<div class="stg-note">${esc(s.note)}</div>` : ''}</div>`;
  /* How many messages are out; if none yet, where it stands */
  function campDeliv(c) {
    const sq = seqOf(c), st = campStats(c), steps = sq.length, sentSteps = c.status === 'Completed' ? steps : sq.filter(sent).length, total = st.total * steps, out = st.total * sentSteps, nextI = c.status === 'Completed' ? -1 : sq.findIndex(x => !sent(x)), nx = sq[nextI];
    const txt = c.status === 'Completed' ? `Finished · all ${steps} steps sent` : c.status === 'Running' ? (nx ? `Step ${nextI + 1} of ${steps} goes next: ${nx.ch} on day ${nx.day}` : 'All steps sent · waiting for replies') : S.camp[c.id] === 'Confirmed' ? 'Confirmed · the first message goes in the next send window' : campStatus(c) === 'Fell back to next best actions' ? 'Not confirmed in 3 days · back to next best actions' : c.status === 'Draft' && !S.camp[c.id] ? 'Draft · not sent for confirmation yet' : `Waiting for ${isMgr ? 'you' : first(USERS.pavan.name)} to confirm`;
    return { out, total, nextI, txt, sentSteps, steps };
  }
  const omBar = (n, d) => `<div class="om-bar"><i style="width:${Math.max(3, Math.round(n / Math.max(1, d) * 100))}%"></i></div>`;
  function outMeter(x) {
    if (x.kind === 'NBC' && x.camp) { const d = campDeliv(x.camp); return d.out ? `<div class="om"><div class="om-t"><b>${d.out}</b> of ${d.total} messages sent</div>${omBar(d.out, d.total)}<div class="om-s">${esc(d.txt)}</div></div>` : `<div class="om none"><div class="om-t"><b>Not sent yet</b></div><div class="om-s">${esc(d.txt)}</div></div>`; }
    if (x.kind === 'NBA' && x.acc) { const tr = track(x.acc); return tr.stage >= 1 ? `<div class="om"><div class="om-t"><b>Sent</b> · ${esc(tr.label)}</div>${omBar(1, 1)}<div class="om-s">${esc(tr.how)}${tr.when ? ' · ' + esc(tr.when) : ''}</div></div>` : `<div class="om none"><div class="om-t"><b>Not sent yet</b></div><div class="om-s">${esc(tr.label)}</div></div>`; }
    return `<div class="om none"><div class="om-t"><b>Not sent yet</b></div><div class="om-s">${esc(x.b === 'Approved' ? 'Approved · goes in the next send window' : x.b === 'In outreach' ? 'Sending in the next window' : 'Built · waiting for approval')}</div></div>`;
  }
  function outItems() {
    const G = (S.outGen || []).map(g => ({ id: g.id, kind: g.kind, name: g.name, sub: `Generated ${g.at} · ${g.obj}`, b: g.b, ch: g.ch, seg: g.seg || '', who: g.who, res: g.b === 'In outreach' ? 'Sending in the next window' : 'Not sent yet', open: `App.outOpen('${g.id}')`, rate: 0 }));
    const C = CAMPAIGNS.map(c => { const st = campStats(c), conf = S.camp[c.id] === 'Confirmed'; return { id: c.id, kind: 'NBC', name: c.name, sub: `${seqSpan(c)} · ${c.seg ? segOf(c.seg).trigger : 'archived segment'}`, b: c.status === 'Running' ? 'In outreach' : c.status === 'Completed' ? 'Completed' : conf ? 'Approved' : 'Under review', ch: [...new Set((c.touches || []).map(t => t.ch))], seg: c.seg ? segOf(c.seg).name : '', who: `${st.total} enrolled`, res: `${pct(st.replies, st.started)} replied · ${st.positive || 0} positive`, open: `App.goCampaign('${c.id}')`, rate: st.started ? st.replies / st.started : 0, camp: c }; });
    const N = nbaRows().map(a => { const t = track(a), sg = segOf(a.seg); return { id: a.id, kind: 'NBA', name: a.nba.action, sub: `${a.contact.name} · ${a.name}`, b: t.stage >= 1 ? 'In outreach' : t.how === 'Ready to send' ? 'Approved' : /Expired|Skipped|Sent back/.test(t.how) ? 'Completed' : 'Under review', ch: [a.nba.channel], seg: sg ? sg.name : '', who: a.contact.name, res: t.label, open: `App.openRecord('${a.id}','engage')`, rate: t.stage / 4, acc: a }; });
    return G.concat(C, N);
  }
  const outPass = x => (!outF.kind || x.kind === outF.kind) && (!outF.ch || x.ch.includes(outF.ch)) && (!outF.seg || x.seg === outF.seg) && (!outF.q || (x.name + ' ' + x.sub + ' ' + x.seg).toLowerCase().includes(outF.q.toLowerCase()));
  const outSorted = L => outSort === 'Reply rate' ? L.slice().sort((p, q) => q.rate - p.rate) : outSort === 'Name A–Z' ? L.slice().sort((p, q) => p.name.localeCompare(q.name)) : L;
  function outMenuHtml(all) {
    if (!outMenu) return '';
    if (outMenu === 'root') return `<div class="lib-scrim" onclick="App.outMenu(null)"></div><div class="lib-menu" role="menu">${OUT_KEYS.map(([l, k], i) => `${i === 3 ? '<div class="lib-msep"></div>' : ''}<button class="lib-mi" onclick="App.outMenu('${k || 'sort'}')"><span>${l}</span><span class="lib-mv">${k ? esc(outF[k] || 'Any') : esc(outSort)} ›</span></button>`).join('')}</div>`;
    const k = outMenu, list = k === 'sort' ? ['Most recent', 'Reply rate', 'Name A–Z'] : [''].concat(k === 'kind' ? ['NBC', 'NBA'] : [...new Set(all.flatMap(x => k === 'ch' ? x.ch : [x.seg]).filter(Boolean))].sort()), cur = k === 'sort' ? outSort : outF[k];
    return `<div class="lib-scrim" onclick="App.outMenu(null)"></div><div class="lib-menu" role="menu"><button class="lib-mi lib-mback" onclick="App.outMenu('root')">‹ ${k === 'sort' ? 'Sort by' : OUT_KEYS.find(x => x[1] === k)[0]}</button><div class="lib-msep"></div>${list.map(v => `<button class="lib-mi" onclick="App.outPick('${k}',${js(v)})"><span>${v ? esc(k === 'kind' ? (v === 'NBC' ? 'Campaign (NBC)' : 'Next best action (NBA)') : v) : 'Any'}</span>${cur === v ? '<span class="lib-mv">✓</span>' : ''}</button>`).join('')}</div>`;
  }
  const accOfWho = w => w ? nbaRows().find(x => w.startsWith(x.contact.name)) : null;
  const sigOpts = acc => acc ? acc.signals.slice().sort((p, q) => q.weight - p.weight).slice(0, 3).map(s => `${s.type} · ${ago(s.age)}`) : [];
  /* Content: the AI recommends one approved asset and says why; you can switch */
  const CS_TYPE = { 'Peer numbers at a glance': ['Infographic'], 'A checklist they can forward': ['Carousel', 'PDF one-pager'], 'Deep technical proof': ['Whitepaper'] };
  function recContent(kind, a) {
    a = a || {};
    const ch = kind === 'NBC' ? ((a.ch || [])[0] || 'Email') : (a.ch || 'Email'), chK = /linkedin/i.test(ch) ? 'LinkedIn DM' : 'Outbound email', obj = a.obj || '';
    const want = a.cs ? CS_TYPE[a.cs] : /switch|contract/i.test(obj) ? ['PDF one-pager', 'Whitepaper'] : /stall|silence|re-engage/i.test(obj) ? ['Whitepaper', 'Infographic'] : /event|webinar/i.test(obj) ? ['Carousel'] : /leader/i.test(obj) ? ['Infographic'] : ['Infographic', 'PDF one-pager'];
    const acc = kind === 'NBA' ? accOfWho(a.who) : null, seg = kind === 'NBC' ? (Array.isArray(a.seg) ? a.seg[0] : a.seg) : acc && segOf(acc.seg) ? segOf(acc.seg).name : '';
    const L = libAll().filter(x => x.st === 'Completed').map(x => ({ x, s: (want.includes(x.type) ? 4 : 0) + (seg && x.seg === seg ? 3 : 0) + (COMBO[x.type] && COMBO[x.type][chK] ? 1 : 0) + libPerf(x) / 20 })).sort((p, q) => q.s - p.s);
    const b = L[0].x, combo = COMBO[b.type] && COMBO[b.type][chK];
    const why = `${b.type}${combo ? ` works as the ${combo} in ${chK === 'LinkedIn DM' ? 'a LinkedIn message' : 'an email'}` : ''}; ${b.metric && b.metric !== '–' ? `it got ${b.metric}` : 'it is approved and not used yet'}${seg && b.seg === seg ? ` in ${seg}` : ''}${want.includes(b.type) && (a.cs || obj) ? `, and ${a.cs ? 'it is the kind of proof you asked for' : `it suits "${obj.toLowerCase()}"`}` : ''}.`;
    return { best: b, alts: L.slice(1, 3).map(y => y.x), why };
  }
  function oqOpts(k, opts, multi, a) {
    if (k === 'seq') return `<div class="oq-plans">${opts.map(o => { const on = a.seq === o, st = outSteps({ kind: 'NBC', seq: o, ch: a.ch && a.ch.length ? a.ch : ['Email'], ct: '' }); return `<button class="oq-plan ${on ? 'on' : ''}" aria-pressed="${on}" onclick="App.outAns('seq',${js(o)},0)"><b>${esc(o)}</b>${st.map(s => `<span>${chIc(s.ch)} Day ${s.day} · ${esc(s.step)}</span>`).join('')}</button>`; }).join('')}</div>`;
    if (k === 'ct') { const r = recContent(outQ.kind, a); return `<div class="oq-rec"><div class="oq-rec-h">${libThumb({ type: r.best.type })}<div class="oq-rec-t"><span class="badge b-brand nodot">${ic('spark', 11)} Recommended</span><b>${assetLink(r.best)}</b><span>${esc(r.why)}</span></div>${a.ct === r.best.t ? `<span class="lib-mv">${ic('check', 15)}</span>` : `<button class="btn sm" onclick="App.outAns('ct',${js(r.best.t)},0)">Use this</button>`}</div><div class="oq-o">${a.ct && !libAll().some(x => x.t === a.ct) ? `<button class="chip on" aria-pressed="true">${esc(a.ct)}</button>` : ''}<span class="sm muted">Or use</span>${r.alts.map(x => `<button class="chip ${a.ct === x.t ? 'on' : ''}" aria-pressed="${a.ct === x.t}" onclick="App.outAns('ct',${js(x.t)},0)">${esc(x.t)} · ${esc(x.type)}</button>`).join('')}</div></div>`; }
    return `<div class="oq-o">${!opts.length ? '<span class="sm muted">Pick the person first; their strongest signals show here.</span>' : ''}${withCustom(opts, a[k]).map(o => { const on = multi ? (a[k] || []).includes(o) : a[k] === o; return `<button class="chip ${on ? 'on' : ''}" aria-pressed="${on}" onclick="App.outAns('${k}',${js(o)},${multi ? 1 : 0})">${esc(o)}</button>`; }).join('')}</div>`;
  }
  const withCustom = (opts, cur) => opts.concat((Array.isArray(cur) ? cur : cur ? [cur] : []).filter(v => v && !opts.includes(v)));
  const OQ = {
    NBC: () => [['obj', 'What is the objective?', ['Book meetings', 'Win the switch at contract end', 'Re-open stalled deals', 'Event or webinar sign-ups']], ['seg', 'Which cohorts? Each micro-segment you pick joins the campaign', SEGMENTS.slice(0, 6).map(s => s.name), true], ['ch', 'Which channels?', ['Email', 'LinkedIn', 'Phone', 'Direct mail'], true], ['seq', 'How many steps, and when?', ['3 touches over 10 days', '5 touches over 3 weeks', '7 touches over 6 weeks']], ['ct', 'Content: what the AI recommends, and why', (r => [r.best.t].concat(r.alts.map(x => x.t)))(recContent('NBC', outQ ? outQ.a : {}))]],
    NBA: () => [['obj', 'What should this action achieve?', ['Book a meeting', 'Get a reply', 'Re-engage after silence', 'Introduce us to a new leader']], ['who', 'Who is it for?', nbaRows().sort((p, q) => q.score - p.score).slice(0, 5).map(a => `${a.contact.name} · ${a.name}`)], ['sig', 'Which signal should it lead with?', sigOpts(accOfWho(outQ && outQ.a.who))], ['ch', 'Which channel?', ['Email', 'LinkedIn', 'Phone call']], ['ct', 'Content: what the AI recommends, and why', (r => [r.best.t].concat(r.alts.map(x => x.t)))(recContent('NBA', outQ ? outQ.a : {}))]]
  };
  function outGuess(kind, v) {
    const t = v.toLowerCase(), a = {}, Q = OQ[kind]();
    a.obj = /meeting/.test(t) ? Q[0][2][0] : /switch|rival|contract/.test(t) && kind === 'NBC' ? Q[0][2][1] : /reply|answer/.test(t) && kind === 'NBA' ? Q[0][2][1] : /stall|silen|re-?engage/.test(t) ? Q[0][2][kind === 'NBC' ? 2 : 2] : /event|webinar/.test(t) && kind === 'NBC' ? Q[0][2][3] : /leader|intro/.test(t) && kind === 'NBA' ? Q[0][2][3] : '';
    const opts = Q[1][2], hit = opts.find(o => o.toLowerCase().split(/[ ·&]+/).filter(w => w.length > 4).some(w => t.includes(w)));
    a[Q[1][0]] = hit || (kind === 'NBA' ? (Q[1][2].find(o => o.toLowerCase().split(/[ ·]+/).some(w => w.length > 2 && new RegExp('\\b' + w + '\\b').test(t))) || '') : '');
    a.ch = kind === 'NBC' ? ['Email', 'LinkedIn', 'Phone'].filter(c => t.includes(c.toLowerCase())) : (/linkedin/.test(t) ? 'LinkedIn' : /call|phone/.test(t) ? 'Phone call' : /email/.test(t) ? 'Email' : '');
    return a;
  }
  function outClarify() {
    if (!outQ) return '';
    const Q = OQ[outQ.kind](), a = outQ.a, need = Q.filter(q => !q[3]).slice(0, 2).every(q => a[q[0]]) && (outQ.kind === 'NBA' || (a.ch || []).length);
    const read = Object.keys(outQ.pre).filter(k => outQ.pre[k] && (Array.isArray(outQ.pre[k]) ? outQ.pre[k].length : true));
    return `<div class="oq card"><div class="oq-h"><span class="ai-mark">${ic('spark', 13)}</span><div><b>A few questions before I build the ${outQ.kind === 'NBC' ? 'campaign' : 'next best action'}</b><div class="sm muted">${read.length ? `From your brief I already have: ${read.map(k => esc(Array.isArray(outQ.pre[k]) ? outQ.pre[k].join(', ') : outQ.pre[k])).join(' · ')}. Change anything below.` : 'Five questions at most. Pick an answer, or type your own under the options.'}</div></div></div>
      ${Q.map(([k, l, opts, multi], i) => `<div class="oq-q" data-k="${k}" data-multi="${multi ? 1 : 0}"><div class="oq-l"><span>${i + 1}</span>${esc(l)}${multi ? ' <i>pick any</i>' : ''}</div>${oqOpts(k, opts, multi, a)}</div>`).join('')}
      <div class="oq-msg">${ic('spark', 13)}<span><b>The AI decides the rest:</b> the message, written for each person from their signal and profile; ${outQ.kind === 'NBC' ? 'who in each account to reach; ' : 'sending in the next window; '}and it stops for a person on any reply or if an open deal appears. Once it is built you can change any of it${outQ.kind === 'NBC' ? ' once for the whole campaign' : ''}.</span></div>
      <div class="oq-f"><button class="btn sm ghost" onclick="App.outCancel()">Cancel</button><span class="sm muted">${need ? 'Ready to build' : `Answer ${outQ.kind === 'NBC' ? 'the objective, audience and channels' : 'the objective and the person'} to build it`}</span><button class="btn sm pri" ${need ? '' : 'disabled'} onclick="App.outBuild()">${ic('spark', 13)} Build the ${outQ.kind === 'NBC' ? 'campaign' : 'action'}</button></div></div>`;
  }
  function outTop(all) {
    const n = b => all.filter(x => x.b === b), card = (b, d) => { const L = n(b); return `<button class="lib-k ${outTab === b ? 'on' : ''}" onclick="App.outTab('${outTab === b ? 'All' : b}')"><span class="lib-kn">${L.length}</span><span class="lib-kl">${b}</span><span class="lib-ks">${L.filter(x => x.kind === 'NBC').length} campaigns · ${L.filter(x => x.kind === 'NBA').length} actions · ${d}</span></button>`; };
    const pill = pillMenu('kind', outKind === 'NBC' ? 'Campaign · NBC' : 'Next best action · NBA', outKind === 'NBC' ? 'megaphone' : 'bolt', `<div class="lib-menu st-pm ob-wide" role="menu">${[['NBC', 'Campaign · NBC', 'One sequence for a whole micro-segment; the manager confirms it'], ['NBA', 'Next best action · NBA', 'One account, one action, on the right channel']].map(([k, l, d]) => `<button class="lib-mi" onclick="App.outKind('${k}')"><span class="ob-mt"><b>${l}</b><span>${d}</span></span>${outKind === k ? '<span class="lib-mv">✓</span>' : ''}</button>`).join('')}</div>`, 'Type');
    const sugg = outQ ? '' : `<div class="st-sugg">${(outKind === 'NBC' ? ['A campaign for sites whose rival contract ends soon, to book meetings', 'Invite turnaround-season accounts to the reliability webinar', 'Re-open stalled deals in gas processing'] : ['A LinkedIn note to Mei Tan about the comparison she opened', 'Get a reply from the new reliability leader at Juniper', 'Re-engage Kingfisher after 3 weeks of silence']).map(s => `<button class="chip" onclick="App.outStart(${js(s)})">${esc(s)}</button>`).join('')}</div>`;
    return `<div class="lib-kpis ob-cards3">${card('Under review', 'waiting for a person')}${card('Approved', 'go in the next send window')}${card('In outreach', 'live and being tracked')}</div>`
      + obBox('out', { h: 'What should we run?', label: 'Describe the campaign or action', ph: outKind === 'NBC' ? 'Describe the campaign: objective, who it is for, channels, how long' : 'Describe the action: who, what it should achieve, which channel', pills: pill, send: "App.obSend('out')", below: outClarify() + sugg });
  }
  function outView() {
    const all = outItems(), base = outSorted(all.filter(outPass)), vis = outTab === 'All' ? base : base.filter(x => x.b === outTab);
    const chips = OUT_KEYS.filter(([l, k]) => k && outF[k]).map(([l, k]) => `<span class="lib-chip">${l}: ${esc(outF[k])}<button aria-label="Remove ${l} filter" onclick="App.outPick('${k}','')">✕</button></span>`).join('');
    const bPill = b => `<span class="lc-st st-${b.replace(/ /g, '').toLowerCase()}">${esc(b)}</span>`, kB = x => `<span class="badge ${x.kind === 'NBC' ? 'b-brand' : 'b-sec'} nodot">${x.kind}</span>`;
    const chs = x => x.ch.map(c => `<span class="ob-ch">${chIc(c)} ${esc(c)}</span>`).join('');
    const table = `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Campaign or action</th><th>Messages</th><th>Type</th><th>Channels</th><th>Segment</th><th>Status</th></tr></thead><tbody>${vis.map(x => `<tr class="row-link" onclick="${x.open}"><td><div class="nm">${esc(x.name)}</div><div class="sm">${esc(x.sub)}</div></td><td>${outMeter(x)}</td><td>${kB(x)}</td><td class="sm">${chs(x)}</td><td class="sm">${esc(x.seg || '–')}</td><td>${bPill(x.b)}</td></tr>`).join('') || '<tr><td colspan="6" class="sm muted">Nothing matches these filters.</td></tr>'}</tbody></table></div>`;
    const grid = `<div class="lib-grid">${vis.map(x => `<button class="lc oc" onclick="${x.open}">${outMeter(x)}<div class="lc-b"><div class="oc-h">${kB(x)}${bPill(x.b)}</div><div class="lc-t">${esc(x.name)}</div><div class="lc-m">${esc(x.sub)}</div><div class="oc-c">${chs(x)}</div><div class="lc-f"><span class="sm muted">${esc(x.seg || 'No segment')}</span><span class="sm">${esc(x.res)}</span></div></div></button>`).join('') || '<div class="empty">Nothing matches these filters.</div>'}</div>`;
    return `<div class="lib" id="outLib"><div class="lib-top"><div class="lib-bar"><div class="lib-tabs">${['All', 'Under review', 'Approved', 'In outreach', 'Completed'].map(s => `<button class="${outTab === s ? 'on' : ''}" onclick="App.outTab('${s}')">${s} <i class="lib-n">${(s === 'All' ? base : base.filter(x => x.b === s)).length}</i></button>`).join('')}</div>
      <div class="lib-tools">${outSearch || outF.q ? `<div class="search lib-q">${ic('search', 14)}<input id="outQ" placeholder="Search campaigns and actions" aria-label="Search campaigns and actions" value="${esc(outF.q)}" oninput="App.outPick('q',this.value,true)"></div>` : `<button class="lib-ib" title="Search" aria-label="Search" onclick="App.outSearch()">${ic('search', 17)}</button>`}
        <span class="lib-mw"><button class="lib-ib ${outMenu || chips ? 'on' : ''}" title="Filter and sort" aria-label="Filter and sort" onclick="App.outMenu('${outMenu ? '' : 'root'}')"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="17" x2="14" y2="17"/></svg></button>${outMenuHtml(all)}</span>
        <button class="lib-ib ${outList ? 'on' : ''}" title="${outList ? 'Grid view' : 'List view'}" aria-label="Switch view" onclick="App.outList(${!outList})"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg></button>
        <button class="lib-ib" title="Build a campaign or action in the chat" aria-label="Build a campaign or action in the chat" onclick="App.focusComposer('Build a campaign for ')">${ic('plus', 17)}</button></div></div>${chips ? `<div class="lib-chips">${chips}</div>` : ''}</div>
      <div class="lib-grid-h"><span class="lbl">${outTab === 'All' ? 'Everything' : esc(outTab)} · ${vis.length}</span><span class="sm muted">Sending connects after the pilot; nothing is sent from the mock</span></div>${outTab === 'All' || outTab === 'Under review' ? '<div class="placeholder-note" style="margin:0 0 10px"><div><b>Live order.</b> The next best actions re-order the moment something happens. 09:42: Halcyon moved up 4 places after a reply on LinkedIn. 08:15: Juniper moved to first after a pricing-page visit.</div></div>' : ''}${outList ? table : grid}</div>`;
  }
  function outSteps(g) {
    const n = g.kind === 'NBA' ? 1 : +(g.seq || '5').split(' ')[0], days = n === 1 ? [0] : n === 3 ? [0, 4, 9] : n === 5 ? [0, 3, 7, 12, 19] : [0, 3, 7, 12, 18, 27, 40];
    const ch = g.kind === 'NBA' ? [g.ch[0] || 'Email'] : g.ch.length ? g.ch : ['Email'];
    const T = { Email: ['Opening: the risk peers hit first', 'Proof: what a comparable site did', 'The direct ask: a two-day site assessment', 'Short follow-up', 'Second proof: a peer number', 'A new angle: the cost of waiting'], LinkedIn: ['Connection note', 'Share the carousel', 'Comment-led follow-up'], Phone: ['Call: confirm the timing', 'Call: book the assessment'], 'Phone call': ['Call: confirm the timing'], 'Direct mail': ['Printed one-pager to the plant head'] };
    return days.map((d, i) => { const c = ch[i % ch.length], L = T[c] || T.Email; return { day: d, ch: c, step: i === days.length - 1 && days.length > 3 ? (c === 'LinkedIn' ? 'Last note on LinkedIn: close the loop' : 'Last note: close the loop') : L[Math.floor(i / ch.length) % L.length], asset: i === 1 || n === 1 ? (g.ct && !/Let the AI/.test(g.ct) ? g.ct : 'AI picks: A peer site cut unplanned trips by 18%') : '' }; });
  }
  /* A campaign built from the chat opens in the same campaign page as every other campaign */
  function renderGenCampaign(g) {
    const steps = outSteps(g), chs = (g.ch && g.ch.length ? g.ch : [...new Set(steps.map(s => s.ch))]), names = g.cohorts && g.cohorts.length ? g.cohorts : g.seg ? [g.seg] : [];
    let accsG = (g.ids && g.ids.length ? g.ids.map(acct) : ACCOUNTS.filter(a => names.includes(a.segment) || (segOf(a.seg) && names.includes(segOf(a.seg).name)))).filter(Boolean);
    const COHG = names.map((nm, i) => { const sg = SEGMENTS.find(s => s.name === nm) || null, firstG = i === 0, ids = names.length === 1 ? accsG.map(a => a.id) : accsG.filter(a => a.segment === nm || (segOf(a.seg) || {}).name === nm).map(a => a.id); return { id: 'g' + i, name: nm, seg: sg, struct: sg ? sg.structure : COH_STRUCT, line: sg ? `Opens with their own signal: ${sg.trigger.toLowerCase()}.` : 'Opens with the signal each account was found for.', src: sg ? 'Micro-segment' : 'From your list', ids, first: firstG, n: ids.length }; });
    const curG = COHG.length > 1 ? COHG.find(x => x.id === campCoh) || null : null, cohG = curG || (COHG.length === 1 ? COHG[0] : null);
    if (curG) accsG = accsG.filter(a => curG.ids.includes(a.id));
    const n = accsG.length, ctab = campTab === 'msgs' ? 'msgs' : campTab === 'acc' ? 'acc' : 'ov', last = steps[steps.length - 1] || { day: 0 }, ct = libAll().find(x => x.t === g.ct);
    const sub = g.b === 'Under review' ? (isMgr ? 'Waiting for you to approve' : `Waiting for ${first(USERS.pavan.name)} to approve`) : g.b === 'Approved' ? 'Approved · the first message goes in the next send window' : 'Sending in the next window';
    const cv = frame(`<button class="back-l" onclick="App.outOpen(null)">${ic('left', 14)}</button> ${esc(g.name)} <span class="badge ${g.b === 'Under review' ? 'b-ter' : 'b-pos'}">${esc(g.b === 'Under review' ? 'Under review' : g.b)}</span>`, `${steps.length} steps · ${last.day} days · ${esc(chs.join(' + '))} · ${names.length > 1 ? names.length + ' cohorts' : 'cohort ' + esc(names[0] || 'not set')}`,
      g.b === 'Under review' ? (isMgr ? `<button class="btn sm pri" onclick="App.outMove('${g.id}','Approved')">${ic('check', 13)} Approve</button>` : `<button class="btn sm pri" onclick="App.outMove('${g.id}','Under review',1)">${ic('task', 13)} Send for approval</button>`) : g.b === 'Approved' ? `<button class="btn sm pri" onclick="App.outMove('${g.id}','In outreach')">${ic('plane', 13)} Start outreach</button>` : '');
    const R = (k, v, d) => `<div class="cp-r"><span>${k}</span><b>${v}</b>${d ? `<i>${d}</i>` : ''}</div>`;
    const pv = accsG.find(a => a.id === campPrev) || accsG[0];
    const row = (k, v) => `<div class="og-r"><span>${k}</span><b>${v}</b></div>`;
    cv.innerHTML = `${COHG.length > 1 ? `<div class="coh-bar"><span class="coh-bl">${ic('layers', 13)} Showing</span>${[{ id: 'all', name: 'All cohorts', ids: COHG.flatMap(x => x.ids) }].concat(COHG).map(x => { const on = x.id === 'all' ? !curG : curG && curG.id === x.id; return `<button class="coh-chip ${on ? 'on' : ''}" aria-pressed="${on}" onclick="App.campCoh('${x.id}')">${esc(x.name)}<i>${x.ids.length}</i></button>`; }).join('')}</div>` : ''}
      <div class="cp-hero card"><div class="cp-l">${curG ? `<div class="cp-scope">${esc(curG.name)}</div>` : COHG.length > 1 ? `<div class="cp-scope">All ${COHG.length} cohorts</div>` : ''}<div class="cp-big"><b>Nothing sent yet</b></div><div class="cp-sub">${esc(sub)}</div><div class="cp-steps">${steps.map((s, i) => `<span class="cp-st ${i === 0 ? 'next' : ''}"><em>${i + 1}</em>${chIc(s.ch)} Day ${s.day}</span>`).join('')}</div></div>
      <div class="cp-rs">${R('Accounts', n, curG ? 'in this cohort' : names.length > 1 ? `across ${names.length} cohorts` : 'in this campaign')}${R('Replied', '–', 'after the first send')}${R('Positive', '–', '')}${R('Meetings', '–', '')}</div></div>
      <div class="dtabs cp-tabs">${[['ov', 'Overview'], ['msgs', `Messages <i>${steps.length}</i>`], ['acc', `Accounts <i>${n}</i>`]].map(([k, l]) => `<button class="${ctab === k ? 'on' : ''}" onclick="App.setCampTab('${k}')">${l}</button>`).join('')}</div>
      ${ctab === 'msgs' ? (cohG ? (() => { const TC = steps.map((s, i) => { const ch = s.ch === 'Phone' ? 'Phone call' : s.ch; return { ch, fmt: ch === 'LinkedIn' ? (i === 0 ? 'Connection request' : 'Message') : FORMATS[ch] ? FORMATS[ch][0] : 'Plain text', t: s.step, day: s.day }; }); return `${cohMsgHead(cohG, accsG, pv, COHG.length > 1)}
        <div class="mseq">${steps.map((s, i) => copyStep({ cid: g.id, x: cohG, tc: TC[i], i, sq: TC, locked: false, state: i === 0 ? 'First to go' : 'Scheduled', pv, asset: ctSlot(copyKey(g.id, cohG, i), s.asset ? libAll().find(x => x.t === s.asset.replace(/^AI picks: /, '')) || null : null, TC[i], false) })).join('')}</div>`; })() : cohPick(COHG, g.id, steps.map((s, i) => ({ ch: s.ch, fmt: s.ch === 'LinkedIn' ? (i === 0 ? 'Connection request' : 'Message') : 'Plain text', t: s.step, day: s.day }))))
      : ctab === 'acc' ? `<div class="sec-row"><div class="lbl">Accounts · ${n}</div></div><div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Company</th>${names.length > 1 ? '<th>Cohort</th>' : ''}<th>Status</th><th></th></tr></thead><tbody>${accsG.map(a => `<tr class="row-link" onclick="App.openRecord('${a.id}','overview')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.contact.title)}</div></div></div></td><td>${esc(a.name)}</td>${names.length > 1 ? `<td><span class="coh-tag">${esc((segOf(a.seg) || {}).name || a.segment || names[0])}</span></td>` : ''}<td><span class="badge b-grey nodot">Not sent yet</span></td><td><button class="btn sm" onclick="event.stopPropagation();App.openRecord('${a.id}','overview')">Open</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No accounts yet: the cohort fills when its micro-segment does.</td></tr>'}</tbody></table></div>`
      : `<div class="lbl" style="margin:4px 0 8px">Built from your answers</div><div class="og-meta card">${row('Objective', esc(g.obj))}${row(names.length > 1 ? 'Cohorts' : 'Cohort', esc(names.join(', ') || '–'))}${row('Channels', esc(chs.join(', ')))}${row('Steps', esc(g.seq))}${row('Content', ct ? assetLink(ct) + (g.why ? ` <span class="muted">· ${esc(g.why)}</span>` : '') : esc(g.ct || '–'))}${row('Stops for a person', esc((g.stop || []).join(', ') || 'On any reply or an open deal'))}${row('Your brief', esc(g.brief))}</div>
        <div class="lbl" style="margin:16px 0 8px">Delivery by step</div><div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Step</th><th>Day</th><th>Sent</th><th>Opened</th><th>Replied</th><th></th></tr></thead><tbody>${steps.map((s, i) => `<tr class="row-link" onclick="App.setCampTab('msgs')"><td><div class="nm">${chIc(s.ch)} Step ${i + 1} · ${esc(s.ch)}</div><div class="sm">${esc(s.step)}</div></td><td class="mono">${s.day}</td><td><span class="muted">0</span></td><td>–</td><td>–</td><td>${i === 0 ? '<span class="badge b-ter nodot">First to go</span>' : '<span class="badge b-grey nodot">Later</span>'}</td></tr>`).join('')}</tbody></table></div>
        <div class="og-f"><button class="btn sm" onclick="App.outEdit('${g.id}')">${ic('edit', 13)} Change the answers</button><button class="btn sm ghost" onclick="App.outDrop('${g.id}')">${ic('trash', 13)} Discard</button></div>`}`;
  }
  function renderOutGen() {
    const g = (S.outGen || []).find(x => x.id === outSel); if (!g) { outSel = null; return renderCampaigns(); }
    if (g.kind === 'NBC') return renderGenCampaign(g);
    const steps = outSteps(g), who = g.kind === 'NBA' ? (g.who || '').split(' · ')[0] : '', fn = who.split(' ')[0] || 'there';
    const cv = frame(`<button class="back-l" onclick="App.outOpen(null)">${ic('left', 14)}</button> ${esc(g.name)} <span class="badge ${g.kind === 'NBC' ? 'b-brand' : 'b-sec'} nodot">${g.kind}</span>`, `Built from your brief and answers · ${esc(g.b)}`,
      g.b === 'Under review' ? (isMgr ? `<button class="btn sm pri" onclick="App.outMove('${g.id}','Approved')">${ic('check', 13)} Approve</button>` : `<button class="btn sm pri" onclick="App.outMove('${g.id}','Under review',1)">${ic('task', 13)} Send for approval</button>`) : g.b === 'Approved' ? `<button class="btn sm pri" onclick="App.outMove('${g.id}','In outreach')">${ic('plane', 13)} Start outreach</button>` : '');
    const row = (k, v) => `<div class="og-r"><span>${k}</span><b>${esc(v || '–')}</b></div>`;
    cv.innerHTML = `<div class="og"><div class="og-meta card">${row('Objective', g.obj)}${row(g.kind === 'NBC' ? 'Micro-segment' : 'Person', g.kind === 'NBC' ? g.seg : g.who)}${row(g.kind === 'NBC' ? 'Channels' : 'Channel', g.ch.join(', '))}${row(g.kind === 'NBC' ? 'Sequence' : 'When', g.kind === 'NBC' ? g.seq : g.when)}${g.kind === 'NBC' ? row('Who in each account', (g.per || []).join(', ') || 'The contact the AI ranks first') : row('Leads with', g.sig)}${row('Content', g.ct + (g.why ? ' · ' + g.why : ''))}${g.kind === 'NBC' ? row('Stops for a person', (g.stop || []).join(', ')) : ''}${g.note ? row('Also', g.note) : ''}${row('Your brief', g.brief)}</div>
      <div class="lbl" style="margin:18px 0 8px">${g.kind === 'NBC' ? `Sequence · ${steps.length} touches over ${steps[steps.length - 1].day} days` : 'The action'}</div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Day</th><th>Channel</th><th>Step</th><th>Content</th></tr></thead><tbody>${steps.map(s => `<tr><td class="mono">${s.day}</td><td>${chIc(s.ch)} ${esc(s.ch)}</td><td class="nm">${esc(s.step)}</td><td class="sm og-ct">${ctSlot(`${g.id}|nba|${steps.indexOf(s)}`, s.asset ? libAll().find(x => x.t === s.asset.replace(/^AI picks: /, '')) || null : null, { fmt: g.ct || '' }, false)}</td></tr>`).join('')}</tbody></table></div>
      <div class="lbl" style="margin:18px 0 8px">First message · draft</div>
      <div class="card og-msg"><div class="sm muted">${esc(steps[0].ch)} · ${g.kind === 'NBC' ? 'personalised for each person when it goes out' : 'to ' + esc(who)}</div><p>Hi ${esc(g.kind === 'NBC' ? '{first name}' : fn)},</p><p>${esc(/switch|contract/i.test(g.obj) ? 'Your current support contract ends soon, and that is the cheapest moment to change platform. A comparable refinery switched within one planned shutdown.' : /stall|silence|Re-engage/i.test(g.obj) ? 'We last spoke a few weeks ago about the migration timing. One thing has changed since: a peer site cut unplanned trips by 18% in its first year.' : /leader/i.test(g.obj) ? 'Congratulations on the new role. Most new reliability leaders start with the same question: where does the downtime really come from?' : /webinar|event/i.test(g.obj) ? 'We are running a 30-minute session on turnaround readiness with two plant heads from the region.' : 'Sites planning their next shutdown are setting the migration timing now, before support timing sets it for them.')}</p><p>${esc(/meeting|Book/i.test(g.obj) ? 'Would 20 minutes next week work to walk through what they did?' : /webinar|event/i.test(g.obj) ? 'Can I save you a seat?' : 'Worth a short reply either way?')}</p><div class="sm muted">Brand and claim checks pass · confidence: high</div></div>
      <div class="og-f"><button class="btn sm" onclick="App.outEdit('${g.id}')">${ic('edit', 13)} Change the answers</button><button class="btn sm ghost" onclick="App.outDrop('${g.id}')">${ic('trash', 13)} Discard</button></div></div>`;
  }

  /* Content studio: four cards, the box, the formats it makes, then every asset as cards and as a table */
  const DS_TPL = [['Vantera Brand v3', 'Sora, Plus Jakarta Sans +1', '#7D52A2', '#130D1C', 'Org default'], ['Field guide', 'Warm, for operations teams', '#B4652A', '#2B1A0E'], ['Boardroom', 'Navy, for executives', '#1F4E8C', '#0E1B2E'], ['Night shift', 'Dark, high contrast', '#6C5CE7', '#0B0B14'], ['Plain paper', 'Monochrome, print-first', '#3B3B3B', '#1A1A1A']];
  let dsQ = '', fmtOpen = true;
  const dsOf = n => DS_TPL.find(x => x[0] === n) || DS_TPL[0];
  const dsStyle = n => { const t = dsOf(n); return t === DS_TPL[0] ? '' : `--brand:${t[2]};--brand-mid:color-mix(in srgb,${t[2]} 45%,white);--brand-lt:color-mix(in srgb,${t[2]} 12%,white);--rail:${t[3]}`; };
  const dsSw = t => `<span class="ds-sw">${[95, 80, 60, 40, 20, 0].map(p => `<i style="background:color-mix(in srgb,${t[2]} ${100 - p}%,white)"></i>`).join('')}<i style="background:${t[3]}"></i></span>`;
  function dsPill() {
    const cur = dsOf(S.dsT), L = DS_TPL.slice(1).filter(t => !dsQ || (t[0] + t[1]).toLowerCase().includes(dsQ.toLowerCase()));
    return pillMenu('ds', `${esc(cur[0])}`, 'layers', `<div class="lib-menu st-pm ds-pm" role="menu"><div class="search ds-q">${ic('search', 13)}<input placeholder="Search design systems" aria-label="Search design systems" value="${esc(dsQ)}" oninput="App.dsSearch(this.value)"></div>
      <button class="ds-cur ${cur === DS_TPL[0] ? 'on' : ''}" onclick="App.dsPick('')"><span class="ds-ic">${ic('layers', 16)}</span><span class="ob-mt"><b>${DS_TPL[0][0]}</b><span>${DS_TPL[0][1]}</span></span><span class="ds-def">Org default</span></button>
      <div class="ds-vc"><div><b>Brand voice</b><span>Direct and plain, no superlatives · from Brand v3</span></div><div><b>Approved claims</b><span>42 claims and 9 case studies from the Knowledge Hub · managed by Rajiv (admin)</span></div><p>Every asset is checked against both before it can be approved. A template changes the look, never the voice or the claims.</p></div>
      <div class="ob-mh">Included templates</div><div class="ds-grid">${L.map(t => `<button class="ds-card ${cur === t ? 'on' : ''}" onclick="App.dsPick(${js(t[0])})"><span class="ds-prev" style="--c:${t[2]};--r:${t[3]}"><b>${esc(t[0])}</b>${dsSw(t)}<span class="ds-aa">Aa · the quick brown fox</span></span><span class="ds-n">${esc(t[0])}</span><span class="ds-d">${esc(t[1])}</span></button>`).join('') || '<div class="sm muted" style="padding:8px">No match</div>'}</div></div>`, 'Design system');
  }
  const libPerf = a => { const m = a.metric || '', r = +(m.match(/(\d+) repl/) || [0, 0])[1], mt = +(m.match(/(\d+) meet/) || [0, 0])[1], rr = +(m.match(/rate (\d+)/i) || [0, 0])[1]; return mt * 10 + r + rr / 3 + (+(m.match(/(\d+) engage/) || [0, 0])[1]) / 40; };
  function studioTop() {
    const all = libAll(), n = s => all.filter(a => a.st === s).length, inUse = all.filter(a => a.inC.length).length, top = all.slice().sort((p, q) => libPerf(q) - libPerf(p))[0];
    const k = (key, v, l, d, extra) => `<button class="lib-k ${libTabK === key ? 'on' : ''} ${extra || ''}" onclick="App.libTab('${libTabK === key ? 'All' : key}')"><span class="lib-kn">${v}</span><span class="lib-kl">${l}</span><span class="lib-ks">${d}</span></button>`;
    const cards = `<div class="lib-kpis st-cards">${k('To approve', n('To approve'), 'To approve', isMgr ? 'waiting for you' : 'waiting for Daniel')}${k('Completed', n('Completed'), 'Completed', 'approved and in the library')}${k('In outreach', inUse, 'In outreach', 'used in live campaigns or actions')}
      <button class="lib-k lib-top1 ${libSort === 'Top performing' ? 'on' : ''}" onclick="App.libTopPerf()"><span class="lib-kl">${ic('flame', 13)} Top performing</span><span class="lib-kt">${esc(top.t)}</span><span class="lib-ks">${esc(top.metric)} · ${top.inC.length} campaign${top.inC.length === 1 ? '' : 's'}</span></button></div>`;
    const fmts = `<div class="st-fmts ${fmtOpen ? '' : 'shut'}"><button class="st-fh" onclick="App.fmtToggle()" aria-expanded="${fmtOpen}"><span>Choose a format</span><span class="st-chev">${ic('chev', 13)}</span></button>${fmtOpen ? `<div class="st-fg">${Object.keys(AST).map(t => `<button class="st-ft ${studioType === t ? 'on' : ''}" onclick="App.setStudioType(${js(t)})" title="${esc(AST[t][1])}">${libThumb({ type: t })}<b>${t}</b><i class="st-tp">${esc((window.CONTENT_LIB.defTemplate(t) || {}).name || 'No template')}</i></button>`).join('')}</div>` : ''}</div>`;
    return cards + obBox('studio', { id: 'stBrief', h: 'What should we write?', label: 'Brief', ph: 'Describe the asset: who it is for, the pain point, initiative or need it answers', pills: stPill() + dsPill(), send: 'App.studioGo()', below: fmts });
  }
  const BACKLOG = [['What does a phased migration cost per year of outage saved?', 7, 'Rival contract ending'], ['Which sites like ours finished a migration inside one turnaround?', 5, 'Turnaround season 2027'], ['How do you handle a mixed vendor estate?', 4, 'Historian & tech-stack change'], ['What support response time do you commit to?', 3, 'Researching competitors']];
  function studioHome() {
    return `<div class="st-home">${studioTop()}${libView()}<details class="lib-guide st-bl"><summary>Backlog · ${BACKLOG.length} questions the library could not answer</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Question</th><th>Asked</th><th>Segment</th><th></th></tr></thead><tbody>${BACKLOG.map(q => `<tr><td class="nm">${esc(q[0])}</td><td>${q[1]}</td><td class="sm">${esc(q[2])}</td><td><button class="btn sm" onclick="App.studioGo(${js(q[0])},'PDF one-pager')">Write it</button></td></tr>`).join('')}</tbody></table></div></details></div>`;
  }
  function renderStudio() {
    renderStudio0();
    libHook();
    if (S.studio.doc) { const h = document.querySelector('.doc-h'); if (h) h.insertAdjacentHTML('afterend', outreachBar()); }
    const cv = $('cv');
    if (!S.studio.doc && studioTab === 'backlog' && cv) cv.innerHTML = `<div class="placeholder-note" style="margin-bottom:10px"><div>Questions the library could not answer, from drafts and replies. Ranked by how often they came up. Each one is a piece of content worth writing.</div></div><div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Question</th><th>Asked</th><th>Segment</th><th></th></tr></thead><tbody>${[['What does a phased migration cost per year of outage saved?', 7, 'Rival contract ending'], ['Which sites like ours finished a migration inside one turnaround?', 5, 'Turnaround season 2027'], ['How do you handle a mixed vendor estate?', 4, 'Historian & tech-stack change'], ['What support response time do you commit to?', 3, 'Researching competitors']].map(q => `<tr><td class="nm">${esc(q[0])}</td><td>${q[1]}</td><td class="sm">${esc(q[2])}</td><td><button class="btn sm" onclick="App.studioGo(${js(q[0])},'One-pager PDF')">Write it</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function outreachBar() {
    const d = S.studio.doc, mine = ACCOUNTS.filter(a => a.nba && a.owner === me.id && /auto|review/.test(a.nba.status)), at = (S.assetUse || {})[d.title];
    return `<div class="out-bar"><b>Use in outreach</b>
      <label class="sr" for="outT">Attach to</label><select id="outT" class="sel"><option value="">Attach to…</option><optgroup label="Next best actions">${mine.map(a => `<option value="nba:${a.id}">${esc(a.name)} · ${esc(a.nba.action.slice(0, 40))}</option>`).join('')}</optgroup><optgroup label="Campaign touches">${campOf('c1').touches.map((tc, i) => `<option value="touch:${i}">Turnaround season 2027 · touch ${i + 1}</option>`).join('')}</optgroup></select>
      <button class="btn sm pri" onclick="App.useAsset(document.getElementById('outT').value)">Attach</button>
      <label class="sr" for="outR">Assign to</label><select id="outR" class="sel" onchange="if(this.value)App.assignAsset(this.value)"><option value="">Assign to a teammate…</option>${REPS.filter(r => r !== me.id).map(r => `<option value="${r}">${esc(USERS[r].name)}</option>`).join('')}</select>
      <label class="out-ok"><input type="checkbox" ${S.autoAttach ? 'checked' : ''} onchange="App.autoAttach(this.checked)"> Let the AI attach this to matching outreach</label>
      ${at ? `<div class="sm" style="flex-basis:100%">Attached: ${esc(at)}</div>` : ''}</div>`;
  }
  function renderStudio0() {
    const d = S.studio.doc;
    if (!d) {
      const all = S.content.concat(CONTENT);
      $('main').className = 'canvas studio-home';
      $('main').innerHTML = `<div class="cv-h"><div class="cv-ht" style="display:flex;flex-direction:row;align-items:baseline;gap:14px"><div class="cv-t">Content studio</div><div class="cv-s">Every format in Vantera's brand voice, grounded in the Knowledge Hub and cited</div></div></div>${modTabs()}
                <div class="cv-b" id="cv">${studioHome()}</div>`;
      return;
    }
    $('main').className = 'canvas';
    $('main').innerHTML = `<div class="cv-h doc-h"><div class="cv-ht" style="display:flex;flex-direction:row;align-items:center;gap:10px;flex-wrap:wrap"><span class="doc-ic">${ic('doc', 16)}</span><div class="cv-t">${esc(d.title)}</div><span class="badge ${d.status === 'Draft' ? 'b-grey' : 'b-pos'}">${esc(d.status)}</span><span class="muted" style="font-size:12px">Saved</span></div>
        <div class="cv-a"><div style="position:relative"><button class="btn sm" onclick="App.toggleDl()">Download ${ic('downa', 12)}</button><div class="menu" id="dlMenu" style="top:36px;right:0;width:170px">${docDl(d).map(o => `<button onclick="App.toast('Downloads are a placeholder in the mock')">${o}</button>`).join('')}</div></div>${d.status === 'Draft' ? '<button class="btn sm pri" onclick="App.addToLibrary()">Add to Content library</button>' : '<span class="badge b-pos">In Content library</span>'}<button class="ic-btn" title="Close" onclick="App.nav(\'studio\')">${ic('x', 16)}</button></div></div>
      <div class="doc-bar"><label for="dTone">Tone</label><select id="dTone" class="sel" onchange="App.docSet('tone',this.value)">${['Direct', 'Warm', 'Technical', 'Formal'].map(x => `<option ${d.tone === x ? 'selected' : ''}>${x}</option>`).join('')}</select><label for="dLen">Length</label><select id="dLen" class="sel" onchange="App.docSet('length',this.value)">${['Short', 'Medium', 'Long'].map(x => `<option ${d.length === x ? 'selected' : ''}>${x}</option>`).join('')}</select><span class="muted" style="margin-left:auto;font-size:12px">${docMeta(d)}</span></div>
      <div class="cv-b doc-bg" id="cv" style="${dsStyle(d.tpl)}"><div class="doc-tags"><span class="badge b-brand nodot">${esc(d.type)}</span>${d.tplName ? `<span class="badge b-grey nodot">Template: ${esc(d.tplName)}</span>` : ''}<span class="badge b-grey">${esc(d.audience)}</span><span class="badge b-sec">${esc(dsOf(d.tpl)[0])}</span><span class="badge b-brand">AI-assisted · High</span></div>
        ${docBody(d)}</div>`;
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
  function goCampaign(id, tab) { remember('campaigns'); art = null; recId = null; thrId = null; expanded = true; campSel = id; campTab = tab || 'enroll'; campCoh = 'all'; go('campaigns'); }
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
    const MODR = { inbox: renderInbox, accounts: () => { renderAccounts(); leadsHook(); }, segments: renderSegments, campaigns: renderCampaigns, approvals: renderApprovals, studio: renderStudio, analytics: renderAnalytics };
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
    send() { const el = $('composer'); let v = el.value; if (actSel) { if (!v.trim()) { toast(`Describe it first: ${actSel.ph.toLowerCase()}`); return; } v = actSel.prefix + v; actSel = null; } el.value = ''; ask(v); },
    pickAct(prefix) { actSel = Object.assign({ prefix }, ACT_SEL[prefix]); renderChat(); setTimeout(() => { const el = $('composer'); if (el) el.focus(); }, 0); },
    actClear() { actSel = null; renderChat(); },
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
    openChat(id) { backs = []; keep = null; S.cur = id; const oc = S.chats.find(x => x.id === id); art = oc && oc.art ? oc.art : null; recId = null; thrId = null; const c = S.chats.find(x => x.id === id); if (c) setTimeout(() => { c.attn = false; save(); renderNav(); }, 1200); save(); if (oc && oc.page && MODULES[oc.page]) { keep = oc; expanded = true; go(oc.page); } else go(null); },
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
    btDegrade(on) { S.btDegrade = on; save(); toast(on ? 'Rules degraded: the backtest fails and go-live is blocked.' : 'Rules restored: the backtest passes.'); renderAll(); },
    send1(id) { const a = acct(id); S.sent1 = S.sent1 || {}; S.sent1[id] = { at: 'Today ' + new Date().toTimeString().slice(0, 5), by: me.name }; S.captures = S.captures || []; S.captures.push({ account: a.name, person: a.contact.name, channel: chan1(a), signals: a.signals.filter(x => x.weight > 0).slice(0, 3).map(x => x.type), segment: a.segment, message: 'm1', rules: 'rules 2026.11.1', at: S.sent1[id].at }); routeAll(); save(); toast('Sent from your mailbox. Logged with the person, segment, signals, message version and rule version.'); renderAll(); },
    optOut(id) { const a = acct(id); S.optouts = S.optouts || {}; S.optouts[id] = { by: me.name, at: 'Today' }; routeAll(); save(); toast(`${a.contact.name} opted out. Suppressed in every queue and every later run.`); renderAll(); },
    modTab(k) { outSel = null; art = null; recId = null; thrId = null; expanded = true; if (k === 'signals' || k === 'accounts') { accSub = k === 'signals' ? 'signals' : 'list'; go('accounts'); } else if (k === 'nba' || k === 'campaigns' || k === 'plays') { campSel = null; campSub = k === 'campaigns' ? 'list' : k; go('campaigns'); } else { if (k === 'segments') segSel = null; if (k === 'studio') S.studio.doc = null; go(k); } },
    setSigTab(k) { sigTab = k; renderAll(); },
    resolveEsc(id, msg) { S.resolvedEsc = S.resolvedEsc || {}; S.resolvedEsc[id] = true; save(); toast(msg); renderAll(); },
    setApprRep(r) { apprRep = r; renderAll(); },
    setIbCh(k) { ibCh = k; thrId = null; renderAll(); },
    closeThread() { thrId = null; renderAll(); },
    archive(id) { S.archived[id] = true; thrId = null; save(); toast('Archived'); renderAll(); },
    markUnread(id) { S.read[id] = false; thrId = null; save(); toast('Marked as unread'); renderAll(); },
    closeFocus() { recId = null; thrId = null; pEdit = null; ctx = null; focusFull = false; renderAll(); },
    focusFull() { focusFull = !focusFull; renderAll(); },
    toggleNav() { navCol = !navCol; try { localStorage.setItem('dmock_nav', navCol ? '1' : ''); } catch (e) {} document.body.classList.toggle('nav-col', navCol); renderNav(); },
    setCu(k) { cuF = k; renderAll(); },
    setFun(k) { funF = k; renderAll(); },
    fnShow(k) { const st = FN.find(x => x[0] === k), n = (fnStages(funF)[k] || []).length; ask(`Show me the ${n} ${st[3].replace('nba', 'NBA')} ${FX_PER[funF][1]}`); },
    metric(k, per) { per = per || funF; const n = fxRows(k, per).length, M = FX_META[k]; ask(`Show me the ${n} ${M[0].toLowerCase()} ${FX_PER[per][1]}`); },
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
      if (run[0] === '>') { if (ACT_SEL[run.slice(1)] && id === 'composer') return App.pickAct(run.slice(1)); const el = $(id); if (el) { el.value = run.slice(1); el.focus(); } return; }
      if (id === 'copIn') App.copAsk(run); else ask(run); },
    ddScope(e, id) { e.stopPropagation(); document.querySelectorAll('.dd.open').forEach(x => x.classList.remove('open')); ctx = id; renderChat(); },
    copSend() { const el = $('copIn'); if (el) App.copAsk(el.value); },
    skipAsk(id) { skipOpen = skipOpen === id ? null : id; renderAll(); },
    skipWith(id, why) { S.skipR[id] = why; skipOpen = null; decide(id, 'skipped', `Skipped: ${why.toLowerCase()}. It feeds the learning loop.`); },
    handoff(id) { const r = REPLIES.find(x => x.id === id); S.handled[id] = true; if (!S.today) S.today = { id: 'home', title: 'Today', thread: todayThread() }; S.today.thread.push({ who: 'ai', kind: 'text', html: `Handed <b>${esc(acct(r.acc).name)}</b> to the proposal team with the reply, the signals and the account history, so they start from context, not a form. ${esc(first(USERS[acct(r.acc).owner].name))} stays the owner.` }); save(); toast('Handed to proposals with the full context (placeholder)'); renderAll(); },
    dictate(id) {
      id = id || 'composer'; const el = $(id), mic = $(id + 'Mic'), keep = id === 'thrBody' || id === 'stBrief' || /^ob_/.test(id); if (!el) return;
      if (speech) { speech.stop(); return; }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const fake = () => { el.value = id === 'thrBody' ? el.value : OB_SAMPLE[id] ? OB_SAMPLE[id] : id === 'stBrief' ? (ST_PROMPTS[studioType] || ST_PROMPTS.Whitepaper)[0] : (recId ? 'Why is this here?' : 'Where are we stuck this week?'); toast(id === 'stBrief' || OB_SAMPLE[id] ? 'Voice needs microphone access in Chrome; filled a sample brief. Edit it, then press send' : 'Dictation needs microphone access in Chrome; filled a sample question'); el.dispatchEvent(new Event('input')); if (!keep) setTimeout(() => sendFrom(id), 700); };
      if (!SR) return fake();
      speech = new SR(); speech.lang = 'en-US'; speech.interimResults = true; speech.continuous = false;
      const base = keep ? el.value + (el.value ? ' ' : '') : ''; let said = '', failed = false;
      if (mic) mic.classList.add('live'); toast(id === 'stBrief' ? 'Listening… describe the asset, who it is for and the pain point it answers' : 'Listening…');
      speech.onresult = ev => { said = [...ev.results].map(r => r[0].transcript).join(''); el.value = base + said; el.dispatchEvent(new Event('input')); };
      speech.onerror = () => { failed = true; };
      speech.onend = () => { speech = null; if (mic) mic.classList.remove('live'); if (failed && !said) return fake(); if (said && !keep) sendFrom(id); if (said && id === 'stBrief') toast('Got it. Edit the brief if needed, then press send'); };
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
    useAsset(v) { if (!v) { toast('Pick a next best action or a campaign touch'); return; } const d = S.studio.doc, [k, x] = v.split(':'); S.assetUse = S.assetUse || {}; S.attach = S.attach || {};
      if (k === 'nba') { S.attach[x] = d.title; S.assetUse[d.title] = acct(x).name + ' · next best action'; } else { editSeq('c1', sq => { sq[+x].fmt = d.type; sq[+x].asset = d.title; }); S.assetUse[d.title] = 'Turnaround season 2027 · touch ' + (+x + 1); }
      save(); toast(`Attached "${d.title}". It goes out with that ${k === 'nba' ? 'action' : 'touch'} after message verification.`); renderAll(); },
    assignAsset(r) { const d = S.studio.doc; shared.tasks.push({ to: r, t: `Use "${d.title}" in your outreach`, due: 'This week', from: me.id }); saveShared(); toast(`Assigned to ${USERS[r].name}. It shows in their day.`); renderAll(); },
    autoAttach(on) { S.autoAttach = on; save(); toast(on ? 'The AI will attach this asset to matching outreach. Each send still passes message verification.' : 'The AI will only attach assets you choose.'); renderAll(); },
    setPersona(id, p) { S.persona = S.persona || {}; S.persona[id] = p; save(); toast(`Persona set to ${p}. Logged in the audit trail; the next draft uses it.`); },
    icpConfirm(path) { const crit = path === 'B' ? PROPOSED : (S.icpDraft || icpNow().crit); shared.icps.forEach(x => { if (x.status === 'In use') x.status = 'Superseded'; }); shared.icps.push({ v: shared.icps.length + 1, crit, path: path === 'B' ? 'Proposed from the website and won deals (path B)' : 'Typed in chat (path A)', by: me.name, at: 'Today', status: 'In use', used: 'New lists from today', res: '–' }); saveShared(); toast(`ICP v${shared.icps.length} confirmed. I'll use it for every new list; the admin sees it in the ICP library.`); ask('What is our ICP?'); },
    icpLearn() { const cur = icpNow(); shared.icps.forEach(x => { if (x.status === 'In use') x.status = 'Superseded'; }); shared.icps.push({ v: shared.icps.length + 1, crit: cur.crit.map(x => /staff/.test(x) ? '300+ staff (learned from reps removing smaller sites)' : x), path: 'Learned from reps\' edits, confirmed in chat', by: me.name, at: 'Today', status: 'In use', used: 'New lists from today', res: '–' }); saveShared(); toast(`ICP v${shared.icps.length}: learned from the team's edits and confirmed by you.`); ask('What is our ICP?'); },
    hubPick(i) { hubSel = hubSel === i ? null : i; renderAll(); },
    setRecTab(k) { recTab = k; actOpen = null; renderAll(); },
    toggleAct(i) { actOpen = actOpen === i ? null : i; renderAll(); },
    star(id) { S.starred[id] = !S.starred[id]; save(); renderAll(); },
    openList(id) { remember('accounts'); listSel = id || 'all'; art = null; recId = null; thrId = null; expanded = true; go('accounts'); },
    saveView() { const name = `My view · ${listSel === 'all' ? 'all accounts' : 'list'} · 27 Oct`; const ids = Array.from(document.querySelectorAll('#cv tbody tr')).length; addList(name, 'Saved view', `${ids} accounts saved from the Accounts view`, ACCOUNTS.filter(mine).map(a => a.id)); listSel = S.lists[0].id; save(); toast('Saved as a list. It\'s a tab now'); renderAll(); },
    openSegment(id) { const sg0 = id && segOf(id); if (sg0 && sg0.mode === 'NBC' && sg0.campaign) return goCampaign(sg0.campaign); remember('segments'); segSel = id; segTab = 'accounts'; art = null; recId = null; thrId = null; expanded = true; go('segments'); },
    saveSegList(segId) { const s = segOf(segId); addList(s.name + ' · 27 Oct', 'Segment', 'Saved from Segments', ACCOUNTS.filter(a => a.seg === segId).map(a => a.id)); save(); toast('Saved. It\'s a tab in Accounts'); },
    confirmCampaign(id) { S.camp[id] = 'Confirmed'; S.campDay0 = S.campDay0 || {}; S.campDay0[id] = SIM.days || 0; save(); toast('Campaign confirmed. Touch 1 is now a task for each account\'s owner; touches 2 and 3 follow on day 4 and day 9.'); renderAll(); },
    declineCampaign(id) { S.camp[id + 'x'] = me.name; save(); toast('Declined. The accounts go back to their own next best actions.'); renderAll(); },
    campSend(id, i) { const a = acct(id), st = touchState(a, i); if (st.s !== 'due') { toast('Not sent: ' + st.txt); renderAll(); return; } S.ctouch = S.ctouch || {}; S.ctouch[id + ':' + i] = 'day ' + campDay(a.campaign); S.captures = S.captures || []; S.captures.push({ account: a.name, person: a.contact.name, channel: campOf(a.campaign).touches[i].ch, signals: ['Turnaround announced'], segment: a.segment, message: 'c1-t' + (i + 1), rules: 'rules 2026.11.1', at: 'campaign day ' + campDay(a.campaign) }); save(); toast(`Touch ${i + 1} sent to ${a.contact.name} after a fresh re-check. Logged.`); renderAll(); },
    campReply(id) { const a = acct(id); S.creply = S.creply || {}; S.creply[id] = true; save(); toast(`Reply logged for ${a.contact.name}. Their pending touches are removed.`); renderAll(); },
    sendForConfirm(id) { S.camp[id] = 'Sent for confirmation'; save(); toast('Sent to Daniel to confirm, with your edits.'); renderAll(); },
    approveEnroll(id) { S.enrollOK[id] = true; save(); toast('Approved. The first step is scheduled once the campaign is confirmed.'); renderAll(); },
    handleReply(id, msg) { S.handled[id] = true; save(); toast(msg || 'Reply sent (placeholder). The sequence for this account is stopped.'); renderAll(); },
    campPrev(id) { campPrev = id; renderAll(); },
    corpus(k) { corpSel = corpSel === k ? null : k; renderAll(); },
    corpusUse(k) { const C = ['Control-system migration, Q2: extend vs migrate, email and LinkedIn, for technical leads whose rival contract ends', 'New leaders, Q3: first 90 days, by email, for new reliability leaders', 'Expansion projects: automation for the project, by email, for operations managers']; campSub = 'list'; outKind = 'NBC'; outSel = null; App.outStart('A campaign like ' + C[k] + ', to book meetings'); toast('Started from the past campaign. Answer the questions on the right'); },
    campApplyAll(cid) { ACCOUNTS.filter(a => a.campaign === cid).forEach(a => { delete S.pseq[a.id]; }); save(); toast('Everyone in this campaign now gets the campaign version'); renderAll(); },
    seqEdit(cid, i, f, v) { if (f === 't' || f === 'subject') setTimeout(() => toast(`Saved. Applies to every account in ${campOf(cid).name}`), 0); editSeq(cid, sq => { sq[i][f] = f === 'day' ? Math.max(0, parseInt(v, 10) || 0) : v; if (f === 'ch') { sq[i].fmt = FORMATS[v][0]; if (v === 'Email' && !sq[i].subject) sq[i].subject = campOf(cid).name; } if (f === 'day') sq.sort((p, q) => p.day - q.day); }); renderAll(); },
    seqMove(cid, i, d) { copyShift(cid, i, i + d, 'swap'); editSeq(cid, sq => { const j = i + d; if (j < 0 || j >= sq.length || sent(sq[j])) return; [sq[i], sq[j]] = [sq[j], sq[i]]; const days = sq.map(t => t.day).sort((p, q) => p - q); sq.forEach((t, k) => { t.day = days[k]; }); }); renderAll(); },
    seqRemove(cid, i) { copyShift(cid, i, null, 'remove'); editSeq(cid, sq => { sq.splice(i, 1); }); toast('Step removed'); renderAll(); },
    seqAdd(cid, ch) { editSeq(cid, (sq, c) => sq.push(newTouch(sq, c, ch))); toast(`${ch} step added at the end`); renderAll(); setTimeout(() => { const el = [...document.querySelectorAll('.mst:not(.locked), .tedit:not(.locked)')].pop(); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); const m = el.querySelector('textarea'); if (m) m.focus({ preventScroll: true }); } }, 60); },
    seqRewrite(cid, i) { editSeq(cid, sq => { const t = sq[i]; t.t = t.ch === 'LinkedIn' ? `Saw the news at your site. ${t.t.split('.')[0]}. Worth a quick chat?` : `${t.t.split('.')[0]}. Here is what a comparable site learned, in one page, and the first step that kept its options open.`; }); toast('Rewritten. Brand and claim checks still pass'); renderAll(); },
    copyEdit(key) { const sk = key.replace(/[^a-zA-Z0-9]/g, '_'), sb = $('cs-' + sk), bd = $('cb-' + sk); if (!bd) return; S.copy = S.copy || {}; S.copy[key] = { subject: sb ? sb.value : '', body: bd.value }; save();
      const pv = $('cpv-' + sk); if (pv) pv.innerHTML = copyPreview(S.copy[key], acct(pv.dataset.acc), pv.dataset.ch); const cc = $('cc-' + sk); if (cc) { const mx = +cc.dataset.max || 300; cc.textContent = bd.value.length + ' / ' + mx; cc.classList.toggle('over', bd.value.length > mx); }
      const card = bd.closest('.mst'), lab = card && card.querySelector('.mst-l em'); if (lab && !lab.dataset.e) { lab.textContent = 'edited'; lab.className = ''; lab.dataset.e = 1; } },
    copyIns(key, tok) { const bd = $('cb-' + key.replace(/[^a-zA-Z0-9]/g, '_')); if (!bd) return; const foc = document.activeElement === bd, a = foc ? bd.selectionStart : bd.value.length, b = foc ? bd.selectionEnd : a; bd.value = bd.value.slice(0, a) + tok + bd.value.slice(b); bd.focus(); bd.setSelectionRange(a + tok.length, a + tok.length); App.copyEdit(key); },
    copyRewrite(key) { const bd = $('cb-' + key.replace(/[^a-zA-Z0-9]/g, '_')); if (!bd) return; const P = bd.value.split('\n\n'), short = s => { const m = s.match(/^[^.?!]+[.?!]/); return m ? m[0] : s; };
      bd.value = P.length > 2 ? [P[0]].concat(P.slice(1, -1).map(short), [P[P.length - 1]]).join('\n\n') : short(bd.value.replace(/^(Hi [^,]+, )/, '')) === bd.value ? bd.value : bd.value.replace(/^(Hi [^,]+, )(.*)$/s, (m, h, r) => h + r.split(/(?<=[.?!])\s+/).slice(0, 2).join(' '));
      App.copyEdit(key); toast('Rewritten shorter, same angle. Brand and claim checks still pass'); },
    copyReset(key) { if (S.copy) delete S.copy[key]; save(); toast('Back to the AI draft'); renderAll(); },
    stepOffer(key, v) { S.stepOffer = S.stepOffer || {}; S.stepOffer[key] = v; save(); const o = offersAll().find(x => x.id === v); toast(o ? `Closing offer: ${o.name}. Logged on every send` : 'No offer on the closing step'); renderAll(); },
    ctPick(key) { ctOpen = !key || ctOpen === key ? null : key; ctQv = ''; renderAll(); setTimeout(() => { const q = $('ctq'); if (q) q.focus(); }, 30); },
    ctQ(v) { ctQv = v; renderAll(); const q = $('ctq'); if (q) { q.focus(); q.setSelectionRange(v.length, v.length); } },
    ctSet(key, id) { S.stepCt = S.stepCt || {}; S.stepCt[key] = id; ctOpen = null; save(); const a = libAll().find(x => x.id === id); toast(id === 'none' ? 'Content removed from this step' : `Attached: ${a ? a.t : 'the asset'}. It goes with this step for every person`); renderAll(); },
    ctNew(key, ty) { S.ctPending = key; ctOpen = null; save(); toast(`New ${ty.toLowerCase()} opened in Content studio. Add it to the library and it attaches to this step`); startDoc(ty, `A ${ty.toLowerCase()} for a campaign step: what peers did, in one page`); },
    seqReset(cid) { delete S.seq[cid]; save(); toast('Back to the AI draft'); renderAll(); },
    libSet(k, v, keepFocus) { libF[k] = v; libHook(); if (keepFocus) { const i = document.getElementById('libQ'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } } },
    libClear() { Object.keys(libF).forEach(k => { libF[k] = ''; }); libMenu = null; libHook(); },
    libTab(k) { libTabK = k; libHook(); },
    libMenu(k) { libMenu = k || null; libHook(); },
    libPick(k, v) { if (k === 'sort') libSort = v; else libF[k] = v; libMenu = libMenu ? 'root' : null; libHook(); },
    libSearch() { libSearch = true; libHook(); const i = document.getElementById('libQ'); if (i) i.focus(); },
    libListView(on) { libList = on; libHook(); },
    stPill() { stPillOpen = !stPillOpen; renderAll(); },
    libApprove(id) { window.CONTENT_LIB.setSt(id, 'Completed', me.name); toast('Approved. It is in the library and ready for outreach.'); libHook(); },
    setStudioTab(k) { studioTab = 'write'; S.studio.doc = null; if (view() !== 'studio') nav('studio'); else renderAll(); setTimeout(() => App.obFocus('studio'), 80); },
    obIn(k, v) { obVal[k] = v; },
    campCoh(id) { campCoh = id || 'all'; renderAll(); },
    goCohort(cid, hid) { goCampaign(cid); campCoh = hid; renderAll(); },
    cohLine(cid, hid, v) { S.cohLine = S.cohLine || {}; S.cohLine[cid + ':' + hid] = v; save(); toast('Opening line saved for this cohort'); },
    qdGo(i) { const M = qdModel(); if (!M) return; QSTEP[M.key] = Math.max(0, Math.min(i, M.qs.length)); renderAll(); },
    qdPick(j) { const M = qdModel(); if (!M) return; const i = M.single ? 0 : Math.min(QSTEP[M.key] || 0, M.qs.length - 1), q = M.qs[i], o = q.opts[j]; if (!o) return; if (q.multi) { M.set(q.k, o.v, 1); return; } const cur = M.get(q.k); QSTEP[M.key] = i + 1; if (cur === o.v) { renderAll(); return; } M.set(q.k, o.v, 0); renderAll(); },
    qdOther(v) { v = (v || '').trim(); if (!v) return; const M = qdModel(); if (!M) return; if (M.key === 'pick') return App.pickCampaign('new', v); const i = Math.min(QSTEP[M.key] || 0, M.qs.length - 1), q = M.qs[i]; if (q.multi) { M.set(q.k, v, 1); return; } QSTEP[M.key] = i + 1; M.set(q.k, v, 0); renderAll(); },
    qdClose() { const k = qdActive; if (k === 'oq') outQ = null; else if (k === 'icq') icpQ = null; else if (k === 'rq') { S.routeQ = null; save(); } else if (k === 'pick') campPick = null; qdActive = null; renderAll(); },
    addToCampaign() { const ls = listAccounts(); campPick = { n: ls.length, title: listTitle(), ids: ls.map(x => x.id) }; qdActive = 'pick'; renderAll(); },
    pickCampaign(v, name) {
      const P = campPick || { n: 0, title: 'this list' }; campPick = null; qdActive = null; const c = chat();
      if (v === 'new') { const A = { ids: (P.ids || []).slice(), obj: 'Book meetings', seg: [P.title], ch: ['Email', 'LinkedIn'], seq: '5 touches over 3 weeks', stop: ['Stop on any reply', 'Stop if an open deal appears'], per: [] }; A.ct = recContent('NBC', A).best.t; outKind = 'NBC'; outQ = { kind: 'NBC', brief: name ? 'A campaign: ' + name : `A campaign for the list "${P.title}"`, pre: {}, a: A }; App.outBuild(); campSel = null; campSub = 'list'; if (c) { c.thread.push({ who: 'ai', kind: 'text', html: `<p>Drafted a new campaign from the ${P.n} accounts on "${esc(P.title)}" with my defaults: book meetings, email and LinkedIn, 5 touches over 3 weeks, and ${esc(A.ct)} as the content. It waits in Under review; change anything on it before it goes out.</p>` }); save(); } if (view() !== 'campaigns' || !expanded) openMod('campaigns'); renderAll(); return; }
      const cp = campOf(v); S.cohorts = S.cohorts || {}; (S.cohorts[v] = S.cohorts[v] || []).push({ name: P.title, src: 'List', n: P.n, at: 'today', ids: listAccounts().map(x => x.id) }); const hid = 'a' + (S.cohorts[v].length - 1);
      if (c) c.thread.push({ who: 'ai', kind: 'text', html: `<p>Added the ${P.n} accounts on "${esc(P.title)}" to <b>${esc(cp.name)}</b> as a new cohort. They start at step 1 in the next send window, with the campaign's messages and an opening line for their own signal.${cp.status === 'Running' ? '' : isMgr ? ' Confirm the campaign to start it.' : ' Daniel confirms the campaign before anything goes out.'}</p><div class="next-row"><button class="btn sm" onclick="App.goCohort('${cp.id}','${hid}')">${ic('expand', 12)} Open the new cohort</button></div>` });
      save(); toast(`Added to ${cp.name} as a new cohort`); renderAll();
    },
    qOther(key, k, v, multi) { v = (v || '').trim(); if (!v) return; if (key === 'oq') App.outAns(k, v, multi ? 1 : 0); else if (key === 'rq') { if (k === 'ct') { S.routeQ.a.note = v; save(); } else App.rqAns(k, v, multi ? 1 : 0); } else App.icpAns(k, v, multi ? 1 : 0); if (!multi) QSTEP[key] = (QSTEP[key] || 0) + 1; renderAll(); },
    openListNBAs() { const segs = [...new Set(listAccounts().filter(a => a.nba && !a.campaign && a.seg).map(a => a.seg))].filter(id => segOf(id)); if (segs.length === 1) return App.openSegment(segs[0]); sgOnly = segs.length ? segs : null; App.modTab('segments'); },
    sgOnlyClear() { sgOnly = null; renderAll(); },
    qGo(key, i) { QSTEP[key] = Math.max(0, i); renderAll(); },
    rqAns(k, v, mode) { const q = S.routeQ; if (!q) return; const a = q.a; if (mode === 2) { a[k] = v; save(); return; } if (mode === 1) a[k] = a[k].includes(v) ? a[k].filter(x => x !== v) : a[k].concat(v); else a[k] = a[k] === v && !/^ct/.test(k) ? '' : v; save(); renderAll(); },
    rqGo() { const q = S.routeQ; if (!q || !q.a.obj) return; const a = q.a, R = rqRecs(a); a.ctN = a.ctN || R.n.best.id; a.ctA = a.ctA || R.b.best.id; q.done = true; S.routeA = JSON.parse(JSON.stringify(a)); if (q.mode === 'route') { S.routeOK = S.routeOK || {}; S.routeOK[listOf()] = true; } else { S.nbaOK = S.nbaOK || {}; S.nbaOK[listOf()] = true; } save(); ask(q.mode === 'route' ? 'Route to NBA and NBC with these answers' : 'Prepare the next actions with these answers'); },
    openAsset(id) {
      const a = window.CONTENT_LIB.all().find(x => x.id === id || x.t === id); if (!a) { toast('That asset is not in the library'); return; }
      const d = makeDoc(a.type, a.t + ' ' + (a.topic || '')); d.title = a.t; d.audience = `${a.per} · ${a.seg}`; d.status = a.st === 'Completed' ? 'In Content library' : a.st; d.assetId = a.id; d.tpl = S.dsT || ''; d.tplName = a.tpl || (window.CONTENT_LIB.defTemplate(a.type) || {}).name || '';
      S.studio = { doc: d, sel: null, thread: [{ who: 'ai', kind: 'text', html: `Opened <b>${esc(a.t)}</b> from the Content library: ${esc(a.type)} · ${esc(d.status.toLowerCase())}, made by ${esc(a.by)}.${a.inC && a.inC.length ? ` Used in ${a.inC.map(esc).join(', ')}.` : ' Not used in outreach yet.'}${a.metric && a.metric !== '–' ? ` Results so far: ${esc(a.metric)}.` : ''}<br><br>Tell me what to change, or click a paragraph to change just that one. An edit makes a new version that goes back for approval.` }] };
      save(); art = null; recId = null; thrId = null; if (view() === 'studio') renderAll(); else location.hash = '#studio';
    },
    icpAns(k, v, mode) { if (!icpQ) return; const a = icpQ.a; if (mode === 2) { a[k] = v; return; } if (mode === 1) a[k] = a[k].includes(v) ? a[k].filter(x => x !== v) : a[k].concat(v); else a[k] = a[k] === v ? '' : v; renderAll(); },
    icpCancel() { icpQ = null; renderAll(); },
    icpBuild() {
      const q = icpQ; if (!q) return; const a = q.a; if (!a.ind.length || !a.geo.length || !a.roles.length) return;
      const crit = [a.ind.join(', '), a.geo.join(', ')].concat(a.size ? [a.size] : [], [a.roles.join(', ')], a.sell ? ['Sells into: ' + a.sell.toLowerCase()] : [], a.sig.length ? ['Ready now when: ' + a.sig.join(', ').toLowerCase()] : [], a.excl.length ? ['Leave out: ' + a.excl.join(', ').toLowerCase()] : [], a.note ? [a.note] : []);
      shared.icps.forEach(x => { if (x.status === 'In use') x.status = 'Superseded'; });
      const v = shared.icps.length + 1; shared.icps.push({ v, crit, path: q.path === 'B' ? `Drafted from ${q.url} (path B)` : 'From the ICP interview (path A)', by: me.name, at: 'Today', status: 'In use' }); saveShared();
      const g0 = (a.geo[0] || 'Singapore').toLowerCase(), loc = CITIES[g0] || COUNTRIES[g0] || ['Singapore', 'Singapore'], r0 = a.roles[0];
      const icp = { city: loc[0], country: loc[1], industry: 'Refining & petrochemicals', fn: /Reliab/.test(r0) ? 'Reliability' : /Operat|Plant/.test(r0) ? 'Operations' : /Technical/.test(r0) ? 'Engineering' : 'Procurement', lvl: /Plant head|leader/.test(r0) ? 'Head' : 'Manager', sig: sigOfPrompt((a.sig[0] || '').toLowerCase()) };
      const id = 'Q' + (S.genLists.length + 1) + Date.now().toString(36).slice(-4);
      const g = { id, q: `ICP v${v}: ${crit.slice(0, 4).join(' · ')}`, icp, owner: me.id, title: `ICP v${v} leads · ${a.ind.slice(0, 2).join(' & ')} · ${a.geo.slice(0, 2).join(', ')}` };
      S.genLists.push(g); genList(g); listSel = id; accSub = 'list'; icpQ = null;
      const n = ACCOUNTS.filter(x => x.fromList === id).length, c = chat();
      if (c) { c.listId = id; c.thread.push({ who: 'ai', kind: 'text', html: `<p>Saved <b>ICP v${v}</b>: ${esc(crit.slice(0, 4).join(' · '))}. I found <b>${n} leads</b> that fit, open on the right and ranked by Fit × Timing. Every new list now starts from this ICP, and the admin sees it in the ICP library.</p><p>Next, I can score the list, group it into micro-segments, or start the outreach.</p>` }); }
      save(); toast(`ICP v${v} saved · ${n} leads found`); renderAll();
    },
    obAct(k, i, j) { const it = OB_MENU[k][i][1][j], a = it[2]; if (a.sub) { obMenu = k + ':' + a.sub; renderAll(); return; } obAtt[k] = (obAtt[k] || []).filter(x => x !== a.att).concat(a.att); obMenu = null; toast(`${it[1]}: added ${a.att} (placeholder)`); renderAll(); },
    obPick(k, lab) { const L = obAtt[k] || []; obAtt[k] = L.includes(lab) ? L.filter(x => x !== lab) : L.concat(lab); renderAll(); },
    fmtToggle() { fmtOpen = !fmtOpen; renderAll(); },
    fsMenu(ns, k) { FSM[ns] = k || null; renderAll(); },
    fsPick(ns, k, v, live) { FS_SET[ns](k, v); if (!live) FSM[ns] = null; renderAll(); if (live) { const s = $(ns + 'Q'); if (s) { s.focus(); s.setSelectionRange(v.length, v.length); } } },
    fsSearch(ns) { FSS[ns] = !FSS[ns]; renderAll(); setTimeout(() => $(ns + 'Q') && $(ns + 'Q').focus(), 0); },
    obMenu(k) { obMenu = !k || obMenu === k ? null : k; obPillK = null; stPillOpen = false; renderAll(); },
    obAdd(k, i) { const p = OB_PLUS[k][i]; obAtt[k] = (obAtt[k] || []).filter(x => x !== p[2]).concat(p[2]); obMenu = null; toast(`${p[0]}: added ${p[2]} (placeholder)`); renderAll(); },
    obRm(k, i) { (obAtt[k] || []).splice(i, 1); renderAll(); },
    obPill(k) { obPillK = !k || obPillK === k ? null : k; obMenu = null; stPillOpen = false; dsQ = ''; renderAll(); },
    obFocus(k) { const w = $('obWrap_' + k), el = w && w.querySelector('textarea'); if (w) w.scrollIntoView({ block: 'start', behavior: 'smooth' }); if (el) el.focus({ preventScroll: true }); },
    icpPick(v) { obIcp = v; obPillK = null; toast(`Searching with ICP version ${v}`); renderAll(); },
    obSend(k) { if (!(obVal[k] || '').trim()) { toast('Describe it first'); return; } if (k === 'out') return App.outStart(obVal[k]); const tx = obText(k); obVal[k] = ''; obAtt[k] = []; ask(tx); },
    outKind(k) { outKind = k; obPillK = null; outQ = null; renderAll(); },
    outStart(v) { obVal.out = v; const pre = outGuess(outKind, v); const at = obAtt.out || [], sA = at.find(x => /^Segment: /.test(x)), cA = at.find(x => /^Asset: /.test(x)); if (sA) pre.seg = sA.slice(9); if (cA) pre.ct = cA.slice(7); QSTEP.oq = 0; qdActive = 'oq'; qdFresh.oq = true; outQ = { kind: outKind, brief: obText('out'), pre, a: Object.assign({ stop: outKind === 'NBC' ? ['Stop on any reply', 'Stop if an open deal appears'] : [], per: [] }, pre, { ch: Array.isArray(pre.ch) ? pre.ch.slice() : pre.ch }) }; if (pre.who) { const acc = accOfWho(pre.who); outQ.a.sig = sigOpts(acc)[0] || ''; } if (outQ.kind === 'NBC') outQ.a.seg = Array.isArray(outQ.a.seg) ? outQ.a.seg : outQ.a.seg ? [outQ.a.seg] : []; if (outQ.a.ct) outQ.a.ctPicked = true; else outQ.a.ct = recContent(outKind, outQ.a).best.t; renderAll(); setTimeout(() => { const q = document.querySelector('.oq'); if (q) q.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60); },
    outAns(k, v, mode) { if (!outQ) return; const a = outQ.a; if (mode === 2) { a[k] = v; return; } if (mode === 1) { const L = a[k] || []; a[k] = L.includes(v) ? L.filter(x => x !== v) : L.concat(v); } else a[k] = a[k] === v && k !== 'ct' ? '' : v; if (k === 'ct') a.ctPicked = true; else if (!a.ctPicked && /obj|seg|cs|ch|who/.test(k)) setTimeout(() => { if (outQ && !outQ.a.ctPicked) { outQ.a.ct = recContent(outQ.kind, outQ.a).best.t; renderAll(); } }, 0); if (k === 'who') { const acc = accOfWho(a.who); a.sig = sigOpts(acc)[0] || ''; if (acc && !a.ch) a.ch = acc.nba.channel === 'Phone' ? 'Phone call' : acc.nba.channel; } renderAll(); },
    outCancel() { outQ = null; renderAll(); },
    outBuild() {
      const q = outQ; if (!q) return; const a = q.a, kind = q.kind, Q = OQ[kind]();
      const g = { id: 'g' + Date.now(), kind, brief: q.brief, obj: a.obj, seg: Array.isArray(a.seg) ? a.seg.join(' + ') : (a.seg || ''), cohorts: Array.isArray(a.seg) ? a.seg.slice() : [], ids: (a.ids || []).slice(), who: a.who || '', ch: kind === 'NBC' ? (a.ch || []).slice() : [a.ch || 'Email'], seq: a.seq || (Q.find(x => x[0] === 'seq') || [0, 0, ['', '']])[2][1], when: a.when || 'Next send window', ct: a.ct || Q.find(x => x[0] === 'ct')[2][0], per: (a.per || []).slice(), stop: (a.stop || []).slice(), sig: a.sig || '', note: a.note || '', b: 'Under review', at: 'just now' };
      g.name = kind === 'NBC' ? `${g.seg}: ${g.obj.toLowerCase()}` : `${g.ch[0]} to ${g.who.split(' · ')[0]}: ${g.obj.toLowerCase()}`;
      g.why = (r => r.best.t === g.ct ? r.why : 'Chosen by you instead of the recommendation')(recContent(kind, a));
      S.outGen = [g].concat(S.outGen || []); outQ = null; obVal.out = ''; obAtt.out = []; outSel = g.id; campTab = 'ov'; save();
      toast(kind === 'NBC' ? 'Campaign built. It waits in Under review until it is approved' : 'Next best action built. It waits in Under review until it is approved'); renderAll();
    },
    outOpen(id) { outSel = id; campTab = 'ov'; campPrev = null; campCoh = 'all'; renderAll(); },
    outMove(id, b, asked) { const g = (S.outGen || []).find(x => x.id === id); if (!g) return; g.b = b; save(); toast(asked ? 'Sent to Daniel for approval. It stays in Under review until he approves' : b === 'Approved' ? 'Approved. It goes out in the next send window (placeholder)' : 'Outreach started (placeholder: nothing is sent)'); renderAll(); },
    outEdit(id) { const g = (S.outGen || []).find(x => x.id === id); if (!g) return; outKind = g.kind; qdActive = 'oq'; QSTEP.oq = 0; outQ = { kind: g.kind, brief: g.brief, pre: {}, a: { obj: g.obj, seg: g.kind === 'NBC' ? (g.cohorts && g.cohorts.length ? g.cohorts.slice() : g.seg ? [g.seg] : []) : g.seg, who: g.who, ch: g.kind === 'NBC' ? g.ch.slice() : g.ch[0], seq: g.seq, when: g.when, ct: g.ct, note: g.note, per: (g.per || []).slice(), stop: (g.stop || []).slice(), sig: g.sig } }; obVal.out = g.brief; S.outGen = S.outGen.filter(x => x.id !== id); outSel = null; save(); renderAll(); },
    outDrop(id) { S.outGen = (S.outGen || []).filter(x => x.id !== id); outSel = null; save(); toast('Discarded'); renderAll(); },
    outTab(s) { outTab = s; renderAll(); },
    outMenu(k) { outMenu = k || null; renderAll(); },
    outPick(k, v, live) { if (k === 'q') outF.q = v; else if (k === 'sort') outSort = v || 'Most recent'; else outF[k] = v; if (!live) outMenu = null; renderAll(); if (live) { const s = $('outQ'); if (s) { s.focus(); s.setSelectionRange(v.length, v.length); } } },
    outSearch() { outSearch = !outSearch; renderAll(); setTimeout(() => $('outQ') && $('outQ').focus(), 0); },
    outList(v) { outList = v; renderAll(); },
    dsSearch(v) { dsQ = v; renderAll(); const s = document.querySelector('.ds-q input'); if (s) { s.focus(); s.setSelectionRange(v.length, v.length); } },
    dsPick(n) { S.dsT = n || ''; obPillK = null; dsQ = ''; save(); toast(`${n || 'Vantera Brand v3'} will be used for the next asset`); renderAll(); },
    libTopPerf() { libSort = libSort === 'Top performing' ? 'Last updated' : 'Top performing'; libTabK = 'All'; renderAll(); },
    setStudioType(x) { studioType = AST[x] ? x : x === 'One-pager PDF' ? 'PDF one-pager' : 'Whitepaper'; stPillOpen = false; renderAll(); },
    studioGo(text, type) { const v = text || ($('stBrief') && $('stBrief').value) || ''; if (!v.trim()) { toast('Describe what to write first'); return; } const said = /carousel/i.test(v) ? 'Carousel' : /infographic/i.test(v) ? 'Infographic' : /one-pager|\bpdf\b/i.test(v) ? 'PDF one-pager' : /whitepaper/i.test(v) ? 'Whitepaper' : null; const raw = type || said || studioType; startDoc(AST[raw] ? raw : raw === 'One-pager PDF' ? 'PDF one-pager' : /carousel/i.test(raw) ? 'Carousel' : /infographic|image/i.test(raw) ? 'Infographic' : 'Whitepaper', v); const at = obAtt.studio || []; obVal.studio = ''; if (at.length) { S.studio.thread.splice(2, 0, { who: 'ai', kind: 'text', html: 'Also drawing on: ' + at.map(esc).join(', ') + '.' }); obAtt.studio = []; save(); renderAll(); } },
    focusDoc() { if (view() !== 'studio') location.hash = '#studio'; },
    selPara(i) { S.studio.sel = S.studio.sel === i ? null : i; save(); renderAll(); if (S.studio.sel != null) $('composer').focus(); },
    docSet(f, v) { const d = S.studio.doc; d[f] = v; if (f === 'length' && v === 'Short') studioRespond('shorter'); if (f === 'length' && v === 'Long') studioRespond('add a section on lifecycle planning'); if (f === 'tone' && v === 'Formal') studioRespond('formal'); S.studio.thread.push({ who: 'ai', kind: 'text', html: `${f === 'tone' ? 'Tone' : 'Length'} set to ${esc(v.toLowerCase())}. The brand checks still pass.` }); save(); renderAll(); },
    toggleDl() { $('dlMenu').classList.toggle('open'); },
    addToLibrary() { const d = S.studio.doc; window.CONTENT_LIB.add({ id: 'u' + Date.now(), t: d.title, type: d.type, fmt: Object.keys(COMBO[d.type] || {}).slice(0, 2), ind: 'Refining', seg: 'From Content studio', per: d.audience, topicK: 'Need', topic: d.audience, st: isMgr ? 'Completed' : 'To approve', by: me.name, at: 'Just now', used: 0, metric: '–', inC: [], usedBy: [], created: 'Today', age: 0, src: 'Content studio', tpl: d.tplName || '' }, me.name); d.status = 'In Content library'; if (S.ctPending) { const nw = libAll().find(x => x.t === d.title); if (nw) { S.stepCt = S.stepCt || {}; S.stepCt[S.ctPending] = nw.id; S.ctPending = null; setTimeout(() => toast('Also attached to the step you made it for'), 1200); } } S.content.unshift({ id: 'u' + Date.now(), type: d.type, title: d.title, aud: d.audience, status: 'In Content library', seg: 's8', led: 'Available to reps in email and LinkedIn steps', by: first(me.name) }); S.studio.thread.push({ who: 'ai', kind: 'text', html: 'Added to the Content library. Reps can now add it to an email or LinkedIn step in Campaigns, or to a next best action.' }); save(); toast('Added to the Content library'); renderAll(); },
    setOption(id, o) { const a = acct(id); switchOpt(a, o); save(); toast(o === 'run' ? 'Switched to the runner-up: new subject and message' : 'Back to the recommended action and its message'); renderAll(); },
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
  Object.keys(S.mchat || {}).forEach(sessionize);
  try { if (!localStorage.getItem('dmock_open_asset')) { history.replaceState(null, '', '#today'); S.cur = 'home'; } } catch (e) { /* storage blocked */ }
  renderAll();
  try { const oa = localStorage.getItem('dmock_open_asset'); if (oa) { localStorage.removeItem('dmock_open_asset'); setTimeout(() => App.openAsset(oa), 50); } } catch (e) { /* storage blocked */ }
})();
