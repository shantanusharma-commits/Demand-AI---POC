import { withApi } from '@/lib/server/http/api';
import { LIMITS } from '@/lib/server/auth/rate-limit';
import { badRequest, HttpError } from '@/lib/server/http/errors';
import { readBodyBytes } from '@/lib/server/http/request';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { env } from '@/lib/server/env';
import { receiveUpload, uploadLimits } from '@/lib/server/services/uploads';

// A lead or signal file, as multipart/form-data with `kind` and `file`. The proxy doesn't buffer this route (N-06):
// the body is read here with a byte cap before anything parses it.
const MULTIPART_OVERHEAD = 64 * 1024;

export const POST = withApi({ route: 'POST /api/uploads', auth: 'unit', permission: 'data.upload', limit: LIMITS.upload }, async ({ request, deps, tenant }) => {
  const limits = uploadLimits(env());
  const type = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data;/i.test(type)) throw new HttpError(415, 'unsupported_type', 'Send the file as a form upload (multipart/form-data).');
  const raw = await readBodyBytes(request, limits.maxBytes + MULTIPART_OVERHEAD);
  if (raw === null) throw new HttpError(413, 'too_large', `The file is larger than ${Math.floor(limits.maxBytes / (1024 * 1024))} MB. Split it, or keep only the template sheet.`);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(raw), { headers: { 'content-type': type } }).formData();
  } catch {
    throw badRequest('The upload could not be read. Choose the file again.');
  }
  const kind = form.get('kind'), file = form.get('file'), mappingId = form.get('mappingId');
  if (kind !== 'lead' && kind !== 'signal') throw badRequest('Say whether this is a lead file or a signal file.', { kind: ['Use lead or signal.'] });
  if (!(file instanceof File)) throw badRequest('Choose a file to upload.', { file: ['Choose a file.'] });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (mappingId !== null && !isUuid(mappingId)) throw badRequest('That column mapping is not valid.', { mappingId: ['Not a valid ID.'] });
  const result = await withTenant(deps.db, tenant!, s => receiveUpload(s, { kind, fileName: file.name, mediaType: file.type, bytes, mappingId: mappingId ?? undefined }, limits), { label: 'upload.receive', slowMs: 5000 });
  return Response.json(result, { status: 201 });
});
