// =============================================================================
// Backend/middleware/requestLogger.js
//
// Wraps pino-http to produce one structured log line per request, containing:
//   req_id   — UUID correlation ID, taken from X-Request-ID header if sent,
//              otherwise auto-generated. Propagated to all req.log calls so a
//              single request can be traced across async operations.
//   method, url — what was called
//   status_code, response_time — what happened
//   user_id, role — who called it (populated after protect middleware runs,
//                   captured at response-emit time via customProps)
//
// What is deliberately NOT logged:
//   req.body           — can contain passwords and patient medical data
//   res.body           — can contain PHI
//   Authorization header — contains the raw JWT token
//   patient_audio_base64, file_base64 — raw file content
// =============================================================================
const pinoHttp = require("pino-http");
const { randomUUID } = require("crypto");
const logger = require("../utils/logger");

const requestLogger = pinoHttp({
  logger,

  // Honour an upstream X-Request-ID header; otherwise mint a fresh UUID.
  genReqId: (req) => req.headers["x-request-id"] || randomUUID(),

  // Capture authenticated user context at response time (after protect runs).
  customProps: (req) => ({
    user_id: req.user?._id?.toString() || null,
    role:    req.user?.role            || null,
  }),

  // Deliberately minimal — never include headers or body.
  serializers: {
    req(req) {
      return { id: req.id, method: req.method, url: req.url };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },

  // Quiet the noisy health-check probes
  autoLogging: {
    ignore: (req) => req.url === "/health",
  },
});

module.exports = requestLogger;
