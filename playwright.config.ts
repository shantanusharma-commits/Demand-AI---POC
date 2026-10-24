// End-to-end, accessibility and performance tests (plan §9 items 5 and 7; remediation prompt §9), Chromium only, on
// the production build. By default Playwright starts e2e/stack.ts: a fresh test database (127.0.0.1:55433, as the
// integration tests) and the standalone server; run `npm run build` first. With E2E_BASE_URL and E2E_PLATFORM_LINK
// set, the same tests run against a stack that is already up, such as the Compose stack in CI.
// The specs share one application and run in order: setup.spec.ts creates every person through the screens, then the
// numbered specs run in their order (later ones read what earlier ones made).
import { defineConfig, devices } from '@playwright/test';

const external = process.env.E2E_BASE_URL;
const port = Number(process.env.E2E_PORT ?? 3998);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: external ?? `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /setup\.spec\.ts$/ },
    { name: 'e2e', testIgnore: /setup\.spec\.ts$/, dependencies: ['setup'] },
  ],
  webServer: external ? undefined : {
    command: 'node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --conditions=react-server e2e/stack.ts',
    url: `http://127.0.0.1:${port}/api/health`,
    env: { E2E_PORT: String(port) },
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
  },
});
