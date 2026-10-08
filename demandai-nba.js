/* Shared by Micro-segments & NBA and For Review: rebuilding a segmented list, each item's action, draft,
   checks and decisions, the review drawer and the exports. Pages provide: esc, table, cell, fmtDate, download,
   showToast, tagChip, closeDrawer, getRole, ROLE_PERSON; and optionally onDecision() and queuePos(key). */
let RUN = null, openKey = null, openedAt = 0, html = '';
const reviewBadge = () => DemandAI.reviewBadge();
const HANDOFF_KEY = 'demandai_nba_handoff_v1';

const segTag = s => s ? `<span class="tag ${SEG_TONE[s]||'tag-grey'}">${esc(s)}</span>` : '<span class="tag tag-grey">No micro-segment</span>';
function me(){ const r = getRole(); return { who: ROLE_PERSON[r] || r, role: r }; }
function handoff(){ try{ return JSON.parse(localStorage.getItem(HANDOFF_KEY)||'null'); }catch(e){ return null; } }
const timeOf = t => new Date(t).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});


const SEG_MEANS = { Inquiry:'Asked a question or for a quote', Modernisation:'Installed system nearing end of support', 'Service renewal':'Service contract coming up for renewal',
  Project:'Capital project under way', Leadership:'New leader in a buying role', Engagement:'Engaged with our content or events' };

let UPLOAD = null;

function sourceFor(id){
  if(id==='sample') return { sample:true, name:'Sample prospects', listName:'Sample prospects', fileName:DemandAISample.SIGNAL_FILE, sheet:'Signal template', grid:DemandAISample.SIGNALS, asOf:DemandAISample.SAMPLE_AS_OF, sandbox:true, keys:null };
  if(id==='scenarios'){ const asOf = todayIso(); return { csv:true, scenarios:true, sample:false, name:'NBA test scenarios', listName:'NBA test scenarios', fileName:DemandAISample.NBA_SCENARIO_FILE, sheet:'(CSV)', grid:DemandAISample.nbaScenarioGrid(asOf), asOf, keys:null }; }
  if(id==='week'){ const asOf = todayIso(); return { csv:true, scenarios:true, week:true, sample:false, name:'A pilot week in progress', listName:'A pilot week in progress', fileName:'pilot_week.csv', sheet:'(CSV)', grid:DemandAISample.nbaWeekGrid(asOf), asOf, keys:null }; }
  if(id==='handoff') return handoff();
  if(id==='upload') return UPLOAD;
  const r = DemandAI.getScoring(id);
  return r && { name:r.name, listId:r.listId, listName:r.listName, fileName:r.fileName, sheet:r.sheet, grid:r.grid, asOf:r.asOf, sandbox:r.sandbox, keys:null };
}
// 5.9 Engage-once: accounts approved, sent or rejected as "already engaged" in any other segmented list of this pilot.
function engagedMap(exceptId, before){
  const m = new Map();
  DemandAI.loadSegmentations().filter(r=>r.id!==exceptId && r.createdAt < (before||Infinity)).forEach(run=>{
    Object.entries(run.decisions||{}).forEach(([k,d])=>{
      if(d.status==='Released' || d.code==='R4'){ const n = (run.accountNames||{})[k.split('|')[0]]; if(n && !m.has(n.toLowerCase())) m.set(n.toLowerCase(), `${run.name}, ${fmtDate(d.at||run.createdAt)}`); }
    });
  });
  return m;
}
function compute(src, runId, createdAt, brand){
  DemandAI.useBrand(brand);
  let list, scored, sig, fileIssues = 0;
  if(src.csv){
    const r = DemandAI.processScoredProspects(src.grid, {file:src.fileName, sheet:src.sheet, asOf:src.asOf});
    scored = r.results; fileIssues = r.stats.rejected;
    sig = { signals: scored.flatMap(x=>x.people.flatMap(p=>p.signals)), issues: r.issues, rejectedRows: r.stats.rejected };
  }
  else if(src.sample){ const r = DemandAI.processLeads(DemandAISample.LEADS, {file:DemandAISample.LEAD_FILE, sheet:'Lead template'}); list = {accounts:r.accounts, contacts:r.contacts}; }
  else { const L = DemandAI.getList(src.listId); if(!L) return null; list = JSON.parse(JSON.stringify({accounts:L.accounts, contacts:L.contacts})); }
  if(!src.csv){
    sig = DemandAI.processSignals(src.grid, list, {file:src.fileName, sheet:src.sheet, asOf:src.asOf});
    scored = DemandAI.scoreList(list, sig);
  }
  // An uploaded file is the list itself: every prospect in it. A scored list: tier A and B, unless chosen in Scoring.
  const keys = src.csv ? scored.flatMap(r=>r.people.map(p=>r.account.id+'|'+p.contact.row)) : src.keys || scored.flatMap(r=>(r.people||[]).filter(p=>p.signals.length && (p.tier==='A'||p.tier==='B')).map(p=>r.account.id+'|'+p.contact.row));
  const seg = DemandAI.buildSegments(scored, {keys, engaged: engagedMap(runId, createdAt)});
  // Order is shuffled within a priority tier, so position doesn't decide the outcome (seeded by the run, so it's stable).
  let h = 0; for(const ch of String(runId||src.name)) h = (h*31 + ch.charCodeAt(0)) >>> 0;
  const rnd = k => { let x = h; for(const ch of k) x = (x*31 + ch.charCodeAt(0)) >>> 0; return x; };
  const ti = {A:0,B:1,C:2};
  seg.recs.sort((a,b)=>(a.segment?0:1)-(b.segment?0:1) || (ti[a.person.tier]??3)-(ti[b.person.tier]??3) || rnd(a.key)-rnd(b.key));
  return { sig, scored, keys, seg, fileIssues };
}

function persist(){ if(RUN && !DemandAI.saveSegmentation(RUN.saved)) showToast("This browser blocks storage, so decisions can't be kept"); }

/* ═══════════════ PER-ITEM STATE: action, draft, checks ═══════════════ */
const asOf = () => RUN.saved.src.asOf;
function dec(key){ return RUN.saved.decisions[key] || {status:'Waiting'}; }
function setDec(key, patch){ RUN.saved.decisions[key] = Object.assign(dec(key), patch); }
function recOf(key){ return RUN.seg.recs.find(r=>r.key===key); }
// The prospect after any "wrong contact" alternative
function liveRec(r){
  const d = dec(r.key); if(!d.contactRow) return r;
  const p = r.result.people.find(x=>x.contact.row===d.contactRow); if(!p) return r;
  return Object.assign({}, r, { contact:p.contact, person:p });
}
function chosenAction(r){ const d = dec(r.key); return d.manual ? d.manual : d.useRunner && r.runnerUp ? r.runnerUp.action : r.action; }
// Drafts and checks use the brand version the list was built with.
const pinBrand = () => DemandAI.useBrand(RUN && RUN.saved && RUN.saved.brandVersion);
function generated(r){ pinBrand(); const d = dec(r.key); return DemandAI.draftFor(liveRec(r), chosenAction(r), {asOf:asOf(), channel:d.channel, variant:d.variant}); }
function draftOf(r){ const d = dec(r.key); return d.draft || generated(r); }
function checksOf(r){ pinBrand(); const x = draftOf(r), chk = DemandAI.checkDraft(x); return { chk, conf: DemandAI.confidenceFor(liveRec(r), x, chk, chosenAction(r)) }; }

/* Step 1 · Exception check: four rules. Anything that passes all four goes ahead on its own. */
function exceptionReasons(r){
  const { chk } = checksOf(r), out = [];
  if(!r.segment) out.push('Segment too small');
  const deal = DemandAI.estimateDealSize(r.account);
  if(deal && deal.below) out.push(`Below the deal-size threshold: about USD ${Math.round(deal.value/1000)}k against ${Math.round(DemandAI.CONFIG.dealSize.threshold/1000)}k`);
  if(r.result.confidence==='low') out.push('Low confidence: no contact in the primary persona');
  if(chk.flags.some(f=>f.rule==='Sensitive term')) out.push('Sensitive content');
  const dx = draftOf(r); if(dx.unreachable) out.push("Can't reach them: " + dx.why.replace(/\.$/, ''));
  if(chk.unsupported.length) out.push("A claim can't be verified");
  const brand = chk.flags.filter(f=>f.rule!=='Sensitive term');
  if(brand.length) out.push(`Brand or rule check: ${brand.map(f=>f.rule.toLowerCase()).join(', ')}`);
  return out;
}
const exceptionOf = r => exceptionReasons(r).join(' · ');

/* Why an item needs a person, in a few fixed categories, and by when. Used by Today and For Review. */
// Exception reasons Autopilot may clear when a person asks it to. Everything else always needs a person.
// Segment too small is not on it: a person assigns the micro-segment before the item is released.
const AUTOPILOT_LOW_RISK = ['deal'];
const REASON_CATS = { sensitive:'Sensitive content', claim:'Unsupported claim', low:'Low confidence', small:'Segment too small',
  deal:'Below deal size', brand:'Brand or rule check', reach:"Can't reach them", spot:'Spot-check', alternative:'Alternative offered', sentback:'Sent back', intervention:'Stepped in', other:'Other' };
function reasonCats(r, d){
  if(d.spot==='pending') return ['spot'];
  if(d.why==='alternative') return ['alternative'];
  if(d.why==='sent back') return ['sentback'];
  if(d.why==='stepped in') return ['intervention'];
  const out = [];
  (d.reasons || exceptionReasons(r)).forEach(t=>{
    const c = /^Sensitive/.test(t) ? 'sensitive' : /claim/.test(t) ? 'claim' : /^Low confidence/.test(t) ? 'low'
      : /^Segment too small/.test(t) ? 'small' : /deal-size/.test(t) ? 'deal' : /^Brand/.test(t) ? 'brand' : /^Can't reach/.test(t) ? 'reach' : 'other';
    if(!out.includes(c)) out.push(c);
  });
  return out.length ? out : ['other'];
}
const dayStart = t => { const d = new Date(t); d.setHours(0,0,0,0); return +d; };
function addWorkDays(t, n){ const d = new Date(dayStart(t)); while(n > 0){ d.setDate(d.getDate()+1); if(d.getDay()%6) n--; } while(!(d.getDay()%6)) d.setDate(d.getDate()+1); return +d; }
// The review deadline: 5 pm on the due working day. Spot-checks are due by Friday of the week they were drawn.
function dueOf(r, d){
  const D = DemandAI.CONFIG.reviewDue, start = d.routedAt || (RUN && RUN.saved.createdAt) || Date.now();
  if(d.spot==='pending'){ const f = new Date(dayStart(start)); f.setDate(f.getDate() + ((5 - f.getDay() + 7) % 7)); return +f + 17*36e5; }
  let days = Math.min(...reasonCats(r, d).map(c=>D[c] ?? D.other));
  if(r.segment==='Inquiry') days = Math.min(days, D.inquiry);
  if(days===0 && new Date(start).getHours() >= 15) days = 1;      // arrived late in the day: due the next working day
  return (days ? addWorkDays(start, days) : dayStart(start)) + 17*36e5;
}
const DUE_BUCKETS = [['overdue','Overdue'],['today','Due today'],['tomorrow','Due tomorrow'],['2days','Due within two days'],['later','Due later']];
function dueBucket(t, now = Date.now()){
  if(t < now) return 'overdue';
  const n = Math.round((dayStart(t) - dayStart(now)) / 864e5);
  return n<=0 ? 'today' : n===1 ? 'tomorrow' : n<=2 ? '2days' : 'later';
}
function dueLabel(t, now = Date.now()){
  const b = dueBucket(t, now), hm = new Date(t).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  if(b==='overdue') return 'Overdue since ' + new Date(t).toLocaleDateString(undefined,{weekday:'short', day:'numeric', month:'short'});
  if(b==='today') return 'By ' + hm + ' today';
  if(b==='tomorrow') return 'By ' + hm + ' tomorrow';
  return 'By ' + new Date(t).toLocaleDateString(undefined,{weekday:'short', day:'numeric', month:'short'});
}

