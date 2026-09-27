// =============================================================================
// Backend/middleware/auth.js
// =============================================================================
const admin        = require("../config/firebase");
const asyncHandler = require("../utils/asyncHandler");
const User         = require("../models/User");

// Verify Firebase ID token and attach req.user.
// Rejects with 403 if the token's email_verified flag is false.
// Falls back to legacy JWT for backward-compat during the migration window — remove
// the fallback block once all clients have upgraded to Firebase-issued tokens.
const protect = asyncHandler(async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authorized — token missing" });
  }

  const token = auth.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);

    if (!decoded.email_verified) {
      return res.status(403).json({ error: "Email not verified. Please click the link in your inbox." });
    }

    const user = await User.findOne({ provider_uid: decoded.uid });
    if (!user) return res.status(401).json({ error: "User not found — please sign in again" });

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

// Role gate — call after protect
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: `Role '${req.user.role}' is not authorized for this action` });
  }
  next();
};

// Returns true if the current user may read/write the given patient's data.
//   admin  → always yes
//   patient → only their own patient_id
//   doctor  → only patients where a PatientDoctorAssignment with status:"active"
//              exists for this doctor-patient pair
//
// IMPORTANT: This is ASYNC. Every caller must await it.
const canAccessPatient = async (user, patientId) => {
  if (!patientId) return false;
  const pid = patientId.toString();

  if (user.role === "admin")   return true;
  if (user.role === "patient") return user.patient_id?.toString() === pid;

  if (user.role === "doctor") {
    const DoctorProfile           = require("../models/DoctorProfile");
    const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");

    const profile = await DoctorProfile.findOne({ user_id: user._id }).select("_id");
    if (!profile) return false;

    const assignment = await PatientDoctorAssignment.findOne({
      doctor_id:  profile._id,
      patient_id: patientId,
      status:     "active",
    });
    return !!assignment;
  }

  return false;
};

module.exports = { protect, authorize, canAccessPatient };
