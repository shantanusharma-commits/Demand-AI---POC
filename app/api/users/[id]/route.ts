import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, roleField, uuidField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { updateMember } from '@/lib/server/services/users';

const Patch = z.object({
  role: roleField.optional(),
  managerUserId: uuidField.nullable().optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  reason: z.string().trim().max(500).optional(),
}).refine(v => v.role !== undefined || v.managerUserId !== undefined || v.displayName !== undefined, { message: 'Nothing to change.' });

export const PATCH = withApi<z.infer<typeof Patch>, { id: string }>(
  { route: 'PATCH /api/users/:id', auth: 'unit', permission: 'users.manage', body: Patch },
  async ({ deps, tenant, role, body, params }) => {
    if (!isUuid(params.id)) throw notFound();
    await withTenant(deps.db, tenant!, s => updateMember(s, { userId: tenant!.userId, role: role! }, params.id, body));
    return { ok: true };
  });
