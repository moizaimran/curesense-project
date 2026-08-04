// =============================================================================
// Backend/controllers/patientController.js
// =============================================================================
const Patient      = require("../models/Patient");
const asyncHandler = require("../utils/asyncHandler");

// POST /api/patients
const createPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.create(req.body);
  res.status(201).json(patient);
});

// GET /api/patients/:id
const getPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  res.json(patient);
});

// PATCH /api/patients/:id — merge allergies/medications after a session
const updatePatientProfile = asyncHandler(async (req, res) => {
  const { allergies, current_medications } = req.body;
  const updates = { updated_at: new Date() };
  if (allergies)           updates.allergies           = allergies;
  if (current_medications) updates.current_medications = current_medications;

  const patient = await Patient.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true }
  );
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  res.json(patient);
});

module.exports = { createPatient, getPatient, updatePatientProfile };
