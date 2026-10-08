/* DemandAI Copilot: an assistant on Today and For Review.
   Copilot answers and filters; it never changes data. An instruction that would change data ("approve all
   spot-checks in Engagement that passed every check") is handed to Autopilot, which shows exactly what it
   will do, runs only after the person confirms, reports back, and can be undone.
   Rule-based in the POC: it reads the same decisions, due dates and logs the pages use.
   Needs demandai-nba.js and the page's ALL_RUNS() and render(). */
(function(){
  const PAGE = (location.pathname.split('/').pop() || '00-today.html');
  const ON_REVIEW = PAGE === '14-review.html';
  const S = { msgs: [], plans: {}, runs: {}, seq: 0, inline: {} };

  const inRun = (run, fn) => { const keep = RUN; RUN = run; try{ return fn(); } finally { RUN = keep; } };
  const runs = () => (typeof ALL_RUNS==='function' ? ALL_RUNS() : (typeof RUN!=='undefined' && RUN ? [RUN] : [])).slice().sort((a,b)=>b.saved.createdAt-a.saved.createdAt);
  // The account open in the side panel, if any: Copilot then answers about it first.
  const itemCtx = () => { if(typeof WS!=='undefined' && WS && WS.key && RUN && recOf(WS.key)) return { run: RUN, key: WS.key, r: recOf(WS.key) }; const d = document.getElementById('detailDrawer'); return d && d.classList.contains('open') && typeof openKey!=='undefined' && openKey && RUN && recOf(openKey) ? { run: RUN, key: openKey, r: recOf(openKey) } : null; };
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
    const f = parse(text), t = f.t, q = queue(), ctx = itemCtx();
    if(!ctx){
      if(/\b(instead|my own|own action|suggest|suggestion)\b/.test(t)) return ownPlan(text);
      if(/runner/.test(t)) return runnerAnswer(f);
      if(/group|common|most (frequent|often)|by reason|reasons|stuck|why (are|is) (these|they|it|items)/.test(t)) return groupAnswer(f);
      if(/segment/.test(t) && !/spot/.test(t) && (/summar|overview|which|how (are|is)|compare|perform|all|show|list|accounts? in/.test(t) || f.seg)) return segAnswer(f);
    }
    // About the open account: why it's here, the runner-up, similar items, what we know about it.
    if(ctx && !/\b(approve|accept|rate|release|clear|reject|all)\b/.test(t)){
      const k = /runner|differ|alternative|instead/.test(t) ? 'compare' : /similar|track|agree|how did|outcome/.test(t) ? 'similar'
        : /account|know|signal|company|who|tell me/.test(t) ? 'account' : /why|here|reason|check/.test(t) ? 'why' : null;
      if(k) return `<div style="font-size:11px;color:var(--i3);margin-bottom:4px">About ${esc(ctx.r.account.name)}</div>` + inRun(ctx.run, ()=>itemAnswer(ctx.key, k));
    }
    if(/\b(reject|close|delete|send back|remove)\b/.test(t))
      return p("Autopilot doesn't reject or send back. A rejection needs a reason from a person, so it stays with you.") + (match(q, f).length ? rows(match(q, f)) + filterBtn(f) : '');
    if(/\b(approve|accept|rate|release|clear)\b/.test(t)) return autopilotPlan(text, f);

    if(/why/.test(t)){
      const words = t.split(/[^a-z0-9]+/).filter(w=>w.length>=4);
      const hit = all().filter(x=>x.mine).find(x=>words.some(w=>x.who.toLowerCase().includes(w) || x.account.toLowerCase().includes(w)));
      if(hit) return inRun(hit.run, ()=>{
        const ch = fourChecks(hit.r);
        return p(`<b>${esc(hit.who)} · ${esc(hit.account)}</b>: ${hit.d.spot==='pending' ? 'it went ahead on its own after passing every check, and was picked at random for this week\'s spot-check.'
            : hit.d.status==='Awaiting approval' ? 'the draft has sensitive content, so it waits for the sales manager\'s approval before anything goes out.'
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
      if(!isManager()){ const mineHeld = all().filter(x=>x.mine && x.d.status==='Awaiting approval'); return p(mineHeld.length ? `${pl(mineHeld.length,'message')} of yours ${mineHeld.length===1?'is':'are'} waiting for the sales manager's approval.` : 'Nothing of yours is waiting for the sales manager.') + rows(mineHeld); }
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

  /* ─── Working through the queue: by reason, the runner-ups, and your own action ─── */
  const pick = x => `<a href="${href(x)}" ${ON_REVIEW?`onclick="Copilot.openItem('${esc(x.id)}');return false"`:''} class="cpd-link">${esc(x.who)}</a> <span style="color:var(--i3)">· ${esc(x.account)}</span>`;
  function groupAnswer(f){
    const q = match(queue(), {...f, reason:null});
    if(!q.length) return p('Nothing is waiting for you, so there is nothing to group.');
    const by = {}; q.forEach(x=>{ const c = x.cats[0] || 'other'; (by[c] = by[c] || []).push(x); });
    const groups = Object.entries(by).sort((a,b)=>b[1].length-a[1].length);
    return p(`Your ${pl(q.length,'item')} grouped by why the system needs you, most common first:`)
      + groups.map(([c, xs])=>`<div class="cpd-card"><div class="cpd-card-h"><b>${esc(REASON_CATS[c]||c)}</b><span>${pl(xs.length,'item')}</span>
          ${ON_REVIEW ? `<button class="btn btn-sec btn-sm" onclick="Copilot.reviewGroup('${c}')">Review these ${xs.length} →</button>` : `<a class="btn btn-sec btn-sm" style="text-decoration:none" href="14-review.html?reason=${c}">Review these ${xs.length} →</a>`}</div>
          <table class="cpd-tbl"><tr><th>Prospect</th><th>Recommended</th><th>Runner-up</th></tr>${xs.slice(0,6).map(x=>`<tr><td>${pick(x)}</td><td>${esc(x.action)}</td><td>${x.r.runnerUp ? esc(x.r.runnerUp.action) : '<span style="color:var(--i3)">None</span>'}</td></tr>`).join('')}</table></div>`).join('')
      + note('Not happy with either action? Tell me, for example: "for ' + esc(q[0].who.split(' ')[0]) + ', use my own action: invite them to the site visit".');
  }
  function runnerAnswer(f){
    const q = match(queue(), f).filter(x=>x.r.runnerUp);
    if(!q.length) return p('None of your items has a runner-up' + (f.seg||f.reason ? ` (${esc(describe(f))})` : '') + '.');
    return p(`The recommended action and the runner-up for ${pl(q.length,'item')}:`)
      + `<div class="cpd-card"><table class="cpd-tbl"><tr><th>Prospect</th><th>Recommended</th><th>Runner-up</th><th></th></tr>${q.slice(0,8).map(x=>inRun(x.run, ()=>`<tr><td>${pick(x)}</td><td>${esc(x.r.action)}${!dec(x.r.key).useRunner&&!dec(x.r.key).manual?' <span class="tag tag-violet">Chosen</span>':''}</td><td>${esc(x.r.runnerUp.action)}${dec(x.r.key).useRunner?' <span class="tag tag-violet">Chosen</span>':''}<div style="font-size:11px;color:var(--i3)">${esc(x.r.runnerUp.reason)}</div></td>
          <td>${dec(x.r.key).useRunner ? '' : `<button class="btn btn-sec btn-sm" onclick="Copilot.useRunner('${esc(x.id)}',this)">Use it</button>`}</td></tr>`)).join('')}</table></div>`
      + note('Using the runner-up redrafts the message; the item still waits for you to approve it.');
  }
  function ownPlan(text){
    const t = text.toLowerCase(), words = t.split(/[^a-z0-9]+/).filter(w=>w.length>=3 && !['for','use','own','the','and','her','him','them','his','its','new'].includes(w));
    const x = queue().find(y=>words.some(w=>y.who.toLowerCase().split(' ').includes(w) || y.account.toLowerCase().split(' ').includes(w)));
    if(!x) return p('Tell me which prospect and the action, for example: "for Budi, use my own action: invite him to the site visit in May".');
    const action = (text.split(/:\s*/).slice(1).join(': ') || text.replace(/.*\b(instead|own action|my own|suggest(ion)?)\b[:,]?\s*/i,'')).trim().replace(/\.$/,'');
    if(action.length < 6) return p(`What should ${esc(x.who.split(' ')[0])} get instead? For example: "for ${esc(x.who.split(' ')[0])}, use my own action: share the lifecycle brochure".`);
    const id = 'o' + (++S.seq); S.plans[id] = { own: true, id: x.id, action };
    return p(`Here is what changes for <b>${esc(x.who)}</b> · ${esc(x.account)}:`)
      + `<div class="cpd-card"><table class="cpd-tbl"><tr><th>Now</th><th>Your action</th></tr><tr><td>${esc(x.action)}</td><td><b>${esc(action.charAt(0).toUpperCase()+action.slice(1))}</b></td></tr></table></div>`
      + note('The message is redrafted for your action. It still waits for you to approve it, and your action is logged for the learning loop.')
      + `<div id="plan-${id}" style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-primary btn-sm" onclick="Copilot.useOwn('${id}')">Use my action</button><button class="btn btn-sec btn-sm" onclick="Copilot.cancel('${id}')">Cancel</button></div>`;
  }
  function segAnswer(f){
    const items = all();
    const names = [...new Set(items.map(x=>x.segment).filter(Boolean))];
    if(f.seg){
      const xs = items.filter(x=>x.segment===f.seg);
      return p(`<b>${esc(f.seg)}</b>: ${pl(new Set(xs.map(x=>x.r.account.id)).size,'account')}. ${esc(SEG_MEANS[f.seg]||'')}.`)
        + `<div class="cpd-card"><table class="cpd-tbl"><tr><th>Prospect</th><th>Action</th><th>Status</th></tr>${xs.slice(0,10).map(x=>`<tr><td>${pick(x)}</td><td>${esc(x.action)}</td><td>${inRun(x.run, ()=>statusPill(x.d, x.r))}</td></tr>`).join('')}</table></div>`;
    }
    if(!names.length) return p('No micro-segments yet. Build them from a scored list in Micro-segments & NBA.');
    const rowsH = names.map(n=>{ const xs = items.filter(x=>x.segment===n);
      return `<tr><td><b>${esc(n)}</b></td><td>${new Set(xs.map(x=>x.r.account.id)).size}</td><td>${xs.filter(x=>x.d.status==='Released').length}</td><td>${xs.filter(x=>x.queued||x.d.status==='Awaiting approval').length}</td><td>${xs.filter(x=>x.d.outcome==='Meeting booked').length}</td></tr>`; }).join('');
    return p(`Your ${pl(names.length,'micro-segment')}:`)
      + `<div class="cpd-card"><table class="cpd-tbl"><tr><th>Micro-segment</th><th>Accounts</th><th>Ready</th><th>Waiting</th><th>Meetings</th></tr>${rowsH}</table></div>`
      + note('Ask about one, for example "show the accounts in Modernisation".');
  }

  /* ─── Autopilot: does what you approved, then reports back ───
     It rates spot-checks that still pass every check, and accepts an exception only when every reason it is
     here is low-risk (AUTOPILOT_LOW_RISK: below deal size; segment too small needs a person to assign a micro-segment) and you asked for those.
     Sensitive content, unsupported claims, brand or rule checks and low confidence always stay with a person. */
  const LOW = AUTOPILOT_LOW_RISK, lowNames = LOW.map(c=>REASON_CATS[c].toLowerCase()).join(' or ');
  // Would Autopilot take this item now? Returns null when it would, or the reason it leaves it for a person.
  function blockedWhy(x){
    return inRun(x.run, ()=>{
      const d = dec(x.r.key);
      if(d.spot==='pending'){ const why = exceptionReasons(x.r); return why.length ? `fails a check now: ${why.join('; ')}` : null; }
      if(d.status!=='Waiting' || pausedInfo(x.r)) return 'already decided';
      const cats = reasonCats(x.r, d), now = exceptionReasons(x.r).map(t=>reasonCats(x.r, {reasons:[t]})[0]);
      const risky = [...new Set(cats.concat(now))].filter(c=>!LOW.includes(c));
      if(risky.length) return `${risky.map(c=>REASON_CATS[c].toLowerCase()).join(', ')} needs a person`;
      if(isSensitive(draftOf(x.r))) return 'sensitive content needs a person';
      return null;
    });
  }
  function autopilotPlan(text, f){
    if(f.kind==='approvals' || (f.reason==='sensitive' && f.kind!=='spot'))
      return p("Autopilot won't approve sensitive content. Each one is held because the draft mentions something sensitive, so a person reads it before it's released.")
        + rows(match(approvals(), {...f, reason:null})) + filterBtn({kind:'approvals'});
    if(f.reason && !LOW.includes(f.reason) && f.kind!=='spot')
      return p(`Autopilot won't accept items with ${esc(REASON_CATS[f.reason].toLowerCase())}; a person decides those. It can accept exceptions whose only reason is ${esc(lowNames)}. I can narrow the queue so you can work through these quickly.`)
        + rows(match(queue(), f)) + (match(queue(), f).length ? filterBtn(f) : '');
    // Which items: exceptions when you named them (or a low-risk reason), otherwise spot-checks.
    const wantsExc = f.kind==='exception' || (f.reason && LOW.includes(f.reason));
    const pool = wantsExc ? match(queue().filter(x=>x.d.spot!=='pending'), {...f, kind:'exception'}) : match(queue().filter(x=>x.d.spot==='pending'), {...f, kind:'spot', reason:null});
    const ok = [], skip = [];
    pool.forEach(x=>{ const why = blockedWhy(x); (why ? skip : ok).push({ x, why }); });
    const what = wantsExc ? 'exceptions' : 'spot-checks';
    const assumed = f.kind || f.reason ? '' : note(`You didn't say which items, so this covers spot-checks only. To clear exceptions, name them, for example "accept all below deal size items".`);
    if(!pool.length) return p(`Nothing for Autopilot to do: no ${what} waiting ${f.seg||f.rep||f.due||f.reason?`(${esc(describe({...f, kind: wantsExc?'exception':'spot'}))})`:'for you'}.`) + assumed;
    const id = 'p' + (++S.seq);
    S.plans[id] = { text, ids: ok.map(o=>o.x.id) };
    return p(`That changes data, so I'm handing it to <b>Autopilot</b>. Before it runs, here is exactly what it will do:`)
      + `<div style="margin-top:10px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--pos)">${wantsExc ? 'Accept and release' : 'Rate as accepted'} · ${ok.length}</div>`
      + (ok.length ? rows(ok.map(o=>o.x), 8) : note(`None: every match has a reason a person must decide.`))
      + (skip.length ? `<div style="margin-top:10px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--warn)">Left for you · ${skip.length}</div>`
          + skip.slice(0,6).map(o=>`<div style="font-size:12px;padding:6px 0;border-top:1px solid var(--s75)"><b>${esc(o.x.who)}</b> · ${esc(o.x.account)}<div style="font-size:11px;color:var(--warn)">${esc(o.why.replace(/^./, c=>c.toUpperCase()))}</div></div>`).join('') : '')
      + note(`Autopilot checks every item again before it acts${wantsExc ? `, and accepts an exception only when its sole reason is ${esc(lowNames)}` : ''}. Each one is logged under your name as "Accepted by Autopilot" with your instruction. These don't count toward G2, because nobody judged each one. You can undo the run.`) + assumed
      + (ok.length ? `<div id="plan-${id}" style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-primary btn-sm" onclick="Copilot.runPlan('${id}')">Run with Autopilot · ${ok.length}</button><button class="btn btn-sec btn-sm" onclick="Copilot.cancel('${id}')">Cancel</button></div>` : '');
  }
  function runPlan(id){
    const plan = S.plans[id]; if(!plan) return; delete S.plans[id];
    const el = document.getElementById('plan-'+id); if(el) el.innerHTML = '<span class="tag tag-grey">Sent to Autopilot</span>';
    const byId = new Map(all().map(x=>[x.id, x])), done = [], skipped = [];
    plan.ids.forEach(i=>{
      const x = byId.get(i);
      if(!x || !x.queued){ skipped.push({x, why:'already decided'}); return; }
      const why = blockedWhy(x); if(why){ skipped.push({x, why}); return; }
      inRun(x.run, ()=>{
        const spot = x.d.spot==='pending', before = JSON.parse(JSON.stringify(dec(x.r.key)));
        if(spot) setDec(x.r.key, {spot:'accepted', spotBy:me().who+' (Autopilot)', spotAt:Date.now(), autopilot:true});
        else setDec(x.r.key, {status:'Released', released:'autopilot', by:me().who+' (Autopilot)', at:Date.now(), autopilot:true});
        logIt(x.r, 'Accepted by Autopilot', {kind: spot ? 'spot' : 'exception',
          note:`${spot ? 'Spot-check' : `Exception (${x.cats.map(c=>REASON_CATS[c]).join(', ')})`} · instruction: "${plan.text}" · checked again before acting · not counted toward G2`});
        RUN.saved.log[0].autopilot = id;
        updateRunStats(true); persist();
        done.push({ x, before, spot });
      });
    });
    S.runs[id] = done;
    const nSpot = done.filter(o=>o.spot).length, nExc = done.length - nSpot;
    const did = [nSpot && `rated ${pl(nSpot,'spot-check')} as accepted`, nExc && `accepted and released ${pl(nExc,'exception')}`].filter(Boolean).join(' and ') || 'changed nothing';
    say(p(`<b>Autopilot finished.</b> It ${did}${skipped.length?`, and left ${skipped.length} for you`:''}.`)
      + rows(done.map(o=>o.x), 8)
      + skipped.map(o=>o.x ? `<div style="font-size:11px;color:var(--warn);padding-top:4px">Left for you: ${esc(o.x.who)} · ${esc(o.x.account)} (${esc(o.why)})</div>` : '').join('')
      + note('Logged in the decision log under your name.')
      + `<div id="undo-${id}" style="display:flex;gap:8px;margin-top:8px">${done.length?`<button class="btn btn-sec btn-sm" onclick="Copilot.undo('${id}')">Undo this run</button>`:''}<a class="btn btn-ghost btn-sm" href="14-review.html?view=log" ${ON_REVIEW?`onclick="Copilot.show({view:'log'});return false"`:''} style="text-decoration:none">Decision log →</a></div>`);
    refreshPage(); showToast(`Autopilot ${did}`);
  }
  function undo(id){
    const done = S.runs[id]; if(!done) return; delete S.runs[id];
    done.forEach(o=>inRun(o.x.run, ()=>{ RUN.saved.decisions[o.x.r.key] = o.before; logIt(o.x.r, 'Autopilot run undone', {note:'Back in For Review'}); updateRunStats(true); persist(); }));
    const el = document.getElementById('undo-'+id); if(el) el.innerHTML = '<span class="tag tag-grey">Undone</span>';
    say(p(`Undone. ${pl(done.length,'item')} ${done.length===1?'is':'are'} back in For Review for a person to decide.`));
    refreshPage(); showToast('Autopilot run undone');
  }
  function refreshPage(){ try{ if(typeof loadRuns==='function') loadRuns(); if(typeof render==='function') render(); else if(typeof renderResults==='function' && typeof RUN!=='undefined' && RUN) renderResults(); if(typeof reviewBadge==='function') reviewBadge(); const sh = document.getElementById('cpSheet'); if(sh){ const b = sh.querySelector('.cp-sheet-b'); b.scrollTop = b.scrollHeight; } }catch(e){ console.error(e); } }

  /* ─── The panel ─── */
  function suggestions(){
    const ctx = itemCtx();
    if(ctx) return ITEM_QS.map(([,l])=>l).concat(['What should I do first?']);
    const q = queue(), spotSegs = {};
    q.filter(x=>x.d.spot==='pending' && x.segment).forEach(x=>{ spotSegs[x.segment] = (spotSegs[x.segment]||0)+1; });
    const seg = Object.entries(spotSegs).sort((a,b)=>b[1]-a[1]).map(e=>e[0])[0];
    if(!ON_REVIEW && PAGE==='12-nba.html') return ['Summarise my micro-segments', SEGS[1] && `Show the accounts in ${SEGS[1]}`, 'Group what is waiting by reason', 'Show the runner-ups', 'How often do reps agree with the system?'].filter(Boolean);
    return [ 'Group my queue by the most common reason', 'Show the runner-ups', q[0] && `For ${q[0].who.split(' ')[0]}, use my own action: invite them to the site visit`, 'What should I do first?', "What's due today?",
      isManager() && 'Show the approvals', seg && `Show spot-checks in ${seg}`, 'How often do reps agree with the system?',
      `Approve all spot-checks${seg?` in ${seg}`:''} that passed every check` ].filter(Boolean);
  }
  function help(lead){
    return p(lead) + `<div style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:10px">${suggestions().map(s=>`<button class="tag tag-grey" style="cursor:pointer;border:none;text-align:left" onclick="Copilot.ask(this.textContent)">${esc(s)}</button>`).join('')}</div>`;
  }
  function inlineMsgs(id){
    const msgs = S.inline[id] || [];
    const chips = `<div style="display:flex;flex-wrap:wrap;gap:6px">${ITEM_QS.map(([,l])=>`<button type="button" class="tag tag-grey" style="cursor:pointer;border:none" onclick="Copilot.askInline(this.textContent)">${esc(l)}</button>`).join('')}</div>`;
    return chips + msgs.map(m=>m.you
      ? `<div style="display:flex;justify-content:flex-end;margin:12px 0 6px"><div style="max-width:85%;padding:7px 11px;background:var(--brand-lt);color:var(--i1);border-radius:12px 12px 2px 12px;font-size:12.5px">${esc(m.you)}</div></div>`
      : `<div style="display:flex;gap:8px"><span style="color:var(--brand)">✦</span><div style="flex:1;min-width:0">${m.html.replace(/^<div style="font-size:11px;color:var\(--i3\);margin-bottom:4px">About [^<]*<\/div>/, '')}</div></div>`).join('');
  }
  function ensure(){
    let dr = document.getElementById('copilotDrawer'); if(dr) return dr;
    dr = document.createElement('div'); dr.className = 'detail-drawer'; dr.id = 'copilotDrawer'; dr.style.width = '420px'; dr.style.zIndex = '310';
    dr.innerHTML = `<div class="drawer-hdr"><div><div class="drawer-title"><span style="color:var(--brand)">✦</span> Copilot</div><div class="drawer-sub">Answers and filters. Never changes your data.</div></div>
        <div style="display:flex;align-items:center;gap:6px">
        <div class="drawer-close" onclick="Copilot.close()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div></div></div>
      <div class="drawer-body" id="cpBody"></div>
      <form id="cpForm" onsubmit="Copilot.ask(document.getElementById('cpInput').value);return false" style="position:sticky;bottom:0;display:flex;gap:8px;padding:12px 16px;background:var(--surf);border-top:1px solid var(--border)">
        <input id="cpInput" autocomplete="off" placeholder="Ask, or tell Autopilot what to do…" style="flex:1;min-width:0;padding:8px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12.5px;outline:none">
        <button class="btn btn-primary btn-sm" type="submit">Ask</button></form>`;
    document.body.appendChild(dr);
    return dr;
  }

  /* ─── The Copilot side panel: opens from the top-right button, or from the text box at the bottom of an open
     account. The screen underneath moves aside, so closing it leaves everything as it was. Chats are saved per screen. ─── */
  const ICON = {
    spark:'<path d="M12 3.5l1.8 4.9a2 2 0 0 0 1.2 1.2l4.9 1.8-4.9 1.8a2 2 0 0 0-1.2 1.2L12 19.5l-1.8-4.9a2 2 0 0 0-1.2-1.2L4.1 11.6 9 9.8a2 2 0 0 0 1.2-1.2z"/><path d="M19 3v3M20.5 4.5h-3"/>',
    history:'<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3.5V8h4.5"/><path d="M12 7.5V12l3 2"/>',
    newchat:'<path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M17.6 3.4a1.9 1.9 0 0 1 2.9 2.9L12.5 14.3 9 15l.7-3.5z"/>',
    expand:'<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
    shrink:'<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>',
    close:'<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
    send:'<path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/>',
    stop:'<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
    back:'<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>',
    chat:'<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
    trash:'<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M18 7l-.8 12.2a2 2 0 0 1-2 1.8H8.8a2 2 0 0 1-2-1.8L6 7"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
    arrow:'<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  };
  const icon = (n, s=16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]||''}</svg>`;
  const tool = (n, tip, fn, on) => `<button type="button" class="cpp-tool ${on?'on':''}" data-tip="${esc(tip)}" aria-label="${esc(tip)}" onclick="${fn}">${icon(n, 17)}</button>`;

  const CHAT_KEY = 'demandai_copilot_chats_v1';
  const PAGE_NAME = { '00-today.html':'Today', '14-review.html':'For Review', '12-nba.html':'Micro-segments & NBA', '13-analytics.html':'Analytics' }[PAGE] || 'This screen';
  const threads = () => { try{ return JSON.parse(localStorage.getItem(CHAT_KEY)||'[]'); }catch(e){ return []; } };
  const saveThreads = all => { try{ localStorage.setItem(CHAT_KEY, JSON.stringify(all.slice(0,80))); }catch(e){} };
  function keepThread(t){ if(!t || !t.msgs.length) return; const all = threads().filter(x=>x.id!==t.id); all.unshift(t); saveThreads(all); }
  let P = null, BUSY = null;

  // Claude answers free questions when the viewer allows it; otherwise the built-in answers are used.
  let SAMPLE;
  if(typeof window!=='undefined' && window.claude && typeof window.claude.use==='function'){ window.claude.use('sample').then(s=>{ SAMPLE = s || null; }, ()=>{ SAMPLE = null; }); } else SAMPLE = null;

  function pEl(){ let el = document.getElementById('cpPanel'); if(el) return el; css(); el = document.createElement('aside'); el.id = 'cpPanel'; el.className = 'cp-panel'; el.setAttribute('aria-label','Copilot'); document.body.appendChild(el); return el; }
  const ago = t => { const m = Math.round((Date.now()-t)/60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m/60)} h ago` : new Date(t).toLocaleDateString(undefined,{day:'numeric',month:'short'}); };
  const chipsLeft = () => { const asked = new Set(P.thread.msgs.filter(m=>m.you).map(m=>m.you.toLowerCase())); return P.chips.filter(c=>!asked.has(String(c).toLowerCase())); };
  const meHtml = q => `<div class="cpp-me">${esc(q)}</div>`;
  const aiHtml = (html, id) => `<div class="cpp-ai"${id?` id="${id}"`:''}><span class="cpp-logo sm">${icon('spark', 13)}</span><div class="cpp-ai-b">${html}</div></div>`;
  const followHtml = () => { const c = chipsLeft().slice(0,3); return c.length ? `<div class="cpp-follow">${c.map(x=>`<button type="button" onclick="Copilot.ask2(this.dataset.q)" data-q="${esc(x)}">${icon('arrow', 13)}<span>${esc(x)}</span></button>`).join('')}</div>` : ''; };
  const typing = () => aiHtml('<span class="cpp-typing"><i></i><i></i><i></i></span>', 'cppPending');

  // A little markdown for Claude's answers: paragraphs, bullets, numbered lists, bold.
  function md(t){
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/`([^`]+)`/g,'<code>$1</code>');
    const out = []; let list = null;
    String(t||'').split('\n').forEach(line=>{
      const b = line.match(/^\s*[-*•]\s+(.*)/), n = line.match(/^\s*\d+[.)]\s+(.*)/);
      if(b || n){ const tag = b ? 'ul' : 'ol'; if(!list || list.tag!==tag){ list = { tag, items: [] }; out.push(list); } list.items.push(inline((b||n)[1])); return; }
      list = null; if(line.trim()) out.push(`<p>${inline(line.trim())}</p>`);
    });
    return out.map(x=>typeof x==='string' ? x : `<${x.tag}>${x.items.map(i=>`<li>${i}</li>`).join('')}</${x.tag}>`).join('');
  }
  const plain = html => { const d = document.createElement('div'); d.innerHTML = html; return (d.innerText || d.textContent || '').replace(/\s+\n/g,'\n').trim(); };

  function bodyHtml(){
    if(P.view==='history'){
      const ts = threads().filter(t=>t.page===PAGE);
      return `<div class="cpp-hist-top"><button type="button" class="cpp-link" onclick="Copilot.backToChat()">${icon('back', 15)} Back to the chat</button><span>${ts.length} saved on ${esc(PAGE_NAME)}</span></div>`
        + (ts.length ? ts.map(t=>{ const n = t.msgs.filter(m=>m.you).length; return `<div class="cpp-hist ${t.id===P.live.id?'cur':''}">
            <button type="button" class="cpp-hist-main" onclick="Copilot.openThread('${t.id}')"><span class="cpp-hist-i">${icon('chat', 15)}</span>
              <span class="cpp-hist-tx"><span class="cpp-hist-t">${esc(t.title)}</span><span class="cpp-hist-q">${esc((t.msgs.find(m=>m.you)||{}).you||'')}</span><span class="cpp-hist-m">${n} question${n===1?'':'s'} · ${ago(t.at)}</span></span></button>
            <button type="button" class="cpp-tool sm" data-tip="Delete" aria-label="Delete this chat" onclick="Copilot.deleteThread('${t.id}')">${icon('trash', 15)}</button></div>`; }).join('')
          : `<div class="cpp-none">No saved chats on this screen yet. Every chat you start is kept here.</div>`);
    }
    if(!P.thread.msgs.length) return `<div class="cpp-hello"><span class="cpp-logo lg">${icon('spark', 22)}</span>
        <div class="cpp-hello-t">What do you want to know${P.sub ? ` about ${esc(P.sub)}` : ''}?</div>
        <div class="cpp-hello-s">I answer from the data on this screen. I never change anything unless you confirm.</div>
        <div class="cpp-sugg">${P.chips.slice(0,4).map(c=>`<button type="button" onclick="Copilot.ask2(this.dataset.q)" data-q="${esc(c)}"><span>${esc(c)}</span>${icon('arrow', 14)}</button>`).join('')}
          <div class="cpp-sugg-off" title="After the pilot: answers from the client's own documents, CRM notes and past conversations">${icon('search', 14)}<span>Search the client's knowledge base</span><em>After the pilot</em></div></div></div>`;
    const msgs = P.thread.msgs.map(m=>m.you ? meHtml(m.you) : aiHtml(m.html)).join('');
    return (P.readonly ? `<div class="cpp-note">A saved chat from ${ago(P.thread.at)}${P.thread.ctx===P.liveCtx ? '' : ' about another account'}. <button type="button" class="cpp-link" onclick="Copilot.backToChat()">Back to the current chat</button></div>` : '') + msgs + (P.readonly ? '' : followHtml());
  }
  function composer(){
    return `<div class="cpp-f"><form class="cpp-comp" onsubmit="Copilot.ask2(this.q.value);return false">
        <textarea name="q" id="cppInput" rows="1" placeholder="Ask about ${esc(P.sub || P.title)}…" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px'"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit();}"></textarea>
        <button class="cpp-send" id="cppSend" type="${BUSY?'button':'submit'}" ${BUSY?'onclick="Copilot.stop()" aria-label="Stop"':'aria-label="Send"'}>${icon(BUSY?'stop':'send', 16)}</button></form>
      <div class="cpp-foot">Enter to send · Shift + Enter for a new line · Esc to close</div></div>`;
  }
  function drawPanel(){
    const el = pEl(); el.classList.toggle('wide', !!P.wide); push();
    el.innerHTML = `<div class="cpp-h"><span class="cpp-logo">${icon('spark', 16)}</span>
        <div class="cpp-ht"><div class="cpp-t">Copilot</div><div class="cpp-s" title="${esc(P.title)}">${esc(P.title)}</div></div>
        <div class="cpp-tools">${tool('history', 'Saved chats', 'Copilot.history()', P.view==='history')}${tool('newchat', 'New chat', 'Copilot.newChat()')}${tool(P.wide?'shrink':'expand', P.wide?'Make it narrower':'Make it wider', 'Copilot.toggleWide()')}${tool('close', 'Close (Esc)', 'Copilot.closePanel()')}</div></div>
      <div class="cpp-b" id="cppBody">${bodyHtml()}</div>
      ${P.view==='history' || P.readonly ? '' : composer()}`;
    const b = document.getElementById('cppBody'); if(b) b.scrollTop = b.scrollHeight;
  }
  // The page moves aside for the panel, so nothing underneath is covered (the wide panel lies over it).
  function push(){
    const open = panelIsOpen() || (P && pEl().classList.contains('open'));
    // Only when the screen is wide enough to keep the page readable beside it; otherwise the panel lies over the page.
    const main = document.querySelector('.main'), left = main ? main.getBoundingClientRect().left : 0;
    document.body.classList.toggle('cp-push', !!(open && P && !P.wide && window.innerWidth - left - 420 >= 760));
    document.body.classList.toggle('cp-open', !!(open && P));
  }
  function panelOpen(o){
    o = o || {};
    const ctx = o.ctx || 'page';
    P = { ctx, liveCtx: ctx, title: o.title || PAGE_NAME, sub: o.sub || '', answer: o.answer || answer, context: o.context || (()=>contextText()), chips: o.chips || suggestions(), wide: P ? P.wide : false, view: 'chat', readonly: false };
    const prev = !o.fresh && threads().find(t=>t.page===PAGE && t.ctx===ctx);
    P.thread = prev || { id: 't' + Date.now().toString(36), page: PAGE, ctx, title: P.title, at: Date.now(), msgs: [] };
    P.live = P.thread;
    pEl().classList.add('open'); drawPanel();
    if(o.q) panelAsk(o.q); else setTimeout(()=>{ const i = document.getElementById('cppInput'); if(i) i.focus(); }, 80);
  }
  // Built-in answers for the suggested questions; Claude for anything else when it is allowed.
  async function getAnswer(q, chip){
    let rule = null; try{ rule = P.answer(q); }catch(e){ console.error(e); }
    if(chip && rule) return { html: rule };
    if(SAMPLE){
      const turns = [], hist = P.thread.msgs.slice(0, -1).slice(-8);
      for(let i = 0; i < hist.length; i++){ const m = hist[i]; turns.push(m.you ? `Q: ${m.you}` : `A: ${plain(m.html).slice(0, 600)}`); }
      const prompt = `You are Copilot inside DemandAI, an outreach tool that sales reps and sales managers at an industrial automation supplier ("the client") use to decide which prospects to contact and what to send.
Answer the question using ONLY the data below. Keep it short: one to four plain sentences, or a short bullet list. Use the same words as the screen. If the data does not answer it, say so plainly and say where in DemandAI they could look. You can only answer: never say you changed, sent or approved anything. Refer to the vendor only as "the client".

SCREEN: ${PAGE_NAME}${P.sub ? ` · ${P.sub}` : ''}
DATA:
${String(P.context()||'').slice(0, 24000)}
${turns.length ? `\nEARLIER IN THIS CHAT:\n${turns.join('\n')}\n` : ''}
QUESTION: ${q}`;
      const ctl = new AbortController(); BUSY = ctl; setSend();
      try{
        const res = await SAMPLE(prompt, { modelTier:'quick', cache:false, signal: ctl.signal, onText: ({ text }) => { const el = document.querySelector('#cppPending .cpp-ai-b'); if(el){ el.innerHTML = md(text); scrollDown(); } } });
        return { html: md(res.text) || rule || unknown() };
      }catch(e){
        if(e && e.code==='not_granted') SAMPLE = null;
        if(e && e.code==='cancelled') return { html: (e.text ? md(e.text) : '') + '<p class="cpp-muted">Stopped.</p>' };
        return { html: rule || unknown() };
      }finally{ BUSY = null; setSend(); }
    }
    await new Promise(res=>setTimeout(res, 380));
    return { html: rule || unknown() };
  }
  const unknown = () => `<p>I can't answer that from the data on this screen yet.</p><p class="cpp-muted">Try one of the questions below, or ask about the reason it's here, the message, the contact, the signals, the confidence or what happens when you approve.</p>`;
  function setSend(){ const b = document.getElementById('cppSend'); if(!b) return; b.type = BUSY ? 'button' : 'submit'; b.onclick = BUSY ? ()=>Copilot.stop() : null; b.setAttribute('aria-label', BUSY?'Stop':'Send'); b.innerHTML = icon(BUSY?'stop':'send', 16); b.classList.toggle('busy', !!BUSY); }
  function scrollDown(){ const b = document.getElementById('cppBody'); if(b && b.scrollHeight - b.scrollTop - b.clientHeight < 160) b.scrollTop = b.scrollHeight; }
  async function panelAsk(q){
    q = String(q||'').trim(); if(!q || !P || BUSY || P.asking) return;
    if(P.readonly || P.view!=='chat'){ P.thread = P.live; P.readonly = false; P.view = 'chat'; drawPanel(); }
    const chip = P.chips.some(c=>String(c).toLowerCase()===q.toLowerCase());
    P.thread.msgs.push({ you: q }); P.asking = true;
    const b = document.getElementById('cppBody'), i = document.getElementById('cppInput');
    if(i){ i.value = ''; i.style.height = 'auto'; }
    if(b){ if(P.thread.msgs.length===1) b.innerHTML = ''; b.querySelectorAll('.cpp-follow').forEach(x=>x.remove());
      b.insertAdjacentHTML('beforeend', meHtml(q) + typing());
      const me = b.querySelectorAll('.cpp-me'); const last = me[me.length-1]; b.scrollTop = Math.max(0, last.offsetTop - 14); }
    const { html } = await getAnswer(q, chip);
    P.asking = false;
    P.thread.msgs.push({ html }); P.thread.at = Date.now(); keepThread(P.thread);
    const pend = document.getElementById('cppPending');
    if(pend){ pend.outerHTML = aiHtml(html) + followHtml(); }
    const b2 = document.getElementById('cppBody'); if(b2){ const me = b2.querySelectorAll('.cpp-me'); const last = me[me.length-1]; if(last && b2.scrollHeight - last.offsetTop > b2.clientHeight) b2.scrollTop = Math.max(0, last.offsetTop - 14); else b2.scrollTop = b2.scrollHeight; }
    const i2 = document.getElementById('cppInput'); if(i2) i2.focus();
  }
  const panelIsOpen = () => { const el = document.getElementById('cpPanel'); return !!(el && el.classList.contains('open') && P); };
  if(typeof document!=='undefined') document.addEventListener('keydown', e=>{ if(e.key==='Escape' && panelIsOpen() && document.getElementById('cpPanel').contains(document.activeElement)){ e.preventDefault(); e.stopPropagation(); Copilot.closePanel(); } }, true);

  /* What Copilot knows, as text: the open account in full, or a summary of the screen. */
  function recText(r){
    const d = dec(r.key), lr = liveRec(r), c = lr.contact, x = draftOf(r), { chk, conf } = checksOf(r), sig = r.signal || {};
    const people = (r.result.people||[]).map(p=>`${p.contact.name} (${p.contact.jobTitle||'no title'}, ${p.contact.persona} persona${p.contact.email?`, email ${p.contact.email}${p.contact.emailVerified?' verified':' not verified'}`:''}${p.contact.linkedin?', LinkedIn':''})`).join('; ');
    const sigs = ((r.person && r.person.signals) || []).map(s=>`${s.type}, ${s.age} days ago${s.detail?`: ${s.detail}`:''}${s.source?` (source: ${s.source})`:''}`).join('; ');
    const ds = DemandAI.estimateDealSize(r.account), cats = inQueue(d) ? reasonCats(r, d) : [];
    return [
      `Account: ${r.account.name} · ${r.account.vertical||''} · ${r.account.existingCustomer?'existing customer':'net-new'}${r.account.country?` · ${r.account.country}`:''}${r.account.revenue?` · revenue USD ${r.account.revenue}`:''}${r.account.employees?` · ${r.account.employees} employees`:''}`,
      `Contact: ${c.name}, ${c.jobTitle||'no title'}, ${c.persona} persona. Email: ${c.email ? c.email + (c.emailVerified?' (verified)':' (not verified)') : 'none'}. LinkedIn: ${c.linkedin||'none'}.`,
      `Other people at the account: ${people || 'none'}`,
      `Micro-segment: ${segOf(r) || 'none (segment too small)'}. Tier: ${(r.person||{}).tier||'?'}.`,
      `Why now (main signal): ${sig.type||'?'} ${sig.age!==undefined?sig.age+' days ago':''}. ${r.reason||''}`,
      `All signals: ${sigs || 'none'}`,
      `Recommended action: ${r.action}. Why: ${r.reason||''}`,
      r.runnerUp ? `Runner-up action: ${r.runnerUp.action}. Why: ${r.runnerUp.reason||''}` : 'No runner-up.',
      d.manual ? `The reviewer wrote their own action: ${d.manual}` : d.useRunner ? 'The reviewer chose the runner-up.' : '',
      `Status: ${statusLabel(d, r)[0]}. Owner: ${repName(ownerOf(r))}.`,
      cats.length ? `Why it is in For Review: ${cats.map(k=>REASON_CATS[k]).join(', ')}. Detail: ${(d.reasons||exceptionReasons(r)).join(' · ')}` : '',
      inQueue(d) ? `Due: ${dueLabel(dueOf(r, d))}.` : '',
      `Checks: ${fourChecks(r).map(([k,ok])=>`${k} ${ok?'pass':'FAIL'}`).join(', ')}.`,
      `Confidence: ${conf.reason}.`,
      ds ? `Estimated deal size: about USD ${Math.round(ds.value/1000)}k (threshold ${Math.round(DemandAI.CONFIG.dealSize.threshold/1000)}k; basis: ${ds.basis}).` : '',
      `Brand flags: ${chk.flags.map(f=>`${f.rule} ${f.detail}`).join('; ') || 'none'}. Claims: ${chk.claims.map(cl=>`"${cl.text}" ${cl.verified?'approved':'NO SOURCE'}`).join('; ') || 'none'}.`,
      `Message (${x.channel}): ${x.channel==='Email' ? `Subject: ${x.subject}\n${x.body}` : x.channel==='LinkedIn' ? x.note : (x.task||'')}`,
      `History: ${(RUN.saved.log||[]).filter(l=>l.key===r.key).map(l=>`${l.decision} by ${l.who}${l.note?` (${l.note})`:''}`).join('; ') || 'none'}`,
      `What approving does: it releases the message to the owner to send${isSensitive(x)?'; because it is sensitive, a sales manager approves it first':''}. Rejecting asks for a reason, and the reason decides what comes back (another action, contact or draft, or the account is set aside).`,
    ].filter(Boolean).join('\n');
  }
  function contextText(){
    const ctx = itemCtx(); if(ctx) return inRun(ctx.run, ()=>recText(ctx.r));
    const q = queue(), ap = approvals();
    const line = x => `- ${x.who} · ${x.account} · ${x.d.status==='Awaiting approval'?'approval':REASON_CATS[x.cats[0]]||x.d.status} · action: ${x.action}${x.due?` · ${dueLabel(x.due)}`:''} · owner ${repName(x.owner)}`;
    const byReason = {}; q.forEach(x=>x.cats.forEach(c=>{ byReason[REASON_CATS[c]] = (byReason[REASON_CATS[c]]||0)+1; }));
    return `Viewer: ${(ROLE_PERSON[getRole()]||getRole())} (${isManager()?'sales manager':'rep'}).
Queue (${q.length} items needing a decision): by reason ${Object.entries(byReason).map(([k,v])=>`${k} ${v}`).join(', ')||'none'}.
${q.slice(0,60).map(line).join('\n')}
${isManager() ? `Approvals waiting (${ap.length}):\n${ap.slice(0,40).map(line).join('\n')}` : ''}
All prospects: ${all().length}; released: ${all().filter(x=>x.d.status==='Released').length}.`;
  }
  const msgsHtml = () => S.msgs.map(m=>m.you
      ? `<div style="display:flex;justify-content:flex-end;margin:12px 0 8px"><div style="max-width:85%;padding:8px 12px;background:var(--brand);color:#fff;border-radius:14px 14px 4px 14px;font-size:12.5px">${esc(m.you)}</div></div>`
      : `<div style="display:flex;gap:8px;margin-bottom:6px"><span style="color:var(--brand);font-size:14px;line-height:1.3">✦</span><div style="flex:1;min-width:0;font-size:12.5px">${m.html}</div></div>`).join('');
  function draw(){
    const body = document.getElementById('cpBody'); if(!body) return;
    body.innerHTML = msgsHtml();
    body.parentElement.scrollTop = body.parentElement.scrollHeight;
  }
  function say(html){
    if(panelIsOpen()){ P.thread.msgs.push({ html }); P.thread.at = Date.now(); keepThread(P.thread); const b = document.getElementById('cppBody'); if(b && P.view==='chat' && !P.readonly){ b.insertAdjacentHTML("beforeend", aiHtml(html)); b.scrollTop = b.scrollHeight; } return; }
    S.msgs.push({ html }); draw();
  }
  function css(){
    if(document.getElementById('cpDockCss')) return;
    const st = document.createElement('style'); st.id = 'cpDockCss';
    st.textContent = `.cp-dock{position:relative;flex-shrink:0;padding:10px 20px 14px;background:linear-gradient(180deg,rgba(245,246,249,0),var(--bg) 30%);z-index:40;}
.cp-bar{display:flex;align-items:center;gap:10px;max-width:880px;margin:0 auto;background:var(--surf);border:1px solid var(--bdk);border-radius:16px;padding:6px 6px 6px 14px;box-shadow:0 4px 18px rgba(20,26,33,.08);}
.cp-bar:focus-within{border-color:var(--brand-mid);box-shadow:0 0 0 3px var(--brand-lt),0 4px 18px rgba(20,26,33,.08);}
.cp-bar input{flex:1;min-width:0;border:none;outline:none;font-size:13px;background:transparent;padding:8px 0;}
.cp-bar .cp-send{width:34px;height:34px;border-radius:50%;background:var(--brand);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:15px;border:none;cursor:pointer;}
.cp-spark{color:var(--brand);font-size:15px;}
.cp-sheet{position:absolute;left:20px;right:20px;bottom:100%;max-width:880px;margin:0 auto;max-height:min(62vh,560px);display:flex;flex-direction:column;background:var(--surf);border:1px solid var(--brand-mid);border-radius:16px 16px 12px 12px;box-shadow:0 -10px 40px rgba(20,26,33,.16);overflow:hidden;animation:fadeUp .18s ease;}
.cp-sheet-h{display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--brand-lt);font-size:12.5px;font-weight:700;color:var(--brand-dk);}
.cp-sheet-h span{font-weight:400;color:var(--i3);font-size:11.5px;}
.cp-sheet-h button{margin-left:auto;border:none;background:none;cursor:pointer;color:var(--i2);font-size:13px;}
.cp-sheet-b{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;}
.cp-sheet-b > div:first-child{margin-top:auto;}
.cp-hints{display:flex;gap:6px;flex-wrap:wrap;max-width:880px;margin:0 auto 8px;}
.cp-hint{height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--border);background:var(--surf);color:var(--i2);font-size:11.5px;cursor:pointer;}
.cp-hint:hover{border-color:var(--brand-mid);color:var(--brand-dk);}
.cpd-card{border:1px solid var(--border);border-radius:10px;margin:8px 0;overflow:hidden;}
.cpd-card-h{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--s50);border-bottom:1px solid var(--border);font-size:12.5px;}
.cpd-card-h span{color:var(--i3);font-size:11.5px;flex:1;}
.cpd-tbl{width:100%;border-collapse:collapse;font-size:12px;}
.cpd-tbl th{text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3);padding:6px 10px;}
.cpd-tbl td{padding:7px 10px;border-top:1px solid var(--s75);vertical-align:top;color:var(--i1);}
.cpd-link{color:var(--brand-dk);font-weight:600;text-decoration:none;}
.cp-inline-bar{position:sticky;bottom:0;max-width:none;margin:12px -2px 0;z-index:5;}
.cp-panel{position:fixed;top:0;right:0;bottom:0;width:420px;max-width:100vw;background:var(--surf);border-left:1px solid var(--border);box-shadow:-8px 0 32px rgba(20,26,33,.10);z-index:650;display:flex;flex-direction:column;transform:translateX(105%);transition:transform .24s cubic-bezier(.4,0,.2,1),width .24s cubic-bezier(.4,0,.2,1);font-family:var(--fb);}
.cp-panel.open{transform:none;}
.cp-panel.wide{width:min(760px,62vw);box-shadow:-16px 0 48px rgba(20,26,33,.18);}
body .main{transition:margin-right .24s cubic-bezier(.4,0,.2,1);}
body.cp-push .main{margin-right:420px;}
body.cp-open .ws-dock .cp-bar,body.cp-open .det-foot{display:none;}
body.cp-open .ws-dock-row{justify-content:flex-end;}
body.cp-push #detailDrawer.open{right:420px;transition:right .24s cubic-bezier(.4,0,.2,1);}
.cpp-h{display:flex;align-items:center;gap:10px;padding:12px 10px 12px 16px;border-bottom:1px solid var(--border);min-height:58px;}
.cpp-logo{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#9B6BC6,var(--brand-dk));color:#fff;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 6px rgba(125,82,162,.28);}
.cpp-logo.sm{width:24px;height:24px;border-radius:7px;box-shadow:none;}
.cpp-logo.lg{width:44px;height:44px;border-radius:13px;}
.cpp-ht{flex:1;min-width:0;}
.cpp-t{font-size:14px;font-weight:700;color:var(--i1);line-height:1.2;}
.cpp-s{font-size:11.5px;color:var(--i3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}
.cpp-tools{display:flex;gap:2px;}
.cpp-tool{position:relative;width:32px;height:32px;border-radius:8px;border:none;background:transparent;color:var(--i2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s,color .12s;}
.cpp-tool:hover{background:var(--s75);color:var(--i1);}
.cpp-tool.on{background:var(--brand-lt);color:var(--brand-dk);}
.cpp-tool.sm{width:28px;height:28px;}
.cpp-tool[data-tip]:hover::after{content:attr(data-tip);position:absolute;top:calc(100% + 6px);right:0;white-space:nowrap;background:var(--i1);color:#fff;font-size:11px;font-weight:600;padding:4px 8px;border-radius:6px;pointer-events:none;z-index:2;}
.cpp-b{flex:1;overflow-y:auto;padding:18px 18px 8px;display:flex;flex-direction:column;gap:14px;scroll-behavior:smooth;}
.cpp-me{align-self:flex-end;max-width:86%;padding:9px 13px;background:var(--brand-lt);color:var(--i1);border-radius:16px 16px 4px 16px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;}
.cpp-ai{display:flex;gap:10px;align-items:flex-start;}
.cpp-ai-b{flex:1;min-width:0;font-size:13px;color:var(--i1);line-height:1.6;padding-top:2px;}
.cpp-ai-b p{margin:0 0 8px;} .cpp-ai-b p:last-child{margin-bottom:0;}
.cpp-ai-b ul,.cpp-ai-b ol{margin:4px 0 8px;padding-left:18px;} .cpp-ai-b li{margin:2px 0;}
.cpp-ai-b code{font-family:var(--fm);font-size:12px;background:var(--s75);padding:1px 4px;border-radius:4px;}
.cpp-ai-b .cp-card{box-shadow:none;margin-top:4px;}
.cpp-muted{color:var(--i3);font-size:12px;}
.cpp-typing{display:inline-flex;gap:4px;padding:8px 0;} .cpp-typing i{width:6px;height:6px;border-radius:50%;background:var(--brand-mid);animation:cppDot 1s infinite ease-in-out;}
.cpp-typing i:nth-child(2){animation-delay:.15s;} .cpp-typing i:nth-child(3){animation-delay:.3s;}
@keyframes cppDot{0%,80%,100%{opacity:.3;transform:translateY(0);}40%{opacity:1;transform:translateY(-3px);}}
.cpp-follow{display:flex;flex-direction:column;gap:6px;margin-left:34px;}
.cpp-follow button{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;max-width:100%;padding:6px 11px;border:1px solid var(--border);border-radius:999px;background:var(--surf);color:var(--i2);font-size:12px;font-weight:500;cursor:pointer;text-align:left;}
.cpp-follow button:hover{border-color:var(--brand-mid);color:var(--brand-dk);background:#FCFAFE;}
.cpp-follow svg{color:var(--brand);flex-shrink:0;}
.cpp-hello{margin:auto 0;display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:8px 2px 4px;}
.cpp-hello-t{font-family:var(--fd);font-size:18px;font-weight:700;color:var(--i1);line-height:1.3;margin-top:6px;letter-spacing:-.01em;}
.cpp-hello-s{font-size:12.5px;color:var(--i2);line-height:1.5;}
.cpp-sugg{display:flex;flex-direction:column;width:100%;margin-top:10px;border:1px solid var(--border);border-radius:12px;overflow:hidden;}
.cpp-sugg button,.cpp-sugg-off{display:flex;align-items:center;gap:10px;padding:11px 14px;border:none;border-top:1px solid var(--s75);background:var(--surf);color:var(--i1);font-size:12.5px;text-align:left;cursor:pointer;}
.cpp-sugg button:first-child{border-top:none;}
.cpp-sugg button span{flex:1;} .cpp-sugg button svg{color:var(--i3);}
.cpp-sugg button:hover{background:#FCFAFE;} .cpp-sugg button:hover svg{color:var(--brand);}
.cpp-sugg-off{color:var(--i3);cursor:help;background:var(--s50);}
.cpp-sugg-off span{flex:1;} .cpp-sugg-off em{font-style:normal;font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--brand-dk);background:var(--brand-lt);border-radius:999px;padding:2px 7px;}
.cpp-f{padding:10px 14px 12px;border-top:1px solid var(--border);background:var(--surf);}
.cpp-comp{display:flex;align-items:flex-end;gap:8px;border:1px solid var(--bdk);border-radius:14px;padding:6px 6px 6px 14px;background:var(--surf);transition:border-color .12s,box-shadow .12s;}
.cpp-comp:focus-within{border-color:var(--brand-mid);box-shadow:0 0 0 3px var(--brand-lt);}
.cpp-comp textarea{flex:1;min-width:0;border:none;outline:none;resize:none;font-family:var(--fb);font-size:13px;line-height:1.5;padding:6px 0;max-height:140px;background:transparent;color:var(--i1);}
.cpp-send{width:32px;height:32px;border-radius:10px;border:none;background:var(--brand);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;}
.cpp-send:hover{background:var(--brand-dk);} .cpp-send.busy{background:var(--i1);}
.cpp-foot{font-size:10.5px;color:var(--i3);margin-top:6px;text-align:center;}
.cpp-note{font-size:12px;color:var(--i2);padding:9px 12px;background:var(--s50);border-radius:10px;}
.cpp-link{display:inline-flex;align-items:center;gap:6px;border:none;background:none;color:var(--brand-dk);font-weight:600;font-size:12px;cursor:pointer;padding:0;}
.cpp-hist-top{display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:var(--i3);}
.cpp-hist{display:flex;align-items:center;gap:4px;border:1px solid var(--border);border-radius:12px;padding:2px 6px 2px 2px;}
.cpp-hist.cur{border-color:var(--brand-mid);}
.cpp-hist:hover{background:#FCFAFE;}
.cpp-hist-main{flex:1;min-width:0;display:flex;gap:10px;align-items:flex-start;padding:10px;border:none;background:none;text-align:left;cursor:pointer;}
.cpp-hist-i{color:var(--brand);margin-top:1px;}
.cpp-hist-tx{display:flex;flex-direction:column;gap:2px;min-width:0;}
.cpp-hist-t{font-size:12.5px;font-weight:700;color:var(--i1);}
.cpp-hist-q{font-size:12px;color:var(--i2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cpp-hist-m{font-size:11px;color:var(--i3);}
.cpp-none{font-size:12.5px;color:var(--i3);padding:16px;text-align:center;border:1px dashed var(--border);border-radius:12px;}
.cp-spark{color:var(--brand);display:inline-flex;}
.cp-bar .cp-send svg{display:block;}
#cpInline:not(:empty){padding:10px 12px;border:1px solid var(--brand-mid);border-radius:12px;background:var(--surf);margin-top:8px;}`;
    document.head.appendChild(st);
  }
  // The text box and panel styles load with the page, so the box looks right before Copilot is first opened.
  if(typeof document!=='undefined'){ if(document.head) css(); else document.addEventListener('DOMContentLoaded', css); }
  // The text box at the bottom of the page. Answers open in a sheet above it.
  function dock(opts){
    css(); opts = opts || {};
    const hints = (opts.hints || suggestions().slice(0,3));
    return `<div class="cp-dock" id="cpDock">
      <div class="cp-sheet" id="cpSheet" style="display:${S.sheet?'flex':'none'}"><div class="cp-sheet-h">✦ Copilot <span>answers and filters · Autopilot only acts when you confirm</span><button onclick="Copilot.collapse()" title="Hide">⌄ Hide</button></div><div class="cp-sheet-b"><div id="cpBody">${S.sheet ? msgsHtml() : ''}</div></div></div>
      ${S.sheet ? '' : `<div class="cp-hints">${hints.map(h=>`<button type="button" class="cp-hint" onclick="Copilot.ask(this.textContent)">${esc(h)}</button>`).join('')}</div>`}
      <form class="cp-bar" onsubmit="Copilot.ask(document.getElementById('cpInput').value);return false"><span class="cp-spark">✦</span>
        <input id="cpInput" autocomplete="off" placeholder="${esc(opts.placeholder || 'Ask Copilot…')}" onfocus="Copilot.expand()"><button class="cp-send" type="submit" aria-label="Send">↑</button></form></div>`;
  }

  window.Copilot = {
    button(){ css(); return `<button class="btn btn-sec btn-sm" onclick="Copilot.open()" title="Ask Copilot" style="gap:6px"><span class="cp-spark">${icon('spark', 15)}</span> Copilot</button>`; },
    panelOpen, ask2: q => panelAsk(q), isOpen: panelIsOpen,
    closePanel(){ if(BUSY) BUSY.abort(); const el = document.getElementById('cpPanel'); if(el) el.classList.remove('open'); document.body.classList.remove('cp-push', 'cp-open'); },
    toggleWide(){ if(!P) return; P.wide = !P.wide; drawPanel(); },
    history(){ if(!P) return; P.view = P.view==='history' ? 'chat' : 'history'; if(P.view==='chat'){ P.thread = P.live; P.readonly = false; } drawPanel(); },
    newChat(){ if(!P || BUSY) return; P.live = P.thread = { id: 't' + Date.now().toString(36), page: PAGE, ctx: P.ctx, title: P.title, at: Date.now(), msgs: [] }; P.view = 'chat'; P.readonly = false; drawPanel(); setTimeout(()=>{ const i = document.getElementById('cppInput'); if(i) i.focus(); }, 60); },
    openThread(id){ const t = threads().find(x=>x.id===id); if(!t || !P) return; P.view = 'chat'; if(t.ctx===P.ctx){ P.live = P.thread = t; P.readonly = false; } else { P.thread = t; P.readonly = true; } drawPanel(); },
    deleteThread(id){ saveThreads(threads().filter(t=>t.id!==id)); if(P && P.live.id===id) P.live = P.thread = { id: 't' + Date.now().toString(36), page: PAGE, ctx: P.ctx, title: P.title, at: Date.now(), msgs: [] }; drawPanel(); },
    backToChat(){ if(!P) return; P.thread = P.live; P.readonly = false; P.view = 'chat'; drawPanel(); },
    stop(){ if(BUSY) BUSY.abort(); },
    recText: r => recText(r),
    icon,
    dock, expand(){ const sh = document.getElementById('cpSheet'); if(!sh) return; if(!S.msgs.length) S.msgs.push({ html: help(`Hi ${esc((ROLE_PERSON[getRole()]||getRole()).split(' ')[0])}. Ask me about ${ON_REVIEW?'your queue':PAGE==='12-nba.html'?'your micro-segments and accounts':'your work'}. For example:`) });
      S.sheet = true; sh.style.display = 'flex'; const h = document.querySelector('.cp-hints'); if(h) h.style.display = 'none'; draw(); },
    collapse(){ S.sheet = false; const sh = document.getElementById('cpSheet'); if(sh) sh.style.display = 'none'; const h = document.querySelector('.cp-hints'); if(h) h.style.display = ''; },
    reviewGroup(c){ this.collapse(); if(typeof reviewGroup==='function') reviewGroup(c); },
    useRunner(id, btn){ const x = all().find(y=>y.id===id); if(!x) return; inRun(x.run, ()=>{ if(!dec(x.r.key).useRunner) swapAction(x.r.key); }); if(btn) btn.outerHTML = '<span class="tag tag-violet">Using it</span>'; showToast(`Runner-up chosen for ${x.who}; approve it when you are ready`); },
    useOwn(id){ const plan = S.plans[id]; if(!plan) return; delete S.plans[id]; const x = all().find(y=>y.id===plan.id); if(!x) return;
      inRun(x.run, ()=>{ change(x.r.key, 'Manual action added', ()=>setDec(x.r.key, {manual:plan.action, draft:null, edited:false})); logIt(x.r, 'Added a manual action', {note:plan.action+' · through Copilot'}); persist(); });
      const el = document.getElementById('plan-'+id); if(el) el.innerHTML = `<span class="tag tag-green">Your action is in</span> <a href="${href(x)}" ${ON_REVIEW?`onclick="Copilot.openItem('${esc(x.id)}');return false"`:''} class="cpd-link">Open it to approve →</a>`;
      refreshPage(); },
    open(){
      return panelOpen({});
      // With an account open, Copilot sits beside it and starts with that account; otherwise it covers your work.
      const ctx = itemCtx(), dr = ensure(), det = document.getElementById('detailDrawer');
      dr.style.right = ctx ? (det.offsetWidth || 500) + 'px' : '0';
      const key = ctx ? ctx.run.saved.id + '::' + ctx.key : '';
      if(key !== S.ctx || !S.msgs.length){ S.ctx = key; S.msgs.push({ html: ctx
        ? help(`Ask me about <b>${esc(ctx.r.account.name)}</b>. It stays open beside it. For example:`)
        : help(`Hi ${esc((ROLE_PERSON[getRole()]||getRole()).split(' ')[0])}. Ask me anything about your ${ON_REVIEW?'queue':'day'}. For example:`) }); }
      draw(); document.getElementById('copilotDrawer').classList.add('open'); setTimeout(()=>{ const i = document.getElementById('cpInput'); if(i) i.focus(); }, 50);
    },
    close(){ const dr = document.getElementById('copilotDrawer'); if(dr) dr.classList.remove('open'); },
    ask(text){
      text = String(text||'').trim(); if(!text) return;
      if(!document.getElementById('cpDock')){ if(panelIsOpen()) return panelAsk(text); return panelOpen({ q: text }); }
      const i = document.getElementById('cpInput'); if(i) i.value = '';
      S.msgs.push({ you: text });
      if(document.getElementById('cpDock')) this.expand();
      let html; try{ html = answer(text); }catch(e){ console.error(e); html = p("Sorry, I couldn't work that out. Try asking another way."); }
      say(html);
    },
    // Inside an open account, below its information: suggested questions, the answers, and a box to ask.
    inline(id){
      const r = recOf(id.split('::').pop()), name = r ? r.account.name : '', who = r ? liveRec(r).contact.name : ''; css();
      S.inlineId = id; S.inlineTitle = r ? `${who} · ${name}` : 'This account'; S.inlineSub = name;
      return `<div id="cpInlinePanel"><form class="cp-bar cp-inline-bar" onsubmit="Copilot.askInline(this.q.value);this.q.value='';return false"><span class="cp-spark">${icon('spark', 17)}</span>
          <input name="q" autocomplete="off" placeholder="Ask Copilot about ${esc(name || 'this account')}…"><button class="cp-send" type="submit" aria-label="Send">${icon('send', 16)}</button></form></div>`;
    },
    inlineHints(){},
    askInline(text){
      text = String(text||'').trim(); if(!text) return;
      if(panelIsOpen() && P.ctx===S.inlineId) return panelAsk(text);
      panelOpen({ ctx: S.inlineId, title: S.inlineTitle, sub: S.inlineSub, chips: ITEM_QS.map(([,l])=>l), q: text });
    },

    runPlan, undo,
    cancel(id){ delete S.plans[id]; const el = document.getElementById('plan-'+id); if(el) el.innerHTML = '<span class="tag tag-grey">Cancelled: nothing changed</span>'; },
    openItem(id){ this.close(); this.closePanel(); if(typeof openItem==='function') openItem(id); },
    // For Review only: apply a filter or switch view on the page underneath.
    show(o){
      if(typeof FILT==='undefined') return;
      if(o.filt){ FILT = Object.assign({ due:null, reason:null, kind:null, seg:null, rep:null }, o.filt); view = 'queue'; }
      if(o.view) view = o.view;
      render();
    },
  };
})();
