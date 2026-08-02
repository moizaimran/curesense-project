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
const patientRoutes = require("./routes/patientRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const reportRoutes  = require("./routes/reportRoutes");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/patients", patientRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/reports",  reportRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── Start ─────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => console.log(`[Express] Server running on port ${PORT}`));
});
