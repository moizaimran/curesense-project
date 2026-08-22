import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_URL } from "@/constants/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Appointment {
  _id: string;
  status: "pending_admin_review" | "confirmed" | "completed" | "cancelled" | "rejected" | "no_show";
  has_unread_patient_query: boolean;
  requested_slot: { date: string; start_time: string; end_time: string } | null;
  doctor_id: { _id: string; specialty: string; hospital_clinic: string } | null;
  report_id: { _id: string } | string | null;
  feedback: { notes?: string } | null;
  queries: unknown[];
}

type TabKey = "ongoing" | "pending" | "completed" | "cancelled";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtSlotDate(slot: Appointment["requested_slot"]) {
  if (!slot) return "—";
  return new Date(slot.date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending_admin_review: { label: "Pending",   color: "#FBBF24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.30)"  },
  confirmed:            { label: "Ongoing",   color: "#22C55E", bg: "rgba(34,197,94,0.10)",   border: "rgba(34,197,94,0.28)"   },
  completed:            { label: "Completed", color: "#60A5FA", bg: "rgba(96,165,250,0.10)",  border: "rgba(96,165,250,0.28)"  },
  cancelled:            { label: "Cancelled", color: "#F87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.28)" },
  rejected:             { label: "Rejected",  color: "#F87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.28)" },
  no_show:              { label: "No Show",   color: "#94A3B8", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.25)" },
};

// ── Appointment card ───────────────────────────────────────────────────────────

function ApptCard({
  appt,
  onPress,
}: {
  appt: Appointment;
  onPress: () => void;
}) {
  const meta = STATUS_META[appt.status] ?? STATUS_META.no_show;
  const slot = appt.requested_slot;

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.78}>
      {/* Status row */}
      <View style={s.cardTop}>
        <View style={[s.badge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
          <View style={[s.badgeDot, { backgroundColor: meta.color }]} />
          <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        {appt.has_unread_patient_query && (
          <View style={s.unreadBadge}>
            <View style={s.unreadDot} />
            <Text style={s.unreadText}>Unread reply</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.25)" />
      </View>

      {/* Doctor info */}
      <View style={s.doctorRow}>
        <Ionicons name="person-circle-outline" size={18} color="#60A5FA" />
        <Text style={s.doctorText} numberOfLines={1}>
          {appt.doctor_id?.specialty ?? "Doctor"}
          {appt.doctor_id?.hospital_clinic ? ` · ${appt.doctor_id.hospital_clinic}` : ""}
        </Text>
      </View>

      {/* Slot */}
      {slot && (
        <View style={s.slotRow}>
          <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.35)" />
          <Text style={s.slotText}>
            {fmtSlotDate(slot)} · {slot.start_time}–{slot.end_time}
          </Text>
        </View>
      )}

      {/* Feedback preview for completed */}
      {appt.status === "completed" && appt.feedback?.notes && (
        <Text style={s.feedbackPreview} numberOfLines={1}>
          "{appt.feedback.notes}"
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ── Tab pill ───────────────────────────────────────────────────────────────────

function TabPill({
  label,
  active,
  count,
  onPress,
}: {
  label: string;
  active: boolean;
  count?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.tabPill, active && s.tabPillActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[s.tabPillText, active && s.tabPillTextActive]}>{label}</Text>
      {count !== undefined && count > 0 && (
        <View style={[s.tabCount, active && s.tabCountActive]}>
          <Text style={[s.tabCountText, active && s.tabCountTextActive]}>
            {count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function AppointmentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [all, setAll] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("ongoing");

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const token = await Storage.getItemAsync("token");
      const patient_id = await Storage.getItemAsync("patient_id");
      const res = await fetch(
        `${API_URL}/api/patients/${patient_id}/appointments`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error("Failed to load appointments");
      const data: Appointment[] = await res.json();
      // Sort unread to top within each group
      data.sort((a, b) => (b.has_unread_patient_query ? 1 : 0) - (a.has_unread_patient_query ? 1 : 0));
      setAll(data);
    } catch (e: any) {
      setError(e.message ?? "Could not load appointments");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-fetch every time this tab comes into focus — handles the case where the
  // patient just booked an appointment and was router.replace-d here from another screen.
  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const TAB_FILTER: Record<TabKey, (a: Appointment) => boolean> = {
    ongoing:   (a) => a.status === "confirmed",
    pending:   (a) => a.status === "pending_admin_review",
    completed: (a) => a.status === "completed",
    cancelled: (a) => a.status === "cancelled" || a.status === "rejected" || a.status === "no_show",
  };

  const visible = all.filter(TAB_FILTER[activeTab]);
  const counts = {
    ongoing:   all.filter(TAB_FILTER.ongoing).length,
    pending:   all.filter(TAB_FILTER.pending).length,
    completed: all.filter(TAB_FILTER.completed).length,
    cancelled: all.filter(TAB_FILTER.cancelled).length,
  };

  function openAppointment(appt: Appointment) {
    router.push({
      pathname: "/(patient)/appointment-detail",
      params: { appointment_id: appt._id },
    } as any);
  }

  return (
    <LinearGradient
      colors={["#0B1437", "#0F2060", "#0B1437"]}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 20 }]}>
        <Text style={s.pageTitle}>Appointments</Text>
        {all.some((a) => a.has_unread_patient_query) && (
          <View style={s.globalUnread}>
            <View style={s.unreadDot} />
            <Text style={s.unreadText}>New replies</Text>
          </View>
        )}
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabScroll}
        contentContainerStyle={s.tabContent}
      >
        {(["ongoing", "pending", "completed", "cancelled"] as TabKey[]).map((key) => (
          <TabPill
            key={key}
            label={key.charAt(0).toUpperCase() + key.slice(1)}
            active={activeTab === key}
            count={counts[key]}
            onPress={() => setActiveTab(key)}
          />
        ))}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#2563EB" size="large" />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={28} color="#F87171" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchData()} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            s.list,
            { paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchData(true)}
              tintColor="#2563EB"
            />
          }
        >
          {visible.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons
                name="calendar-outline"
                size={44}
                color="rgba(255,255,255,0.12)"
              />
              <Text style={s.emptyTitle}>
                {activeTab === "ongoing"   ? "No ongoing appointments"     :
                 activeTab === "pending"   ? "No pending requests"         :
                 activeTab === "completed" ? "No completed appointments"   :
                                            "No cancelled appointments"}
              </Text>
              {activeTab === "ongoing" || activeTab === "pending" ? (
                <Text style={s.emptySub}>
                  Complete an AI interview and book a doctor to get started.
                </Text>
              ) : null}
            </View>
          ) : (
            visible.map((appt) => (
              <ApptCard
                key={appt._id}
                appt={appt}
                onPress={() => openAppointment(appt)}
              />
            ))
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  pageTitle: { color: "#fff", fontSize: 24, fontWeight: "800", flex: 1 },

  globalUnread: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.30)",
  },

  tabScroll: { flexGrow: 0 },
  tabContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: "row",
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  tabPillActive: {
    backgroundColor: "rgba(37,99,235,0.28)",
    borderColor: "rgba(37,99,235,0.55)",
  },
  tabPillText: { color: "rgba(255,255,255,0.50)", fontSize: 13, fontWeight: "600" },
  tabPillTextActive: { color: "#93C5FD" },
  tabCount: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: "center",
  },
  tabCountActive: { backgroundColor: "rgba(37,99,235,0.40)" },
  tabCountText: { color: "rgba(255,255,255,0.50)", fontSize: 11, fontWeight: "700" },
  tabCountTextActive: { color: "#93C5FD" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  errorText: { color: "#F87171", fontSize: 14, textAlign: "center" },
  retryBtn: {
    backgroundColor: "rgba(248,113,113,0.15)",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  retryText: { color: "#F87171", fontWeight: "700", fontSize: 13 },

  list: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },

  emptyState: { alignItems: "center", paddingVertical: 64, gap: 12 },
  emptyTitle: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySub: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },

  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    gap: 8,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: "700" },

  unreadBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.30)",
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  unreadText: { color: "#22C55E", fontSize: 10, fontWeight: "700" },

  doctorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  doctorText: { color: "rgba(255,255,255,0.70)", fontSize: 13, flex: 1 },

  slotRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  slotText: { color: "rgba(255,255,255,0.40)", fontSize: 12 },

  feedbackPreview: {
    color: "rgba(255,255,255,0.30)",
    fontSize: 12,
    fontStyle: "italic",
  },
});
