// One permission table for the UI and the server (plan §8, D-4, D-26, D-33). The server enforces it on every
// request; the UI only uses it to hide what a role can't use. Roles are per business unit; "Platform admin" is a
// separate flag on the user that only manages business units.

export const BU_ROLES = ['Admin', 'Sales manager', 'Sales rep', 'Viewer'] as const;
export type BuRole = (typeof BU_ROLES)[number];

/** Each screen, keyed by the id the original pages used. */
export const PAGES = {
  '00-today.html': { route: '/today', name: 'Today', key: 'today' },
  '09-setup.html': { route: '/setup', name: 'Setup', key: 'setup' },
  '08-users.html': { route: '/users', name: 'Users and roles', key: 'users' },
  '07-content.html': { route: '/content', name: 'Content library', key: 'content' },
  '14-review.html': { route: '/review', name: 'For Review', key: 'review' },
  '10-prospecting.html': { route: '/prospecting', name: 'Prospecting', key: 'prospecting' },
  '11-scoring.html': { route: '/scoring', name: 'Account Scoring', key: 'scoring' },
  '12-nba.html': { route: '/nba', name: 'Micro-segments & NBA', key: 'nba' },
  '15-content-studio.html': { route: '/studio', name: 'Content studio', key: 'studio' },
  '13-analytics.html': { route: '/analytics', name: 'Analytics', key: 'analytics' },
} as const;
export type PageId = keyof typeof PAGES;

const ALL_PAGES = Object.keys(PAGES) as PageId[];

/** Admin sees every screen, For Review included (G-034). Reps lose Setup and Users; Viewers see Analytics only. */
export const PAGE_ACCESS: Record<BuRole, readonly PageId[]> = {
  'Admin': ALL_PAGES,
  'Sales manager': ALL_PAGES,
  'Sales rep': ['00-today.html', '14-review.html', '10-prospecting.html', '11-scoring.html', '12-nba.html', '15-content-studio.html', '07-content.html', '13-analytics.html'],
  'Viewer': ['13-analytics.html'],
};

const EVERYONE: readonly BuRole[] = BU_ROLES;
const MANAGERS: readonly BuRole[] = ['Admin', 'Sales manager'];
const WORKERS: readonly BuRole[] = ['Admin', 'Sales manager', 'Sales rep'];

/** What each role may do in its business unit. */
export const ACTIONS = {
  'today.view': WORKERS,
  'users.view': MANAGERS,
  'users.manage': MANAGERS,
  'users.grantAdmin': ['Admin'], // only Admin grants or removes the Admin role (D-26)
  'setup.view': MANAGERS,
  'setup.signOff': ['Admin'],
  'setup.signals': ['Admin'],
  'content.view': WORKERS,
  'brand.manage': MANAGERS,
  'claims.manage': MANAGERS,
  'studio.use': WORKERS,
  'data.upload': WORKERS,
  'lists.view': WORKERS,
  'lists.write': WORKERS,
  'scoring.run': WORKERS,
  'handoff.create': WORKERS,
  'nba.run': WORKERS,
  'review.decide': WORKERS,
  'review.approve': MANAGERS,
  'segments.pause': MANAGERS,
  'routing.manage': MANAGERS, // the unit's routing rules (D-34)
  'routing.transfer': MANAGERS, // move an account to another business unit (D-34)
  'validation.edit': MANAGERS,
  'readout.signoff': MANAGERS,
  'analytics.view': EVERYONE,
  'audit.view': ['Admin'],
  'ai.admin': ['Admin'], // the AI health check and the record of AI calls (Phase 6)
  'copilot.use': WORKERS,
  'session.use': EVERYONE,
} as const satisfies Record<string, readonly BuRole[]>;
export type Action = keyof typeof ACTIONS;

export function canAccessPage(role: BuRole | null | undefined, page: PageId): boolean {
  return !!role && PAGE_ACCESS[role].includes(page);
}

export function can(role: BuRole | null | undefined, action: Action): boolean {
  return !!role && (ACTIONS[action] as readonly BuRole[]).includes(role);
}

/** How much of the unit's data a role sees: reps only what they own (owner email or alias), others all of it. */
export function scopeFor(role: BuRole): 'all' | 'own' {
  return role === 'Sales rep' ? 'own' : 'all';
}

/** Where a role lands after signing in. */
export function homePage(role: BuRole | null | undefined): PageId | null {
  return role ? PAGE_ACCESS[role][0] : null;
}

/** The signed-in person as the browser sees them. No password data, no other user's details. */
export type SessionUser = {
  id: string;
  displayName: string;
  email: string;
  platformAdmin: boolean;
  activeBusinessUnit: { id: string; code: string; name: string; role: BuRole } | null;
  memberships: { businessUnitId: string; code: string; name: string; role: BuRole }[];
};

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/** Plain words for each action, used in "Your role (…) cannot …" refusals. */
export const ACTION_LABELS: Record<Action, string> = {
  'today.view': 'open Today', 'users.view': 'view users', 'users.manage': 'manage users', 'users.grantAdmin': 'grant or remove the Admin role',
  'setup.view': 'view Setup', 'setup.signOff': 'sign off Setup sections', 'setup.signals': 'switch signal types',
  'content.view': 'view the Content library', 'brand.manage': 'change the brand pack', 'claims.manage': 'manage approved claims',
  'studio.use': 'use the Content studio', 'data.upload': 'upload files', 'lists.view': 'view lists', 'lists.write': 'change lists',
  'scoring.run': 'run scoring', 'handoff.create': 'hand off prospects', 'nba.run': 'build next best actions',
  'review.decide': 'decide on recommendations', 'review.approve': 'approve sensitive items', 'segments.pause': 'pause segments',
  'routing.manage': 'change the routing rules', 'routing.transfer': 'move accounts between business units', 'validation.edit': 'change validation settings',
  'readout.signoff': 'sign off the readout', 'analytics.view': 'view Analytics', 'audit.view': 'view the audit log', 'session.use': 'use DemandAI',
  'ai.admin': 'check the AI service', 'copilot.use': 'ask Copilot',
};
