import type { Instrumentation } from 'next';

// Runs once before the server takes requests: validate the configuration (fail fast), log the start-up, and start
// the job worker.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { boot } = await import('./lib/server/boot.ts');
    boot();
    // Upload checks and scoring run as background jobs in every server process (plan §4 item 8). In development the
    // worker keeps the code it started with (hot reload doesn't reach it): restart `next dev` after changing a job's code.
    const { startJobWorker } = await import('./lib/server/jobs/handlers.ts');
    startJobWorker();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logRequestError } = await import('./lib/server/boot.ts');
    logRequestError(err, request, context);
  }
};
