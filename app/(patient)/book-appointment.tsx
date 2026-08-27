import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_URL } from "@/constants/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TimeSlot {
  start_time: string;
  end_time: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function toIsoDate(date: Date) {
  // Build the date string from LOCAL components — never use toISOString()
  // here, since that converts to UTC first and can shift the date back
  // a day for timezones ahead of UTC (e.g. PKT, UTC+5).
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function calendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  return [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: lastDate }, (_, i) => new Date(year, month, i + 1)),
  ];
}

// ── Calendar day cell ──────────────────────────────────────────────────────────

function DayCell({
  date,
  selected,
  isToday,
  isPast,
  onPress,
}: {
  date: Date | null;
  selected: string | null;
  isToday: boolean;
  isPast: boolean;
  onPress: (d: Date) => void;
}) {
  if (!date) return <View style={cal.cellBlank} />;

  const isSelected = selected === toIsoDate(date);

  return (
    <TouchableOpacity
      style={[
        cal.cell,
        isSelected && cal.cellSelected,
        isToday && !isSelected && cal.cellToday,
        isPast && !isSelected && cal.cellPast,
      ]}
      onPress={() => !isPast && onPress(date)}
      disabled={isPast}
      activeOpacity={0.75}
    >
      <Text
        style={[
          cal.cellText,
          isSelected && cal.cellTextSelected,
          isPast && cal.cellTextPast,
        ]}
      >
        {date.getDate()}
      </Text>
    </TouchableOpacity>
  );
}

// ── Time slot pill ─────────────────────────────────────────────────────────────

