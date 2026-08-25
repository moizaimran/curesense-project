import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAudioRecorder, requestRecordingPermissionsAsync, RecordingPresets } from "expo-audio";
import * as FileSystem from "expo-file-system";

import MCQInput from "@/components/interview/MCQInput";
import NumberInput from "@/components/interview/NumberInput";
import ScaleInput from "@/components/interview/ScaleInput";
import YesNoInput from "@/components/interview/YesNoInput";
import { API_URL } from "@/constants/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type Stage = "checking" | "greeting" | "question";
type QuestionType = "yes_no" | "mcq" | "scale" | "text" | "number";

const SESSION_KEY = "current_session_id";
const OPENING_QUESTION =
  "What's been bothering you lately? Please describe your main symptom or concern.";

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function InterviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("checking");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQ, setCurrentQ] = useState("");
  const [questionType, setQuestionType] = useState<QuestionType>("text");
  const [options, setOptions] = useState<string[]>([]);
  const [turnCount, setTurnCount] = useState(0);
  const [isFirstQ, setIsFirstQ] = useState(true);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [textInput, setTextInput] = useState("");
  const { bodyMapAnswer } = useLocalSearchParams<{ bodyMapAnswer?: string }>();

  const [isRecording, setIsRecording] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const bodyMapSent = useRef(false);

  // Pre-fill text input with body map selection — user reviews and sends manually
  useEffect(() => {
    if (bodyMapAnswer && sessionId && stage === "question" && !bodyMapSent.current) {
      bodyMapSent.current = true;
      setTextInput(bodyMapAnswer);
    }
  }, [bodyMapAnswer, sessionId, stage]);

  useEffect(() => {
    checkLatestSession();
  }, []);

  // ── Check only the latest session ────────────────────────────────────────────

  async function checkLatestSession() {
    setStage("checking");
    try {
      const token = await Storage.getItemAsync("token");
      const patient_id = await Storage.getItemAsync("patient_id");
      const res = await fetch(
        `${API_URL}/api/sessions/patient/${patient_id}/latest`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        setStage("greeting");
        return;
      }

      const session = await res.json();

      if (!session || session.status !== "in_progress") {
        setStage("greeting");
        return;
      }

      const hoursIdle =
        (Date.now() - new Date(session.last_activity_at).getTime()) / 36e5;
      if (hoursIdle >= 48) {
        setStage("greeting");
        return;
      }

      // Resume directly into question screen — skip greeting
      await Storage.setItemAsync(SESSION_KEY, session._id);
      const transcript: any[] = session.transcript ?? [];
      const lastQ =
        transcript.length > 0
          ? transcript[transcript.length - 1].assistant_message
          : OPENING_QUESTION;

      setSessionId(session._id);
      setTurnCount(session.turn_count);
      setIsFirstQ(session.turn_count === 0);
      setCurrentQ(lastQ);
      setQuestionType("text");
      setOptions([]);
      setStage("question");
    } catch {
      setStage("greeting");
    }
  }

  // ── Blink + slide transition ──────────────────────────────────────────────────

  function transitionToQuestion(q: string, type: QuestionType, opts: string[]) {
    // opacity is already 0 (CoolLoader is covering the area); skip fade-out, go straight to spring-in
    setCurrentQ(q);
    setQuestionType(type);
    setOptions(opts);
    opacity.setValue(0);
    translateY.setValue(28);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        tension: 90,
        friction: 9,
        useNativeDriver: true,
      }),
    ]).start();
  }

  // ── Start new session ─────────────────────────────────────────────────────────

  const startInterview = useCallback(async () => {
    setStarting(true);
    try {
      const token = await Storage.getItemAsync("token");
      const res = await fetch(`${API_URL}/api/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start session");

      await Storage.setItemAsync(SESSION_KEY, data._id);
      setSessionId(data._id);
      setTurnCount(0);
      setIsFirstQ(true);
      setCurrentQ(OPENING_QUESTION);
      setQuestionType("text");
      setOptions([]);

      opacity.setValue(0);
      translateY.setValue(30);
      setStage("question");
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          tension: 80,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to start session.");
    } finally {
      setStarting(false);
    }
  }, []);

  // ── Send turn ─────────────────────────────────────────────────────────────────

  async function sendTurn(patientText: string) {
    if (!patientText.trim() || sending || !sessionId) return;
    const sid = sessionId;
    setSending(true);
    setTextInput("");
    setIsFirstQ(false);
    // CoolLoader takes over the full content area — no opacity animation needed here

    try {
      const token = await Storage.getItemAsync("token");
      const res = await fetch(`${API_URL}/api/sessions/${sid}/turn`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ patient_text: patientText }),
      });
      const data = await res.json();
      if (!res.ok) {
        opacity.setValue(1); // restore question visibility on API error
        Alert.alert("Error", data.error ?? "Something went wrong.");
        return;
      }

      setTurnCount((t) => t + 1);

      if (data.status === "complete") {
        await Storage.deleteItemAsync(SESSION_KEY);
        router.push({
          pathname: "/transcript",
          params: { session_id: sid },
        } as any);
      } else {
        transitionToQuestion(
          data.message ?? "",
          (data.questionType as QuestionType) ?? "text",
          data.options ?? [],
        );
      }
    } catch {
      opacity.setValue(1); // restore question visibility on network error
      Alert.alert("Connection Error", "Could not reach the server.");
    } finally {
      setSending(false);
    }
  }

  // ── Voice recording ───────────────────────────────────────────────────────────

  async function toggleRecording() {
    if (isRecording) {
      // Stop — capture uri before stopping (it's the prepared file path)
      const uri = audioRecorder.uri;
      await audioRecorder.stop();
      setIsRecording(false);
      if (!uri) return;
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await sendAudioTurn(base64, "audio/m4a");
      } catch {
        Alert.alert("Error", "Could not read recording.");
      }
    } else {
      // Request permission, prepare, then start
      const status = await requestRecordingPermissionsAsync();
      if (!status.granted) {
        Alert.alert("Permission required", "Microphone access is needed to record.");
        return;
      }
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
    }
  }

  async function sendAudioTurn(base64: string, mimeType: string) {
    if (sending || !sessionId) return;
    setSending(true);
    setIsFirstQ(false);
    try {
      const token = await Storage.getItemAsync("token");
      const res = await fetch(`${API_URL}/api/sessions/${sessionId}/turn`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ patient_audio_base64: base64, mime_type: mimeType }),
      });
      const data = await res.json();
      if (!res.ok) {
        opacity.setValue(1);
        Alert.alert("Error", data.error ?? "Something went wrong.");
        return;
      }
      setTurnCount((t) => t + 1);
      if (data.status === "complete") {
        await Storage.deleteItemAsync(SESSION_KEY);
        router.push({ pathname: "/transcript", params: { session_id: sessionId } } as any);
      } else {
        transitionToQuestion(
          data.message ?? "",
          (data.questionType as QuestionType) ?? "text",
          data.options ?? [],
        );
      }
    } catch {
      opacity.setValue(1);
      Alert.alert("Connection Error", "Could not reach the server.");
    } finally {
      setSending(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (stage === "checking") {
    return (
      <LinearGradient colors={["#0B1437", "#0F2060"]} style={s.center}>
        <ActivityIndicator color="#2563EB" size="large" />
      </LinearGradient>
    );
  }

  if (stage === "greeting") {
    return (
      <GreetingScreen
        onStart={startInterview}
        starting={starting}
        insets={insets}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0B1437" }}>
      <StatusBar style="light" />

      <LinearGradient
        colors={["#0B1437", "#0B1437"]}
        style={[s.header, { paddingTop: insets.top + 14 }]}
      >
        <View style={s.headerLeft}>
          <LinearGradient colors={["#1D4ED8", "#2563EB"]} style={s.aiBadge}>
            <Ionicons name="medical" size={13} color="#fff" />
          </LinearGradient>
          <Text style={s.headerLabel}>CureSense AI</Text>
        </View>
        <View style={s.qBadge}>
          <Text style={s.qBadgeText}>Q {turnCount + 1}</Text>
        </View>
      </LinearGradient>

      {sending ? (
        /* CoolLoader takes over the full content area while API processes */
        <CoolLoader />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {/* Question — blinks in with slide when next question arrives */}
          <Animated.View
            style={[s.questionArea, { opacity, transform: [{ translateY }] }]}
          >
            <Text style={s.questionText}>{currentQ}</Text>
          </Animated.View>

          {/* Input panel */}
          <View style={[s.inputPanel, { paddingBottom: insets.bottom + 16 }]}>
            {renderInput(
              questionType,
              options,
              sendTurn,
              textInput,
              setTextInput,
              toggleRecording,
              isRecording,
            )}

            {isFirstQ && (
              <TouchableOpacity
                style={s.bodyBtn}
                onPress={() => router.push("/body-map" as any)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name="body-outline"
                  size={15}
                  color="rgba(255,255,255,0.35)"
                />
                <Text style={s.bodyBtnText}>Point on body</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

// ── Input dispatcher ──────────────────────────────────────────────────────────

function renderInput(
  type: QuestionType,
  options: string[],
  onSend: (t: string) => void,
  textInput: string,
  setTextInput: (v: string) => void,
  onMic: () => void,
  isRecording: boolean,
) {
  switch (type) {
    case "yes_no":
      return <YesNoInput onSubmit={onSend} />;
    case "mcq":
      return <MCQInput options={options} onSubmit={onSend} />;
    case "scale":
      return <ScaleInput onSubmit={onSend} />;
    case "number":
      return <NumberInput onSubmit={onSend} />;
    default:
      return (
        <View style={s.textRow}>
          <TextInput
            style={s.textInput}
            value={textInput}
            onChangeText={setTextInput}
            placeholder={isRecording ? "Recording… tap mic to send" : "Type your answer…"}
            placeholderTextColor={isRecording ? "rgba(239,68,68,0.70)" : "rgba(255,255,255,0.28)"}
            multiline
            maxLength={600}
            autoFocus={!isRecording}
            editable={!isRecording}
          />

          {/* Mic button — always visible on text input */}
          <TouchableOpacity
            style={[s.micBtn, isRecording && s.micBtnActive]}
            onPress={onMic}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isRecording ? "stop" : "mic"}
              size={18}
              color="#fff"
            />
          </TouchableOpacity>

          {/* Send button — only shown when there's typed text and not recording */}
          {!isRecording && textInput.trim().length > 0 && (
            <TouchableOpacity
              style={s.sendBtn}
              onPress={() => onSend(textInput)}
              activeOpacity={0.8}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      );
  }
}

// ── Cool Loader ───────────────────────────────────────────────────────────────

const LOADING_MESSAGES = [
  "Analyzing your response…",
  "Preparing your next question…",
  "Understanding your symptoms…",
  "Almost there…",
  "CureSense AI is thinking…",
];

function SonarRing({ delay, size }: { delay: number; size: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 2400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(Math.max(0, 3200 - delay - 2400)),
      ]),
    ).start();
  }, []);

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 2.4],
  });
  const opacity = anim.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.55, 0],
  });

  return (
    <Animated.View
      style={[
        l.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  );
}

function CoolLoader() {
  const orbit = useRef(new Animated.Value(0)).current;
  const orb = useRef(new Animated.Value(1)).current;
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    // Orbital rotation
    Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: 3200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();

    // Orb pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(orb, {
          toValue: 1.1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(orb, {
          toValue: 1.0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Message cycling
    const id = setInterval(
      () => setMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length),
      2600,
    );
    return () => clearInterval(id);
  }, []);

  const rotateDeg = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={l.wrap}>
      {/* Sonar rings */}
      <View style={l.orbWrap}>
        <SonarRing delay={0} size={90} />
        <SonarRing delay={1066} size={90} />
        <SonarRing delay={2133} size={90} />

        {/* Orbiting dots */}
        <Animated.View
          style={[l.orbitRing, { transform: [{ rotate: rotateDeg }] }]}
        >
          <View style={[l.orbitDot, l.orbitDot1]} />
          <View style={[l.orbitDot, l.orbitDot2]} />
          <View style={[l.orbitDot, l.orbitDot3]} />
        </Animated.View>

        {/* Center orb */}
        <Animated.View style={[l.orbOuter, { transform: [{ scale: orb }] }]}>
          <LinearGradient
            colors={["#1D4ED8", "#2563EB", "#3B82F6"]}
            style={l.orbInner}
          >
            <Ionicons name="medical" size={28} color="#fff" />
          </LinearGradient>
        </Animated.View>
      </View>

      {/* Cycling status text */}
      <Text style={l.message} key={msgIdx}>
        {LOADING_MESSAGES[msgIdx]}
      </Text>
      <Text style={l.subLabel}>CureSense AI</Text>
    </View>
  );
}

// ── Greeting Screen ───────────────────────────────────────────────────────────

function GreetingScreen({
  onStart,
  starting,
  insets,
}: {
  onStart: () => void;
  starting: boolean;
  insets: any;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1400,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  return (
    <LinearGradient
      colors={["#0B1437", "#0F2060", "#112080"]}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[
          g.container,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[g.orbOuter, { transform: [{ scale: pulseAnim }] }]}
        >
          <LinearGradient
            colors={["#1D4ED8", "#2563EB", "#3B82F6"]}
            style={g.orbInner}
          >
            <Ionicons name="medical" size={40} color="#fff" />
          </LinearGradient>
        </Animated.View>

        <View style={g.titleWrap}>
          <Text style={g.brand}>CureSense AI</Text>
          <Text style={g.title}>Medical Interview</Text>
          <Text style={g.sub}>
            Answer a few questions about your symptoms so your doctor can
            prepare before your appointment.
          </Text>
        </View>

        <View style={g.chips}>
          <View style={g.chip}>
            <Ionicons name="time-outline" size={15} color="#60A5FA" />
            <Text style={g.chipText}>~5 minutes</Text>
          </View>
          <View style={g.chip}>
            <Ionicons
              name="shield-checkmark-outline"
              size={15}
              color="#60A5FA"
            />
            <Text style={g.chipText}>Private & secure</Text>
          </View>
          <View style={g.chip}>
            <Ionicons name="person-outline" size={15} color="#60A5FA" />
            <Text style={g.chipText}>AI-assisted</Text>
          </View>
        </View>

        <View style={g.steps}>
          {[
            {
              icon: "chatbubble-ellipses-outline" as const,
              text: "Describe your symptoms naturally",
            },
            {
              icon: "help-circle-outline" as const,
              text: "Answer follow-up questions",
            },
            {
              icon: "document-text-outline" as const,
              text: "Report shared with your doctor",
            },
          ].map((step, i) => (
            <View key={i} style={g.step}>
              <View style={g.stepIcon}>
                <Ionicons name={step.icon} size={18} color="#2563EB" />
              </View>
              <Text style={g.stepText}>{step.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[g.startBtn, starting && { opacity: 0.6 }]}
          onPress={onStart}
          disabled={starting}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={["#1D4ED8", "#2563EB"]}
            style={g.startBtnGrad}
          >
            {starting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={g.startBtnText}>Begin Interview</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={g.disclaimer}>
          Your responses are shared only with your assigned clinician.
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerLabel: { color: "#60A5FA", fontSize: 13, fontWeight: "700" },
  aiBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  qBadge: {
    backgroundColor: "rgba(37,99,235,0.25)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.40)",
  },
  qBadgeText: { color: "#60A5FA", fontSize: 12, fontWeight: "800" },

  questionArea: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  questionText: {
    color: "#fff",
    fontSize: 23,
    fontWeight: "700",
    lineHeight: 34,
    letterSpacing: -0.3,
    flexShrink: 1,
  },

  inputPanel: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#0B1437",
    gap: 12,
  },

  textRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  textInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    color: "#fff",
    fontSize: 16,
    maxHeight: 130,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendBtnOff: { opacity: 0.3 },
  micBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  micBtnActive: {
    backgroundColor: "rgba(239,68,68,0.85)",
    borderColor: "#EF4444",
  },

  bodyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignSelf: "center",
  },
  bodyBtnText: { color: "rgba(255,255,255,0.35)", fontSize: 12 },
});

const l = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    backgroundColor: "#0B1437",
  },

  orbWrap: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },

  ring: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "#2563EB",
  },

  orbitRing: { position: "absolute", width: 148, height: 148 },
  orbitDot: { position: "absolute", width: 11, height: 11, borderRadius: 6 },
  orbitDot1: { backgroundColor: "#60A5FA", top: -1, left: 69 },
  orbitDot2: { backgroundColor: "#3B82F6", bottom: 18, right: 3 },
  orbitDot3: { backgroundColor: "#93C5FD", bottom: 18, left: 3 },

  orbOuter: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37,99,235,0.15)",
    borderWidth: 1.5,
    borderColor: "rgba(37,99,235,0.35)",
  },
  orbInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
  },

  message: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  subLabel: {
    color: "rgba(255,255,255,0.20)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});

const g = StyleSheet.create({
  container: { alignItems: "center", paddingHorizontal: 28, gap: 32 },
  orbOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(37,99,235,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(37,99,235,0.30)",
  },
  orbInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { alignItems: "center", gap: 8 },
  brand: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  title: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
  },
  sub: {
    color: "rgba(255,255,255,0.50)",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  chips: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(37,99,235,0.15)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.30)",
  },
  chipText: { color: "#93C5FD", fontSize: 12, fontWeight: "600" },
  steps: { width: "100%", gap: 12 },
  step: { flexDirection: "row", alignItems: "center", gap: 14 },
  stepIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(37,99,235,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.25)",
    flexShrink: 0,
  },
  stepText: { color: "rgba(255,255,255,0.65)", fontSize: 14, flex: 1 },
  startBtn: { width: "100%" },
  startBtnGrad: {
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  startBtnText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  disclaimer: {
    color: "rgba(255,255,255,0.22)",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 17,
  },
});
