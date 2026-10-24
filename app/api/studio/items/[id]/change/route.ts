import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { LIMITS } from '@/lib/server/auth/rate-limit';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { changeItemWithAi } from '@/lib/server/services/studio';

const Body = z.object({
  op: z.enum(['ask', 'tone', 'length', 'regenerate', 'remove', 'restore']), q: z.string().max(2000).optional(), value: z.string().max(40).optional(),
  target: z.string().max(40).nullish(), blocks: z.unknown().optional(), rev: z.number().int().min(1),
});

// A change asked for in the chat, or from the canvas (tone, length, regenerate or remove a part, undo).
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/studio/items/:id/change', auth: 'unit', permission: 'studio.use', body: Body, maxBodyBytes: 512 * 1024, limit: LIMITS.studioWrite }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return changeItemWithAi(deps.db, tenant!, { userId: tenant!.userId, role: role! }, params.id, body);
});
