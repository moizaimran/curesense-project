// =============================================================================
// Backend/middleware/auth.js
// =============================================================================
const jwt          = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");
const User         = require("../models/User");

// Verify JWT and attach req.user (password field excluded by select:false)
const protect = asyncHandler(async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authorized — token missing" });
  }
  try {
    const decoded = jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) return res.status(401).json({ error: "User no longer exists" });
    next();
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
//   doctor  → only assigned patients
const canAccessPatient = (user, patientId) => {
  if (!patientId) return false;
  const pid = patientId.toString();
  if (user.role === "admin")   return true;
  if (user.role === "patient") return user.patient_id?.toString() === pid;
  if (user.role === "doctor")  return user.assigned_patients.some(id => id.toString() === pid);
  return false;
};

module.exports = { protect, authorize, canAccessPatient };
