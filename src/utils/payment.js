// Shared helpers for consultation fees & payments.

export function formatPKR(amount) {
    const n = Number(amount) || 0;
    return `Rs ${n.toLocaleString("en-PK")}`;
}

// Label + badge classes for Appointment.payment.status (always shown as text, never color alone)
export const PAYMENT_STATUS_META = {
    not_required: { label: "No fee",                cls: "bg-gray-100 text-gray-600" },
    unpaid:       { label: "Awaiting payment",      cls: "bg-amber-100 text-amber-800" },
    submitted:    { label: "Verify wallet payment", cls: "bg-blue-100 text-blue-700" },
    paid:         { label: "Paid by card",          cls: "bg-green-100 text-green-700" },
    verified:     { label: "Payment verified",      cls: "bg-green-100 text-green-700" },
    rejected:     { label: "Payment rejected",      cls: "bg-red-100 text-red-700" },
    void:         { label: "Not paid (expired)",    cls: "bg-gray-100 text-gray-600" },
    refund_due:   { label: "Refund due",            cls: "bg-orange-100 text-orange-800" },
    refunded:     { label: "Refunded",              cls: "bg-gray-100 text-gray-600" },
};

export const METHOD_LABEL = { card: "Card", easypaisa: "EasyPaisa", jazzcash: "JazzCash" };

// Card payments are confirmed by the gateway; wallet payments are verified by the admin on approval.
export function paymentReadyForApproval(payment) {
    return !payment?.required || ["paid", "submitted"].includes(payment.status);
}
