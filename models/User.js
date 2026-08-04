// =============================================================================
// Backend/models/User.js — authentication + role identity
// =============================================================================
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role:     { type: String, enum: ["patient", "doctor", "admin"], default: "patient" },

    // patient only — links to their Patient profile
    patient_id: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", default: null },

    // doctor only — admin-assigned patient IDs
    assigned_patients: { type: [mongoose.Schema.Types.ObjectId], ref: "Patient", default: [] },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model("User", UserSchema);
