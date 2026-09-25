const cloudinary   = require("../config/cloudinary");
const { AppError } = require("../utils/errors");
const { canAccessPatient } = require("../middleware/auth");
const ImageUpload  = require("../models/ImageUpload");
const axios        = require("axios");
const logger       = require("../utils/logger");

const AI_SERVICE_URL      = process.env.AI_SERVICE_URL       || "";
const MEDGEMMA_URL        = process.env.MEDGEMMA_SERVICE_URL  || "";
const RETRY_DELAYS_MS     = [1000, 2000, 4000];
const VALID_TYPES         = new Set(["pdf", "xray", "ct_mri"]);
const MAX_BASE64_BYTES    = { pdf: 55_000_000, xray: 55_000_000, ct_mri: 200_000_000 };
const ANALYSIS_TIMEOUT_MS = 12 * 60 * 1000;

// ── File-type detection via magic bytes ──────────────────────────────────────

function _detectFileType(base64) {
  const buf = Buffer.from(base64.slice(0, 300), "base64");

  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf";
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF)                     return "image";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return "image";
  if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) return "zip";
  if (buf.length >= 132 &&
      buf[128] === 0x44 && buf[129] === 0x49 && buf[130] === 0x43 && buf[131] === 0x4D)
    return "dicom";

  return "unknown";
}

const _TYPE_RULES = {
  pdf:    { allowed: new Set(["pdf"]),                    hint: "That looks like an image or scan — please use the X-ray or CT / MRI option instead." },
  xray:   { allowed: new Set(["image", "dicom"]),         hint: "That looks like a PDF — please use the PDF / Report option instead." },
  ct_mri: { allowed: new Set(["zip", "dicom", "image"]), hint: "That looks like a PDF — please use the PDF / Report option instead." },
};

// ── Upload ────────────────────────────────────────────────────────────────────

async function uploadImage(body, user) {
  const { file_base64, upload_type, original_filename, mime_type } = body;

  if (!file_base64) throw new AppError("file_base64 is required", 400);
  if (!VALID_TYPES.has(upload_type))
    throw new AppError("upload_type must be pdf, xray, or ct_mri", 400);

  const limitBytes = MAX_BASE64_BYTES[upload_type] ?? 55_000_000;
  if (file_base64.length > limitBytes)
    throw new AppError(upload_type === "ct_mri" ? "File too large (max ~150 MB for CT/MRI)" : "File too large (max ~40 MB)", 413);

  const detectedType = _detectFileType(file_base64);
  const rule         = _TYPE_RULES[upload_type];
  if (detectedType !== "unknown" && !rule.allowed.has(detectedType))
    throw new AppError(rule.hint, 422);

  const record = await ImageUpload.create({
    user_id:           user._id,
    upload_type,
    original_filename: original_filename || "",
    mime_type:         mime_type         || "",
    status:            "processing",
  });

  _processInBackground(record._id, file_base64, upload_type, mime_type, original_filename || "upload");

  setTimeout(async () => {
    try {
      await ImageUpload.findOneAndUpdate(
        { _id: record._id, status: "processing" },
        { status: "error", error_message: "Analysis timed out. Please try again." }
      );
    } catch (_) {}
  }, ANALYSIS_TIMEOUT_MS).unref();

  return { id: record._id, status: "processing" };
}

// ── List (patient's own) ──────────────────────────────────────────────────────

async function listImages(userId) {
  const records = await ImageUpload
    .find({ user_id: userId, deleted_at: null })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("-storage_url -__v");
  return records.map(_formatRecord);
}

// ── List (doctor/admin view of a patient) ─────────────────────────────────────

async function listPatientImages(patientId, user) {
  const Patient = require("../models/Patient");

  if (!(await canAccessPatient(user, patientId))) throw new AppError("Access denied", 403);

  const patient = await Patient.findById(patientId).select("user_id");
  if (!patient) throw new AppError("Patient not found", 404);

  const records = await ImageUpload
    .find({ user_id: patient.user_id, deleted_at: null })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("-storage_url -zip_url -canvas_url -__v");
  return records.map(_formatRecord);
}

