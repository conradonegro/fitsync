import { expect, test } from '@playwright/test';

/**
 * Athlete roster page tests.
 *
 * Relies on seed data:
 *   - Trainer: trainer@fitsync.dev (authenticated via storageState)
 *   - Athlete: Sam Athlete <athlete@fitsync.dev> with status = active
 */

test.describe('Athlete Roster', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/athletes');
  });

  test('page shows Athletes heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Athletes' })).toBeVisible();
  });

  test('invite form is visible with email input and send button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Invite an athlete' })).toBeVisible();
    await expect(page.locator('#invite-email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send invitation' })).toBeVisible();
  });

  test('seed athlete appears in the list', async ({ page }) => {
    await expect(page.getByText('Sam Athlete')).toBeVisible();
    await expect(page.getByText('athlete@fitsync.dev')).toBeVisible();
  });

  test('seed athlete has Active badge', async ({ page }) => {
    // Scope to Sam Athlete's row — other athletes may also be Active.
    const samRow = page.getByRole('listitem').filter({ hasText: 'Sam Athlete' });
    await expect(samRow.getByText('Active')).toBeVisible();
  });

  test('View link navigates to athlete detail', async ({ page }) => {
    const samRow = page.getByRole('listitem').filter({ hasText: 'Sam Athlete' });
    await samRow.getByRole('link', { name: 'View' }).click();
    await expect(page).toHaveURL(/\/dashboard\/athletes\/.+/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Athlete details' })).toBeVisible();
  });

  test('back link on detail page returns to roster', async ({ page }) => {
    await page.getByRole('link', { name: 'View' }).first().click();
    await page.getByRole('link', { name: 'Athletes' }).click();
    await expect(page).toHaveURL('/dashboard/athletes');
  });
});
