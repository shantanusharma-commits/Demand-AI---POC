// The pilot's pipeline on the full sample from test-data/, for tests that measure it: upload and save the lead list,
// score it with the sample signals, hand off and build micro-segments in unit A (config v1 active there).
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { serializeConfig } from '../../lib/engine/config.ts';
import { withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { createAppWorker } from '../../lib/server/jobs/handlers.ts';
import { getJob } from '../../lib/server/jobs/queue.ts';
import { receiveUpload, uploadLimits, type UploadLimits } from '../../lib/server/services/uploads.ts';
import { saveList, type Actor } from '../../lib/server/services/lists.ts';
import { saveRun, startScoringRun } from '../../lib/server/services/scoring.ts';
import { createHandoff } from '../../lib/server/services/handoffs.ts';
import { buildNbaRun } from '../../lib/server/services/nba.ts';
import type { Basics } from './fixtures.ts';
import { AS_OF, DATASET } from '../helpers/answer-key.ts';

export const limits: UploadLimits = uploadLimits({ UPLOAD_MAX_BYTES: 25 * 1024 * 1024, UPLOAD_MAX_ROWS: 50_000, UPLOAD_TIME_LIMIT_MS: 120_000, UPLOAD_MAX_UNZIPPED_BYTES: 200 * 1024 * 1024 });
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function activateConfig(owner: pg.Pool, bu: string, by: string): Promise<void> {
  await owner.query(`INSERT INTO config_versions (business_unit_id, version_no, status, body, engine_version, created_by, activated_at, activated_by)
    VALUES ($1, 1, 'active', $2, 't', $3, now(), $3)`, [bu, JSON.stringify(serializeConfig()), by]);
}

export async function buildPilot(app: Db, owner: pg.Pool, ids: Basics): Promise<{ listId: string; scoringRunId: string; handoffId: string; runId: string }> {
  const ctx: TenantContext = { userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] };
  const actor: Actor = { userId: ids.adminA, role: 'Admin' };
  const as = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, ctx, fn);
  const sample = readFileSync(DATASET);
  await activateConfig(owner, ids.buA, ids.adminA);
  const drain = () => createAppWorker(app, limits).drain();
  const up = await as(s => receiveUpload(s, { kind: 'lead', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: sample }, limits));
  await drain();
  const listId = (await as(s => getJob(s, up.jobId!)))!.progress.result!.listId;
  await as(s => saveList(s, actor, listId, { name: 'Full sample' }));
  const sig = await as(s => receiveUpload(s, { kind: 'signal', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: sample }, limits));
  const started = await as(s => startScoringRun(s, actor, { listId, signalUploadId: sig.uploadId, asOf: AS_OF }));
  await drain();
  await as(s => saveRun(s, actor, started.runId, 'Sample scored'));
  const handoffId = (await as(s => createHandoff(s, actor, { runId: started.runId }))).handoffId;
  const runId = (await as(s => buildNbaRun(s, actor, { handoffId }))).runId;
  return { listId, scoringRunId: started.runId, handoffId, runId };
}
