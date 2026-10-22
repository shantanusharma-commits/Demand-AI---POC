// Page guard for Server Components. A missing or invalid session redirects to the sign-in page; a role without
// access to the page gets the "not available" frame and none of the screen's code or data.
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { canAccessPage, PAGES, type PageId, type SessionUser } from '../../auth/permissions.ts';
import { appDeps } from '../deps.ts';
import { loadSession, SESSION_COOKIE } from './sessions.ts';
import { logger } from '../logger.ts';

export async function currentUser(): Promise<SessionUser | null> {
  // Reading cookies first makes the page dynamic before any server dependency is touched, so `next build`
  // never needs a database or secrets to prerender.
  const jar = await cookies();
  const deps = appDeps();
  const session = await loadSession(deps.db, deps.session, jar.get(SESSION_COOKIE)?.value);
  return session?.user ?? null;
}

export async function requirePage(page: PageId | 'platform'): Promise<{ user: SessionUser; allowed: boolean }> {
  const user = await currentUser();
  const route = page === 'platform' ? '/platform' : PAGES[page].route;
  if (!user) redirect(`/login?next=${encodeURIComponent(route)}`);
  const allowed = page === 'platform' ? user.platformAdmin : canAccessPage(user.activeBusinessUnit?.role, page);
  if (!allowed) logger.warn({ event: 'page.denied', page: route, userId: user.id, role: user.activeBusinessUnit?.role ?? null }, 'Page refused for this role');
  return { user, allowed };
}
