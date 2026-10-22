// Server configuration, read from environment variables only and validated once at start-up.
// Error and warning text names variables, never their values.
import 'server-only';
import { z } from 'zod';

const flag = (fallback: boolean) =>
  z.enum(['0', '1', 'true', 'false']).optional().transform(v => (v === undefined ? fallback : v === '1' || v === 'true'));
const int = (fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => z.coerce.number().int().min(min).max(max).default(fallback);
const postgresUrl = z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// or postgresql:// URL');

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export const AI_PROVIDERS = ['none', 'azure-openai', 'bedrock'] as const;

export const envSchema = z
  .object({
    // App
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: int(3000, 1, 65535),
    APP_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
    APP_BUILD_VERSION: z.string().max(100).default('dev'),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    LOG_SLOW_QUERY_MS: int(500),
    TRUSTED_PROXY_HOPS: int(1, 1, 5),

    // Database (D-28). Required once the app stores data (Phase 2).
    DATABASE_URL: postgresUrl.optional(),
    DATABASE_MIGRATION_URL: postgresUrl.optional(),
    DATABASE_SSL_MODE: z.enum(['disable', 'require', 'verify-full']).optional(),
    DATABASE_SSL_CA_FILE: z.string().optional(),
    DATABASE_POOL_MAX: int(10, 1, 100),
    DATABASE_STATEMENT_TIMEOUT_MS: int(30_000, 1_000),

    // Sessions (Phase 3)
    SESSION_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
    SESSION_ABSOLUTE_HOURS: int(12, 1, 24 * 7),
    SESSION_IDLE_MINUTES: int(60, 5, 24 * 60),

    // Email (D-29). Unset or disabled means invite and reset links are copied from the screen.
    NOTIFICATION_DISABLED: flag(false),
    NOTIFICATION_EMAIL_FROM: z.email().optional(),
    NOTIFICATION_SENDER_NAME: z.string().max(100).optional(),
    NOTIFICATION_APP_PASSWORD: z.string().optional(),
    NOTIFICATION_SMTP_HOST: z.string().optional(),
    NOTIFICATION_SMTP_PORT: int(587, 1, 65535),
    SUPPORT_EMAIL: z.email().optional(),

    // Uploads (D-7, D-8)
    UPLOAD_MAX_BYTES: int(25 * 1024 * 1024, 1024),
    UPLOAD_MAX_ROWS: int(50_000, 1),
    UPLOAD_TIME_LIMIT_MS: int(60_000, 1_000),
    UPLOAD_MAX_UNZIPPED_BYTES: int(200 * 1024 * 1024, 1024 * 1024),

    // Background jobs (uploads, scoring). Every app instance runs a worker unless JOBS_WORKER=0.
    JOBS_WORKER: flag(true),
    JOBS_POLL_MS: int(1000, 100, 60_000),

    // AI (D-5, D-35, D-40). Every capability flag is off unless set.
    AI_PROVIDER: z.enum(AI_PROVIDERS).default('none'),
    AI_TIMEOUT_MS: int(30_000, 1_000),
    AI_MAX_CONCURRENCY: int(4, 1, 64),
    AI_FEATURE_DRAFTING: flag(false),
    AI_FEATURE_WHY_NOW: flag(false),
    AI_FEATURE_CLASSIFY: flag(false),
    AI_FEATURE_COPILOT: flag(false),
    AI_FEATURE_CONTENT_STUDIO: flag(false),
    AZURE_OPENAI_ENDPOINT: z.url({ protocol: /^https$/ }).optional(),
    AZURE_OPENAI_API_KEY: z.string().optional(),
    AZURE_OPENAI_DEPLOYMENT: z.string().optional(),
    AZURE_OPENAI_API_VERSION: z.string().default('2024-06-01'),
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: z.string().optional(),
    AZURE_OPENAI_AUTH_HEADER: z.enum(['api-key', 'Ocp-Apim-Subscription-Key']).default('api-key'),
    AWS_REGION: z.string().optional(),
    BEDROCK_MODEL_ID: z.string().optional(),

    // Data lifecycle (D-20, provisional)
    RETENTION_DAYS_AFTER_READOUT: int(30, 1),
  })
  .superRefine((env, ctx) => {
    const need = (name: keyof typeof env, why: string) => {
      if (!env[name]) ctx.addIssue({ code: 'custom', path: [name], message: `is required ${why}` });
    };
    if (env.NODE_ENV === 'production') {
      need('APP_BASE_URL', 'in production');
      need('DATABASE_URL', 'in production');
      need('SESSION_SECRET', 'in production');
    }
    if (env.AI_PROVIDER === 'azure-openai') {
      need('AZURE_OPENAI_ENDPOINT', 'when AI_PROVIDER=azure-openai');
      need('AZURE_OPENAI_API_KEY', 'when AI_PROVIDER=azure-openai');
      need('AZURE_OPENAI_DEPLOYMENT', 'when AI_PROVIDER=azure-openai');
    }
    if (env.AI_PROVIDER === 'bedrock') {
      need('AWS_REGION', 'when AI_PROVIDER=bedrock');
      need('BEDROCK_MODEL_ID', 'when AI_PROVIDER=bedrock');
    }
  });

export type Env = z.infer<typeof envSchema>;
export type EnvResult = { ok: true; env: Env; warnings: string[] } | { ok: false; errors: string[] };

/** Validates a set of variables. Blank values count as unset. Messages name variables, never values. */
export function parseEnv(source: Record<string, string | undefined>): EnvResult {
  const present = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const result = envSchema.safeParse(present);
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map(i => `${i.path.join('.') || '(root)'} ${i.message}`) };
  }
  const env = result.data;
  const warnings: string[] = [];
  const smtpReady = env.NOTIFICATION_EMAIL_FROM && env.NOTIFICATION_SMTP_HOST && env.NOTIFICATION_APP_PASSWORD;
  if (!env.NOTIFICATION_DISABLED && !smtpReady) {
    warnings.push('email is not configured (NOTIFICATION_EMAIL_FROM, NOTIFICATION_SMTP_HOST, NOTIFICATION_APP_PASSWORD): invite and reset links must be copied from the screen');
  }
  if (env.NODE_ENV === 'production' && env.APP_BASE_URL?.startsWith('http://')) {
    warnings.push('APP_BASE_URL is not https: session cookies will not be marked Secure');
  }
  if (env.AI_PROVIDER === 'none') {
    const on = (['AI_FEATURE_DRAFTING', 'AI_FEATURE_WHY_NOW', 'AI_FEATURE_CLASSIFY', 'AI_FEATURE_COPILOT', 'AI_FEATURE_CONTENT_STUDIO'] as const).filter(k => env[k]);
    if (on.length) warnings.push(`${on.join(', ')} set but AI_PROVIDER=none: those capabilities use their rule fallback`);
  }
  return { ok: true, env, warnings };
}

