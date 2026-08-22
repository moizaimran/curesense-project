// =============================================================================
// Backend/utils/logger.js — singleton pino logger
//
// Import this wherever a log call is needed outside of a request context
// (background jobs, startup). Inside request handlers use req.log instead —
// it's a child logger pre-bound with the request ID.
//
// Log levels: error > warn > info > debug
//   error — unhandled exceptions, AI/DB failures
//   warn  — recoverable issues (retry, skip, graceful degrade)
//   info  — request completion, significant state changes
//   debug — development-only verbose detail
//
// Rules (never break these):
//   - Never log req.body — it can contain passwords and patient medical data.
//   - Never log res.body — it can contain PHI.
//   - Never log Authorization headers — they contain the raw JWT token.
//   - Never log patient_audio_base64 or file_base64 — they are raw file data.
// =============================================================================
const pino = require("pino");

const isTest = process.env.NODE_ENV === "test";
const isDev  = !isTest && process.env.NODE_ENV !== "production";

const logger = pino({
  level: isTest
    ? "silent"
    : (process.env.LOG_LEVEL || (isDev ? "debug" : "info")),

  // pino-pretty for human-readable dev output; raw NDJSON for production
  // (ready for Datadog/Splunk/CloudWatch without any additional transform).
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize:      true,
        translateTime: "SYS:standard",
        ignore:        "pid,hostname",
      },
    },
  }),
});

module.exports = logger;
