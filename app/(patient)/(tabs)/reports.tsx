import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

interface Session {
  _id: string;
  status: "in_progress" | "completed" | "abandoned" | "failed";
  session_name: string;
  turn_count: number;
  started_at: string;
  completed_at: string | null;
  last_activity_at: string;
}

interface Report {
  _id: string;
  session_id: string;
  appointment_id: string | null;
  patient_summary: {
    referralSpecialty: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hoursLeft(last_activity_at: string) {
  const elapsed = (Date.now() - new Date(last_activity_at).getTime()) / 36e5;
  const left = Math.max(0, 48 - elapsed);

  if (left < 1) return `${Math.round(left * 60)}m remaining`;

  return `${Math.floor(left)}h ${Math.round((left % 1) * 60)}m remaining`;
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const token = await Storage.getItemAsync("token");
      const patient_id = await Storage.getItemAsync("patient_id");

      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const [sessRes, repRes] = await Promise.all([
        fetch(`${API_URL}/api/sessions/patient/${patient_id}`, { headers }),
        fetch(`${API_URL}/api/reports/patient/${patient_id}`, { headers }),
      ]);

      if (!sessRes.ok) throw new Error("Failed to load sessions");

      const sessData = await sessRes.json();

      setSessions(sessData);

      if (repRes.ok) setReports(await repRes.json());
    } catch (e: any) {
      setError(e.message ?? "Failed to load data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleDelete(sessionId: string) {
    Alert.alert(
      "Remove Session",
      "This will hide the session and its report from your records. The data is retained securely. This cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setDeleting(sessionId);

            try {
              const token = await Storage.getItemAsync("token");

              const res = await fetch(
                `${API_URL}/api/sessions/${sessionId}/delete`,
                {
                  method: "PATCH",
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                },
              );

              if (!res.ok) throw new Error("Failed to remove session");

              setSessions((prev) => prev.filter((s) => s._id !== sessionId));
            } catch {
              Alert.alert(
                "Error",
                "Could not remove session. Please try again.",
              );
            } finally {
              setDeleting(null);
            }
          },
        },
      ],
    );
  }

  const reportBySession = Object.fromEntries(
    reports.map((r) => [r.session_id, r]),
  );

  const active = sessions.filter((s) => s.status === "in_progress");

  const completed = sessions.filter((s) => s.status === "completed");

  const expired = sessions.filter(
    (s) => s.status === "abandoned" || s.status === "failed",
  );

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LinearGradient
        colors={["#07112F", "#0B1B4D", "#102A68"]}
        style={s.loadingScreen}
      >
        <View style={s.loadingOrb}>
          <ActivityIndicator color="#60A5FA" size="large" />
        </View>

        <Text style={s.loadingTitle}>Loading your reports</Text>
        <Text style={s.loadingSub}>Preparing your health history...</Text>
      </LinearGradient>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={["#07112F", "#0B1B4D", "#07112F"]} style={s.screen}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={[
          s.container,
          {
            paddingTop: insets.top + 18,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchData(true)}
            tintColor="#60A5FA"
          />
        }
      >
        {/* ── Top Header ─────────────────────────────────────────────── */}

        <View style={s.topHeader}>
          <View style={s.brandIcon}>
            <LinearGradient
              colors={["#2563EB", "#3B82F6"]}
              style={s.brandIconGradient}
            >
              <Ionicons name="document-text" size={19} color="#fff" />
            </LinearGradient>
          </View>

          <View style={s.headerTextWrap}>
            <Text style={s.brandSmall}>CURESENSE</Text>
            <Text style={s.pageTitle}>Health Reports</Text>
          </View>

          <View style={s.countCircle}>
            <Text style={s.countNumber}>{sessions.length}</Text>
          </View>
        </View>

        <Text style={s.pageDescription}>
          View your previous medical interviews and generated reports.
        </Text>

        {/* ── Error ─────────────────────────────────────────────────── */}

        {error ? (
          <View style={s.errorCard}>
            <View style={s.errorIcon}>
              <Ionicons name="alert-circle-outline" size={21} color="#F87171" />
            </View>

            <View style={s.errorContent}>
              <Text style={s.errorTitle}>Something went wrong</Text>
              <Text style={s.errorText}>{error}</Text>
            </View>

            <TouchableOpacity
              onPress={() => fetchData()}
              style={s.retryBtn}
              activeOpacity={0.8}
            >
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Empty ─────────────────────────────────────────────────── */}

        {sessions.length === 0 && !error && (
          <View style={s.emptyState}>
            <View style={s.emptyIconOuter}>
              <View style={s.emptyIconInner}>
                <Ionicons
                  name="document-text-outline"
                  size={38}
                  color="#60A5FA"
                />
              </View>
            </View>

            <Text style={s.emptyTitle}>No reports yet</Text>

            <Text style={s.emptySub}>
              Complete an AI medical interview and your reports will appear
              here.
            </Text>

            <TouchableOpacity
              style={s.emptyAction}
              onPress={() =>
                router.navigate("/(patient)/(tabs)/interview" as any)
              }
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#2563EB", "#3B82F6"]}
                style={s.emptyActionGradient}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={17}
                  color="#fff"
                />

                <Text style={s.emptyActionText}>Start Interview</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Active / In Progress ─────────────────────────────────── */}

        {active.length > 0 && (
          <Section title="In Progress" icon="time-outline" iconColor="#FBBF24">
            {active.map((sess) => (
              <View key={sess._id} style={s.activeCard}>
                <View style={s.activeTop}>
                  <View style={s.activeIcon}>
                    <Ionicons name="pulse-outline" size={19} color="#FBBF24" />
                  </View>

                  <View style={s.activeTitleWrap}>
                    <Text style={s.activeTitle}>Medical Interview</Text>

                    <Text style={s.cardDate}>
                      Started {fmtDate(sess.started_at)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleDelete(sess._id)}
                    disabled={deleting === sess._id}
                    style={s.deleteBtn}
                  >
                    {deleting === sess._id ? (
                      <ActivityIndicator size="small" color="#F87171" />
                    ) : (
                      <Ionicons
                        name="trash-outline"
                        size={17}
                        color="rgba(248,113,113,0.75)"
                      />
                    )}
                  </TouchableOpacity>
                </View>

                <View style={s.progressArea}>
                  <View style={s.progressHeader}>
                    <Text style={s.progressLabel}>Interview progress</Text>

                    <Text style={s.progressCount}>
                      {sess.turn_count} question
                      {sess.turn_count !== 1 ? "s" : ""}
                    </Text>
                  </View>

                  <View style={s.progressTrack}>
                    <View
                      style={[
                        s.progressFill,
                        {
                          width: `${Math.min(
                            Math.max(sess.turn_count * 10, 8),
                            90,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={s.activeFooter}>
                  <View style={s.timeLeft}>
                    <Ionicons name="time-outline" size={14} color="#FBBF24" />

                    <Text style={s.timeLeftText}>
                      {hoursLeft(sess.last_activity_at)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={s.resumeBtn}
                    onPress={() =>
                      router.navigate("/(patient)/(tabs)/interview" as any)
                    }
                    activeOpacity={0.8}
                  >
                    <Text style={s.resumeText}>Resume</Text>

                    <Ionicons name="arrow-forward" size={15} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </Section>
        )}

        {/* ── Completed ────────────────────────────────────────────── */}

        {completed.length > 0 && (
          <Section
            title="Completed Reports"
            icon="checkmark-circle-outline"
            iconColor="#34D399"
          >
            {completed.map((sess) => {
              const report = reportBySession[sess._id];

              return (
                <TouchableOpacity
                  key={sess._id}
                  style={s.completedCard}
                  activeOpacity={0.82}
                  onPress={() =>
                    router.push({
                      pathname: "/report-sheet",
                      params: {
                        session_id: sess._id,
                      },
                    } as any)
                  }
                >
                  <View style={s.completedTop}>
                    <View style={s.reportIcon}>
                      <Ionicons
                        name="document-text"
                        size={20}
                        color="#60A5FA"
                      />
                    </View>

                    <View style={s.completedTitleWrap}>
                      <Text style={s.sessionName} numberOfLines={2}>
                        {sess.session_name || "Medical Interview"}
                      </Text>

                      <Text style={s.metaDate}>
                        {fmtDate(sess.completed_at ?? sess.started_at)}
                      </Text>
                    </View>

                    <View style={s.completedCheck}>
                      <Ionicons name="checkmark" size={14} color="#34D399" />
                    </View>
                  </View>

                  <View style={s.completedDivider} />

                  <View style={s.completedBottom}>
                    <View style={s.completedStatus}>
                      <View style={s.greenDot} />

                      <Text style={s.completedStatusText}>Completed</Text>
                    </View>

                    <View style={s.viewReport}>
                      <Text style={s.viewReportText}>View report</Text>

                      <Ionicons
                        name="arrow-forward"
                        size={14}
                        color="#60A5FA"
                      />
                    </View>
                  </View>

                  {report?.patient_summary?.referralSpecialty ? (
                    <View style={s.referralBox}>
                      <Ionicons
                        name="medical-outline"
                        size={14}
                        color="#60A5FA"
                      />

                      <Text style={s.referralText}>
                        Referred to {report.patient_summary.referralSpecialty}
                      </Text>
                    </View>
                  ) : null}

                  {report?.appointment_id ? (
                    <View style={s.appointmentBox}>
                      <Ionicons
                        name="calendar-outline"
                        size={14}
                        color="#34D399"
                      />

                      <Text style={s.appointmentText}>Appointment booked</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleDelete(sess._id);
                    }}
                    disabled={deleting === sess._id}
                    style={s.deleteCompleted}
                    hitSlop={{
                      top: 8,
                      bottom: 8,
                      left: 8,
                      right: 8,
                    }}
                  >
                    {deleting === sess._id ? (
                      <ActivityIndicator size="small" color="#F87171" />
                    ) : (
                      <Ionicons
                        name="trash-outline"
                        size={15}
                        color="rgba(248,113,113,0.55)"
                      />
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </Section>
        )}

        {/* ── Expired ──────────────────────────────────────────────── */}

        {expired.length > 0 && (
          <Section
            title="Expired / Abandoned"
            icon="close-circle-outline"
            iconColor="#94A3B8"
          >
            {expired.map((sess) => (
              <View key={sess._id} style={s.expiredCard}>
                <View style={s.expiredTop}>
                  <View style={s.expiredIcon}>
                    <Ionicons name="close-outline" size={18} color="#94A3B8" />
                  </View>

                  <View style={s.expiredInfo}>
                    <Text style={s.expiredTitle}>
                      {sess.session_name || "Medical Interview"}
                    </Text>

                    <Text style={s.expiredDate}>
                      {fmtDate(sess.started_at)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleDelete(sess._id)}
                    disabled={deleting === sess._id}
                    style={s.deleteBtn}
                  >
                    {deleting === sess._id ? (
                      <ActivityIndicator size="small" color="#F87171" />
                    ) : (
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color="#F87171"
                      />
                    )}
                  </TouchableOpacity>
                </View>

                <View style={s.expiredBadge}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={13}
                    color="#94A3B8"
                  />

                  <Text style={s.expiredBadgeText}>
                    {sess.status === "failed"
                      ? "Session failed"
                      : "Session expired"}
                  </Text>
                </View>

                <Text style={s.expiredSub}>
                  {sess.turn_count} question
                  {sess.turn_count !== 1 ? "s" : ""} completed before expiry.
                </Text>

                <Text style={s.noReport}>
                  No report was generated for this session.
                </Text>
              </View>
            ))}
          </Section>
        )}

        {/* ── Bottom Privacy ───────────────────────────────────────── */}

        {sessions.length > 0 && (
          <View style={s.privacyBox}>
            <Ionicons
              name="shield-checkmark-outline"
              size={18}
              color="#60A5FA"
            />

            <Text style={s.privacyText}>
              Your health information is securely stored and only accessible to
              you and your assigned clinician.
            </Text>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  iconColor,
  children,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <View
          style={[
            s.sectionIcon,
            {
              backgroundColor: `${iconColor}15`,
              borderColor: `${iconColor}25`,
            },
          ]}
        >
          <Ionicons name={icon} size={15} color={iconColor} />
        </View>

        <Text style={s.sectionTitle}>{title}</Text>

        <View style={s.sectionLine} />
      </View>

      {children}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: {
    flex: 1,
  },

  container: {
    paddingHorizontal: 20,
  },

  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingOrb: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37,99,235,0.12)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.20)",
    marginBottom: 18,
  },

  loadingTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  loadingSub: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    marginTop: 6,
  },

  // Header

  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  brandIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    padding: 1,
    backgroundColor: "rgba(37,99,235,0.15)",
    marginRight: 12,
  },

  brandIconGradient: {
    flex: 1,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTextWrap: {
    flex: 1,
  },

  brandSmall: {
    color: "#60A5FA",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 2,
  },

  pageTitle: {
    color: "#fff",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.6,
  },

  countCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(37,99,235,0.14)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },

  countNumber: {
    color: "#93C5FD",
    fontSize: 14,
    fontWeight: "800",
  },

  pageDescription: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 25,
    maxWidth: "90%",
  },

  // Error

  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(248,113,113,0.08)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.18)",
    borderRadius: 17,
    padding: 13,
    marginBottom: 20,
    gap: 10,
  },

  errorIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(248,113,113,0.10)",
  },

  errorContent: {
    flex: 1,
  },

  errorTitle: {
    color: "#FCA5A5",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 2,
  },

  errorText: {
    color: "rgba(248,113,113,0.70)",
    fontSize: 11,
    lineHeight: 16,
  },

  retryBtn: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: "rgba(248,113,113,0.12)",
  },

  retryText: {
    color: "#FCA5A5",
    fontSize: 11,
    fontWeight: "800",
  },

  // Empty

  emptyState: {
    alignItems: "center",
    paddingVertical: 65,
    paddingHorizontal: 25,
  },

  emptyIconOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(37,99,235,0.07)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },

  emptyIconInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(37,99,235,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 8,
  },

  emptySub: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 290,
    marginBottom: 22,
  },

  emptyAction: {
    width: 190,
  },

  emptyActionGradient: {
    borderRadius: 13,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  emptyActionText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },

  // Sections

  section: {
    marginBottom: 26,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },

  sectionIcon: {
    width: 29,
    height: 29,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionTitle: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.3,
  },

  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginLeft: 4,
  },

  // Active card

  activeCard: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 20,
    padding: 17,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.17)",
    marginBottom: 10,
  },

  activeTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  activeIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "rgba(251,191,36,0.10)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  activeTitleWrap: {
    flex: 1,
  },

  activeTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },

  cardDate: {
    color: "rgba(255,255,255,0.34)",
    fontSize: 10,
  },

  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(248,113,113,0.06)",
  },

  progressArea: {
    marginTop: 18,
    marginBottom: 16,
  },

  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  progressLabel: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    fontWeight: "600",
  },

  progressCount: {
    color: "rgba(251,191,36,0.75)",
    fontSize: 10,
    fontWeight: "700",
  },

  progressTrack: {
    height: 5,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 5,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    backgroundColor: "#FBBF24",
    borderRadius: 5,
  },

  activeFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  timeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  timeLeftText: {
    color: "#FCD34D",
    fontSize: 11,
    fontWeight: "600",
  },

  resumeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#2563EB",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },

  resumeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },

  // Completed

  completedCard: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 19,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.12)",
    marginBottom: 10,
    position: "relative",
  },

  completedTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  reportIcon: {
    width: 45,
    height: 45,
    borderRadius: 13,
    backgroundColor: "rgba(37,99,235,0.12)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.13)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  completedTitleWrap: {
    flex: 1,
    paddingRight: 5,
  },

  sessionName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
    marginBottom: 4,
  },

  metaDate: {
    color: "rgba(255,255,255,0.32)",
    fontSize: 10,
  },

  completedCheck: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: "rgba(52,211,153,0.10)",
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  completedDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 14,
  },

  completedBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  completedStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#34D399",
  },

  completedStatusText: {
    color: "#6EE7B7",
    fontSize: 10,
    fontWeight: "700",
  },

  viewReport: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  viewReportText: {
    color: "#60A5FA",
    fontSize: 11,
    fontWeight: "700",
  },

  referralBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(37,99,235,0.07)",
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
    marginTop: 12,
  },

  referralText: {
    color: "rgba(147,197,253,0.75)",
    fontSize: 10,
    fontWeight: "600",
  },

  appointmentBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },

  appointmentText: {
    color: "rgba(110,231,183,0.75)",
    fontSize: 10,
    fontWeight: "700",
  },

  deleteCompleted: {
    position: "absolute",
    right: 13,
    bottom: 13,
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
  },

  // Expired

  expiredCard: {
    backgroundColor: "rgba(255,255,255,0.035)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.10)",
    marginBottom: 10,
    opacity: 0.82,
  },

  expiredTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  expiredIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "rgba(148,163,184,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  expiredInfo: {
    flex: 1,
  },

  expiredTitle: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },

  expiredDate: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 10,
  },

  expiredBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 14,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(148,163,184,0.07)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.10)",
  },

  expiredBadgeText: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "700",
  },

  expiredSub: {
    color: "rgba(255,255,255,0.28)",
    fontSize: 11,
    marginTop: 11,
  },

  noReport: {
    color: "rgba(255,255,255,0.20)",
    fontSize: 10,
    marginTop: 5,
  },

  // Privacy

  privacyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(37,99,235,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.10)",
    padding: 13,
    marginTop: 4,
  },

  privacyText: {
    flex: 1,
    color: "rgba(147,197,253,0.48)",
    fontSize: 10,
    lineHeight: 15,
  },
});
