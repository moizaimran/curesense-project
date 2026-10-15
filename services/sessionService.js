const axios            = require("axios");
const cloudinary       = require("../config/cloudinary");
const { AppError }     = require("../utils/errors");
const { canAccessPatient } = require("../middleware/auth");
const Session          = require("../models/Session");
const Report           = require("../models/Report");
const Patient          = require("../models/Patient");
const { SPECIALTIES }  = require("../constants/specialties");

const ABANDONED_AFTER_HOURS = 48;

// One automatic retry on network-level failures (Ngrok hiccups).
// Does NOT retry HTTP errors from Flask — those are logic errors, not transient.
// Does NOT retry timeouts either — Flask may still be working, and a retry would run the whole job again.
async function callAI(url, payload, timeout) {
  try {
    return await axios.post(url, payload, { timeout });
  } catch (err) {
    if (err.response) throw err;
    if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") throw err;
    await new Promise(r => setTimeout(r, 2000));
    return await axios.post(url, payload, { timeout });
  }
}

// Voice links are rendered in the doctor's browser, so only accept https links
// to this project's own Cloudinary account (as returned by /transcribe).
function isOwnCloudinaryUrl(value) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName || typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "res.cloudinary.com"
      && url.pathname.startsWith(`/${cloudName}/`);
  } catch {
    return false;
  }
}

// ── Background: abandon idle sessions ─────────────────────────────────────────
// Marks every in-progress session with no activity for ABANDONED_AFTER_HOURS as
// abandoned. Run periodically by server.js. Returns the number of sessions updated.

async function abandonInactiveSessions(now = new Date()) {
  const cutoff = new Date(now.getTime() - ABANDONED_AFTER_HOURS * 36e5);
  const res = await Session.updateMany(
    { status: "in_progress", last_activity_at: { $lt: cutoff } },
    { $set: { status: "abandoned" } }
  );
  return res.modifiedCount;
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

  // Voice answers are transcribed first via /transcribe; the turn always carries text,
  // plus the recording's link when the answer was spoken.
  const { patient_text, voice_message_url: clientVoiceUrl } = body;
  const TEXT_MAX_CHARS = 2000;

  if (!patient_text)
    throw new AppError("patient_text is required", 400);
  if (patient_text.length > TEXT_MAX_CHARS)
    throw new AppError(`patient_text must be ${TEXT_MAX_CHARS} characters or fewer`, 400);
  if (clientVoiceUrl && !isOwnCloudinaryUrl(clientVoiceUrl))
    throw new AppError("voice_message_url must be a recording uploaded through /transcribe", 400);
  const voice_message_url = clientVoiceUrl || null;

  const history = session.transcript.flatMap((t) => [
    { role: "user",      content: t.patient_corrected },
    { role: "assistant", content: t.assistant_message },
  ]);

  const turnPayload = {
    turn_number: session.turn_count + 1,
    history,
    patient_text,
    // The title comes from the first turn's own LLM call (retried on turn 2 if it came back empty)
    request_session_name: !session.session_name && session.turn_count < 2,
  };

  // Throws axios error if Flask call fails — controller handles those separately
  const aiResp = await callAI(
    `${process.env.AI_SERVICE_URL}/interview/turn`,
    turnPayload,
    60_000
  );
  const { status, message, correctedPatientText, questionType, options, sessionName } = aiResp.data;

  if (!session.session_name && sessionName?.trim()) session.session_name = sessionName.trim();

  session.transcript.push({
    turn_number:       session.turn_count + 1,
    patient_raw:       patient_text,   // exactly what the patient sent, before AI correction
    patient_corrected: correctedPatientText,
    assistant_message: message,
    voice_message_url,
    question_type:     questionType ?? "text",
    question_options:  options      ?? [],
  });
  session.turn_count += 1;

  if (status === "complete") {
    const fullTranscript = session.transcript.map((t) => t.patient_corrected).join(" ");

    // Saved profile history — the AI treats it like information the patient reported
    let profile = { medications: [], allergies: [], conditions: [] };
    try {
      const patient = await Patient.findById(session.patient_id)
        .select("current_medications allergies medical_conditions").lean();
      if (patient) {
        profile = {
          medications: patient.current_medications || [],
          allergies:   patient.allergies           || [],
          conditions:  patient.medical_conditions  || [],
        };
      }
    } catch (_) { /* non-critical */ }

    let result;
    let report;
    try {
      const finalizeResp = await callAI(
        `${process.env.AI_SERVICE_URL}/pipeline/finalize`,
        // specialties: the AI must choose the referral specialty from this list
        {
          full_transcript_text: fullTranscript,
          profile_medications:  profile.medications,
          profile_allergies:    profile.allergies,
          profile_conditions:   profile.conditions,
          specialties:          SPECIALTIES,
        },
        180_000   // first report after a Kaggle restart has taken ~120 s (model warm-up)
      );
      result = finalizeResp.data;

      report = await Report.create({
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
    } catch (err) {
      // Interview finished but no report could be produced — keep the final turn and end the session.
      session.status = "failed";
      await session.save();
      err.sessionFailed = true; // lets the controller tell the client this interview has ended
      throw err;
    }

    session.status       = "completed";
    session.completed_at = new Date();
    await session.save();

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
  abandonInactiveSessions,
  callAI,
  createSession,
  processTurn,
  transcribeAudio,
  getSession,
  getSessionsForPatient,
  getLatestSession,
  softDeleteSession,
};
