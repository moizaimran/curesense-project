// =============================================================================
// Backend/controllers/patientController.js
// =============================================================================
const Patient = require("../models/Patient");

// POST /api/patients
const createPatient = async (req, res) => {
  try {
    const patient = await Patient.create(req.body);
    res.status(201).json(patient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/patients/:id
const getPatient = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    res.json(patient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PATCH /api/patients/:id — merge allergies/medications after a session
const updatePatientProfile = async (req, res) => {
  try {
    const { allergies, current_medications } = req.body;
    const updates = { updated_at: new Date() };
    if (allergies)           updates.allergies            = allergies;
    if (current_medications) updates.current_medications  = current_medications;

    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    res.json(patient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = { createPatient, getPatient, updatePatientProfile };
