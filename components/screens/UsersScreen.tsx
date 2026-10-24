'use client';

/* Users and roles for the active business unit (G-003), on the server's data: list, user drawer, invite / edit /
   remove modals, as in legacy/08-users.html. Every change is checked and recorded by the server (role history and
   audit log). Messages say what actually happened: an invite says "sent" only when the email went out; otherwise
   the one-time link is shown to copy. */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { sx } from '@/lib/sx';
import { avColor, initials, showToast } from '@/lib/ui';
import { api, ApiError, errorText } from '@/lib/client/api';
import { BU_ROLES, can, type BuRole } from '@/lib/auth/permissions';
import { useSessionUser } from '@/components/SessionContext';

type Member = {
  id: string; email: string; displayName: string; accountStatus: 'invited' | 'active' | 'deactivated'; role: BuRole;
  membershipStatus: 'active' | 'removed'; managerUserId: string | null; managerName: string | null; lastLoginAt: string | null; invitedAt: string; aliases: string[];
};
type HistoryRow = { at: string; field: string; fromValue: string | null; toValue: string | null; reason: string | null; changedBy: string };
type LinkOutcome = { emailed: boolean; link: string | null };

const statusOf = (m: Member) => (m.membershipStatus === 'removed' ? 'removed' : m.accountStatus);
const statusClass = (s: string) => (s === 'active' ? 'sc-h' : s === 'invited' ? 'sc-m' : 'sc-l');
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never');

const INPUT_STYLE = 'width:100%;border:1px solid var(--bdk);border-radius:8px;padding:8px 10px;font-size:12.5px;font-family:var(--fb);outline:none';
const SELECT_STYLE = 'width:100%;border:1px solid var(--bdk);border-radius:8px;padding:8px 10px;font-size:12.5px;background:var(--surf)';
const LABEL_STYLE = 'display:block;font-size:11px;font-weight:600;color:var(--i2);margin-bottom:5px';

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div style={sx('margin-bottom:12px')}><label htmlFor={id} style={sx(LABEL_STYLE)}>{label}</label>{children}</div>;
}

function historyText(h: HistoryRow): string {
  switch (h.field) {
    case 'membership': return `Added as ${h.toValue}${h.reason ? ` (${h.reason})` : ''}`;
    case 'role': return `Role changed from ${h.fromValue} to ${h.toValue}`;
    case 'manager': return 'Manager changed';
    case 'membership_status': return h.toValue === 'removed' ? 'Removed from this business unit' : 'Restored to this business unit';
    case 'status': return h.toValue === 'active' ? 'Accepted the invite; account active' : `Account ${h.toValue}`;
    case 'display_name': return 'Name changed';
    case 'owner_alias': return h.fromValue === 'removed' ? 'Owner address removed' : 'Owner address added';
    default: return h.field;
  }
}

function CopyLink({ outcome, what }: { outcome: LinkOutcome; what: string }) {
  if (outcome.emailed || !outcome.link) return <div role="status" style={sx('background:var(--pos-lt);color:var(--pos);border-radius:8px;padding:10px;font-size:12px;margin-bottom:12px')}>{`The ${what} was emailed.`}</div>;
  return (
    <div role="status" style={sx('background:var(--warn-lt);border-radius:8px;padding:10px;font-size:12px;margin-bottom:12px;line-height:1.5')}>
      <div style={sx('color:var(--warn);font-weight:600;margin-bottom:6px')}>{`No email was sent. Copy this one-time ${what} link and send it to them yourself.`}</div>
      <input readOnly value={outcome.link} aria-label={`One-time ${what} link`} onFocus={e => e.currentTarget.select()} style={sx(INPUT_STYLE + ';font-family:var(--fm);font-size:11px')} />
      <button className="btn btn-sec btn-sm" style={sx('margin-top:8px')} onClick={() => { void navigator.clipboard?.writeText(outcome.link!).then(() => showToast('Link copied'), () => showToast('Select the link and copy it')); }}>Copy link</button>
    </div>
  );
}

