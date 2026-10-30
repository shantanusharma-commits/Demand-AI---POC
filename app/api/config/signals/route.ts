import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { addSignalType } from '@/lib/server/services/setup';

const Body = z.object({
  name: z.string().trim().min(1, 'Give the signal a name, as it appears in the signal_type column').max(80),
  segment: z.string().trim().max(80).default(''),
  level: z.enum(['Strong', 'Medium', 'Light']),
  full: z.coerce.number().int().min(1).max(3650),
  zero: z.coerce.number().int().min(2).max(3650),
  about: z.string().trim().max(300).default(''),
  data: z.string().trim().max(300).default(''),
  source: z.string().trim().max(120).default(''),
});

// Adds a signal type (Admin): new scoring runs recognise it in the signal file from the next configuration version.
export const POST = withApi<z.infer<typeof Body>>({ route: 'POST /api/config/signals', auth: 'unit', permission: 'setup.signals', body: Body }, async ({ deps, tenant, role, body }) => {
  const result = await withTenant(deps.db, tenant!, s => addSignalType(s, { userId: tenant!.userId, role: role! }, body));
  return Response.json(result, { status: 201 });
});
