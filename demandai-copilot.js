/* DemandAI Copilot: an assistant on Today and For Review.
   Copilot answers and filters; it never changes data. An instruction that would change data ("approve all
   spot-checks in Engagement that passed every check") is handed to Autopilot, which shows exactly what it
   will do, runs only after the person confirms, reports back, and can be undone.
   Rule-based in the POC: it reads the same decisions, due dates and logs the pages use.
   Needs demandai-nba.js and the page's ALL_RUNS() and render(). */
(function(){
  const PAGE = (location.pathname.split('/').pop() || '00-today.html');
  const ON_REVIEW = PAGE === '14-review.html';
  const INTRO_KEY = 'demandai_copilot_intro_v1:' + PAGE;
  const S = { msgs: [], plans: {}, runs: {}, seq: 0 };

  const seen = () => { try{ return localStorage.getItem(INTRO_KEY)==='seen'; }catch(e){ return false; } };
  const inRun = (run, fn) => { const keep = RUN; RUN = run; try{ return fn(); } finally { RUN = keep; } };
  const runs = () => (typeof ALL_RUNS==='function' ? ALL_RUNS() : []).slice().sort((a,b)=>b.saved.createdAt-a.saved.createdAt);
  const SEGS = Object.keys(SEG_MEANS);
  const pl = (n, one, many) => `${n} ${n===1?one:(many||one+'s')}`;

  function all(){
    return runs().flatMap(run=>inRun(run, ()=>run.seg.recs.map(r=>{
      const d = dec(r.key), paused = !!pausedInfo(r), q = inQueue(d) && !paused;
      return { id: run.saved.id+'::'+r.key, run, r, d, who: liveRec(r).contact.name, account: r.account.name, segment: r.segment||'',
        owner: ownerOf(r), mine: mine(r), paused, queued: q, due: q ? dueOf(r, d) : null, cats: q ? reasonCats(r, d) : [], action: chosenAction(r) };
    })));
  }
  const queue = () => all().filter(x=>x.mine && x.queued).sort((a,b)=>a.due-b.due);
  const approvals = () => isManager() ? all().filter(x=>x.d.status==='Awaiting approval' && !x.paused) : [];

  /* ─── Reading the question ─── */
  function parse(text){
    const t = text.toLowerCase();
    const seg = SEGS.find(s=>t.includes(s.toLowerCase())) || (/moderni[sz]ation/.test(t) ? 'Modernisation' : null);
    const repE = Object.keys(REPS).find(e=>t.includes(REPS[e].split(' ')[0].toLowerCase()));
    const due = /overdue|late\b/.test(t) ? 'overdue' : /today/.test(t) ? 'today' : /tomorrow/.test(t) ? 'tomorrow' : null;
    const reason = /sensitive/.test(t) ? 'sensitive' : /claim/.test(t) ? 'claim' : /low confidence|confidence/.test(t) ? 'low'
      : /too small|small segment/.test(t) ? 'small' : /deal/.test(t) ? 'deal' : /brand|rule/.test(t) ? 'brand'
      : /alternative/.test(t) ? 'alternative' : /sent back/.test(t) ? 'sentback' : null;
    const kind = /spot/.test(t) ? 'spot' : /approval/.test(t) ? 'approvals' : /exception/.test(t) ? 'exception' : null;
    return { t, seg, rep: repE || null, due, reason, kind };
  }
  const describe = f => [f.kind==='spot'?'spot-checks':f.kind==='exception'?'exceptions':f.kind==='approvals'?'approvals':'items',
    f.seg && `in ${f.seg}`, f.rep && `for ${REPS[f.rep]}`, f.reason && `with ${REASON_CATS[f.reason].toLowerCase()}`,
    f.due && (DUE_BUCKETS.find(b=>b[0]===f.due)||[])[1].toLowerCase()].filter(Boolean).join(' ');
  function match(list, f){
    return list.filter(x=>(!f.seg || x.segment===f.seg) && (!f.rep || x.owner===f.rep) && (!f.due || dueBucket(x.due)===f.due)
      && (!f.reason || x.cats.includes(f.reason)) && (!f.kind || f.kind==='approvals' || (f.kind==='spot' ? x.d.spot==='pending' : x.d.spot!=='pending')));
  }

  /* ─── Pieces of an answer ─── */
  const href = x => `14-review.html?item=${encodeURIComponent(x.id)}`;
  const row = x => `<a href="${href(x)}" ${ON_REVIEW?`onclick="Copilot.openItem('${esc(x.id)}');return false"`:''} style="display:flex;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--s75);text-decoration:none;color:inherit">
      <span style="flex:1;min-width:0;font-size:12px;color:var(--i1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b>${esc(x.who)}</b> · ${esc(x.account)}
      <span style="color:var(--i3)">· ${esc(x.d.status==='Awaiting approval'?'Approval':REASON_CATS[x.cats[0]]||'')}${x.due?` · ${esc(dueLabel(x.due))}`:''}${isManager()?` · ${esc(repName(x.owner))}`:''}</span></span><span style="color:var(--i3)">›</span></a>`;
  const rows = (list, max=6) => list.slice(0,max).map(row).join('') + (list.length>max ? `<div style="font-size:11px;color:var(--i3);padding-top:6px">and ${list.length-max} more</div>` : '');
  const filterQS = f => Object.entries({ due:f.due, reason:f.reason, kind:f.kind==='approvals'?null:f.kind, seg:f.seg, rep:f.rep }).filter(([,v])=>v).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&');
  const filterBtn = (f, label) => f.kind==='approvals'
    ? `<a class="btn btn-sec btn-sm" href="14-review.html?view=approvals" ${ON_REVIEW?`onclick="Copilot.show({view:'approvals'});return false"`:''} style="text-decoration:none;margin-top:8px">Open the approvals →</a>`
    : `<a class="btn btn-sec btn-sm" href="14-review.html?${filterQS(f)}" ${ON_REVIEW?`onclick='Copilot.show(${JSON.stringify({filt:{due:f.due,reason:f.reason,kind:f.kind,seg:f.seg,rep:f.rep}})});return false'`:''} style="text-decoration:none;margin-top:8px">${label || (ON_REVIEW ? 'Filter the queue to these' : 'Show these in For Review →')}</a>`;
  const p = t => `<div style="font-size:12.5px;color:var(--i1);line-height:1.55">${t}</div>`;
  const note = t => `<div style="font-size:11px;color:var(--i3);line-height:1.5;margin-top:8px">${t}</div>`;

  function trackLine(seg){
    const all = trackRecord(), s = seg ? trackRecord(seg) : null;
    if(!all.n) return 'No first-time decisions yet, so there is no track record to show.';
    return (s && s.n ? `In ${esc(seg)}, reps agreed with the system's first recommendation <b>${s.a} of ${s.n}</b> times (${s.pct}%). ` : seg ? `No decisions in ${esc(seg)} yet. ` : '')
      + `Across everything: <b>${all.a} of ${all.n}</b> (${all.pct}%).` + (all.early ? ` Early days: only ${pl(all.n,'decision')} so far, so read it as a hint.` : '');
  }

  /* ─── Copilot: answers and filters, read only ─── */
  function answer(text){
    const f = parse(text), t = f.t, q = queue();
    if(/\b(reject|close|delete|send back|remove)\b/.test(t))
      return p("Autopilot doesn't reject or send back. A rejection needs a reason from a person, so it stays with you.") + (match(q, f).length ? rows(match(q, f)) + filterBtn(f) : '');
    if(/\b(approve|accept|rate|release|clear)\b/.test(t)) return autopilotPlan(text, f);

    if(/why/.test(t)){
      const words = t.split(/[^a-z0-9]+/).filter(w=>w.length>=4);
      const hit = all().filter(x=>x.mine).find(x=>words.some(w=>x.who.toLowerCase().includes(w) || x.account.toLowerCase().includes(w)));
      if(hit) return inRun(hit.run, ()=>{
        const ch = fourChecks(hit.r);
        return p(`<b>${esc(hit.who)} · ${esc(hit.account)}</b>: ${hit.d.spot==='pending' ? 'it went ahead on its own after passing every check, and was picked at random for this week\'s spot-check.'
            : hit.d.status==='Awaiting approval' ? 'a rep accepted it, but the draft has sensitive content, so it waits for the sales manager.'
            : hit.queued ? `it failed a check: ${esc((hit.d.reasons||exceptionReasons(hit.r)).join('; ')||whyHere(hit.d))}.` : `it is ${esc(hit.d.status.toLowerCase())}.`}`)
          + `<div class="tags" style="margin-top:8px">${ch.map(([k,ok])=>`<span class="tag ${ok?'tag-green':'tag-red'}">${ok?'✓':'✗'} ${esc(k)}</span>`).join('')}</div>`
          + note(`Why now: ${esc(hit.r.reason)}. ${trackLine(hit.segment)}`) + `<div>${rows([hit])}</div>`;
      });
      return p("I couldn't find that prospect or company in your items. Try a name, like \"why is " + esc((q[0]||{}).account||'Ironwood') + ' here?"');
    }
    if(/first|start|begin|next|what should/.test(t)){
      if(!q.length) return p('Nothing is waiting for you. Released messages waiting for an outcome are on Today.');
      const x = q[0];
      return p(`Start with <b>${esc(x.who)} · ${esc(x.account)}</b>. It's due ${esc(dueLabel(x.due).replace(/^Due /,'').replace(/^By /,'by '))}, the earliest in your queue, and it's here because of ${esc(REASON_CATS[x.cats[0]].toLowerCase())}.`)
        + rows([x]) + note(`After it, ${pl(q.length-1,'more item')} in the order they're due.`);
    }
    if(/agree|trust|track record|how (are|is) (we|it)|g2|accept(ed|ance) rate|how often/.test(t)){
      const segRows = SEGS.map(s=>[s, trackRecord(s)]).filter(([,r])=>r.n);
      return p(trackLine(f.seg)) + (segRows.length && !f.seg ? `<div style="margin-top:8px">${segRows.map(([s,r])=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-top:1px solid var(--s75)"><span>${esc(s)}</span><span style="color:var(--i2)">${r.a} of ${r.n} · <b>${r.pct}%</b></span></div>`).join('')}</div>` : '')
        + note('A first-time decision is the first accept or reject on an item. Flagged decisions count only once a manager has checked them; Autopilot approvals never count.');
    }
    if(f.kind==='approvals'){
      if(!isManager()){ const mineHeld = all().filter(x=>x.mine && x.d.status==='Awaiting approval'); return p(mineHeld.length ? `${pl(mineHeld.length,'message')} you accepted ${mineHeld.length===1?'is':'are'} waiting for the sales manager.` : 'Nothing you accepted is waiting for the sales manager.') + rows(mineHeld); }
      const a = match(approvals(), f);
      return p(a.length ? `${pl(a.length,'approval')} waiting for you${f.seg||f.rep?` (${describe(f)})`:''}.` : 'No approvals are waiting for you.') + rows(a) + (a.length ? filterBtn(f) : '');
    }
    if(f.due || f.reason || f.kind || f.seg || f.rep){
      const m = match(q, f);
      return p(m.length ? `${pl(m.length,'item')} in your queue: ${esc(describe(f))}.` : `Nothing in your queue matches: ${esc(describe(f))}.`) + rows(m) + (m.length ? filterBtn(f) : '');
    }
    if(/show all|clear filter|reset/.test(t) && ON_REVIEW){ Copilot.show({filt:{}}); return p('Showing the whole queue again.'); }
    if(/how many|count|what('|’)?s waiting|summary|overview/.test(t) || /due/.test(t)){
      const spot = q.filter(x=>x.d.spot==='pending').length;
      return p(`You have <b>${pl(q.length,'item')}</b> in For Review: ${pl(q.length-spot,'exception')} and ${pl(spot,'spot-check')}${isManager()?`, plus ${pl(approvals().length,'approval')}`:''}. ${q.length?`${q.filter(x=>['overdue','today'].includes(dueBucket(x.due))).length} are due today or overdue.`:''}`);
    }
    return help("I can answer questions about your work and filter it. I don't change anything myself. Try one of these:");
  }

  /* ─── Autopilot: does what you approved, then reports back ─── */
  function autopilotPlan(text, f){
    if(f.kind==='approvals' || (f.reason==='sensitive' && f.kind!=='spot'))
      return p("Autopilot won't approve sensitive content. Each one is held because the draft mentions something sensitive, so a person reads it before it's released.")
        + rows(match(approvals(), {...f, reason:null})) + filterBtn({kind:'approvals'});
    if(f.kind==='exception' || (f.reason && f.kind!=='spot'))
      return p("Autopilot won't accept exceptions. Each one failed a check, so a person decides it. I can narrow the queue so you can work through them quickly.")
        + rows(match(queue(), f)) + (match(queue(), f).length ? filterBtn(f) : '');
    const pool = match(queue().filter(x=>x.d.spot==='pending'), {...f, kind:'spot', reason:null});
    const ok = [], skip = [];
    pool.forEach(x=>inRun(x.run, ()=>{ const why = exceptionReasons(x.r); (why.length ? skip : ok).push({ x, why }); }));
    const assumed = f.kind ? '' : note('You didn\'t say which items, so this covers spot-checks only: they already went ahead on their own. Autopilot never accepts exceptions or approves sensitive content.');
    if(!pool.length) return p(`Nothing for Autopilot to do: no spot-checks waiting ${f.seg||f.rep||f.due?`(${esc(describe({...f, kind:'spot'}))})`:'for you'}.`) + assumed;
    const id = 'p' + (++S.seq);
    S.plans[id] = { text, ids: ok.map(o=>o.x.id) };
    return p(`That changes data, so I'm handing it to <b>Autopilot</b>. Before it runs, here is exactly what it will do:`)
      + `<div style="margin-top:10px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--pos)">Rate as accepted · ${ok.length}</div>`
      + (ok.length ? rows(ok.map(o=>o.x), 8) : note('None: every match fails a check now.'))
      + (skip.length ? `<div style="margin-top:10px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--warn)">Left for you · ${skip.length}</div>`
          + skip.slice(0,6).map(o=>`<div style="font-size:12px;padding:6px 0;border-top:1px solid var(--s75)"><b>${esc(o.x.who)}</b> · ${esc(o.x.account)}<div style="font-size:11px;color:var(--warn)">Fails a check now: ${esc(o.why.join('; '))}</div></div>`).join('') : '')
      + note(`Autopilot checks every item again before it acts. Each one is logged under your name as "Accepted by Autopilot" with your instruction. These don't count toward G2, because nobody judged each one. You can undo the run.`) + assumed
      + (ok.length ? `<div id="plan-${id}" style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-primary btn-sm" onclick="Copilot.runPlan('${id}')">Run with Autopilot · ${ok.length}</button><button class="btn btn-sec btn-sm" onclick="Copilot.cancel('${id}')">Cancel</button></div>` : '');
  }
  function runPlan(id){
    const plan = S.plans[id]; if(!plan) return; delete S.plans[id];
    const el = document.getElementById('plan-'+id); if(el) el.innerHTML = '<span class="tag tag-grey">Sent to Autopilot</span>';
    const byId = new Map(all().map(x=>[x.id, x])), done = [], skipped = [];
    plan.ids.forEach(i=>{
      const x = byId.get(i);
      if(!x || x.d.spot!=='pending'){ skipped.push({x, why:'already decided'}); return; }
      inRun(x.run, ()=>{
        const why = exceptionReasons(x.r);
        if(why.length){ skipped.push({x, why:why.join('; ')}); return; }
        const before = JSON.parse(JSON.stringify(dec(x.r.key)));
        setDec(x.r.key, {spot:'accepted', spotBy:me().who+' (Autopilot)', spotAt:Date.now(), autopilot:true});
        logIt(x.r, 'Accepted by Autopilot', {kind:'spot', note:`Spot-check · instruction: "${plan.text}" · checked again: all checks pass · not counted toward G2`});
        RUN.saved.log[0].autopilot = id;
        updateRunStats(true); persist();
        done.push({ x, before });
      });
    });
    S.runs[id] = done;
    say(p(`<b>Autopilot finished.</b> It rated ${pl(done.length,'spot-check')} as accepted${skipped.length?` and left ${skipped.length} for you`:''}.`)
      + rows(done.map(o=>o.x), 8)
      + skipped.map(o=>o.x ? `<div style="font-size:11px;color:var(--warn);padding-top:4px">Left for you: ${esc(o.x.who)} · ${esc(o.x.account)} (${esc(o.why)})</div>` : '').join('')
      + note('Logged in the decision log under your name.')
      + `<div id="undo-${id}" style="display:flex;gap:8px;margin-top:8px">${done.length?`<button class="btn btn-sec btn-sm" onclick="Copilot.undo('${id}')">Undo this run</button>`:''}<a class="btn btn-ghost btn-sm" href="14-review.html?view=log" ${ON_REVIEW?`onclick="Copilot.show({view:'log'});return false"`:''} style="text-decoration:none">Decision log →</a></div>`);
    refreshPage(); showToast(`Autopilot rated ${pl(done.length,'spot-check')}`);
  }
  function undo(id){
    const done = S.runs[id]; if(!done) return; delete S.runs[id];
    done.forEach(o=>inRun(o.x.run, ()=>{ RUN.saved.decisions[o.x.r.key] = o.before; logIt(o.x.r, 'Autopilot run undone', {note:'Back in the spot-check queue'}); updateRunStats(true); persist(); }));
    const el = document.getElementById('undo-'+id); if(el) el.innerHTML = '<span class="tag tag-grey">Undone</span>';
    say(p(`Undone. ${pl(done.length,'spot-check')} ${done.length===1?'is':'are'} back in For Review for a person to rate.`));
    refreshPage(); showToast('Autopilot run undone');
  }
  function refreshPage(){ try{ if(typeof loadRuns==='function') loadRuns(); if(typeof render==='function') render(); if(typeof reviewBadge==='function') reviewBadge(); }catch(e){} }

  /* ─── The panel ─── */
  function suggestions(){
    const q = queue(), spotSegs = {};
    q.filter(x=>x.d.spot==='pending' && x.segment).forEach(x=>{ spotSegs[x.segment] = (spotSegs[x.segment]||0)+1; });
    const seg = Object.entries(spotSegs).sort((a,b)=>b[1]-a[1]).map(e=>e[0])[0];
    return [ 'What should I do first?', "What's due today?", q[0] && `Why is ${q[0].account} here?`,
      isManager() && 'Show the approvals', seg && `Show spot-checks in ${seg}`, 'How often do reps agree with the system?',
      `Approve all spot-checks${seg?` in ${seg}`:''} that passed every check` ].filter(Boolean);
  }
  function help(lead){
    return p(lead) + `<div style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:10px">${suggestions().map(s=>`<button class="tag tag-grey" style="cursor:pointer;border:none;text-align:left" onclick="Copilot.ask(this.textContent)">${esc(s)}</button>`).join('')}</div>`;
  }
  function intro(){
    const where = ON_REVIEW ? 'For Review' : 'Today';
    return `<div class="panel" style="margin-bottom:14px;border-color:var(--brand-mid)"><div class="panel-hdr" style="background:var(--brand-lt)"><span class="panel-ttl" style="color:var(--brand-dk)">Meet Copilot</span><span class="tag tag-violet">New</span></div><div class="panel-body">
      <div style="font-size:12.5px;color:var(--i1);line-height:1.55;margin-bottom:10px">Your assistant on ${where}. Ask it in plain words ${ON_REVIEW ? 'to narrow this queue, explain why an item is here, or show how often reps agreed with the system' : "what's due, why something is in your queue, or how often reps agree with the system"}.</div>
      <div style="display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--s75)"><span class="tag tag-blue" style="height:fit-content">Copilot</span><div style="font-size:12px;color:var(--i2);line-height:1.5">Answers and filters. <b>It never changes your data.</b></div></div>
      <div style="display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--s75)"><span class="tag tag-violet" style="height:fit-content">Autopilot</span><div style="font-size:12px;color:var(--i2);line-height:1.5">When you ask for a change, like approving a batch of spot-checks, Copilot hands it to Autopilot. Autopilot shows you exactly what will change, runs only when you confirm, reports back here and can be undone. It never accepts exceptions or approves sensitive content.</div></div>
      <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="Copilot.dismissIntro()">Got it</button></div></div>`;
  }
  function ensure(){
    let dr = document.getElementById('copilotDrawer'); if(dr) return dr;
    dr = document.createElement('div'); dr.className = 'detail-drawer'; dr.id = 'copilotDrawer'; dr.style.width = '420px'; dr.style.zIndex = '310';
    dr.innerHTML = `<div class="drawer-hdr"><div><div class="drawer-title"><span style="color:var(--brand)">✦</span> Copilot</div><div class="drawer-sub">Answers and filters. Never changes your data.</div></div>
        <div style="display:flex;align-items:center;gap:6px"><a href="#" onclick="Copilot.showIntro();return false" style="font-size:11px;color:var(--brand);font-weight:600;text-decoration:none">About</a>
        <div class="drawer-close" onclick="Copilot.close()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div></div></div>
      <div class="drawer-body" id="cpBody"></div>
      <form id="cpForm" onsubmit="Copilot.ask(document.getElementById('cpInput').value);return false" style="position:sticky;bottom:0;display:flex;gap:8px;padding:12px 16px;background:var(--surf);border-top:1px solid var(--border)">
        <input id="cpInput" autocomplete="off" placeholder="Ask, or tell Autopilot what to do…" style="flex:1;min-width:0;padding:8px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12.5px;outline:none">
        <button class="btn btn-primary btn-sm" type="submit">Ask</button></form>`;
    document.body.appendChild(dr);
    return dr;
  }
  function draw(){
    const body = document.getElementById('cpBody'); if(!body) return;
    body.innerHTML = (seen() ? '' : intro()) + S.msgs.map(m=>m.you
      ? `<div style="display:flex;justify-content:flex-end;margin:12px 0 8px"><div style="max-width:85%;padding:8px 12px;background:var(--brand-lt);color:var(--i1);border-radius:12px 12px 2px 12px;font-size:12.5px">${esc(m.you)}</div></div>`
      : `<div style="display:flex;gap:8px;margin-bottom:6px"><span style="color:var(--brand);font-size:14px;line-height:1.3">✦</span><div style="flex:1;min-width:0">${m.html}</div></div>`).join('');
    body.parentElement.scrollTop = body.parentElement.scrollHeight;
  }
  function say(html){ S.msgs.push({ html }); draw(); }

  window.Copilot = {
    button(){ return `<button class="btn btn-sec btn-sm" onclick="Copilot.open()" title="Ask Copilot" style="gap:6px"><span style="color:var(--brand)">✦</span> Copilot${seen()?'':' <span class="tag tag-violet" style="padding:0 6px">New</span>'}</button>`; },
    open(){
      const d = document.getElementById('detailDrawer'); if(d) d.classList.remove('open');
      ensure(); if(!S.msgs.length) S.msgs.push({ html: help(`Hi ${esc((ROLE_PERSON[getRole()]||getRole()).split(' ')[0])}. Ask me anything about your ${ON_REVIEW?'queue':'day'}. For example:`) });
      draw(); document.getElementById('copilotDrawer').classList.add('open'); setTimeout(()=>{ const i = document.getElementById('cpInput'); if(i) i.focus(); }, 50);
    },
    close(){ const dr = document.getElementById('copilotDrawer'); if(dr) dr.classList.remove('open'); },
    ask(text){
      text = String(text||'').trim(); if(!text) return;
      const i = document.getElementById('cpInput'); if(i) i.value = '';
      S.msgs.push({ you: text });
      let html; try{ html = answer(text); }catch(e){ html = p("Sorry, I couldn't work that out. Try asking another way."); }
      say(html);
    },
    runPlan, undo,
    cancel(id){ delete S.plans[id]; const el = document.getElementById('plan-'+id); if(el) el.innerHTML = '<span class="tag tag-grey">Cancelled: nothing changed</span>'; },
    dismissIntro(){ try{ localStorage.setItem(INTRO_KEY,'seen'); }catch(e){} draw(); refreshPage(); },
    showIntro(){ try{ localStorage.removeItem(INTRO_KEY); }catch(e){} draw(); },
    openItem(id){ this.close(); if(typeof openItem==='function') openItem(id); },
    // For Review only: apply a filter or switch view on the page underneath.
    show(o){
      if(typeof FILT==='undefined') return;
      if(o.filt){ FILT = Object.assign({ due:null, reason:null, kind:null, seg:null, rep:null }, o.filt); view = 'queue'; }
      if(o.view) view = o.view;
      render();
    },
  };
})();
