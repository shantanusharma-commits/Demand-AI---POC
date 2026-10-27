import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { deleteChat, getChat } from '@/lib/server/services/copilot-chats';

// One of the person's saved Copilot chats, every message in order; or deleting it. Anyone else's is not there.
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/copilot/chats/:id', auth: 'unit', permission: 'copilot.use' }, async ({ deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  return { chat: await withTenant(deps.db, tenant!, s => getChat(s, params.id)) };
});

export const DELETE = withApi<undefined, { id: string }>({ route: 'DELETE /api/copilot/chats/:id', auth: 'unit', permission: 'copilot.use' }, async ({ deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => deleteChat(s, params.id), { label: 'copilot.chat.delete' });
  return { ok: true };
});
