import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
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

// ── Modal Sheet ───────────────────────────────────────────────────────────────

function ModalSheet({
  visible, onClose, icon, title, color, items,
}: {
  visible: boolean;
  onClose: () => void;
  icon:    React.ComponentProps<typeof Ionicons>['name'];
  title:   string;
  color:   string;
  items:   string[];
}) {
  const translateY    = useRef(new Animated.Value(600)).current;
  const overlayAnim   = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      translateY.setValue(600);
      overlayAnim.setValue(0);
      Animated.parallel([
        Animated.timing(overlayAnim, {
          toValue: 1, duration: 320, useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0, useNativeDriver: true,
          damping: 20, stiffness: 110, mass: 1,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY,  { toValue: 600, duration: 260, useNativeDriver: true }),
      ]).start(() => setRendered(false));
    }
  }, [visible]);

  if (!rendered) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Animated.View style={[m.overlayWrap, { opacity: overlayAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <Animated.View style={[m.sheet, { transform: [{ translateY }] }]}>
          {/* Handle bar */}
          <View style={m.handle} />

          {/* Header */}
          <View style={m.sheetHeader}>
            <View style={[m.iconCircle, { backgroundColor: `${color}22` }]}>
              <Ionicons name={icon} size={20} color={color} />
            </View>
            <Text style={[m.sheetTitle, { color }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={m.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.30)" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
            {items.map((item, i) => (
              <View key={i} style={m.sheetItem}>
                <View style={[m.bullet, { backgroundColor: color }]} />
                <Text style={m.sheetText}>{item}</Text>
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ReportSheetScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();

  const [report,      setReport]      = useState<ReportData | null>(null);
  const [session,     setSession]     = useState<SessionData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [activeModal, setActiveModal] = useState<'appointment' | 'flags' | null>(null);

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

  const ps          = report.patient_summary;
  const diagnoses   = report.interpreted_diagnoses
    .filter(d => d.plausibility !== 'unlikely')
    .slice(0, 3);
  const flags       = report.doctor_report?.medicationFlags ?? [];
  const apptItems   = ps.appointmentGuidance?.map(g => g.point).filter(Boolean) ?? [];
  const flagItems   = flags.map(f => `${f.drug}: ${f.flag}`).filter(Boolean);
  const sessionName = session.session_name || 'Medical Interview';

  const hasActions = apptItems.length > 0 || flagItems.length > 0;

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
        contentContainerStyle={[s.container, { paddingBottom: insets.bottom + (hasActions ? 110 : 32) }]}
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

        {/* Diagnosis list — top 3 only */}
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
            {ps.medicationNotes.map((med, i) => (
              <View key={i} style={s.medNoteCard}>
                <Text style={s.medNoteDrug}>{med.drug}</Text>
                <Text style={s.medNoteText}>{med.note}</Text>
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

      {/* Bottom action bar */}
      {hasActions && (
        <View style={[s.actionBar, { bottom: insets.bottom + 16 }]}>
          {apptItems.length > 0 && (
            <TouchableOpacity
              style={[s.actionBtn, s.actionBtnGreen]}
              onPress={() => setActiveModal('appointment')}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={18} color="#22C55E" />
              <Text style={[s.actionBtnText, { color: '#22C55E' }]}>Appointment</Text>
            </TouchableOpacity>
          )}
          {flagItems.length > 0 && (
            <TouchableOpacity
              style={[s.actionBtn, s.actionBtnRed]}
              onPress={() => setActiveModal('flags')}
              activeOpacity={0.8}
            >
              <Ionicons name="warning-outline" size={18} color="#F87171" />
              <Text style={[s.actionBtnText, { color: '#F87171' }]}>Flags</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Modal sheets */}
      <ModalSheet
        visible={activeModal === 'appointment'}
        onClose={() => setActiveModal(null)}
        icon="calendar-outline"
        title="Appointment Guidance"
        color="#22C55E"
        items={apptItems}
      />
      <ModalSheet
        visible={activeModal === 'flags'}
        onClose={() => setActiveModal(null)}
        icon="warning-outline"
        title="Medical Flags"
        color="#F87171"
        items={flagItems}
      />
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
  diagNote:  { color: 'rgba(255,255,255,0.60)', fontSize: 13, lineHeight: 20 },

  medNoteCard: { backgroundColor: 'rgba(251,191,36,0.07)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(251,191,36,0.20)', gap: 4 },
  medNoteDrug: { color: '#FBBF24', fontSize: 13, fontWeight: '700' },
  medNoteText: { color: 'rgba(255,255,255,0.60)', fontSize: 13, lineHeight: 19 },

  transcriptBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(37,99,235,0.10)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(37,99,235,0.20)', marginTop: 4 },
  transcriptBtnText: { color: '#60A5FA', fontSize: 13, fontWeight: '600', flex: 1 },

  disclaimer: { color: 'rgba(255,255,255,0.20)', fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },

  actionBar:      { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 10 },
  actionBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5 },
  actionBtnGreen: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.35)' },
  actionBtnRed:   { backgroundColor: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.35)' },
  actionBtnText:  { fontSize: 14, fontWeight: '700' },
});

const m = StyleSheet.create({
  overlayWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 24,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center', marginBottom: 18,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', flex: 1 },
  closeBtn:   { padding: 2 },

  sheetItem: { flexDirection: 'row', gap: 10, marginBottom: 14, alignItems: 'flex-start' },
  bullet:    { width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  sheetText: { color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 21, flex: 1 },
});
