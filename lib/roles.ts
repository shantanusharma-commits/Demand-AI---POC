/* Demo role switcher, shared across every screen (was the ROLE ENGINE block repeated in each HTML page).
   Front-end only: the role is kept in localStorage and only changes what the prototype shows. */

export type Role = 'Admin' | 'Sales manager' | 'Sales rep' | 'Viewer' | 'Platform admin';

/** Each screen's id, as the original pages named themselves, and the route it now lives at. */
export const PAGE_ROUTES = {
  '00-today.html': '/today',
  '07-content.html': '/content',
  '08-users.html': '/users',
  '09-setup.html': '/setup',
  '10-prospecting.html': '/prospecting',
  '11-scoring.html': '/scoring',
  '12-nba.html': '/nba',
  '13-analytics.html': '/analytics',
  '14-review.html': '/review',
} as const;
export type PageId = keyof typeof PAGE_ROUTES;

export const ALL_ROLES: Role[] = ['Admin', 'Sales manager', 'Sales rep', 'Viewer', 'Platform admin'];
export const ROLE_PERSON: Record<Role, string> = {
  'Admin': 'Rajiv Nair', 'Sales manager': 'Pavan Kumar', 'Sales rep': 'Sofia Ahlgren',
  'Viewer': 'Elena Vogel', 'Platform admin': 'Shantanu Rao',
};
export const ROLE_NAV_ALLOWED: Record<Role, PageId[]> = {
  'Admin': ['00-today.html', '09-setup.html', '07-content.html', '08-users.html', '10-prospecting.html', '11-scoring.html', '12-nba.html', '13-analytics.html'],
  'Sales manager': ['00-today.html', '14-review.html', '10-prospecting.html', '11-scoring.html', '12-nba.html', '07-content.html', '13-analytics.html', '09-setup.html', '08-users.html'],
  'Sales rep': ['00-today.html', '14-review.html', '10-prospecting.html', '11-scoring.html', '12-nba.html', '07-content.html', '13-analytics.html'],
  'Viewer': ['13-analytics.html'],
  'Platform admin': [],
};
export const PAGE_NAMES: Record<PageId, string> = {
  '00-today.html': 'Today', '09-setup.html': 'Setup', '07-content.html': 'Content library', '08-users.html': 'Users and roles',
  '10-prospecting.html': 'Prospecting', '11-scoring.html': 'Account Scoring', '12-nba.html': 'Next Best Action',
  '13-analytics.html': 'Analytics', '14-review.html': 'Review',
};

const ROLE_KEY = 'demandai_role';

export function getRole(): Role {
  try { return (localStorage.getItem(ROLE_KEY) as Role) || 'Sales manager'; }
  catch (e) { return 'Sales manager'; }
}
export function storeRole(role: Role): void {
  try { localStorage.setItem(ROLE_KEY, role); } catch (e) { /* storage blocked: the role applies to this view only */ }
}
export function initialsOf(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
