'use client';

/* Setup sections that are lists of their own (30 Oct 2026): the action library (5), the micro-segments the AI or a
   person created (6) and the measurement and proceed criteria (7, moved from Analytics › Validation). Each saves as
   the next configuration version (actions, criteria) or as a decision kept with who made it (segments). */
import { useEffect, useMemo, useState } from 'react';
import { sx } from '@/lib/sx';
import { showToast } from '@/lib/ui';
import { ApiError, api, errorText, type WireDeep } from '@/lib/client/api';
import { actionChanges, newActionId, type LibraryAction } from '@/lib/engine/actions';
import { validationChanges, type ValidationSettings } from '@/lib/engine/gates';
import type { ActionRow } from '@/lib/server/services/setup';
import type { SegmentRow } from '@/lib/server/services/segments';

const fieldError = (e: unknown) => (e instanceof ApiError && e.fields ? Object.values(e.fields).flat()[0] ?? errorText(e) : errorText(e));
const pct = (a: number, n: number) => (n ? `${Math.round(a / n * 100)}%` : '—');

/* ─── 5 · Actions ─── */
export function ActionsSection({ rows, edit, canEdit, segments, signalTypes, problem, onSaved }: {
  rows: WireDeep<ActionRow>[]; edit: boolean; canEdit: boolean; segments: string[]; signalTypes: string[]; problem: string | null; onSaved: () => void;
}) {
  const saved: LibraryAction[] = useMemo(() => rows.map(({ judged: _j, accepted: _a, ...a }) => { void _j; void _a; return a as LibraryAction; }), [rows]);
  const [draft, setDraft] = useState<LibraryAction[] | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = draft ?? saved, changes = draft ? actionChanges(saved, draft) : [];
  const change = (i: number, patch: Partial<LibraryAction>) => setDraft(d => (d ?? saved).map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const stat = (name: string) => rows.find(r => r.name === name);
  async function save() {
    setBusy(true); setError('');
    try { const r = await api<{ versionNo: number }>('/api/config/actions', { method: 'PUT', body: { actions: draft, reason } }); showToast(`Action library saved · Config v${r.versionNo}`); setDraft(null); setReason(''); onSaved(); }
    catch (e) { setError(fieldError(e)); }
    setBusy(false);
  }
  const editing = edit && canEdit;
  return <>
    <div className="su-sub" style={sx('margin-bottom:10px')}>What this team typically does. The AI prefers an action from this list when one fits the account&apos;s signals; an action it suggests from outside the list waits in For Review as “New action: not in the action library”. When the AI is off, the rules take the first active action linked to the micro-segment, then the next as the runner-up.</div>
    {problem ? <div role="alert" className="ed-err">{problem}</div> : null}
    <table className="au ed-tab"><thead><tr><th style={sx('width:24%')}>Action</th><th>What it means and when to use it</th><th style={sx('width:18%')}>Suits</th><th style={sx('width:12%')}>Micro-segment</th><th style={sx('width:9%')}>Accepted</th><th style={sx('width:9%')}>Status</th></tr></thead><tbody>
      {list.map((a, i) => { const s = stat(a.name); return <tr key={a.id} className={a.status === 'retired' ? 'is-off' : ''}>
        <td>{editing ? <input className="ed-t" aria-label="Action name" value={a.name} maxLength={120} onChange={e => change(i, { name: e.currentTarget.value })} /> : <b>{a.name}</b>}</td>
        <td>{editing ? <textarea className="ed-ta" aria-label={`What ${a.name} means`} rows={2} value={a.about} maxLength={600} onChange={e => change(i, { about: e.currentTarget.value })} /> : a.about || <span className="su-sub">—</span>}</td>
        <td>{editing ? <div className="chips">{a.suits.map(t => <span key={t} className="chip">{t}<button aria-label={`Remove ${t}`} onClick={() => change(i, { suits: a.suits.filter(x => x !== t) })}>×</button></span>)}
          <select aria-label="Add a signal it suits" value="" onChange={e => { const t = e.currentTarget.value; if (t) change(i, { suits: [...a.suits, t] }); }}><option value="">+ signal…</option>{signalTypes.filter(t => !a.suits.includes(t)).map(t => <option key={t}>{t}</option>)}</select></div>
          : a.suits.join(', ') || <span className="su-sub">—</span>}</td>
        <td>{editing ? <select aria-label="Micro-segment" value={a.segment} onChange={e => change(i, { segment: e.currentTarget.value })}><option value="">None</option>{[...new Set([...segments, a.segment].filter(Boolean))].map(x => <option key={x}>{x}</option>)}</select> : a.segment || <span className="su-sub">None</span>}</td>
        <td title={s ? `${s.accepted} of ${s.judged} decisions accepted it` : 'Not judged yet'}>{s && s.judged ? `${pct(s.accepted, s.judged)} of ${s.judged}` : <span className="su-sub">Not yet</span>}</td>
        <td>{editing ? <button className={`sw ${a.status === 'active' ? 'on' : ''}`} role="switch" aria-checked={a.status === 'active'} aria-label={`${a.name} active`} onClick={() => change(i, { status: a.status === 'active' ? 'retired' : 'active' })}><i></i></button> : null}
          <span className={`pill ${a.status === 'active' ? 'on' : 'off'}`}>{a.status === 'active' ? 'Active' : 'Retired'}</span></td>
      </tr>; })}
    </tbody></table>
    {editing ? <div className="ed-add"><button className="btn btn-sec btn-sm" onClick={() => setDraft(d => { const cur = d ?? saved; return [...cur, { id: newActionId(cur, 'new action'), name: 'New action', about: '', suits: [], segment: '', status: 'active' }]; })}>+ Add an action</button></div> : null}
    {changes.length ? <div className="ed-bar"><div className="ed-bar-h"><b>{`${changes.length} unsaved change${changes.length === 1 ? '' : 's'} to the action library`}</b></div>
      <ul className="ed-ch">{changes.map(c => <li key={c}>{c}</li>)}</ul>
      <label className="af"><span>Why (optional)</span><input value={reason} maxLength={500} onChange={e => setReason(e.currentTarget.value)} /></label>
      {error ? <div role="alert" className="ed-err">{error}</div> : null}
      <div style={sx('display:flex;gap:8px;justify-content:flex-end')}><button className="btn btn-ghost btn-sm" onClick={() => { setDraft(null); setError(''); }}>Discard</button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save as a new version'}</button></div></div> : null}
  </>;
}

/* ─── 6 · Micro-segments ─── */
const STATUS: Record<string, [string, string]> = { waiting: ['Waiting for approval', 'sc-m'], approved: ['Approved', 'sc-h'], retired: ['Retired', 'sc-l'] };
export function SegmentsSection({ canDecide, reloadKey, onChanged }: { canDecide: boolean; reloadKey: number; onChanged: (names: string[]) => void }) {
  const [rows, setRows] = useState<WireDeep<SegmentRow>[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<{ id: string; kind: 'rename' | 'merge' } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api<{ segments: WireDeep<SegmentRow>[] }>('/api/segments').then(r => { setRows(r.segments); onChanged(r.segments.filter(s => s.status !== 'retired').map(s => s.name)); }, e => setError(errorText(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [reloadKey]);
  async function decide(id: string, body: Record<string, string>) {
    setBusy(true);
    try { const r = await api<{ message: string }>(`/api/segments/${id}`, { body }); showToast(r.message); setOpen(null); setText(''); await load(); }
    catch (e) { showToast(fieldError(e)); }
    setBusy(false);
  }
  if (!rows) return <div className="su-sub" role={error ? 'alert' : 'status'}>{error || 'Loading…'}</div>;
  const waiting = rows.filter(r => r.status === 'waiting').length;
  const active = rows.filter(r => r.status !== 'retired');
  return <>
    <div className="su-sub" style={sx('margin-bottom:10px')}>{'Every micro-segment in use. The AI forms one only when at least 3 accounts share it and reuses an existing one whose theme fits. A new one waits for the sales manager’s approval before any of its items go out; once approved it stays for later lists. '}{waiting ? <b>{`${waiting} waiting for approval.`}</b> : null}</div>
    <table className="au ed-tab"><thead><tr><th style={sx('width:20%')}>Micro-segment</th><th>Theme and why</th><th style={sx('width:14%')}>Created by</th><th style={sx('width:13%')}>Status</th><th style={sx('width:8%')}>Accounts</th><th style={sx('width:6%')}>Lists</th><th style={sx('width:18%')}></th></tr></thead><tbody>
      {rows.map(r => <tr key={r.id ?? r.name} className={r.status === 'retired' ? 'is-off' : ''}>
        <td><b>{r.name}</b>{r.formerNames.length ? <div className="su-sub">{`Was ${r.formerNames.join(', ')}`}</div> : null}</td>
        <td>{r.theme !== r.name ? r.theme : ''}{r.why ? <div className="su-sub">{r.why}</div> : null}</td>
        <td>{r.origin === 'rules' ? <span className="pill nr">Rules</span> : r.origin === 'ai' ? <span className="tag tag-violet">Created by AI</span> : `Created by ${r.createdBy ?? 'a person'}`}</td>
        <td><span className={`sc ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>{r.mergedInto ? <div className="su-sub">{`Merged into ${r.mergedInto}`}</div> : r.decidedBy && r.origin !== 'rules' ? <div className="su-sub">{`${r.decidedBy}${r.decidedAt ? ' · ' + new Date(r.decidedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}`}</div> : null}
          {r.waiting ? <div className="su-sub">{`${r.waiting} item${r.waiting === 1 ? '' : 's'} waiting`}</div> : null}</td>
        <td>{r.accounts}</td><td>{r.lists}</td>
        <td>{canDecide && r.id ? open?.id === r.id ? <div className="ed-inline">
          {open.kind === 'rename' ? <input autoFocus aria-label="New name" value={text} maxLength={60} onChange={e => setText(e.currentTarget.value)} />
            : <select aria-label="Merge into" value={text} onChange={e => setText(e.currentTarget.value)}><option value="">Merge into…</option>{active.filter(x => x.name !== r.name).map(x => <option key={x.name} value={x.id ?? x.name}>{x.name}</option>)}</select>}
          <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={() => void decide(r.id!, open.kind === 'rename' ? { action: 'rename', name: text } : { action: 'merge', into: text })}>{open.kind === 'rename' ? 'Rename' : 'Merge'}</button>
          <button className="link" onClick={() => { setOpen(null); setText(''); }}>Cancel</button></div>
          : <div className="ed-inline">{r.status === 'waiting' ? <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void decide(r.id!, { action: 'approve' })}>Approve</button> : null}
            {r.status !== 'retired' ? <><button className="link" onClick={() => { setOpen({ id: r.id!, kind: 'rename' }); setText(r.name); }}>Rename</button>
              <button className="link" onClick={() => { setOpen({ id: r.id!, kind: 'merge' }); setText(''); }}>Merge</button>
              <button className="link" disabled={busy} onClick={() => void decide(r.id!, { action: 'retire' })}>Retire</button></>
              : !r.mergedInto ? <button className="link" disabled={busy} onClick={() => void decide(r.id!, { action: 'restore' })}>Restore</button> : null}</div> : null}</td>
      </tr>)}
    </tbody></table>
  </>;
}

/* ─── 7 · Measurement and proceed criteria (was Analytics › Validation) ─── */
type Field = { k: keyof ValidationSettings; label: string; unit: string; help: string; scale?: number };
const FIELDS: Field[] = [
  { k: 'g1BaselineMinutes', label: 'G1 baseline', unit: 'min', help: 'Minutes a person spent on one usable first action before the pilot (the Client times it).' },
  { k: 'g1Threshold', label: 'G1 threshold', unit: '% less', help: 'G1 passes when review time is at least this much less than the baseline.' },
  { k: 'g2Threshold', label: 'G2 threshold', unit: '% accepted', help: 'G2 passes when this share of recommendations is accepted first time.' },
  { k: 'minDecisions', label: 'Too early to call below', unit: 'decisions', help: 'No pass or fail until this many decisions are counted.' },
  { k: 'spotCheckShare', label: 'Weekly spot-check', unit: '% of what went ahead', help: 'Share of each rep’s items that went ahead on their own, drawn each week to rate (at least 1).', scale: 100 },
  { k: 'dealSizeThreshold', label: 'Deal-size threshold', unit: 'USD', help: 'An item whose estimated first deal is below this goes to For Review as “Below deal size”. 0 switches the rule off.' },
];
export function MeasurementSection({ saved, edit, canEdit, onSaved }: { saved: ValidationSettings; edit: boolean; canEdit: boolean; onSaved: () => void }) {
  const [draft, setDraft] = useState<ValidationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cur = draft ?? saved, changes = draft ? validationChanges(saved, draft) : [];
  const editing = edit && canEdit;
  async function save() {
    setBusy(true); setError('');
    try {
      const body = Object.fromEntries(Object.entries(draft!).filter(([k, v]) => v !== saved[k as keyof ValidationSettings]));
      const r = await api<{ versionNo: number }>('/api/analytics/validation', { method: 'PATCH', body });
      showToast(`Measurement criteria saved · Config v${r.versionNo}`); setDraft(null); onSaved();
    } catch (e) { setError(fieldError(e)); }
    setBusy(false);
  }
  return <>
    <div className="su-sub" style={sx('margin-bottom:10px')}>How the pilot is judged and what goes to a person. Analytics reads these; every change is a new configuration version, so each reading names the settings it was judged by.</div>
    <div className="ed-grid">{FIELDS.map(f => { const v = cur[f.k] as number, shown = f.scale ? Math.round(v * f.scale) : v;
      return <label key={f.k}><span>{f.label}</span>{editing ? <span><input type="number" className="ed-n" style={{ width: f.k === 'dealSizeThreshold' ? 120 : 72 }} aria-label={f.label} value={shown}
        onChange={e => { const n = Number(e.currentTarget.value); setDraft(d => ({ ...(d ?? saved), [f.k]: f.scale ? n / f.scale : n })); }} /> {f.unit}</span>
        : <b>{f.k === 'dealSizeThreshold' ? `USD ${Math.round(v / 1000)}k` : `${shown} ${f.unit}`}</b>}<em>{f.help}</em></label>; })}
      <label><span>Baseline timed by the Client</span>{editing ? <span><input type="checkbox" checked={cur.g1BaselineTimed} onChange={e => { const c = e.currentTarget.checked; setDraft(d => ({ ...(d ?? saved), g1BaselineTimed: c })); }} /> Yes</span>
        : <b>{cur.g1BaselineTimed ? 'Yes' : 'Not yet: a placeholder'}</b>}<em>Until it is, G1 compares against a placeholder.</em></label></div>
    {changes.length ? <div className="ed-bar"><ul className="ed-ch">{changes.map(c => <li key={c}>{c}</li>)}</ul>{error ? <div role="alert" className="ed-err">{error}</div> : null}
      <div style={sx('display:flex;gap:8px;justify-content:flex-end')}><button className="btn btn-ghost btn-sm" onClick={() => { setDraft(null); setError(''); }}>Discard</button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save as a new version'}</button></div></div> : null}
  </>;
}
