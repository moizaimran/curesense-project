// =============================================================================
// Backend/services/paymentService.js — advance payment for consultations
//
// Rules
//  · Each doctor sets consultation_fee (PKR). Fee 0 → no payment step.
//  · The patient pays before the appointment is finalized; every paid booking
//    goes to admin review, and the admin verifies the payment while approving.
//  · All money goes to the CureSense admin accounts — never to the doctor.
//
// Methods
//  · card       → SANDBOX gateway. Only well-known test card numbers are
//                 accepted; real card numbers are refused and nothing but the
//                 brand + last 4 digits is ever stored. Swap `chargeCard` for a
//                 real gateway (Safepay / PayFast / bank) once merchant keys exist.
//  · easypaisa / jazzcash → patient sends the fee to the CureSense admin wallet
//                 shown at checkout and submits the transaction ID (TID); the
//                 admin checks it in the wallet statement while approving.
//
// Unpaid bookings hold the slot for PAYMENT_WINDOW_MINUTES, then are released.
// =============================================================================
const crypto        = require("crypto");
const { AppError }  = require("../utils/errors");
const Appointment   = require("../models/Appointment");
const Report        = require("../models/Report");
const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");
const activity      = require("./activityNotifications");

const PAYMENT_WINDOW_MINUTES = Number(process.env.PAYMENT_WINDOW_MINUTES) || 30;
const CARD_GATEWAY           = process.env.PAYMENT_CARD_GATEWAY || "sandbox";
const WALLET_METHODS         = ["easypaisa", "jazzcash"];

// ── Sandbox card gateway ─────────────────────────────────────────────────────

// Test cards (same numbers the big gateways use in their sandboxes)
const SANDBOX_CARDS = {
  "4242424242424242": { brand: "Visa",       outcome: "success" },
  "5555555555554444": { brand: "Mastercard", outcome: "success" },
  "4000000000000002": { brand: "Visa",       outcome: "declined" },
  "4000000000009995": { brand: "Visa",       outcome: "insufficient_funds" },
};

const DECLINE_MESSAGES = {
  declined:           "Your card was declined. Please try another card.",
  insufficient_funds: "Insufficient funds on this card.",
};

function luhnValid(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

function validateCardInput({ card_number, exp_month, exp_year, cvc, name_on_card }) {
  const digits = String(card_number || "").replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(digits) || !luhnValid(digits)) throw new AppError("Card number is not valid", 400);

  const month = Number(exp_month);
  let year = Number(exp_year);
  if (year < 100) year += 2000;
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year))
    throw new AppError("Expiry date is not valid", 400);
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1))
    throw new AppError("This card has expired", 400);

  if (!/^\d{3,4}$/.test(String(cvc || ""))) throw new AppError("CVC must be 3 or 4 digits", 400);
  if (!String(name_on_card || "").trim()) throw new AppError("Name on card is required", 400);

  return digits;
}

