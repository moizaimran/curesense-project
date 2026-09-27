import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { firebaseAuth } from "@/utils/firebaseClient";

export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === "web") return await AsyncStorage.getItem(key);
  return await SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

// Returns a fresh Firebase ID token for the currently signed-in user,
// or null if nobody is signed in. Use this instead of the stored JWT
// for all authenticated API calls.
export async function getAuthToken(): Promise<string | null> {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
