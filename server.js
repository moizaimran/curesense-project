// =============================================================================
// Backend/server.js — entry point
//
// Responsibility: load env, connect DB, then start listening.
// All route/middleware setup lives in app.js so tests can reuse the same app
// against an in-memory MongoDB without starting a real server.
// =============================================================================
require("dotenv").config();
const connectDB = require("./config/db");
const app       = require("./app");

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`[Express] Server running on port ${PORT}`));
});
