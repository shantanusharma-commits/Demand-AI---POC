import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { emailField, isUuid } from '@/lib/server/http/schemas';
import { withUser } from '@/lib/server/db/tenant';
import { inviteUnitAdmin } from '@/lib/server/services/platform';

const Body = z.object({ email: emailField, displayName: z.string().trim().min(1).max(120) });

export const POST = withApi<z.infer<typeof Body>, { id: string }>(
  { route: 'POST /api/platform/business-units/:id/admins', auth: 'platform', body: Body },
  async ({ deps, session, body, params }) => {
    if (!isUuid(params.id)) throw notFound();
    const result = await withUser(deps.db, { userId: session!.user.id, platformAdmin: true }, s => inviteUnitAdmin(deps, s, params.id, body));
    return Response.json(result, { status: 201 });
  });
