import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { LIMITS } from '@/lib/server/auth/rate-limit';
import { uuidField } from '@/lib/server/http/schemas';
import { COPILOT_SCREENS } from '@/lib/copilot/types';
import { askCopilot } from '@/lib/server/services/copilot';

const Body = z.object({
  screen: z.enum(COPILOT_SCREENS),
  ref: z.object({ itemId: uuidField.optional(), nbaRunId: uuidField.optional(), listId: uuidField.optional(), runId: uuidField.optional(), contactId: uuidField.optional() }).default({}),
  question: z.string().max(2000),
  turns: z.array(z.object({ role: z.enum(['you', 'copilot']), text: z.string().max(4000) })).max(40).default([]),
  chip: z.boolean().default(false),
  /** The viewer's UTC offset in minutes (Date#getTimezoneOffset), so due dates match their screen. */
  offset: z.number().int().min(-900).max(900).default(0),
});

// Copilot (G-013): a question about what is on the screen, answered from the data the person can see. Rule answers
// first; a question they don't cover goes to the model when it is switched on. Never changes data; chats are not stored.
export const POST = withApi<z.infer<typeof Body>>({ route: 'POST /api/copilot', auth: 'unit', permission: 'copilot.use', body: Body, maxBodyBytes: 256 * 1024, limit: LIMITS.copilot }, async ({ request, deps, tenant, role, body }) => {
  return askCopilot(deps.db, tenant!, { userId: tenant!.userId, role: role! }, body, request.signal);
});
