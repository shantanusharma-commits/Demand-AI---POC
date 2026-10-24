// The full invite flow (plan §9 item 5; prompt §9), and the people every other spec uses. Email is off
// (NOTIFICATION_DISABLED), so each invite shows its one-time link to copy, as it would without SMTP: the operator's
// link makes the platform administrator, who creates the unit and invites its Admin; the Admin invites a manager,
// two reps (each owning some of the sample's accounts by owner alias) and a viewer; each sets a password from their
// link, then signs in again through the login form, and that session is kept for the other specs.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { acceptInvite, platformLink, REPO, signIn } from './helpers';
import { E2E_STATE, PEOPLE, PLATFORM, statePath, UNIT, type Who } from './people';

test.describe.configure({ mode: 'serial' });

const links: Partial<Record<Who, string>> = {};

test('the platform administrator sets a password from the operator\'s link, creates the unit and invites its Admin', async ({ page }) => {
  await acceptInvite(page, platformLink());
  await page.goto('/platform');
  await page.getByLabel('Name', { exact: true }).fill(UNIT.name);
  await page.getByLabel(/Short code/).fill(UNIT.code);
  await page.getByRole('button', { name: 'Create' }).click();
  const row = page.getByRole('table', { name: 'Business units' }).getByRole('row').filter({ hasText: UNIT.name });
  await expect(row).toContainText(UNIT.code);
  await row.getByRole('button', { name: 'Invite Admin' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(PEOPLE.admin.name);
  await dialog.getByLabel('Work email').fill(PEOPLE.admin.email);
  await dialog.getByRole('button', { name: 'Invite' }).click();
  await expect(dialog.getByRole('status')).toContainText('No email was sent');
  links.admin = await dialog.getByLabel('One-time invite link').inputValue();
  expect(links.admin).toMatch(/\/accept-invite#token=/);
  void PLATFORM;
});

/** Invites one person from the Users screen and returns the link shown to copy. */
async function invite(page: Page, who: Who): Promise<string> {
  const p = PEOPLE[who];
  await page.getByRole('button', { name: '+ Invite user' }).click();
  await page.getByLabel('Name').fill(p.name);
  await page.getByLabel('Work email').fill(p.email);
  await page.getByLabel('Role').selectOption(p.role);
  if (p.role === 'Sales rep') await page.getByLabel('Manager').selectOption({ label: PEOPLE.manager.name });
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  const status = page.getByRole('status').filter({ hasText: 'No email was sent' });
  await expect(status).toBeVisible();
  const link = await page.getByLabel('One-time invite link').inputValue();
  await page.getByRole('button', { name: 'Done' }).click();
  return link;
}

test('the unit Admin sets a password, invites a manager, two reps and a viewer, and gives the reps their owner addresses', async ({ page }) => {
  await acceptInvite(page, links.admin!);
  await page.goto('/users');
  for (const who of ['manager', 'rep', 'rep2', 'viewer'] as const) links[who] = await invite(page, who);
  for (const who of ['rep', 'rep2'] as const) {
    await page.getByRole('table', { name: 'Users in this business unit' }).getByRole('row').filter({ hasText: PEOPLE[who].email }).click();
    const drawer = page.getByRole('dialog', { name: 'User detail' });
    for (const alias of PEOPLE[who].aliases) {
      await drawer.getByLabel('Add an owner address').fill(alias);
      await drawer.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(drawer).toContainText(alias);
    }
    await drawer.getByRole('button', { name: 'Close' }).click();
  }
  const rows = page.getByRole('table', { name: 'Users in this business unit' }).getByRole('row');
  for (const who of ['manager', 'rep', 'rep2', 'viewer'] as const) await expect(rows.filter({ hasText: PEOPLE[who].email })).toContainText('INVITED');
});

test('each invited person sets a password from their link; then everyone signs in through the login form', async ({ browser }) => {
  mkdirSync(join(REPO, E2E_STATE), { recursive: true });
  for (const who of ['manager', 'rep', 'rep2', 'viewer'] as const) {
    const ctx = await browser.newContext();
    await acceptInvite(await ctx.newPage(), links[who]!);
    await ctx.close();
  }
  for (const who of Object.keys(PEOPLE) as Who[]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, PEOPLE[who].email);
    await expect(page.getByRole('navigation')).toBeVisible();
    await ctx.storageState({ path: join(REPO, statePath(who)) });
    await ctx.close();
  }
});
