import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const C = {
  bg: "#050816", bg2: "#08112A",
  blue: "#3B82F6", violet: "#8B5CF6", cyan: "#38BDF8", white: "#FFFFFF",
  text: "#EAF1FF", muted: "rgba(234,241,255,0.55)", soft: "rgba(234,241,255,0.38)",
};

export default function ForgotPasswordSentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();

  return (
    <LinearGradient colors={[C.bg, C.bg2, "#101B45"]} style={s.root}>
      <StatusBar style="light" />
      <View pointerEvents="none" style={s.glow} />

      <ScrollView
        contentContainerStyle={[
          s.container,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 36 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.iconWrap}>
          <LinearGradient
            colors={[C.blue, C.violet]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.iconCircle}
          >
            <Ionicons name="mail" size={32} color={C.white} />
          </LinearGradient>
        </View>

        <Text style={s.title}>Check your inbox</Text>
        <Text style={s.subtitle}>
          If an account exists for{"\n"}
          <Text style={s.emailText}>{email}</Text>
          {"\n"}we sent a password reset link.
        </Text>

        <View style={s.card}>
          <View style={s.stepRow}>
            <View style={s.stepDot}><Text style={s.stepNum}>1</Text></View>
            <Text style={s.stepText}>Open the email from CureSense</Text>
          </View>
          <View style={s.stepRow}>
            <View style={s.stepDot}><Text style={s.stepNum}>2</Text></View>
            <Text style={s.stepText}>Tap <Text style={s.bold}>Reset Password</Text></Text>
          </View>
          <View style={[s.stepRow, { marginBottom: 0 }]}>
            <View style={s.stepDot}><Text style={s.stepNum}>3</Text></View>
            <Text style={s.stepText}>Return here and sign in with your new password</Text>
          </View>
        </View>

        <TouchableOpacity
          style={s.primaryWrap}
          onPress={() => router.replace("/" as any)}
          activeOpacity={0.86}
        >
          <LinearGradient
            colors={[C.blue, C.violet]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.primaryBtn}
          >
            <Text style={s.primaryBtnText}>Back to Sign In</Text>
            <View style={s.arrowCircle}>
              <Ionicons name="arrow-forward" size={14} color={C.bg} />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  glow: {
    position: "absolute", width: 280, height: 280, borderRadius: 140,
    backgroundColor: "rgba(59,130,246,0.11)", top: -60, left: -120,
  },
  container: { flexGrow: 1, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" },
  iconWrap:  { marginBottom: 28 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#3B82F6", shadowOpacity: 0.45, shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
  },
  title: {
    color: "#EAF1FF", fontSize: 26, fontWeight: "900",
    letterSpacing: -0.6, marginBottom: 10, textAlign: "center",
  },
  subtitle: {
    color: "rgba(234,241,255,0.55)", fontSize: 14,
    lineHeight: 22, textAlign: "center", marginBottom: 30,
  },
  emailText: { color: "#60A5FA", fontWeight: "700" },
  card: {
    width: "100%",
    backgroundColor: "rgba(8,17,42,0.82)",
    borderRadius: 20, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 22, marginBottom: 24, gap: 16,
  },
  stepRow:   { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 4 },
  stepDot:   {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "rgba(59,130,246,0.18)",
    borderWidth: 1, borderColor: "rgba(59,130,246,0.35)",
    alignItems: "center", justifyContent: "center",
  },
  stepNum:  { color: "#60A5FA", fontSize: 12, fontWeight: "900" },
  stepText: { flex: 1, color: "rgba(234,241,255,0.72)", fontSize: 13.5, lineHeight: 20 },
  bold:     { color: "#EAF1FF", fontWeight: "700" },
  primaryWrap: { width: "100%", borderRadius: 15, overflow: "hidden" },
  primaryBtn: {
    minHeight: 54, borderRadius: 15, paddingHorizontal: 17,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 10,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  arrowCircle: {
    width: 27, height: 27, borderRadius: 14, backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
  },
});
