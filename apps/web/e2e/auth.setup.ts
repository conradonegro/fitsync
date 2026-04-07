import * as fs from 'fs';
import * as path from 'path';

import { test as setup } from '@playwright/test';

const authDir = path.join(__dirname, '.auth');
const trainerAuthFile = path.join(authDir, 'trainer.json');

/**
 * Logs in as the seed trainer once and saves the browser storage state
 * (session cookies) to e2e/.auth/trainer.json.
 *
 * All tests in the `chromium` project reuse this file via
 * `use.storageState` in playwright.config.ts, so they start
 * pre-authenticated without hitting the login form every test.
 *
 * Seed credentials (local Supabase only):
 *   trainer@fitsync.dev / Password123!
 */
setup('authenticate as trainer', async ({ page }) => {
  fs.mkdirSync(authDir, { recursive: true });

  await page.goto('/login');
  await page.fill('#email', 'trainer@fitsync.dev');
  await page.fill('#password', 'Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/dashboard/athletes');

  await page.context().storageState({ path: trainerAuthFile });
});
