// The two-user scenario (plan §9 item 5; prompt §9 item 4; G-012, G-029 on the production build against
// PostgreSQL): a rep uploads the full sample, saves it, reloads, scores it with the sample's signals and hands off;
// the micro-segments are built; the rep decides in For Review, and an edit that adds a sensitive term goes to the
// manager, who approves it in a second browser, sees the team's queue, and sees G1 and G2 in Analytics. Nothing is
// kept in the browser: every step is read back from the server.
import { expect, test, type Page } from '@playwright/test';
import { as, SAMPLE } from './helpers';
import { PEOPLE } from './people';

test.describe.configure({ mode: 'serial' });

const LIST = 'E2E full sample';
const toast = (page: Page, text: RegExp) => expect(page.locator('.toast', { hasText: text }).first()).toBeVisible({ timeout: 60_000 });

test('a rep uploads the full sample, saves it, and it is still there after a reload and in a new browser', async ({ browser }) => {
  const { context, page } = await as(browser, 'rep');
  await page.goto('/prospecting');
  await page.locator('#fileInput').setInputFiles(SAMPLE);
  await page.getByRole('button', { name: 'View the list →' }).click({ timeout: 120_000 });
  await expect(page).toHaveURL(/\/prospecting\?list=/);
  await page.getByRole('button', { name: 'Save list' }).click();
  await page.getByLabel('List name').fill(LIST);
  await page.locator('#saveOverlay').getByRole('button', { name: 'Save', exact: true }).click();
  await toast(page, /Saved/);
  const listUrl = page.url();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Saved ✓' })).toBeVisible();
  await expect(page.locator('.topbar')).toContainText(LIST);
  // A fresh browser (no storage at all) signed in as the same rep finds it too: the server keeps it, not the browser.
  const other = await as(browser, 'rep');
  await other.page.goto(listUrl);
  await expect(other.page.getByRole('button', { name: 'Saved ✓' })).toBeVisible();
  expect(await other.page.evaluate(() => Object.keys(localStorage).filter(k => !/^demandai_.*_v1$/.test(k)))).toEqual([]);
  await other.context.close();
  await context.close();
});

test('the rep scores the list with the sample\'s signals, saves the scores and hands tier A and B off to Micro-segments & NBA', async ({ browser }) => {
  const { context, page } = await as(browser, 'rep');
  await page.goto('/scoring');
  await page.getByLabel('Prospect list').selectOption({ label: LIST });
  await page.getByLabel('Score as of').fill('2026-09-30');
  await page.locator('#fileInput').setInputFiles(SAMPLE);
  await page.getByRole('button', { name: 'View the scores →' }).click({ timeout: 120_000 });
  await expect(page).toHaveURL(/\/scoring\?run=/);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const save = page.getByRole('dialog', { name: 'Save the scored list' });
  await save.getByLabel('Name').fill('E2E scored sample');
  await save.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved ✓' })).toBeVisible();
  await page.getByRole('button', { name: /^Send tier A and B to NBA →$/ }).click();
  // The hand-off opens Micro-segments & NBA, which builds from it at once.
  const building = page.getByRole('dialog', { name: 'Building micro-segments' });
  await expect(building).toBeVisible({ timeout: 30_000 });
  await building.getByRole('button', { name: 'View the micro-segments →' }).click({ timeout: 120_000 });
  await expect(page.locator('.ftab', { hasText: 'Recommendations' })).toBeVisible();
  await context.close();
});

