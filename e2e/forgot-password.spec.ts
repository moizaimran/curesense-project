import { test, expect } from '@playwright/test';

// ── Forgot Password ───────────────────────────────────────────────────────────

test.describe('Forgot password page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/doctor/forgot-password');
  });

  test('renders the forgot password form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Forgot Password?' })).toBeVisible();
    await expect(
      page.getByText('Enter your email and we will help you reset your password.')
    ).toBeVisible();
    await expect(page.getByPlaceholder('doctor@example.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Reset Link' })).toBeVisible();
  });

  test('Back to Login link navigates to login page', async ({ page }) => {
    await page.getByRole('link', { name: 'Back to Login' }).click();
    await expect(page).toHaveURL('/doctor/login');
  });

  test('form accepts an email address without error', async ({ page }) => {
    await page.getByPlaceholder('doctor@example.com').fill('doctor@example.com');
    // The backend is not wired yet; just verify the submit does not crash the page
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await expect(page).toHaveURL('/doctor/forgot-password');
    await expect(page.getByRole('heading', { name: 'Forgot Password?' })).toBeVisible();
  });
});
