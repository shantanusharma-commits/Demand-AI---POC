// Background jobs (plan §4 item 8): a row in `jobs`, claimed by a worker with FOR UPDATE SKIP LOCKED through
// claim_job(), so several app instances can share the queue. A job reports its real stages as it goes (G-043:
// the screens show these instead of a fixed animation). Payloads hold IDs only, never personal data.
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { jobs, SYSTEM_USER_ID } from '../db/schema.ts';
import { withTenant, type Db, type TenantContext, type TenantScope } from '../db/tenant.ts';

export type JobKind = 'lead.process' | 'scoring.run';

/** What a job tells the screen while it runs and when it is done. */
export type JobProgress = {
  stages: string[];
  /** How many stages are finished. */
  done: number;
  /** Counts the stage has so far (rows read, contacts saved …); never personal data. */
  counts?: Record<string, number>;
  result?: Record<string, string>;
};

/** A failure the person can act on (a file that can't be read, a list that was deleted). Never retried. */
export class JobError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'JobError';
    this.code = code;
  }
}

/** The context a job's own work runs in: the System user, the whole of the job's business unit. */
export function jobContext(businessUnitId: string): TenantContext {
  return { userId: SYSTEM_USER_ID, businessUnitId, scope: 'all', ownerEmails: [] };
}

type Listener = () => void;
const listeners = new Set<Listener>();
/** The worker in this process listens, so a job queued here starts without waiting for the next poll. */
export function onJobQueued(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function enqueueJob(scope: TenantScope, kind: JobKind, payload: Record<string, string>, stages: string[]): Promise<string> {
  const progress: JobProgress = { stages, done: 0 };
  const [row] = await scope.tx.insert(jobs).values({
    businessUnitId: scope.ctx.businessUnitId, kind, payload, progress, stage: 'queued', createdBy: scope.ctx.userId,
  }).returning({ id: jobs.id });
  // Tell the worker once the enqueuing transaction has had a chance to commit.
  setImmediate(() => { for (const fn of listeners) fn(); });
  return row.id;
}

export type JobView = {
  id: string; kind: string; status: string; stage: string | null; progress: JobProgress;
  error: { code: string; message: string } | null; createdAt: Date; finishedAt: Date | null;
};

/** A job of the caller's business unit; null when there is none with that ID. */
export async function getJob(scope: TenantScope, id: string): Promise<JobView | null> {
  const [j] = await scope.tx.select().from(jobs).where(and(eq(jobs.id, id), eq(jobs.businessUnitId, scope.ctx.businessUnitId)));
  if (!j) return null;
  return {
    id: j.id, kind: j.kind, status: j.status, stage: j.stage, progress: j.progress as JobProgress,
    error: j.status === 'failed' ? { code: j.errorCode ?? 'internal', message: j.errorMessage ?? 'The job failed. Try again.' } : null,
    createdAt: j.createdAt, finishedAt: j.finishedAt,
  };
}

/** Records a stage change in its own short transaction, so the screen can see it while the job continues. */
export async function reportProgress(db: Db, job: { id: string; businessUnitId: string }, stage: string, progress: JobProgress): Promise<void> {
  await withTenant(db, jobContext(job.businessUnitId), ({ tx }) =>
    tx.update(jobs).set({ stage, progress, updatedAt: sql`now()` }).where(eq(jobs.id, job.id)), { label: 'job.progress' });
}
