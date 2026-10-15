const { AppError }          = require("../utils/errors");
const Patient               = require("../models/Patient");
const Report                = require("../models/Report");
const { canAccessPatient }  = require("../middleware/auth");
const { escapeRegex }       = require("../utils/validation");

async function createPatient(body) {
  const { name, dob, gender, phone, contact, medical_conditions, allergies, current_medications } = body;
  if (!name || !dob || !gender)
    throw new AppError("name, dob and gender are required", 400);

  return Patient.create({
    name,
    dob,
    gender,
    contact:             contact || { phone: phone || "", email: body.email || "" },
    medical_conditions:  Array.isArray(medical_conditions)  ? medical_conditions  : [],
    allergies:           Array.isArray(allergies)           ? allergies           : [],
    current_medications: Array.isArray(current_medications) ? current_medications : [],
  });
}

async function getPatient(patientId, user) {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new AppError("Patient not found", 404);
  if (!(await canAccessPatient(user, patient._id))) throw new AppError("Access denied", 403);
  return patient;
}

async function updatePatientProfile(patientId, body, user) {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new AppError("Patient not found", 404);
  if (!(await canAccessPatient(user, patient._id))) throw new AppError("Access denied", 403);

  const { allergies, current_medications, medical_conditions, dob, gender, profile_complete } = body;
  const updates = { updated_at: new Date() };
  if (allergies)           updates.allergies           = allergies;
  if (current_medications) updates.current_medications = current_medications;
  if (medical_conditions)  updates.medical_conditions  = medical_conditions;

  // Sent by the mobile Complete Profile screen (Google sign-ups start without dob/gender)
  if (dob !== undefined) {
    const parsed = new Date(dob);
    if (Number.isNaN(parsed.getTime())) throw new AppError("dob must be a valid date", 400);
    updates.dob = parsed;
  }
  if (gender !== undefined) {
    if (typeof gender !== "string" || !gender.trim()) throw new AppError("gender must be a non-empty string", 400);
    updates.gender = gender.trim();
  }
  if (profile_complete !== undefined) updates.profile_complete = profile_complete === true;

  return Patient.findByIdAndUpdate(patientId, { $set: updates }, { new: true });
}

async function getPatientReports(patientId, user) {
  if (!(await canAccessPatient(user, patientId))) throw new AppError("Access denied", 403);
  const { viewFor } = require("./reportService");
  const reports = await Report.find({ patient_id: patientId, is_deleted: { $ne: true } }).sort({ generated_at: -1 });
  return reports.map((r) => viewFor(user, r.toObject()));
}

async function listPatients({ page = 1, limit = 20, search } = {}) {
  const filter = {};
  if (search) {
    filter.$or = [
      { name:            { $regex: escapeRegex(search), $options: "i" } },
      { "contact.email": { $regex: escapeRegex(search), $options: "i" } },
    ];
  }
  const skip    = (Number(page) - 1) * Number(limit);
  const total   = await Patient.countDocuments(filter);
  const results = await Patient.find(filter)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(Number(limit));
  return { total, page: Number(page), results };
}

module.exports = { createPatient, getPatient, updatePatientProfile, getPatientReports, listPatients };
