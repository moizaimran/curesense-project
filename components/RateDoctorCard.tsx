// Post-case "Rate your doctor" card for the patient app.
// Loads the patient's existing review (if any) and lets them submit or edit it.
import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { API_URL } from "@/constants/api";

const COMMENT_MAX = 1000;
const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

interface Review {
  rating: number;
  comment: string;
}

export function Stars({
  value,
  onChange,
  size = 28,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  return (
    <View style={s.starsRow} accessibilityRole={onChange ? "adjustable" : "image"} accessibilityLabel={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = (
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={size}
            color={n <= value ? "#FBBF24" : "rgba(255,255,255,0.25)"}
          />
        );
        return onChange ? (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(n)}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}
          >
            {icon}
          </TouchableOpacity>
        ) : (
          <View key={n}>{icon}</View>
        );
      })}
    </View>
  );
}

export default function RateDoctorCard({
  appointmentId,
  doctorName,
}: {
  appointmentId: string;
  doctorName?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Review | null>(null);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await Storage.getAuthToken();
        const res = await fetch(`${API_URL}/api/appointments/${appointmentId}/reviews`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Could not load your review");
        const mine: Review | null = data.patient_review;
        setSaved(mine);
        setRating(mine?.rating ?? 0);
        setComment(mine?.comment ?? "");
        setEditing(!mine);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? "Could not load your review");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  async function submit() {
    if (!rating) {
      setError("Please tap a star to rate your doctor.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const token = await Storage.getAuthToken();
      const res = await fetch(`${API_URL}/api/appointments/${appointmentId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, comment: comment.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save your review");
      setSaved(data.review);
      setEditing(false);
    } catch (e: any) {
      setError(e.message ?? "Could not save your review");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={s.card}>
      <View style={s.titleRow}>
        <Ionicons name="star-outline" size={16} color="#FBBF24" />
        <Text style={s.title}>
          {saved && !editing ? "Your review" : `Rate ${doctorName ? `Dr. ${doctorName}` : "your doctor"}`}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#2563EB" style={{ marginVertical: 12 }} />
      ) : editing ? (
        <>
          <Text style={s.sub}>How was your experience? Your review helps other patients.</Text>
          <Stars value={rating} onChange={(v) => { setRating(v); setError(""); }} />
          {rating > 0 && <Text style={s.ratingLabel}>{LABELS[rating]}</Text>}
          <TextInput
            style={s.input}
            value={comment}
            onChangeText={setComment}
            placeholder="Share a few words about your experience (optional)"
            placeholderTextColor="rgba(255,255,255,0.30)"
            multiline
            maxLength={COMMENT_MAX}
          />
          <Text style={s.counter}>{comment.length}/{COMMENT_MAX}</Text>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <View style={s.actions}>
            {saved && (
              <TouchableOpacity
                onPress={() => {
                  setEditing(false);
                  setRating(saved.rating);
                  setComment(saved.comment ?? "");
                  setError("");
                }}
                style={s.secondaryBtn}
              >
                <Text style={s.secondaryText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={submit}
              disabled={submitting}
              style={[s.primaryBtn, (submitting || !rating) && { opacity: 0.5 }]}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.primaryText}>{saved ? "Update review" : "Submit review"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : saved ? (
        <>
          <Stars value={saved.rating} size={22} />
          {saved.comment ? <Text style={s.savedComment}>“{saved.comment}”</Text> : null}
          <TouchableOpacity onPress={() => setEditing(true)} style={{ marginTop: 8 }}>
            <Text style={s.editLink}>Edit review</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={s.error}>{error}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "rgba(251,191,36,0.06)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.25)",
    gap: 10,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: "#fff", fontSize: 15, fontWeight: "700" },
  sub: { color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 18 },
  starsRow: { flexDirection: "row", gap: 6 },
  ratingLabel: { color: "#FCD34D", fontSize: 13, fontWeight: "700" },
  input: {
    minHeight: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#fff",
    padding: 12,
    fontSize: 14,
    textAlignVertical: "top",
  },
  counter: { color: "rgba(255,255,255,0.30)", fontSize: 11, alignSelf: "flex-end" },
  error: { color: "#F87171", fontSize: 13 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  primaryBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    minWidth: 130,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  secondaryBtn: { paddingVertical: 10, paddingHorizontal: 12 },
  secondaryText: { color: "rgba(255,255,255,0.55)", fontWeight: "600", fontSize: 14 },
  savedComment: { color: "rgba(255,255,255,0.80)", fontSize: 14, lineHeight: 20, fontStyle: "italic" },
  editLink: { color: "#60A5FA", fontWeight: "700", fontSize: 13 },
});
