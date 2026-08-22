// =============================================================================
// Backend/controllers/patientController.js
// =============================================================================
const Patient            = require("../models/Patient");
const Report             = require("../models/Report");
const asyncHandler       = require("../utils/asyncHandler");
const { canAccessPatient } = require("../middleware/auth");

// POST /api/patients — admin only (patients are created via /api/auth/register)
// Allowlist fields explicitly — never pass req.body directly to .create() since
// it would let the caller set user_id or other internal fields arbitrarily.
const createPatient = asyncHandler(async (req, res) => {
  const { name, dob, gender, phone, contact, medical_conditions, allergies, current_medications } = req.body;
  if (!name || !dob || !gender) {
    return res.status(400).json({ error: "name, dob and gender are required" });
  }
  const patient = await Patient.create({
    name,
    dob,
    gender,
    contact:             contact || { phone: phone || "", email: req.body.email || "" },
    medical_conditions:  Array.isArray(medical_conditions)  ? medical_conditions  : [],
    allergies:           Array.isArray(allergies)           ? allergies           : [],
    current_medications: Array.isArray(current_medications) ? current_medications : [],
  });
  res.status(201).json(patient);
});

// GET /api/patients/:id
const getPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  if (!(await canAccessPatient(req.user, patient._id))) {
    return res.status(403).json({ error: "Access denied" });
  }
  res.json(patient);
});

// PATCH /api/patients/:id — patient (own) or admin
const updatePatientProfile = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  if (!(await canAccessPatient(req.user, patient._id))) {
    return res.status(403).json({ error: "Access denied" });
  }

  const { allergies, current_medications, medical_conditions } = req.body;
  const updates = { updated_at: new Date() };
  if (allergies)           updates.allergies           = allergies;
  if (current_medications) updates.current_medications = current_medications;
  if (medical_conditions)  updates.medical_conditions  = medical_conditions;

  const updated = await Patient.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
  res.json(updated);
});

// GET /api/patients/:id/reports — all reports for this patient (mobile Reports tab).
// Returns every report regardless of appointment_id, so self-only reports appear here.
const getPatientReports = asyncHandler(async (req, res) => {
  if (!(await canAccessPatient(req.user, req.params.id))) {
    return res.status(403).json({ error: "Access denied" });
  }
  const reports = await Report.find({ patient_id: req.params.id, is_deleted: { $ne: true } })
    .sort({ generated_at: -1 });
  res.json(reports);
});

// GET /api/patients — admin only: paginated list of all patients
const listPatients = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const filter = {};
  if (search) {
    filter.$or = [
      { name:            { $regex: search, $options: "i" } },
      { "contact.email": { $regex: search, $options: "i" } },
    ];
  }
  const skip    = (Number(page) - 1) * Number(limit);
  const total   = await Patient.countDocuments(filter);
  const results = await Patient.find(filter)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(Number(limit));
  res.json({ total, page: Number(page), results });
});

module.exports = { createPatient, listPatients, getPatient, updatePatientProfile, getPatientReports };
