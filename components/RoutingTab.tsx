'use client';

/* Account Scoring › Routing (D-34, success area 4): how this run's scored accounts route under the unit's rules, by
   tier, country and vertical: the owner a rule gives an account the lead file left without one, and the business unit
   it belongs to. A manager who is also a manager of that unit moves the account there: its rows go as a lead file and
   arrive as a saved list; this unit stops handing it off. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sx } from '@/lib/sx';
import { api, errorText, type WireDeep } from '@/lib/client/api';
import { showToast } from '@/lib/ui';
import { useCan, useSessionUser } from '@/components/SessionContext';
import type { runRouting } from '@/lib/server/services/routing';

type Routing = WireDeep<Awaited<ReturnType<typeof runRouting>>>;
type Row = Routing['rows'][number];
type Move = { row: Row; to: string; reason: string; error: string; busy: boolean };
const OVERLAY = sx('position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px');
const TIER_TONE: Record<string, string> = { A: 'tag-green', B: 'tag-amber', C: 'tag-blue', 'Watch list': 'tag-grey' };
const FILTERS: [string, string][] = [['all', 'All'], ['other', 'Belongs to another unit'], ['noowner', 'No owner in the file'], ['moved', 'Moved']];

export function RoutingTab({ runId }: { runId: string }) {
  const me = useSessionUser();
  const canMove = useCan('routing.transfer');
  const [data, setData] = useState<Routing | null>(null);
  const [error, setError] = useState('');
  const [filt, setFilt] = useState('all');
  const [q, setQ] = useState('');
  const [move, setMove] = useState<Move | null>(null);
  useEffect(() => { api<Routing>(`/api/scoring-runs/${encodeURIComponent(runId)}/routing`).then(setData, err => setError(errorText(err))); }, [runId]);

  // Units this person may move accounts to: where they are a sales manager or an admin.
  const targets = me.memberships.filter(m => m.businessUnitId !== me.activeBusinessUnit?.id && (m.role === 'Admin' || m.role === 'Sales manager'));
  async function doMove() {
    if (!move) return;
    if (move.reason.trim().length < 3) { setMove(m => m && { ...m, error: 'Give a short reason.' }); return; }
    setMove(m => m && { ...m, busy: true, error: '' });
    try {
      const r = await api<{ toUnit: string; rows: number }>(`/api/accounts/${encodeURIComponent(move.row.accountId)}/transfer`, { body: { toBusinessUnitId: move.to, reason: move.reason } });
      showToast(`${move.row.name} moved to ${r.toUnit}: ${r.rows} row${r.rows === 1 ? '' : 's'} sent; it arrives there as a saved list`);
      setMove(null);
      setData(await api<Routing>(`/api/scoring-runs/${encodeURIComponent(runId)}/routing`));
    } catch (err) { setMove(m => m && { ...m, busy: false, error: errorText(err) }); }
  }

  if (error) return <div role="alert" style={sx('color:var(--neg);font-size:12.5px')}>{error}</div>;
  if (!data) return <div style={sx('font-size:12.5px;color:var(--i3)')}>Loading…</div>;
  let rows = data.rows;
  if (filt === 'other') rows = rows.filter(r => r.suggestedUnit && !r.transferred);
  if (filt === 'noowner') rows = rows.filter(r => !r.owner);
  if (filt === 'moved') rows = rows.filter(r => r.transferred);
  if (q) rows = rows.filter(r => `${r.name} ${r.country} ${r.vertical}`.toLowerCase().includes(q));
  return <>
    <div style={sx('font-size:12.5px;color:var(--i2);margin:0 0 12px;line-height:1.55')}>
      {data.rules ? <><b>{data.rows.length}</b> scored accounts. <b>{data.toOtherUnits}</b> belong to another business unit under the routing rules; <b>{data.unassigned}</b> have no owner in the lead file{data.unassigned ? ', and take the owner their rule names when they are sent to NBA' : ''}.</>
        : <>No routing rules yet: every account stays with the owner the lead file names, in this unit.</>} <Link href="/setup#sec-routing" style={sx('color:var(--brand);font-weight:600;text-decoration:none')}>Routing rules in Setup →</Link></div>
    <div className="score-list">
      <div className="sl-toolbar">
        <div className="sl-srch"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={sx('color:var(--i3);flex-shrink:0')}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input type="text" aria-label="Search accounts" placeholder="Search accounts, countries or verticals…" value={q} onChange={e => setQ(e.target.value.toLowerCase())} /></div>
        <div className="sl-seg-filter">{FILTERS.map(([k, l]) => <div key={k} className={'seg-pill' + (filt === k ? ' active' : '')} onClick={() => setFilt(k)}>{l}</div>)}</div>
      </div>
      <div className="dt-wrap"><table className="dt">
        <colgroup>{['24%', '9%', '17%', '17%', '15%', '18%'].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead><tr><th>Account</th><th>Tier</th><th>Owner</th><th>Rule</th><th>Belongs to</th><th></th></tr></thead>
        <tbody>{rows.length ? rows.map(r => <tr key={r.accountId}>
          <td><span className="dt-main" title={r.name}>{r.name}</span><span className="sub">{r.country} · {r.vertical}</span></td>
          <td><span className={`tag ${TIER_TONE[r.tier] || 'tag-grey'}`}>{r.tier === 'Watch list' ? 'Watch list' : 'Tier ' + r.tier}</span></td>
          <td>{r.owner ? <><span className="val">{r.ownerName ?? r.owner}</span>{r.ownerName ? <span className="sub">{r.owner}</span> : null}</>
            : <><span className="val" style={sx('color:var(--warn)')}>No owner in the file</span><span className="sub">{r.suggestedOwnerName ? `Rule gives it to ${r.suggestedOwnerName}` : 'Managers only'}</span></>}</td>
          <td>{r.rule ? <span className="val">{r.rule.name}</span> : <span className="muted">—</span>}</td>
          <td>{r.transferred ? <span className="tag tag-violet">Moved to {r.transferred.to}</span> : r.suggestedUnit ? <span className="tag tag-amber">{r.suggestedUnit.name}</span> : <span className="sub">This unit</span>}</td>
          <td style={sx('text-align:right')}>{r.transferred ? <span className="sub">{`${new Date(r.transferred.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${r.transferred.by}`}</span>
            : canMove && targets.length ? <button className="btn btn-sec btn-sm" onClick={() => setMove({ row: r, to: (r.suggestedUnit && targets.some(t => t.businessUnitId === r.suggestedUnit!.id) ? r.suggestedUnit.id : targets[0].businessUnitId), reason: r.rule ? `Routing rule: ${r.rule.name}` : '', error: '', busy: false })}>Move…</button> : null}</td>
        </tr>) : <tr><td colSpan={6} className="dt-empty">No accounts match.</td></tr>}</tbody>
      </table></div>
      {canMove && !targets.length ? <div style={sx('font-size:11px;color:var(--i3);margin:10px 14px')}>To move an account, you need to be a sales manager or an admin in the unit it goes to.</div> : null}
    </div>
    {move ? <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget && !move.busy) setMove(null); }}>
      <div role="dialog" aria-modal="true" aria-label={`Move ${move.row.name}`} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:460px;max-width:100%;padding:22px')}>
        <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:4px')}>{`Move ${move.row.name}`}</div>
        <div style={sx('font-size:12px;color:var(--i3);margin-bottom:14px;line-height:1.5')}>Its rows, with this unit&apos;s corrections, go to the other unit as a lead file and arrive there as a saved list. This unit stops handing it off. Both units keep a record of the move.</div>
        <label style={sx('font-size:11px;font-weight:600;color:var(--i2)')}>To
          <select value={move.to} onChange={e => { const v = e.target.value; setMove(m => m && { ...m, to: v }); }} style={sx('display:block;width:100%;margin:5px 0 12px;padding:8px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12.5px')}>
            {targets.map(t => <option key={t.businessUnitId} value={t.businessUnitId}>{t.name}</option>)}</select></label>
        <label style={sx('font-size:11px;font-weight:600;color:var(--i2)')}>Why
          <input value={move.reason} onChange={e => { const v = e.target.value; setMove(m => m && { ...m, reason: v }); }} placeholder="e.g. Thai refiners are covered by the Bangkok team"
            style={sx('display:block;width:100%;margin:5px 0 12px;padding:8px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12.5px')} /></label>
        {move.error ? <div role="alert" style={sx('font-size:12px;color:var(--neg);margin-bottom:10px')}>{move.error}</div> : null}
        <div style={sx('display:flex;gap:8px;justify-content:flex-end')}><button className="btn btn-ghost" disabled={move.busy} onClick={() => setMove(null)}>Cancel</button>
          <button className="btn btn-primary" disabled={move.busy} onClick={() => void doMove()}>{move.busy ? 'Moving…' : 'Move the account'}</button></div>
      </div>
    </div> : null}
  </>;
}
