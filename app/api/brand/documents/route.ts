import { withApi } from '@/lib/server/http/api';
import { badRequest, HttpError } from '@/lib/server/http/errors';
import { readBodyBytes } from '@/lib/server/http/request';
import { withTenant } from '@/lib/server/db/tenant';
import { addDocument, DOCUMENT_MAX_BYTES } from '@/lib/server/services/brand';

// A brand guideline document, as multipart/form-data with `file` (Admin, Sales manager): checked by type and contents,
// at most 5 MB, kept as the reference the brand pack names.
export const POST = withApi({ route: 'POST /api/brand/documents', auth: 'unit', permission: 'brand.manage' }, async ({ request, deps, tenant, role }) => {
  const type = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data;/i.test(type)) throw new HttpError(415, 'unsupported_type', 'Send the file as a form upload (multipart/form-data).');
  const raw = await readBodyBytes(request, DOCUMENT_MAX_BYTES + 64 * 1024);
  if (raw === null) throw new HttpError(413, 'too_large', 'The document is larger than 5 MB.');
  let form: FormData;
  try { form = await new Response(new Uint8Array(raw), { headers: { 'content-type': type } }).formData(); }
  catch { throw badRequest('The upload could not be read. Choose the file again.'); }
  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('Choose a file to upload.', { file: ['Choose a file.'] });
  const document = await withTenant(deps.db, tenant!, async s => addDocument(s, { userId: tenant!.userId, role: role! }, { fileName: file.name, bytes: Buffer.from(await file.arrayBuffer()) }));
  return Response.json({ document }, { status: 201 });
});
