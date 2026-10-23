import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { discardDraft, PackInput, saveDraft } from '@/lib/server/services/brand';

const Body = z.object({ pack: PackInput, baseVersionNo: z.number().int().min(1) });

// Keeps the unit's unsaved changes to the brand pack (Admin, Sales manager). Drafts keep following the version in use
// until the changes are saved as a new version.
export const PUT = withApi<z.infer<typeof Body>>({ route: 'PUT /api/brand/draft', auth: 'unit', permission: 'brand.manage', body: Body }, async ({ deps, tenant, role, body }) => {
  return withTenant(deps.db, tenant!, s => saveDraft(s, { userId: tenant!.userId, role: role! }, body));
});

export const DELETE = withApi({ route: 'DELETE /api/brand/draft', auth: 'unit', permission: 'brand.manage' }, async ({ deps, tenant, role }) => {
  await withTenant(deps.db, tenant!, s => discardDraft(s, { userId: tenant!.userId, role: role! }));
  return { ok: true };
});
