// =============================================================================
// Backend/routes/statsRoutes.js — admin analytics, mounted at /api/stats
// Every endpoint takes an optional ?doctor_id= to narrow to one doctor.
// =============================================================================
const express      = require("express");
const router       = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const { protect, authorize } = require("../middleware/auth");
const adminStats   = require("../services/adminStatsService");
const stats        = require("../services/statsService");

router.use(protect, authorize("admin"));

// KPI tiles: doctors, patients, appointments, revenue, pending verifications, rating
router.get("/summary", asyncHandler(async (req, res) => {
  res.json(await adminStats.summary({ doctorId: req.query.doctor_id }));
}));

// Patients treated per day / week / month (same shape as the doctor dashboard)
router.get("/treated", asyncHandler(async (req, res) => {
  const doctorId = await adminStats.resolveDoctor(req.query.doctor_id);
  res.json(await stats.patientsTreated({ doctorId, period: req.query.period }));
}));

// Case status donut + this month vs last month
router.get("/overview", asyncHandler(async (req, res) => {
  const doctorId = await adminStats.resolveDoctor(req.query.doctor_id);
  res.json(await stats.caseOverview({ doctorId }));
}));

// Per-doctor ratings / workload / revenue table + top performers
router.get("/doctors", asyncHandler(async (req, res) => {
  res.json(await adminStats.doctorTable());
}));

// Reports & analytics page: AI consultations, conditions, referrals, trends
router.get("/reports", asyncHandler(async (req, res) => {
  res.json(await adminStats.reportsAnalytics({ range: req.query.range || "90d" }));
}));

module.exports = router;
