// =============================================================================
// Mobile/app/(patient)/(tabs)/scan.tsx — Medical Scan & Document Analysis tab
//
// Standalone feature — completely decoupled from the interview pipeline.
// Supports: PDF/report (→ GPT), X-ray (→ MedGemma), CT/MRI (→ MedGemma).
//
// Required packages (run once from Mobile/ directory):
//   npx expo install expo-document-picker expo-file-system
// =============================================================================

import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_URL } from "@/constants/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type UploadType = "pdf" | "xray" | "ct_mri";
type UploadStatus = "processing" | "complete" | "error" | "unavailable";

interface AnalysisResult {
  summary?: string;
  findings?: string[];
  flagged_abnormal?: boolean;
  impression?: string;
  disclaimer?: string;
}

interface ImageUpload {
  id: string;
  status: UploadStatus;
  upload_type: UploadType;
  original_filename: string;
  model_used: string;
  analysis_result: AnalysisResult | null;
  flagged_abnormal: boolean;
  error_message: string;
  created_at: string;
}

// ── Upload option config ───────────────────────────────────────────────────────

const UPLOAD_OPTIONS: {
  type: UploadType;
  label: string;
  sublabel: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  mimeTypes: string[];
  accept: string;
}[] = [
  {
    type: "pdf",
    label: "PDF / Report",
    sublabel: "GPT Analysis",
    icon: "document-text-outline",
    color: "#3B82F6",
    mimeTypes: ["application/pdf"],
    accept: "application/pdf",
  },
  {
    type: "xray",
    label: "X-ray",
    sublabel: "MedGemma 4B",
    icon: "scan-outline",
    color: "#10B981",
    mimeTypes: ["image/jpeg", "image/png", "application/dicom"],
    accept: "image/*",
  },
  {
    type: "ct_mri",
    label: "CT / MRI",
    sublabel: "MedGemma 4B",
    icon: "body-outline",
    color: "#8B5CF6",
    mimeTypes: [
      "application/zip",
      "application/x-zip-compressed",
      "image/jpeg",
      "image/png",
      "application/dicom",
    ],
    accept: "application/zip,.zip,image/*,.dcm",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function typeLabel(t: UploadType) {
  return { pdf: "PDF Report", xray: "X-ray", ct_mri: "CT / MRI" }[t];
}

function typeIcon(
  t: UploadType,
): React.ComponentProps<typeof Ionicons>["name"] {
  return {
    pdf: "document-text-outline",
    xray: "scan-outline",
    ct_mri: "body-outline",
  }[t] as any;
}

function typeColor(t: UploadType) {
  return { pdf: "#3B82F6", xray: "#10B981", ct_mri: "#8B5CF6" }[t];
}

async function authHeaders() {
  const token = await Storage.getItemAsync("token");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ScanScreen() {
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ImageUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState<UploadType | null>(null);
  const [selected, setSelected] = useState<ImageUpload | null>(null);
  const [listError, setListError] = useState("");

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadHistory();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // ── Poll any "processing" items every 4s ───────────────────────────────────
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    const hasPending = items.some((i) => i.status === "processing");
    if (!hasPending) return;

    pollingRef.current = setInterval(async () => {
      const pending = items.filter((i) => i.status === "processing");
      if (pending.length === 0) {
        clearInterval(pollingRef.current!);
        return;
      }
      const headers = await authHeaders();
      const updated = await Promise.all(
        pending.map(async (item) => {
          try {
            const res = await fetch(`${API_URL}/api/images/${item.id}`, {
              headers,
            });
            if (res.ok) return (await res.json()) as ImageUpload;
          } catch {}
          return null;
        }),
      );
      setItems((prev) =>
        prev.map((item) => {
          const fresh = updated.find((u) => u && u.id === item.id);
          return fresh ?? item;
        }),
      );
    }, 4000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [items]);

  async function loadHistory(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setListError("");
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_URL}/api/images`, { headers });
      if (!res.ok) throw new Error("Failed to load history");
      setItems(await res.json());
    } catch (e: any) {
      setListError(e.message ?? "Could not load history");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // ── File pick → upload ─────────────────────────────────────────────────────
  async function handleUpload(opt: (typeof UPLOAD_OPTIONS)[number]) {
    setUploading(opt.type);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: opt.mimeTypes,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (picked.canceled || !picked.assets?.length) {
        setUploading(null);
        return;
      }

      const asset = picked.assets[0];
      const MAX_BYTES =
        opt.type === "ct_mri" ? 150 * 1024 * 1024 : 40 * 1024 * 1024;
      if (asset.size && asset.size > MAX_BYTES) {
        Alert.alert(
          "File too large",
          opt.type === "ct_mri"
            ? "Please upload a ZIP under 150 MB. Tip: include only the key slices (50–150 DICOM files)."
            : "Please select a file under 40 MB.",
        );
        setUploading(null);
        return;
      }

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const headers = await authHeaders();
      const body = JSON.stringify({
        file_base64: base64,
        upload_type: opt.type,
        original_filename: asset.name ?? "upload",
        mime_type: asset.mimeType ?? opt.mimeTypes[0],
      });

      const res = await fetch(`${API_URL}/api/images`, {
        method: "POST",
        headers,
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error ?? "Upload failed");
      }

      const newRecord: ImageUpload = {
        ...(await res.json()),
        upload_type: opt.type,
        original_filename: asset.name ?? "upload",
        model_used: "",
        analysis_result: null,
        flagged_abnormal: false,
        error_message: "",
        created_at: new Date().toISOString(),
      };

      setItems((prev) => [newRecord, ...prev]);
    } catch (e: any) {
      Alert.alert(
        "Upload Error",
        e.message ?? "Could not upload file. Please try again.",
      );
    } finally {
      setUploading(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LinearGradient
        colors={["#0B1437", "#0F2060"]}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator color="#2563EB" size="large" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={["#0B1437", "#0F2060", "#0B1437"]}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={[
          s.container,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadHistory(true)}
            tintColor="#2563EB"
          />
        }
      >
        {/* Header */}
        <Text style={s.pageTitle}>Scan & Analyze</Text>
        <Text style={s.pageSub}>
          Upload medical images or documents for AI analysis
        </Text>

        {/* Upload option cards */}
        <View style={s.sectionHeader}>
          <Ionicons
            name="cloud-upload-outline"
            size={15}
            color="rgba(255,255,255,0.40)"
          />
          <Text style={s.sectionLabel}>NEW ANALYSIS</Text>
        </View>

        <View style={s.uploadGrid}>
          {UPLOAD_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.type}
              style={[
                s.uploadCard,
                uploading && uploading !== opt.type && s.cardDisabled,
              ]}
              onPress={() => handleUpload(opt)}
              disabled={uploading !== null}
              activeOpacity={0.75}
            >
              {uploading === opt.type ? (
                <ActivityIndicator color={opt.color} size="small" />
              ) : (
                <View
                  style={[
                    s.uploadIconWrap,
                    { backgroundColor: `${opt.color}18` },
                  ]}
                >
                  <Ionicons name={opt.icon} size={26} color={opt.color} />
                </View>
              )}
              <Text style={s.uploadCardLabel}>{opt.label}</Text>
              <Text style={[s.uploadCardSub, { color: opt.color }]}>
                {opt.sublabel}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* CT / MRI upload instructions */}
        <View style={s.infoHint}>
          <Ionicons
            name="information-circle-outline"
            size={15}
            color="#8B5CF6"
            style={{ marginTop: 1 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={s.infoHintTitle}>CT / MRI — upload as ZIP</Text>
            <Text style={s.infoHintBody}>
              CT and MRI scans consist of many files (DICOM series). Compress
              your scan folder into a single{" "}
              <Text style={{ color: "#C4B5FD" }}>.zip</Text> file and upload it
              here. Max 150 MB (50–150 DICOM slices is plenty for analysis).
            </Text>
            <Text style={s.infoHintBody}>
              A single X-ray image upload as JPEG / PNG is also supported.
            </Text>
          </View>
        </View>

        {/* Error */}
        {listError ? (
          <View style={s.errorCard}>
            <Ionicons name="alert-circle-outline" size={18} color="#F87171" />
            <Text style={s.errorText}>{listError}</Text>
            <TouchableOpacity onPress={() => loadHistory()} style={s.retryBtn}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* History */}
        {items.length > 0 && (
          <>
            <View style={[s.sectionHeader, { marginTop: 24 }]}>
              <Ionicons
                name="time-outline"
                size={15}
                color="rgba(255,255,255,0.40)"
              />
              <Text style={s.sectionLabel}>RECENT ANALYSES</Text>
            </View>

            {items.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                onPress={() =>
                  item.status !== "processing" ? setSelected(item) : null
                }
              />
            ))}
          </>
        )}

        {items.length === 0 && !listError && (
          <View style={s.emptyState}>
            <Ionicons
              name="scan-outline"
              size={48}
              color="rgba(255,255,255,0.12)"
            />
            <Text style={s.emptyTitle}>No uploads yet</Text>
            <Text style={s.emptySub}>
              Tap one of the cards above to upload your first medical image or
              document.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Result detail modal */}
      {selected && (
        <ResultModal item={selected} onClose={() => setSelected(null)} />
      )}
    </LinearGradient>
  );
}

// ── History row ────────────────────────────────────────────────────────────────

function HistoryRow({
  item,
  onPress,
}: {
  item: ImageUpload;
  onPress: () => void;
}) {
  const color = typeColor(item.upload_type);
  const isProcessing = item.status === "processing";

  const badgeStyle = {
    processing: {
      bg: "rgba(251,191,36,0.12)",
      border: "rgba(251,191,36,0.30)",
      text: "#FBBF24",
      label: "Analyzing...",
    },
    complete: {
      bg: "rgba(34,197,94,0.10)",
      border: "rgba(34,197,94,0.28)",
      text: "#22C55E",
      label: "Complete",
    },
    error: {
      bg: "rgba(248,113,113,0.10)",
      border: "rgba(248,113,113,0.28)",
      text: "#F87171",
      label: "Error",
    },
    unavailable: {
      bg: "rgba(148,163,184,0.10)",
      border: "rgba(148,163,184,0.25)",
      text: "#94A3B8",
      label: "Unavailable",
    },
  }[item.status];

  return (
    <TouchableOpacity
      style={[s.historyRow, { borderLeftColor: `${color}50` }]}
      onPress={onPress}
      activeOpacity={isProcessing ? 1 : 0.78}
      disabled={isProcessing}
    >
      <View style={[s.historyIconWrap, { backgroundColor: `${color}15` }]}>
        {isProcessing ? (
          <ActivityIndicator color={color} size="small" />
        ) : (
          <Ionicons name={typeIcon(item.upload_type)} size={20} color={color} />
        )}
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.historyFilename} numberOfLines={1}>
          {item.original_filename || typeLabel(item.upload_type)}
        </Text>
        <View style={s.historyMeta}>
          <Text style={s.historyDate}>{fmtDate(item.created_at)}</Text>
          <View
            style={[
              s.badge,
              {
                backgroundColor: badgeStyle.bg,
                borderColor: badgeStyle.border,
              },
            ]}
          >
            <Text style={[s.badgeText, { color: badgeStyle.text }]}>
              {badgeStyle.label}
            </Text>
          </View>
        </View>
        {item.flagged_abnormal && (
          <View style={s.abnormalRow}>
            <Ionicons name="warning-outline" size={11} color="#FBBF24" />
            <Text style={s.abnormalText}>Abnormal findings flagged</Text>
          </View>
        )}
        {(item.status === "error" || item.status === "unavailable") &&
        item.error_message ? (
          <Text style={s.historyError} numberOfLines={2}>
            {item.error_message}
          </Text>
        ) : null}
      </View>

      {item.status !== "processing" && (
        <Ionicons
          name="chevron-forward-outline"
          size={16}
          color="rgba(255,255,255,0.25)"
        />
      )}
    </TouchableOpacity>
  );
}

// ── Result detail modal ────────────────────────────────────────────────────────

function ResultModal({
  item,
  onClose,
}: {
  item: ImageUpload;
  onClose: () => void;
}) {
  const r = item.analysis_result;
  const color = typeColor(item.upload_type);

  const findings = r?.findings ?? [];

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <LinearGradient colors={["#0D1A40", "#0B1437"]} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.modalContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Modal header */}
          <View style={s.modalHeader}>
            <View style={[s.modalIconWrap, { backgroundColor: `${color}18` }]}>
              <Ionicons
                name={typeIcon(item.upload_type)}
                size={24}
                color={color}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle} numberOfLines={2}>
                {item.original_filename || typeLabel(item.upload_type)}
              </Text>
              <Text style={s.modalMeta}>
                {typeLabel(item.upload_type)} • {fmtDate(item.created_at)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={s.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.55)" />
            </TouchableOpacity>
          </View>

          {/* Model badge */}
          {item.model_used ? (
            <View style={s.modelBadge}>
              <Ionicons name="sparkles-outline" size={12} color="#8B5CF6" />
              <Text style={s.modelBadgeText}>{item.model_used}</Text>
            </View>
          ) : null}

          {/* Unavailable / Error state */}
          {(item.status === "unavailable" || item.status === "error") && (
            <View
              style={[
                s.infoBox,
                {
                  borderColor: "rgba(248,113,113,0.28)",
                  backgroundColor: "rgba(248,113,113,0.07)",
                },
              ]}
            >
              <Ionicons name="alert-circle-outline" size={18} color="#F87171" />
              <Text style={[s.infoBoxText, { color: "#FCA5A5" }]}>
                {item.error_message ||
                  "Analysis could not be completed. Please try again."}
              </Text>
            </View>
          )}

          {r && (
            <>
              {/* Abnormal banner */}
              {r.flagged_abnormal && (
                <View
                  style={[
                    s.infoBox,
                    {
                      borderColor: "rgba(251,191,36,0.35)",
                      backgroundColor: "rgba(251,191,36,0.08)",
                    },
                  ]}
                >
                  <Ionicons name="warning-outline" size={18} color="#FBBF24" />
                  <Text style={[s.infoBoxText, { color: "#FCD34D" }]}>
                    Abnormal findings detected — please consult your healthcare
                    provider.
                  </Text>
                </View>
              )}

              {/* Summary */}
              {r.summary ? (
                <ResultSection title="Summary" icon="reader-outline">
                  <Text style={s.summaryText}>{r.summary}</Text>
                </ResultSection>
              ) : null}

              {/* Findings */}
              {findings.length > 0 && (
                <ResultSection title="Findings" icon="list-outline">
                  {findings.map((f, i) => (
                    <BulletItem key={i} text={f} />
                  ))}
                </ResultSection>
              )}

              {/* Impression */}
              {r.impression ? (
                <ResultSection
                  title="Impression"
                  icon="information-circle-outline"
                >
                  <Text style={s.summaryText}>{r.impression}</Text>
                </ResultSection>
              ) : null}
            </>
          )}

          {/* Disclaimer */}
          <View style={s.disclaimer}>
            <Ionicons
              name="shield-checkmark-outline"
              size={14}
              color="rgba(255,255,255,0.30)"
            />
            <Text style={s.disclaimerText}>
              {r?.disclaimer ??
                "This AI analysis is for informational purposes only and does not constitute medical advice. Please consult a qualified healthcare professional."}
            </Text>
          </View>
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

function ResultSection({
  title,
  icon,
  color = "rgba(255,255,255,0.50)",
  children,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.resultSection}>
      <View style={s.resultSectionHeader}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={[s.resultSectionTitle, { color }]}>
          {title.toUpperCase()}
        </Text>
      </View>
      {children}
    </View>
  );
}

function BulletItem({
  text,
  color = "rgba(255,255,255,0.78)",
}: {
  text: string;
  color?: string;
}) {
  return (
    <View style={s.bulletRow}>
      <View style={[s.bulletDot, { backgroundColor: color }]} />
      <Text style={[s.bulletText, { color }]}>{text}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 12 },

  pageTitle: { color: "#fff", fontSize: 24, fontWeight: "800" },
  pageSub: { color: "rgba(255,255,255,0.40)", fontSize: 13, marginBottom: 4 },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionLabel: {
    color: "rgba(255,255,255,0.38)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },

  // Upload grid
  uploadGrid: { flexDirection: "row", gap: 10 },
  uploadCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 14,
    alignItems: "center",
    gap: 8,
  },
  cardDisabled: { opacity: 0.45 },
  uploadIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadCardLabel: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  uploadCardSub: { fontSize: 10, fontWeight: "600", textAlign: "center" },

  // CT/MRI upload hint
  infoHint: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(139,92,246,0.07)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.20)",
    padding: 12,
    marginTop: 8,
  },
  infoHintTitle: {
    color: "#C4B5FD",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 3,
  },
  infoHintBody: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 4,
  },

  // Error
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(248,113,113,0.10)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
  },
  errorText: { color: "#F87171", fontSize: 13, flex: 1 },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(248,113,113,0.15)",
    borderRadius: 8,
  },
  retryText: { color: "#F87171", fontSize: 12, fontWeight: "700" },

  // History
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderLeftWidth: 3,
  },
  historyIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  historyFilename: { color: "#fff", fontSize: 13, fontWeight: "600" },
  historyMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  historyDate: { color: "rgba(255,255,255,0.35)", fontSize: 11 },
  historyError: { color: "#FCA5A5", fontSize: 11, marginTop: 2 },

  badge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: "700" },

  abnormalRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  abnormalText: { color: "#FCD34D", fontSize: 11 },

  // Empty
  emptyState: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyTitle: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 17,
    fontWeight: "700",
  },
  emptySub: {
    color: "rgba(255,255,255,0.22)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },

  // Modal
  modalContent: { padding: 24, paddingBottom: 48, gap: 16 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  modalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  modalTitle: { color: "#fff", fontSize: 16, fontWeight: "700", flex: 1 },
  modalMeta: { color: "rgba(255,255,255,0.40)", fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  modelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(139,92,246,0.12)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.28)",
  },
  modelBadgeText: { color: "#A78BFA", fontSize: 11, fontWeight: "600" },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  infoBoxText: { fontSize: 13, flex: 1, lineHeight: 19 },

  summaryText: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 14,
    lineHeight: 22,
  },

  resultSection: { gap: 10 },
  resultSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  resultSectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },

  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    flexShrink: 0,
  },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 21 },

  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  disclaimerText: {
    color: "rgba(255,255,255,0.28)",
    fontSize: 11,
    flex: 1,
    lineHeight: 17,
  },
});
