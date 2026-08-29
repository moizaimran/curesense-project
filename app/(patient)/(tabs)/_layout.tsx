import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs } from "expo-router";
import { Platform } from "react-native";

// ── Design tokens (matches landing page) ────────────────────────────────────
const C = {
  navy: "#070B1F",
  navyMid: "#0B1437",
  navyDeep: "#0F2060",
  blue: "#2563EB",
  blueLight: "#60A5FA",
  violet: "#8B5CF6",
  border: "rgba(255,255,255,0.08)",
  inactive: "rgba(255,255,255,0.35)",
};

// Small pill/glow behind the active icon — echoes the landing page's
// gradient badges and glass-card treatment.
function TabIcon({
  name,
  color,
  focused,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  focused: boolean;
}) {
  if (!focused) {
    return <Ionicons name={name} size={22} color={color} />;
  }
  return (
    <LinearGradient
      colors={[C.blue, C.violet]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: 34,
        height: 34,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={name} size={18} color="#fff" />
    </LinearGradient>
  );
}

export default function PatientLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.navyMid,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 84 : 68,
          paddingBottom: Platform.OS === "ios" ? 26 : 10,
          paddingTop: 10,
        },
        tabBarActiveTintColor: C.blueLight,
        tabBarInactiveTintColor: C.inactive,
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontWeight: "700",
          marginTop: 4,
          letterSpacing: 0.1,
        },
      }}
    >
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="person-circle-outline"
              color={color as string}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="interview"
        options={{
          title: "Interview",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="mic-outline"
              color={color as string}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="document-text-outline"
              color={color as string}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Appointments",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="calendar-outline"
              color={color as string}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="scan-outline"
              color={color as string}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}
