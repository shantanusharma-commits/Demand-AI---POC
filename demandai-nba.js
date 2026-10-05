/* Shared by Micro-segments & NBA and For Review: rebuilding a segmented list, each item's action, draft,
   checks and decisions, the review drawer and the exports. Pages provide: esc, table, cell, fmtDate, download,
   showToast, tagChip, closeDrawer, getRole, ROLE_PERSON; and optionally onDecision() and queuePos(key). */
let RUN = null, openKey = null, openedAt = 0;
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
      if(['Approved','Sent'].includes(d.status) || d.code==='R4'){ const n = (run.accountNames||{})[k.split('|')[0]]; if(n && !m.has(n.toLowerCase())) m.set(n.toLowerCase(), `${run.name}, ${fmtDate(d.at||run.createdAt)}`); }
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
// Items that need a person before they proceed (6.1/6.2)
function exceptionOf(r){
  const { chk, conf } = checksOf(r), x = draftOf(r);
  if(!r.segment) return r.exception;
  if(chk.unsupported.length) return 'Unsupported claim';
  if(chk.flags.some(f=>f.rule==='Sensitive term')) return 'Needs compliance approval';
  if(chk.flags.length) return 'Brand or rule check';
  if(r.exception) return r.exception;
  if(conf.level==='Low') return 'Low confidence';
  return '';
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
function logIt(r, decision, extra={}){
  const m = me(), x = draftOf(r), d = dec(r.key);
  const secs = openedAt ? Math.round((Date.now()-openedAt)/1000) : null;
  const pos = typeof queuePos==='function' ? queuePos(r.key) : 0;
  RUN.saved.log.unshift({ at:Date.now(), who:m.who, role:m.role, key:r.key, prospect:liveRec(r).contact.name, company:r.account.name,
    segment:r.segment||'No micro-segment', decision, code:extra.code||'', tags:extra.tags||[], action:extra.action||chosenAction(r), channel:extra.channel||x.channel,
    note:extra.note||'', version:extra.version||(d.versions||[1]).length, secs, position:pos||null,
    flag: extra.decisive && secs!==null && secs<5 ? 'Fast decision: checked before it counts' : '' });
}


/* ═══════════════ DECISIONS (6.4–6.8): one item at a time, no bulk ═══════════════ */
const REJECT = [
  ['R1','Wrong fit','The account is set aside for the pilot'],
  ['R2','Signal not adequate','The signal is set aside; re-score the account in Scoring'],
  ['R3','Wrong company or site','The signal is detached; the entity match is corrected'],
  ['R4','Already engaged','Engage-once applies from now on'],
  ['R5','Not the right time','The account moves to the watch list'],
  ['R6','Wrong action','The runner-up is offered once, with its reason'],
  ['R7','Wrong persona or contact','The next contact in persona order is proposed'],
  ['R8','Wrong channel','The same action on the next allowed channel'],
  ['R9','Factual issue','The draft is regenerated with the issue named'],
  ['R10','Tone or brand','The draft is regenerated with the note'],
  ['R11','Length or format','The draft is regenerated, shorter'],
  ['R12','Other','A comment is required; nothing changes automatically'],
];
const ACCEPT_TAGS = ['Accurate reasoning','Right timing','Right action','Ready to use','Saved research time'];
let pickTags = new Set(), pickCode = null;
function approve(key){
  const r = recOf(key), d = dec(key); if(!r || d.status!=='Waiting') return;
  const note = (document.getElementById('acNote')||{}).value || '';
  const ex = exceptionOf(r);
  setDec(key, {status:'Approved', by:me().who, at:Date.now(), tags:[...pickTags], comment:note});
  logIt(r, d.manual ? 'Approved a manual action' : d.useRunner ? 'Approved the runner-up' : d.edited ? 'Approved with edits' : 'Approved',
    {tags:[...pickTags], note:[ex?`Exception reviewed: ${ex}`:'', note].filter(Boolean).join(' · '), decisive:true});
  persist(); showToast(`Approved and logged: ${chosenAction(r)} for ${liveRec(r).contact.name}`); refresh();
}
function undo(key){ const r = recOf(key); setDec(key, {status:'Waiting', by:null, at:null}); logIt(r, 'Decision undone'); persist(); refresh(); }
function reject(key){
  const r = recOf(key), d = dec(key);
  if(!pickCode){ showToast('Pick a reason code'); return; }
  const note = (document.getElementById('rjNote')||{}).value.trim();
  if(pickCode==='R12' && !note){ showToast('R12 needs a comment'); return; }
  const [code, label] = REJECT.find(x=>x[0]===pickCode);
  const second = d.alternativeUsed;
  const before = { action:chosenAction(r), channel:draftOf(r).channel, version:(d.versions||[1]).length };
  let outcome = '', next = {};
  const alt = !second && {
    R6: () => r.runnerUp && !d.useRunner && !d.manual ? (change(key,'R6 wrong action: runner-up offered',()=>setDec(key,{useRunner:true,draft:null,edited:false})), 'Runner-up offered once, with its reason') : '',
    R7: () => { const tried = new Set([r.contact.row, d.contactRow].filter(Boolean)); const pr = {Primary:0}; const nx = r.result.people.filter(p=>!tried.has(p.contact.row) && !p.contact.optOut).sort((a,b)=>(pr[a.contact.persona]??1)-(pr[b.contact.persona]??1))[0];
                return nx ? (change(key,'R7 wrong contact: next contact',()=>setDec(key,{contactRow:nx.contact.row,draft:null,edited:false,channel:null})), `Next contact proposed: ${nx.contact.name}`) : ''; },
    R8: () => { const x = draftOf(r); if(x.channel==='Task') return ''; const al = DemandAI.allowedChannels(liveRec(r).contact); const nx = al[al.indexOf(x.channel)+1];
                return nx ? (change(key,'R8 wrong channel: next allowed channel',()=>setDec(key,{channel:nx,draft:null,edited:false})), `Same action on ${nx}`) : ''; },
    R9: () => (change(key,'R9 factual issue: regenerated',()=>setDec(key,{variant:'alt',draft:null,edited:false})), 'Draft regenerated, same action'),
    R10: () => (change(key,'R10 tone or brand: regenerated',()=>setDec(key,{variant:'tone',draft:null,edited:false})), 'Draft regenerated, same action'),
    R11: () => (change(key,'R11 length or format: regenerated shorter',()=>setDec(key,{variant:'short',draft:null,edited:false})), 'Draft regenerated shorter, same action'),
  }[code];
  if(alt) outcome = alt();
  if(outcome) next = {status:'Waiting', alternativeUsed:true};
  else if(code==='R1'||code==='R2'||code==='R3') { next = {status:'Set aside'}; outcome = REJECT.find(x=>x[0]===code)[2]; }
  else if(code==='R4') { next = {status:'Closed'}; outcome = 'Engage-once applies from now on'; }
  else if(code==='R5') { next = {status:'Watch list'}; outcome = 'Moved to the watch list'; }
  else { next = {status:'Closed'}; outcome = second ? 'Second rejection: closed' : code==='R12' ? 'Nothing changes automatically' : 'No alternative available: closed'; }
  setDec(key, Object.assign(next, {code, by:me().who, at:Date.now(), rejections:(d.rejections||[]).concat([{code, note, at:Date.now()}])}));
  logIt(r, `Rejected · ${code} ${label}`, Object.assign({code, note:[outcome, note].filter(Boolean).join(' · '), decisive:true}, before));
  persist(); showToast(`${code} ${label}: ${outcome}`); refresh();
}
function swapAction(key){
  const r = recOf(key); if(!r || !r.runnerUp) return;
  const d = dec(key), to = d.useRunner ? 'recommended' : 'runner-up';
  change(key, `Swapped to the ${to}`, ()=>setDec(key, {useRunner:!d.useRunner, manual:null, draft:null, edited:false}));
  logIt(r, `Swapped to the ${to}`); persist(); refresh();
}
function addManual(key){
  const v = (document.getElementById('manualAct')||{}).value.trim();
  if(!v){ showToast('Write the action first'); return; }
  const r = recOf(key);
  change(key, 'Manual action added', ()=>setDec(key, {manual:v, draft:null, edited:false}));
  logIt(r, 'Added a manual action', {note:v}); persist(); refresh();
}
function saveDraft(key, rating){
  const r = recOf(key), x = Object.assign({}, draftOf(r)), v = id => (document.getElementById(id)||{}).value;
  if(x.channel==='Email'){ x.subject = v('dSubj'); x.body = v('dBody'); x.words = x.body.split(/\s+/).filter(Boolean).length; }
  else if(x.channel==='LinkedIn'){ x.note = v('dNote'); x.message = v('dMsg'); }
  else if(x.script){ x.script = Object.assign({}, x.script, {opener:v('sOpen'), questions:v('sQs').split('\n').filter(Boolean), objection:v('sObj'), response:v('sResp'), ask:v('sAsk')}); if(x.task!==undefined && document.getElementById('dTask')) x.task = v('dTask'); }
  else x.task = v('dTask');
  change(key, `Edited (${rating})`, ()=>setDec(key, {draft:x, edited:true, editRating:rating}));
  const chk = DemandAI.checkDraft(x);
  logIt(r, `Draft edited · ${rating}`, {note: chk.flags.length||chk.unsupported.length ? `${chk.flags.length} flag${chk.flags.length===1?'':'s'}, ${chk.unsupported.length} unsupported claim${chk.unsupported.length===1?'':'s'}` : 'Checks pass'});
  persist(); showToast(chk.unsupported.length ? 'Saved: an unsupported claim makes this an exception' : chk.flags.length ? 'Saved with flags' : 'Saved: checks pass'); refresh();
}
function markSent(key){ const r = recOf(key); setDec(key, {status:'Sent', sentAt:Date.now()}); logIt(r, 'Marked as sent'); persist(); refresh(); }
function outcome(key, o){ const r = recOf(key); setDec(key, {outcome:o}); logIt(r, 'Outcome: '+o); persist(); showToast(`Outcome logged: ${o}`); refresh(); }
function refresh(){ updateRunStats(); if(typeof onDecision==='function') onDecision(); if(openKey) openRec(openKey, true); }
// Keeps the waiting count on the saved list, for the For Review badge on every page.
function updateRunStats(){ if(!RUN) return; RUN.saved.stats.waiting = RUN.seg.recs.filter(r=>dec(r.key).status==='Waiting').length; persist(); reviewBadge(); }


const STATUS_TONE = {Waiting:'tag-amber', Approved:'tag-green', Sent:'tag-blue', Closed:'tag-red', 'Set aside':'tag-grey', 'Watch list':'tag-grey'};
const statusTag = s => `<span class="tag ${STATUS_TONE[s]||'tag-grey'}">${esc(s==='Waiting'?'To review':s)}</span>`;

function exportApproved(){
  const rs = RUN.seg.recs.filter(r=>['Approved','Sent'].includes(dec(r.key).status) && draftOf(r).channel!=='Task');
  if(!rs.length){ showToast('No approved messages yet'); return; }
  const rows = [['prospect','job_title','company','email','linkedin_url','segment','action','channel','subject','message','linkedin_note','approved_by','approved_at','status']];
  rs.forEach(r=>{ const d = dec(r.key), x = draftOf(r), c = liveRec(r).contact;
    rows.push([c.name, c.jobTitle||'', r.account.name, c.email||'', c.linkedin||'', r.segment||'No micro-segment', chosenAction(r), x.channel,
      x.subject||'', x.body||x.message||(x.script?[x.script.opener,...x.script.questions,x.script.ask].join(' | '):''), x.note||'', d.by||'', d.at?new Date(d.at).toISOString():'', d.status]); });
  download('approved_actions.csv', DemandAI.toCSV(rows));
}
// 5.7 Person-owned actions as a task file (routing into CRM, Teams or Slack is for production)
function exportTasks(){
  const rs = RUN.seg.recs.filter(r=>draftOf(r).channel==='Task' && !['Closed','Set aside','Watch list'].includes(dec(r.key).status));
  if(!rs.length){ showToast('No tasks in this list'); return; }
  const rows = [['owner','prospect','company','segment','task','why','call_opener','questions','objection','response','ask','status']];
  rs.forEach(r=>{ const x = draftOf(r), s = x.script || {}, c = liveRec(r).contact;
    rows.push([c.owner||'', c.name, r.account.name, r.segment||'No micro-segment', x.task, x.why, s.opener||'', (s.questions||[]).join(' | '), s.objection||'', s.response||'', s.ask||'', dec(r.key).status]); });
  download('tasks.csv', DemandAI.toCSV(rows));
}
function exportLog(){
  const rows = [['when','who','role','prospect','company','segment','decision','reason_code','tags','action','channel','version','seconds','queue_position','flag','note']];
  RUN.saved.log.forEach(l=>rows.push([new Date(l.at).toISOString(), l.who, l.role, l.prospect, l.company, l.segment, l.decision, l.code||'', (l.tags||[]).join('; '), l.action, l.channel, l.version||1, l.secs??'', l.position??'', l.flag||'', l.note]));
  download('decision_log.csv', DemandAI.toCSV(rows));
}

/* ═══════════════ RECOMMENDATION DRAWER ═══════════════ */
const fld = (id, v, rows, ro) => rows ? `<textarea id="${id}" rows="${rows}" ${ro?'readonly':''} style="width:100%;border:1px solid var(--bdk);border-radius:var(--rsm);padding:8px 10px;font-size:12px;color:var(--i1);line-height:1.6;font-family:var(--fb);resize:vertical;outline:none;${ro?'background:var(--s50)':''}">${esc(v)}</textarea>`
  : `<input id="${id}" value="${esc(v)}" ${ro?'readonly':''} style="width:100%;border:1px solid var(--bdk);border-radius:var(--rsm);padding:8px 10px;font-size:12.5px;font-weight:600;color:var(--i1);outline:none;${ro?'background:var(--s50)':''}">`;
const lbl = (t, extra) => `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3);margin:10px 0 5px"><span>${t}</span>${extra?`<span style="letter-spacing:0;text-transform:none;font-weight:500">${extra}</span>`:''}</div>`;
const kv = (k,v) => `<div style="display:flex;gap:10px;padding:5px 0;border-bottom:1px solid var(--s75);font-size:12px;line-height:1.45"><span style="color:var(--i3);width:84px;flex-shrink:0">${k}</span><span style="color:var(--i1);min-width:0">${v}</span></div>`;
const panel = (title, right, body) => `<div class="panel" style="margin-bottom:12px"><div class="panel-hdr"><span class="panel-ttl">${title}</span>${right||''}</div><div class="panel-body">${body}</div></div>`;
function openRec(key, keepTimer){
  const r = recOf(key); if(!r) return;
  if(!keepTimer || openKey!==key){ openedAt = Date.now(); pickTags = new Set(); pickCode = null; }
  openKey = key;
  const d = dec(key), lr = liveRec(r), x = draftOf(r), { chk, conf } = checksOf(r), locked = d.status!=='Waiting', min = DemandAI.CONFIG.minSegmentAccounts;
  const action = chosenAction(r), brief = DemandAI.briefFor(lr, action, {asOf:asOf(), channel:d.channel}), ex = exceptionOf(r);
  const segAccs = r.segment ? [...new Set(RUN.seg.segments.find(g=>g.name===r.segment).recs.map(y=>y.account.name))] : [];
  document.getElementById('detTitle').textContent = lr.contact.name;
  document.getElementById('detSub').textContent = [lr.contact.jobTitle, r.account.name].filter(Boolean).join(' · ');
  let html = ex && !locked ? `<div style="margin-bottom:12px;padding:9px 12px;background:var(--warn-lt);color:var(--warn);border-radius:var(--rsm);font-size:12px"><b>Needs a closer look:</b> ${esc(ex)}</div>` : '';
  // Segment
  html += panel('1 · Why this group', segTag(r.segment), `
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px"><span style="color:var(--i3);font-size:11.5px;width:84px">Strongest</span>${tagChip(r.prominentSignal.type)}<span style="font-family:var(--fm);font-size:11px;color:var(--i3)">${fmt1(r.prominentSignal.weight)}</span></div>
    ${r.segment ? `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px"><span style="color:var(--i3);font-size:11.5px;width:84px">Grouped on</span>${tagChip(r.groupedOn.type)}<span style="font-family:var(--fm);font-size:11px;color:var(--i3)">${fmt1(r.groupedOn.weight)}</span></div>` : ''}
    <div style="font-size:12.5px;color:var(--i1);line-height:1.55">${r.segment && r.fallback ? `Fewer than ${min} accounts share its strongest signal, so it is grouped on its next signal with ${segAccs.length-1} other account${segAccs.length===2?'':'s'}.`
      : r.segment ? `Grouped on its strongest signal with ${segAccs.length-1} other account${segAccs.length===2?'':'s'}.` : esc(r.exception)+'.'}</div>
    <div style="font-size:11px;color:var(--i3);margin-top:6px">${esc(r.account.vertical)} · ${esc(r.status)} · ${esc(lr.contact.persona||'')} persona${segAccs.length?' · with '+esc(segAccs.filter(n=>n!==r.account.name).join(', ')):''}</div>`);
  // Action
  const card = (title, a, sub, chosen) => `<div style="padding:10px 12px;border:1px solid ${chosen?'var(--brand-mid)':'var(--border)'};background:${chosen?'var(--brand-lt)':'var(--surf)'};border-radius:var(--rsm);margin-bottom:8px">
    <div style="font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${chosen?'var(--brand-dk)':'var(--i3)'};margin-bottom:4px">${title}${chosen?' · chosen':''}</div>
    <div style="font-size:12.5px;font-weight:600;color:var(--i1)">${esc(a)}</div><div style="font-size:11px;color:var(--i2);margin-top:3px;line-height:1.5">${sub}</div></div>`;
  html += panel('2 · Recommended action', !locked && r.runnerUp && !d.manual ? `<button class="btn btn-sec btn-sm" onclick="swapAction('${key}')">${d.useRunner?'Swap back':'Swap to runner-up'}</button>` : '', `
    ${card('Recommended', r.action, esc(r.reason), !d.useRunner && !d.manual)}
    ${r.runnerUp ? card('Runner-up', r.runnerUp.action, esc(r.runnerUp.reason.replace(/\.?$/,'.')), d.useRunner && !d.manual) : ''}
    ${d.manual ? card('Manual action', d.manual, 'Added by a reviewer; drafted with the segment\'s playbook.', true) : ''}
    ${!locked ? `<div style="display:flex;gap:6px;margin-top:2px"><input id="manualAct" placeholder="Add a manual action…" style="flex:1;min-width:0;padding:7px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px"><button class="btn btn-sec btn-sm" onclick="addManual('${key}')">Add</button></div>` : ''}
    <div style="display:flex;gap:8px;align-items:baseline;font-size:12px;margin-top:10px"><span style="color:var(--i3);width:84px;flex-shrink:0">Channel</span><span><b style="color:var(--i1)">${esc(x.channel)}</b> <span style="color:var(--i3);font-size:11px">${esc(x.why)}</span></span></div>`);
  // Brief
  html += panel('3 · Brief for the message', '', kv('Who', esc(brief.who)) + kv('Why now', esc(brief.whyNow)) + kv('Angle', esc(brief.angle))
    + kv('Proof', brief.proof ? `${esc(brief.proof.title)} <span style="color:var(--i3)">· ${esc(brief.proof.id)} · ${esc(brief.proof.type)}, ${brief.proof.year} · expires ${esc(brief.proof.expiry)}</span>` : `<span style="color:var(--warn)">No approved, unexpired proof${brief.expired.length?` (${esc(brief.expired.map(e=>e.title+' expired '+e.expiry).join('; '))})`:''}</span>`)
    + kv('Objection', esc(brief.objection)) + kv('Ask', esc(brief.ask)) + kv('Limits', esc(brief.constraints)));
  // Draft
  let draft = '';
  const sc = x.script;
  if(x.channel==='Email') draft = lbl('Subject', `${x.subject.split(/\s+/).filter(Boolean).length} words`)+fld('dSubj',x.subject,0,locked)+lbl('Body', `${x.body.split(/\s+/).filter(Boolean).length} words`)+fld('dBody',x.body,9,locked);
  else if(x.channel==='LinkedIn') draft = lbl('Connection note', `${x.note.length}/200`)+fld('dNote',x.note,3,locked)+lbl('First message after they accept')+fld('dMsg',x.message,4,locked);
  else if(x.channel==='Task') draft = lbl('Task')+fld('dTask',x.task,3,locked);
  if(sc) draft += lbl(x.channel==='Task'?'Call script for the owner':'Call script')+lbl('Opener')+fld('sOpen',sc.opener,3,locked)+lbl('Discovery questions')+fld('sQs',sc.questions.join('\n'),3,locked)
    +lbl('Objection')+fld('sObj',sc.objection,0,locked)+lbl('Response')+fld('sResp',sc.response,2,locked)+lbl('The ask')+fld('sAsk',sc.ask,0,locked);
  const vs = versions(r);
  html += panel(x.channel==='Task' ? `4 · Task for a person${x.noProof?' · no proof found':''}` : `4 · Draft · ${esc(x.channel)}`, `<span style="display:flex;gap:6px">${d.edited?`<span class="tag tag-violet">Edited · ${esc(d.editRating||'')}</span>`:''}<span class="tag tag-grey">v${vs.length}</span></span>`, `
    <div style="margin-top:-8px">${draft}</div>
    ${!locked?`<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-sec btn-sm" onclick="saveDraft('${key}','minor')">Save as minor edit</button><button class="btn btn-sec btn-sm" onclick="saveDraft('${key}','major')">Save as major edit</button></div>`:''}`);
  // Checks and confidence
  html += panel('5 · Checks', `<span class="tag ${conf.level==='High'?'tag-green':conf.level==='Medium'?'tag-amber':'tag-red'}">${conf.level} confidence</span>`, `
    <div style="font-size:12px;color:var(--i1);margin-bottom:8px">${esc(conf.reason)}</div>
    ${kv('Brand, rules', chk.flags.length ? chk.flags.map(f=>`<span style="color:var(--neg)">${esc(f.rule)}: ${esc(f.detail)}</span>`).join('<br>') : '<span style="color:var(--pos)">Pass</span>')}
    ${kv('Claims', chk.claims.length ? chk.claims.map(c=>`<span style="color:${c.verified?'var(--pos)':'var(--neg)'}">${c.verified?'✓':'✗'}</span> ${esc(c.text)}<span style="color:var(--i3)"> · ${c.verified?esc(c.source):'no approved source'}</span>`).join('<br>') : '<span style="color:var(--i3)">No product claims</span>')}`);
  // Decision
  const by = d.by ? `${esc(d.by)} · ${fmtDate(d.at)} ${timeOf(d.at)}` : '';
  let decide;
  if(d.status==='Waiting') decide = `
    ${d.alternativeUsed?`<div style="font-size:11.5px;color:var(--warn);margin-bottom:8px">This is the alternative after a rejection; a second rejection closes it.</div>`:''}
    <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3);margin-bottom:6px">Accept · optional tags</div>
    <div class="tags" style="margin-bottom:8px">${ACCEPT_TAGS.map(t=>`<button class="tag ${pickTags.has(t)?'tag-green':'tag-grey'}" style="cursor:pointer" onclick="pickTags.has('${t}')?pickTags.delete('${t}'):pickTags.add('${t}');this.className='tag '+(pickTags.has('${t}')?'tag-green':'tag-grey')">${t}</button>`).join('')}</div>
    <input id="acNote" placeholder="Comment (optional)" style="width:100%;padding:7px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px;margin-bottom:8px">
    <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center" onclick="approve('${key}')">Approve</button>
    <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3);margin:16px 0 6px">Reject · reason code</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px">${REJECT.map(([c,l,w])=>`<button title="${esc(w)}" class="rj" onclick="pickCode='${c}';document.querySelectorAll('.rj').forEach(b=>b.style.cssText=b.dataset.base);this.style.cssText=this.dataset.base+';border-color:var(--neg);background:var(--neg-lt)';document.getElementById('rjWhat').textContent='${esc(w)}'" data-base="text-align:left;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:11.5px;color:var(--i1)" style="text-align:left;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:11.5px;color:var(--i1)"><b>${c}</b> ${l}</button>`).join('')}</div>
    <div id="rjWhat" style="font-size:11px;color:var(--i3);min-height:15px;margin-bottom:6px"></div>
    <input id="rjNote" placeholder="Comment (required for R12)" style="width:100%;padding:7px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px;margin-bottom:8px">
    <button class="btn btn-sec btn-sm" style="width:100%;justify-content:center" onclick="reject('${key}')">Reject</button>`;
  else if(d.status==='Approved') decide = `<div style="font-size:12px;color:var(--i1);margin-bottom:10px">Approved by ${by}${d.tags&&d.tags.length?`<div style="color:var(--i3);margin-top:3px">${esc(d.tags.join(' · '))}</div>`:''}</div><div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm" onclick="markSent('${key}')">${x.channel==='Task'?'Mark task done':'Mark as sent'}</button><button class="btn btn-ghost btn-sm" onclick="undo('${key}')">Undo approval</button></div>`;
  else if(d.status==='Sent') decide = `<div style="font-size:12px;color:var(--i1);margin-bottom:8px">Approved by ${by} · sent ${fmtDate(d.sentAt)}</div>
      <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3);margin-bottom:6px">Outcome</div>
      <div class="tags">${['Replied','Meeting booked','No response','Bounced','Not interested'].map(o=>`<button class="tag ${d.outcome===o?'tag-violet':'tag-grey'}" style="cursor:pointer" onclick="outcome('${key}','${o}')">${o}</button>`).join('')}</div>`;
  else decide = `<div style="font-size:12px;color:var(--i1);margin-bottom:10px">${esc(d.code||'')} ${esc((REJECT.find(x=>x[0]===d.code)||[])[1]||'')} · ${by}<div style="color:var(--i2);margin-top:3px">${esc(d.status)}</div></div><button class="btn btn-sec btn-sm" onclick="undo('${key}')">Undo</button>`;
  if(d.status!=='Waiting' && typeof nextItem==='function') decide += `<button class="btn btn-primary btn-sm" style="width:100%;justify-content:center;margin-top:12px" onclick="nextItem()">Next to review →</button>`;
  html += panel('6 · Your decision', statusTag(d.status), decide);
  // Versions and history
  if(vs.length>1) html += panel('Versions', `<span style="font-size:10.5px;color:var(--i3)">${vs.length}</span>`, vs.slice().reverse().map(v=>`<details style="padding:5px 0;border-bottom:1px solid var(--s75);font-size:11.5px"><summary style="cursor:pointer"><b style="color:var(--i1)">v${v.v}</b> <span style="color:var(--i2)">${esc(v.why)}</span> <span style="color:var(--i3)">· ${esc(v.by)} · ${timeOf(v.at)}</span></summary><pre style="white-space:pre-wrap;font-family:var(--fb);font-size:11.5px;color:var(--i2);margin:6px 0 0;background:var(--s50);padding:8px;border-radius:6px">${esc(DemandAIDraftText(v.draft))}</pre></details>`).join(''));
  const hist = RUN.saved.log.filter(l=>l.key===key);
  if(hist.length) html += `<div class="panel"><div class="panel-hdr"><span class="panel-ttl">History</span><span style="font-size:10.5px;color:var(--i3)">${hist.length}</span></div><div class="panel-body" style="padding:0">
    ${hist.map(l=>`<div style="padding:8px 14px;border-bottom:1px solid var(--border);font-size:11.5px"><b style="color:var(--i1)">${esc(l.decision)}</b> <span style="color:var(--i3)">· ${esc(l.who)} · ${fmtDate(l.at)} ${timeOf(l.at)}</span>${l.note?`<div style="color:var(--i2);margin-top:2px">${esc(l.note)}</div>`:''}</div>`).join('')}
  </div></div>`;
  const body = document.getElementById('detBody'), top = keepTimer ? body.scrollTop : 0;
  body.innerHTML = html; body.scrollTop = top;
  const dr = document.getElementById('detailDrawer'); dr.style.width = '500px'; dr.classList.add('open');
}
function DemandAIDraftText(x){
  if(x.channel==='Email') return `Subject: ${x.subject}\n\n${x.body}`;
  if(x.channel==='LinkedIn') return `Note: ${x.note}\n\nMessage: ${x.message}`;
  const s = x.script; return [x.task, s && `Opener: ${s.opener}`, s && `Questions: ${s.questions.join(' / ')}`, s && `Objection: ${s.objection} → ${s.response}`, s && `Ask: ${s.ask}`].filter(Boolean).join('\n');
}