// ── Status / result ───────────────────────────────────────────────────────────

async function getImageStatus(id, userId) {
  const record = await ImageUpload.findOne({ _id: id, user_id: userId, deleted_at: null });
  if (!record) throw new AppError("Upload not found", 404);
  return _formatRecord(record);
}

// ── Soft delete ───────────────────────────────────────────────────────────────

async function deleteImage(id, userId) {
  const record = await ImageUpload.findOne({ _id: id, user_id: userId, deleted_at: null });
  if (!record) throw new AppError("Upload not found", 404);
  await ImageUpload.findByIdAndUpdate(record._id, { deleted_at: new Date() });
  return { success: true };
}

// ── Private: format record for API responses ──────────────────────────────────

function _formatRecord(r) {
  return {
    id:                   r._id,
    status:               r.status,
    upload_type:          r.upload_type,
    original_filename:    r.original_filename,
    model_used:           r.model_used,
    analysis_result:      r.analysis_result,
    flagged_abnormal:     r.flagged_abnormal,
    error_message:        r.error_message,
    source:               r.source,
    // Only present for post_session images — null otherwise
    clinical_correlation: r.clinical_correlation ?? null,
    created_at:           r.createdAt,
    updated_at:           r.updatedAt,
  };
}

// ── Private: background processing ───────────────────────────────────────────

async function _processInBackground(recordId, fileBase64, uploadType, mimeType, filename) {
  const log = logger.child({ record_id: recordId.toString(), upload_type: uploadType });
  log.info({ filename }, "Starting image analysis");
  try {
    if (uploadType === "ct_mri") {
      try {
        const up = await cloudinary.uploader.upload(
          `data:application/zip;base64,${fileBase64}`,
          { resource_type: "raw", folder: "curesense/ct_zip", public_id: `${recordId}_zip`, type: "authenticated" }
        );
        await ImageUpload.findByIdAndUpdate(recordId, { zip_url: up.secure_url });
        log.info("CT/MRI ZIP saved to Cloudinary");
      } catch (err) {
        log.warn({ err: err?.message }, "CT/MRI ZIP Cloudinary upload skipped — continuing without ZIP storage");
      }
    } else {
      const cloudinaryType = uploadType === "pdf" ? "raw" : "image";
      const dataUri        = `data:${mimeType || "application/octet-stream"};base64,${fileBase64}`;
      try {
        const up = await cloudinary.uploader.upload(dataUri, {
          resource_type: cloudinaryType, folder: "curesense/images",
          public_id: recordId.toString(), type: "authenticated",
        });
        await ImageUpload.findByIdAndUpdate(recordId, { storage_url: up.secure_url });
      } catch (err) {
        log.warn({ err: err?.message, cloudinaryType }, "Cloudinary upload failed — retrying as raw");
        try {
          const up = await cloudinary.uploader.upload(dataUri, {
            resource_type: "raw", folder: "curesense/images",
            public_id: `${recordId}_raw`, type: "authenticated",
          });
          await ImageUpload.findByIdAndUpdate(recordId, { storage_url: up.secure_url });
        } catch (err2) {
          log.warn({ err: err2?.message }, "Cloudinary raw upload also failed — continuing without file storage");
        }
      }
    }

    let result;
    if (uploadType === "pdf") {
      result = await _analyzePdf(fileBase64, filename, log);
    } else {
      result = await _analyzeMedgemma(fileBase64, uploadType, log);
    }

    if (uploadType === "ct_mri" && result.status === "complete") {
      const updates = {};
      const canvasB64 = result.analysis_result?.canvas_b64;
      if (canvasB64) {
        delete result.analysis_result.canvas_b64;
        try {
          const up = await cloudinary.uploader.upload(
            `data:image/jpeg;base64,${canvasB64}`,
            { resource_type: "image", folder: "curesense/ct_canvas", public_id: `${recordId}_canvas`, type: "authenticated" }
          );
          updates.canvas_url = up.secure_url;
          log.info("CT/MRI canvas saved to Cloudinary");
        } catch (err) {
          log.warn({ err: err?.message }, "CT/MRI canvas Cloudinary upload failed");
        }
      }
      const thumbB64 = result.analysis_result?.thumbnail_b64;
      if (thumbB64) {
        delete result.analysis_result.thumbnail_b64;
        try {
          const up = await cloudinary.uploader.upload(
            `data:image/jpeg;base64,${thumbB64}`,
            { resource_type: "image", folder: "curesense/images", public_id: recordId.toString(), type: "authenticated" }
          );
          updates.storage_url = up.secure_url;
        } catch (err) {
          log.warn({ err: err?.message }, "CT/MRI thumbnail Cloudinary upload failed");
        }
      }
      if (Object.keys(updates).length) {
        await ImageUpload.findByIdAndUpdate(recordId, updates);
      }
    }

    const saved = await ImageUpload.findOneAndUpdate(
      { _id: recordId, status: "processing" },
      {
        $set: {
          status:           result.status,
          model_used:       result.model_used,
          analysis_result:  result.analysis_result,
          flagged_abnormal: result.analysis_result?.flagged_abnormal ?? false,
          error_message:    result.error_message || "",
        },
      },
      { new: true }
    );
    if (saved) {
      log.info({ status: saved.status, analysis_keys: Object.keys(saved.analysis_result || {}) }, "Analysis result saved");
    } else {
      log.warn("Save skipped — status was no longer 'processing' (likely timed out)");
    }
  } catch (err) {
    log.error({ err: err?.message }, "Unexpected error in image analysis background job");
    await ImageUpload.findOneAndUpdate(
      { _id: recordId, status: "processing" },
      { status: "error", error_message: "An unexpected error occurred. Please try again." }
    );
  }
}

