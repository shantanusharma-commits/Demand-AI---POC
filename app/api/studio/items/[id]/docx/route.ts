import { withApi } from '@/lib/server/http/api';
import { docxDownload } from '@/lib/server/http/download';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { exportItem } from '@/lib/server/services/studio';

// The piece as a Word document, with a light brand: a rule under the title, underlined headings, "Client" in the header.
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/studio/items/:id/docx', auth: 'unit', permission: 'studio.use' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const f = await withTenant(deps.db, tenant!, s => exportItem(s, { userId: tenant!.userId, role: role! }, params.id, 'docx'));
  return docxDownload(f.fileName, f.body as Buffer);
});
