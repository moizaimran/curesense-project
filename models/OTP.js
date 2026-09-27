const mongoose = require("mongoose");

const OTPSchema = new mongoose.Schema({
  email:      { type: String, required: true, lowercase: true, trim: true },
  otp_hash:   { type: String, required: true },
  type:       { type: String, enum: ["email_verification", "password_reset"], required: true },
  expires_at: { type: Date,   required: true },
  used:       { type: Boolean, default: false },
}, { timestamps: { createdAt: "created_at" } });

// Auto-delete documents 1 hour after expires_at (TTL index)
OTPSchema.index({ expires_at: 1 }, { expireAfterSeconds: 3600 });
OTPSchema.index({ email: 1, type: 1 });

module.exports = mongoose.model("OTP", OTPSchema);
