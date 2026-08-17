// =============================================================================
// Backend/models/ImageUpload.js — Standalone medical image / document uploads
//
// Fully decoupled from the interview pipeline — user_id only, no session_id.
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("ImageUpload", ImageUploadSchema);