function SlotPill({
  slot,
  selected,
  onPress,
}: {
  slot: TimeSlot;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[slotS.pill, selected && slotS.pillSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[slotS.pillText, selected && slotS.pillTextSelected]}>
        {slot.start_time}
      </Text>
    </TouchableOpacity>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function BookAppointmentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { doctor_profile_id, doctor_name, specialty, report_id, session_id } =
    useLocalSearchParams<{
      doctor_profile_id: string;
      doctor_name: string;
      specialty: string;
      report_id: string;
      session_id: string;
    }>();

  const today = useRef(new Date()).current;
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const [booking, setBooking] = useState(false);

  // ── Load slots when date selected ────────────────────────────────────────────
  useEffect(() => {
    if (!selectedDate || !doctor_profile_id) return;
    setSlotsLoading(true);
    setSlotsError("");
    setSelectedSlot(null);
    setSlots([]);

    Storage.getItemAsync("token").then((token) => {
      fetch(
        `${API_URL}/api/doctors/${doctor_profile_id}/availability?date=${selectedDate}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
        .then((r) => r.json())
        .then((data) => {
          setSlots(data.slots ?? []);
          if ((data.slots ?? []).length === 0 && !data.reason) {
            setSlotsError("No available slots for this day.");
          }
        })
        .catch(() => setSlotsError("Could not load available slots."))
        .finally(() => setSlotsLoading(false));
    });
  }, [selectedDate, doctor_profile_id]);

  // ── Month navigation ──────────────────────────────────────────────────────────
  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else setViewMonth((m) => m + 1);
  }

  // ── Confirm booking ───────────────────────────────────────────────────────────
  async function confirmBooking() {
    if (!selectedDate || !selectedSlot) return;
    if (!report_id) {
      Alert.alert(
        "No report linked",
        "Please select a report to share with the doctor before booking.",
      );
      return;
    }
    setBooking(true);
    try {
      const token = await Storage.getItemAsync("token");
      const res = await fetch(`${API_URL}/api/appointments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          doctor_profile_id,
          report_id,
          slot: {
            date: selectedDate,
            start_time: selectedSlot.start_time,
            end_time: selectedSlot.end_time,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Booking failed");
      }

      Alert.alert(
        "Appointment Requested",
        `Your appointment with Dr. ${doctor_name} on ${selectedDate} at ${selectedSlot.start_time} has been submitted for review.`,
        [
          {
            text: "OK",
            onPress: () => router.replace("/(patient)/(tabs)/chat" as any),
          },
        ],
      );
    } catch (e: any) {
      Alert.alert("Booking Failed", e.message ?? "Please try again.");
    } finally {
      setBooking(false);
    }
  }

  const cells = calendarDays(viewYear, viewMonth);
  const todayStr = toIsoDate(today);

  return (
    <LinearGradient
      colors={["#0B1437", "#0F2060", "#0B1437"]}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headerTitle} numberOfLines={1}>
            Book Appointment
          </Text>
          <Text style={s.headerSub} numberOfLines={1}>
            Dr. {doctor_name} · {specialty}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          s.container,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Calendar ───────────────────────────────────────────────────────── */}
        <View style={s.section}>
          {/* Month nav */}
          <View style={cal.nav}>
            <TouchableOpacity
              onPress={prevMonth}
              style={cal.navBtn}
              disabled={
                viewYear === today.getFullYear() &&
                viewMonth === today.getMonth()
              }
            >
              <Ionicons
                name="chevron-back"
                size={18}
                color="rgba(255,255,255,0.60)"
              />
            </TouchableOpacity>
            <Text style={cal.navTitle}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={cal.navBtn}>
              <Ionicons
                name="chevron-forward"
                size={18}
                color="rgba(255,255,255,0.60)"
              />
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={cal.dayHeaders}>
            {DAY_NAMES.map((d) => (
              <Text key={d} style={cal.dayHeader}>
                {d}
              </Text>
            ))}
          </View>

          {/* Day grid */}
          <View style={cal.grid}>
            {cells.map((date, i) => {
              const isPast = date !== null && toIsoDate(date) < todayStr;
              const isToday = date !== null && toIsoDate(date) === todayStr;
              return (
                <DayCell
                  key={i}
                  date={date}
                  selected={selectedDate}
                  isToday={isToday}
                  isPast={isPast}
                  onPress={(d) => setSelectedDate(toIsoDate(d))}
                />
              );
            })}
          </View>
        </View>

        {/* ── Time Slots ─────────────────────────────────────────────────────── */}
        {selectedDate && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons
                name="time-outline"
                size={15}
                color="rgba(255,255,255,0.40)"
              />
              <Text style={s.sectionLabel}>
                Available slots · {selectedDate}
              </Text>
            </View>

            {slotsLoading ? (
              <ActivityIndicator
                color="#2563EB"
                style={{ marginVertical: 20 }}
              />
            ) : slotsError ? (
              <Text style={s.slotsError}>{slotsError}</Text>
            ) : slots.length === 0 ? (
              <Text style={s.slotsEmpty}>No slots available on this day.</Text>
            ) : (
              <View style={slotS.grid}>
                {slots.map((slot, i) => (
                  <SlotPill
                    key={i}
                    slot={slot}
                    selected={selectedSlot?.start_time === slot.start_time}
                    onPress={() => setSelectedSlot(slot)}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Booking summary ────────────────────────────────────────────────── */}
        {selectedDate && selectedSlot && (
          <View style={s.summary}>
            <Text style={s.summaryTitle}>Appointment Summary</Text>
            <SummaryRow label="Doctor" value={`Dr. ${doctor_name}`} />
            <SummaryRow label="Specialty" value={specialty ?? "—"} />
            <SummaryRow label="Date" value={selectedDate} />
            <SummaryRow
              label="Time"
              value={`${selectedSlot.start_time} – ${selectedSlot.end_time}`}
            />
            <SummaryRow
              label="Report shared"
              value={report_id ? "Yes — AI interview report" : "None"}
            />

            <TouchableOpacity
              style={[s.confirmBtn, booking && s.confirmBtnDisabled]}
              onPress={confirmBooking}
              disabled={booking}
              activeOpacity={0.82}
            >
              {booking ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color="#fff"
                  />
                  <Text style={s.confirmBtnText}>Confirm Appointment</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={s.reviewNote}>
              Your appointment request will be reviewed by admin before the
              doctor is notified.
            </Text>
          </View>
        )}
      </ScrollView>
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
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 1 },

  container: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },

  section: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  slotsError: {
    color: "#F87171",
    fontSize: 13,
    textAlign: "center",
    marginVertical: 12,
  },
  slotsEmpty: {
    color: "rgba(255,255,255,0.30)",
    fontSize: 13,
    textAlign: "center",
    marginVertical: 12,
  },

  summary: {
    backgroundColor: "rgba(37,99,235,0.08)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.25)",
    gap: 10,
  },
  summaryTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    gap: 12,
  },
  summaryLabel: { color: "rgba(255,255,255,0.45)", fontSize: 13 },
  summaryValue: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    maxWidth: "60%",
    textAlign: "right",
  },

  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 4,
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  reviewNote: {
    color: "rgba(255,255,255,0.28)",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
});

const cal = StyleSheet.create({
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  navBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },

  dayHeaders: { flexDirection: "row", marginBottom: 4 },
  dayHeader: {
    flex: 1,
    textAlign: "center",
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    fontWeight: "700",
    paddingVertical: 4,
  },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  cellBlank: { width: `${100 / 7}%`, aspectRatio: 1 },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  cellSelected: { backgroundColor: "#2563EB" },
  cellToday: {
    backgroundColor: "rgba(37,99,235,0.18)",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.50)",
  },
  cellPast: { opacity: 0.25 },
  cellText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  cellTextSelected: { color: "#fff", fontWeight: "800" },
  cellTextPast: { color: "rgba(255,255,255,0.40)" },
});

const slotS = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  pillSelected: {
    backgroundColor: "rgba(37,99,235,0.30)",
    borderColor: "rgba(37,99,235,0.65)",
  },
  pillText: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 13,
    fontWeight: "600",
  },
  pillTextSelected: { color: "#93C5FD", fontWeight: "700" },
});
