/* Demand AI prototype: the chat. One input; answers are cards, matched by simple intent rules (no language model).
   Five R1 questions: what should I work on today; why is this account ranked here; show me this account's history;
   what needs my decision; what is this campaign. Demo-data questions are labelled. */
(function () {
  const D = window.DM, U = () => window.UI, $ = id => document.getElementById(id);
  let thread = [];
  const esc = s => U().esc(s);
  const SUGG = {
    rep: ['What should I work on today?', 'What needs my decision?', 'Why is Harrowgate Refining ranked here?', "Show me Halden Process Systems' history"],
    manager: ['What is this campaign?', 'What needs my decision?', 'What should the team work on today?', 'Who replied since yesterday?'],
    leader: ['How far are we from quota?', 'What did the system learn?', 'What needs my decision?', 'How are my campaigns doing?'],
    admin: ['What needs my decision?', 'Why is Northgate Terminals ranked here?', 'What is this campaign?', 'What should I work on today?']
  };
  function findAccount(t) {
    const s = t.toLowerCase();
    const rows = D.M.rows.slice().sort((a, b) => b.a.name.length - a.a.name.length);
    return rows.find(r => s.includes(r.a.name.toLowerCase())) || rows.find(r => s.includes(r.a.name.split(' ')[0].toLowerCase()) && r.a.name.split(' ')[0].length > 4) || null;
  }
  const card = (h, body, foot) => `<div class="ccard"><div class="card-h"><b>${h}</b></div><div class="card-b">${body}</div>${foot ? `<div class="card-b" style="border-top:1px solid var(--line);padding-top:8px">${foot}</div>` : ''}</div>`;
  const link = (h, l) => `<a class="btn sm" href="#/${h}">${l}</a>`;

  function answer(text) {
    const t = text.toLowerCase(), u = U(), role = D.S.role;
    const myRows = D.M.rows.filter(u.mine);
    if (/work on|my day|today|queue|first/.test(t) && !/repl|quota/.test(t)) {
      const q = myRows.filter(r => (r.tier === 'A' || r.tier === 'B') && !['excluded', 'unranked', 'watch'].includes(r.route)).sort((a, b) => b.rank - a.rank).slice(0, 6);
      return `<p>${q.length} accounts in Account tier A and B ${role === 'rep' ? 'for you' : 'for the team'}, in rank order. ${q.filter(r => r.route === 'ready').length} are ready to send with one click; ${q.filter(r => r.route === 'card').length} need your decision.</p>` +
        card('Morning queue · ' + u.fd(D.now()), q.map(r => `<div class="row" style="padding:5px 0;border-bottom:1px dashed var(--line)"><span class="mono">${r.position}</span>${u.tierBadge(r.tier, true)}<div class="grow"><a href="#/account/${r.id}" class="nm">${esc(r.a.name)}</a><div class="sm muted">${esc(u.whyLine(r))}</div></div><span class="status ${u.ROUTE[r.route][1]} sm">${u.ROUTE[r.route][0]}</span></div>`).join(''), link('queue', 'Open the queue'));
    }
    if (/why|rank|tier a|tier b/.test(t)) {
      const r = findAccount(t) || (D.ctx && D.M.byId.get(D.ctx)) || myRows.filter(x => x.tier === 'A')[0];
      if (!r) return '<p>Which account? Name it, for example "Why is Harrowgate Refining ranked here?"</p>';
      if (r.route === 'excluded') return `<p><b>${esc(r.a.name)}</b> is not ranked into any queue: ${esc(r.reason)}. Exclusions are checked before everything else.</p>`;
      return `<p><b>${esc(r.a.name)}</b> ranks ${r.position ? '#' + r.position : 'unranked'} because it fits (${r.fit == null ? 'fit unknown' : 'fit ' + r.fit}) and something is happening now (timing ${u.fmtN(r.timing)}). Rank = Fit × Timing = ${u.fmtN(r.rank)}.</p>` +
        card(esc(r.a.name) + ' · ' + (r.tier ? 'Account tier ' + r.tier : 'not tiered'), r.sig.live.slice(0, 4).map((s, i) => `<div class="sm" style="padding:3px 0">${u.sigTier(s.tier)} ${esc(s.title)} <span class="muted">· ${u.ageTxt(s.age)} · ${s.value} pts${i ? ' × ' + 1 / Math.pow(2, i) : ''}</span></div>`).join('') + (r.sig.expired.length ? `<div class="sm muted" style="margin-top:6px">Expired and no longer counted: ${r.sig.expired.map(s => esc(s.title)).join('; ')}</div>` : '') + `<div class="sm" style="margin-top:6px">Confidence ${u.confHtml(r.conf)}</div>`, link('account/' + r.id + '/why', 'Full breakdown'));
    }
    if (/history|timeline|story/.test(t)) {
      const r = findAccount(t) || (D.ctx && D.M.byId.get(D.ctx));
      if (!r) return '<p>Which account? For example "Show me Halden Process Systems\' history".</p>';
      const it = u.timelineItems(r).slice(0, 7);
      return `<p>${esc(r.a.name)} from first touch to today. Next step: <b>${u.ROUTE[r.route][0]}</b>${r.contact ? ' with ' + esc(r.contact.name) : ''}.</p>` + card('Timeline', it.map(x => `<div class="sm" style="padding:3px 0"><span class="muted">${u.fd(x.at)}</span> ${esc(x.h)}</div>`).join(''), link('account/' + r.id + '/timeline', 'Open the timeline') + ' ' + link('account/' + r.id, 'Next step'));
    }
    if (/decision|decide|escalat|approv|needs me|needs my/.test(t)) {
      const L = D.M.escalations.filter(e => e.owner === D.userId() || (role === 'manager' && e.type === 8));
      return `<p>${L.length ? L.length + ' items need you. Each has a reason, a due time and a default if nobody acts.' : 'Nothing needs your decision right now.'}</p>` + (L.length ? card('Needs my decision', L.slice(0, 6).map(e => `<div style="padding:5px 0;border-bottom:1px dashed var(--line)"><div class="row"><span class="badge b-or">${e.type}</span><b class="sm">${esc(e.label)}</b></div><div class="sm muted">${e.accountId ? esc(D.acct(e.accountId).name) + ': ' : ''}${esc(e.reason)}</div></div>`).join(''), link('escalations', 'Open all')) : '');
    }
    if (/campaign/.test(t) && !/how are|doing/.test(t)) {
      const k = D.M.campaigns.find(x => x.state === 'pending') || D.M.campaigns[0];
      if (!k) return '<p>No microsegment has reached the campaign threshold.</p>';
      return `<p><b>${esc(k.key)}</b>: ${k.accounts.length} accounts share one trigger inside ${D.cfg().campaign.windowDays} days, so the rule raised one campaign instead of ${k.accounts.length} separate actions. ${k.state === 'pending' ? 'It waits for the sales manager to confirm.' : 'State: ' + k.state + '.'}</p>` +
        card('Campaign', `<div class="sm">Trigger: ${esc(k.trigger ? k.trigger.title : '')}</div>${k.touches.map(x => `<div class="sm" style="padding:3px 0"><span class="badge b-blue">Day ${x.day}</span> ${x.channel}: ${esc(x.kind)}</div>`).join('')}<div class="sm muted">Owners: ${[...new Set(k.accounts.map(r => u.first(u.user(r.a.owner).name)))].join(', ')}</div>`, link('campaigns', 'Open the campaign card'));
    }
    if (/repl/.test(t)) { const L = D.SEED.demo.replies; return `<p>${u.demoTag} ${L.length} replies since yesterday, sorted into six statuses, Hot first.</p>` + card('Who replied', L.slice(0, 5).map(r => `<div class="sm" style="padding:3px 0"><span class="badge ${r.status === 'Hot' ? 'b-or' : 'b-grey'}">${r.status}</span> ${esc(r.account)}: "${esc(r.text)}"</div>`).join(''), link('replies', 'Open replies')); }
    if (/quota/.test(t)) { const Q = D.SEED.demo.quota; return `<p>${u.demoTag} ${esc(Q.closed)} closed against ${esc(Q.target)}: a gap of <b>${esc(Q.gap)}</b>. Here is the week-by-week plan with named accounts.</p>` + card('Quota plan', Q.weeks.map(w => `<div class="sm" style="padding:3px 0"><b>${esc(w[0])}</b> ${esc(w[1])}; ${esc(w[2])}</div>`).join(''), link('learning', 'Open the plan')); }
    if (/learn/.test(t)) return `<p>${u.demoTag} Four changes this month, each passed the backtest first.</p>` + card('What the system learned', D.SEED.demo.learning.map(l => `<div class="sm" style="padding:3px 0">${esc(l[0])} <span class="muted">→ ${esc(l[2])}</span></div>`).join(''), link('learning', 'Open the ledger'));
    if (/funnel|how are my campaigns|doing/.test(t)) return `<p>${u.demoTag} Per 100 accounts worked, prioritised accounts booked 9 meetings against 2 for the rest.</p>` + link('funnel', 'Open the funnel');
    return `<p>I did not catch that. Try one of these:</p><ul class="sm"><li>What should I work on today?</li><li>Why is Harrowgate Refining ranked here?</li><li>Show me Halden Process Systems' history</li><li>What needs my decision?</li><li>What is this campaign?</li></ul>`;
  }
  function render() {
    $('thread').innerHTML = thread.map(m => m.me ? `<div class="msg me"><div class="bub">${esc(m.text)}</div></div>` : `<div class="msg ai"><img class="av" src="brand/emplay_mark.png" alt=""><div class="bub">${m.html}</div></div>`).join('');
    $('thread').scrollTop = $('thread').scrollHeight;
  }
  function renderChips() { $('chips').innerHTML = (SUGG[D.S.role] || []).map(s => `<button class="chip" onclick="CHAT.ask(${esc(JSON.stringify(s))})">${esc(s)}</button>`).join(''); }
  function greet() {
    const u = U(), role = D.S.role, name = u.first(u.user(D.userId()).name);
    const L = D.M.escalations.filter(e => e.owner === D.userId() || (role === 'manager' && e.type === 8)).length;
    const ready = D.M.rows.filter(r => u.mine(r) && (r.tier === 'A' || r.tier === 'B') && r.route === 'ready').length;
    const lines = { rep: `${ready} ready to send and ${L} item${L === 1 ? '' : 's'} that need${L === 1 ? 's' : ''} your decision.`, manager: `${D.M.campaigns.filter(k => k.state === 'pending').length} campaign flag waiting for you, and ${L} item${L === 1 ? '' : 's'} in total.`, leader: `The scoring backtest is ${D.M.backtest.pass ? 'passing' : 'failing'}. ${L} item${L === 1 ? '' : 's'} need${L === 1 ? 's' : ''} you.`, admin: `${L} configuration item${L === 1 ? '' : 's'} need${L === 1 ? 's' : ''} you.` };
    thread = [{ html: `<p>Good morning, ${esc(name)}. ${lines[role]} Ask me anything, or pick a question below.</p>` }];
    render(); renderChips();
  }
  function ask(text) {
    if (!text || !text.trim()) return;
    thread.push({ me: true, text });
    let html; try { html = answer(text); } catch (e) { html = '<p>Something went wrong answering that; here is the last good data on the right.</p>'; }
    thread.push({ html }); render(); $('q').value = '';
  }
  window.CHAT = { ask, greet, renderChips, reset: greet, send: () => ask($('q').value) };
})();
