import { ACTIONS, PAGE_ACCESS, type Action } from '@/lib/auth/permissions';
import { withApi } from '@/lib/server/http/api';

export const GET = withApi({ route: 'GET /api/me', auth: 'user' }, async ({ session }) => {
  const user = session!.user;
  const role = user.activeBusinessUnit?.role;
  return {
    user,
    pages: role ? PAGE_ACCESS[role] : [],
    actions: role ? (Object.keys(ACTIONS) as Action[]).filter(a => (ACTIONS[a] as readonly string[]).includes(role)) : [],
  };
});
