import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withUser } from '@/lib/server/db/tenant';
import { createUnit, listUnits } from '@/lib/server/services/platform';

const platformCtx = (userId: string) => ({ userId, platformAdmin: true });

export const GET = withApi({ route: 'GET /api/platform/business-units', auth: 'platform' }, async ({ deps, session }) => {
  return { units: await withUser(deps.db, platformCtx(session!.user.id), s => listUnits(s)) };
});

const Create = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, 'Use 2-40 lower-case letters, digits or hyphens.'),
  name: z.string().trim().min(2).max(120),
});

export const POST = withApi({ route: 'POST /api/platform/business-units', auth: 'platform', body: Create }, async ({ deps, session, body }) => {
  const unit = await withUser(deps.db, platformCtx(session!.user.id), s => createUnit(s, body));
  return Response.json(unit, { status: 201 });
});
