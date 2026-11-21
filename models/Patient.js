// =============================================================================
// Backend/models/Patient.js
// =============================================================================
const mongoose = require("mongoose");

const PatientSchema = new mongoose.Schema(
  {
    name:    { type: String, required: true },
    dob:     { type: Date,   default: null },
    gender:  { type: String, default: null },
    contact: {
      phone: { type: String, default: "" },
      email: { type: String, required: true },
    },
    user_id:             { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    medical_conditions:  { type: [String], default: [] },
    allergies:           { type: [String], default: [] },
    current_medications: { type: [String], default: [] },
    profile_complete:    { type: Boolean, default: false },

    // ── Rating summary from doctors (kept in sync by services/reviewService.js)
    // Visible to doctors and admins only — never returned to the patient app.
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count:   { type: Number, default: 0, min: 0 },
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("Patient", PatientSchema);
