import { initializeApp, getApps } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FIREBASE_CONFIG } from "@/constants/firebase";

// Initialise once — guard against hot-reload double-init
if (!getApps().length) {
  const app = initializeApp(FIREBASE_CONFIG);
  initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

export const firebaseAuth = getAuth();
