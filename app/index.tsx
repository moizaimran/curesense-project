import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as AuthSession from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";

WebBrowser.maybeCompleteAuthSession();
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

import { signInWithEmailAndPassword } from "firebase/auth";
import { API_URL } from "@/constants/api";
import * as Storage from "@/utils/storage";
import { firebaseAuth } from "@/utils/firebaseClient";

const C = {
  bg:          "#050816",
  bg2:         "#08112A",
  blue:        "#3B82F6",
  violet:      "#8B5CF6",
  cyan:        "#38BDF8",
  white:       "#FFFFFF",
  text:        "#EAF1FF",
  muted:       "rgba(234,241,255,0.60)",
  soft:        "rgba(234,241,255,0.38)",
  inputBg:     "rgba(255,255,255,0.055)",
  inputBorder: "rgba(255,255,255,0.11)",
  error:       "#F87171",
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [gLoading, setGLoading]   = useState(false);
  const [showPass, setShowPass]   = useState(false);

  const [request, response, promptAsync] = AuthSession.useAuthRequest({
    iosClientId: "404929302395-ul8nq13macaht9u6bp8egheh0vb50ftg.apps.googleusercontent.com",
    webClientId: "404929302395-sgjs2bp6dct6md3v70dnotlklmg3urrt.apps.googleusercontent.com",
  });

  useEffect(() => {
    if (response?.type === "success") {
      const idToken = response.authentication?.idToken;
      if (idToken) handleGoogleToken(idToken);
    }
  }, [response]);

  async function handleGoogleToken(idToken: string) {
    setGLoading(true);
    setError("");
    try {
      const res  = await fetch(`${API_URL}/api/auth/google`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id_token: idToken }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Google sign-in failed."); return; }

      await Storage.setItemAsync("role",       data.user.role);
      await Storage.setItemAsync("patient_id", data.user.patient_id?.toString() ?? "");

      if (!data.user.profile_complete) {
        router.replace("/(auth)/complete-profile" as any);
      } else {
        router.replace("/(patient)/profile" as any);
      }
    } catch {
      setError("Could not connect to the server. Please try again.");
    } finally {
      setGLoading(false);
    }
  }

  async function handleLogin() {
    if (!email.trim())    { setError("Email is required.");    return; }
    if (!password.trim()) { setError("Password is required."); return; }
    setError("");
    setLoading(true);
    try {
      // Sign in with Firebase — gets a fresh ID token automatically
      const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const idToken    = await credential.user.getIdToken();

      // Fetch role and patient_id from our backend using the Firebase token
      const res  = await fetch(`${API_URL}/api/auth/me`, {
        headers: { "Authorization": `Bearer ${idToken}` },
      });
      const data = await res.json();

      if (res.status === 403 && data.error?.toLowerCase().includes("verified")) {
        // Email not yet verified — navigate to the verify screen
        router.push({ pathname: "/(auth)/verify-email" as any, params: { email: email.trim() } });
        return;
      }
      if (!res.ok) { setError(data.error ?? "Login failed."); return; }

      await Storage.setItemAsync("role",       data.role);
      await Storage.setItemAsync("patient_id", data.patient_id?.toString() ?? "");

      router.replace("/(patient)/profile" as any);
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/user-disabled") {
        setError("Your account is pending admin approval. You will be notified when approved.");
      } else if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setError("Invalid email or password.");
      } else {
        setError("Could not connect to the server. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={[C.bg, C.bg2, "#101B45"]} style={s.root}>
      <StatusBar style="light" />

      {/* Background glows */}
      <View pointerEvents="none" style={s.glowTop}    />
      <View pointerEvents="none" style={s.glowBottom} />

      <KeyboardAvoidingView
        style={s.root}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            s.container,
            { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 36 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Logo ── */}
          <View style={s.logoWrap}>
            <LinearGradient
              colors={[C.blue, C.violet]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.logoIcon}
            >
              <Ionicons name="pulse" size={26} color={C.white} />
            </LinearGradient>
            <Text style={s.logoText}>CureSense</Text>
            <Text style={s.logoTagline}>AI-powered healthcare, built for you</Text>
          </View>

          {/* ── Card ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Sign in</Text>
            <Text style={s.cardSub}>Enter your details to continue</Text>

            {/* Email */}
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Email address</Text>
              <View style={s.inputRow}>
                <Ionicons name="mail-outline" size={17} color={C.soft} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(255,255,255,0.27)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Password */}
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Password</Text>
              <View style={s.inputRow}>
                <Ionicons name="lock-closed-outline" size={17} color={C.soft} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor="rgba(255,255,255,0.27)"
                  secureTextEntry={!showPass}
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setShowPass((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={showPass ? "eye-off-outline" : "eye-outline"}
                    size={17}
                    color={C.soft}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot password */}
            <TouchableOpacity
              style={s.forgotWrap}
              activeOpacity={0.7}
              onPress={() => router.push("/(auth)/forgot-password" as any)}
            >
              <Text style={s.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Error */}
            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={C.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {/* Sign In */}
            <TouchableOpacity
              style={[s.primaryWrap, loading && s.disabled]}
              onPress={handleLogin}
              activeOpacity={0.86}
              disabled={loading}
            >
              <LinearGradient
                colors={[C.blue, C.violet]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.primaryBtn}
              >
                {loading ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <>
                    <Text style={s.primaryBtnText}>Sign In</Text>
                    <View style={s.arrowCircle}>
                      <Ionicons name="arrow-forward" size={14} color={C.bg} />
                    </View>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerLabel}>or</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Google */}
            <TouchableOpacity
              style={[s.googleBtn, gLoading && s.disabled]}
              activeOpacity={0.82}
              disabled={gLoading || !request}
              onPress={() => promptAsync()}
            >
              {gLoading ? (
                <ActivityIndicator color="#EAF1FF" />
              ) : (
                <>
                  <View style={s.googleIconWrap}>
                    <Text style={s.googleG}>G</Text>
                  </View>
                  <Text style={s.googleBtnText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Register ── */}
          <View style={s.registerRow}>
            <Text style={s.registerText}>Don't have an account?</Text>
            <TouchableOpacity
              onPress={() => router.push("/(auth)/register" as any)}
              activeOpacity={0.75}
            >
              <Text style={s.registerLink}> Create one</Text>
            </TouchableOpacity>
          </View>

          {/* ── Explore ── */}
          <TouchableOpacity
            style={s.exploreBtn}
            onPress={() => router.push("/explore" as any)}
            activeOpacity={0.75}
          >
            <Ionicons name="compass-outline" size={15} color="rgba(234,241,255,0.45)" />
            <Text style={s.exploreBtnText}>Explore CureSense</Text>
            <Ionicons name="chevron-forward" size={13} color="rgba(234,241,255,0.25)" />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  glowTop: {
    position: "absolute",
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: "rgba(59,130,246,0.11)",
    top: -60, left: -120,
  },
  glowBottom: {
    position: "absolute",
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: "rgba(139,92,246,0.10)",
    bottom: 60, right: -120,
  },

  container: {
    flexGrow: 1,
    paddingHorizontal: 22,
    justifyContent: "center",
  },

  // ── Logo ──────────────────────────────────────────────────────────────────
  logoWrap: {
    alignItems: "center",
    marginBottom: 36,
  },
  logoIcon: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#3B82F6",
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  logoText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  logoTagline: {
    color: "rgba(234,241,255,0.42)",
    fontSize: 12,
    marginTop: 5,
    letterSpacing: 0.1,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: "rgba(8,17,42,0.82)",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 22,
    shadowColor: "#3B82F6",
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
  },
  cardTitle: {
    color: "#EAF1FF",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  cardSub: {
    color: "rgba(234,241,255,0.45)",
    fontSize: 12.5,
    marginBottom: 22,
  },

  // ── Fields ────────────────────────────────────────────────────────────────
  fieldWrap:  { marginBottom: 14 },
  fieldLabel: {
    color: "rgba(234,241,255,0.68)",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 7,
    marginLeft: 2,
  },
  inputRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    borderRadius: 14,
    paddingHorizontal: 13,
  },
  inputIcon: { marginRight: 9 },
  input: {
    flex: 1,
    color: "#EAF1FF",
    fontSize: 14,
    paddingVertical: 12,
    minWidth: 0,
  },

  // ── Forgot ────────────────────────────────────────────────────────────────
  forgotWrap: { alignSelf: "flex-end", marginBottom: 18, marginTop: 2 },
  forgotText: {
    color: "#38BDF8",
    fontSize: 11.5,
    fontWeight: "700",
  },

  // ── Error ─────────────────────────────────────────────────────────────────
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "rgba(248,113,113,0.07)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.18)",
    marginBottom: 12,
  },
  errorText: { flex: 1, color: "#F87171", fontSize: 11.5, lineHeight: 16 },

  // ── Primary button ────────────────────────────────────────────────────────
  primaryWrap: { borderRadius: 15, overflow: "hidden" },
  disabled:    { opacity: 0.6 },
  primaryBtn: {
    minHeight: 54,
    borderRadius: 15,
    paddingHorizontal: 17,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  arrowCircle: {
    width: 27, height: 27, borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 18,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  dividerLabel: { color: "rgba(234,241,255,0.35)", fontSize: 11, fontWeight: "700" },

  // ── Google ────────────────────────────────────────────────────────────────
  googleBtn: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  googleIconWrap: {
    width: 26, height: 26, borderRadius: 6,
    backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
  },
  googleG: {
    fontSize: 14,
    fontWeight: "900",
    color: "#4285F4",
    lineHeight: 18,
  },
  googleBtnText: {
    color: "#EAF1FF",
    fontSize: 13.5,
    fontWeight: "700",
  },

  // ── Register row ──────────────────────────────────────────────────────────
  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  registerText: { color: "rgba(234,241,255,0.45)", fontSize: 13 },
  registerLink: { color: "#38BDF8", fontSize: 13, fontWeight: "800" },

  // ── Explore button ────────────────────────────────────────────────────────
  exploreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.025)",
  },
  exploreBtnText: {
    color: "rgba(234,241,255,0.48)",
    fontSize: 12.5,
    fontWeight: "700",
  },
});
