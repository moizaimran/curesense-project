import { test, expect } from '@playwright/test';

// ── Doctor Signup ─────────────────────────────────────────────────────────────

test.describe('Doctor signup page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/doctor/signup');
  });

  test('renders all required form fields', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Create Doctor Account' })).toBeVisible();
    await expect(page.getByPlaceholder('John')).toBeVisible();          // First Name
    await expect(page.getByPlaceholder('Smith')).toBeVisible();         // Last Name
    await expect(page.getByPlaceholder('doctor@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('+92 300 1234567')).toBeVisible();
    await expect(page.getByPlaceholder('PMDC-12345')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
  });

  test('specialization dropdown lists known specialties', async ({ page }) => {
    const select = page.locator('select[name="specialization"]');
    await expect(select).toBeVisible();
    await expect(select.locator('option', { hasText: 'Cardiologist' })).toBeAttached();
    await expect(select.locator('option', { hasText: 'Neurologist' })).toBeAttached();
    await expect(select.locator('option', { hasText: 'General Physician' })).toBeAttached();
  });

  test('gender dropdown lists Male and Female options', async ({ page }) => {
    const select = page.locator('select[name="gender"]');
    await expect(select).toBeVisible();
    // Use exact regex to avoid "Male" substring-matching "Female"
    await expect(select.locator('option', { hasText: /^Male$/ })).toBeAttached();
    await expect(select.locator('option', { hasText: /^Female$/ })).toBeAttached();
  });

  test('API error is shown inline', async ({ page }) => {
    await page.route('**/api/doctors/register', route =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Email already registered' }),
      })
    );

    // Fill the minimum required fields
    await page.getByPlaceholder('John').fill('Ali');
    await page.getByPlaceholder('Smith').fill('Khan');
    await page.getByPlaceholder('doctor@example.com').fill('ali@example.com');
    await page.getByPlaceholder('+92 300 1234567').fill('+92 300 0000000');
    await page.locator('input[type="password"]').first().fill('password123');
    await page.locator('input[type="password"]').last().fill('password123');
    await page.getByPlaceholder('PMDC-12345').fill('PMDC-99999');
    await page.locator('select[name="specialization"]').selectOption('Cardiologist');
    await page.locator('select[name="gender"]').selectOption('male');
    await page.getByPlaceholder('City Hospital').fill('Shifa Hospital');
    await page.locator('input[name="experience"]').fill('10');
    await page.getByPlaceholder('Islamabad').fill('Islamabad');

    // Agree to terms
    await page.locator('input[type="checkbox"]').check();

    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByText('Email already registered')).toBeVisible();
    await expect(page).toHaveURL('/doctor/signup');
  });

  test('successful registration redirects to login with success banner', async ({ page }) => {
    await page.route('**/api/doctors/register', route =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Doctor registered' }),
      })
    );

    await page.getByPlaceholder('John').fill('Zara');
    await page.getByPlaceholder('Smith').fill('Ahmed');
    await page.getByPlaceholder('doctor@example.com').fill('zara@example.com');
    await page.getByPlaceholder('+92 300 1234567').fill('+92 321 1234567');
    await page.locator('input[type="password"]').first().fill('secure123');
    await page.locator('input[type="password"]').last().fill('secure123');
    await page.getByPlaceholder('PMDC-12345').fill('PMDC-11111');
    await page.locator('select[name="specialization"]').selectOption('Pediatrician');
    await page.locator('select[name="gender"]').selectOption('female');
    await page.getByPlaceholder('City Hospital').fill('PIMS');
    await page.locator('input[name="experience"]').fill('3');
    await page.getByPlaceholder('Islamabad').fill('Rawalpindi');

    await page.locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Create Account' }).click();

    // After success the component navigates to /doctor/login with registered:true state
    await expect(page).toHaveURL('/doctor/login');
    await expect(
      page.getByText('Account created! Your profile is pending admin verification')
    ).toBeVisible();
  });

  test('weak password shows API error inline', async ({ page }) => {
    await page.route('**/api/doctors/register', route =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Password must be at least 8 characters and contain both letters and digits' }),
      })
    );

    await page.getByPlaceholder('John').fill('Weak');
    await page.getByPlaceholder('Smith').fill('Pass');
    await page.getByPlaceholder('doctor@example.com').fill('weak@example.com');
    await page.getByPlaceholder('+92 300 1234567').fill('+92 300 0000001');
    await page.locator('input[type="password"]').first().fill('abc');
    await page.locator('input[type="password"]').last().fill('abc');
    await page.getByPlaceholder('PMDC-12345').fill('PMDC-77777');
    await page.locator('select[name="specialization"]').selectOption('Cardiologist');
    await page.locator('select[name="gender"]').selectOption('male');
    await page.getByPlaceholder('City Hospital').fill('Test Hospital');
    await page.locator('input[name="experience"]').fill('2');
    await page.getByPlaceholder('Islamabad').fill('Lahore');
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByText(/password.*characters/i)).toBeVisible();
    await expect(page).toHaveURL('/doctor/signup');
  });

  test('invalid email format shows API error inline', async ({ page }) => {
    await page.route('**/api/doctors/register', route =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid email address' }),
      })
    );

    await page.getByPlaceholder('John').fill('Bad');
    await page.getByPlaceholder('Smith').fill('Email');
    // Use an email that passes browser HTML5 validation but the intercepted API
    // treats as invalid (format check is validated server-side)
    await page.getByPlaceholder('doctor@example.com').fill('bademail@x');
    await page.getByPlaceholder('+92 300 1234567').fill('+92 300 0000002');
    await page.locator('input[type="password"]').first().fill('validpass1');
    await page.locator('input[type="password"]').last().fill('validpass1');
    await page.getByPlaceholder('PMDC-12345').fill('PMDC-88888');
    await page.locator('select[name="specialization"]').selectOption('Neurologist');
    await page.locator('select[name="gender"]').selectOption('female');
    await page.getByPlaceholder('City Hospital').fill('City Hospital');
    await page.locator('input[name="experience"]').fill('5');
    await page.getByPlaceholder('Islamabad').fill('Karachi');
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByText(/invalid email/i)).toBeVisible();
    await expect(page).toHaveURL('/doctor/signup');
  });

  test('Login link navigates back to login page', async ({ page }) => {
    await page.getByRole('link', { name: 'Login' }).click();
    await expect(page).toHaveURL('/doctor/login');
  });
});