async function _analyzePdf(pdfBase64, filename, log) {
  if (!AI_SERVICE_URL) {
    return { status: "unavailable", model_used: "gpt", analysis_result: null, error_message: "AI service URL not configured." };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await axios.post(
        `${AI_SERVICE_URL}/images/analyze-pdf`,
        { pdf_base64: pdfBase64, filename },
        { timeout: 120_000, validateStatus: () => true }
      );
      log.debug({ http_status: resp.status, attempt: attempt + 1 }, "PDF analysis response");
      if (resp.status === 200) {
        return { status: "complete", model_used: resp.data.model_used || "gpt", analysis_result: resp.data, error_message: "" };
      }
      const msg = resp.data?.error || `Analysis failed (HTTP ${resp.status})`;
      log.error({ http_status: resp.status }, "PDF analysis error from Flask");
      return { status: "error", model_used: "gpt", analysis_result: null, error_message: msg };
    } catch (err) {
      log.warn({ err: err?.message, attempt: attempt + 1 }, "PDF analysis network error");
      if (attempt < 2) await _delay(RETRY_DELAYS_MS[attempt]);
    }
  }
  return { status: "error", model_used: "gpt", analysis_result: null, error_message: "PDF analysis service unreachable after 3 attempts." };
}

async function _analyzeMedgemma(imageBase64, uploadType, log) {
  if (!MEDGEMMA_URL) {
    return { status: "unavailable", model_used: "medgemma", analysis_result: null, error_message: "MedGemma service is not currently available. Please try again later." };
  }
  const endpoint = uploadType === "xray" ? "/analyze/xray" : "/analyze/ct-mri";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await axios.post(
        `${MEDGEMMA_URL}${endpoint}`,
        { image_base64: imageBase64, modality: uploadType === "ct_mri" ? "ct" : undefined },
        { timeout: 360_000, validateStatus: () => true }
      );
      log.debug({ http_status: resp.status, attempt: attempt + 1 }, "MedGemma response");
      if (resp.status === 200) {
        return { status: "complete", model_used: "medgemma-1.5-4b", analysis_result: resp.data, error_message: "" };
      }
      const msg = resp.data?.detail || resp.data?.error || `Analysis failed (HTTP ${resp.status})`;
      log.error({ http_status: resp.status }, "MedGemma returned an error");
      return { status: "error", model_used: "medgemma", analysis_result: null, error_message: msg };
    } catch (err) {
      log.warn({ err: err?.message, attempt: attempt + 1 }, "MedGemma network error");
      if (attempt < 2) await _delay(RETRY_DELAYS_MS[attempt]);
    }
  }
  return { status: "unavailable", model_used: "medgemma", analysis_result: null, error_message: "MedGemma service is temporarily unavailable. Please try again later." };
}

