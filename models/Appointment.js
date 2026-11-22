// =============================================================================
// Backend/models/Appointment.js
//
// Every individual visit — the permanent audit log.
// Records are NEVER deleted or overwritten. History is permanent even after
// an Assignment is terminated. Only access (PatientDoctorAssignment) is revoked.
//
// status lifecycle:
//   pending_admin_review → admin reviews first-visit requests
//   confirmed            → admin approved (or auto-confirmed for repeat visits)
//   rejected             → admin rejected the slot request
//   completed            → visit happened
//   cancelled            → patient or doctor cancelled
//   no_show              → patient didn't attend
//
// First appointment per pair requires admin review.
// Repeat visits (Assignment already active) are auto-confirmed — no admin step.
// =============================================================================
const mongoose = require("mongoose");

// ── Query message ────────────────────────────────────────────────────────────

const QueryMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ["patient", "doctor"],
      required: true,
    },

    // Optional when an attachment is present
    message: {
      type: String,
      trim: true,
      default: "",
    },

    // ── Image attachment (set when patient sends a medical image) ─────────────
    // attachment_url is null until the Cloudinary upload completes in background
    attachment_url: {
      type: String,
      default: null,
    },

    // "analyzing"  → background job running
    // "analyzed"   → MedGemma result ready
    // "failed"     → analysis errored
    // null         → text-only message, no attachment
    attachment_status: {
      type: String,
      enum: ["analyzing", "analyzed", "failed"],
      default: null,
    },

    // Ref to the ImageUpload record created alongside this message
    image_upload_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImageUpload",
      default: null,
    },

    // Raw MedGemma / PDF analysis result stored inline for fast chat rendering
    ai_analysis: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // ──────────────────────────────────────────────────────────────────────────

    created_at: {
      type: Date,
      default: Date.now,
    },

    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: true,
  }
);

// ── Test result upload (patient → doctor, requested via feedback) ────────────

const TestUploadSchema = new mongoose.Schema(
  {
    test_name: {
      type: String,
      default: "",
    },

    file_url: {
      type: String,
      required: true,
    },

    file_type: {
      type: String,
      enum: ["image", "raw"],
      required: true,
    },

    original_filename: {
      type: String,
      default: "",
    },

    uploaded_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true,
  }
);

// ── Appointment slot ─────────────────────────────────────────────────────────

const SlotSchema = new mongoose.Schema(
  {
    // IMPORTANT:
    // Appointment calendar date is stored as YYYY-MM-DD.
    // Example: "2026-09-04"
    //
    // DO NOT use Date here.
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    start_time: {
      type: String,
      required: true,
    },

    end_time: {
      type: String,
      required: true,
    },
  },
  {
    _id: false,
  }
);

// ── Appointment ─────────────────────────────────────────────────────────────

// ── Advance payment (see services/paymentService.js) ─────────────────────────
// status flow:
//   not_required                      fee was 0 (or appointment predates payments)
//   unpaid → paid       (card, gateway-confirmed) → verified (admin approves)
//   unpaid → submitted  (EasyPaisa/JazzCash TID)  → verified (admin approves)
//            submitted → rejected (admin: TID not found) → patient can pay again
//   unpaid → void        (payment window expired, or cancelled before paying)
//   paid/submitted/verified → refund_due (appointment rejected/cancelled) → refunded
const PaymentSchema = new mongoose.Schema(
  {
    required: { type: Boolean, default: false },
    amount:   { type: Number,  default: 0, min: 0 },
    currency: { type: String,  default: "PKR" },
    status: {
      type: String,
      enum: ["not_required", "unpaid", "submitted", "paid", "verified", "rejected", "void", "refund_due", "refunded"],
      default: "not_required",
    },
    method:  { type: String, enum: ["card", "easypaisa", "jazzcash", null], default: null },
    due_by:  { type: Date, default: null }, // unpaid bookings are released after this

    // Card (only brand + last 4 are ever stored — never the full number or CVC)
    card_brand:  { type: String, default: "" },
    card_last4:  { type: String, default: "" },
    gateway:     { type: String, default: "" }, // "sandbox" until a real gateway is configured
    gateway_ref: { type: String, default: "" },

    // Mobile wallet (EasyPaisa / JazzCash) — verified by an admin while approving
    transaction_id: { type: String, default: "" },
    payer_number:   { type: String, default: "" },

    paid_at:          { type: Date, default: null },
    submitted_at:     { type: Date, default: null },
    verified_at:      { type: Date, default: null },
    verified_by:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rejection_reason: { type: String, default: "" },
    refunded_at:      { type: Date, default: null },
  },
  { _id: false }
);

const AppointmentSchema = new mongoose.Schema(
  {
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },

    doctor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DoctorProfile",
      required: true,
    },

    assignment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PatientDoctorAssignment",
      required: true,
    },

    requested_slot: {
      type: SlotSchema,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "pending_admin_review",
        "confirmed",
        "rejected",
        "completed",
        "cancelled",
        "no_show",
      ],
      default: "pending_admin_review",
    },

    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewed_at: {
      type: Date,
      default: null,
    },

    payment: {
      type: PaymentSchema,
      default: () => ({}),
    },

    // When the doctor marked the case completed ("patient treated").
    // Older completed cases have null here; stats fall back to the slot date.
    completed_at: {
      type: Date,
      default: null,
    },

    rejection_reason: {
      type: String,
      default: "",
    },

    report_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Report",
      default: null,
    },

    session_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      default: null,
    },

    // ── Doctor feedback ─────────────────────────────────────────────────────

    feedback: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ── Query thread ─────────────────────────────────────────────────────────

    queries: {
      type: [QueryMessageSchema],
      default: [],
    },

    has_unread_patient_query: {
      type: Boolean,
      default: false,
    },

    // ── Test result uploads (patient uploads results doctor requested) ───────

    test_uploads: {
      type: [TestUploadSchema],
      default: [],
    },

    // Set true when the patient uploads a test result. Cleared when
    // the doctor opens the case (markTestUploadsRead / getAppointmentById).
    has_new_test_upload: {
      type: Boolean,
      default: false,
    },

    doctor_viewed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────

AppointmentSchema.index({
  status: 1,
  created_at: 1,
});

AppointmentSchema.index({
  doctor_id: 1,
  patient_id: 1,
});

AppointmentSchema.index({
  doctor_id: 1,
  "requested_slot.date": 1,
  status: 1,
});

AppointmentSchema.index({
  doctor_id: 1,
  has_unread_patient_query: 1,
});

AppointmentSchema.index({
  doctor_id: 1,
  has_new_test_upload: 1,
});

AppointmentSchema.index({
  doctor_id: 1,
  status: 1,
  doctor_viewed: 1,
});

module.exports =
  mongoose.model(
    "Appointment",
    AppointmentSchema
  );