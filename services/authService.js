const { signToken }           = require("../utils/jwt");
const { AppError }            = require("../utils/errors");
const { isStrongPassword, validateEmail } = require("../utils/validation");
const User                    = require("../models/User");
const Patient                 = require("../models/Patient");
const DoctorProfile           = require("../models/DoctorProfile");
const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");

async function registerPatient(body) {
  const { name, email, password, dob, gender, phone,
          current_medications, allergies, medical_conditions } = body;

  if (!name || !email || !password || !dob || !gender)
    throw new AppError("name, email, password, dob and gender are required", 400);
  if (!validateEmail(email))
    throw new AppError("Invalid email format", 400);
  if (!isStrongPassword(password))
    throw new AppError("Password must be at least 8 characters and contain at least one letter and one number", 400);
  if (await User.findOne({ email }))
    throw new AppError("Email already registered", 409);

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
    await Patient.findByIdAndDelete(patient._id);
    throw err;
  }

  patient.user_id = user._id;
  await patient.save();

  return {
    token: signToken(user._id),
    user: {
      id:             user._id,
      name:           user.name,
      email:          user.email,
      role:           user.role,
      patient_id:     patient._id,
      doctor_profile: null,
    },
  };
}

async function loginUser({ email, password }) {
  if (!email || !password)
    throw new AppError("email and password are required", 400);

  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.matchPassword(password)))
    throw new AppError("Invalid credentials", 401);

  let doctor_profile = null;
  if (user.role === "doctor") {
    const profile = await DoctorProfile.findOne({ user_id: user._id }).select("_id status specialty");
    if (profile) {
      if (profile.status === "pending")
        throw new AppError("Your account is pending verification. Please wait for admin approval before logging in.", 403);
      if (profile.status === "rejected")
        throw new AppError("Your account was not approved. Please contact support for more information.", 403);
      doctor_profile = { id: profile._id, status: profile.status, specialty: profile.specialty };
    }
  }

  return {
    token: signToken(user._id),
    user: {
      id:             user._id,
      name:           user.name,
      email:          user.email,
      role:           user.role,
      patient_id:     user.patient_id || null,
      doctor_profile,
    },
  };
}

async function createStaffUser({ name, email, password, role }) {
  if (!name || !email || !password || !role)
    throw new AppError("name, email, password and role are required", 400);
  if (role === "doctor")
    throw new AppError("Doctor accounts cannot be created this way. Doctors must self-register via POST /api/doctors/register so their PMDC number, specialty, and profile are captured correctly.", 400);
  if (role !== "admin")
    throw new AppError("role must be 'admin'", 400);
  if (!validateEmail(email))
    throw new AppError("Invalid email format", 400);
  if (!isStrongPassword(password))
    throw new AppError("Password must be at least 8 characters and contain at least one letter and one number", 400);
  if (await User.findOne({ email }))
    throw new AppError("Email already registered", 409);

  const user = await User.create({ name, email, password, role });
  return { user: { id: user._id, name: user.name, email: user.email, role: user.role } };
}

async function assignPatientToDoctor(body) {
  const doctorUserId = body.doctor_user_id || body.doctor_id;
  const { patient_id } = body;

  if (!doctorUserId || !patient_id)
    throw new AppError("doctor_user_id and patient_id are required", 400);

  const doctorUser = await User.findOne({ _id: doctorUserId, role: "doctor" });
  if (!doctorUser) throw new AppError("Doctor user not found", 404);

  const doctorProfile = await DoctorProfile.findOne({ user_id: doctorUserId });
  if (!doctorProfile) throw new AppError("Doctor profile not found — doctor must complete registration first", 404);

  const existing = await PatientDoctorAssignment.findOne({
    doctor_id: doctorProfile._id,
    patient_id,
  });

  if (existing?.status === "active")
    throw new AppError("Patient is already actively assigned to this doctor", 409);

  let assignment;
  if (existing) {
    existing.status       = "active";
    existing.activated_at = existing.activated_at || new Date();
    await existing.save();
    assignment = existing;
  } else {
    assignment = await PatientDoctorAssignment.create({
      doctor_id:    doctorProfile._id,
      patient_id,
      status:       "active",
      activated_at: new Date(),
    });
  }

  return { message: "Patient assigned successfully", assignment };
}

async function updateUserName(userId, name) {
  if (!name?.trim()) throw new AppError("name is required", 400);
  return User.findByIdAndUpdate(userId, { name: name.trim() }, { new: true }).select("-password");
}

async function listAdminUsers() {
  const staff = await User.find({ role: "admin" }).select("-password").sort({ created_at: -1 });
  return { total: staff.length, results: staff };
}

async function getSettings() {
  const Settings = require("../models/Settings");
  return Settings.findOneAndUpdate(
    { _key: "singleton" },
    { $setOnInsert: { _key: "singleton" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function updateSettings(body) {
  const Settings = require("../models/Settings");
  const allowed = [
    "systemName", "supportEmail", "supportPhone",
    "aiConfidence", "aiDiagnosis", "imageAnalysis",
    "sessionTimeout", "twoFactorAuth",
    "doctorApprovalEmails", "patientRegistrationEmails", "systemAlerts",
  ];
  const update = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  return Settings.findOneAndUpdate(
    { _key: "singleton" },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function registerPushToken(userId, token) {
  if (!token || typeof token !== "string") throw new AppError("expo_push_token is required", 400);
  if (token.length > 500) throw new AppError("Invalid Expo push token", 400);
  if (!token.startsWith("ExponentPushToken[") && !token.startsWith("ExpoExpoPushToken["))
    throw new AppError("Invalid Expo push token format", 400);
  await User.findByIdAndUpdate(userId, { expo_push_token: token });
  return { message: "Push token registered" };
}

module.exports = {
  registerPatient,
  loginUser,
  createStaffUser,
  assignPatientToDoctor,
  updateUserName,
  listAdminUsers,
  getSettings,
  updateSettings,
  registerPushToken,
};
