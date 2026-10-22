#!/usr/bin/env node
// Forward-only migration runner (Compose `migrate` one-shot, CI and `npm run db:migrate`).
// Applies the reviewed SQL in MIGRATIONS_DIR (default ./drizzle) in journal order, each file in its own
// transaction, recording it in drizzle.__drizzle_migrations (the same table and hash drizzle-kit uses).
// A migration that changed after it was applied is an error, never re-run. An advisory lock stops two runners
// from racing. Needs only `pg`, so it runs from the app image. Exits non-zero on any failure.
//
// Env: DATABASE_MIGRATION_URL (owner role), MIGRATIONS_DIR, DATABASE_SSL_MODE, DATABASE_SSL_CA_FILE
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { sslOptions, stripSslParams } from './pg-ssl.mjs';

const stdoutLog = (level, event, msg, extra = {}) =>
  process.stdout.write(JSON.stringify({ level, time: new Date().toISOString(), service: 'demandai-migrate', event, ...extra, msg }) + '\n');

export async function migrate({ url, dir, ssl, log = stdoutLog }) {
  const journal = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8'));
  const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);
  const client = new pg.Client({ connectionString: stripSslParams(url), ssl, application_name: 'demandai-migrate' });
  client.on('error', err => log('error', 'migrate.connection', err.message));
  await client.connect();
  const applied = [];
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('demandai:migrate'))");
    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
    await client.query('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
    const done = new Map((await client.query('SELECT hash, created_at FROM drizzle.__drizzle_migrations')).rows.map(r => [String(r.created_at), r.hash]));
    for (const entry of entries) {
      const sql = readFileSync(join(dir, `${entry.tag}.sql`), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const previous = done.get(String(entry.when));
      if (previous !== undefined) {
        if (previous !== hash) throw new Error(`migration ${entry.tag} was changed after it was applied; write a new migration instead`);
        continue;
      }
      const started = Date.now();
      await client.query('BEGIN');
      try {
        for (const statement of sql.split('--> statement-breakpoint')) if (statement.trim()) await client.query(statement);
        await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [hash, entry.when]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${entry.tag} failed: ${err.message}`);
      }
      applied.push(entry.tag);
      log('info', 'migrate.applied', entry.tag, { durationMs: Date.now() - started });
    }
    // The app role reads the journal table for /api/ready.
    await client.query('GRANT USAGE ON SCHEMA drizzle TO demandai_app');
    await client.query('GRANT SELECT ON drizzle.__drizzle_migrations TO demandai_app');
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('demandai:migrate'))").catch(() => {});
    await client.end();
  }
  return { applied, total: entries.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const log = stdoutLog;
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) {
    log('fatal', 'migrate.config', 'DATABASE_MIGRATION_URL is not set');
    process.exit(1);
  }
  const dir = resolve(process.env.MIGRATIONS_DIR || 'drizzle');
  try {
    const { applied, total } = await migrate({ url, dir, ssl: sslOptions() });
    log('info', 'migrate.done', applied.length ? `applied ${applied.length} migration(s); ${total} in total` : `up to date; ${total} migration(s)`);
  } catch (err) {
    log('fatal', 'migrate.failed', String(err.message).replace(/postgres(ql)?:\/\/[^\s]+/g, '[url]'));
    process.exit(1);
  }
}
