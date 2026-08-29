import { Ionicons } from "@expo/vector-icons";
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
  bg: "#050816",
  bg2: "#08112A",
  blue: "#3B82F6",
  blueDark: "#2563EB",
  cyan: "#38BDF8",
  violet: "#8B5CF6",
  green: "#34D399",
  white: "#FFFFFF",
  text: "#EAF1FF",
  muted: "rgba(234,241,255,0.60)",
  soft: "rgba(234,241,255,0.38)",
  inputBg: "rgba(255,255,255,0.055)",
  inputBorder: "rgba(255,255,255,0.11)",
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
      colors={[C.bg, C.bg2, "#101B45"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.root}
    >
      <StatusBar style="light" />

      {/* Decorative background glow */}
      <View pointerEvents="none" style={s.glowOne} />
      <View pointerEvents="none" style={s.glowTwo} />

      <KeyboardAvoidingView
        style={s.root}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            s.container,
            {
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 35,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={s.headerRow}>
            <TouchableOpacity
              style={s.backButton}
              onPress={() => router.back()}
              activeOpacity={0.75}
            >
              <Ionicons name="arrow-back" size={18} color={C.text} />
            </TouchableOpacity>

            <View style={s.logoRow}>
              <LinearGradient
                colors={[C.blue, C.violet]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.logoIcon}
              >
                <Ionicons name="pulse" size={18} color={C.white} />
              </LinearGradient>

              <Text style={s.logoText}>CureSense</Text>
            </View>

            <View style={{ width: 42 }} />
          </View>

          {/* Intro */}
          <View style={s.intro}>
            <View style={s.aiBadge}>
              <Ionicons name="sparkles" size={12} color={C.white} />
              <Text style={s.aiBadgeText}>SMART HEALTHCARE</Text>
            </View>

            <Text style={s.heading}>Welcome Back</Text>

            <Text style={s.sub}>
              Sign in to continue to your personalized health dashboard.
            </Text>
          </View>

          {/* Login Card */}
          <View style={s.formCard}>
            <View style={s.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Sign in to your account</Text>
                <Text style={s.cardSubtitle}>
                  Enter your details to continue
                </Text>
              </View>

              <View style={s.secureIcon}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color={C.cyan}
                />
              </View>
            </View>

            {/* Email */}
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>EMAIL ADDRESS</Text>

              <View style={s.inputContainer}>
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={C.soft}
                  style={s.inputIcon}
                />

                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="john@example.com"
                  placeholderTextColor="rgba(255,255,255,0.27)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Password */}
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>PASSWORD</Text>

              <View style={s.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={C.soft}
                  style={s.inputIcon}
                />

                <TextInput
                  style={s.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor="rgba(255,255,255,0.27)"
                  secureTextEntry
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Error */}
            {error ? (
              <View style={s.errorBox}>
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={C.error}
                />

                <Text style={s.error}>{error}</Text>
              </View>
            ) : null}

            {/* Sign In Button */}
            <TouchableOpacity
              style={[s.primaryButtonWrap, loading && s.btnDisabled]}
              onPress={handleLogin}
              activeOpacity={0.86}
              disabled={loading}
            >
              <LinearGradient
                colors={[C.blue, C.violet]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.btnPrimary}
              >
                {loading ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <>
                    <Text style={s.btnPrimaryText}>Sign In</Text>

                    <View style={s.arrowCircle}>
                      <Ionicons name="arrow-forward" size={14} color={C.bg} />
                    </View>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Security */}
            <View style={s.securityRow}>
              <Ionicons name="lock-closed-outline" size={12} color={C.soft} />

              <Text style={s.securityText}>
                Your information is securely protected
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={s.divider}>
            <View style={s.dividerLine} />

            <View style={s.orCircle}>
              <Text style={s.orText}>OR</Text>
            </View>

            <View style={s.dividerLine} />
          </View>

          {/* Register */}
          <TouchableOpacity
            style={s.btnOutline}
            onPress={() => router.replace("/(auth)/register" as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add-outline" size={18} color={C.cyan} />

            <Text style={s.btnOutlineText}>Create a New Account</Text>

            <Ionicons name="arrow-forward" size={16} color={C.soft} />
          </TouchableOpacity>

          {/* Bottom switch */}
          <View style={s.switchRow}>
            <Text style={s.switchText}>Don't have an account? </Text>

            <TouchableOpacity
              onPress={() => router.replace("/(auth)/register" as any)}
            >
              <Text style={s.switchLink}>Register</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <Text style={s.footer}>
            AI-powered healthcare insights, designed around you.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles — FRONTEND ONLY
// ─────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
  },

  container: {
    flexGrow: 1,
    paddingHorizontal: 18,
  },

  // Background decorations
  glowOne: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(59,130,246,0.10)",
    top: 100,
    left: -150,
  },

  glowTwo: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(139,92,246,0.10)",
    bottom: 80,
    right: -145,
  },

  // Header
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 30,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },

  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  logoIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  logoText: {
    color: C.white,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.5,
  },

  // Intro
  intro: {
    alignItems: "center",
    marginBottom: 27,
  },

  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 30,
    backgroundColor: "rgba(56,189,248,0.08)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.22)",
    marginBottom: 15,
  },

  aiBadgeText: {
    color: "#BFEAFF",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
  },

  heading: {
    color: C.white,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -0.9,
    textAlign: "center",
  },

  sub: {
    color: C.muted,
    fontSize: 13.5,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 330,
  },

  // Card
  formCard: {
    padding: 19,
    borderRadius: 25,
    backgroundColor: "rgba(8,17,42,0.80)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",

    shadowColor: C.blue,
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: {
      width: 0,
      height: 15,
    },
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 18,
    marginBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },

  cardTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "800",
  },

  cardSubtitle: {
    color: C.soft,
    fontSize: 10.5,
    marginTop: 4,
  },

  secureIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56,189,248,0.08)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.15)",
  },

  // Fields
  fieldWrap: {
    marginBottom: 17,
  },

  fieldLabel: {
    color: "rgba(234,241,255,0.68)",
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.7,
    marginBottom: 8,
    marginLeft: 2,
  },

  inputContainer: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
  },

  inputIcon: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    color: C.white,
    fontSize: 14,
    paddingVertical: 12,
    minWidth: 0,
  },

  // Error
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "rgba(248,113,113,0.07)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.18)",
    marginBottom: 10,
  },

  error: {
    flex: 1,
    color: C.error,
    fontSize: 11.5,
    lineHeight: 16,
  },

  // Main button
  primaryButtonWrap: {
    marginTop: 4,
    borderRadius: 15,
    overflow: "hidden",
  },

  btnPrimary: {
    minHeight: 55,
    borderRadius: 15,
    paddingHorizontal: 17,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },

  btnDisabled: {
    opacity: 0.6,
  },

  btnPrimaryText: {
    color: C.white,
    fontSize: 14.5,
    fontWeight: "900",
  },

  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
  },

  // Security
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 13,
  },

  securityText: {
    color: C.soft,
    fontSize: 9.5,
  },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 23,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  orCircle: {
    width: 31,
    height: 31,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  orText: {
    color: C.soft,
    fontSize: 8.5,
    fontWeight: "800",
  },

  // Register button
  btnOutline: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.20)",
    backgroundColor: "rgba(56,189,248,0.045)",
  },

  btnOutlineText: {
    color: C.text,
    fontWeight: "700",
    fontSize: 13.5,
    flex: 1,
  },

  // Bottom
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22,
  },

  switchText: {
    color: C.soft,
    fontSize: 12.5,
  },

  switchLink: {
    color: C.cyan,
    fontSize: 12.5,
    fontWeight: "800",
  },

  footer: {
    color: "rgba(234,241,255,0.22)",
    fontSize: 9,
    lineHeight: 14,
    textAlign: "center",
    marginTop: 17,
    paddingHorizontal: 20,
  },
});
