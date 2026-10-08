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
     account. Closing it leaves the screen underneath as it was. Every chat is saved per screen. ─── */
  const CHAT_KEY = 'demandai_copilot_chats_v1';
  const PAGE_NAME = { '00-today.html':'Today', '14-review.html':'For Review', '12-nba.html':'Micro-segments & NBA', '13-analytics.html':'Analytics' }[PAGE] || 'This screen';
  const threads = () => { try{ return JSON.parse(localStorage.getItem(CHAT_KEY)||'[]'); }catch(e){ return []; } };
  function keepThread(t){ if(!t || !t.msgs.length) return; const all = threads().filter(x=>x.id!==t.id); all.unshift(t); try{ localStorage.setItem(CHAT_KEY, JSON.stringify(all.slice(0,80))); }catch(e){} }
  let P = null;
  function pEl(){ let el = document.getElementById('cpPanel'); if(el) return el; css(); el = document.createElement('div'); el.id = 'cpPanel'; el.className = 'cp-panel'; document.body.appendChild(el); return el; }
  const bubble = m => m.you
    ? `<div class="cpp-me">${esc(m.you)}</div>`
    : `<div class="cpp-ai"><span class="cpp-av">✦</span><div class="cpp-ai-b">${m.html}</div></div>`;
  const ago = t => { const m = Math.round((Date.now()-t)/60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m/60)} h ago` : new Date(t).toLocaleDateString(undefined,{day:'numeric',month:'short'}); };
  function bodyHtml(){
    if(P.view==='history'){
      const ts = threads().filter(t=>t.page===PAGE);
      return `<div class="cpp-hist-h">Saved chats on ${esc(PAGE_NAME)} <span>${ts.length}</span></div>` + (ts.length ? ts.map(t=>`<button class="cpp-hist" onclick="Copilot.openThread('${t.id}')">
          <span class="cpp-hist-t">${esc(t.title)}</span><span class="cpp-hist-q">${esc((t.msgs.find(m=>m.you)||{}).you||'')}</span>
          <span class="cpp-hist-m">${t.msgs.filter(m=>m.you).length} question${t.msgs.filter(m=>m.you).length===1?'':'s'} · ${ago(t.at)}</span></button>`).join('') : '<div class="cpp-empty">No saved chats on this screen yet.</div>');
    }
    if(!P.thread.msgs.length) return `<div class="cpp-empty"><b>Ask me about ${esc(P.sub || P.title)}.</b><br>I answer from the same data you see, and I never change anything unless you confirm. Every chat is saved: find it under History.</div>`;
    return (P.readonly ? `<div class="cpp-note">A saved chat from ${ago(P.thread.at)}. ${P.thread.ctx===P.liveCtx ? '' : 'Open that account to carry on.'} <a href="#" onclick="Copilot.backToChat();return false">Back to the current chat</a></div>` : '') + P.thread.msgs.map(bubble).join('');
  }
  function drawPanel(){
    const el = pEl(); el.classList.toggle('wide', !!P.wide);
    el.innerHTML = `<div class="cpp-h"><span class="cpp-t">✦ Copilot</span><span class="cpp-s" title="${esc(P.title)}">about ${esc(P.title)} · answers only</span>
        <button class="cpp-ib ${P.view==='history'?'on':''}" title="Chats saved on this screen" onclick="Copilot.history()">🕘 History</button><button class="cpp-ib" title="Start a new chat; this one stays in History" onclick="Copilot.newChat()">＋ New chat</button>
        <button class="cpp-ib" title="${P.wide?'Make it narrower':'Make it wider'}" onclick="Copilot.toggleWide()">${P.wide?'⇥ Narrow':'⇤ Expand'}</button><button class="cpp-ib cpp-x" title="Close (Esc). The screen underneath stays as it was" onclick="Copilot.closePanel()">⌄ Hide</button></div>
      <div class="cpp-b" id="cppBody">${bodyHtml()}</div>
      ${P.view==='history' || P.readonly ? '' : `<div class="cpp-f"><div class="cpp-chips">${chipsLeft().map(c=>`<button class="cpp-chip" onclick="Copilot.ask2(this.textContent)">${esc(c)}</button>`).join('')}<span class="cpp-soon" title="After the pilot: answers from the client's own documents, CRM notes and past conversations">🔎 Search the client's knowledge base <b>After the pilot</b></span></div>
        <form class="cp-bar" onsubmit="Copilot.ask2(this.q.value);return false"><span class="cp-spark">✦</span><input name="q" id="cppInput" autocomplete="off" placeholder="Ask about ${esc(P.sub || P.title)}…"><button class="cp-send" type="submit" aria-label="Send">↑</button></form></div>`}`;
    const b = document.getElementById('cppBody'); if(b) b.scrollTop = b.scrollHeight;
  }
  // Suggested questions, minus the ones already asked in this chat.
  const chipsLeft = () => { const asked = new Set(P.thread.msgs.filter(m=>m.you).map(m=>m.you.toLowerCase())); return P.chips.filter(c=>!asked.has(String(c).toLowerCase())).slice(0,4); };
  function panelOpen(o){
    o = o || {};
    const ctx = o.ctx || 'page';
    P = { ctx, liveCtx: ctx, title: o.title || PAGE_NAME, sub: o.sub || '', answer: o.answer || answer, chips: o.chips || suggestions(), wide: P ? P.wide : false, view: 'chat', readonly: false };
    const prev = !o.fresh && threads().find(t=>t.page===PAGE && t.ctx===ctx);
    P.thread = prev || { id: 't' + Date.now().toString(36), page: PAGE, ctx, title: P.title, at: Date.now(), msgs: [] };
    P.live = P.thread;
    drawPanel(); pEl().classList.add('open');
    if(o.q) panelAsk(o.q); else setTimeout(()=>{ const i = document.getElementById('cppInput'); if(i) i.focus(); }, 60);
  }
  function panelAsk(q){
    q = String(q||'').trim(); if(!q || !P) return;
    if(P.readonly || P.view!=='chat'){ P.thread = P.live; P.readonly = false; P.view = 'chat'; drawPanel(); }
    P.thread.msgs.push({ you: q });
    let html; try{ html = P.answer(q); }catch(e){ console.error(e); html = p("Sorry, I couldn't work that out. Try asking another way."); }
    P.thread.msgs.push({ html }); P.thread.at = Date.now(); keepThread(P.thread);
    const b = document.getElementById('cppBody'); if(b){ if(P.thread.msgs.length===2) b.innerHTML = ''; b.insertAdjacentHTML('beforeend', bubble({you:q}) + bubble({html})); b.scrollTop = b.scrollHeight; }
    const ch = document.querySelector('#cpPanel .cpp-chips'); if(ch){ const sn = ch.querySelector('.cpp-soon'); ch.innerHTML = chipsLeft().map(c=>`<button class="cpp-chip" onclick="Copilot.ask2(this.textContent)">${esc(c)}</button>`).join(''); if(sn) ch.appendChild(sn); }
    const i = document.getElementById('cppInput'); if(i){ i.value = ''; i.focus(); }
  }
  const panelIsOpen = () => { const el = document.getElementById('cpPanel'); return !!(el && el.classList.contains('open') && P); };
  const msgsHtml = () => S.msgs.map(m=>m.you
      ? `<div style="display:flex;justify-content:flex-end;margin:12px 0 8px"><div style="max-width:85%;padding:8px 12px;background:var(--brand);color:#fff;border-radius:14px 14px 4px 14px;font-size:12.5px">${esc(m.you)}</div></div>`
      : `<div style="display:flex;gap:8px;margin-bottom:6px"><span style="color:var(--brand);font-size:14px;line-height:1.3">✦</span><div style="flex:1;min-width:0;font-size:12.5px">${m.html}</div></div>`).join('');
  function draw(){
    const body = document.getElementById('cpBody'); if(!body) return;
    body.innerHTML = msgsHtml();
    body.parentElement.scrollTop = body.parentElement.scrollHeight;
  }
  function say(html){
    if(panelIsOpen()){ P.thread.msgs.push({ html }); P.thread.at = Date.now(); keepThread(P.thread); const b = document.getElementById('cppBody'); if(b && P.view==='chat' && !P.readonly){ b.insertAdjacentHTML('beforeend', bubble({html})); b.scrollTop = b.scrollHeight; } return; }
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
.cp-panel{position:fixed;top:0;right:0;bottom:0;width:440px;max-width:100vw;background:var(--surf);border-left:1px solid var(--brand-mid);box-shadow:-12px 0 40px rgba(20,26,33,.16);z-index:650;display:flex;flex-direction:column;transform:translateX(105%);transition:transform .22s cubic-bezier(.4,0,.2,1),width .22s cubic-bezier(.4,0,.2,1);}
.cp-panel.open{transform:none;}
.cp-panel.wide{width:min(860px,70vw);}
.cpp-h{display:flex;align-items:center;gap:4px;padding:10px 10px 10px 14px;background:var(--brand-lt);border-bottom:1px solid var(--brand-mid);}
.cpp-t{font-size:12.5px;font-weight:700;color:var(--brand-dk);white-space:nowrap;}
.cpp-h{flex-wrap:wrap;}
.cpp-t{flex:1;}
.cpp-s{order:9;flex-basis:100%;min-width:0;font-size:11.5px;color:var(--i3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}
.cpp-ib{height:28px;padding:0 8px;border-radius:7px;border:1px solid transparent;background:transparent;cursor:pointer;color:var(--i2);font-size:11.5px;font-weight:600;white-space:nowrap;}
.cpp-x{color:var(--i1);}
.cpp-ib:hover,.cpp-ib.on{background:var(--surf);border-color:var(--brand-mid);color:var(--brand-dk);}
.cpp-b{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}
.cpp-me{align-self:stretch;padding:7px 12px;background:var(--brand);color:#fff;border-radius:8px;font-size:12.5px;line-height:1.5;}
.cpp-ai{display:flex;gap:8px;align-items:flex-start;}
.cpp-av{width:24px;height:24px;border-radius:7px;background:linear-gradient(135deg,var(--brand),var(--brand-dk));color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.cpp-ai-b{flex:1;min-width:0;font-size:12.5px;color:var(--i1);line-height:1.55;}
.cpp-empty{margin:auto 0 0;padding:14px;border:1px dashed var(--brand-mid);border-radius:12px;font-size:12.5px;color:var(--i2);line-height:1.6;background:#FCFAFE;}
.cpp-note{font-size:11.5px;color:var(--i3);padding:8px 10px;background:var(--s50);border-radius:8px;}
.cpp-note a{color:var(--brand);font-weight:600;}
.cpp-f{border-top:1px solid var(--border);padding:10px 12px 12px;}
.cpp-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}
.cpp-chip{height:27px;padding:0 10px;border-radius:999px;border:1px solid var(--brand-mid);background:var(--surf);color:var(--brand-dk);font-size:11.5px;font-weight:600;cursor:pointer;}
.cpp-chip:hover{background:var(--brand-lt);}
.cpp-chip:first-child{background:var(--brand-lt);}
.cpp-soon{display:inline-flex;align-items:center;gap:6px;height:27px;padding:0 10px;border:1px dashed var(--bdk);border-radius:999px;background:var(--s50);color:var(--i3);font-size:11.5px;font-weight:600;cursor:help;}
.cpp-soon b{font-size:9.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--brand-dk);background:var(--brand-lt);border-radius:999px;padding:1px 6px;}
.cpp-f .cp-bar{max-width:none;margin:0;box-shadow:none;}
.cpp-hist-h{font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--i3);display:flex;justify-content:space-between;}
.cpp-hist{display:flex;flex-direction:column;gap:2px;text-align:left;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surf);cursor:pointer;}
.cpp-hist:hover{border-color:var(--brand-mid);background:#FCFAFE;}
.cpp-hist-t{font-size:12.5px;font-weight:700;color:var(--i1);}
.cpp-hist-q{font-size:12px;color:var(--i2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cpp-hist-m{font-size:11px;color:var(--i3);}
.cp-inline-bar{position:sticky;bottom:0;max-width:none;margin:12px -2px 0;z-index:5;}
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
    button(){ return `<button class="btn btn-sec btn-sm" onclick="Copilot.open()" title="Ask Copilot" style="gap:6px"><span style="color:var(--brand)">✦</span> Copilot</button>`; },
    panelOpen, ask2: q => panelAsk(q), isOpen: panelIsOpen,
    closePanel(){ const el = document.getElementById('cpPanel'); if(el) el.classList.remove('open'); },
    toggleWide(){ if(!P) return; P.wide = !P.wide; pEl().classList.toggle('wide', P.wide); drawPanel(); },
    history(){ if(!P) return; P.view = P.view==='history' ? 'chat' : 'history'; if(P.view==='chat'){ P.thread = P.live; P.readonly = false; } drawPanel(); },
    newChat(){ if(!P) return; P.live = P.thread = { id: 't' + Date.now().toString(36), page: PAGE, ctx: P.ctx, title: P.title, at: Date.now(), msgs: [] }; P.view = 'chat'; P.readonly = false; drawPanel(); },
    openThread(id){ const t = threads().find(x=>x.id===id); if(!t || !P) return; P.view = 'chat'; if(t.ctx===P.ctx){ P.live = P.thread = t; P.readonly = false; } else { P.thread = t; P.readonly = true; } drawPanel(); },
    backToChat(){ if(!P) return; P.thread = P.live; P.readonly = false; P.view = 'chat'; drawPanel(); },
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
      return `<div id="cpInlinePanel"><form class="cp-bar cp-inline-bar" onsubmit="Copilot.askInline(this.q.value);this.q.value='';return false"><span class="cp-spark">✦</span>
          <input name="q" autocomplete="off" placeholder="Ask Copilot about ${esc(name || 'this account')}…"><button class="cp-send" type="submit" aria-label="Send">↑</button></form></div>`;
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