const _delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Post-session image: upload after interview + clinical correlation ─────────
//
// Patient uploads a radiology/CT/MRI/PDF scan after completing an interview.
// Flow:
//   1. Validate session belongs to patient + is completed + has a linked Report
//   2. Create ImageUpload record (source: "post_session", session_id, report_id)
//   3. Background: Cloudinary + MedGemma + correlation LLM call
//   4. Store clinical_correlation on the ImageUpload record
//   5. Notify the assigned doctor

/**
 * Validate session ownership, start ImageUpload record, fire background job.
 * Accepts the same body shape as uploadImage plus session_id.
 */
async function uploadForSession(body, user) {
  const { file_base64, upload_type, original_filename, mime_type, session_id } = body;

  if (!file_base64)   throw new AppError("file_base64 is required", 400);
  if (!session_id)    throw new AppError("session_id is required", 400);
  if (!VALID_TYPES.has(upload_type))
    throw new AppError("upload_type must be pdf, xray, or ct_mri", 400);

  const limitBytes = MAX_BASE64_BYTES[upload_type] ?? 55_000_000;
  if (file_base64.length > limitBytes)
    throw new AppError(upload_type === "ct_mri" ? "File too large (max ~150 MB for CT/MRI)" : "File too large (max ~40 MB)", 413);

  const detectedType = _detectFileType(file_base64);
  const rule         = _TYPE_RULES[upload_type];
  if (detectedType !== "unknown" && !rule.allowed.has(detectedType))
    throw new AppError(rule.hint, 422);

  // Lazy require to avoid circular deps
  const Session = require("../models/Session");
  const Report  = require("../models/Report");
  const Patient = require("../models/Patient");

  // Session must belong to this patient
  const patient = await Patient.findOne({ user_id: user._id }).select("_id");
  if (!patient) throw new AppError("Patient profile not found", 404);

  const session = await Session.findOne({ _id: session_id, patient_id: patient._id }).select("_id is_deleted status");
  if (!session || session.is_deleted) throw new AppError("Session not found", 404);
  if (session.status !== "completed")
    throw new AppError("Scans can only be uploaded for completed sessions", 422);

  const report = await Report.findOne({ session_id, is_deleted: { $ne: true } }).select("_id disease_ranking doctor_report patient_summary interpreted_diagnoses");
  if (!report) throw new AppError("No report found for this session — complete the interview first", 404);

  const record = await ImageUpload.create({
    user_id:           user._id,
    upload_type,
    original_filename: original_filename || "",
    mime_type:         mime_type         || "",
    status:            "processing",
    source:            "post_session",
    session_id,
    report_id:         report._id,
  });

  _runSessionImageBackground({
    recordId:   record._id,
    fileBase64: file_base64,
    uploadType: upload_type,
    mimeType:   mime_type,
    filename:   original_filename || "scan",
    reportId:   report._id,
    reportData: {
      disease_ranking:       report.disease_ranking,
      complaint_summary:     report.doctor_report?.patientComplaintSummary || "",
      rag_summary:           report.doctor_report?.ragSummary              || "",
      interpreted_diagnoses: report.interpreted_diagnoses,
    },
    patientId: patient._id,
  });

  // Same analysis timeout guard as standalone uploads
  setTimeout(async () => {
    try {
      await ImageUpload.findOneAndUpdate(
        { _id: record._id, status: "processing" },
        { status: "error", error_message: "Analysis timed out. Please try again." }
      );
    } catch (_) {}
  }, ANALYSIS_TIMEOUT_MS).unref();

  return { id: record._id, status: "processing" };
}

