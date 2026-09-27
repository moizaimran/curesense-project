const crypto  = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const admin                   = require("../config/firebase");
const { AppError }            = require("../utils/errors");
const { isStrongPassword, validateEmail } = require("../utils/validation");
const { sendVerificationLinkEmail, sendPasswordResetLinkEmail } = require("./emailService");
const User                    = require("../models/User");
const Patient                 = require("../models/Patient");
const DoctorProfile           = require("../models/DoctorProfile");
const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");

// ── Register ──────────────────────────────────────────────────────────────────

async function registerPatient(body) {
  const { name, email, password, dob, gender, phone,
          current_medications, allergies, medical_conditions } = body;

  if (!name || !email || !password || !dob || !gender)
    throw new AppError("name, email, password, dob and gender are required", 400);
  if (!validateEmail(email))
    throw new AppError("Invalid email format", 400);
  if (!isStrongPassword(password))
    throw new AppError("Password must be at least 8 characters and contain at least one letter and one number", 400);

  // If a verified account already exists, block registration
  const existing = await User.findOne({ email });
  if (existing?.is_verified)
    throw new AppError("Email already registered", 409);

  // If an unverified account exists, delete it (MongoDB + Firebase) so we can re-register cleanly
  if (existing && !existing.is_verified) {
    if (existing.provider_uid) await admin.auth().deleteUser(existing.provider_uid).catch(() => {});
    await Patient.findByIdAndDelete(existing.patient_id);
    await User.findByIdAndDelete(existing._id);
  }

  // Create Firebase account first so we have the uid before touching MongoDB
  let fbUser;
  try {
    fbUser = await admin.auth().createUser({ email, password, emailVerified: false, disabled: false });
  } catch (fbErr) {
    if (fbErr.code === "auth/email-already-exists") throw new AppError("Email already registered", 409);
    throw fbErr;
  }

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
    user = await User.create({
      name, email,
      role:         "patient",
      patient_id:   patient._id,
      is_verified:  false,
      provider_uid: fbUser.uid,
    });
  } catch (err) {
    await Patient.findByIdAndDelete(patient._id);
    await admin.auth().deleteUser(fbUser.uid).catch(() => {});
    throw err;
  }

  patient.user_id = user._id;
  await patient.save();

  const link = await admin.auth().generateEmailVerificationLink(email);
  await sendVerificationLinkEmail(email, link);

  return { message: "Account created. Please check your email for a verification link.", email };
}

// ── Verify email OTP ──────────────────────────────────────────────────────────

