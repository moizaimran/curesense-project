// =============================================================================
// Backend/config/firebase.js — Firebase Admin SDK singleton (firebase-admin v12+)
//
// If the service account key file is missing, we fall back to initialising
// with just the project ID. That is enough for verifyIdToken() (login /
// protected routes), but user-management calls (createUser, deleteUser,
// generate*Link) will fail until the key file is added.
// =============================================================================
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth }                       = require("firebase-admin/auth");
const fs                                = require("fs");
const path                              = require("path");

const DEFAULT_PROJECT_ID = "curesense-15651";

if (!getApps().length) {
  const credPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const resolved = credPath ? path.resolve(credPath) : null;

  if (resolved && fs.existsSync(resolved)) {
    initializeApp({ credential: cert(require(resolved)) });
    console.log("[Firebase] Admin SDK initialised");
  } else {
    const projectId = process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
    initializeApp({ projectId });
    console.warn(
      `[Firebase] Service account key not found (${resolved || "FIREBASE_SERVICE_ACCOUNT_PATH not set"}).\n` +
      `[Firebase] Running in limited mode with projectId "${projectId}": token verification works, ` +
      "but creating/deleting users and sending verification/reset emails will fail.\n" +
      "[Firebase] Download the key from Firebase Console → Project settings → Service accounts."
    );
  }
}

// Export a stable admin-like object so all callers use admin.auth()
module.exports = { auth: () => getAuth() };
