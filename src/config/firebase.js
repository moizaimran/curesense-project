// Firebase web app config for project curesense-15651 (same project as the mobile app).
// These values are public-facing, not secrets: access is enforced by Firebase Authentication
// and by the backend verifying every ID token.
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

export const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDu6NFa3N5lg5iPgDRsYRyDPHZe7y2OF2M",
  authDomain:        "curesense-15651.firebaseapp.com",
  projectId:         "curesense-15651",
  storageBucket:     "curesense-15651.firebasestorage.app",
  messagingSenderId: "280753047687",
  appId:             "1:280753047687:web:1d2e6169593f15bc3ad022",
};

const app = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);

export const firebaseAuth = getAuth(app);
