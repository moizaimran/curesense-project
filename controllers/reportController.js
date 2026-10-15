const asyncHandler  = require("../utils/asyncHandler");
const reportService = require("../services/reportService");

const getReport = asyncHandler(async (req, res) => {
  const report = await reportService.getReport(req.params.id, req.user);
  res.json(report);
});

const getReportsForPatient = asyncHandler(async (req, res) => {
  const result = await reportService.getReportsForPatient(req.params.patientId, req.user, req.query);
  res.json(result);
});

const getReportForSession = asyncHandler(async (req, res) => {
  const report = await reportService.getReportForSession(req.params.sessionId, req.user);
  res.json(report);
});

module.exports = { getReport, getReportsForPatient, getReportForSession };
