import { router } from "expo-router";
import { useState } from "react";
import {
    Image,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

type ViewMode = "front" | "back";

type SelectedProblems = {
  [bodyPart: string]: string[];
};

type OtherProblems = {
  [bodyPart: string]: string;
};

export default function BodyMapScreen() {
  const [view, setView] = useState<ViewMode>("front");
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [selectedProblems, setSelectedProblems] = useState<SelectedProblems>(
    {},
  );
  const [otherProblems, setOtherProblems] = useState<OtherProblems>({});

  const problems: { [bodyPart: string]: string[] } = {
    Forehead: [
      "Headache",
      "Pressure",
      "Pain",
      "Tenderness",
      "Swelling",
      "Numbness",
    ],
    "Right Eye": [
      "Eye pain",
      "Blurred vision",
      "Redness",
      "Swelling",
      "Itching",
      "Sensitivity to light",
    ],
    "Left Eye": [
      "Eye pain",
      "Blurred vision",
      "Redness",
      "Swelling",
      "Itching",
      "Sensitivity to light",
    ],
    Nose: [
      "Nose pain",
      "Congestion",
      "Runny nose",
      "Bleeding",
      "Swelling",
      "Pressure",
    ],
    "Right Cheek": [
      "Cheek pain",
      "Swelling",
      "Tenderness",
      "Numbness",
      "Pressure",
    ],
    "Left Cheek": [
      "Cheek pain",
      "Swelling",
      "Tenderness",
      "Numbness",
      "Pressure",
    ],
    Mouth: [
      "Mouth pain",
      "Sores",
      "Swelling",
      "Dryness",
      "Burning",
      "Numbness",
    ],
    Jaw: [
      "Jaw pain",
      "Stiffness",
      "Swelling",
      "Clicking",
      "Difficulty opening mouth",
    ],

    Neck: ["Neck pain", "Stiffness", "Swelling", "Numbness", "Tingling"],

    Chest: [
      "Chest pain",
      "Tightness",
      "Pressure",
      "Burning",
      "Difficulty breathing",
      "Palpitations",
    ],
    "Right Lung": [
      "Pain",
      "Difficulty breathing",
      "Tightness",
      "Cough",
      "Pressure",
    ],
    "Left Lung": [
      "Pain",
      "Difficulty breathing",
      "Tightness",
      "Cough",
      "Pressure",
    ],
    Heart: [
      "Chest pain",
      "Pressure",
      "Palpitations",
      "Tightness",
      "Shortness of breath",
    ],

    "Right Shoulder": [
      "Shoulder pain",
      "Stiffness",
      "Weakness",
      "Swelling",
      "Limited movement",
    ],
    "Left Shoulder": [
      "Shoulder pain",
      "Stiffness",
      "Weakness",
      "Swelling",
      "Limited movement",
    ],

    "Right Biceps": ["Pain", "Weakness", "Swelling", "Tightness", "Cramping"],
    "Left Biceps": ["Pain", "Weakness", "Swelling", "Tightness", "Cramping"],
    "Right Elbow": [
      "Elbow pain",
      "Stiffness",
      "Swelling",
      "Weakness",
      "Limited movement",
    ],
    "Left Elbow": [
      "Elbow pain",
      "Stiffness",
      "Swelling",
      "Weakness",
      "Limited movement",
    ],
    "Right Forearm": ["Pain", "Weakness", "Numbness", "Tingling", "Swelling"],
    "Left Forearm": ["Pain", "Weakness", "Numbness", "Tingling", "Swelling"],

    "Right Hand": [
      "Hand pain",
      "Numbness",
      "Tingling",
      "Swelling",
      "Weakness",
      "Stiffness",
    ],
    "Left Hand": [
      "Hand pain",
      "Numbness",
      "Tingling",
      "Swelling",
      "Weakness",
      "Stiffness",
    ],

    Liver: ["Abdominal pain", "Tenderness", "Swelling", "Pressure", "Burning"],
    Stomach: [
      "Stomach pain",
      "Nausea",
      "Bloating",
      "Burning",
      "Cramping",
      "Pressure",
    ],
    "Right Kidney": [
      "Kidney pain",
      "Side pain",
      "Back pain",
      "Pressure",
      "Tenderness",
    ],
    "Left Kidney": [
      "Kidney pain",
      "Side pain",
      "Back pain",
      "Pressure",
      "Tenderness",
    ],
    "Small Intestine": [
      "Abdominal pain",
      "Cramping",
      "Bloating",
      "Diarrhea",
      "Constipation",
    ],
    "Large Intestine": [
      "Abdominal pain",
      "Cramping",
      "Bloating",
      "Constipation",
      "Diarrhea",
    ],
    "Abdominal Muscles": [
      "Muscle pain",
      "Tightness",
      "Weakness",
      "Cramping",
      "Tenderness",
    ],

    "Pelvic Muscles": [
      "Pelvic pain",
      "Muscle pain",
      "Tightness",
      "Weakness",
      "Pressure",
    ],
    Groin: ["Groin pain", "Swelling", "Tenderness", "Pressure", "Numbness"],

    "Right Thigh Muscles": [
      "Thigh pain",
      "Muscle pain",
      "Weakness",
      "Cramping",
      "Swelling",
    ],
    "Left Thigh Muscles": [
      "Thigh pain",
      "Muscle pain",
      "Weakness",
      "Cramping",
      "Swelling",
    ],
    "Right Knee": [
      "Knee pain",
      "Swelling",
      "Stiffness",
      "Weakness",
      "Limited movement",
    ],
    "Left Knee": [
      "Knee pain",
      "Swelling",
      "Stiffness",
      "Weakness",
      "Limited movement",
    ],
    "Right Calf Muscles": [
      "Calf pain",
      "Cramping",
      "Swelling",
      "Tightness",
      "Weakness",
    ],
    "Left Calf Muscles": [
      "Calf pain",
      "Cramping",
      "Swelling",
      "Tightness",
      "Weakness",
    ],
    "Right Foot": [
      "Foot pain",
      "Swelling",
      "Numbness",
      "Tingling",
      "Stiffness",
      "Difficulty walking",
    ],
    "Left Foot": [
      "Foot pain",
      "Swelling",
      "Numbness",
      "Tingling",
      "Stiffness",
      "Difficulty walking",
    ],
    "Right Toes": ["Toe pain", "Numbness", "Tingling", "Swelling", "Stiffness"],
    "Left Toes": ["Toe pain", "Numbness", "Tingling", "Swelling", "Stiffness"],

    "Back of Head": ["Headache", "Pressure", "Pain", "Tenderness", "Numbness"],
    "Upper Neck": ["Neck pain", "Stiffness", "Tenderness", "Numbness"],
    "Lower Neck": ["Neck pain", "Stiffness", "Tightness", "Numbness"],
    "Upper Back Muscles": [
      "Upper back pain",
      "Muscle pain",
      "Stiffness",
      "Tightness",
      "Numbness",
    ],
    "Middle Back Muscles": [
      "Middle back pain",
      "Muscle pain",
      "Stiffness",
      "Tightness",
      "Numbness",
    ],
    "Lower Back Muscles": [
      "Lower back pain",
      "Muscle pain",
      "Stiffness",
      "Tightness",
      "Numbness",
    ],
    "Right Rear Shoulder": [
      "Shoulder pain",
      "Stiffness",
      "Weakness",
      "Swelling",
      "Limited movement",
    ],
    "Left Rear Shoulder": [
      "Shoulder pain",
      "Stiffness",
      "Weakness",
      "Swelling",
      "Limited movement",
    ],
    "Right Gluteal Muscles": [
      "Buttock pain",
      "Muscle pain",
      "Weakness",
      "Tightness",
      "Numbness",
    ],
    "Left Gluteal Muscles": [
      "Buttock pain",
      "Muscle pain",
      "Weakness",
      "Tightness",
      "Numbness",
    ],
  };

  const selectBodyPart = (part: string) => {
    setSelectedPart(part);
  };

  const toggleProblem = (problem: string) => {
    if (!selectedPart) return;
    setSelectedProblems((previous) => {
      const current = previous[selectedPart] || [];
      const alreadySelected = current.includes(problem);
      const updated = alreadySelected
        ? current.filter((item) => item !== problem)
        : [...current, problem];
      return { ...previous, [selectedPart]: updated };
    });
  };

  const updateOtherProblem = (text: string) => {
    if (!selectedPart) return;
    setOtherProblems((previous) => ({ ...previous, [selectedPart]: text }));
  };

  const hasSelection = (part: string) => {
    const symptoms = selectedProblems[part] || [];
    const other = otherProblems[part]?.trim() || "";
    return symptoms.length > 0 || other.length > 0;
  };

  const getRegionStyle = (part: string) => [
    styles.region,
    selectedPart === part && styles.activeRegion,
    hasSelection(part) && styles.savedRegion,
  ];

  const changeView = (newView: ViewMode) => {
    setView(newView);
    setSelectedPart(null);
  };

  const continueToInterview = () => {
    const allParts = new Set([
      ...Object.keys(selectedProblems),
      ...Object.keys(otherProblems),
    ]);

    const selectedParts = Array.from(allParts).filter((part) =>
      hasSelection(part),
    );

    const bodyMapAnswer = selectedParts
      .map((part) => {
        const symptoms = selectedProblems[part] || [];
        const other = otherProblems[part]?.trim() || "";
        const allSymptoms = [
          ...symptoms,
          ...(other ? [`Other: ${other}`] : []),
        ];
        return `${part}: ${allSymptoms.join(", ")}`;
      })
      .join("\n");

    router.navigate({
      pathname: "/interview",
      params: { bodyMapAnswer: bodyMapAnswer || "No body area selected." },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButtonContainer}
        >
          <Text style={styles.backButton}>‹</Text>
        </Pressable>
        <View>
          <Text style={styles.title}>Body Map</Text>
          <Text style={styles.subtitle}>
            Select all areas where you have a problem
          </Text>
        </View>
      </View>

      <View style={styles.viewButtons}>
        <Pressable
          style={[
            styles.viewButton,
            view === "front" && styles.activeViewButton,
          ]}
          onPress={() => changeView("front")}
        >
          <Text
            style={[styles.viewText, view === "front" && styles.activeViewText]}
          >
            Front
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.viewButton,
            view === "back" && styles.activeViewButton,
          ]}
          onPress={() => changeView("back")}
        >
          <Text
            style={[styles.viewText, view === "back" && styles.activeViewText]}
          >
            Back
          </Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.bodyContainer}>
          <View style={styles.bodyMapLayer}>
            <Image
              source={
                view === "front"
                  ? require("../../assets/images/body-front-detailed.png")
                  : require("../../assets/images/body-back-detailed.png")
              }
              style={styles.bodyImage}
              resizeMode="stretch"
            />

            {/* =================================================
                FRONT VIEW — face, torso, arms, hands, legs, feet, toes
            ================================================= */}

            {view === "front" && (
              <>
                {/* ---- FACE (tightened to match small face area) ---- */}
                <Pressable
                  style={[getRegionStyle("Forehead"), styles.foreheadRegion]}
                  onPress={() => selectBodyPart("Forehead")}
                />
                <Pressable
                  style={[getRegionStyle("Right Eye"), styles.rightEyeRegion]}
                  onPress={() => selectBodyPart("Right Eye")}
                />
                <Pressable
                  style={[getRegionStyle("Left Eye"), styles.leftEyeRegion]}
                  onPress={() => selectBodyPart("Left Eye")}
                />
                <Pressable
                  style={[getRegionStyle("Nose"), styles.noseRegion]}
                  onPress={() => selectBodyPart("Nose")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Right Cheek"),
                    styles.rightCheekRegion,
                  ]}
                  onPress={() => selectBodyPart("Right Cheek")}
                />
                <Pressable
                  style={[getRegionStyle("Left Cheek"), styles.leftCheekRegion]}
                  onPress={() => selectBodyPart("Left Cheek")}
                />
                <Pressable
                  style={[getRegionStyle("Mouth"), styles.mouthRegion]}
                  onPress={() => selectBodyPart("Mouth")}
                />
                <Pressable
                  style={[getRegionStyle("Jaw"), styles.jawRegion]}
                  onPress={() => selectBodyPart("Jaw")}
                />

                {/* ---- NECK ---- */}
                <Pressable
                  style={[getRegionStyle("Neck"), styles.neckRegion]}
                  onPress={() => selectBodyPart("Neck")}
                />

                {/* ---- CHEST / ORGANS ---- */}
                <Pressable
                  style={[getRegionStyle("Chest"), styles.chestRegion]}
                  onPress={() => selectBodyPart("Chest")}
                />
                <Pressable
                  style={[getRegionStyle("Right Lung"), styles.rightLungRegion]}
                  onPress={() => selectBodyPart("Right Lung")}
                />
                <Pressable
                  style={[getRegionStyle("Left Lung"), styles.leftLungRegion]}
                  onPress={() => selectBodyPart("Left Lung")}
                />
                <Pressable
                  style={[getRegionStyle("Heart"), styles.heartRegion]}
                  onPress={() => selectBodyPart("Heart")}
                />

                {/* ---- SHOULDERS ---- */}
                <Pressable
                  style={[
                    getRegionStyle("Right Shoulder"),
                    styles.rightShoulderRegion,
                  ]}
                  onPress={() => selectBodyPart("Right Shoulder")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Left Shoulder"),
                    styles.leftShoulderRegion,
                  ]}
                  onPress={() => selectBodyPart("Left Shoulder")}
                />

                {/* ---- BICEPS / ELBOW / FOREARM ---- */}
                <Pressable
                  style={[
                    getRegionStyle("Right Biceps"),
                    styles.rightBicepsRegion,
                  ]}
                  onPress={() => selectBodyPart("Right Biceps")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Left Biceps"),
                    styles.leftBicepsRegion,
                  ]}
                  onPress={() => selectBodyPart("Left Biceps")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Right Elbow"),
                    styles.rightElbowRegion,
                  ]}
                  onPress={() => selectBodyPart("Right Elbow")}
                />
                <Pressable
                  style={[getRegionStyle("Left Elbow"), styles.leftElbowRegion]}
                  onPress={() => selectBodyPart("Left Elbow")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Right Forearm"),
                    styles.rightForearmRegion,
                  ]}
                  onPress={() => selectBodyPart("Right Forearm")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Left Forearm"),
                    styles.leftForearmRegion,
                  ]}
                  onPress={() => selectBodyPart("Left Forearm")}
                />

                {/* ---- HANDS (repositioned lower, next to thighs where hands actually hang) ---- */}
                <Pressable
                  style={[getRegionStyle("Right Hand"), styles.rightHandRegion]}
                  onPress={() => selectBodyPart("Right Hand")}
                />
                <Pressable
                  style={[getRegionStyle("Left Hand"), styles.leftHandRegion]}
                  onPress={() => selectBodyPart("Left Hand")}
                />

                {/* ---- ABDOMEN / ORGANS ---- */}
                <Pressable
                  style={[getRegionStyle("Liver"), styles.liverRegion]}
                  onPress={() => selectBodyPart("Liver")}
                />
                <Pressable
                  style={[getRegionStyle("Stomach"), styles.stomachRegion]}
                  onPress={() => selectBodyPart("Stomach")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Right Kidney"),
                    styles.rightKidneyRegion,
                  ]}
                  onPress={() => selectBodyPart("Right Kidney")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Left Kidney"),
                    styles.leftKidneyRegion,
                  ]}
                  onPress={() => selectBodyPart("Left Kidney")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Large Intestine"),
                    styles.largeIntestineRegion,
                  ]}
                  onPress={() => selectBodyPart("Large Intestine")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Small Intestine"),
                    styles.smallIntestineRegion,
                  ]}
                  onPress={() => selectBodyPart("Small Intestine")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Abdominal Muscles"),
                    styles.abdominalMusclesRegion,
                  ]}
                  onPress={() => selectBodyPart("Abdominal Muscles")}
                />

                {/* ---- PELVIS ---- */}
                <Pressable
                  style={[
                    getRegionStyle("Pelvic Muscles"),
                    styles.pelvicMusclesRegion,
                  ]}
                  onPress={() => selectBodyPart("Pelvic Muscles")}
                />
                <Pressable
                  style={[getRegionStyle("Groin"), styles.groinRegion]}
                  onPress={() => selectBodyPart("Groin")}
                />

                {/* ---- THIGHS / KNEES / CALVES ---- */}
                <Pressable
                  style={[
                    getRegionStyle("Right Thigh Muscles"),
                    styles.rightThighRegion,
                  ]}
                  onPress={() => selectBodyPart("Right Thigh Muscles")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Left Thigh Muscles"),
                    styles.leftThighRegion,
                  ]}
                  onPress={() => selectBodyPart("Left Thigh Muscles")}
                />
                <Pressable
                  style={[getRegionStyle("Right Knee"), styles.rightKneeRegion]}
                  onPress={() => selectBodyPart("Right Knee")}
                />
                <Pressable
                  style={[getRegionStyle("Left Knee"), styles.leftKneeRegion]}
                  onPress={() => selectBodyPart("Left Knee")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Right Calf Muscles"),
                    styles.rightCalfRegion,
                  ]}
                  onPress={() => selectBodyPart("Right Calf Muscles")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Left Calf Muscles"),
                    styles.leftCalfRegion,
                  ]}
                  onPress={() => selectBodyPart("Left Calf Muscles")}
                />

                {/* ---- FEET + TOES (toes as separate small region at tip of foot) ---- */}
                <Pressable
                  style={[getRegionStyle("Right Foot"), styles.rightFootRegion]}
                  onPress={() => selectBodyPart("Right Foot")}
                />
                <Pressable
                  style={[getRegionStyle("Left Foot"), styles.leftFootRegion]}
                  onPress={() => selectBodyPart("Left Foot")}
                />
                <Pressable
                  style={[getRegionStyle("Right Toes"), styles.rightToesRegion]}
                  onPress={() => selectBodyPart("Right Toes")}
                />
                <Pressable
                  style={[getRegionStyle("Left Toes"), styles.leftToesRegion]}
                  onPress={() => selectBodyPart("Left Toes")}
                />
              </>
            )}

            {/* =================================================
                BACK VIEW — ONLY head, neck, shoulders, back muscles, glutes.
                Arms, forearms, hands, legs, calves, feet are
                intentionally NOT clickable here (only on Front).
            ================================================= */}

            {view === "back" && (
              <>
                <Pressable
                  style={[
                    getRegionStyle("Back of Head"),
                    styles.backHeadRegion,
                  ]}
                  onPress={() => selectBodyPart("Back of Head")}
                />
                <Pressable
                  style={[getRegionStyle("Upper Neck"), styles.upperNeckRegion]}
                  onPress={() => selectBodyPart("Upper Neck")}
                />
                <Pressable
                  style={[getRegionStyle("Lower Neck"), styles.lowerNeckRegion]}
                  onPress={() => selectBodyPart("Lower Neck")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Right Rear Shoulder"),
                    styles.rightRearShoulderRegion,
                  ]}
                  onPress={() => selectBodyPart("Right Rear Shoulder")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Left Rear Shoulder"),
                    styles.leftRearShoulderRegion,
                  ]}
                  onPress={() => selectBodyPart("Left Rear Shoulder")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Upper Back Muscles"),
                    styles.upperBackRegion,
                  ]}
                  onPress={() => selectBodyPart("Upper Back Muscles")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Middle Back Muscles"),
                    styles.middleBackRegion,
                  ]}
                  onPress={() => selectBodyPart("Middle Back Muscles")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Lower Back Muscles"),
                    styles.lowerBackRegion,
                  ]}
                  onPress={() => selectBodyPart("Lower Back Muscles")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Right Gluteal Muscles"),
                    styles.rightGluteRegion,
                  ]}
                  onPress={() => selectBodyPart("Right Gluteal Muscles")}
                />
                <Pressable
                  style={[
                    getRegionStyle("Left Gluteal Muscles"),
                    styles.leftGluteRegion,
                  ]}
                  onPress={() => selectBodyPart("Left Gluteal Muscles")}
                />
              </>
            )}
          </View>
        </View>

        {selectedPart && (
          <View style={styles.problemContainer}>
            <Text style={styles.selectedLabel}>Selected area</Text>
            <Text style={styles.selectedPart}>{selectedPart}</Text>
            <Text style={styles.sectionTitle}>Possible problems</Text>
            <Text style={styles.sectionSubtitle}>Select all that apply</Text>

            <View style={styles.problemList}>
              {(problems[selectedPart] || []).map((problem) => {
                const isSelected = (
                  selectedProblems[selectedPart] || []
                ).includes(problem);
                return (
                  <Pressable
                    key={problem}
                    style={[
                      styles.problemButton,
                      isSelected && styles.selectedProblemButton,
                    ]}
                    onPress={() => toggleProblem(problem)}
                  >
                    <Text
                      style={[
                        styles.problemText,
                        isSelected && styles.selectedProblemText,
                      ]}
                    >
                      {isSelected ? "✓ " : ""}
                      {problem}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Other</Text>
            <Text style={styles.sectionSubtitle}>
              Describe anything else you are experiencing.
            </Text>

            <TextInput
              style={styles.otherInput}
              value={otherProblems[selectedPart] || ""}
              onChangeText={updateOtherProblem}
              placeholder="Describe your problem..."
              placeholderTextColor="#94A3B8"
              multiline
              textAlignVertical="top"
            />

            <Pressable
              style={styles.continueButton}
              onPress={continueToInterview}
            >
              <Text style={styles.continueText}>Continue</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButtonContainer: { width: 40, height: 40, justifyContent: "center" },
  backButton: { fontSize: 38, lineHeight: 38, color: "#264296" },
  title: { fontSize: 22, fontWeight: "700", color: "#1E293B" },
  subtitle: { fontSize: 13, color: "#64748B", marginTop: 3 },

  viewButtons: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
  },
  viewButton: {
    width: 155,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 28,
    backgroundColor: "#EEF2FF",
    marginHorizontal: 5,
  },
  activeViewButton: { backgroundColor: "#29479E" },
  viewText: { fontSize: 16, fontWeight: "600", color: "#264296" },
  activeViewText: { color: "#FFFFFF" },

  scrollContent: { paddingBottom: 40 },

  bodyContainer: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingTop: 8,
    paddingBottom: 8,
  },

  bodyMapLayer: { width: 340, height: 510, position: "relative" },
  bodyImage: {
    position: "absolute",
    width: "100%",
    height: "100%",
    left: 0,
    top: 0,
  },

  region: {
    position: "absolute",
    backgroundColor: "rgba(38, 66, 150, 0.22)",
    borderWidth: 1.5,
    borderColor: "rgba(38, 66, 150, 0.60)",
    borderRadius: 8,
    zIndex: 20,
  },
  activeRegion: {
    backgroundColor: "rgba(38, 66, 150, 0.50)",
    borderColor: "#264296",
    borderWidth: 2,
  },
  savedRegion: {
    backgroundColor: "rgba(38, 66, 150, 0.34)",
    borderColor: "#264296",
    borderWidth: 2,
  },

  // ===================== FRONT FACE (tightened) =====================
  foreheadRegion: {
    width: 30,
    height: 19,
    top: "6.10%",
    left: "50%",
    marginLeft: -15,
    borderRadius: 8,
  },
  rightEyeRegion: {
    width: 13,
    height: 8,
    top: "10.3%",
    left: "44.5%",
    borderRadius: 5,
  },
  leftEyeRegion: {
    width: 13,
    height: 8,
    top: "10.3%",
    right: "44.5%",
    borderRadius: 5,
  },
  noseRegion: {
    width: 10,
    height: 16,
    top: "10.9%",
    left: "50%",
    marginLeft: -5,
    borderRadius: 6,
  },
  rightCheekRegion: {
    width: 16,
    height: 14,
    top: "11.2%",
    left: "43%",
    borderRadius: 8,
  },
  leftCheekRegion: {
    width: 16,
    height: 14,
    top: "11.2%",
    right: "43%",
    borderRadius: 8,
  },
  mouthRegion: {
    width: 16,
    height: 8,
    top: "14.2%",
    left: "50%",
    marginLeft: -8,
    borderRadius: 5,
  },
  //   jawRegion: {
  //     width: 26,
  //     height: 12,
  //     top: "14.1%",
  //     left: "50%",
  //     marginLeft: -13,
  //     borderRadius: 8,
  //   },

  // ===================== FRONT NECK =====================
  neckRegion: {
    width: 38,
    height: 24,
    top: "16.5%",
    left: "50%",
    marginLeft: -19,
    borderRadius: 12,
  },

  // ===================== FRONT CHEST =====================
  //   chestRegion: {
  //     width: 108,
  //     height: 75,
  //     top: "21%",
  //     left: "50%",
  //     marginLeft: -54,
  //     borderRadius: 22,
  //   },
  rightLungRegion: {
    width: 39,
    height: 65,
    top: "21%",
    left: "38%",
    borderRadius: 18,
  },
  leftLungRegion: {
    width: 39,
    height: 65,
    top: "21%",
    right: "38%",
    borderRadius: 18,
  },
  heartRegion: {
    width: 25,
    height: 32,
    top: "23%",
    left: "50%",
    marginLeft: -10,
    borderRadius: 12,
  },

  // ===================== FRONT SHOULDERS =====================
  rightShoulderRegion: {
    width: 42,
    height: 40,
    top: "17.8%",
    left: "27%",
    borderRadius: 20,
  },
  leftShoulderRegion: {
    width: 42,
    height: 40,
    top: "17.8%",
    right: "27%",
    borderRadius: 20,
  },

  // ===================== FRONT ARMS =====================
  rightBicepsRegion: {
    width: 34,
    height: 68,
    top: "24%",
    left: "27.5%",
    borderRadius: 17,
  },
  leftBicepsRegion: {
    width: 34,
    height: 68,
    top: "24%",
    right: "27.5%",
    borderRadius: 17,
  },
  rightElbowRegion: {
    width: 25,
    height: 24,
    top: "33.5%",
    left: "29%",
    borderRadius: 12,
  },
  leftElbowRegion: {
    width: 25,
    height: 24,
    top: "33.5%",
    right: "29%",
    borderRadius: 12,
  },
  rightForearmRegion: {
    width: 30,
    height: 70,
    top: "34.5%",
    left: "26%",
    borderRadius: 16,
  },
  leftForearmRegion: {
    width: 30,
    height: 70,
    top: "34.5%",
    right: "26%",
    borderRadius: 16,
  },

  // ===================== FRONT HANDS (repositioned lower, matching where hands hang) =====================
  rightHandRegion: {
    width: 30,
    height: 42,
    top: "47%",
    left: "20%",
    borderRadius: 16,
  },
  leftHandRegion: {
    width: 30,
    height: 42,
    top: "47%",
    right: "20%",
    borderRadius: 16,
  },

  // ===================== FRONT ABDOMEN =====================
  liverRegion: {
    width: 52,
    height: 38,
    top: "29%",
    left: "38%",
    borderRadius: 18,
  },
  stomachRegion: {
    width: 40,
    height: 40,
    top: "30.5%",
    right: "40%",
    borderRadius: 18,
  },
  rightKidneyRegion: {
    width: 22,
    height: 30,
    top: "34%",
    left: "39%",
    borderRadius: 12,
  },
  leftKidneyRegion: {
    width: 22,
    height: 30,
    top: "34%",
    right: "39%",
    borderRadius: 12,
  },
  largeIntestineRegion: {
    width: 54,
    height: 24,
    top: "37%",
    left: "50%",
    marginLeft: -33,
    borderRadius: 17,
  },
  smallIntestineRegion: {
    width: 50,
    height: 50,
    top: "39.5%",
    left: "50%",
    marginLeft: -25,
    borderRadius: 22,
  },
  //   abdominalMusclesRegion: {
  //     width: 58,
  //     height: 76,
  //     top: "29.5%",
  //     left: "50%",
  //     marginLeft: -29,
  //     borderRadius: 20,
  //   },

  // ===================== FRONT PELVIS =====================
  pelvicMusclesRegion: {
    width: 39,
    height: 30,
    top: "46.5%",
    left: "53%",
    marginLeft: -26,
    borderRadius: 15,
  },
  //   groinRegion: {
  //     width: 40,
  //     height: 24,
  //     top: "44.5%",
  //     left: "50%",
  //     marginLeft: -20,
  //     borderRadius: 13,
  //   },

  // ===================== FRONT LEGS =====================
  rightThighRegion: {
    width: 42,
    height: 98,
    top: "47%",
    left: "34.5%",
    borderRadius: 20,
  },
  leftThighRegion: {
    width: 42,
    height: 98,
    top: "47%",
    right: "34.5%",
    borderRadius: 20,
  },
  rightKneeRegion: {
    width: 34,
    height: 30,
    top: "64%",
    left: "35.5%",
    borderRadius: 16,
  },
  leftKneeRegion: {
    width: 34,
    height: 30,
    top: "64%",
    right: "35.5%",
    borderRadius: 16,
  },
  rightCalfRegion: {
    width: 36,
    height: 84,
    top: "68%",
    left: "35.5%",
    borderRadius: 19,
  },
  leftCalfRegion: {
    width: 36,
    height: 84,
    top: "68%",
    right: "35.5%",
    borderRadius: 19,
  },

  // ===================== FRONT FEET + TOES =====================
  rightFootRegion: {
    width: 42,
    height: 24,
    top: "86%",
    left: "35%",
    borderRadius: 14,
  },
  leftFootRegion: {
    width: 42,
    height: 24,
    top: "86%",
    right: "35%",
    borderRadius: 14,
  },
  rightToesRegion: {
    width: 28,
    height: 12,
    top: "82.5%",
    left: "38%",
    borderRadius: 8,
  },
  leftToesRegion: {
    width: 24,
    height: 12,
    top: "82.5%",
    right: "38%",
    borderRadius: 8,
  },

  // ===================== BACK HEAD / NECK =====================
  backHeadRegion: {
    width: 48,
    height: 52,
    top: "5.5%",
    left: "50%",
    marginLeft: -24,
    borderRadius: 20,
  },
  //   upperNeckRegion: {
  //     width: 40,
  //     height: 28,
  //     top: "11%",
  //     left: "50%",
  //     marginLeft: -20,
  //     borderRadius: 12,
  //   },
  //   lowerNeckRegion: {
  //     width: 48,
  //     height: 26,
  //     top: "13%",
  //     left: "50%",
  //     marginLeft: -24,
  //     borderRadius: 12,
  //   },

  // ===================== BACK SHOULDERS =====================
  //   LeftRearShoulderRegion: {
  //     width: 50,
  //     height: 44,
  //     top: "20%",
  //     left: "28%",
  //     borderRadius: 20,
  //   },
  //   RightRearShoulderRegion: {
  //     width: 50,
  //     height: 44,
  //     top: "20%",
  //     right: "28%",
  //     borderRadius: 20,
  //   },

  // ===================== BACK MUSCLES =====================
  upperBackRegion: {
    width: 95,
    height: 72,
    top: "20.5%",
    left: "50%",
    marginLeft: -47,
    borderRadius: 25,
  },
  middleBackRegion: {
    width: 100,
    height: 85,
    top: "29%",
    left: "50%",
    marginLeft: -50,
    borderRadius: 25,
  },
  lowerBackRegion: {
    width: 90,
    height: 70,
    top: "39%",
    left: "50%",
    marginLeft: -45,
    borderRadius: 22,
  },

  // ===================== BACK GLUTES =====================
  rightGluteRegion: {
    width: 48,
    height: 60,
    top: "42%",
    left: "35%",
    borderRadius: 22,
  },
  leftGluteRegion: {
    width: 48,
    height: 60,
    top: "42%",
    right: "35%",
    borderRadius: 22,
  },

  // ===================== SYMPTOM PANEL =====================
  problemContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  selectedLabel: { fontSize: 12, color: "#64748B" },
  selectedPart: {
    fontSize: 21,
    fontWeight: "700",
    color: "#264296",
    marginTop: 3,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 5,
  },
  sectionSubtitle: { fontSize: 13, color: "#64748B", marginBottom: 15 },
  problemList: { flexDirection: "row", flexWrap: "wrap", marginBottom: 20 },
  problemButton: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    marginRight: 8,
    marginBottom: 10,
  },
  selectedProblemButton: { backgroundColor: "#264296", borderColor: "#264296" },
  problemText: { fontSize: 14, color: "#334155" },
  selectedProblemText: { color: "#FFFFFF", fontWeight: "600" },
  otherInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15,
    color: "#1E293B",
    marginBottom: 20,
    backgroundColor: "#FFFFFF",
  },
  continueButton: {
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#264296",
  },
  continueText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
