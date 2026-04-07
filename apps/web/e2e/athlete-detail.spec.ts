import { expect, test } from '@playwright/test';

/**
 * Athlete detail page tests.
 *
 * Uses the fixed seed relationship ID so the URL is deterministic.
 * Seed data (from supabase/seed.sql):
 *   - Relationship: 00000000-0000-0000-0000-000000000010 (active)
 *   - Athlete:      Sam Athlete <athlete@fitsync.dev>
 *   - Session:      yesterday, ~1 hour duration (ended_at = started_at + 1h)
 *   - Event:        set_logged — Squat, Set 1, 5 reps × 100 kg
 */

const RELATIONSHIP_ID = '00000000-0000-0000-0000-000000000010';

test.describe('Athlete Detail', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/dashboard/athletes/${RELATIONSHIP_ID}`);
  });

  test('shows Athlete details heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Athlete details' })).toBeVisible();
  });

  test('shows athlete name and email', async ({ page }) => {
    await expect(page.getByText('Sam Athlete')).toBeVisible();
    await expect(page.getByText('athlete@fitsync.dev')).toBeVisible();
  });

  test('shows connection date', async ({ page }) => {
    await expect(page.getByText(/connected on/i)).toBeVisible();
  });

  test('shows Workout History section heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Workout History' })).toBeVisible();
  });

  test('shows seeded workout session card', async ({ page }) => {
    // Seed has 1 set_logged event → session card shows "1 sets"
    await expect(page.getByText('1 sets')).toBeVisible();
  });

  test('shows seeded exercise details', async ({ page }) => {
    // Seed event: Squat — Set 1: 5 × 100 kg
    await expect(page.getByText(/Squat/)).toBeVisible();
    await expect(page.getByText(/Set 1: 5 × 100 kg/)).toBeVisible();
  });

  test('session card shows duration in minutes', async ({ page }) => {
    // Seed session: started_at = now()-1day, ended_at = now()-23h → ~60 min
    await expect(page.getByText(/\d+ min/)).toBeVisible();
  });

  test('404 for unknown relationship ID', async ({ page }) => {
    await page.goto('/dashboard/athletes/00000000-0000-0000-0000-000000000999');
    await expect(page).toHaveURL(/\/dashboard\/athletes\/00000000-0000-0000-0000-000000000999/);
    // Next.js notFound() renders a 404 page
    await expect(page.getByRole('heading', { name: /404|not found/i })).toBeVisible();
  });
});