// Returns { brand, last4, gateway_ref } or throws a 402 on decline.
async function chargeCard(digits /* , amount */) {
  if (CARD_GATEWAY !== "sandbox")
    throw new AppError("Card payments are not configured on this server", 501);

  const test = SANDBOX_CARDS[digits];
  if (!test)
    throw new AppError("Sandbox mode: real cards are not accepted. Use a test card such as 4242 4242 4242 4242.", 400);
  if (test.outcome !== "success") throw new AppError(DECLINE_MESSAGES[test.outcome], 402);

  return {
    brand: test.brand,
    last4: digits.slice(-4),
    gateway_ref: `SBX-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
  };
}

// ── Helpers used by appointmentService ───────────────────────────────────────

// Payment block for a new booking with this doctor.
function initialPayment(doctor) {
  const fee = Number(doctor.consultation_fee) || 0;
  if (fee <= 0) return { required: false, amount: 0, status: "not_required" };
  return {
    required: true,
    amount:   fee,
    currency: "PKR",
    status:   "unpaid",
    due_by:   new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000),
  };
}

// Is the payment good enough for the admin to approve?
function isReadyForApproval(payment) {
  return !payment?.required || ["paid", "submitted"].includes(payment.status);
}

// Payment status after the appointment is rejected or cancelled.
function statusAfterRelease(payment) {
  if (!payment?.required) return payment?.status || "not_required";
  if (["paid", "submitted", "verified"].includes(payment.status)) return "refund_due";
  if (["unpaid", "rejected"].includes(payment.status)) return "void";
  return payment.status;
}

// Release unpaid (or rejected-and-not-repaid) bookings whose payment window
// has passed, so the slot frees up for other patients.
async function expireUnpaidAppointments({ doctorId } = {}) {
  const filter = {
    status: "pending_admin_review",
    "payment.status": { $in: ["unpaid", "rejected"] },
    "payment.due_by": { $lt: new Date() },
  };
  if (doctorId) filter.doctor_id = doctorId;

  const expired = await Appointment.find(filter).select("_id report_id assignment_id").lean();
  if (!expired.length) return 0;

  const ids = expired.map((a) => a._id);
  await Appointment.updateMany(
    { _id: { $in: ids }, "payment.status": { $in: ["unpaid", "rejected"] } },
    { $set: { status: "cancelled", "payment.status": "void", rejection_reason: "Payment not received in time" } }
  );
  // Free the report for re-booking; drop never-approved first-visit assignments
  const reportIds = expired.map((a) => a.report_id).filter(Boolean);
  if (reportIds.length) await Report.updateMany({ _id: { $in: reportIds } }, { $unset: { appointment_id: "" } });
  await PatientDoctorAssignment.updateMany(
    { _id: { $in: expired.map((a) => a.assignment_id) }, status: "pending" },
    { $set: { status: "terminated" } }
  );
  return expired.length;
}

// ── Patient actions ──────────────────────────────────────────────────────────

async function loadPayableAppointment(appointmentId, user) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (String(appointment.patient_id) !== String(user.patient_id)) throw new AppError("Access denied", 403);

  const p = appointment.payment;
  if (!p?.required) throw new AppError("No payment is required for this appointment", 409);
  if (appointment.status !== "pending_admin_review")
    throw new AppError(`This appointment is already ${appointment.status}`, 409);
  if (!["unpaid", "rejected"].includes(p.status))
    throw new AppError(["paid", "submitted"].includes(p.status)
      ? "Payment has already been made for this appointment"
      : `Payment cannot be made (status: ${p.status})`, 409);
  if (p.due_by && p.due_by < new Date()) {
    await expireUnpaidAppointments({ doctorId: appointment.doctor_id });
    throw new AppError("The payment window has expired — please book the appointment again", 410);
  }
  return appointment;
}

// POST /api/appointments/:id/payment/card
async function payByCard(appointmentId, user, body) {
  const appointment = await loadPayableAppointment(appointmentId, user);
  const digits = validateCardInput(body || {});
  const charge = await chargeCard(digits, appointment.payment.amount);

  Object.assign(appointment.payment, {
    status:      "paid",
    method:      "card",
    card_brand:  charge.brand,
    card_last4:  charge.last4,
    gateway:     CARD_GATEWAY,
    gateway_ref: charge.gateway_ref,
    paid_at:     new Date(),
    transaction_id: "",
    payer_number:   "",
    rejection_reason: "",
  });
  await appointment.save();
  activity.cardPaymentReceived(appointment);
  return { payment: appointment.payment };
}

// POST /api/appointments/:id/payment/wallet
async function payByWallet(appointmentId, user, body) {
  const { method, transaction_id, payer_number } = body || {};
  if (!WALLET_METHODS.includes(method))
    throw new AppError(`method must be one of: ${WALLET_METHODS.join(", ")}`, 400);

  const tid = String(transaction_id || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{8,20}$/.test(tid))
    throw new AppError("Transaction ID should be 8–20 letters/numbers, exactly as shown in your SMS/app", 400);

  const phone = String(payer_number || "").replace(/[\s-]/g, "").replace(/^\+92/, "0");
  if (!/^03\d{9}$/.test(phone))
    throw new AppError("Enter the mobile number you paid from, e.g. 03001234567", 400);

  const appointment = await loadPayableAppointment(appointmentId, user);

  const accounts = await getPaymentAccounts();
  if (!accounts[method]) throw new AppError(`${method === "easypaisa" ? "EasyPaisa" : "JazzCash"} payments are not available right now`, 409);

  // The same transaction can't pay for two appointments
  const reused = await Appointment.exists({
    _id: { $ne: appointment._id },
    "payment.method": method,
    "payment.transaction_id": tid,
  });
  if (reused) throw new AppError("This transaction ID has already been used for another appointment", 409);

  Object.assign(appointment.payment, {
    status:         "submitted",
    method,
    transaction_id: tid,
    payer_number:   phone,
    submitted_at:   new Date(),
    card_brand: "", card_last4: "", gateway: "", gateway_ref: "",
    rejection_reason: "",
  });
  await appointment.save();
  activity.walletPaymentSubmitted(appointment);
  return { payment: appointment.payment };
}

// GET /api/payments/accounts — enabled methods + admin wallets for checkout
async function getPaymentAccounts() {
  const Settings = require("../models/Settings");
  const st = (await Settings.findOne({ _key: "singleton" }).lean()) || {};
  const wallet = (title, number) => (number ? { account_title: title || "CureSense", account_number: number } : null);
  return {
    currency: "PKR",
    payment_window_minutes: PAYMENT_WINDOW_MINUTES,
    card: { enabled: true, sandbox: CARD_GATEWAY === "sandbox" },
    easypaisa: wallet(st.easypaisaAccountTitle, st.easypaisaAccountNumber),
    jazzcash:  wallet(st.jazzcashAccountTitle,  st.jazzcashAccountNumber),
  };
}

// ── Admin actions ────────────────────────────────────────────────────────────

// PATCH /api/appointments/admin/:id/payment
//   { decision: "reject", reason } — wallet TID not found; patient may pay again
//   { decision: "refunded" }       — a refund_due payment has been refunded
async function adminPaymentDecision(appointmentId, { decision, reason } = {}, adminUserId) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new AppError("Appointment not found", 404);
  const p = appointment.payment;
  if (!p?.required) throw new AppError("This appointment has no payment", 409);

  if (decision === "reject") {
    if (p.status !== "submitted") throw new AppError("Only submitted wallet payments can be rejected", 409);
    if (!String(reason || "").trim()) throw new AppError("reason is required", 400);
    p.status = "rejected";
    p.rejection_reason = String(reason).trim();
    // Give the patient a fresh window to pay again
    p.due_by = new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000);
  } else if (decision === "refunded") {
    if (p.status !== "refund_due") throw new AppError("This payment is not waiting for a refund", 409);
    p.status = "refunded";
    p.refunded_at = new Date();
  } else {
    throw new AppError("decision must be 'reject' or 'refunded'", 400);
  }
  p.verified_by = adminUserId;
  await appointment.save();
  if (decision === "reject") activity.paymentRejected(appointment);
  else activity.paymentRefunded(appointment);
  return { payment: appointment.payment };
}

module.exports = {
  PAYMENT_WINDOW_MINUTES,
  initialPayment,
  isReadyForApproval,
  statusAfterRelease,
  expireUnpaidAppointments,
  payByCard,
  payByWallet,
  getPaymentAccounts,
  adminPaymentDecision,
  _internal: { luhnValid, SANDBOX_CARDS },
};
