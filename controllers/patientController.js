const asyncHandler     = require("../utils/asyncHandler");
const patientService   = require("../services/patientService");

const createPatient = asyncHandler(async (req, res) => {
  const patient = await patientService.createPatient(req.body);
  res.status(201).json(patient);
});

// Doctors' ratings of a patient are private — strip them when the patient asks.
function forViewer(patient, user) {
  if (!patient || user?.role !== "patient") return patient;
  const obj = typeof patient.toObject === "function" ? patient.toObject() : { ...patient };
  delete obj.rating;
  return obj;
}

const getPatient = asyncHandler(async (req, res) => {
  const patient = await patientService.getPatient(req.params.id, req.user);
  res.json(forViewer(patient, req.user));
});

const updatePatientProfile = asyncHandler(async (req, res) => {
  const updated = await patientService.updatePatientProfile(req.params.id, req.body, req.user);
  res.json(forViewer(updated, req.user));
});

const getPatientReports = asyncHandler(async (req, res) => {
  const reports = await patientService.getPatientReports(req.params.id, req.user);
  res.json(reports);
});

const listPatients = asyncHandler(async (req, res) => {
  const result = await patientService.listPatients(req.query);
  res.json(result);
});

module.exports = { createPatient, listPatients, getPatient, updatePatientProfile, getPatientReports };
