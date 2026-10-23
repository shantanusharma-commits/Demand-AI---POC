import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { claimUsage } from '@/lib/server/services/brand';

// Where each approved claim was cited in micro-segment drafts and whether the message went out, and sentences people
// approved in For Review that are not claims yet (the caller's own items, for a rep).
export const GET = withApi({ route: 'GET /api/brand/claims/usage', auth: 'unit', permission: 'content.view' }, async ({ deps, tenant }) => {
  return withTenant(deps.db, tenant!, s => claimUsage(s));
});