async function verifyEmail(email) {
  if (!email) throw new AppError("email is required", 400);

  const user = await User.findOne({ email });
  if (!user)            throw new AppError("Account not found", 404);
  if (user.is_verified) throw new AppError("Email is already verified", 400);
  if (!user.provider_uid) throw new AppError("Account not linked to Firebase — please re-register", 500);

  const fbUser = await admin.auth().getUser(user.provider_uid);
  if (!fbUser.emailVerified)
    throw new AppError("Email not yet verified. Please click the link in your inbox.", 400);

  await User.findByIdAndUpdate(user._id, { is_verified: true });

  let doctor_profile = null;
  if (user.role === "doctor") {
    const profile = await DoctorProfile.findOne({ user_id: user._id }).select("_id status specialty");
    if (profile) doctor_profile = { id: profile._id, status: profile.status, specialty: profile.specialty };
  }

  return {
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

// ── Resend OTP ────────────────────────────────────────────────────────────────

async function resendOTP(email, type) {
  if (!email) throw new AppError("email is required", 400);
  if (!["email_verification", "password_reset"].includes(type))
    throw new AppError("Invalid OTP type", 400);

  const normalizedEmail = email.toLowerCase().trim();

  if (type === "email_verification") {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user)            throw new AppError("Account not found", 404);
    if (user.is_verified) throw new AppError("Email is already verified", 400);
    if (!user.provider_uid) throw new AppError("Account not linked to Firebase — please re-register", 500);
    const link = await admin.auth().generateEmailVerificationLink(normalizedEmail);
    await sendVerificationLinkEmail(normalizedEmail, link);
    return { message: "A new verification link has been sent to your email." };
  }

  // password_reset — Firebase handles the full flow; same anti-enumeration pattern as forgotPassword
  const user = await User.findOne({ email: normalizedEmail, is_verified: true });
  if (user) {
    try {
      const link = await admin.auth().generatePasswordResetLink(normalizedEmail);
      await sendPasswordResetLinkEmail(normalizedEmail, link);
    } catch {
      // Silently ignore — never reveal whether an account exists
    }
  }
  return { message: "If an account with that email exists, a reset link has been sent." };
}

// loginUser removed — clients sign in directly via Firebase Client SDK (signInWithEmailAndPassword)
// and send the resulting Firebase ID token as the Bearer for all API calls.

// ── Forgot password ───────────────────────────────────────────────────────────

async function forgotPassword(email) {
  if (!email) throw new AppError("email is required", 400);
  if (!validateEmail(email)) throw new AppError("Invalid email format", 400);

  // Always return the same message to prevent email enumeration.
  // generatePasswordResetLink will throw if the email isn't in Firebase — caught silently below.
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (user) {
    try {
      const link = await admin.auth().generatePasswordResetLink(email.toLowerCase().trim());
      await sendPasswordResetLinkEmail(email.toLowerCase().trim(), link);
    } catch {
      // Silently ignore — never reveal whether an account exists
    }
  }

  return { message: "If an account with that email exists, a reset link has been sent." };
}

// verifyResetOTP and resetPassword removed — Firebase handles password reset end-to-end via the link
// sent by forgotPassword. Users click the link, reset on Firebase's page, then sign in normally.

// ── Google OAuth ──────────────────────────────────────────────────────────────

async function googleAuth(idToken) {
  if (!idToken) throw new AppError("id_token is required", 400);

  const client = new OAuth2Client();

  let payload;
  try {
    // Accept both iOS and Web client IDs as valid audiences
    const ticket = await client.verifyIdToken({
      idToken,
      audience: [
        process.env.GOOGLE_CLIENT_ID_IOS,
        process.env.GOOGLE_CLIENT_ID_WEB,
      ],
    });
    payload = ticket.getPayload();
  } catch {
    throw new AppError("Invalid Google token", 401);
  }

  const { email, name, sub: google_id } = payload;
  if (!email) throw new AppError("Google account has no email", 400);

  let user = await User.findOne({ email });

  if (user) {
    // Existing account — sync is_verified, google_id, and provider_uid
    const updates = {};
    if (!user.is_verified)   updates.is_verified = true;
    if (!user.google_id)     updates.google_id   = google_id;
    if (!user.provider_uid) {
      // Link to Firebase — find or create Firebase account for this Google email
      let fbUser;
      try {
        fbUser = await admin.auth().getUserByEmail(email);
      } catch {
        fbUser = await admin.auth().createUser({ email, emailVerified: true, disabled: false });
      }
      updates.provider_uid = fbUser.uid;
    }
    if (Object.keys(updates).length) await User.findByIdAndUpdate(user._id, updates);
    user = await User.findById(user._id);
  } else {
    // New user — create Firebase account + MongoDB user + empty Patient record
    let fbUser;
    try {
      fbUser = await admin.auth().getUserByEmail(email);
    } catch {
      fbUser = await admin.auth().createUser({ email, emailVerified: true, disabled: false });
    }

    const patient = await Patient.create({
      name,
      dob:    null,
      gender: null,
      contact: { email, phone: "" },
      current_medications: [],
      allergies:           [],
      medical_conditions:  [],
      profile_complete:    false,
    });

    try {
      user = await User.create({
        name,
        email,
        role:         "patient",
        patient_id:   patient._id,
        is_verified:  true,
        google_id,
        provider_uid: fbUser.uid,
      });
    } catch (err) {
      await Patient.findByIdAndDelete(patient._id);
      throw err;
    }

    patient.user_id = user._id;
    await patient.save();
  }

  // Check if patient profile is complete (has DOB + gender)
  let profile_complete = true;
  if (user.role === "patient" && user.patient_id) {
    const patient = await Patient.findById(user.patient_id).select("dob gender profile_complete");
    profile_complete = !!(patient?.dob && patient?.gender);
  }

  return {
    user: {
      id:               user._id,
      name:             user.name,
      email:            user.email,
      role:             user.role,
      patient_id:       user.patient_id || null,
      profile_complete,
    },
  };
}

// ── Staff / admin ─────────────────────────────────────────────────────────────

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

  let fbUser;
  try {
    fbUser = await admin.auth().createUser({ email, password, emailVerified: true, disabled: false });
  } catch (fbErr) {
    if (fbErr.code === "auth/email-already-exists") throw new AppError("Email already registered", 409);
    throw fbErr;
  }

  let user;
  try {
    user = await User.create({ name, email, role, is_verified: true, provider_uid: fbUser.uid });
  } catch (err) {
    await admin.auth().deleteUser(fbUser.uid).catch(() => {});
    throw err;
  }
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
  return User.findByIdAndUpdate(userId, { name: name.trim() }, { new: true }).select("name email role patient_id provider_uid google_id expo_push_token created_at updated_at");
}

async function listAdminUsers() {
  const staff = await User.find({ role: "admin" }).select("name email role patient_id provider_uid google_id expo_push_token created_at updated_at").sort({ created_at: -1 });
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
  verifyEmail,
  resendOTP,
  googleAuth,
  forgotPassword,
  createStaffUser,
  assignPatientToDoctor,
  updateUserName,
  listAdminUsers,
  getSettings,
  updateSettings,
  registerPushToken,
};
