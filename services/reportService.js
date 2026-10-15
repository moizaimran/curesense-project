const { AppError }         = require("../utils/errors");
const Report               = require("../models/Report");
const { canAccessPatient } = require("../middleware/auth");

// Heavy internal fields not needed when listing multiple reports —
// only returned on single-report fetch (getReport / getReportForSession)
const LIST_EXCLUDE = "-retrieved_chunks -entities -openfda_results";

// ── Role-based view ───────────────────────────────────────────────────────────
// Patients receive only patient-facing content. Clinical material (doctor report,
// retrieved sources, entities, search queries, raw disease ranking, drug labels,
// clinical reasoning, unlikely diagnoses, doctor flags) never leaves the server
// for a patient. Doctors and admins receive the full report.

const PATIENT_FIELDS = ["_id", "session_id", "patient_id", "appointment_id", "generated_at",
                        "patient_summary", "session_scans"];

function toPatientView(report) {
  const view = {};
  for (const field of PATIENT_FIELDS) {
    if (report[field] !== undefined) view[field] = report[field];
  }
  view.emergency_warning = {
    triggered: !!report.emergency_warning?.triggered,
    message:   report.emergency_warning?.message || "",
  };
  view.interpreted_diagnoses = (report.interpreted_diagnoses || [])
    .filter((d) => d.plausibility !== "unlikely")
    .map(({ disease, icdCode, plausibility, patientNote }) => ({ disease, icdCode, plausibility, patientNote }));
  return view;
}

// report: a plain object (use .toObject() on documents first)
function viewFor(user, report) {
  return user.role === "patient" ? toPatientView(report) : report;
}

async function getReport(id, user) {
  const report = await Report.findOne({ _id: id, is_deleted: { $ne: true } });
  if (!report) throw new AppError("Report not found", 404);

  let hasAccess = await canAccessPatient(user, report.patient_id);

  if (!hasAccess && user.role === "doctor" && report.appointment_id) {
    const DoctorProfile = require("../models/DoctorProfile");
    const Appointment   = require("../models/Appointment");
    const profile = await DoctorProfile.findOne({ user_id: user._id }).select("_id");
    if (profile) {
      // Only an admin-approved consultation grants access — never a pending or rejected request
      hasAccess = !!(await Appointment.exists({
        _id: report.appointment_id, doctor_id: profile._id, status: { $in: ["confirmed", "completed"] },
      }));
    }
  }

  if (!hasAccess) throw new AppError("Access denied", 403);

  // Attach any patient-uploaded scans linked to this report (post_session flow).
  // Both doctor and patient see these alongside the clinical report.
  const ImageUpload = require("../models/ImageUpload");
  const scans = await ImageUpload
    .find({ report_id: report._id, source: "post_session", deleted_at: null })
    .select("-storage_url -zip_url -canvas_url -__v")
    .sort({ createdAt: -1 });

  return viewFor(user, { ...report.toObject(), session_scans: scans });
}

// Gap 2 fixed: excludes heavy internal fields not needed in a list
// Gap 3 fixed: supports page + limit pagination
async function getReportsForPatient(patientId, user, { page = 1, limit = 20 } = {}) {
  if (!(await canAccessPatient(user, patientId))) throw new AppError("Access denied", 403);

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Report.countDocuments({ patient_id: patientId, is_deleted: { $ne: true } });
  const results = await Report.find({ patient_id: patientId, is_deleted: { $ne: true } })
    .select(LIST_EXCLUDE)
    .sort({ generated_at: -1 })
    .skip(skip)
    .limit(Number(limit));

  return { total, page: Number(page), results: results.map((r) => viewFor(user, r.toObject())) };
}

async function getReportForSession(sessionId, user) {
  const report = await Report.findOne({ session_id: sessionId, is_deleted: { $ne: true } });
  if (!report) throw new AppError("Report not found", 404);
  if (!(await canAccessPatient(user, report.patient_id))) throw new AppError("Access denied", 403);

  const ImageUpload = require("../models/ImageUpload");
  const scans = await ImageUpload
    .find({ report_id: report._id, source: "post_session", deleted_at: null })
    .select("-storage_url -zip_url -canvas_url -__v")
    .sort({ createdAt: -1 });

  return viewFor(user, { ...report.toObject(), session_scans: scans });
}


module.exports = { getReport, getReportsForPatient, getReportForSession, viewFor };
