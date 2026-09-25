const axios            = require("axios");
const cloudinary       = require("../config/cloudinary");
const { AppError }     = require("../utils/errors");
const { canAccessPatient } = require("../middleware/auth");
const Session          = require("../models/Session");
const Report           = require("../models/Report");
const Patient          = require("../models/Patient");

const ABANDONED_AFTER_HOURS = 48;

// One automatic retry on network-level failures (Ngrok hiccups).
// Does NOT retry HTTP errors from Flask — those are logic errors, not transient.
async function callAI(url, payload, timeout) {
  try {
    return await axios.post(url, payload, { timeout });
  } catch (err) {
    if (err.response) throw err;
    await new Promise(r => setTimeout(r, 2000));
    return await axios.post(url, payload, { timeout });
  }
}

// ── POST /api/sessions ────────────────────────────────────────────────────────

async function createSession(user) {
  const patient_id = user.patient_id;
  if (!patient_id) throw new AppError("No patient profile linked to this account", 400);
  return Session.create({ patient_id });
}

// ── POST /api/sessions/:id/turn ───────────────────────────────────────────────
// Returns response data on success.
// Throws AppError for guard failures, re-throws axios errors for AI failures,
// re-throws unexpected errors — all handled in the controller's try/catch.

async function processTurn(sessionId, body, user) {
  const session = await Session.findById(sessionId);
  if (!session) throw new AppError("Session not found", 404);

  if (session.patient_id.toString() !== user.patient_id?.toString())
    throw new AppError("Access denied", 403);

  if (["completed", "failed"].includes(session.status))
    throw new AppError("Session has already ended. Start a new session.", 409);
  if (session.status === "abandoned")
    throw new AppError("Session was abandoned due to inactivity. Start a new session.", 409);

  const hoursSinceLast = (Date.now() - session.last_activity_at.getTime()) / 36e5;
  if (hoursSinceLast > ABANDONED_AFTER_HOURS) {
    session.status = "abandoned";
    await session.save();
    const err    = new AppError("Session expired — no activity for over 48 hours. Please start a new session.", 410);
    err.session_id = session._id;
    throw err;
  }

  const { patient_text, patient_audio_base64, mime_type, voice_message_url: clientVoiceUrl } = body;
  const TEXT_MAX_CHARS = 2000;

  let voice_message_url = clientVoiceUrl || null;
  let patient_audio_url = null;

  if (patient_audio_base64) {
    const uploadResult = await cloudinary.uploader.upload(
      `data:${mime_type || "audio/m4a"};base64,${patient_audio_base64}`,
      { resource_type: "video" }
    );
    voice_message_url = uploadResult.secure_url;
    patient_audio_url = voice_message_url;
  } else if (!patient_text) {
    throw new AppError("patient_text or patient_audio_base64 is required", 400);
  } else if (patient_text.length > TEXT_MAX_CHARS) {
    throw new AppError(`patient_text must be ${TEXT_MAX_CHARS} characters or fewer`, 400);
  }

  const history = session.transcript.flatMap((t) => [
    { role: "user",      content: t.patient_corrected },
    { role: "assistant", content: t.assistant_message },
  ]);

  const turnPayload = {
    turn_number: session.turn_count + 1,
    history,
    ...(patient_audio_url ? { patient_audio_url } : { patient_text }),
  };

  // Throws axios error if Flask call fails — controller handles those separately
  const aiResp = await callAI(
    `${process.env.AI_SERVICE_URL}/interview/turn`,
    turnPayload,
    60_000
  );
  const { status, message, correctedPatientText, rawPatientText, questionType, options } = aiResp.data;

  session.transcript.push({
    turn_number:       session.turn_count + 1,
    patient_raw:       rawPatientText,
    patient_corrected: correctedPatientText,
    assistant_message: message,
    voice_message_url,
    question_type:     questionType ?? "text",
    question_options:  options      ?? [],
  });
  session.turn_count += 1;

  if (status === "complete") {
    const fullTranscript = session.transcript.map((t) => t.patient_corrected).join(" ");

    let profileMedications = [];
    try {
      const patient = await Patient.findById(session.patient_id).select("current_medications").lean();
      if (patient) profileMedications = patient.current_medications || [];
    } catch (_) { /* non-critical */ }

    const finalizeResp = await callAI(
      `${process.env.AI_SERVICE_URL}/pipeline/finalize`,
      { full_transcript_text: fullTranscript, profile_medications: profileMedications },
      120_000
    );
    const result = finalizeResp.data;

    session.status       = "completed";
    session.completed_at = new Date();
    if (result.sessionName) session.session_name = result.sessionName;
    await session.save();

    const report = await Report.create({
      session_id:            session._id,
      patient_id:            session.patient_id,
      generated_at:          new Date(),
      rag_query:             result.ragQuery         || "",
      diagnostic_query:      result.diagnosticQuery  || "",
      entities:              result.verifiedEntities || [],
      disease_ranking:       result.rankedDiseases   || [],
      retrieved_chunks:      result.retrievedSources || [],
      openfda_results:       result.medicationInfo   || {},
      doctor_report:         result.doctorReport         || {},
      patient_summary:       result.patientSummary       || {},
      interpreted_diagnoses: result.interpretedDiagnoses || [],
      emergency_warning:     result.emergencyWarning      || {},
    });

    return {
      status: "complete", message, correctedPatientText,
      questionType: questionType ?? "text", options: options ?? [],
      report_id: report._id,
    };
  }

  await session.save();
  return { status, message, correctedPatientText, questionType: questionType ?? "text", options: options ?? [] };
}

