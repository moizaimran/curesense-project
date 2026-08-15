// =============================================================================
// Backend/controllers/imageController.js
//
// POST /api/images        — accept base64 file, create record, fire background job
// GET  /api/images        — list user's uploads (20 most recent)
// GET  /api/images/:id    — poll status / retrieve result
//
// Background job: Cloudinary storage → AI routing (PDF→Flask/GPT, scan→MedGemma)
// Retry policy: 3 attempts with 1s/2s/4s backoff.
// MedGemma unavailable → status = "unavailable" (not "error"); user sees clear message.
// No PHI/raw file content is logged.
// =============================================================================
const cloudinary   = require("../config/cloudinary");
const ImageUpload  = require("../models/ImageUpload");
const asyncHandler = require("../utils/asyncHandler");
const axios        = require("axios");

const AI_SERVICE_URL      = process.env.AI_SERVICE_URL       || "";
const MEDGEMMA_URL        = process.env.MEDGEMMA_SERVICE_URL  || "";
const RETRY_DELAYS_MS     = [1000, 2000, 4000];
const VALID_TYPES         = new Set(["pdf", "xray", "ct_mri"]);
const MAX_BASE64_BYTES    = 55_000_000; // ~40 MB raw file limit after base64 overhead
// Worst-case: 3 MedGemma attempts × 180s + Cloudinary + retries ≈ 10 min; 12 min gives buffer.
const ANALYSIS_TIMEOUT_MS = 12 * 60 * 1000;

// ── Upload ────────────────────────────────────────────────────────────────────

const uploadImage = asyncHandler(async (req, res) => {
  const { file_base64, upload_type, original_filename, mime_type } = req.body;

  if (!file_base64)           return res.status(400).json({ error: "file_base64 is required" });
  if (!VALID_TYPES.has(upload_type))
    return res.status(400).json({ error: "upload_type must be pdf, xray, or ct_mri" });
  if (file_base64.length > MAX_BASE64_BYTES)
    return res.status(413).json({ error: "File too large (max ~40 MB)" });

  const record = await ImageUpload.create({
    user_id:           req.user._id,
    upload_type,
    original_filename: original_filename || "",
    mime_type:         mime_type         || "",
    status:            "processing",
  });

  // Fire and forget — _processInBackground catches all errors internally
  _processInBackground(record._id, file_base64, upload_type, mime_type, original_filename || "upload");

  // Timeout guard: if the record is still 'processing' after ANALYSIS_TIMEOUT_MS, flip it
  // to 'error'. The findOneAndUpdate filter on status:'processing' ensures this is a no-op
  // if the background job already finished (successfully or with its own error).
  setTimeout(async () => {
    try {
      await ImageUpload.findOneAndUpdate(
        { _id: record._id, status: "processing" },
        { status: "error", error_message: "Analysis timed out. Please try again." }
      );
    } catch {}
  }, ANALYSIS_TIMEOUT_MS);

  res.status(202).json({ id: record._id, status: "processing" });
});

// ── List ──────────────────────────────────────────────────────────────────────

