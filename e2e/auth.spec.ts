import { test, expect } from '@playwright/test';
import { mockPortalLogin, mockFirebaseSignInError, signInThroughForm } from './helpers/firebaseAuth';

// ── Doctor Login (Firebase Authentication) ──────────────────────────────────

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

  test('wrong password shows an inline error', async ({ page }) => {
    await mockFirebaseSignInError(page, 'INVALID_LOGIN_CREDENTIALS');
    await signInThroughForm(page, '/doctor/login', 'bad@example.com', 'wrongpass');

    await expect(page.getByText('Incorrect email or password.')).toBeVisible();
    await expect(page).toHaveURL('/doctor/login');
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await mockPortalLogin(page, {
      id: '1', name: 'Dr Test', email: 'doctor@example.com', role: 'doctor',
      patient_id: null, doctor_profile: { id: 'dp1', status: 'verified' },
    });
    await signInThroughForm(page, '/doctor/login', 'doctor@example.com', 'correct');

    await expect(page).toHaveURL('/');
  });

  test('non-doctor role shows role error', async ({ page }) => {
    await mockPortalLogin(page, {
      id: '2', name: 'Patient Joe', email: 'patient@example.com', role: 'patient',
      patient_id: '99', doctor_profile: null,
    });
    await signInThroughForm(page, '/doctor/login', 'patient@example.com', 'pass1234');

    await expect(page.getByText('This login is for doctors only')).toBeVisible();
    await expect(page).toHaveURL('/doctor/login');
  });

  test('pending or rejected doctor (Firebase account disabled) shows not-active message', async ({ page }) => {
    await mockFirebaseSignInError(page, 'USER_DISABLED');
    await signInThroughForm(page, '/doctor/login', 'pending@example.com', 'password123');

    await expect(page.getByText(/not active yet/)).toBeVisible();
    await expect(page).toHaveURL('/doctor/login');
  });
});

// ── Route guards ─────────────────────────────────────────────────────────────

test.describe('Signed-out access', () => {
  test('doctor dashboard redirects to the doctor login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/doctor/login');
  });

  test('admin dashboard redirects to the admin login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL('/admin/login');
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
