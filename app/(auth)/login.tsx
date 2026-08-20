import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_URL } from "@/constants/api";
import * as Storage from "@/utils/storage";

const C = {
  navy: "#0B1437",
  blue: "#2563EB",
  white: "#FFFFFF",
  inputBg: "rgba(255,255,255,0.07)",
  inputBorder: "rgba(255,255,255,0.15)",
  error: "#F87171",
};

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!password.trim()) {
      setError("Password is required.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        return;
      }

      await Storage.setItemAsync("token", data.token);
      await Storage.setItemAsync("role", data.user.role);
      await Storage.setItemAsync(
        "patient_id",
        data.user.patient_id?.toString() ?? "",
      );

      router.replace("/(patient)/profile" as any);
    } catch (err) {
      console.log("LOGIN ERROR:", err);
      setError(`Could not connect to the server: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient
      colors={["#0B1437", "#0F2060", "#1A3A9A"]}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            s.container,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity style={s.back} onPress={() => router.back()}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>

          {/* Logo */}
          <View style={s.logoRow}>
            <View style={s.logoIcon} />
            <Text style={s.logoText}>CureSense</Text>
          </View>

          {/* Heading */}
          <Text style={s.heading}>Welcome Back</Text>
          <Text style={s.sub}>
            Sign in to continue to your health dashboard.
          </Text>

          {/* Form */}
          <View style={s.form}>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Email</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="john@example.com"
                placeholderTextColor="rgba(255,255,255,0.30)"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Password</Text>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor="rgba(255,255,255,0.30)"
                secureTextEntry
                autoCorrect={false}
              />
            </View>

            {error ? <Text style={s.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.btnPrimary, loading && { opacity: 0.6 }]}
              onPress={handleLogin}
              activeOpacity={0.85}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnPrimaryText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

          {/* Switch to register */}
          <TouchableOpacity
            style={s.btnOutline}
            onPress={() => router.replace("/(auth)/register" as any)}
            activeOpacity={0.85}
          >
            <Text style={s.btnOutlineText}>Create a New Account</Text>
          </TouchableOpacity>

          <View style={s.switchRow}>
            <Text style={s.switchText}>Don't have an account? </Text>
            <TouchableOpacity
              onPress={() => router.replace("/(auth)/register" as any)}
            >
              <Text style={s.switchLink}>Register</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { paddingHorizontal: 24 },

  back: { marginBottom: 24 },
  backText: { color: "rgba(255,255,255,0.60)", fontSize: 14 },

  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 32,
  },
  logoIcon: { width: 28, height: 28, borderRadius: 6, backgroundColor: C.blue },
  logoText: { color: C.white, fontWeight: "700", fontSize: 16 },

  heading: { color: C.white, fontSize: 30, fontWeight: "800", marginBottom: 8 },
  sub: {
    color: "rgba(255,255,255,0.60)",
    fontSize: 14,
    marginBottom: 32,
    lineHeight: 22,
  },

  form: { gap: 4 },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: C.white,
    fontSize: 15,
  },

  error: { color: C.error, fontSize: 13, marginBottom: 8, textAlign: "center" },

  btnPrimary: {
    backgroundColor: C.blue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  btnPrimaryText: { color: C.white, fontWeight: "700", fontSize: 16 },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  dividerText: { color: "rgba(255,255,255,0.35)", fontSize: 13 },

  btnOutline: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 24,
  },
  btnOutlineText: { color: C.white, fontWeight: "600", fontSize: 15 },

  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  switchText: { color: "rgba(255,255,255,0.55)", fontSize: 14 },
  switchLink: { color: C.blue, fontSize: 14, fontWeight: "700" },
});
