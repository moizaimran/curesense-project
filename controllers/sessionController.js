const asyncHandler     = require("../utils/asyncHandler");
const { AppError }     = require("../utils/errors");
const sessionService   = require("../services/sessionService");

const createSession = asyncHandler(async (req, res) => {
  const session = await sessionService.createSession(req.user);
  res.status(201).json(session);
});

// processTurn keeps a manual try/catch to distinguish AI service errors
// (err.response) from guard failures (AppError) and unexpected errors.
const processTurn = async (req, res) => {
  try {
    const data = await sessionService.processTurn(req.params.id, req.body, req.user);
    res.json(data);
  } catch (err) {
    if (err instanceof AppError) {
      // Guard failures: 404 session, 403 ownership, 409 ended, 410 expired, 400 input
      const body = { error: err.message };
      if (err.session_id) body.session_id = err.session_id;
      return res.status(err.statusCode).json(body);
    }
    if (err.response) {
      req.log.error(
        { req_id: req.id, session_id: req.params.id, ai_status: err.response.status },
        "AI service returned an error response"
      );
      return res.status(502).json({ error: "AI service error", detail: err.response.data });
    }
    req.log.error({ err, req_id: req.id, session_id: req.params.id }, "Unexpected error in processTurn");
    res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
};

const transcribeAudio = asyncHandler(async (req, res) => {
  const result = await sessionService.transcribeAudio(req.params.id, req.body, req.user);
  res.json(result);
});

const getSession = asyncHandler(async (req, res) => {
  const session = await sessionService.getSession(req.params.id, req.user);
  res.json(session);
});

const getSessionsForPatient = asyncHandler(async (req, res) => {
  const sessions = await sessionService.getSessionsForPatient(req.params.patientId, req.user);
  res.json(sessions);
});

const getLatestSession = asyncHandler(async (req, res) => {
  const session = await sessionService.getLatestSession(req.params.patientId, req.user);
  res.json(session);
});

const softDeleteSession = asyncHandler(async (req, res) => {
  const result = await sessionService.softDeleteSession(req.params.id, req.user);
  res.json(result);
});

module.exports = { createSession, processTurn, transcribeAudio, getSession, getSessionsForPatient, getLatestSession, softDeleteSession };
