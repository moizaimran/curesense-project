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

// Each entry in the query thread — one message from either the patient or doctor.
const QueryMessageSchema = new mongoose.Schema(
  {
    sender:     { type: String, enum: ["patient", "doctor"], required: true },
    message:    { type: String, required: true, trim: true },
    created_at: { type: Date,   default: Date.now },
    // For patient messages: flipped to true when the doctor calls markQueriesRead.
    // For doctor messages: reserved for future patient read-receipts.
    read:       { type: Boolean, default: false },
  },
  { _id: true }
);

const SlotSchema = new mongoose.Schema(
  {
    date:       { type: Date,   required: true },
    start_time: { type: String, required: true }, // "09:00"
    end_time:   { type: String, required: true }, // "09:30"
  },
  { _id: false }
);

const AppointmentSchema = new mongoose.Schema(
  {
    patient_id:    { type: mongoose.Schema.Types.ObjectId, ref: "Patient",                 required: true },
    doctor_id:     { type: mongoose.Schema.Types.ObjectId, ref: "DoctorProfile",           required: true },
    assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: "PatientDoctorAssignment", required: true },

    requested_slot: { type: SlotSchema, required: true },

    status: {
      type:    String,
      enum:    ["pending_admin_review", "confirmed", "rejected", "completed", "cancelled", "no_show"],
      default: "pending_admin_review",
    },

    // Set on admin approve/reject
    reviewed_by:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewed_at:      { type: Date, default: null },
    rejection_reason: { type: String, default: "" },

    // Set at booking time when the patient picks which report this appointment is about.
    // Also set on the Report document (Report.appointment_id = this appointment's _id).
    // session_id is set later if a follow-up session is needed.
    report_id:  { type: mongoose.Schema.Types.ObjectId, ref: "Report",  default: null },
    session_id: { type: mongoose.Schema.Types.ObjectId, ref: "Session", default: null },

    // ── Doctor feedback (post-visit) ──────────────────────────────────────────
    // Mixed so the frontend can add/change form fields without a model migration.
    // Expected shape: { notes, recommendation, submitted_at, submitted_by }
    feedback: { type: mongoose.Schema.Types.Mixed, default: null },

    // ── In-appointment query thread ───────────────────────────────────────────
    queries: { type: [QueryMessageSchema], default: [] },

    // True when the patient has added a query the doctor hasn't seen yet.
    // Drives the unread indicator and sort-to-top on the doctor dashboard.
    // Set true on patient append; cleared by PATCH /api/appointments/:id/queries/read.
    has_unread_patient_query: { type: Boolean, default: false },

    // Flipped to true the first time the doctor opens the appointment detail.
    // Drives the "Pending / New" dashboard counter — distinct from unread messages.
    // A freshly approved appointment stays pending_new until the doctor views it,
    // even if the patient hasn't sent a query yet.
    doctor_viewed: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Admin review queue: all pending appointments sorted by creation time
AppointmentSchema.index({ status: 1, created_at: 1 });
// Doctor/patient history lookups
AppointmentSchema.index({ doctor_id: 1, patient_id: 1 });
// Double-booking guard: fast check for confirmed/pending slots on a given day
AppointmentSchema.index({ doctor_id: 1, "requested_slot.date": 1, status: 1 });
// Doctor dashboard: sort appointments with unread patient queries to the top
AppointmentSchema.index({ doctor_id: 1, has_unread_patient_query: 1 });
// "Pending / New" counter: confirmed cases doctor hasn't opened yet
AppointmentSchema.index({ doctor_id: 1, status: 1, doctor_viewed: 1 });

module.exports = mongoose.model("Appointment", AppointmentSchema);
