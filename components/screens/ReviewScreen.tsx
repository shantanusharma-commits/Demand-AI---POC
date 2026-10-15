'use client';

// Port of legacy/14-review.html (everything after </nav>; the ROLE ENGINE lives in AppShell).
import { Fragment, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { sx } from '@/lib/sx';
import { avColor, initials, showToast } from '@/lib/ui';

/* ═══════════════ R-CODES ═══════════════ */
interface RCode {
  code: string; label: string; next: string;
  terminal?: boolean; offersRunnerUp?: boolean; regenerates?: boolean; needsComment?: boolean;
}
const R_CODES: RCode[] = [
  { code: 'R1', label: 'Wrong fit', next: 'The account is set aside for the pilot and logged against the rubric.', terminal: true },
  { code: 'R2', label: 'Signal not adequate', next: 'The signal is set aside and the account re-scored without it; if it drops a tier, it leaves the queue.' },
  { code: 'R3', label: 'Wrong company or site', next: 'The signal is detached and the entity match corrected.' },
  { code: 'R4', label: 'Already engaged', next: 'The engage-once rule applies; shown as a process-rule exclusion.', terminal: true },
  { code: 'R5', label: 'Not the right time', next: 'The account moves to the watch list.', terminal: true },
  { code: 'R6', label: 'Wrong action', next: 'The runner-up action is offered once, with its reason.', offersRunnerUp: true },
  { code: 'R7', label: 'Wrong persona or contact', next: 'The next contact in persona order is proposed.' },
  { code: 'R8', label: 'Wrong channel', next: 'The same action is proposed on the next allowed channel.' },
  { code: 'R9', label: 'Factual issue', next: 'The draft is regenerated with the issue named; same action.', regenerates: true },
  { code: 'R10', label: 'Tone or brand', next: 'The draft is regenerated with the note; same action.', regenerates: true },
  { code: 'R11', label: 'Length or format', next: 'The draft is regenerated to the note; same action.', regenerates: true },
  { code: 'R12', label: 'Other', next: 'A comment is required; nothing changes automatically.', needsComment: true, terminal: true },
];
const QUICK_TAGS = ['Accurate reasoning', 'Right timing', 'Right action', 'Ready to use', 'Saved research time'];
type ReasonKey = 'low-confidence' | 'compliance' | 'proceed-criteria' | 'user-opened';
const REASON_TAG_LBL: Record<ReasonKey, string> = { 'low-confidence': 'Low confidence', 'compliance': 'Compliance check', 'proceed-criteria': 'Segment too small', 'user-opened': 'Opened by you' };
const REASON_TAG_CLS: Record<ReasonKey, string> = { 'low-confidence': 'sc-m', 'compliance': 'sc-l', 'proceed-criteria': 'sc-m', 'user-opened': 'delta-flat' };

/* ═══════════════ DATA ═══════════════ */
interface ReviewException {
  id: string; name: string; title: string; co: string; tier: string;
  exceptionReason: ReasonKey; exceptionWhy: string; workDone: string; whyNow: string;
  segment: string; action: string; runnerUp: { action: string; reason: string } | null;
  channel: string; draftSubj: string; draftBody: string;
  alternativeUsed: boolean; alternativeNote: string | null;
}
interface AutoProceeded { id: string; name: string; co: string; action: string; when: string }
type SessionDecision =
  | { id: string; decision: 'accept'; tags: string[] }
  | { id: string; decision: 'edit'; weight: 'minor' | 'major'; newSubj: string; newBody: string }
  | { id: string; decision: 'reject'; code: string };

const initialExceptions = (): ReviewException[] => [
  { id: 'e1', name: 'Rebecca Lindqvist', title: 'Director of Automation', co: 'Ridgeline Utilities', tier: 'B',
    exceptionReason: 'low-confidence', exceptionWhy: 'No contact confirmed in the primary persona — only a secondary contact (Director of Automation, not Head of Instrumentation) is on file.',
    workDone: 'Considered 118 data points and 6 signals; 3 qualified; 2 contributed to the rank.',
    whyNow: 'A grid-reliability audit window opens in 70 days, and their current control system nears end of support next year.',
    segment: 'Regulation', action: 'Invite to a webinar or event', runnerUp: { action: 'Share a relevant case study or reference project', reason: 'Also fits the compliance-deadline trigger, with less time pressure to act on.' },
    channel: 'Email', draftSubj: 'A compliance date worth getting ahead of',
    draftBody: `Hi Rebecca,\n\nRidgeline's grid-reliability audit window opens in about ten weeks. I've put together a short one-pager on the actual dates and what typically needs to be true by each of them.\n\nBest,\nClient Team`,
    alternativeUsed: false, alternativeNote: null },
  { id: 'e2', name: 'Thomas Okafor', title: 'Head of Process Safety', co: 'Altair Petrochemicals', tier: 'B',
    exceptionReason: 'low-confidence', exceptionWhy: 'Weak evidence — a single usage-decline reading, not yet corroborated by a second signal.',
    workDone: 'Considered 94 data points and 4 signals; 2 qualified; 1 contributed to the rank.',
    whyNow: 'Their incumbent DCS platform is showing a usage-decline pattern — an early sign of reliability issues before they reach the plant floor.',
    segment: 'Modernisation', action: 'Offer a site assessment or health check', runnerUp: { action: 'Invite to a product demo or technical session', reason: 'A lighter first ask, given the evidence is still thin.' },
    channel: 'Email', draftSubj: 'A pattern we’re seeing on your incumbent platform',
    draftBody: `Hi Thomas,\n\nWe're seeing a usage-decline pattern on the DCS platform Altair currently runs. Given your process-safety mandate, that's usually worth a proactive look.\n\nBest,\nClient Team`,
    alternativeUsed: false, alternativeNote: null },
  { id: 'e3', name: 'Grace Adeyemi', title: 'Plant Manager', co: 'Vantage Oil & Gas', tier: 'C',
    exceptionReason: 'compliance', exceptionWhy: 'Draft references a recent OT incident at a nearby site — regulated/sensitive content requires compliance sign-off before it can go to a reviewer.',
    workDone: 'Considered 76 data points and 3 signals; 2 qualified; 2 contributed to the rank.',
    whyNow: 'A regional OT security incident last month is prompting several operators in the area to review their own exposure.',
    segment: 'Regulation', action: 'Invite to a webinar or event', runnerUp: null,
    channel: 'Email', draftSubj: 'A resilience conversation worth having',
    draftBody: `Hi Grace,\n\nGiven recent OT security activity in the region, a number of operators have been reviewing their own exposure. Happy to share a general resilience overview if useful.\n\nBest,\nClient Team`,
    alternativeUsed: false, alternativeNote: null },
  { id: 'e4', name: 'Nadia Kowalski', title: 'VP Engineering', co: 'Meadowbrook Power', tier: 'C',
    exceptionReason: 'proceed-criteria', exceptionWhy: 'Only 2 qualifying accounts in this segment (Leadership) — below the agreed minimum of 3 to proceed on its own.',
    workDone: 'Considered 61 data points and 3 signals; 2 qualified; 1 contributed to the rank.',
    whyNow: 'A new VP Engineering started two months ago — a common trigger for revisiting vendor relationships.',
    segment: 'Leadership', action: 'Introduction to a new leader in a buying role', runnerUp: { action: 'Invite to a product demo or technical session', reason: 'A slightly more direct ask, if the introduction alone feels too soft given the small segment size.' },
    channel: 'LinkedIn', draftSubj: 'Connection note + message',
    draftBody: `Connection note: "Congratulations on the new role at Meadowbrook."\n\nMessage after acceptance: Hi Nadia, congratulations on stepping into VP Engineering. Happy to share what a similar transition looked like for a peer of yours, if useful as you settle in.`,
    alternativeUsed: false, alternativeNote: null },
];
const AUTO_PROCEEDED: AutoProceeded[] = [
  { id: 'a1', name: 'Daniel Voss', co: 'Continental Polymer Works', action: 'Propose a migration or upgrade discussion', when: 'Sent this morning' },
  { id: 'a2', name: 'Karen Whitfield', co: 'Meridian Chemical Corp', action: 'Share a relevant case study or reference project', when: 'Sent yesterday' },
  { id: 'a3', name: 'Robert Achebe', co: 'Trident Refining', action: 'Introduction to a new leader in a buying role', when: 'Sent 2 days ago' },
];

const ROW_COLS = 'grid-template-columns:minmax(150px,2fr) 140px minmax(140px,1fr);';
const BTN_FLEX = 'flex:1;justify-content:center';

/* View: the split list, or the card for one item. `n` bumps on every renderCardFor so the card re-mounts
   (the original rebuilt #mainArea from scratch, which reset inputs and the decision area). */
type View = { kind: 'split' } | { kind: 'card'; id: string; n: number };
type Decision = 'bar' | 'accept' | 'edit';
/* The reject overlay: created on first open, then only hidden (display:none) — as the original did. */
type RejectModal = { stage: 'list'; id: string; n: number } | { stage: 'reason'; id: string; code: string; n: number };

export function ReviewScreen() {
  const [exceptions, setExceptions] = useState<ReviewException[]>(initialExceptions);
  const [closedIds, setClosedIds] = useState<Set<string>>(() => new Set());
  const [sessionDecisions, setSessionDecisions] = useState<SessionDecision[]>([]);
  const [view, setView] = useState<View>({ kind: 'split' });
  const [decision, setDecision] = useState<Decision>('bar');
  const [activeTags, setActiveTags] = useState<Set<string>>(() => new Set());
  const [reject, setReject] = useState<RejectModal | null>(null);
  const [rejectShown, setRejectShown] = useState(false);
  const cardCounter = useRef(0);
  const modalCounter = useRef(0);
  const editSubjRef = useRef<HTMLInputElement>(null);
  const editBodyRef = useRef<HTMLTextAreaElement>(null);
  const rejectCommentRef = useRef<HTMLTextAreaElement>(null);

  const queueOf = (list: ReviewException[], closed: Set<string>) => list.filter(e => !closed.has(e.id));
  const q = queueOf(exceptions, closedIds);

  // renderCardFor(id): falls back to the split view when the item is missing or closed.
  const renderCardFor = (id: string, list = exceptions, closed = closedIds) => {
    const e = list.find(x => x.id === id);
    if (!e || closed.has(id)) { setView({ kind: 'split' }); return; }
    cardCounter.current += 1;
    setView({ kind: 'card', id, n: cardCounter.current });
    setDecision('bar');
  };
  const renderSplit = () => setView({ kind: 'split' });
  const goNext = (list: ReviewException[], closed: Set<string>) => {
    const qq = queueOf(list, closed);
    if (qq.length) renderCardFor(qq[0].id, list, closed); else renderSplit();
  };

  const openItem = (id: string) => renderCardFor(id);
  const takeControl = (id: string) => {
    const a = AUTO_PROCEEDED.find(x => x.id === id)!;
    showToast('Pulled "' + a.name + '" back for your review');
    setExceptions(list => [...list, { id: 'user-' + a.id, name: a.name, title: '—', co: a.co, tier: 'B',
      exceptionReason: 'user-opened', exceptionWhy: 'You chose to take control of this item, which had already proceeded on its own.',
      workDone: 'Already sent — reopening for a second look.', whyNow: 'Originally sent automatically; no new evidence since.',
      segment: '—', action: a.action, runnerUp: null, channel: 'Email', draftSubj: a.action, draftBody: '(Original draft — already sent. Any change here creates a follow-up, not a recall.)',
      alternativeUsed: false, alternativeNote: null }]);
    renderSplit();
  };

  const renderDecisionBar = () => setDecision('bar');
  const startAccept = () => { setActiveTags(new Set()); setDecision('accept'); };
  const toggleTag = (t: string) => setActiveTags(s => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const confirmAccept = (id: string) => {
    const tags = QUICK_TAGS.filter(t => activeTags.has(t));
    const closed = new Set(closedIds); closed.add(id);
    setClosedIds(closed);
    setSessionDecisions(d => [...d, { id, decision: 'accept', tags }]);
    showToast('Accepted' + (tags.length ? ' — ' + tags.join(', ') : '') + ' — logged to B1');
    goNext(exceptions, closed);
  };

  const startEdit = () => setDecision('edit');
  const confirmEdit = (id: string, weight: 'minor' | 'major') => {
    const newSubj = editSubjRef.current!.value;
    const newBody = editBodyRef.current!.value;
    const closed = new Set(closedIds); closed.add(id);
    setClosedIds(closed);
    setSessionDecisions(d => [...d, { id, decision: 'edit', weight, newSubj, newBody }]);
    showToast((weight === 'minor' ? 'Minor' : 'Major') + ' edit saved — counts toward acceptance either way, logged to B1');
    goNext(exceptions, closed);
  };

  const closeRejectModal = () => setRejectShown(false);
  const startReject = (id: string) => {
    modalCounter.current += 1;
    setReject({ stage: 'list', id, n: modalCounter.current });
    setRejectShown(true);
  };
  const selectRejectReason = (id: string, code: string) => {
    modalCounter.current += 1;
    setReject({ stage: 'reason', id, code, n: modalCounter.current });
  };
  const confirmReject = (id: string, code: string) => {
    const r = R_CODES.find(x => x.code === code)!;
    const e = exceptions.find(x => x.id === id)!;
    if (r.needsComment) {
      const c = rejectCommentRef.current;
      if (!c || !c.value.trim()) { showToast('A comment is required for "Other"'); return; }
    }
    setSessionDecisions(d => [...d, { id, decision: 'reject', code }]);
    closeRejectModal();

    const closesForGood = r.terminal || e.alternativeUsed;
    if (closesForGood) {
      const closed = new Set(closedIds); closed.add(id);
      setClosedIds(closed);
      showToast('Rejected — ' + code + ' — closed, logged to B1');
      goNext(exceptions, closed);
      return;
    }
    // Apply the alternative and cycle back into the queue
    const ne: ReviewException = { ...e, alternativeUsed: true };
    if (r.offersRunnerUp && e.runnerUp) {
      ne.alternativeNote = 'Runner-up "' + e.runnerUp.action + '" is now the recommended action.';
      ne.action = e.runnerUp.action;
      ne.runnerUp = null;
      showToast('Rejected — ' + code + ' — runner-up applied, back in the queue');
    } else if (r.regenerates) {
      ne.alternativeNote = 'Draft regenerated to address the flagged issue.';
      ne.draftBody = e.draftBody + '\n\n[Regenerated after reviewer feedback]';
      showToast('Rejected — ' + code + ' — draft regenerated, back in the queue');
    } else {
      ne.alternativeNote = r.next;
      showToast('Rejected — ' + code + ' — alternative applied, back in the queue');
    }
    // The original mutated the object in place: every entry with this id is the same object only once,
    // so replace the first match (EXCEPTIONS.find semantics).
    const idx = exceptions.indexOf(e);
    const list = exceptions.map((x, i) => (i === idx ? ne : x));
    setExceptions(list);
    goNext(list, closedIds);
  };

  const onRowOver = (ev: MouseEvent<HTMLDivElement>) => { ev.currentTarget.style.background = 'var(--s50)'; };
  const onRowOut = (ev: MouseEvent<HTMLDivElement>) => { ev.currentTarget.style.background = 'transparent'; };

  /* ─── split view ─── */
  const splitView = () => (
    <>
      <div className="topbar"><div className="topbar-l"><span className="tb-title">Review</span></div></div>
      <div className="canvas">
        <div style={sx('width:100%;max-width:820px;margin:0 auto')}>

          <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px')}>
            <div className="panel"><div className="panel-body" style={sx('text-align:center;padding:22px')}>
              <div style={sx('font-family:var(--fd);font-size:30px;font-weight:700;color:var(--pos)')}>470</div>
              <div style={sx('font-size:11.5px;color:var(--i3);margin-top:4px')}>proceeded automatically overnight</div>
            </div></div>
            <div className="panel" style={sx('border-color:var(--warn)')}><div className="panel-body" style={sx('text-align:center;padding:22px')}>
              <div style={sx('font-family:var(--fd);font-size:30px;font-weight:700;color:var(--warn)')}>{q.length}</div>
              <div style={sx('font-size:11.5px;color:var(--i3);margin-top:4px')}>need you</div>
            </div></div>
          </div>

          {q.length ? (
            <>
              <div className="score-list" style={sx('margin-bottom:16px')}>
                <div className="sl-head" style={sx(ROW_COLS)}><div className="sl-th">Account</div><div className="sl-th">Why it&apos;s here</div><div className="sl-th">Segment</div></div>
                {q.map((e, i) => (
                  <div key={i} className="sl-row" style={sx(ROW_COLS)} onClick={() => openItem(e.id)}>
                    <div className="co-cell"><div className="co-av" style={{ background: avColor(e.id) }}>{initials(e.name)}</div><div><div className="co-nm">{e.name}{e.alternativeUsed ? <>{' '}<span style={sx('font-size:8.5px;font-weight:800;color:var(--brand-dk);background:var(--brand-lt);padding:1px 6px;border-radius:999px')}>ALTERNATIVE</span></> : null}</div><div className="co-ind">{e.co}</div></div></div>
                    <div><span className={`sc ${REASON_TAG_CLS[e.exceptionReason]}`}>{REASON_TAG_LBL[e.exceptionReason]}</span></div>
                    <div style={sx('font-size:11.5px;color:var(--i3)')}>{`${e.segment} · Tier ${e.tier}`}</div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" onClick={() => openItem(q[0].id)}>Start reviewing</button>
            </>
          ) : (
            <>
              <div className="panel" style={sx('margin-bottom:16px')}><div className="panel-body" style={sx('text-align:center;padding:30px')}>
                <div style={sx('font-size:28px;margin-bottom:8px')}>✅</div>
                <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1)')}>Queue clear</div>
                <div style={sx('font-size:12px;color:var(--i3);margin-top:4px')}>{`${sessionDecisions.length} decided this session, all logged to B1.`}</div>
              </div></div>
            </>
          )}

          <div className="panel">
            <div className="panel-hdr"><span className="panel-ttl">Proceeded on their own — take control if needed</span></div>
            <div className="panel-body" style={sx('padding:0')}>
              {AUTO_PROCEEDED.map(a => (
                <div key={a.id} style={sx('display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--s75)')}>
                  <div className="co-av" style={{ background: avColor(a.id) }}>{initials(a.name)}</div>
                  <div style={sx('flex:1')}><div style={sx('font-size:12px;font-weight:600;color:var(--i1)')}>{`${a.name} · ${a.co}`}</div><div style={sx('font-size:10.5px;color:var(--i3)')}>{`${a.action} — ${a.when}`}</div></div>
                  <button className="btn btn-ghost btn-sm" onClick={() => takeControl(a.id)}>Take control</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  /* ─── card view ─── */
  const cardView = (id: string) => {
    const e = exceptions.find(x => x.id === id)!;
    return (
      <>
        <div className="topbar">
          <div className="topbar-l">
            <button className="btn btn-ghost btn-sm" onClick={() => renderSplit()} style={sx('margin-right:4px')}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg></button>
            <span className="tb-title">Review</span>
            <span className="tb-badge badge-neutral">{`${q.length} left in the queue`}</span>
          </div>
        </div>
        <div className="canvas">
          <div style={sx('width:100%;max-width:820px;margin:0 auto')}>

            <div style={sx('margin-bottom:14px')}><span className={`sc ${REASON_TAG_CLS[e.exceptionReason]}`}>{REASON_TAG_LBL[e.exceptionReason]}</span> <span style={sx('font-size:11.5px;color:var(--i3);margin-left:6px')}>{e.exceptionWhy}</span></div>

            {e.alternativeNote ? <div className="panel" style={sx('margin-bottom:14px;border-color:var(--brand)')}><div className="panel-body" style={sx('font-size:12px;color:var(--brand-dk);background:var(--brand-lt)')}><b>Back with an alternative:</b>{' ' + e.alternativeNote}</div></div> : null}

            <div className="panel" style={sx('margin-bottom:14px')}>
              <div className="panel-hdr">
                <div style={sx('display:flex;align-items:center;gap:10px')}>
                  <div className="co-av" style={{ background: avColor(e.id) }}>{initials(e.name)}</div>
                  <div><div style={sx('font-size:13.5px;font-weight:700;color:var(--i1)')}>{e.name}</div><div style={sx('font-size:11px;color:var(--i3)')}>{`${e.title} · ${e.co}`}</div></div>
                </div>
                <span className={`sc ${e.tier === 'A' ? 'sc-h' : e.tier === 'B' ? 'sc-m' : 'sc-l'}`}>{`TIER ${e.tier}`}</span>
              </div>
              <div className="panel-body">
                <div style={sx('font-size:10.5px;color:var(--i4);font-style:italic;margin-bottom:10px')}>{e.workDone}</div>
                <div style={sx('font-size:12px;color:var(--i2);line-height:1.6;margin-bottom:10px')}><b style={sx('color:var(--i1)')}>Why now:</b>{' ' + e.whyNow}</div>
                <div style={sx('font-size:11px;color:var(--i3)')}>Segment: <b style={sx('color:var(--i2)')}>{e.segment}</b></div>
              </div>
            </div>

            <div className="panel" style={sx('margin-bottom:14px')}>
              <div className="panel-hdr"><span className="panel-ttl">Recommendation</span></div>
              <div className="panel-body">
                <div style={sx(`display:flex;align-items:flex-start;gap:8px;${e.runnerUp ? 'margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--s75)' : ''}`)}>
                  <span style={sx('font-size:14px;flex-shrink:0')}>✓</span>
                  <div><div style={sx('font-size:12px;font-weight:700;color:var(--i1)')}>{e.action}</div><div style={sx('font-size:11px;color:var(--i3);margin-top:2px')}>{`Channel: ${e.channel}`}</div></div>
                </div>
                {e.runnerUp ? <div style={sx('display:flex;align-items:flex-start;gap:8px')}>
                  <span style={sx('font-size:14px;flex-shrink:0;color:var(--i4)')}>2</span>
                  <div><div style={sx('font-size:12px;font-weight:600;color:var(--i2)')}>{`${e.runnerUp.action} — runner-up`}</div><div style={sx('font-size:11px;color:var(--i3);margin-top:2px')}>{e.runnerUp.reason}</div></div>
                </div> : null}
              </div>
            </div>

            <div className="panel" style={sx('margin-bottom:14px')} id="draftPanel">
              <div className="panel-hdr"><span className="panel-ttl">Draft</span></div>
              <div className="panel-body" id="draftView">
                {decision === 'edit' ? (
                  <>
                    <input id="editSubj" ref={editSubjRef} defaultValue={e.draftSubj} style={sx('width:100%;border:1px solid var(--bdk);border-radius:8px;padding:8px 10px;font-size:12.5px;font-weight:700;color:var(--i1);margin-bottom:8px;font-family:var(--fb)')} />
                    {' '}<textarea id="editBody" ref={editBodyRef} defaultValue={e.draftBody} style={sx('width:100%;min-height:140px;border:1px solid var(--bdk);border-radius:8px;padding:10px;font-size:12px;color:var(--i2);line-height:1.7;font-family:var(--fb);resize:vertical')}></textarea>
                  </>
                ) : (
                  <>
                    <div style={sx('font-size:12.5px;font-weight:700;color:var(--i1);margin-bottom:8px')}>{e.draftSubj}</div>
                    <div style={sx('font-size:12px;color:var(--i2);line-height:1.7;white-space:pre-line')}>{e.draftBody}</div>
                  </>
                )}
              </div>
            </div>

            <div id="decisionArea">
              {decision === 'bar' ? (
                <div style={sx('display:flex;gap:8px')}>
                  <button className="btn btn-sec btn-sm" style={sx(BTN_FLEX)} onClick={() => startEdit()}>Edit</button>
                  <button className="btn btn-sec btn-sm" style={sx('flex:1;justify-content:center;color:var(--neg)')} onClick={() => startReject(id)}>Reject</button>
                  <button className="btn btn-primary btn-sm" style={sx(BTN_FLEX)} onClick={() => startAccept()}>Accept</button>
                </div>
              ) : decision === 'accept' ? (
                <div className="panel">
                  <div className="panel-hdr"><span className="panel-ttl">Accept — optional tags</span></div>
                  <div className="panel-body">
                    <div style={sx('display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px')} id="tagRow">
                      {QUICK_TAGS.map(t => <span key={t} className={activeTags.has(t) ? 'seg-pill active' : 'seg-pill'} data-tag={t} onClick={() => toggleTag(t)} style={sx('cursor:pointer')}>{t}</span>)}
                    </div>
                    <div style={sx('display:flex;gap:8px')}>
                      <button className="btn btn-ghost btn-sm" style={sx(BTN_FLEX)} onClick={() => renderDecisionBar()}>Cancel</button>
                      <button className="btn btn-primary btn-sm" style={sx(BTN_FLEX)} onClick={() => confirmAccept(id)}>Confirm accept — as is</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="panel">
                  <div className="panel-hdr"><span className="panel-ttl">Rate this edit</span></div>
                  <div className="panel-body">
                    <div style={sx('font-size:11px;color:var(--i3);margin-bottom:10px;line-height:1.5')}><b>Minor:</b> wording, tone, length, greeting/sign-off, formatting only. <b>Major:</b> anything else.</div>
                    <div style={sx('display:flex;gap:8px')}>
                      <button className="btn btn-ghost btn-sm" style={sx(BTN_FLEX)} onClick={() => renderCardFor(id)}>Cancel</button>
                      <button className="btn btn-sec btn-sm" style={sx(BTN_FLEX)} onClick={() => confirmEdit(id, 'major')}>Major edit</button>
                      <button className="btn btn-primary btn-sm" style={sx(BTN_FLEX)} onClick={() => confirmEdit(id, 'minor')}>Minor edit</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  /* ─── reject modal (appended to body in the original) ─── */
  const rejectContent = (m: RejectModal) => {
    if (m.stage === 'list') {
      return (
        <div key={m.n} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:640px;max-width:100%;max-height:85vh;overflow-y:auto;')} onClick={ev => ev.stopPropagation()}>
          <div className="panel-hdr" style={sx('position:sticky;top:0;background:var(--surf);z-index:1')}><span className="panel-ttl">Reject — pick a reason</span><button className="btn btn-ghost btn-sm" onClick={closeRejectModal}>✕</button></div>
          <div style={sx('padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:2px')}>
            {R_CODES.map(r => (
              <div key={r.code} style={sx('display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:6px;cursor:pointer')} onMouseOver={onRowOver} onMouseOut={onRowOut} onClick={() => selectRejectReason(m.id, r.code)}>
                <span style={sx('font-family:var(--fm);font-size:10px;font-weight:700;color:var(--i3);width:22px;flex-shrink:0')}>{r.code}</span>
                <span style={sx('font-size:12px;color:var(--i1);flex:1')}>{r.label}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--i4)" strokeWidth="2" strokeLinecap="round" style={sx('flex-shrink:0')}><polyline points="9 18 15 12 9 6" /></svg>
              </div>
            ))}
          </div>
          <div style={sx('padding:12px 16px;border-top:1px solid var(--border)')}><button className="btn btn-ghost btn-sm" style={sx('width:100%;justify-content:center')} onClick={closeRejectModal}>Cancel</button></div>
        </div>
      );
    }
    const r = R_CODES.find(x => x.code === m.code)!;
    const e = exceptions.find(x => x.id === m.id)!;
    let extra: ReactNode = null;
    if (r.offersRunnerUp && e.runnerUp && !e.alternativeUsed) {
      extra = <div className="panel" style={sx('margin-top:10px;border-color:var(--brand)')}><div className="panel-body" style={sx('font-size:12px;color:var(--i2)')}><b>Runner-up will be offered:</b>{` ${e.runnerUp.action} — ${e.runnerUp.reason}. This item goes back into the queue with the runner-up as the new recommendation.`}</div></div>;
    } else if (!r.terminal && !e.alternativeUsed) {
      extra = <div className="panel" style={sx('margin-top:10px;border-color:var(--brand)')}><div className="panel-body" style={sx('font-size:12px;color:var(--i2)')}>This item goes back into the queue with the alternative applied.</div></div>;
    } else if (!r.terminal && e.alternativeUsed) {
      extra = <div className="panel" style={sx('margin-top:10px;border-color:var(--neg)')}><div className="panel-body" style={sx('font-size:12px;color:var(--neg)')}>This account already used its one alternative — a second rejection closes it for this pilot.</div></div>;
    }
    return (
      <div key={m.n} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:520px;max-width:100%;max-height:85vh;overflow-y:auto;border:1px solid var(--neg)')} onClick={ev => ev.stopPropagation()}>
        <div className="panel-hdr" style={sx('position:sticky;top:0;background:var(--surf)')}><span className="panel-ttl">{`${r.code} — ${r.label}`}</span></div>
        <div style={sx('padding:16px')}>
          <div style={sx('font-size:12px;color:var(--i2);line-height:1.6')}><b>What happens next:</b>{' ' + r.next}</div>
          {extra}
          {r.needsComment ? <textarea id="rejectComment" ref={rejectCommentRef} placeholder="Comment required for 'Other'…" style={sx('width:100%;min-height:60px;border:1px solid var(--bdk);border-radius:8px;padding:8px 10px;font-size:12px;margin-top:10px;font-family:var(--fb)')}></textarea> : null}
          <div style={sx('display:flex;gap:8px;margin-top:14px')}>
            <button className="btn btn-ghost btn-sm" style={sx(BTN_FLEX)} onClick={() => startReject(m.id)}>Back</button>
            <button className="btn btn-primary btn-sm" style={sx(BTN_FLEX)} onClick={() => confirmReject(m.id, m.code)}>Confirm reject</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <main className="main" id="mainArea">
        {view.kind === 'card' ? <Fragment key={view.n}>{cardView(view.id)}</Fragment> : splitView()}
      </main>
      {reject ? (
        <div id="rejectModalOverlay"
          style={sx(`position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:${rejectShown ? 'flex' : 'none'};align-items:center;justify-content:center;padding:24px;`)}
          onClick={ev => { if (ev.target === ev.currentTarget) closeRejectModal(); }}>
          {rejectContent(reject)}
        </div>
      ) : null}
    </>
  );
}

