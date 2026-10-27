/* DemandAI production mock: the sales workspace (rep and manager).
   Every module is chat-based. Today: the chat in the middle, the to-do list beside it. Accounts, Segments, Campaigns and
   Approvals: the module's own chat on the left and its view on the right. Content studio: a "what should we write?" start
   page, then a chat beside the document. Results in any chat (tables, sequences) come back as cards that open in a canvas
   beside the chat. Replies are scripted against mock-data.js. */
(function () {
  const { USERS, REPS, ACCOUNTS, SEGMENTS, LISTS, CONTENT, CAMPAIGNS, REPLIES, BLOCKERS, LEARNED, TEAM_STATS } = window.MOCK;

  /* ─── Session (storage can be blocked; the mock still works without it) ─── */
  const store = {
    get(k, s) { try { return (s ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } },
    set(k, v, s) { try { (s ? sessionStorage : localStorage).setItem(k, v); } catch (e) { /* not saved */ } },
  };
  let me = USERS[store.get('dmock_user') || 'sofia'] || USERS.sofia;
  if (me.role === 'admin') { location.href = 'admin/index.html'; return; }
  const isMgr = me.role === 'manager';
  const STATE_KEY = 'dmock_state_v5_' + me.id;
  let saved = {};
  try { saved = JSON.parse(store.get(STATE_KEY, true) || '{}'); } catch (e) { saved = {}; }
  const S = Object.assign({ chats: null, cur: 'home', mchat: {}, studio: { doc: null, thread: [] }, decisions: {}, todosDone: {}, notes: {}, outcomes: {}, drafts: {}, runs: [], camp: {}, handled: {}, lists: [], read: {}, archived: {}, pseq: {}, cop: {}, seq: {}, content: [], enrollOK: {}, starred: {} }, saved);
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
      { id: 'flow', title: 'Lookalikes of my last 10 wins', when: 'Mon', thread: [{ who: 'me', text: 'Find refiners and petrochem plants like my last 10 wins' }, { who: 'ai', kind: 'prospects', steps: FIND_STEPS() }] },
      { id: 'cedar', title: 'Cedar renewal prep', when: 'Fri', thread: [{ who: 'me', text: 'What should I do with Cedar?' }, { who: 'ai', kind: 'nba', id: 'cedar' }] },
    ];
  }
  let actTab = 'all', anPer = 'week', copOpen = false, pEdit = null, thrId = null, ibCh = 'all', ownerF = 'all', inboxTab = 'all', homeMet = 'team', showProc = false, loadTok = 0, expanded = false, ctx = null, art = null, recId = null, recTab = 'engage', listSel = 'all', campSel = null, campTab = 'enroll', segSel = null, segTab = 'accounts', apprTab = isMgr ? 'needs' : 'todo', apprRep = 'all', scope = isMgr ? 'team' : 'mine', studioTab = 'write', studioType = 'Blog', actOpen = null, artMore = false;

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
    hour: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22"/><path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
  };
  const ic = (n, sz = 15, sw = 2) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
  const chIc = ch => ic(ch === 'LinkedIn' ? 'li' : 'mail', 13);
  const tierBadge = t => t === '—' ? '<span class="muted">—</span>' : `<span class="tier ${t}">${t}</span>`;
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
  const decLabel = d => ({ approved: 'Approved · scheduled', 'with-manager': 'With Pavan', skipped: 'Skipped', 'sent-back': 'Sent back', signed: 'Signed off' }[d] || d);
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
  const listAccounts = () => ACCOUNTS.filter(a => a.fromList === 'L1');

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
    shared.tasks.forEach((x, i) => { if (x.to === me.id) t.push({ id: 'as-' + i, t: x.t, d: x.acc ? acct(x.acc).name : 'Assigned to you', due: x.due, cls: x.due === 'Today' ? 'soon' : 'ok', from: 'Pavan', go: () => x.acc ? openRecord(x.acc, 'engage') : toast('Assigned by Pavan') }); });
    const ready = apprItems('todo').filter(a => !a.nba.reason);
    if (ready.length) t.push({ id: 't2', t: `Approve ${ready.length} ready action${ready.length > 1 ? 's' : ''}`, d: ready.map(a => a.name).join(' · '), due: 'Today 12:00', cls: 'soon', go: () => openMod('approvals') });
    const unsure = apprItems('todo').filter(a => a.nba.reason && !a.nba.sensitive);
    if (unsure.length) t.push({ id: 't3', t: `Review ${unsure.length} item${unsure.length > 1 ? 's' : ''} the AI wasn't sure about`, d: unsure.map(a => `${a.name} · ${reasonOf(a).toLowerCase()}`).join(' · '), due: 'Today 17:00', cls: 'soon', go: () => openMod('approvals') });
    if (!S.camp.c5) t.push({ id: 't6', t: 'Review the draft campaign from your list', d: 'Control-systems hiring surge · 4 touches, email and LinkedIn', due: 'Today', cls: 'soon', go: () => goCampaign('c5', 'steps') });
    const sens = apprItems('todo').filter(a => a.nba.sensitive);
    if (sens.length) t.push({ id: 't4', t: `Check ${sens.length} sensitive message${sens.length > 1 ? 's' : ''} before they go to Pavan`, d: sens.map(a => a.name).join(' · '), due: 'Fri 30 Oct', cls: 'ok', go: () => openRecord(sens[0].id, 'engage') });
    t.push({ id: 't5', t: 'Follow up on Sapphire Aromatics', d: 'Opened the renewal comparison 3 times; no reply yet', due: 'Today', cls: 'ok', go: () => openRecord('sapphire', 'activity') });
    return t;
  }
  function updates() {
    const u = [];
    myReplies().filter(r => r.kind === 'Positive' || r.kind === 'Meeting booked').forEach(r => u.push({ k: 'pos', icon: 'reply', when: r.at, t: `${r.from} ${r.kind === 'Positive' ? 'replied: interested' : 'booked a meeting'}`, d: `${acct(r.acc).name} · ${r.sourceKind === 'Campaign' ? 'campaign' : 'your action'}${isMgr ? ' · ' + first(USERS[r.owner].name) : ''}`, on: `App.openThread('${r.id}')` }));
    if (!S.camp.c1) u.push({ k: 'brand', icon: 'megaphone', when: 'Today 06:05', t: 'New campaign proposed: Turnaround season 2027', d: isMgr ? '11 accounts crossed the threshold. Needs your confirmation.' : '5 of your accounts are in it. Pavan confirms.', on: "App.goCampaign('c1')" });
    u.push({ k: 'info', icon: 'bolt', when: 'Today 06:00', t: isMgr ? '3 accounts moved into tier A' : 'Juniper Petrochem moved into tier A', d: 'New VP Reliability plus pricing-page visits. A warm path was found through a champion who moved.', on: "App.openRecord('juniper','overview')" });
    myBlockers().filter(b => b.k === 'neg').forEach(b => u.push({ k: 'neg', icon: 'alert', when: 'Now', t: b.t, d: b.d, on: b.go ? `App.goTo(${js(b.go)})` : '' }));
    u.push({ k: 'pos', icon: 'megaphone', when: 'Fri 23 Oct', t: 'Control-system renewal: first meeting booked', d: 'Ironwood Refining (Marco). 4 replies from 14 accounts so far.', on: "App.goCampaign('c2')" });
    u.push({ k: 'warn', icon: 'alert', when: 'Thu 22 Oct', t: 'Status watch took 1 account out of a campaign', d: 'Another rep opened an opportunity there. No double outreach.', on: "App.goCampaign('c3')" });
    return u;
  }

  /* ─── Routing: #today or a module; a result or a record opens in the canvas beside the chat ─── */
  const MODULES = Object.assign({ inbox: 'Inbox', accounts: 'Accounts', segments: 'Segments', campaigns: 'Campaigns', actions: 'Next best actions', approvals: 'Approvals', studio: 'Content studio' }, isMgr ? { analytics: 'Analytics' } : {});
  const MOD_IC = { inbox: 'inbox', accounts: 'users', segments: 'layers', campaigns: 'megaphone', actions: 'bolt', approvals: 'task', studio: 'pen', analytics: 'bars' };
  function view() { const r = (location.hash || '').slice(1); return MODULES[r] ? r : null; }
  function go(r) { if (view() === r || (!r && !view())) renderAll(); else location.hash = r ? '#' + r : '#today'; }
  function nav(r) { art = null; recId = null; thrId = null; ctx = null; expanded = false; if (!r) S.cur = 'home'; if (r === 'campaigns') campSel = null; if (r === 'segments') segSel = null; if (r === 'studio') S.studio.doc = null; go(r); }
  function openMod(r) { art = null; recId = null; thrId = null; expanded = true; go(r); }
  window.addEventListener('hashchange', () => renderAll());

  /* ─── Side navigation ─── */
  function renderNav() {
    const v = view(), n = badgeCount();
    $('side').innerHTML = `
      <div class="side-brand"><img src="assets/logo.png" alt=""><div><div class="nm">DemandAI</div><div class="org">Sales workspace</div></div></div>
      <button class="side-new" onclick="App.newChat()">${ic('plus', 14)}<span>New chat</span></button>
      <a class="side-item ${!v ? 'on' : ''}" href="#today" onclick="App.nav(null);return false" title="Today">${ic('home', 16)}<span class="lbl-t">Today</span></a>
      <div class="side-sep"></div>
      <nav class="side-nav" aria-label="Modules">${Object.keys(MODULES).map(k => `<a class="side-item ${v === k ? 'on' : ''}" href="#${k}" onclick="App.nav('${k}');return false" title="${MODULES[k]}">${ic(MOD_IC[k], 16)}<span class="lbl-t">${MODULES[k]}</span>${(k === 'approvals' ? n : k === 'inbox' ? threads().filter(needsReply).length : 0) ? `<span class="cnt">${k === 'approvals' ? n : threads().filter(needsReply).length}</span>` : ''}</a>`).join('')}</nav>
      <div class="side-sec">Recent chats</div>
      <div class="side-recent">${S.chats.map(c => `<button class="${!v && c.id === S.cur ? 'on' : ''}" onclick="App.openChat('${c.id}')" title="${esc(c.title)}">${ic('chat', 13)}<span>${esc(c.title)}</span><i>${esc(c.when)}</i></button>`).join('')}</div>
      <div class="side-foot">
        <div class="side-user">${avatar(me, 30)}<div class="lbl-t"><div class="nm">${esc(me.name)}</div><div class="rl">${isMgr ? 'Sales manager · 4 reps' : 'Sales rep'}</div></div></div>
        <div class="side-links lbl-t"><button onclick="App.switchUser('${isMgr ? 'sofia' : 'pavan'}')">Switch to ${isMgr ? 'Sofia (rep)' : 'Pavan (manager)'}</button><a href="story.html">What we're selling</a><a href="index.html" onclick="App.signOut()">Sign out</a></div>
      </div>`;
  }

  /* ─── Chats: Today sessions, one chat per module, one per document ─── */
  const MOD_INTRO = {
    actions: () => `Every next best action ${isMgr ? 'on the team' : 'on your accounts'}, one account at a time, and how it was delivered: sent, delivered, opened, replied. Campaigns (NBC) are tracked in Campaigns; only the exceptions go to Approvals.`,
    inbox: () => `Replies from email and LinkedIn in one place${isMgr ? ', for the whole team' : ''}. Each comes with a suggested answer; when someone replies, their remaining campaign steps pause.`,
    analytics: () => 'How the team is doing against the pilot targets: the funnel, each rep, each campaign, and what the system learned. Pick a rep to see their numbers.',
    accounts: () => `This is every account ${isMgr ? 'on the team' : 'you own'}, ranked by Fit × Timing. Saved lists are the tabs above the table. Ask me to find more, score a list, or save what you're looking at.`,
    segments: () => 'Accounts grouped by why they\'re ready. Campaign segments (NBC) run as one sequence; the rest are next best actions (NBA). Open one, or ask me.',
    campaigns: () => `${CAMPAIGNS.filter(c => c.status === 'Running').length} campaigns running, ${CAMPAIGNS.filter(c => /Ready|Draft/.test(c.status)).length} waiting to start. Email and LinkedIn only. Ask me to build one, change a sequence, or explain the results.`,
    approvals: () => !isMgr ? 'Next best actions go ahead on their own when they pass every check. Only the ones that don\'t come here, with the reason. Ask me why any item is here.' : isMgr ? 'Sensitive messages and campaigns wait here for you. Ask me why any item needs a person.' : 'Only the items that need you. Everything else went ahead on its own. Ask me why any item is here.',
  };
  const MOD_HINTS = {
    inbox: ['Any replies?', 'Which replies are objections?', 'Draft a reply to Dian with 3 times next week', 'What should I do with Greystone?'],
    analytics: ['How is my team doing?', 'Where is the funnel leaking?', 'Which campaigns work best?', 'What did we learn this week?'],
    accounts: ['Find prospects like my last 10 wins', 'Score this list', 'Save as a list', 'Who should I call first?'],
    segments: ['Which segments are campaigns?', 'Create micro-segments', 'What\'s close to becoming a campaign?', 'Why is Juniper ranked first?'],
    campaigns: ['How are the campaigns doing?', 'Build the campaign', 'Add a LinkedIn touch to the turnaround campaign', 'Any replies?'],
    actions: ['How are my next best actions doing?', 'Which ones bounced?', 'What went ahead today?', 'Which segments are campaigns?'],
    approvals: ['What needs me?', 'What went ahead today?', 'Why is Cedar here?', 'Any blockers?'],
  };
  function chat() {
    const v = view();
    if (v === 'studio') return S.studio.doc ? S.studio : null;
    if (v) { if (!S.mchat[v]) S.mchat[v] = { title: `${MODULES[v]} chat`, thread: [{ who: 'ai', kind: 'modIntro', v }] }; return S.mchat[v]; }
    if (S.cur === 'home') return null;
    return S.chats.find(c => c.id === S.cur) || S.chats[0];
  }
  const lastKind = () => { const c = chat(); const t = c ? c.thread.filter(m => m.who === 'ai') : []; return t.length ? t[t.length - 1].kind : null; };
  const NEXT = { prospects: ['Score this list', 'Save as a list'], rankedList: ['Route to NBA and NBC', 'Save the scored list'], listSegments: ['Approve all ready', 'Send the campaign to Pavan'], nbaList: ['Build the campaign', 'How are the campaigns doing?'], flowCampaign: ['How are the campaigns doing?', 'What did we learn this week?'], campaigns: ['What did we learn this week?', 'Any replies?'] };
  function hints() {
    const v = view(), nx = NEXT[lastKind()] || [];
    if (v === 'studio') return ['Make it shorter', 'Add proof', 'More formal', 'Rewrite the intro', 'Add a section on lifecycle planning'];
    const base = v ? MOD_HINTS[v] : isMgr ? ['How is my team doing?', 'How are the campaigns doing?', 'Which segments are campaigns?', 'What needs my approval?', 'Find prospects like our last 10 wins']
      : ['Find prospects like my last 10 wins', 'What should I do first today?', 'How are the campaigns doing?', 'Which segments are campaigns?', 'Write a blog on planning a control system migration'];
    return nx.concat(base.filter(b => !nx.includes(b))).slice(0, v ? 4 : 5);
  }
  function renderChat() {
    const c = chat(), v = view();
    if (!c) { $('chat').innerHTML = ''; return; }
    $('chat').innerHTML = `
      <div class="chat-h">
        <span class="ai-mark">${ic('spark', 13)}</span>
        <div class="ttl">${v === 'studio' ? `<button class="back-l" onclick="App.nav('studio')">${ic('left', 13)} Content studio</button>` : esc(c.title)}</div>
        <div class="sp"></div>
        ${v && v !== 'studio' && !expanded ? `<button class="btn sm" onclick="App.expand()">${ic('expand', 12)} Open ${MODULES[v]}</button>` : ''}
        <button class="ic-btn" title="${v && v !== 'studio' ? 'Clear this chat' : 'New chat'}" onclick="App.newChat()">${ic('plus', 15)}</button>
      </div>
      <div class="thread" id="thread"><div class="thread-in">${c.thread.map(renderMsg).join('')}</div></div>
      <div class="composer-wrap">
        <div class="hints">${hints().map(h => `<button class="chip" onclick="App.ask(${js(h)})">${esc(h)}</button>`).join('')}</div>
        <div class="composer">
          <div class="ctx" id="ctx">${ctxChip()}</div>
          <label class="sr" for="composer">Message DemandAI</label>
          <textarea id="composer" rows="1" placeholder="${v === 'studio' ? (S.studio.sel != null ? 'Change this paragraph…' : 'Ask for a change…') : v ? `Ask about ${MODULES[v].toLowerCase()}…` : 'Find, score, segment, act, track… type @ to add an account'}" onkeydown="App.key(event)" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
          <div class="composer-f">
            ${v === 'studio' ? '' : `<button class="ic-btn" title="Add an account" onclick="App.focusComposer('@')">@</button>`}
            <span class="muted" style="font-size:11px">${v === 'studio' ? 'Only approved sources are cited. Every change runs the brand checks.' : 'Scripted demo · nothing is sent'}</span>
            <div class="sp"></div>
            <button class="send" onclick="App.send()" title="Send">${ic('send', 16)}</button>
          </div>
        </div>
      </div>`;
    const th = $('thread'); th.scrollTop = th.scrollHeight;
  }
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
    prospects: () => ({ title: 'Lookalikes of your last 10 wins', rows: listAccounts(), cols: ['company', 'contact', 'title', 'country', 'size', 'industry', 'identity', 'linkedin'] }),
    scored: () => ({ title: 'Lookalikes of your last 10 wins · scored', rows: listAccounts().slice().sort((p, q) => q.score - p.score), cols: ['company', 'tier', 'score', 'fit', 'timing', 'whynow', 'owner', 'contact'] }),
    segmented: () => ({ title: 'Lookalikes of your last 10 wins · by micro-segment', rows: listAccounts().slice().sort((p, q) => (p.seg || 'z').localeCompare(q.seg || 'z')), cols: ['company', 'segment', 'mode', 'tier', 'score', 'contact', 'owner'] }),
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
    segment: ['Micro-segment', a => a.seg ? esc(a.segment) : '<span class="muted">—</span>'],
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
          <div class="ccard-f">${isMgr && !S.camp.c1 ? '<button class="btn sm pri" onclick="App.confirmCampaign(\'c1\')">Confirm campaign</button><button class="btn sm" onclick="App.toast(\'Kept as 11 separate next actions (mock)\')">Send as separate actions</button>' : !isMgr && !S.camp.c1 ? '<span class="muted" style="font-size:11.5px">Pavan confirms campaigns.</span><button class="btn sm" onclick="App.toast(\'Your accounts were taken out; they get their own actions (mock)\')">Take mine out</button>' : ''}<div style="flex:1"></div>${openBtn('Review the sequence', "App.goCampaign('c1','steps')")}</div></div>
        ${m && m.home ? '' : '<p style="margin-top:8px">I can run the whole flow here: find prospects, score them, build micro-segments, prepare next actions and campaigns, then track them. Try "Find prospects like my last 10 wins".</p>'}`;
    },
    prospects: () => `<p>I found <b>24 people at ${listAccounts().length} accounts</b> that match your ICP and look like your recent wins. <b>2 are held</b> for a person to check, and I removed 4 existing customers.</p>${tableCard('prospects')}<div class="next-row">${btn('Score this list', 'Score this list', true)}${btn('Save as a list', 'Save as a list')}</div>`,
    savedList: m => `<p>Saved as <b>${esc(m.name)}</b>. It's a tab in Accounts now, ready to score, segment or use in a campaign.</p><div class="next-row">${openBtn('Open in Accounts', `App.openList('${m.id}')`)}${btn(m.next || 'Score this list', m.next || 'Score this list', true)}</div>`,
    rankedList: () => { const ls = listAccounts().slice().sort((p, q) => q.score - p.score), n = ls.filter(a => a.score > 0).length; return `<p>Scored with the Score flow. ${n} of ${ls.length} have a live signal; the one with none scores zero and stays watched. Here's the process, with the top account worked through:</p>${scoreProcess(ls[0])}${tableCard('scored')}<div class="next-row">${btn('Route to NBA and NBC', 'Route to NBA and NBC', true)}${btn('Save the scored list', 'Save the scored list')}</div>`; },
    listSegments: () => {
      const accs = listAccounts(), c = campOf('c5'), nbc = accs.filter(a => a.campaign === 'c5'), nba = accs.filter(a => a.nba && a.campaign !== 'c5'), watch = accs.filter(a => !a.nba && !a.campaign);
      return `<p>Grouped the scored list by each account's strongest trigger, then routed it. <b>${nbc.length} accounts share a control-systems hiring surge</b>, which crosses the threshold (10 in 7 days), so they go to <b>one campaign (NBC)</b>. <b>${nba.length}</b> get their own <b>next best action (NBA)</b>${watch.length ? `; ${watch.length} with no live signal stay${watch.length === 1 ? 's' : ''} watched` : ''}.</p>
        <div class="route">
          <div class="route-col"><div class="route-h"><span class="badge b-brand">NBC · one campaign</span><b>${nbc.length} accounts</b></div>
            <div class="nm">${esc(c.name)}</div><div class="touch-mini">${seqOf(c).map(t => `<span>${chIc(t.ch)} <b>Day ${t.day}</b> ${esc(t.fmt)}</span>`).join('')}</div>
            <div class="sm">${nbc.slice(0, 4).map(a => esc(a.name)).join(', ')}${nbc.length > 4 ? ` and ${nbc.length - 4} more` : ''}</div>
            <div class="next-row">${openBtn('Open campaign', "App.goCampaign('c5')")}${isMgr ? `<button class="btn sm pri" onclick="App.confirmCampaign('c5')">Confirm</button>` : S.camp.c5 ? `<span class="badge b-ter">${esc(S.camp.c5)}</span>` : `<button class="btn sm pri" onclick="App.sendForConfirm('c5')">Send to Pavan</button>`}</div></div>
          <div class="route-col"><div class="route-h"><span class="badge b-sec">NBA · one at a time</span><b>${nba.length} accounts</b></div>
            ${nba.map(a => `<div class="mini-row row-link" onclick="App.openRecord('${a.id}','engage')">${chIc(a.nba.channel)}<div class="grow"><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.nba.action)}</div></div>${stepBadge(a)}</div>`).join('')}
            <div class="next-row">${isMgr ? '' : '<button class="btn sm pri" onclick="App.approveAll()">Approve all ready</button>'}${openBtn('Approvals', "App.openMod('approvals')")}</div></div>
        </div>${tableCard('segmented')}`;
    },
    nbaList: () => {
      const accs = listAccounts().filter(a => a.nba);
      return `<p>Next best actions for the ${accs.length} list accounts that aren't in the campaign. Each has a contact, a channel and a draft; the ones on a proven message go ahead on their own.</p>
        <div class="ccard"><div class="ccard-b" style="padding:2px 14px">${accs.map(a => `<div class="mini-row row-link" onclick="App.openRecord('${a.id}','engage')">${chIc(a.nba.channel)}<div class="grow"><div class="nm">${esc(a.name)} <span class="muted" style="font-weight:400">· ${esc(a.contact.name)}</span></div><div class="sm">${esc(a.nba.action)} · ${esc(a.segment)}</div></div>${stepBadge(a)}</div>`).join('')}</div></div>
        <div class="next-row">${btn('Build the campaign', 'Build the campaign', true)}${openBtn('Approvals', "App.openMod('approvals')")}</div>`;
    },
    flowCampaign: () => seqCard(campOf('c5'), `Here's the campaign for the 10 hiring-surge accounts: <b>${seqOf(campOf('c5')).length} touches</b>, email and LinkedIn, personalised per person. Add, remove, reorder or rewrite any touch.`),
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
      return `<p>Segments with <b>10 or more accounts in 7 days</b> run as a campaign once ${isMgr ? 'you confirm' : 'Pavan confirms'}. The rest are next best actions, one account at a time. Sensitive segments never become campaigns.</p>
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
    help: () => `<p>I can run the whole flow. Try:</p><div class="hints" style="margin:4px 0">${['Find prospects like my last 10 wins', 'Score this list', 'Create micro-segments', 'Prepare the next actions', 'Build the campaign', 'How are the campaigns doing?', 'What did we learn this week?', 'Write a blog on planning a control system migration'].map(h => `<button class="chip" onclick="App.ask(${js(h)})">${esc(h)}</button>`).join('')}</div>`,
  };
  function modCard(v) {
    const card = (title, count, rows) => `<div class="tcard"><div class="tcard-h"><span class="t">${ic(MOD_IC[v], 15)} ${title}</span><span class="muted" style="font-size:12px;white-space:nowrap">${count}</span><div class="sp"></div><button class="ic-btn" title="Open beside the chat" onclick="App.expand()">${ic('expand', 15)}</button></div><div style="padding:2px 14px">${rows}</div><button class="tcard-more" onclick="App.expand()">Open ${MODULES[v]} beside the chat ${ic('expand', 12)}</button></div>`;
    if (v === 'accounts') { const acc = ACCOUNTS.filter(mine).filter(a => a.score > 0).sort((p, q) => q.score - p.score); return card(isMgr ? 'Team accounts' : 'Your accounts', `${acc.length} with a live signal · ${S.lists.length + LISTS.length} saved lists`, acc.slice(0, 5).map(a => `<div class="mini-row row-link" onclick="App.openRecord('${a.id}','overview')">${tierBadge(a.tier)}<div class="grow"><div class="nm">${esc(a.name)} <span class="muted" style="font-weight:400">· ${esc(a.contact.name)}</span></div><div class="sm">${a.whyNow ? esc(a.whyNow.type) + ' · ' + ago(a.whyNow.age) : ''}</div></div>${stepBadge(a)}</div>`).join('')); }
    if (v === 'segments') return card('Micro-segments', `${SEGMENTS.length} segments`, SEGMENTS.slice(0, 6).map(s => `<div class="mini-row row-link" onclick="App.openSegment('${s.id}')"><div class="grow"><div class="nm">${esc(s.name)}</div><div class="sm">${ACCOUNTS.filter(a => a.seg === s.id).length} accounts · ${esc(s.trigger)}</div></div>${modeBadge(s)}</div>`).join(''));
    if (v === 'campaigns') return card('Campaigns', `${CAMPAIGNS.length} campaigns`, CAMPAIGNS.map(c => `<div class="mini-row row-link" onclick="App.goCampaign('${c.id}')"><div class="grow"><div class="nm">${esc(c.name)}</div><div class="sm">${esc(progressText(c))}</div></div>${campBadge(c)}</div>`).join(''));
    if (v === 'inbox') { const th = threads(); return card('Inbox', `${th.filter(needsReply).length} need a reply`, th.slice(0, 6).map(r => `<div class="mini-row row-link" onclick="App.openThread('${r.id}')">${chIc(r.ch)}<div class="grow"><div class="nm">${esc(r.from)} <span class="muted" style="font-weight:400">· ${esc(acct(r.acc).name)}</span></div><div class="sm">"${esc(r.text)}"</div></div><span class="badge ${KIND_B[r.kind]}">${r.kind}</span></div>`).join('') || '<div class="empty">No replies yet.</div>'); }
    if (v === 'analytics') return card('Pilot week 3', 'whole team', (sum => [['Meetings this week', `${sum('meetings')} / ${sum('target')}`], ['Reply rate', pct(sum('replies'), sum('sent'))], ['Accepted first time', Math.round(sum('accept') / REPS.length) + '%'], ['Overdue items', sum('overdue')]])(k => REPS.reduce((x, r) => x + TEAM_STATS[r][k], 0)).map(([k, x]) => `<div class="mini-row"><div class="grow nm">${k}</div><b class="mono">${x}</b></div>`).join(''));
    if (v === 'actions') { const all = nbaRows(), d = all.filter(a => track(a).stage >= 2).length, o = all.filter(a => track(a).stage >= 3).length; return card('Next best actions', `${all.length} this week · ${d} delivered · ${o} opened`, all.slice(0, 6).map(a => { const t = track(a); return `<div class="mini-row row-link" onclick="App.openRecord('${a.id}','engage')">${chIc(a.nba.channel)}<div class="grow"><div class="nm">${esc(a.name)} <span class="muted" style="font-weight:400">· ${esc(a.contact.name)}</span></div><div class="sm">${esc(a.nba.action)}</div></div><span class="badge ${t.cls}">${esc(t.label)}</span></div>`; }).join('')); }
    const items = apprItems(isMgr ? 'needs' : 'todo');
    return card('Needs you', `${items.length} waiting`, items.length ? items.map(apprMini).join('') : '<div class="empty">Nothing is waiting for you.</div>');
  }
  function seqCard(c, intro) {
    return `<p>${intro}</p><div class="ccard"><div class="ccard-h"><span class="t">${ic('megaphone', 14)} ${esc(c.name)}</span>${campBadge(c)}</div><div class="ccard-b" style="padding:2px 14px">
      ${seqOf(c).map((t, i) => `<div class="mini-row">${chIc(t.ch)}<div class="grow"><div class="nm">Step ${i + 1} · Day ${t.day} · ${t.ch} · ${esc(t.fmt)}</div><div class="sm">${esc(t.t)}</div></div></div>`).join('')}</div>
      <div class="ccard-f">${openBtn('Edit the steps', `App.goCampaign('${c.id}','steps')`)}${c.status === 'Running' || c.status === 'Completed' || S.camp[c.id] ? '' : isMgr ? `<button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm campaign</button>` : c.status === 'Draft' ? `<button class="btn sm pri" onclick="App.sendForConfirm('${c.id}')">Send to Pavan to confirm</button>` : ''}</div></div>`;
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
        <div class="ccard-f">${a.nba.status === 'sent' || a.nba.status === 'auto' ? `<span class="badge b-sec">${a.nba.status === 'sent' ? esc(a.outcome || 'Sent') : 'Went ahead on its own'}</span>` : dec ? `<span class="badge b-grey nodot">${decLabel(dec)}</span>` : `<button class="btn sm pri" onclick="App.approve('${a.id}')">${a.nba.sensitive && !isMgr ? 'Approve → to Pavan' : a.nba.sensitive ? 'Sign off' : 'Approve'}</button>`}
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
    if (v === 'studio') return studioRespond(t, text);
    const tch = t.match(/add an? (email|linkedin) (touch|step)/);
    if (tch) {
      const cid = findCampaign(t) || campSel || 'c5', ch = tch[1] === 'email' ? 'Email' : 'LinkedIn';
      editSeq(cid, (sq, c) => sq.push(newTouch(sq, c, ch)));
      return { kind: 'seqChanged', id: cid, note: `Added a ${ch} step at the end of <b>${esc(campOf(cid).name)}</b>. The brand checks still pass. Open the steps to edit the wording.` };
    }
    if (/remove (the )?(last )?(touch|step)/.test(t)) { const cid = findCampaign(t) || campSel || 'c5'; editSeq(cid, sq => { const i = sq.map(x => !/Sent|Done/.test(x.state || '')).lastIndexOf(true); if (i >= 0) sq.splice(i, 1); }); return { kind: 'seqChanged', id: cid, note: `Removed the last unsent step from <b>${esc(campOf(cid).name)}</b>.` }; }
    if (/save (as a |the )?(scored )?list|save it/.test(t)) {
      const scored = /scored/.test(t) || lk === 'rankedList';
      const name = scored ? 'Lookalikes of my last 10 wins · scored 27 Oct' : 'Lookalikes of my last 10 wins · 27 Oct';
      return { kind: 'savedList', id: addList(name, scored ? 'Scored list' : 'Prospect list', scored ? '16 of 17 accounts with a live signal, ranked' : '24 people at 17 accounts', listAccounts().map(a => a.id)), name, next: scored ? 'Create micro-segments' : 'Score this list' };
    }
    if (/score (this|the|that|these|them)|rank (this|them|these)|score (my )?list/.test(t)) return { kind: 'rankedList', steps: ['Collected live signals for the 17 list accounts from 23 sources', 'Qualified 21 of 30 signals: observable, predictive, time-bound', 'Weighed by tier (100 / 60 / 30) and applied decay', 'Stacked into Timing: strongest + ½ second + ¼ third', 'Fit × Timing = Score, then tiers A / B / C'] };
    if (/send (the campaign|it) to pavan/.test(t)) { S.camp.c5 = 'Sent for confirmation'; return { kind: 'text', html: 'Sent <b>Control-systems hiring surge</b> to Pavan to confirm. You\'ll see it in Today once he decides.' }; }
    if (/confirm the campaign/.test(t) && isMgr) { S.camp.c5 = 'Confirmed'; return { kind: 'text', html: 'Confirmed <b>Control-systems hiring surge</b>. Step 1 goes out tomorrow 09:00 (placeholder: nothing is sent).' }; }
    if (/objection/.test(t)) { const ob = threads().filter(r => r.kind === 'Objection'); return { kind: 'text', html: ob.length ? `${ob.length} objection${ob.length > 1 ? 's' : ''}: ${ob.map(r => `<a href="#inbox" onclick="App.openThread('${r.id}');return false">${esc(r.from)} · ${esc(acct(r.acc).name)}</a>`).join(', ')}. Each has a suggested reply that doesn't push.` : 'No objections right now.' }; }
    if (/funnel|leak/.test(t)) return { kind: 'text', html: 'The biggest drop is <b>with a live signal → contacted</b>: 33 accounts had a signal but only 24 were contacted within 2 days, mostly because 3 rep mailboxes aren\'t connected. Replies to positive is healthy (8 of 15).' };
    if (/route|nba and nbc|nbc and nba|micro|segment (this|the|them)|create.*segment|group (this|them|the list)/.test(t)) return { kind: 'listSegments', steps: ['Tagged each account by its strongest trigger', 'Checked each micro-segment against the campaign threshold (10 in 7 days)', 'Routed: 10 accounts → one campaign (NBC), 6 → next best actions (NBA)', 'Drafted the campaign sequence and the next actions · brand checks passed'] };
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
    if (/next best actions doing|how are my (next|actions)|nba.*(doing|deliver)|bounc/.test(t)) { const all = nbaRows(), T = track, b = all.filter(a => T(a).cls === 'b-neg'); if (/bounc/.test(t)) return { kind: 'text', html: b.length ? `${b.length} bounced: ${b.map(a => `<a href="#actions" onclick="App.openRecord('${a.id}','engage');return false">${esc(a.contact.name)} · ${esc(a.name)}</a>`).join(', ')}. The address is being re-checked with the second provider before a retry.` : 'Nothing bounced.' }; return { kind: 'text', html: `${all.length} next best actions this week: ${all.filter(a => T(a).how === 'Went ahead on its own').length} went ahead on their own, ${all.filter(a => T(a).stage === 0).length} wait for approval. ${all.filter(a => T(a).stage >= 2).length} delivered, ${all.filter(a => T(a).stage >= 3).length} opened, ${all.filter(a => T(a).stage >= 4).length} replied, ${b.length} bounced. <a href="#actions" onclick="App.openMod('actions');return false">Open Next best actions</a>` }; }
    if (/went ahead/.test(t)) { const w = apprItems('ahead'); return { kind: 'text', html: `${w.length} next best actions went ahead on their own${isMgr ? ' across the team' : ''}, because they passed all six checks: ${w.slice(0, 5).map(a => `<a href="#approvals" onclick="App.openRecord('${a.id}','engage');return false">${esc(a.name)}</a>`).join(', ')}${w.length > 5 ? ' and more' : ''}.` }; }
    if (/approv|waiting|needs me|needs my/.test(t) && !/approve all/.test(t)) return { kind: 'approvalsList' };
    if (/campaign|sequence|turnaround/.test(t)) return { kind: 'campaign', id: findCampaign(t) || 'c1' };
    if (/learn|worked|working|what changed|readout/.test(t)) return { kind: 'learned', steps: ['Read 214 outcomes logged this month (wins and misses)', 'Re-ran pattern promotion and demotion', 'Compared signal sources by conversion'] };
    if (/to ?do|what should i do first|my day|first today/.test(t)) return { kind: 'todo' };
    if (/approve all/.test(t)) { approveAll(true); return { kind: 'text', html: 'Done. Every ready, high-confidence item is approved and scheduled for the next send window (a placeholder in the mock).' }; }
    if (/find|prospect|look ?alike|new accounts|like my|like our|more accounts/.test(t)) return { kind: 'prospects', steps: FIND_STEPS() };
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
    if (!view() && S.cur === 'home') { const id = 'n' + Date.now(); S.chats.unshift({ id, title: 'New chat', when: 'Now', thread: [] }); S.cur = id; renderAll(); }
    const c = chat();
    if (!c) return;
    c.thread = c.thread.filter(m => m.who !== 'typing');
    if (c.title === 'New chat') c.title = text.length > 38 ? text.slice(0, 36) + '…' : text;
    c.thread.push({ who: 'me', text });
    const reply = respond(text);
    const steps = reply.steps || [];
    save(); renderAll();
    const finish = () => { c.thread = c.thread.filter(m => m.who !== 'typing'); const m = Object.assign({ who: 'ai', fresh: true }, reply); c.thread.push(m); save(); renderAll(); m.fresh = false; };
    const box = document.querySelector('#thread .thread-in'), th = $('thread');
    if (!box) { finish(); return; }
    /* Steps appear one by one in place, then the answer fades in: no full redraw while thinking */
    const el = document.createElement('div');
    el.className = 'msg think';
    el.innerHTML = `<span class="ai-av pulse">${ic('spark', 14)}</span><div class="bub"><div class="steps live"></div></div>`;
    box.appendChild(el);
    const list = el.querySelector('.steps');
    const tickAll = () => list.querySelectorAll('.typing').forEach(x => { x.outerHTML = '<span class="ok">✓</span>'; });
    const row = txt => { tickAll(); const d = document.createElement('div'); d.className = 'st'; d.innerHTML = `<span class="typing"><i></i><i></i><i></i></span><span>${txt}</span>`; list.appendChild(d); th.scrollTop = th.scrollHeight; };
    row(steps.length ? steps[0] : 'Thinking…');
    let i = 1;
    const tick = () => { if (i < steps.length) { row(steps[i++]); setTimeout(tick, 420); return; } tickAll(); setTimeout(finish, 240); };
    setTimeout(tick, steps.length ? 420 : 520);
  }

  /* ─── Campaign sequences: email and LinkedIn steps, personalised per person ─── */
  const FORMATS = { Email: ['Plain text', 'Case study', 'Comparison document', 'Checklist', 'Infographic', 'Whitepaper'], LinkedIn: ['Connection request', 'Message', 'Comment on their post', 'Carousel post'] };
  function seqOf(c) { return S.seq[c.id] || c.touches.map(t => ({ day: t.day, ch: t.ch, fmt: t.fmt, subject: t.subject || (t.ch === 'Email' ? c.name : ''), t: t.t, state: t.state })); }
  const sent = t => /Sent|Done/.test(t.state || '');
  function newTouch(sq, c, ch) { const last = sq.length ? sq[sq.length - 1].day : 0; return { day: last + 4, ch, fmt: FORMATS[ch][ch === 'LinkedIn' ? 1 : 0], subject: ch === 'Email' ? c.name + ': a last note' : '', t: ch === 'LinkedIn' ? 'Short follow-up on LinkedIn, referencing the earlier steps.' : 'A final, short note: offer a 20-minute call and make it easy to say no.', state: '' }; }
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
    if (S.camp[c.id] === 'Sent for confirmation') return 'Sent to Pavan to confirm';
    if (c.status === 'Draft') return `Draft from a prospect list · ${c.accounts.length} people · needs a review`;
    if (c.status === 'Ready to confirm') return `${c.accounts.length} people held · needs ${isMgr ? 'your' : 'Pavan\'s'} confirmation`;
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
          <div class="composer"><div class="ctx" id="ctx">${ctxChip()}</div><label class="sr" for="composer">Message DemandAI</label>
            <textarea id="composer" rows="2" placeholder="Find, score, segment, act, track… type @ to add an account" onkeydown="App.key(event)" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
            <div class="composer-f"><button class="ic-btn" title="Add an account" onclick="App.focusComposer('@')">@</button><span class="muted" style="font-size:11px">Scripted demo · nothing is sent</span><div class="sp"></div><button class="send" onclick="App.send()" title="Send">${ic('send', 16)}</button></div></div></div>
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
  function scoreProcess(a) {
    const sig = a ? a.signals.slice().sort((p, q) => q.weight - p.weight) : [];
    return `<div class="ccard proc"><div class="ccard-h"><span class="t">${ic('layers', 14)} How the score is calculated</span><span class="muted" style="font-size:11px">thresholds v2026.10</span></div>
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
      </div></div>`;
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
        <div class="ibx-lh"><div class="search">${ic('search', 14)}<label class="sr" for="ibQ">Search mail</label><input id="ibQ" placeholder="Search mail" value="${esc(q)}" oninput="App.renderAll()"></div></div>
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
            <button class="btn" onclick="App.handleReply('${r.id}','Marked as handled')">Mark handled</button>
            ${r.kind === 'Out of office' ? `<button class="btn pri" onclick="App.handleReply('${r.id}','Steps resume on 4 Nov')">Resume on 4 Nov</button>` : `<button class="btn pri" onclick="App.saveThread('${r.id}');App.handleReply('${r.id}','Reply sent (placeholder: nothing is sent)')">${ic('plane', 13)} Send</button>`}</div></div>`}
      </div>`;
  }

  /* ─── Analytics (sales manager) ─── */
  function renderAnalytics() {
    const reps = ownerF === 'all' ? REPS : [ownerF], sum = k => reps.reduce((n, r) => n + TEAM_STATS[r][k], 0);
    /* A dashboard page, not a chat: the important numbers first as cards, then the detail */
    $('main').className = 'an-pg';
    $('main').innerHTML = `<div class="an-h"><div><h1>Analytics</h1><div class="sub">Pilot week 3 · ${ownerF === 'all' ? 'whole team' : esc(USERS[ownerF].name)} · ${anPer === 'week' ? 'Mon 26 Oct – Sun 1 Nov' : 'October 2026'}</div></div><div class="an-ctl"><div class="seg">${[['week', 'This week'], ['month', 'This month']].map(([k, l]) => `<button class="${anPer === k ? 'on' : ''}" onclick="App.setAnPer('${k}')">${l}</button>`).join('')}</div>${ownerSel()}</div></div><div class="an-b" id="cv"></div>`;
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
  function ownerSel() { return isMgr ? `<label class="sr" for="ownF">Rep</label><select class="sel" id="ownF" onchange="App.setOwner(this.value)"><option value="all">All reps</option>${REPS.map(r => `<option value="${r}" ${ownerF === r ? 'selected' : ''}>${esc(USERS[r].name)}</option>`).join('')}</select>` : ''; }
  function skeleton() {
    $('main').className = 'canvas';
    $('main').innerHTML = `<div class="cv-h"><div class="sk" style="width:220px;height:20px"></div><div class="sk" style="width:90px;height:28px"></div></div><div class="cv-b"><div class="mcards">${'<div class="sk" style="height:84px"></div>'.repeat(5)}</div><div class="sk" style="height:20px;width:180px;margin:22px 0 12px"></div>${'<div class="sk" style="height:46px;margin-bottom:8px"></div>'.repeat(6)}</div>`;
  }

  /* ─── Module and canvas frames ─── */
  function frame(title, sub, actions, closable) {
    $('main').className = 'canvas';
    $('main').innerHTML = `<div class="cv-h"><div class="cv-ht"><div class="cv-t">${title}</div>${sub ? `<div class="cv-s">${sub}</div>` : ''}</div><div class="cv-a">${actions || ''}<button class="ic-btn" onclick="App.closeCanvas()" title="Close">${ic('x', 16)}</button></div></div><div class="cv-b" id="cv"></div>`;
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
      ${showProc ? scoreProcess(rows.find(a => a.score > 0)) : ''}
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Account</th><th>Person</th><th>Tier</th><th>Score</th><th>Why now</th><th>Micro-segment</th>${isMgr ? '<th>Owner</th>' : ''}<th>Status</th></tr></thead><tbody>
        ${rows.map((a, i) => `<tr class="row-link" onclick="App.openRecord('${a.id}','overview')"><td class="mono muted">${i + 1}</td><td><div class="nm">${esc(a.name)}</div><div class="sm">${esc(a.industry)} · ${esc(a.country)}</div></td><td>${esc(a.contact.name)}<div class="sm">${esc(a.contact.title)}</div></td><td>${tierBadge(a.tier)}</td><td class="mono">${sc(a)}</td><td>${a.whyNow ? `${esc(a.whyNow.type)}<div class="sm">${ago(a.whyNow.age)}</div>` : '<span class="muted">No live signal</span>'}</td><td>${a.seg ? `<span class="seg-link" onclick="event.stopPropagation();App.openSegment('${a.seg}')">${esc(a.segment)}</span>` : '—'}</td>${isMgr ? `<td>${esc(first(USERS[a.owner].name))}</td>` : ''}<td>${stepBadge(a)}</td></tr>`).join('')}</tbody></table></div>`;
    const s = $('accQ'); if (q) { s.focus(); s.setSelectionRange(q.length, q.length); }
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

  /* Segments: list → segment detail → person drawer → activity */
  function segStats(s) {
    const accs = ACCOUNTS.filter(a => a.seg === s.id), my = accs.filter(mine);
    return { total: accs.length, mine: my.length, waiting: accs.filter(a => a.nba && /ready|review/.test(a.nba.status) && !S.decisions[a.id]).length, ahead: accs.filter(a => a.nba && /auto|sent/.test(a.nba.status)).length, replies: REPLIES.filter(r => acct(r.acc).seg === s.id).length };
  }
  function renderSegments() {
    if (segSel) return renderSegment();
    const cv = frame('Micro-segments', `${SEGMENTS.length} segments`, `<button class="btn sm pri" onclick="App.ask('Create micro-segments')">${ic('spark', 13)} Segment a list</button>`);
    cv.innerHTML = `<div class="toolbar">${ownerSel()}${filt('Campaign · NBC', '', false)}${filt('My actions · NBA', '', false)}${filt('Building', '', false)}<div class="search" style="margin-left:auto">${ic('search', 14)}<input placeholder="Search…" aria-label="Search segments"></div></div>
      <div class="rule"><b>Campaign or my action?</b> 10 or more accounts in one segment within 7 days become a campaign (NBC) once ${isMgr ? 'you confirm' : 'Pavan confirms'}. Fewer, and each account gets its own next best action (NBA). Sensitive segments never become campaigns.</div>
      <div class="srow-list">${SEGMENTS.map(s => { const st = segStats(s), c = s.campaign ? campOf(s.campaign) : null; return `<div class="srow" onclick="App.openSegment('${s.id}')">
        <div class="srow-n"><div class="nm">${esc(s.name)} ${modeBadge(s)}</div><div class="sm">${esc(s.trigger)} · ${c ? `${esc(campStatus(c))} · ${seqSpan(c)}` : s.mode === 'Building' ? `${s.building} of 10 toward a campaign` : `${s.proven.toLowerCase()} message`}${s.sensitive ? ' · sensitive' : ''}</div></div>
        <div class="srow-m"><div><b>${isMgr ? st.total : st.mine}</b><span>${isMgr ? 'Accounts' : `Yours of ${st.total}`}</span></div><div><b>${st.waiting}</b><span>Waiting on you</span></div><div><b>${st.ahead}</b><span>Went ahead</span></div><div><b>${s.rate ? s.rate + '%' : '--'}</b><span>Positive rate</span></div><div><b>${st.replies}</b><span>Replies</span></div></div>
        <button class="ic-btn" title="Star" onclick="event.stopPropagation();App.star('${s.id}')" style="color:${S.starred[s.id] ? 'var(--ter)' : 'inherit'}">${ic('star', 15)}</button></div>`; }).join('')}</div>`;
  }
  function renderSegment() {
    const s = segOf(segSel), c = s.campaign ? campOf(s.campaign) : null, st = segStats(s);
    const accs = ACCOUNTS.filter(a => a.seg === s.id && visible(a)).sort((p, q) => q.score - p.score);
    const cv = frame(`<button class="back-l" onclick="App.openSegment(null)">${ic('left', 14)}</button> ${esc(s.name)} ${modeBadge(s)}`, `${esc(s.trigger)} · ${st.total} accounts${s.fromList ? ' · from a prospect list' : ''}`, c ? `<button class="btn sm pri" onclick="App.goCampaign('${c.id}')">${ic('megaphone', 13)} Open campaign</button>` : `<button class="btn sm" onclick="App.saveSegList('${s.id}')">${ic('savei', 13)} Save as a list</button>`);
    cv.innerHTML = `<div class="mcards">${[['Accounts', isMgr ? st.total : `${st.mine} of ${st.total}`, isMgr ? 'in this segment' : 'are yours'], ['Waiting on you', st.waiting, 'need a person'], ['Went ahead', st.ahead, 'on their own'], ['Positive rate', s.rate ? s.rate + '%' : '--', `${s.outcomes} outcomes`], ['Message', s.proven, 'from the outcome cache']].map(([k, v, d]) => `<div class="mcard"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('')}</div>
      <div class="seg-why"><div><div class="lbl">Why these accounts are together</div><p class="p">${esc(s.why)}</p></div><div><div class="lbl">Message structure</div><p class="p">${esc(s.structure)}</p></div></div>
      <div class="dtabs">${[['accounts', s.mode === 'NBC' ? 'Accounts' : 'Next best actions'], ['activity', 'Activity'], ['replies', 'Replies']].map(([k, lb]) => `<button class="${segTab === k ? 'on' : ''}" onclick="App.setSegTab('${k}')">${lb}</button>`).join('')}${isMgr ? `<span style="margin-left:auto">${ownerSel()}</span>` : ''}</div>
      ${segTab === 'accounts' ? `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Links</th><th>Status</th><th>Company</th><th>Tier · score</th><th>${s.mode === 'NBC' ? 'Signal' : 'Next best action'}</th>${isMgr ? '<th>Owner</th>' : ''}<th>Last activity</th></tr></thead><tbody>
        ${accs.map(a => `<tr class="row-link" onclick="App.openRecord('${a.id}','engage')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.contact.title)}</div></div></div></td><td><span class="li-ic">${ic('li', 14)}</span></td><td>${stepBadge(a)}</td><td>${esc(a.name)}</td><td>${tierBadge(a.tier)} <span class="mono" style="font-size:12px">${sc(a)}</span></td><td>${s.mode !== 'NBC' && a.nba ? esc(a.nba.action) + `<div class="sm">${a.nba.channel} · ${gate(a).every(x => x[1]) ? 'passed every check' : /sent/.test(a.nba.status) ? 'approved by a person' : 'needs you'}</div>` : a.whyNow ? esc(a.whyNow.type) + `<div class="sm">${ago(a.whyNow.age)}</div>` : '—'}</td>${isMgr ? `<td>${esc(first(USERS[a.owner].name))}</td>` : ''}<td class="sm">${esc((a.activity[a.activity.length - 1] || {}).t || '—')}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">None of your accounts are in this segment.</td></tr>'}
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
      `${live ? `<span class="toggle-lbl">${ic('check', 12)} Active</span><span class="switch on" title="Pause" onclick="App.toast('Paused (mock)')"></span>` : ''}${canConfirm ? (isMgr ? `<button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm and schedule</button>` : c.status === 'Draft' && !S.camp[c.id] ? `<button class="btn sm pri" onclick="App.sendForConfirm('${c.id}')">Send to Pavan to confirm</button>` : '') : ''}`);
    const card = (k, v, d, icn) => `<div class="mcard"><div class="k">${icn ? ic(icn, 13) : ''} ${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const msgs = `${chans.map(ch => `<span class="chn">${chIc(ch)} ${ch} ×${nCh(ch)}</span>`).join('')}`;
    cv.innerHTML = `<div class="mcards">${card('Accounts', st.total, isMgr ? 'in this campaign' : 'yours in this campaign', 'users')}${card('Reply rate', pct(st.replies, st.started), `${st.replies} replied`, 'reply')}${card('Positive', st.positive, `${pct(st.positive, st.replies)} of replies`)}${card('Open rate', pct(st.opened, st.started), `${st.opened} opened`, 'mail')}${card('Meetings', st.meetings, 'booked')}${card('Approved', live || c.status === 'Completed' ? 'All' : `${accs.length - todo.length} of ${accs.length}`, live ? 'running' : 'sequences approved', 'check')}</div>
      ${c.blockers.map(b => `<div class="blk ${b.k}" style="margin-top:10px">${ic('alert', 15)}<div class="grow"><b>Blocker</b><span>${esc(b.x)}</span></div></div>`).join('')}
      <div class="sec-row"><div class="lbl">Accounts in this campaign · ${accs.length}</div><div class="sp"></div>${isMgr ? ownerSel() : ''}${todo.length ? `<button class="btn sm pri" onclick="App.approveEnrollAll('${c.id}')">Approve all ${todo.length}</button>` : ''}</div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Company</th><th>Messages</th><th>Current step</th><th>Status</th>${isMgr ? '<th>Owner</th>' : ''}<th></th></tr></thead><tbody>
        ${accs.map(a => { const done = sq.filter(sent).length, cur = sq[Math.min(done, sq.length - 1)]; return `<tr class="row-link" onclick="App.openRecord('${a.id}','engage')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.contact.title)}</div></div></div></td><td>${esc(a.name)}</td><td><div class="chns">${msgs}</div></td><td class="sm">${cur ? `Step ${Math.min(done + 1, sq.length)} of ${sq.length}<div>${cur.ch === 'Email' ? 'Email · ' + esc(cur.fmt) : 'LinkedIn · ' + esc(cur.fmt)}</div>` : '—'}</td><td>${S.enrollOK[a.id] ? '<span class="badge b-pos">Approved</span>' : stateBadge(a.campState)}</td>${isMgr ? `<td>${esc(first(USERS[a.owner].name))}</td>` : ''}<td style="white-space:nowrap" onclick="event.stopPropagation()">${needsOK(a) ? `<button class="btn sm pri" onclick="App.approveEnroll('${a.id}')">Approve</button> ` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','engage')">Open</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">None of your accounts are in this campaign.</td></tr>'}</tbody></table></div>
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
  /* ─── Next best actions: every NBA and how it was delivered, the way Campaigns tracks NBC ─── */
  const STAGES = ['Prepared', 'Sent', 'Delivered', 'Opened', 'Replied'];
  const hsh = id => [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);
  function track(a) {
    const n = a.nba, d = S.decisions[a.id], h = hsh(a.id);
    if (n.status === 'review' && !d) return { stage: 0, label: 'Waiting for approval', cls: 'b-ter', how: 'Needs a person', when: n.due };
    if (d === 'with-manager') return { stage: 0, label: 'With Pavan', cls: 'b-ter', how: 'Needs a person', when: n.due };
    if (d === 'skipped' || d === 'sent-back') return { stage: 0, label: decLabel(d), cls: 'b-grey', how: 'Approved by a person', when: 'Today' };
    if (d) return { stage: 1, label: 'Scheduled · next send window', cls: 'b-sec', how: 'Approved by a person', when: 'Today 14:00' };
    if (n.status === 'sent') { const o = a.outcome || 'Delivered'; return { stage: /Replied|Meeting/.test(o) ? 4 : /Opened|Clicked/.test(o) ? 3 : 2, label: o, cls: /positive|Meeting/.test(o) ? 'b-pos' : /objection/.test(o) ? 'b-warn' : 'b-sec', how: 'Approved by a person', when: 'Last week' }; }
    if (h % 13 === 5) return { stage: 1, label: 'Bounced · fixing the address', cls: 'b-neg', how: 'Went ahead on its own', when: 'Today 06:05' };
    const st = [2, 3, 2, 3, 3][h % 5];
    return { stage: st, label: st === 3 ? 'Opened' : 'Delivered', cls: st === 3 ? 'b-pos' : 'b-sec', how: 'Went ahead on its own', when: st === 3 ? 'Today ' + ['08:14', '09:02', '10:37'][h % 3] : 'Today 06:05' };
  }
  const nbaRows = () => ACCOUNTS.filter(a => a.nba && /auto|sent|review|ready/.test(a.nba.status) && !a.campaign && visible(a));
  const dots = t => `<span class="stg" title="${STAGES.slice(0, t.stage + 1).join(' → ')}">${STAGES.map((x, i) => `<i class="${i <= t.stage ? (t.cls === 'b-neg' && i === t.stage ? 'bad' : 'on') : ''}"></i>`).join('')}</span>`;
  function renderActions() {
    const all = nbaRows(), T = a => track(a);
    const sentA = all.filter(a => T(a).stage >= 1), deliv = all.filter(a => T(a).stage >= 2), opened = all.filter(a => T(a).stage >= 3), replied = all.filter(a => T(a).stage >= 4);
    const went = all.filter(a => T(a).how === 'Went ahead on its own').length, wait = all.filter(a => T(a).how === 'Needs a person' && T(a).stage === 0).length;
    const tabs = [['all', 'All'], ['went', 'Went ahead'], ['wait', 'Waiting for approval'], ['open', 'Opened'], ['replied', 'Replied'], ['bounced', 'Bounced'], ['seg', 'By micro-segment']];
    const pick = { all: () => true, went: a => T(a).how === 'Went ahead on its own', wait: a => T(a).stage === 0 && T(a).how === 'Needs a person', open: a => T(a).stage === 3, replied: a => T(a).stage === 4, bounced: a => T(a).cls === 'b-neg' };
    const cv = frame('Next best actions', `One account at a time · ${all.length} actions this week · email and LinkedIn`, isMgr ? ownerSel() : '');
    const card = (k, v, d, icn) => `<div class="mcard"><div class="k">${icn ? ic(icn, 13) : ''} ${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const segs = SEGMENTS.filter(s => all.some(a => a.seg === s.id));
    cv.innerHTML = `<div class="mcards">${card('Actions prepared', all.length, 'this week', 'bolt')}${card('Went ahead on their own', went, pct(went, all.length) + ' of all', 'check')}${card('Waiting for approval', wait, 'in Approvals', 'task')}${card('Delivered', deliv.length, pct(deliv.length, sentA.length) + ' of sent', 'mail')}${card('Open rate', pct(opened.length, deliv.length), opened.length + ' opened')}${card('Reply rate', pct(replied.length, deliv.length), replied.length + ' replied', 'reply')}</div>
      <div class="dlv">${STAGES.map((x, i) => { const c = all.filter(a => T(a).stage >= i).length; return `<div class="dlv-s"><b>${c}</b><span>${x}</span><i style="width:${Math.max(4, c / (all.length || 1) * 100)}%"></i></div>`; }).join(`<span class="dlv-a">${ic('right', 14)}</span>`)}</div>
      <div class="dtabs">${tabs.map(([k, l]) => `<button class="${actTab === k ? 'on' : ''}" onclick="App.setActTab('${k}')">${l}${k !== 'seg' ? ` <i>${all.filter(pick[k]).length}</i>` : ''}</button>`).join('')}</div>
      ${actTab === 'seg' ? `<div class="srow-list">${segs.map(s => { const r = all.filter(a => a.seg === s.id), rd = r.filter(a => T(a).stage >= 2).length; return `<div class="srow" onclick="App.openSegment('${s.id}')"><div class="srow-n"><div class="nm">${esc(s.name)} ${modeBadge(s)}</div><div class="sm">${esc(s.trigger)} · ${esc(s.proven.toLowerCase())} message</div></div><div class="srow-m"><div><b>${r.length}</b><span>Actions</span></div><div><b>${r.filter(pick.went).length}</b><span>Went ahead</span></div><div><b>${r.filter(pick.wait).length}</b><span>Waiting</span></div><div><b>${rd}</b><span>Delivered</span></div><div><b>${r.filter(a => T(a).stage >= 3).length}</b><span>Opened</span></div><div><b>${r.filter(pick.replied).length}</b><span>Replied</span></div></div><span></span></div>`; }).join('')}</div>`
      : `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Next best action</th><th>Micro-segment</th><th>How it went out</th><th>Delivery</th><th>When</th>${isMgr ? '<th>Rep</th>' : ''}</tr></thead><tbody>
        ${all.filter(pick[actTab]).map(a => { const t = T(a); return `<tr class="row-link" onclick="App.openRecord('${a.id}','engage')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.name)}</div></div></div></td><td>${esc(a.nba.action)}<div class="sm">${chIc(a.nba.channel)} ${a.nba.channel}</div></td><td><span class="seg-link" onclick="event.stopPropagation();App.openSegment('${a.seg}')">${esc(a.segment)}</span></td><td><span class="badge ${t.how === 'Went ahead on its own' ? 'b-pos' : t.how === 'Needs a person' ? 'b-ter' : 'b-sec'} nodot">${t.how}</span></td><td><div class="dlv-c">${dots(t)}<span class="badge ${t.cls}">${esc(t.label)}</span></div></td><td class="sm">${esc(t.when || '—')}</td>${isMgr ? `<td>${esc(first(USERS[a.owner].name))}</td>` : ''}</tr>`; }).join('') || '<tr><td colspan="7" class="empty">Nothing here.</td></tr>'}
      </tbody></table></div>`}`;
  }
  function deliveryRow(a) {
    const t = track(a);
    return `<div class="dlv-p">${STAGES.map((x, i) => `<div class="${i <= t.stage ? (t.cls === 'b-neg' && i === t.stage ? 'bad' : 'on') : ''}"><span></span><b>${x}</b></div>`).join('')}</div><div class="sm muted" style="margin-top:4px">${esc(t.how)} · ${esc(t.label)}${t.when ? ' · ' + esc(t.when) : ''}</div>`;
  }

  function renderApprovals() {
    const tabs = isMgr ? [['needs', 'Needs me'], ['team', 'Team exceptions'], ['ahead', 'Went ahead'], ['done', 'Decided']] : [['todo', 'Needs you'], ['waiting', 'With Pavan'], ['ahead', 'Went ahead'], ['done', 'Decided']];
    const items = apprItems(apprTab), readyIds = items.filter(a => !a.nba.reason && !S.decisions[a.id]);
    const cv = frame('Approvals', isMgr ? 'Sensitive messages and campaigns need you; you can step in on any rep\'s item.' : 'Next best actions go ahead on their own when they pass every check. Only the ones that don\'t come here for your approval.', readyIds.length ? `<button class="btn sm pri" onclick="App.approveAll()">Approve ${readyIds.length} ready</button>` : '');
    cv.innerHTML = `<div class="rule"><b>How a next best action is decided.</b> The AI picks the action, the channel and the message for each account from its strongest signal. It goes ahead on its own when it passes all six checks; if any fails, it waits here with the reason.<div class="gate-r" style="margin-top:8px">${['High confidence', 'Proven message', 'Not sensitive', 'Identity confirmed', 'Not in another sequence', 'Not picked for a spot-check'].map(k => `<span class="gc ok">✓ ${k}</span>`).join('')}</div></div>
      <div class="dtabs" style="margin-top:0">${tabs.map(([k, l]) => `<button class="${apprTab === k ? 'on' : ''}" onclick="App.setApprTab('${k}')">${l} (${apprItems(k).length})</button>`).join('')}
        ${isMgr && apprTab === 'team' ? `<label class="sr" for="repSel">Rep</label><select class="sel" id="repSel" style="margin-left:auto" onchange="App.setApprRep(this.value)"><option value="all">All reps</option>${REPS.map(r => `<option value="${r}" ${apprRep === r ? 'selected' : ''}>${USERS[r].name}</option>`).join('')}</select>` : ''}</div>
      ${isMgr && apprTab === 'needs' ? CAMPAIGNS.filter(c => (c.status === 'Ready to confirm' || S.camp[c.id] === 'Sent for confirmation') && S.camp[c.id] !== 'Confirmed').map(c => `<div class="card" style="margin-bottom:10px"><div class="card-b" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="badge b-ter">Campaign</span><div class="grow" style="min-width:200px"><b>${esc(c.name)}</b><div class="sm muted" style="font-size:12px">${c.accounts.length} people · ${seqSpan(c)} · email and LinkedIn</div></div><button class="btn sm pri" onclick="App.confirmCampaign('${c.id}')">Confirm</button><button class="btn sm" onclick="App.goCampaign('${c.id}','steps')">Review steps</button></div></div>`).join('') : ''}
      <div class="card tbl-wrap">${items.length ? `<table class="tbl"><thead><tr><th>Person</th><th>Next best action</th><th>Micro-segment</th><th>Checks</th>${isMgr ? '<th>Rep</th>' : ''}<th>Due</th><th></th></tr></thead><tbody>
        ${items.map(a => { const d = S.decisions[a.id]; return `<tr class="row-link" onclick="App.openRecord('${a.id}','engage')"><td><div style="display:flex;gap:9px;align-items:center">${pAvatar(a)}<div><div class="nm">${esc(a.contact.name)}</div><div class="sm">${esc(a.name)}</div></div></div></td><td>${esc(a.nba.action)}<div class="sm">${chIc(a.nba.channel)} ${a.nba.channel}</div></td><td><span class="seg-link" onclick="event.stopPropagation();App.openSegment('${a.seg}')">${esc(a.segment)}</span></td><td><div class="gcell">${gateCell(a)}</div>${a.nba.reasonNote && !/auto|sent/.test(a.nba.status) ? `<div class="sm" style="max-width:260px;white-space:normal;margin-top:4px">${esc(a.nba.reasonNote)}</div>` : ''}</td>${isMgr ? `<td>${esc(first(USERS[a.owner].name))}</td>` : ''}<td style="white-space:nowrap">${esc(a.nba.due)}</td>
          <td style="white-space:nowrap" onclick="event.stopPropagation()">${d ? `<span class="badge b-grey nodot">${decLabel(d)}</span>` : /auto|sent/.test(a.nba.status) ? '<span class="badge b-pos">Went ahead</span>' : `${!a.nba.reason || (isMgr && a.nba.sensitive) ? `<button class="btn sm pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : 'Approve'}</button> ` : ''}<button class="btn sm" onclick="App.openRecord('${a.id}','engage')">Review</button>`}</td></tr>`; }).join('')}
        </tbody></table>` : `<div class="empty">Nothing here. ${apprTab === 'done' ? 'Decisions you make show up here.' : 'You\'re all caught up.'}</div>`}</div>`;
  }

  /* Person drawer (opens over the module, beside the chat) */
  const ACT_IC = { signal: 'bolt', score: 'layers', segment: 'layers', campaign: 'megaphone', sent: 'mail', open: 'mail', reply: 'reply', watch: 'alert', nba: 'spark', wait: 'clock', crm: 'clock' };
  function renderRecord() {
    const a = acct(recId), o = USERS[a.owner];
    const tabs = [['overview', 'Overview'], ['engage', 'Engagement'], ['activity', 'Activity'], ['notes', 'Notes']];
    $('focus').innerHTML = `<div class="pdrawer ${copOpen ? 'cop-on' : ''}">
      <div class="pd-left">
        <div class="pd-top"><button class="ic-btn" title="Close" onclick="App.closeFocus()">${ic('x', 16)}</button><span class="li-ic" style="margin-left:auto">${ic('li', 16)}</span></div>
        <div class="who"><span class="av" style="background:${o.color};width:54px;height:54px;font-size:18px">${initials(a.contact.name)}</span><div><div class="nm" style="font-family:var(--fd);font-size:19px">${esc(a.contact.name)}</div><div class="tl">${esc(a.contact.title)}</div><div class="tl"><span class="logo-dot">${esc(a.name[0])}</span> ${esc(a.name)}</div></div></div>
        <div class="pd-cta"><button class="btn pri" onclick="App.sendNow('${a.id}')">${ic('plane', 14)} Send</button><button class="btn ${copOpen ? 'on' : ''}" onclick="App.toggleCop()">${ic('spark', 14)} Copilot</button></div>
        <div class="sec-t">Details</div>
        <dl class="kv"><dt>Name</dt><dd>${esc(a.contact.name)}</dd><dt>Title</dt><dd>${esc(a.contact.title)}</dd><dt>Email</dt><dd>${esc(a.contact.email)}</dd><dt>Identity</dt><dd>${idBadge(a.contact.idTier)}</dd><dt>Record owner</dt><dd>${isMgr ? `<label class="sr" for="recOwner">Owner</label><select class="sel" id="recOwner" onchange="App.reassign(['${a.id}'],this.value)">${REPS.map(r => `<option value="${r}" ${a.owner === r ? 'selected' : ''}>${esc(USERS[r].name)}</option>`).join('')}</select>` : esc(o.name)}</dd><dt>Score</dt><dd>${tierBadge(a.tier)} ${sc(a)}</dd><dt>Lead source</dt><dd>${a.fromList ? 'Prospecting · Lookalikes of my last 10 wins' : 'Signals · overnight sweep'}</dd></dl>
        <div class="sec-t">Company</div>
        <dl class="kv"><dt>Name</dt><dd>${esc(a.name)}</dd><dt>Industry</dt><dd>${esc(a.industry)}</dd><dt>Country</dt><dd>${esc(a.country)}</dd><dt>Size</dt><dd>${esc(a.size)}</dd><dt>Micro-segment</dt><dd>${a.seg ? `<a href="#segments" onclick="App.openSegment('${a.seg}');return false">${esc(a.segment)}</a>` : '—'}</dd><dt>Warm path</dt><dd>${a.warm.score} · ${esc(a.warm.note)}</dd></dl>
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
        ${t.ch === 'Email' ? `<div class="sv-subj">${esc(t.subject || c.name)}</div><div class="sv-to">${esc(USERS[a.owner].name)} to ${esc(a.contact.name)}</div>` : ''}
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
        <div class="composer"><label class="sr" for="copIn">Ask Copilot</label><textarea id="copIn" rows="2" placeholder="Ask for a change…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();App.copAsk(this.value)}"></textarea><div class="composer-f"><span class="muted" style="font-size:11px">Every change runs the brand checks</span><div class="sp"></div><button class="send" onclick="App.copAsk(document.getElementById('copIn').value)" title="Send">${ic('send', 15)}</button></div></div></div></aside>`;
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
      : a.nba.reason ? `<div class="ready" style="background:var(--warn-lt)"><div class="grow"><b>${reasonOf(a)}.</b> ${esc(a.nba.reasonNote)}</div><button class="btn pri" onclick="App.approve('${a.id}')">${isMgr && a.nba.sensitive ? 'Sign off' : a.nba.sensitive ? 'Approve → to Pavan' : 'Approve'}</button></div>`
      : `<div class="ready"><div class="grow">Your next best action is ready. Approve to continue.</div><button class="btn pri" onclick="App.approve('${a.id}')">Approve</button></div>`;
    return `<div class="eng-h"><div class="lbl">${ic('bolt', 13)} Next best action</div><div class="eng-grid"><div><span>Action</span>${esc(d.option === 'run' ? a.nba.runnerUp : a.nba.action)}</div><div><span>Status</span>${stepBadge(a)}</div><div><span>Channel</span>${a.nba.channel}</div><div><span>Due</span>${esc(a.nba.due || '—')}</div></div><div class="lbl" style="margin:12px 0 6px">Delivery</div>${deliveryRow(a)}</div>${gateBlock(a)}${banner}
      <div style="margin-top:10px">
        <button class="opt ${d.option === 'rec' ? 'on' : ''}" onclick="App.setOption('${a.id}','rec')"><div class="h">${esc(a.nba.action)}<span class="badge b-brand nodot">Recommended</span></div><div class="d">${a.nba.confidence} confidence · ${a.nba.proven ? 'proven structure for ' + esc(a.segment) : 'provisional structure (first try)'}</div></button>
        <button class="opt ${d.option === 'run' ? 'on' : ''}" onclick="App.setOption('${a.id}','run')"><div class="h">${esc(a.nba.runnerUp)}<span class="badge b-grey nodot">Runner-up</span></div><div class="d">The next best option.</div></button></div>
      <div style="display:flex;gap:8px;margin:10px 0 8px;align-items:center;flex-wrap:wrap"><label class="sr" for="chanSel">Channel</label><select class="sel" id="chanSel" onchange="App.setChannel('${a.id}',this.value)">${['Email', 'LinkedIn'].map(c => `<option ${d.channel === c ? 'selected' : ''}>${c}</option>`).join('')}</select><span class="muted" style="font-size:11.5px">${esc(USERS[a.owner].name)} to ${esc(a.contact.name)}</span></div>
      ${d.channel === 'Email' ? `<label class="sr" for="dSubj">Subject</label><input class="edit" id="dSubj" value="${esc(d.subject)}" onchange="App.saveDraft('${a.id}')" style="margin-bottom:8px">` : ''}
      <label class="sr" for="dBody">Message</label><textarea class="edit" id="dBody" onchange="App.saveDraft('${a.id}')">${esc(d.body)}</textarea>
      <div class="checks"><span class="badge b-pos">Brand voice</span><span class="badge b-pos">Approved claims only</span><span class="badge b-pos">Not in another sequence</span></div>
      ${dec || /auto|sent/.test(a.nba.status) ? '' : `<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">${isMgr && a.owner !== me.id ? `<button class="btn" onclick="App.decide('${a.id}','sent-back')">Send back to ${esc(first(USERS[a.owner].name))}</button>` : ''}<button class="btn" onclick="App.decide('${a.id}','skipped')">Skip</button><span class="muted" style="font-size:11.5px;align-self:center">Ask the chat to change it: "make it shorter", "use cost framing"</span></div>`}`;
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
      $('main').innerHTML = `<div class="cv-h"><div class="cv-ht" style="display:flex;flex-direction:row;align-items:baseline;gap:14px"><div class="cv-t">Content studio</div><div class="cv-s">Blogs and whitepapers in the Client's brand voice</div></div></div>
        <div class="dtabs" style="margin:0;padding:0 22px;background:var(--surf)">${[['write', 'Write'], ['saved', `Saved content <i>${all.length}</i>`]].map(([k, l]) => `<button class="${studioTab === k ? 'on' : ''}" onclick="App.setStudioTab('${k}')">${l}</button>`).join('')}</div>
        <div class="cv-b" id="cv">${studioTab === 'write' ? `<div class="st-hero"><h1>What should we write?</h1><p>Describe it in your own words. It's written in a canvas beside the chat, and you change it by talking to it.</p>
          <div class="st-box"><label class="sr" for="stBrief">Brief</label><textarea id="stBrief" rows="2" placeholder="e.g. A whitepaper on legacy control system modernisation for plant managers" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();App.studioGo()}"></textarea>
            <div class="st-f"><div class="seg">${['Blog', 'Whitepaper'].map(x => `<button class="${studioType === x ? 'on' : ''}" onclick="App.setStudioType('${x}')">${ic(x === 'Blog' ? 'pen' : 'doc', 13)} ${x}</button>`).join('')}</div><button class="send" onclick="App.studioGo()" title="Write">${ic('send', 16)}</button></div></div>
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
    if (a.nba.sensitive && !isMgr) return decide(id, 'with-manager', 'Approved. Sent to Pavan for sign-off because it\'s sensitive.');
    decide(id, isMgr && a.nba.sensitive ? 'signed' : 'approved', `Approved: ${a.name}. Scheduled for the next send window (placeholder).`);
  }
  function approveAll(silent) {
    apprItems(isMgr ? 'team' : 'todo').filter(a => !a.nba.reason && !S.decisions[a.id]).forEach(a => { S.decisions[a.id] = 'approved'; });
    save(); if (!silent) { toast('Approved all ready items. Scheduled for the next send window (placeholder).'); renderAll(); }
  }
  function goCampaign(id, tab) { art = null; recId = null; thrId = null; expanded = true; campSel = id; campTab = tab || 'enroll'; go('campaigns'); }
  function openRecord(id, tab) { recId = id; thrId = null; recTab = tab || 'engage'; actOpen = null; ctx = id; if (recTab === 'engage' && !acct(id).nba && !acct(id).campaign) recTab = 'overview'; renderAll(); }
  let lastKey = null;
  function openThread(id) { recId = null; thrId = id; S.read[id] = true; save(); if (view() !== 'inbox') location.hash = '#inbox'; else renderAll(); }
  /* A person or a reply opens in a focused panel; everything behind it is blurred */
  function renderFocus() {
    const on = !!recId;
    $('ws').classList.toggle('focused', on);
    $('fscrim').classList.toggle('open', on);
    if (recId) renderRecord();
    $('focus').classList.toggle('open', on);
  }
  function renderAll() {
    const v = view(), tok = ++loadTok;
    const home = !v && S.cur === 'home' && !art, studioHome = v === 'studio' && !S.studio.doc, inboxV = (v === 'inbox' || v === 'analytics') && !art;
    const split = !!art || !!(v && v !== 'studio' && v !== 'inbox' && v !== 'analytics' && expanded) || (v === 'studio' && !!S.studio.doc);
    $('ws').classList.toggle('canvas-open', split);
    $('ws').classList.toggle('home', home);
    $('ws').classList.toggle('nochat', studioHome || inboxV);
    $('ws').classList.toggle('solo', !split && !home && !studioHome && !inboxV);
    renderNav(); renderChat();
    const MODR = { actions: renderActions, inbox: renderInbox, accounts: renderAccounts, segments: renderSegments, campaigns: renderCampaigns, approvals: renderApprovals, studio: renderStudio, analytics: renderAnalytics };
    const draw = art ? renderArt : v === 'studio' || v === 'inbox' || v === 'analytics' || (v && expanded) ? MODR[v] : home ? renderHome : () => { $('main').className = ''; $('main').innerHTML = ''; };
    const key = [v, home, expanded, art, campSel, segSel, listSel, studioTab, !!S.studio.doc].join('|');
    const fresh = key !== lastKey;
    lastKey = key;
    if (fresh && split && v !== 'studio') {
      skeleton();
      setTimeout(() => { if (tok !== loadTok) return; draw(); $('main').classList.add('fadein'); }, 280);
    } else {
      draw();
      if (fresh) { const cv = $('cv'); if (cv) cv.scrollTop = 0; $('main').scrollTop = 0; }
    }
    renderFocus();
  }

  window.App = {
    ask, toast, nav, openRecord, openThread, approve, approveAll: () => approveAll(false), goCampaign, decide, renderAll,
    send() { const el = $('composer'); const v = el.value; el.value = ''; ask(v); },
    key(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); App.send(); } },
    focusComposer(v) { const el = $('composer'); if (!el) return; el.focus(); if (v) el.value = v; },
    setCtx(id) { ctx = id; $('ctx').innerHTML = ctxChip(); },
    switchUser(id) { store.set('dmock_user', id); location.hash = ''; location.reload(); },
    signOut() { try { localStorage.removeItem('dmock_user'); } catch (e) { /* ignore */ } },
    newChat() {
      const v = view();
      if (v === 'studio') { S.studio = { doc: null, thread: [] }; save(); return nav('studio'); }
      if (v) { S.mchat[v] = null; save(); return renderAll(); }
      const id = 'n' + Date.now();
      S.chats.unshift({ id, title: 'New chat', when: 'Now', thread: [{ who: 'ai', kind: 'text', html: 'New chat. What should I work on? I can find prospects, score them, build micro-segments, prepare next actions and campaigns, track them, and tell you what the system learned.' }] });
      S.cur = id; ctx = null; art = null; recId = null; thrId = null; save(); go(null); setTimeout(() => $('composer') && $('composer').focus(), 0);
    },
    openChat(id) { S.cur = id; art = null; recId = null; thrId = null; save(); go(null); },
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
    closeFocus() { recId = null; thrId = null; pEdit = null; renderAll(); },
    toggleCop() { copOpen = !copOpen; renderAll(); if (copOpen) setTimeout(() => $('copIn') && $('copIn').focus(), 0); },
    copAsk(text) { if (!text || !text.trim() || !recId) return; const a = acct(recId), th = S.cop[a.id] = S.cop[a.id] || []; th.push({ who: 'me', text }); th.push({ who: 'ai', html: copRespond(a, text.toLowerCase()) }); save(); renderAll(); },
    sendNow(id) { const a = acct(id); if (a.campaign) { S.enrollOK[id] = true; save(); toast(`Next step sent to ${a.contact.name} now (placeholder: nothing is sent)`); renderAll(); } else if (a.nba && !/auto|sent/.test(a.nba.status) && !S.decisions[id]) approve(id); else toast('Nothing is waiting to send for this person'); },
    pEditStep(id, i) { pEdit = id ? `${id}:${i}` : null; renderAll(); },
    pSave(id, i) { const v = $('pBody').value; editPseq(id, sq => { sq[i].body = v; }); pEdit = null; toast('Saved. The brand and claim checks pass'); renderAll(); },
    pRemove(id, i) { editPseq(id, sq => sq.splice(i, 1)); toast('Step removed for this person'); renderAll(); },
    pAdd(id, ch, silent) { editPseq(id, (sq, a) => { const t = newTouch(sq, campOf(a.campaign), ch); t.body = personal(t, a); sq.push(t); }); if (!silent) { toast(`${ch} step added`); renderAll(); } },
    pReset(id) { delete S.pseq[id]; save(); renderAll(); },
    addToSeq(id, cid) { if (cid) toast(`${acct(id).contact.name} joins ${campOf(cid).name} when this sequence ends (mock)`); },
    setOwner(r) { ownerF = r; renderAll(); },
    setActTab(k) { actTab = k; renderAll(); },
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
    openList(id) { listSel = id || 'all'; art = null; recId = null; thrId = null; expanded = true; go('accounts'); },
    saveView() { const name = `My view · ${listSel === 'all' ? 'all accounts' : 'list'} · 27 Oct`; const ids = Array.from(document.querySelectorAll('#cv tbody tr')).length; addList(name, 'Saved view', `${ids} accounts saved from the Accounts view`, ACCOUNTS.filter(mine).map(a => a.id)); listSel = S.lists[0].id; save(); toast('Saved as a list. It\'s a tab now'); renderAll(); },
    openSegment(id) { segSel = id; segTab = 'accounts'; art = null; recId = null; thrId = null; expanded = true; go('segments'); },
    saveSegList(segId) { const s = segOf(segId); addList(s.name + ' · 27 Oct', 'Segment', 'Saved from Segments', ACCOUNTS.filter(a => a.seg === segId).map(a => a.id)); save(); toast('Saved. It\'s a tab in Accounts'); },
    confirmCampaign(id) { S.camp[id] = 'Confirmed'; save(); toast('Campaign confirmed. Step 1 goes out tomorrow 09:00 (placeholder: nothing is sent).'); renderAll(); },
    sendForConfirm(id) { S.camp[id] = 'Sent for confirmation'; save(); toast('Sent to Pavan to confirm, with your edits.'); renderAll(); },
    approveEnroll(id) { S.enrollOK[id] = true; save(); toast('Approved. The first step is scheduled once the campaign is confirmed.'); renderAll(); },
    handleReply(id, msg) { S.handled[id] = true; save(); toast(msg || 'Reply sent (placeholder). The sequence for this account is stopped.'); renderAll(); },
    seqEdit(cid, i, f, v) { editSeq(cid, sq => { sq[i][f] = f === 'day' ? Math.max(0, parseInt(v, 10) || 0) : v; if (f === 'ch') { sq[i].fmt = FORMATS[v][0]; if (v === 'Email' && !sq[i].subject) sq[i].subject = campOf(cid).name; } if (f === 'day') sq.sort((p, q) => p.day - q.day); }); renderAll(); },
    seqMove(cid, i, d) { editSeq(cid, sq => { const j = i + d; if (j < 0 || j >= sq.length || sent(sq[j])) return; [sq[i], sq[j]] = [sq[j], sq[i]]; const days = sq.map(t => t.day).sort((p, q) => p - q); sq.forEach((t, k) => { t.day = days[k]; }); }); renderAll(); },
    seqRemove(cid, i) { editSeq(cid, sq => { sq.splice(i, 1); }); toast('Step removed'); renderAll(); },
    seqAdd(cid, ch) { editSeq(cid, (sq, c) => sq.push(newTouch(sq, c, ch))); toast(`${ch} step added at the end`); renderAll(); },
    seqRewrite(cid, i) { editSeq(cid, sq => { const t = sq[i]; t.t = t.ch === 'LinkedIn' ? `Saw the news at your site. ${t.t.split('.')[0]}. Worth a quick chat?` : `${t.t.split('.')[0]}. Here is what a comparable site learned, in one page, and the first step that kept its options open.`; }); toast('Rewritten. Brand and claim checks still pass'); renderAll(); },
    seqReset(cid) { delete S.seq[cid]; save(); toast('Back to the AI draft'); renderAll(); },
    setStudioTab(k) { studioTab = k; renderAll(); },
    setStudioType(x) { studioType = x; renderAll(); },
    studioGo(text, type) { const v = text || ($('stBrief') && $('stBrief').value) || ''; if (!v.trim()) { toast('Describe what to write first'); return; } startDoc(type || (/whitepaper/i.test(v) ? 'Whitepaper' : studioType), v); },
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
  renderAll();
})();