async function _runSessionImageBackground({
  recordId, fileBase64, uploadType, mimeType, filename, reportId, reportData, patientId,
}) {
  const log = logger.child({ record_id: recordId.toString(), source: "post_session", upload_type: uploadType });

  try {
    // 1. Cloudinary upload (same logic as standalone — reuse existing branches)
    if (uploadType === "ct_mri") {
      try {
        const up = await cloudinary.uploader.upload(
          `data:application/zip;base64,${fileBase64}`,
          { resource_type: "raw", folder: "curesense/ct_zip", public_id: `${recordId}_zip`, type: "authenticated" }
        );
        await ImageUpload.findByIdAndUpdate(recordId, { zip_url: up.secure_url });
        log.info("CT/MRI ZIP saved to Cloudinary");
      } catch (err) {
        log.warn({ err: err?.message }, "CT/MRI ZIP Cloudinary upload skipped");
      }
    } else {
      const cloudinaryType = uploadType === "pdf" ? "raw" : "image";
      const dataUri        = `data:${mimeType || "application/octet-stream"};base64,${fileBase64}`;
      try {
        const up = await cloudinary.uploader.upload(dataUri, {
          resource_type: cloudinaryType, folder: "curesense/session_scans",
          public_id: recordId.toString(), type: "authenticated",
        });
        await ImageUpload.findByIdAndUpdate(recordId, { storage_url: up.secure_url });
      } catch (err) {
        log.warn({ err: err?.message }, "Cloudinary upload failed for session scan");
      }
    }

    // 2. AI analysis
    let result;
    if (uploadType === "pdf") {
      result = await _analyzePdf(fileBase64, filename, log);
    } else {
      result = await _analyzeMedgemma(fileBase64, uploadType, log);
    }

    // CT/MRI canvas/thumbnail handling (same as standalone)
    if (uploadType === "ct_mri" && result.status === "complete") {
      const updates = {};
      const canvasB64 = result.analysis_result?.canvas_b64;
      if (canvasB64) {
        delete result.analysis_result.canvas_b64;
        try {
          const up = await cloudinary.uploader.upload(
            `data:image/jpeg;base64,${canvasB64}`,
            { resource_type: "image", folder: "curesense/ct_canvas", public_id: `${recordId}_canvas`, type: "authenticated" }
          );
          updates.canvas_url = up.secure_url;
        } catch (err) {
          log.warn({ err: err?.message }, "CT/MRI canvas upload failed");
        }
      }
      const thumbB64 = result.analysis_result?.thumbnail_b64;
      if (thumbB64) {
        delete result.analysis_result.thumbnail_b64;
        try {
          const up = await cloudinary.uploader.upload(
            `data:image/jpeg;base64,${thumbB64}`,
            { resource_type: "image", folder: "curesense/session_scans", public_id: recordId.toString(), type: "authenticated" }
          );
          updates.storage_url = up.secure_url;
        } catch (err) {
          log.warn({ err: err?.message }, "CT/MRI thumbnail upload failed");
        }
      }
      if (Object.keys(updates).length) {
        await ImageUpload.findByIdAndUpdate(recordId, updates);
      }
    }

    // 3. Save analysis result
    await ImageUpload.findOneAndUpdate(
      { _id: recordId, status: "processing" },
      { $set: {
        status:           result.status,
        model_used:       result.model_used,
        analysis_result:  result.analysis_result,
        flagged_abnormal: result.analysis_result?.flagged_abnormal ?? false,
        error_message:    result.error_message || "",
      }}
    );

    // 4. Clinical correlation LLM call — only if analysis succeeded
    if (result.status === "complete" && result.analysis_result && AI_SERVICE_URL) {
      const correlation = await _correlateWithReport(result.analysis_result, reportData, log);
      if (correlation) {
        await ImageUpload.findByIdAndUpdate(recordId, { clinical_correlation: correlation });
        log.info("Clinical correlation saved");
      }
    }

    // 5. Notify the assigned doctor (if any)
    try {
      const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");
      const DoctorProfile           = require("../models/DoctorProfile");
      const { notifyUser }          = require("./notificationService");

      const assignment = await PatientDoctorAssignment
        .findOne({ patient_id: patientId, status: "active" })
        .select("doctor_id");
      if (assignment) {
        const profile = await DoctorProfile.findById(assignment.doctor_id).select("user_id");
        if (profile?.user_id) {
          await notifyUser(profile.user_id, {
            title: "Patient uploaded a scan",
            body:  result.status === "complete"
              ? "AI analysis + clinical correlation ready to review"
              : "Scan received — AI analysis unavailable",
            data: { report_id: reportId.toString() },
          });
        }
      }
    } catch (err) {
      log.warn({ err: err?.message }, "Doctor notification failed (non-fatal)");
    }

    log.info({ analysis_status: result.status }, "Session scan processing complete");
  } catch (err) {
    log.error({ err: err?.message }, "Unexpected error in session scan background job");
    await ImageUpload.findOneAndUpdate(
      { _id: recordId, status: "processing" },
      { status: "error", error_message: "Analysis failed. Please try again." }
    ).catch(() => {});
  }
}

