// Structured JSON logs to stdout (D-39). Every line carries the request, user and business-unit IDs of the
// work in progress, taken from an AsyncLocalStorage context. Logs never hold personal data or secrets:
// sensitive keys are redacted and email addresses are masked anywhere in messages and errors.
import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import pino, { type DestinationStream, type Logger } from 'pino';
import { LOG_LEVELS } from './env.ts';

export type LogContext = {
  requestId?: string;
  userId?: string;
  businessUnitId?: string;
  jobId?: string;
  route?: string;
};

const contextStore = new AsyncLocalStorage<LogContext>();

/** Runs fn with these fields added to every log line written inside it (nested contexts merge). */
export function withLogContext<T>(ctx: LogContext, fn: () => T): T {
  return contextStore.run({ ...contextStore.getStore(), ...ctx }, fn);
}

/** Adds fields to the current context, for example the user ID once the session is known. */
export function addLogContext(patch: LogContext): void {
  const store = contextStore.getStore();
  if (store) Object.assign(store, patch);
}

export function currentLogContext(): LogContext {
  return { ...contextStore.getStore() };
}

const EMAIL = /[A-Z0-9._%+'-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;

/** Masks email addresses in free text (error messages, driver errors that echo values, and so on). */
export function scrub(text: string): string {
  return text.replace(EMAIL, '[email]');
}

// Keys that must never reach a log line, at the top level or one level down.
const SENSITIVE_KEYS = ['password', 'passwordHash', 'password_hash', 'token', 'secret', 'apiKey', 'api_key', 'authorization', 'cookie', 'set-cookie', 'email'];
export const REDACT_PATHS = [
  ...SENSITIVE_KEYS.flatMap(k => [k, `*.${k}`]),
  'headers.authorization', 'headers.cookie', 'req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]',
];

function serializeError(err: unknown) {
  if (!(err instanceof Error)) return { message: scrub(String(err)) };
  const out: Record<string, unknown> = {
    type: err.name,
    message: scrub(err.message),
    stack: err.stack ? scrub(err.stack) : undefined,
  };
  const extra = err as Error & { code?: unknown; digest?: unknown; cause?: unknown };
  if (extra.code !== undefined) out.code = String(extra.code);
  if (extra.digest !== undefined) out.digest = String(extra.digest);
  if (extra.cause !== undefined) out.cause = serializeError(extra.cause);
  return out;
}

export function createLogger(options: { level?: string; version?: string; destination?: DestinationStream } = {}): Logger {
  const level = (LOG_LEVELS as readonly string[]).includes(options.level ?? '') ? options.level! : 'info';
  return pino(
    {
      level,
      base: { service: 'demandai', version: options.version ?? 'dev' },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: label => ({ level: label }) },
      mixin: () => ({ ...contextStore.getStore() }),
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      serializers: { err: serializeError, error: serializeError },
      hooks: {
        // Mask emails in the message text and in format arguments.
        logMethod(args, method) {
          method.apply(this, args.map(a => (typeof a === 'string' ? scrub(a) : a)) as Parameters<typeof method>);
        },
      },
    },
    options.destination ?? pino.destination({ dest: 1, sync: false }),
  );
}

// The process logger. LOG_LEVEL is read directly so logging works even when the rest of the configuration is
// invalid (that problem is itself logged at start-up).
export const logger: Logger = createLogger({ level: process.env.LOG_LEVEL, version: process.env.APP_BUILD_VERSION });

/** Runs fn and logs its duration under `event`, at debug on success and at error on failure (then rethrows). */
export async function timed<T>(event: string, fields: Record<string, unknown>, fn: () => Promise<T>, log: Logger = logger): Promise<T> {
  const started = performance.now();
  try {
    const result = await fn();
    log.debug({ event, ...fields, durationMs: Math.round(performance.now() - started) }, `${event} done`);
    return result;
  } catch (err) {
    log.error({ event, ...fields, durationMs: Math.round(performance.now() - started), err }, `${event} failed`);
    throw err;
  }
}
