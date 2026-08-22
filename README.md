# CureSense Web Dashboard

Doctor and admin interface for CureSense. Doctors review AI-generated patient reports, manage appointments, and run the clinical workflow. Admins verify doctor registrations, approve/reject appointments, and manage staff accounts.

Built with React 19 + Vite + Tailwind CSS + Redux Toolkit. State persistence via localStorage (no cookie/session dependency).

## Run locally

```bash
npm install
npm run dev          # Vite dev server → http://localhost:5173
npm run build        # Production build → dist/
npm run preview      # Preview the production build
```

The backend must be running on `http://localhost:5000` (or set `VITE_API_URL`).

## Environment variables

Create `web/.env` if you need to override the API URL:

```
VITE_API_URL=http://localhost:5000
```

Without the variable the app defaults to `http://localhost:5000` — correct for local development.

## Folder structure

```
web/src/
├── app/
│   └── store.js               Redux store (combines all slice reducers)
├── assets/
│   └── images/
├── components/
│   ├── CaseDiagnosis/         Sub-components for the case detail page
│   ├── Dashboard/             SummaryCard, WelcomeSection, etc.
│   ├── NavBar/                Doctor NavBar + NotificationBell + DoctorProfile
│   ├── Notifcation/           NotificationDropdown + NotificationItem  ← typo (known)
│   ├── Notifications/         NotificationCard
│   ├── Patients/
│   ├── Profile/
│   ├── admin/                 Admin-specific components (NavBar, Sidebar, Doctors, Reports)
│   └── auth/                  Shared AuthLayout and form inputs
├── data/                      Fake Redux payloads (kept for reference; some pages
│                              still read from them while awaiting real-API wiring)
├── features/                  Redux slices (one per domain)
│   ├── admin/
│   ├── auth/                  authSlice — token + user, localStorage-persisted
│   ├── doctor/
│   ├── notifications/
│   └── patients/
├── layouts/
│   ├── DashboardLayout.jsx    Sidebar + NavBar wrapper; blocks non-verified doctors
│   └── AdminLayout.jsx        Admin shell
├── pages/
│   ├── auth/                  DoctorLogin, DoctorSignup, ForgotPassword
│   ├── admin/                 AdminDashboard, ManageDoctors, AppointmentReview, …
│   ├── adminAuth/             AdminLogin, AdminForgotPassword
│   ├── Dashboard.jsx          Doctor home — summary cards + appointment tables
│   ├── CaseDiagnosis.jsx      Full case detail, query panel, complete/cancel actions
│   ├── Availability.jsx       Doctor sets weekly exceptions + slot duration
│   ├── Patients.jsx
│   ├── Notifications.jsx
│   └── Profile.jsx
├── routes/
│   └── AppRouter.jsx          createBrowserRouter — all routes declared here
└── utils/
    └── api.js                 Thin fetch wrapper (attaches Bearer token, throws on !ok)
```

### Component directory layout

| Directory | Contents |
|-----------|----------|
| `components/NavBar/` | Doctor NavBar — `Navbar.jsx`, `DoctorProfile.jsx`, `NotificationBell.jsx`, `SearchBar.jsx` |
| `components/Notification/` | `NotificationDropdown.jsx`, `NotificationItem.jsx`, `NotificationCard.jsx` |
| `components/admin/NavBar/` | Admin NavBar — `AdminNavbar.jsx` |

## Authentication flow

1. Doctor registers at `/doctor/signup` → status `pending`
2. Admin approves at `/admin/doctors` → status `verified`
3. Doctor logs in at `/doctor/login` → JWT stored in Redux + localStorage
4. `DashboardLayout` reads `user.doctor_profile.status`; non-verified doctors see a gate screen instead of the dashboard
5. All API calls attach `Authorization: Bearer <token>` via `api.js`

Admin accounts are created by an existing admin via `POST /api/auth/staff` (or the Manage Admins UI). The first admin must be bootstrapped with `node scripts/seed-admin.js` in the backend.

## E2E tests (Playwright)

```bash
npx playwright test              # headless, all specs
npx playwright test --ui         # interactive UI mode
npx playwright test e2e/auth.spec.ts   # single spec
```

Specs live in `web/e2e/`. The Playwright config starts Vite automatically and reuses an existing server if already running. All specs intercept API calls — no live backend required.

| Spec | Coverage |
|------|----------|
| `auth.spec.ts` | Login happy path, wrong password, pending/rejected doctor, role mismatch |
| `signup.spec.ts` | Registration, duplicate email, weak password, invalid email format |
| `forgot-password.spec.ts` | Form render, back navigation |
| `availability.spec.ts` | Save hours, mark off, slot duration, cross-surface slot shape |
| `case-lifecycle.spec.ts` | Admin approve/reject, doctor opens case (`doctor_viewed` flip), cancel path |
