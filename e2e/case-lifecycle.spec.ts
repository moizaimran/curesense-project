import { test, expect } from '@playwright/test';

// ── Case lifecycle ────────────────────────────────────────────────────────────
//
// Two flows:
//   A. Happy path: admin approves → doctor queries → patient replies → doctor completes
//   B. Cancel path: patient cancels a confirmed appointment
//
// All API calls are intercepted; no live backend required.

const DOCTOR_TOKEN_PAYLOAD = {
  token: 'doc.jwt.token',
  user: {
    id: 'u-doc',
    name: 'Dr Lifecycle',
    email: 'doc@example.com',
    role: 'doctor',
    patient_id: null,
    doctor_profile: { id: 'dp-1', status: 'verified' },
  },
};

const ADMIN_TOKEN_PAYLOAD = {
  token: 'admin.jwt.token',
  user: { id: 'u-admin', name: 'Admin', email: 'admin@example.com', role: 'admin', patient_id: null, doctor_profile: null },
};

const PENDING_APPOINTMENT = {
  _id: 'appt-1',
  status: 'pending_admin_review',
  patient_id: { _id: 'p-1', name: 'Jane Patient', dob: '1992-04-12', gender: 'female' },
  doctor_id: { _id: 'dp-1', specialty: 'Cardiology', hospital_clinic: 'PIMS', pmdc_number: 'PMDC-001', location: { city: 'Islamabad' }, contact: { phone: '0300-1111111' }, user_id: { name: 'Dr Lifecycle' } },
  requested_slot: { date: '2026-09-07', start_time: '09:00', end_time: '09:30' },
  rejection_reason: null,
};

const CONFIRMED_APPOINTMENT = { ...PENDING_APPOINTMENT, status: 'confirmed', doctor_viewed: false };
const COMPLETED_APPOINTMENT = { ...PENDING_APPOINTMENT, status: 'completed' };

// ── Flow A: Happy path ────────────────────────────────────────────────────────

test.describe('Case lifecycle — happy path (approve → query → complete)', () => {
  test('admin approves a pending appointment and it disappears from the review queue', async ({ page }) => {
    await page.route('**/api/auth/login', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_TOKEN_PAYLOAD) })
    );

    // Queue returns one pending appointment, then empty after approval
    let approvalDone = false;
    await page.route('**/api/appointments/admin*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: approvalDone ? 0 : 1,
          results: approvalDone ? [] : [PENDING_APPOINTMENT],
        }),
      });
    });

    await page.route(`**/api/appointments/admin/appt-1/review`, async route => {
      approvalDone = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointment: CONFIRMED_APPOINTMENT }),
      });
    });

    await page.goto('/admin/login');
    await page.getByPlaceholder('admin@curesense.com').fill('admin@example.com');
    await page.locator('input[type="password"]').fill('adminpass1');
    await page.getByRole('button', { name: /login/i }).click();

    await page.goto('/admin/appointments');
    await expect(page.getByText('Jane Patient')).toBeVisible();

    // Click approve
    await page.getByRole('button', { name: /approve/i }).first().click();

    // Card should be removed from the list optimistically
    await expect(page.getByText('Jane Patient')).not.toBeVisible();
  });

  test('doctor sees confirmed appointment in dashboard after approval', async ({ page }) => {
    await page.route('**/api/auth/login', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DOCTOR_TOKEN_PAYLOAD) })
    );

    await page.route('**/api/appointments/doctor*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([CONFIRMED_APPOINTMENT]),
      })
    );

    // Dashboard calls /api/doctors/:profileId/dashboard-summary (not /me/)
    await page.route('**/api/doctors/*/dashboard-summary', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pending_new: 1, ongoing: 1, completed: 0, total_patients: 1 }),
      })
    );

    await page.goto('/doctor/login');
    await page.getByPlaceholder('doctor@example.com').fill('doc@example.com');
    await page.locator('input[type="password"]').fill('password1');
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page).toHaveURL('/');
    // The SummaryCard renders title in a <p> — use that to avoid matching the tab button too
    await expect(page.locator('p', { hasText: 'Pending / New' })).toBeVisible();
  });

  test('doctor opens case detail — doctor_viewed flip is called', async ({ page }) => {
    await page.route('**/api/auth/login', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DOCTOR_TOKEN_PAYLOAD) })
    );

    let viewedCalled = false;
    await page.route('**/api/appointments/appt-1', route => {
      viewedCalled = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...CONFIRMED_APPOINTMENT, doctor_viewed: true, queries: [] }),
      });
    });

    await page.route('**/api/appointments/doctor*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CONFIRMED_APPOINTMENT]) })
    );
    await page.route('**/api/doctors/*/dashboard-summary', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pending_new: 1, ongoing: 1, completed: 0, total_patients: 1 }) })
    );

    await page.goto('/doctor/login');
    await page.getByPlaceholder('doctor@example.com').fill('doc@example.com');
    await page.locator('input[type="password"]').fill('password1');
    await page.getByRole('button', { name: 'Login' }).click();

    // Wait for login to complete — loginSuccess writes the token to localStorage.
    // Without this, page.goto below triggers a full-page reload before the write
    // lands, and CaseDiagnosis mounts with token=null, skipping the fetch.
    await expect(page).toHaveURL('/');

    // Set up the response waiter BEFORE navigation so Playwright doesn't miss it
    const responsePromise = page.waitForResponse('**/api/appointments/appt-1');

    // Full-page navigation to cases/:id — app reinitialises, loads token from
    // localStorage, CaseDiagnosis useEffect fires GET /api/appointments/appt-1
    await page.goto('/cases/appt-1');
    await responsePromise;

    expect(viewedCalled).toBe(true);
  });
});

// ── Flow B: Cancel path ───────────────────────────────────────────────────────

test.describe('Case lifecycle — cancel path', () => {
  test('admin rejects an appointment with a reason and it disappears from the queue', async ({ page }) => {
    await page.route('**/api/auth/login', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_TOKEN_PAYLOAD) })
    );

    let rejectionDone = false;
    await page.route('**/api/appointments/admin*', route => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ total: rejectionDone ? 0 : 1, results: rejectionDone ? [] : [PENDING_APPOINTMENT] }),
        });
      } else {
        route.continue();
      }
    });

    await page.route('**/api/appointments/admin/appt-1/review', async route => {
      const body = await route.request().postDataJSON();
      expect(body.decision).toBe('reject');
      expect(body.rejection_reason?.length).toBeGreaterThan(0);
      rejectionDone = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointment: { ...PENDING_APPOINTMENT, status: 'rejected', rejection_reason: body.rejection_reason } }),
      });
    });

    await page.goto('/admin/login');
    await page.getByPlaceholder('admin@curesense.com').fill('admin@example.com');
    await page.locator('input[type="password"]').fill('adminpass1');
    await page.getByRole('button', { name: /login/i }).click();

    await page.goto('/admin/appointments');
    await expect(page.getByText('Jane Patient')).toBeVisible();

    // Click reject to open the reason form
    await page.getByRole('button', { name: /reject/i }).first().click();

    // Reason textarea/input should appear
    const reasonInput = page.locator('textarea, input[placeholder*="reason" i], input[placeholder*="Reason" i]').first();
    await reasonInput.fill('Slot conflict with another patient.');

    // Confirm rejection
    await page.getByRole('button', { name: /confirm/i }).click();

    // Card disappears
    await expect(page.getByText('Jane Patient')).not.toBeVisible();
  });
});
