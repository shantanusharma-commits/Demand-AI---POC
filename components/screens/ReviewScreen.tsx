'use client';

/* For Review (was legacy/14-review.html), on the server (G-008). What the system could not decide alone waits here,
   one item at a time: the rep's queue (exceptions, spot-checks, alternatives, items sent back or stepped into), the
   sales manager's approvals (sensitive content), and the decision log. Every decision is stored and logged with how
   long it took; edits are versioned and rated; nothing is decided in bulk. Not ported: Copilot (Phase 6; the facts it
   showed are shown in "Show the working"), the "after the pilot" buttons (G-063), and saving a contact's email or
   LinkedIn from here (that is a correction in Prospecting). */
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CONFIG } from '@/lib/demandai-engine';
import { checkDraft, type BrandPack, type Draft } from '@/lib/engine/nba';
import * as R from '@/lib/engine/review';
import { sx } from '@/lib/sx';
import { api, errorText, type WireDeep } from '@/lib/client/api';
import { avColor, initials, showToast } from '@/lib/ui';
import { useCan, useSessionUser } from '@/components/SessionContext';
import type { LogRow, QueueRow } from '@/lib/server/services/review';
import type { ItemDetail } from '@/lib/server/services/recommendations';
import { SegTag } from './NbaScreen';

type Row = WireDeep<QueueRow>;
type Item = WireDeep<ItemDetail>;
type Log = WireDeep<LogRow>;
type Queue = { items: Row[]; shownAt: string; total: number; released: number; auto: number; measure: ReturnType<typeof R.measure>; reps: { email: string; name: string }[] };
type View = 'queue' | 'approvals' | 'log';
type Filt = { due: string | null; reason: string | null; kind: string | null; seg: string | null; rep: string | null; ch: string | null; preset?: boolean };
type Fields = { subject: string; body: string; note: string; task: string };
type Ws = { id: string; list: string[]; from: View; item: Item | null; fields: Fields | null; own: boolean; ownText: string; seg: string; modal: null | 'hold' | 'reject' | 'send' };
type Teach = { id: string; decision: string; rejected: boolean; tags: string[]; note: string; held: boolean };

const NO_FILT: Filt = { due: null, reason: null, kind: null, seg: null, rep: null, ch: null };
const SOON = ['overdue', 'today', 'tomorrow', '2days'];
const DUE_OPTS: [string, string][] = [['soon', 'Next 2 days'], ['overdue', 'Overdue'], ['today', 'Due today'], ['tomorrow', 'Due tomorrow'], ['later', 'Due later']];
const CAT_TONE: Record<string, string> = { fixed: 'pos', sensitive: 'neg', claim: 'neg', brand: 'warn', low: 'warn', small: 'warn', deal: 'warn', reach: 'neg', spot: 'sec', alternative: 'brand', sentback: 'warn', intervention: 'brand', other: 'warn' };
const toneTag = (t: string) => ({ neg: 'tag-red', warn: 'tag-amber', sec: 'tag-blue', brand: 'tag-violet', pos: 'tag-green' } as Record<string, string>)[t] || 'tag-grey';
const GROUP_WHY: Record<string, string> = { sensitive: 'The message mentions a sensitive topic', claim: 'A claim has no approved source', low: 'No contact in the primary persona', small: 'No micro-segment yet',
  deal: 'The deal looks below the size threshold', brand: 'A brand rule is broken', reach: 'No way to reach the contact', spot: 'Went ahead on its own; rate it', alternative: 'The one alternative after a rejection',
  sentback: 'Sent back by the sales manager', intervention: 'Stepped in after it went ahead', fixed: 'Every reason it was here is fixed', other: '' };
