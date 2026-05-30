import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — runs against the staging/prod URL by default
 * so the same suite gates real deploys. Override with PLAYWRIGHT_BASE_URL
 * for local dev (e.g. http://localhost:3000).
 *
 * Tests live in ./e2e. Auth-requiring tests read TEST_USER_EMAIL /
 * TEST_USER_PASSWORD from env and skip if absent — keeps CI green
 * without forcing creds into a shared config.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://fitai-web-production.up.railway.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile viewport — covers the bottom nav + most user reality.
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
    },
  ],
});