const listImages = asyncHandler(async (req, res) => {
  const records = await ImageUpload
    .find({ user_id: req.user._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("-storage_url -__v");
  res.json(records);
});

// ── Status / result ───────────────────────────────────────────────────────────

const getImageStatus = asyncHandler(async (req, res) => {
  const record = await ImageUpload.findOne({ _id: req.params.id, user_id: req.user._id });
  if (!record) return res.status(404).json({ error: "Upload not found" });

  res.json({
    id:                record._id,
    status:            record.status,
    upload_type:       record.upload_type,
    original_filename: record.original_filename,
    model_used:        record.model_used,
    analysis_result:   record.analysis_result,
    flagged_abnormal:  record.flagged_abnormal,
    error_message:     record.error_message,
    created_at:        record.createdAt,
    updated_at:        record.updatedAt,
  });
});

// ── Background processing ─────────────────────────────────────────────────────

async function _processInBackground(recordId, fileBase64, uploadType, mimeType, filename) {
  try {
    // 1. Upload raw file to Cloudinary for durable storage
    const cloudinaryType = uploadType === "pdf" ? "raw" : "image";
    const dataUri        = `data:${mimeType || "application/octet-stream"};base64,${fileBase64}`;

    let storageUrl = "";
    try {
      const up = await cloudinary.uploader.upload(dataUri, {
        resource_type: cloudinaryType,
        folder:        "curesense/images",
        public_id:     recordId.toString(),
        type:          "authenticated", // private — requires signed URL to access
      });
      storageUrl = up.secure_url;
    } catch {
      // Fallback: try as raw resource type (handles DICOM / unrecognised image formats)
      try {
        const up = await cloudinary.uploader.upload(dataUri, {
          resource_type: "raw",
          folder:        "curesense/images",
          public_id:     `${recordId}_raw`,
          type:          "authenticated",
        });
        storageUrl = up.secure_url;
      } catch {}
    }

    // If neither attempt succeeded the file is not stored — stop here rather than
    // marking a result 'complete' when the underlying data was never saved.
    if (!storageUrl) {
      await ImageUpload.findOneAndUpdate(
        { _id: recordId, status: "processing" },
        { status: "error", error_message: "File could not be saved to storage. Please try again." }
      );
      return;
    }

    await ImageUpload.findByIdAndUpdate(recordId, { storage_url: storageUrl });

    // 2. Route to AI service
    let result;
    if (uploadType === "pdf") {
      result = await _analyzePdf(fileBase64, filename);
    } else {
      result = await _analyzeMedgemma(fileBase64, uploadType);
    }

    // Guard against the timeout having already flipped the status while AI was running
    await ImageUpload.findOneAndUpdate(
      { _id: recordId, status: "processing" },
      {
        status:           result.status,
        model_used:       result.model_used,
        analysis_result:  result.analysis_result,
        flagged_abnormal: result.analysis_result?.flagged_abnormal ?? false,
        error_message:    result.error_message || "",
      }
    );
  } catch {
    await ImageUpload.findOneAndUpdate(
      { _id: recordId, status: "processing" },
      { status: "error", error_message: "An unexpected error occurred. Please try again." }
    );
  }
}

// ── PDF → Flask/GPT ───────────────────────────────────────────────────────────

async function _analyzePdf(pdfBase64, filename) {
  if (!AI_SERVICE_URL) {
    return { status: "unavailable", model_used: "gpt", analysis_result: null, error_message: "AI service URL not configured." };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await axios.post(
        `${AI_SERVICE_URL}/images/analyze-pdf`,
        { pdf_base64: pdfBase64, filename },
        { timeout: 120_000 }
      );
      return {
        status:          "complete",
        model_used:      resp.data.model_used || "gpt",
        analysis_result: resp.data,
        error_message:   "",
      };
    } catch {
      if (attempt < 2) await _delay(RETRY_DELAYS_MS[attempt]);
    }
  }

  return {
    status:          "error",
    model_used:      "gpt",
    analysis_result: null,
    error_message:   "PDF analysis service unreachable after 3 attempts.",
  };
}

// ── CT/MRI/X-ray → Kaggle MedGemma ───────────────────────────────────────────

async function _analyzeMedgemma(imageBase64, uploadType) {
  if (!MEDGEMMA_URL) {
    return {
      status:          "unavailable",
      model_used:      "medgemma",
      analysis_result: null,
      error_message:   "MedGemma service is not currently available. Please try again later.",
    };
  }

  const endpoint = uploadType === "xray" ? "/analyze/xray" : "/analyze/ct-mri";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await axios.post(
        `${MEDGEMMA_URL}${endpoint}`,
        { image_base64: imageBase64, modality: uploadType === "ct_mri" ? "ct" : undefined },
        { timeout: 180_000 }
      );
      return {
        status:          "complete",
        model_used:      "medgemma-1.5-4b",
        analysis_result: resp.data,
        error_message:   "",
      };
    } catch {
      if (attempt < 2) await _delay(RETRY_DELAYS_MS[attempt]);
    }
  }

  return {
    status:          "unavailable",
    model_used:      "medgemma",
    analysis_result: null,
    error_message:   "MedGemma service is temporarily unavailable. Please try again later.",
  };
}

const _delay = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { uploadImage, listImages, getImageStatus };
