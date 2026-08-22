// =============================================================================
// Backend/routes/appointmentRoutes.js
// =============================================================================
const express = require("express");
const router  = express.Router();
const {
  createAppointment,
  getAppointmentById,
  getDoctorAppointments,
  adminGetAppointments,
  adminReviewAppointment,
  getPatientAppointmentHistory,
  addQuery,
  markQueriesRead,
  submitFeedback,
  completeAppointment,
  cancelAppointment,
} = require("../controllers/appointmentController");
const { protect, authorize }   = require("../middleware/auth");
const { writeLimiter }         = require("../middleware/rateLimiter");
const { validateObjectId }     = require("../middleware/validate");

// ── Patient routes ────────────────────────────────────────────────────────────
// Creating an appointment is write-heavy (triggers admin queue + assignment upsert)
router.post("/", protect, authorize("patient"), writeLimiter, createAppointment);

// ── Doctor routes ─────────────────────────────────────────────────────────────
router.get("/doctor", protect, authorize("doctor"), getDoctorAppointments);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get("/admin",              protect, authorize("admin"), adminGetAppointments);
router.patch("/admin/:id/review", protect, authorize("admin"), validateObjectId("id"), adminReviewAppointment);

// ── Patient history — patient (own), doctor (active assignment), or admin ─────
router.get("/patient/:id/history", protect, authorize("patient", "doctor", "admin"), validateObjectId("id"), getPatientAppointmentHistory);

// ── Single appointment by ID ──────────────────────────────────────────────────
router.get("/:id", protect, authorize("patient", "doctor", "admin"), validateObjectId("id"), getAppointmentById);

// ── Per-appointment actions ───────────────────────────────────────────────────
// IMPORTANT: static sub-paths before parameterised /:id

// Query thread — rate-limited because each patient query could trigger a doctor notification
router.post("/:id/queries",       protect, authorize("patient", "doctor"), writeLimiter, validateObjectId("id"), addQuery);
router.patch("/:id/queries/read", protect, authorize("doctor"),                          validateObjectId("id"), markQueriesRead);
router.post("/:id/feedback",      protect, authorize("doctor"),                          validateObjectId("id"), submitFeedback);
router.post("/:id/complete",      protect, authorize("doctor"),                          validateObjectId("id"), completeAppointment);
router.post("/:id/cancel",        protect, authorize("patient"),                         validateObjectId("id"), cancelAppointment);

module.exports = router;
