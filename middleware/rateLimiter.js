// =============================================================================
// Backend/middleware/rateLimiter.js
//
// Two limiters, both keyed by IP and both silently skipped in the test env
// so the Jest suite never trips them.
//
// authLimiter   — login and registration endpoints
//                 20 attempts / 15 min / IP
//                 Stricter because credential-stuffing starts here.
//
// writeLimiter  — appointment creation, query append, image upload,
//                 session creation and turn processing
//                 60 requests / 15 min / IP
//                 Loose enough for normal use, tight enough to cap AI spend.
// =============================================================================
const rateLimit = require("express-rate-limit");

const isTest = process.env.NODE_ENV === "test";

const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 min
  max:              20,
  standardHeaders:  true,            // Return RateLimit-* headers
  legacyHeaders:    false,
  message:          { error: "Too many requests — please try again in 15 minutes." },
  skip:             () => isTest,
});

const writeLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              60,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: "Too many requests — please slow down and try again shortly." },
  skip:             () => isTest,
});

module.exports = { authLimiter, writeLimiter };
