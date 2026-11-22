// =============================================================================
// Patient checkout — pay the consultation fee in advance.
//   · Card: confirmed by the payment gateway (sandbox: test cards only)
//   · EasyPaisa / JazzCash: send the fee to the CureSense admin wallet shown
//     here, then submit the transaction ID; the admin verifies it on approval.
// All fees go to the CureSense admin account, never to the doctor directly.
// =============================================================================
import * as Storage from "@/utils/storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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

import { API_URL } from "@/constants/api";
import { formatExpiry, formatPKR, groupCardNumber, luhnValid } from "@/utils/payment";

type Method = "card" | "easypaisa" | "jazzcash";

interface Payment {
  required: boolean;
  amount: number;
  currency: string;
  status: string;
  method: Method | null;
  due_by: string | null;
  card_brand?: string;
  card_last4?: string;
  transaction_id?: string;
  rejection_reason?: string;
}

interface WalletAccount {
  account_title: string;
  account_number: string;
}

interface Accounts {
  card: { enabled: boolean; sandbox: boolean };
  easypaisa: WalletAccount | null;
  jazzcash: WalletAccount | null;
}

const METHOD_LABEL: Record<Method, string> = { card: "Card", easypaisa: "EasyPaisa", jazzcash: "JazzCash" };

const TEST_CARDS = [
  { number: "4242 4242 4242 4242", note: "Visa · succeeds" },
  { number: "5555 5555 5555 4444", note: "Mastercard · succeeds" },
  { number: "4000 0000 0000 0002", note: "Visa · declined" },
];

function minutesLeft(due: string | null) {
  if (!due) return null;
  return Math.max(0, Math.ceil((new Date(due).getTime() - Date.now()) / 60000));
}

