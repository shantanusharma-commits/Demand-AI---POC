'use client';

/* The frame every screen shares: the sidebar, the signed-in person and their business unit.
   Which links show comes from the server's permission table for the person's role in the active unit; the
   server also refuses every page and request the role may not use, so hiding a link is only a convenience. */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { PAGE_ACCESS, PAGES, initialsOf, type PageId, type SessionUser } from '@/lib/auth/permissions';
import { api, errorText } from '@/lib/client/api';
import { showToast } from '@/lib/ui';
import { SessionProvider } from './SessionContext';

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
    { page: '15-content-studio.html', label: 'Content studio', icon: <svg {...svg}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
  ] },
  { title: 'Measure', links: [
    { page: '13-analytics.html', label: 'Analytics', icon: <svg {...svg}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  ] },
];

function NoAccess({ user }: { user: SessionUser }) {
  const role = user.activeBusinessUnit?.role;
  const first = role ? PAGE_ACCESS[role][0] : null;
  return (
    <main className="main">
      <div className="topbar"><div className="topbar-l"><span className="tb-title">No access</span></div></div>
      <div className="canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
          <div style={{ fontFamily: 'var(--fd)', fontSize: 15, fontWeight: 700, color: 'var(--i1)', marginBottom: 6 }}>Not available for your role</div>
          <div style={{ fontSize: 12, color: 'var(--i3)', lineHeight: 1.6 }}>
            {role
              ? <>{role} in {user.activeBusinessUnit!.name} doesn&apos;t have access to this screen.{first ? <> Go to <Link href={PAGES[first].route} style={{ color: 'var(--brand)' }}>{PAGES[first].name}</Link>.</> : null}</>
              : <>You aren&apos;t an active member of a business unit yet. Ask your administrator to add you.{user.platformAdmin ? <> Manage <Link href="/platform" style={{ color: 'var(--brand)' }}>business units</Link>.</> : null}</>}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function AppShell({ page, user, allowed, children }: { page: PageId | 'platform'; user: SessionUser; allowed: boolean; children: ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const role = user.activeBusinessUnit?.role;
  const visible: readonly PageId[] = role ? PAGE_ACCESS[role] : [];
  const item = (l: NavLink) => (
    <Link key={l.page} className={`nav-item ${l.page === page ? 'active' : ''}`} href={PAGES[l.page].route} style={visible.includes(l.page) ? undefined : { display: 'none' }}>
      {l.icon}
      <span className="nav-lbl">{l.label}</span>
    </Link>
  );
  const switchUnit = async (businessUnitId: string) => {
    setBusy(true);
    try {
      await api('/api/session/business-unit', { body: { businessUnitId } });
      router.push('/');
      router.refresh();
    } catch (err) {
      showToast(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    setBusy(true);
    try { await api('/api/auth/logout', { body: {} }); } catch { /* the session may already be gone */ }
    // A full reload, not a client navigation: nothing of the signed-out person stays in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login');
  };

  return (
    <SessionProvider user={user}>
      <div className="shell" data-page={page === 'platform' ? 'platform' : PAGES[page].key}>
        <nav className="nav" aria-label="Main">
          <div className="nav-brand">
            <div style={{ width: 26, height: 26, flexShrink: 0 }}>
              <svg width="26" height="26" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
            {user.platformAdmin ? (
              <SectionBlock title="Platform">
                <Link className={`nav-item ${page === 'platform' ? 'active' : ''}`} href="/platform">
                  <svg {...svg}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  <span className="nav-lbl">Business units</span>
                </Link>
              </SectionBlock>
            ) : null}
          </div>
          <div className="nav-foot">
            <div className="nav-user">
              <div className="nav-av">{initialsOf(user.displayName)}</div>
              <div><div className="nav-un">{user.displayName}</div><div className="nav-ur">{role ?? (user.platformAdmin ? 'Platform admin' : 'No unit')}</div></div>
            </div>
            {user.memberships.length > 1 ? (
              <div style={{ padding: '8px 10px 0' }}>
                <label htmlFor="buSwitch" style={{ fontSize: 10, color: 'var(--r3)', display: 'block', marginBottom: 3 }}>Business unit</label>
                <select id="buSwitch" disabled={busy} value={user.activeBusinessUnit?.id ?? ''} onChange={e => void switchUnit(e.target.value)}
                  style={{ width: '100%', fontSize: 11, borderRadius: 6, padding: '4px 6px', background: 'var(--surf)', color: 'var(--i1)' }}>
                  {user.memberships.map(m => <option key={m.businessUnitId} value={m.businessUnitId}>{m.name} · {m.role}</option>)}
                </select>
              </div>
            ) : user.activeBusinessUnit ? (
              <div style={{ padding: '6px 10px 0', fontSize: 10, color: 'var(--r3)' }}>{user.activeBusinessUnit.name}</div>
            ) : null}
            <div style={{ padding: '8px 10px 0' }}>
              <button type="button" onClick={() => void signOut()} disabled={busy}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: 10.5, color: 'var(--r3)', textDecoration: 'underline', cursor: 'pointer', width: '100%' }}>
                Sign out
              </button>
            </div>
          </div>
        </nav>
        {allowed ? children : <NoAccess user={user} />}
      </div>
    </SessionProvider>
  );
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (<>
    <div className="nav-div"></div>
    <div className="nav-sec">{title}</div>
    {children}
  </>);
}
