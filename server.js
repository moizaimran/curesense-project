// =============================================================================
// Backend/server.js — CureSense Express API
//
// Responsibility: receive requests from the React frontend, call the Flask/Ngrok
// AI microservice when needed, and persist all results to MongoDB Atlas.
// The AI notebook never writes to the database — it only returns JSON.
// =============================================================================
require("dotenv").config();
const express       = require("express");
const cors          = require("cors");
const connectDB     = require("./config/db");
const authRoutes    = require("./routes/authRoutes");
const patientRoutes = require("./routes/patientRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const reportRoutes  = require("./routes/reportRoutes");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "20mb" }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/reports",  reportRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── Centralized error handler (must be last) ──────────────────────────────────
// asyncHandler in controllers forwards errors here via next(err).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => console.log(`[Express] Server running on port ${PORT}`));
});
