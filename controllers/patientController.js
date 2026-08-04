// =============================================================================
// Backend/controllers/patientController.js
// =============================================================================
const Patient            = require("../models/Patient");
const asyncHandler       = require("../utils/asyncHandler");
const { canAccessPatient } = require("../middleware/auth");

// POST /api/patients — admin only (patients are created via /api/auth/register)
const createPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.create(req.body);
  res.status(201).json(patient);
});

// GET /api/patients/:id
const getPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  if (!canAccessPatient(req.user, patient._id)) {
    return res.status(403).json({ error: "Access denied" });
  }
  res.json(patient);
});

// PATCH /api/patients/:id — patient (own) or admin
const updatePatientProfile = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  if (!canAccessPatient(req.user, patient._id)) {
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

module.exports = { createPatient, getPatient, updatePatientProfile };
