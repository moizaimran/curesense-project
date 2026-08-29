import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_URL } from "@/constants/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserData {
  name: string;
  email: string;
  role: string;
}

interface PatientData {
  dob: string;
  gender: string;
  contact: { phone: string; email: string };
  medical_conditions: string[];
  allergies: string[];
  current_medications: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDob(raw: string) {
  if (!raw) return "—";
  const d = new Date(raw);
  return isNaN(d.getTime())
    ? raw
    : d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [user, setUser] = useState<UserData | null>(null);
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const token = await Storage.getItemAsync("token");
      const patient_id = await Storage.getItemAsync("patient_id");

      if (!token) {
        router.replace("/(auth)/login" as any);
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };

      const [meRes, patRes] = await Promise.all([
        fetch(`${API_URL}/api/auth/me`, { headers }),
        fetch(`${API_URL}/api/patients/${patient_id}`, { headers }),
      ]);

      if (!meRes.ok) throw new Error("Session expired");

      setUser(await meRes.json());
      if (patRes.ok) setPatient(await patRes.json());
    } catch (e: any) {
      setError(e.message ?? "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await Storage.deleteItemAsync("token");
    await Storage.deleteItemAsync("role");
    await Storage.deleteItemAsync("patient_id");
    router.replace("/");
  }

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LinearGradient
        colors={["#050816", "#08112A", "#101B45"]}
        style={s.center}
      >
        <View style={s.loadingIcon}>
          <Ionicons name="pulse" size={28} color="#38BDF8" />
        </View>

        <ActivityIndicator color="#3B82F6" size="large" />

        <Text style={s.loadingText}>Loading your health profile...</Text>
      </LinearGradient>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────

  if (error) {
    return (
      <LinearGradient
        colors={["#050816", "#08112A", "#101B45"]}
        style={s.center}
      >
        <View style={s.errorIcon}>
          <Ionicons name="alert-circle-outline" size={29} color="#F87171" />
        </View>

        <Text style={s.errorTitle}>Something went wrong</Text>

        <Text style={s.errorText}>{error}</Text>

        <TouchableOpacity
          style={s.retryBtn}
          onPress={fetchData}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh-outline" size={17} color="#fff" />

          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  // ── Main UI ──────────────────────────────────────────────────────────────────

  return (
    <LinearGradient
      colors={["#050816", "#08112A", "#101B45"]}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />

      {/* Decorative background glows */}
      <View pointerEvents="none" style={s.glowOne} />
      <View pointerEvents="none" style={s.glowTwo} />

      <ScrollView
        contentContainerStyle={[
          s.container,
          {
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ───────────────── Header ───────────────── */}

        <View style={s.headerRow}>
          <View style={s.logoRow}>
            <LinearGradient
              colors={["#3B82F6", "#8B5CF6"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.logoIcon}
            >
              <Ionicons name="pulse" size={18} color="#FFFFFF" />
            </LinearGradient>

            <Text style={s.logoText}>CureSense</Text>
          </View>

          <TouchableOpacity
            style={s.logoutBtn}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={17} color="#FCA5A5" />

            <Text style={s.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* ───────────────── Profile Hero ───────────────── */}

        <View style={s.profileHero}>
          <View style={s.avatarOuter}>
            <LinearGradient
              colors={["#3B82F6", "#7C3AED"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.avatar}
            >
              <Text style={s.avatarText}>{initials(user?.name ?? "")}</Text>
            </LinearGradient>

            <View style={s.onlineDot} />
          </View>

          <Text style={s.userName}>{user?.name}</Text>

          <View style={s.roleBadge}>
            <Ionicons name="person-outline" size={12} color="#93C5FD" />

            <Text style={s.roleBadgeText}>
              {(user?.role ?? "").toUpperCase()}
            </Text>
          </View>

          <Text style={s.welcomeText}>Your personal health overview</Text>
        </View>

        {/* ───────────────── Security Status ───────────────── */}

        <View style={s.statusCard}>
          <View style={s.statusIcon}>
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color="#34D399"
            />
          </View>

          <View style={s.statusContent}>
            <Text style={s.statusTitle}>Profile secured</Text>

            <Text style={s.statusSub}>
              Your health information is protected
            </Text>
          </View>

          <Ionicons name="checkmark-circle" size={20} color="#34D399" />
        </View>

        {/* ───────────────── Personal Information ───────────────── */}

        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={s.cardIcon}>
              <Ionicons name="person-outline" size={18} color="#38BDF8" />
            </View>

            <View>
              <Text style={s.cardTitle}>Personal Information</Text>

              <Text style={s.cardSubtitle}>Your basic account details</Text>
            </View>
          </View>

          <InfoRow
            icon="mail-outline"
            label="Email"
            value={user?.email ?? "—"}
          />

          <InfoRow
            icon="male-female-outline"
            label="Gender"
            value={patient?.gender ?? "—"}
          />

          <InfoRow
            icon="calendar-outline"
            label="Date of Birth"
            value={formatDob(patient?.dob ?? "")}
          />

          {!!patient?.contact?.phone && (
            <InfoRow
              icon="call-outline"
              label="Phone"
              value={patient.contact.phone}
            />
          )}
        </View>

        {/* ───────────────── Medical Conditions ───────────────── */}

        <MedCard
          title="Known Medical Conditions"
          subtitle="Conditions you've reported"
          icon="fitness-outline"
          items={patient?.medical_conditions ?? []}
          emptyText="None reported"
        />

        {/* ───────────────── Allergies ───────────────── */}

        <MedCard
          title="Known Allergies"
          subtitle="Important allergy information"
          icon="warning-outline"
          items={patient?.allergies ?? []}
          emptyText="None reported"
        />

        {/* ───────────────── Medications ───────────────── */}

        <MedCard
          title="Current Medications"
          subtitle="Medications you're currently taking"
          icon="medical-outline"
          items={patient?.current_medications ?? []}
          emptyText="None reported"
        />

        {/* ───────────────── AI Interview CTA ───────────────── */}

        <TouchableOpacity
          onPress={() => router.push("/(patient)/interview" as any)}
          activeOpacity={0.88}
          style={s.interviewWrap}
        >
          <LinearGradient
            colors={["#2563EB", "#7C3AED"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.interviewBtn}
          >
            <View style={s.interviewIcon}>
              <Ionicons name="sparkles" size={21} color="#FFFFFF" />
            </View>

            <View style={s.interviewContent}>
              <Text style={s.interviewBtnTitle}>Start AI Interview</Text>

              <Text style={s.interviewBtnSub}>
                Describe your symptoms to your AI intake assistant
              </Text>
            </View>

            <View style={s.interviewArrow}>
              <Ionicons name="arrow-forward" size={16} color="#111827" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Footer */}

        <Text style={s.footer}>
          CureSense • AI-powered healthcare assistance
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <View style={s.infoRow}>
      <View style={s.infoLeft}>
        <View style={s.infoIcon}>
          <Ionicons name={icon} size={15} color="#93C5FD" />
        </View>

        <Text style={s.infoLabel}>{label}</Text>
      </View>

      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

function MedCard({
  title,
  subtitle,
  icon,
  items,
  emptyText,
}: {
  title: string;
  subtitle: string;
  icon: any;
  items: string[];
  emptyText: string;
}) {
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.cardIcon}>
          <Ionicons name={icon} size={18} color="#38BDF8" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>{title}</Text>

          <Text style={s.cardSubtitle}>{subtitle}</Text>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={17} color="#34D399" />

          <Text style={s.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        <View style={s.tagWrap}>
          {items.map((item) => (
            <View key={item} style={s.tag}>
              <View style={s.tagDot} />

              <Text style={s.tagText}>{item}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Loading / Error
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  loadingIcon: {
    width: 66,
    height: 66,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56,189,248,0.08)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.16)",
    marginBottom: 18,
  },

  loadingText: {
    color: "rgba(234,241,255,0.52)",
    fontSize: 12,
    marginTop: 12,
  },

  errorIcon: {
    width: 66,
    height: 66,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(248,113,113,0.08)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.16)",
    marginBottom: 15,
  },

  errorTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 8,
  },

  errorText: {
    color: "#FCA5A5",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 15,
    marginBottom: 20,
  },

  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#2563EB",
    borderRadius: 13,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },

  retryText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },

  // Background
  container: {
    paddingHorizontal: 18,
    flexGrow: 1,
  },

  glowOne: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(59,130,246,0.08)",
    top: 90,
    left: -175,
  },

  glowTwo: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(139,92,246,0.08)",
    bottom: 80,
    right: -160,
  },

  // Header
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 29,
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
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.5,
  },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: "rgba(248,113,113,0.045)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.18)",
  },

  logoutText: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11.5,
    fontWeight: "700",
  },

  // Profile
  profileHero: {
    alignItems: "center",
    marginBottom: 23,
  },

  avatarOuter: {
    position: "relative",
    marginBottom: 13,
  },

  avatar: {
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.12)",
  },

