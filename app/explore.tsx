import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const C = {
  bg:     "#050816",
  bg2:    "#08112A",
  blue:   "#3B82F6",
  violet: "#8B5CF6",
  cyan:   "#38BDF8",
  teal:   "#2DD4BF",
  green:  "#34D399",
  amber:  "#FBBF24",
  white:  "#FFFFFF",
  text:   "#EAF1FF",
  muted:  "rgba(234,241,255,0.58)",
  soft:   "rgba(234,241,255,0.36)",
  border: "rgba(255,255,255,0.09)",
};

// ── Animated play button pulse ────────────────────────────────────────────────

function PlayPulse() {
  const ring = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ring, {
            toValue: 1.35,
            duration: 1200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(ring, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    ).start();
  }, []);

  return (
    <View style={v.playWrap}>
      {/* Pulsing ring */}
      <Animated.View
        style={[
          v.playRing,
          { transform: [{ scale: ring }], opacity: ringOpacity },
        ]}
      />
      {/* Play circle */}
      <LinearGradient
        colors={[C.blue, C.violet]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={v.playCircle}
      >
        <Ionicons name="play" size={22} color={C.white} style={{ marginLeft: 3 }} />
      </LinearGradient>
    </View>
  );
}

// ── Demo video card ───────────────────────────────────────────────────────────

