import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_URL } from '@/constants/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Turn {
  turn_number:       number;
  patient_corrected: string;
  assistant_message: string;
}

interface TranscriptEntry {
  role:    'ai' | 'patient';
  content: string;
  turn:    number;
}

const OPENING = "What's been bothering you lately? Please describe your main symptom or concern.";

function buildTranscript(turns: Turn[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  entries.push({ role: 'ai', content: OPENING, turn: 0 });
  turns.forEach((t, i) => {
    entries.push({ role: 'patient', content: t.patient_corrected,  turn: i + 1 });
    entries.push({ role: 'ai',      content: t.assistant_message,  turn: i + 1 });
  });
  return entries;
}

function fmtDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function TranscriptScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();

  const [entries,  setEntries]  = useState<TranscriptEntry[]>([]);
  const [meta,     setMeta]     = useState<{ date: string; turns: number; status: string } | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (session_id) fetchSession();
  }, [session_id]);

  async function fetchSession() {
    try {
      const token = await SecureStore.getItemAsync('token');
      const res   = await fetch(`${API_URL}/api/sessions/${session_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load session');
      const session = await res.json();
      setEntries(buildTranscript(session.transcript ?? []));
      setMeta({
        date:   fmtDate(session.completed_at ?? session.started_at),
        turns:  session.turn_count,
        status: session.status,
      });
    } catch (e: any) {
      setError(e.message ?? 'Failed to load transcript');
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

  return (
    <LinearGradient colors={['#0B1437', '#0F2060', '#0B1437']} style={{ flex: 1 }}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Interview Transcript</Text>
          {meta && <Text style={s.headerDate}>{meta.date}</Text>}
        </View>
        <View style={s.headerRight}>
          {meta && (
            <View style={[s.statusBadge, meta.status === 'completed' ? s.statusComplete : s.statusPending]}>
              <Text style={[s.statusText, meta.status === 'completed' ? s.statusTextComplete : s.statusTextPending]}>
                {meta.status === 'completed' ? 'Complete' : 'In Progress'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Summary strip */}
      {meta && (
        <View style={s.summaryStrip}>
          <View style={s.summaryItem}>
            <Text style={s.summaryValue}>{meta.turns}</Text>
            <Text style={s.summaryLabel}>Questions</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={s.summaryItem}>
            <Ionicons name="checkmark-circle" size={18} color={meta.status === 'completed' ? '#22C55E' : '#FBBF24'} />
            <Text style={s.summaryLabel}>{meta.status === 'completed' ? 'Report Generated' : 'Incomplete'}</Text>
          </View>
        </View>
      )}

      {error ? (
        <View style={s.errorWrap}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {entries.map((entry, i) => (
            <View key={i} style={[s.entry, entry.role === 'ai' ? s.entryAI : s.entryPatient]}>
              {/* Role label */}
              <View style={s.roleRow}>
                {entry.role === 'ai' ? (
                  <LinearGradient colors={['#1D4ED8', '#2563EB']} style={s.roleIcon}>
                    <Ionicons name="medical" size={11} color="#fff" />
                  </LinearGradient>
                ) : (
                  <View style={s.roleIconPatient}>
                    <Ionicons name="person" size={11} color="#fff" />
                  </View>
                )}
                <Text style={[s.roleLabel, entry.role === 'ai' ? s.roleLabelAI : s.roleLabelPatient]}>
                  {entry.role === 'ai' ? 'CureSense AI' : 'You'}
                </Text>
              </View>
              {/* Content */}
              <Text style={[s.entryText, entry.role === 'patient' && s.entryTextPatient]}>
                {entry.content}
              </Text>
            </View>
          ))}

          {/* View Report button — only for completed sessions */}
          {meta?.status === 'completed' && (
            <TouchableOpacity
              style={s.viewReportBtn}
              onPress={() => router.push({ pathname: '/report-sheet', params: { session_id } } as any)}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#1D4ED8', '#2563EB']} style={s.viewReportGrad}>
                <Ionicons name="document-text-outline" size={18} color="#fff" />
                <Text style={s.viewReportText}>View Full Report</Text>
                <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.7)" />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </LinearGradient>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1 },
  headerTitle:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerDate:   { color: 'rgba(255,255,255,0.40)', fontSize: 11, marginTop: 2 },
  headerRight:  { minWidth: 80, alignItems: 'flex-end' },

  statusBadge:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  statusComplete:     { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.35)' },
  statusPending:      { backgroundColor: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.35)' },
  statusText:         { fontSize: 11, fontWeight: '700' },
  statusTextComplete: { color: '#22C55E' },
  statusTextPending:  { color: '#FBBF24' },

  summaryStrip:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', marginHorizontal: 20, borderRadius: 12, paddingVertical: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', gap: 24 },
  summaryItem:    { alignItems: 'center', gap: 4, flexDirection: 'row' },
  summaryValue:   { color: '#fff', fontSize: 15, fontWeight: '800' },
  summaryLabel:   { color: 'rgba(255,255,255,0.45)', fontSize: 12 },
  summaryDivider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.10)' },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorText: { color: '#F87171', fontSize: 14, textAlign: 'center' },

  list: { paddingHorizontal: 16, paddingTop: 8, gap: 4 },

  entry:         { borderRadius: 14, padding: 16, gap: 8 },
  entryAI:       { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginRight: 32 },
  entryPatient:  { backgroundColor: 'rgba(37,99,235,0.12)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.25)', marginLeft: 32 },

  roleRow:           { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleIcon:          { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  roleIconPatient:   { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB' },
  roleLabel:         { fontSize: 11, fontWeight: '700' },
  roleLabelAI:       { color: '#60A5FA' },
  roleLabelPatient:  { color: '#93C5FD' },

  entryText:        { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 22 },
  entryTextPatient: { color: '#fff' },

  viewReportBtn:  { marginTop: 8, borderRadius: 16, overflow: 'hidden' },
  viewReportGrad: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 20 },
  viewReportText: { color: '#fff', fontWeight: '800', fontSize: 16, flex: 1 },
});
