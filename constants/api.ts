import { Platform } from "react-native";

// Backend URL.
//  · Set EXPO_PUBLIC_API_URL in a local `.env.local` (git-ignored) to point at
//    your own machine, e.g. EXPO_PUBLIC_API_URL=http://172.20.10.2:3000
//  · Otherwise: the browser (web) uses localhost; physical devices / Expo Go
//    can't reach 'localhost' and use the LAN IP below.
const DEFAULT_LAN_URL = "http://172.20.10.2:5000";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "web" ? "http://localhost:5000" : DEFAULT_LAN_URL);
