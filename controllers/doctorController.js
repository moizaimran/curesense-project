// =============================================================================
// Backend/controllers/doctorController.js
//
// POST /api/doctors/register    — public; creates User + DoctorProfile atomically
// GET  /api/doctors             — public; search verified doctors with filters
// GET  /api/doctors/me          — doctor only; their own profile
// GET  /api/doctors/:id         — any auth'd user; single doctor profile
// GET  /api/doctors/:id/availability — any auth'd; availability + open slots
// PATCH /api/doctors/me/availability — doctor only; set weekly schedule
// GET  /api/admin/doctors       — admin only; all doctors with any status
// PATCH /api/admin/doctors/:id/verify — admin only; approve or reject
// =============================================================================
// const { signToken }      = require("../utils/jwt");
// const User               = require("../models/User");
// const DoctorProfile      = require("../models/DoctorProfile");
// const DoctorAvailability = require("../models/DoctorAvailability");
// const asyncHandler       = require("../utils/asyncHandler");

// // ── Shared validation helpers (identical rules to authController) ─────────────

// function isStrongPassword(pw) {
//   return pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
// }

// function validateEmail(email) {
//   const at  = email.indexOf("@");
//   const dot = email.lastIndexOf(".");
//   return at > 0 && dot > at + 1 && dot < email.length - 1 && !/\s/.test(email);
// }

// // ── POST /api/doctors/register ────────────────────────────────────────────────
// // Creates a User (role:doctor) + DoctorProfile atomically.
// // Doctor starts with status:"pending" — admin must verify PMDC before they appear
// // in patient search results or gain access to patient data.
// const register = asyncHandler(async (req, res) => {
//   const {
//     firstName, lastName, email, phone, password, confirmPassword,
//     pmdc_number, specialty, sub_specialty, gender,
//     hospital_clinic, experience_years,
//     city, address,
//     education, // optional array of { degree, institution, year }
//   } = req.body;

//   // ── Validation ────────────────────────────────────────────────────────────
//   if (!firstName || !lastName || !email || !phone || !password || !pmdc_number
//       || !specialty || !gender || !city) {
//     return res.status(400).json({
//       error: "firstName, lastName, email, phone, password, pmdc_number, specialty, gender and city are required",
//     });
//   }
//   if (!validateEmail(email)) {
//     return res.status(400).json({ error: "Invalid email format" });
//   }
//   if (!isStrongPassword(password)) {
//     return res.status(400).json({ error: "Password must be at least 8 characters and contain at least one letter and one number" });
//   }
//   if (password !== confirmPassword) {
//     return res.status(400).json({ error: "Passwords do not match" });
//   }
//   if (!["male", "female"].includes(gender)) {
//     return res.status(400).json({ error: "gender must be 'male' or 'female'" });
//   }
//   if (await User.findOne({ email })) {
//     return res.status(409).json({ error: "Email already registered" });
//   }
//   if (await DoctorProfile.findOne({ pmdc_number: pmdc_number.toUpperCase() })) {
//     return res.status(409).json({ error: "PMDC number already registered" });
//   }

//   const name = `${firstName.trim()} ${lastName.trim()}`;

//   // ── Create User first ─────────────────────────────────────────────────────
//   const user = await User.create({ name, email, password, role: "doctor" });

//   // ── Create DoctorProfile, roll back User on failure ───────────────────────
//   let profile;
//   try {
//     profile = await DoctorProfile.create({
//       user_id:          user._id,
//       pmdc_number,
//       specialty,
//       sub_specialty:    sub_specialty || "",
//       gender,
//       location:         { city, address: address || "" },
//       contact:          { phone, email },
//       education:        Array.isArray(education) ? education : [],
//       experience_years: experience_years ? Number(experience_years) : 0,
//       hospital_clinic:  hospital_clinic || "",
//     });
//   } catch (err) {
//     await User.findByIdAndDelete(user._id);
//     throw err;
//   }

//   // Create an empty availability document for the doctor
//   await DoctorAvailability.create({ doctor_id: profile._id });

//   // Response shape matches login: doctor_profile populated, patient_id null.
//   res.status(201).json({
//     token: signToken(user._id),
//     user: {
//       id:             user._id,
//       name:           user.name,
//       email:          user.email,
//       role:           user.role,
//       patient_id:     null,
//       doctor_profile: { id: profile._id, status: profile.status, specialty: profile.specialty },
//     },
//   });
// });

// // ── GET /api/doctors — patient-facing search (only verified doctors) ──────────
// // Query params: specialty, sub_specialty, gender, city, hospital_clinic,
// //               min_experience, max_experience, education_degree
// const searchDoctors = asyncHandler(async (req, res) => {
//   const {
//     specialty, sub_specialty, gender, city,
//     hospital_clinic, min_experience, max_experience,
//     education_degree, page = 1, limit = 20,
//   } = req.query;

//   const filter = { status: "verified" };

//   if (specialty)     filter.specialty     = { $regex: specialty,     $options: "i" };
//   if (sub_specialty) filter.sub_specialty = { $regex: sub_specialty, $options: "i" };
//   if (gender)        filter.gender        = gender;
//   if (city)          filter["location.city"] = { $regex: city, $options: "i" };
//   if (hospital_clinic) filter.hospital_clinic = { $regex: hospital_clinic, $options: "i" };

//   if (min_experience || max_experience) {
//     filter.experience_years = {};
//     if (min_experience) filter.experience_years.$gte = Number(min_experience);
//     if (max_experience) filter.experience_years.$lte = Number(max_experience);
//   }

//   if (education_degree) {
//     filter["education.degree"] = { $regex: education_degree, $options: "i" };
//   }

//   const skip  = (Number(page) - 1) * Number(limit);
//   const total = await DoctorProfile.countDocuments(filter);
//   const docs  = await DoctorProfile.find(filter)
//     .select("-pmdc_certificate_url -rejection_reason -verified_by")
//     .populate("user_id", "name")
//     .sort({ experience_years: -1 })
//     .skip(skip)
//     .limit(Number(limit));

//   res.json({ total, page: Number(page), results: docs });
// });

// // ── GET /api/doctors/me — doctor's own profile ────────────────────────────────
// const getMyProfile = asyncHandler(async (req, res) => {
//   const profile = await DoctorProfile.findOne({ user_id: req.user._id })
//     .populate("user_id", "name email created_at");
//   if (!profile) return res.status(404).json({ error: "Doctor profile not found" });
//   res.json(profile);
// });

