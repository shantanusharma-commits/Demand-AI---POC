import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { pageQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { listCorrections } from '@/lib/server/services/corrections';
import { EDIT_REASONS } from '@/lib/engine/corrections';

// Every correction in the business unit, newest first (the Corrections tab, G-015). Reps see the corrections to their
// own rows.
export const GET = withApi({ route: 'GET /api/corrections', auth: 'unit', permission: 'lists.view' }, async ({ request, deps, tenant }) => {
  const q = pageQuery(request, { severity: z.enum(['major', 'minor']).optional(), reason: z.enum(EDIT_REASONS).optional() });
  return withTenant(deps.db, tenant!, s => listCorrections(s, q));
});
