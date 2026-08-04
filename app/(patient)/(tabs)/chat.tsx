import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={['#0B1437', '#0F2060']} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <View style={[s.container, { paddingTop: insets.top + 24 }]}>
        <View style={s.iconWrap}>
          <Ionicons name="chatbubbles" size={48} color="#2563EB" />
        </View>
        <Text style={s.title}>Chat</Text>
        <Text style={s.sub}>Message your doctor or care team directly. This feature will be available soon.</Text>
        <View style={s.badge}>
          <Text style={s.badgeText}>Coming Soon</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  iconWrap:  { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(37,99,235,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title:     { color: '#fff', fontSize: 24, fontWeight: '800' },
  sub:       { color: 'rgba(255,255,255,0.50)', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  badge:     { backgroundColor: 'rgba(37,99,235,0.20)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(37,99,235,0.40)' },
  badgeText: { color: '#60A5FA', fontWeight: '700', fontSize: 13 },
});
