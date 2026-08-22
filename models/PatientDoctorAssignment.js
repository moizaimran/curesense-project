// =============================================================================
// Backend/models/PatientDoctorAssignment.js
//
// The ONGOING RELATIONSHIP between a patient and a doctor.
// This is the ACCESS-CONTROL gate — a doctor may only read a patient's data
// while an Assignment with status:"active" exists for that pair.
//
// status lifecycle:
//   pending   → patient chose this doctor; first appointment awaiting admin review
//   active    → admin approved the first appointment; doctor has full access
//   terminated→ admin-override revocation (future feature); access is cut
//                immediately but Appointment history is never deleted
//
// One document per unique (patient_id, doctor_id) pair — enforced by the
// compound unique index below.
// =============================================================================
const mongoose = require("mongoose");

const PatientDoctorAssignmentSchema = new mongoose.Schema(
  {
    patient_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Patient",
      required: true,
    },
    // References DoctorProfile (NOT User) — doctor identity lives there
    doctor_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "DoctorProfile",
      required: true,
    },

    status: {
      type:    String,
      enum:    ["pending", "active", "terminated"],
      default: "pending",
    },

    // Set to the first confirmed Appointment for this pair
    first_appointment_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Appointment",
      default: null,
    },
    activated_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// One relationship per patient-doctor pair
PatientDoctorAssignmentSchema.index(
  { patient_id: 1, doctor_id: 1 },
  { unique: true }
);

// Fast access-control lookup: "does doctor X have active access to patient Y?"
PatientDoctorAssignmentSchema.index({ doctor_id: 1, status: 1 });

module.exports = mongoose.model("PatientDoctorAssignment", PatientDoctorAssignmentSchema);
