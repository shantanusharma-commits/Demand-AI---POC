// The job kinds this app runs, and the worker each server process starts (instrumentation.ts).
import 'server-only';
import { env } from '../env.ts';
import { getPool } from '../db/pool.ts';
import { createDb, type Db } from '../db/tenant.ts';
import { logger } from '../logger.ts';
import { createLeadJob } from '../services/lists.ts';
import { createScoringJob } from '../services/scoring.ts';
import { uploadLimits, type UploadLimits } from '../services/uploads.ts';
import { createWorker } from './worker.ts';

export function jobHandlers(limits: UploadLimits) {
  return { 'lead.process': createLeadJob(limits), 'scoring.run': createScoringJob(limits) };
}

export function createAppWorker(db: Db, limits: UploadLimits, pollMs?: number) {
  return createWorker({ db, handlers: jobHandlers(limits), pollMs, timeLimitMs: limits.timeLimitMs });
}

let started: ReturnType<typeof createAppWorker> | undefined;

/** Starts this process's worker once, when a database is configured and JOBS_WORKER isn't 0. */
export function startJobWorker(): void {
  if (started) return;
  const e = env();
  if (!e.DATABASE_URL || !e.JOBS_WORKER) {
    logger.info({ event: 'job.worker.off', reason: e.DATABASE_URL ? 'JOBS_WORKER=0' : 'no database' }, 'Job worker not started');
    return;
  }
  started = createAppWorker(createDb(getPool()), uploadLimits(e), e.JOBS_POLL_MS);
  started.start();
  process.once('SIGTERM', () => started?.stop());
}
