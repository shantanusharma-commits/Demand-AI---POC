import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { readGuideline } from '@/lib/server/services/brand';

// Reads a stored guideline (PDF, Word, PowerPoint, .txt, .md) and suggests rules, writing guidance, plays and frameworks
// for the draft brand pack (Admin, Sales manager): by the AI when it is on, else by the rules' reader. Nothing changes
// until a person adds a suggestion and saves the version.
export const POST = withApi<undefined, { id: string }>({ route: 'POST /api/brand/documents/:id/read', auth: 'unit', permission: 'brand.manage' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  return readGuideline(deps.db, tenant!, { userId: tenant!.userId, role: role! }, params.id);
});
