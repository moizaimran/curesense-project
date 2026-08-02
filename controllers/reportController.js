// =============================================================================
// Backend/controllers/reportController.js
// =============================================================================
const Report = require("../models/Report");

// GET /api/reports/:id
const getReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json(report);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/reports/patient/:patientId — all reports for a patient (no session join)
const getReportsForPatient = async (req, res) => {
  try {
    const reports = await Report.find({ patient_id: req.params.patientId });
    res.json(reports);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/reports/session/:sessionId
const getReportForSession = async (req, res) => {
  try {
    const report = await Report.findOne({ session_id: req.params.sessionId });
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json(report);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = { getReport, getReportsForPatient, getReportForSession };
