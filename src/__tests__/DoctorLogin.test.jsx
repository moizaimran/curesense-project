// =============================================================================
// DoctorLogin.test.jsx
//
// The doctor login form signs in with Firebase Authentication, then loads the
// backend profile from GET /api/auth/me with the Firebase ID token.
//
// Behaviours under test:
//  1. Verified doctor: ID token and backend user are stored in the auth slice.
//  2. Non-doctor accounts are rejected at the form and signed out of Firebase.
//  3. Pending/rejected doctors (Firebase account disabled until admin approval)
//     and wrong passwords get clear messages; backend 403s are surfaced.
//  4. Post-signup "pending verification" banner.
//  5. Loading state and navigation links.
// =============================================================================

import { describe, test, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils";
import DoctorLogin from "../pages/auth/DoctorLogin";

vi.mock("../config/firebase", () => ({ firebaseAuth: {} }));

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  getAdditionalUserInfo: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

// Component tests must not make real HTTP calls
vi.mock("../utils/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { api } from "../utils/api";

const DOCTOR = {
  id: "abc", name: "Dr Test", email: "doctor@example.com", role: "doctor",
  patient_id: null, doctor_profile: { id: "dp1", status: "verified", specialty: "Cardiology" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

function firebaseSignInSucceeds(token = "firebase.id.token") {
  signInWithEmailAndPassword.mockResolvedValueOnce({ user: { getIdToken: async () => token } });
}

function firebaseSignInFails(code) {
  signInWithEmailAndPassword.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
}

function mountLogin(routerState = {}) {
  return renderWithProviders(<DoctorLogin />, {
    route: "/doctor/login",
    routerState,
    initialState: { auth: { token: null, user: null, loading: false, error: null } },
  });
}

async function fillAndSubmit(email = "doctor@example.com", password = "password1") {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("doctor@example.com"), email);
  await user.type(screen.getByPlaceholderText("Enter your password"), password);
  await user.click(screen.getByRole("button", { name: /login/i }));
}

// =============================================================================
// 1. Happy path — verified doctor
// =============================================================================
describe("DoctorLogin — happy path", () => {
  test("successful Firebase sign-in stores the ID token and backend user", async () => {
    firebaseSignInSucceeds("firebase.id.token");
    api.get.mockResolvedValueOnce(DOCTOR);

    const { store } = mountLogin();
    await fillAndSubmit();

    await waitFor(() => {
      expect(store.getState().auth.token).toBe("firebase.id.token");
    });
    expect(store.getState().auth.user.doctor_profile.id).toBe("dp1");
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith({}, "doctor@example.com", "password1");
    expect(api.get).toHaveBeenCalledWith("/api/auth/me", "firebase.id.token");
  });
});

// =============================================================================
// 2. Regression: non-doctor role check
// =============================================================================
describe("REGRESSION — non-doctor role is rejected at the form level", () => {
  test("patient account → shows 'doctors only' error, signs out, no navigation", async () => {
    firebaseSignInSucceeds();
    api.get.mockResolvedValueOnce({ ...DOCTOR, role: "patient", doctor_profile: null });

    const { store } = mountLogin();
    await fillAndSubmit("jane@example.com", "password1");

    await waitFor(() => {
      expect(screen.getByText(/doctors only/i)).toBeInTheDocument();
    });
    expect(signOut).toHaveBeenCalled();
    expect(store.getState().auth.token).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 3. Sign-in failures
// =============================================================================
describe("REGRESSION — pending/rejected doctors and failed sign-ins are surfaced", () => {
  test("disabled Firebase account (pending or rejected doctor) shows the not-active message", async () => {
    firebaseSignInFails("auth/user-disabled");

    mountLogin();
    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText(/not active yet/i)).toBeInTheDocument();
    });
    expect(api.get).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("wrong password shows 'Incorrect email or password.'", async () => {
    firebaseSignInFails("auth/invalid-credential");

    mountLogin();
    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText("Incorrect email or password.")).toBeInTheDocument();
    });
  });

  test("backend 403 (email not verified) is displayed and the Firebase session is closed", async () => {
    firebaseSignInSucceeds();
    api.get.mockRejectedValueOnce(new Error("Email not verified. Please click the link in your inbox."));

    mountLogin();
    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText(/email not verified/i)).toBeInTheDocument();
    });
    expect(signOut).toHaveBeenCalled();
  });
});

// =============================================================================
// 4. Regression: post-signup pending banner
// =============================================================================
describe("REGRESSION — post-signup pending verification banner", () => {
  test("location.state.registered=true renders the pending-approval banner", () => {
    mountLogin({ registered: true });
    expect(screen.getByText(/pending admin verification/i)).toBeInTheDocument();
  });

  test("banner is absent when location.state.registered is falsy", () => {
    mountLogin();
    expect(screen.queryByText(/pending admin verification/i)).not.toBeInTheDocument();
  });
});

// =============================================================================
// 5. UI state
// =============================================================================
describe("DoctorLogin — loading and form rendering", () => {
  test("Submit button shows 'Signing in…' while loading", async () => {
    signInWithEmailAndPassword.mockReturnValueOnce(new Promise(() => {}));

    mountLogin();
    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
    });
  });

  test("links to signup and forgot-password pages are present", () => {
    mountLogin();
    expect(screen.getByRole("link", { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /forgot password/i })).toBeInTheDocument();
  });
});
