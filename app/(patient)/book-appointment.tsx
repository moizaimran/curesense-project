import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
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

interface AvailableDate {
  date: string; // "YYYY-MM-DD"
  capacity_mode: boolean;
  start_time: string | null;
  end_time: string | null;
  max_patients?: number;
  spots_left?: number;
  full: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Format "YYYY-MM-DD" into a friendly "Sat, 20 Sep" label without any Date()
// timezone conversion — parse the string parts directly.
function formatDateLabel(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(year, month - 1, day); // local, no UTC shift
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short" });
  const monthName = d.toLocaleDateString("en-GB", { month: "short" });
  return { weekday, day, monthName };
}

function formatFullDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ── Date button ────────────────────────────────────────────────────────────────

function DateButton({
  item,
  selected,
  onPress,
}: {
  item: AvailableDate;
  selected: boolean;
  onPress: () => void;
}) {
  const { weekday, day, monthName } = formatDateLabel(item.date);
  const disabled = item.full;

  return (
    <TouchableOpacity
      style={[
        dateBtn.card,
        selected && dateBtn.cardSelected,
        disabled && dateBtn.cardDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.78}
    >
      <Text
        style={[
          dateBtn.weekday,
          selected && dateBtn.textSelected,
          disabled && dateBtn.textDisabled,
        ]}
      >
        {weekday}
      </Text>
      <Text
        style={[
          dateBtn.day,
          selected && dateBtn.textSelected,
          disabled && dateBtn.textDisabled,
        ]}
      >
        {day}
      </Text>
      <Text
        style={[
          dateBtn.month,
          selected && dateBtn.textSelected,
          disabled && dateBtn.textDisabled,
        ]}
      >
        {monthName}
      </Text>
      {item.capacity_mode && !disabled && (
        <Text style={[dateBtn.badge, selected && dateBtn.badgeSelected]}>
          {item.spots_left} left
        </Text>
      )}
      {disabled && <Text style={dateBtn.fullBadge}>Full</Text>}
    </TouchableOpacity>
  );
}

// ── Time slot pill ─────────────────────────────────────────────────────────────

function SlotPill({
  slot,
  selected,
  capacityMode,
  spotsLeft,
  onPress,
}: {
  slot: TimeSlot;
  selected: boolean;
  capacityMode?: boolean;
  spotsLeft?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[slotS.pill, selected && slotS.pillSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[slotS.pillText, selected && slotS.pillTextSelected]}>
        {capacityMode
          ? `${slot.start_time} – ${slot.end_time}`
          : slot.start_time}
      </Text>
      {capacityMode && typeof spotsLeft === "number" && (
        <Text style={[slotS.pillSub, selected && slotS.pillTextSelected]}>
          {spotsLeft} spots left
        </Text>
      )}
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

  const [availableDates, setAvailableDates] = useState<AvailableDate[]>([]);
  const [datesLoading, setDatesLoading] = useState(true);
  const [datesError, setDatesError] = useState("");

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [slotsCapacityMode, setSlotsCapacityMode] = useState(false);
  const [slotsSpotsLeft, setSlotsSpotsLeft] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const [booking, setBooking] = useState(false);

  // ── Load the doctor's available dates (buttons) ──────────────────────────────
  useEffect(() => {
    if (!doctor_profile_id) return;
    loadAvailableDates();
  }, [doctor_profile_id]);

  async function loadAvailableDates() {
    setDatesLoading(true);
    setDatesError("");
    try {
      const token = await Storage.getItemAsync("token");
      const res = await fetch(
        `${API_URL}/api/doctors/${doctor_profile_id}/availability/dates`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      const dates: AvailableDate[] = data.dates ?? [];
      setAvailableDates(dates);
      if (dates.length === 0) {
        setDatesError("This doctor has no available dates right now.");
      }
    } catch {
      setDatesError("Could not load available dates.");
    } finally {
      setDatesLoading(false);
    }
  }

  // ── Load slots when a date button is tapped ──────────────────────────────────
  useEffect(() => {
    if (!selectedDate || !doctor_profile_id) return;
    setSlotsLoading(true);
    setSlotsError("");
    setSelectedSlot(null);
    setSlots([]);
    setSlotsCapacityMode(false);
    setSlotsSpotsLeft(null);

    Storage.getItemAsync("token").then((token) => {
      fetch(
        `${API_URL}/api/doctors/${doctor_profile_id}/availability?date=${selectedDate}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
        .then((r) => r.json())
        .then((data) => {
          setSlots(data.slots ?? []);
          setSlotsCapacityMode(Boolean(data.capacity_mode));
          setSlotsSpotsLeft(
            typeof data.spots_left === "number" ? data.spots_left : null,
          );

          if ((data.slots ?? []).length === 0) {
            setSlotsError(
              data.full
                ? "This day just filled up — please pick another date."
                : data.reason || "No available slots for this day.",
            );

            // If it just became full, refresh the date list so this
            // button shows as "Full" and the patient can pick elsewhere.
            if (data.full) {
              loadAvailableDates();
            }
          }
        })
        .catch(() => setSlotsError("Could not load available slots."))
        .finally(() => setSlotsLoading(false));
    });
  }, [selectedDate, doctor_profile_id]);

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
      // If the day filled up right as we tried to book, refresh both the
      // date list and the slots for this date so the patient sees it.
      if (e.message?.toLowerCase().includes("fully booked")) {
        loadAvailableDates();
        setSelectedDate(null);
      }
      Alert.alert("Booking Failed", e.message ?? "Please try again.");
    } finally {
      setBooking(false);
    }
  }

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
        {/* ── Available dates (buttons, not a free calendar) ───────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons
              name="calendar-outline"
              size={15}
              color="rgba(255,255,255,0.40)"
            />
            <Text style={s.sectionLabel}>Available Dates</Text>
          </View>

          {datesLoading ? (
            <ActivityIndicator color="#2563EB" style={{ marginVertical: 20 }} />
          ) : datesError && availableDates.length === 0 ? (
            <Text style={s.slotsEmpty}>{datesError}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {availableDates.map((item) => (
                  <DateButton
                    key={item.date}
                    item={item}
                    selected={selectedDate === item.date}
                    onPress={() => setSelectedDate(item.date)}
                  />
                ))}
              </View>
            </ScrollView>
          )}
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
              <Text style={s.sectionLabel}>{formatFullDate(selectedDate)}</Text>
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
                    capacityMode={slotsCapacityMode}
                    spotsLeft={slotsSpotsLeft ?? undefined}
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
            <SummaryRow label="Date" value={formatFullDate(selectedDate)} />
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

const dateBtn = StyleSheet.create({
  card: {
    width: 68,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    gap: 2,
  },
  cardSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  cardDisabled: {
    opacity: 0.35,
  },
  weekday: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  day: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 2,
  },
  month: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "600",
  },
  textSelected: { color: "#fff" },
  textDisabled: { color: "rgba(255,255,255,0.35)" },
  badge: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "700",
    color: "#C4B5FD",
  },
  badgeSelected: { color: "#DBEAFE" },
  fullBadge: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "800",
    color: "#F87171",
    textTransform: "uppercase",
  },
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
  pillSub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    marginTop: 2,
  },
  pillTextSelected: { color: "#93C5FD", fontWeight: "700" },
});
