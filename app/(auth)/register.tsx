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

import { MultiSelect } from "@/components/MultiSelect";
import { API_URL } from "@/constants/api";
import * as Storage from "@/utils/storage";

// ── Data ──────────────────────────────────────────────────────────────────────

const COMMON_CONDITIONS = [
  "Hypertension (High Blood Pressure)",
  "Type 2 Diabetes",
  "Type 1 Diabetes",
  "Tuberculosis (TB)",
  "Asthma",
  "Coronary Heart Disease",
  "Heart Failure",
  "Hypothyroidism",
  "Hyperthyroidism",
  "Osteoarthritis",
  "Rheumatoid Arthritis",
  "Chronic Kidney Disease",
  "COPD",
  "Migraine",
  "Epilepsy / Seizure Disorder",
  "Anxiety Disorder",
  "Depression",
  "Bipolar Disorder",
  "GERD / Acid Reflux",
  "Iron-Deficiency Anemia",
  "Sickle Cell Disease",
  "Obesity",
  "Stroke (history of)",
  "Hepatitis B",
  "Hepatitis C",
  "HIV / AIDS",
  "PCOS (Polycystic Ovary Syndrome)",
  "Osteoporosis",
  "Glaucoma",
  "Psoriasis",
  "Eczema / Atopic Dermatitis",
  "Celiac Disease",
  "Irritable Bowel Syndrome (IBS)",
  "Crohn's Disease",
  "Lupus (SLE)",
  "Multiple Sclerosis",
  "Parkinson's Disease",
  "Alzheimer's / Dementia",
  "Cancer (any type)",
  "Thalassemia",
];

const COMMON_ALLERGIES = [
  "Penicillin",
  "Amoxicillin / Ampicillin",
  "Sulfa Drugs (Sulfonamides)",
  "Aspirin",
  "Ibuprofen / NSAIDs",
  "Codeine / Opioids",
  "Iodine (contrast dye)",
  "Local Anaesthetics (Lidocaine etc.)",
  "Metronidazole",
  "Cephalosporins",
  "Peanuts",
  "Tree Nuts (Almonds, Cashews, etc.)",
  "Shellfish",
  "Fish",
  "Milk / Dairy",
  "Eggs",
  "Wheat / Gluten",
  "Soy",
  "Sesame",
  "Pollen (Hay Fever)",
  "Dust Mites",
  "Pet Dander (Cats / Dogs)",
  "Mould / Fungal Spores",
  "Bee Stings / Insect Venom",
  "Latex",
  "Nickel (contact allergy)",
  "Fragrance / Perfume",
  "Chlorhexidine",
];

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  blue: "#2563EB",
  white: "#FFFFFF",
  inputBg: "rgba(255,255,255,0.07)",
  inputBorder: "rgba(255,255,255,0.15)",
  error: "#F87171",
};

