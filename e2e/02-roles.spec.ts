// Roles in the browser (plan §9 item 5; prompt §9 item 4; G-001, G-014): a Viewer sees only Analytics, and every
// other screen opened by its address says it isn't available, with nothing of the screen's data; a rep can't open
// another rep's item by its address, and sees only their own accounts in a list the unit shares.
import { expect, test } from '@playwright/test';
import { as } from './helpers';
import { PEOPLE } from './people';

const SCREENS = ['/today', '/content', '/review', '/prospecting', '/scoring', '/nba', '/studio', '/setup', '/users'];

test('a Viewer sees only Analytics: one link in the menu, and every other screen refused by its address', async ({ browser }) => {
  const { context, page } = await as(browser, 'viewer');
  await page.goto('/');
  await expect(page).toHaveURL(/\/analytics/);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link')).toHaveText(['Analytics']);
  for (const path of SCREENS) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByText('Not available for your role'), path).toBeVisible();
    await expect(page.locator('main'), path).toContainText(`Viewer in ${'End-to-end unit'} doesn't have access to this screen`);
  }
  // Nor through the API.
  for (const api of ['/api/lists', '/api/review/queue', '/api/nba-runs', '/api/users']) expect((await page.request.get(api)).status(), api).toBe(403);
  await context.close();
});

test('a rep cannot open another rep\'s item by its address, and sees only their own accounts in a shared list', async ({ browser }) => {
  const owner = await as(browser, 'rep');
  const queue = await (await owner.page.request.get('/api/review/queue')).json();
  const theirs = (queue.items as { id: string; account: { name: string } }[])[0];
  expect(theirs).toBeTruthy();
  const lists = (await (await owner.page.request.get('/api/lists')).json()).lists as { id: string; name: string }[];
  const listId = lists.find(l => l.name === 'E2E full sample')!.id;
  await owner.context.close();

  const other = await as(browser, 'rep2');
  // By the address For Review opens items with: refused, and nothing of the item is shown.
  const api = await other.page.request.get(`/api/recommendations/${theirs.id}`);
  expect(api.status()).toBe(404);
  await other.page.goto(`/review?item=${theirs.id}`);
  await expect(other.page.locator('.toast').first()).toContainText('That recommendation is not there, or is not yours.');
  await expect(other.page.locator('.ws-hero')).toHaveCount(0);
  await expect(other.page.locator('main')).not.toContainText(theirs.account.name);
  // The list is the unit's, but its rows are the owner's: the other rep's accounts are not in what this rep sees.
  const mine = (await (await other.page.request.get(`/api/lists/${listId}/accounts?limit=200`)).json()).rows as { account: { owner: string } }[];
  const owners = new Set(mine.map(r => r.account.owner.toLowerCase()));
  expect(mine.length).toBeGreaterThan(0);
  expect([...owners]).toEqual(PEOPLE.rep2.aliases);
  await other.context.close();
});