// ── POST /api/sessions/:id/transcribe ────────────────────────────────────────

async function transcribeAudio(sessionId, body, user) {
  const session = await Session.findById(sessionId);
  if (!session) throw new AppError("Session not found", 404);

  if (session.patient_id.toString() !== user.patient_id?.toString())
    throw new AppError("Access denied", 403);
  if (["completed", "failed", "abandoned"].includes(session.status))
    throw new AppError("Session has already ended.", 409);

  const { patient_audio_base64, mime_type } = body;
  if (!patient_audio_base64) throw new AppError("patient_audio_base64 is required", 400);

  const uploadResult = await cloudinary.uploader.upload(
    `data:${mime_type || "audio/m4a"};base64,${patient_audio_base64}`,
    { resource_type: "video" }
  );
  const audioUrl = uploadResult.secure_url;

  const aiResp = await callAI(
    `${process.env.AI_SERVICE_URL}/audio/transcribe`,
    { audio_url: audioUrl },
    60_000
  );

  return { transcribedText: aiResp.data.transcribed_text, audioUrl };
}

// ── GET /api/sessions/:id ─────────────────────────────────────────────────────

async function getSession(sessionId, user) {
  const session = await Session.findById(sessionId);
  if (!session || session.is_deleted) throw new AppError("Session not found", 404);
  if (!(await canAccessPatient(user, session.patient_id))) throw new AppError("Access denied", 403);
  return session;
}

// ── GET /api/sessions/patient/:patientId ─────────────────────────────────────

async function getSessionsForPatient(patientId, user) {
  if (!(await canAccessPatient(user, patientId))) throw new AppError("Access denied", 403);
  return Session.find({ patient_id: patientId, is_deleted: { $ne: true } }).sort({ last_activity_at: -1 });
}

// ── GET /api/sessions/patient/:patientId/latest ───────────────────────────────

async function getLatestSession(patientId, user) {
  if (!(await canAccessPatient(user, patientId))) throw new AppError("Access denied", 403);
  return Session.findOne({ patient_id: patientId, is_deleted: { $ne: true } }).sort({ started_at: -1 }) ?? null;
}

// ── PATCH /api/sessions/:id/delete ───────────────────────────────────────────

async function softDeleteSession(sessionId, user) {
  const session = await Session.findById(sessionId);
  if (!session || session.is_deleted) throw new AppError("Session not found", 404);
  if (!(await canAccessPatient(user, session.patient_id))) throw new AppError("Access denied", 403);
  session.is_deleted = true;
  await session.save();
  await Report.updateOne({ session_id: session._id }, { is_deleted: true });
  return { message: "Session removed successfully" };
}

module.exports = {
  callAI,
  createSession,
  processTurn,
  transcribeAudio,
  getSession,
  getSessionsForPatient,
  getLatestSession,
  softDeleteSession,
};
