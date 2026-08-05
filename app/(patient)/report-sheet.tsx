import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_URL } from '@/constants/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AppointmentItem { point: string; source?: string; }
interface MedFlag         { drug: string; flag: string; citation?: string; }
interface MedNote         { drug: string; note: string; }

interface Diagnosis {
  disease:        string;
  plausibility:   'likely' | 'possible' | 'unlikely';
  clinicalReason: string;
  patientNote:    string;
}

interface ReportData {
  patient_summary: {
    patientComplaintSummary: string;
    referralSpecialty:       string;
    appointmentGuidance:     AppointmentItem[];
    medicationNotes:         MedNote[];
  };
  interpreted_diagnoses: Diagnosis[];
  doctor_report: {
    medicationFlags: MedFlag[];
  };
}

interface SessionData {
  session_name:    string;
  started_at:      string;
  completed_at:    string | null;
  status:          string;
  turn_count:      number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function plausibilityColor(p: string) {
  if (p === 'likely')   return '#22C55E';
  if (p === 'possible') return '#FBBF24';
  return '#94A3B8';
}
function plausibilityBg(p: string) {
  if (p === 'likely')   return 'rgba(34,197,94,0.12)';
  if (p === 'possible') return 'rgba(251,191,36,0.12)';
  return 'rgba(148,163,184,0.10)';
}

// ── Floating Popup ────────────────────────────────────────────────────────────

function FloatingPopup({
  icon, label, color, items, side,
}: {
  icon:  React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  items: string[];
  side:  'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  function toggle() {
    Animated.timing(anim, {
      toValue:  open ? 0 : 1,
      duration: 220,
      easing:   Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    setOpen(o => !o);
  }

  const panelWidth  = anim.interpolate({ inputRange: [0, 1], outputRange: [0,  260] });
  const panelHeight = anim.interpolate({ inputRange: [0, 1], outputRange: [0,  Math.min(items.length * 56 + 48, 320)] });
  const panelOpacity = anim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] });

  if (items.length === 0) return null;

