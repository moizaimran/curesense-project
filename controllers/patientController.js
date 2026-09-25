const asyncHandler     = require("../utils/asyncHandler");
const patientService   = require("../services/patientService");

const createPatient = asyncHandler(async (req, res) => {
  const patient = await patientService.createPatient(req.body);
  res.status(201).json(patient);
});

const getPatient = asyncHandler(async (req, res) => {
  const patient = await patientService.getPatient(req.params.id, req.user);
  res.json(patient);
});

const updatePatientProfile = asyncHandler(async (req, res) => {
  const updated = await patientService.updatePatientProfile(req.params.id, req.body, req.user);
  res.json(updated);
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
