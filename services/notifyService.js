// =============================================================================
// Backend/services/notifyService.js — preference-aware activity emails
//
// Categories (User.notification_prefs.email):
//   appointment_updates · payment_updates · messages
//
// Everything here is fire-and-forget: a failed email never fails the request
// that triggered it.
// =============================================================================
const logger       = require("../utils/logger");
const emailService = require("./emailService");
const User         = require("../models/User");
const DoctorProfile = require("../models/DoctorProfile");

const CATEGORIES = ["appointment_updates", "payment_updates", "messages"];

function wants(user, category) {
  // Missing prefs (older accounts) → default on
  return user?.notification_prefs?.email?.[category] !== false;
}

// Send one email to a user (by id) if they want this category.
async function emailUser(userId, category, message) {
  if (!CATEGORIES.includes(category)) throw new Error(`Unknown notification category ${category}`);
  const user = await User.findById(userId).select("email notification_prefs").lean();
  if (!user?.email || !wants(user, category)) return false;
  await emailService.sendNotificationEmail(user.email, message);
  return true;
}

// Resolve the User behind a Patient / DoctorProfile and email them.
async function emailPatient(patientId, category, message) {
  const user = await User.findOne({ patient_id: patientId }).select("_id").lean();
  return user ? emailUser(user._id, category, message) : false;
}

async function emailDoctor(doctorProfileId, category, message) {
  const profile = await DoctorProfile.findById(doctorProfileId).select("user_id").lean();
  return profile?.user_id ? emailUser(profile.user_id, category, message) : false;
}

async function emailAdmins(category, message) {
  const admins = await User.find({ role: "admin" }).select("_id").lean();
  const sent = await Promise.all(admins.map((a) => emailUser(a._id, category, message)));
  return sent.filter(Boolean).length;
}

// Run a notification in the background; log instead of throwing.
function fireAndForget(promiseFactory, context) {
  Promise.resolve()
    .then(promiseFactory)
    .catch((err) => logger.warn({ err, ...context }, "Notification email failed"));
}

module.exports = { CATEGORIES, wants, emailUser, emailPatient, emailDoctor, emailAdmins, fireAndForget };
