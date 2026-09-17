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

    message: {
      type: String,
      required: true,
      trim: true,
    },

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