// // ── PATCH /api/doctors/me — doctor updates their own profile ──────────────────
// // Only content fields — PMDC number, email, and role are identity and cannot change here.
// const updateMyProfile = asyncHandler(async (req, res) => {
//   const { specialty, sub_specialty, hospital_clinic, experience_years, location, contact } = req.body;

//   const update = {};
//   if (specialty         !== undefined) update.specialty         = specialty;
//   if (sub_specialty     !== undefined) update.sub_specialty     = sub_specialty;
//   if (hospital_clinic   !== undefined) update.hospital_clinic   = hospital_clinic;
//   if (experience_years  !== undefined) update.experience_years  = Number(experience_years);
//   if (location?.city    !== undefined) update["location.city"]  = location.city;
//   if (location?.address !== undefined) update["location.address"] = location.address;
//   if (contact?.phone    !== undefined) update["contact.phone"]  = contact.phone;

//   const profile = await DoctorProfile.findOneAndUpdate(
//     { user_id: req.user._id },
//     { $set: update },
//     { new: true }
//   ).populate("user_id", "name email created_at");

//   if (!profile) return res.status(404).json({ error: "Doctor profile not found" });
//   res.json(profile);
// });

// // ── GET /api/doctors/:id — single doctor (any authenticated user) ─────────────
// const getDoctorById = asyncHandler(async (req, res) => {
//   const profile = await DoctorProfile.findById(req.params.id)
//     .select("-pmdc_certificate_url -rejection_reason -verified_by")
//     .populate("user_id", "name");
//   if (!profile) return res.status(404).json({ error: "Doctor not found" });
//   res.json(profile);
// });

// // ── GET /api/doctors/:id/availability ────────────────────────────────────────
// // Returns weekly schedule + computed open slots for query param date range.
// // If ?date=YYYY-MM-DD is passed, returns available slots for that specific day
// // after cross-referencing existing confirmed/pending appointments.
// const getDoctorAvailability = asyncHandler(async (req, res) => {
//   const Appointment = require("../models/Appointment");
//   const avail = await DoctorAvailability.findOne({ doctor_id: req.params.id });
//   if (!avail) return res.status(404).json({ error: "No availability record found" });

//   if (!req.query.date) {
//     return res.json({ weekly_schedule: avail.weekly_schedule, slot_duration_minutes: avail.slot_duration_minutes, exceptions: avail.exceptions });
//   }

//   const date = new Date(req.query.date);

//   // Check exceptions for this date first
//   const exception = avail.exceptions.find(
//     ex => ex.date.toDateString() === date.toDateString()
//   );
//   if (exception && !exception.available) {
//     return res.json({ date: req.query.date, slots: [], reason: "Doctor unavailable on this date" });
//   }

//   // Determine the working window — exceptions only (weekly_schedule is no longer used)
//   const schedule = exception?.custom_hours
//     ? [{ start_time: exception.custom_hours.start_time, end_time: exception.custom_hours.end_time }]
//     : [];

//   if (schedule.length === 0) {
//     return res.json({ date: req.query.date, slots: [], reason: "Not a working day" });
//   }

//   // Generate all possible slots for the day
//   const dur = avail.slot_duration_minutes;
//   const allSlots = [];
//   for (const window of schedule) {
//     const [sh, sm] = window.start_time.split(":").map(Number);
//     const [eh, em] = window.end_time.split(":").map(Number);
//     let cur = sh * 60 + sm;
//     const end = eh * 60 + em;
//     while (cur + dur <= end) {
//       const hh = String(Math.floor(cur / 60)).padStart(2, "0");
//       const mm = String(cur % 60).padStart(2, "0");
//       const nh = String(Math.floor((cur + dur) / 60)).padStart(2, "0");
//       const nm = String((cur + dur) % 60).padStart(2, "0");
//       allSlots.push({ start_time: `${hh}:${mm}`, end_time: `${nh}:${nm}` });
//       cur += dur;
//     }
//   }

//   // Remove already-booked slots (confirmed or pending_admin_review)
//   const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
//   const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);
//   const booked   = await Appointment.find({
//     doctor_id: req.params.id,
//     "requested_slot.date": { $gte: dayStart, $lte: dayEnd },
//     status: { $in: ["confirmed", "pending_admin_review"] },
//   });
//   const bookedTimes = new Set(booked.map(a => a.requested_slot.start_time));
//   const openSlots   = allSlots.filter(s => !bookedTimes.has(s.start_time));

//   res.json({ date: req.query.date, slots: openSlots, slot_duration_minutes: dur });
// });

// // ── PATCH /api/doctors/me/availability — doctor sets their own schedule ────────
// const updateMyAvailability = asyncHandler(async (req, res) => {
//   const profile = await DoctorProfile.findOne({ user_id: req.user._id });
//   if (!profile) return res.status(404).json({ error: "Doctor profile not found" });

//   const { slot_duration_minutes, exceptions } = req.body;
//   const update = {};
//   if (slot_duration_minutes)     update.slot_duration_minutes = slot_duration_minutes;
//   if (Array.isArray(exceptions)) {
//     update.exceptions      = exceptions;
//     update.weekly_schedule = []; // clear any stale weekly_schedule — UI no longer uses it
//   }

//   const avail = await DoctorAvailability.findOneAndUpdate(
//     { doctor_id: profile._id },
//     { $set: update },
//     { new: true, upsert: true }
//   );
//   res.json(avail);
// });

// // ── GET /api/admin/doctors — admin sees all doctors regardless of status ───────
// const adminListDoctors = asyncHandler(async (req, res) => {
//   const { status, page = 1, limit = 50 } = req.query;
//   const filter = status ? { status } : {};
//   const skip   = (Number(page) - 1) * Number(limit);
//   const total  = await DoctorProfile.countDocuments(filter);
//   const docs   = await DoctorProfile.find(filter)
//     .sort({ created_at: -1 })
//     .skip(skip)
//     .limit(Number(limit));
//   res.json({ total, page: Number(page), results: docs });
// });

// // ── PATCH /api/admin/doctors/:id/verify ─── admin approves or rejects ─────────
// // Body: { decision: "approve" | "reject", rejection_reason?: string }
// const adminVerifyDoctor = asyncHandler(async (req, res) => {
//   const { decision, rejection_reason } = req.body;
//   if (!["approve", "reject"].includes(decision)) {
//     return res.status(400).json({ error: "decision must be 'approve' or 'reject'" });
//   }

//   const profile = await DoctorProfile.findById(req.params.id);
//   if (!profile) return res.status(404).json({ error: "Doctor profile not found" });
//   if (profile.status !== "pending") {
//     return res.status(409).json({ error: `Doctor is already ${profile.status}` });
//   }

