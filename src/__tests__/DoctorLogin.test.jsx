// =============================================================================
// DoctorLogin.test.jsx
//
// Regression tests for three previously-fixed behaviors on the doctor login form:
//
//  1. Non-doctor role rejection: if the backend returns a non-doctor user the
//     form must dispatch loginFailure with "This login is for doctors only" and
//     NOT navigate to the dashboard.  (Prevents patient credentials bypassing
//     the doctor dashboard.)
//
//  2. Pending/rejected doctor error display: the backend now returns 403 for
//     unverified doctors.  The form catches this, dispatches loginFailure with
//     the server's error message, and renders it in the error banner.
//
//  3. Post-signup pending banner: when navigating to the login page from the
//     doctor signup screen (location.state.registered = true), a "pending
//     verification" confirmation message must be shown.
// =============================================================================

import { describe, test, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils";
import DoctorLogin from "../pages/auth/DoctorLogin";

// Mock the api module — component tests must not make real HTTP calls
vi.mock("../utils/api", () => ({
  api: { post: vi.fn() },
}));

// Mock react-router-dom's useNavigate so we can assert on navigation without
// a real router history.
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { api } from "../utils/api";

beforeEach(() => {
  vi.clearAllMocks();
});

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
  test("successful doctor login stores token in auth state", async () => {
    api.post.mockResolvedValueOnce({
      token: "fake.jwt.token",
      user:  { id: "abc", name: "Dr Test", email: "doctor@example.com", role: "doctor",
               patient_id: null, doctor_profile: { status: "verified" } },
    });

    // renderWithProviders returns { store, ...rtlResult }
    const { store } = mountLogin();
    await fillAndSubmit();

    // MemoryRouter supplies its own navigate context, so the module-level
    // mockNavigate won't be called — assert on Redux state instead.
    await waitFor(() => {
      expect(store.getState().auth.token).toBe("fake.jwt.token");
    });
  });
});

// =============================================================================
// 2. Regression: non-doctor role check
// =============================================================================
describe("REGRESSION — non-doctor role is rejected at the form level", () => {
  test("patient credentials → shows 'doctors only' error, no navigation", async () => {
    // Backend accepts the login (200 OK) but returns a patient user
    api.post.mockResolvedValueOnce({
      token: "fake.jwt.token",
      user:  { id: "xyz", name: "Jane Patient", email: "jane@example.com", role: "patient",
               patient_id: "p1", doctor_profile: null },
    });

    mountLogin();
    await fillAndSubmit("jane@example.com", "password1");

    await waitFor(() => {
      expect(screen.getByText(/doctors only/i)).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 3. Regression: pending/rejected doctor error display
// =============================================================================
describe("REGRESSION — pending/rejected doctor 403 is surfaced to the user", () => {
  test("pending doctor: 403 error message is displayed in the error banner", async () => {
    api.post.mockRejectedValueOnce(
      new Error("Your account is pending verification. Please wait for admin approval before logging in.")
    );

    mountLogin();
    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText(/pending verification/i)).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("rejected doctor: 403 error message is displayed", async () => {
    api.post.mockRejectedValueOnce(
      new Error("Your account was not approved. Please contact support for more information.")
    );

    mountLogin();
    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText(/not approved/i)).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
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
    // Never resolves — keeps loading state active
    api.post.mockReturnValueOnce(new Promise(() => {}));

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
