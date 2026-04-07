import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for the FitSync web app.
 *
 * Requires:
 *   - Local Supabase running: `supabase start`
 *   - Seed data loaded: `supabase db reset`
 *
 * The webServer block starts the Next.js dev server automatically.
 * Locally it reuses a running dev server (reuseExistingServer: true).
 * In CI it always starts a fresh server.
 *
 * Auth state: the `setup` project logs in as the seed trainer once and
 * saves cookies to e2e/.auth/trainer.json. All tests in the `chromium`
 * project reuse that storage state so they start already authenticated.
 * Tests that need to test unauthenticated behaviour override with
 * test.use({ storageState: { cookies: [], origins: [] } }).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  outputDir: 'test-results/',
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },

  projects: [
    // Runs first: logs in and saves auth state.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    // Main project: all spec files, starts authenticated as trainer.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/trainer.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
