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

const C = {
  bg:     "#050816",
  bg2:    "#08112A",
  blue:   "#3B82F6",
  violet: "#8B5CF6",
  cyan:   "#38BDF8",
  white:  "#FFFFFF",
  text:   "#EAF1FF",
  soft:   "rgba(234,241,255,0.38)",
  error:  "#F87171",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit() {
    const trimmed = email.trim();
    if (!trimmed)               { setError("Email is required.");               return; }
    if (!EMAIL_RE.test(trimmed)) { setError("Enter a valid email address."); return; }

    setError("");
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }

      // Always show confirmation — server hides whether account exists (anti-enumeration)
      // Firebase sends the reset link directly to the user's email; no OTP screen needed.
      router.replace({ pathname: "/(auth)/forgot-password-sent" as any, params: { email: trimmed } });
    } catch {
      setError("Could not connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={[C.bg, C.bg2, "#101B45"]} style={s.root}>
      <StatusBar style="light" />
      <View pointerEvents="none" style={s.glow} />

      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[s.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 36 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={18} color={C.text} />
          </TouchableOpacity>

          <View style={s.iconWrap}>
            <LinearGradient colors={[C.blue, C.violet]} style={s.iconGrad}>
              <Ionicons name="key-outline" size={30} color={C.white} />
            </LinearGradient>
          </View>

          <Text style={s.heading}>Forgot password?</Text>
          <Text style={s.sub}>
            Enter your account email and we'll send a reset code if the account exists.
          </Text>

          <View style={s.card}>
            <Text style={s.fieldLabel}>Email address</Text>
            <View style={s.inputRow}>
              <Ionicons name="mail-outline" size={17} color={C.soft} style={s.inputIcon} />
              <TextInput
                style={s.input}
                value={email}
                onChangeText={(v) => { setEmail(v); setError(""); }}
                placeholder="you@example.com"
                placeholderTextColor="rgba(255,255,255,0.27)"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color={C.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.primaryWrap, loading && s.disabled]}
              onPress={handleSubmit}
              activeOpacity={0.86}
              disabled={loading}
            >
              <LinearGradient colors={[C.blue, C.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.primaryBtn}>
                {loading ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <>
                    <Text style={s.primaryBtnText}>Send Reset Code</Text>
                    <View style={s.arrowCircle}>
                      <Ionicons name="arrow-forward" size={14} color={C.bg} />
                    </View>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={s.backRow}>
            <Text style={s.backLabel}>Remembered it? </Text>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.75}>
              <Text style={s.backLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  glow: {
    position: "absolute",
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: "rgba(139,92,246,0.10)",
    top: -60, right: -100,
  },

  container: {
    flexGrow: 1, paddingHorizontal: 24, alignItems: "center",
  },

  backBtn: {
    alignSelf: "flex-start",
    width: 42, height: 42, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
    marginBottom: 32,
  },

  iconWrap: { marginBottom: 20 },
  iconGrad: {
    width: 72, height: 72, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#8B5CF6", shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
  },

  heading: {
    color: "#EAF1FF",
    fontSize: 26, fontWeight: "900", letterSpacing: -0.6,
    textAlign: "center", marginBottom: 10,
  },
  sub: {
    color: "rgba(234,241,255,0.55)",
    fontSize: 13.5, lineHeight: 21, textAlign: "center",
    marginBottom: 30,
  },

  card: {
    width: "100%",
    backgroundColor: "rgba(8,17,42,0.82)",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 20,
  },

  fieldLabel: {
    color: "rgba(234,241,255,0.68)",
    fontSize: 11, fontWeight: "700",
    marginBottom: 7, marginLeft: 2,
  },
  inputRow: {
    minHeight: 50, flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.11)",
    borderRadius: 14, paddingHorizontal: 13,
    marginBottom: 16,
  },
  inputIcon: { marginRight: 9 },
  input: {
    flex: 1, color: "#EAF1FF",
    fontSize: 14, paddingVertical: 12, minWidth: 0,
  },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 7,
    padding: 11, borderRadius: 12,
    backgroundColor: "rgba(248,113,113,0.07)",
    borderWidth: 1, borderColor: "rgba(248,113,113,0.18)",
    marginBottom: 14,
  },
  errorText: { flex: 1, color: "#F87171", fontSize: 11.5, lineHeight: 16 },

  primaryWrap: { borderRadius: 15, overflow: "hidden" },
  disabled:    { opacity: 0.6 },
  primaryBtn: {
    minHeight: 54, borderRadius: 15,
    paddingHorizontal: 17,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 10,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  arrowCircle: {
    width: 27, height: 27, borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
  },

  backRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  backLabel: { color: "rgba(234,241,255,0.45)", fontSize: 12.5 },
  backLink:  { color: "#38BDF8", fontSize: 12.5, fontWeight: "800" },
});