function VideoCard() {
  const waveAnim = useRef(
    Array.from({ length: 18 }, () => new Animated.Value(0.3 + Math.random() * 0.4)),
  ).current;

  useEffect(() => {
    waveAnim.forEach((bar, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 60),
          Animated.timing(bar, {
            toValue: 0.2 + Math.random() * 0.8,
            duration: 550 + i * 30,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0.3 + Math.random() * 0.4,
            duration: 550 + i * 30,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    });
  }, []);

  return (
    <View style={v.card}>
      {/* Gradient backdrop */}
      <LinearGradient
        colors={["#0D1E50", "#091438", "#050E2A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={v.cardInner}
      >
        {/* Corner glows */}
        <View style={[v.glow, { top: -30, left: -30, backgroundColor: "rgba(59,130,246,0.20)" }]} />
        <View style={[v.glow, { bottom: -20, right: -20, backgroundColor: "rgba(139,92,246,0.18)" }]} />

        {/* Top bar: label + duration */}
        <View style={v.cardTopRow}>
          <View style={v.liveBadge}>
            <View style={v.liveDot} />
            <Text style={v.liveLabel}>DEMO</Text>
          </View>
          <Text style={v.durationText}>2:34</Text>
        </View>

        {/* Waveform visualiser */}
        <View style={v.waveRow}>
          {waveAnim.map((bar, i) => (
            <Animated.View
              key={i}
              style={[
                v.waveBar,
                {
                  transform: [{ scaleY: bar }],
                  backgroundColor: i % 3 === 0 ? C.cyan : i % 3 === 1 ? C.blue : C.violet,
                },
              ]}
            />
          ))}
        </View>

        {/* Play button */}
        <PlayPulse />

        {/* Bottom label */}
        <Text style={v.cardLabel}>CureSense Product Overview</Text>
        <Text style={v.cardSubLabel}>Full demo video coming soon</Text>
      </LinearGradient>
    </View>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────

function FeatureCard({
  icon, title, desc, color,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <View style={[f.card, { borderColor: `${color}22` }]}>
      <View style={[f.icon, { backgroundColor: `${color}14`, borderColor: `${color}28` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={f.title}>{title}</Text>
      <Text style={f.desc}>{desc}</Text>
    </View>
  );
}

// ── Step row ──────────────────────────────────────────────────────────────────

function Step({
  n, icon, title, desc, last,
}: {
  n: string; icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string; desc: string; last?: boolean;
}) {
  return (
    <View style={st.row}>
      <View style={st.left}>
        <LinearGradient colors={[C.blue, C.violet]} style={st.icon}>
          <Ionicons name={icon} size={16} color={C.white} />
        </LinearGradient>
        {!last && <View style={st.line} />}
      </View>
      <View style={[st.content, last && { paddingBottom: 0 }]}>
        <Text style={st.n}>{n}</Text>
        <Text style={st.title}>{title}</Text>
        <Text style={st.desc}>{desc}</Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />

      {/* Back button row — static, part of layout */}
      <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={18} color={C.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[s.container, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero text ── */}
        <View style={s.hero}>
          <View style={s.heroBadge}>
            <Ionicons name="sparkles" size={11} color={C.white} />
            <Text style={s.heroBadgeText}>AI-POWERED HEALTHCARE</Text>
          </View>
          <Text style={s.heroTitle}>
            Your symptoms.{"\n"}
            <Text style={{ color: C.cyan }}>Finally understood.</Text>
          </Text>
          <Text style={s.heroSub}>
            CureSense is a smart health assistant that listens to how you feel, asks the right
            follow-up questions, and turns your answers into a clear report — so every doctor
            visit starts better prepared.
          </Text>
        </View>

        {/* ── Demo video card ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>See it in action</Text>
          <VideoCard />
        </View>

        {/* ── About ── */}
        <View style={s.aboutCard}>
          <View style={s.aboutHeader}>
            <Ionicons name="information-circle-outline" size={18} color={C.cyan} />
            <Text style={s.aboutTitle}>What is CureSense?</Text>
          </View>
          <Text style={s.aboutText}>
            CureSense is a mobile health companion designed to bridge the gap between patients and
            doctors. Instead of rushing through a 10-minute appointment trying to remember every
            symptom, you talk to our AI before you go — in plain language, at your own pace.
          </Text>
          <Text style={[s.aboutText, { marginTop: 10 }]}>
            The AI asks smart follow-up questions, checks for potential medication interactions,
            and generates a structured clinical summary your doctor can read in seconds. You can
            also upload X-rays, CT scans, or PDF reports and get an AI-assisted analysis linked
            directly to your consultation findings.
          </Text>
          <View style={s.pillRow}>
            {["AI Consultation", "Scan Analysis", "Doctor Summary", "Secure & Private"].map((p) => (
              <View key={p} style={s.pill}>
                <Text style={s.pillText}>{p}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Features ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>What you get</Text>
          <View style={s.featureGrid}>
            <FeatureCard
              icon="chatbubble-ellipses-outline"
              title="AI Doctor Consultation"
              desc="Adaptive questions that follow your symptoms — not a rigid form."
              color={C.cyan}
            />
            <FeatureCard
              icon="scan-outline"
              title="Scan & Image Analysis"
              desc="Upload X-rays or CT scans and get an AI-powered medical read-out."
              color={C.violet}
            />
            <FeatureCard
              icon="document-text-outline"
              title="Clinical Summary"
              desc="Your answers become a structured report that your doctor can act on."
              color={C.teal}
            />
            <FeatureCard
              icon="people-outline"
              title="Find the Right Doctor"
              desc="Get specialty recommendations and book an appointment without guessing."
              color={C.green}
            />
          </View>
        </View>

        {/* ── How it works ── */}
        <View style={[s.section, { backgroundColor: "#070D20", borderRadius: 24, padding: 22, marginHorizontal: 0 }]}>
          <Text style={s.sectionLabel}>How it works</Text>
          <Step n="01" icon="chatbubble-outline"   title="Tell us how you feel"        desc="Describe your symptoms in your own words — text or voice." />
          <Step n="02" icon="sparkles-outline"      title="Answer smart follow-ups"     desc="The AI adapts its questions to exactly what you share." />
          <Step n="03" icon="document-text-outline" title="Receive your health summary" desc="A clear, structured report is ready for your doctor." />
          <Step n="04" icon="calendar-outline"      title="Continue your care"          desc="Book with the right specialist, fully prepared." last />
        </View>

        {/* ── CTA back to login ── */}
        <TouchableOpacity style={s.ctaBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <LinearGradient
            colors={[C.blue, C.violet]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.ctaBtnInner}
          >
            <Text style={s.ctaBtnText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={16} color={C.white} />
          </LinearGradient>
        </TouchableOpacity>
        <Text style={s.ctaHint}>Takes less than 2 minutes to sign up</Text>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  topBar: {
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },

  container: { paddingTop: 8, paddingHorizontal: 20 },

  hero: { alignItems: "center", marginBottom: 30 },
  heroBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 6, paddingHorizontal: 11,
    borderRadius: 30,
    backgroundColor: "rgba(56,189,248,0.08)",
    borderWidth: 1, borderColor: "rgba(56,189,248,0.22)",
    marginBottom: 16,
  },
  heroBadgeText: { color: "#BFEAFF", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  heroTitle: {
    color: C.white, fontSize: 34, lineHeight: 40,
    fontWeight: "900", letterSpacing: -1.2,
    textAlign: "center", marginBottom: 14,
  },
  heroSub: {
    color: C.muted, fontSize: 13.5, lineHeight: 22,
    textAlign: "center", maxWidth: 360,
  },

  section: { marginBottom: 24 },
  sectionLabel: {
    color: "rgba(234,241,255,0.38)",
    fontSize: 10, fontWeight: "800",
    textTransform: "uppercase", letterSpacing: 1.4,
    marginBottom: 14,
  },

  aboutCard: {
    backgroundColor: "rgba(8,17,42,0.72)",
    borderRadius: 22, borderWidth: 1, borderColor: C.border,
    padding: 20, marginBottom: 24,
  },
  aboutHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  aboutTitle:  { color: C.text, fontSize: 15, fontWeight: "800" },
  aboutText:   { color: C.muted, fontSize: 13, lineHeight: 21 },
  pillRow:     { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 16 },
  pill: {
    paddingVertical: 5, paddingHorizontal: 11,
    borderRadius: 20,
    backgroundColor: "rgba(59,130,246,0.10)",
    borderWidth: 1, borderColor: "rgba(59,130,246,0.22)",
  },
  pillText: { color: "#93C5FD", fontSize: 10.5, fontWeight: "700" },

  featureGrid: { gap: 11 },

  ctaBtn: { borderRadius: 16, overflow: "hidden", marginTop: 12 },
  ctaBtnInner: {
    minHeight: 54, borderRadius: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
  },
  ctaBtnText: { color: C.white, fontSize: 15, fontWeight: "900" },
  ctaHint: {
    color: "rgba(234,241,255,0.30)", fontSize: 10.5,
    textAlign: "center", marginTop: 10,
  },
});

// Video card styles
const v = StyleSheet.create({
  card: {
    borderRadius: 22, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(59,130,246,0.20)",
    shadowColor: C.blue, shadowOpacity: 0.22,
    shadowRadius: 24, shadowOffset: { width: 0, height: 10 },
  },
  cardInner: { padding: 22, minHeight: 220, overflow: "hidden" },
  glow: {
    position: "absolute",
    width: 160, height: 160, borderRadius: 80,
  },
  cardTopRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 18,
  },
  liveBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 4, paddingHorizontal: 9,
    borderRadius: 20,
    backgroundColor: "rgba(59,130,246,0.18)",
    borderWidth: 1, borderColor: "rgba(59,130,246,0.35)",
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.cyan },
  liveLabel: { color: C.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  durationText: { color: "rgba(234,241,255,0.45)", fontSize: 11, fontWeight: "700" },

  waveRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", height: 52, gap: 3,
    marginBottom: 20,
  },
  waveBar: { width: 3, height: 40, borderRadius: 2 },

  playWrap: { alignItems: "center", justifyContent: "center", marginBottom: 18 },
  playRing: {
    position: "absolute",
    width: 68, height: 68, borderRadius: 34,
    borderWidth: 2, borderColor: "rgba(59,130,246,0.50)",
  },
  playCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    shadowColor: C.blue, shadowOpacity: 0.5,
    shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },

  cardLabel:    { color: C.text, fontSize: 14, fontWeight: "800", textAlign: "center" },
  cardSubLabel: { color: "rgba(234,241,255,0.38)", fontSize: 11, textAlign: "center", marginTop: 3 },
});

// Feature card styles
const f = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 18, borderWidth: 1,
    padding: 16,
  },
  icon: {
    width: 44, height: 44, borderRadius: 14,
    borderWidth: 1,
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  title: { color: C.text, fontSize: 14, fontWeight: "800", marginBottom: 5 },
  desc:  { color: C.muted, fontSize: 12, lineHeight: 19 },
});

// Step styles
const st = StyleSheet.create({
  row: { flexDirection: "row", minHeight: 80 },
  left: { width: 44, alignItems: "center" },
  icon: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  line: { width: 1.5, flex: 1, marginVertical: 6, backgroundColor: "rgba(255,255,255,0.10)" },
  content: { flex: 1, paddingLeft: 14, paddingBottom: 22 },
  n:     { color: C.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 2 },
  title: { color: C.text, fontSize: 14, fontWeight: "800", marginBottom: 4 },
  desc:  { color: C.muted, fontSize: 12, lineHeight: 18 },
});
