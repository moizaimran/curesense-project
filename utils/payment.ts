// Shared helpers for consultation fees & checkout.

export function formatPKR(n: number) {
  return `Rs ${Number(n || 0).toLocaleString("en-PK")}`;
}

// Standard card-number checksum (catches typos before we call the gateway)
export function luhnValid(digits: string) {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function groupCardNumber(raw: string) {
  return raw.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function formatExpiry(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

// Patient-facing label for Appointment.payment.status
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Payment needed",
  submitted: "Payment being verified",
  paid: "Paid",
  verified: "Payment verified",
  rejected: "Payment not verified",
  void: "Not paid",
  refund_due: "Refund in progress",
  refunded: "Refunded",
};
