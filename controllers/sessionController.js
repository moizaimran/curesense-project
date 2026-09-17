// =============================================================================
// Backend/controllers/sessionController.js
//
// POST /api/sessions          — create an empty in_progress session
// POST /api/sessions/:id/turn — process one interview turn
//   · checks 48-hour activity window (marks abandoned if expired)
//   · uploads voice to Cloudinary if present
//   · calls Flask /interview/turn, saves the exchange to the session
//   · on status:"complete" calls Flask /pipeline/finalize, saves the report
// =============================================================================
const axios              = require("axios");
const cloudinary         = require("../config/cloudinary");
const Session            = require("../models/Session");
const Report             = require("../models/Report");

const asyncHandler       = require("../utils/asyncHandler");
const { canAccessPatient } = require("../middleware/auth");

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

const ABANDONED_AFTER_HOURS = 48;

// ── POST /api/sessions ────────────────────────────────────────────────────────
// patient_id is taken from the JWT — a patient can only create sessions for themselves
const createSession = asyncHandler(async (req, res) => {
  const patient_id = req.user.patient_id;
  if (!patient_id) return res.status(400).json({ error: "No patient profile linked to this account" });
  const session = await Session.create({ patient_id });
  res.status(201).json(session);
});

// ── POST /api/sessions/:id/turn ───────────────────────────────────────────────
const processTurn = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Ensure the patient can only interact with their own sessions
    if (session.patient_id.toString() !== req.user.patient_id?.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    // ── Guard: session already ended ─────────────────────────────────────────
    if (["completed", "failed"].includes(session.status)) {
      return res.status(409).json({ error: "Session has already ended. Start a new session." });
    }
    if (session.status === "abandoned") {
      return res.status(409).json({ error: "Session was abandoned due to inactivity. Start a new session." });
    }

    // ── Guard: 48-hour inactivity window ─────────────────────────────────────
    const hoursSinceLast = (Date.now() - session.last_activity_at.getTime()) / 36e5;
    if (hoursSinceLast > ABANDONED_AFTER_HOURS) {
      session.status = "abandoned";
      await session.save();
      return res.status(410).json({
        error: "Session expired — no activity for over 48 hours. Please start a new session.",
        session_id: session._id,
      });
    }

    // ── Resolve input: text (+ optional pre-uploaded voice URL) or raw audio ──
    // Primary path: patient_text + optional voice_message_url (set by /transcribe)
    // Legacy  path: patient_audio_base64 (upload + transcribe happens inside Flask)
    const { patient_text, patient_audio_base64, mime_type, voice_message_url: clientVoiceUrl } = req.body;

    const TEXT_MAX_CHARS = 2000;

    let voice_message_url = clientVoiceUrl || null;
    let patient_audio_url = null;

    if (patient_audio_base64) {
      // Legacy: audio bytes sent directly — upload here then Flask transcribes
      const uploadResult = await cloudinary.uploader.upload(
        `data:${mime_type || "audio/m4a"};base64,${patient_audio_base64}`,
        { resource_type: "video" }
      );
      voice_message_url = uploadResult.secure_url;
      patient_audio_url = voice_message_url;
    } else if (!patient_text) {
      return res.status(400).json({ error: "patient_text or patient_audio_base64 is required" });
    } else if (patient_text.length > TEXT_MAX_CHARS) {
      return res.status(400).json({ error: `patient_text must be ${TEXT_MAX_CHARS} characters or fewer` });
    }

    // ── Build history from stored transcript for Flask ────────────────────────
    // Express tracks live turns; Flask prepends system prompt + few-shots on its side.
    const history = session.transcript.flatMap((t) => [
      { role: "user",      content: t.patient_corrected },
      { role: "assistant", content: t.assistant_message },
    ]);

    // ── Call Flask /interview/turn ────────────────────────────────────────────
    const turnPayload = {
      turn_number: session.turn_count + 1,
      history,
      ...(patient_audio_url ? { patient_audio_url } : { patient_text }),
    };

    const aiResp = await callAI(
      `${process.env.AI_SERVICE_URL}/interview/turn`,
      turnPayload,
      60_000
    );
    const { status, message, correctedPatientText, rawPatientText, questionType, options, sessionName } = aiResp.data;

    // ── Save turn (pair) to session ───────────────────────────────────────────
    session.transcript.push({
  turn_number:       session.turn_count + 1,
  patient_raw:       rawPatientText,
  patient_corrected: correctedPatientText,
  assistant_message: message,
  voice_message_url: voice_message_url,
  question_type:     questionType ?? "text",
  question_options:  options ?? [],
});
    session.turn_count += 1;
    // last_activity_at is also refreshed by the pre-save hook on transcript change

    // ── On completion: finalize pipeline, save report ─────────────────────────
    if (status === "complete") {
      const fullTranscript = session.transcript
        .map((t) => t.patient_corrected)
        .join(" ");

      const finalizeResp = await callAI(
        `${process.env.AI_SERVICE_URL}/pipeline/finalize`,
        { full_transcript_text: fullTranscript },
        120_000
      );
      const result = finalizeResp.data;

      session.status       = "completed";
      session.completed_at = new Date();
      if (result.sessionName) session.session_name = result.sessionName;
      await session.save();

      const report = await Report.create({
        session_id:       session._id,
        patient_id:       session.patient_id,
        generated_at:     new Date(),
        rag_query:        result.ragQuery         || "",
        diagnostic_query: result.diagnosticQuery  || "",
        entities:         result.verifiedEntities || [],
        disease_ranking:  result.rankedDiseases   || [],
        retrieved_chunks: result.retrievedSources || [],
        openfda_results:  result.medicationInfo   || {},
        doctor_report:         result.doctorReport         || {},
        patient_summary:       result.patientSummary       || {},
        interpreted_diagnoses: result.interpretedDiagnoses || [],
      });

      return res.json({ status: "complete", message, correctedPatientText, questionType: questionType ?? "text", options: options ?? [], report_id: report._id });
    }

    await session.save();
    return res.json({ status, message, correctedPatientText, questionType: questionType ?? "text", options: options ?? [] });

  } catch (err) {
    if (err.response) {
      // AI service returned an HTTP error — log status and body, never the patient transcript
      req.log.error(
        { req_id: req.id, session_id: req.params.id, ai_status: err.response.status },
        "AI service returned an error response"
      );
      return res.status(502).json({ error: "AI service error", detail: err.response.data });
    }
    // Unexpected error — log with full context, return generic message to client
    req.log.error({ err, req_id: req.id, session_id: req.params.id }, "Unexpected error in processTurn");
    res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
};

