// =============================================================================
// Backend/controllers/authController.js
//
// POST /api/auth/register  — public, patient role only
//   Creates User + Patient profile atomically; rolls back Patient if User fails.
// POST /api/auth/login     — public
// POST /api/auth/staff     — admin only; creates doctor or admin accounts
// POST /api/auth/assign    — admin only; assigns a patient to a doctor
// GET  /api/auth/me        — any authenticated user
// =============================================================================
const jwt          = require("jsonwebtoken");
const User         = require("../models/User");
const Patient      = require("../models/Patient");
const asyncHandler = require("../utils/asyncHandler");

const signToken = id =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });

// ── POST /api/auth/register ───────────────────────────────────────────────────
const register = asyncHandler(async (req, res) => {
  const { name, email, password, dob, gender, phone,
          current_medications, allergies, medical_conditions } = req.body;

  if (!name || !email || !password || !dob || !gender) {
    return res.status(400).json({ error: "name, email, password, dob and gender are required" });
  }
  if (await User.findOne({ email })) {
    return res.status(409).json({ error: "Email already registered" });
  }

  // Create Patient profile first so we have its _id for the User
  const patient = await Patient.create({
    name,
    dob,
    gender,
    contact:             { phone: phone || "", email },
    current_medications: Array.isArray(current_medications) ? current_medications : [],
    allergies:           Array.isArray(allergies)           ? allergies           : [],
    medical_conditions:  Array.isArray(medical_conditions)  ? medical_conditions  : [],
  });

  let user;
  try {
    user = await User.create({ name, email, password, role: "patient", patient_id: patient._id });
  } catch (err) {
    // Roll back orphaned patient record if user creation fails
    await Patient.findByIdAndDelete(patient._id);
    throw err;
  }

  // Link back so Patient knows its owner
  patient.user_id = user._id;
  await patient.save();

  res.status(201).json({
    token: signToken(user._id),
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
    patient_id: patient._id,
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  // password has select:false on the schema — explicitly select it here
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json({
    token: signToken(user._id),
    user: {
      id:         user._id,
      name:       user.name,
      email:      user.email,
      role:       user.role,
      patient_id: user.patient_id || null,
    },
  });
});

// ── POST /api/auth/staff (admin only) ─────────────────────────────────────────
const createStaff = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password and role are required" });
  }
  if (!["doctor", "admin"].includes(role)) {
    return res.status(400).json({ error: "role must be 'doctor' or 'admin'" });
  }
  if (await User.findOne({ email })) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const user = await User.create({ name, email, password, role });
  res.status(201).json({
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  });
});

// ── POST /api/auth/assign (admin only) ────────────────────────────────────────
const assignPatient = asyncHandler(async (req, res) => {
  const { doctor_id, patient_id } = req.body;
  if (!doctor_id || !patient_id) {
    return res.status(400).json({ error: "doctor_id and patient_id are required" });
  }

  const doctor = await User.findOne({ _id: doctor_id, role: "doctor" });
  if (!doctor) return res.status(404).json({ error: "Doctor not found" });

  if (doctor.assigned_patients.some(id => id.toString() === patient_id)) {
    return res.status(409).json({ error: "Patient already assigned to this doctor" });
  }

  doctor.assigned_patients.push(patient_id);
  await doctor.save();

  res.json({ message: "Patient assigned successfully", doctor_id, patient_id });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  res.json(req.user);
});

module.exports = { register, login, createStaff, assignPatient, getMe };