/**
 * Call Flask endpoint to correlate image analysis with clinical report data.
 * Returns the correlation object/string, or null if the endpoint is unavailable.
 */
async function _correlateWithReport(imageAnalysis, reportData, log) {
  try {
    const resp = await axios.post(
      `${AI_SERVICE_URL}/images/correlate-with-report`,
      { image_analysis: imageAnalysis, clinical_summary: reportData },
      { timeout: 120_000, validateStatus: () => true }
    );
    if (resp.status === 200) {
      log.info("Clinical correlation call succeeded");
      return resp.data?.correlation ?? resp.data ?? null;
    }
    log.warn({ http_status: resp.status }, "Correlation endpoint returned non-200 — skipping");
    return null;
  } catch (err) {
    log.warn({ err: err?.message }, "Correlation endpoint unreachable — skipping (non-fatal)");
    return null;
  }
}

// ── Chat image: create record + fire background analysis ──────────────────────
//
// Called by addQuery when the patient sends a medical image in the chat thread.
// Returns the ImageUpload record synchronously so addQuery can embed its _id in
// the query message before responding. The heavy work (Cloudinary + MedGemma)
// runs in the background and updates both the ImageUpload record and the
// appointment query message when done.

/**
 * Detect JPEG / PNG / PDF from first magic bytes.
 * Returns "jpeg" | "png" | "pdf" | "unknown"
 */
function _detectChatFileType(base64) {
  const buf = Buffer.from(base64.slice(0, 20), "base64");
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF)                     return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return "png";
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf";
  return "unknown";
}

/**
 * Create an ImageUpload record for a chat-sourced image.
 * Determines upload_type automatically from magic bytes.
 * Throws AppError for unsupported file types.
 */
async function createChatImageRecord({ userId, appointmentId, fileBase64, mimeType, filename }) {
  if (!fileBase64) throw new AppError("file_base64 is required", 400);
  const detected = _detectChatFileType(fileBase64);
  if (detected === "unknown")
    throw new AppError("Only JPEG, PNG, and PDF files can be sent in chat", 422);

  const uploadType = detected === "pdf" ? "pdf" : "xray";

  const approxBytes = (fileBase64.length * 3) / 4;
  const limitBytes  = MAX_BASE64_BYTES[uploadType] ?? 55_000_000;
  if (approxBytes > limitBytes)
    throw new AppError("File too large (max ~40 MB)", 413);

  return ImageUpload.create({
    user_id:           userId,
    upload_type:       uploadType,
    original_filename: filename || "",
    mime_type:         mimeType || "",
    status:            "processing",
    source:            "chat",
    appointment_id:    appointmentId,
  });
}

/**
 * Fire-and-forget: upload to Cloudinary, run MedGemma / PDF analysis, then
 * update the ImageUpload record and the appointment query message in place.
 * Also pushes a push notification to the doctor when the result is ready.
 *
 * @param {object} opts
 * @param {mongoose.Types.ObjectId} opts.recordId
 * @param {string}  opts.fileBase64
 * @param {string}  opts.uploadType  "xray" | "pdf"
 * @param {string}  opts.mimeType
 * @param {string}  opts.filename
 * @param {mongoose.Types.ObjectId} opts.appointmentId
 * @param {mongoose.Types.ObjectId} opts.queryMessageId
 * @param {mongoose.Types.ObjectId} opts.doctorProfileId  — DoctorProfile._id
 */
