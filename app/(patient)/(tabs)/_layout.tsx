import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';

const C = {
  bg:      '#0B1437',
  border:  'rgba(255,255,255,0.07)',
  active:  '#2563EB',
  inactive:'rgba(255,255,255,0.35)',
};

export default function PatientLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.bg,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 80 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor:   C.active,
        tabBarInactiveTintColor: C.inactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Ionicons name="person-circle-outline" size={24} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="interview"
        options={{
          title: 'Interview',
          tabBarIcon: ({ color }) => <Ionicons name="mic-outline" size={24} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color }) => <Ionicons name="document-text-outline" size={24} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color }) => <Ionicons name="chatbubbles-outline" size={24} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color }) => <Ionicons name="scan-outline" size={24} color={color as string} />,
        }}
      />
    </Tabs>
  );
}
