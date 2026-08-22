import { test, expect } from '@playwright/test';

// ── Doctor Availability ───────────────────────────────────────────────────────
//
// Tests the three save modes on /availability:
//   1. Save working hours for a selected day
//   2. Mark a day as off
//   3. Save slot duration (minutes input + save icon)
//
// All API calls are intercepted; no backend required.

const MOCK_AVAIL_EMPTY = {
  _id: 'avail-1',
  doctor_id: 'dp1',
  weekly_schedule: [],
  exceptions: [],
  slot_duration_minutes: 30,
};

async function loginAsDoctor(page: any) {
  await page.route('**/api/auth/login', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'fake.jwt.token',
        user: {
          id: 'u1',
          name: 'Dr Test',
          email: 'doctor@example.com',
          role: 'doctor',
          patient_id: null,
          doctor_profile: { id: 'dp1', status: 'verified' },
        },
      }),
    })
  );
  await page.goto('/doctor/login');
  await page.getByPlaceholder('doctor@example.com').fill('doctor@example.com');
  await page.locator('input[type="password"]').fill('password1');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL('/');
}

test.describe('Doctor Availability page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDoctor(page);

    await page.route('**/api/doctors/dp1/availability*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_AVAIL_EMPTY),
      })
    );

    await page.goto('/availability');
    await expect(page.getByRole('heading', { name: 'Availability' })).toBeVisible();
    // Wait for the calendar grid to finish loading
    await expect(page.getByText('Loading availability')).not.toBeVisible({ timeout: 5000 });
  });

  // Helper: click the first clickable calendar day cell (a numbered day button
  // inside the 7-column grid — avoids month-nav and legend buttons)
  async function clickFirstDay(page: any) {
    // The calendar grid has class "grid grid-cols-7" with buttons for each day.
    // Pick the first button that has purely numeric text (a day number).
    const dayBtn = page.locator('.grid.grid-cols-7 button').filter({ hasText: /^\d+$/ }).first();
    await expect(dayBtn).toBeVisible({ timeout: 5000 });
    await dayBtn.click();
  }

  // ── Mode 1: Save working hours ──────────────────────────────────────────────
  test('save working hours for a day — PATCH called with available:true exception', async ({ page }) => {
    let patchBody: any = null;

    await page.route('**/api/doctors/me/availability', async route => {
      patchBody = await route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_AVAIL_EMPTY,
          exceptions: patchBody?.exceptions ?? [],
        }),
      });
    });

    await clickFirstDay(page);

    // Side panel appears — wait for the save-hours button
    await expect(page.getByRole('button', { name: /save hours/i })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /save hours/i }).click();

    expect(patchBody).not.toBeNull();
    expect(Array.isArray(patchBody.exceptions)).toBe(true);
    expect(patchBody.exceptions[0].available).toBe(true);
    expect(patchBody.exceptions[0].custom_hours?.start_time).toBe('09:00');
  });

  // ── Mode 2: Mark day as off ─────────────────────────────────────────────────
  test('mark a day as off — PATCH called with available:false', async ({ page }) => {
    let patchBody: any = null;

    await page.route('**/api/doctors/me/availability', async route => {
      patchBody = await route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_AVAIL_EMPTY, exceptions: patchBody?.exceptions ?? [] }),
      });
    });

    await clickFirstDay(page);

    await expect(page.getByRole('button', { name: /mark.*off/i })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /mark.*off/i }).click();

    expect(patchBody).not.toBeNull();
    expect(patchBody.exceptions[0].available).toBe(false);
  });

  // ── Mode 3: Save slot duration ──────────────────────────────────────────────
  test('save slot duration — PATCH called with slot_duration_minutes', async ({ page }) => {
    let patchBody: any = null;

    await page.route('**/api/doctors/me/availability', async route => {
      patchBody = await route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_AVAIL_EMPTY, slot_duration_minutes: 45 }),
      });
    });

    // The slot duration input is in the top-right header area — always visible
    const durationInput = page.locator('input[type="number"][min="5"]');
    await expect(durationInput).toBeVisible();
    await durationInput.fill('45');

    // The save button next to the duration input has a Save icon (lucide Save svg)
    // It's inside the same flex container as the duration input
    const saveBtn = durationInput.locator('..').locator('..').getByRole('button');
    await saveBtn.click();

    await expect(async () => {
      expect(patchBody).not.toBeNull();
    }).toPass({ timeout: 3000 });

    expect(patchBody.slot_duration_minutes).toBe(45);
  });

  // ── Cross-surface: saved slot shape matches patient booking expectations ─────
  test('saved exception has the shape the patient booking screen queries for', async ({ page }) => {
    let savedExceptions: any[] = [];

    await page.route('**/api/doctors/me/availability', async route => {
      const body = await route.request().postDataJSON();
      savedExceptions = body?.exceptions ?? [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_AVAIL_EMPTY, exceptions: savedExceptions }),
      });
    });

    await clickFirstDay(page);
    await expect(page.getByRole('button', { name: /save hours/i })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /save hours/i }).click();

    await expect(async () => {
      expect(savedExceptions.length).toBeGreaterThan(0);
    }).toPass({ timeout: 3000 });

    const entry = savedExceptions[0];
    expect(entry.available).toBe(true);
    expect(entry.custom_hours?.start_time).toMatch(/^\d{2}:\d{2}$/);
    expect(entry.custom_hours?.end_time).toMatch(/^\d{2}:\d{2}$/);
  });
});
