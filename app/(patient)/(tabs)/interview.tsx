import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system";
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [pendingAudioUrl, setPendingAudioUrl] = useState<string | null>(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const bodyMapSent = useRef(false);

  // ── Pre-fill text input with body map selection ──────────────────────────────

  useEffect(() => {
    if (
      bodyMapAnswer &&
      sessionId &&
      stage === "question" &&
      !bodyMapSent.current
    ) {
      bodyMapSent.current = true;
      setTextInput(bodyMapAnswer);
      router.setParams({ bodyMapAnswer: undefined });
    }
  }, [bodyMapAnswer, sessionId, stage]);

  // ── Check latest session on screen load ─────────────────────────────────────

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
          headers: {
            Authorization: `Bearer ${token}`,
          },
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

      await Storage.setItemAsync(SESSION_KEY, session._id);

      const transcript: any[] = session.transcript ?? [];

      const lastTurn =
        transcript.length > 0 ? transcript[transcript.length - 1] : null;

      const lastQ = lastTurn?.assistant_message ?? OPENING_QUESTION;

      const savedQuestionType = lastTurn?.question_type;

      const validQuestionTypes: QuestionType[] = [
        "yes_no",
        "mcq",
        "scale",
        "text",
        "number",
      ];

      const resumedQuestionType: QuestionType = validQuestionTypes.includes(
        savedQuestionType,
      )
        ? savedQuestionType
        : "text";

      const resumedOptions = Array.isArray(lastTurn?.question_options)
        ? lastTurn.question_options
        : [];

      setSessionId(session._id);
      setTurnCount(session.turn_count ?? 0);
      setIsFirstQ((session.turn_count ?? 0) === 0);
      setCurrentQ(lastQ);
      setQuestionType(resumedQuestionType);
      setOptions(resumedOptions);
      setTextInput("");
      setStage("question");
    } catch (error) {
      setStage("greeting");
    }
  }

  // ── Blink + slide transition ────────────────────────────────────────────────

  function transitionToQuestion(q: string, type: QuestionType, opts: string[]) {
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

  // ── Start new session ───────────────────────────────────────────────────────

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

      if (!res.ok) {
        throw new Error(data.error ?? "Could not start session");
      }

      await Storage.setItemAsync(SESSION_KEY, data._id);

      setSessionId(data._id);
      setTurnCount(0);
      setIsFirstQ(true);

      setCurrentQ(OPENING_QUESTION);
      setQuestionType("text");
      setOptions([]);
      setTextInput("");

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
      Alert.alert("Error", e?.message ?? "Failed to start session.");
    } finally {
      setStarting(false);
    }
  }, []);

  // ── Send text turn ───────────────────────────────────────────────────────────

  async function sendTurn(patientText: string) {
    if (!patientText.trim() || sending || !sessionId) {
      return;
    }

    const sid = sessionId;

    setSending(true);
    setTextInput("");
    setIsFirstQ(false);

    try {
      const token = await Storage.getItemAsync("token");

      const res = await fetch(`${API_URL}/api/sessions/${sid}/turn`, {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          patient_text: patientText,
          ...(pendingAudioUrl ? { voice_message_url: pendingAudioUrl } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        opacity.setValue(1);

        Alert.alert("Error", data.error ?? "Something went wrong.");

        return;
      }

      setTurnCount((t) => t + 1);

      setPendingAudioUrl(null);

      if (data.status === "complete") {
        await Storage.deleteItemAsync(SESSION_KEY);

        router.push({
          pathname: "/transcript",
          params: {
            session_id: sid,
          },
        } as any);
      } else {
        transitionToQuestion(
          data.message ?? "",
          (data.questionType as QuestionType) ?? "text",
          Array.isArray(data.options) ? data.options : [],
        );
      }
    } catch (error) {
      opacity.setValue(1);

      Alert.alert("Connection Error", "Could not reach the server.");
    } finally {
      setSending(false);
    }
  }

  // ── Voice recording → transcribe → fill input ────────────────────────────────

  async function toggleRecording() {
    if (isRecording) {
      await audioRecorder.stop();
      await setAudioModeAsync({ allowsRecordingIOS: false });
      setIsRecording(false);

      const uri = audioRecorder.uri;
      if (!uri) {
        Alert.alert("Recording Error", "No audio was captured. Please try again.");
        return;
      }

      if (!sessionId) return;

      setIsTranscribing(true);

      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const token = await Storage.getItemAsync("token");

        const res = await fetch(`${API_URL}/api/sessions/${sessionId}/transcribe`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ patient_audio_base64: base64, mime_type: "audio/m4a" }),
        });

        const data = await res.json();

        if (!res.ok) {
          Alert.alert("Transcription Error", data.error ?? "Could not transcribe audio.");
          return;
        }

        // Fill input so user can read, edit, then press send
        setTextInput(data.transcribedText ?? "");
        setPendingAudioUrl(data.audioUrl ?? null);
      } catch {
        Alert.alert("Connection Error", "Could not reach the server.");
      } finally {
        setIsTranscribing(false);
      }
    } else {
      const status = await requestRecordingPermissionsAsync();

      if (!status.granted) {
        Alert.alert("Permission required", "Microphone access is needed to record.");
        return;
      }

      await setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (stage === "checking") {
    return (
      <LinearGradient
        colors={["#07112F", "#0B1437", "#10255F"]}
        style={s.center}
      >
        <View style={s.checkingOrb}>
          <LinearGradient
            colors={["#2563EB", "#3B82F6"]}
            style={s.checkingOrbInner}
          >
            <Ionicons name="medical" size={28} color="#fff" />
          </LinearGradient>
        </View>

        <ActivityIndicator
          color="#60A5FA"
          size="small"
          style={{ marginTop: 24 }}
        />

        <Text style={s.checkingText}>Preparing your interview...</Text>
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
    <View style={s.screen}>
      <StatusBar style="light" />

      {/* Decorative background */}
      <View style={s.backgroundGlowOne} />
      <View style={s.backgroundGlowTwo} />

      {/* Header */}
      <LinearGradient
        colors={["#07112F", "#0B1437"]}
        style={[
          s.header,
          {
            paddingTop: insets.top + 14,
          },
        ]}
      >
        <View style={s.headerLeft}>
          <LinearGradient colors={["#1D4ED8", "#3B82F6"]} style={s.aiBadge}>
            <Ionicons name="medical" size={14} color="#fff" />
          </LinearGradient>

          <View>
            <Text style={s.headerBrand}>CureSense</Text>
            <Text style={s.headerSubtitle}>AI Health Interview</Text>
          </View>
        </View>

        <View style={s.qBadge}>
          <Text style={s.qBadgeSmall}>QUESTION</Text>
          <Text style={s.qBadgeText}>{turnCount + 1}</Text>
        </View>
      </LinearGradient>

      {sending ? (
        <CoolLoader />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "space-between" }}
          >
            <Animated.View
              style={[
                s.questionArea,
                {
                  opacity,
                  transform: [
                    {
                      translateY,
                    },
                  ],
                },
              ]}
            >
              <View style={s.questionLabelRow}>
                <View style={s.questionDot} />
                <Text style={s.questionLabel}>YOUR CARE MATTERS</Text>
              </View>

              <Text style={s.questionText}>{currentQ}</Text>

              <Text style={s.helperText}>
                Take your time. Answer as accurately as you can.
              </Text>
            </Animated.View>

            <View
              style={[
                s.inputPanel,
                {
                  paddingBottom: insets.bottom + 16,
                },
              ]}
            >
              {renderInput(
                questionType,
                options,
                sendTurn,
                textInput,
                setTextInput,
                toggleRecording,
                isRecording,
                isTranscribing,
              )}

              {isFirstQ && (
                <TouchableOpacity
                  style={s.bodyBtn}
                  onPress={() => router.push("/body-map" as any)}
                  activeOpacity={0.75}
                >
                  <View style={s.bodyIcon}>
                    <Ionicons name="body-outline" size={16} color="#60A5FA" />
                  </View>

                  <View>
                    <Text style={s.bodyBtnTitle}>Point on body</Text>
                    <Text style={s.bodyBtnSubtitle}>
                      Help us locate your symptom
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color="rgba(255,255,255,0.30)"
                  />
                </TouchableOpacity>
              )}

              <View style={s.secureRow}>
                <Ionicons
                  name="lock-closed-outline"
                  size={12}
                  color="rgba(255,255,255,0.25)"
                />
                <Text style={s.secureText}>
                  Your responses are private and secure
                </Text>
              </View>
            </View>
          </ScrollView>
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
  isTranscribing: boolean,
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

    default: {
      const micDisabled = isTranscribing;
      const inputDisabled = isRecording || isTranscribing;

      let placeholder = "Type your answer...";
      let placeholderColor = "rgba(255,255,255,0.30)";
      if (isRecording) {
        placeholder = "Recording… tap mic to stop";
        placeholderColor = "rgba(239,68,68,0.70)";
      } else if (isTranscribing) {
        placeholder = "Transcribing your voice…";
        placeholderColor = "rgba(96,165,250,0.70)";
      }

      return (
        <View style={s.textRow}>
          <TextInput
            style={s.textInput}
            value={textInput}
            onChangeText={setTextInput}
            placeholder={placeholder}
            placeholderTextColor={placeholderColor}
            multiline
            maxLength={600}
            autoFocus={false}
            editable={!inputDisabled}
          />

          <TouchableOpacity
            style={[
              s.micBtn,
              isRecording && s.micBtnActive,
              isTranscribing && s.micBtnTranscribing,
            ]}
            onPress={onMic}
            disabled={micDisabled}
            activeOpacity={0.8}
          >
            {isTranscribing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons
                name={isRecording ? "stop" : "mic"}
                size={19}
                color="#fff"
              />
            )}
          </TouchableOpacity>

          {!isRecording && !isTranscribing && textInput.trim().length > 0 && (
            <TouchableOpacity
              style={s.sendBtn}
              onPress={() => onSend(textInput)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={["#2563EB", "#3B82F6"]}
                style={s.sendGradient}
              >
                <Ionicons name="arrow-up" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      );
    }
  }
}

// ── Cool Loader ───────────────────────────────────────────────────────────────

const LOADING_MESSAGES = [
  "Analyzing your response...",
  "Preparing your next question...",
  "Understanding your symptoms...",
  "Almost there...",
  "CureSense AI is thinking...",
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
    Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: 3200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();

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
      <View style={l.orbWrap}>
        <SonarRing delay={0} size={90} />
        <SonarRing delay={1066} size={90} />
        <SonarRing delay={2133} size={90} />

        <Animated.View
          style={[
            l.orbitRing,
            {
              transform: [
                {
                  rotate: rotateDeg,
                },
              ],
            },
          ]}
        >
          <View style={[l.orbitDot, l.orbitDot1]} />
          <View style={[l.orbitDot, l.orbitDot2]} />
          <View style={[l.orbitDot, l.orbitDot3]} />
        </Animated.View>

        <Animated.View
          style={[
            l.orbOuter,
            {
              transform: [
                {
                  scale: orb,
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={["#1D4ED8", "#2563EB", "#3B82F6"]}
            style={l.orbInner}
          >
            <Ionicons name="medical" size={28} color="#fff" />
          </LinearGradient>
        </Animated.View>
      </View>

      <View style={l.messageBox}>
        <Text style={l.message} key={msgIdx}>
          {LOADING_MESSAGES[msgIdx]}
        </Text>

        <Text style={l.subLabel}>CURE SENSE AI</Text>
      </View>
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
      colors={["#07112F", "#0B1437", "#10255F"]}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={[
          g.container,
          {
            paddingTop: insets.top + 34,
            paddingBottom: insets.bottom + 35,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top branding */}
        <View style={g.topBrand}>
          <View style={g.brandMark}>
            <Ionicons name="medical" size={15} color="#fff" />
          </View>

          <Text style={g.brandName}>CureSense</Text>
        </View>

        {/* Main orb */}
        <Animated.View
          style={[
            g.orbOuter,
            {
              transform: [
                {
                  scale: pulseAnim,
                },
              ],
            },
          ]}
        >
          <View style={g.orbGlow} />

          <LinearGradient
            colors={["#1D4ED8", "#2563EB", "#3B82F6"]}
            style={g.orbInner}
          >
            <Ionicons name="medical" size={40} color="#fff" />
          </LinearGradient>
        </Animated.View>

        <View style={g.titleWrap}>
          <Text style={g.eyebrow}>AI-ASSISTED HEALTHCARE</Text>

          <Text style={g.title}>Medical Interview</Text>

          <Text style={g.sub}>
            Answer a few questions about your symptoms so your doctor can
            understand your concerns before your appointment.
          </Text>
        </View>

        {/* Info chips */}
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
            <Ionicons name="sparkles-outline" size={15} color="#60A5FA" />
            <Text style={g.chipText}>AI-assisted</Text>
          </View>
        </View>

        {/* Steps card */}
        <View style={g.stepsCard}>
          <Text style={g.stepsTitle}>HOW IT WORKS</Text>

          {[
            {
              icon: "chatbubble-ellipses-outline" as const,
              title: "Describe your symptoms",
              text: "Tell us what's bothering you",
            },
            {
              icon: "help-circle-outline" as const,
              title: "Answer follow-up questions",
              text: "We'll ask relevant questions",
            },
            {
              icon: "document-text-outline" as const,
              title: "Share with your doctor",
              text: "Your report helps with your visit",
            },
          ].map((step, i) => (
            <View key={i} style={g.step}>
              <View style={g.stepNumber}>
                <Text style={g.stepNumberText}>{i + 1}</Text>
              </View>

              <View style={g.stepIcon}>
                <Ionicons name={step.icon} size={18} color="#60A5FA" />
              </View>

              <View style={g.stepContent}>
                <Text style={g.stepTitle}>{step.title}</Text>
                <Text style={g.stepText}>{step.text}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Start button */}
        <TouchableOpacity
          style={[
            g.startBtn,
            starting && {
              opacity: 0.6,
            },
          ]}
          onPress={onStart}
          disabled={starting}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={["#1D4ED8", "#2563EB", "#3B82F6"]}
            style={g.startBtnGrad}
          >
            {starting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={g.startBtnText}>Begin Interview</Text>

                <View style={g.arrowCircle}>
                  <Ionicons name="arrow-forward" size={17} color="#2563EB" />
                </View>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={g.disclaimerRow}>
          <Ionicons
            name="lock-closed-outline"
            size={12}
            color="rgba(255,255,255,0.25)"
          />

          <Text style={g.disclaimer}>
            Your responses are shared only with your assigned clinician.
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

// ── Main Screen Styles ─────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  checkingOrb: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37,99,235,0.12)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.25)",
  },

  checkingOrbInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
  },

  checkingText: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 13,
    marginTop: 14,
  },

  screen: {
    flex: 1,
    backgroundColor: "#07112F",
    overflow: "hidden",
  },

  backgroundGlowOne: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(37,99,235,0.07)",
    top: -130,
    right: -100,
  },

  backgroundGlowTwo: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(59,130,246,0.04)",
    bottom: 100,
    left: -130,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 17,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  aiBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
  },

  headerBrand: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },

  headerSubtitle: {
    color: "rgba(255,255,255,0.38)",
    fontSize: 10,
    marginTop: 2,
  },

  qBadge: {
    minWidth: 58,
    backgroundColor: "rgba(37,99,235,0.13)",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.20)",
  },

  qBadgeSmall: {
    color: "rgba(147,197,253,0.55)",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1,
  },

  qBadgeText: {
    color: "#93C5FD",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 1,
  },

  questionArea: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "center",
    paddingHorizontal: 26,
    paddingVertical: 30,
  },

  questionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 18,
  },

  questionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#3B82F6",
  },

  questionLabel: {
    color: "#60A5FA",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
  },

  questionText: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 36,
    letterSpacing: -0.6,
    flexShrink: 1,
  },

  helperText: {
    color: "rgba(255,255,255,0.30)",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
  },

  inputPanel: {
    paddingHorizontal: 18,
    paddingTop: 17,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(7,17,47,0.98)",
    gap: 12,
  },

  textRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },

  textInput: {
    flex: 1,
    minHeight: 54,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 17,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    color: "#fff",
    fontSize: 15,
    lineHeight: 21,
    maxHeight: 130,
  },

  micBtn: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  micBtnActive: {
    backgroundColor: "rgba(239,68,68,0.85)",
    borderColor: "#EF4444",
  },

  micBtnTranscribing: {
    backgroundColor: "rgba(37,99,235,0.45)",
    borderColor: "rgba(96,165,250,0.50)",
  },

  sendBtn: {
    width: 50,
    height: 50,
    borderRadius: 17,
    overflow: "hidden",
    flexShrink: 0,
  },

  sendGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  bodyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 15,
    backgroundColor: "rgba(37,99,235,0.07)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.12)",
  },

  bodyIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37,99,235,0.13)",
  },

  bodyBtnTitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "700",
  },

  bodyBtnSubtitle: {
    color: "rgba(255,255,255,0.30)",
    fontSize: 10,
    marginTop: 2,
  },

  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  secureText: {
    color: "rgba(255,255,255,0.22)",
    fontSize: 10,
  },
});

