// =============================================================================
// Backend/controllers/reportController.js
// =============================================================================
const Report       = require("../models/Report");
const asyncHandler = require("../utils/asyncHandler");

// GET /api/reports/:id
const getReport = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  res.json(report);
});

// GET /api/reports/patient/:patientId — all reports for a patient
const getReportsForPatient = asyncHandler(async (req, res) => {
  const reports = await Report.find({ patient_id: req.params.patientId });
  res.json(reports);
});

// GET /api/reports/session/:sessionId
const getReportForSession = asyncHandler(async (req, res) => {
  const report = await Report.findOne({ session_id: req.params.sessionId });
  if (!report) return res.status(404).json({ error: "Report not found" });
  res.json(report);
});

module.exports = { getReport, getReportsForPatient, getReportForSession };
