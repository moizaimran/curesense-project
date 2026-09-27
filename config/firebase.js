// =============================================================================
// Backend/config/firebase.js — Firebase Admin SDK singleton
//
// Imported from server.js before app.js so it is initialised once when the
// real server starts. Tests import app.js directly and never call this file,
// which keeps CI free of real Firebase credentials.
// =============================================================================
const admin = require("firebase-admin");
const path  = require("path");

if (!admin.apps.length) {
  const credPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!credPath) {
    throw new Error(
      "[Firebase] FIREBASE_SERVICE_ACCOUNT_PATH is not set in .env. " +
      "Download your service account key from Firebase Console → Project settings → Service accounts."
    );
  }
  admin.initializeApp({
    credential: admin.credential.cert(require(path.resolve(credPath))),
  });
  console.log("[Firebase] Admin SDK initialised");
}

module.exports = admin;
