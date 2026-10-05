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
function compute(src, runId, createdAt){
  let list, scored, sig, fileIssues = 0;
  if(src.csv){
    const r = DemandAI.processScoredProspects(src.grid, {file:src.fileName, sheet:src.sheet, asOf:src.asOf});
    scored = r.results; fileIssues = r.stats.rejected;
    sig = { signals: scored.flatMap(x=>x.people.flatMap(p=>p.signals)), issues: r.issues };
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
function generated(r){ const d = dec(r.key); return DemandAI.draftFor(liveRec(r), chosenAction(r), {asOf:asOf(), channel:d.channel, variant:d.variant}); }
function draftOf(r){ const d = dec(r.key); return d.draft || generated(r); }
function checksOf(r){ const x = draftOf(r), chk = DemandAI.checkDraft(x); return { chk, conf: DemandAI.confidenceFor(liveRec(r), x, chk, chosenAction(r)) }; }

/* Step 1 · Exception check: four rules. Anything that passes all four goes ahead on its own. */
function exceptionReasons(r){
  const { chk } = checksOf(r), out = [];
  if(!r.segment) out.push('Segment too small');
  if(r.result.confidence==='low') out.push('Low confidence: no contact in the primary persona');
  if(chk.flags.some(f=>f.rule==='Sensitive term')) out.push('Sensitive content');
  if(chk.unsupported.length) out.push("A claim can't be verified");
  return out;
}
const exceptionOf = r => exceptionReasons(r).join(' · ');
const isSensitive = x => DemandAI.checkDraft(x).flags.some(f=>f.rule==='Sensitive term');

/* People: the rep who owns each item (owner_email in the lead file, or reassigned), and who is looking. */
const REPS = { 'rep.a@client-sample.com':'Sofia Ahlgren', 'rep.b@client-sample.com':'Marco Lindqvist' };
const repName = e => REPS[e] || e || 'Unassigned';
const isManager = () => ['Sales manager','Admin'].includes(getRole());
// In the demo the Sales rep role is Rep A; the sales manager and admin see everyone's items.
const myEmail = () => getRole()==='Sales rep' ? 'rep.a@client-sample.com' : null;
function ownerOf(r){ return dec(r.key).owner || liveRec(r).contact.owner || ''; }
const mine = r => isManager() || ownerOf(r)===myEmail();

// Where an item is: in a queue (exception, spot-check, alternative, sent back, taken control), waiting for the
// manager's approval, released, or closed.
const inQueue = d => d.status==='Waiting' || d.spot==='pending';
const STATUS_TONE = {Waiting:'tag-amber', 'Awaiting approval':'tag-violet', Released:'tag-green', Closed:'tag-red', 'Set aside':'tag-grey', 'Watch list':'tag-grey'};
const statusTag = s => `<span class="tag ${STATUS_TONE[s]||'tag-grey'}">${esc(s==='Waiting'?'In For Review':s)}</span>`;
function whyHere(d){
  if(d.spot==='pending') return 'Spot-check';
  return {exception:'Exception', alternative:'Alternative', 'sent back':'Sent back', 'taken control':'Taken control'}[d.why] || 'Exception';
}

/* Run once when a list is built: the exception check, then a random spot-check sample of what went ahead. */
function routeRun(){
  const recs = RUN.seg.recs, auto = [], now = Date.now();
  recs.forEach(r=>{
    const rs = exceptionReasons(r);
    if(rs.length){ setDec(r.key, {status:'Waiting', why:'exception', reasons:rs}); sysLog(r, 'Sent to For Review', rs.join(' · ')); }
    else auto.push(r);
  });
  let h = 7; for(const ch of RUN.saved.id) h = (h*31 + ch.charCodeAt(0)) >>> 0;
  const order = auto.map(r=>{ let x = h; for(const ch of r.key) x = (x*33 + ch.charCodeAt(0)) >>> 0; return [x, r]; }).sort((a,b)=>a[0]-b[0]).map(p=>p[1]);
  const n = auto.length ? Math.max(1, Math.round(auto.length * DemandAI.CONFIG.spotCheckShare)) : 0;
  const spot = new Set(order.slice(0, n).map(r=>r.key));
  auto.forEach(r=>{
    setDec(r.key, {status:'Released', released:'auto', passed:true, by:'System', at:now, spot: spot.has(r.key) ? 'pending' : null});
    sysLog(r, 'Went ahead on its own', 'Passed all four exception checks' + (spot.has(r.key) ? ' · picked for a spot-check' : ''));
  });
  updateRunStats(true);
}
function sysLog(r, decision, note){
  RUN.saved.log.unshift({ at:Date.now(), who:'System', role:'System', key:r.key, prospect:liveRec(r).contact.name, company:r.account.name,
    segment:r.segment||'No micro-segment', decision, action:chosenAction(r), channel:draftOf(r).channel, note, kind:'system' });
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
    decisive:!!extra.decisive, kind:extra.kind||'', firstPass:extra.firstPass, accepted:extra.accepted, linkedTo:extra.linkedTo||'', flag, checked:false });
}
// Every list's log, newest first (pages with several lists override this through ALL_RUNS).
function allLogs(){ const runs = typeof ALL_RUNS==='function' ? ALL_RUNS() : [RUN]; return runs.flatMap(x=>x.saved.log).sort((a,b)=>b.at-a.at); }

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
const ACCEPT_TAGS = ['Accurate reasoning','Right timing','Right action','Ready to use','Saved research time'];
let pickTags = new Set(), pickCode = null;
const kindOfItem = d => d.spot==='pending' ? 'spot' : d.why==='alternative' ? 'alternative' : 'exception';
// The draft as it is in the card's fields now.
function draftFromFields(r){
  const x = Object.assign({}, draftOf(r)), v = id => { const el = document.getElementById(id); return el ? el.value : null; };
  if(x.channel==='Email'){ if(v('dSubj')!==null){ x.subject = v('dSubj'); x.body = v('dBody'); x.words = x.body.split(/\s+/).filter(Boolean).length; } }
  else if(x.channel==='LinkedIn'){ if(v('dNote')!==null){ x.note = v('dNote'); x.message = v('dMsg'); } }
  else { if(v('dTask')!==null) x.task = v('dTask'); if(x.script && v('sOpen')!==null) x.script = Object.assign({}, x.script, {opener:v('sOpen'), questions:v('sQs').split('\n').filter(Boolean), objection:v('sObj'), response:v('sResp'), ask:v('sAsk')}); }
  return x;
}
// Step 4 · An edit is rated automatically: minor if a fifth of the words or fewer changed, major above that.
function editRating(before, after){
  const a = DemandAIDraftText(before).toLowerCase().split(/\s+/).filter(Boolean), b = DemandAIDraftText(after).toLowerCase().split(/\s+/).filter(Boolean);
  const left = new Map(); a.forEach(w=>left.set(w,(left.get(w)||0)+1));
  let common = 0; b.forEach(w=>{ const n = left.get(w); if(n){ common++; left.set(w,n-1); } });
  const changed = Math.max(a.length, b.length) - common;
  return { changed, share: changed / Math.max(1, a.length), rating: changed / Math.max(1, a.length) <= 0.2 ? 'minor' : 'major' };
}
function accept(key){
  const r = recOf(key), d = dec(key); if(!r || !inQueue(d)) return;
  const note = (document.getElementById('acNote')||{}).value || '';
  const before = draftOf(r), after = draftFromFields(r);
  const edited = JSON.stringify(before)!==JSON.stringify(after);
  let rating = null;
  if(edited){ rating = editRating(before, after); change(key, `Edited before accepting (${rating.rating})`, ()=>setDec(key, {draft:after, edited:true, editRating:rating.rating})); }
  const kind = kindOfItem(d), firstPass = kind!=='alternative';
  const label = edited ? `Accepted with a ${rating.rating} edit` : 'Accepted';
  const sensitive = isSensitive(draftOf(r));
  if(kind==='spot') setDec(key, {spot:'accepted', spotBy:me().who, spotAt:Date.now()});
  else if(sensitive && !isManager()) setDec(key, {status:'Awaiting approval', acceptedBy:me().who, acceptedAt:Date.now()});
  else setDec(key, {status:'Released', released:'accepted', by:me().who, at:Date.now()});
  logIt(r, label, {decisive:true, accepted:true, kind, firstPass, tags:[...pickTags], linkedTo:d.alternativeOf||'',
    note:[edited?`${rating.changed} word${rating.changed===1?'':'s'} changed`:'', note, kind==='spot'?'Spot-check rating':'', sensitive&&!isManager()&&kind!=='spot'?'Sensitive: sent to the sales manager for approval':''].filter(Boolean).join(' · ')});
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
  logIt(r, 'Sent back to the rep', {note}); persist(); showToast('Sent back to the rep'); refresh();
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
  logIt(r, `Rejected: ${label}`, Object.assign({reason:label, decisive:true, accepted:false, kind, firstPass:kind!=='alternative', linkedTo,
    note:[outcome, note].filter(Boolean).join(' · ')}, before));
  persist(); showToast(`${label}: ${outcome}`); refresh();
}
function swapAction(key){
  const r = recOf(key); if(!r || !r.runnerUp) return;
  const d = dec(key), to = d.useRunner ? 'recommended' : 'runner-up';
  change(key, `Swapped to the ${to}`, ()=>setDec(key, {useRunner:!d.useRunner, manual:null, draft:null, edited:false}));
  logIt(r, `Swapped to the ${to} action`); persist(); refresh();
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
function outcome(key, o){ const r = recOf(key); setDec(key, {outcome:o}); logIt(r, 'Outcome: '+o); persist(); showToast(`Outcome logged: ${o}`); refresh(); }
function reassign(key, email){
  const r = recOf(key), from = ownerOf(r); if(!isManager() || !email || email===from) return;
  setDec(key, {owner:email}); logIt(r, `Reassigned to ${repName(email)}`, {note:`From ${repName(from)}`}); persist(); showToast(`Moved to ${repName(email)}'s queue`); refresh();
}
function takeControl(key){
  const r = recOf(key);
  setDec(key, {status:'Waiting', why:'taken control', spot:null}); logIt(r, 'Taken control', {note:'Pulled back into For Review'}); persist(); showToast('Pulled back into For Review'); refresh();
}
function refresh(){ updateRunStats(); if(typeof onDecision==='function') onDecision(); if(openKey) openRec(openKey, true); }
// Keeps the count that needs a person on the saved list, for the For Review badge on every page.
function updateRunStats(quiet){
  if(!RUN) return;
  RUN.saved.stats.waiting = RUN.seg.recs.filter(r=>{ const d = dec(r.key); return inQueue(d) || d.status==='Awaiting approval'; }).length;
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
      x.subject||'', x.body||x.message||(x.script?[x.script.opener,...x.script.questions,x.script.ask].join(' | '):''), x.note||'',
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
  const live = inQueue(d) && mine(r), action = chosenAction(r), brief = DemandAI.briefFor(lr, action, {asOf:asOf(), channel:d.channel});
  document.getElementById('detTitle').textContent = c.name;
  document.getElementById('detSub').textContent = [c.jobTitle, r.account.name].filter(Boolean).join(' · ');
  // 1 · Why it's here, and why now
  const why = d.spot==='pending' ? `It went ahead on its own after passing all four checks, and was picked at random for a spot-check. Rate it as if it had come to you.`
    : d.why==='alternative' ? `The alternative after a rejection of <b>${esc(d.alternativeOf||'the first recommendation')}</b>. It's offered once: a second rejection closes the account for the pilot.`
    : d.why==='sent back' ? `Sent back by the sales manager: ${esc(d.sentBackNote||'')}`
    : d.why==='taken control' ? 'Pulled back into For Review after it went ahead on its own.'
    : d.status==='Released' && d.released==='auto' ? 'Passed all four exception checks, so it went ahead on its own.'
    : (d.reasons||exceptionReasons(r)).map(esc).join('<br>') || 'Exception';
  html = panel("Why it's here", `<span class="tag ${d.spot==='pending'?'tag-blue':d.why==='alternative'?'tag-violet':'tag-amber'}">${inQueue(d)?whyHere(d):d.status==='Released'&&d.released==='auto'?'Went ahead':'Exception'}</span>`, `
    <div style="font-size:12.5px;color:var(--i1);line-height:1.55;margin-bottom:8px">${why}</div>
    ${kv('Why now', esc(r.reason.replace(/^./,m=>m.toUpperCase())))}
    ${kv('Micro-segment', `${segTag(r.segment)} <span style="color:var(--i3)">${r.segment?esc(SEG_MEANS[r.segment]||''):''}</span>`)}
    ${kv('Owner', isManager() ? `<select onchange="reassign('${key}',this.value)" style="padding:3px 6px;border:1px solid var(--bdk);border-radius:6px;font-size:12px">${['',...Object.keys(REPS)].map(e=>`<option value="${e}" ${ownerOf(r)===e?'selected':''}>${esc(repName(e))}</option>`).join('')}</select>` : esc(repName(ownerOf(r))))}`);
  // 2 · The action
  const card = (title, a, sub, chosen) => `<div style="padding:10px 12px;border:1px solid ${chosen?'var(--brand-mid)':'var(--border)'};background:${chosen?'var(--brand-lt)':'var(--surf)'};border-radius:var(--rsm);margin-bottom:8px">
    <div style="font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${chosen?'var(--brand-dk)':'var(--i3)'};margin-bottom:4px">${title}${chosen?' · chosen':''}</div>
    <div style="font-size:12.5px;font-weight:600;color:var(--i1)">${esc(a)}</div><div style="font-size:11px;color:var(--i2);margin-top:3px;line-height:1.5">${sub}</div></div>`;
  html += panel('The action', live && r.runnerUp && !d.manual ? `<button class="btn btn-sec btn-sm" onclick="swapAction('${key}')">${d.useRunner?'Swap back':'Swap to runner-up'}</button>` : '', `
    ${card('Recommended', r.action, esc(r.reason), !d.useRunner && !d.manual)}
    ${r.runnerUp ? card('Runner-up', r.runnerUp.action, esc(r.runnerUp.reason.replace(/\.?$/,'.')), d.useRunner && !d.manual) : ''}
    ${d.manual ? card('Manual action', d.manual, 'Added by a reviewer.', true) : ''}
    ${live ? `<div style="display:flex;gap:6px"><input id="manualAct" placeholder="Or add a manual action…" style="flex:1;min-width:0;padding:7px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px"><button class="btn btn-sec btn-sm" onclick="addManual('${key}')">Add</button></div>` : ''}`);
  // 3 · Contact and channel
  html += panel('Contact and channel', '', kv('Contact', `${esc(c.name)} <span style="color:var(--i3)">· ${esc(c.jobTitle||'')} · ${esc(c.persona||'')} persona</span>`)
    + kv('Reach', [c.email?esc(c.email)+(c.emailVerified?'':' <span style="color:var(--warn)">(not verified)</span>'):'', c.linkedin?'LinkedIn':''].filter(Boolean).join(' · ') || '<span style="color:var(--i3)">No email or LinkedIn</span>')
    + kv('Channel', `<b>${esc(x.channel==='Task'?'Task for the team':x.channel)}</b> <span style="color:var(--i3)">${esc(x.why)}</span>`));
  // 4 · The editable draft
  const ro = !live;
  let draft = '';
  const sc = x.script;
  if(x.channel==='Email') draft = lbl('Subject')+fld('dSubj',x.subject,0,ro)+lbl('Body', `${x.body.split(/\s+/).filter(Boolean).length} words`)+fld('dBody',x.body,9,ro);
  else if(x.channel==='LinkedIn') draft = lbl('Connection note', `${x.note.length}/200`)+fld('dNote',x.note,3,ro)+lbl('First message after they accept')+fld('dMsg',x.message,4,ro);
  else draft = lbl('Task')+fld('dTask',x.task,3,ro);
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
  if(inQueue(d) && !mine(r)) decide = `<div style="font-size:12px;color:var(--i2)">In ${esc(repName(ownerOf(r)))}'s queue.</div>`;
  else if(inQueue(d)) decide = `
    <div class="tags" style="margin-bottom:8px">${ACCEPT_TAGS.map(t=>`<button class="tag ${pickTags.has(t)?'tag-green':'tag-grey'}" style="cursor:pointer" onclick="pickTags.has('${t}')?pickTags.delete('${t}'):pickTags.add('${t}');this.className='tag '+(pickTags.has('${t}')?'tag-green':'tag-grey')">${t}</button>`).join('')}</div>
    <input id="acNote" placeholder="Comment (optional)" style="width:100%;padding:7px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px;margin-bottom:8px">
    <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center" onclick="accept('${key}')">${d.spot==='pending'?'Rate: accept':'Accept'}</button>
    ${cap('Or reject · why?')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px">${REJECT.filter(([c])=>!(d.alternativeUsed&&false)).map(([c,l,w])=>`<button title="${esc(w)}" class="rj" onclick="pickCode='${c}';document.querySelectorAll('.rj').forEach(b=>b.style.cssText=b.dataset.base);this.style.cssText=this.dataset.base+';border-color:var(--neg);background:var(--neg-lt)';document.getElementById('rjWhat').textContent='${esc(d.alternativeUsed&&['R6','R7','R8','R9','R10','R11'].includes(c)?'Second rejection: the account is closed for the pilot':w)}'" data-base="text-align:left;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--i1)" style="text-align:left;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--i1)">${l}</button>`).join('')}</div>
    <div id="rjWhat" style="font-size:11px;color:var(--i3);min-height:15px;margin-bottom:6px"></div>
    <input id="rjNote" placeholder="Comment (needed for Other)" style="width:100%;padding:7px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px;margin-bottom:8px">
    <button class="btn btn-sec btn-sm" style="width:100%;justify-content:center" onclick="reject('${key}')">Reject</button>`;
  else if(d.status==='Awaiting approval') decide = isManager()
    ? `<div style="font-size:12px;color:var(--i1);margin-bottom:10px">Accepted by ${esc(d.acceptedBy||'')}. The draft has sensitive content, so it needs your approval before release.</div>
       <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center" onclick="managerApprove('${key}')">Approve and release</button>
       ${cap('Or send it back to the rep')}<input id="sbNote" placeholder="Why it goes back" style="width:100%;padding:7px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px;margin-bottom:8px">
       <button class="btn btn-sec btn-sm" style="width:100%;justify-content:center" onclick="sendBack('${key}')">Send back</button>`
    : `<div style="font-size:12px;color:var(--i2)">Accepted by ${esc(d.acceptedBy||'')}; waiting for the sales manager's approval because the draft has sensitive content.</div>`;
  else if(d.status==='Released') decide = `<div style="font-size:12px;color:var(--i1);margin-bottom:10px">${d.released==='auto'?'Went ahead on its own':d.released==='approved'?`Approved by ${by}`:`Accepted by ${by}`}${d.spot==='accepted'?` · spot-check accepted by ${esc(d.spotBy||'')}`:''}. It stays here as a ${x.channel==='Task'?'task':'ready message'}; export it from Export. Nothing is sent from the POC.</div>
      ${cap('What happened')}
      <div class="tags">${OUTCOMES.map(o=>`<button class="tag ${d.outcome===o?'tag-violet':'tag-grey'}" style="cursor:pointer" onclick="outcome('${key}','${o}')">${o}</button>`).join('')}</div>
      ${d.released==='auto' && !d.spot ? `<button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="takeControl('${key}')">Take control: review it yourself</button>` : ''}`;
  else decide = `<div style="font-size:12px;color:var(--i1)">${esc((REJECT.find(x=>x[0]===d.code)||[])[1]||'Rejected')} · ${by}<div style="color:var(--i2);margin-top:3px">${esc(d.status)}</div></div>`;
  if(!inQueue(d) && typeof nextItem==='function' && typeof hasNext==='function' && hasNext()) decide += `<button class="btn btn-primary btn-sm" style="width:100%;justify-content:center;margin-top:12px" onclick="nextItem()">Next →</button>`;
  html += panel(inQueue(d) ? 'Your decision' : 'Status', statusTag(d.status==='Released'&&d.spot==='pending'?'Waiting':d.status), decide);
  const hist = RUN.saved.log.filter(l=>l.key===key);
  if(hist.length) html += `<details class="panel" style="padding:10px 14px"><summary style="cursor:pointer;font-size:11.5px;font-weight:600;color:var(--i2)">History · ${hist.length}</summary>
    ${hist.map(l=>`<div style="padding:7px 0;border-bottom:1px solid var(--s75);font-size:11.5px"><b style="color:var(--i1)">${esc(l.decision)}</b> <span style="color:var(--i3)">· ${esc(l.who)} · ${fmtDate(l.at)} ${timeOf(l.at)}${l.secs!=null?` · ${l.secs}s`:''}</span>${l.note?`<div style="color:var(--i2);margin-top:2px">${esc(l.note)}</div>`:''}</div>`).join('')}
  </details>`;
  const body = document.getElementById('detBody'), top = keepTimer ? body.scrollTop : 0;
  body.innerHTML = html; body.scrollTop = top;
  const dr = document.getElementById('detailDrawer'); dr.style.width = '500px'; dr.classList.add('open');
}
function DemandAIDraftText(x){
  if(x.channel==='Email') return `Subject: ${x.subject}\n\n${x.body}`;
  if(x.channel==='LinkedIn') return `Note: ${x.note}\n\nMessage: ${x.message}`;
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
