// =============================================================================
// Backend/controllers/authController.js
//
// POST /api/auth/register  — public, patient role only
//   Creates User + Patient profile atomically; rolls back Patient if User fails.
// POST /api/auth/login     — public (all roles)
//   Doctors with status:"pending" or "rejected" receive 403 — the verification
//   gate must actually be enforced at the token-issuance point, not just the UI.
// POST /api/auth/staff     — admin only; creates doctor or admin accounts
// POST /api/auth/assign    — admin only; assigns a patient to a doctor
// GET  /api/auth/me        — any authenticated user
// =============================================================================
const { signToken }               = require("../utils/jwt");
const User                        = require("../models/User");
const Patient                     = require("../models/Patient");
const DoctorProfile               = require("../models/DoctorProfile");
const PatientDoctorAssignment     = require("../models/PatientDoctorAssignment");
const asyncHandler                = require("../utils/asyncHandler");

// ── Shared validation helpers ─────────────────────────────────────────────────
// Applied identically across all signup flows so validation failures are
// indistinguishable between patient, doctor, and admin paths.

// Minimum 8 characters with at least one letter and one number.
// The User schema enforces minlength:6 at the DB layer; this is the stricter
// application-level rule that all three signup paths share.
function isStrongPassword(pw) {
  return pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
}

// Basic structural email check — not a regex so no backtracking risk.
// Requires text@text.text with no whitespace.
function validateEmail(email) {
  const at  = email.indexOf("@");
  const dot = email.lastIndexOf(".");
  return at > 0 && dot > at + 1 && dot < email.length - 1 && !/\s/.test(email);
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
const register = asyncHandler(async (req, res) => {
  const { name, email, password, dob, gender, phone,
          current_medications, allergies, medical_conditions } = req.body;

  if (!name || !email || !password || !dob || !gender) {
    return res.status(400).json({ error: "name, email, password, dob and gender are required" });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Password must be at least 8 characters and contain at least one letter and one number" });
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

  // Response shape matches login: patient_id at top level of user object,
  // doctor_profile null (this is a patient account).
  res.status(201).json({
    token: signToken(user._id),
    user: {
      id:             user._id,
      name:           user.name,
      email:          user.email,
      role:           user.role,
      patient_id:     patient._id,
      doctor_profile: null,
    },
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

  // For doctors, enforce the verification gate before issuing any token.
  // A pending or rejected doctor has no business accessing patient data —
  // the JWT must not exist at all, not just be blocked by the dashboard.
  let doctor_profile = null;
  if (user.role === "doctor") {
    const profile = await DoctorProfile.findOne({ user_id: user._id }).select("_id status specialty");
    if (profile) {
      if (profile.status === "pending") {
        return res.status(403).json({
          error: "Your account is pending verification. Please wait for admin approval before logging in.",
        });
      }
      if (profile.status === "rejected") {
        return res.status(403).json({
          error: "Your account was not approved. Please contact support for more information.",
        });
      }
      doctor_profile = { id: profile._id, status: profile.status, specialty: profile.specialty };
    }
  }

  res.json({
    token: signToken(user._id),
    user: {
      id:             user._id,
      name:           user.name,
      email:          user.email,
      role:           user.role,
      patient_id:     user.patient_id || null,
      doctor_profile,
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
  if (!validateEmail(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Password must be at least 8 characters and contain at least one letter and one number" });
  }
  if (await User.findOne({ email })) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const user = await User.create({ name, email, password, role });
  // No token issued — admin accounts log in via POST /api/auth/login
  res.status(201).json({
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  });
});

// ── POST /api/auth/assign (admin only) ────────────────────────────────────────
// Admin override path — creates or activates a PatientDoctorAssignment directly.
// This is the only admin-controlled assignment path; normal flow is patient-initiated
// via POST /api/appointments which goes through admin appointment review.
const assignPatient = asyncHandler(async (req, res) => {
  const { doctor_user_id, patient_id } = req.body;
  // Accept either doctor_user_id (User._id) or the legacy doctor_id field
  const doctorUserId = doctor_user_id || req.body.doctor_id;
  if (!doctorUserId || !patient_id) {
    return res.status(400).json({ error: "doctor_user_id and patient_id are required" });
  }

  const doctorUser = await User.findOne({ _id: doctorUserId, role: "doctor" });
  if (!doctorUser) return res.status(404).json({ error: "Doctor user not found" });

  const doctorProfile = await DoctorProfile.findOne({ user_id: doctorUserId });
  if (!doctorProfile) return res.status(404).json({ error: "Doctor profile not found — doctor must complete registration first" });

  // Upsert: create if not exists, activate if already pending
  const existing = await PatientDoctorAssignment.findOne({
    doctor_id:  doctorProfile._id,
    patient_id,
  });

  if (existing?.status === "active") {
    return res.status(409).json({ error: "Patient is already actively assigned to this doctor" });
  }

  let assignment;
  if (existing) {
    existing.status       = "active";
    existing.activated_at = existing.activated_at || new Date();
    await existing.save();
    assignment = existing;
  } else {
    assignment = await PatientDoctorAssignment.create({
      doctor_id:  doctorProfile._id,
      patient_id,
      status:     "active",
      activated_at: new Date(),
    });
  }

  res.json({ message: "Patient assigned successfully", assignment });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  res.json(req.user);
});

// ── PATCH /api/auth/me (any authenticated user) ───────────────────────────────
// Update the logged-in user's name. Email and role are identity fields — not editable here.
const updateMe = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "name is required" });
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { name: name.trim() },
    { new: true }
  ).select("-password");
  res.json(user);
});

// ── GET /api/auth/staff (admin only) ─────────────────────────────────────────
// List all admin users so the Manage Admins UI can display them.
const listStaff = asyncHandler(async (req, res) => {
  const staff = await User.find({ role: "admin" })
    .select("-password")
    .sort({ created_at: -1 });
  res.json({ total: staff.length, results: staff });
});

// ── GET/PATCH /api/auth/settings (admin only) ─────────────────────────────────
// System settings stored as a singleton document. First GET upserts defaults.
const getSettings = asyncHandler(async (req, res) => {
  const Settings = require("../models/Settings");
  const settings = await Settings.findOneAndUpdate(
    { _key: "singleton" },
    { $setOnInsert: { _key: "singleton" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json(settings);
});

const updateSettings = asyncHandler(async (req, res) => {
  const Settings = require("../models/Settings");
  const allowed = [
    "systemName", "supportEmail", "supportPhone",
    "aiConfidence", "aiDiagnosis", "imageAnalysis",
    "sessionTimeout", "twoFactorAuth",
    "doctorApprovalEmails", "patientRegistrationEmails", "systemAlerts",
  ];
  const update = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  }
  const settings = await Settings.findOneAndUpdate(
    { _key: "singleton" },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json(settings);
});

module.exports = { register, login, createStaff, assignPatient, getMe, updateMe, listStaff, getSettings, updateSettings };