//   if (decision === "approve") {
//     profile.status      = "verified";
//     profile.verified_by = req.user._id;
//     profile.verified_at = new Date();
//   } else {
//     if (!rejection_reason?.trim()) {
//       return res.status(400).json({ error: "rejection_reason is required when rejecting" });
//     }
//     profile.status           = "rejected";
//     profile.rejection_reason = rejection_reason.trim();
//   }

//   await profile.save();
//   res.json({ message: `Doctor ${decision === "approve" ? "approved" : "rejected"}`, profile });
// });

// // ── GET /api/doctors/:id/dashboard-summary ────────────────────────────────────
// // Returns aggregate counts for the doctor's dashboard widget.
// // Accessible by the doctor themselves (must match their own profile) or admin.
// const getDashboardSummary = asyncHandler(async (req, res) => {
//   const Appointment             = require("../models/Appointment");
//   const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");

//   const profile = await DoctorProfile.findById(req.params.id).select("_id");
//   if (!profile) return res.status(404).json({ error: "Doctor not found" });

//   if (req.user.role === "doctor") {
//     const myProfile = await DoctorProfile.findOne({ user_id: req.user._id }).select("_id");
//     if (!myProfile || myProfile._id.toString() !== req.params.id) {
//       return res.status(403).json({ error: "Access denied" });
//     }
//   }

//   // pending_new: confirmed appointments the doctor hasn't opened yet — distinct from
//   // has_unread_patient_query (which is about messages). A freshly approved appointment
//   // with no patient query yet is still "new" until the doctor views it for the first time.
//   const [totalPatients, ongoing, pendingNew, completed] = await Promise.all([
//     PatientDoctorAssignment.countDocuments({ doctor_id: profile._id, status: "active" }),
//     Appointment.countDocuments({ doctor_id: profile._id, status: "confirmed" }),
//     Appointment.countDocuments({ doctor_id: profile._id, status: "confirmed", doctor_viewed: { $ne: true } }),
//     Appointment.countDocuments({ doctor_id: profile._id, status: "completed" }),
//   ]);

//   res.json({ total_patients: totalPatients, ongoing, pending_new: pendingNew, completed });
// });

// module.exports = {
//   register,
//   searchDoctors,
//   getMyProfile,
//   updateMyProfile,
//   getDoctorById,
//   getDoctorAvailability,
//   updateMyAvailability,
//   adminListDoctors,
//   adminVerifyDoctor,
//   getDashboardSummary,
// };

const { signToken }      = require("../utils/jwt");
const User               = require("../models/User");
const DoctorProfile      = require("../models/DoctorProfile");
const DoctorAvailability = require("../models/DoctorAvailability");
const asyncHandler       = require("../utils/asyncHandler");

// ── Shared validation helpers (identical rules to authController) ─────────────

function isStrongPassword(pw) {
  return pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
}

function validateEmail(email) {
  const at  = email.indexOf("@");
  const dot = email.lastIndexOf(".");
  return at > 0 && dot > at + 1 && dot < email.length - 1 && !/\s/.test(email);
}

// ── POST /api/doctors/register ────────────────────────────────────────────────

// const register = asyncHandler(async (req, res) => {
//   const {
//     firstName, lastName, email, phone, password, confirmPassword,
//     pmdc_number, specialty, sub_specialty, gender,
//     hospital_clinic, experience_years,
//     city, address,
//     education,
//   } = req.body;

//   if (
//     !firstName ||
//     !lastName ||
//     !email ||
//     !phone ||
//     !password ||
//     !pmdc_number ||
//     !specialty ||
//     !gender ||
//     !city
//   ) {
//     return res.status(400).json({
//       error:
//         "firstName, lastName, email, phone, password, pmdc_number, specialty, gender and city are required",
//     });
//   }

//   if (!validateEmail(email)) {
//     return res.status(400).json({ error: "Invalid email format" });
//   }

//   if (!isStrongPassword(password)) {
//     return res.status(400).json({
//       error:
//         "Password must be at least 8 characters and contain at least one letter and one number",
//     });
//   }

//   if (password !== confirmPassword) {
//     return res.status(400).json({ error: "Passwords do not match" });
//   }

//   if (!["male", "female"].includes(gender)) {
//     return res.status(400).json({
//       error: "gender must be 'male' or 'female'",
//     });
//   }

//   if (await User.findOne({ email })) {
//     return res.status(409).json({
//       error: "Email already registered",
//     });
//   }

//   if (
//     await DoctorProfile.findOne({
//       pmdc_number: pmdc_number.toUpperCase(),
//     })
//   ) {
//     return res.status(409).json({
//       error: "PMDC number already registered",
//     });
//   }

//   const name = `${firstName.trim()} ${lastName.trim()}`;

//   const user = await User.create({
//     name,
//     email,
//     password,
//     role: "doctor",
//   });

//   let profile;

//   try {
//     profile = await DoctorProfile.create({
//       user_id: user._id,
//       pmdc_number,
//       specialty,
//       sub_specialty: sub_specialty || "",
//       gender,
//       location: {
//         city,
//         address: address || "",
//       },
//       contact: {
//         phone,
//         email,
//       },
//       education: Array.isArray(education) ? education : [],
//       experience_years: experience_years
//         ? Number(experience_years)
//         : 0,
//       hospital_clinic: hospital_clinic || "",
//     });
//   } catch (err) {
//     await User.findByIdAndDelete(user._id);
//     throw err;
//   }

//   await DoctorAvailability.create({
//     doctor_id: profile._id,
//   });

//   res.status(201).json({
//     token: signToken(user._id),
//     user: {
//       id: user._id,
//       name: user.name,
//       email: user.email,
//       role: user.role,
//       patient_id: null,
//       doctor_profile: {
//         id: profile._id,
//         status: profile.status,
//         specialty: profile.specialty,
//       },
//     },
//   });
// });

// // ── GET /api/doctors ──────────────────────────────────────────────────────────

// const searchDoctors = asyncHandler(async (req, res) => {
//   const {
//     specialty,
//     sub_specialty,
//     gender,
//     city,
//     hospital_clinic,
//     min_experience,
//     max_experience,
//     education_degree,
//     page = 1,
//     limit = 20,
//   } = req.query;

//   const filter = {
//     status: "verified",
//   };

//   if (specialty) {
//     filter.specialty = {
//       $regex: specialty,
//       $options: "i",
//     };
//   }

//   if (sub_specialty) {
//     filter.sub_specialty = {
//       $regex: sub_specialty,
//       $options: "i",
//     };
//   }

