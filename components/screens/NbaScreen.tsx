'use client';

/* Micro-segments & Next Best Action — port of legacy/12-nba.html.
   The original kept its state in page globals (drillSeg, searchQ, selectedId, selectedIds, NBA_QUEUE …) and re-rendered
   parts of the page with innerHTML at specific moments. This port keeps the same model in a ref (reset on every mount,
   as a page load did) and re-renders on demand; the "nonce" counters mark the moments the original rebuilt a block of
   DOM (which reset checkboxes, open menus, hover styles and edit fields). */
import React, { useEffect, useLayoutEffect, useReducer, useRef, type MouseEvent } from 'react';
import { sx } from '@/lib/sx';
import { showToast, initials, avColor } from '@/lib/ui';
import {
  NBA_QUEUE, NEW_SEGMENTS, ROUTE_LBL, ROUTE_CLS, CONF_LBL, CONF_CLS, OUTCOME_OPTIONS,
  type NbaItem,
} from '@/lib/nba/data';

interface Detail {
  id: string;
  nonce: number;
  runnerUpShown: boolean;   // revealRunnerUp() replaced #actionPanelBody
  editing: boolean;         // editMessage() replaced #msgView / #msgActions
  editNonce: number;        // each Edit click rebuilt the fields (typed text discarded)
  outcomePicker: boolean;   // reportOutcome() replaced the outcome/meeting panel body
}

interface Stats { total: number; auto: number; review: number; hold: number; meetings: number }

interface Model {
  queue: NbaItem[];
  newSegments: string[];
  drillSeg: string | null;
  searchQ: string;
  selectedId: string | null;
  selectedIds: Set<string>;
  listNonce: number;
  gridNonce: number;
  tabCnt: string;
  bulkShown: boolean;
  bulkCount: number;
  openDD: string | null;
  drawerOpen: boolean;
  detail: Detail | null;   // null = the empty drawer ("Select an account")
  stats: Stats;
}

function computeStats(q: NbaItem[]): Stats {
  return {
    total: q.length,
    auto: q.filter(l => l.routed === 'auto').length,
    review: q.filter(l => l.routed === 'review').length,
    hold: q.filter(l => l.runnerUp).length,
    meetings: q.filter(l => l.meetingBooked).length,
  };
}

function initModel(): Model {
  const queue = JSON.parse(JSON.stringify(NBA_QUEUE)) as NbaItem[];
  return {
    queue, newSegments: NEW_SEGMENTS.slice(),
    drillSeg: null, searchQ: '', selectedId: null, selectedIds: new Set(),
    listNonce: 0, gridNonce: 0, tabCnt: '—', bulkShown: false, bulkCount: 0,
    openDD: null, drawerOpen: false, detail: null, stats: computeStats(queue),
  };
}

const ROW_COLS = 'grid-template-columns:28px minmax(160px,2.5fr) 130px 110px 1fr 32px;';
const EDIT_SVG = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
const BACK_SVG = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>;

