import { useState } from "react";
import { CreditCard, Smartphone, Wallet } from "lucide-react";
import { api } from "../../../utils/api";
import { formatPKR, PAYMENT_STATUS_META, METHOD_LABEL } from "../../../utils/payment";

function fmtDateTime(d) {
    return d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
}

// Payment block on an appointment card (admin). `onChange(payment)` receives
// the updated payment after a reject / refund action.
export default function PaymentInfo({ appointmentId, payment, token, onChange }) {
    const [rejecting, setRejecting] = useState(false);
    const [reason,    setReason]    = useState("");
    const [busy,      setBusy]      = useState(false);
    const [err,       setErr]       = useState("");

    if (!payment?.required) {
        return <p className="text-sm text-gray-500">No consultation fee for this appointment.</p>;
    }

    const meta = PAYMENT_STATUS_META[payment.status] || { label: payment.status, cls: "bg-gray-100 text-gray-600" };
    const Icon = payment.method === "card" ? CreditCard : payment.method ? Smartphone : Wallet;

    async function act(body) {
        setBusy(true);
        setErr("");
        try {
            const data = await api.patch(`/api/appointments/admin/${appointmentId}/payment`, body, token);
            onChange?.(data.payment);
            setRejecting(false);
            setReason("");
        } catch (e) {
            setErr(e.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-lg font-bold text-slate-800">{formatPKR(payment.amount)}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
            </div>

            {payment.method && (
                <div className="flex items-start gap-2 text-sm text-slate-600">
                    <Icon size={16} className="mt-0.5 text-slate-400 shrink-0" />
                    <div>
                        {payment.method === "card" ? (
                            <>
                                <p>{payment.card_brand} •••• {payment.card_last4}
                                    {payment.gateway === "sandbox" && <span className="ml-2 text-xs text-amber-700 font-semibold">TEST MODE</span>}
                                </p>
                                <p className="text-xs text-gray-400">Ref {payment.gateway_ref} · {fmtDateTime(payment.paid_at)}</p>
                            </>
                        ) : (
                            <>
                                <p>{METHOD_LABEL[payment.method]} · TID <span className="font-mono font-semibold text-slate-800">{payment.transaction_id}</span></p>
                                <p className="text-xs text-gray-400">From {payment.payer_number} · {fmtDateTime(payment.submitted_at)}</p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {payment.status === "submitted" && (
                <p className="text-xs text-blue-700">
                    Check this transaction ID in the {METHOD_LABEL[payment.method]} account statement before approving.
                </p>
            )}
            {payment.status === "unpaid" && payment.due_by && (
                <p className="text-xs text-gray-500">Patient has until {fmtDateTime(payment.due_by)} to pay, then the slot is released.</p>
            )}
            {payment.status === "rejected" && payment.rejection_reason && (
                <p className="text-xs text-red-600">Rejected: {payment.rejection_reason} — waiting for the patient to pay again.</p>
            )}

            {payment.status === "submitted" && !rejecting && (
                <button type="button" onClick={() => setRejecting(true)}
                    className="text-sm font-medium text-red-600 hover:text-red-700">
                    Payment not found? Reject payment
                </button>
            )}
            {rejecting && (
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason, e.g. TID not found in EasyPaisa statement"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                    />
                    <button type="button" disabled={busy || !reason.trim()} onClick={() => act({ decision: "reject", reason })}
                        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold">
                        {busy ? "Saving…" : "Reject payment"}
                    </button>
                    <button type="button" onClick={() => { setRejecting(false); setReason(""); }}
                        className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
            )}

            {payment.status === "refund_due" && (
                <button type="button" disabled={busy} onClick={() => act({ decision: "refunded" })}
                    className="px-4 py-2 rounded-lg border border-orange-300 text-orange-800 hover:bg-orange-50 disabled:opacity-50 text-sm font-semibold">
                    {busy ? "Saving…" : `Mark ${formatPKR(payment.amount)} as refunded`}
                </button>
            )}

            {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
    );
}
