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
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const C = {
  bg: "#050816",
  bg2: "#08112A",
  card: "rgba(255,255,255,0.055)",
  cardStrong: "rgba(255,255,255,0.09)",
  white: "#FFFFFF",
  text: "#EAF1FF",
  muted: "rgba(234,241,255,0.60)",
  soft: "rgba(234,241,255,0.38)",
  blue: "#3B82F6",
  cyan: "#38BDF8",
  violet: "#8B5CF6",
  teal: "#2DD4BF",
  green: "#34D399",
  border: "rgba(255,255,255,0.10)",
};

function Glow({
  size,
  color,
  top,
  left,
}: {
  size: number;
  color: string;
  top: number;
  left: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.glow,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          top,
          left,
        },
      ]}
    />
  );
}

function PulseLine() {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.pulseRow, { opacity }]}>
      {[3, 3, 4, 4, 20, 34, 12, 4, 4, 5, 4, 25, 10, 4, 4, 4, 3].map(
        (height, i) => (
          <View key={i} style={[styles.pulseBar, { height }]} />
        ),
      )}
    </Animated.View>
  );
}

function FloatingOrb({
  delay,
  size,
  right,
  top,
}: {
  delay: number;
  size: number;
  right: number;
  top: number;
}) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, {
          toValue: -10,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.floatingOrb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          right,
          top,
          transform: [{ translateY: y }],
        },
      ]}
    />
  );
}

function Logo() {
  return (
    <View style={styles.logoRow}>
      <LinearGradient
        colors={[C.blue, C.violet]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.logoIcon}
      >
        <Ionicons name="pulse" size={18} color={C.white} />
      </LinearGradient>
      <Text style={styles.logoText}>CureSense</Text>
    </View>
  );
}

function TrustBadge({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.trustBadge}>
      <Ionicons name={icon} size={13} color={C.cyan} />
      <Text style={styles.trustText}>{text}</Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function HeroVisual() {
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.96,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  return (
    <View style={styles.visualArea}>
      <View style={styles.visualGlow} />

      <Animated.View style={[styles.analysisCard, { transform: [{ scale }] }]}>
        <View style={styles.analysisTop}>
          <View style={styles.aiIcon}>
            <Ionicons name="sparkles" size={17} color={C.white} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.analysisEyebrow}>CURESENSE AI</Text>
            <Text style={styles.analysisTitle}>Health Analysis</Text>
          </View>

          <View style={styles.liveDot}>
            <View style={styles.dot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        <View style={styles.waveBox}>
          <PulseLine />
        </View>

        <View style={styles.resultBox}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={14} color={C.bg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.resultTitle}>Symptoms captured</Text>
            <Text style={styles.resultSub}>Severity • Duration • History</Text>
          </View>
          <Text style={styles.resultPercent}>96%</Text>
        </View>

        <View style={styles.recommendBox}>
          <View style={styles.doctorIcon}>
            <Ionicons name="medkit-outline" size={18} color={C.cyan} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.resultSub}>Recommended specialty</Text>
            <Text style={styles.doctorName}>General Physician</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={C.soft} />
        </View>
      </Animated.View>

      <FloatingOrb delay={0} size={48} right={-4} top={30} />
      <FloatingOrb delay={700} size={30} right={30} top={-8} />
      <FloatingOrb delay={1200} size={22} right={-12} top={180} />
    </View>
  );
}

