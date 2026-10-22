// Integration-test databases on a disposable PostgreSQL 16 cluster (compose.test.yaml locally, a service
// container in CI). Each test file gets its own database cloned from a migrated template, so files run in
// parallel and never see each other's rows. Roles are created by the real db/bootstrap-roles.sql via psql.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { migrate } from '../../scripts/db/migrate.mjs';

export const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgresql://postgres:demandai-test-only@127.0.0.1:55433/postgres';
export const REPO = new URL('../..', import.meta.url).pathname;
export const MIGRATIONS_DIR = join(REPO, 'drizzle');

// Test-only role passwords; the test cluster is disposable and listens on loopback only.
export const ROLE_PASSWORDS = {
  demandai_owner: 'test_owner_pw_000000000000000000',
  demandai_app: 'test_app_pw_0000000000000000000000',
  demandai_ops: 'test_ops_pw_0000000000000000000000',
} as const;
export type Role = keyof typeof ROLE_PASSWORDS | 'admin';

const admin = new URL(ADMIN_URL);
if (admin.port === '5432' || admin.port === '') {
  // Port 5432 on this machine is a system PostgreSQL that belongs to something else.
  throw new Error('TEST_DATABASE_ADMIN_URL must point at the disposable test cluster (port 55433 by default), not port 5432');
}

export function urlFor(role: Role, database: string): string {
  const u = new URL(ADMIN_URL);
  if (role !== 'admin') {
    u.username = role;
    u.password = ROLE_PASSWORDS[role];
  }
  u.pathname = `/${database}`;
  return u.toString();
}

function psqlEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env, PGHOST: admin.hostname, PGPORT: admin.port, PGUSER: decodeURIComponent(admin.username),
    PGPASSWORD: decodeURIComponent(admin.password), PGDATABASE: 'postgres',
  };
}

/** Runs the real role bootstrap for one database (creates the roles once per cluster, idempotent). */
export function bootstrap(database: string): void {
  execFileSync('psql', [
    '-X', '-q', '-v', 'ON_ERROR_STOP=1',
    '-v', `owner_pw=${ROLE_PASSWORDS.demandai_owner}`, '-v', `app_pw=${ROLE_PASSWORDS.demandai_app}`,
    '-v', `ops_pw=${ROLE_PASSWORDS.demandai_ops}`, '-v', `dbname=${database}`,
    '-f', join(REPO, 'db', 'bootstrap-roles.sql'),
  ], { env: psqlEnv(), stdio: ['ignore', 'ignore', 'pipe'] });
}

function migrationsHash(): string {
  const h = createHash('sha256');
  for (const f of readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()) h.update(f).update(readFileSync(join(MIGRATIONS_DIR, f)));
  h.update(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json')));
  return h.digest('hex').slice(0, 12);
}

async function adminQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]) {
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  try {
    return await c.query<T>(text, values);
  } finally {
    await c.end();
  }
}

async function ensureTemplate(): Promise<string> {
  const name = `dai_tmpl_${migrationsHash()}`;
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  try {
    await c.query("SELECT pg_advisory_lock(hashtext('demandai:test-template'))");
    const exists = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!exists.rowCount) {
      bootstrap(name);
      await migrate({ url: urlFor('demandai_owner', name), dir: MIGRATIONS_DIR, ssl: false, log: quiet });
    }
  } finally {
    await c.query("SELECT pg_advisory_unlock(hashtext('demandai:test-template'))").catch(() => {});
    await c.end();
  }
  return name;
}

/** A migrate() logger that drops output, for tests. */
export const quiet = () => {};

export type TestDatabase = {
  name: string;
  url: (role: Role) => string;
  pool: (role: Role) => pg.Pool;
  drop: () => Promise<void>;
};

/** A fresh database for one test file: migrated by default, or bootstrapped but empty. */
export async function freshDatabase(label: string, { migrated = true } = {}): Promise<TestDatabase> {
  const name = `dai_${label.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${randomBytes(4).toString('hex')}`.slice(0, 63);
  if (migrated) {
    const template = await ensureTemplate();
    await adminQuery(`CREATE DATABASE "${name}" TEMPLATE "${template}" OWNER demandai_owner`);
  }
  bootstrap(name);
  const pools: pg.Pool[] = [];
  return {
    name,
    url: role => urlFor(role, name),
    pool: role => {
      const p = new pg.Pool({ connectionString: urlFor(role, name), max: 4 });
      p.on('error', () => {});
      pools.push(p);
      return p;
    },
    drop: async () => {
      await Promise.all(pools.map(p => p.end().catch(() => {})));
      await adminQuery(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    },
  };
}
