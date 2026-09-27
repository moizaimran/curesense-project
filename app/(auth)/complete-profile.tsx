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

const GENDER_OPTIONS = ["Male", "Female", "Other"];

export default function CompleteProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [dob, setDob]       = useState("");
  const [gender, setGender] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  async function handleSave() {
    if (!dob.trim()) { setError("Date of birth is required."); return; }
    if (!gender)     { setError("Please select a gender.");    return; }

    setError("");
    setLoading(true);
    try {
      const token      = await Storage.getAuthToken();
      const patient_id = await Storage.getItemAsync("patient_id");

      const res  = await fetch(`${API_URL}/api/patients/${patient_id}`, {
        method:  "PATCH",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify({ dob, gender, profile_complete: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Could not save profile. Please try again.");
        return;
      }

      router.replace("/(patient)/profile" as any);
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
          contentContainerStyle={[s.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 36 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.iconWrap}>
            <LinearGradient colors={[C.blue, C.violet]} style={s.iconGrad}>
              <Ionicons name="person-outline" size={30} color={C.white} />
            </LinearGradient>
          </View>

          <Text style={s.heading}>Almost done!</Text>
          <Text style={s.sub}>
            Just a couple more details to personalise your CureSense experience.
          </Text>

          <View style={s.card}>
            {/* DOB */}
            <Text style={s.fieldLabel}>Date of Birth *</Text>
            <View style={s.inputRow}>
              <Ionicons name="calendar-outline" size={17} color={C.soft} style={s.inputIcon} />
              <TextInput
                style={s.input}
                value={dob}
                onChangeText={(v) => { setDob(v); setError(""); }}
                placeholder="DD/MM/YYYY"
                placeholderTextColor="rgba(255,255,255,0.27)"
                keyboardType="numeric"
              />
            </View>

            {/* Gender */}
            <Text style={s.fieldLabel}>Gender *</Text>
            <View style={s.genderRow}>
              {GENDER_OPTIONS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[s.genderBtn, gender === g && s.genderBtnActive]}
                  onPress={() => { setGender(g); setError(""); }}
                  activeOpacity={0.8}
                >
                  {gender === g && <Ionicons name="checkmark-circle" size={15} color={C.white} />}
                  <Text style={[s.genderText, gender === g && s.genderTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color={C.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.primaryWrap, loading && s.disabled]}
              onPress={handleSave}
              activeOpacity={0.86}
              disabled={loading}
            >
              <LinearGradient colors={[C.blue, C.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.primaryBtn}>
                {loading ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <>
                    <Text style={s.primaryBtnText}>Complete Profile</Text>
                    <View style={s.arrowCircle}>
                      <Ionicons name="checkmark" size={14} color={C.bg} />
                    </View>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={s.skip} onPress={() => router.replace("/(patient)/profile" as any)}>
              Skip for now
            </Text>
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
    backgroundColor: "rgba(59,130,246,0.10)",
    top: -60, left: -100,
  },

  container: { flexGrow: 1, paddingHorizontal: 24, alignItems: "center" },

  iconWrap: { marginBottom: 20 },
  iconGrad: {
    width: 72, height: 72, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#3B82F6", shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
  },

  heading: {
    color: "#EAF1FF", fontSize: 26, fontWeight: "900", letterSpacing: -0.6,
    textAlign: "center", marginBottom: 10,
  },
  sub: {
    color: "rgba(234,241,255,0.55)", fontSize: 13.5, lineHeight: 21,
    textAlign: "center", marginBottom: 30,
  },

  card: {
    width: "100%",
    backgroundColor: "rgba(8,17,42,0.82)",
    borderRadius: 22, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)", padding: 20,
  },

  fieldLabel: {
    color: "rgba(234,241,255,0.68)", fontSize: 11, fontWeight: "700",
    marginBottom: 7, marginLeft: 2,
  },
  inputRow: {
    minHeight: 50, flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.11)",
    borderRadius: 14, paddingHorizontal: 13, marginBottom: 18,
  },
  inputIcon: { marginRight: 9 },
  input: { flex: 1, color: "#EAF1FF", fontSize: 14, paddingVertical: 12, minWidth: 0 },

  genderRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  genderBtn: {
    flex: 1, minHeight: 46, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 5,
    paddingVertical: 11, borderRadius: 13, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  genderBtnActive: {
    backgroundColor: "rgba(59,130,246,0.22)",
    borderColor: "rgba(59,130,246,0.75)",
  },
  genderText:       { color: "rgba(234,241,255,0.38)", fontSize: 12.5, fontWeight: "700" },
  genderTextActive: { color: "#FFFFFF" },

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
    minHeight: 54, borderRadius: 15, paddingHorizontal: 17,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  arrowCircle: {
    width: 27, height: 27, borderRadius: 14,
    backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center",
  },

  skip: {
    color: "rgba(234,241,255,0.35)", fontSize: 12,
    textAlign: "center", marginTop: 16,
  },
});
