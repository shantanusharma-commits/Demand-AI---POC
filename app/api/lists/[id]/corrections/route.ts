import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound, tooMany } from '@/lib/server/http/errors';
import { isUuid, pageQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { hit } from '@/lib/server/auth/rate-limit';
import { addCorrections, CORRECTION_RATE, listCorrections } from '@/lib/server/services/corrections';
import { CORRECTION_FIELDS, EDIT_REASONS, EDIT_SOURCES } from '@/lib/engine/corrections';

type P = { id: string };

// The corrections made to this list's file, newest first, with the counts the log shows (G-015). Reps see the
// corrections to their own rows.
export const GET = withApi<undefined, P>({ route: 'GET /api/lists/:id/corrections', auth: 'unit', permission: 'lists.view' }, async ({ request, deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const q = pageQuery(request, { severity: z.enum(['major', 'minor']).optional(), reason: z.enum(EDIT_REASONS).optional() });
  return withTenant(deps.db, tenant!, s => listCorrections(s, { listId: params.id, ...q }));
});

const Body = z.object({
  row: z.number().int().positive(),
  changes: z.partialRecord(z.enum(CORRECTION_FIELDS), z.string().max(500)),
  reason: z.enum(EDIT_REASONS, 'Say what was wrong: it is what makes the correction useful later.'),
  source: z.union([z.enum(EDIT_SOURCES), z.literal('')]).default(''),
  note: z.string().trim().max(500).default(''),
});

// A person's corrections to one row, with what was wrong and how they know; the list is then checked again from the
// stored file (a job) and the new version replaces it. Uploader or manager only.
export const POST = withApi<z.infer<typeof Body>, P>({ route: 'POST /api/lists/:id/corrections', auth: 'unit', permission: 'lists.write', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  if (!(await hit(deps.db, CORRECTION_RATE, tenant!.userId)).allowed) throw tooMany('Too many corrections in a short time. Wait a few minutes and try again.');
  const result = await withTenant(deps.db, tenant!, s => addCorrections(s, { userId: tenant!.userId, role: role! }, params.id, body));
  return Response.json(result, { status: 201 });
});
