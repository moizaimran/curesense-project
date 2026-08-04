// =============================================================================
// Backend/models/Patient.js
// =============================================================================
const mongoose = require("mongoose");

const PatientSchema = new mongoose.Schema(
  {
    name:    { type: String, required: true },
    dob:     { type: Date,   required: true },
    gender:  { type: String, required: true },
    contact: {
      phone: { type: String, default: "" },
      email: { type: String, required: true },
    },
    user_id:             { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    medical_conditions:  { type: [String], default: [] },
    allergies:           { type: [String], default: [] },
    current_medications: { type: [String], default: [] },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("Patient", PatientSchema);
