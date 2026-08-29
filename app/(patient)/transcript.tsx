import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
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

// ── Design tokens (matches landing page) ────────────────────────────────────
const C = {
  navy: "#070B1F",
  navyMid: "#0B1437",
  navyDeep: "#0F2060",
  indigo: "#4F46E5",
  blue: "#2563EB",
  blueLight: "#60A5FA",
  violet: "#8B5CF6",
  teal: "#14B8A6",
  amber: "#FBBF24",
  green: "#22C55E",
  white: "#FFFFFF",
  faint: "rgba(255,255,255,0.06)",
  faintBorder: "rgba(255,255,255,0.10)",
  muted: "rgba(255,255,255,0.55)",
  mutedMore: "rgba(255,255,255,0.35)",
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface Turn {
  turn_number: number;
  patient_corrected: string;
  assistant_message: string;
}

interface TranscriptEntry {
  role: "ai" | "patient";
  content: string;
  turn: number;
}

const OPENING =
  "What's been bothering you lately? Please describe your main symptom or concern.";

function buildTranscript(turns: Turn[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  entries.push({ role: "ai", content: OPENING, turn: 0 });
  turns.forEach((t, i) => {
    entries.push({
      role: "patient",
      content: t.patient_corrected,
      turn: i + 1,
    });
    entries.push({ role: "ai", content: t.assistant_message, turn: i + 1 });
  });
  return entries;
}

function fmtDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function TranscriptScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();

  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [meta, setMeta] = useState<{
    date: string;
    turns: number;
    status: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session_id) fetchSession();
  }, [session_id]);

  async function fetchSession() {
    try {
      const token = await Storage.getItemAsync("token");
      const res = await fetch(`${API_URL}/api/sessions/${session_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not load session");
      const session = await res.json();
      setEntries(buildTranscript(session.transcript ?? []));
      setMeta({
        date: fmtDate(session.completed_at ?? session.started_at),
        turns: session.turn_count,
        status: session.status,
      });
    } catch (e: any) {
      setError(e.message ?? "Failed to load transcript");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <LinearGradient
        colors={[C.navy, C.navyDeep, "#16247A"]}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator color={C.blueLight} size="large" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[C.navy, C.navyDeep, "#16247A"]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.75}
        >
          <Ionicons name="chevron-back" size={20} color={C.white} />
        </TouchableOpacity>

        <View style={s.headerCenter}>
          <View style={s.headerLogoRow}>
            <LinearGradient
              colors={[C.blue, C.violet]}
              style={s.headerLogoIcon}
            >
              <Ionicons name="pulse" size={12} color={C.white} />
            </LinearGradient>
            <Text style={s.headerTitle}>Interview Transcript</Text>
          </View>
          {meta && <Text style={s.headerDate}>{meta.date}</Text>}
        </View>

        <View style={s.headerRight}>
          {meta && (
            <View
              style={[
                s.statusBadge,
                meta.status === "completed"
                  ? s.statusComplete
                  : s.statusPending,
              ]}
            >
              <View
                style={[
                  s.statusDot,
                  {
                    backgroundColor:
                      meta.status === "completed" ? C.green : C.amber,
                  },
                ]}
              />
              <Text
                style={[
                  s.statusText,
                  meta.status === "completed"
                    ? s.statusTextComplete
                    : s.statusTextPending,
                ]}
              >
                {meta.status === "completed" ? "Complete" : "In Progress"}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Summary strip — glass card, matches landing page stat card */}
      {meta && (
        <View style={s.summaryStrip}>
          <View style={s.summaryItem}>
            <Text style={s.summaryValue}>{meta.turns}</Text>
            <Text style={s.summaryLabel}>Questions</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={s.summaryItem}>
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={meta.status === "completed" ? C.green : C.amber}
            />
            <Text style={s.summaryLabel}>
              {meta.status === "completed" ? "Report Generated" : "Incomplete"}
            </Text>
          </View>
        </View>
      )}

      {error ? (
        <View style={s.errorWrap}>
          <View style={s.errorIconWrap}>
            <Ionicons name="alert-circle-outline" size={28} color="#F87171" />
          </View>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            s.list,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {entries.map((entry, i) => (
            <View
              key={i}
              style={[
                s.entry,
                entry.role === "ai" ? s.entryAI : s.entryPatient,
              ]}
            >
              {/* Role label */}
              <View style={s.roleRow}>
                {entry.role === "ai" ? (
                  <LinearGradient
                    colors={[C.blue, C.violet]}
                    style={s.roleIcon}
                  >
                    <Ionicons name="medical" size={11} color={C.white} />
                  </LinearGradient>
                ) : (
                  <View style={s.roleIconPatient}>
                    <Ionicons name="person" size={11} color={C.white} />
                  </View>
                )}
                <Text
                  style={[
                    s.roleLabel,
                    entry.role === "ai" ? s.roleLabelAI : s.roleLabelPatient,
                  ]}
                >
                  {entry.role === "ai" ? "CureSense AI" : "You"}
                </Text>
              </View>
              {/* Content */}
              <Text
                style={[
                  s.entryText,
                  entry.role === "patient" && s.entryTextPatient,
                ]}
              >
                {entry.content}
              </Text>
            </View>
          ))}

          {/* View Report button — gradient CTA, matches landing page primary button */}
          {meta?.status === "completed" && (
            <TouchableOpacity
              style={s.viewReportBtn}
              onPress={() =>
                router.replace({
                  pathname: "/report-sheet",
                  params: { session_id },
                } as any)
              }
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[C.blue, C.violet]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.viewReportGrad}
              >
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={C.white}
                />
                <Text style={s.viewReportText}>View Full Report</Text>
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color="rgba(255,255,255,0.85)"
                />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </LinearGradient>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.faint,
    borderWidth: 1,
    borderColor: C.faintBorder,
  },
  headerCenter: { flex: 1 },
  headerLogoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerLogoIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: C.white,
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  headerDate: {
    color: C.mutedMore,
    fontSize: 11,
    marginTop: 3,
    marginLeft: 30,
  },
  headerRight: { minWidth: 90, alignItems: "flex-end" },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusComplete: {
    backgroundColor: "rgba(34,197,94,0.10)",
    borderColor: "rgba(34,197,94,0.30)",
  },
  statusPending: {
    backgroundColor: "rgba(251,191,36,0.10)",
    borderColor: "rgba(251,191,36,0.30)",
  },
  statusText: { fontSize: 11, fontWeight: "700" },
  statusTextComplete: { color: C.green },
  statusTextPending: { color: C.amber },

  summaryStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.faint,
    marginHorizontal: 16,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.faintBorder,
  },
  summaryItem: {
    alignItems: "center",
    gap: 5,
    flexDirection: "row",
    flex: 1,
    justifyContent: "center",
  },
  summaryValue: { color: C.white, fontSize: 17, fontWeight: "800" },
  summaryLabel: { color: C.muted, fontSize: 12, fontWeight: "600" },
  summaryDivider: {
    width: 1,
    height: 26,
    backgroundColor: C.faintBorder,
  },

  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 14,
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(248,113,113,0.10)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
  },
  errorText: { color: "#F87171", fontSize: 14, textAlign: "center" },

  list: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },

  entry: { borderRadius: 16, padding: 16, gap: 10 },
  entryAI: {
    backgroundColor: C.faint,
    borderWidth: 1,
    borderColor: C.faintBorder,
    marginRight: 28,
  },
  entryPatient: {
    backgroundColor: "rgba(37,99,235,0.12)",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.28)",
    marginLeft: 28,
  },

  roleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  roleIcon: {
    width: 21,
    height: 21,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  roleIconPatient: {
    width: 21,
    height: 21,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.blue,
  },
  roleLabel: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.2 },
  roleLabelAI: { color: C.blueLight },
  roleLabelPatient: { color: "#93C5FD" },

  entryText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14.5,
    lineHeight: 22,
  },
  entryTextPatient: { color: C.white },

  viewReportBtn: { marginTop: 12, borderRadius: 16, overflow: "hidden" },
  viewReportGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 17,
    paddingHorizontal: 22,
  },
  viewReportText: {
    color: C.white,
    fontWeight: "800",
    fontSize: 15.5,
    flex: 1,
  },
});
