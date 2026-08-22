// =============================================================================
// Backend/app.js — Express app setup (no DB connection, no listen)
//
// Exported so server.js and test files can both use the same configured app.
// server.js is responsible for calling connectDB() and app.listen().
// Test files connect to an in-memory MongoDB before importing this file.
// =============================================================================
const express        = require("express");
const cors           = require("cors");
const requestLogger  = require("./middleware/requestLogger");

const authRoutes        = require("./routes/authRoutes");
const patientRoutes     = require("./routes/patientRoutes");
const sessionRoutes     = require("./routes/sessionRoutes");
const reportRoutes      = require("./routes/reportRoutes");
const imageRoutes       = require("./routes/imageRoutes");
const doctorRoutes      = require("./routes/doctorRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");

const app = express();

// ── Global middleware ─────────────────────────────────────────────────────────
app.disable("x-powered-by");       // don't advertise Express version to attackers
app.use(requestLogger);             // structured request logging + req.id + req.log
app.use(cors());
app.use(express.json({ limit: "200mb" }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",         authRoutes);
app.use("/api/patients",     patientRoutes);
app.use("/api/sessions",     sessionRoutes);
app.use("/api/reports",      reportRoutes);
app.use("/api/images",       imageRoutes);
app.use("/api/doctors",      doctorRoutes);
app.use("/api/appointments", appointmentRoutes);

app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── Global error handler ──────────────────────────────────────────────────────
// This catches anything thrown by asyncHandler (or next(err) calls).
// Rules:
//   1. Log the full error server-side (stack, request ID, relevant IDs from params).
//   2. Return a clean, sanitized message to the client — never raw Mongoose internals.
//
// Mongoose errors we sanitize:
//   CastError     — invalid ObjectId passed as a route param; 400, never show path/model.
//   ValidationError — schema constraint failure; 400 with field messages only.
//   duplicate key  — unique index violation; 409, no internal index name.
//
// All other errors: if the error carries an explicit HTTP status code we threw
// ourselves, trust its message; otherwise collapse to a generic 500.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Log with full context. req.log is the request-scoped pino child logger;
  // it includes req.id automatically. Fall back to console if somehow missing.
  const log = req.log || console;
  log.error(
    {
      err:            { message: err.message, stack: err.stack, code: err.code, name: err.name },
      req_id:         req.id,
      // Relevant business IDs — never log PHI or auth tokens
      appointment_id: req.params.id    || req.body?.appointment_id || null,
      patient_id:     req.params.patientId || req.body?.patient_id || null,
      doctor_id:      req.params.id    || req.body?.doctor_profile_id || null,
      session_id:     req.params.id    || null,
    },
    "Unhandled request error"
  );

  // ── Mongoose CastError — malformed ObjectId ─────────────────────────────
  if (err.name === "CastError") {
    return res.status(400).json({ error: "Invalid ID format" });
  }

  // ── Mongoose ValidationError — schema constraint failure ─────────────────
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message).join(", ");
    return res.status(400).json({ error: `Validation failed: ${messages}` });
  }

  // ── MongoDB duplicate-key (unique index) ──────────────────────────────────
  if (err.code === 11000) {
    return res.status(409).json({ error: "A record with that value already exists" });
  }

  // ── Application errors we threw ourselves ────────────────────────────────
  // These carry an explicit status code and a client-safe message.
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  // ── Unexpected / unhandled — generic 500 ─────────────────────────────────
  // Never leak stack traces or internal error messages to the client.
  res.status(500).json({ error: "An unexpected error occurred. Please try again." });
});

module.exports = app;
