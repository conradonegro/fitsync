import { expect, test } from '@playwright/test';

/**
 * Authentication tests.
 *
 * The `unauthenticated` describe block overrides the project-level
 * storageState to clear cookies, exercising redirects and login form
 * behaviour without the trainer session.
 *
 * The `authenticated` describe block uses the project default
 * (trainer.json) to test logout.
 */

test.describe('Unauthenticated flows', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('visiting /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard/athletes');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page renders sign-in form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('login with wrong password shows an error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'trainer@fitsync.dev');
    await page.fill('#password', 'wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Supabase returns "Invalid login credentials" for bad passwords.
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
  });

  test('login with invalid email format shows validation error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'notanemail');
    await page.fill('#password', 'Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/please enter a valid email/i)).toBeVisible();
  });

  test('valid trainer login redirects to /dashboard/athletes', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'trainer@fitsync.dev');
    await page.fill('#password', 'Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('/dashboard/athletes');
    await expect(page.getByRole('heading', { name: 'Athletes' })).toBeVisible();
  });

  test('signup page renders form with role selector', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: 'Sign up' })).toBeVisible();
    await expect(page.locator('#full_name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByText('Trainer')).toBeVisible();
    await expect(page.getByText('Athlete')).toBeVisible();
  });

  test('signup with empty name shows required error', async ({ page }) => {
    await page.goto('/signup');
    // Leave full_name empty, fill the rest
    await page.fill('#email', 'newuser@example.com');
    await page.fill('#password', 'Password123!');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByText(/this field is required/i)).toBeVisible();
  });

  test('signup with short password shows validation error', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('#full_name', 'Test User');
    await page.fill('#email', 'newuser@example.com');
    await page.fill('#password', 'short');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByText(/password must be at least 8 characters/i)).toBeVisible();
  });

  test('signup page has link to login', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('login page has link to signup', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
  });
});

// Serial so the sidebar test runs before logout invalidates the session.
test.describe.serial('Authenticated flows', () => {
  test('dashboard sidebar shows FitSync and Athletes nav link', async ({ page }) => {
    await page.goto('/dashboard/athletes');
    await expect(page.getByText('FitSync', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Athletes' })).toBeVisible();
  });

  // Logout last — it invalidates the session for this browser context.
  test('logout redirects to /login', async ({ page }) => {
    await page.goto('/dashboard/athletes');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