/* 3.3 Data sufficiency: the readiness checks before measurement. Used by Analytics (Validation) and Today (blockers). */
function readiness(runs){
  const pct0 = v => v===null||v===undefined ? '—' : Math.round(v)+'%';
  const R = DemandAI.CONFIG.readiness;
  const accounts = runs.flatMap(run=>run.scored.filter(r=>!r.excluded));
  const uniq = new Map(accounts.map(r=>[r.account.name.toLowerCase(), r])); const A = [...uniq.values()];
  const contactable = A.filter(r=>(r.contacts||[]).some(c=>c.persona==='Primary' && !c.optOut && ((c.email && c.emailVerified) || c.linkedin)));
  const covered = A.filter(r=>(r.signalCount||0) > 0 || (r.people||[]).some(p=>p.signals.length));
  const qual = runs.flatMap(run=>((run.sig&&run.sig.signals)||[]).filter(s=>s.status==='Qualified'));
  const recent = qual.filter(s=>s.age!==undefined && s.age <= R.recencyDays);
  const actions = [...new Set(Object.values(DemandAI.CONFIG.segmentLibrary).flat())];
  const asOf = runs[0] ? runs[0].saved.src.asOf : null;
  const noProof = actions.filter(a=>{ const sg = Object.keys(DemandAI.CONFIG.segmentLibrary).find(k=>DemandAI.CONFIG.segmentLibrary[k].includes(a)); return !DemandAI.approvedClaims().some(c=>c.segments.includes(sg) && (!asOf || c.expiry >= asOf)); });
  const p = (a,b) => b ? a/b*100 : 0;
  return [
    { k:'Accounts in scope', v:A.length, ok:A.length >= R.accounts, show:`${A.length}`, need:`${R.accounts} or more`, fix:'More accounts in the selected vertical and region' },
    { k:'Contactability', v:p(contactable.length, A.length), ok:p(contactable.length, A.length) >= R.contactable, show:`${pct0(p(contactable.length, A.length))} of accounts`, need:`${R.contactable}%+ with a primary-persona contact who has a verified email or LinkedIn URL`, fix:'Verified emails or LinkedIn URLs for the primary-persona contacts' },
    { k:'Signal coverage', v:p(covered.length, A.length), ok:p(covered.length, A.length) >= R.coverage, show:`${pct0(p(covered.length, A.length))} of accounts`, need:`${R.coverage}%+ with at least one qualified signal`, fix:'More of the signal data the client holds: installed base, inquiries, service records, events' },
    { k:'Recency', v:p(recent.length, qual.length), ok:qual.length>0 && p(recent.length, qual.length) >= R.recency, show:`${pct0(p(recent.length, qual.length))} of qualified signals`, need:`${R.recency}%+ from the last ${R.recencyDays} days`, fix:'A fresher signal export' },
    { k:'Collateral', v:actions.length-noProof.length, ok:!noProof.length, show:`${actions.length-noProof.length} of ${actions.length} actions`, need:'Approved, unexpired proof for every action in the set', fix:noProof.length?`Proof for: ${noProof.join('; ')}`:'' },
    { k:'Baseline', v:DemandAI.CONFIG.g1BaselineMinutes, ok:!!(DemandAI.configOverrides().g1BaselineMinutes), show:`${DemandAI.CONFIG.g1BaselineMinutes} min per usable first action`, need:'A timed baseline from the client on the same data', fix:'The client\'s timed baseline (the current figure is a placeholder)' },
  ];
}
const isSensitive = x => pinBrand() || DemandAI.checkDraft(x).flags.some(f=>f.rule==='Sensitive term');

/* People: the rep who owns each item (owner_email in the lead file, or reassigned), and who is looking. */
const REPS = { 'rep.a@client-sample.com':'Sofia Ahlgren', 'rep.b@client-sample.com':'Marco Lindqvist' };
const repName = e => REPS[e] || e || 'Unassigned';
const isManager = () => ['Sales manager','Admin'].includes(getRole());
// In the demo the Sales rep role is Rep A; the sales manager and admin see everyone's items.
const myEmail = () => getRole()==='Sales rep' ? 'rep.a@client-sample.com' : null;
function ownerOf(r){ return dec(r.key).owner || liveRec(r).contact.owner || ''; }
const mine = r => isManager() || ownerOf(r)===myEmail();
// 6.3 Step in at any time: the sales manager can pause a whole micro-segment. Its items stay where they are but can't be
// used or decided until it's resumed.
const segKey = r => r.segment || '__none';
// The micro-segment an item is in: the one it was grouped into, or the one a reviewer assigned when there was none.
const segOf = r => r.segment || (RUN && dec(r.key).assignedSeg) || '';
// When a released item joined its micro-segment: the build date if it went ahead on its own, else when it was released.
function segSince(r){ const d = dec(r.key); if(d.status!=='Released' || !segOf(r)) return null; return d.segmentAt || (d.released==='auto' ? RUN.saved.createdAt : d.at) || null; }
const segChoices = () => RUN.seg.segments.map(g=>g.name);
const pausedInfo = r => ((RUN.saved.paused||{})[segKey(r)]) || null;
function pauseSegment(name){
  if(!isManager()) return;
  RUN.saved.paused = RUN.saved.paused || {};
  RUN.saved.paused[name] = { by: me().who, at: Date.now() };
  RUN.seg.recs.filter(r=>segKey(r)===name).forEach(r=>logIt(r, 'Micro-segment paused', {note:`${name==='__none'?'No micro-segment':name} paused`}));
  persist(); showToast(`${name==='__none'?'Items with no micro-segment':name} paused`); refresh();
}
function resumeSegment(name){
  if(!isManager() || !RUN.saved.paused) return;
  delete RUN.saved.paused[name];
  RUN.seg.recs.filter(r=>segKey(r)===name).forEach(r=>logIt(r, 'Micro-segment resumed'));
  persist(); showToast('Resumed'); refresh();
}

// Where an item is: in a queue (exception, spot-check, alternative, sent back, taken control), waiting for the
// manager's approval, released, or closed.
const inQueue = d => d.status==='Waiting' || d.spot==='pending';
const STATUS_TONE = {Waiting:'tag-amber', 'Awaiting approval':'tag-violet', Released:'tag-green', Closed:'tag-red', 'Set aside':'tag-grey', 'Watch list':'tag-grey'};
const statusTag = s => `<span class="tag ${STATUS_TONE[s]||'tag-grey'}">${esc(s==='Waiting'?'In For Review':s)}</span>`;
// The status a rep sees on the next best action screen.
function statusLabel(d, r){
  if(r && pausedInfo(r)) return ['Paused by the sales manager', 'tag-grey'];
  if(d.spot==='pending') return ['Proceeded · spot-check', 'tag-blue'];
  if(d.status==='Waiting') return ['Waiting for you in the exception queue', 'tag-amber'];
  if(d.status==='Awaiting approval') return ['Waiting for the sales manager', 'tag-violet'];
  if(d.meeting) return [d.meeting.seen ? 'Meeting booked · call script ready' : 'New: call script for the meeting', 'tag-violet'];
  if(d.status==='Released') return [d.released==='auto' ? 'Proceeded' : d.released==='approved' ? 'Approved' : 'Accepted', 'tag-green'];
  return [d.status, d.status==='Closed' ? 'tag-red' : 'tag-grey'];
}
const statusPill = (d, r) => { const [t, c] = statusLabel(d, r); return `<span class="tag ${c}">${esc(t)}</span>`; };
function whyHere(d){
  if(d.spot==='pending') return 'Spot-check';
  return {exception:'Exception', alternative:'Alternative', 'sent back':'Sent back', 'stepped in':'Intervention'}[d.why] || 'Exception';
}

/* Run once when a list is built: the exception check. What passes all four goes ahead on its own (path 1);
   anything else waits in the owning rep's exception queue (path 2). */
// Lists built before sensitive content went straight to approvals: move those items there too.
function sensitiveToApprovals(saved, recs){
  let moved = 0;
  recs.forEach(r=>{ const d = saved.decisions[r.key];
    if(d && d.status==='Waiting' && d.why==='exception' && d.spot!=='pending' && (d.reasons||[]).some(t=>/^Sensitive/.test(t))){ d.status = 'Awaiting approval'; d.why = 'sensitive'; moved++; } });
  if(moved) DemandAI.saveSegmentation(saved);
  return moved;
}
function routeRun(){
  const now = Date.now();
  RUN.seg.recs.forEach(r=>{
    // 5.16 A draft that fails the brand or rule checks is regenerated once on its own before it can become an exception.
    const first = draftOf(r), flags = DemandAI.checkDraft(first).flags.filter(f=>f.rule!=='Sensitive term');
    if(flags.length){
      setDec(r.key, {variant:'clean'});
      const again = DemandAI.checkDraft(draftOf(r)).flags.filter(f=>f.rule!=='Sensitive term');
      setDec(r.key, {versions:[{v:1, at:now, by:'System', why:'Generated from the action', draft:first}, {v:2, at:now, by:'System', why:`Regenerated once: ${flags.map(f=>f.rule.toLowerCase()).join(', ')}`, draft:draftOf(r)}]});
      sysLog(r, 'Regenerated once after a brand or rule check', `${flags.map(f=>`${f.rule}: ${f.detail}`).join(' · ')}${again.length?' · still failing':' · now passes'}`);
    }
    const rs = exceptionReasons(r);
    // Sensitive content goes straight to the sales manager's approvals, never through a rep's queue.
    if(rs.some(t=>/^Sensitive/.test(t))){ setDec(r.key, {status:'Awaiting approval', why:'sensitive', reasons:rs}); sysLog(r, 'To approvals', 'Sensitive content: the sales manager approves it before anything goes out'); }
    else if(rs.length){ setDec(r.key, {status:'Waiting', why:'exception', reasons:rs}); sysLog(r, 'To the exception queue', rs.join(' · ')); }
    else { setDec(r.key, {status:'Released', released:'auto', passed:true, by:'System', at:now}); sysLog(r, 'Proceeded on its own', 'Passed all four checks; released to the rep, ready to use'); }
  });
  updateRunStats(true);
}
/* Step 2 · The weekly spot-check: each week, a random share of what went ahead since the last draw is put in each
   owning rep's queue to rate. Drawn once per week, the first time For Review or Today opens that week. */