  avatarText: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1,
  },

  onlineDot: {
    position: "absolute",
    width: 17,
    height: 17,
    right: 1,
    bottom: 3,
    borderRadius: 9,
    backgroundColor: "#34D399",
    borderWidth: 3,
    borderColor: "#08112A",
  },

  userName: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginBottom: 8,
  },

  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "rgba(59,130,246,0.12)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.25)",
  },

  roleBadgeText: {
    color: "#93C5FD",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
  },

  welcomeText: {
    color: "rgba(234,241,255,0.42)",
    fontSize: 11.5,
    marginTop: 9,
  },

  // Security
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderRadius: 16,
    marginBottom: 15,
    backgroundColor: "rgba(52,211,153,0.055)",
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.13)",
  },

  statusIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(52,211,153,0.08)",
    marginRight: 10,
  },

  statusContent: {
    flex: 1,
  },

  statusTitle: {
    color: "#D1FAE5",
    fontSize: 12,
    fontWeight: "800",
  },

  statusSub: {
    color: "rgba(234,241,255,0.40)",
    fontSize: 9.5,
    marginTop: 3,
  },

  // Cards
  card: {
    backgroundColor: "rgba(8,17,42,0.78)",
    borderRadius: 20,
    padding: 17,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.085)",
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },

  cardIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56,189,248,0.07)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.12)",
    marginRight: 10,
  },

  cardTitle: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "800",
  },

  cardSubtitle: {
    color: "rgba(234,241,255,0.35)",
    fontSize: 9.5,
    marginTop: 3,
  },

  // Info rows
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.055)",
  },

  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },

  infoIcon: {
    width: 29,
    height: 29,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.045)",
  },

  infoLabel: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 11.5,
    fontWeight: "600",
  },

  infoValue: {
    color: "#EAF1FF",
    fontSize: 11.5,
    fontWeight: "700",
    maxWidth: "57%",
    textAlign: "right",
  },

  // Empty state
  emptyState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 5,
  },

  emptyText: {
    color: "rgba(234,241,255,0.35)",
    fontSize: 11.5,
  },

  // Medical tags
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },

  tag: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "100%",
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: "rgba(59,130,246,0.10)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.16)",
  },

  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#38BDF8",
    marginRight: 6,
  },

  tagText: {
    color: "#BFDBFE",
    fontSize: 10.5,
    fontWeight: "600",
    flexShrink: 1,
  },

  // Interview CTA
  interviewWrap: {
    borderRadius: 18,
    overflow: "hidden",
    marginTop: 4,
    shadowColor: "#2563EB",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10,
    },
  },

  interviewBtn: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
  },

  interviewIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.13)",
    marginRight: 11,
  },

  interviewContent: {
    flex: 1,
  },

  interviewBtnTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  interviewBtnSub: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 9.5,
    lineHeight: 14,
    marginTop: 4,
    paddingRight: 5,
  },

  interviewArrow: {
    width: 31,
    height: 31,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  // Footer
  footer: {
    color: "rgba(234,241,255,0.22)",
    fontSize: 9,
    textAlign: "center",
    marginTop: 17,
  },
});