type Modal =
  | { kind: 'invite' }
  | { kind: 'edit'; id: string }
  | { kind: 'remove'; id: string }
  | { kind: 'restore'; id: string }
  | { kind: 'link'; outcome: LinkOutcome; what: string; title: string };

export function UsersScreen() {
  const me = useSessionUser();
  const myRole = me.activeBusinessUnit!.role;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'Sales rep' as BuRole, manager: '', reason: '', alias: '' });

  const load = useCallback(async () => {
    try {
      const r = await api<{ members: Member[] }>('/api/users');
      setMembers(r.members);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, []);
  // Loading on mount is this screen's purpose; the state updates come back from the request.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const loadHistory = useCallback(async (id: string) => {
    setHistory(null);
    try { setHistory((await api<{ history: HistoryRow[] }>(`/api/users/${id}/history`)).history); } catch { setHistory([]); }
  }, []);

  const openUser = (id: string) => { setDrawerId(id); void loadHistory(id); };
  const closeDrawer = () => setDrawerId(null);
  const openModal = (m: Modal, preset?: Partial<typeof form>) => {
    setFormError(null);
    setForm({ name: '', email: '', role: 'Sales rep', manager: '', reason: '', alias: '', ...preset });
    setModal(m);
  };
  const closeModal = () => { if (!busy) setModal(null); };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setFormError(null);
    try { await fn(); } catch (err) {
      setFormError(err instanceof ApiError && err.fields ? `${err.message} ${Object.values(err.fields).flat().join(' ')}` : errorText(err));
    } finally { setBusy(false); }
  };

  const grantAdmin = can(myRole, 'users.grantAdmin');
  const assignable = BU_ROLES.filter(r => r !== 'Admin' || grantAdmin);
  const managers = (members ?? []).filter(m => m.membershipStatus === 'active' && (m.role === 'Sales manager' || m.role === 'Admin'));

  const invite = () => run(async () => {
    const r = await api<{ userId: string; existingAccount: boolean } & LinkOutcome>('/api/users', {
      body: { email: form.email, displayName: form.name, role: form.role, managerUserId: form.manager || null },
    });
    await load();
    if (r.existingAccount && !r.link && !r.emailed) {
      setModal(null);
      showToast(`${form.name} already had an account and was added to this business unit`);
    } else {
      setModal({ kind: 'link', outcome: r, what: 'invite', title: `Invited ${form.name}` });
    }
  });
  const saveEdit = (m: Member) => run(async () => {
    const patch: Record<string, unknown> = {};
    if (form.name.trim() !== m.displayName) patch.displayName = form.name;
    if (form.role !== m.role) patch.role = form.role;
    if ((form.manager || null) !== m.managerUserId) patch.managerUserId = form.manager || null;
    if (!Object.keys(patch).length) { setModal(null); return; }
    await api(`/api/users/${m.id}`, { method: 'PATCH', body: { ...patch, reason: form.reason || undefined } });
    await load();
    await loadHistory(m.id);
    setModal(null);
    showToast(`Saved changes to ${form.name}`);
  });
  const setMembership = (m: Member, action: 'deactivate' | 'reactivate') => run(async () => {
    await api(`/api/users/${m.id}/${action}`, { body: { reason: form.reason } });
    await load();
    await loadHistory(m.id);
    setModal(null);
    showToast(action === 'deactivate' ? `${m.displayName} was removed from this business unit and signed out` : `${m.displayName} was restored`);
  });
  const sendLink = (m: Member, kind: 'resend-invite' | 'reset-link') => run(async () => {
    const r = await api<LinkOutcome>(`/api/users/${m.id}/${kind}`, { body: {} });
    setModal({ kind: 'link', outcome: r, what: kind === 'resend-invite' ? 'invite' : 'password reset', title: m.displayName });
  });
  const addAlias = (m: Member) => run(async () => {
    await api(`/api/users/${m.id}/owner-aliases`, { body: { ownerEmail: form.alias } });
    setForm(f => ({ ...f, alias: '' }));
    await load();
    await loadHistory(m.id);
  });

  const roleSelect = <Field id="mRole" label="Role"><select id="mRole" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as BuRole }))} style={sx(SELECT_STYLE)}>{assignable.map(r => <option key={r}>{r}</option>)}</select></Field>;
  const managerSelect = (exclude?: string) => <Field id="mManager" label="Manager"><select id="mManager" value={form.manager} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} style={sx(SELECT_STYLE)}><option value="">—</option>{managers.filter(x => x.id !== exclude).map(x => <option key={x.id} value={x.id}>{x.displayName}</option>)}</select></Field>;
  const reasonField = (required: boolean) => <Field id="mReason" label={required ? 'Reason (recorded in the history)' : 'Reason (optional, recorded in the history)'}><input id="mReason" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} style={sx(INPUT_STYLE)} /></Field>;
  const actions = (label: string, onSave: () => void, disabled = false, danger = false) => (
    <div style={sx('display:flex;justify-content:flex-end;gap:8px;margin-top:16px')}>
      <button className="btn btn-ghost btn-sm" onClick={closeModal} disabled={busy}>Cancel</button>
      <button className="btn btn-primary btn-sm" onClick={onSave} disabled={busy || disabled} style={danger ? sx('background:var(--neg);border-color:var(--neg)') : undefined}>{busy ? 'Saving…' : label}</button>
    </div>
  );
  const errorLine = formError ? <div role="alert" style={sx('background:var(--neg-lt);color:var(--neg);border-radius:8px;padding:9px 10px;font-size:12px;margin-bottom:12px')}>{formError}</div> : null;
  const title = (t: string) => <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:14px')}>{t}</div>;

  const renderModal = (m: Modal): ReactNode => {
    if (m.kind === 'link') return <>{title(m.title)}<CopyLink outcome={m.outcome} what={m.what} /><div style={sx('display:flex;justify-content:flex-end')}><button className="btn btn-primary btn-sm" onClick={() => setModal(null)}>Done</button></div></>;
    if (m.kind === 'invite') return <>
      {title('Invite a user')}{errorLine}
      <Field id="mName" label="Name"><input id="mName" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Priya Sharma" style={sx(INPUT_STYLE)} /></Field>
      <Field id="mEmail" label="Work email"><input id="mEmail" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@company.com" style={sx(INPUT_STYLE)} /></Field>
      {roleSelect}{managerSelect()}
      <div style={sx('font-size:11px;color:var(--i3);margin-bottom:4px')}>{`They join ${me.activeBusinessUnit!.name}.`}</div>
      {actions('Invite', invite, !form.name.trim() || !form.email.trim())}
    </>;
    const u = (members ?? []).find(x => x.id === m.id);
    if (!u) return null;
    if (m.kind === 'edit') return <>
      {title('Edit user')}{errorLine}
      <Field id="mName" label="Name"><input id="mName" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={sx(INPUT_STYLE)} /></Field>
      {u.role === 'Admin' && !grantAdmin ? <div style={sx('font-size:11.5px;color:var(--i3);margin-bottom:12px')}>Only an Admin can change an Admin&apos;s role.</div> : roleSelect}
      {managerSelect(u.id)}{reasonField(false)}
      {actions('Save', () => saveEdit(u), !form.name.trim())}
    </>;
    if (m.kind === 'remove') return <>
      {title(`Remove ${u.displayName} from ${me.activeBusinessUnit!.name}?`)}{errorLine}
      <div style={sx('font-size:12px;color:var(--i2);margin-bottom:12px;line-height:1.6')}>They are signed out at once and lose access to this business unit. Their history is kept, and you can restore them later.</div>
      {reasonField(true)}{actions('Remove', () => setMembership(u, 'deactivate'), form.reason.trim().length < 3, true)}
    </>;
    return <>
      {title(`Restore ${u.displayName}?`)}{errorLine}
      <div style={sx('font-size:12px;color:var(--i2);margin-bottom:12px;line-height:1.6')}>{`They get back their role as ${u.role} in this business unit.`}</div>
      {reasonField(true)}{actions('Restore', () => setMembership(u, 'reactivate'), form.reason.trim().length < 3)}
    </>;
  };

  const du = drawerId ? (members ?? []).find(x => x.id === drawerId) ?? null : null;
  const rowStyle = 'grid-template-columns:1.4fr 1.7fr 1fr 1.1fr 90px 140px;';
  const activeCount = (members ?? []).filter(m => m.membershipStatus === 'active').length;

  return (
    <>
      <main className="main" id="mainArea">
        <div className="topbar">
          <div className="topbar-l"><span className="tb-title">Users and roles</span><span className="tb-badge badge-neutral">{members ? `${activeCount} active · ${me.activeBusinessUnit!.name}` : 'Loading…'}</span></div>
          <div className="topbar-r"><button className="btn btn-primary btn-sm" onClick={() => openModal({ kind: 'invite' })}>+ Invite user</button></div>
        </div>
        <div className="canvas">
          {loadError ? <div role="alert" style={sx('background:var(--neg-lt);color:var(--neg);border-radius:8px;padding:12px;font-size:12.5px;margin-bottom:12px')}>{`Couldn't load users: ${loadError}`} <button className="btn btn-sec btn-sm" onClick={() => void load()}>Try again</button></div> : null}
          <div className="score-list" role="table" aria-label="Users in this business unit">
            <div className="sl-head" role="row" style={sx(rowStyle)}>
              {['Name', 'Email', 'Role', 'Manager', 'Status', 'Last sign-in'].map(h => <div key={h} role="columnheader" className="sl-th">{h}</div>)}
            </div>
            {members === null && !loadError ? <div style={sx('padding:16px;font-size:12px;color:var(--i3)')}>Loading users…</div> : null}
            {members?.length === 0 ? <div style={sx('padding:16px;font-size:12px;color:var(--i3)')}>No users yet. Invite the first one.</div> : null}
            {members?.map(u => (
              <div key={u.id} role="row" tabIndex={0} className="sl-row" style={sx(rowStyle + 'cursor:pointer')} onClick={() => openUser(u.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openUser(u.id); } }}>
                <div role="cell" className="co-cell"><div className="co-av" style={{ background: avColor(u.id) }}>{initials(u.displayName)}</div><div className="co-nm">{u.displayName}</div></div>
                <div role="cell" style={sx('font-size:11.5px;color:var(--i3)')}>{u.email}</div>
                <div role="cell" style={sx('font-size:11.5px;color:var(--i2)')}>{u.role}</div>
                <div role="cell" style={sx('font-size:11.5px;color:var(--i3)')}>{u.managerName ?? '—'}</div>
                <div role="cell"><span className={`sc ${statusClass(statusOf(u))}`}>{statusOf(u).toUpperCase()}</span></div>
                <div role="cell" style={sx('font-size:10.5px;color:var(--i3)')}>{when(u.lastLoginAt)}</div>
              </div>))}
          </div>
        </div>
      </main>

      <div className={`detail-drawer${du ? ' open' : ''}`} id="detailDrawer" role="dialog" aria-label="User detail" aria-hidden={!du} inert={!du}>
        <div className="drawer-hdr">
          <div><div className="drawer-title" id="detTitle">{du ? du.displayName : 'User detail'}</div><div className="drawer-sub" id="detSub">{du ? du.email : '—'}</div></div>
          <button type="button" className="drawer-close" aria-label="Close" onClick={closeDrawer} style={sx('border:none;background:none')}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>
        <div className="drawer-body" id="detBody">{du ? <>
          <div className="panel" style={sx('margin-bottom:12px')}>
            <div className="panel-hdr"><span className="panel-ttl">Details</span></div>
            <div className="panel-body">
              {[['Role', du.role], ['Manager', du.managerName ?? '—'], ['Business unit', me.activeBusinessUnit!.name], ['Last sign-in', when(du.lastLoginAt)]].map(([k, v]) => (
                <div key={k} className="dim-row" style={sx('border:none;padding:4px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>{k}</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto;font-weight:600')}>{v}</span></div>))}
              <div className="dim-row" style={sx('border:none;padding:4px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Status</span><span className={`sc ${statusClass(statusOf(du))}`} style={sx('margin-left:auto')}>{statusOf(du).toUpperCase()}</span></div>
            </div>
          </div>
          <div className="panel" style={sx('margin-bottom:12px')}>
            <div className="panel-hdr"><span className="panel-ttl">Owner addresses in lead files</span></div>
            <div className="panel-body">
              <div style={sx('font-size:11px;color:var(--i3);margin-bottom:8px;line-height:1.5')}>Accounts whose owner_email is one of these, or their sign-in email, are theirs.</div>
              {du.aliases.length ? du.aliases.map(a => <div key={a} style={sx('font-size:11.5px;color:var(--i2);padding:3px 0;font-family:var(--fm)')}>{a}</div>) : <div style={sx('font-size:11.5px;color:var(--i3)')}>None besides their sign-in email.</div>}
              {du.membershipStatus === 'active' ? <div style={sx('display:flex;gap:6px;margin-top:8px')}>
                <input aria-label="Add an owner address" placeholder="owner@company.com" value={form.alias} onChange={e => setForm(f => ({ ...f, alias: e.target.value }))} style={sx(INPUT_STYLE + ';flex:1')} />
                <button className="btn btn-sec btn-sm" disabled={busy || !form.alias.trim()} onClick={() => addAlias(du)}>Add</button>
              </div> : null}
              {formError && !modal ? <div role="alert" style={sx('color:var(--neg);font-size:11.5px;margin-top:6px')}>{formError}</div> : null}
            </div>
          </div>
          <div className="panel" style={sx('margin-bottom:12px')}>
            <div className="panel-hdr"><span className="panel-ttl">Change history</span></div>
            <div className="panel-body">
              {history === null ? <div style={sx('font-size:11.5px;color:var(--i3)')}>Loading…</div> : history.length === 0 ? <div style={sx('font-size:11.5px;color:var(--i3)')}>No changes recorded.</div>
                : history.map((h, i) => <div key={i} style={sx('font-size:11.5px;color:var(--i2);padding:6px 0;border-bottom:1px solid var(--s75)')}><span style={sx('color:var(--i3);font-size:10.5px')}>{when(h.at)}</span>{` — ${historyText(h)} · by ${h.changedBy}`}{h.reason && h.field !== 'membership' ? <div style={sx('color:var(--i3);font-size:10.5px')}>{`Reason: ${h.reason}`}</div> : null}</div>)}
            </div>
          </div>
          <div style={sx('display:flex;gap:8px;flex-wrap:wrap')}>
            {du.membershipStatus === 'active' ? <>
              <button className="btn btn-sec btn-sm" style={sx('flex:1;justify-content:center')} onClick={() => openModal({ kind: 'edit', id: du.id }, { name: du.displayName, role: du.role, manager: du.managerUserId ?? '' })}>Edit</button>
              <button className="btn btn-sec btn-sm" style={sx('flex:1;justify-content:center;color:var(--neg)')} onClick={() => openModal({ kind: 'remove', id: du.id })} disabled={du.id === me.id}>Remove</button>
              {du.accountStatus === 'invited'
                ? <button className="btn btn-sec btn-sm" style={sx('flex-basis:100%;justify-content:center')} disabled={busy} onClick={() => sendLink(du, 'resend-invite')}>Send a new invite link</button>
                : du.accountStatus === 'active' && du.id !== me.id
                  ? <button className="btn btn-sec btn-sm" style={sx('flex-basis:100%;justify-content:center')} disabled={busy} onClick={() => sendLink(du, 'reset-link')}>Send a password reset link</button>
                  : null}
            </> : <button className="btn btn-sec btn-sm" style={sx('flex:1;justify-content:center')} onClick={() => openModal({ kind: 'restore', id: du.id })}>Restore</button>}
          </div>
        </> : null}</div>
      </div>

      {modal ? (
        <div id="modalOverlay" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          style={sx('position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center;')}>
          <div role="dialog" aria-modal="true" style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:460px;max-width:90vw;padding:22px;')} onClick={e => e.stopPropagation()}>
            {renderModal(modal)}
          </div>
        </div>
      ) : null}
    </>
  );
}