// ── GET /api/sessions/:id ─────────────────────────────────────────────────────
const getSession = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session || session.is_deleted) return res.status(404).json({ error: "Session not found" });
  if (!(await canAccessPatient(req.user, session.patient_id))) {
    return res.status(403).json({ error: "Access denied" });
  }
  res.json(session);
});

// ── GET /api/sessions/patient/:patientId ──────────────────────────────────────
const getSessionsForPatient = asyncHandler(async (req, res) => {
  if (!(await canAccessPatient(req.user, req.params.patientId))) {
    return res.status(403).json({ error: "Access denied" });
  }
  const sessions = await Session.find({ patient_id: req.params.patientId, is_deleted: { $ne: true } })
    .sort({ last_activity_at: -1 });
  res.json(sessions);
});

// ── GET /api/sessions/patient/:patientId/latest ───────────────────────────────
const getLatestSession = asyncHandler(async (req, res) => {
  if (!(await canAccessPatient(req.user, req.params.patientId))) {
    return res.status(403).json({ error: "Access denied" });
  }
  const session = await Session.findOne({
    patient_id: req.params.patientId,
    is_deleted: { $ne: true },
  }).sort({ started_at: -1 });
  res.json(session ?? null);
});

// ── PATCH /api/sessions/:id/delete  (soft delete) ────────────────────────────
const softDeleteSession = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session || session.is_deleted) return res.status(404).json({ error: "Session not found" });
  if (!(await canAccessPatient(req.user, session.patient_id))) {
    return res.status(403).json({ error: "Access denied" });
  }
  session.is_deleted = true;
  await session.save();
  // Cascade soft-delete to the associated report
  await Report.updateOne({ session_id: session._id }, { is_deleted: true });
  res.json({ message: "Session removed successfully" });
});

// ── POST /api/sessions/:id/transcribe ────────────────────────────────────────
// Upload audio to Cloudinary, run Whisper, return transcribed text + audio URL.
// Does NOT advance the session turn — user reviews the text and sends it manually.
const transcribeAudio = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  if (session.patient_id.toString() !== req.user.patient_id?.toString()) {
    return res.status(403).json({ error: "Access denied" });
  }
  if (["completed", "failed", "abandoned"].includes(session.status)) {
    return res.status(409).json({ error: "Session has already ended." });
  }

  const { patient_audio_base64, mime_type } = req.body;
  if (!patient_audio_base64) {
    return res.status(400).json({ error: "patient_audio_base64 is required" });
  }

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

  return res.json({
    transcribedText: aiResp.data.transcribed_text,
    audioUrl,
  });
});

module.exports = { createSession, processTurn, transcribeAudio, getSession, getSessionsForPatient, getLatestSession, softDeleteSession };
