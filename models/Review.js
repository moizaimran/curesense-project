// =============================================================================
// Backend/models/Review.js — post-case rating & feedback
//
// One review per (appointment, reviewer_role):
//   · reviewer_role "patient" → the patient rating the doctor
//   · reviewer_role "doctor"  → the doctor rating the patient
// Only allowed once the appointment is "completed". Reviews can be edited
// (upsert), and the target's rating summary (DoctorProfile.rating /
// Patient.rating) is recalculated on every write.
// =============================================================================
const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    appointment_id: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment",   required: true },
    doctor_id:      { type: mongoose.Schema.Types.ObjectId, ref: "DoctorProfile", required: true },
    patient_id:     { type: mongoose.Schema.Types.ObjectId, ref: "Patient",       required: true },

    reviewer_role:    { type: String, enum: ["patient", "doctor"], required: true },
    reviewer_user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    rating:  { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", trim: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

ReviewSchema.index({ appointment_id: 1, reviewer_role: 1 }, { unique: true });
ReviewSchema.index({ doctor_id: 1, reviewer_role: 1, created_at: -1 });
ReviewSchema.index({ patient_id: 1, reviewer_role: 1, created_at: -1 });

module.exports = mongoose.model("Review", ReviewSchema);
