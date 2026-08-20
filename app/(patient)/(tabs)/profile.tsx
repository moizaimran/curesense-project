import * as Storage from "@/utils/storage";
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

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <LinearGradient colors={["#0B1437", "#0F2060"]} style={s.center}>
        <ActivityIndicator color="#2563EB" size="large" />
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient colors={["#0B1437", "#0F2060"]} style={s.center}>
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={fetchData}>
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <LinearGradient
      colors={["#0B1437", "#0F2060", "#0B1437"]}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[
          s.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header row */}
        <View style={s.headerRow}>
          <View style={s.logoRow}>
            <View style={s.logoIcon} />
            <Text style={s.logoText}>CureSense</Text>
          </View>
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
            <Text style={s.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Avatar */}
        <View style={s.avatarWrap}>
          <LinearGradient colors={["#2563EB", "#1D4ED8"]} style={s.avatar}>
            <Text style={s.avatarText}>{initials(user?.name ?? "")}</Text>
          </LinearGradient>
          <Text style={s.userName}>{user?.name}</Text>
          <View style={s.roleBadge}>
            <Text style={s.roleBadgeText}>
              {(user?.role ?? "").toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Info card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Personal Information</Text>
          <InfoRow label="Email" value={user?.email ?? "—"} />
          <InfoRow label="Gender" value={patient?.gender ?? "—"} />
          <InfoRow
            label="Date of Birth"
            value={formatDob(patient?.dob ?? "")}
          />
          {!!patient?.contact?.phone && (
            <InfoRow label="Phone" value={patient.contact.phone} />
          )}
        </View>

        {/* Medical history */}
        <MedCard
          title="Known Medical Conditions"
          items={patient?.medical_conditions ?? []}
          emptyText="None reported"
        />
        <MedCard
          title="Known Allergies"
          items={patient?.allergies ?? []}
          emptyText="None reported"
        />
        <MedCard
          title="Current Medications"
          items={patient?.current_medications ?? []}
          emptyText="None reported"
        />

        {/* Start interview CTA */}
        <TouchableOpacity
          style={s.interviewBtn}
          onPress={() => router.push("/(patient)/interview" as any)}
          activeOpacity={0.85}
        >
          <Text style={s.interviewBtnTitle}>Start AI Interview</Text>
          <Text style={s.interviewBtnSub}>
            Describe your symptoms to your AI intake assistant
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

function MedCard({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {items.length === 0 ? (
        <Text style={s.emptyText}>{emptyText}</Text>
      ) : (
        <View style={s.tagWrap}>
          {items.map((item) => (
            <View key={item} style={s.tag}>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  errorText: {
    color: "#F87171",
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  retryBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  retryText: { color: "#fff", fontWeight: "700" },

  container: { paddingHorizontal: 20 },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 32,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "#2563EB",
  },
  logoText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    borderRadius: 8,
  },
  logoutText: { color: "rgba(255,255,255,0.60)", fontSize: 13 },

  avatarWrap: { alignItems: "center", marginBottom: 28 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: { color: "#fff", fontSize: 28, fontWeight: "800" },
  userName: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  roleBadge: {
    backgroundColor: "rgba(37,99,235,0.30)",
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.50)",
  },
  roleBadgeText: {
    color: "#93C5FD",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },

  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 14,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  infoLabel: { color: "rgba(255,255,255,0.50)", fontSize: 13 },
  infoValue: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    maxWidth: "60%",
    textAlign: "right",
  },

  emptyText: {
    color: "rgba(255,255,255,0.30)",
    fontSize: 13,
    fontStyle: "italic",
  },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    backgroundColor: "rgba(37,99,235,0.25)",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.40)",
  },
  tagText: { color: "#93C5FD", fontSize: 12, fontWeight: "600" },

  interviewBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginTop: 6,
    alignItems: "center",
    gap: 4,
  },
  interviewBtnTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  interviewBtnSub: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    lineHeight: 18,
  },
});
