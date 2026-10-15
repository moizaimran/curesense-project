import type { Page, Route } from '@playwright/test';

// Mocks Firebase Authentication's REST endpoints (identitytoolkit) so the real Firebase
// JS SDK runs its normal sign-in flow in the browser, plus the backend GET /api/auth/me.

const PROJECT_ID = 'curesense-15651';
const IDENTITY_TOOLKIT = '**/identitytoolkit.googleapis.com/v1/accounts:*';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export type PortalUser = {
  id: string;
  name: string;
  email: string;
  role: 'doctor' | 'admin' | 'patient';
  patient_id: string | null;
  doctor_profile: { id?: string; status: string; specialty?: string } | null;
};

const b64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');

export function fakeIdToken(uid: string, email: string) {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: 'RS256', typ: 'JWT' }),
    b64url({
      iss: `https://securetoken.google.com/${PROJECT_ID}`, aud: PROJECT_ID, auth_time: now,
      user_id: uid, sub: uid, iat: now, exp: now + 3600, email, email_verified: true,
      firebase: { identities: { email: [email] }, sign_in_provider: 'password' },
    }),
    'signature',
  ].join('.');
}

function json(route: Route, status: number, body: object) {
  return route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
}

async function preflightOk(route: Route) {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS });
    return true;
  }
  return false;
}

// Successful Firebase sign-in for `user`; the backend profile endpoint returns `user`.
export async function mockPortalLogin(page: Page, user: PortalUser) {
  const uid = `fb-${user.id}`;
  const idToken = fakeIdToken(uid, user.email);

  await page.route(IDENTITY_TOOLKIT, async route => {
    if (await preflightOk(route)) return;
    const url = route.request().url();
    if (url.includes('accounts:signInWithPassword')) {
      return json(route, 200, {
        kind: 'identitytoolkit#VerifyPasswordResponse', localId: uid, email: user.email,
        displayName: user.name, idToken, registered: true, refreshToken: 'fake-refresh-token', expiresIn: '3600',
      });
    }
    if (url.includes('accounts:lookup')) {
      const now = String(Date.now());
      return json(route, 200, {
        kind: 'identitytoolkit#GetAccountInfoResponse',
        users: [{
          localId: uid, email: user.email, displayName: user.name, emailVerified: true,
          providerUserInfo: [{ providerId: 'password', email: user.email, federatedId: user.email, rawId: user.email }],
          validSince: '0', lastLoginAt: now, createdAt: now, lastRefreshAt: new Date().toISOString(),
        }],
      });
    }
    return json(route, 200, {});
  });

  await page.route('**/api/auth/me', route => json(route, 200, user));
  return idToken;
}

// Firebase rejects the sign-in, e.g. 'INVALID_LOGIN_CREDENTIALS' or 'USER_DISABLED'.
export async function mockFirebaseSignInError(page: Page, message: string) {
  await page.route(IDENTITY_TOOLKIT, async route => {
    if (await preflightOk(route)) return;
    return json(route, 400, {
      error: { code: 400, message, errors: [{ message, domain: 'global', reason: 'invalid' }] },
    });
  });
}

export async function signInThroughForm(page: Page, loginPath: string, email: string, password = 'password1') {
  await page.goto(loginPath);
  await page.getByPlaceholder(loginPath.startsWith('/admin') ? 'admin@curesense.com' : 'doctor@example.com').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}
