// =============================================================================
// Backend/config/firebase.js — Firebase Admin SDK singleton (firebase-admin v12+)
// =============================================================================
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth }                       = require("firebase-admin/auth");
const path                              = require("path");

if (!getApps().length) {
  const credPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!credPath) {
    throw new Error(
      "[Firebase] FIREBASE_SERVICE_ACCOUNT_PATH is not set in .env. " +
      "Download your service account key from Firebase Console → Project settings → Service accounts."
    );
  }
  initializeApp({
    credential: cert(require(path.resolve(credPath))),
  });
  console.log("[Firebase] Admin SDK initialised");
}

// Export a stable admin-like object so all callers use admin.auth()
module.exports = { auth: () => getAuth() };