const SPOT_KEY = 'demandai_spot_weeks_v1';
function isoWeek(t){ const d = new Date(t); d.setHours(0,0,0,0); d.setDate(d.getDate()+3-((d.getDay()+6)%7)); const w1 = new Date(d.getFullYear(),0,4); return d.getFullYear()+'-W'+String(1+Math.round(((d-w1)/864e5-3+((w1.getDay()+6)%7))/7)).padStart(2,'0'); }
function spotDraws(){ try{ return JSON.parse(localStorage.getItem(SPOT_KEY)||'{}'); }catch(e){ return {}; } }
function weeklySpotCheck(runs){
  const week = isoWeek(Date.now()), draws = spotDraws();
  const done = (draws[week] && draws[week].reps) || {};
  const byOwner = new Map();
  runs.forEach(run=>{ const keep = RUN; RUN = run; run.seg.recs.forEach(r=>{ const d = dec(r.key); if(d.passed && d.released==='auto' && d.status==='Released' && !d.spotWeek && !pausedInfo(r)){ const o = ownerOf(r) || 'unassigned'; if(!byOwner.has(o)) byOwner.set(o, []); byOwner.get(o).push({run, r}); } }); RUN = keep; });
  // Once per week per rep: a rep is drawn the first time that week they have items that proceeded.
  byOwner.forEach((list, owner)=>{
    if(done[owner] !== undefined) return;
    const order = list.map(x=>[Math.random(), x]).sort((a,b)=>a[0]-b[0]).map(p=>p[1]);
    const n = Math.max(1, Math.round(list.length * DemandAI.CONFIG.spotCheckShare));
    order.forEach((x,i)=>{ const keep = RUN; RUN = x.run; setDec(x.r.key, {spotWeek:week, spot: i<n ? 'pending' : null}); if(i<n) sysLog(x.r, 'Picked for the weekly spot-check', week); updateRunStats(); RUN = keep; });
    done[owner] = Math.min(n, list.length);
  });
  draws[week] = { at: (draws[week]||{}).at || Date.now(), reps: done, picked: Object.values(done).reduce((t,n)=>t+n,0) };
  try{ localStorage.setItem(SPOT_KEY, JSON.stringify(draws)); }catch(e){}
  return draws[week];
}
function sysLog(r, decision, note){
  RUN.saved.log.unshift({ at:Date.now(), who:'System', role:'System', key:r.key, prospect:liveRec(r).contact.name, company:r.account.name,
    segment:r.segment||'No micro-segment', decision, action:chosenAction(r), channel:draftOf(r).channel, note, kind:'system', config:RUN.saved.configVersion||'', brand:RUN.saved.brandVersion||'' });
}
function versions(r){ const d = dec(r.key); return d.versions || [{v:1, at:RUN.saved.createdAt, by:'System', why:'Generated from the action', draft:generated(r)}]; }
// 5.19 Every version kept: record the draft before and after each change.
function change(key, why, mutate){
  const r = recOf(key), d = dec(key);
  const vs = versions(r);
  mutate();
  const now = draftOf(r);
  if(JSON.stringify(now)!==JSON.stringify(vs[vs.length-1].draft)) vs.push({v:vs.length+1, at:Date.now(), by:me().who, why, draft:now});
  setDec(key, {versions:vs});
}
/* The decision record. Decisive entries (accept or reject) carry what the measurement needs: the kind of item,
   whether it's a first-pass decision, the seconds taken, the queue position and any flag. */
function logIt(r, decision, extra={}){
  const m = me(), x = draftOf(r), d = dec(r.key);
  const secs = extra.decisive && openedAt ? Math.round((Date.now()-openedAt)/1000) : null;
  const pos = extra.decisive && typeof queuePos==='function' ? queuePos(r.key) : null;
  let flag = '';
  if(extra.decisive){
    if(secs!==null && secs < 5) flag = 'Decided in under 5 seconds';
    const recent = allLogs().filter(l=>l.decisive && l.who===m.who).slice(0, 4);
    const kindOf = s => s.startsWith('Accepted') ? 'Accepted' : s;
    if(recent.length===4 && recent.every(l=>kindOf(l.decision)===kindOf(decision))) flag = flag ? flag+' · run of identical decisions' : 'Run of identical decisions';
  }
  RUN.saved.log.unshift({ at:Date.now(), who:m.who, role:m.role, key:r.key, prospect:liveRec(r).contact.name, company:r.account.name,
    segment:r.segment||'No micro-segment', decision, reason:extra.reason||'', tags:extra.tags||[], action:extra.action||chosenAction(r), channel:extra.channel||x.channel,
    note:extra.note||'', version:extra.version||(d.versions||[1]).length, secs, position:pos, openedAt: extra.decisive ? openedAt : null,
    decisive:!!extra.decisive, kind:extra.kind||'', firstPass:extra.firstPass, accepted:extra.accepted, linkedTo:extra.linkedTo||'', flag, checked:false,
    cause:extra.cause||'', compliance:!!extra.compliance, intervention:!!extra.intervention, owner:ownerOf(r), rating:extra.rating||'', config:RUN.saved.configVersion||'', brand:RUN.saved.brandVersion||'' });
}
// Every list's log, newest first (pages with several lists override this through ALL_RUNS).
function allLogs(){ const runs = typeof ALL_RUNS==='function' ? ALL_RUNS() : [RUN]; return runs.flatMap(x=>x.saved.log).sort((a,b)=>b.at-a.at); }
/* Trust: how often people agreed with the system's first recommendation (optionally in one micro-segment),
   and the four checks every recommendation goes through. Shown wherever a decision is asked for. */
