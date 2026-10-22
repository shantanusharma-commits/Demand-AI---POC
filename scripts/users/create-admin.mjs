#!/usr/bin/env node
// Creates the first administrators. There is no self sign-up, so an operator runs this once per environment:
//
//   Platform administrator (creates business units in the app):
//     node scripts/users/create-admin.mjs --platform --email ops@company.com --name "Ops Person"
//   Admin of an existing business unit:
//     node scripts/users/create-admin.mjs --unit pilot-bu --email lead@company.com --name "Unit Lead"
//
// From the image: docker compose run --rm migrate node scripts/users/create-admin.mjs ...
// It prints a one-time link (72 hours) to set the password on this terminal only; it is never logged.
// Uses DATABASE_MIGRATION_URL (owner role) and APP_BASE_URL for the link.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { sslOptions, stripSslParams } from '../db/pg-ssl.mjs';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const INVITE_MS = 72 * 3600_000;

function parseArgs(argv) {
  const out = { platform: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--platform') out.platform = true;
    else if (a === '--email' || a === '--name' || a === '--unit') out[a.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  if (!out.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw new Error('--email with a valid address is required');
  if (!out.name || !out.name.trim()) throw new Error('--name is required');
  if (!out.platform && !out.unit) throw new Error('give --platform, or --unit <code> of an existing business unit');
  return { ...out, email: out.email.trim().toLowerCase(), name: out.name.trim() };
}

/** Same token shape as lib/server/auth/crypto.ts: <uuid>.<base64url 32 bytes>, stored as sha256(secret). */
function newLinkToken() {
  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  return { id, token: `${id}.${secret}`, hash: createHash('sha256').update(secret).digest('hex') };
}

export async function createAdmin(client, args) {
  await client.query('BEGIN');
  try {
    let unitId = null;
    if (args.unit) {
      const u = await client.query(`SELECT id FROM business_units WHERE code = $1 AND status = 'active'`, [args.unit]);
      if (!u.rowCount) throw new Error(`no active business unit with code "${args.unit}"; create it in the app first (as platform administrator)`);
      unitId = u.rows[0].id;
    }
    let user = (await client.query(`SELECT id, status, kind, password_hash IS NOT NULL AS has_password FROM users WHERE email = $1 FOR UPDATE`, [args.email])).rows[0];
    if (user && (user.kind !== 'person' || user.status === 'deactivated')) throw new Error('that account is deactivated or not a person account');
    if (!user) {
      user = (await client.query(
        `INSERT INTO users (email, display_name, status, platform_admin, created_by, updated_by) VALUES ($1, $2, 'invited', $3, $4, $4)
         RETURNING id, status, kind, false AS has_password`, [args.email, args.name, args.platform, SYSTEM_USER_ID])).rows[0];
    } else if (args.platform) {
      await client.query(`UPDATE users SET platform_admin = true, updated_at = now(), updated_by = $2 WHERE id = $1`, [user.id, SYSTEM_USER_ID]);
    }
    if (args.platform) {
      await client.query(`INSERT INTO user_role_history (user_id, field, from_value, to_value, reason, created_by) VALUES ($1, 'platform_admin', NULL, 'true', 'create-admin command', $2)`, [user.id, SYSTEM_USER_ID]);
    }
    if (unitId) {
      await client.query(
        `INSERT INTO business_unit_members (business_unit_id, user_id, role, created_by, updated_by) VALUES ($1, $2, 'Admin', $3, $3)
         ON CONFLICT (business_unit_id, user_id) DO UPDATE SET role = 'Admin', status = 'active', updated_at = now(), updated_by = $3`,
        [unitId, user.id, SYSTEM_USER_ID]);
      await client.query(`INSERT INTO user_role_history (user_id, business_unit_id, field, from_value, to_value, reason, created_by) VALUES ($1, $2, 'role', NULL, 'Admin', 'create-admin command', $3)`,
        [user.id, unitId, SYSTEM_USER_ID]);
    }
    await client.query(`INSERT INTO audit_log (actor_user_id, business_unit_id, action, target_type, target_id, details) VALUES ($1, $2, 'cli.admin_created', 'user', $3, $4)`,
      [SYSTEM_USER_ID, unitId, user.id, JSON.stringify({ platform: args.platform })]);
    let token = null;
    if (!user.has_password) {
      await client.query(`UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND purpose = 'invite' AND used_at IS NULL`, [user.id]);
      const t = newLinkToken();
      await client.query(`INSERT INTO email_tokens (id, user_id, purpose, token_hash, business_unit_id, expires_at, created_by) VALUES ($1, $2, 'invite', $3, $4, $5, $6)`,
        [t.id, user.id, t.hash, unitId, new Date(Date.now() + INVITE_MS), SYSTEM_USER_ID]);
      token = t.token;
    }
    await client.query('COMMIT');
    return { userId: user.id, token };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (err) {
    console.error(`create-admin: ${err.message}`);
    process.exit(2);
  }
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) { console.error('create-admin: DATABASE_MIGRATION_URL is not set'); process.exit(2); }
  const client = new pg.Client({ connectionString: stripSslParams(url), ssl: sslOptions(), application_name: 'demandai-create-admin' });
  await client.connect();
  try {
    const { token } = await createAdmin(client, args);
    const base = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
    console.log(args.platform ? 'Platform administrator ready.' : `Admin of ${args.unit} ready.`);
    if (token) {
      console.log('Send this one-time link to them yourself (single use, valid 72 hours):');
      console.log(`${base || '<APP_BASE_URL>'}/accept-invite#token=${token}`);
    } else {
      console.log('They already have a password and can sign in now.');
    }
  } catch (err) {
    console.error(`create-admin: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
