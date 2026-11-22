// =============================================================================
// Patient settings — profile edit, change password, email notifications.
// =============================================================================
import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_URL } from "@/constants/api";
import { firebaseAuth } from "@/utils/firebaseClient";
import { passwordProblem, phoneProblem } from "@/utils/settingsRules";

type Prefs = { appointment_updates: boolean; payment_updates: boolean; messages: boolean };

const NOTIFICATION_OPTIONS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: "appointment_updates", label: "Appointment updates", hint: "When your appointment is confirmed or not approved" },
  { key: "payment_updates", label: "Payment updates", hint: "Receipts, payment checks and refunds" },
  { key: "messages", label: "Doctor messages", hint: "When your doctor replies to you" },
];

const FIREBASE_ERRORS: Record<string, string> = {
  "auth/wrong-password": "Your current password is incorrect.",
  "auth/invalid-credential": "Your current password is incorrect.",
  "auth/invalid-login-credentials": "Your current password is incorrect.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/requires-recent-login": "Please sign out and sign in again, then change your password.",
  "auth/network-request-failed": "Network error — check your connection and try again.",
};

async function authed(path: string, init: RequestInit = {}) {
  const token = await Storage.getAuthToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  // Profile
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Password
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Notifications
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  const fbUser = firebaseAuth.currentUser;
  const hasPassword = !fbUser || fbUser.providerData.some((p) => p.providerId === "password");

  useEffect(() => {
    (async () => {
      try {
        const pid = await Storage.getItemAsync("patient_id");
        setPatientId(pid);
        const [me, patient, notif] = await Promise.all([
          authed("/api/auth/me"),
          pid ? authed(`/api/patients/${pid}`) : Promise.resolve(null),
          authed("/api/auth/me/notifications"),
        ]);
        setName(me.name ?? "");
        setEmail(me.email ?? "");
        setPhone(patient?.contact?.phone ?? "");
        setPrefs(notif.email);
      } catch (e: any) {
        setLoadError(e.message ?? "Could not load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveProfile() {
    setProfileMsg(null);
    if (!name.trim()) return setProfileMsg({ ok: false, text: "Please enter your name." });
    const phoneErr = phoneProblem(phone);
    if (phoneErr) return setProfileMsg({ ok: false, text: phoneErr });
    setSavingProfile(true);
    try {
      await authed("/api/auth/me", { method: "PATCH", body: JSON.stringify({ name: name.trim() }) });
      if (patientId) {
        await authed(`/api/patients/${patientId}`, { method: "PATCH", body: JSON.stringify({ phone: phone.trim() }) });
      }
      setProfileMsg({ ok: true, text: "Profile saved." });
    } catch (e: any) {
      setProfileMsg({ ok: false, text: e.message ?? "Could not save profile" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    setPwMsg(null);
    if (!current) return setPwMsg({ ok: false, text: "Enter your current password." });
    const problem = passwordProblem(next);
    if (problem) return setPwMsg({ ok: false, text: problem });
    if (next !== confirm) return setPwMsg({ ok: false, text: "The new passwords don't match." });
    if (next === current) return setPwMsg({ ok: false, text: "Choose a password different from your current one." });
    const user = firebaseAuth.currentUser;
    if (!user?.email) return setPwMsg({ ok: false, text: "Your session has expired. Please sign in again." });

    setSavingPw(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setPwMsg({ ok: true, text: "Password changed." });
    } catch (e: any) {
      setPwMsg({ ok: false, text: FIREBASE_ERRORS[e.code] ?? e.message ?? "Could not change password" });
    } finally {
      setSavingPw(false);
    }
  }

  async function togglePref(key: keyof Prefs, value: boolean) {
    if (!prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, [key]: value });
    try {
      const d = await authed("/api/auth/me/notifications", { method: "PATCH", body: JSON.stringify({ email: { [key]: value } }) });
      setPrefs(d.email);
    } catch {
      setPrefs(before);
    }
  }

  return (
    <LinearGradient colors={["#050816", "#08112A", "#101B45"]} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityLabel="Back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Settings</Text>
        </View>

        <ScrollView contentContainerStyle={[s.container, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          {loading ? (
            <ActivityIndicator color="#3B82F6" style={{ marginTop: 40 }} />
          ) : loadError ? (
            <Text style={s.error}>{loadError}</Text>
          ) : (
            <>
              {/* Profile */}
              <View style={s.card}>
                <Text style={s.cardTitle}>Profile</Text>
                <Field label="Full name">
                  <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Your name"
                    placeholderTextColor="rgba(255,255,255,0.3)" maxLength={100} autoCapitalize="words" />
                </Field>
                <Field label="Phone">
                  <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="03001234567"
                    placeholderTextColor="rgba(255,255,255,0.3)" keyboardType="phone-pad" maxLength={14} />
                </Field>
                <Field label="Email">
                  <TextInput style={[s.input, s.inputDisabled]} value={email} editable={false} />
                </Field>
                {profileMsg && <Text style={profileMsg.ok ? s.ok : s.error}>{profileMsg.text}</Text>}
                <TouchableOpacity style={[s.btn, savingProfile && s.btnBusy]} onPress={saveProfile} disabled={savingProfile}>
                  {savingProfile ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Save profile</Text>}
                </TouchableOpacity>
              </View>

              {/* Password */}
              <View style={s.card}>
                <Text style={s.cardTitle}>Change password</Text>
                {!hasPassword ? (
                  <Text style={s.hint}>
                    You sign in with Google, so there's no CureSense password to change. Manage your password in your Google account.
                  </Text>
                ) : (
                  <>
                    <Field label="Current password">
                      <TextInput style={s.input} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
                    </Field>
                    <Field label="New password">
                      <TextInput style={s.input} value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
                    </Field>
                    <Field label="Confirm new password">
                      <TextInput style={s.input} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" />
                    </Field>
                    <Text style={s.hint}>At least 8 characters, including a letter and a number.</Text>
                    {pwMsg && <Text style={pwMsg.ok ? s.ok : s.error}>{pwMsg.text}</Text>}
                    <TouchableOpacity style={[s.btn, savingPw && s.btnBusy]} onPress={changePassword} disabled={savingPw}>
                      {savingPw ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Update password</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Notifications */}
              <View style={s.card}>
                <Text style={s.cardTitle}>Email notifications</Text>
                <Text style={s.hint}>Security emails (verification, password reset) are always sent.</Text>
                {prefs &&
                  NOTIFICATION_OPTIONS.map((o) => (
                    <View key={o.key} style={s.prefRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.prefLabel}>{o.label}</Text>
                        <Text style={s.hint}>{o.hint}</Text>
                      </View>
                      <Switch
                        value={prefs[o.key]}
                        onValueChange={(v) => togglePref(o.key, v)}
                        accessibilityLabel={o.label}
                        trackColor={{ true: "#2563EB", false: "rgba(255,255,255,0.2)" }}
                        thumbColor="#fff"
                      />
                    </View>
                  ))}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  container: { padding: 16, gap: 14 },
  card: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", gap: 12 },
  cardTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  fieldLabel: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700" },
  input: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.05)", color: "#fff", paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputDisabled: { color: "rgba(255,255,255,0.45)" },
  hint: { color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 17 },
  ok: { color: "#34D399", fontSize: 13 },
  error: { color: "#F87171", fontSize: 13 },
  btn: { backgroundColor: "#2563EB", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  btnBusy: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  prefRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  prefLabel: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
