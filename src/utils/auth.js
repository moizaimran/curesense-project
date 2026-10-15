import {
  GoogleAuthProvider,
  getAdditionalUserInfo,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { firebaseAuth } from "../config/firebase";
import { api } from "./api";

const ROLE_ERRORS = {
  doctor: "This login is for doctors only",
  admin:  "This login is for admins only",
};

const FIREBASE_ERRORS = {
  "auth/invalid-credential":     "Incorrect email or password.",
  "auth/invalid-login-credentials": "Incorrect email or password.",
  "auth/wrong-password":         "Incorrect email or password.",
  "auth/user-not-found":         "Incorrect email or password.",
  "auth/invalid-email":          "Please enter a valid email address.",
  "auth/user-disabled":
    "Your account is not active yet. Doctor accounts can sign in once an administrator has verified the PMDC registration; if your registration was not approved, please contact support.",
  "auth/too-many-requests":      "Too many sign-in attempts. Please wait a few minutes and try again.",
  "auth/network-request-failed": "Network error — check your connection and try again.",
  "auth/popup-closed-by-user":   "Google sign-in was cancelled.",
  "auth/cancelled-popup-request": "Google sign-in was cancelled.",
  "auth/popup-blocked":
    "The browser blocked the Google sign-in pop-up. Allow pop-ups for this site and try again.",
  "auth/account-exists-with-different-credential":
    "This email is registered with a password. Please sign in with your email and password.",
  "auth/operation-not-allowed":  "Google sign-in is not enabled for CureSense yet.",
};

const NO_ACCOUNT_FOR_GOOGLE =
  "No CureSense account is linked to this Google account. Register first, or sign in with your email and password.";

export function friendlyAuthError(err) {
  return FIREBASE_ERRORS[err?.code] || err?.message || "Sign-in failed. Please try again.";
}

// Signs in with Firebase, loads the backend profile, and enforces the portal's role.
// Returns { token, user } for the auth slice; throws Error with a user-facing message.
export async function signInToPortal(email, password, expectedRole) {
  let credential;
  try {
    credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }

  return finishPortalSignIn(credential, expectedRole);
}

// Google sign-in for existing accounts only — portal accounts are created through registration.
export async function signInWithGoogleToPortal(expectedRole) {
  let credential;
  try {
    credential = await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }

  try {
    return await finishPortalSignIn(credential, expectedRole);
  } catch (err) {
    if (err.status === 401 && getAdditionalUserInfo(credential)?.isNewUser) {
      // The popup just created an empty Firebase account with no CureSense profile — remove it.
      await credential.user.delete().catch(() => {});
    }
    throw err.status === 401 ? new Error(NO_ACCOUNT_FOR_GOOGLE) : err;
  }
}

// Loads the backend profile for a Firebase credential and enforces the portal's role.
async function finishPortalSignIn(credential, expectedRole) {
  const token = await credential.user.getIdToken();
  let user;
  try {
    user = await api.get("/api/auth/me", token);
  } catch (err) {
    await signOut(firebaseAuth).catch(() => {});
    throw err;
  }

  if (user.role !== expectedRole) {
    await signOut(firebaseAuth).catch(() => {});
    throw new Error(ROLE_ERRORS[expectedRole]);
  }
  return { token, user };
}

export async function signOutOfPortal() {
  await signOut(firebaseAuth).catch(() => {});
}

export async function requestPasswordReset(email) {
  return api.post("/api/auth/forgot-password", { email: email.trim() });
}