const GENDER_OPTIONS = ["Male", "Female", "Other"];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Basic info
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");

  // Medical history
  const [medInput, setMedInput] = useState("");
  const [medications, setMedications] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);

  // Security
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Medications chip input ─────────────────────────────────────────────────
  function addMedication() {
    const trimmed = medInput.trim();
    if (!trimmed || medications.includes(trimmed)) {
      setMedInput("");
      return;
    }
    setMedications((prev) => [...prev, trimmed]);
    setMedInput("");
  }
  function removeMedication(item: string) {
    setMedications((prev) => prev.filter((m) => m !== item));
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validate() {
    if (!name.trim()) return "Full name is required.";
    if (!email.trim()) return "Email is required.";
    if (!dob.trim()) return "Date of birth is required.";
    if (!gender) return "Please select a gender.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirmPassword) return "Passwords do not match.";
    return "";
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleRegister() {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          dob,
          gender,
          phone: phone || undefined,
          current_medications: medications,
          medical_conditions: conditions,
          allergies,
        }),
      });
      console.log("STATUS:", res.status);
      console.log("OK:", res.ok);

      const data = await res.json();
      console.log("RESPONSE:", data);

      if (!res.ok) {
        setError(data.error || "Registration failed. Please try again.");
        return;
      }

      await Storage.setItemAsync("token", data.token);
      await Storage.setItemAsync("role", data.user.role);
      await Storage.setItemAsync(
        "patient_id",
        data.user.patient_id?.toString() ?? "",
      );

      router.replace("/(patient)/profile" as any);
    } catch (e: any) {
      setError(e?.message ?? "Registration error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
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
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 },
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

          <Text style={s.heading}>Create Account</Text>
          <Text style={s.sub}>Start your AI-powered health journey today.</Text>

          {/* ── Personal info ──────────────────────────────────────── */}
          <SectionTitle>Personal Information</SectionTitle>

          <Field
            label="Full Name *"
            value={name}
            onChangeText={setName}
            placeholder="John Doe"
          />
          <Field
            label="Email *"
            value={email}
            onChangeText={setEmail}
            placeholder="john@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Date of Birth *"
            value={dob}
            onChangeText={setDob}
            placeholder="DD/MM/YYYY"
            keyboardType="numeric"
          />
          <Field
            label="Phone (optional)"
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 234 567 8900"
            keyboardType="phone-pad"
          />

          {/* Gender */}
          <Text style={s.fieldLabel}>Gender *</Text>
          <View style={s.genderRow}>
            {GENDER_OPTIONS.map((g) => (
              <TouchableOpacity
                key={g}
                style={[s.genderBtn, gender === g && s.genderBtnActive]}
                onPress={() => setGender(g)}
                activeOpacity={0.8}
              >
                <Text
                  style={[s.genderText, gender === g && s.genderTextActive]}
                >
                  {g}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Medical history ────────────────────────────────────── */}
          <SectionTitle>Medical History</SectionTitle>

          {/* Current medications — chips appear inside the box */}
          <Text style={s.fieldLabel}>Current Medications</Text>
          <View style={s.medBox}>
            {medications.length > 0 && (
              <View style={s.chips}>
                {medications.map((m) => (
                  <View key={m} style={s.chip}>
                    <Text style={s.chipText}>{m}</Text>
                    <TouchableOpacity
                      onPress={() => removeMedication(m)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={s.chipX}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <View style={s.medRow}>
              <TextInput
                style={s.medInput}
                value={medInput}
                onChangeText={setMedInput}
                placeholder="e.g. Metformin 500mg"
                placeholderTextColor="rgba(255,255,255,0.30)"
                onSubmitEditing={addMedication}
                returnKeyType="done"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={s.medAdd}
                onPress={addMedication}
                activeOpacity={0.8}
              >
                <Text style={s.medAddText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Known conditions */}
          <MultiSelect
            label="Known Medical Conditions"
            options={COMMON_CONDITIONS}
            selected={conditions}
            onChange={setConditions}
            placeholder="Select conditions…"
          />

          {/* Known allergies */}
          <MultiSelect
            label="Known Allergies"
            options={COMMON_ALLERGIES}
            selected={allergies}
            onChange={setAllergies}
            placeholder="Select allergies…"
          />

          {/* ── Security ───────────────────────────────────────────── */}
          <SectionTitle>Security</SectionTitle>

          <Field
            label="Password *"
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 6 characters"
            secureTextEntry
          />
          <Field
            label="Confirm Password *"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repeat password"
            secureTextEntry
          />

          {error ? <Text style={s.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[s.btnPrimary, loading && s.btnDisabled]}
            onPress={handleRegister}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnPrimaryText}>Create Account</Text>
            )}
          </TouchableOpacity>

          {/* Switch to login */}
          <View style={s.switchRow}>
            <Text style={s.switchText}>Already have an account? </Text>
            <TouchableOpacity
              onPress={() => router.replace("/(auth)/login" as any)}
            >
              <Text style={s.switchLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: string }) {
  return (
    <View style={s.sectionRow}>
      <View style={s.sectionLine} />
      <Text style={s.sectionTitle}>{children}</Text>
      <View style={s.sectionLine} />
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  autoCapitalize?: any;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.30)"
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? "words"}
        secureTextEntry={secureTextEntry}
        autoCorrect={false}
      />
    </View>
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
    marginBottom: 24,
  },
  logoIcon: { width: 28, height: 28, borderRadius: 6, backgroundColor: C.blue },
  logoText: { color: C.white, fontWeight: "700", fontSize: 16 },

  heading: { color: C.white, fontSize: 30, fontWeight: "800", marginBottom: 6 },
  sub: {
    color: "rgba(255,255,255,0.60)",
    fontSize: 14,
    marginBottom: 28,
    lineHeight: 22,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
    marginTop: 8,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  sectionTitle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

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

  genderRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  genderBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
  },
  genderBtnActive: { backgroundColor: C.blue, borderColor: C.blue },
  genderText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    fontWeight: "600",
  },
  genderTextActive: { color: C.white },

  medBox: {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    marginBottom: 16,
  },
  medRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  medInput: { flex: 1, color: C.white, fontSize: 15, paddingVertical: 10 },
  medAdd: {
    backgroundColor: C.blue,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  medAddText: { color: C.white, fontWeight: "700", fontSize: 13 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1D4ED8",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    gap: 5,
  },
  chipText: { color: C.white, fontSize: 12, fontWeight: "600" },
  chipX: { color: "rgba(255,255,255,0.80)", fontSize: 15, lineHeight: 17 },

  error: { color: C.error, fontSize: 13, marginBottom: 8, textAlign: "center" },

  btnPrimary: {
    backgroundColor: C.blue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: { color: C.white, fontWeight: "700", fontSize: 16 },

  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },
  switchText: { color: "rgba(255,255,255,0.55)", fontSize: 14 },
  switchLink: { color: C.blue, fontSize: 14, fontWeight: "700" },
});
