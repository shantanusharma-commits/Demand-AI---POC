// Start-up and server-error hooks, called from instrumentation.ts on the Node.js runtime only.
import 'server-only';
import { describeConfig, parseEnv } from './env.ts';
import type { Logger } from 'pino';
import { logger, scrub } from './logger.ts';

let booted = false;

/** Validates the configuration and logs what is configured. Exits the process if the configuration is invalid. */
export function boot(
  source: Record<string, string | undefined> = process.env,
  exit: (code: number) => never = process.exit,
  log: Logger = logger,
): void {
  if (booted) return;
  const result = parseEnv(source);
  if (result.ok === false) {
    log.fatal({ event: 'config.invalid', problems: result.errors }, 'Configuration is invalid; refusing to start');
    log.flush();
    exit(1);
  }
  booted = true;
  for (const warning of result.warnings) log.warn({ event: 'config.warning' }, warning);
  log.info({ event: 'server.start', node: process.version, pid: process.pid, config: describeConfig(result.env) }, 'DemandAI server starting');
}

type RequestInfo = { path: string; method: string };
type ErrorContext = { routerKind: string; routePath: string; routeType: string; renderSource?: string };

/** Logs an error Next.js caught while serving a request. The query string and headers are left out. */
export function logRequestError(err: unknown, request: RequestInfo, context: ErrorContext, log: Logger = logger): void {
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : undefined;
  log.error(
    {
      event: 'request.error',
      err,
      digest,
      method: request.method,
      path: scrub(request.path.split('?')[0]),
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
    },
    'Unhandled error while serving a request',
  );
}
