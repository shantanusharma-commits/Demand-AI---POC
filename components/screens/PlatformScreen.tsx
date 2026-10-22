'use client';

/* Business units (D-32), for the platform administrator: create a unit (configuration v1 is set up with it) and
   invite its first Admin. The platform administrator manages units, not their data. */
import { useCallback, useEffect, useState } from 'react';
import { sx } from '@/lib/sx';
import { showToast } from '@/lib/ui';
import { api, errorText } from '@/lib/client/api';

type Unit = { id: string; code: string; name: string; status: string; members: number; admins: number; createdAt: string };
type LinkOutcome = { emailed: boolean; link: string | null };

const INPUT = 'width:100%;border:1px solid var(--bdk);border-radius:8px;padding:8px 10px;font-size:12.5px;font-family:var(--fb);margin-bottom:10px';
const LABEL = 'display:block;font-size:11px;font-weight:600;color:var(--i2);margin-bottom:5px';

export function PlatformScreen() {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newUnit, setNewUnit] = useState({ code: '', name: '' });
  const [adminFor, setAdminFor] = useState<Unit | null>(null);
  const [admin, setAdmin] = useState({ email: '', displayName: '' });
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);

  const load = useCallback(async () => {
    try { setUnits((await api<{ units: Unit[] }>('/api/platform/business-units')).units); setError(null); } catch (err) { setError(errorText(err)); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await api('/api/platform/business-units', { body: newUnit });
      showToast(`Created ${newUnit.name}`);
      setNewUnit({ code: '', name: '' });
      await load();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  const inviteAdmin = async () => {
    if (!adminFor) return;
    setBusy(true);
    try {
      setOutcome(await api<LinkOutcome>(`/api/platform/business-units/${adminFor.id}/admins`, { body: admin }));
      await load();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  return (
    <main className="main">
      <div className="topbar"><div className="topbar-l"><span className="tb-title">Business units</span><span className="tb-badge badge-neutral">{units ? `${units.length} units` : 'Loading…'}</span></div></div>
      <div className="canvas">
        {error ? <div role="alert" style={sx('background:var(--neg-lt);color:var(--neg);border-radius:8px;padding:10px;font-size:12px;margin-bottom:12px')}>{error}</div> : null}
        <div className="panel" style={sx('margin-bottom:14px;max-width:560px')}>
          <div className="panel-hdr"><span className="panel-ttl">New business unit</span></div>
          <div className="panel-body">
            <label htmlFor="buName" style={sx(LABEL)}>Name</label>
            <input id="buName" value={newUnit.name} onChange={e => setNewUnit(u => ({ ...u, name: e.target.value }))} style={sx(INPUT)} placeholder="e.g. Process Automation — SEA" />
            <label htmlFor="buCode" style={sx(LABEL)}>Short code (lower-case letters, digits, hyphens)</label>
            <input id="buCode" value={newUnit.code} onChange={e => setNewUnit(u => ({ ...u, code: e.target.value.toLowerCase() }))} style={sx(INPUT)} placeholder="e.g. pa-sea" />
            <button className="btn btn-primary btn-sm" disabled={busy || newUnit.name.trim().length < 2 || newUnit.code.length < 2} onClick={() => void create()}>Create</button>
          </div>
        </div>
        <div className="score-list" role="table" aria-label="Business units">
          <div className="sl-head" role="row" style={sx('grid-template-columns:2fr 1fr 90px 90px 140px')}>
            {['Name', 'Code', 'Members', 'Admins', ''].map(h => <div key={h} role="columnheader" className="sl-th">{h}</div>)}
          </div>
          {units?.map(u => (
            <div key={u.id} role="row" className="sl-row" style={sx('grid-template-columns:2fr 1fr 90px 90px 140px')}>
              <div role="cell" className="co-nm">{u.name}</div>
              <div role="cell" style={sx('font-size:11.5px;font-family:var(--fm);color:var(--i3)')}>{u.code}</div>
              <div role="cell" style={sx('font-size:11.5px')}>{u.members}</div>
              <div role="cell" style={sx(`font-size:11.5px;${u.admins === 0 ? 'color:var(--neg);font-weight:600' : ''}`)}>{u.admins}</div>
              <div role="cell"><button className="btn btn-sec btn-sm" onClick={() => { setAdminFor(u); setAdmin({ email: '', displayName: '' }); setOutcome(null); }}>Invite Admin</button></div>
            </div>))}
        </div>
      </div>
      {adminFor ? (
        <div style={sx('position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center')} onClick={e => { if (e.target === e.currentTarget && !busy) setAdminFor(null); }}>
          <div role="dialog" aria-modal="true" style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:440px;max-width:90vw;padding:22px')}>
            <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;margin-bottom:14px')}>{`Invite an Admin for ${adminFor.name}`}</div>
            {outcome ? (
              outcome.emailed || !outcome.link
                ? <div role="status" style={sx('background:var(--pos-lt);color:var(--pos);border-radius:8px;padding:10px;font-size:12px')}>The invite was emailed.</div>
                : <div role="status" style={sx('background:var(--warn-lt);border-radius:8px;padding:10px;font-size:12px')}>
                    <div style={sx('color:var(--warn);font-weight:600;margin-bottom:6px')}>No email was sent. Copy this one-time invite link and send it yourself.</div>
                    <input readOnly value={outcome.link} aria-label="One-time invite link" onFocus={e => e.currentTarget.select()} style={sx(INPUT + ';font-family:var(--fm);font-size:11px')} />
                  </div>
            ) : <>
              <label htmlFor="adName" style={sx(LABEL)}>Name</label>
              <input id="adName" value={admin.displayName} onChange={e => setAdmin(a => ({ ...a, displayName: e.target.value }))} style={sx(INPUT)} />
              <label htmlFor="adEmail" style={sx(LABEL)}>Work email</label>
              <input id="adEmail" type="email" value={admin.email} onChange={e => setAdmin(a => ({ ...a, email: e.target.value }))} style={sx(INPUT)} />
            </>}
            <div style={sx('display:flex;justify-content:flex-end;gap:8px;margin-top:14px')}>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setAdminFor(null)}>{outcome ? 'Done' : 'Cancel'}</button>
              {outcome ? null : <button className="btn btn-primary btn-sm" disabled={busy || !admin.email || !admin.displayName} onClick={() => void inviteAdmin()}>Invite</button>}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
