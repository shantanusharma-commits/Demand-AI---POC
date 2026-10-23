'use client';

/* The unit's routing rules (D-34), on Setup: in order, the first active rule whose countries, verticals and tiers all
   match an account names who owns it when the lead file names nobody (applied at hand-off) and the business unit it
   belongs to (Account Scoring shows it, and a manager moves it). Managers change them; every change is audited. */
import { useEffect, useState, type ReactNode } from 'react';
import { sx } from '@/lib/sx';
import { ApiError, api, errorText, type WireDeep } from '@/lib/client/api';
import { showToast } from '@/lib/ui';
import { useCan } from '@/components/SessionContext';
import type { getRules, RuleInput } from '@/lib/server/services/routing';

type Rules = WireDeep<Awaited<ReturnType<typeof getRules>>>;
type Edit = { id: string | null; v: RuleInput; error: string };
const OVERLAY = sx('position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px');
const BLANK: RuleInput = { name: '', countries: [], verticals: [], tiers: [], assignOwner: null, targetBusinessUnitId: null, active: true };

export function RoutingRules({ num }: { num: number }) {
  const canEdit = useCan('routing.manage');
  const [data, setData] = useState<Rules | null>(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<Edit | null>(null);
  const load = () => api<Rules>('/api/routing-rules').then(setData, err => setError(errorText(err)));
  useEffect(() => { api<Rules>('/api/routing-rules').then(setData, err => setError(errorText(err))); }, []);

  async function save() {
    if (!edit) return;
    try {
      await api(edit.id ? `/api/routing-rules/${edit.id}` : '/api/routing-rules', { method: edit.id ? 'PATCH' : 'POST', body: edit.v });
      setEdit(null); showToast(edit.id ? 'Rule saved' : 'Rule added'); await load();
    } catch (err) { setEdit(e => e && { ...e, error: (err instanceof ApiError && err.fields ? Object.values(err.fields).flat()[0] : null) ?? errorText(err) }); }
  }
  async function act(path: string, method: string, body: unknown, toast: string) {
    try { await api(path, { method, body }); showToast(toast); await load(); } catch (err) { showToast(errorText(err)); }
  }
  const toggle = (k: 'countries' | 'verticals' | 'tiers', x: string) => setEdit(e => e && { ...e, v: { ...e.v, [k]: e.v[k].includes(x) ? e.v[k].filter(y => y !== x) : [...e.v[k], x] } });
  const checks = (k: 'countries' | 'verticals' | 'tiers', opts: string[], label: string): ReactNode => <fieldset style={sx('border:none;padding:0;margin:0 0 12px')}>
    <legend style={sx('font-size:11px;font-weight:600;color:var(--i2);margin-bottom:5px')}>{label} <span style={sx('font-weight:400;color:var(--i3)')}>(none ticked: any)</span></legend>
    <div style={sx('display:flex;flex-wrap:wrap;gap:6px 14px')}>{opts.map(o => <label key={o} style={sx('display:flex;align-items:center;gap:5px;font-size:12.5px;color:var(--i1);cursor:pointer')}>
      <input type="checkbox" checked={edit!.v[k].includes(o)} onChange={() => toggle(k, o)} style={sx('accent-color:var(--brand)')} />{o}</label>)}</div></fieldset>;

  const rules = data?.rules ?? [];
  return <div className="panel su-p" id="sec-routing">
    <div className="panel-hdr"><span className="panel-ttl">{`${num} · Routing rules`}</span>
      {canEdit ? <button className="btn btn-primary btn-sm" onClick={() => setEdit({ id: null, v: { ...BLANK }, error: '' })}>Add a rule</button> : null}</div>
    <div className="panel-body">
      <div style={sx('font-size:12px;color:var(--i2);line-height:1.6;margin-bottom:10px')}>The first rule that matches an account routes it. It names who owns the account when the lead file names nobody (applied when prospects are sent to Micro-segments &amp; NBA), and the business unit it belongs to: Account Scoring shows it under Routing, where a manager can move the account. {canEdit ? 'Every change is recorded.' : 'Only a sales manager or an admin changes them.'}</div>
      {error ? <div role="alert" style={sx('color:var(--neg);font-size:12.5px')}>{error}</div> : !data ? <div style={sx('font-size:12px;color:var(--i3)')}>Loading…</div>
        : rules.length ? <table className="au"><thead><tr><th>#</th><th>Rule</th><th>Matches</th><th>Owner when none</th><th>Belongs to</th><th>Changed</th>{canEdit ? <th></th> : null}</tr></thead><tbody>
          {rules.map((r, i) => <tr key={r.id} style={r.active ? undefined : sx('opacity:.55')}>
            <td>{i + 1}</td><td><b>{r.name}</b>{r.active ? null : <span className="tag tag-grey" style={sx('margin-left:6px')}>Off</span>}</td><td>{r.description}</td>
            <td>{r.ownerName ?? '—'}</td><td>{r.targetUnit ?? '—'}</td><td>{r.by}</td>
            {canEdit ? <td style={sx('white-space:nowrap;text-align:right')}>
              <button className="btn btn-ghost btn-sm" disabled={i === 0} aria-label={`Move ${r.name} up`} onClick={() => void act(`/api/routing-rules/${r.id}/move`, 'POST', { direction: 'up' }, 'Moved up')}>↑</button>
              <button className="btn btn-ghost btn-sm" disabled={i === rules.length - 1} aria-label={`Move ${r.name} down`} onClick={() => void act(`/api/routing-rules/${r.id}/move`, 'POST', { direction: 'down' }, 'Moved down')}>↓</button>
              <button className="btn btn-sec btn-sm" onClick={() => setEdit({ id: r.id, v: { name: r.name, countries: r.countries, verticals: r.verticals, tiers: r.tiers, assignOwner: r.assignOwner, targetBusinessUnitId: r.targetBusinessUnitId, active: r.active }, error: '' })}>Edit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => void act(`/api/routing-rules/${r.id}`, 'DELETE', undefined, 'Rule removed')}>Remove</button></td> : null}
          </tr>)}</tbody></table>
          : <div style={sx('font-size:12.5px;color:var(--i3)')}>No routing rules yet: accounts stay with the owner the lead file names, in this unit.</div>}
    </div>
    {edit && data ? <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) setEdit(null); }}>
      <div role="dialog" aria-modal="true" aria-label={edit.id ? 'Edit the routing rule' : 'Add a routing rule'} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:600px;max-width:100%;max-height:90vh;overflow-y:auto;padding:22px')}>
        <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:12px')}>{edit.id ? 'Edit the routing rule' : 'Add a routing rule'}</div>
        <label htmlFor="rrName" style={sx('font-size:11px;font-weight:600;color:var(--i2)')}>Name</label>
        <input id="rrName" value={edit.v.name} onChange={e => { const v = e.target.value; setEdit(x => x && { ...x, v: { ...x.v, name: v } }); }} placeholder="e.g. Thailand refiners to the Bangkok team"
          style={sx('width:100%;margin:5px 0 14px;padding:9px 11px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:13px')} />
        {checks('countries', data.options.countries, 'Countries')}{checks('verticals', data.options.verticals, 'Verticals')}{checks('tiers', data.options.tiers, 'Account tiers')}
        <div style={sx('display:flex;gap:12px;margin-bottom:12px')}>
          <label style={sx('flex:1;font-size:11px;font-weight:600;color:var(--i2)')}>Owner when the file names nobody
            <select value={edit.v.assignOwner ?? ''} onChange={e => { const v = e.target.value || null; setEdit(x => x && { ...x, v: { ...x.v, assignOwner: v } }); }} style={sx('display:block;width:100%;margin-top:5px;padding:8px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12.5px')}>
              <option value="">Nobody (managers only)</option>{data.options.reps.map(r => <option key={r.email} value={r.email}>{r.name}</option>)}</select></label>
          <label style={sx('flex:1;font-size:11px;font-weight:600;color:var(--i2)')}>Belongs to
            <select value={edit.v.targetBusinessUnitId ?? ''} onChange={e => { const v = e.target.value || null; setEdit(x => x && { ...x, v: { ...x.v, targetBusinessUnitId: v } }); }} style={sx('display:block;width:100%;margin-top:5px;padding:8px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12.5px')}>
              <option value="">This unit</option>{data.options.units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        </div>
        <label style={sx('display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--i1);margin-bottom:12px')}><input type="checkbox" checked={edit.v.active} onChange={e => { const v = e.target.checked; setEdit(x => x && { ...x, v: { ...x.v, active: v } }); }} /> In use</label>
        {edit.error ? <div role="alert" style={sx('font-size:12px;color:var(--neg);margin-bottom:10px')}>{edit.error}</div> : null}
        <div style={sx('display:flex;gap:8px;justify-content:flex-end')}><button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={() => void save()}>{edit.id ? 'Save the rule' : 'Add the rule'}</button></div>
      </div>
    </div> : null}
  </div>;
}
