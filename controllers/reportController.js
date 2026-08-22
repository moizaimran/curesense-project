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

  let hasAccess = await canAccessPatient(req.user, report.patient_id);

  // A doctor can also access this report if it's directly linked to one of their appointments
  // (covers the pending_admin_review window before PatientDoctorAssignment becomes active)
  if (!hasAccess && req.user.role === "doctor" && report.appointment_id) {
    const DoctorProfile = require("../models/DoctorProfile");
    const Appointment   = require("../models/Appointment");
    const profile = await DoctorProfile.findOne({ user_id: req.user._id }).select("_id");
    if (profile) {
      hasAccess = !!(await Appointment.exists({ _id: report.appointment_id, doctor_id: profile._id }));
    }
  }

  if (!hasAccess) return res.status(403).json({ error: "Access denied" });
  res.json(report);
});

// GET /api/reports/patient/:patientId — access checked by authorize in route + canAccessPatient here
const getReportsForPatient = asyncHandler(async (req, res) => {
  if (!(await canAccessPatient(req.user, req.params.patientId))) {
    return res.status(403).json({ error: "Access denied" });
  }
  const reports = await Report.find({ patient_id: req.params.patientId, is_deleted: { $ne: true } });
  res.json(reports);
});

// GET /api/reports/session/:sessionId
const getReportForSession = asyncHandler(async (req, res) => {
  const report = await Report.findOne({ session_id: req.params.sessionId, is_deleted: { $ne: true } });
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (!(await canAccessPatient(req.user, report.patient_id))) {
    return res.status(403).json({ error: "Access denied" });
  }
  res.json(report);
});

module.exports = { getReport, getReportsForPatient, getReportForSession };