const COLS_KEY = 'demandai_review_cols_v1';
const OPT_COLS: [string, string][] = [['channel', 'Channel'], ['seg', 'Micro-segment'], ['due', 'Due'], ['owner', 'Owner'], ['list', 'List']];
const FUNNEL = <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" /></svg>;
const OVERLAY = sx('position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px');
const fmtDate = (t: string | number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const timeOf = (t: string | number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const pc = (x: { pct: number | null }) => (x.pct === null ? '—' : Math.round(x.pct) + '%');
const dueOfRow = (r: Row) => R.dueOf({ cats: r.cats, segment: r.formedSegment, spot: r.spot, routedAt: Date.parse(r.routedAt) });
const fieldsOf = (d: Item['draft']): Fields => ({ subject: d.subject || '', body: d.body || '', note: d.note || '', task: d.task || '' });

function readCols(): Record<string, boolean> {
  try { const s = JSON.parse(localStorage.getItem(COLS_KEY) || 'null'); if (s && typeof s === 'object') return s; } catch { /* storage blocked */ }
  return { due: true, owner: true };
}

/* Where each problem sits in the message text: [start, end, kind]. */
function marksIn(text: string, chk: ReturnType<typeof checkDraft>): [number, number, string][] {
  const out: [number, number, string][] = [];
  const re = new RegExp(R.SENSITIVE_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length, 'sensitive']);
  chk.unsupported.forEach(u => { const i = text.indexOf(u.text); if (i >= 0) out.push([i, i + u.text.length, 'claim']); });
  chk.flags.filter(f => f.rule !== 'Sensitive term').forEach(f => {
    const w = (String(f.detail).match(/^"(.+)"$/) || [])[1]; if (!w) return;
    let i = text.toLowerCase().indexOf(w.toLowerCase());
    while (i >= 0) { out.push([i, i + w.length, 'brand']); i = text.toLowerCase().indexOf(w.toLowerCase(), i + 1); }
  });
  out.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  return out.filter((x, i) => !out.slice(0, i).some(p => x[0] < p[1]));      // no overlaps: the first one wins
}
function highlighted(text: string, marks: [number, number, string][]): ReactNode[] {
  const out: ReactNode[] = []; let at = 0;
  marks.forEach(([s, e, k], i) => { out.push(text.slice(at, s), <mark key={i} className={'k-' + k}>{text.slice(s, e)}</mark>); at = e; });
  out.push(text.slice(at) + '\n ');
  return out;
}

export function ReviewScreen() {
  const me = useSessionUser();
  const router = useRouter();
  const mgr = useCan('review.approve');
  const [view, setView] = useState<View>('queue');
  const [queue, setQueue] = useState<Queue | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filt, setFilt] = useState<Filt>(NO_FILT);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(true);
  const [cols, setCols] = useState<Record<string, boolean>>(readCols);
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [log, setLog] = useState<{ rows: Log[]; next: number | null; flagged: boolean } | null>(null);
  const [ws, setWs] = useState<Ws | null>(null);
  const [rj, setRj] = useState<{ code: string | null; note: string }>({ code: null, note: '' });
  const [hold, setHold] = useState({ why: R.HOLD_WHY[0], note: '' });
  const [sendNote, setSendNote] = useState('');
  const [teach, setTeach] = useState<Teach | null>(null);
  const [busy, setBusy] = useState(false);
  const booted = useRef(false);

  const loadQueue = () => api<Queue>('/api/review/queue').then(r => { setQueue(r); return r; });
  const loadLog = (flagged: boolean) => api<{ rows: Log[]; next: number | null }>(`/api/decision-log?limit=200${flagged ? '&flagged=1' : ''}`).then(r => { setLog({ ...r, flagged }); return r; });
  const now = queue ? Date.parse(queue.shownAt) : 0;
  const dueIs = (r: Row, f: string) => f === 'soon' ? SOON.includes(R.dueBucket(dueOfRow(r), now)) : R.dueBucket(dueOfRow(r), now) === f;

  /* ─── What each tab lists ─── */
  // The server sends only what the caller may see: a rep's own items, everyone's for a manager.
  const myQueue = (): Row[] => (queue?.items ?? []).filter(r => R.inQueue({ status: r.status as R.RecStatus, spot: r.spot as R.RecState['spot'] }) && !r.paused)
    .sort((a, b) => dueOfRow(a) - dueOfRow(b));
  const approvals = (): Row[] => (queue?.items ?? []).filter(r => r.status === 'Awaiting approval' && !r.paused);
  const filtered = (rs: Row[], f = filt) => rs.filter(r => (!f.due || dueIs(r, f.due)) && (!f.reason || r.cats.includes(f.reason))
    && (!f.kind || (f.kind === 'spot' ? r.spot === 'pending' : r.spot !== 'pending')) && (!f.seg || r.segment === f.seg) && (!f.rep || r.ownerEmail === f.rep) && (!f.ch || r.channel === f.ch));
  function shown(v: View = view): Row[] {
    const base = v === 'queue' ? myQueue() : approvals();
    let its = v === 'queue' ? filtered(base) : base.filter(r => (!filt.rep || r.ownerEmail === filt.rep) && (!filt.ch || r.channel === filt.ch));
    if (q) its = its.filter(r => `${r.contact.name} ${r.account.name} ${r.chosenAction}`.toLowerCase().includes(q));
    if (v === 'queue') its = its.filter(r => !r.hold).concat(its.filter(r => r.hold));     // on hold goes last
    if (group && v === 'queue' && its.length) {
      const cnt: Record<string, number> = {}; its.forEach(r => { cnt[r.cats[0]] = (cnt[r.cats[0]] || 0) + 1; });
      its = its.slice().sort((a, b) => (cnt[b.cats[0]] - cnt[a.cats[0]]) || a.cats[0].localeCompare(b.cats[0]) || (Number(!!a.hold) - Number(!!b.hold)));
    }
    return its;
  }

  function setFilter(patch: Partial<Filt> | null, preset = false) {
    setFilt(f => patch ? { ...f, ...patch, preset } : NO_FILT);
    try { history.replaceState(null, '', window.location.pathname); } catch { /* keep the address */ }
    if (view === 'log' || (patch && (['due', 'reason', 'kind'] as const).some(k => k in patch && patch[k]))) setView('queue');
    setMenu(null);
  }
  function setCol(k: string, on: boolean) {
    const s = { ...cols, [k]: on };
    setCols(s);
    try { localStorage.setItem(COLS_KEY, JSON.stringify(s)); } catch { /* a preference only */ }
  }

  /* ─── The workspace ─── */
  async function openItem(id: string, list?: string[], from: View = view) {
    setMenu(null);
    const ids = list ?? (() => { const qs = myQueue().filter(r => !r.hold).map(r => r.id); return qs.includes(id) ? qs : [id]; })();
    setWs({ id, list: ids, from, item: null, fields: null, own: false, ownText: '', seg: '', modal: null });
    try {
      await api(`/api/recommendations/${encodeURIComponent(id)}/open`, { body: {} });
      const { item } = await api<{ item: Item }>(`/api/recommendations/${encodeURIComponent(id)}`);
      setWs(w => w && w.id === id ? { ...w, item, fields: fieldsOf(item.draft), seg: item.state.assignedSegment || '' } : w);
    } catch (err) { showToast(errorText(err)); setWs(null); }
  }
  async function reloadItem(id: string) {
    const { item } = await api<{ item: Item }>(`/api/recommendations/${encodeURIComponent(id)}`);
    setWs(w => w && w.id === id ? { ...w, item, fields: fieldsOf(item.draft), own: false, ownText: '', modal: null } : w);
    return item;
  }
  function leave() { setWs(null); void loadQueue(); }
  function go(step: number) {
    if (!ws) return;
    const j = ws.list.indexOf(ws.id) + step;
    if (j >= 0 && j < ws.list.length) void openItem(ws.list[j], ws.list, ws.from);
  }
  /** After a decision: stay while the item still needs this reviewer in the same way, otherwise go to the next one. */
  async function afterDecision(id: string, mode: 'decide' | 'approve', toast: string) {
    const fresh = await loadQueue();
    const row = fresh.items.find(r => r.id === id);
    const still = row && (mode === 'approve' ? row.status === 'Awaiting approval' : R.inQueue({ status: row.status as R.RecStatus, spot: row.spot as R.RecState['spot'] }) && !row.hold);
    if (still) { await reloadItem(id); showToast(mode === 'decide' && row.why === 'alternative' ? 'An alternative came back: it is the next thing to decide' : toast); return; }
    showToast(toast);
    const w = ws!;
    const rest = w.list.filter(x => x !== id && fresh.items.some(r => r.id === x && (mode === 'approve' ? r.status === 'Awaiting approval' : R.inQueue({ status: r.status as R.RecStatus, spot: r.spot as R.RecState['spot'] }) && !r.hold)));
    const i = w.list.indexOf(id), next = rest.find(x => w.list.indexOf(x) > i) || rest[0];
    if (next) void openItem(next, rest, w.from);
    else { setWs(null); showToast(mode === 'approve' ? 'No more approvals waiting' : 'Done: nothing else in this list needs you right now'); }
  }
  /** The draft as it is in the fields now. */
  function draftNow(it: Item, f: Fields | null): Draft {
    const d = { ...it.draft } as unknown as Draft;
    if (!f) return d;
    return R.withEdits(d, d.channel === 'Email' ? { subject: f.subject, body: f.body } : d.channel === 'LinkedIn' ? { note: f.note } : { task: f.task });
  }
  const editsOf = (it: Item, f: Fields | null) => {
    const x = draftNow(it, f);
    return R.sameDraft(x, it.draft as unknown as Draft) ? undefined : x.channel === 'Email' ? { subject: x.subject, body: x.body } : x.channel === 'LinkedIn' ? { note: x.note } : { task: x.task };
  };
  async function call(id: string, path: string, body: unknown): Promise<Record<string, unknown> | null> {
    setBusy(true);
    try { return await api<Record<string, unknown>>(`/api/recommendations/${encodeURIComponent(id)}/${path}`, { body }); }
    catch (err) { showToast(errorText(err)); return null; }
    finally { setBusy(false); }
  }
  async function accept() {
    if (!ws?.item || busy) return;
    const it = ws.item, pos = myQueue().findIndex(r => r.id === it.id);
    const r = await call(it.id, 'accept', { draft: editsOf(it, ws.fields), assignedSegment: ws.seg || undefined, queuePosition: pos >= 0 ? pos + 1 : undefined });
    if (!r) return;
    startTeach(it.id, r.status === 'Awaiting approval' ? 'Approved, sent to the manager' : 'Approved', false);
    await afterDecision(it.id, 'decide', String(r.message));
  }
  async function approve() {
    if (!ws?.item || busy) return;
    const it = ws.item;
    const r = await call(it.id, 'approve', { draft: editsOf(it, ws.fields) });
    if (!r) return;
    startTeach(it.id, 'Approved', false);
    await afterDecision(it.id, 'approve', String(r.message));
  }
  async function reject() {
    if (!ws?.item || busy) return;
    if (!rj.code) { showToast('Pick a reason'); return; }
    if (rj.code === 'R12' && !rj.note.trim()) { showToast('"Other" needs a comment'); return; }
    const it = ws.item, pos = myQueue().findIndex(r => r.id === it.id), label = R.REJECT.find(x => x[0] === rj.code)![1];
    const r = await call(it.id, 'reject', { code: rj.code, note: rj.note, queuePosition: pos >= 0 ? pos + 1 : undefined });
    if (!r) return;
    setWs(w => w && { ...w, modal: null });
    startTeach(it.id, 'Rejected: ' + label, true);
    await afterDecision(it.id, it.state.status === 'Awaiting approval' ? 'approve' : 'decide', String(r.message));
  }
  async function doHold() {
    if (!ws?.item) return;
    const it = ws.item;
    if (await call(it.id, 'hold', hold)) { setWs(w => w && { ...w, modal: null }); await afterDecision(it.id, 'decide', 'On hold: it waits at the end of your queue'); }
  }
  async function unhold() {
    if (!ws?.item) return;
    if (await call(ws.item.id, 'unhold', {})) { showToast('Back in the queue'); await reloadItem(ws.item.id); void loadQueue(); }
  }
  async function doSendBack() {
    if (!ws?.item) return;
    if (!sendNote.trim()) { showToast('Say what should change'); return; }
    const it = ws.item;
    if (await call(it.id, 'send-back', { note: sendNote })) { setWs(w => w && { ...w, modal: null }); startTeach(it.id, 'Sent back', true); await afterDecision(it.id, 'approve', 'Sent back to the rep'); }
  }
  async function pick(use: 'recommended' | 'runner-up' | 'own') {
    if (!ws?.item) return;
    const r = await call(ws.item.id, 'action', use === 'own' ? { use, text: ws.ownText } : { use });
    if (r) { showToast(String(r.message)); await reloadItem(ws.item.id); }
  }
  async function fix(body: { kind: 'low' | 'deal' | 'small'; contactRow?: number; segment?: string }) {
    if (!ws?.item) return;
    if (await call(ws.item.id, 'fixes', body)) { await reloadItem(ws.item.id); void loadQueue(); }
  }
  function startTeach(id: string, decision: string, rejected: boolean) { setTeach({ id, decision, rejected, tags: [], note: '', held: false }); }
  async function saveTeach() {
    if (!teach) return;
    const t = teach; setTeach(null);
    if (!t.note.trim() && !t.tags.length) return;
    try { await api(`/api/recommendations/${encodeURIComponent(t.id)}/teach`, { body: { tags: t.tags, note: t.note } }); showToast('Thanks: saved for the learning loop'); }
    catch (err) { showToast(errorText(err)); }
  }
  async function markChecked(l: Log) {
    try { await api(`/api/decision-log/${encodeURIComponent(l.id)}/check`, { body: {} }); showToast('Checked: it now counts toward G2'); await Promise.all([loadLog(!!log?.flagged), loadQueue()]); }
    catch (err) { showToast(errorText(err)); }
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const P = new URLSearchParams(window.location.search);
    loadQueue().then(r => {
      const f: Filt = { due: P.get('due'), reason: P.get('reason'), kind: P.get('kind'), seg: P.get('seg'), rep: P.get('rep'), ch: P.get('ch') };
      const fromLink = f.due || f.reason || f.kind || f.seg || f.rep, item = P.get('item');
      const at = Date.parse(r.shownAt);
      const queued = r.items.filter(x => R.inQueue({ status: x.status as R.RecStatus, spot: x.spot as R.RecState['spot'] }) && !x.paused);
      // Land on the work: a manager with approvals waiting starts there; otherwise the queue, due in the next two days.
      if (!fromLink && !item && queued.some(x => SOON.includes(R.dueBucket(dueOfRow(x), at)))) { f.due = 'soon'; f.preset = true; }
      setFilt(f);
      const v = P.get('view');
      if (v === 'log' || v === 'queue' || (v === 'approvals' && mgr)) setView(v);
      else if (!fromLink && !item && mgr && r.items.some(x => x.status === 'Awaiting approval' && !x.paused)) setView('approvals');
      if (item) void openItem(item, [item], 'queue');
    }, err => setLoadError(errorText(err)));
  });   // runs once (booted)

  useEffect(() => {
    if (view !== 'log') return;
    let gone = false;
    api<{ rows: Log[]; next: number | null }>(`/api/decision-log?limit=200${log?.flagged ? '&flagged=1' : ''}`).then(r => { if (!gone) setLog(l => ({ ...r, flagged: !!l?.flagged })); }, err => { if (!gone) showToast(errorText(err)); });
    return () => { gone = true; };
  }, [view, log?.flagged]);

  useEffect(() => {
    if (!teach || teach.held) return;
    const t = setTimeout(() => setTeach(null), 12000);
    return () => clearTimeout(t);
  }, [teach]);

  useEffect(() => {
    if (!ws) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = ((e.target as HTMLElement).tagName || '').toLowerCase();
      if (e.key === 'Escape') { if (teach) { setTeach(null); return; } if (ws.modal) { setWs(w => w && { ...w, modal: null }); return; } leave(); return; }
      if (['input', 'textarea', 'select'].includes(tag) || ws.modal || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      const bar = document.querySelector('.ws-dec'), k = e.key.toLowerCase();
      const btn = (re: RegExp) => [...(bar?.querySelectorAll('button') ?? [])].find(b => re.test((b.textContent || '').trim())) as HTMLButtonElement | undefined;
      if (k === 'a') { const b = btn(/^Approve/); if (b) { e.preventDefault(); b.click(); } }
      else if (k === 'r') { const b = btn(/^Reject/); if (b) { e.preventDefault(); b.click(); } }
      else if (k === 'h') { const b = btn(/hold/i); if (b) { e.preventDefault(); b.click(); } }
      else if (k === 'w' && ws.item && R.inQueue(ws.item.state)) { e.preventDefault(); setWs(w => w && { ...w, own: true }); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  /* ═══════════════ THE LIST ═══════════════ */
  function colFilter(label: string, key: string): ReactNode {
    const cur = key === 'why' ? (filt.kind ? 'k:' + filt.kind : filt.reason ? 'r:' + filt.reason : '') : (filt[key as keyof Filt] as string | null) || '';
    return <button className={'col-btn' + (cur ? ' on' : '')} title={`Filter by ${label.toLowerCase()}`} onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu(m => m?.key === key ? null : { key, x: r.left - 6, y: r.bottom + 6 }); }}>{label} {FUNNEL}</button>;
  }
  function menuOpts(key: string): [string, string][] {
    const base = view === 'queue' ? myQueue() : approvals();
    if (key === 'why') { const cats = new Set(base.flatMap(r => r.cats)); return [['k:exception', 'Exceptions'], ['k:spot', 'Spot-checks'], ...Object.keys(R.REASON_CATS).filter(c => cats.has(c) && c !== 'spot').map(c => ['r:' + c, R.REASON_CATS[c]] as [string, string])]; }
    if (key === 'ch') return [...new Set(base.map(r => r.channel))].map(c => [c, c]);
    if (key === 'due') return DUE_OPTS;
    if (key === 'rep') return (queue?.reps ?? []).map(r => [r.email, r.name]);
    return [];
  }
  function colMenu(): ReactNode {
    if (!menu) return null;
    if (menu.key === '__cols') return <div className="col-menu" style={{ top: menu.y, left: Math.max(8, menu.x - 180) }} onClick={e => e.stopPropagation()}>
      <div style={sx('padding:4px 10px 6px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3)')}>Columns</div>
      <div style={sx('padding:2px 10px 6px;font-size:11px;color:var(--i3)')}>Why it needs you, the action and the prospect always show.</div>
      {OPT_COLS.filter(([k]) => k !== 'owner' || mgr).map(([k, l]) => <label key={k} style={sx('display:flex;align-items:center;gap:8px;padding:7px 10px;font-size:12.5px;cursor:pointer')}><input type="checkbox" checked={!!cols[k]} onChange={e => setCol(k, e.target.checked)} style={sx('accent-color:var(--brand)')} />{l}</label>)}
    </div>;
    const key = menu.key, opts = menuOpts(key), base = view === 'queue' ? myQueue() : approvals();
    const cur = key === 'why' ? (filt.kind ? 'k:' + filt.kind : filt.reason ? 'r:' + filt.reason : '') : (filt[key as keyof Filt] as string | null) || '';
    const patchOf = (v: string): Partial<Filt> => key === 'why' ? { kind: v.startsWith('k:') ? v.slice(2) : null, reason: v.startsWith('r:') ? v.slice(2) : null } : { [key]: v || null };
    const count = (v: string) => (view === 'queue' ? filtered(base, { ...filt, ...patchOf(v) }) : base.filter(r => { const f = { ...filt, ...patchOf(v) }; return (!f.rep || r.ownerEmail === f.rep) && (!f.ch || r.channel === f.ch); })).length;
    const label = { why: 'why it needs you', ch: 'channel', due: 'due', rep: 'owner' }[key] || key;
    return <div className="col-menu" style={{ top: menu.y, left: Math.max(8, menu.x) }} onClick={e => e.stopPropagation()}>
      <div style={sx('padding:4px 10px 6px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3)')}>Filter by {label}</div>
      {[['', 'All'] as [string, string], ...opts].map(([v, l]) => <button key={v} onClick={() => setFilter(patchOf(v))}><span className="ck">{v === cur ? '✓' : ''}</span>{l}<span className="n">{count(v)}</span></button>)}
    </div>;
  }
  function filterSummary(total: number, n: number): ReactNode {
    const lbl: Record<string, (v: string) => string> = { due: v => (DUE_OPTS.find(o => o[0] === v) || [v, v])[1], reason: v => R.REASON_CATS[v] || v, kind: v => v === 'spot' ? 'Spot-checks' : 'Exceptions', seg: v => v,
      rep: v => queue?.reps.find(r => r.email === v)?.name ?? v, ch: v => v };
    const on = (['due', 'reason', 'kind', 'seg', 'rep', 'ch'] as const).filter(k => filt[k] && (view === 'queue' || k === 'rep' || k === 'ch'));
    return <>
      {on.map(k => <span key={k} className="seg-pill active" title="Remove this filter" onClick={() => setFilter({ [k]: null })}>{lbl[k](filt[k]!)}{filt.preset && k === 'due' ? ' (recommended)' : ''} ✕</span>)}
      {on.length ? null : <span style={sx('font-size:11.5px;color:var(--i3);display:inline-flex;align-items:center;gap:5px')}>{FUNNEL} Filter from the column headers, or click any tag, channel, date or owner in the list</span>}
      <span style={sx('margin-left:auto;font-size:11.5px;color:var(--i3);white-space:nowrap')}>Showing <b style={sx('color:var(--i1)')}>{n}</b> of {total}</span>
      {on.length ? <a href="#" onClick={e => { e.preventDefault(); setFilter(null); }} style={sx('font-size:11.5px;color:var(--brand);font-weight:600;text-decoration:none;white-space:nowrap')}>Clear filters</a> : null}
    </>;
  }
  function rowsTable(): ReactNode {
    const its = shown(), base = view === 'queue' ? myQueue() : approvals();
    const show = { channel: cols.channel, seg: cols.seg, due: cols.due, owner: cols.owner && mgr, list: cols.list };
    const head: [ReactNode, string][] = [['Prospect', '20%'], [view === 'queue' ? colFilter('Why it needs you', 'why') : 'Why it needs you', '31%'], ['Recommended action', '22%']];
    if (show.channel) head.push([colFilter('Channel', 'ch'), '8%']);
    if (show.seg) head.push(['Micro-segment', '11%']);
    if (show.due) head.push([view === 'queue' ? colFilter('Due', 'due') : 'Due', '12%']);
    if (show.owner) head.push([colFilter('Owner', 'rep'), '12%']);
    if (show.list) head.push(['List', '12%']);
    head.push(['', '108px']);
    let lastCat: string | null = null;
    const listIds = its.filter(r => !r.hold).map(r => r.id);
    return <>
      <div id="filtSum" style={sx('display:flex;align-items:center;gap:6px;flex:1;flex-wrap:wrap;padding:8px 14px;border-bottom:1px solid var(--border)')}>{filterSummary(base.length, its.length)}</div>
      <div className="dt-wrap"><table className="dt">
        <colgroup>{head.map((c, i) => <col key={i} style={{ width: c[1] }} />)}</colgroup>
        <thead><tr>{head.map((c, i) => <th key={i}>{c[0]}</th>)}</tr></thead>
        <tbody>{its.length ? its.map(r => {
          const cat = r.cats[0], tone = CAT_TONE[r.stuck.cat];
          let grp: ReactNode = null;
          if (group && view === 'queue' && cat !== lastCat) {
            lastCat = cat;
            const n = its.filter(x => x.cats[0] === cat).length, ids = its.filter(x => x.cats[0] === cat && !x.hold).map(x => x.id);
            grp = <tr className="grp"><td colSpan={head.length}><div className="grp-in"><span className={`tag ${toneTag(CAT_TONE[cat])}`}>{R.REASON_CATS[cat] || cat}</span><span className="grp-n">{n} item{n === 1 ? '' : 's'}</span><span className="grp-d">{GROUP_WHY[cat] || ''}</span>
              {n > 1 && ids.length ? <button className="btn btn-sec btn-sm" onClick={() => void openItem(ids[0], ids, 'queue')}>Review these {n} →</button> : null}</div></td></tr>;
          }
          const t = dueOfRow(r), b = R.dueBucket(t, now);
          return <Fragment key={r.id}>{grp}<tr className={'click' + (r.hold ? ' held' : '')} onClick={() => void openItem(r.id, listIds.includes(r.id) ? listIds : [r.id])}>
            <td className="wrap"><div className="person"><div className="co-av" style={{ background: avColor(r.contact.name) }}>{initials(r.contact.name)}</div><div><span className="dt-main" title={r.contact.name}>{r.contact.name}</span><span className="sub">{r.account.name}</span></div></div></td>
            <td className="wrap"><div className="why"><div className="why-t">
              <span className={`tag ${view === 'approvals' ? 'tag-red' : toneTag(tone)}`} style={view === 'queue' ? sx('cursor:pointer') : undefined} title={view === 'queue' ? 'Show only these' : undefined}
                onClick={e => { if (view !== 'queue') return; e.stopPropagation(); setFilter(r.spot === 'pending' ? { kind: 'spot', reason: null } : { reason: r.stuck.cat, kind: null }); }}>{view === 'approvals' ? 'Sensitive content' : r.stuck.label}</span>
              {r.stuck.also.length ? <span className="why-more" title={r.stuck.also.join(', ')}>+{r.stuck.also.length}</span> : null}{r.hold ? <span className="tag tag-grey">On hold</span> : null}</div>
              <span className="why-l clamp2" title={r.stuck.line}>{r.stuck.line}</span></div></td>
            <td className="wrap"><span className="clamp2 act" title={r.chosenAction}>{r.chosenAction}</span></td>
            {show.channel ? <td><span style={sx('cursor:pointer')} title={`Show only ${r.channel}`} onClick={e => { e.stopPropagation(); setFilter({ ch: r.channel }); }}><span className="val">{r.channel}</span></span></td> : null}
            {show.seg ? <td><SegTag seg={r.segment || null} /></td> : null}
            {show.due ? <td className="wrap"><span style={sx(`${view === 'queue' ? 'cursor:pointer;' : ''}font-size:12.5px;font-weight:600;color:${b === 'overdue' || b === 'today' ? 'var(--neg)' : b === 'tomorrow' ? 'var(--warn)' : 'var(--i2)'}`)}
              onClick={e => { if (view !== 'queue') return; e.stopPropagation(); setFilter({ due: b === '2days' ? 'soon' : b }); }}>{b === 'overdue' ? 'Overdue' : b === 'today' ? 'Today' : b === 'tomorrow' ? 'Tomorrow' : new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="sub">{b === 'overdue' ? 'since ' + new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : b === 'today' || b === 'tomorrow' ? 'by ' + new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'by 5:00 PM'}</span></td> : null}
            {show.owner ? <td className="wrap"><span style={sx('cursor:pointer')} onClick={e => { e.stopPropagation(); setFilter({ rep: r.ownerEmail }); }}><span className="val">{r.ownerName || r.ownerEmail || 'Unassigned'}</span></span></td> : null}
            {show.list ? <td><span className="val" title={r.runName}>{r.runName}</span></td> : null}
            <td style={sx('text-align:right;white-space:nowrap')}><button className="btn btn-decide btn-sm" onClick={e => { e.stopPropagation(); void openItem(r.id, listIds.includes(r.id) ? listIds : [r.id]); }}>{view === 'approvals' ? 'Review' : 'Open'} →</button></td>
          </tr></Fragment>;
        }) : <tr><td colSpan={head.length} className="dt-empty">{view === 'queue' ? 'Nothing needs you right now.' : 'No sensitive items waiting for approval.'}</td></tr>}</tbody>
      </table></div>
    </>;
  }
  function logTable(): ReactNode {
    let ls = log?.rows ?? [];
    if (q) ls = ls.filter(l => `${l.who} ${l.prospect} ${l.company} ${l.decision} ${l.action} ${l.note}`.toLowerCase().includes(q));
    const tone = (d: string) => /^Accepted|^Approved/.test(d) ? 'tag-green' : /^Rejected/.test(d) ? 'tag-red' : /^Outcome/.test(d) ? 'tag-violet' : /^Proceeded/.test(d) ? 'tag-blue' : 'tag-grey';
    const kindLbl: Record<string, string> = { exception: 'Exception', spot: 'Spot-check', alternative: 'Alternative', intervention: 'Intervention' };
    return <div className="dt-wrap"><table className="dt">
      <colgroup>{['12%', '12%', '15%', '24%', '19%', '18%'].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead><tr><th>When</th><th>Who</th><th>Prospect</th><th>Decision</th><th>Action</th><th>Note</th></tr></thead>
      <tbody>{!log ? <tr><td colSpan={6} className="dt-empty">Loading…</td></tr> : ls.length ? ls.map(l => <tr key={l.id} className="click" onClick={() => void openItem(l.recommendationId, [l.recommendationId], 'log')}>
        <td><span className="val">{fmtDate(l.at)}</span><span className="sub">{timeOf(l.at)}{l.seconds !== null ? ` · ${l.seconds}s` : ''}</span></td>
        <td><span className="val">{l.who}</span><span className="sub">{l.role}</span></td>
        <td><span className="val">{l.prospect}</span><span className="sub">{l.company}</span></td>
        <td className="wrap"><span className={`tag ${tone(l.decision)}`}>{l.decision}</span>{l.decisive ? <span className="sub">{kindLbl[l.kind || ''] || ''}{l.firstPass ? ' · first pass' : ''}{l.queuePosition ? ` · #${l.queuePosition} in queue` : ''}</span> : null}
          {l.flag ? <><span className="sub" style={sx('color:var(--warn)')}>{l.flag}{l.checked ? ' · checked' : ''}</span>{mgr && !l.checked ? <button className="btn btn-ghost btn-sm" style={sx('margin-top:4px')} onClick={e => { e.stopPropagation(); void markChecked(l); }}>Checked, count it</button> : null}</> : null}</td>
        <td className="wrap"><span className="clamp2" style={sx('font-size:12px;color:var(--i1)')}>{l.action}</span><span className="sub">{l.channel}{l.linkedTo ? ` · alternative to ${l.linkedTo}` : ''}</span></td>
        <td className="wrap"><span className="clamp2" style={sx('font-size:12px;color:var(--i2)')}>{[l.tags.length ? l.tags.join(', ') : '', l.note].filter(Boolean).join(' · ') || <span className="muted">—</span>}</span></td>
      </tr>) : <tr><td colSpan={6} className="dt-empty">No decisions yet.</td></tr>}</tbody>
    </table>{log?.next ? <div style={sx('padding:10px 14px;font-size:11.5px;color:var(--i3)')}>Showing the newest 200. Export the decision log for all of it.</div> : null}</div>;
  }
  function listScreen(): ReactNode {
    const queueRows = myQueue(), appr = approvals(), m = queue?.measure;
    const ft = (id: View, label: string, n: number) => <div className={'ftab' + (view === id ? ' active' : '')} role="tab" aria-selected={view === id} onClick={() => { setView(id); setQ(''); setMenu(null); }}>{label} <span className="ftab-cnt">{n}</span></div>;
    const tile = (lbl: string, val: string, sub: string, onClick: () => void, tip: string, tone?: string) => <a className="stat stat-link" href="#" title={tip} onClick={e => { e.preventDefault(); onClick(); }}>
      <div className="stat-lbl">{lbl}</div><div className="stat-val" style={sx(tone ? `color:${tone}` : 'color:var(--i1)')}>{val}</div><div className="stat-sub">{sub}</div></a>;
    const total = queue?.total ?? 0;
    return <>
      <div className="topbar">
        <div className="topbar-l"><span className="tb-title">For Review</span><span className="tb-badge badge-neutral">{mgr ? 'Everyone\'s items' : 'Your items · ' + me.displayName}</span></div>
        <div className="topbar-r"><div style={sx('position:relative')}>
          <button className="btn btn-sec btn-sm" aria-expanded={exportOpen} onClick={e => { e.stopPropagation(); setExportOpen(o => !o); }}>Export <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg></button>
          {exportOpen ? <div style={sx('position:absolute;right:0;top:34px;width:270px;background:var(--surf);border:1px solid var(--border);border-radius:var(--rmd);box-shadow:var(--sh-lg);padding:6px;z-index:250')}>
            {[['released-messages', 'Released messages', 'Emails and LinkedIn messages ready to use'], ['tasks', 'Tasks for the team', 'Calls and follow-ups owned by a person'], ['decision-log', 'Decision log', 'Who decided what, when and why']].map(([k, t, d]) =>
              <a key={k} href={`/api/exports/${k}.csv`} download onClick={() => setExportOpen(false)} style={sx('display:block;width:100%;text-align:left;padding:9px 10px;border-radius:var(--rsm);text-decoration:none')}>
                <span style={sx('display:block;font-size:12.5px;font-weight:600;color:var(--i1)')}>{t}</span><span style={sx('display:block;font-size:11px;color:var(--i3)')}>{d}</span></a>)}
          </div> : null}
        </div></div>
      </div>
      <div className="ftabs">{mgr ? ft('approvals', 'Approvals', appr.length) : null}{ft('queue', mgr ? 'Queue' : 'My queue', queueRows.length)}{ft('log', 'Decision log', log?.rows.length ?? 0)}</div>
      <div className="canvas">
        {loadError ? <div role="alert" style={sx('color:var(--neg);font-size:12.5px;margin-bottom:12px')}>{loadError}</div> : null}
        {!queue ? <div style={sx('font-size:12.5px;color:var(--i3)')}>Loading…</div> : total ? (view === 'log' ? <div className="tab-why"><b>Decision log</b>: who decided what, when and why.{mgr ? '' : ' You see the decisions you made.'}</div> : <div className="purpose">
          <div className="pp-main"><div className="pp-t">{view === 'approvals' ? 'Approvals: sensitive messages wait for you' : 'For Review: what the system could not decide'}</div>
            <div className="pp-d">{view === 'approvals' ? 'These messages mention a plant incident, security or regulation, so nothing goes out until the sales manager approves it. They come here straight from the system, or from a rep who accepted one.'
              : <>The system sends most outreach on its own (<b>{queue.auto}</b> went ahead without anyone). These {queueRows.length} need a person because something is missing or risky. Each row says why; open one to approve, reject or write your own.</>}</div></div>
        </div>) : <div style={sx('font-size:12.5px;color:var(--i2);margin-bottom:12px')}>Nothing yet. Items arrive here when you build micro-segments. <Link href="/nba" style={sx('color:var(--brand);font-weight:600;text-decoration:none')}>Go to Micro-segments &amp; NBA →</Link></div>}
        {m && total ? <div className="stats" style={sx('grid-template-columns:repeat(5,1fr);margin-bottom:14px')}>
          {tile('G2 · first pass', m.weighted === null ? '—' : Math.round(m.weighted) + '%', `weighted by path${m.partial && m.weighted !== null ? ' · one path so far' : ''}`, () => router.push('/analytics?tab=gates'), 'Open the success gates in Analytics')}
          {tile('Proceeded path', pc(m.auto), `${m.auto.a} of ${m.auto.n} spot-checks · ${m.autoN} items`, () => setFilter({ kind: 'spot', reason: null, due: null }), 'Show the spot-checks to rate')}
          {tile('Exception path', pc(m.exc), `${m.exc.a} of ${m.exc.n} decided · ${m.excN} items`, () => setFilter({ kind: 'exception', due: null }), 'Show the exceptions')}
          {tile('Within one alternative', pc(m.alternatives), `${m.alternatives.a} of ${m.alternatives.n} accepted`, () => setFilter({ reason: 'alternative', kind: null, due: null }), 'Show the alternatives waiting')}
          {tile('Flagged', String(m.flagged), `fast or repetitive, to check · ${m.interventions} intervention${m.interventions === 1 ? '' : 's'}`, () => { setView('log'); setLog(l => ({ rows: l?.rows ?? [], next: l?.next ?? null, flagged: true })); }, 'Show the flagged decisions in the log', m.flagged ? 'var(--warn)' : '')}
        </div> : null}
        <div className="score-list">
          <div className="sl-toolbar">
            <div className="sl-srch"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={sx('color:var(--i3);flex-shrink:0')}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <input type="text" aria-label="Search" value={q} onChange={e => setQ(e.target.value.toLowerCase())} placeholder={view === 'log' ? 'Search the log…' : 'Search prospects, companies or actions…'} /></div>
            {view !== 'log' ? <><label className="grp-tg"><input type="checkbox" checked={group} onChange={e => setGroup(e.target.checked)} /> Group by reason</label>
              <button className="btn btn-ghost btn-sm" title="Choose the columns" onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu(mm => mm?.key === '__cols' ? null : { key: '__cols', x: r.right, y: r.bottom + 6 }); }}>⚙ Columns</button></>
              : log?.flagged ? <span className="seg-pill active" onClick={() => setLog(l => l && { ...l, flagged: false })}>Flagged, to check ✕</span> : null}
          </div>
          {view === 'log' ? logTable() : queue ? rowsTable() : null}
        </div>
      </div>
    </>;
  }

  /* ═══════════════ THE WORKSPACE: one item, the whole screen ═══════════════ */
  function wsScreen(w: Ws): ReactNode {
    const it = w.item;
    const i = w.list.indexOf(w.id), n = w.list.length;
    const fromLbl = { queue: mgr ? 'Queue' : 'My queue', approvals: 'Approvals', log: 'Decision log' }[w.from];
    const top = <div className="topbar">
      <div className="topbar-l"><nav className="ws-crumb"><a href="#" onClick={e => { e.preventDefault(); leave(); }}>For Review</a><span>›</span><a href="#" onClick={e => { e.preventDefault(); leave(); }}>{fromLbl}</a><span>›</span><b>{it ? `${it.contact.name} · ${it.account.name}` : 'Loading…'}</b></nav></div>
      <div className="topbar-r"><span className="ws-sub">{n > 1 ? `${i + 1} of ${n}` : ''}</span>
        <button className="btn btn-sec btn-sm" disabled={i <= 0} onClick={() => go(-1)} title="Previous (←)">‹</button>
        <button className="btn btn-sec btn-sm" disabled={i >= n - 1} onClick={() => go(1)} title="Next (→)">›</button>
        <button className="btn btn-ghost btn-sm" onClick={leave} title="Back to the list (Esc)">✕ Close</button></div>
    </div>;
    if (!it || !w.fields) return <>{top}<div className="canvas"><div style={sx('font-size:12.5px;color:var(--i3)')}>Loading…</div></div></>;
    const st = it.state, f = w.fields;
    const mode: 'decide' | 'approve' | 'view' = R.inQueue(st) ? 'decide' : st.status === 'Awaiting approval' ? 'approve' : 'view';
    const live = mode === 'decide' && it.can.decide, canEdit = live || (mode === 'approve' && it.can.approve);
    const x = draftNow(it, f), chk = checkDraft(x, it.pack as unknown as BrandPack, it.checkDate);
    const text = x.channel === 'Email' ? f.body : x.channel === 'LinkedIn' ? f.note : '';
    const marks = x.channel === 'Task' ? [] : marksIn(text, chk);
    const cats = mode === 'approve' ? ['sensitive'] : it.cats, s = it.stuck, tone = CAT_TONE[s.cat];
    const t = R.dueOf({ cats: it.cats, segment: it.segment, spot: st.spot, routedAt: Date.parse(st.routedAt) }), b = R.dueBucket(t, now);
    const noReach = s.missing === 'A way to reach the contact';
    const c = it.contact, first = c.firstName || c.name.split(' ')[0];
    const setField = (k: keyof Fields, v: string) => setWs(ww => ww && ww.fields ? { ...ww, fields: { ...ww.fields, [k]: v } } : ww);
    const mainKey: keyof Fields = x.channel === 'Email' ? 'body' : 'note';
    const showMe = (kind: string) => {
      const m = marks.find(z => z[2] === kind), ta = document.getElementById(x.channel === 'Email' ? 'dBody' : 'dNote') as HTMLTextAreaElement | null;
      if (!m || !ta) return;
      const el = document.querySelector(`#hlBack mark.k-${kind}`); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); }
      ta.focus({ preventScroll: true }); ta.setSelectionRange(m[0], m[1]);
    };
    const cut = (kind: string) => {
      const m = marks.find(z => z[2] === kind); if (!m) return;
      const tx = text; let s0 = m[0]; while (s0 > 0 && !/[.?!\n]/.test(tx[s0 - 1])) s0--;
      let e = m[1]; while (e < tx.length && !/[.?!\n]/.test(tx[e])) e++;
      if (/[.?!]/.test(tx[e] || '')) e++;
      const cite = tx.slice(e).match(/^\s*\[[^\]]+, \d{4}\]/); if (cite) e += cite[0].length;
      while (e < tx.length && tx[e] === ' ') e++;
      setField(mainKey, (tx.slice(0, s0).replace(/[ ]+$/, '') + (s0 && tx[s0 - 1] !== '\n' && tx[e] && tx[e] !== '\n' ? ' ' : '') + tx.slice(e)).replace(/\n{3,}/g, '\n\n'));
      showToast('Sentence removed. It is saved when you approve.');
    };
    const replaceClaim = (id: string) => {
      const cl = it.claims.find(z => z.id === id), u = chk.unsupported[0]; if (!cl || !u) return;
      const i0 = text.indexOf(u.text); if (i0 < 0) return;
      let e = i0 + u.text.length; const cite = text.slice(e).match(/^\s*\[[^\]]+, \d{4}\]/); if (cite) e += cite[0].length;
      setField(mainKey, text.slice(0, i0) + `${cl.claim} [${cl.type}, ${cl.year}]` + text.slice(e));
      showToast('Claim replaced with an approved one');
    };
    const fixRow = (k: string, title: string, body: ReactNode, acts: ReactNode) => <div key={k} className="fx" data-k={k}><div className="fx-h"><span className="fx-t">{title}</span>
      <span className="fx-st">{['sensitive', 'claim', 'brand'].includes(k) ? (marks.some(m => m[2] === k) ? <span className="fx-n">{marks.filter(m => m[2] === k).length} in the message</span> : <span className="fx-ok">✓ Gone from the message</span>) : null}</span></div>
      {body ? <div className="fx-d">{body}</div> : null}{acts ? <div className="fx-a">{acts}</div> : null}</div>;
    const showBtn = (k: string) => <button className="btn btn-ghost btn-sm" onClick={() => showMe(k)}>Show me ↓</button>;
    const deal = it.deal;
    const fixRows = mode === 'view' ? [] : cats.map(k => {
      if (k === 'sensitive') return fixRow(k, 'Sensitive content', <>{[...new Set((text.match(new RegExp(R.SENSITIVE_RE.source, 'gi')) || []).map(z => z.toLowerCase()))].map(z => <mark key={z} className="k-sensitive">{z}</mark>)} — highlighted in red in the message. {mode === 'approve' ? 'Keep it, edit it, or send it back.' : 'You can edit it; anything sensitive still goes to the sales manager.'}</>,
        <>{showBtn(k)}{canEdit ? <button className="btn btn-ghost btn-sm" onClick={() => cut('sensitive')}>Remove that sentence</button> : null}</>);
      if (k === 'claim') return fixRow(k, 'Claim with no source', <><mark className="k-claim">“{chk.unsupported[0]?.text || 'A claim'}”</mark> isn&apos;t an approved claim. Swap it for one that is, or take it out.</>,
        <>{showBtn(k)}{canEdit ? <><select className="fx-sel" value="" onChange={e => { if (e.target.value) replaceClaim(e.target.value); }}><option value="">Replace with an approved claim…</option>{it.claims.map(z => <option key={z.id} value={z.id}>{z.title} ({z.type}, {z.year})</option>)}</select>
          <button className="btn btn-ghost btn-sm" onClick={() => cut('claim')}>Remove it</button></> : null}</>);
      if (k === 'brand') return fixRow(k, 'Brand or rule check', <>{chk.flags.filter(z => z.rule !== 'Sensitive term').map(z => z.rule + ': ' + String(z.detail).replace(/"/g, '')).join(' · ') || 'A brand rule'}. <mark className="k-brand">Highlighted</mark> where it is in the text.</>, showBtn(k));
      if (k === 'reach') return fixRow(k, `A way to reach ${first}`, <>No verified email and no LinkedIn URL on file for {c.name}. Add one in <Link href="/prospecting" style={sx('color:var(--brand);font-weight:600')}>Prospecting</Link> (a correction to their row: it is kept and used when the list is rebuilt), and put this on hold meanwhile.</>, null);
      if (k === 'low') {
        const factor = (ok: boolean, tt: string) => <span className={`fx-f ${ok ? 'ok' : 'no'}`}>{ok ? '✓' : '✗'} {tt}</span>;
        const w2 = it.signal.weight || 0, others = it.people.filter(p => !p.optOut).slice(0, 3);
        return fixRow(k, 'Low confidence', <>{factor(!chk.unsupported.length, chk.claims.length ? `${chk.claims.length - chk.unsupported.length} of ${chk.claims.length} claims verified` : 'No product claims')}{factor(!chk.flags.length, chk.flags.length ? `${chk.flags.length} open flag${chk.flags.length > 1 ? 's' : ''}` : 'No open flags')}
          {factor(w2 >= 30, `${w2 >= 60 ? 'Strong' : w2 >= 30 ? 'Moderate' : 'Weak'} signal`)}{factor(it.resultConfidence !== 'low', it.resultConfidence === 'low' ? `No one in the primary persona: ${first} is ${c.jobTitle || 'in another role'}` : 'Contact in the primary persona')}</>,
          live ? <><button className="btn btn-sec btn-sm" onClick={() => void fix({ kind: 'low' })}>Yes, {first} is the right person</button>{others.map(p => <button key={p.row} className="btn btn-ghost btn-sm" onClick={() => void fix({ kind: 'low', contactRow: p.row! })}>Switch to {p.name} <span className="ws-sub">· {p.jobTitle || p.persona}</span></button>)}</> : null);
      }
      if (k === 'small') return fixRow(k, 'No micro-segment', `Fewer than ${CONFIG.minSegmentAccounts} accounts share its signal. Pick the one to release it into.`,
        live ? <><select className="fx-sel" id="assignSeg" value={w.seg} onChange={e => { const v = e.target.value; setWs(ww => ww && { ...ww, seg: v }); if (v) void fix({ kind: 'small', segment: v }); }}><option value="">Pick a micro-segment…</option>{it.run.segments.map(nm => <option key={nm}>{nm}</option>)}</select><span className="ws-sub">Suggested: {it.prominent}</span></> : null);
      if (k === 'deal') return fixRow(k, 'Below deal size', deal ? `About USD ${Math.round(deal.value / 1000)}k against a ${Math.round(it.dealThreshold / 1000)}k threshold (${deal.basis}).` : '', live ? <button className="btn btn-sec btn-sm" onClick={() => void fix({ kind: 'deal' })}>It&apos;s worth it anyway</button> : null);
      return null;
    }).filter(Boolean);
    const done = st.fixed.filter(k => R.REASON_CATS[k]);
    const hero = mode === 'view'
      ? <div className="ws-hero t-pos"><div className="ws-hero-tags"><span className={`tag ${R.statusLabel({ status: st.status, spot: st.spot, released: st.released, meeting: st.meeting }, !!it.paused)[1]}`}>{R.statusLabel({ status: st.status, spot: st.spot, released: st.released, meeting: st.meeting }, !!it.paused)[0]}</span></div>
        <div className="ws-hero-line">Nothing to decide: {R.statusLabel({ status: st.status, spot: st.spot, released: st.released, meeting: st.meeting }, !!it.paused)[0].toLowerCase()}{st.decidedBy ? ` by ${st.decidedBy}` : ''}.</div></div>
      : <div className={`ws-hero t-${mode === 'approve' ? 'neg' : tone}`}>
        <div className="ws-hero-tags">{mode === 'approve' ? <><span className="tag tag-violet">Approval</span><span className="tag tag-red">Sensitive content</span></> : <span className={`tag ${toneTag(tone)}`}>{s.label}</span>}
          {s.also.map(a => <span key={a} className="tag tag-grey">+ {a}</span>)}<span className={`tag ${b === 'overdue' || b === 'today' ? 'tag-red' : b === 'tomorrow' ? 'tag-amber' : 'tag-grey'}`}>{R.dueLabel(t, now)}</span>
          {st.holdWhy ? <span className="tag tag-grey">On hold: {st.holdWhy}</span> : null}</div>
        <div className="ws-hero-line">{s.line}</div>
        <div className="ws-hero-call">{mode === 'approve' ? `Approve it, edit it first, send it back to ${(it.owner.name || 'the rep').split(' ')[0]}, or reject it.` : s.call}</div>
        {fixRows.length || done.length ? <div className="fxs"><div className="fxs-h">{fixRows.length ? 'How to fix it' : 'Fixed'} {done.length ? <span className="fxs-done">{done.map(k => `✓ ${R.REASON_CATS[k]}`).join(' · ')}</span> : null}</div>{fixRows}</div> : null}
      </div>;
    const A = it.options.recommended, B = it.options.runnerUp;
    const opt = (title: string, o: typeof A, chosen: boolean, use: 'recommended' | 'runner-up') => <div className={`opt ${chosen ? 'on' : ''} ${canEdit && !chosen ? 'pickable' : ''}`} onClick={canEdit && !chosen ? () => void pick(use) : undefined}>
      <div className="opt-h"><span>{title}</span>{chosen ? <span className="opt-ck">✓ Chosen</span> : canEdit ? <span className="opt-use">Use this →</span> : null}</div>
      <div className="opt-a">{o.action}</div><div className="opt-w">{String(o.reason || '').replace(/^[^:]{3,40}:\s*/, '').replace(/^./, m2 => m2.toUpperCase())}</div>
      <div className="opt-m"><span className="tag tag-grey">{o.channel}</span><span className={`tag ${o.conf === 'High' ? 'tag-green' : o.conf === 'Medium' ? 'tag-amber' : 'tag-red'}`}>{o.conf} confidence</span>{o.ok ? null : <span className="tag tag-red">✗ {o.flags[0] || 'A check fails'}</span>}</div></div>;
    const ownBar = st.manualAction
      ? <div className="own own-on"><span className="own-i">✎</span><div className="own-b"><div className="own-k">Your action · chosen</div><div className="own-a">{st.manualAction}</div></div>
        {live ? <><button className="btn btn-ghost btn-sm" onClick={() => setWs(ww => ww && { ...ww, own: true })}>Change</button><button className="btn btn-ghost btn-sm" onClick={() => void pick('recommended')}>Use the recommended</button></> : null}</div>
      : w.own ? <div className="own own-edit"><div className="own-k">Your own action</div>
        <textarea id="manualAct" className="ws-in" rows={2} autoFocus value={w.ownText} onChange={e => { const v = e.target.value; setWs(ww => ww && { ...ww, ownText: v }); }} placeholder="What should happen instead? e.g. Invite them to the site visit in May"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void pick('own'); } }} />
        <div className="own-f"><span className="ws-sub">The message is redrafted for your action, then you approve it as usual.</span><button className="btn btn-ghost btn-sm" onClick={() => setWs(ww => ww && { ...ww, own: false })}>Cancel</button><button className="btn btn-primary btn-sm" onClick={() => void pick('own')}>Use my action</button></div></div>
      : live ? <button className="own own-add" onClick={() => setWs(ww => ww && { ...ww, own: true })}><span className="own-i">✎</span><span><b>Neither fits?</b> Write your own action</span><kbd>W</kbd></button> : null;
    const ro = !canEdit;
    const words = x.channel === 'Email' ? `${f.body.split(/\s+/).filter(Boolean).length} words` : x.channel === 'LinkedIn' ? `${f.note.length}/${CONFIG.brand.maxNote}` : '';
    const msg = <div className="ws-card ws-msg">
      <div className="wm-to"><div className="co-av" style={{ background: avColor(c.name) }}>{initials(c.name)}</div>
        <div className="wm-who"><b>{c.name}</b><span>{c.jobTitle}{c.persona ? ` · ${c.persona} persona` : ''}</span></div>
        <div className="wm-reach">{x.channel === 'Email' ? (c.email ? <>{c.email} {c.emailVerified ? <span className="tag tag-green">Verified</span> : <span className="tag tag-amber">Not verified</span>}</> : <span className="tag tag-red">No email on file</span>)
          : x.channel === 'LinkedIn' ? (c.linkedin ? <><span className="ws-sub">LinkedIn ·</span> {c.linkedin.replace(/^https?:\/\/(www\.)?/, '')}</> : 'LinkedIn connection note') : 'A task for the team'}</div></div>
      {x.channel === 'Email' ? <><input id="dSubj" className="ws-in ws-subj" value={f.subject} readOnly={ro} aria-label="Subject" onChange={e => setField('subject', e.target.value)} />
        <div className="hl"><div className="hl-back ws-in ws-body" id="hlBack" aria-hidden="true">{highlighted(f.body, marks)}</div><textarea id="dBody" className="ws-in ws-body hl-ta" readOnly={ro} aria-label="Message" value={f.body} onChange={e => setField('body', e.target.value)} style={sx('min-height:160px')} rows={Math.max(8, f.body.split('\n').length + 1)} /></div></>
        : x.channel === 'LinkedIn' ? <div className="hl"><div className="hl-back ws-in" id="hlBack" aria-hidden="true">{highlighted(f.note, marks)}</div><textarea id="dNote" className="ws-in hl-ta" style={sx('min-height:96px')} readOnly={ro} aria-label="Connection note" value={f.note} onChange={e => setField('note', e.target.value)} /></div>
        : <textarea id="dTask" className="ws-in" readOnly={ro} aria-label="Task" value={f.task} onChange={e => setField('task', e.target.value)} rows={4} />}
      <div className="wm-foot"><div className="ws-checks">{chk.flags.length || chk.unsupported.length ? <>{chk.flags.map((fl, k) => <span key={'f' + k} className={`tag ${fl.rule === 'Sensitive term' ? 'tag-red' : 'tag-amber'}`} title={fl.detail}>✗ {fl.rule}</span>)}{chk.unsupported.map((u, k) => <span key={'u' + k} className="tag tag-red" title={u.text}>✗ Claim with no source</span>)}</> : <span className="wm-ok">✓ Brand and claims pass</span>}</div>
        <span style={sx('flex:1')}></span><span className="ws-sub">{words}</span>{x.channel !== 'Task' && st.status === 'Released' ? <button className="btn btn-sec btn-sm" onClick={() => { const tx = x.channel === 'Email' ? `${f.subject}\n\n${f.body}` : f.note; if (navigator.clipboard) navigator.clipboard.writeText(tx).then(() => showToast('Copied'), () => showToast("Couldn't copy here")); }}>Copy</button> : null}</div>
    </div>;
    const failing = it.fourChecks.filter(z => !z.ok);
    const tr = it.trackRecord.segment ?? it.trackRecord.all;
    const fact = (k: string, v: ReactNode) => <div className="kf"><div className="kf-k">{k}</div><div className="kf-v">{v}</div></div>;
    const facts = <div className="ws-card ws-kf"><div className="ws-card-h"><span>Key facts</span></div>
      {fact('Why now', <><b>{it.signal.type || 'Signal'}</b>{it.signal.age !== undefined ? <span className="ws-sub"> · {it.signal.age} days ago</span> : null}<div className="ws-sub">{String(it.reason).replace(/^[^:]{3,40}:\s*/, '').replace(/^./, m2 => m2.toUpperCase())}</div></>)}
      {fact('Checks', failing.length ? <>{failing.map(z => <span key={z.name} className="tag tag-red">✗ {z.name}</span>)} <span className="ws-sub">the rest pass</span></> : <span className="tag tag-green">✓ All pass</span>)}
      {fact('Confidence', <span className={`tag ${it.confidence.level === 'High' ? 'tag-green' : it.confidence.level === 'Medium' ? 'tag-amber' : 'tag-red'}`}>{it.confidence.level}</span>)}
      {fact('Track record', tr.n ? <>Reps agreed <b>{tr.a} of {tr.n}</b> times{it.trackRecord.segment ? ` in ${it.segment}` : ''}{tr.early ? <span className="ws-sub"> · early days</span> : null}</> : <span className="ws-sub">No decisions yet</span>)}
      {fact('Owner', it.owner.name || it.owner.email || 'Unassigned')}
      <details className="kf-more"><summary style={sx('cursor:pointer;color:var(--brand);font-weight:600')}>Show the working</summary>
        <div style={sx('margin-top:8px;font-size:12px;color:var(--i1);line-height:1.5')}>
          <div className="ws-sub" style={sx('margin:6px 0 2px')}>Signals on {c.name}</div>{it.person.signals.map((sg, k) => <div key={k} style={sx('padding:4px 0;border-top:1px solid var(--s75)')}><b>{sg.type}</b> <span className="ws-sub">{sg.age !== undefined ? `${sg.age} days ago` : ''}{sg.source ? ' · ' + sg.source : ''}</span><div className="ws-sub">{sg.detail}</div></div>)}
          <div className="ws-sub" style={sx('margin:8px 0 2px')}>The brief</div><div>Angle: {it.brief.angle}</div><div>Proof: {it.brief.proof ? `${it.brief.proof.title} (${it.brief.proof.type}, ${it.brief.proof.year})` : 'none approved'}</div><div>Objection: {it.brief.objection}</div><div className="ws-sub">{it.confidence.reason}</div>
          <div className="ws-sub" style={sx('margin:8px 0 2px')}>Versions</div>{it.versions.map(v => <div key={v.version}>v{v.version} · {v.reason} <span className="ws-sub">· {v.by} · {fmtDate(v.at)}</span></div>)}
          <div className="ws-sub" style={sx('margin:8px 0 2px')}>History</div>{it.history.map(l => <div key={l.id} style={sx('padding:3px 0;border-top:1px solid var(--s75)')}><b>{l.decision}</b> <span className="ws-sub">· {l.who} · {fmtDate(l.at)} {timeOf(l.at)}</span>{l.note ? <div className="ws-sub">{l.note}</div> : null}</div>)}
        </div></details>
    </div>;
    const sensitive = chk.flags.some(z => z.rule === 'Sensitive term');
    const approveLbl = sensitive && !mgr && mode !== 'approve' && st.spot !== 'pending' ? 'Approve, send to manager' : 'Approve';
    const buttons = mode === 'approve' ? (it.can.approve ? <><button className="btn btn-sec" onClick={() => { setSendNote(''); setWs(ww => ww && { ...ww, modal: 'send' }); }}>Send back</button>
      <button className="btn btn-sec" onClick={() => { setRj({ code: null, note: '' }); setWs(ww => ww && { ...ww, modal: 'reject' }); }}>Reject <kbd>R</kbd></button><button className="btn btn-primary" disabled={busy} onClick={() => void approve()}>{approveLbl} <kbd>A</kbd></button></> : <span className="ws-sub">Waiting for the sales manager.</span>)
      : mode === 'view' ? <button className="btn btn-sec" onClick={leave}>Back to the list</button>
        : !live ? <span className="ws-sub">{it.paused ? 'Its micro-segment is paused.' : `In ${it.owner.name || 'another rep'}'s queue.`}</span>
          : <>{st.holdWhy ? <button className="btn btn-ghost" onClick={() => void unhold()}>Take off hold</button> : <button className={`btn ${noReach ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setHold({ why: R.HOLD_WHY[0], note: '' }); setWs(ww => ww && { ...ww, modal: 'hold' }); }}>Put on hold</button>}
            <button className="btn btn-sec" onClick={() => { setRj({ code: null, note: '' }); setWs(ww => ww && { ...ww, modal: 'reject' }); }}>Reject <kbd>R</kbd></button>
            {noReach ? null : <button className="btn btn-primary" disabled={busy} onClick={() => void accept()}>{approveLbl} <kbd>A</kbd></button>}</>;
    return <>
      {top}
      <div className="ws">
        <div className="ws-scroll">
          {hero}
          <div className="ws-grid">
            <div className="ws-col">{mode === 'view' ? null : <><div className={`opts${B ? '' : ' one'}`}>{opt('Recommended', A, !st.manualAction && !st.useRunnerUp, 'recommended')}{B ? opt('Runner-up', B, !st.manualAction && st.useRunnerUp, 'runner-up') : null}</div>{ownBar}</>}{msg}</div>
            <div className="ws-col">{facts}</div>
          </div>
        </div>
        <div className="ws-dock"><div className="ws-dock-row"><span style={sx('flex:1;font-size:11.5px;color:var(--i3)')}>{it.run.name} · checked as of {it.checkDate}</span><div className="ws-dec">{buttons}</div></div></div>
      </div>
      {w.modal === 'hold' ? <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) setWs(ww => ww && { ...ww, modal: null }); }}><div className="ws-modal" role="dialog" aria-modal="true" aria-label="Put on hold">
        <div className="ws-modal-h">Put on hold</div><div className="ws-sub" style={sx('margin-bottom:10px')}>It stays in your queue, at the end, until you take it off hold. Nothing is sent.</div>
        {R.HOLD_WHY.map(h => <label key={h} className="ws-radio"><input type="radio" name="holdWhy" checked={hold.why === h} onChange={() => setHold(hh => ({ ...hh, why: h }))} /> {h}</label>)}
        <input className="ws-in" value={hold.note} onChange={e => setHold(hh => ({ ...hh, note: e.target.value }))} placeholder="What are you waiting for? (optional)" style={sx('margin-top:8px')} />
        <div className="ws-modal-f"><button className="btn btn-ghost" onClick={() => setWs(ww => ww && { ...ww, modal: null })}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => void doHold()}>Put on hold</button></div></div></div> : null}
      {w.modal === 'reject' ? <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) setWs(ww => ww && { ...ww, modal: null }); }}><div className="ws-modal" style={sx('max-width:620px')} role="dialog" aria-modal="true" aria-label="Why reject it?">
        <div className="ws-modal-h">Why reject it?</div><div className="ws-sub" style={sx('margin-bottom:10px')}>The reason decides what happens next.{st.alternativeUsed ? ' This is already the alternative, so a rejection closes the account for the pilot.' : ''}</div>
        <div className="ws-rj">{R.REJECT.map(([code, l, wh]) => <button key={code} className={'ws-rjb' + (rj.code === code ? ' on' : '')} onClick={() => setRj(r => ({ ...r, code }))}><b>{l}</b><span>{wh}</span></button>)}</div>
        <input className="ws-in" value={rj.note} onChange={e => setRj(r => ({ ...r, note: e.target.value }))} placeholder="Comment (needed for Other)" style={sx('margin-top:10px')} />
        <div className="ws-modal-f"><button className="btn btn-ghost" onClick={() => setWs(ww => ww && { ...ww, modal: null })}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => void reject()}>Reject</button></div></div></div> : null}
      {w.modal === 'send' ? <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) setWs(ww => ww && { ...ww, modal: null }); }}><div className="ws-modal" role="dialog" aria-modal="true" aria-label="Send it back">
        <div className="ws-modal-h">Send it back</div><div className="ws-sub" style={sx('margin-bottom:8px')}>It goes back to {it.owner.name || 'the rep'}&apos;s queue with your note.</div>
        <textarea className="ws-in" autoFocus value={sendNote} onChange={e => setSendNote(e.target.value)} style={sx('min-height:70px')} placeholder="What should change?" />
        <div className="ws-modal-f"><button className="btn btn-ghost" onClick={() => setWs(ww => ww && { ...ww, modal: null })}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => void doSendBack()}>Send back</button></div></div></div> : null}
    </>;
  }

  /* Teach the system: a short card after each decision. Optional, it goes away on its own unless it is being used. */
  function teachCard(tc: Teach): ReactNode {
    const tags = tc.rejected ? R.WRONG_TAGS : R.ACCEPT_TAGS;
    return <div className={'teach-pop' + (tc.held ? ' held' : '')} onMouseEnter={() => setTeach(t => t && { ...t, held: true })} onFocus={() => setTeach(t => t && { ...t, held: true })}>
      <div className="tp-h"><span>✦ Teach the system</span><span className="tp-sub">{tc.decision}</span><button onClick={() => setTeach(null)} title="Skip" aria-label="Skip">✕</button></div>
      <div className="tp-l">{tc.rejected ? 'What was wrong?' : 'What did it get right?'}</div>
      <div className="tp-tags">{tags.map(tg => <button key={tg} className={'tp-tag' + (tc.tags.includes(tg) ? ' on' : '')} onClick={() => setTeach(t => t && { ...t, held: true, tags: t.tags.includes(tg) ? t.tags.filter(z => z !== tg) : [...t.tags, tg] })}>{tg}</button>)}</div>
      <input value={tc.note} onChange={e => { const v = e.target.value; setTeach(t => t && { ...t, held: true, note: v }); }} onKeyDown={e => { if (e.key === 'Enter') void saveTeach(); }} placeholder="What should it do next time for accounts like this?" aria-label="Note" />
      <div className="tp-f"><span className="tp-bar"><i></i></span><button className="btn btn-ghost btn-sm" onClick={() => setTeach(null)}>Skip</button><button className="btn btn-primary btn-sm" onClick={() => void saveTeach()}>Save</button></div>
    </div>;
  }

  return <>
    <main className="main" id="mainArea" onClick={() => { if (menu) setMenu(null); if (exportOpen) setExportOpen(false); }}>{ws ? wsScreen(ws) : listScreen()}</main>
    {colMenu()}
    {teach ? teachCard(teach) : null}
  </>;
}
