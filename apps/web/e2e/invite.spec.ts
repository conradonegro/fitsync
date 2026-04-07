import { expect, test } from '@playwright/test';

/**
 * Invite athlete flow tests.
 *
 * The server action (inviteAthlete) creates a pending invite row for any
 * syntactically valid email regardless of whether that email belongs to an
 * athlete — there is no server-side "athlete not found" check in Phase 1.
 *
 * To avoid polluting the DB with duplicate-invite rows across runs, we:
 *   - Use a unique email per test via Date.now() where the invite must succeed.
 *   - Rely on `supabase db reset` to clean state between CI runs.
 */

test.describe('Invite Athlete', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/athletes');
  });

  test('submitting a valid email shows a success banner', async ({ page }) => {
    const uniqueEmail = `playwright-${Date.now()}@example.com`;
    await page.fill('#invite-email', uniqueEmail);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText(/invitation sent/i)).toBeVisible({ timeout: 10_000 });
  });

  test('submitting a duplicate pending email shows a duplicate error', async ({ page }) => {
    // First invite — should succeed
    const uniqueEmail = `playwright-dup-${Date.now()}@example.com`;
    await page.fill('#invite-email', uniqueEmail);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText(/invitation sent/i)).toBeVisible({ timeout: 10_000 });

    // Second invite with the same email — should surface the uniqueness error
    await page.fill('#invite-email', uniqueEmail);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText(/open invitation already exists/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('invite input is cleared after a successful invite', async ({ page }) => {
    const uniqueEmail = `playwright-clear-${Date.now()}@example.com`;
    await page.fill('#invite-email', uniqueEmail);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText(/invitation sent/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#invite-email')).toHaveValue('');
  });
});