export function NbaScreen() {
  const ref = useRef<Model | null>(null);
  if (ref.current === null) ref.current = initModel();
  const m = ref.current;
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const editSubjRef = useRef<HTMLInputElement>(null);
  const editBodyRef = useRef<HTMLTextAreaElement>(null);
  const editDmNoteRef = useRef<HTMLTextAreaElement>(null);
  const editDmMsgRef = useRef<HTMLTextAreaElement>(null);
  const booted = useRef(false);

  const find = (id: string) => m.queue.find(x => x.id === id);

  function segmentList() {
    const map: Record<string, NbaItem[]> = {};
    m.queue.forEach(l => { (map[l.action] = map[l.action] || []).push(l); });
    return Object.entries(map).map(([name, accts]) => ({ name, accounts: accts, isNew: m.newSegments.includes(name) }))
      .sort((a, b) => b.accounts.length - a.accounts.length);
  }
  function filteredList() {
    let list = m.queue.filter(l => l.action === m.drillSeg);
    if (m.searchQ) list = list.filter(l => l.name.toLowerCase().includes(m.searchQ) || l.co.toLowerCase().includes(m.searchQ));
    return list;
  }
  function renderList() {
    m.listNonce++;
    m.openDD = null; // the rows (and their menus) were rebuilt
    m.tabCnt = String(filteredList().length);
    rerender();
  }
  function renderEmptyDrawer() { m.detail = null; m.drawerOpen = false; }
  function showSegments() {
    m.drillSeg = null; m.selectedId = null; m.searchQ = ''; m.selectedIds.clear();
    m.gridNonce++;
    renderEmptyDrawer();
    rerender();
  }
  function openSegment(name: string) {
    m.drillSeg = name; m.selectedId = null; m.searchQ = ''; m.selectedIds.clear();
    renderList();
    renderEmptyDrawer();
  }
  function filterList(q: string) { m.searchQ = q.toLowerCase(); renderList(); }

  function toggleRowSelect(id: string, el: HTMLInputElement) { if (el.checked) m.selectedIds.add(id); else m.selectedIds.delete(id); updateBulkBar(); }
  function toggleSelectAll(el: HTMLInputElement) {
    const list = filteredList();
    if (el.checked) list.forEach(l => m.selectedIds.add(l.id));
    else list.forEach(l => m.selectedIds.delete(l.id));
    renderList(); updateBulkBar();
  }
  function clearSelection() { m.selectedIds.clear(); renderList(); updateBulkBar(); }
  function updateBulkBar() {
    const n = m.selectedIds.size;
    m.bulkShown = n > 0; m.bulkCount = n;
    rerender();
  }
  function bulkSend() {
    const ids = Array.from(m.selectedIds).filter(id => { const l = find(id); return l && l.routed !== 'onhold'; });
    if (!ids.length) { showToast('Everything selected is on hold — nothing sendable'); return; }
    showToast(ids.length + ' message' + (ids.length > 1 ? 's' : '') + ' sent');
    clearSelection();
  }

  function toggleDD(id: string) {
    m.openDD = m.openDD === id ? null : id;
    rerender();
  }
  function closeDD(id: string) { if (m.openDD === id) { m.openDD = null; rerender(); } }

  function selectRow(id: string) {
    m.selectedId = id; renderList();
    m.detail = { id, nonce: (m.detail?.nonce ?? 0) + 1, runnerUpShown: false, editing: false, editNonce: 0, outcomePicker: false };
    m.drawerOpen = true;
    rerender();
  }
  function setDetail(patch: Partial<Detail>) { if (m.detail) { m.detail = { ...m.detail, ...patch }; rerender(); } }
  function revealRunnerUp(id: string) {
    const l = find(id)!;
    if (!l.runnerUp) return;
    setDetail({ runnerUpShown: true });
  }
  function swapToRunnerUp(id: string) {
    const l = find(id)!;
    if (!l.runnerUp) return;
    const newAction = l.runnerUp.action;
    showToast('Swapped to "' + newAction + '" — logged as a manual swap');
    l.chosenAction = newAction;
    l.runnerUp = null;
    selectRow(id);
  }
  function jumpToMeetingsBooked() {
    const booked = m.queue.find(l => l.meetingBooked);
    if (!booked) { showToast('No meetings booked yet — mark one from an account’s drawer'); return; }
    openSegment(booked.action);
    setTimeout(() => selectRow(booked.id), 100);
  }
  function markOutcome(_id: string, outcome: string) {
    showToast(outcome === 'called' ? 'Marked as called — logged to the outcome record' : 'Marked as sent — logged to the outcome record');
  }
  function reportOutcome() { setDetail({ outcomePicker: true }); }
  function confirmOutcome(id: string, outcome: string) {
    const l = find(id)!;
    l.outcome = outcome;
    l.outcomeReportedBy = 'Pavan Kumar';
    if (outcome === 'meeting-booked') {
      l.meetingBooked = true;
      l.meetingPrep = {
        opener: `Thanks for making the time — I’ll keep this focused given your schedule.`,
        questions: ['What’s prompting the timing on this now?', 'Who else would need to be involved in a decision?', 'What would make this an easy yes vs. a hard no?'],
        objection: `"We're not ready to move on anything yet." → This conversation isn't a commitment — it's context-gathering so that when you are ready, it's not a cold start.`,
        ask: 'Agree a concrete next step before the call ends — a technical session, a proposal, or a specific follow-up date.',
      };
      showToast('Outcome reported: Meeting booked — prep script generated, logged to B1');
    } else {
      l.meetingBooked = false;
      l.meetingPrep = null;
      showToast('Outcome reported: ' + OUTCOME_OPTIONS.find(o => o.v === outcome)!.label + ' — logged to B1');
    }
    selectRow(id);
  }
  function editMessage() { if (m.detail) setDetail({ editing: true, editNonce: m.detail.editNonce + 1 }); }
  function saveMessage(id: string) {
    const l = find(id)!;
    if (l.channel === 'DM') {
      l.dmNote = editDmNoteRef.current!.value;
      l.dmMessage = editDmMsgRef.current!.value;
    } else {
      l.emailSubj = editSubjRef.current!.value;
      l.email = editBodyRef.current!.value;
    }
    l.wasEdited = true;
    showToast('Draft updated');
    selectRow(id);
  }
  function closeDrawer() { m.drawerOpen = false; rerender(); }

  // renderList() set the "select all" box from the current list each time it rebuilt the rows.
  const listNonce = m.listNonce;
  useLayoutEffect(() => {
    if (listNonce === 0 || !selectAllRef.current) return;
    const list = filteredList();
    selectAllRef.current.checked = list.length > 0 && list.every(l => m.selectedIds.has(l.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listNonce]);

  // toggleDD: a click anywhere outside the open menu closes it (listener added on the next tick, as the original did).
  const openDD = m.openDD;
  useEffect(() => {
    if (!openDD) return;
    const c = (e: globalThis.MouseEvent) => {
      // React's own listener sits on document too (Next hydrates the whole document), so a React stopPropagation()
      // (the row's .dd and checkbox wrappers) does not keep this listener from running; the original never saw such clicks.
      if (e.cancelBubble) return;
      const el = document.getElementById(openDD);
      if (!el || !el.contains(e.target as Node)) {
        if (ref.current!.openDD === openDD) { ref.current!.openDD = null; rerender(); }
        document.removeEventListener('click', c);
      }
    };
    const t = setTimeout(() => document.addEventListener('click', c), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', c); };
  }, [openDD]);

  // Load: prospects sent from Scoring join the queue, then the URL hand-offs (from=scoring, openAccount).
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    let items: NbaItem[] = []; try { items = JSON.parse(localStorage.getItem('demandai_nba_v1') || '[]'); } catch (e) {}
    items.slice().reverse().forEach(it => {
      if (!m.queue.some(l => l.id === it.id)) m.queue.unshift(it);
      if (!m.newSegments.includes(it.action) && !['Modernisation', 'Project', 'Leadership', 'Regulation', 'Engagement'].includes(it.action)) m.newSegments.push(it.action);
    });
    showSegments();
    m.stats = computeStats(m.queue);
    rerender();

    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'scoring') {
      const ids = (params.get('ids') || '').split(',').filter(Boolean);
      const matched = m.queue.filter(l => ids.includes(l.id));
      if (matched.length) {
        showToast(matched.length + ' account' + (matched.length > 1 ? 's' : '') + ' sent from Scoring');
        openSegment(matched[0].action);
        setTimeout(() => selectRow(matched[0].id), 150);
      }
    }
    const openId = params.get('openAccount');
    if (openId) {
      const l = find(openId);
      if (l) {
        openSegment(l.action);
        setTimeout(() => {
          selectRow(l.id);
          if (l.sentDaysAgo && !l.outcome) {
            setTimeout(() => {
              // document.getElementById('reportOutcomeBtn')?.click() — the button exists only in the plain outcome panel.
              const d = m.detail; if (!d || d.outcomePicker) return;
              const shown = find(d.id)!;
              if (shown.meetingBooked && shown.meetingPrep) return;
              reportOutcome();
            }, 200);
          }
        }, 150);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── render ── */
  const drilled = m.drillSeg !== null;
  const list = drilled ? filteredList() : [];
  const segs = segmentList();
  const det = m.detail ? find(m.detail.id)! : null;

  const hoverOn = (e: MouseEvent<HTMLDivElement>) => { e.currentTarget.style.boxShadow = 'var(--sh)'; };
  const hoverOff = (e: MouseEvent<HTMLDivElement>) => { e.currentTarget.style.boxShadow = 'none'; };

  return (
    <>
      <main className="main">
        <div className="topbar">
          <div className="topbar-l">
            <span className="tb-title">Next Best Action</span>
            <span className="tb-badge badge-live"><span className="badge-dot"></span>Live · routing engine</span>
          </div>
          <div className="topbar-r">
          </div>
        </div>

        <div className="ftabs">
          <div className="ftab active">All accounts <span className="ftab-cnt" id="tabCnt">{m.tabCnt}</span></div>
        </div>

        <div className="canvas" id="canvas">

          <div className="stats">
            <div className="stat"><div className="stat-lbl">Leads to review</div><div className="stat-val sv1" id="statTotal">{m.stats.total}</div><div className="stat-sub">total in queue</div></div>
            <div className="stat"><div className="stat-lbl">Auto-routed</div><div className="stat-val sv4" id="statAuto">{m.stats.auto}</div><div className="stat-sub">proven pattern</div></div>
            <div className="stat"><div className="stat-lbl">Needs review</div><div className="stat-val sv3" id="statReview">{m.stats.review}</div><div className="stat-sub">first attempt</div></div>
            <div className="stat"><div className="stat-lbl">Runner-up available</div><div className="stat-val sv2" id="statHold">{m.stats.hold}</div><div className="stat-sub">an alternative action exists</div></div>
            <div className="stat" style={sx('cursor:pointer')} onClick={jumpToMeetingsBooked} title="Click to open"><div className="stat-lbl">🎉 Meetings booked</div><div className="stat-val" style={sx('color:var(--pos)')} id="statMeetings">{m.stats.meetings}</div><div className="stat-sub">prep script ready — click</div></div>
          </div>

          <div id="segmentGrid" style={drilled ? sx('display:none;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:0') : sx('display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:0')}>
            {segs.map(s => {
              const autoN = s.accounts.filter(a => a.routed === 'auto').length;
              const holdN = s.accounts.filter(a => a.routed === 'onhold').length;
              const meetN = s.accounts.filter(a => a.meetingBooked).length;
              return (
                <div key={m.gridNonce + '-' + s.name} className="panel" style={sx('cursor:pointer;transition:box-shadow .12s')} onClick={() => openSegment(s.name)} onMouseOver={hoverOn} onMouseOut={hoverOff}>
                  <div className="panel-body">
                    <div style={sx('display:flex;align-items:center;justify-content:space-between;margin-bottom:8px')}>
                      <span style={sx('font-family:var(--fd);font-size:14px;font-weight:700;color:var(--i1)')}>{s.name}</span>
                      {s.isNew ? <span style={sx('width:6px;height:6px;border-radius:50%;background:var(--brand);flex-shrink:0')} title="New segment"></span> : null}
                    </div>
                    <div style={sx('font-family:var(--fd);font-size:26px;font-weight:700;color:var(--i1);letter-spacing:-.02em;margin-bottom:6px')}>{s.accounts.length}</div>
                    <div style={sx('font-size:11px;color:var(--i3)')}>{`${autoN} auto-routed${holdN ? ` · ${holdN} on hold` : ''}`}</div>
                    {meetN ? <div style={sx('margin-top:8px;font-size:10.5px;color:var(--pos);font-weight:600')}>{`🎉 ${meetN} meeting${meetN > 1 ? 's' : ''} booked`}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="score-list" id="accountListWrap" style={sx(drilled ? 'display:block' : 'display:none')}>
            <div className="sl-toolbar" id="bulkBar" style={sx(m.bulkShown ? 'display:flex;background:var(--brand-lt);' : 'display:none;background:var(--brand-lt);')}>
              <div style={sx('display:flex;align-items:center;gap:10px;flex:1')}>
                <span style={sx('font-size:12.5px;font-weight:600;color:var(--brand-dk)')}><span id="bulkCount">{m.bulkCount}</span> selected</span>

                <button className="btn btn-primary btn-sm" onClick={bulkSend}>Send selected</button>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear</button>
            </div>
            <div className="sl-toolbar" id="normalBar" style={m.bulkShown ? sx('display:none') : undefined}>
              <div className="crumb-link" onClick={showSegments} style={sx('cursor:pointer;display:flex;align-items:center;gap:5px;font-size:12px;color:var(--i3);margin-right:10px')}>
                {BACK_SVG}
                {m.drillSeg !== null
                  ? <>All segments <span style={sx('color:var(--i1);font-weight:600;margin-left:4px')}>{`/ ${m.drillSeg}`}</span></>
                  : 'All segments'}
              </div>
              <div className="sl-srch">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={sx('color:var(--i3);flex-shrink:0')}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input type="text" placeholder="Search accounts…" onInput={e => filterList(e.currentTarget.value)} />
              </div>
            </div>
            <div className="sl-head" style={sx(ROW_COLS)}>
              <div className="sl-th"><input type="checkbox" id="selectAllBox" ref={selectAllRef} onClick={e => toggleSelectAll(e.currentTarget)} style={sx('cursor:pointer')} /></div>
              <div className="sl-th">Account</div>
              <div className="sl-th">Segment</div>
              <div className="sl-th">Routing</div>
              <div className="sl-th">Signal</div>
              <div className="sl-th"></div>
            </div>
            <div id="scoreListBody">
              {list.length ? list.map(l => {
                const menuId = 'rowmenu-' + l.id;
                return (
                  <div key={m.listNonce + '-' + l.id} className={`sl-row ${l.id === m.selectedId ? 'selected' : ''}`} style={sx(ROW_COLS)}>
                    <div onClick={e => e.stopPropagation()}><input type="checkbox" defaultChecked={m.selectedIds.has(l.id)} onChange={e => toggleRowSelect(l.id, e.currentTarget)} style={sx('cursor:pointer')} /></div>
                    <div className="co-cell" onClick={() => selectRow(l.id)} style={sx('cursor:pointer')}><div className="co-av" style={{ background: avColor(l.id) }}>{initials(l.name)}</div><div><div className="co-nm">{coNm(l)}</div><div className="co-ind">{l.co}</div></div></div>
                    <div onClick={() => selectRow(l.id)} style={sx('font-size:11px;color:var(--i2);cursor:pointer')}>{l.action}</div>
                    <div onClick={() => selectRow(l.id)} style={sx('cursor:pointer')}><span className={`sc ${ROUTE_CLS[l.routed]}`}>{String(ROUTE_LBL[l.routed])}</span></div>
                    <div onClick={() => selectRow(l.id)} style={sx('font-size:11px;color:var(--i3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer')}>{l.signal}</div>
                    <div className="dd" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" style={sx('padding:0;width:28px;justify-content:center')} onClick={() => toggleDD(menuId)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                      </button>
                      <div className={m.openDD === menuId ? 'ddm open' : 'ddm'} id={menuId} style={sx('right:0;left:auto')}>
                        <div className="ddi" onClick={() => { selectRow(l.id); closeDD(menuId); }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/></svg>{`View ${l.channel === 'Call' ? 'call opener' : l.channel === 'DM' ? 'DM' : 'message'}`}</div>
                        {/* The original's onclick here embedded JSON (with double quotes) inside a double-quoted attribute, so the
                            handler never compiled: clicking did nothing (no copy, no toast, menu stays open). Kept as a no-op. */}
                        <div className="ddi"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>{`Copy ${l.channel === 'Call' ? 'opener' : l.channel === 'DM' ? 'DM' : 'email'}`}</div>
                        <div className="dd-sep"></div>
                        <div className="ddi" onClick={() => { showToast('Marked as seen — logged to the outcome record'); closeDD(menuId); }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Mark as seen</div>
                      </div>
                    </div>
                  </div>
                );
              }) : <div style={sx('padding:40px;text-align:center;color:var(--i3);font-size:12.5px')}>No accounts match.</div>}
            </div>
          </div>

        </div>{/* /canvas */}
      </main>

      {/* Detail drawer */}
      <div className={m.drawerOpen ? 'detail-drawer open' : 'detail-drawer'} id="detailDrawer" style={sx('width:420px')}>
        <div className="drawer-hdr">
          <div>
            <div className="drawer-title" id="detTitle">{det ? det.name : 'Select an account'}</div>
            <div className="drawer-sub" id="detSub">{det ? String(det.title) + ' · ' + det.co : '—'}</div>
          </div>
          <div className="drawer-close" onClick={closeDrawer}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
        </div>
        <div className="drawer-body" id="detBody" key={m.detail ? 'd' + m.detail.nonce : 'empty'}>
          {det && m.detail ? (
            <DetailBody
              l={det} d={m.detail}
              refs={{ editSubjRef, editBodyRef, editDmNoteRef, editDmMsgRef }}
              on={{ revealRunnerUp, swapToRunnerUp, markOutcome, reportOutcome, confirmOutcome, editMessage, saveMessage, selectRow }}
            />
          ) : (
            <div className="detail-empty" style={sx('padding:40px 0')}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--i4)" strokeWidth="1.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              <div style={sx('font-size:11.5px;color:var(--i4);line-height:1.5;text-align:center')}>Click any row<br />to see the drafted message</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** The account name plus its inline badges. The original concatenated `name + ' <span…>' + ' <span…>'…`, so the
    name and the first space share one text node; mirrored exactly because text shaping follows text nodes. */
function coNm(l: NbaItem): React.ReactNode[] {
  const badges: React.ReactNode[] = [];
  if (l.isNew) badges.push(<span key="n" style={sx('font-size:8.5px;font-weight:800;color:var(--brand-dk);background:var(--brand-lt);padding:1px 6px;border-radius:999px')}>NEW</span>);
  if (l.meetingBooked) badges.push(<span key="m" style={sx('font-size:8.5px;font-weight:800;color:var(--pos);background:var(--pos-lt);padding:1px 6px;border-radius:999px')}>🎉 MEETING BOOKED</span>);
  if (l.channel === 'Call') badges.push(<span key="c" style={sx('font-size:8.5px;font-weight:700;color:var(--i3);background:var(--s75);padding:1px 6px;border-radius:999px')}>☎ CALL</span>);
  if (l.sentDaysAgo && !l.outcome) badges.push(<span key="t" style={sx(`font-size:8.5px;font-weight:800;color:${l.sentDaysAgo >= 7 ? 'var(--neg)' : 'var(--warn)'};background:${l.sentDaysAgo >= 7 ? 'var(--neg-lt)' : 'var(--warn-lt)'};padding:1px 6px;border-radius:999px`)}>{`⏱ ${l.sentDaysAgo}D, NO OUTCOME`}</span>);
  const out: React.ReactNode[] = [badges.length ? l.name + ' ' : l.name];
  badges.forEach((b, i) => { if (i > 0) out.push(' '); out.push(b); });
  return out;
}

interface DetailRefs {
  editSubjRef: React.RefObject<HTMLInputElement | null>;
  editBodyRef: React.RefObject<HTMLTextAreaElement | null>;
  editDmNoteRef: React.RefObject<HTMLTextAreaElement | null>;
  editDmMsgRef: React.RefObject<HTMLTextAreaElement | null>;
}
interface DetailHandlers {
  revealRunnerUp(id: string): void;
  swapToRunnerUp(id: string): void;
  markOutcome(id: string, outcome: string): void;
  reportOutcome(): void;
  confirmOutcome(id: string, outcome: string): void;
  editMessage(): void;
  saveMessage(id: string): void;
  selectRow(id: string): void;
}

/** What selectRow() wrote into #detBody, plus the in-place replacements (runner-up, edit, outcome picker). */
function DetailBody({ l, d, refs, on }: { l: NbaItem; d: Detail; refs: DetailRefs; on: DetailHandlers }) {
  const badges: React.ReactNode[] = [];
  if (l.caughtByWatch) badges.push(<span key="w" className="delta delta-flat">Caught live, not batched</span>);
  if (l.selfCorrected) badges.push(<span key="s" className="delta delta-flat">Auto-adjusted from what didn’t work</span>);
  if (l.existingCustomer) badges.push(<span key="e" className="delta delta-flat">Existing customer — expansion</span>);
  if (l.originatedFrom === 'teams') badges.push(<span key="t" className="delta delta-flat">Inbound via Teams</span>);

  const focusOn = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.currentTarget.style.borderColor = 'var(--brand-mid)'; };
  const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.currentTarget.style.borderColor = 'var(--bdk)'; };

  const outcomePicker = (
    <>
      <div style={sx('font-size:11.5px;color:var(--i3);margin-bottom:10px')}>{`What actually happened with ${l.name}? This is reported by whoever's working the account — nothing here is tracked live.`}</div>
      <div style={sx('display:flex;flex-direction:column;gap:6px')}>
        {OUTCOME_OPTIONS.map(o => <button key={o.v} className={`btn ${l.outcome === o.v ? 'btn-primary' : 'btn-sec'} btn-sm`} style={sx('justify-content:flex-start')} onClick={() => on.confirmOutcome(l.id, o.v)}>{o.label}</button>)}
      </div>
    </>
  );

  const editBtn = (
    <button className="btn btn-ghost btn-sm" style={sx('padding:0 6px;gap:4px')} onClick={on.editMessage}>
      {EDIT_SVG}
      Edit
    </button>
  );
  const editActions = (
    <>
      <button className="btn btn-ghost btn-sm" style={sx('flex:1;justify-content:center')} onClick={() => on.selectRow(l.id)}>Cancel</button>
      <button className="btn btn-primary btn-sm" style={sx('flex:1;justify-content:center')} onClick={() => on.saveMessage(l.id)}>Save changes</button>
    </>
  );
  // The Copy buttons' onclick in the original never compiled (JSON with double quotes inside a double-quoted
  // attribute), so clicking them did nothing. Kept as buttons without a handler.
  let channelPanel: React.ReactNode;
  if (l.channel === 'Call') {
    channelPanel = <>
      <div className="panel" id="msgPanel">
        <div className="panel-hdr"><span className="panel-ttl">Cold-call opener</span></div>
        <div className="panel-body" id="msgView">
          <div style={sx('font-size:11px;color:var(--i3);margin-bottom:8px;font-style:italic')}>Short, on purpose — you don’t know yet if they’ll pick up. Discovery questions and objection-handling come later, once a meeting is actually booked.</div>
          <div style={sx('font-size:12px;color:var(--i2);line-height:1.7;white-space:pre-line')}>{String(l.callOpener)}</div>
        </div>
      </div>
      <div style={sx('display:flex;gap:8px;margin-top:14px')}>
        <button className="btn btn-sec btn-sm" style={sx('flex:1;justify-content:center')}>Copy</button>
        <button className="btn btn-primary btn-sm" style={sx('flex:1;justify-content:center')} disabled={l.routed === 'onhold'} onClick={() => on.markOutcome(l.id, 'called')}>Mark as called</button>
      </div>
    </>;
  } else if (l.channel === 'DM') {
    channelPanel = <>
      <div className="panel" id="msgPanel">
        <div className="panel-hdr">
          <span className="panel-ttl">LinkedIn DM</span>
          {editBtn}
        </div>
        <div className="panel-body" id="msgView" key={d.editNonce}>
          {d.editing ? <>
            <div style={sx('font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--i3);margin-bottom:4px')}>Connection note</div>
            <textarea id="editDmNote" ref={refs.editDmNoteRef} style={sx('width:100%;min-height:60px;border:1px solid var(--bdk);border-radius:var(--rsm);padding:8px 10px;font-size:12px;color:var(--i1);margin-bottom:10px;font-family:var(--fb);resize:vertical;outline:none')} defaultValue={String(l.dmNote)} />
            <div style={sx('font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--i3);margin-bottom:4px')}>Message</div>
            <textarea id="editDmMsg" ref={refs.editDmMsgRef} style={sx('width:100%;min-height:100px;border:1px solid var(--bdk);border-radius:var(--rsm);padding:8px 10px;font-size:12px;color:var(--i1);font-family:var(--fb);resize:vertical;outline:none')} defaultValue={String(l.dmMessage)} />
            <div style={sx('font-size:10.5px;color:var(--warn);margin-top:6px;line-height:1.5')}>Editing means this won’t count toward the segment’s pattern registration.</div>
          </> : <>
            <div style={sx('font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--i3);margin-bottom:4px')}>Connection note</div>
            <div style={sx('font-size:12px;color:var(--i2);line-height:1.6;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--s75)')}>{String(l.dmNote)}</div>
            <div style={sx('font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--i3);margin-bottom:4px')}>Message, after acceptance</div>
            <div style={sx('font-size:12px;color:var(--i2);line-height:1.7')}>{String(l.dmMessage)}</div>
          </>}
        </div>
      </div>
      <div style={sx('display:flex;gap:8px;margin-top:14px')} id="msgActions">
        {d.editing ? editActions : <>
          <button className="btn btn-sec btn-sm" style={sx('flex:1;justify-content:center')}>Copy</button>
          <button className="btn btn-primary btn-sm" style={sx('flex:1;justify-content:center')} disabled={l.routed === 'onhold'} onClick={() => on.markOutcome(l.id, 'sent')}>Mark as sent</button>
        </>}
      </div>
    </>;
  } else {
    channelPanel = <>
      <div className="panel" id="msgPanel">
        <div className="panel-hdr">
          <span className="panel-ttl">Email</span>
          {editBtn}
        </div>
        <div className="panel-body" id="msgView" key={d.editNonce}>
          {d.editing ? <>
            <input id="editSubj" ref={refs.editSubjRef} defaultValue={String(l.emailSubj)} style={sx('width:100%;border:1px solid var(--bdk);border-radius:var(--rsm);padding:8px 10px;font-size:12.5px;font-weight:700;color:var(--i1);margin-bottom:8px;font-family:var(--fb);outline:none')} onFocus={focusOn} onBlur={focusOff} />
            <textarea id="editBody" ref={refs.editBodyRef} style={sx('width:100%;min-height:180px;border:1px solid var(--bdk);border-radius:var(--rsm);padding:10px;font-size:12px;color:var(--i2);line-height:1.7;font-family:var(--fb);resize:vertical;outline:none')} onFocus={focusOn} onBlur={focusOff} defaultValue={String(l.email)} />
            <div style={sx('font-size:10.5px;color:var(--warn);margin-top:6px;line-height:1.5')}>Editing means this won’t count toward the segment’s pattern registration (B2 needs 5 approvals <i>without</i> edits) — still usable, just doesn’t help the cache learn.</div>
          </> : <>
            <div style={sx('font-size:12.5px;font-weight:700;color:var(--i1);margin-bottom:6px')}>{String(l.emailSubj)}</div>
            <div style={sx('font-size:12px;color:var(--i2);line-height:1.7;white-space:pre-line;max-height:220px;overflow-y:auto')}>{String(l.email)}</div>
          </>}
        </div>
      </div>
      <div style={sx('display:flex;gap:8px;margin-top:14px')} id="msgActions">
        {d.editing ? editActions : <>
          <button className="btn btn-sec btn-sm" style={sx('flex:1;justify-content:center')}>Copy</button>
          <button className="btn btn-primary btn-sm" style={sx('flex:1;justify-content:center')} disabled={l.routed === 'onhold'} onClick={() => on.markOutcome(l.id, 'sent')}>Mark as sent</button>
        </>}
      </div>
    </>;
  }

  let meetingSection: React.ReactNode;
  if (l.meetingBooked && l.meetingPrep) {
    const mp = l.meetingPrep;
    meetingSection = (
      <div className="panel" style={sx('margin-top:12px;border-color:var(--pos)')}>
        <div className="panel-hdr"><span className="panel-ttl">🎉 Meeting booked — prep script</span><button className="btn btn-ghost btn-sm" onClick={on.reportOutcome}>Change outcome</button></div>
        <div className="panel-body" style={sx('font-size:12px;color:var(--i2);line-height:1.7')}>
          {d.outcomePicker ? outcomePicker : <>
            <div style={sx('margin-bottom:10px')}><b style={sx('color:var(--i1)')}>Opener:</b>{' ' + mp.opener}</div>
            <div style={sx('margin-bottom:10px')}><b style={sx('color:var(--i1)')}>Discovery questions:</b>
              <ul style={sx('margin:6px 0 0;padding-left:18px')}>{mp.questions.map((q, i) => <li key={i} style={sx('margin-bottom:4px')}>{q}</li>)}</ul>
            </div>
            <div style={sx('margin-bottom:10px')}><b style={sx('color:var(--i1)')}>Objection to pre-empt:</b>{' ' + mp.objection}</div>
            <div><b style={sx('color:var(--i1)')}>The ask:</b>{' ' + mp.ask}</div>
            <div style={sx('margin-top:10px;font-size:10.5px;color:var(--i4);font-style:italic')}>{`Generated because ${l.outcomeReportedBy || 'you'} reported this outcome as "Meeting booked" — there's no live tracking in this pilot, so nothing is inferred automatically.`}</div>
          </>}
        </div>
      </div>
    );
  } else {
    const currentLabel = l.outcome ? OUTCOME_OPTIONS.find(o => o.v === l.outcome)?.label : null;
    meetingSection = (
      <div className="panel" style={sx('margin-top:12px')}>
        <div className="panel-hdr"><span className="panel-ttl">Outcome</span></div>
        <div className="panel-body">
          {d.outcomePicker ? outcomePicker : <>
            {currentLabel
              ? <div style={sx('font-size:12px;color:var(--i2);margin-bottom:10px')}>Currently reported: <b style={sx('color:var(--i1)')}>{currentLabel}</b></div>
              : <div style={sx('font-size:11.5px;color:var(--i3);margin-bottom:10px;line-height:1.5')}>No CRM or calendar integration in this pilot — the system can't observe what happened after this was sent. Report it when you know.</div>}
            <button id="reportOutcomeBtn" className="btn btn-sec btn-sm" style={sx('width:100%;justify-content:center')} onClick={on.reportOutcome}>{currentLabel ? 'Update outcome' : 'Report outcome'}</button>
          </>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={sx('display:flex;align-items:center;gap:8px;margin-bottom:12px')}>
        <span className={`sc ${ROUTE_CLS[l.routed]}`}>{String(ROUTE_LBL[l.routed])}</span>
        <span className={`sc ${CONF_CLS[l.confidence]}`}>{String(CONF_LBL[l.confidence])}</span>
      </div>
      {badges.length ? <div style={sx('display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px')}>{badges}</div> : null}
      <div className="panel" style={sx('margin-bottom:12px')}>
        <div className="panel-hdr"><span className="panel-ttl">Why this account</span></div>
        <div className="panel-body" style={sx('font-size:12px;color:var(--i2);line-height:1.6')}>{l.signal}<div style={sx('margin-top:8px;font-size:10.5px;color:var(--i4)')}>{`Source: ${l.signalSrc} · Segment: ${l.action}`}</div></div>
      </div>
      <div className="panel" style={sx('margin-bottom:12px')} id="actionPanel">
        <div className="panel-hdr"><span className="panel-ttl">Next best action</span></div>
        <div className="panel-body" id="actionPanelBody">
          {d.runnerUpShown && l.runnerUp ? <>
            <div style={sx('display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--s75);opacity:.5')}>
              <span style={sx('font-size:14px;flex-shrink:0')}>✓</span>
              <div><div style={sx('font-size:12px;font-weight:700;color:var(--i1);text-decoration:line-through')}>{l.chosenAction}</div><div style={sx('font-size:11px;color:var(--i3);margin-top:2px')}>Originally chosen</div></div>
            </div>
            <div style={sx('display:flex;align-items:flex-start;gap:8px')}>
              <span style={sx('font-size:14px;flex-shrink:0;color:var(--brand)')}>→</span>
              <div><div style={sx('font-size:12px;font-weight:600;color:var(--i1)')}>{`${l.runnerUp.action} — runner-up`}</div><div style={sx('font-size:11px;color:var(--i3);margin-top:2px')}>{l.runnerUp.reason}</div></div>
            </div>
            <div style={sx('margin-top:10px')}><button className="btn btn-primary btn-sm" onClick={() => on.swapToRunnerUp(l.id)}>Swap to this action</button></div>
          </> : <>
            <div style={sx('display:flex;align-items:flex-start;gap:8px')}>
              <span style={sx('font-size:14px;flex-shrink:0')}>✓</span>
              <div><div style={sx('font-size:12px;font-weight:700;color:var(--i1)')}>{l.chosenAction}</div><div style={sx('font-size:11px;color:var(--i3);margin-top:2px')}>{l.runnerUp ? l.runnerUp.chosenReason : 'From the agreed action set for this segment.'}</div></div>
            </div>
            {l.runnerUp ? <div style={sx('margin-top:10px')}><button className="btn btn-ghost btn-sm" onClick={() => on.revealRunnerUp(l.id)}>Not the right action?</button></div> : null}
          </>}
        </div>
      </div>
      <div className="panel" style={sx('margin-bottom:12px')}>
        <div className="panel-hdr"><span className="panel-ttl">{`Channel: ${l.channel}`}</span></div>
        <div className="panel-body" style={sx('font-size:12px;color:var(--i2);line-height:1.6')}>{l.channelWhy}</div>
      </div>
      {channelPanel}
      {meetingSection}
    </>
  );
}
