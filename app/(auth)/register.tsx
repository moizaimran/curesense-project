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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pakistani phone number:
// 03 + 9 more digits = exactly 11 digits
const PHONE_RE = /^03\d{9}$/;

const PHONE_MAX_DIGITS = 11;

type FieldErrors = {
  name?: string;
  email?: string;
  dob?: string;
  gender?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
};

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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // ── Field-level validators ──────────────────────────────────────────────────

  function validateName(v: string) {
    if (!v.trim()) {
      return "Full name is required.";
    }

    return "";
  }

  function validateEmail(v: string) {
    if (!v.trim()) {
      return "Email is required.";
    }

    if (!EMAIL_RE.test(v.trim())) {
      return "Enter a valid email address (e.g. john@example.com).";
    }

    return "";
  }

  function validateDob(v: string) {
    if (!v.trim()) {
      return "Date of birth is required.";
    }

    return "";
  }

  // Strong password:
  // 8+ characters
  // 1 uppercase
  // 1 lowercase
  // 1 number
  // 1 special character
  function validatePassword(v: string) {
    if (!v) {
      return "Password is required.";
    }

    if (v.length < 8) {
      return "Password must be at least 8 characters.";
    }

    if (!/[A-Z]/.test(v)) {
      return "Password must contain at least one uppercase letter.";
    }

    if (!/[a-z]/.test(v)) {
      return "Password must contain at least one lowercase letter.";
    }

    if (!/[0-9]/.test(v)) {
      return "Password must contain at least one number.";
    }

    if (!/[!@#$%^&*(),.?":{}|<>_\-\\[\]/;'`~+=]/.test(v)) {
      return "Password must contain at least one special character.";
    }

    return "";
  }

  function validateConfirmPassword(v: string, pass: string) {
    if (!v) {
      return "Please confirm your password.";
    }

    if (v !== pass) {
      return "Passwords do not match.";
    }

    return "";
  }

  function validatePhone(v: string) {
    // Phone is optional
    if (!v.trim()) {
      return "";
    }

    if (!PHONE_RE.test(v)) {
      return "Phone number must be 11 digits and start with 03.";
    }

    return "";
  }

  // ── On-change handlers with live validation ──────────────────────────────────

  function handleNameChange(v: string) {
    setName(v);

    setFieldErrors((prev) => ({
      ...prev,
      name: validateName(v),
    }));
  }

  function handleEmailChange(v: string) {
    setEmail(v);

    setFieldErrors((prev) => ({
      ...prev,
      email: validateEmail(v),
    }));
  }

  function handleDobChange(v: string) {
    setDob(v);

    setFieldErrors((prev) => ({
      ...prev,
      dob: validateDob(v),
    }));
  }

  function handlePhoneChange(v: string) {
    // Remove anything that is not a number
    const digitsOnly = v.replace(/[^0-9]/g, "");

    // Maximum 11 digits
    const limitedValue = digitsOnly.slice(0, PHONE_MAX_DIGITS);

    setPhone(limitedValue);

    setFieldErrors((prev) => ({
      ...prev,
      phone: validatePhone(limitedValue),
    }));
  }

  function handlePasswordChange(v: string) {
    setPassword(v);

    setFieldErrors((prev) => ({
      ...prev,
      password: validatePassword(v),
      confirmPassword: confirmPassword
        ? validateConfirmPassword(confirmPassword, v)
        : prev.confirmPassword,
    }));
  }

  function handleConfirmPasswordChange(v: string) {
    setConfirmPassword(v);

    setFieldErrors((prev) => ({
      ...prev,
      confirmPassword: validateConfirmPassword(v, password),
    }));
  }

  function handleGenderSelect(g: string) {
    setGender(g);

    setFieldErrors((prev) => ({
      ...prev,
      gender: "",
    }));
  }

  // ── Medications ──────────────────────────────────────────────────────────────

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

  // ── Full validation before submit ────────────────────────────────────────────

  function validateAll(): FieldErrors {
    const errs: FieldErrors = {
      name: validateName(name),
      email: validateEmail(email),
      dob: validateDob(dob),
      gender: gender ? "" : "Please select a gender.",
      phone: validatePhone(phone),
      password: validatePassword(password),
      confirmPassword: validateConfirmPassword(confirmPassword, password),
    };

    return errs;
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function handleRegister() {
    const errs = validateAll();

    setFieldErrors(errs);

    const hasError = Object.values(errs).some((m) => !!m);

    if (hasError) {
      setError("");
      return;
    }

    setError("");
    setLoading(true);

    try {
      // If the user typed a medication but forgot to press "Add",
      // include it automatically during registration.
      const pendingMedication = medInput.trim();

      const finalMedications =
        pendingMedication && !medications.includes(pendingMedication)
          ? [...medications, pendingMedication]
          : medications;

      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
          dob,
          gender,
          phone: phone || undefined,

          // Send all medications, including anything still typed
          // in the medication input box.
          current_medications: finalMedications,

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

  // ── Render ───────────────────────────────────────────────────────────────────

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
            {
              paddingTop: insets.top + 24,
              paddingBottom: insets.bottom + 40,
            },
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

          {/* ── Personal Information ───────────────────────────────── */}

          <SectionTitle>Personal Information</SectionTitle>

          {/* Full Name */}

          <Field
            label="Full Name *"
            value={name}
            onChangeText={handleNameChange}
            placeholder="John Doe"
            errorText={fieldErrors.name}
          />

          {/* Email */}

          <Field
            label="Email *"
            value={email}
            onChangeText={handleEmailChange}
            placeholder="john@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            errorText={fieldErrors.email}
          />

          {/* DOB */}

          <Field
            label="Date of Birth *"
            value={dob}
            onChangeText={handleDobChange}
            placeholder="DD/MM/YYYY"
            keyboardType="numeric"
            errorText={fieldErrors.dob}
          />

          {/* Phone */}

          <Field
            label="Phone (optional)"
            value={phone}
            onChangeText={handlePhoneChange}
            placeholder="03001234567"
            keyboardType="number-pad"
            errorText={fieldErrors.phone}
          />

          {/* Gender */}

          <Text style={s.fieldLabel}>Gender *</Text>

          <View style={s.genderRow}>
            {GENDER_OPTIONS.map((g) => (
              <TouchableOpacity
                key={g}
                style={[
                  s.genderBtn,
                  gender === g && s.genderBtnActive,
                  fieldErrors.gender && s.genderBtnError,
                ]}
                onPress={() => handleGenderSelect(g)}
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

          {fieldErrors.gender ? (
            <Text style={s.fieldError}>{fieldErrors.gender}</Text>
          ) : null}

          {/* ── Medical History ─────────────────────────────────────── */}

          <SectionTitle>Medical History</SectionTitle>

          {/* Current medications */}

          <Text style={s.fieldLabel}>Current Medications</Text>

          <View style={s.medBox}>
            {medications.length > 0 && (
              <View style={s.chips}>
                {medications.map((m) => (
                  <View key={m} style={s.chip}>
                    <Text style={s.chipText}>{m}</Text>

                    <TouchableOpacity
                      onPress={() => removeMedication(m)}
                      hitSlop={{
                        top: 6,
                        bottom: 6,
                        left: 6,
                        right: 6,
                      }}
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

          {/* ── Security ────────────────────────────────────────────── */}

          <SectionTitle>Security</SectionTitle>

          {/* Password */}

          <Field
            label="Password *"
            value={password}
            onChangeText={handlePasswordChange}
            placeholder="Min. 8 characters"
            secureTextEntry
            errorText={fieldErrors.password}
          />

          {/* Password requirements */}

          <View style={s.passwordHintBox}>
            <Text style={s.passwordHintTitle}>Password must contain:</Text>

            <Text style={s.passwordHint}>• At least 8 characters</Text>

            <Text style={s.passwordHint}>
              • At least one uppercase letter (A-Z)
            </Text>

            <Text style={s.passwordHint}>
              • At least one lowercase letter (a-z)
            </Text>

            <Text style={s.passwordHint}>• At least one number (0-9)</Text>

            <Text style={s.passwordHint}>
              • At least one special character (!@#$...)
            </Text>
          </View>

          {/* Confirm Password */}

          <Field
            label="Confirm Password *"
            value={confirmPassword}
            onChangeText={handleConfirmPasswordChange}
            placeholder="Repeat password"
            secureTextEntry
            errorText={fieldErrors.confirmPassword}
          />

          {/* Server / registration error */}

          {error ? <Text style={s.error}>{error}</Text> : null}

          {/* Create Account */}

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

// ── Section title ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: string }) {
  return (
    <View style={s.sectionRow}>
      <View style={s.sectionLine} />

      <Text style={s.sectionTitle}>{children}</Text>

      <View style={s.sectionLine} />
    </View>
  );
}

// ── Input field ───────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  secureTextEntry,
  errorText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  autoCapitalize?: any;
  secureTextEntry?: boolean;
  errorText?: string;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>

      <TextInput
        style={[s.input, errorText ? s.inputErrorBorder : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.30)"
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? "words"}
        secureTextEntry={secureTextEntry}
        autoCorrect={false}
      />

      {errorText ? <Text style={s.fieldError}>{errorText}</Text> : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
  },

  back: {
    marginBottom: 24,
  },

  backText: {
    color: "rgba(255,255,255,0.60)",
    fontSize: 14,
  },

  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },

  logoIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: C.blue,
  },

  logoText: {
    color: C.white,
    fontWeight: "700",
    fontSize: 16,
  },

  heading: {
    color: C.white,
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 6,
  },

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

  fieldWrap: {
    marginBottom: 16,
  },

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

  inputErrorBorder: {
    borderColor: C.error,
  },

  fieldError: {
    color: C.error,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 17,
  },

  genderRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },

  genderBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
  },

  genderBtnActive: {
    backgroundColor: C.blue,
    borderColor: C.blue,
  },

  genderBtnError: {
    borderColor: C.error,
  },

  genderText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    fontWeight: "600",
  },

  genderTextActive: {
    color: C.white,
  },

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

  medRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  medInput: {
    flex: 1,
    color: C.white,
    fontSize: 15,
    paddingVertical: 10,
  },

  medAdd: {
    backgroundColor: C.blue,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  medAddText: {
    color: C.white,
    fontWeight: "700",
    fontSize: 13,
  },

  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1D4ED8",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    gap: 5,
  },

  chipText: {
    color: C.white,
    fontSize: 12,
    fontWeight: "600",
  },

  chipX: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 15,
    lineHeight: 17,
  },

  passwordHintBox: {
    marginTop: -6,
    marginBottom: 16,
    paddingHorizontal: 4,
  },

  passwordHintTitle: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 5,
  },

  passwordHint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    lineHeight: 17,
  },

  error: {
    color: C.error,
    fontSize: 13,
    marginBottom: 8,
    textAlign: "center",
  },

  btnPrimary: {
    backgroundColor: C.blue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },

  btnDisabled: {
    opacity: 0.6,
  },

  btnPrimaryText: {
    color: C.white,
    fontWeight: "700",
    fontSize: 16,
  },

  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },

  switchText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
  },

  switchLink: {
    color: C.blue,
    fontSize: 14,
    fontWeight: "700",
  },
});
