// =============================================================================
// Backend/models/ImageUpload.js — Standalone medical image / document uploads
//
// Can be linked to an appointment (chat), a session/report (post_session), or standalone.
// =============================================================================
const mongoose = require("mongoose");

const ImageUploadSchema = new mongoose.Schema(
  {
    user_id:           { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    upload_type:       { type: String, enum: ["pdf", "xray", "ct_mri"], required: true },
    original_filename: { type: String, default: "" },
    mime_type:         { type: String, default: "" },
    // storage_url: primary file asset (X-ray image, PDF, or CT/MRI thumbnail montage)
    storage_url:       { type: String, default: "" },
    // CT/MRI only — both assets share the same document _id as the link between them
    zip_url:           { type: String, default: "" },  // original ZIP (Cloudinary raw, authenticated)
    canvas_url:        { type: String, default: "" },  // 4-slice inference montage (Cloudinary image, authenticated)
    status:            { type: String, enum: ["processing", "complete", "error", "unavailable"], default: "processing" },
    model_used:        { type: String, default: "" },
    // Mixed: PDF returns { summary, key_findings, recommendations },
    //        X-ray returns { summary, findings, flagged_abnormal, impression },
    //        CT/MRI returns the same as X-ray. Mixed stores any shape without stripping.
    analysis_result:   { type: mongoose.Schema.Types.Mixed, default: null },
    flagged_abnormal:  { type: Boolean, default: false },
    error_message:     { type: String, default: "" },
    deleted_at:        { type: Date, default: null, index: true },

    // ── Origin tracking ───────────────────────────────────────────────────────
    // "standalone"   → uploaded from the scan/images tab directly
    // "chat"         → sent as a message in a doctor-patient appointment thread
    // "post_session" → uploaded after an interview session for clinical correlation
    source: {
      type: String,
      enum: ["standalone", "chat", "post_session"],
      default: "standalone",
    },

    // Set when source is "chat"
    appointment_id: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },

    // Set when source is "post_session" — used for the clinical correlation LLM call
    session_id: { type: mongoose.Schema.Types.ObjectId, ref: "Session", default: null },
    report_id:  { type: mongoose.Schema.Types.ObjectId, ref: "Report",  default: null },

    // Future: result of the LLM call that correlates image findings with the
    // clinical session report (post_session flow only)
    clinical_correlation: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ImageUpload", ImageUploadSchema);
