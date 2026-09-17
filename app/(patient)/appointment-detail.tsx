import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
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

// ── Types ──────────────────────────────────────────────────────────────────────

interface QueryMessage {
  _id: string;
  sender: "patient" | "doctor";
  message: string;
  created_at: string;
  read: boolean;
}

interface DoctorProfile {
  _id: string;
  specialty: string;
  hospital_clinic: string;
  location: { city: string };
  contact: { phone: string; email: string };
  user_id?: { name: string };
}

interface TestUpload {
  _id: string;
  test_name: string;
  file_url: string;
  file_type: string;
  original_filename: string;
  uploaded_at: string;
}

interface Appointment {
  _id: string;
  status: string;
  has_unread_patient_query: boolean;
  has_new_test_upload: boolean;

  requested_slot: {
    date: string;
    start_time: string;
    end_time: string;
  } | null;

  doctor_id: DoctorProfile | null;

  feedback: {
    notes?: string;
    recommendation?: string;
    tests_requested?: string[];
    submitted_at?: string;
  } | null;

  test_uploads: TestUpload[];
  queries: QueryMessage[];

  report_id: { _id: string } | string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return "—";

  // Calendar dates are stored as YYYY-MM-DD.
  // Construct using local components so no timezone conversion can change
  // the displayed appointment date.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);

  if (match) {
    const [, year, month, day] = match;

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
    ).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtTime(iso: string) {
  if (!iso) return "";

  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function confirmAsync(title: string, message: string): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      {
        text: "Keep it",
        style: "cancel",
        onPress: () => resolve(false),
      },
      {
        text: "Cancel Appointment",
        style: "destructive",
        onPress: () => resolve(true),
      },
    ]);
  });
}

function alertError(message: string) {
  if (Platform.OS === "web") {
    window.alert(message);
  } else {
    Alert.alert("Error", message);
  }
}

// ── Status metadata ────────────────────────────────────────────────────────────

const STATUS_META: Record<
  string,
  {
    label: string;
    color: string;
    bg: string;
    border: string;
  }
