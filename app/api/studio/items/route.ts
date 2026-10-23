import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { createItem, listItems } from '@/lib/server/services/studio';

// Content studio: the unit's pieces, newest first (?ready=1 for those in the Content library), with their checks and
// how many messages they are in.
export const GET = withApi({ route: 'GET /api/studio/items', auth: 'unit', permission: 'studio.use' }, async ({ request, deps, tenant }) => {
  const ready = new URL(request.url).searchParams.get('ready') === '1';
  return { items: await withTenant(deps.db, tenant!, s => listItems(s, { ready })) };
});

const Body = z.object({ text: z.string().max(2000), type: z.enum(['blog', 'whitepaper']) });

// A new piece from a request in the person's own words; a request too vague to write gets a question back.
export const POST = withApi<z.infer<typeof Body>>({ route: 'POST /api/studio/items', auth: 'unit', permission: 'studio.use', body: Body }, async ({ deps, tenant, role, body }) => {
  return withTenant(deps.db, tenant!, s => createItem(s, { userId: tenant!.userId, role: role! }, body));
});
