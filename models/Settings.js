// =============================================================================
// Backend/models/Settings.js — singleton system settings document
//
// Always fetched/updated via { _key: "singleton" } with upsert:true.
// Never create a second document — the singleton pattern is enforced by the
// unique index on _key.
// =============================================================================
const mongoose = require("mongoose");

const SettingsSchema = new mongoose.Schema(
  {
    _key: { type: String, default: "singleton", unique: true },

    systemName:   { type: String, default: "CureSense" },
    supportEmail: { type: String, default: "support@curesense.com" },
    supportPhone: { type: String, default: "" },

    aiConfidence:  { type: Number,  default: 85 },
    aiDiagnosis:   { type: Boolean, default: true },
    imageAnalysis: { type: Boolean, default: true },

    sessionTimeout: { type: Number,  default: 30 },
    twoFactorAuth:  { type: Boolean, default: false },

    doctorApprovalEmails:      { type: Boolean, default: true },
    patientRegistrationEmails: { type: Boolean, default: true },
    systemAlerts:              { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("Settings", SettingsSchema);
