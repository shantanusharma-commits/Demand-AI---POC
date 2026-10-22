import type { Instrumentation } from 'next';

// Runs once before the server takes requests: validate the configuration (fail fast) and log the start-up.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { boot } = await import('./lib/server/boot.ts');
    boot();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logRequestError } = await import('./lib/server/boot.ts');
    logRequestError(err, request, context);
  }
};
