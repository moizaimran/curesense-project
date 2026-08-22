import { test, expect } from '@playwright/test';

// ── Doctor Login ──────────────────────────────────────────────────────────────

test.describe('Doctor login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/doctor/login');
  });

  test('renders the login form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Welcome Back Doctor' })).toBeVisible();
    await expect(page.getByPlaceholder('doctor@example.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('Create Account link navigates to signup', async ({ page }) => {
    await page.getByRole('link', { name: 'Create Account' }).click();
    await expect(page).toHaveURL('/doctor/signup');
  });

  test('Forgot Password link navigates to forgot-password page', async ({ page }) => {
    await page.getByRole('link', { name: 'Forgot Password?' }).click();
    await expect(page).toHaveURL('/doctor/forgot-password');
  });

  test('API error is shown inline', async ({ page }) => {
    // Intercept before filling form so the route is ready
    await page.route('**/api/auth/login', route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid credentials' }),
      })
    );

    await page.getByPlaceholder('doctor@example.com').fill('bad@example.com');
    await page.getByPlaceholder('doctor@example.com').press('Tab');
    // PasswordInput renders a visible input with type=password
    await page.locator('input[type="password"]').fill('wrongpass');
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.getByText('Invalid credentials')).toBeVisible();
    await expect(page).toHaveURL('/doctor/login');
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.route('**/api/auth/login', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'fake.jwt.token',
          user: {
            id: '1',
            name: 'Dr Test',
            email: 'doctor@example.com',
            role: 'doctor',
            patient_id: null,
            doctor_profile: { status: 'verified' },
          },
        }),
      })
    );

    await page.getByPlaceholder('doctor@example.com').fill('doctor@example.com');
    await page.locator('input[type="password"]').fill('correct');
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page).toHaveURL('/');
  });

  test('non-doctor role shows role error', async ({ page }) => {
    await page.route('**/api/auth/login', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'fake.jwt.token',
          user: {
            id: '2',
            name: 'Patient Joe',
            email: 'patient@example.com',
            role: 'patient',
            patient_id: '99',
            doctor_profile: null,
          },
        }),
      })
    );

    await page.getByPlaceholder('doctor@example.com').fill('patient@example.com');
    await page.locator('input[type="password"]').fill('pass');
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.getByText('This login is for doctors only')).toBeVisible();
    await expect(page).toHaveURL('/doctor/login');
  });

  test('pending doctor login shows verification-pending error', async ({ page }) => {
    await page.route('**/api/auth/login', route =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Your account is pending verification by an admin' }),
      })
    );

    await page.getByPlaceholder('doctor@example.com').fill('pending@example.com');
    await page.locator('input[type="password"]').fill('password123');
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.getByText('pending verification')).toBeVisible();
    await expect(page).toHaveURL('/doctor/login');
  });

  test('rejected doctor login shows rejection error', async ({ page }) => {
    await page.route('**/api/auth/login', route =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Your registration was rejected' }),
      })
    );

    await page.getByPlaceholder('doctor@example.com').fill('rejected@example.com');
    await page.locator('input[type="password"]').fill('password123');
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.getByText('rejected')).toBeVisible();
    await expect(page).toHaveURL('/doctor/login');
  });
});

// ── Doctor Signup ─────────────────────────────────────────────────────────────

test.describe('Doctor signup page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/doctor/signup');
  });

  test('renders the registration form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Create Doctor Account' })).toBeVisible();
    await expect(page.getByPlaceholder('John')).toBeVisible();
    await expect(page.getByPlaceholder('Smith')).toBeVisible();
  });

  test('Login link navigates back to login page', async ({ page }) => {
    await page.getByRole('link', { name: 'Login' }).click();
    await expect(page).toHaveURL('/doctor/login');
  });
});