  return (
    <View style={[fp.wrap, side === 'right' ? fp.right : fp.left]}>
      {/* Expanded panel */}
      <Animated.View style={[fp.panel, side === 'right' ? fp.panelRight : fp.panelLeft, { width: panelWidth, maxHeight: panelHeight, opacity: panelOpacity }]}>
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <Text style={[fp.panelTitle, { color }]}>{label}</Text>
          {items.map((item, i) => (
            <View key={i} style={fp.panelItem}>
              <View style={[fp.bullet, { backgroundColor: color }]} />
              <Text style={fp.panelText}>{item}</Text>
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      {/* Pill badge */}
      <TouchableOpacity
        style={[fp.pill, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}
        onPress={toggle}
        activeOpacity={0.8}
      >
        <Ionicons name={open ? 'close' : icon} size={14} color={color} />
        {!open && <Text style={[fp.pillLabel, { color }]}>{label}</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ReportSheetScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();

  const [report,  setReport]  = useState<ReportData | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => { if (session_id) fetchData(); }, [session_id]);

  async function fetchData() {
    try {
      const token = await SecureStore.getItemAsync('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [repRes, sessRes] = await Promise.all([
        fetch(`${API_URL}/api/reports/session/${session_id}`, { headers }),
        fetch(`${API_URL}/api/sessions/${session_id}`,        { headers }),
      ]);

      if (!repRes.ok)  throw new Error('Could not load report');
      if (!sessRes.ok) throw new Error('Could not load session');

      const [rep, sess] = await Promise.all([repRes.json(), sessRes.json()]);
      setReport(rep);
      setSession(sess);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <LinearGradient colors={['#0B1437', '#0F2060']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#2563EB" size="large" />
      </LinearGradient>
    );
  }

  if (error || !report || !session) {
    return (
      <LinearGradient colors={['#0B1437', '#0F2060']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#F87171', fontSize: 14, textAlign: 'center' }}>{error || 'Report unavailable'}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: '#60A5FA', fontSize: 14 }}>Go back</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const ps           = report.patient_summary;
  const diagnoses    = report.interpreted_diagnoses.filter(d => d.plausibility !== 'unlikely');
  const flags        = report.doctor_report?.medicationFlags ?? [];
  const apptItems    = ps.appointmentGuidance?.map(g => g.point).filter(Boolean) ?? [];
  const flagItems    = flags.map(f => `${f.drug}: ${f.flag}`).filter(Boolean);
  const sessionName  = session.session_name || 'Medical Interview';

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1437' }}>
      <StatusBar style="light" />

      {/* Header */}
      <LinearGradient colors={['#0B1437', '#0C1845']} style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle} numberOfLines={1}>{sessionName}</Text>
          <Text style={s.headerDate}>{fmtDate(session.completed_at ?? session.started_at)}</Text>
        </View>
        <View style={[s.completeBadge]}>
          <Text style={s.completeBadgeText}>Complete</Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[s.container, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Specialty banner */}
        {ps.referralSpecialty ? (
          <LinearGradient colors={['rgba(37,99,235,0.18)', 'rgba(29,78,216,0.08)']} style={s.specialtyBanner}>
            <Ionicons name="medical-outline" size={18} color="#60A5FA" />
            <View style={{ flex: 1 }}>
              <Text style={s.specialtyLabel}>Recommended Specialty</Text>
              <Text style={s.specialtyValue}>{ps.referralSpecialty}</Text>
            </View>
          </LinearGradient>
        ) : null}

        {/* Patient complaint summary */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="document-text-outline" size={16} color="#60A5FA" />
            <Text style={s.cardTitle}>Your Summary</Text>
          </View>
          <Text style={s.summaryText}>{ps.patientComplaintSummary || 'No summary available.'}</Text>
        </View>

        {/* Diagnosis list */}
        {diagnoses.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Possible Conditions</Text>
            {diagnoses.map((d, i) => (
              <View key={i} style={s.diagCard}>
                <View style={s.diagRow}>
                  <View style={s.rankBadge}>
                    <Text style={s.rankText}>{i + 1}</Text>
                  </View>
                  <Text style={s.diagName}>{d.disease}</Text>
                  <View style={[s.plausBadge, { backgroundColor: plausibilityBg(d.plausibility) }]}>
                    <Text style={[s.plausText, { color: plausibilityColor(d.plausibility) }]}>
                      {d.plausibility.charAt(0).toUpperCase() + d.plausibility.slice(1)}
                    </Text>
                  </View>
                </View>
                {d.patientNote ? (
                  <Text style={s.diagNote}>{d.patientNote}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* Medication notes */}
        {ps.medicationNotes && ps.medicationNotes.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Medication Notes</Text>
            {ps.medicationNotes.map((m, i) => (
              <View key={i} style={s.medNoteCard}>
                <Text style={s.medNoteDrug}>{m.drug}</Text>
                <Text style={s.medNoteText}>{m.note}</Text>
              </View>
            ))}
          </View>
        )}

        {/* View Transcript link */}
        <TouchableOpacity
          style={s.transcriptBtn}
          onPress={() => router.push({ pathname: '/transcript', params: { session_id } } as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubbles-outline" size={16} color="#60A5FA" />
          <Text style={s.transcriptBtnText}>View Interview Transcript</Text>
          <Ionicons name="chevron-forward" size={14} color="rgba(96,165,250,0.6)" />
        </TouchableOpacity>

        <Text style={s.disclaimer}>
          This summary is generated by AI to help you prepare for your appointment. It is not a medical diagnosis.
        </Text>
      </ScrollView>

      {/* Floating popups */}
      <FloatingPopup
        icon="calendar-outline"
        label="Appointment"
        color="#22C55E"
        items={apptItems}
        side="right"
      />
      {flagItems.length > 0 && (
        <FloatingPopup
          icon="warning-outline"
          label="Flags"
          color="#F87171"
          items={flagItems}
          side="left"
        />
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerCenter: { flex: 1 },
  headerTitle:  { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerDate:   { color: 'rgba(255,255,255,0.38)', fontSize: 11, marginTop: 2 },
  completeBadge:     { backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)' },
  completeBadgeText: { color: '#22C55E', fontSize: 11, fontWeight: '700' },

  container: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },

  specialtyBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(37,99,235,0.25)' },
  specialtyLabel:  { color: 'rgba(255,255,255,0.40)', fontSize: 11, fontWeight: '600' },
  specialtyValue:  { color: '#93C5FD', fontSize: 14, fontWeight: '700', marginTop: 2 },

  card:       { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle:  { color: '#60A5FA', fontSize: 13, fontWeight: '700' },
  summaryText:{ color: 'rgba(255,255,255,0.80)', fontSize: 14, lineHeight: 22 },

  section:      { gap: 8 },
  sectionLabel: { color: 'rgba(255,255,255,0.40)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },

  diagCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 8 },
  diagRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankBadge:{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(37,99,235,0.25)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankText: { color: '#60A5FA', fontSize: 11, fontWeight: '800' },
  diagName: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  plausBadge:{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  plausText: { fontSize: 11, fontWeight: '700' },
  diagNote:  { color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 19 },

  medNoteCard: { backgroundColor: 'rgba(251,191,36,0.07)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(251,191,36,0.20)', gap: 4 },
  medNoteDrug: { color: '#FBBF24', fontSize: 13, fontWeight: '700' },
  medNoteText: { color: 'rgba(255,255,255,0.60)', fontSize: 13, lineHeight: 18 },

  transcriptBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(37,99,235,0.10)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(37,99,235,0.20)', marginTop: 4 },
  transcriptBtnText: { color: '#60A5FA', fontSize: 13, fontWeight: '600', flex: 1 },

  disclaimer: { color: 'rgba(255,255,255,0.20)', fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },
});

const fp = StyleSheet.create({
  wrap:      { position: 'absolute', bottom: 100, alignItems: 'flex-end', gap: 8 },
  right:     { right: 16 },
  left:      { left: 16, alignItems: 'flex-start' },

  pill:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  pillLabel: { fontSize: 12, fontWeight: '700' },

  panel:      { borderRadius: 14, backgroundColor: 'rgba(11,20,55,0.97)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', padding: 14, overflow: 'hidden' },
  panelRight: { alignSelf: 'flex-end' },
  panelLeft:  { alignSelf: 'flex-start' },
  panelTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  panelItem:  { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start' },
  bullet:     { width: 6, height: 6, borderRadius: 3, marginTop: 5, flexShrink: 0 },
  panelText:  { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19, flex: 1 },
});
