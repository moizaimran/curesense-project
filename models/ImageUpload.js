// =============================================================================
// Backend/models/ImageUpload.js — Standalone medical image / document uploads
//
// Fully decoupled from the interview pipeline — user_id only, no session_id.
// =============================================================================
const mongoose = require("mongoose");

const AnalysisResultSchema = new mongoose.Schema(
  {
    summary:          String,
    findings:         [String],
    flagged_abnormal: Boolean,
    impression:       String,
  },
  { _id: false, strict: false }
);

const ImageUploadSchema = new mongoose.Schema(
  {
    user_id:           { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    upload_type:       { type: String, enum: ["pdf", "xray", "ct_mri"], required: true },
    original_filename: { type: String, default: "" },
    mime_type:         { type: String, default: "" },
    storage_url:       { type: String, default: "" },
    status:            { type: String, enum: ["processing", "complete", "error", "unavailable"], default: "processing" },
    model_used:        { type: String, default: "" },
    analysis_result:   { type: AnalysisResultSchema, default: null },
    flagged_abnormal:  { type: Boolean, default: false },
    error_message:     { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ImageUpload", ImageUploadSchema);
