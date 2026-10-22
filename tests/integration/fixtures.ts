// Fictional business units and users for integration tests, inserted as the owner role (bypassing RLS).
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { SYSTEM_USER_ID } from '../../lib/server/db/schema.ts';

export type Basics = {
  buA: string; buB: string;
  adminA: string; repA: string; repA2: string; repB: string; platform: string;
};

export async function seedBasics(owner: pg.Pool): Promise<Basics> {
  const ids = {
    buA: randomUUID(), buB: randomUUID(),
    adminA: randomUUID(), repA: randomUUID(), repA2: randomUUID(), repB: randomUUID(), platform: randomUUID(),
  };
  const s = SYSTEM_USER_ID;
  await owner.query(
    `INSERT INTO business_units (id, code, name, created_by, updated_by) VALUES ($1, 'unit-a', 'Unit A', $3, $3), ($2, 'unit-b', 'Unit B', $3, $3)`,
    [ids.buA, ids.buB, s]);
  const users: [string, string, boolean][] = [
    [ids.adminA, 'admin.a@demandai.test', false], [ids.repA, 'rep.a@demandai.test', false], [ids.repA2, 'rep.a2@demandai.test', false],
    [ids.repB, 'rep.b@demandai.test', false], [ids.platform, 'platform@demandai.test', true],
  ];
  for (const [id, email, platform] of users) {
    await owner.query(
      `INSERT INTO users (id, email, display_name, platform_admin, status, created_by, updated_by) VALUES ($1, $2, $3, $4, 'active', $5, $5)`,
      [id, email, email.split('@')[0], platform, s]);
  }
  const members: [string, string, string][] = [
    [ids.buA, ids.adminA, 'Admin'], [ids.buA, ids.repA, 'Sales rep'], [ids.buA, ids.repA2, 'Sales rep'],
    [ids.buB, ids.repB, 'Sales rep'], [ids.buB, ids.repA, 'Viewer'],
  ];
  for (const [bu, user, role] of members) {
    await owner.query(
      `INSERT INTO business_unit_members (business_unit_id, user_id, role, created_by, updated_by) VALUES ($1, $2, $3, $4, $4)`,
      [bu, user, role, s]);
  }
  return ids;
}