function Hero({
  top,
  onRegister,
  onLogin,
}: {
  top: number;
  onRegister: () => void;
  onLogin: () => void;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(25)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <LinearGradient
      colors={[C.bg, C.bg2, "#101B45"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, { paddingTop: top + 16 }]}
    >
      <Glow size={250} color="rgba(59,130,246,0.13)" top={100} left={-100} />
      <Glow size={220} color="rgba(139,92,246,0.12)" top={340} left={250} />

      <View style={styles.nav}>
        <Logo />
        <TouchableOpacity
          onPress={onLogin}
          activeOpacity={0.8}
          style={styles.loginButton}
        >
          <Text style={styles.loginText}>Login</Text>
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[
          styles.heroContent,
          { opacity: fade, transform: [{ translateY: rise }] },
        ]}
      >
        <View style={styles.badge}>
          <View style={styles.badgeSpark}>
            <Ionicons name="sparkles" size={12} color={C.white} />
          </View>
          <Text style={styles.badgeText}>AI-POWERED HEALTHCARE</Text>
        </View>

        <Text style={styles.heroTitle}>
          Your symptoms.
          {"\n"}
          <Text style={styles.heroAccent}>Finally understood.</Text>
        </Text>

        <Text style={styles.heroSubtitle}>
          Tell CureSense how you feel in your own words. Our AI asks the right
          questions, organizes your symptoms, and prepares a clear summary for
          your doctor.
        </Text>

        <View style={styles.heroActions}>
          <TouchableOpacity
            onPress={onRegister}
            activeOpacity={0.86}
            style={styles.primaryButtonWrap}
          >
            <LinearGradient
              colors={[C.blue, C.violet]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Get Started</Text>
              <View style={styles.arrowCircle}>
                <Ionicons name="arrow-forward" size={14} color={C.bg} />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onLogin}
            activeOpacity={0.75}
            style={styles.secondaryButton}
          >
            <Ionicons name="play-circle-outline" size={19} color={C.cyan} />
            <Text style={styles.secondaryText}>See how it works</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.trustRow}>
          <TrustBadge icon="shield-checkmark-outline" text="Secure" />
          <TrustBadge icon="lock-closed-outline" text="Private" />
          <TrustBadge icon="time-outline" text="Available 24/7" />
        </View>

        <HeroVisual />

        <View style={styles.statsCard}>
          <Stat value="10K+" label="Patients helped" />
          <View style={styles.statDivider} />
          <Stat value="24/7" label="AI availability" />
          <View style={styles.statDivider} />
          <Stat value="5 min" label="Average intake" />
        </View>
      </Animated.View>
    </LinearGradient>
  );
}

const features = [
  {
    icon: "chatbubble-ellipses-outline" as const,
    title: "Smart AI Interview",
    desc: "Adaptive questions that follow your symptoms instead of forcing you through a rigid form.",
    color: C.cyan,
  },
  {
    icon: "analytics-outline" as const,
    title: "Clear Health Summary",
    desc: "Your answers become an organized clinical summary that is easier to discuss with your doctor.",
    color: C.teal,
  },
  {
    icon: "people-outline" as const,
    title: "Right Doctor, Faster",
    desc: "Get guidance toward the right medical specialty and continue to appointment booking.",
    color: C.violet,
  },
];

