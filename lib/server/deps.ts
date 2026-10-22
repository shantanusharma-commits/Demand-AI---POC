// The process's shared services, built once from the validated configuration.
import 'server-only';
import { env } from './env.ts';
import { getPool } from './db/pool.ts';
import { createDb, type Db } from './db/tenant.ts';
import { createMailer, type Mailer } from './mail/mailer.ts';
import type { SessionConfig } from './auth/sessions.ts';

export type AppDeps = {
  db: Db;
  mailer: Mailer;
  session: SessionConfig;
  appBaseUrl: string;
  production: boolean;
  supportEmail?: string;
};

let deps: AppDeps | undefined;

export function appDeps(): AppDeps {
  if (deps) return deps;
  const e = env();
  if (!e.SESSION_SECRET) throw new Error('SESSION_SECRET is not configured');
  const appBaseUrl = e.APP_BASE_URL ?? `http://localhost:${e.PORT}`;
  deps = {
    db: createDb(getPool()),
    mailer: createMailer(e),
    session: {
      secret: e.SESSION_SECRET,
      absoluteHours: e.SESSION_ABSOLUTE_HOURS,
      idleMinutes: e.SESSION_IDLE_MINUTES,
      secureCookies: appBaseUrl.startsWith('https://'),
    },
    appBaseUrl,
    production: e.NODE_ENV === 'production',
    supportEmail: e.SUPPORT_EMAIL,
  };
  return deps;
}

/** Tests replace the shared services with their own. */
export function setAppDepsForTests(d: AppDeps | undefined): void {
  deps = d;
}
