// The fictional people and unit the end-to-end tests create through the screens, and where their signed-in sessions
// are kept between specs. Read by e2e/stack.ts (Node) and by the specs (Playwright), so it imports nothing.

/** Local only and git-ignored: the stack's address and invite link, and each person's browser session. */
export const E2E_STATE = 'e2e/.state';
export const statePath = (who: Who) => `${E2E_STATE}/${who}.json`;

/** One password for everyone in this throwaway environment (12+ characters, not on the common list). */
export const PASSWORD = 'e2e only: plum kettle harbour 47';

export const PLATFORM = { email: 'platform.e2e@demandai.test', name: 'Pat Platform' };
export const UNIT = { code: 'e2e-bu', name: 'End-to-end unit' };

export type Who = 'admin' | 'manager' | 'rep' | 'rep2' | 'viewer';
export type Person = { email: string; name: string; role: 'Admin' | 'Sales manager' | 'Sales rep' | 'Viewer'; aliases: string[] };

// The reps own accounts of the sample's fictional owners (owner_email in test-data/), as owner aliases.
export const PEOPLE: Record<Who, Person> = {
  admin: { email: 'admin.e2e@demandai.test', name: 'Ada Admin', role: 'Admin', aliases: [] },
  manager: { email: 'manager.e2e@demandai.test', name: 'Max Manager', role: 'Sales manager', aliases: [] },
  rep: { email: 'rep.e2e@demandai.test', name: 'Rae Rep', role: 'Sales rep', aliases: ['meera.nair@client-sample.com', 'natalie.chen@client-sample.com'] },
  rep2: { email: 'rep2.e2e@demandai.test', name: 'Rob Rep', role: 'Sales rep', aliases: ['jessica.tan@client-sample.com'] },
  viewer: { email: 'viewer.e2e@demandai.test', name: 'Vic Viewer', role: 'Viewer', aliases: [] },
};