function Features() {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionEyebrow}>WHY CURESENSE</Text>
      <Text style={styles.sectionTitle}>
        Healthcare that starts{"\n"}before the waiting room.
      </Text>
      <Text style={styles.sectionSub}>
        Less confusion. Better information. A smoother conversation with your
        doctor.
      </Text>

      <View style={styles.featureList}>
        {features.map((item, index) => (
          <View key={item.title} style={styles.featureCard}>
            <View
              style={[
                styles.featureIcon,
                {
                  backgroundColor: `${item.color}18`,
                  borderColor: `${item.color}35`,
                },
              ]}
            >
              <Ionicons name={item.icon} size={23} color={item.color} />
            </View>

            <View style={styles.featureNumber}>
              <Text style={styles.featureNumberText}>0{index + 1}</Text>
            </View>

            <Text style={styles.featureTitle}>{item.title}</Text>
            <Text style={styles.featureDesc}>{item.desc}</Text>

            <View style={styles.featureLine}>
              <View
                style={[
                  styles.featureLineFill,
                  { backgroundColor: item.color },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const steps = [
  {
    n: "01",
    icon: "chatbubble-outline" as const,
    title: "Tell us how you feel",
    desc: "Describe your symptoms naturally using text or voice.",
  },
  {
    n: "02",
    icon: "sparkles-outline" as const,
    title: "Answer smart follow-ups",
    desc: "CureSense adapts its questions to what you tell it.",
  },
  {
    n: "03",
    icon: "document-text-outline" as const,
    title: "Get your health summary",
    desc: "Your information is organized into a clear report.",
  },
  {
    n: "04",
    icon: "calendar-outline" as const,
    title: "Continue your care",
    desc: "Use the summary to have a more prepared doctor visit.",
  },
];

function HowItWorks() {
  return (
    <View style={styles.darkSection}>
      <Text style={styles.sectionEyebrow}>HOW IT WORKS</Text>
      <Text style={styles.sectionTitle}>
        From feeling something{"\n"}to knowing what to do next.
      </Text>

      <View style={styles.steps}>
        {steps.map((step, index) => (
          <View key={step.n} style={styles.stepRow}>
            <View style={styles.stepLeft}>
              <LinearGradient
                colors={[C.blue, C.violet]}
                style={styles.stepIcon}
              >
                <Ionicons name={step.icon} size={18} color={C.white} />
              </LinearGradient>
              {index < steps.length - 1 && <View style={styles.connector} />}
            </View>

            <View style={styles.stepContent}>
              <Text style={styles.stepNumber}>{step.n}</Text>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDesc}>{step.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Testimonial() {
  return (
    <View style={styles.section}>
      <View style={styles.quoteCard}>
        <View style={styles.quoteMark}>
          <Ionicons name="chatbubble-ellipses" size={20} color={C.cyan} />
        </View>

        <View style={styles.stars}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Ionicons key={i} name="star" size={14} color="#FBBF24" />
          ))}
        </View>

        <Text style={styles.quote}>
          “I finally had a clear way to explain what I had been experiencing.
          The whole appointment felt more focused.”
        </Text>

        <View style={styles.person}>
          <LinearGradient colors={[C.blue, C.violet]} style={styles.avatar}>
            <Text style={styles.avatarText}>A</Text>
          </LinearGradient>
          <View>
            <Text style={styles.personName}>Ayesha K.</Text>
            <Text style={styles.personRole}>CureSense patient</Text>
          </View>
          <Ionicons
            name="checkmark-circle"
            size={17}
            color={C.cyan}
            style={{ marginLeft: "auto" }}
          />
        </View>
      </View>
    </View>
  );
}

function FinalCTA({
  onRegister,
  onLogin,
}: {
  onRegister: () => void;
  onLogin: () => void;
}) {
  return (
    <View style={styles.ctaSection}>
      <Glow size={260} color="rgba(59,130,246,0.16)" top={-90} left={-70} />

      <View style={styles.ctaIcon}>
        <Ionicons name="pulse" size={25} color={C.white} />
      </View>

      <Text style={styles.ctaTitle}>Start with your story.</Text>

      <Text style={styles.ctaSub}>
        A better doctor visit can start before you enter the clinic.
      </Text>

      <TouchableOpacity
        onPress={onRegister}
        activeOpacity={0.86}
        style={{ width: "100%" }}
      >
        <LinearGradient
          colors={[C.blue, C.violet]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ctaButton}
        >
          <Text style={styles.ctaButtonText}>Create Your Account</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity onPress={onLogin} style={{ marginTop: 16 }}>
        <Text style={styles.ctaLogin}>
          Already have an account?{" "}
          <Text style={{ color: C.cyan, fontWeight: "800" }}>Login</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function Footer({ bottom }: { bottom: number }) {
  return (
    <View style={[styles.footer, { paddingBottom: bottom + 24 }]}>
      <Logo />
      <Text style={styles.footerText}>
        AI-assisted clinical intake designed to help patients communicate
        clearly and start every appointment better prepared.
      </Text>

      <View style={styles.footerDivider} />

      <View style={styles.footerBottom}>
        <Text style={styles.footerCopy}>© 2026 CureSense</Text>
        <Text style={styles.footerCopy}>Privacy • Terms • Support</Text>
      </View>
    </View>
  );
}

export default function LandingPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const goRegister = () => router.push("/(auth)/register" as any);
  const goLogin = () => router.push("/(auth)/login" as any);

  return (
    <>
      <StatusBar style="light" />

      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Hero top={insets.top} onRegister={goRegister} onLogin={goLogin} />

        <Features />
        <HowItWorks />
        <Testimonial />

        <FinalCTA onRegister={goRegister} onLogin={goLogin} />

        <Footer bottom={insets.bottom} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  content: {
    flexGrow: 1,
  },

  glow: {
    position: "absolute",
    opacity: 0.9,
  },

  hero: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    overflow: "hidden",
  },

  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 38,
  },

  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  logoIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  logoText: {
    color: C.white,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.5,
  },

  loginButton: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    backgroundColor: "rgba(255,255,255,0.035)",
  },

  loginText: {
    color: C.white,
    fontSize: 13,
    fontWeight: "700",
  },

  heroContent: {
    alignItems: "center",
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.25)",
    backgroundColor: "rgba(56,189,248,0.08)",
    marginBottom: 19,
  },

  badgeSpark: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(59,130,246,0.75)",
  },

  badgeText: {
    color: "#BFEAFF",
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1.1,
  },

  heroTitle: {
    color: C.white,
    textAlign: "center",
    fontSize: 39,
    lineHeight: 44,
    fontWeight: "900",
    letterSpacing: -1.5,
  },

  heroAccent: {
    color: C.cyan,
  },

  heroSubtitle: {
    color: C.muted,
    textAlign: "center",
    fontSize: 14.5,
    lineHeight: 23,
    marginTop: 17,
    maxWidth: 390,
  },

  heroActions: {
    width: "100%",
    alignItems: "center",
    marginTop: 27,
    gap: 12,
  },

  primaryButtonWrap: {
    width: "100%",
    maxWidth: 310,
  },

  primaryButton: {
    minHeight: 55,
    borderRadius: 16,
    paddingHorizontal: 19,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },

  primaryButtonText: {
    color: C.white,
    fontSize: 15.5,
    fontWeight: "800",
  },

  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 8,
  },

  secondaryText: {
    color: C.muted,
    fontSize: 13,
    fontWeight: "700",
  },

  trustRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 7,
    marginTop: 22,
  },

  trustBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },

  trustText: {
    color: C.soft,
    fontSize: 10.5,
    fontWeight: "600",
  },

  visualArea: {
    width: "100%",
    minHeight: 340,
    marginTop: 30,
    alignItems: "center",
    justifyContent: "center",
  },

  visualGlow: {
    position: "absolute",
    width: 245,
    height: 245,
    borderRadius: 125,
    backgroundColor: "rgba(59,130,246,0.12)",
    shadowColor: C.blue,
    shadowOpacity: 0.8,
    shadowRadius: 70,
  },

  analysisCard: {
    width: "92%",
    maxWidth: 360,
    borderRadius: 25,
    padding: 18,
    backgroundColor: "rgba(10,20,49,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: C.blue,
    shadowOpacity: 0.25,
    shadowRadius: 35,
    shadowOffset: { width: 0, height: 15 },
  },

  analysisTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  aiIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.blue,
  },

  analysisEyebrow: {
    color: C.cyan,
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  analysisTitle: {
    color: C.white,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },

  liveDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(52,211,153,0.09)",
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.20)",
  },

  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.green,
  },

  liveText: {
    color: C.green,
    fontSize: 8,
    fontWeight: "900",
  },

  waveBox: {
    height: 72,
    borderRadius: 16,
    marginTop: 17,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
  },

  pulseRow: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  pulseBar: {
    width: 3,
    marginHorizontal: 3,
    borderRadius: 3,
    backgroundColor: C.cyan,
  },

  resultBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 13,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(52,211,153,0.06)",
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.13)",
  },

  checkCircle: {
    width: 29,
    height: 29,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.green,
  },

  resultTitle: {
    color: C.text,
    fontSize: 12,
    fontWeight: "800",
  },

  resultSub: {
    color: C.soft,
    fontSize: 9.5,
    marginTop: 2,
  },

  resultPercent: {
    color: C.green,
    fontSize: 13,
    fontWeight: "900",
  },

  recommendBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 9,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.035)",
  },

  doctorIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56,189,248,0.08)",
  },

  doctorName: {
    color: C.text,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },

  floatingOrb: {
    position: "absolute",
    backgroundColor: "rgba(56,189,248,0.10)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.25)",
  },

  statsCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 19,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  stat: {
    flex: 1,
    alignItems: "center",
  },

  statValue: {
    color: C.white,
    fontSize: 20,
    fontWeight: "900",
  },

  statLabel: {
    color: C.soft,
    fontSize: 9.5,
    marginTop: 3,
    textAlign: "center",
  },

  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.09)",
  },

  section: {
    paddingHorizontal: 20,
    paddingVertical: 52,
    backgroundColor: C.bg,
  },

  darkSection: {
    paddingHorizontal: 20,
    paddingVertical: 52,
    backgroundColor: "#070D20",
  },

  sectionEyebrow: {
    color: C.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 9,
  },

  sectionTitle: {
    color: C.white,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "900",
    letterSpacing: -0.7,
  },

  sectionSub: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
    marginBottom: 24,
  },

  featureList: {
    gap: 13,
  },

  featureCard: {
    padding: 18,
    borderRadius: 21,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },

  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },

  featureNumber: {
    position: "absolute",
    top: 18,
    right: 18,
  },

  featureNumberText: {
    color: "rgba(255,255,255,0.16)",
    fontSize: 19,
    fontWeight: "900",
  },

  featureTitle: {
    color: C.white,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 7,
  },

  featureDesc: {
    color: C.muted,
    fontSize: 12.5,
    lineHeight: 20,
  },

  featureLine: {
    width: "100%",
    height: 2,
    marginTop: 17,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 2,
  },

  featureLineFill: {
    width: "28%",
    height: 2,
    borderRadius: 2,
  },

  steps: {
    marginTop: 30,
  },

  stepRow: {
    flexDirection: "row",
    minHeight: 92,
  },

  stepLeft: {
    width: 48,
    alignItems: "center",
  },

  stepIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  connector: {
    width: 1.5,
    flex: 1,
    marginVertical: 7,
    backgroundColor: "rgba(255,255,255,0.12)",
  },

  stepContent: {
    flex: 1,
    paddingLeft: 14,
    paddingBottom: 25,
  },

  stepNumber: {
    color: C.cyan,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 3,
  },

  stepTitle: {
    color: C.white,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 5,
  },

  stepDesc: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 19,
  },

  quoteCard: {
    padding: 21,
    borderRadius: 23,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },

  quoteMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56,189,248,0.08)",
    marginBottom: 14,
  },

  stars: {
    flexDirection: "row",
    gap: 3,
    marginBottom: 13,
  },

  quote: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 16,
    lineHeight: 25,
    fontStyle: "italic",
    marginBottom: 20,
  },

  person: {
    flexDirection: "row",
    alignItems: "center",
  },

  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  avatarText: {
    color: C.white,
    fontSize: 14,
    fontWeight: "900",
  },

  personName: {
    color: C.white,
    fontSize: 12.5,
    fontWeight: "800",
  },

  personRole: {
    color: C.soft,
    fontSize: 10.5,
    marginTop: 2,
  },

  ctaSection: {
    margin: 20,
    padding: 28,
    borderRadius: 27,
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#0A1636",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.18)",
  },

  ctaIcon: {
    width: 53,
    height: 53,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.blue,
    marginBottom: 17,
  },

  ctaTitle: {
    color: C.white,
    fontSize: 27,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.6,
  },

  ctaSub: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 9,
    marginBottom: 22,
  },

  ctaButton: {
    width: "100%",
    minHeight: 53,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
  },

  ctaButtonText: {
    color: C.white,
    fontSize: 14.5,
    fontWeight: "800",
  },

  ctaLogin: {
    color: C.soft,
    fontSize: 11.5,
  },

  footer: {
    paddingHorizontal: 25,
    paddingTop: 28,
    backgroundColor: C.bg,
  },

  footerText: {
    color: C.soft,
    fontSize: 11.5,
    lineHeight: 18,
    marginTop: 13,
    maxWidth: 350,
  },

  footerDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginVertical: 20,
  },

  footerBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },

  footerCopy: {
    color: "rgba(255,255,255,0.28)",
    fontSize: 10,
  },
});
