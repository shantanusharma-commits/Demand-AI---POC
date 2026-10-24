// Accessibility (G-035; plan §9 item 5; prompt §9 item 6): axe finds no serious or critical WCAG 2.1 A/AA violation on
// any route, signed out or as each role, nor in the states that hold the data (an open list, a scoring run, a build,
// an item in For Review, every Analytics tab); and a lead file can be uploaded, checked and saved with the keyboard
// alone.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { as, SAMPLE } from './helpers';
import { PASSWORD, PLATFORM, type Who } from './people';

/** Serious and critical violations on the page as it is now, one line each. */
async function violations(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}× e.g. ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')})`);
}

/** Opens a route, waits for its data, and records what axe finds there. */
async function scan(page: Page, path: string, found: Record<string, string[]>, ready?: (page: Page) => Promise<void>) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  if (ready) await ready(page);
  const v = await violations(page);
  if (v.length) found[path] = v;
}

test('signed out: the sign-in, forgotten-password, reset and invite pages', async ({ page }) => {
  const found: Record<string, string[]> = {};
  for (const path of ['/login', '/forgot-password', '/reset-password', '/accept-invite']) await scan(page, path, found);
  expect(found).toEqual({});
});

const SCREENS: Record<Who, string[]> = {
  admin: ['/today', '/content', '/content?tab=content', '/review', '/prospecting', '/scoring', '/scoring?tab=monitor', '/nba', '/studio', '/setup', '/users'],
  manager: ['/today', '/review', '/prospecting', '/nba'],
  rep: ['/today', '/review', '/prospecting', '/scoring', '/nba', '/studio'],
  rep2: ['/today'],
  viewer: ['/analytics', '/prospecting'],
};

for (const who of Object.keys(SCREENS) as Who[]) {
  test(`every screen as ${who === 'rep2' ? 'a second rep' : `the ${who}`}`, async ({ browser }) => {
    const { context, page } = await as(browser, who);
    const found: Record<string, string[]> = {};
    for (const path of SCREENS[who]) await scan(page, path, found);
    await context.close();
    expect(found).toEqual({});
  });
}

test('the states that hold the data: an open list, a scoring run, a build, an item in For Review, every Analytics tab', async ({ browser }) => {
  const { context, page } = await as(browser, 'rep');
  const found: Record<string, string[]> = {};
  const lists = (await (await page.request.get('/api/lists')).json()).lists as { id: string; name: string }[];
  const list = lists.find(l => l.name === 'E2E full sample')!;
  await scan(page, `/prospecting?list=${list.id}`, found, p => expect(p.locator('#rows tbody tr').first()).toBeVisible());
  const runs = (await (await page.request.get('/api/scoring-runs')).json()).runs as { id: string }[];
  await scan(page, `/scoring?run=${runs[0].id}`, found, p => expect(p.locator('#rows tbody tr').first()).toBeVisible());
  const builds = (await (await page.request.get('/api/nba-runs')).json()).runs as { id: string }[];
  await scan(page, `/nba?run=${builds[0].id}`, found);
  const queue = (await (await page.request.get('/api/review/queue')).json()).items as { id: string }[];
  await scan(page, `/review?item=${queue[0].id}`, found, p => expect(p.locator('.ws-hero')).toBeVisible());
  await context.close();
  const mgr = await as(browser, 'manager');
  for (const tab of ['areas', 'gates', 'funnel', 'evidence', 'weekly', 'readout', 'log', 'loop', 'validation']) await scan(mgr.page, `/analytics?tab=${tab}`, found);
  await mgr.context.close();
  expect(found).toEqual({});
});

test('the platform administrator\'s screen', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(PLATFORM.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
  const found: Record<string, string[]> = {};
  await scan(page, '/platform', found);
  expect(found).toEqual({});
});

/** Presses Tab until the focused element is the one named, as a keyboard user would move. */
async function tabTo(page: Page, name: RegExp, max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return '';
      const labelled = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent ?? '' : '';
      return `${el.getAttribute('aria-label') ?? ''} ${labelled} ${el.textContent ?? ''} ${el.id}`.trim();
    });
    if (name.test(label)) return;
  }
  throw new Error(`Tab never reached ${name}`);
}

test('a lead file is uploaded, checked and saved with the keyboard alone', async ({ browser }) => {
  const { context, page } = await as(browser, 'rep2');
  await page.goto('/prospecting');
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await tabTo(page, /choose a file/i);
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles(SAMPLE);
  const view = page.getByRole('button', { name: 'View the list →' });
  await expect(view).toBeVisible({ timeout: 120_000 });
  await expect(view).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/prospecting\?list=/);
  await tabTo(page, /^Save list/);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('List name')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Keyboard upload');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Saved ✓' })).toBeVisible();
  await context.close();
});
