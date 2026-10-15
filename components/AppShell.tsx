'use client';

/* The frame every screen shares: the sidebar, the demo role switcher and the role check.
   Markup and behaviour match the nav and ROLE ENGINE block that each original HTML page repeated. */
import Link from 'next/link';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import {
  ALL_ROLES, PAGE_NAMES, PAGE_ROUTES, ROLE_NAV_ALLOWED, ROLE_PERSON, getRole, initialsOf, storeRole,
  type PageId, type Role,
} from '@/lib/roles';

interface NavLink { page: PageId; label: string; icon: ReactNode }

const svg = { className: 'nav-ic', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const };

const TODAY: NavLink = { page: '00-today.html', label: 'Today', icon: <svg {...svg}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> };
const SECTIONS: { title: string; links: NavLink[] }[] = [
  { title: 'Configure', links: [
    { page: '09-setup.html', label: 'Setup', icon: <svg {...svg}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
    { page: '08-users.html', label: 'Users and roles', icon: <svg {...svg}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { page: '07-content.html', label: 'Content library', icon: <svg {...svg}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> },
  ] },
  { title: 'Work', links: [
    { page: '14-review.html', label: 'For Review', icon: <svg {...svg}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
  ] },
  { title: 'Acquire', links: [
    { page: '10-prospecting.html', label: 'Prospecting', icon: <svg {...svg}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> },
  ] },
  { title: 'Reasoning', links: [
    { page: '11-scoring.html', label: 'Account Scoring', icon: <svg {...svg}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  ] },
  { title: 'Engage', links: [
    { page: '12-nba.html', label: 'Micro-segments & NBA', icon: <svg {...svg}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> },
  ] },
  { title: 'Measure', links: [
    { page: '13-analytics.html', label: 'Analytics', icon: <svg {...svg}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  ] },
];

/** Nav items shown as active on each screen. In the original, Content library and Users and roles also marked
 *  Today as active (a copy-paste quirk in their markup); kept so the sidebar looks the same. */
const EXTRA_ACTIVE: Partial<Record<PageId, PageId[]>> = {
  '07-content.html': ['00-today.html'],
  '08-users.html': ['00-today.html'],
};

/** Short name used for page-specific CSS (data-page on .shell). */
const PAGE_KEY: Record<PageId, string> = {
  '00-today.html': 'today', '07-content.html': 'content', '08-users.html': 'users', '09-setup.html': 'setup',
  '10-prospecting.html': 'prospecting', '11-scoring.html': 'scoring', '12-nba.html': 'nba', '13-analytics.html': 'analytics', '14-review.html': 'review',
};

function NoAccess({ role }: { role: Role }) {
  const firstAllowed = ROLE_NAV_ALLOWED[role][0] || '00-today.html';
  return (
    <main className="main">
      <div className="topbar"><div className="topbar-l"><span className="tb-title">No access</span></div></div>
      <div className="canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
          <div style={{ fontFamily: 'var(--fd)', fontSize: 15, fontWeight: 700, color: 'var(--i1)', marginBottom: 6 }}>Not available for this role</div>
          <div style={{ fontSize: 12, color: 'var(--i3)', lineHeight: 1.6 }}>{role} doesn&apos;t have access to this screen. Switch role from the sidebar, or use the menu to go to <Link href={PAGE_ROUTES[firstAllowed]} style={{ color: 'var(--brand)' }}>{PAGE_NAMES[firstAllowed] || firstAllowed}</Link>.</div>
        </div>
      </div>
    </main>
  );
}

function RoleModal({ current, onPick, onClose }: { current: Role; onPick: (r: Role) => void; onClose: () => void }) {
  return (
    <div id="roleModalOverlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,26,33,.45)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surf)', borderRadius: 'var(--rlg)', boxShadow: 'var(--sh-lg)', width: 360, padding: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: 14, fontWeight: 700, color: 'var(--i1)', marginBottom: 4 }}>Preview as a role</div>
        <div style={{ fontSize: 11, color: 'var(--i3)', marginBottom: 14 }}>Changes what you see, matching what that role actually has access to. If this screen isn&apos;t available for the new role, use the sidebar to go to one that is.</div>
        {ALL_ROLES.map(r => (
          <div key={r} onClick={() => onPick(r)} style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: r === current ? 'var(--brand-lt)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div><div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--i1)' }}>{r}</div><div style={{ fontSize: 10.5, color: 'var(--i3)' }}>{ROLE_PERSON[r]}</div></div>
            {r === current ? <span style={{ color: 'var(--brand)' }}>✓</span> : null}
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function AppShell({ page, children }: { page: PageId; children: ReactNode }) {
  const [role, setRoleState] = useState<Role>('Sales manager');
  const [modalOpen, setModalOpen] = useState(false);
  // As in the original, once a role without access has blanked this screen it stays blanked until the page is reloaded
  // or left, even if another role is picked afterwards.
  const [blocked, setBlocked] = useState(false);

  const apply = (r: Role) => {
    setRoleState(r);
    if (!ROLE_NAV_ALLOWED[r].includes(page)) setBlocked(true);
  };
  // Read the stored role before the first paint, as the original did on DOMContentLoaded.
  useLayoutEffect(() => { apply(getRole()); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickRole = (r: Role) => { storeRole(r); setModalOpen(false); apply(r); };
  const allowed = ROLE_NAV_ALLOWED[role] || [];
  const person = ROLE_PERSON[role];
  const item = (l: NavLink) => (
    <Link key={l.page} className={`nav-item ${l.page === page || EXTRA_ACTIVE[page]?.includes(l.page) ? 'active' : ''}`} href={PAGE_ROUTES[l.page]} style={allowed.includes(l.page) ? undefined : { display: 'none' }}>
      {l.icon}
      <span className="nav-lbl">{l.label}</span>
    </Link>
  );

  return (
    <div className="shell" data-page={PAGE_KEY[page]}>
      <nav className="nav">
        <div className="nav-brand">
          <div style={{ width: 26, height: 26, flexShrink: 0 }}>
            <svg width="26" height="26" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
              <image href="/demandai-logo.png" width="200" height="200"/>
            </svg>
          </div>
          <div><div className="nav-nm">DemandAI</div></div>
        </div>
        <div className="nav-body">
          {item(TODAY)}
          {SECTIONS.map(s => (
            <SectionBlock key={s.title} title={s.title}>{s.links.map(item)}</SectionBlock>
          ))}
        </div>
        <div className="nav-foot">
          <div className="nav-user">
            <div className="nav-av">{initialsOf(person)}</div>
            <div><div className="nav-un">{person}</div><div className="nav-ur">{role}</div></div>
          </div>
          <div id="roleSwitchBtn" style={{ padding: '8px 10px 0', cursor: 'pointer' }} onClick={() => setModalOpen(true)}>
            <div style={{ fontSize: 10, color: 'var(--r3)', textDecoration: 'underline', textAlign: 'center' }}>Switch role (demo)</div>
          </div>
        </div>
      </nav>
      {blocked ? <NoAccess role={role} /> : children}
      {modalOpen ? <RoleModal current={role} onPick={pickRole} onClose={() => setModalOpen(false)} /> : null}
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (<>
    <div className="nav-div"></div>
    <div className="nav-sec">{title}</div>
    {children}
  </>);
}