test('the rep decides in For Review; an edit that adds a sensitive term goes to the manager, who approves it in a second browser', async ({ browser }) => {
  const rep = await as(browser, 'rep');
  const decided = (page: Page, action: string) => page.waitForResponse(r => r.request().method() === 'POST' && new RegExp(`/api/recommendations/[^/]+/${action}$`).test(r.url()));
  const openNext = async () => {
    if (await rep.page.locator('.ws-hero').isVisible()) return;
    await rep.page.goto('/review?view=queue');
    const clear = rep.page.getByText('Clear filters');
    if (await clear.isVisible()) await clear.click();
    await rep.page.locator('.dt tbody tr.click').first().click();
    await expect(rep.page.locator('.ws-hero')).toBeVisible();
  };
  // First decision: accepted as it is, and released.
  await openNext();
  let answer = decided(rep.page, 'accept');
  await rep.page.locator('.ws-dec button', { hasText: /^Approve/ }).click();
  expect((await (await answer).json()).status).toBe('Released');
  if (await rep.page.locator('.teach-pop').count()) await rep.page.locator('.teach-pop button', { hasText: 'Skip' }).click();
  // Second: the rep edits the message to mention an incident, so it needs the manager.
  await openNext();
  const body = rep.page.locator('#dBody, #dNote').first();
  await body.focus();
  await body.press('End');
  await body.pressSequentially(' We can also talk through the incident review.');
  await expect(rep.page.locator('.ws-checks')).toContainText(/Sensitive|compliance/i);
  answer = decided(rep.page, 'accept');
  await rep.page.locator('.ws-dec button', { hasText: /^Approve/ }).click();
  const response = await answer;
  const sent = await response.json();
  // The item may be this week's spot-check ("Spot-check rated. Your edit adds sensitive content, so it goes to …") or an
  // exception ("Accepted: sensitive content goes to …"): either way it waits for the manager.
  expect(sent.status).toBe('Awaiting approval');
  expect(sent.message).toMatch(/goes to the sales manager for approval$/);
  const itemId = response.url().match(/recommendations\/([^/]+)\/accept$/)![1];

  const mgr = await as(browser, 'manager');
  await mgr.page.goto('/review');
  await expect(mgr.page.locator('.ftab.active')).toContainText('Approvals');
  await expect(mgr.page.locator('.dt tbody tr.click').first()).toBeVisible();
  // The rep's item among the approvals, opened by its address.
  await mgr.page.goto(`/review?item=${itemId}`);
  await expect(mgr.page.locator('.ws-hero')).toContainText(/sensitive|compliance|incident/i);
  const approved = decided(mgr.page, 'approve');
  await mgr.page.locator('.ws-dec button', { hasText: /^Approve/ }).click();
  expect((await (await approved).json()).message).toBe('Approved and released');
  if (await mgr.page.locator('.teach-pop').count()) await mgr.page.locator('.teach-pop button', { hasText: 'Skip' }).click();
  // The team's queue: the rep's items are there for the manager.
  await mgr.page.goto('/review?view=queue');
  await expect(mgr.page.locator('.dt tbody tr.click').first()).toBeVisible();
  await expect(mgr.page.locator('.dt tbody')).toContainText(PEOPLE.rep.name);
  // The rep's own session reads the item back as released by the manager's approval.
  const back = await (await rep.page.request.get(`/api/recommendations/${itemId}`)).json();
  expect(back.item.state.status).toBe('Released');
  await rep.context.close();
  await mgr.context.close();
});

test('the manager sees G1 and G2 in Analytics, measured on the server from the decisions just made', async ({ browser }) => {
  const { context, page } = await as(browser, 'manager');
  const gates = await (await page.request.get('/api/analytics/gates')).json();
  expect(gates.measure.items).toBeGreaterThan(0);
  await page.goto('/analytics?tab=gates');
  const g1 = page.locator('.panel', { hasText: 'G1 · Reduced human effort' }).first();
  const g2 = page.locator('.panel', { hasText: 'G2 · Recommendation acceptance' }).first();
  const m = gates.measure;
  await expect(g1).toContainText(m.minutes === null ? 'No usable first actions yet' : gates.gates.g1.value === null ? `No decisions yet; the baseline is ${m.base} min` : `against a baseline of ${m.base} min`);
  await expect(g1).toContainText(gates.gates.g1.value === null ? '—' : `${Math.round(gates.gates.g1.value)}% less`);
  await expect(g2).toContainText(gates.measure.weighted === null ? '—' : `${Math.round(gates.measure.weighted)}%`);
  await expect(g2).toContainText('accepted on first pass');
  await context.close();
});
