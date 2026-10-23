import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { getDocument } from '@/lib/server/services/brand';

// The guideline document, always as a download (never shown inline), with its original name.
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/brand/documents/:id', auth: 'unit', permission: 'content.view' }, async ({ deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const doc = await withTenant(deps.db, tenant!, s => getDocument(s, params.id));
  const ascii = doc.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return new Response(new Uint8Array(doc.bytes), { headers: {
    'content-type': 'application/octet-stream',
    'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    'x-content-type-options': 'nosniff',
  } });
});
