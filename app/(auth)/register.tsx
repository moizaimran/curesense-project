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
      colors={[C.bg, C.bg2, "#101B45"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.root}
    >
      <StatusBar style="light" />

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
              paddingBottom: insets.bottom + 42,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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

          <View style={s.intro}>
            <View style={s.aiBadge}>
              <Ionicons name="sparkles" size={12} color={C.white} />
              <Text style={s.aiBadgeText}>AI-POWERED HEALTHCARE</Text>
            </View>

            <Text style={s.heading}>Create your account</Text>
            <Text style={s.sub}>
              Start your smarter health journey with CureSense.
            </Text>
          </View>

          <View style={s.formCard}>
            <View style={s.formCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Your information</Text>
                <Text style={s.cardSubtitle}>
                  A few details to personalize your experience
                </Text>
              </View>

              <View style={s.secureIcon}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={19}
                  color={C.cyan}
                />
              </View>
            </View>

            <SectionTitle icon="person-outline">
              Personal Information
            </SectionTitle>

            <Field
              label="Full Name *"
              value={name}
              onChangeText={handleNameChange}
              placeholder="John Doe"
              icon="person-outline"
              errorText={fieldErrors.name}
            />

            <Field
              label="Email *"
              value={email}
              onChangeText={handleEmailChange}
              placeholder="john@example.com"
              icon="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
              errorText={fieldErrors.email}
            />

            <Field
              label="Date of Birth *"
              value={dob}
              onChangeText={handleDobChange}
              placeholder="DD/MM/YYYY"
              icon="calendar-outline"
              keyboardType="numeric"
              errorText={fieldErrors.dob}
            />

            <Field
              label="Phone (optional)"
              value={phone}
              onChangeText={handlePhoneChange}
              placeholder="03001234567"
              icon="call-outline"
              keyboardType="number-pad"
              errorText={fieldErrors.phone}
            />

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
                  {gender === g && (
                    <Ionicons
                      name="checkmark-circle"
                      size={15}
                      color={C.white}
                    />
                  )}
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

            <SectionTitle icon="medkit-outline">Medical History</SectionTitle>

            <Text style={s.fieldLabel}>Current Medications</Text>

            <View style={s.medBox}>
              {medications.length > 0 && (
                <View style={s.chips}>
                  {medications.map((m) => (
                    <View key={m} style={s.chip}>
                      <Ionicons
                        name="medical-outline"
                        size={12}
                        color={C.cyan}
                      />
                      <Text style={s.chipText}>{m}</Text>

                      <TouchableOpacity
                        onPress={() => removeMedication(m)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons
                          name="close-circle"
                          size={15}
                          color="rgba(255,255,255,0.55)"
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <View style={s.medRow}>
                <Ionicons name="add-circle-outline" size={18} color={C.soft} />

                <TextInput
                  style={s.medInput}
                  value={medInput}
                  onChangeText={setMedInput}
                  placeholder="e.g. Metformin 500mg"
                  placeholderTextColor="rgba(255,255,255,0.28)"
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

            <MultiSelect
              label="Known Medical Conditions"
              options={COMMON_CONDITIONS}
              selected={conditions}
              onChange={setConditions}
              placeholder="Select conditions…"
            />

            <MultiSelect
              label="Known Allergies"
              options={COMMON_ALLERGIES}
              selected={allergies}
              onChange={setAllergies}
              placeholder="Select allergies…"
            />

            <SectionTitle icon="lock-closed-outline">
              Account Security
            </SectionTitle>

            <Field
              label="Password *"
              value={password}
              onChangeText={handlePasswordChange}
              placeholder="Min. 8 characters"
              icon="lock-closed-outline"
              secureTextEntry
              errorText={fieldErrors.password}
            />

            <View style={s.passwordHintBox}>
              <View style={s.passwordHintHeader}>
                <Ionicons
                  name="information-circle-outline"
                  size={15}
                  color={C.cyan}
                />
                <Text style={s.passwordHintTitle}>Password requirements</Text>
              </View>

              <View style={s.requirementsGrid}>
                <Requirement
                  active={password.length >= 8}
                  text="8+ characters"
                />
                <Requirement active={/[A-Z]/.test(password)} text="Uppercase" />
                <Requirement active={/[a-z]/.test(password)} text="Lowercase" />
                <Requirement active={/[0-9]/.test(password)} text="Number" />
                <Requirement
                  active={/[!@#$%^&*(),.?":{}|<>_\-\\[\]/;'`~+=]/.test(
                    password,
                  )}
                  text="Special character"
                />
              </View>
            </View>

            <Field
              label="Confirm Password *"
              value={confirmPassword}
              onChangeText={handleConfirmPasswordChange}
              placeholder="Repeat password"
              icon="shield-checkmark-outline"
              secureTextEntry
              errorText={fieldErrors.confirmPassword}
            />

            {error ? (
              <View style={s.serverError}>
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={C.error}
                />
                <Text style={s.error}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[s.primaryButtonWrap, loading && s.btnDisabled]}
              onPress={handleRegister}
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
                    <Text style={s.btnPrimaryText}>Create Account</Text>
                    <View style={s.arrowCircle}>
                      <Ionicons name="arrow-forward" size={14} color={C.bg} />
                    </View>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={s.privacyRow}>
              <Ionicons name="lock-closed-outline" size={12} color={C.soft} />
              <Text style={s.privacyText}>
                Your information is securely protected
              </Text>
            </View>
          </View>

          <View style={s.switchRow}>
            <Text style={s.switchText}>Already have an account? </Text>
            <TouchableOpacity
              onPress={() => router.replace("/(auth)/login" as any)}
            >
              <Text style={s.switchLink}>Sign In</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.disclaimer}>
            By creating an account, you agree to use CureSense responsibly and
            understand that AI-generated information does not replace
            professional medical advice.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function SectionTitle({ children, icon }: { children: string; icon: any }) {
  return (
    <View style={s.sectionRow}>
      <View style={s.sectionIcon}>
        <Ionicons name={icon} size={15} color={C.cyan} />
      </View>
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
  errorText,
  icon,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  autoCapitalize?: any;
  secureTextEntry?: boolean;
  errorText?: string;
  icon?: any;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>

      <View style={[s.inputContainer, errorText ? s.inputErrorBorder : null]}>
        {icon ? (
          <Ionicons
            name={icon}
            size={17}
            color={errorText ? C.error : C.soft}
            style={s.inputIcon}
          />
        ) : null}

        <TextInput
          style={s.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.28)"
          keyboardType={keyboardType ?? "default"}
          autoCapitalize={autoCapitalize ?? "words"}
          secureTextEntry={secureTextEntry}
          autoCorrect={false}
        />
      </View>

      {errorText ? <Text style={s.fieldError}>{errorText}</Text> : null}
    </View>
  );
}

function Requirement({ active, text }: { active: boolean; text: string }) {
  return (
    <View style={s.requirement}>
      <View style={[s.requirementDot, active && s.requirementDotActive]}>
        {active ? <Ionicons name="checkmark" size={9} color={C.bg} /> : null}
      </View>
      <Text style={[s.requirementText, active && s.requirementTextActive]}>
        {text}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },

  container: {
    paddingHorizontal: 18,
    flexGrow: 1,
  },

  glowOne: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(59,130,246,0.10)",
    top: 80,
    left: -140,
  },

  glowTwo: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(139,92,246,0.10)",
    top: 650,
    right: -130,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 25,
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
    width: 34,
    height: 34,
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

  intro: {
    alignItems: "center",
    marginBottom: 25,
  },

  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 30,
    backgroundColor: "rgba(56,189,248,0.08)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.22)",
    marginBottom: 14,
  },

  aiBadgeText: {
    color: "#BFEAFF",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
  },

  heading: {
    color: C.white,
    fontSize: 31,
    lineHeight: 37,
    fontWeight: "900",
    letterSpacing: -0.8,
    textAlign: "center",
  },

  sub: {
    color: C.muted,
    fontSize: 13.5,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 340,
  },

  formCard: {
    padding: 18,
    borderRadius: 25,
    backgroundColor: "rgba(8,17,42,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    shadowColor: C.blue,
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 15 },
  },

  formCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    paddingBottom: 17,
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
    marginTop: 3,
  },

  secureIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56,189,248,0.08)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.15)",
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 7,
    marginBottom: 17,
  },

  sectionIcon: {
    width: 29,
    height: 29,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56,189,248,0.08)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.13)",
  },

  sectionTitle: {
    color: C.text,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  fieldWrap: {
    marginBottom: 15,
  },

  fieldLabel: {
    color: "rgba(234,241,255,0.72)",
    fontSize: 11.5,
    fontWeight: "700",
    marginBottom: 7,
    marginLeft: 2,
  },

  inputContainer: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 14,
    paddingHorizontal: 13,
  },

  inputIcon: {
    marginRight: 9,
  },

  input: {
    flex: 1,
    color: C.white,
    fontSize: 14,
    paddingVertical: 12,
    minWidth: 0,
  },

  inputErrorBorder: {
    borderColor: "rgba(248,113,113,0.75)",
    backgroundColor: "rgba(248,113,113,0.045)",
  },

  fieldError: {
    color: C.error,
    fontSize: 10.5,
    marginTop: 5,
    lineHeight: 15,
  },

  genderRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 7,
  },

  genderBtn: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.045)",
  },

  genderBtnActive: {
    backgroundColor: "rgba(59,130,246,0.22)",
    borderColor: "rgba(59,130,246,0.75)",
  },

  genderBtnError: {
    borderColor: "rgba(248,113,113,0.55)",
  },

  genderText: {
    color: C.soft,
    fontSize: 12.5,
    fontWeight: "700",
  },

  genderTextActive: {
    color: C.white,
  },

  medBox: {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 5,
    marginBottom: 15,
  },

  medRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  medInput: {
    flex: 1,
    color: C.white,
    fontSize: 13.5,
    paddingVertical: 8,
    minWidth: 0,
  },

  medAdd: {
    backgroundColor: "rgba(59,130,246,0.90)",
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },

  medAddText: {
    color: C.white,
    fontWeight: "800",
    fontSize: 11.5,
  },

  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },

  chip: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(37,99,235,0.20)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.16)",
    borderRadius: 9,
    paddingVertical: 6,
    paddingHorizontal: 9,
    gap: 5,
  },

  chipText: {
    color: C.text,
    fontSize: 10.5,
    fontWeight: "600",
    flexShrink: 1,
  },

  passwordHintBox: {
    marginTop: -4,
    marginBottom: 16,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "rgba(56,189,248,0.045)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.10)",
  },

  passwordHintHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 9,
  },

  passwordHintTitle: {
    color: "rgba(234,241,255,0.72)",
    fontSize: 10.5,
    fontWeight: "800",
  },

  requirementsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 7,
    columnGap: 14,
  },

  requirement: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  requirementDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  requirementDotActive: {
    backgroundColor: C.green,
    borderColor: C.green,
  },

  requirementText: {
    color: C.soft,
    fontSize: 9.5,
  },

  requirementTextActive: {
    color: "rgba(234,241,255,0.78)",
  },

  serverError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "rgba(248,113,113,0.07)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.18)",
    marginBottom: 9,
  },

  error: {
    flex: 1,
    color: C.error,
    fontSize: 11.5,
    lineHeight: 16,
  },

  primaryButtonWrap: {
    marginTop: 5,
    borderRadius: 15,
    overflow: "hidden",
  },

  btnPrimary: {
    minHeight: 54,
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
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
  },

  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 12,
  },

  privacyText: {
    color: C.soft,
    fontSize: 9.5,
  },

  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 23,
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

  disclaimer: {
    color: "rgba(234,241,255,0.25)",
    fontSize: 9,
    lineHeight: 14,
    textAlign: "center",
    marginTop: 17,
    paddingHorizontal: 10,
  },
});
