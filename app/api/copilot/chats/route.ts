import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { pageQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { COPILOT_SCREENS } from '@/lib/copilot/types';
import { listChats } from '@/lib/server/services/copilot-chats';

// The person's saved Copilot chats on a screen, newest first (the panel's history); with ?key=, those about one record
// (the chat to carry on when the panel opens). Only their own.
export const GET = withApi({ route: 'GET /api/copilot/chats', auth: 'unit', permission: 'copilot.use' }, async ({ request, deps, tenant }) => {
  const q = pageQuery(request, { screen: z.enum(COPILOT_SCREENS), key: z.string().max(80).optional() });
  return { chats: await withTenant(deps.db, tenant!, s => listChats(s, q.screen, q.key)) };
});