function startChatImageBackground(opts) {
  _runChatImageBackground(opts).catch(() => {});
}

async function _runChatImageBackground({
  recordId, fileBase64, uploadType, mimeType, filename,
  appointmentId, queryMessageId, doctorProfileId,
}) {
  const log = logger.child({ record_id: recordId.toString(), source: "chat", upload_type: uploadType });

  // Lazy requires to avoid circular deps at module load time
  const Appointment          = require("../models/Appointment");
  const DoctorProfile        = require("../models/DoctorProfile");
  const { notifyUser }       = require("./notificationService");

  try {
    // 1. Upload file to Cloudinary
    let cloudinaryUrl = null;
    try {
      const cloudinaryType = uploadType === "pdf" ? "raw" : "image";
      const dataUri        = `data:${mimeType || "application/octet-stream"};base64,${fileBase64}`;
      const up = await cloudinary.uploader.upload(dataUri, {
        resource_type: cloudinaryType,
        folder:        "curesense/chat_images",
        public_id:     recordId.toString(),
        type:          "authenticated",
      });
      cloudinaryUrl = up.secure_url;
      await ImageUpload.findByIdAndUpdate(recordId, { storage_url: cloudinaryUrl });
    } catch (err) {
      log.warn({ err: err?.message }, "Cloudinary upload failed for chat image — continuing without file storage");
    }

    // 2. Update the query message with the Cloudinary URL as soon as it's ready
    //    so the doctor can see the image even while analysis is still running
    if (cloudinaryUrl) {
      await Appointment.updateOne(
        { _id: appointmentId, "queries._id": queryMessageId },
        { $set: { "queries.$.attachment_url": cloudinaryUrl } }
      );
    }

    // 3. Run AI analysis
    const result = uploadType === "pdf"
      ? await _analyzePdf(fileBase64, filename, log)
      : await _analyzeMedgemma(fileBase64, "xray", log);

    // 4. Persist analysis to ImageUpload
    const finalImageStatus = result.status === "complete" ? "complete" : result.status;
    await ImageUpload.findOneAndUpdate(
      { _id: recordId, status: "processing" },
      { $set: {
        status:           finalImageStatus,
        model_used:       result.model_used,
        analysis_result:  result.analysis_result,
        flagged_abnormal: result.analysis_result?.flagged_abnormal ?? false,
        error_message:    result.error_message || "",
      }}
    );

    // 5. Update query message with analysis result
    const attachmentStatus = result.status === "complete" ? "analyzed" : "failed";
    await Appointment.updateOne(
      { _id: appointmentId, "queries._id": queryMessageId },
      { $set: {
        "queries.$.ai_analysis":       result.analysis_result,
        "queries.$.attachment_status": attachmentStatus,
      }}
    );

    // 6. Notify the doctor
    if (doctorProfileId) {
      const profile = await DoctorProfile.findById(doctorProfileId).select("user_id");
      if (profile?.user_id) {
        await notifyUser(profile.user_id, {
          title: "Patient sent a medical image",
          body:  attachmentStatus === "analyzed"
            ? "AI analysis is ready to review"
            : "Image received — AI analysis unavailable",
          data: { appointment_id: appointmentId.toString() },
        });
      }
    }

    log.info({ attachmentStatus }, "Chat image analysis complete");
  } catch (err) {
    log.error({ err: err?.message }, "Unexpected error in chat image background job");

    await ImageUpload.findOneAndUpdate(
      { _id: recordId, status: "processing" },
      { status: "error", error_message: "Analysis failed. Please try again." }
    ).catch(() => {});

    await Appointment.updateOne(
      { _id: appointmentId, "queries._id": queryMessageId },
      { $set: { "queries.$.attachment_status": "failed" } }
    ).catch(() => {});
  }
}

module.exports = {
  uploadImage, listImages, listPatientImages, getImageStatus, deleteImage,
  uploadForSession,
  createChatImageRecord, startChatImageBackground,
};
