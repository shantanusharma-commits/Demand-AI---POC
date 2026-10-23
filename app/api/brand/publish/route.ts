import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { publishDraft } from '@/lib/server/services/brand';

const Body = z.object({ note: z.string().trim().max(300).default('') });

// Saves the unsaved changes as the next brand version: new drafts follow it (Admin, Sales manager).
export const POST = withApi<z.infer<typeof Body>>({ route: 'POST /api/brand/publish', auth: 'unit', permission: 'brand.manage', body: Body }, async ({ deps, tenant, role, body }) => {
  return withTenant(deps.db, tenant!, s => publishDraft(s, { userId: tenant!.userId, role: role! }, body.note));
});
