// Development seed: fictional business units, users, memberships, owner aliases and config v1 per unit.
// Idempotent (fixed IDs, ON CONFLICT DO NOTHING). Refuses to run with NODE_ENV=production.
// Run: npm run db:seed   (uses DATABASE_MIGRATION_URL, the owner role)
import pg from 'pg';
import { SYSTEM_USER_ID } from '../../lib/server/db/schema.ts';
import { ENGINE_VERSION, serializeConfig } from '../../lib/engine/config.ts';

export const SEED = {
  units: [
    { id: '10000000-0000-4000-8000-000000000001', code: 'pilot-bu', name: 'Pilot business unit' },
    { id: '10000000-0000-4000-8000-000000000002', code: 'second-bu', name: 'Second business unit (test)' },
  ],
  // Fictional people on the reserved .test domain. Owner aliases match the sample dataset's fictional reps.
  users: [
    { id: '20000000-0000-4000-8000-000000000001', email: 'platform@demandai.test', name: 'Platform Admin', platformAdmin: true, memberships: [] as [number, string][], aliases: [] as string[] },
    { id: '20000000-0000-4000-8000-000000000002', email: 'admin@demandai.test', name: 'Avery Admin', platformAdmin: false, memberships: [[0, 'Admin']] as [number, string][], aliases: [] },
    { id: '20000000-0000-4000-8000-000000000003', email: 'manager@demandai.test', name: 'Morgan Manager', platformAdmin: false, memberships: [[0, 'Sales manager']] as [number, string][], aliases: [] },
    { id: '20000000-0000-4000-8000-000000000004', email: 'rep1@demandai.test', name: 'Riley Rep', platformAdmin: false, memberships: [[0, 'Sales rep']] as [number, string][], aliases: ['meera.nair@client-sample.com', 'natalie.chen@client-sample.com'] },
    { id: '20000000-0000-4000-8000-000000000005', email: 'rep2@demandai.test', name: 'Sam Rep', platformAdmin: false, memberships: [[0, 'Sales rep']] as [number, string][], aliases: ['jessica.tan@client-sample.com', 'daniel.koh@client-sample.com'] },
    { id: '20000000-0000-4000-8000-000000000006', email: 'viewer@demandai.test', name: 'Val Viewer', platformAdmin: false, memberships: [[0, 'Viewer']] as [number, string][], aliases: [] },
    { id: '20000000-0000-4000-8000-000000000007', email: 'rep3@demandai.test', name: 'Casey Rep', platformAdmin: false, memberships: [[1, 'Sales rep']] as [number, string][], aliases: ['rizky.halim@client-sample.com'] },
  ],
};

export async function seed(client: pg.ClientBase): Promise<void> {
  const s = SYSTEM_USER_ID;
  await client.query('BEGIN');
  try {
    for (const u of SEED.units) {
      await client.query(
        `INSERT INTO business_units (id, code, name, created_by, updated_by) VALUES ($1, $2, $3, $4, $4) ON CONFLICT (id) DO NOTHING`,
        [u.id, u.code, u.name, s]);
      await client.query(
        `INSERT INTO config_versions (business_unit_id, version_no, status, body, engine_version, created_by, activated_at, activated_by)
         VALUES ($1, 1, 'active', $2, $3, $4, now(), $4) ON CONFLICT DO NOTHING`,
        [u.id, JSON.stringify(serializeConfig()), ENGINE_VERSION, s]);
    }
    for (const u of SEED.users) {
      await client.query(
        `INSERT INTO users (id, email, display_name, platform_admin, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, 'invited', $5, $5) ON CONFLICT (id) DO NOTHING`,
        [u.id, u.email, u.name, u.platformAdmin, s]);
      for (const [unit, role] of u.memberships) {
        await client.query(
          `INSERT INTO business_unit_members (business_unit_id, user_id, role, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $4) ON CONFLICT DO NOTHING`,
          [SEED.units[unit].id, u.id, role, s]);
      }
      for (const alias of u.aliases) {
        await client.query(
          `INSERT INTO user_owner_aliases (user_id, owner_email, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [u.id, alias, s]);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.NODE_ENV === 'production') {
    console.error('db:seed refuses to run with NODE_ENV=production: the seed is fictional development data.');
    process.exit(1);
  }
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) {
    console.error('DATABASE_MIGRATION_URL is not set (run npm run setup:env, then npm run db:up and db:migrate).');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await seed(client);
    console.log(`Seeded ${SEED.units.length} business units and ${SEED.users.length} fictional users (invited; passwords come with sign-in, Phase 3).`);
  } finally {
    await client.end();
  }
}