//   if (gender) {
//     filter.gender = gender;
//   }

//   if (city) {
//     filter["location.city"] = {
//       $regex: city,
//       $options: "i",
//     };
//   }

//   if (hospital_clinic) {
//     filter.hospital_clinic = {
//       $regex: hospital_clinic,
//       $options: "i",
//     };
//   }

//   if (min_experience || max_experience) {
//     filter.experience_years = {};

//     if (min_experience) {
//       filter.experience_years.$gte = Number(min_experience);
//     }

//     if (max_experience) {
//       filter.experience_years.$lte = Number(max_experience);
//     }
//   }

//   if (education_degree) {
//     filter["education.degree"] = {
//       $regex: education_degree,
//       $options: "i",
//     };
//   }

//   const skip = (Number(page) - 1) * Number(limit);

//   const total = await DoctorProfile.countDocuments(filter);

//   const docs = await DoctorProfile.find(filter)
//     .select("-pmdc_certificate_url -rejection_reason -verified_by")
//     .populate("user_id", "name")
//     .sort({ experience_years: -1 })
//     .skip(skip)
//     .limit(Number(limit));

//   res.json({
//     total,
//     page: Number(page),
//     results: docs,
//   });
// });

// // ── GET /api/doctors/me ───────────────────────────────────────────────────────

// const getMyProfile = asyncHandler(async (req, res) => {
//   const profile = await DoctorProfile.findOne({
//     user_id: req.user._id,
//   }).populate("user_id", "name email created_at");

//   if (!profile) {
//     return res.status(404).json({
//       error: "Doctor profile not found",
//     });
//   }

//   res.json(profile);
// });

// // ── PATCH /api/doctors/me ─────────────────────────────────────────────────────

// const updateMyProfile = asyncHandler(async (req, res) => {
//   const {
//     specialty,
//     sub_specialty,
//     hospital_clinic,
//     experience_years,
//     location,
//     contact,
//   } = req.body;

//   const update = {};

//   if (specialty !== undefined) {
//     update.specialty = specialty;
//   }

//   if (sub_specialty !== undefined) {
//     update.sub_specialty = sub_specialty;
//   }

//   if (hospital_clinic !== undefined) {
//     update.hospital_clinic = hospital_clinic;
//   }

//   if (experience_years !== undefined) {
//     update.experience_years = Number(experience_years);
//   }

//   if (location?.city !== undefined) {
//     update["location.city"] = location.city;
//   }

//   if (location?.address !== undefined) {
//     update["location.address"] = location.address;
//   }

//   if (contact?.phone !== undefined) {
//     update["contact.phone"] = contact.phone;
//   }

//   const profile = await DoctorProfile.findOneAndUpdate(
//     { user_id: req.user._id },
//     { $set: update },
//     { new: true }
//   ).populate("user_id", "name email created_at");

//   if (!profile) {
//     return res.status(404).json({
//       error: "Doctor profile not found",
//     });
//   }

//   res.json(profile);
// });

// // ── GET /api/doctors/:id ──────────────────────────────────────────────────────

// const getDoctorById = asyncHandler(async (req, res) => {
//   const profile = await DoctorProfile.findById(req.params.id)
//     .select("-pmdc_certificate_url -rejection_reason -verified_by")
//     .populate("user_id", "name");

//   if (!profile) {
//     return res.status(404).json({
//       error: "Doctor not found",
//     });
//   }

//   res.json(profile);
// });

// // ── GET /api/doctors/:id/availability ──────────────────────────────────────────
// // IMPORTANT:
// // Calendar dates are treated as DATE-ONLY values.
// // Do NOT use new Date("YYYY-MM-DD") here because that introduces timezone
// // conversion problems.

// const getDoctorAvailability = asyncHandler(async (req, res) => {
//   const Appointment = require("../models/Appointment");

//   const avail = await DoctorAvailability.findOne({
//     doctor_id: req.params.id,
//   });

//   if (!avail) {
//     return res.status(404).json({
//       error: "No availability record found",
//     });
//   }

//   // No specific date requested
//   if (!req.query.date) {
//     return res.json({
//       weekly_schedule: avail.weekly_schedule,
//       slot_duration_minutes: avail.slot_duration_minutes,
//       exceptions: avail.exceptions,
//     });
//   }

//   // Keep the date exactly as YYYY-MM-DD.
//   const requestedDate = String(req.query.date).slice(0, 10);

//   if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
//     return res.status(400).json({
//       error: "Invalid date format. Expected YYYY-MM-DD",
//     });
//   }

//   // Find exception using calendar-date comparison.
//   //
//   // This supports:
//   //   new String dates -> "2026-09-04"
//   //   old Date values  -> "2026-09-04..."
//   //
//   // So existing records won't immediately stop working.
//   const exception = avail.exceptions.find((ex) => {
//     if (!ex.date) return false;

//     if (typeof ex.date === "string") {
//       return ex.date.slice(0, 10) === requestedDate;
//     }

//     // Existing MongoDB Date value.
//     const year = ex.date.getFullYear();
//     const month = String(ex.date.getMonth() + 1).padStart(2, "0");
//     const day = String(ex.date.getDate()).padStart(2, "0");

//     return `${year}-${month}-${day}` === requestedDate;
//   });

//   // Doctor specifically marked this date unavailable.
//   if (exception && !exception.available) {
//     return res.json({
//       date: requestedDate,
//       slots: [],
//       reason: "Doctor unavailable on this date",
//     });
//   }

//   // Doctor specifically configured custom hours for this date.
//   const schedule = exception?.custom_hours
//     ? [
//         {
//           start_time: exception.custom_hours.start_time,
//           end_time: exception.custom_hours.end_time,
//         },
//       ]
//     : [];

//   if (schedule.length === 0) {
//     return res.json({
//       date: requestedDate,
//       slots: [],
//       reason: "Not a working day",
//     });
//   }

//   // Generate slots.
//   const dur = Number(avail.slot_duration_minutes);

//   const allSlots = [];

//   for (const window of schedule) {
//     const [sh, sm] = window.start_time.split(":").map(Number);
//     const [eh, em] = window.end_time.split(":").map(Number);

//     let cur = sh * 60 + sm;
//     const end = eh * 60 + em;

//     while (cur + dur <= end) {
//       const startHour = String(
//         Math.floor(cur / 60)
//       ).padStart(2, "0");

//       const startMinute = String(
//         cur % 60
//       ).padStart(2, "0");

//       const endMinutes = cur + dur;

//       const endHour = String(
//         Math.floor(endMinutes / 60)
//       ).padStart(2, "0");

