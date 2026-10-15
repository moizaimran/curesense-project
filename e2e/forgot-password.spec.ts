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

  test('submitting an email requests a reset link and shows the confirmation', async ({ page }) => {
    let requestedEmail = '';
    await page.route('**/api/auth/forgot-password', async route => {
      requestedEmail = route.request().postDataJSON().email;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'If an account with that email exists, a reset link has been sent.' }),
      });
    });

    await page.getByPlaceholder('doctor@example.com').fill('doctor@example.com');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();

    await expect(page.getByText('If an account with that email exists, a reset link has been sent.')).toBeVisible();
    expect(requestedEmail).toBe('doctor@example.com');
    await expect(page).toHaveURL('/doctor/forgot-password');
  });
});
