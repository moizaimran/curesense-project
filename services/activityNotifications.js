// =============================================================================
// Backend/services/activityNotifications.js — what gets emailed, and to whom
//
// Each function is fire-and-forget (never throws into the request) and
// respects the recipient's notification settings via notifyService.
// =============================================================================
const notify        = require("./notifyService");
const inApp         = require("./inAppNotificationService");
const Report        = require("../models/Report");
const DoctorProfile = require("../models/DoctorProfile");
const Patient       = require("../models/Patient");

function fmtSlot(slot) {
  if (!slot?.date) return "";
  const d = new Date(`${slot.date}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
  return `${d}, ${slot.start_time}–${slot.end_time}`;
}

const pkr = (n) => `Rs ${Number(n || 0).toLocaleString("en-PK")}`;

async function names(appt) {
  const [doctor, patient] = await Promise.all([
    DoctorProfile.findById(appt.doctor_id).select("user_id").populate("user_id", "name").lean(),
    Patient.findById(appt.patient_id).select("name").lean(),
  ]);
  const raw = doctor?.user_id?.name || "your doctor";
  const doctorName = /^dr\.?\s/i.test(raw) ? raw : `Dr. ${raw}`;
  return { doctorName, patientName: patient?.name || "A patient" };
}

const ctx = (appt, event) => ({ appointment_id: String(appt._id), event });

// ── Appointments ─────────────────────────────────────────────────────────────

function appointmentApproved(appt) {
  notify.fireAndForget(async () => {
    const { doctorName, patientName } = await names(appt);
    const when = fmtSlot(appt.requested_slot);

    // In-app (doctor bell) — always, independent of email settings
    const report = appt.report_id
      ? await Report.findById(appt.report_id).select("emergency_warning").lean()
      : null;
    const urgent = Boolean(report?.emergency_warning?.triggered);
    await inApp.createForDoctor(appt.doctor_id, {
      type: urgent ? "emergency_case" : "new_case",
      title: urgent ? `Urgent case: ${patientName}` : `New case: ${patientName}`,
      message: urgent
        ? `AI flagged possible emergency signs — ${report.emergency_warning.reason || "review as soon as possible"}. Appointment ${when}.`
        : `Appointment on ${when}.`,
      appointmentId: appt._id,
    });

    await notify.emailPatient(appt.patient_id, "appointment_updates", {
      subject: "Your appointment is confirmed",
      heading: "Appointment confirmed",
      lines: [
        `Your appointment with ${doctorName} on ${when} has been confirmed.`,
        appt.payment?.required ? `Your payment of ${pkr(appt.payment.amount)} has been verified.` : "",
        "You can message your doctor from the CureSense app.",
      ].filter(Boolean),
    });
    await notify.emailDoctor(appt.doctor_id, "appointment_updates", {
      subject: "New patient case assigned",
      heading: "New case",
      lines: [`${patientName} has an appointment with you on ${when}.`, "Open your CureSense dashboard to review the case."],
    });
  }, ctx(appt, "appointment_approved"));
}

function appointmentRejected(appt) {
  notify.fireAndForget(async () => {
    const { doctorName } = await names(appt);
    await notify.emailPatient(appt.patient_id, "appointment_updates", {
      subject: "Your appointment request was not approved",
      heading: "Appointment not approved",
      lines: [
        `Your appointment request with ${doctorName} on ${fmtSlot(appt.requested_slot)} was not approved.`,
        appt.rejection_reason ? `Reason: ${appt.rejection_reason}` : "",
        appt.payment?.status === "refund_due" ? `Your payment of ${pkr(appt.payment.amount)} will be refunded.` : "",
      ].filter(Boolean),
    });
  }, ctx(appt, "appointment_rejected"));
}

// ── Messages ─────────────────────────────────────────────────────────────────

function newMessage(appt, sender) {
  notify.fireAndForget(async () => {
    const { doctorName, patientName } = await names(appt);
    if (sender === "patient") {
      await inApp.createForDoctor(appt.doctor_id, {
        type: "patient_message",
        title: `New message from ${patientName}`,
        message: "Open the case to read and reply.",
        appointmentId: appt._id,
      });
      await notify.emailDoctor(appt.doctor_id, "messages", {
        subject: `New message from ${patientName}`,
        heading: "New patient message",
        lines: [`${patientName} sent you a message about their case.`, "Reply from your CureSense dashboard."],
      });
    } else {
      await notify.emailPatient(appt.patient_id, "messages", {
        subject: `New message from ${doctorName}`,
        heading: "Your doctor replied",
        lines: [`${doctorName} sent you a message.`, "Open the CureSense app to read and reply."],
      });
    }
  }, ctx(appt, "new_message"));
}

// ── Payments ─────────────────────────────────────────────────────────────────

function testResultUploaded(appt, testName) {
  notify.fireAndForget(async () => {
    const { patientName } = await names(appt);
    await inApp.createForDoctor(appt.doctor_id, {
      type: "test_upload",
      title: `${patientName} uploaded a test result`,
      message: testName ? `Test: ${testName}` : "Open the case to view it.",
      appointmentId: appt._id,
    });
  }, ctx(appt, "test_upload"));
}

function cardPaymentReceived(appt) {
  notify.fireAndForget(async () => {
    const p = appt.payment;
    await notify.emailPatient(appt.patient_id, "payment_updates", {
      subject: `Payment received — ${pkr(p.amount)}`,
      heading: "Payment received",
      lines: [
        `We received ${pkr(p.amount)} from your ${p.card_brand} card ending ${p.card_last4} (ref ${p.gateway_ref}).`,
        "An admin will now review and confirm your appointment.",
      ],
    });
    await notify.emailAdmins("payment_updates", {
      subject: "Appointment ready for review (paid by card)",
      heading: "Paid appointment awaiting approval",
      lines: [`A patient paid ${pkr(p.amount)} by card. Review it in Appointment Review.`],
    });
  }, ctx(appt, "card_payment"));
}

function walletPaymentSubmitted(appt) {
  notify.fireAndForget(async () => {
    const p = appt.payment;
    const method = p.method === "jazzcash" ? "JazzCash" : "EasyPaisa";
    await notify.emailAdmins("payment_updates", {
      subject: `Verify ${method} payment ${p.transaction_id}`,
      heading: "Wallet payment to verify",
      lines: [
        `A patient submitted a ${method} payment of ${pkr(p.amount)}.`,
        `Transaction ID: ${p.transaction_id} · from ${p.payer_number}`,
        "Check it in the wallet statement, then approve or reject in Appointment Review.",
      ],
    });
  }, ctx(appt, "wallet_payment"));
}

function paymentRejected(appt) {
  notify.fireAndForget(async () => {
    const p = appt.payment;
    await notify.emailPatient(appt.patient_id, "payment_updates", {
      subject: "We couldn't verify your payment",
      heading: "Payment not verified",
      lines: [
        `We couldn't verify transaction ${p.transaction_id}.`,
        p.rejection_reason ? `Reason: ${p.rejection_reason}` : "",
        "Please open the CureSense app and submit your payment again.",
      ].filter(Boolean),
    });
  }, ctx(appt, "payment_rejected"));
}

function paymentRefunded(appt) {
  notify.fireAndForget(async () => {
    await notify.emailPatient(appt.patient_id, "payment_updates", {
      subject: `Refund of ${pkr(appt.payment.amount)} processed`,
      heading: "Refund processed",
      lines: [`Your payment of ${pkr(appt.payment.amount)} has been refunded.`],
    });
  }, ctx(appt, "payment_refunded"));
}

module.exports = {
  appointmentApproved,
  appointmentRejected,
  newMessage,
  testResultUploaded,
  cardPaymentReceived,
  walletPaymentSubmitted,
  paymentRejected,
  paymentRefunded,
};
