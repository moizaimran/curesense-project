import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_URL } from "@/constants/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DoctorProfile {
  _id: string;
  user_id: { name: string } | null;
  specialty: string;
  sub_specialty: string;
  gender: "male" | "female";
  location: { city: string; country: string };
  contact: { phone: string; email: string };
  education: { degree: string; institution: string; year: number }[];
  experience_years: number;
  hospital_clinic: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function doctorName(doc: DoctorProfile) {
  return doc.user_id?.name || "Dr. (Name unavailable)";
}

function topDegree(education: DoctorProfile["education"]) {
  if (!education?.length) return null;
  const sorted = [...education].sort((a, b) => b.year - a.year);
  return `${sorted[0].degree}, ${sorted[0].institution}`;
}

// ── Doctor card ────────────────────────────────────────────────────────────────

function DoctorCard({
  doc,
  onPress,
}: {
  doc: DoctorProfile;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.78}>
      {/* Avatar initial + name */}
      <View style={s.cardHeader}>
        <LinearGradient colors={["#1E40AF", "#2563EB"]} style={s.avatar}>
          <Text style={s.avatarText}>
            {doctorName(doc).charAt(0).toUpperCase()}
          </Text>
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.name} numberOfLines={1}>
            Dr. {doctorName(doc)}
          </Text>
          <Text style={s.specialty} numberOfLines={1}>
            {doc.specialty}
            {doc.sub_specialty ? ` · ${doc.sub_specialty}` : ""}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={16}
          color="rgba(255,255,255,0.25)"
        />
      </View>

      {/* Meta row */}
      <View style={s.metaRow}>
        {doc.experience_years > 0 && (
          <MetaChip
            icon="time-outline"
            label={`${doc.experience_years}y exp`}
            color="#60A5FA"
          />
        )}
        {doc.location?.city ? (
          <MetaChip
            icon="location-outline"
            label={doc.location.city}
            color="#A78BFA"
          />
        ) : null}
        {doc.gender ? (
          <MetaChip
            icon={doc.gender === "female" ? "person-outline" : "person-outline"}
            label={doc.gender.charAt(0).toUpperCase() + doc.gender.slice(1)}
            color="#94A3B8"
          />
        ) : null}
      </View>

      {/* Hospital */}
      {doc.hospital_clinic ? (
        <View style={s.hospitalRow}>
          <Ionicons
            name="business-outline"
            size={12}
            color="rgba(255,255,255,0.35)"
          />
          <Text style={s.hospitalText} numberOfLines={1}>
            {doc.hospital_clinic}
          </Text>
        </View>
      ) : null}

      {/* Top education */}
      {topDegree(doc.education) ? (
        <View style={s.hospitalRow}>
          <Ionicons
            name="school-outline"
            size={12}
            color="rgba(255,255,255,0.35)"
          />
          <Text style={s.hospitalText} numberOfLines={1}>
            {topDegree(doc.education)}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function MetaChip({
  icon,
  label,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  color: string;
}) {
  return (
    <View style={[s.chip, { borderColor: `${color}30` }]}>
      <Ionicons name={icon} size={11} color={color} />
      <Text style={[s.chipText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function FindDoctorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { report_id, specialty, session_id } = useLocalSearchParams<{
    report_id: string;
    specialty: string;
    session_id: string;
  }>();

  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState<"" | "male" | "female">("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonically-increasing ID — each new fetch increments it; stale responses
  // whose ID doesn't match the current one are silently discarded.
  const requestIdRef = useRef(0);

  useEffect(() => {
    setPage(1);
    setDoctors([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchDoctors(1, true), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, cityFilter, genderFilter]);

  async function fetchDoctors(targetPage: number, reset = false) {
    // Stamp this request; any earlier in-flight request that completes later
    // will see a different ID and discard its result.
    const myId = ++requestIdRef.current;

    if (reset) setLoading(true);
    else setLoadingMore(true);
    setError("");
    try {
      const token = await Storage.getItemAsync("token");
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: "20",
      });
      if (search.trim()) params.set("specialty", search.trim());
      if (cityFilter.trim()) params.set("city", cityFilter.trim());
      if (genderFilter) params.set("gender", genderFilter);

      const res = await fetch(`${API_URL}/api/doctors?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load doctors");
      const data = await res.json();

      // Discard if a newer request has already superseded this one
      if (myId !== requestIdRef.current) return;

      setTotal(data.total);
      setDoctors((prev) => (reset ? data.results : [...prev, ...data.results]));
      setPage(targetPage);
    } catch (e: any) {
      if (myId !== requestIdRef.current) return;
      setError(e.message ?? "Could not load doctors");
    } finally {
      if (myId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  function loadMore() {
    if (loadingMore || doctors.length >= total) return;
    fetchDoctors(page + 1);
  }

  function selectDoctor(doc: DoctorProfile) {
    router.push({
      pathname: "/(patient)/book-appointment",
      params: {
        doctor_profile_id: doc._id,
        doctor_name: doctorName(doc),
        specialty: doc.specialty,
        report_id: report_id ?? "",
        session_id: session_id ?? "",
      },
    } as any);
  }

  return (
    <LinearGradient
      colors={["#0B1437", "#0F2060", "#0B1437"]}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />

      {/* Header */}
      <View
        style={[s.header, { paddingTop: insets.top + 12, paddingBottom: 12 }]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headerTitle}>Find a Doctor</Text>
          {specialty ? (
            <Text style={s.headerSub} numberOfLines={1}>
              Recommended: {specialty}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Search + filters */}
      <View style={s.filterWrap}>
        {/* Specialty search */}
        <View style={s.searchRow}>
          <Ionicons
            name="search-outline"
            size={16}
            color="rgba(255,255,255,0.40)"
          />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search specialty…"
            placeholderTextColor="rgba(255,255,255,0.30)"
            returnKeyType="search"
            autoCorrect={false}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons
                name="close-circle"
                size={16}
                color="rgba(255,255,255,0.35)"
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* City filter */}
        <View style={[s.searchRow, { marginTop: 8 }]}>
          <Ionicons
            name="location-outline"
            size={16}
            color="rgba(255,255,255,0.40)"
          />
          <TextInput
            style={s.searchInput}
            value={cityFilter}
            onChangeText={setCityFilter}
            placeholder="Filter by city…"
            placeholderTextColor="rgba(255,255,255,0.30)"
            returnKeyType="search"
            autoCorrect={false}
          />
          {cityFilter ? (
            <TouchableOpacity onPress={() => setCityFilter("")}>
              <Ionicons
                name="close-circle"
                size={16}
                color="rgba(255,255,255,0.35)"
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Gender filter pills */}
        <View style={s.genderRow}>
          {(["", "male", "female"] as const).map((g) => (
            <TouchableOpacity
              key={g || "any"}
              style={[s.genderPill, genderFilter === g && s.genderPillActive]}
              onPress={() => setGenderFilter(g)}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  s.genderPillText,
                  genderFilter === g && s.genderPillTextActive,
                ]}
              >
                {g === ""
                  ? "Any gender"
                  : g.charAt(0).toUpperCase() + g.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Result count */}
      {!loading && (
        <View style={s.resultCount}>
          <Text style={s.resultCountText}>
            {total} doctor{total !== 1 ? "s" : ""} found
          </Text>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#2563EB" size="large" />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={32} color="#F87171" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={() => fetchDoctors(1, true)}
            style={s.retryBtn}
          >
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : doctors.length === 0 ? (
        <View style={s.center}>
          <Ionicons
            name="person-remove-outline"
            size={40}
            color="rgba(255,255,255,0.15)"
          />
          <Text style={s.emptyTitle}>No doctors found</Text>
          <Text style={s.emptySub}>Try adjusting your filters</Text>
        </View>
      ) : (
        <FlatList
          data={doctors}
          keyExtractor={(d) => d._id}
          renderItem={({ item }) => (
            <DoctorCard doc={item} onPress={() => selectDoctor(item)} />
          )}
          contentContainerStyle={[
            s.list,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                color="#2563EB"
                style={{ marginVertical: 16 }}
              />
            ) : null
          }
        />
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

  filterWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    padding: 0,
  },

  genderRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  genderPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  genderPillActive: {
    backgroundColor: "rgba(37,99,235,0.30)",
    borderColor: "rgba(37,99,235,0.60)",
  },
  genderPillText: {
    color: "rgba(255,255,255,0.50)",
    fontSize: 12,
    fontWeight: "600",
  },
  genderPillTextActive: { color: "#93C5FD" },

  resultCount: { paddingHorizontal: 16, paddingVertical: 8 },
  resultCountText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    fontWeight: "600",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  errorText: { color: "#F87171", fontSize: 14, textAlign: "center" },
  retryBtn: {
    backgroundColor: "rgba(248,113,113,0.15)",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  retryText: { color: "#F87171", fontWeight: "700", fontSize: 13 },
  emptyTitle: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 17,
    fontWeight: "700",
  },
  emptySub: { color: "rgba(255,255,255,0.25)", fontSize: 13 },

  list: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },

  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    gap: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  name: { color: "#fff", fontSize: 15, fontWeight: "700" },
  specialty: { color: "#93C5FD", fontSize: 12, marginTop: 2 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipText: { fontSize: 11, fontWeight: "600" },

  hospitalRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  hospitalText: { color: "rgba(255,255,255,0.40)", fontSize: 12, flex: 1 },
});