> = {
  pending_admin_review: {
    label: "Pending Review",
    color: "#FBBF24",
    bg: "rgba(251,191,36,0.12)",
    border: "rgba(251,191,36,0.30)",
  },

  confirmed: {
    label: "Ongoing",
    color: "#22C55E",
    bg: "rgba(34,197,94,0.10)",
    border: "rgba(34,197,94,0.28)",
  },

  completed: {
    label: "Completed",
    color: "#60A5FA",
    bg: "rgba(96,165,250,0.10)",
    border: "rgba(96,165,250,0.28)",
  },

  cancelled: {
    label: "Cancelled",
    color: "#F87171",
    bg: "rgba(248,113,113,0.10)",
    border: "rgba(248,113,113,0.28)",
  },

  rejected: {
    label: "Rejected",
    color: "#F87171",
    bg: "rgba(248,113,113,0.10)",
    border: "rgba(248,113,113,0.28)",
  },

  no_show: {
    label: "No Show",
    color: "#94A3B8",
    bg: "rgba(148,163,184,0.10)",
    border: "rgba(148,163,184,0.25)",
  },
};

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: QueryMessage }) {
  const isPatient = msg.sender === "patient";

  return (
    <View style={[bubble.row, isPatient ? bubble.rowRight : bubble.rowLeft]}>
      <View
        style={[
          bubble.wrap,
          isPatient ? bubble.wrapPatient : bubble.wrapDoctor,
        ]}
      >
        <Text
          style={[
            bubble.text,
            isPatient ? bubble.textPatient : bubble.textDoctor,
          ]}
        >
          {msg.message}
        </Text>

        <Text
          style={[
            bubble.time,
            isPatient ? bubble.timePatient : bubble.timeDoctor,
          ]}
        >
          {isPatient ? "You" : "Doctor"} · {fmtTime(msg.created_at)}
        </Text>
      </View>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function AppointmentDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { appointment_id } = useLocalSearchParams<{ appointment_id: string }>();

  const [appt, setAppt] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [uploadingTest, setUploadingTest] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  // ── Fetch appointment ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!appointment_id) return;

    fetchAppointment();
  }, [appointment_id]);

  async function fetchAppointment() {
    setLoading(true);
    setError("");

    try {
      const token = await Storage.getItemAsync("token");

      const res = await fetch(`${API_URL}/api/appointments/${appointment_id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to load appointment");
      }

      setAppt(await res.json());
    } catch (e: any) {
      setError(e.message ?? "Could not load appointment");
    } finally {
      setLoading(false);
    }
  }

  // ── Send message ─────────────────────────────────────────────────────────────

  async function sendMessage() {
    const msg = messageText.trim();

    if (!msg || !appt) return;

    setSending(true);

    try {
      const token = await Storage.getItemAsync("token");

      const res = await fetch(
        `${API_URL}/api/appointments/${appointment_id}/queries`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: msg,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));

        throw new Error(err.error ?? "Failed to send");
      }

      const data = await res.json();

      setAppt((prev) =>
        prev
          ? {
              ...prev,
              queries: [...prev.queries, data.query],
            }
          : prev,
      );

      setMessageText("");

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({
          animated: true,
        });
      }, 100);
    } catch (e: any) {
      alertError(e.message ?? "Could not send message");
    } finally {
      setSending(false);
    }
  }

  // ── Cancel appointment ────────────────────────────────────────────────────────

  async function handleCancel() {
    const confirmed = await confirmAsync(
      "Cancel Appointment",
      "Are you sure you want to cancel this appointment? This cannot be undone.",
    );

    if (!confirmed) return;

    setCancelling(true);

    try {
      const token = await Storage.getItemAsync("token");

      const res = await fetch(
        `${API_URL}/api/appointments/${appointment_id}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));

        throw new Error(err.error ?? "Failed to cancel");
      }

      setAppt((prev) =>
        prev
          ? {
              ...prev,
              status: "cancelled",
            }
          : prev,
      );
    } catch (e: any) {
      alertError(e.message ?? "Could not cancel");
    } finally {
      setCancelling(false);
    }
  }

  // ── Upload test result ────────────────────────────────────────────────────────
  //
  // WEB:
  // Uses browser FileReader because expo-file-system's readAsStringAsync
  // is not available on web.
  //
  // ANDROID / IOS:
  // Uses expo-file-system/legacy readAsStringAsync.
  //
  // This keeps the same upload API for all platforms.

  async function handleUploadTest() {
    let picked;

    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch {
      alertError("Could not open file picker");
      return;
    }

    if (picked.canceled || !picked.assets?.[0]) {
      return;
    }

    const file = picked.assets[0];

    // 15MB guard
    if (file.size && file.size > 15 * 1024 * 1024) {
      alertError("File must be under 15MB");
      return;
    }

    setUploadingTest(true);

    try {
      let base64: string;

      // ───────────────────────────────────────────────────────────────────────
      // WEB
      // ───────────────────────────────────────────────────────────────────────

      if (Platform.OS === "web") {
        const response = await fetch(file.uri);

        if (!response.ok) {
          throw new Error("Could not read selected file");
        }

        const blob = await response.blob();

        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();

          reader.onloadend = () => {
            try {
              const result = reader.result;

              if (typeof result !== "string") {
                reject(new Error("Could not convert file to Base64"));
                return;
              }

              // FileReader returns something like:
              //
              // data:application/pdf;base64,JVBERi0x...
              //
              // We only need the Base64 portion after the comma.

              const commaIndex = result.indexOf(",");

              if (commaIndex === -1) {
                reject(new Error("Invalid Base64 file data"));
                return;
              }

              const cleanBase64 = result.substring(commaIndex + 1);

              resolve(cleanBase64);
            } catch (error) {
              reject(error);
            }
          };

          reader.onerror = () => {
            reject(new Error("Could not read selected file"));
          };

          reader.readAsDataURL(blob);
        });
      }

      // ───────────────────────────────────────────────────────────────────────
      // ANDROID / IOS
      // ───────────────────────────────────────────────────────────────────────
      else {
        base64 = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      // ───────────────────────────────────────────────────────────────────────
      // Send Base64 to backend
      // ───────────────────────────────────────────────────────────────────────

      const token = await Storage.getItemAsync("token");

      const res = await fetch(
        `${API_URL}/api/appointments/${appointment_id}/test-uploads`,
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            file_base64: base64,

            mime_type: file.mimeType || "application/pdf",

            original_filename: file.name || "test-result",
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));

        throw new Error(err.error ?? "Upload failed");
      }

      const data = await res.json();

      setAppt((prev) =>
        prev
          ? {
              ...prev,
              test_uploads: [...prev.test_uploads, data.upload],
            }
          : prev,
      );

      // Web uses browser alert
      if (Platform.OS === "web") {
        window.alert("Your test result has been sent to the doctor.");
      } else {
        Alert.alert(
          "Uploaded",
          "Your test result has been sent to the doctor.",
        );
      }
    } catch (e: any) {
      alertError(e.message ?? "Could not upload file");
    } finally {
      setUploadingTest(false);
    }
  }

  // ── Render states ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LinearGradient colors={["#0B1437", "#0F2060"]} style={s.center}>
        <ActivityIndicator color="#2563EB" size="large" />
      </LinearGradient>
    );
  }

  if (error || !appt) {
    return (
      <LinearGradient colors={["#0B1437", "#0F2060"]} style={s.center}>
        <Text style={s.errorText}>{error || "Appointment not found"}</Text>

        <TouchableOpacity onPress={() => router.back()} style={s.retryBtn}>
          <Text style={s.retryText}>Go back</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const meta = STATUS_META[appt.status] ?? STATUS_META.no_show;

  const slot = appt.requested_slot;
  const doctor = appt.doctor_id;

  const isOngoing = appt.status === "confirmed";

  const isCompleted = appt.status === "completed";

  const isPending = appt.status === "pending_admin_review";

  const canCancel = isOngoing || isPending;

  const canMessage = isOngoing;

  const testsRequested = appt.feedback?.tests_requested ?? [];

  const canUploadTests =
    (isOngoing || isCompleted) && testsRequested.length > 0;

  return (
    <LinearGradient
      colors={["#0B1437", "#0F2060", "#0B1437"]}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}

        <View
          style={[
            s.header,
            {
              paddingTop: insets.top + 12,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.backBtn}
            hitSlop={{
              top: 8,
              bottom: 8,
              left: 8,
              right: 8,
            }}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>

          <View
            style={{
              flex: 1,
              minWidth: 0,
            }}
          >
            <Text style={s.headerTitle}>Appointment</Text>

            {slot && (
              <Text style={s.headerSub}>
                {fmtDate(slot.date)} · {slot.start_time}–{slot.end_time}
              </Text>
            )}
          </View>

          <View
            style={[
              s.statusBadge,
              {
                backgroundColor: meta.bg,
                borderColor: meta.border,
              },
            ]}
          >
            <Text
              style={[
                s.statusBadgeText,
                {
                  color: meta.color,
                },
              ]}
            >
              {meta.label}
            </Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            s.container,
            {
              paddingBottom: insets.bottom + 20,
            },
          ]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({
              animated: false,
            })
          }
        >
          {/* Doctor info card */}

          {doctor && (
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <LinearGradient
                  colors={["#1E40AF", "#2563EB"]}
                  style={s.docAvatar}
                >
                  <Text style={s.docAvatarText}>
                    {(doctor.user_id?.name ?? "D").charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>

                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <Text style={s.docName} numberOfLines={1}>
                    {doctor.user_id?.name
                      ? `Dr. ${doctor.user_id.name}`
                      : "Your Doctor"}
                  </Text>

                  <Text style={s.docSpecialty} numberOfLines={1}>
                    {doctor.specialty}

                    {doctor.hospital_clinic
                      ? ` · ${doctor.hospital_clinic}`
                      : ""}
                  </Text>
                </View>
              </View>

              {doctor.location?.city && (
                <View style={s.infoRow}>
                  <Ionicons
                    name="location-outline"
                    size={13}
                    color="rgba(255,255,255,0.35)"
                  />

                  <Text style={s.infoText}>{doctor.location.city}</Text>
                </View>
              )}

              {doctor.contact?.phone && (
                <View style={s.infoRow}>
                  <Ionicons
                    name="call-outline"
                    size={13}
                    color="rgba(255,255,255,0.35)"
                  />

                  <Text style={s.infoText}>{doctor.contact.phone}</Text>
                </View>
              )}
            </View>
          )}

          {/* Doctor feedback */}

          {(isOngoing || isCompleted) && (
            <View style={s.feedbackCard}>
              <View style={s.feedbackHeader}>
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color="#60A5FA"
                />

                <Text style={s.feedbackTitle}>Doctor's Feedback</Text>
              </View>

              {appt.feedback ? (
                <>
                  {appt.feedback.notes ? (
                    <Text style={s.feedbackText}>{appt.feedback.notes}</Text>
                  ) : null}

                  {appt.feedback.recommendation ? (
                    <>
                      <Text style={s.feedbackLabel}>Recommendation</Text>

                      <Text style={s.feedbackText}>
                        {appt.feedback.recommendation}
                      </Text>
                    </>
                  ) : null}
                </>
              ) : (
                <Text style={s.feedbackPending}>
                  {isOngoing
                    ? "Not yet submitted — your doctor will add feedback when the appointment is complete."
                    : "No feedback was provided for this appointment."}
                </Text>
              )}
            </View>
          )}

          {/* Tests requested + upload */}

          {canUploadTests && (
            <View style={s.testsCard}>
              <View style={s.feedbackHeader}>
                <Ionicons name="flask-outline" size={16} color="#C4B5FD" />

                <Text
                  style={[
                    s.feedbackTitle,
                    {
                      color: "#C4B5FD",
                    },
                  ]}
                >
                  Tests Requested
                </Text>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 4,
                }}
              >
                {testsRequested.map((t, i) => (
                  <View key={i} style={s.testChip}>
                    <Text style={s.testChipText}>{t}</Text>
                  </View>
                ))}
              </View>

              {/* Upload button */}

              <TouchableOpacity
                style={[s.uploadBtn, uploadingTest && s.btnDisabled]}
                onPress={handleUploadTest}
                disabled={uploadingTest}
                activeOpacity={0.8}
              >
                {uploadingTest ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="cloud-upload-outline"
                      size={16}
                      color="#fff"
                    />

                    <Text style={s.uploadBtnText}>Upload Test Results</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Already uploaded results */}

              {appt.test_uploads.length > 0 && (
                <View
                  style={{
                    marginTop: 12,
                    gap: 8,
                  }}
                >
                  <Text style={s.uploadedLabel}>UPLOADED</Text>

                  {appt.test_uploads.map((u) => (
                    <TouchableOpacity
                      key={u._id}
                      style={s.uploadedRow}
                      onPress={() => Linking.openURL(u.file_url)}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={
                          u.file_type === "image"
                            ? "image-outline"
                            : "document-text-outline"
                        }
                        size={16}
                        color="#93C5FD"
                      />

                      <Text style={s.uploadedFilename} numberOfLines={1}>
                        {u.original_filename || "Test result"}
                      </Text>

                      <Ionicons
                        name="open-outline"
                        size={14}
                        color="rgba(255,255,255,0.35)"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Pending info note */}

          {isPending && (
            <View style={s.infoNote}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color="#FBBF24"
              />

              <Text style={s.infoNoteText}>
                Your appointment request is being reviewed. You'll be notified
                once confirmed.
              </Text>
            </View>
          )}

          {/* Cancelled note */}

          {appt.status === "cancelled" && (
            <View
              style={[
                s.infoNote,
                {
                  borderColor: "rgba(248,113,113,0.30)",
                  backgroundColor: "rgba(248,113,113,0.07)",
                },
              ]}
            >
              <Ionicons name="close-circle-outline" size={16} color="#F87171" />

              <Text
                style={[
                  s.infoNoteText,
                  {
                    color: "#FCA5A5",
                  },
                ]}
              >
                This appointment has been cancelled.
              </Text>
            </View>
          )}

          {/* Query / message thread */}

          {appt.queries.length > 0 && (
            <View style={s.threadSection}>
              <Text style={s.threadLabel}>MESSAGES</Text>

              {appt.queries.map((msg) => (
                <MessageBubble key={msg._id} msg={msg} />
              ))}
            </View>
          )}

          {/* No messages yet */}

          {isOngoing && appt.queries.length === 0 && (
            <View style={s.noMessages}>
              <Ionicons
                name="chatbubble-outline"
                size={28}
                color="rgba(255,255,255,0.15)"
              />

              <Text style={s.noMessagesText}>
                No messages yet. Send a message to your doctor below.
              </Text>
            </View>
          )}

          {/* Cancel button */}

          {canCancel && (
            <TouchableOpacity
              style={[s.cancelBtn, cancelling && s.btnDisabled]}
              onPress={handleCancel}
              disabled={cancelling}
              activeOpacity={0.78}
            >
              {cancelling ? (
                <ActivityIndicator color="#F87171" size="small" />
              ) : (
                <>
                  <Ionicons
                    name="close-circle-outline"
                    size={16}
                    color="#F87171"
                  />

                  <Text style={s.cancelBtnText}>Cancel Appointment</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Message compose bar */}

        {canMessage && (
          <View
            style={[
              s.compose,
              {
                paddingBottom: insets.bottom + 8,
              },
            ]}
          >
            <TextInput
              style={s.composeInput}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Message your doctor…"
              placeholderTextColor="rgba(255,255,255,0.30)"
              multiline
              maxLength={1000}
              returnKeyType="default"
            />

            <TouchableOpacity
              style={[
                s.sendBtn,
                (!messageText.trim() || sending) && s.sendBtnDisabled,
              ]}
              onPress={sendMessage}
              disabled={!messageText.trim() || sending}
              activeOpacity={0.8}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="send" size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>

      <Text style={s.summaryValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },

  summaryRow: {
    width: "100%",
    marginBottom: 12,
  },

  summaryLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },

  summaryValue: {
    fontSize: 14,
    lineHeight: 20,
  },

  errorText: {
    color: "#F87171",
    fontSize: 14,
    textAlign: "center",
  },

  retryBtn: {
    backgroundColor: "rgba(248,113,113,0.15)",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },

  retryText: {
    color: "#F87171",
    fontWeight: "700",
    fontSize: 13,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },

  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
  },

  headerSub: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 12,
    marginTop: 1,
  },

  statusBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 0,
  },

  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },

  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },

  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 10,
  },

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  docAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  docAvatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },

  docName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  docSpecialty: {
    color: "#93C5FD",
    fontSize: 12,
    marginTop: 2,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  infoText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
  },

  feedbackCard: {
    backgroundColor: "rgba(96,165,250,0.07)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.22)",
    gap: 8,
  },

  feedbackHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  feedbackTitle: {
    color: "#60A5FA",
    fontSize: 14,
    fontWeight: "700",
  },

  feedbackLabel: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  feedbackText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    lineHeight: 20,
  },

  feedbackPending: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 13,
    lineHeight: 19,
    fontStyle: "italic",
  },

  // ── Tests ───────────────────────────────────────────────────────────────────

  testsCard: {
    backgroundColor: "rgba(196,181,253,0.06)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(196,181,253,0.22)",
    gap: 4,
  },

  testChip: {
    backgroundColor: "rgba(196,181,253,0.12)",
    borderWidth: 1,
    borderColor: "rgba(196,181,253,0.30)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  testChipText: {
    color: "#DDD6FE",
    fontSize: 12,
    fontWeight: "600",
  },

  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#7C3AED",
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 12,
  },

  uploadBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  uploadedLabel: {
    color: "rgba(255,255,255,0.30)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },

  uploadedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  uploadedFilename: {
    flex: 1,
    color: "rgba(255,255,255,0.70)",
    fontSize: 12,
  },

  // ── Notes ───────────────────────────────────────────────────────────────────

  infoNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(251,191,36,0.07)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.25)",
    padding: 14,
  },

  infoNoteText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    flex: 1,
    lineHeight: 20,
  },

  // ── Messages ────────────────────────────────────────────────────────────────

  threadSection: {
    gap: 8,
  },

  threadLabel: {
    color: "rgba(255,255,255,0.30)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },

  noMessages: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 32,
  },

  noMessagesText: {
    color: "rgba(255,255,255,0.28)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },

  // ── Cancel ──────────────────────────────────────────────────────────────────

  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(248,113,113,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.28)",
    paddingVertical: 13,
    marginTop: 8,
  },

  cancelBtnText: {
    color: "#F87171",
    fontSize: 14,
    fontWeight: "700",
  },

  btnDisabled: {
    opacity: 0.5,
  },

  // ── Message compose ─────────────────────────────────────────────────────────

  compose: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(11,20,55,0.95)",
  },

  composeInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    maxHeight: 100,
  },

  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  sendBtnDisabled: {
    opacity: 0.4,
  },
});

// ── Message bubble styles ──────────────────────────────────────────────────────

const bubble = StyleSheet.create({
  row: {
    flexDirection: "row",
  },

  rowRight: {
    justifyContent: "flex-end",
  },

  rowLeft: {
    justifyContent: "flex-start",
  },

  wrap: {
    maxWidth: "78%",
    borderRadius: 16,
    padding: 12,
  },

  wrapPatient: {
    backgroundColor: "#2563EB",
    borderBottomRightRadius: 4,
  },

  wrapDoctor: {
    backgroundColor: "rgba(255,255,255,0.09)",
    borderBottomLeftRadius: 4,
  },

  text: {
    fontSize: 14,
    lineHeight: 21,
  },

  textPatient: {
    color: "#fff",
  },

  textDoctor: {
    color: "rgba(255,255,255,0.85)",
  },

  time: {
    fontSize: 10,
    marginTop: 4,
  },

  timePatient: {
    color: "rgba(255,255,255,0.50)",
    textAlign: "right",
  },

  timeDoctor: {
    color: "rgba(255,255,255,0.35)",
  },
});
