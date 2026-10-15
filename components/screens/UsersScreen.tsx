'use client';

/* Port of legacy/08-users.html — Users and roles: user list, user drawer, invite / edit / deactivate modals.
   The users array lives in React state and resets on reload, as the original's in-memory USERS did. */
import { useRef, useState, type ReactNode, type Ref } from 'react';
import { sx } from '@/lib/sx';
import { avColor, initials, showToast } from '@/lib/ui';

type UserStatus = 'active' | 'invited' | 'deactivated';
interface HistoryEntry { when: string; what: string }
interface User {
  id: string; name: string; email: string; role: string; manager: string; businessUnit: string;
  status: UserStatus; lastSignIn: string; history: HistoryEntry[];
}

const ROLES = ['Platform admin', 'Admin', 'Sales manager', 'Sales rep', 'Viewer'];
const INITIAL_USERS: User[] = [
  {id:'u1', name:'Pavan Kumar', email:'pavan.kumar@client.com', role:'Sales manager', manager:'—', businessUnit:'Industrial Automation — EMEA', status:'active', lastSignIn:'2 hours ago',
   history:[{when:'6 weeks ago', what:'Invited as Sales manager'},{when:'6 weeks ago', what:'Accepted invite, account activated'}]},
  {id:'u2', name:'Sofia Ahlgren', email:'sofia.ahlgren@client.com', role:'Sales rep', manager:'Pavan Kumar', businessUnit:'Industrial Automation — EMEA', status:'active', lastSignIn:'1 day ago',
   history:[{when:'5 weeks ago', what:'Invited as Sales rep, manager set to Pavan Kumar'},{when:'5 weeks ago', what:'Accepted invite, account activated'}]},
  {id:'u3', name:'Marcus Webb', email:'marcus.webb@client.com', role:'Sales rep', manager:'Pavan Kumar', businessUnit:'Industrial Automation — EMEA', status:'active', lastSignIn:'4 hours ago',
   history:[{when:'5 weeks ago', what:'Invited as Sales rep, manager set to Pavan Kumar'},{when:'5 weeks ago', what:'Accepted invite, account activated'}]},
  {id:'u4', name:'Rajiv Nair', email:'rajiv.nair@client.com', role:'Admin', manager:'—', businessUnit:'Industrial Automation — EMEA', status:'active', lastSignIn:'30 min ago',
   history:[{when:'7 weeks ago', what:'Invited as Admin'},{when:'7 weeks ago', what:'Accepted invite, account activated'}]},
  {id:'u5', name:'Elena Vogel', email:'elena.vogel@client.com', role:'Viewer', manager:'—', businessUnit:'Industrial Automation — EMEA', status:'invited', lastSignIn:'Never',
   history:[{when:'2 days ago', what:'Invited as Viewer'}]},
  {id:'u6', name:'Shantanu Rao', email:'shantanu.rao@partner.com', role:'Platform admin', manager:'—', businessUnit:'—', status:'active', lastSignIn:'1 week ago',
   history:[{when:'8 weeks ago', what:'Workspace created, invited as first admin — role later set to Platform admin for support access'}]},
];

const statusClass = (s: UserStatus) => s === 'active' ? 'sc-h' : s === 'invited' ? 'sc-m' : 'sc-l';

const INPUT_STYLE = 'width:100%;border:1px solid var(--bdk);border-radius:8px;padding:8px 10px;font-size:12.5px;font-family:var(--fb);outline:none';
const SELECT_STYLE = 'width:100%;border:1px solid var(--bdk);border-radius:8px;padding:8px 10px;font-size:12.5px;background:var(--surf)';
const LABEL_STYLE = 'font-size:11px;font-weight:600;color:var(--i2);margin-bottom:5px';

function ModalField({ id, label, value, placeholder, inputRef }: { id: string; label: string; value?: string; placeholder?: string; inputRef?: Ref<HTMLInputElement> }) {
  return <div style={sx('margin-bottom:12px')}><div style={sx(LABEL_STYLE)}>{label}</div><input id={id} ref={inputRef} defaultValue={value || ''} placeholder={placeholder || ''} style={sx(INPUT_STYLE)} /></div>;
}

type Modal = { kind: 'invite' } | { kind: 'edit'; id: string } | { kind: 'deactivate'; id: string };

