// =============================================================================
// Backend/controllers/reportController.js
// =============================================================================
const Report             = require("../models/Report");
const asyncHandler       = require("../utils/asyncHandler");
const { canAccessPatient } = require("../middleware/auth");

// GET /api/reports/:id
const getReport = asyncHandler(async (req, res) => {
  const report = await Report.findOne({ _id: req.params.id, is_deleted: { $ne: true } });
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (!canAccessPatient(req.user, report.patient_id)) {
    return res.status(403).json({ error: "Access denied" });
  }
  res.json(report);
});

// GET /api/reports/patient/:patientId — access checked by authorize in route + canAccessPatient here
const getReportsForPatient = asyncHandler(async (req, res) => {
  if (!canAccessPatient(req.user, req.params.patientId)) {
    return res.status(403).json({ error: "Access denied" });
  }
  const reports = await Report.find({ patient_id: req.params.patientId, is_deleted: { $ne: true } });
  res.json(reports);
});

// GET /api/reports/session/:sessionId
const getReportForSession = asyncHandler(async (req, res) => {
  const report = await Report.findOne({ session_id: req.params.sessionId, is_deleted: { $ne: true } });
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (!canAccessPatient(req.user, report.patient_id)) {
    return res.status(403).json({ error: "Access denied" });
  }
  res.json(report);
});

module.exports = { getReport, getReportsForPatient, getReportForSession };
