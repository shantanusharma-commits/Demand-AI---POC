// The end-to-end tests' application (plan §9 item 5): a fresh, migrated test database and the production build's
// standalone server on E2E_PORT, with no user and no business unit. The only thing made here is what an operator
// makes on a new deployment: a platform administrator and their one-time invite link (scripts/users/create-admin.mjs);
// the tests do everything else through the screens. Playwright starts this as its webServer and stops it with SIGTERM
// (the database is dropped then). Run by Node itself, not by Playwright's loader:
//   node --conditions=react-server e2e/stack.ts
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { freshDatabase, REPO } from '../tests/integration/harness.ts';
import { startStandalone } from '../tests/http/server.ts';
import { createAdmin } from '../scripts/users/create-admin.mjs';
import { E2E_STATE, PLATFORM } from './people.ts';

const port = Number(process.env.E2E_PORT ?? 3998);
const db = await freshDatabase('e2e');
const owner = new pg.Client({ connectionString: db.url('demandai_owner') });
await owner.connect();
const { token } = await createAdmin(owner, { platform: true, email: PLATFORM.email, name: PLATFORM.name });
await owner.end();
// AI stays off (AI_PROVIDER defaults to none): the end-to-end run never reaches a model.
const srv = await startStandalone(db, { LOG_LEVEL: process.env.E2E_LOG_LEVEL ?? 'warn' }, port);
mkdirSync(join(REPO, E2E_STATE), { recursive: true });
writeFileSync(join(REPO, E2E_STATE, 'stack.json'), JSON.stringify({ base: srv.base, platformLink: `${srv.base}/accept-invite#token=${token}` }));
console.log(`e2e stack ready on ${srv.base}`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await srv.stop().catch(() => {});
  await db.drop().catch(() => {});
  rmSync(join(REPO, E2E_STATE, 'stack.json'), { force: true });
  process.exit(0);
};
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
