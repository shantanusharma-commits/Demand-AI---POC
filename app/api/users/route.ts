import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { emailField, roleField, uuidField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { inviteMember, listMembers } from '@/lib/server/services/users';

export const GET = withApi({ route: 'GET /api/users', auth: 'unit', permission: 'users.view' }, async ({ deps, tenant }) => {
  const members = await withTenant(deps.db, tenant!, s => listMembers(s));
  return { members, emailEnabled: deps.mailer.enabled };
});

const Invite = z.object({
  email: emailField,
  displayName: z.string().trim().min(1, 'Enter a name.').max(120),
  role: roleField,
  managerUserId: uuidField.nullish(),
});

export const POST = withApi({ route: 'POST /api/users', auth: 'unit', permission: 'users.manage', body: Invite }, async ({ deps, tenant, role, body }) => {
  const result = await withTenant(deps.db, tenant!, s => inviteMember(deps, s, { userId: tenant!.userId, role: role! }, body));
  return Response.json(result, { status: 201 });
});