export function UsersScreen() {
  const [users, setUsers] = useState<User[]>(() => INITIAL_USERS.map(u => ({ ...u, history: [...u.history] })));
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The overlay is created on first open and afterwards only hidden (display:none), as in the original.
  const [modal, setModal] = useState<(Modal & { key: number }) | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLSelectElement>(null);
  const managerRef = useRef<HTMLSelectElement>(null);
  const buRef = useRef<HTMLInputElement>(null);

  const closeDrawer = () => setDrawerOpen(false);
  const openUser = (id: string) => { setDrawerId(id); setDrawerOpen(true); };
  const openModal = (m: Modal) => { setModal(prev => ({ ...m, key: (prev ? prev.key : 0) + 1 })); setModalOpen(true); };
  const closeModal = () => setModalOpen(false);

  const confirmInvite = () => {
    const name = nameRef.current!.value.trim();
    const email = emailRef.current!.value.trim();
    const role = roleRef.current!.value;
    const manager = managerRef.current!.value;
    const bu = buRef.current!.value.trim();
    if (!name || !email) { showToast('Name and email are required'); return; }
    setUsers(us => [...us, { id: 'u' + (us.length + 1), name, email, role, manager, businessUnit: bu, status: 'invited', lastSignIn: 'Never', history: [{ when: 'Just now', what: 'Invited as ' + role + (manager !== '—' ? ', manager set to ' + manager : '') }] }]);
    closeModal();
    showToast('Invited ' + name + ' — confirmation sent to ' + email);
  };
  const confirmEdit = (id: string) => {
    const u = users.find(x => x.id === id)!;
    const name = nameRef.current!.value.trim();
    const role = roleRef.current!.value;
    const manager = managerRef.current!.value;
    const bu = buRef.current!.value.trim();
    const changes: string[] = [];
    if (role !== u.role) changes.push('Role changed from ' + u.role + ' to ' + role);
    if (manager !== u.manager) changes.push('Manager changed to ' + manager);
    if (bu !== u.businessUnit) changes.push('Business unit changed to ' + bu);
    setUsers(us => us.map(x => x.id !== id ? x : {
      ...x, name, role, manager, businessUnit: bu,
      history: changes.length ? [...x.history, { when: 'Just now', what: changes.join('; ') }] : x.history,
    }));
    closeModal();
    showToast('Updated ' + name);
    openUser(id);
  };
  const confirmDeactivate = (id: string) => {
    const u = users.find(x => x.id === id)!;
    setUsers(us => us.map(x => x.id !== id ? x : { ...x, status: 'deactivated', history: [...x.history, { when: 'Just now', what: 'Deactivated' }] }));
    closeModal();
    showToast(u.name + ' deactivated');
    openUser(id);
  };

  const roleOptions = () => ROLES.map(r => <option key={r}>{r}</option>);
  const managerOptions = () => {
    const managers = users.filter(u => u.role === 'Sales manager' || u.role === 'Admin').map(u => u.name);
    return [<option key="none" value="—">—</option>, ...managers.map((m, i) => <option key={i}>{m}</option>)];
  };
  const roleSelect = (selected: string) => <div style={sx('margin-bottom:12px')}><div style={sx(LABEL_STYLE)}>Role</div><select id="mRole" ref={roleRef} defaultValue={selected} style={sx(SELECT_STYLE)}>{roleOptions()}</select></div>;
  const managerSelect = (selected: string) => <div style={sx('margin-bottom:12px')}><div style={sx(LABEL_STYLE)}>Manager</div><select id="mManager" ref={managerRef} defaultValue={selected} style={sx(SELECT_STYLE)}>{managerOptions()}</select></div>;
  const modalActions = (onSave: () => void) => <div style={sx('display:flex;justify-content:flex-end;gap:8px;margin-top:16px')}><button className="btn btn-ghost btn-sm" onClick={closeModal}>Cancel</button><button className="btn btn-primary btn-sm" onClick={onSave}>Save</button></div>;

  const renderModalBody = (m: Modal): ReactNode => {
    if (m.kind === 'invite') return <>
      <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:14px')}>Invite a user</div>
      <ModalField id="mName" label="Name" value="" placeholder="e.g. Priya Sharma" inputRef={nameRef} />
      <ModalField id="mEmail" label="Email" value="" placeholder="name@client.com" inputRef={emailRef} />
      {roleSelect('Sales rep')}
      {managerSelect('Pavan Kumar')}
      <ModalField id="mBU" label="Business unit" value="Industrial Automation — EMEA" inputRef={buRef} />
      {modalActions(confirmInvite)}
    </>;
    const u = users.find(x => x.id === m.id)!;
    if (m.kind === 'edit') return <>
      <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:14px')}>Edit user</div>
      <ModalField id="mName" label="Name" value={u.name} inputRef={nameRef} />
      {roleSelect(u.role)}
      {managerSelect(u.manager)}
      <ModalField id="mBU" label="Business unit" value={u.businessUnit} inputRef={buRef} />
      {modalActions(() => confirmEdit(m.id))}
    </>;
    return <>
      <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:10px')}>{`Deactivate ${u.name}?`}</div>
      <div style={sx('font-size:12px;color:var(--i2);margin-bottom:16px;line-height:1.6')}>They’ll lose access immediately. Their accounts and open items stay assigned to them until reassigned separately.</div>
      <div style={sx('display:flex;gap:8px')}>
        <button className="btn btn-ghost btn-sm" style={sx('flex:1;justify-content:center')} onClick={closeModal}>Cancel</button>
        <button className="btn btn-primary btn-sm" style={sx('flex:1;justify-content:center;background:var(--neg);border-color:var(--neg)')} onClick={() => confirmDeactivate(m.id)}>Deactivate</button>
      </div>
    </>;
  };

  const du = drawerId ? users.find(x => x.id === drawerId)! : null;
  const rowStyle = 'grid-template-columns:1.4fr 1.6fr 1fr 1.1fr 1.3fr 90px 100px;';

  return (
    <>
      <main className="main" id="mainArea">
        <div className="topbar">
          <div className="topbar-l"><span className="tb-title">Users and roles</span><span className="tb-badge badge-neutral">{`${users.length} users`}</span></div>
          <div className="topbar-r"><button className="btn btn-primary btn-sm" onClick={() => openModal({ kind: 'invite' })}>+ Invite user</button></div>
        </div>
        <div className="canvas">
          <div className="score-list">
            <div className="sl-head" style={sx(rowStyle)}>
              <div className="sl-th">Name</div><div className="sl-th">Email</div><div className="sl-th">Role</div><div className="sl-th">Manager</div><div className="sl-th">Business unit</div><div className="sl-th">Status</div><div className="sl-th">Last sign-in</div>
            </div>
            {users.map(u => (
              <div key={u.id} className="sl-row" style={sx(rowStyle + 'cursor:pointer')} onClick={() => openUser(u.id)}>
                <div className="co-cell"><div className="co-av" style={{ background: avColor(u.id) }}>{initials(u.name)}</div><div className="co-nm">{u.name}</div></div>
                <div style={sx('font-size:11.5px;color:var(--i3)')}>{u.email}</div>
                <div style={sx('font-size:11.5px;color:var(--i2)')}>{u.role}</div>
                <div style={sx('font-size:11.5px;color:var(--i3)')}>{u.manager}</div>
                <div style={sx('font-size:11px;color:var(--i3)')}>{u.businessUnit}</div>
                <div><span className={`sc ${statusClass(u.status)}`}>{u.status.toUpperCase()}</span></div>
                <div style={sx('font-size:10.5px;color:var(--i4)')}>{u.lastSignIn}</div>
              </div>))}
          </div>
        </div>
      </main>

      <div className={`detail-drawer${drawerOpen ? ' open' : ''}`} id="detailDrawer">
        <div className="drawer-hdr">
          <div><div className="drawer-title" id="detTitle">{du ? du.name : 'User detail'}</div><div className="drawer-sub" id="detSub">{du ? du.email : '—'}</div></div>
          <div className="drawer-close" onClick={closeDrawer}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></div>
        </div>
        <div className="drawer-body" id="detBody">{du ? <>
          <div className="panel" style={sx('margin-bottom:12px')}>
            <div className="panel-hdr"><span className="panel-ttl">Details</span></div>
            <div className="panel-body">
              <div className="dim-row" style={sx('border:none;padding:4px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Role</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto;font-weight:600')}>{du.role}</span></div>
              <div className="dim-row" style={sx('border:none;padding:4px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Manager</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto')}>{du.manager}</span></div>
              <div className="dim-row" style={sx('border:none;padding:4px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Business unit</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto')}>{du.businessUnit}</span></div>
              <div className="dim-row" style={sx('border:none;padding:4px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Status</span><span className={`sc ${statusClass(du.status)}`} style={sx('margin-left:auto')}>{du.status.toUpperCase()}</span></div>
            </div>
          </div>
          <div className="panel" style={sx('margin-bottom:12px')}>
            <div className="panel-hdr"><span className="panel-ttl">Change history</span></div>
            <div className="panel-body">
              {du.history.map((h, i) => <div key={i} style={sx('font-size:11.5px;color:var(--i2);padding:6px 0;border-bottom:1px solid var(--s75)')}><span style={sx('color:var(--i4);font-size:10.5px')}>{h.when}</span>{` — ${h.what}`}</div>)}
            </div>
          </div>
          <div style={sx('display:flex;gap:8px')}>
            <button className="btn btn-sec btn-sm" style={sx('flex:1;justify-content:center')} onClick={() => openModal({ kind: 'edit', id: du.id })}>Edit</button>
            {du.status !== 'deactivated'
              ? <button className="btn btn-sec btn-sm" style={sx('flex:1;justify-content:center;color:var(--neg)')} onClick={() => openModal({ kind: 'deactivate', id: du.id })}>Deactivate</button>
              : <span style={sx('flex:1;text-align:center;font-size:11px;color:var(--i4);align-self:center')}>Deactivated</span>}
          </div>
        </> : null}</div>
      </div>

      {modal ? (
        <div id="modalOverlay" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          style={{ ...sx('position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center;'), display: modalOpen ? 'flex' : 'none' }}>
          <div key={modal.key} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:440px;max-width:90vw;padding:22px;')} onClick={e => e.stopPropagation()}>
            {renderModalBody(modal)}
          </div>
        </div>
      ) : null}
    </>
  );
}