export class EnvError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid configuration: ${problems.join('; ')}`);
    this.name = 'EnvError';
    this.problems = problems;
  }
}

let cached: Env | undefined;

/** The validated configuration for this process. Throws EnvError (names only) if it is invalid. */
export function env(): Env {
  if (cached) return cached;
  const result = parseEnv(process.env);
  if (result.ok === false) throw new EnvError(result.errors);
  cached = result.env;
  return cached;
}

/** A summary that is safe to log: which features are configured, never any value. */
export function describeConfig(e: Env) {
  return {
    nodeEnv: e.NODE_ENV,
    version: e.APP_BUILD_VERSION,
    logLevel: e.LOG_LEVEL,
    database: e.DATABASE_URL ? `configured (ssl ${e.DATABASE_SSL_MODE ?? 'default'})` : 'not configured',
    sessions: e.SESSION_SECRET ? 'configured' : 'not configured',
    mail: e.NOTIFICATION_DISABLED ? 'disabled' : e.NOTIFICATION_SMTP_HOST ? 'smtp' : 'not configured',
    aiProvider: e.AI_PROVIDER,
    aiFeatures: (['DRAFTING', 'WHY_NOW', 'CLASSIFY', 'COPILOT', 'CONTENT_STUDIO'] as const).filter(f => e[`AI_FEATURE_${f}`]),
    uploads: { maxBytes: e.UPLOAD_MAX_BYTES, maxRows: e.UPLOAD_MAX_ROWS },
  };
}