// ── Loader styles ─────────────────────────────────────────────────────────────

const l = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#07112F",
    gap: 28,
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

  orbitRing: {
    position: "absolute",
    width: 148,
    height: 148,
  },

  orbitDot: {
    position: "absolute",
    width: 11,
    height: 11,
    borderRadius: 6,
  },

  orbitDot1: {
    backgroundColor: "#60A5FA",
    top: -1,
    left: 69,
  },

  orbitDot2: {
    backgroundColor: "#3B82F6",
    bottom: 18,
    right: 3,
  },

  orbitDot3: {
    backgroundColor: "#93C5FD",
    bottom: 18,
    left: 3,
  },

  orbOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37,99,235,0.13)",
    borderWidth: 1.5,
    borderColor: "rgba(96,165,250,0.30)",
  },

  orbInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
  },

  messageBox: {
    alignItems: "center",
    gap: 9,
  },

  message: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },

  subLabel: {
    color: "rgba(255,255,255,0.22)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.5,
  },
});

// ── Greeting styles ───────────────────────────────────────────────────────────

const g = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 25,
  },

  topBrand: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 4,
  },

  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },

  brandName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
  },

  orbOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(37,99,235,0.10)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.25)",
  },

  orbGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(37,99,235,0.10)",
  },

  orbInner: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: "center",
    justifyContent: "center",
  },

  titleWrap: {
    alignItems: "center",
    gap: 9,
  },

  eyebrow: {
    color: "#60A5FA",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2.1,
  },

  title: {
    color: "#fff",
    fontSize: 31,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.8,
  },

  sub: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 350,
  },

  chips: {
    flexDirection: "row",
    gap: 7,
    flexWrap: "wrap",
    justifyContent: "center",
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(37,99,235,0.11)",
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.17)",
  },

  chipText: {
    color: "#93C5FD",
    fontSize: 11,
    fontWeight: "600",
  },

  stepsCard: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  stepsTitle: {
    color: "rgba(255,255,255,0.32)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.8,
    marginBottom: 17,
  },

  step: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    marginBottom: 11,
  },

  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37,99,235,0.18)",
    marginRight: 9,
  },

  stepNumberText: {
    color: "#60A5FA",
    fontSize: 10,
    fontWeight: "800",
  },

  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(37,99,235,0.11)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.12)",
    marginRight: 12,
  },

  stepContent: {
    flex: 1,
  },

  stepTitle: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: "700",
  },

  stepText: {
    color: "rgba(255,255,255,0.33)",
    fontSize: 11,
    marginTop: 3,
  },

  startBtn: {
    width: "100%",
    borderRadius: 17,
    overflow: "hidden",
    shadowOpacity: 0.25,
    shadowRadius: 15,
    shadowOffset: {
      width: 0,
      height: 7,
    },
  },

  startBtnGrad: {
    paddingVertical: 17,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
  },

  startBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },

  arrowCircle: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  disclaimerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10,
  },

  disclaimer: {
    color: "rgba(255,255,255,0.22)",
    fontSize: 10,
    textAlign: "center",
    lineHeight: 16,
  },
});
