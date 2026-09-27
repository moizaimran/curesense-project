// =============================================================================
// Backend/models/User.js — authentication + role identity
// =============================================================================
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    role:     { type: String, enum: ["patient", "doctor", "admin"], default: "patient" },

    // patient only — links to their Patient profile
    patient_id: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", default: null },

    // Email verification
    is_verified: { type: Boolean, default: false },

    // Firebase Authentication UID — set during Phase 3 migration and on every new registration
    provider_uid: { type: String, default: null },

    // Google OAuth — set when account is created or linked via Google Sign-In
    google_id: { type: String, default: null },

    // Expo push notification token — registered by the mobile app after login
    expo_push_token: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Auto-delete unverified accounts after 24 hours
UserSchema.index(
  { created_at: 1 },
  { expireAfterSeconds: 86400, partialFilterExpression: { is_verified: false } }
);

// password field and bcrypt hooks removed — Firebase Authentication now holds credentials

module.exports = mongoose.model("User", UserSchema);