function trackRecord(seg){
  const ls = allLogs().filter(l=>l.decisive && l.firstPass && (!l.flag || l.checked) && (seg===undefined || l.segment===seg));
  const a = ls.filter(l=>l.accepted).length;
  return { n: ls.length, a, pct: ls.length ? Math.round(a/ls.length*100) : null, early: ls.length < (DemandAI.CONFIG.minDecisions||10) };
}
function fourChecks(r){
  const rs = exceptionReasons(r), has = re => rs.some(t=>re.test(t));
  const out = [['Segment size', !has(/^Segment too small/)], ['Confidence', !has(/^Low confidence/)], ['Sensitive content', !has(/^Sensitive/)], ['Claims', !has(/claim/)]];
  if(has(/deal-size/)) out.push(['Deal size', false]);
  if(has(/^Brand/)) out.push(['Brand and rules', false]);
  if(has(/^Can't reach/)) out.push(['Reachable', false]);
  return out;
}

/* ═══════════════ DECISIONS: one item at a time, no bulk ═══════════════ */
// Step 6 · Rejection reasons, shown as words. Each decides what comes back.
const REJECT = [
  ['R6','Wrong action','The runner-up action comes back, once'],
  ['R7','Wrong contact','The next contact comes back'],
  ['R8','Wrong channel','The same action on the next channel'],
  ['R9','Something in the draft is wrong','A new draft for the same action'],
  ['R10','Tone or brand','A new draft for the same action'],
  ['R11','Length or format','A shorter draft for the same action'],
  ['R1','Wrong fit','The account is set aside for the pilot'],
  ['R2','Signal too weak','The account is set aside for the pilot'],
  ['R5','Not the right time','The account moves to the watch list'],
  ['R4','Already engaged','Engage-once applies'],
  ['R12','Other','A comment is needed; nothing changes'],
];
// Rejections split by cause: a gap in the client's data, or the system's own judgement. Compliance send-backs apart.
const CAUSE = { R7:'data', R1:'data', R2:'data', R4:'data', R6:'system', R8:'system', R9:'system', R10:'system', R11:'system', R5:'system', R12:'other' };
const causeOf = code => CAUSE[code] || 'other';
const ACCEPT_TAGS = ['Accurate reasoning','Right timing','Right action','Ready to use','Saved research time'];
let pickTags = new Set(), pickCode = null;
const kindOfItem = d => d.spot==='pending' ? 'spot' : d.why==='alternative' ? 'alternative' : d.why==='stepped in' ? 'intervention' : 'exception';
// The draft as it is in the card's fields now.
function draftFromFields(r){
  const x = Object.assign({}, draftOf(r)), v = id => { const el = document.getElementById(id); return el ? el.value : null; };
  if(x.channel==='Email'){ if(v('dSubj')!==null){ x.subject = v('dSubj'); x.body = v('dBody'); x.words = x.body.split(/\s+/).filter(Boolean).length; } }
  else if(x.channel==='LinkedIn'){ if(v('dNote')!==null) x.note = v('dNote'); }
  else { if(v('dTask')!==null) x.task = v('dTask'); if(x.script && v('sOpen')!==null) x.script = Object.assign({}, x.script, {opener:v('sOpen'), questions:v('sQs').split('\n').filter(Boolean), objection:v('sObj'), response:v('sResp'), ask:v('sAsk')}); }
  return x;
}
// Step 4 · An edit is rated automatically. Minor: wording, tone or length only. Major: a change to the facts
// (numbers, names, dates, claims), the ask, the action or the person.
function editRating(before, after){
  const t1 = DemandAIDraftText(before), t2 = DemandAIDraftText(after);
  const facts = t => new Set((t.match(/\b\d[\d.,%]*\b|(?<![.?!]\s|^|\n)\b[A-Z][a-zA-Z&-]{2,}\b|\[[^\]]+\]/g)||[]).map(x=>x.toLowerCase()));
  const ask = t => (t.match(/[^.?!\n]*\?/g)||[]).map(x=>x.trim().toLowerCase()).join('|');
  const f1 = facts(t1), f2 = facts(t2);
  const factChange = [...f1].some(x=>!f2.has(x)) || [...f2].some(x=>!f1.has(x));
  const askChange = ask(t1)!==ask(t2);
  const w1 = t1.split(/\s+/).filter(Boolean), w2 = t2.split(/\s+/).filter(Boolean);
  const left = new Map(); w1.forEach(w=>left.set(w,(left.get(w)||0)+1));
  let common = 0; w2.forEach(w=>{ const n = left.get(w); if(n){ common++; left.set(w,n-1); } });
  const changed = Math.max(w1.length, w2.length) - common;
  const why = factChange && askChange ? 'facts and the ask changed' : factChange ? 'facts changed' : askChange ? 'the ask changed' : 'wording, tone or length only';
  return { changed, rating: factChange || askChange ? 'major' : 'minor', why };
}
function accept(key){
  const r = recOf(key), d = dec(key); if(!r || !inQueue(d)) return;
  if(!r.segment && d.spot!=='pending'){
    const pick = (document.getElementById('assignSeg')||{}).value || d.assignedSeg;
    if(!pick){ showToast('Assign a micro-segment first: it is released into that micro-segment'); const el = document.getElementById('assignSeg'); if(el) el.focus(); return; }
    setDec(key, {assignedSeg:pick, segmentAt:Date.now()}); logIt(r, `Assigned to the ${pick} micro-segment`, {note:'It had no micro-segment of its own'});
  }
  const note = (document.getElementById('acNote')||{}).value || '';
  const before = draftOf(r), after = draftFromFields(r);
  const edited = JSON.stringify(before)!==JSON.stringify(after);
  let rating = null;
  if(edited){ rating = editRating(before, after); change(key, `Edited before accepting (${rating.rating}: ${rating.why})`, ()=>setDec(key, {draft:after, edited:true, editRating:rating.rating})); }
  const kind = kindOfItem(d), firstPass = kind==='exception' || kind==='spot';
  const label = edited ? `Accepted with a ${rating.rating} edit` : 'Accepted';
  const sensitive = isSensitive(draftOf(r));
  if(kind==='spot') setDec(key, {spot:'accepted', spotBy:me().who, spotAt:Date.now()});
  else if(sensitive && !isManager()) setDec(key, {status:'Awaiting approval', acceptedBy:me().who, acceptedAt:Date.now()});
  else setDec(key, {status:'Released', released:'accepted', by:me().who, at:Date.now()});
  logIt(r, label, {decisive:true, accepted:true, kind, firstPass, rating: edited ? rating.rating : 'none', tags:[...pickTags], linkedTo:d.alternativeOf||'',
    note:[edited?`${rating.rating} edit: ${rating.why}`:'', note, kind==='spot'?'Spot-check rating':'', sensitive&&!isManager()&&kind!=='spot'?'Sensitive: sent to the sales manager for approval':''].filter(Boolean).join(' · ')});
  persist();
  showToast(kind==='spot' ? 'Spot-check rated and logged' : sensitive && !isManager() ? 'Accepted: sensitive content goes to the sales manager for approval' : 'Accepted and released');
  refresh();
}
// Step 5 · Sensitive content approval by the sales manager.
function managerApprove(key){
  const r = recOf(key); if(!isManager()) return;
  setDec(key, {status:'Released', released:'approved', by:me().who, at:Date.now(), approvedBy:me().who});
  logIt(r, 'Approved and released', {note:'Sensitive content approved'}); persist(); showToast('Approved and released'); refresh();
}
function sendBack(key){
  const r = recOf(key), note = ((document.getElementById('sbNote')||{}).value||'').trim();
  if(!note){ showToast('Say why it goes back'); return; }
  setDec(key, {status:'Waiting', why:'sent back', sentBackNote:note});
  logIt(r, 'Sent back to the rep', {note, cause:'compliance', compliance:true}); persist(); showToast('Sent back to the rep'); refresh();
}
function reject(key){
  const r = recOf(key), d = dec(key);
  if(!pickCode){ showToast('Pick a reason'); return; }
  const note = ((document.getElementById('rjNote')||{}).value||'').trim();
  if(pickCode==='R12' && !note){ showToast('"Other" needs a comment'); return; }
  const [code, label] = REJECT.find(x=>x[0]===pickCode);
  const kind = kindOfItem(d), second = !!d.alternativeUsed, linkedTo = d.alternativeOf || '';
  const before = { action:chosenAction(r), channel:draftOf(r).channel, version:(d.versions||[1]).length };
  const prevAction = `${before.action} (${before.channel})`;
  let outcome = '', next = {};
  const alt = !second && {
    R6: () => r.runnerUp && !d.useRunner && !d.manual ? (change(key,'Wrong action: the runner-up',()=>setDec(key,{useRunner:true,draft:null,edited:false})), 'The runner-up action comes back, once') : '',
    R7: () => { const tried = new Set([r.contact.row, d.contactRow].filter(Boolean)); const pr = {Primary:0}; const nx = r.result.people.filter(p=>!tried.has(p.contact.row) && !p.contact.optOut).sort((a,b)=>(pr[a.contact.persona]??1)-(pr[b.contact.persona]??1))[0];
                return nx ? (change(key,'Wrong contact: the next contact',()=>setDec(key,{contactRow:nx.contact.row,draft:null,edited:false,channel:null})), `The next contact comes back: ${nx.contact.name}`) : ''; },
    R8: () => { const x = draftOf(r); if(x.channel==='Task') return ''; const al = DemandAI.allowedChannels(liveRec(r).contact); const nx = al[al.indexOf(x.channel)+1];
                return nx ? (change(key,'Wrong channel: the next channel',()=>setDec(key,{channel:nx,draft:null,edited:false})), `The same action comes back on ${nx}`) : ''; },
    R9: () => (change(key,'Draft issue: a new draft',()=>setDec(key,{variant:'alt',draft:null,edited:false})), 'A new draft comes back for the same action'),
    R10: () => (change(key,'Tone or brand: a new draft',()=>setDec(key,{variant:'tone',draft:null,edited:false})), 'A new draft comes back for the same action'),
    R11: () => (change(key,'Length or format: a shorter draft',()=>setDec(key,{variant:'short',draft:null,edited:false})), 'A shorter draft comes back for the same action'),
  }[code];
  if(alt) outcome = alt();
  // Step 7 · The alternative goes back to the same rep's queue, marked "alternative", once.
  if(outcome) next = {status:'Waiting', why:'alternative', alternativeUsed:true, alternativeOf:prevAction, spot:null};
  else if(code==='R1'||code==='R2') { next = {status:'Set aside', spot:null}; outcome = 'The account is set aside for the pilot'; }
  else if(code==='R4') { next = {status:'Closed', engaged:true, spot:null}; outcome = 'Engage-once applies'; }
  else if(code==='R5') { next = {status:'Watch list', spot:null}; outcome = 'The account moves to the watch list'; }
  else if(code==='R12' && !second) { next = {status:'Closed', spot:null}; outcome = 'Nothing changes automatically'; }
  else { next = {status:'Closed', spot:null}; outcome = second ? 'Second rejection: the account is closed for the pilot' : 'No alternative left: closed'; }
  setDec(key, Object.assign(next, {code, by:me().who, at:Date.now(), rejections:(d.rejections||[]).concat([{code, label, note, at:Date.now()}])}));
  logIt(r, `Rejected: ${label}`, Object.assign({reason:label, cause:causeOf(code), decisive:true, accepted:false, kind, firstPass:kind==='exception'||kind==='spot', linkedTo,
    note:[outcome, note].filter(Boolean).join(' · ')}, before));
  persist(); showToast(`${label}: ${outcome}`); refresh();
}
/* The recommended and runner-up actions side by side: what each one is, and what would change. One click picks. */
function optionFacts(r, action){
  pinBrand();
  const lr = liveRec(r), x = DemandAI.draftFor(lr, action, {asOf:asOf(), variant:dec(r.key).variant, channel:dec(r.key).channel}), chk = DemandAI.checkDraft(x), conf = DemandAI.confidenceFor(lr, x, chk, action);
  const brief = DemandAI.briefFor(lr, action, {asOf:asOf()});
  return { channel: x.channel, proof: brief.proof ? brief.proof.title : '', ok: !chk.flags.length && !chk.unsupported.length,
    flags: chk.flags.map(f=>f.rule).concat(chk.unsupported.length ? ['Unverified claim'] : []), conf: conf.level };
}
function compareActions(r, key, live){
  const d = dec(key);
  if(!r.runnerUp) return `<div style="font-size:12.5px;font-weight:600;color:var(--i1)">${esc(r.action)}</div><div style="font-size:11px;color:var(--i2);margin-top:3px">${esc(r.reason)}</div><div style="font-size:11px;color:var(--i3);margin-top:6px">No runner-up for this one.</div>`;
  const A = optionFacts(r, r.action), B = optionFacts(r, r.runnerUp.action), useB = d.useRunner && !d.manual, useA = !d.useRunner && !d.manual;
  const cellv = (v, other) => `<span style="${v!==other?'font-weight:700;color:var(--i1)':'color:var(--i2)'}">${esc(v||'—')}</span>`;
  const rowv = (k, a, b) => `<tr><td style="padding:6px 8px 6px 0;font-size:11px;color:var(--i3);vertical-align:top;white-space:nowrap">${k}</td><td style="padding:6px 8px;font-size:12px;vertical-align:top">${a}</td><td style="padding:6px 0 6px 8px;font-size:12px;vertical-align:top">${b}</td></tr>`;
  const head = (t, chosen, other) => `<th style="text-align:left;padding:0 8px 8px;vertical-align:bottom;width:44%"><div style="font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${chosen?'var(--brand-dk)':'var(--i3)'}">${t}</div>
      <div style="margin-top:6px">${chosen ? '<span class="tag tag-violet">Chosen</span>' : live ? `<button class="btn btn-sec btn-sm" onclick="${other}">Use this instead</button>` : ''}</div></th>`;
  const checks = f => f.ok ? '<span style="color:var(--pos)">✓ All pass</span>' : `<span style="color:var(--neg)">✗ ${esc(f.flags.join(', '))}</span>`;
  return `<table style="width:100%;border-collapse:collapse">
    <thead><tr><th></th>${head('Recommended', useA, `swapAction('${key}')`)}${head('Runner-up', useB, `swapAction('${key}')`)}</tr></thead>
    <tbody style="border-top:1px solid var(--s75)">
      ${rowv('Action', `<b style="color:var(--i1)">${esc(r.action)}</b>`, `<b style="color:var(--i1)">${esc(r.runnerUp.action)}</b>`)}
      ${rowv('Why', `<span style="color:var(--i2)">${esc(r.reason)}</span>`, `<span style="color:var(--i2)">${esc(r.runnerUp.reason)}</span>`)}
      ${rowv('Channel', cellv(A.channel, B.channel), cellv(B.channel, A.channel))}
      ${rowv('Proof', cellv(A.proof||'None approved', B.proof||'None approved'), cellv(B.proof||'None approved', A.proof||'None approved'))}
      ${rowv('Confidence', cellv(A.conf, B.conf), cellv(B.conf, A.conf))}
      ${rowv('Brand and claims', checks(A), checks(B))}
    </tbody></table>
    <div style="font-size:10.5px;color:var(--i3);margin-top:6px">Bold marks what differs. Picking one redrafts the message below; then accept or reject as usual.</div>`;
}
/* Ask about this item: quick answers inside the panel, so the reviewer keeps their place. */
const ITEM_QS = [['why','Why is it here?'],['compare','How does the runner-up differ?'],['similar','How did similar items go?'],['account','What do we know about this account?']];
function itemAnswer(key, q){
  const r = recOf(key); if(!r) return '';
  const d = dec(key), lr = liveRec(r);
  const p = t => `<div style="font-size:12px;color:var(--i1);line-height:1.55">${t}</div>`;
  let out = '';
  if(q==='why'){
    out = p(d.spot==='pending' ? 'It passed every check and went ahead on its own; it was picked at random for this week\'s spot-check.'
      : `The system couldn't decide it alone: ${esc((d.reasons||exceptionReasons(r)).join('; ') || whyHere(d))}.`)
      + `<div class="tags" style="margin-top:6px">${fourChecks(r).map(([k,ok])=>`<span class="tag ${ok?'tag-green':'tag-red'}">${ok?'✓':'✗'} ${esc(k)}</span>`).join('')}</div>`
      + p(`<span style="color:var(--i2)">Why now: ${esc(r.reason)}</span>`);
  } else if(q==='compare'){
    if(!r.runnerUp) out = p('There is no runner-up for this one.');
    else { const A = optionFacts(r, r.action), B = optionFacts(r, r.runnerUp.action), diff = [];
      if(A.channel!==B.channel) diff.push(`the channel changes from ${A.channel} to ${B.channel}`);
      if(A.conf!==B.conf) diff.push(`confidence goes from ${A.conf} to ${B.conf}`);
      if((A.proof||'')!==(B.proof||'')) diff.push(B.proof ? `it cites "${B.proof}"` : 'it has no approved proof');
      if(A.ok!==B.ok) diff.push(B.ok ? 'it passes every check' : `it fails ${B.flags.join(', ')}`);
      out = p(`Switching to <b>${esc(r.runnerUp.action)}</b>: ${diff.length ? esc(diff.join('; ')) : 'same channel, confidence and checks; only the action and the message change'}.`); }
  } else if(q==='similar'){
    const t = trackRecord(r.segment||undefined), runs = typeof ALL_RUNS==='function' ? ALL_RUNS() : [RUN], o = {};
    runs.forEach(run=>{ const keep = RUN; RUN = run; run.seg.recs.forEach(x=>{ const dx = dec(x.key); if(x.segment===r.segment && dx.outcome) o[dx.outcome] = (o[dx.outcome]||0)+1; }); RUN = keep; });
    out = p(t.n ? `In ${esc(r.segment||'items with no micro-segment')}, reps accepted the first recommendation <b>${t.a} of ${t.n}</b> times (${t.pct}%)${t.early?'; early days, so read it as a hint':''}.` : `No decisions yet in ${esc(r.segment||'this group')}.`)
      + p(Object.keys(o).length ? `Outcomes marked so far: ${Object.entries(o).map(([k,n])=>`${esc(k)} ${n}`).join(' · ')}.` : '<span style="color:var(--i2)">No outcomes marked in this group yet.</span>');
  } else if(q==='account'){
    const a = r.account, deal = DemandAI.estimateDealSize(a), sigs = r.result.people.flatMap(pp=>pp.signals.map(sg=>({...sg, who: pp.contact ? pp.contact.name : ''}))).slice(0,6);
    out = p(`<b>${esc(a.name)}</b> · ${esc(a.vertical||'')} · ${a.existingCustomer?'existing customer':'net-new'} · tier ${esc(r.person.tier||'')}${deal?` · deal about USD ${Math.round(deal.value/1000)}k`:''}`)
      + `<div style="margin-top:6px">${sigs.map(sg=>`<div style="font-size:11.5px;padding:5px 0;border-top:1px solid var(--s75)"><b>${esc(sg.type)}</b> <span style="color:var(--i3)">· ${sg.age!=null?`${sg.age} days ago`:esc(sg.date||'')} · ${esc(sg.who)}</span><div style="color:var(--i2)">${esc(sg.detail||'')}${sg.source?` <span style="color:var(--i3)">· source: ${esc(sg.source)}</span>`:''}</div></div>`).join('')}</div>`;
  }
  return out;
}
// A released item that went ahead on its own can still be switched to the runner-up by its rep before they use it.
// That counts as stepping in (an intervention), the same as editing it.
const canSwapReleased = r => { const d = dec(r.key); return d.status==='Released' && !d.outcome && mine(r) && !pausedInfo(r); };
function swapAction(key){
  const r = recOf(key); if(!r || !r.runnerUp) return;
  const d = dec(key), to = d.useRunner ? 'recommended' : 'runner-up', after = d.status==='Released';
  if(after){ const f = optionFacts(r, d.useRunner ? r.action : r.runnerUp.action);
    if(!f.ok){ showToast(`The ${to} fails ${f.flags.join(', ').toLowerCase()}, so it can't replace a released message. Step in to edit or reject instead.`); return; } }
  change(key, `Swapped to the ${to}`, ()=>setDec(key, {useRunner:!d.useRunner, manual:null, draft:null, edited:false}));
  logIt(r, `Swapped to the ${to} action`, after ? {intervention:true, note:'After release: the rep switched the action before using it'} : {}); persist(); refresh();
  if(after) showToast(`Switched to the ${to}; the message is redrafted and the change is logged`);
}
function addManual(key){
  const v = (document.getElementById('manualAct')||{}).value.trim();
  if(!v){ showToast('Write the action first'); return; }
  const r = recOf(key);
  change(key, 'Manual action added', ()=>setDec(key, {manual:v, draft:null, edited:false}));
  logIt(r, 'Added a manual action', {note:v}); persist(); refresh();
}
// Step 9 · Outcome update. Step 10 · Reassign. Step in at any time: take control of an item that went ahead.
const OUTCOMES = ['Sent','Replied','Meeting booked','No response'];
function outcome(key, o){
  const r = recOf(key), d = dec(key), booked = o==='Meeting booked' && !d.meeting;
  // A booked meeting brings the account back as the next best action: a call script for the meeting, flagged as new.
  setDec(key, {outcome:o, meeting: o==='Meeting booked' ? (d.meeting || {at:Date.now(), seen:false, script:meetingScript(r)}) : null});
  logIt(r, 'Outcome: '+o);
  if(booked) sysLog(r, 'Call script ready for the meeting', 'Back on Micro-segments & NBA as the next step');
  persist(); DemandAI.reviewBadge();
  showToast(booked ? 'Meeting booked: a call script is ready on Micro-segments & NBA' : `Outcome logged: ${o}`); refresh();
}
// The call script for a booked meeting: built from what was sent, why now, the proof and the playbook.
function meetingScript(r){
  pinBrand();
  const lr = liveRec(r), action = chosenAction(r), brief = DemandAI.briefFor(lr, action, {asOf:asOf()}), x = draftOf(r);
  const base = DemandAI.callScript(lr, action, brief.whyNow), first = (lr.contact.name||'').split(' ')[0];
  const sent = x.channel==='Email' ? `the email "${x.subject}"` : x.channel==='LinkedIn' ? 'the LinkedIn message' : 'the follow-up';
  return {
    opener: `Hi ${first}, thanks for making the time. We reached out with ${sent} because of your ${r.reason.replace(/\s*\([^)]*\)/g, '').replace(/:\s*/, ' (').replace(/\.?$/, ')').replace(/^./, c=>c.toLowerCase())}. Is that still the priority on your side?`,
    agenda: ['Confirm the situation and who else is involved', 'Share what similar sites did' + (brief.proof ? ` (${brief.proof.title})` : ''), 'Agree a next step and a date'],
    questions: base.questions, objection: base.objection, response: base.response,
    ask: `Close on a next step: ${base.ask.replace(/\?$/, '')}, with a date in the next two weeks.`,
    context: brief.whyNow, proof: brief.proof ? brief.proof.title : '',
  };
}
// The notice on Micro-segments & NBA: meetings booked whose call script hasn't been opened yet.
function meetingBanner(){
  const hits = DemandAI.loadSegmentations().map(sv=>({ sv, n: Object.values(sv.decisions||{}).filter(d=>d && d.meeting && !d.meeting.seen).length })).filter(x=>x.n);
  if(!hits.length) return '';
  const n = hits.reduce((t,x)=>t+x.n, 0), go = `12-nba.html?run=${encodeURIComponent(hits[0].sv.id)}&show=meeting`;
  return `<a href="${go}" style="display:flex;align-items:center;gap:10px;padding:11px 14px;margin-bottom:14px;background:var(--brand-lt);border:1px solid var(--brand-mid);border-radius:var(--rmd);text-decoration:none">
    <span class="tag tag-violet">New</span><span style="flex:1;font-size:12.5px;color:var(--i1)"><b>${n} meeting${n===1?'':'s'} booked</b>: the call script${n===1?' is':'s are'} ready. Next best action: prepare and run the meeting.</span>
    <span style="font-size:12px;font-weight:700;color:var(--brand);white-space:nowrap">Open ${n===1?'it':'them'} →</span></a>`;
}
function meetingPanel(key){
  const d = dec(key), m = d.meeting; if(!m || !m.script) return '';
  const sc = m.script, li = a => `<ol style="margin:4px 0 0 18px;padding:0;font-size:12px;color:var(--i1);line-height:1.6">${a.map(t=>`<li>${esc(t)}</li>`).join('')}</ol>`;
  return panel('Meeting booked: call script', `<span class="tag ${m.seen?'tag-green':'tag-violet'}">${m.seen?'Ready':'New'}</span>`, `
    <div style="font-size:11px;color:var(--i3);margin-bottom:6px">Generated ${fmtDate(m.at)} ${timeOf(m.at)}, when the meeting was marked as booked.</div>
    ${lbl('Opener')}<div style="font-size:12.5px;color:var(--i1);line-height:1.55">${esc(sc.opener)}</div>
    ${lbl('Agenda')}${li(sc.agenda)}
    ${lbl('Discovery questions')}${li(sc.questions||[])}
    ${lbl('If they say')}<div style="font-size:12px;color:var(--i1)">${esc(sc.objection||'')}</div>
    ${lbl('You say')}<div style="font-size:12px;color:var(--i1)">${esc(sc.response||'')}</div>
    ${lbl('The ask')}<div style="font-size:12.5px;color:var(--i1);font-weight:600">${esc(sc.ask)}</div>
    <button class="btn btn-sec btn-sm" style="margin-top:10px" onclick="copyMeeting('${key}')">Copy the script</button>`);
}
function copyMeeting(key){
  const sc = (dec(key).meeting||{}).script; if(!sc) return;
  const t = ['Opener: '+sc.opener, 'Agenda:\n- '+sc.agenda.join('\n- '), 'Questions:\n- '+(sc.questions||[]).join('\n- '), 'If they say: '+sc.objection, 'You say: '+sc.response, 'The ask: '+sc.ask].join('\n\n');
  if(navigator.clipboard) navigator.clipboard.writeText(t).then(()=>showToast('Copied'), ()=>fallbackCopy(t)); else fallbackCopy(t);
}
function reassign(key, email){
  const r = recOf(key), from = ownerOf(r); if(!isManager() || !email || email===from) return;
  setDec(key, {owner:email}); logIt(r, `Reassigned to ${repName(email)}`, {note:`From ${repName(from)}`}); persist(); showToast(`Moved to ${repName(email)}'s queue`); refresh();
}
// A rep can step in on an item that proceeded: it's recorded as an intervention (an early warning), never required.
function stepIn(key){
  const r = recOf(key);
  setDec(key, {status:'Waiting', why:'stepped in', intervened:true, spot:null}); logIt(r, 'Stepped in', {note:'Opened an item that proceeded, to edit or reject', kind:'intervention', intervention:true});
  persist(); showToast('Moved to your exception queue as an intervention'); refresh();
}

function refresh(){ updateRunStats(); if(typeof onDecision==='function') onDecision(); if(openKey) openRec(openKey, true); }
// Keeps the count that needs a person on the saved list, for the For Review badge on every page.
function updateRunStats(quiet){
  if(!RUN) return;
  RUN.saved.stats.waiting = RUN.seg.recs.filter(r=>{ const d = dec(r.key); return !pausedInfo(r) && (inQueue(d) || d.status==='Awaiting approval'); }).length;
  RUN.saved.stats.auto = RUN.seg.recs.filter(r=>dec(r.key).passed).length;
  if(!quiet){ persist(); reviewBadge(); }
}

/* ═══════════════ STEP 8 · RELEASE: exports ═══════════════ */
const released = r => dec(r.key).status==='Released';
function exportApproved(){
  const rs = RUN.seg.recs.filter(r=>released(r) && draftOf(r).channel!=='Task');
  if(!rs.length){ showToast('No released messages yet'); return; }
  const rows = [['owner','prospect','job_title','company','email','linkedin_url','micro_segment','action','channel','subject','message','linkedin_note','released','released_by','released_at','outcome']];
  rs.forEach(r=>{ const d = dec(r.key), x = draftOf(r), c = liveRec(r).contact;
    rows.push([repName(ownerOf(r)), c.name, c.jobTitle||'', r.account.name, c.email||'', c.linkedin||'', r.segment||'No micro-segment', chosenAction(r), x.channel,
      x.subject||'', x.body||(x.script?[x.script.opener,...x.script.questions,x.script.ask].join(' | '):''), x.note||'',
      d.released==='auto'?'On its own':d.released==='approved'?'Approved by the sales manager':'Accepted by the rep', d.by||'', d.at?new Date(d.at).toISOString():'', d.outcome||'']); });
  download('released_messages.csv', DemandAI.toCSV(rows));
}
// 5.7 Person-owned actions as a task file (routing into CRM, Teams or Slack is for production)
function exportTasks(){
  const rs = RUN.seg.recs.filter(r=>released(r) && draftOf(r).channel==='Task');
  if(!rs.length){ showToast('No released tasks yet'); return; }
  const rows = [['owner','prospect','company','micro_segment','task','why','call_opener','questions','objection','response','ask','outcome']];
  rs.forEach(r=>{ const x = draftOf(r), s = x.script || {}, c = liveRec(r).contact;
    rows.push([repName(ownerOf(r)), c.name, r.account.name, r.segment||'No micro-segment', x.task, x.why, s.opener||'', (s.questions||[]).join(' | '), s.objection||'', s.response||'', s.ask||'', dec(r.key).outcome||'']); });
  download('tasks.csv', DemandAI.toCSV(rows));
}
function exportLog(){
  const rows = [['when','who','role','prospect','company','micro_segment','decision','item','first_pass','reason','tags','action','channel','version','opened_at','seconds','queue_position','flag','checked','linked_to','note']];
  RUN.saved.log.forEach(l=>rows.push([new Date(l.at).toISOString(), l.who, l.role, l.prospect, l.company, l.segment, l.decision, l.kind||'', l.decisive?(l.firstPass?'yes':'no'):'',
    l.reason||'', (l.tags||[]).join('; '), l.action, l.channel, l.version||1, l.openedAt?new Date(l.openedAt).toISOString():'', l.secs??'', l.position??'', l.flag||'', l.flag?(l.checked?'yes':'no'):'', l.linkedTo||'', l.note]));
  download('decision_log.csv', DemandAI.toCSV(rows));
}

/* ═══════════════ THE EVIDENCE CARD (step 3): the same card for every item ═══════════════ */
const fld = (id, v, rows, ro) => rows ? `<textarea id="${id}" rows="${rows}" ${ro?'readonly':''} style="width:100%;border:1px solid var(--bdk);border-radius:var(--rsm);padding:8px 10px;font-size:12px;color:var(--i1);line-height:1.6;font-family:var(--fb);resize:vertical;outline:none;${ro?'background:var(--s50)':''}">${esc(v)}</textarea>`
  : `<input id="${id}" value="${esc(v)}" ${ro?'readonly':''} style="width:100%;border:1px solid var(--bdk);border-radius:var(--rsm);padding:8px 10px;font-size:12.5px;font-weight:600;color:var(--i1);outline:none;${ro?'background:var(--s50)':''}">`;
const lbl = (t, extra) => `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3);margin:10px 0 5px"><span>${t}</span>${extra?`<span style="letter-spacing:0;text-transform:none;font-weight:500">${extra}</span>`:''}</div>`;
const kv = (k,v) => `<div style="display:flex;gap:10px;padding:5px 0;border-bottom:1px solid var(--s75);font-size:12px;line-height:1.45"><span style="color:var(--i3);width:84px;flex-shrink:0">${k}</span><span style="color:var(--i1);min-width:0">${v}</span></div>`;
const panel = (title, right, body) => `<div class="panel" style="margin-bottom:12px"><div class="panel-hdr"><span class="panel-ttl">${title}</span>${right||''}</div><div class="panel-body">${body}</div></div>`;
const cap = t => `<div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3);margin:14px 0 6px">${t}</div>`;
function openRec(key, keepTimer){
  const r = recOf(key); if(!r) return;
  if(!keepTimer || openKey!==key){ openedAt = Date.now(); pickTags = new Set(); pickCode = null; }
  openKey = key;
  const d = dec(key), lr = liveRec(r), c = lr.contact, x = draftOf(r), { chk, conf } = checksOf(r);
  const paused = pausedInfo(r);
  const live = inQueue(d) && mine(r) && !paused && !(typeof CARD_MODE!=='undefined' && CARD_MODE==='use'), action = chosenAction(r), brief = DemandAI.briefFor(lr, action, {asOf:asOf(), channel:d.channel});
  document.getElementById('detTitle').textContent = c.name;
  document.getElementById('detSub').textContent = [c.jobTitle, r.account.name].filter(Boolean).join(' · ');
  // 0 · A booked meeting's call script first. Opening the script clears the notification.
  html = '';
  if(d.outcome==='Meeting booked' && !d.meeting){ setDec(key, {meeting:{at:d.at||Date.now(), seen:true, script:meetingScript(r)}}); persist(); }
  const dm = dec(key).meeting;
  if(dm){ html += meetingPanel(key); if(!dm.seen){ setDec(key, {meeting:Object.assign({}, dm, {seen:true})}); persist(); DemandAI.reviewBadge(); } }
  // 1 · Why it's here, and why now
  const why = d.spot==='pending' ? `It went ahead on its own after passing all four checks, and was picked at random for a spot-check. Rate it as if it had come to you.`
    : d.why==='alternative' ? `The alternative after a rejection of <b>${esc(d.alternativeOf||'the first recommendation')}</b>. It's offered once: a second rejection closes the account for the pilot.`
    : d.why==='sent back' ? `Sent back by the sales manager: ${esc(d.sentBackNote||'')}`
    : d.why==='stepped in' ? 'It proceeded on its own; the rep stepped in to edit or reject it. Recorded as an intervention.'
    : d.status==='Released' && d.released==='auto' ? 'Passed all four exception checks, so it went ahead on its own.'
    : (d.reasons||exceptionReasons(r)).map(esc).join('<br>') || 'Exception';
  html += panel("Why it's here", `<span class="tag ${d.spot==='pending'?'tag-blue':d.why==='alternative'?'tag-violet':'tag-amber'}">${inQueue(d)?whyHere(d):d.status==='Released'&&d.released==='auto'?'Went ahead':'Exception'}</span>`, `
    <div style="font-size:12.5px;color:var(--i1);line-height:1.55;margin-bottom:8px">${why}</div>
    ${kv('Why now', esc(r.reason.replace(/^./,m=>m.toUpperCase())))}
    ${kv('Checks', `<span class="tags" style="display:inline-flex;flex-wrap:wrap;gap:4px">${fourChecks(r).map(([k,ok])=>`<span class="tag ${ok?'tag-green':'tag-red'}">${ok?'✓':'✗'} ${esc(k)}</span>`).join('')}</span>`)}
    ${(()=>{ const s = r.segment ? trackRecord(r.segment) : null, a = trackRecord();
      return kv('Track record', a.n ? `${s && s.n ? `In ${esc(r.segment)}, reps agreed with the first recommendation <b>${s.a} of ${s.n}</b> times (${s.pct}%)` : `No decisions in ${esc(r.segment||'this group')} yet`}<span style="color:var(--i3)"> · ${a.a} of ${a.n} (${a.pct}%) across all${a.early?'; early days, so read it as a hint':''}</span>` : '<span style="color:var(--i3)">No decisions yet, so no track record</span>'); })()}
    ${kv('Micro-segment', `${segTag(segOf(r))} <span style="color:var(--i3)">${segOf(r)?esc(SEG_MEANS[segOf(r)]||''):'none yet: assign one to release it'}${!r.segment&&segOf(r)?' · assigned by a reviewer':''}${segSince(r)?` · in it since ${fmtDate(segSince(r))}`:''}</span>`)}
    ${kv('Owner', isManager() ? `<select onchange="reassign('${key}',this.value)" style="padding:3px 6px;border:1px solid var(--bdk);border-radius:6px;font-size:12px">${['',...Object.keys(REPS)].map(e=>`<option value="${e}" ${ownerOf(r)===e?'selected':''}>${esc(repName(e))}</option>`).join('')}</select>` : esc(repName(ownerOf(r))))}`);
  // 2 · The action
  html += panel(r.runnerUp && !d.manual ? 'The action: compare and pick' : 'The action', '', `
    ${compareActions(r, key, live || canSwapReleased(r))}${!live && inQueue(d) && mine(r) && !paused && r.runnerUp ? `<div style="font-size:11px;color:var(--i3);margin-top:6px">Waiting for a decision: pick the action in <a href="14-review.html?item=${encodeURIComponent(RUN.saved.id+'::'+key)}" style="color:var(--brand);font-weight:600;text-decoration:none">For Review →</a></div>` : ''}
    ${d.manual ? `<div style="padding:10px 12px;border:1px solid var(--brand-mid);background:var(--brand-lt);border-radius:var(--rsm);margin-top:8px"><div style="font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--brand-dk);margin-bottom:4px">Manual action · chosen</div><div style="font-size:12.5px;font-weight:600;color:var(--i1)">${esc(d.manual)}</div></div>` : ''}
    ${live ? `<div style="display:flex;gap:6px;margin-top:8px"><input id="manualAct" placeholder="Neither? Add a manual action…" style="flex:1;min-width:0;padding:7px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px"><button class="btn btn-sec btn-sm" onclick="addManual('${key}')">Add</button></div>` : ''}`);
  // 3 · Contact and channel
  html += panel('Contact and channel', '', kv('Contact', `${esc(c.name)} <span style="color:var(--i3)">· ${esc(c.jobTitle||'')} · ${esc(c.persona||'')} persona</span>`)
    + kv('Reach', [c.email?esc(c.email)+(c.emailVerified?'':' <span style="color:var(--warn)">(not verified)</span>'):'', c.linkedin?'LinkedIn':''].filter(Boolean).join(' · ') || '<span style="color:var(--i3)">No email or LinkedIn</span>')
    + kv('Channel', `<b>${esc(x.channel==='Task'?'Task for the team':x.channel)}</b> <span style="color:var(--i3)">${esc(x.why)}</span>`));
  // 4 · The editable draft
  const ro = !live;
  let draft = '';
  const sc = x.script;
  if(x.channel==='Email') draft = lbl('Subject')+fld('dSubj',x.subject,0,ro)+lbl('Body', `${x.body.split(/\s+/).filter(Boolean).length} words`)+fld('dBody',x.body,9,ro);
  else if(x.channel==='LinkedIn') draft = lbl('Connection note · the only message, no follow-up', `${x.note.length}/200`)+fld('dNote',x.note,3,ro);
  else draft = lbl('Task')+fld('dTask',x.task,3,ro);
  // Blogs and whitepapers from Content studio go in the message itself: one button at the top of the message box.
  if(typeof ContentLink!=='undefined' && (x.channel==='Email' || x.channel==='LinkedIn')) draft = ContentLink.messageBar(key, d.content, x.channel, mine(r) && !paused) + draft;
  if(sc) draft += lbl('Call script · opener')+fld('sOpen',sc.opener,3,ro)+lbl('Discovery questions')+fld('sQs',sc.questions.join('\n'),3,ro)
    +lbl('Objection')+fld('sObj',sc.objection,0,ro)+lbl('Response')+fld('sResp',sc.response,2,ro)+lbl('The ask')+fld('sAsk',sc.ask,0,ro);
  const vs = versions(r);
  html += panel(x.channel==='Task' ? 'Task' : 'Draft', `<span style="display:flex;gap:6px">${d.edited?`<span class="tag tag-violet">Edited · ${esc(d.editRating||'')}</span>`:''}<span class="tag tag-grey">v${vs.length}</span></span>`, `
    ${live?'<div style="font-size:11px;color:var(--i3);margin-top:-4px">Edit here if you need to; accepting saves it, and the edit is rated minor or major automatically.</div>':''}
    <div style="margin-top:-4px">${draft}</div>
    <details style="margin-top:12px"><summary style="cursor:pointer;font-size:11.5px;font-weight:600;color:var(--i2)">Brief, proof and checks · <span class="tag ${conf.level==='High'?'tag-green':conf.level==='Medium'?'tag-amber':'tag-red'}" style="margin-left:2px">${conf.level} confidence</span></summary>
      <div style="margin-top:8px">${kv('Angle', esc(brief.angle))}${kv('Proof', brief.proof ? `${esc(brief.proof.title)} <span style="color:var(--i3)">· ${esc(brief.proof.type)}, ${brief.proof.year}</span>` : '<span style="color:var(--warn)">No approved proof: a task instead of a draft</span>')}
      ${kv('Objection', esc(brief.objection))}${kv('Checks', chk.flags.length ? chk.flags.map(f=>`<span style="color:var(--neg)">${esc(f.rule)}: ${esc(f.detail)}</span>`).join('<br>') : '<span style="color:var(--pos)">Brand and rule checks pass</span>')}
      ${kv('Claims', chk.claims.length ? chk.claims.map(cl=>`<span style="color:${cl.verified?'var(--pos)':'var(--neg)'}">${cl.verified?'✓':'✗'}</span> ${esc(cl.text)}`).join('<br>') : '<span style="color:var(--i3)">No product claims</span>')}
      ${kv('Confidence', esc(conf.reason))}
      ${vs.length>1 ? kv('Versions', vs.slice().reverse().map(v=>`v${v.v} · ${esc(v.why)} · ${esc(v.by)}`).join('<br>')) : ''}</div>
    </details>`);
  // 5 · The decision
  const by = d.by ? `${esc(d.by)} · ${fmtDate(d.at)} ${timeOf(d.at)}` : '';
  let decide = '';
  const useMode = typeof CARD_MODE!=='undefined' && CARD_MODE==='use';
  if(paused) decide = `<div style="font-size:12px;color:var(--i1);margin-bottom:8px">The ${esc(r.segment||'no-micro-segment')} group was paused by ${esc(paused.by)} on ${fmtDate(paused.at)}. Don't use or decide it until it's resumed.</div>${isManager()?`<button class="btn btn-sec btn-sm" onclick="resumeSegment('${segKey(r)}')">Resume the micro-segment</button>`:''}`;
  else   if(useMode && (inQueue(d) || d.status==='Awaiting approval')) decide = `<div style="font-size:12px;color:var(--i1);margin-bottom:10px">${d.status==='Awaiting approval' ? 'Accepted, and waiting for the sales manager because the content is sensitive.' : d.spot==='pending' ? 'It proceeded and is ready to use. It was also picked for this week\'s spot-check in For Review.' : 'It can\'t be used until it\'s decided in the exception queue.'}</div>
      <a class="btn btn-primary btn-sm" style="width:100%;justify-content:center;text-decoration:none" href="14-review.html?item=${encodeURIComponent(RUN.saved.id+'::'+key)}">Open in For Review →</a>`;
  else if(inQueue(d) && !mine(r)) decide = `<div style="font-size:12px;color:var(--i2)">In ${esc(repName(ownerOf(r)))}'s queue.</div>`;
  else if(inQueue(d)) decide = `
    <div class="tags" style="margin-bottom:8px">${ACCEPT_TAGS.map(t=>`<button class="tag ${pickTags.has(t)?'tag-green':'tag-grey'}" style="cursor:pointer" onclick="pickTags.has('${t}')?pickTags.delete('${t}'):pickTags.add('${t}');this.className='tag '+(pickTags.has('${t}')?'tag-green':'tag-grey')">${t}</button>`).join('')}</div>
 ${!r.segment && d.spot!=='pending' ? `<div style="padding:10px 12px;margin-bottom:8px;background:var(--warn-lt, #FFF6E5);border-radius:var(--rsm)"><div style="font-size:12px;font-weight:700;color:var(--i1);margin-bottom:6px">Assign a micro-segment to release it</div>
      <select id="assignSeg" style="width:100%;padding:7px 9px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px"><option value="">Pick a micro-segment…</option>${segChoices().map(n=>`<option ${d.assignedSeg===n?'selected':''}>${esc(n)}</option>`).join('')}</select>
      <div style="font-size:11px;color:var(--i3);margin-top:5px">No other account shared its signal, so it has no micro-segment of its own. Accepting releases it into the one you pick.</div></div>` : ''}
    <input id="acNote" placeholder="Comment (optional)" style="width:100%;padding:7px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px;margin-bottom:8px">
    <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center" onclick="accept('${key}')">${d.spot==='pending'?'Rate: accept':'Accept'}</button>
    ${cap('Or reject · why?')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px">${REJECT.filter(([c])=>!(d.alternativeUsed&&false)).map(([c,l,w])=>`<button title="${esc(w)}" class="rj" onclick="pickCode='${c}';document.querySelectorAll('.rj').forEach(b=>b.style.cssText=b.dataset.base);this.style.cssText=this.dataset.base+';border-color:var(--neg);background:var(--neg-lt)';document.getElementById('rjWhat').textContent='${esc(d.alternativeUsed&&['R6','R7','R8','R9','R10','R11'].includes(c)?'Second rejection: the account is closed for the pilot':w)}'" data-base="text-align:left;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--i1)" style="text-align:left;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--i1)">${l}</button>`).join('')}</div>
    <div id="rjWhat" style="font-size:11px;color:var(--i3);min-height:15px;margin-bottom:6px"></div>
    <input id="rjNote" placeholder="Comment (needed for Other)" style="width:100%;padding:7px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px;margin-bottom:8px">
    <button class="btn btn-sec btn-sm" style="width:100%;justify-content:center" onclick="reject('${key}')">Reject</button>`;
  else if(d.status==='Awaiting approval') decide = isManager()
    ? `<div style="font-size:12px;color:var(--i1);margin-bottom:10px">${d.acceptedBy?`Accepted by ${esc(d.acceptedBy)}. `:''}The draft has sensitive content, so it needs your approval before release.</div>
       <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center" onclick="managerApprove('${key}')">Approve and release</button>
       ${cap('Or send it back to the rep')}<input id="sbNote" placeholder="Why it goes back" style="width:100%;padding:7px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px;margin-bottom:8px">
       <button class="btn btn-sec btn-sm" style="width:100%;justify-content:center" onclick="sendBack('${key}')">Send back</button>`
    : `<div style="font-size:12px;color:var(--i2)">Waiting for the sales manager's approval because the draft has sensitive content.</div>`;
  else if(d.status==='Released') decide = `${x.channel!=='Task'?`<button class="btn btn-sec btn-sm" style="margin-bottom:10px" onclick="copyDraft('${key}')">Copy the message</button>`:''}<div style="font-size:12px;color:var(--i1);margin-bottom:10px">${d.released==='auto'?'Went ahead on its own':d.released==='approved'?`Approved by ${by}`:`Accepted by ${by}`}${d.spot==='accepted'?` · spot-check accepted by ${esc(d.spotBy||'')}`:''}. Ready to use: ${x.channel==='Task'?'act on the task':'send it from your own tool'}, then mark what happened. Nothing is sent from the POC.</div>
      ${cap('What happened')}
      <div class="tags">${OUTCOMES.map(o=>`<button class="tag ${d.outcome===o?'tag-violet':'tag-grey'}" style="cursor:pointer" onclick="outcome('${key}','${o}')">${o}</button>`).join('')}</div>
      ${d.released==='auto' && d.spot!=='pending' && mine(r) ? `<button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="stepIn('${key}')">Step in: edit or reject it</button>` : ''}`;
  else decide = `<div style="font-size:12px;color:var(--i1)">${esc((REJECT.find(x=>x[0]===d.code)||[])[1]||'Rejected')} · ${by}<div style="color:var(--i2);margin-top:3px">${esc(d.status)}</div></div>`;
  if(!inQueue(d) && typeof nextItem==='function' && typeof hasNext==='function' && hasNext()) decide += `<button class="btn btn-primary btn-sm" style="width:100%;justify-content:center;margin-top:12px" onclick="nextItem()">Next →</button>`;
  html += panel(inQueue(d) && !useMode && !paused ? 'Your decision' : 'Status', inQueue(d) && !useMode && !paused ? statusTag('Waiting') : statusPill(d, r), decide);
  const hist = RUN.saved.log.filter(l=>l.key===key);
  if(hist.length) html += `<details class="panel" style="padding:10px 14px"><summary style="cursor:pointer;font-size:11.5px;font-weight:600;color:var(--i2)">History · ${hist.length}</summary>
    ${hist.map(l=>`<div style="padding:7px 0;border-bottom:1px solid var(--s75);font-size:11.5px"><b style="color:var(--i1)">${esc(l.decision)}</b> <span style="color:var(--i3)">· ${esc(l.who)} · ${fmtDate(l.at)} ${timeOf(l.at)}${l.secs!=null?` · ${l.secs}s`:''}</span>${l.note?`<div style="color:var(--i2);margin-top:2px">${esc(l.note)}</div>`:''}</div>`).join('')}
  </details>`;
  // Last: Copilot, a chat about this account once all its information has been read.
  if(typeof Copilot!=='undefined') html += Copilot.inline(RUN.saved.id+'::'+key);
  const body = document.getElementById('detBody'), top = keepTimer ? body.scrollTop : 0;
  body.innerHTML = html; body.scrollTop = top;
  const dr = document.getElementById('detailDrawer'); dr.style.width = '500px'; dr.classList.add('open');
  const cp = document.getElementById('copilotDrawer'); if(cp) cp.classList.remove('open');
}
function DemandAIDraftText(x){
  if(x.channel==='Email') return `Subject: ${x.subject}\n\n${x.body}`;
  if(x.channel==='LinkedIn') return x.note;
  const s = x.script; return [x.task, s && `Opener: ${s.opener}`, s && `Questions: ${s.questions.join(' / ')}`, s && `Objection: ${s.objection} → ${s.response}`, s && `Ask: ${s.ask}`].filter(Boolean).join('\n');
}

/* ═══════════════ MEASUREMENT: G2 from first-pass decisions ═══════════════ */
function g2(logs){
  const dec1 = logs.filter(l=>l.decisive);
  const counts = l => !l.flag || l.checked;
  const rate = ls => { const n = ls.length, a = ls.filter(l=>l.accepted).length; return { n, a, pct: n ? Math.round(a/n*100) : null }; };
  const first = dec1.filter(l=>l.firstPass && counts(l));
  return {
    exceptions: rate(first.filter(l=>l.kind==='exception')),
    spot: rate(first.filter(l=>l.kind==='spot')),
    together: rate(first),
    alternatives: rate(dec1.filter(l=>l.kind==='alternative' && counts(l))),
    flagged: dec1.filter(l=>l.flag && !l.checked).length,
  };
}

function setContent(key, ids){
  setDec(key, {content:ids}); persist(); if(!(typeof wsReopen==='function' && wsReopen(key))) openRec(key, true);
  showToast(ids.length ? `${ids.length} piece${ids.length>1?'s':''} of content in the message` : 'No content in the message');
}
function removeContent(key, id){ setContent(key, (dec(key).content||[]).filter(x=>x!==id)); }
function copyDraft(key){
  const x = draftOf(recOf(key)), att = typeof ContentLink!=='undefined' ? (dec(key).content||[]).map(ContentLink.itemOf).filter(Boolean) : [];
  const t = (x.channel==='Email' ? `${x.subject}\n\n${x.body}` : x.channel==='LinkedIn' ? x.note : DemandAIDraftText(x))
    + (att.length && x.channel==='Email' ? '\n\nAttached: ' + att.map(it=>ContentLink.fileName(it,'docx')).join(', ') : '');
  const done = () => showToast('Copied');
  try{ navigator.clipboard.writeText(t).then(done, ()=>fallbackCopy(t)); }catch(e){ fallbackCopy(t); }
}
function fallbackCopy(t){ const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try{ document.execCommand('copy'); showToast('Copied'); }catch(e){ showToast("Couldn't copy here"); } a.remove(); }

/* G2 weighted across the two paths, and G1 against the baseline. `runs` are the lists in view, `owner` an optional rep. */
function measure(runs, owner){
  const items = [], logs = [];
  runs.forEach(run=>{ const keep = RUN; RUN = run; run.seg.recs.forEach(r=>{ if(!owner || ownerOf(r)===owner) items.push({ d:dec(r.key), r }); }); run.saved.log.forEach(l=>{ if(!owner || l.owner===owner) logs.push(l); }); RUN = keep; });
  const counts = l => !l.flag || l.checked;
  const rate = ls => { const n = ls.length, a = ls.filter(l=>l.accepted).length; return { n, a, pct: n ? a/n*100 : null }; };
  const decisive = logs.filter(l=>l.decisive);
  const first = decisive.filter(l=>l.firstPass && counts(l));
  const autoN = items.filter(x=>x.d.passed).length, excN = items.length - autoN;
  const auto = rate(first.filter(l=>l.kind==='spot')), exc = rate(first.filter(l=>l.kind==='exception'));
  let weighted = null;
  if(auto.pct!==null && exc.pct!==null) weighted = auto.pct*autoN/(autoN+excN) + exc.pct*excN/(autoN+excN);
  else weighted = auto.pct!==null ? auto.pct : exc.pct;
  const pooled = rate(first);
  const rejections = decisive.filter(l=>!l.accepted);
  const reasons = {}; rejections.forEach(l=>{ reasons[l.reason] = (reasons[l.reason]||0)+1; });
  const released = items.filter(x=>x.d.status==='Released').length;
  const secs = decisive.reduce((t,l)=>t+(l.secs||0), 0);
  const minutes = released ? secs/60/released : null, base = DemandAI.CONFIG.g1BaselineMinutes;
  return {
    items: items.length, autoN, excN, auto, exc, weighted, pooled,
    partial: auto.pct===null || exc.pct===null,
    alternatives: rate(decisive.filter(l=>l.kind==='alternative' && counts(l))),
    flagged: decisive.filter(l=>l.flag && !l.checked).length,
    interventions: logs.filter(l=>l.intervention).length,
    reasons, causes: { data: rejections.filter(l=>l.cause==='data').length, system: rejections.filter(l=>l.cause==='system').length, other: rejections.filter(l=>l.cause==='other').length },
    compliance: logs.filter(l=>l.compliance).length,
    edits: { none: decisive.filter(l=>l.accepted && l.rating==='none').length, minor: decisive.filter(l=>l.rating==='minor').length, major: decisive.filter(l=>l.rating==='major').length },
    outcomes: items.reduce((o,x)=>{ if(x.d.outcome) o[x.d.outcome]=(o[x.d.outcome]||0)+1; return o; }, {}),
    released, minutes, base, saved: minutes!==null ? (1 - minutes/base)*100 : null,
  };
}

/* ═══════════════ 8.1 THE OUTCOME LOG: one full record per recommendation ═══════════════ */
// What was recommended, what the person decided, whether an alternative was needed and accepted, what happened
// next, and the configuration version that produced it. The loop records in the POC; production learns from it.
function outcomeRecord(r){
  const d = dec(r.key), lr = liveRec(r), x = draftOf(r), log = RUN.saved.log.filter(l=>l.key===r.key).slice().reverse();
  const decisive = log.filter(l=>l.decisive), first = decisive.find(l=>l.firstPass) || decisive[0], alt = decisive.find(l=>l.kind==='alternative');
  const sigs = [...new Set(r.result.people.flatMap(p=>p.signals.map(s=>s.type)))];
  return {
    list: RUN.saved.name, account: r.account.name, vertical: r.account.vertical, status: r.account.existingCustomer ? 'Existing customer' : 'Net-new', tier: r.person.tier,
    segment: r.segment || 'No micro-segment', groupedOn: r.groupedOn ? r.groupedOn.type : '', signals: sigs,
    action: chosenAction(r), recommended: r.action, runnerUp: r.runnerUp ? r.runnerUp.action : '', contact: lr.contact.name, contactTitle: lr.contact.jobTitle || '', channel: x.channel,
    draft: DemandAIDraftText(x), path: d.passed ? 'Proceeded on its own' : 'Exception queue', exceptions: (d.reasons||[]).join(' · '),
    decision: first ? (first.accepted ? (first.rating==='minor' ? 'Edited (minor)' : first.rating==='major' ? 'Edited (major)' : 'Accepted') : 'Rejected') : d.passed ? (d.spot==='accepted' ? 'Accepted (spot-check)' : 'Not judged (proceeded)') : 'Not decided yet',
    reasonCode: first && !first.accepted ? (REJECT.find(z=>z[1]===first.reason)||[''])[0] : '', reason: first && !first.accepted ? first.reason : '', cause: first && first.cause || '',
    tags: first ? (first.tags||[]).join('; ') : '', alternativeNeeded: !!d.alternativeUsed, alternativeAccepted: alt ? !!alt.accepted : null,
    outcome: d.outcome || '', finalStatus: d.status, owner: repName(ownerOf(r)), config: RUN.saved.configVersion || 'Config v1 · starting values · scoring weights fixed', brand: RUN.saved.brandVersion || 'Brand v1',
  };
}
