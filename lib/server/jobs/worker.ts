// The in-process job worker, started once per server from instrumentation.ts. It claims one job at a time,
// runs it inside the job's business unit as the System user, and records the outcome. A JobError fails the job
// with its message for the person; anything else is retried with backoff until max_attempts, then failed.
// Jobs left running by a process that died are re-queued (or failed) by recover_stale_jobs().
import 'server-only';
import { hostname } from 'node:os';
import { eq, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { jobs } from '../db/schema.ts';
import { withTenant, type Db } from '../db/tenant.ts';
import { logger, withLogContext } from '../logger.ts';
import { JobError, jobContext, onJobQueued, reportProgress, type JobKind, type JobProgress } from './queue.ts';

export type ClaimedJob = {
  id: string; businessUnitId: string; kind: JobKind; payload: Record<string, string>; attempts: number; maxAttempts: number;
  progress: JobProgress; createdBy: string;
};

export type JobRun = {
  db: Db;
  job: ClaimedJob;
  /** Ends the current stage and starts the next: the screen sees it at once. Throws once the time limit is spent. */
  stage: (name: string, counts?: Record<string, number>) => Promise<void>;
  /** When the time limit runs out (epoch ms): slow optional work (AI calls) stops in time for the job to finish. */
  deadline: number;
};

export type JobHandler = (run: JobRun) => Promise<Record<string, string>>;

export type WorkerOptions = {
  db: Db;
  handlers: Partial<Record<JobKind, JobHandler>>;
  pollMs?: number;
  timeLimitMs?: number;
  staleAfterMinutes?: number;
  workerId?: string;
};

const RETRY_BASE_SECONDS = 5;

export function createWorker(opts: WorkerOptions) {
  const { db, handlers } = opts;
  const pollMs = opts.pollMs ?? 1000;
  const timeLimitMs = opts.timeLimitMs ?? 60_000;
  const workerId = opts.workerId ?? `${hostname()}:${process.pid}`;
  const kinds = Object.keys(handlers);
  let running = false, stopRequested = false, busy = false;
  let timer: NodeJS.Timeout | undefined;
  let lastRecovery = 0;

  async function claim(): Promise<ClaimedJob | null> {
    const r = await db.execute<Record<string, unknown>>(sql`select * from claim_job(${workerId}, string_to_array(${kinds.join(',')}, ','))`);
    const j = r.rows[0];
    if (!j) return null;
    return {
      id: String(j.id), businessUnitId: String(j.business_unit_id), kind: j.kind as JobKind, payload: j.payload as Record<string, string>,
      attempts: Number(j.attempts), maxAttempts: Number(j.max_attempts), progress: j.progress as JobProgress, createdBy: String(j.created_by),
    };
  }

  async function finish(job: ClaimedJob, set: PgUpdateSetSource<typeof jobs>): Promise<void> {
    await withTenant(db, jobContext(job.businessUnitId), ({ tx }) =>
      tx.update(jobs).set({ ...set, lockedAt: null, lockedBy: null, updatedAt: sql`now()` }).where(eq(jobs.id, job.id)), { label: 'job.finish' });
  }

  async function execute(job: ClaimedJob): Promise<void> {
    const handler = handlers[job.kind];
    const started = performance.now();
    const deadline = Date.now() + timeLimitMs;
    const progress: JobProgress = { ...job.progress, done: 0, counts: {} };
    let stageName = 'starting', stageStarted = performance.now();
    const stage = async (name: string, counts: Record<string, number> = {}) => {
      if (stageName !== 'starting') {
        logger.info({ event: 'job.stage', kind: job.kind, stage: stageName, durationMs: Math.round(performance.now() - stageStarted), ...counts }, `Job stage ${stageName} done`);
        progress.done++;
      }
      progress.counts = { ...progress.counts, ...counts };
      if (Date.now() > deadline) throw new JobError('time_limit', `Processing took longer than ${Math.round(timeLimitMs / 1000)} seconds, so it was stopped. Try a smaller file.`);
      stageName = name;
      stageStarted = performance.now();
      await reportProgress(db, job, name, progress);
      // Let waiting requests run between stages; the engine's stages are synchronous.
      await new Promise(r => setImmediate(r));
    };
    try {
      if (!handler) throw new JobError('unknown_kind', 'This kind of job is not handled here.');
      logger.info({ event: 'job.started', kind: job.kind, attempt: job.attempts }, 'Job started');
      const result = await handler({ db, job, stage, deadline });
      progress.done = progress.stages.length;
      progress.result = result;
      await finish(job, { status: 'succeeded', stage: 'done', progress, finishedAt: sql`now()`, errorCode: null, errorMessage: null });
      logger.info({ event: 'job.succeeded', kind: job.kind, durationMs: Math.round(performance.now() - started), ...progress.counts }, 'Job succeeded');
    } catch (err) {
      const durationMs = Math.round(performance.now() - started);
      if (err instanceof JobError) {
        await finish(job, { status: 'failed', stage: stageName, progress, errorCode: err.code, errorMessage: err.message, finishedAt: sql`now()` });
        logger.warn({ event: 'job.failed', kind: job.kind, code: err.code, stage: stageName, durationMs }, 'Job failed');
        return;
      }
      const retry = job.attempts < job.maxAttempts;
      await finish(job, retry
        ? { status: 'queued', stage: 'queued', errorCode: 'retrying', runAfter: sql`now() + make_interval(secs => ${RETRY_BASE_SECONDS * 2 ** (job.attempts - 1)})` }
        : { status: 'failed', stage: stageName, errorCode: 'internal', errorMessage: 'Something went wrong while processing. Try again, and tell your administrator if it keeps happening.', finishedAt: sql`now()` });
      logger.error({ event: retry ? 'job.retrying' : 'job.failed', kind: job.kind, stage: stageName, attempt: job.attempts, durationMs, err }, retry ? 'Job failed; it will be retried' : 'Job failed');
    }
  }

  /** Claims and runs jobs until none is due. Returns how many ran. */
  async function drain(): Promise<number> {
    let n = 0;
    for (;;) {
      if (Date.now() - lastRecovery > 60_000) {
        lastRecovery = Date.now();
        const r = await db.execute<{ n: number }>(sql`select recover_stale_jobs(make_interval(mins => ${opts.staleAfterMinutes ?? 5})) as n`);
        if (Number(r.rows[0].n)) logger.warn({ event: 'job.recovered', count: Number(r.rows[0].n) }, 'Jobs left running by a stopped process were recovered');
      }
      const job = await claim();
      if (!job) return n;
      await withLogContext({ jobId: job.id, businessUnitId: job.businessUnitId, userId: job.createdBy }, () => execute(job));
      n++;
      if (stopRequested) return n;
    }
  }

  async function tick(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await drain();
    } catch (err) {
      logger.error({ event: 'job.worker.error', err }, 'The job worker could not reach the queue');
    } finally {
      busy = false;
      if (running) schedule(pollMs);
    }
  }

  function schedule(ms: number) {
    clearTimeout(timer);
    timer = setTimeout(() => { void tick(); }, ms);
    timer.unref();
  }

  let unsubscribe: (() => void) | undefined;
  return {
    workerId,
    /** Runs every due job once, for tests and scripts. */
    drain,
    start() {
      if (running) return;
      running = true; stopRequested = false;
      unsubscribe = onJobQueued(() => { if (running && !busy) schedule(0); });
      logger.info({ event: 'job.worker.started', kinds, pollMs }, 'Job worker started');
      schedule(0);
    },
    stop() {
      stopRequested = true; running = false;
      clearTimeout(timer);
      unsubscribe?.();
    },
  };
}
