// Shared steps for the end-to-end specs: the stack's invite link, setting a password from a link, signing in through
// the real form, and opening a person's saved session.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { E2E_STATE, PASSWORD, statePath, type Who } from './people';

export const REPO = join(__dirname, '..');
export const SAMPLE = join(REPO, 'test-data', 'Lead_Research_Sample_Dataset.xlsx');

/** The platform administrator's one-time link: from the environment (a stack already up) or from e2e/stack.ts. */
export function platformLink(): string {
  if (process.env.E2E_PLATFORM_LINK) return process.env.E2E_PLATFORM_LINK;
  return JSON.parse(readFileSync(join(REPO, E2E_STATE, 'stack.json'), 'utf8')).platformLink;
}

/** Opens a one-time invite link, sets the password and lands signed in. */
export async function acceptInvite(page: Page, link: string): Promise<void> {
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await page.getByLabel('New password').fill(PASSWORD);
  await page.getByLabel('Type it again').fill(PASSWORD);
  await page.getByRole('button', { name: 'Set password and sign in' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/accept-invite'));
}

/** Signs in through the login form, as a person would. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
}

/** A browser context signed in as someone the setup created. */
export async function as(browser: Browser, who: Who): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: join(REPO, statePath(who)) });
  return { context, page: await context.newPage() };
}

/** Waits for a background job shown on screen to end, by polling its API (the screens poll the same). */
export async function waitForJob(page: Page, jobId: string, timeoutMs = 120_000): Promise<Record<string, unknown>> {
  let job: Record<string, unknown> = {};
  await expect.poll(async () => {
    job = (await (await page.request.get(`/api/jobs/${jobId}`)).json()).job;
    return job.status;
  }, { timeout: timeoutMs, intervals: [250, 500, 1000] }).toMatch(/succeeded|failed/);
  return job;
}