//       const endMinute = String(
//         endMinutes % 60
//       ).padStart(2, "0");

//       allSlots.push({
//         start_time: `${startHour}:${startMinute}`,
//         end_time: `${endHour}:${endMinute}`,
//       });

//       cur += dur;
//     }
//   }

//   // Find appointments for THIS calendar date.
//   //
//   // IMPORTANT:
//   // requested_slot.date should now be stored as "YYYY-MM-DD".
//   // We intentionally do NOT create dayStart/dayEnd using JS Date.
//   const booked = await Appointment.find({
//     doctor_id: req.params.id,
//     "requested_slot.date": requestedDate,
//     status: {
//       $in: [
//         "confirmed",
//         "pending_admin_review",
//       ],
//     },
//   });

//   const bookedTimes = new Set(
//     booked
//       .map((appointment) => appointment.requested_slot?.start_time)
//       .filter(Boolean)
//   );

//   const openSlots = allSlots.filter(
//     (slot) => !bookedTimes.has(slot.start_time)
//   );

//   return res.json({
//     date: requestedDate,
//     slots: openSlots,
//     slot_duration_minutes: dur,
//   });
// });

// // ── PATCH /api/doctors/me/availability ────────────────────────────────────────

// const updateMyAvailability = asyncHandler(async (req, res) => {
//   const profile = await DoctorProfile.findOne({
//     user_id: req.user._id,
//   });

//   if (!profile) {
//     return res.status(404).json({
//       error: "Doctor profile not found",
//     });
//   }

//   const {
//     slot_duration_minutes,
//     exceptions,
//   } = req.body;

//   const update = {};

//   if (
//     slot_duration_minutes !== undefined &&
//     slot_duration_minutes !== null
//   ) {
//     update.slot_duration_minutes =
//       Number(slot_duration_minutes);
//   }

//   if (Array.isArray(exceptions)) {
//     update.exceptions = exceptions.map((exception) => ({
//       // IMPORTANT:
//       // Store calendar dates as strings, not JS Date objects.
//       date: String(exception.date).slice(0, 10),

//       available: Boolean(exception.available),

//       custom_hours: exception.custom_hours
//         ? {
//             start_time: exception.custom_hours.start_time,
//             end_time: exception.custom_hours.end_time,
//           }
//         : null,
//     }));

//     // UI is using exceptions/date-specific availability.
//     update.weekly_schedule = [];
//   }

//   const avail =
//     await DoctorAvailability.findOneAndUpdate(
//       { doctor_id: profile._id },
//       { $set: update },
//       {
//         new: true,
//         upsert: true,
//         runValidators: true,
//       }
//     );

//   return res.json(avail);
// });

// // ── GET /api/admin/doctors ────────────────────────────────────────────────────

// const adminListDoctors = asyncHandler(async (req, res) => {
//   const {
//     status,
//     page = 1,
//     limit = 50,
//   } = req.query;

//   const filter = status ? { status } : {};

//   const skip =
//     (Number(page) - 1) * Number(limit);

//   const total =
//     await DoctorProfile.countDocuments(filter);

//   const docs =
//     await DoctorProfile.find(filter)
//       .sort({ created_at: -1 })
//       .skip(skip)
//       .limit(Number(limit));

//   res.json({
//     total,
//     page: Number(page),
//     results: docs,
//   });
// });

// // ── PATCH /api/admin/doctors/:id/verify ───────────────────────────────────────

// const adminVerifyDoctor = asyncHandler(async (req, res) => {
//   const {
//     decision,
//     rejection_reason,
//   } = req.body;

//   if (!["approve", "reject"].includes(decision)) {
//     return res.status(400).json({
//       error: "decision must be 'approve' or 'reject'",
//     });
//   }

//   const profile =
//     await DoctorProfile.findById(req.params.id);

//   if (!profile) {
//     return res.status(404).json({
//       error: "Doctor profile not found",
//     });
//   }

//   if (profile.status !== "pending") {
//     return res.status(409).json({
//       error: `Doctor is already ${profile.status}`,
//     });
//   }

//   if (decision === "approve") {
//     profile.status = "verified";
//     profile.verified_by = req.user._id;
//     profile.verified_at = new Date();
//   } else {
//     if (!rejection_reason?.trim()) {
//       return res.status(400).json({
//         error:
//           "rejection_reason is required when rejecting",
//       });
//     }

//     profile.status = "rejected";
//     profile.rejection_reason =
//       rejection_reason.trim();
//   }

//   await profile.save();

//   res.json({
//     message: `Doctor ${
//       decision === "approve"
//         ? "approved"
//         : "rejected"
//     }`,
//     profile,
//   });
// });

// // ── GET /api/doctors/:id/dashboard-summary ────────────────────────────────────

// const getDashboardSummary = asyncHandler(async (req, res) => {
//   const Appointment =
//     require("../models/Appointment");

//   const PatientDoctorAssignment =
//     require("../models/PatientDoctorAssignment");

//   const profile =
//     await DoctorProfile.findById(
//       req.params.id
//     ).select("_id");

//   if (!profile) {
//     return res.status(404).json({
//       error: "Doctor not found",
//     });
//   }

//   if (req.user.role === "doctor") {
//     const myProfile =
//       await DoctorProfile.findOne({
//         user_id: req.user._id,
//       }).select("_id");

//     if (
//       !myProfile ||
//       myProfile._id.toString() !==
//         req.params.id
//     ) {
//       return res.status(403).json({
//         error: "Access denied",
//       });
//     }
//   }

//   const [
//     totalPatients,
//     ongoing,
//     pendingNew,
//     completed,
//   ] = await Promise.all([
//     PatientDoctorAssignment.countDocuments({
//       doctor_id: profile._id,
//       status: "active",
//     }),

//     Appointment.countDocuments({
//       doctor_id: profile._id,
//       status: "confirmed",
//     }),

//     Appointment.countDocuments({
//       doctor_id: profile._id,
//       status: "confirmed",
//       doctor_viewed: { $ne: true },
//     }),

//     Appointment.countDocuments({
//       doctor_id: profile._id,
//       status: "completed",
//     }),
//   ]);

//   res.json({
//     total_patients: totalPatients,
//     ongoing,
//     pending_new: pendingNew,
//     completed,
//   });
// });

// // ── Exports ───────────────────────────────────────────────────────────────────

// module.exports = {
//   register,
//   searchDoctors,
//   getMyProfile,
//   updateMyProfile,
//   getDoctorById,
//   getDoctorAvailability,
//   updateMyAvailability,
//   adminListDoctors,
//   adminVerifyDoctor,
//   getDashboardSummary,
// };





// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function normalizeCalendarDate(value) {
  if (!value) return null;

  const date = String(value).slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return date;
}

// Local (not UTC-shifted) "today" as YYYY-MM-DD — same safe pattern used
// everywhere else for calendar dates.
function todayCalendarDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/doctors/register
// ─────────────────────────────────────────────────────────────────────────────

const register = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    password,
    confirmPassword,
    pmdc_number,
    specialty,
    sub_specialty,
    gender,
    hospital_clinic,
    experience_years,
    city,
    address,
    education,
  } = req.body;

  if (
    !firstName ||
    !lastName ||
    !email ||
    !phone ||
    !password ||
    !pmdc_number ||
    !specialty ||
    !gender ||
    !city
  ) {
    return res.status(400).json({
      error:
        "firstName, lastName, email, phone, password, pmdc_number, specialty, gender and city are required",
    });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({
      error: "Invalid email format",
    });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error:
        "Password must be at least 8 characters and contain at least one letter and one number",
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      error: "Passwords do not match",
    });
  }

  if (!["male", "female"].includes(gender)) {
    return res.status(400).json({
      error: "gender must be 'male' or 'female'",
    });
  }

  if (await User.findOne({ email })) {
    return res.status(409).json({
      error: "Email already registered",
    });
  }

  if (
    await DoctorProfile.findOne({
      pmdc_number: pmdc_number.toUpperCase(),
    })
  ) {
    return res.status(409).json({
      error: "PMDC number already registered",
    });
  }

  const name = `${firstName.trim()} ${lastName.trim()}`;

  const user = await User.create({
    name,
    email,
    password,
    role: "doctor",
  });

  let profile;

  try {
    profile = await DoctorProfile.create({
      user_id: user._id,
      pmdc_number,
      specialty,
      sub_specialty: sub_specialty || "",
      gender,

      location: {
        city,
        address: address || "",
      },

      contact: {
        phone,
        email,
      },

      education: Array.isArray(education) ? education : [],

      experience_years: experience_years
        ? Number(experience_years)
        : 0,

      hospital_clinic: hospital_clinic || "",
    });
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    throw err;
  }

  await DoctorAvailability.create({
    doctor_id: profile._id,
  });

  res.status(201).json({
    token: signToken(user._id),

    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      patient_id: null,

      doctor_profile: {
        id: profile._id,
        status: profile.status,
        specialty: profile.specialty,
      },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/doctors
// ─────────────────────────────────────────────────────────────────────────────

const searchDoctors = asyncHandler(async (req, res) => {
  const {
    specialty,
    sub_specialty,
    gender,
    city,
    hospital_clinic,
    min_experience,
    max_experience,
    education_degree,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = {
    status: "verified",
  };

  if (specialty) {
    filter.specialty = {
      $regex: specialty,
      $options: "i",
    };
  }

  if (sub_specialty) {
    filter.sub_specialty = {
      $regex: sub_specialty,
      $options: "i",
    };
  }

  if (gender) {
    filter.gender = gender;
  }

  if (city) {
    filter["location.city"] = {
      $regex: city,
      $options: "i",
    };
  }

  if (hospital_clinic) {
    filter.hospital_clinic = {
      $regex: hospital_clinic,
      $options: "i",
    };
  }

  if (min_experience || max_experience) {
    filter.experience_years = {};

    if (min_experience) {
      filter.experience_years.$gte = Number(min_experience);
    }

    if (max_experience) {
      filter.experience_years.$lte = Number(max_experience);
    }
  }

  if (education_degree) {
    filter["education.degree"] = {
      $regex: education_degree,
      $options: "i",
    };
  }

  const skip =
    (Number(page) - 1) * Number(limit);

  const total =
    await DoctorProfile.countDocuments(filter);

  const docs =
    await DoctorProfile.find(filter)
      .select(
        "-pmdc_certificate_url -rejection_reason -verified_by"
      )
      .populate("user_id", "name")
      .sort({
        experience_years: -1,
      })
      .skip(skip)
      .limit(Number(limit));

  res.json({
    total,
    page: Number(page),
    results: docs,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/doctors/me
// ─────────────────────────────────────────────────────────────────────────────

const getMyProfile = asyncHandler(async (req, res) => {
  const profile =
    await DoctorProfile.findOne({
      user_id: req.user._id,
    }).populate(
      "user_id",
      "name email created_at"
    );

  if (!profile) {
    return res.status(404).json({
      error: "Doctor profile not found",
    });
  }

  res.json(profile);
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/doctors/me
// ─────────────────────────────────────────────────────────────────────────────

const updateMyProfile = asyncHandler(async (req, res) => {
  const {
    specialty,
    sub_specialty,
    hospital_clinic,
    experience_years,
    location,
    contact,
  } = req.body;

  const update = {};

  if (specialty !== undefined) {
    update.specialty = specialty;
  }

  if (sub_specialty !== undefined) {
    update.sub_specialty = sub_specialty;
  }

  if (hospital_clinic !== undefined) {
    update.hospital_clinic = hospital_clinic;
  }

  if (experience_years !== undefined) {
    update.experience_years =
      Number(experience_years);
  }

  if (location?.city !== undefined) {
    update["location.city"] = location.city;
  }

  if (location?.address !== undefined) {
    update["location.address"] =
      location.address;
  }

  if (contact?.phone !== undefined) {
    update["contact.phone"] =
      contact.phone;
  }

  const profile =
    await DoctorProfile.findOneAndUpdate(
      {
        user_id: req.user._id,
      },
      {
        $set: update,
      },
      {
        new: true,
      }
    ).populate(
      "user_id",
      "name email created_at"
    );

  if (!profile) {
    return res.status(404).json({
      error: "Doctor profile not found",
    });
  }

  res.json(profile);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/doctors/:id
// ─────────────────────────────────────────────────────────────────────────────

const getDoctorById = asyncHandler(async (req, res) => {
  const profile =
    await DoctorProfile.findById(
      req.params.id
    )
      .select(
        "-pmdc_certificate_url -rejection_reason -verified_by"
      )
      .populate("user_id", "name");

  if (!profile) {
    return res.status(404).json({
      error: "Doctor not found",
    });
  }

  res.json(profile);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/doctors/:id/availability/dates
//
// NEW ENDPOINT — for the patient-side "pick a date" buttons.
// Returns every future date the doctor has explicitly marked available,
// along with whether it's a capacity-mode day and (if so) whether it's
// already full. The patient app uses this instead of a free-form
// calendar, since the doctor now only makes SPECIFIC dates bookable.
// ─────────────────────────────────────────────────────────────────────────────

const getDoctorAvailableDates =
  asyncHandler(async (req, res) => {
    const Appointment =
      require("../models/Appointment");

    const avail =
      await DoctorAvailability.findOne({
        doctor_id: req.params.id,
      });

    if (!avail) {
      return res.json({ dates: [] });
    }

    const todayStr = todayCalendarDate();

    const upcoming = (avail.exceptions || [])
      .filter(
        (ex) =>
          ex.available &&
          normalizeCalendarDate(ex.date) &&
          normalizeCalendarDate(ex.date) >= todayStr
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    const results = await Promise.all(
      upcoming.map(async (ex) => {
        const startTime = ex.custom_hours?.start_time || null;
        const endTime = ex.custom_hours?.end_time || null;

        if (ex.max_patients) {
          const bookedCount =
            await Appointment.countDocuments({
              doctor_id: req.params.id,
              "requested_slot.date": ex.date,
              status: {
                $in: ["confirmed", "pending_admin_review"],
              },
            });

          const spotsLeft =
            ex.max_patients - bookedCount;

          return {
            date: ex.date,
            capacity_mode: true,
            start_time: startTime,
            end_time: endTime,
            max_patients: ex.max_patients,
            spots_left: Math.max(spotsLeft, 0),
            full: spotsLeft <= 0,
          };
        }

        return {
          date: ex.date,
          capacity_mode: false,
          start_time: startTime,
          end_time: endTime,
          // Fullness for normal per-slot days is only known once the
          // patient fetches actual slots for that date (there could
          // still be free slots even if some are booked).
          full: false,
        };
      })
    );

    res.json({ dates: results });
  });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/doctors/:id/availability
// ─────────────────────────────────────────────────────────────────────────────

const getDoctorAvailability =
  asyncHandler(async (req, res) => {
    const Appointment =
      require("../models/Appointment");

    const avail =
      await DoctorAvailability.findOne({
        doctor_id: req.params.id,
      });

    if (!avail) {
      return res.status(404).json({
        error: "No availability record found",
      });
    }

    // No date requested
    if (!req.query.date) {
      return res.json({
        weekly_schedule:
          avail.weekly_schedule,

        slot_duration_minutes:
          avail.slot_duration_minutes,

        exceptions:
          avail.exceptions,
      });
    }

    // Always keep calendar dates as YYYY-MM-DD
    const requestedDate =
      normalizeCalendarDate(req.query.date);

    if (!requestedDate) {
      return res.status(400).json({
        error:
          "Invalid date format. Expected YYYY-MM-DD",
      });
    }

    // ────────────────────────────────────────
    // Find date exception
    // ────────────────────────────────────────

    const exception =
      (avail.exceptions || []).find((ex) => {
        if (!ex.date) return false;

        return (
          normalizeCalendarDate(ex.date) ===
          requestedDate
        );
      });

    // Doctor unavailable on this date
    if (
      exception &&
      !exception.available
    ) {
      return res.json({
        date: requestedDate,
        slots: [],
        reason:
          "Doctor unavailable on this date",
      });
    }

    // ────────────────────────────────────────
    // NEW: Capacity mode ("walk-in" style day)
    //
    // Instead of dividing the window into fixed-duration slots, the
    // whole window is ONE bookable "slot" that up to max_patients
    // patients can all book.
    // ────────────────────────────────────────

    if (exception?.max_patients && exception.custom_hours) {
      const bookedCount =
        await Appointment.countDocuments({
          doctor_id: req.params.id,
          "requested_slot.date": requestedDate,
          status: {
            $in: ["confirmed", "pending_admin_review"],
          },
        });

      const spotsLeft =
        exception.max_patients - bookedCount;

      if (spotsLeft <= 0) {
        return res.json({
          date: requestedDate,
          slots: [],
          full: true,
          reason:
            "This day is fully booked — please choose another date",
        });
      }

      return res.json({
        date: requestedDate,
        slots: [
          {
            start_time: exception.custom_hours.start_time,
            end_time: exception.custom_hours.end_time,
          },
        ],
        capacity_mode: true,
        spots_left: spotsLeft,
        max_patients: exception.max_patients,
      });
    }

    // ────────────────────────────────────────
    // Custom hours (normal fixed-duration mode)
    // ────────────────────────────────────────

    const schedule =
      exception?.custom_hours
        ? [
            {
              start_time:
                exception.custom_hours.start_time,

              end_time:
                exception.custom_hours.end_time,
            },
          ]
        : [];

    // This controller uses date-specific
    // availability.
    if (schedule.length === 0) {
      return res.json({
        date: requestedDate,
        slots: [],
        reason: "Not a working day",
      });
    }

    // ────────────────────────────────────────
    // Generate slots
    // ────────────────────────────────────────

    const dur =
      Number(avail.slot_duration_minutes);

    if (!dur || dur <= 0) {
      return res.status(500).json({
        error:
          "Invalid slot duration configured for doctor",
      });
    }

    const allSlots = [];

    for (const window of schedule) {
      if (
        !window.start_time ||
        !window.end_time
      ) {
        continue;
      }

      const [sh, sm] =
        window.start_time
          .split(":")
          .map(Number);

      const [eh, em] =
        window.end_time
          .split(":")
          .map(Number);

      let cur = sh * 60 + sm;
      const end = eh * 60 + em;

      while (cur + dur <= end) {
        const startHour =
          String(
            Math.floor(cur / 60)
          ).padStart(2, "0");

        const startMinute =
          String(cur % 60).padStart(2, "0");

        const endMinutes =
          cur + dur;

        const endHour =
          String(
            Math.floor(endMinutes / 60)
          ).padStart(2, "0");

        const endMinute =
          String(
            endMinutes % 60
          ).padStart(2, "0");

        allSlots.push({
          start_time:
            `${startHour}:${startMinute}`,

          end_time:
            `${endHour}:${endMinute}`,
        });

        cur += dur;
      }
    }

    // ────────────────────────────────────────
    // Find booked appointments
    //
    // IMPORTANT:
    // requested_slot.date is now a
    // YYYY-MM-DD STRING.
    // ────────────────────────────────────────

    const booked =
      await Appointment.find({
        doctor_id: req.params.id,

        "requested_slot.date":
          requestedDate,

        status: {
          $in: [
            "confirmed",
            "pending_admin_review",
          ],
        },
      });

    const bookedTimes =
      new Set(
        booked
          .map(
            (appointment) =>
              appointment.requested_slot
                ?.start_time
          )
          .filter(Boolean)
      );

    // Remove booked slots
    const openSlots =
      allSlots.filter(
        (slot) =>
          !bookedTimes.has(
            slot.start_time
          )
      );

    return res.json({
      date: requestedDate,
      slots: openSlots,
      slot_duration_minutes: dur,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/doctors/me/availability
// ─────────────────────────────────────────────────────────────────────────────

const updateMyAvailability =
  asyncHandler(async (req, res) => {
    const profile =
      await DoctorProfile.findOne({
        user_id: req.user._id,
      });

    if (!profile) {
      return res.status(404).json({
        error: "Doctor profile not found",
      });
    }

    const {
      slot_duration_minutes,
      exceptions,
    } = req.body;

    const update = {};

    if (
      slot_duration_minutes !==
        undefined &&
      slot_duration_minutes !== null
    ) {
      const duration =
        Number(slot_duration_minutes);

      if (!Number.isFinite(duration) ||
          duration <= 0) {
        return res.status(400).json({
          error:
            "slot_duration_minutes must be a positive number",
        });
      }

      update.slot_duration_minutes =
        duration;
    }

    if (Array.isArray(exceptions)) {
      const normalizedExceptions =
        [];

      for (const exception of exceptions) {
        const date =
          normalizeCalendarDate(
            exception.date
          );

        if (!date) {
          return res.status(400).json({
            error:
              "Invalid exception date. Expected YYYY-MM-DD",
          });
        }

        // NEW: capacity mode validation.
        // max_patients only makes sense alongside custom_hours (you
        // need a time window to say "up to N patients within this
        // window").
        let maxPatients = null;

        if (
          exception.max_patients !== undefined &&
          exception.max_patients !== null &&
          exception.max_patients !== ""
        ) {
          const n = Number(exception.max_patients);

          if (!Number.isFinite(n) || n < 1) {
            return res.status(400).json({
              error:
                "max_patients must be a positive number",
            });
          }

          if (!exception.custom_hours) {
            return res.status(400).json({
              error:
                "max_patients requires custom_hours (a start/end time window) to also be set",
            });
          }

          maxPatients = n;
        }

        normalizedExceptions.push({
          // IMPORTANT:
          // calendar date is stored as STRING
          date,

          available:
            Boolean(
              exception.available
            ),

          custom_hours:
            exception.custom_hours
              ? {
                  start_time:
                    exception
                      .custom_hours
                      .start_time,

                  end_time:
                    exception
                      .custom_hours
                      .end_time,
                }
              : null,

          max_patients: maxPatients,
        });
      }

      update.exceptions =
        normalizedExceptions;

      // UI uses date-specific availability
      update.weekly_schedule = [];
    }

    const avail =
      await DoctorAvailability.findOneAndUpdate(
        {
          doctor_id: profile._id,
        },
        {
          $set: update,
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
        }
      );

    return res.json(avail);
  });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/doctors
// ─────────────────────────────────────────────────────────────────────────────

const adminListDoctors =
  asyncHandler(async (req, res) => {
    const {
      status,
      page = 1,
      limit = 50,
    } = req.query;

    const filter =
      status ? { status } : {};

    const skip =
      (Number(page) - 1) *
      Number(limit);

    const total =
      await DoctorProfile.countDocuments(
        filter
      );

    const docs =
      await DoctorProfile.find(filter)
        .sort({
          created_at: -1,
        })
        .skip(skip)
        .limit(Number(limit));

    res.json({
      total,
      page: Number(page),
      results: docs,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/doctors/:id/verify
// ─────────────────────────────────────────────────────────────────────────────

const adminVerifyDoctor =
  asyncHandler(async (req, res) => {
    const {
      decision,
      rejection_reason,
    } = req.body;

    if (
      !["approve", "reject"].includes(
        decision
      )
    ) {
      return res.status(400).json({
        error:
          "decision must be 'approve' or 'reject'",
      });
    }

    const profile =
      await DoctorProfile.findById(
        req.params.id
      );

    if (!profile) {
      return res.status(404).json({
        error:
          "Doctor profile not found",
      });
    }

    if (profile.status !== "pending") {
      return res.status(409).json({
        error:
          `Doctor is already ${profile.status}`,
      });
    }

    if (decision === "approve") {
      profile.status = "verified";
      profile.verified_by =
        req.user._id;
      profile.verified_at =
        new Date();
    } else {
      if (
        !rejection_reason?.trim()
      ) {
        return res.status(400).json({
          error:
            "rejection_reason is required when rejecting",
        });
      }

      profile.status = "rejected";

      profile.rejection_reason =
        rejection_reason.trim();
    }

    await profile.save();

    res.json({
      message:
        `Doctor ${
          decision === "approve"
            ? "approved"
            : "rejected"
        }`,

      profile,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/doctors/:id/dashboard-summary
// ─────────────────────────────────────────────────────────────────────────────

const getDashboardSummary =
  asyncHandler(async (req, res) => {
    const Appointment =
      require("../models/Appointment");

    const PatientDoctorAssignment =
      require(
        "../models/PatientDoctorAssignment"
      );

    const profile =
      await DoctorProfile.findById(
        req.params.id
      ).select("_id");

    if (!profile) {
      return res.status(404).json({
        error: "Doctor not found",
      });
    }

    if (req.user.role === "doctor") {
      const myProfile =
        await DoctorProfile.findOne({
          user_id: req.user._id,
        }).select("_id");

      if (
        !myProfile ||
        myProfile._id.toString() !==
          req.params.id
      ) {
        return res.status(403).json({
          error: "Access denied",
        });
      }
    }

    const [
      totalPatients,
      ongoing,
      pendingNew,
      completed,
    ] = await Promise.all([
      PatientDoctorAssignment.countDocuments({
        doctor_id: profile._id,
        status: "active",
      }),

      Appointment.countDocuments({
        doctor_id: profile._id,
        status: "confirmed",
      }),

      Appointment.countDocuments({
        doctor_id: profile._id,
        status: "confirmed",
        doctor_viewed: {
          $ne: true,
        },
      }),

      Appointment.countDocuments({
        doctor_id: profile._id,
        status: "completed",
      }),
    ]);

    res.json({
      total_patients: totalPatients,
      ongoing,
      pending_new: pendingNew,
      completed,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  register,
  searchDoctors,
  getMyProfile,
  updateMyProfile,
  getDoctorById,
  getDoctorAvailableDates,
  getDoctorAvailability,
  updateMyAvailability,
  adminListDoctors,
  adminVerifyDoctor,
  getDashboardSummary,
};
