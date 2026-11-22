// =============================================================================
// Backend/models/Notification.js — in-app notifications (doctor dashboard bell)
// =============================================================================
const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["new_case", "emergency_case", "patient_message", "test_upload", "image_uploaded"],
      required: true,
    },
    title:   { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, default: "", trim: true, maxlength: 500 },
    // Portal path to open when clicked, e.g. "/cases/<appointmentId>"
    link:           { type: String, default: "" },
    appointment_id: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },
    read:           { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

NotificationSchema.index({ user_id: 1, created_at: -1 });
NotificationSchema.index({ user_id: 1, read: 1 });
// Keep the collection small: notifications older than 90 days are removed.
NotificationSchema.index({ created_at: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model("Notification", NotificationSchema);