async function authedFetch(path: string, init: RequestInit = {}) {
  const token = await Storage.getAuthToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

export default function PaymentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { appointment_id, doctor_name } = useLocalSearchParams<{ appointment_id: string; doctor_name?: string }>();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [method, setMethod] = useState<Method>("card");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Payment | null>(null);

  // Card fields (never stored on the device; sent once to the gateway)
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [cardName, setCardName] = useState("");

  // Wallet fields
  const [tid, setTid] = useState("");
  const [payerNumber, setPayerNumber] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([authedFetch(`/api/appointments/${appointment_id}`), authedFetch("/api/payments/accounts")])
      .then(([appt, acc]) => {
        if (cancelled) return;
        setPayment(appt.payment ?? null);
        setAccounts(acc);
      })
      .catch((e) => !cancelled && setLoadError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [appointment_id]);

  const wallet = method !== "card" && accounts ? accounts[method] : null;
  const canPay = payment && ["unpaid", "rejected"].includes(payment.status);

  function goToAppointment() {
    router.replace({ pathname: "/(patient)/appointment-detail", params: { appointment_id } } as any);
  }

  async function submit() {
    setError("");
    if (method === "card") {
      const digits = cardNumber.replace(/\s/g, "");
      const [mm, yy] = expiry.split("/");
      if (!luhnValid(digits)) return setError("Please check the card number.");
      if (!mm || !yy || Number(mm) < 1 || Number(mm) > 12 || yy.length !== 2) return setError("Enter the expiry as MM/YY.");
      if (!/^\d{3,4}$/.test(cvc)) return setError("CVC must be 3 or 4 digits.");
      if (!cardName.trim()) return setError("Enter the name on the card.");
    } else {
      if (!/^[A-Za-z0-9]{8,20}$/.test(tid.trim())) return setError("Enter the transaction ID exactly as shown in your SMS.");
      if (!/^03\d{9}$/.test(payerNumber.replace(/[\s-]/g, ""))) return setError("Enter the mobile number you paid from, e.g. 03001234567.");
    }

    setSubmitting(true);
    try {
      const data =
        method === "card"
          ? await authedFetch(`/api/appointments/${appointment_id}/payment/card`, {
              method: "POST",
              body: JSON.stringify({
                card_number: cardNumber.replace(/\s/g, ""),
                exp_month: Number(expiry.split("/")[0]),
                exp_year: Number(expiry.split("/")[1]),
                cvc,
                name_on_card: cardName.trim(),
              }),
            })
          : await authedFetch(`/api/appointments/${appointment_id}/payment/wallet`, {
              method: "POST",
              body: JSON.stringify({ method, transaction_id: tid.trim(), payer_number: payerNumber }),
            });
      // Clear card details from memory as soon as the gateway has answered
      setCardNumber("");
      setCvc("");
      setDone(data.payment);
    } catch (e: any) {
      setError(e.message ?? "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  const mins = minutesLeft(payment?.due_by ?? null);

  return (
    <LinearGradient colors={["#0B1437", "#0F2060", "#0B1437"]} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={goToAppointment} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Payment</Text>
            {doctor_name ? <Text style={s.headerSub}>Consultation with Dr. {doctor_name}</Text> : null}
          </View>
        </View>

        <ScrollView contentContainerStyle={[s.container, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          {loading ? (
            <ActivityIndicator color="#2563EB" style={{ marginTop: 40 }} />
          ) : loadError ? (
            <Text style={s.error}>{loadError}</Text>
          ) : done ? (
            // ── Success ──────────────────────────────────────────────────────
            <View style={[s.card, { alignItems: "center", gap: 12 }]}>
              <Ionicons
                name={done.status === "paid" ? "checkmark-circle" : "time"}
                size={56}
                color={done.status === "paid" ? "#34D399" : "#60A5FA"}
              />
              <Text style={s.successTitle}>{done.status === "paid" ? "Payment successful" : "Payment submitted"}</Text>
              <Text style={s.successText}>
                {done.status === "paid"
                  ? `${formatPKR(done.amount)} paid with ${done.card_brand} •••• ${done.card_last4}. An admin will now review and confirm your appointment.`
                  : `We'll check your ${METHOD_LABEL[done.method as Method]} transaction (${done.transaction_id}) and confirm your appointment once it's verified.`}
              </Text>
              <TouchableOpacity style={s.primaryBtn} onPress={goToAppointment}>
                <Text style={s.primaryText}>View appointment</Text>
              </TouchableOpacity>
            </View>
          ) : !payment?.required ? (
            <View style={s.card}>
              <Text style={s.successText}>No payment is needed for this appointment.</Text>
              <TouchableOpacity style={s.primaryBtn} onPress={goToAppointment}>
                <Text style={s.primaryText}>View appointment</Text>
              </TouchableOpacity>
            </View>
          ) : !canPay ? (
            <View style={s.card}>
              <Text style={s.successText}>
                {payment.status === "paid" || payment.status === "verified"
                  ? "This appointment has already been paid."
                  : payment.status === "submitted"
                    ? "Your payment has been submitted and is waiting for admin verification."
                    : "This appointment can no longer be paid. Please book again."}
              </Text>
              <TouchableOpacity style={s.primaryBtn} onPress={goToAppointment}>
                <Text style={s.primaryText}>View appointment</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Amount */}
              <View style={[s.card, { alignItems: "center" }]}>
                <Text style={s.amountLabel}>Consultation fee</Text>
                <Text style={s.amount}>{formatPKR(payment.amount)}</Text>
                <Text style={s.amountNote}>Paid to CureSense · refunded if the appointment is not approved</Text>
                {mins !== null && (
                  <Text style={[s.amountNote, { color: mins <= 5 ? "#FCA5A5" : "#FCD34D" }]}>
                    Slot held for {mins} more minute{mins === 1 ? "" : "s"}
                  </Text>
                )}
              </View>

              {payment.status === "rejected" && (
                <View style={s.warn}>
                  <Ionicons name="alert-circle-outline" size={16} color="#FCA5A5" />
                  <Text style={s.warnText}>
                    Your last payment couldn't be verified: {payment.rejection_reason}. Please try again.
                  </Text>
                </View>
              )}

              {/* Method tabs */}
              <View style={s.tabs} accessibilityRole="tablist">
                {(["card", "easypaisa", "jazzcash"] as Method[]).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[s.tab, method === m && s.tabActive]}
                    onPress={() => {
                      setMethod(m);
                      setError("");
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: method === m }}
                  >
                    <Ionicons
                      name={m === "card" ? "card-outline" : "phone-portrait-outline"}
                      size={15}
                      color={method === m ? "#fff" : "rgba(255,255,255,0.55)"}
                    />
                    <Text style={[s.tabText, method === m && s.tabTextActive]}>{METHOD_LABEL[m]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {method === "card" ? (
                <View style={s.card}>
                  {accounts?.card.sandbox && (
                    <View style={s.sandbox}>
                      <Text style={s.sandboxTitle}>TEST MODE — no real money is charged</Text>
                      <Text style={s.sandboxText}>Tap a test card to fill it in (any future expiry, any CVC):</Text>
                      {TEST_CARDS.map((c) => (
                        <TouchableOpacity
                          key={c.number}
                          onPress={() => {
                            setCardNumber(c.number);
                            if (!expiry) setExpiry("12/30");
                            if (!cvc) setCvc("123");
                          }}
                        >
                          <Text style={s.testCard}>
                            {c.number} <Text style={s.sandboxText}>· {c.note}</Text>
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <Field label="Card number">
                    <TextInput style={s.input} value={cardNumber} onChangeText={(v) => setCardNumber(groupCardNumber(v))}
                      placeholder="1234 5678 9012 3456" placeholderTextColor="rgba(255,255,255,0.3)" keyboardType="number-pad"
                      autoComplete="cc-number" maxLength={23} />
                  </Field>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Field label="Expiry (MM/YY)">
                        <TextInput style={s.input} value={expiry} onChangeText={(v) => setExpiry(formatExpiry(v))}
                          placeholder="MM/YY" placeholderTextColor="rgba(255,255,255,0.3)" keyboardType="number-pad" maxLength={5} />
                      </Field>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field label="CVC">
                        <TextInput style={s.input} value={cvc} onChangeText={(v) => setCvc(v.replace(/\D/g, "").slice(0, 4))}
                          placeholder="123" placeholderTextColor="rgba(255,255,255,0.3)" keyboardType="number-pad" secureTextEntry maxLength={4} />
                      </Field>
                    </View>
                  </View>
                  <Field label="Name on card">
                    <TextInput style={s.input} value={cardName} onChangeText={setCardName}
                      placeholder="As printed on the card" placeholderTextColor="rgba(255,255,255,0.3)" autoCapitalize="words" />
                  </Field>
                </View>
              ) : wallet ? (
                <View style={s.card}>
                  <Text style={s.stepTitle}>1. Send {formatPKR(payment.amount)} from your {METHOD_LABEL[method]} app to:</Text>
                  <View style={s.accountBox}>
                    <Text style={s.accountNumber}>{wallet.account_number}</Text>
                    <Text style={s.accountTitle}>{wallet.account_title}</Text>
                  </View>
                  <Text style={s.stepTitle}>2. Enter the transaction ID from the confirmation SMS:</Text>
                  <Field label="Transaction ID (TID)">
                    <TextInput style={s.input} value={tid} onChangeText={(v) => setTid(v.replace(/\s/g, ""))}
                      placeholder="e.g. 31234567890" placeholderTextColor="rgba(255,255,255,0.3)" autoCapitalize="characters" maxLength={20} />
                  </Field>
                  <Field label="Mobile number you paid from">
                    <TextInput style={s.input} value={payerNumber} onChangeText={setPayerNumber}
                      placeholder="03001234567" placeholderTextColor="rgba(255,255,255,0.3)" keyboardType="phone-pad" maxLength={13} />
                  </Field>
                  <Text style={s.amountNote}>An admin will match this transaction before confirming your appointment.</Text>
                </View>
              ) : (
                <View style={s.card}>
                  <Text style={s.successText}>{METHOD_LABEL[method]} is not available right now. Please pay by card.</Text>
                </View>
              )}

              {error ? <Text style={s.error}>{error}</Text> : null}

              {(method === "card" || wallet) && (
                <TouchableOpacity style={[s.primaryBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="lock-closed" size={16} color="#fff" />
                      <Text style={s.primaryText}>
                        {method === "card" ? `Pay ${formatPKR(payment.amount)}` : "Submit payment details"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 },
  container: { padding: 16, gap: 14 },
  card: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", gap: 12 },
  amountLabel: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "600" },
  amount: { color: "#fff", fontSize: 34, fontWeight: "800" },
  amountNote: { color: "rgba(255,255,255,0.45)", fontSize: 12, textAlign: "center" },
  tabs: { flexDirection: "row", gap: 8 },
  tab: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.04)" },
  tabActive: { backgroundColor: "rgba(37,99,235,0.35)", borderColor: "rgba(37,99,235,0.8)" },
  tabText: { color: "rgba(255,255,255,0.55)", fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: "#fff" },
  sandbox: { backgroundColor: "rgba(251,191,36,0.08)", borderColor: "rgba(251,191,36,0.3)", borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  sandboxTitle: { color: "#FCD34D", fontWeight: "800", fontSize: 12 },
  sandboxText: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "400" },
  testCard: { color: "#93C5FD", fontSize: 13, fontWeight: "700", paddingVertical: 3 },
  fieldLabel: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700" },
  input: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.05)", color: "#fff", paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  stepTitle: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },
  accountBox: { backgroundColor: "rgba(37,99,235,0.15)", borderRadius: 12, padding: 14, alignItems: "center" },
  accountNumber: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: 1 },
  accountTitle: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 2 },
  warn: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "rgba(248,113,113,0.08)", borderColor: "rgba(248,113,113,0.3)", borderWidth: 1, borderRadius: 12, padding: 12 },
  warnText: { color: "#FCA5A5", fontSize: 13, flex: 1 },
  error: { color: "#F87171", fontSize: 13, textAlign: "center" },
  primaryBtn: { flexDirection: "row", gap: 8, backgroundColor: "#2563EB", borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  successTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  successText: { color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 20, textAlign: "center" },
});
