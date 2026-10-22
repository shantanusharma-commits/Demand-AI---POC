// POST /api/client-errors: error boundaries report browser-side failures here so they reach the server log.
// Public by design (errors can happen before sign-in), so it is same-origin only, size-capped and rate-limited,
// and it stores nothing.
import 'server-only';
import type { Logger } from 'pino';
import { z } from 'zod';
import { env } from './env.ts';
import { logger, scrub } from './logger.ts';
import { createMemoryRateLimiter } from './http/memory-rate-limit.ts';
import { clientAddress, isSameOrigin, readBodyText } from './http/request.ts';

export const MAX_REPORT_BYTES = 4096;

const reportSchema = z.object({
  source: z.enum(['error-boundary', 'global-error']),
  message: z.string().max(500),
  digest: z.string().max(64).optional(),
  path: z.string().max(300),
});

export function createClientErrorHandler(deps: { log?: Logger; appBaseUrl?: string; production?: boolean; limit?: number } = {}) {
  const limiter = createMemoryRateLimiter(deps.limit ?? 30, 5 * 60_000);
  return async function POST(request: Request): Promise<Response> {
    const log = deps.log ?? logger;
    const cfg = deps.appBaseUrl === undefined && deps.production === undefined ? env() : undefined;
    const appBaseUrl = deps.appBaseUrl ?? cfg?.APP_BASE_URL;
    const production = deps.production ?? cfg?.NODE_ENV === 'production';
    if (!isSameOrigin(request, appBaseUrl, production)) return new Response(null, { status: 403 });
    if (!limiter.take(clientAddress(request))) return new Response(null, { status: 429 });
    if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return new Response(null, { status: 415 });
    const text = await readBodyText(request, MAX_REPORT_BYTES);
    if (text === null) return new Response(null, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return new Response(null, { status: 400 });
    }
    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) return new Response(null, { status: 400 });
    const r = parsed.data;
    log.warn(
      { event: 'client.error', source: r.source, digest: r.digest, path: scrub(r.path.split('?')[0]), clientMessage: scrub(r.message) },
      'Error reported by the browser',
    );
    return new Response(null, { status: 204 });
  };
}
