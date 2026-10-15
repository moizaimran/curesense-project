// =============================================================================
// Backend/server.js — entry point
//
// Responsibility: load env, connect DB, then start listening.
// All route/middleware setup lives in app.js so tests can reuse the same app
// against an in-memory MongoDB without starting a real server.
// =============================================================================
require("dotenv").config();
require("./config/firebase");   // initialise Firebase Admin before anything else imports it
const connectDB = require("./config/db");
const app       = require("./app");
const logger    = require("./utils/logger");
const { abandonInactiveSessions } = require("./services/sessionService");

const PORT = process.env.PORT || 5000;
const ABANDON_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

async function runAbandonCheck() {
  try {
    const count = await abandonInactiveSessions();
    if (count) logger.info({ count }, "Marked idle interview sessions as abandoned");
  } catch (err) {
    logger.error({ err }, "Abandoned-session check failed");
  }
}

connectDB().then(() => {
  app.listen(PORT, () => console.log(`[Express] Server running on port ${PORT}`));
  runAbandonCheck();
  setInterval(runAbandonCheck, ABANDON_CHECK_INTERVAL_MS);
});
