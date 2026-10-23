import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { withTenant } from '@/lib/server/db/tenant';
import { CONFIG_SECTIONS, type ConfigSection } from '@/lib/server/db/schema';
import { signOffSection } from '@/lib/server/services/setup';

const Body = z.object({ note: z.string().trim().max(500).default('') });

// Reopens a signed-off Setup section for changes (Admin, G-002).
export const POST = withApi<z.infer<typeof Body>, { section: string }>({ route: 'POST /api/config/sections/:section/reopen', auth: 'unit', permission: 'setup.signOff', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!(CONFIG_SECTIONS as readonly string[]).includes(params.section)) throw notFound('There is no such Setup section.');
  await withTenant(deps.db, tenant!, s => signOffSection(s, { userId: tenant!.userId, role: role! }, params.section as ConfigSection, 'reopen', body.note));
  return { ok: true };
});
