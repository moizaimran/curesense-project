import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_URL } from '@/constants/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Session {
  _id:              string;
  status:           'in_progress' | 'completed' | 'abandoned' | 'failed';
  session_name:     string;
  turn_count:       number;
  started_at:       string;
  completed_at:     string | null;
  last_activity_at: string;
}

interface Report {
  _id:        string;
  session_id: string;
  patient_summary: {
    referralSpecialty: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function hoursLeft(last_activity_at: string) {
  const elapsed = (Date.now() - new Date(last_activity_at).getTime()) / 36e5;
  const left    = Math.max(0, 48 - elapsed);
  if (left < 1) return `${Math.round(left * 60)}m remaining`;
  return `${Math.floor(left)}h ${Math.round((left % 1) * 60)}m remaining`;
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [sessions,   setSessions]   = useState<Session[]>([]);
  const [reports,    setReports]    = useState<Report[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');
  const [deleting,   setDeleting]   = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const token      = await SecureStore.getItemAsync('token');
      const patient_id = await SecureStore.getItemAsync('patient_id');
      const headers    = { Authorization: `Bearer ${token}` };

      const [sessRes, repRes] = await Promise.all([
        fetch(`${API_URL}/api/sessions/patient/${patient_id}`, { headers }),
        fetch(`${API_URL}/api/reports/patient/${patient_id}`,  { headers }),
      ]);

      if (!sessRes.ok) throw new Error('Failed to load sessions');
      const sessData = await sessRes.json();
      setSessions(sessData);

      if (repRes.ok) setReports(await repRes.json());
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleDelete(sessionId: string) {
    Alert.alert(
      'Remove Session',
      'This will hide the session and its report from your records. The data is retained securely and your doctor has been notified. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setDeleting(sessionId);
            try {
              const token = await SecureStore.getItemAsync('token');
              const res   = await fetch(`${API_URL}/api/sessions/${sessionId}/delete`, {
                method:  'PATCH',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error('Failed to remove session');
              // Remove from local state immediately
              setSessions(prev => prev.filter(s => s._id !== sessionId));
            } catch {
              Alert.alert('Error', 'Could not remove session. Please try again.');
            } finally {
              setDeleting(null);
            }
          },
        },
      ]
    );
  }

  // Map report by session_id for quick lookup
  const reportBySession = Object.fromEntries(reports.map(r => [r.session_id, r]));

  const active    = sessions.filter(s => s.status === 'in_progress');
  const completed = sessions.filter(s => s.status === 'completed');
  const expired   = sessions.filter(s => s.status === 'abandoned' || s.status === 'failed');

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LinearGradient colors={['#0B1437', '#0F2060']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#2563EB" size="large" />
      </LinearGradient>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={['#0B1437', '#0F2060', '#0B1437']} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[s.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchData(true)}
            tintColor="#2563EB"
          />
        }
      >
        {/* Header */}
        <View style={s.headerRow}>
          <Text style={s.pageTitle}>Reports</Text>
          <View style={s.countBadge}>
            <Text style={s.countBadgeText}>{sessions.length} session{sessions.length !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        {error ? (
          <View style={s.errorCard}>
            <Ionicons name="alert-circle-outline" size={22} color="#F87171" />
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => fetchData()} style={s.retryBtn}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {sessions.length === 0 && !error && (
          <View style={s.emptyState}>
            <Ionicons name="document-text-outline" size={48} color="rgba(255,255,255,0.15)" />
            <Text style={s.emptyTitle}>No sessions yet</Text>
            <Text style={s.emptySub}>Complete an AI interview to see your reports here.</Text>
          </View>
        )}

        {/* Active / In-Progress */}
        {active.length > 0 && (
          <Section title="In Progress" icon="time-outline" iconColor="#FBBF24">
            {active.map(sess => (
              <View key={sess._id} style={s.card}>
                <View style={s.cardHeader}>
                  <View style={[s.statusDot, { backgroundColor: '#FBBF24' }]} />
                  <Text style={s.cardDate}>{fmtDate(sess.started_at)}</Text>
                  <View style={[s.statusBadge, { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: 'rgba(251,191,36,0.35)' }]}>
                    <Text style={[s.statusBadgeText, { color: '#FBBF24' }]}>In Progress</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(sess._id)} disabled={deleting === sess._id} style={s.deleteBtn}>
                    {deleting === sess._id
                      ? <ActivityIndicator size="small" color="#F87171" />
                      : <Ionicons name="trash-outline" size={16} color="#F87171" />}
                  </TouchableOpacity>
                </View>
                <Text style={s.cardSub}>{sess.turn_count} question{sess.turn_count !== 1 ? 's' : ''} completed</Text>
                <View style={s.cardFooter}>
                  <Ionicons name="time-outline" size={13} color="#FBBF24" />
                  <Text style={[s.cardFooterText, { color: '#FCD34D' }]}>{hoursLeft(sess.last_activity_at)}</Text>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity onPress={() => router.push('/(patient)/interview' as any)}>
                    <Text style={s.cardAction}>Resume →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </Section>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <Section title="Completed" icon="checkmark-circle-outline" iconColor="#22C55E">
            {completed.map(sess => {
              const report = reportBySession[sess._id];
              return (
                <TouchableOpacity
                  key={sess._id}
                  style={s.completedCard}
                  activeOpacity={0.82}
                  onPress={() => router.push({ pathname: '/report-sheet', params: { session_id: sess._id } } as any)}
                >
                  {/* Session name */}
                  <Text style={s.sessionName} numberOfLines={2}>
                    {sess.session_name || 'Medical Interview'}
                  </Text>

                  {/* Date + status + delete */}
                  <View style={s.completedMeta}>
                    <Text style={s.metaDate}>{fmtDate(sess.completed_at ?? sess.started_at)}</Text>
                    <View style={s.completedBadge}>
                      <Text style={s.completedBadgeText}>Completed</Text>
                    </View>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation?.(); handleDelete(sess._id); }}
                      disabled={deleting === sess._id}
                      style={s.deleteBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {deleting === sess._id
                        ? <ActivityIndicator size="small" color="#F87171" />
                        : <Ionicons name="trash-outline" size={14} color="rgba(248,113,113,0.65)" />}
                    </TouchableOpacity>
                  </View>

                  {/* Referral — only if present */}
                  {report?.patient_summary?.referralSpecialty ? (
                    <View style={s.referralRow}>
                      <Ionicons name="medical-outline" size={11} color="rgba(96,165,250,0.70)" />
                      <Text style={s.referralText}>Referred to {report.patient_summary.referralSpecialty}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </Section>
        )}

        {/* Abandoned / Expired */}
        {expired.length > 0 && (
          <Section title="Expired / Abandoned" icon="close-circle-outline" iconColor="#94A3B8">
            {expired.map(sess => (
              <View key={sess._id} style={[s.card, s.cardExpired]}>
                <View style={s.cardHeader}>
                  <View style={[s.statusDot, { backgroundColor: '#94A3B8' }]} />
                  <Text style={[s.cardDate, s.textMuted]}>{fmtDate(sess.started_at)}</Text>
                  <View style={[s.statusBadge, { backgroundColor: 'rgba(148,163,184,0.10)', borderColor: 'rgba(148,163,184,0.25)' }]}>
                    <Text style={[s.statusBadgeText, { color: '#94A3B8' }]}>
                      {sess.status === 'failed' ? 'Failed' : 'Expired'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(sess._id)} disabled={deleting === sess._id} style={s.deleteBtn}>
                    {deleting === sess._id
                      ? <ActivityIndicator size="small" color="#F87171" />
                      : <Ionicons name="trash-outline" size={16} color="#F87171" />}
                  </TouchableOpacity>
                </View>
                <Text style={[s.cardSub, s.textMuted]}>
                  {sess.turn_count} question{sess.turn_count !== 1 ? 's' : ''} completed before expiry
                </Text>
                <Text style={[s.cardFooterText, s.textMuted, { fontSize: 11, marginTop: 4 }]}>
                  No report was generated for this session.
                </Text>
              </View>
            ))}
          </Section>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, icon, iconColor, children }: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Ionicons name={icon} size={16} color={iconColor} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 8 },

  headerRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  pageTitle:      { color: '#fff', fontSize: 24, fontWeight: '800', flex: 1 },
  countBadge:     { backgroundColor: 'rgba(37,99,235,0.20)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(37,99,235,0.35)' },
  countBadgeText: { color: '#60A5FA', fontSize: 12, fontWeight: '700' },

  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(248,113,113,0.10)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)' },
  errorText: { color: '#F87171', fontSize: 13, flex: 1 },
  retryBtn:  { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(248,113,113,0.15)', borderRadius: 8 },
  retryText: { color: '#F87171', fontSize: 12, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { color: 'rgba(255,255,255,0.40)', fontSize: 17, fontWeight: '700' },
  emptySub:   { color: 'rgba(255,255,255,0.25)', fontSize: 13, textAlign: 'center' },

  section:       { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  sectionTitle:  { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },

  card:        { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', gap: 8 },
  cardExpired: { opacity: 0.65 },

  cardHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot:      { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  cardDate:       { color: 'rgba(255,255,255,0.55)', fontSize: 12, flex: 1 },
  statusBadge:    { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  statusBadgeText:{ fontSize: 11, fontWeight: '700' },

  completedCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.18)',
    borderLeftWidth: 3, borderLeftColor: 'rgba(34,197,94,0.50)',
    gap: 6,
  },

  sessionName: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: -0.2, flexShrink: 1 },

  completedMeta:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaDate:           { color: 'rgba(255,255,255,0.35)', fontSize: 11, flex: 1 },
  completedBadge:     { backgroundColor: 'rgba(34,197,94,0.10)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(34,197,94,0.28)' },
  completedBadgeText: { color: '#22C55E', fontSize: 10, fontWeight: '700' },

  referralRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  referralText:{ color: 'rgba(96,165,250,0.65)', fontSize: 11 },

  cardSub:        { color: 'rgba(255,255,255,0.40)', fontSize: 12 },
  cardFooter:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardFooterText: { color: 'rgba(255,255,255,0.45)', fontSize: 12 },
  cardAction:     { color: '#60A5FA', fontSize: 12, fontWeight: '600' },

  textMuted:  { color: 'rgba(255,255,255,0.30)' },
  deleteBtn:  { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
