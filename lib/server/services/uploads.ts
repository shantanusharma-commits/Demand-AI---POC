// Receiving a lead or signal file (D-7, D-8, plan §4 item 9). The file is checked before it is stored (type, size,
// macros, passwords, zip bombs) and refused with a reason the person can act on; an accepted file is kept as
// received, in the caller's business unit, and a lead file is queued for its checks. Logs never carry the file's
// name or content: kind, format, size and a hash prefix only.
import 'server-only';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { uploadFiles, uploads, UPLOAD_KINDS } from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { enqueueJob } from '../jobs/queue.ts';
import { inspectUpload, type UploadFormat } from '../uploads/inspect.ts';
import { DEFAULT_ZIP_LIMITS, type ZipLimits } from '../uploads/zip.ts';
import { HttpError } from '../http/errors.ts';
import { logger } from '../logger.ts';
import { DemandAISample } from '../../demandai-sample-data.ts';
import type { Env } from '../env.ts';

export type UploadKind = (typeof UPLOAD_KINDS)[number];
export type UploadLimits = { maxBytes: number; maxRows: number; timeLimitMs: number; zip: ZipLimits };

export function uploadLimits(e: Pick<Env, 'UPLOAD_MAX_BYTES' | 'UPLOAD_MAX_ROWS' | 'UPLOAD_TIME_LIMIT_MS' | 'UPLOAD_MAX_UNZIPPED_BYTES'>): UploadLimits {
  return { maxBytes: e.UPLOAD_MAX_BYTES, maxRows: e.UPLOAD_MAX_ROWS, timeLimitMs: e.UPLOAD_TIME_LIMIT_MS, zip: { ...DEFAULT_ZIP_LIMITS, maxUnzippedBytes: e.UPLOAD_MAX_UNZIPPED_BYTES } };
}

export const LEAD_STAGES = ['parse', 'check', 'save'];

/** The name as shown back to people: no folders, no control characters, at most 200 characters. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (base || 'upload').slice(0, 200);
}

export type Received = { uploadId: string; jobId: string | null };

export async function receiveUpload(
  scope: TenantScope,
  input: { kind: UploadKind; fileName: string; mediaType: string; bytes: Buffer; sandbox?: boolean; mappingId?: string; transferId?: string },
  limits: UploadLimits,
): Promise<Received> {
  const verdict = inspectUpload({ fileName: input.fileName, mediaType: input.mediaType, bytes: input.bytes }, limits);
  if (verdict.ok === false) {
    logger.warn({ event: 'upload.refused', kind: input.kind, code: verdict.code, bytes: input.bytes.length }, 'Upload refused');
    throw new HttpError(verdict.status, verdict.code, verdict.message);
  }
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const fileName = cleanFileName(input.fileName);
  const [row] = await scope.tx.insert(uploads).values({
    businessUnitId: scope.ctx.businessUnitId, kind: input.kind, fileName, format: verdict.format, mediaType: verdict.mediaType || 'application/octet-stream',
    byteSize: input.bytes.length, sha256, sandbox: !!input.sandbox, createdBy: scope.ctx.userId,
  }).returning({ id: uploads.id });
  await scope.tx.insert(uploadFiles).values({ uploadId: row.id, businessUnitId: scope.ctx.businessUnitId, bytes: input.bytes, createdBy: scope.ctx.userId });
  const jobId = input.kind === 'lead' ? await enqueueJob(scope, 'lead.process', { uploadId: row.id, ...(input.mappingId ? { mappingId: input.mappingId } : {}),
    ...(input.transferId ? { transferId: input.transferId } : {}) }, LEAD_STAGES) : null;
  await recordAudit(scope, { action: 'upload.received', targetType: 'upload', targetId: row.id,
    details: { kind: input.kind, format: verdict.format, bytes: input.bytes.length, sandbox: !!input.sandbox, jobId } });
  logger.info({ event: 'upload.received', kind: input.kind, format: verdict.format, bytes: input.bytes.length, sha256: sha256.slice(0, 12), sandbox: !!input.sandbox }, 'Upload received');
  return { uploadId: row.id, jobId };
}

/** The fictional sample as the CSV file it is named after, through the same path as any upload. Lists built from it
 *  are sandbox. Written verbatim (this is a fixture, not an export, so no formula neutralising). */
export function sampleFile(kind: UploadKind): { fileName: string; bytes: Buffer } {
  const grid = kind === 'lead' ? DemandAISample.LEADS : DemandAISample.SIGNALS;
  return { fileName: kind === 'lead' ? DemandAISample.LEAD_FILE : DemandAISample.SIGNAL_FILE, bytes: Buffer.from(csvVerbatim(grid), 'utf8') };
}

/** CSV the app reads back itself (a fixture, or an account's rows moved to another unit): values as they are, quoted
 *  where needed. Files for people go through toCSV, which neutralises formulas. */
export function csvVerbatim(grid: unknown[][]): string {
  return grid.map(r => r.map(v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
}

export type StoredUpload = { id: string; kind: UploadKind; fileName: string; format: UploadFormat; sandbox: boolean; bytes: Buffer };

/** An upload of the caller's unit with its bytes, or null. */
export async function loadUpload(scope: TenantScope, id: string): Promise<StoredUpload | null> {
  const [u] = await scope.tx.select({
    id: uploads.id, kind: uploads.kind, fileName: uploads.fileName, format: uploads.format, sandbox: uploads.sandbox, bytes: uploadFiles.bytes,
  }).from(uploads).innerJoin(uploadFiles, eq(uploadFiles.uploadId, uploads.id))
    .where(and(eq(uploads.id, id), eq(uploads.businessUnitId, scope.ctx.businessUnitId)));
  return u ? { ...u, kind: u.kind as UploadKind, format: u.format as UploadFormat } : null;
}

/** "Use sample data": the sample goes through the same checks as any file, marked sandbox. */
export function receiveSample(scope: TenantScope, kind: UploadKind, limits: UploadLimits): Promise<Received> {
  const { fileName, bytes } = sampleFile(kind);
  return receiveUpload(scope, { kind, fileName, mediaType: 'text/csv', bytes, sandbox: true }, limits);
}
