const admin              = require("../config/firebase");
const { AppError }       = require("../utils/errors");
const { isStrongPassword, validateEmail } = require("../utils/validation");
const { normalizeCalendarDate, todayCalendarDate } = require("../utils/date");
const User               = require("../models/User");
const DoctorProfile      = require("../models/DoctorProfile");
const DoctorAvailability = require("../models/DoctorAvailability");

// ── POST /api/doctors/register ────────────────────────────────────────────────

async function registerDoctor(body) {
  const {
    firstName, lastName, email, phone, password, confirmPassword,
    pmdc_number, specialty, sub_specialty, gender,
    hospital_clinic, experience_years, city, address, education,
  } = body;

  if (!firstName || !lastName || !email || !phone || !password || !pmdc_number || !specialty || !gender || !city)
    throw new AppError("firstName, lastName, email, phone, password, pmdc_number, specialty, gender and city are required", 400);
  if (!validateEmail(email))
    throw new AppError("Invalid email format", 400);
  if (!isStrongPassword(password))
    throw new AppError("Password must be at least 8 characters and contain at least one letter and one number", 400);
  if (password !== confirmPassword)
    throw new AppError("Passwords do not match", 400);
  if (!["male", "female"].includes(gender))
    throw new AppError("gender must be 'male' or 'female'", 400);
  if (await User.findOne({ email }))
    throw new AppError("Email already registered", 409);
  if (await DoctorProfile.findOne({ pmdc_number: pmdc_number.toUpperCase() }))
    throw new AppError("PMDC number already registered", 409);

  // Create Firebase account with disabled:true — matches pending status, blocks sign-in until admin approves
  let fbUser;
  try {
    fbUser = await admin.auth().createUser({ email, password, emailVerified: false, disabled: true });
  } catch (fbErr) {
    if (fbErr.code === "auth/email-already-exists") throw new AppError("Email already registered", 409);
    throw fbErr;
  }

  const name = `${firstName.trim()} ${lastName.trim()}`;
  let user;
  try {
    user = await User.create({ name, email, role: "doctor", provider_uid: fbUser.uid });
  } catch (err) {
    await admin.auth().deleteUser(fbUser.uid).catch(() => {});
    throw err;
  }

  let profile;
  try {
    profile = await DoctorProfile.create({
      user_id:          user._id,
      pmdc_number,
      specialty,
      sub_specialty:    sub_specialty || "",
      gender,
      location:         { city, address: address || "" },
      contact:          { phone, email },
      education:        Array.isArray(education) ? education : [],
      experience_years: experience_years ? Number(experience_years) : 0,
      hospital_clinic:  hospital_clinic || "",
    });
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    await admin.auth().deleteUser(fbUser.uid).catch(() => {});
    throw err;
  }

  await DoctorAvailability.create({ doctor_id: profile._id });

  return {
    user: {
      id:             user._id,
      name:           user.name,
      email:          user.email,
      role:           user.role,
      patient_id:     null,
      doctor_profile: { id: profile._id, status: profile.status, specialty: profile.specialty },
    },
  };
}

// ── GET /api/doctors ──────────────────────────────────────────────────────────

async function searchDoctors(query) {
  const {
    specialty, sub_specialty, gender, city, hospital_clinic,
    min_experience, max_experience, education_degree,
    page = 1, limit = 20,
  } = query;

  const filter = { status: "verified" };
  if (specialty)       filter.specialty              = { $regex: specialty,       $options: "i" };
  if (sub_specialty)   filter.sub_specialty          = { $regex: sub_specialty,   $options: "i" };
  if (gender)          filter.gender                 = gender;
  if (city)            filter["location.city"]       = { $regex: city,            $options: "i" };
  if (hospital_clinic) filter.hospital_clinic        = { $regex: hospital_clinic, $options: "i" };
  if (min_experience || max_experience) {
    filter.experience_years = {};
    if (min_experience) filter.experience_years.$gte = Number(min_experience);
    if (max_experience) filter.experience_years.$lte = Number(max_experience);
  }
  if (education_degree) filter["education.degree"] = { $regex: education_degree, $options: "i" };

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await DoctorProfile.countDocuments(filter);
  const docs  = await DoctorProfile.find(filter)
    .select("-pmdc_certificate_url -rejection_reason -verified_by")
    .populate("user_id", "name")
    .sort({ experience_years: -1 })
    .skip(skip)
    .limit(Number(limit));

  return { total, page: Number(page), results: docs };
}

// ── GET /api/doctors/me ───────────────────────────────────────────────────────

async function getMyProfile(userId) {
  const profile = await DoctorProfile.findOne({ user_id: userId })
    .populate("user_id", "name email created_at");
  if (!profile) throw new AppError("Doctor profile not found", 404);
  return profile;
}

// ── PATCH /api/doctors/me ─────────────────────────────────────────────────────

async function updateMyProfile(userId, body) {
  const { specialty, sub_specialty, hospital_clinic, experience_years, location, contact } = body;
  const update = {};
  if (specialty         !== undefined) update.specialty              = specialty;
  if (sub_specialty     !== undefined) update.sub_specialty          = sub_specialty;
  if (hospital_clinic   !== undefined) update.hospital_clinic        = hospital_clinic;
  if (experience_years  !== undefined) update.experience_years       = Number(experience_years);
  if (location?.city    !== undefined) update["location.city"]       = location.city;
  if (location?.address !== undefined) update["location.address"]    = location.address;
  if (contact?.phone    !== undefined) update["contact.phone"]       = contact.phone;

  const profile = await DoctorProfile.findOneAndUpdate(
    { user_id: userId },
    { $set: update },
    { new: true }
  ).populate("user_id", "name email created_at");

  if (!profile) throw new AppError("Doctor profile not found", 404);
  return profile;
}

// ── GET /api/doctors/:id ──────────────────────────────────────────────────────

async function getDoctorById(id) {
  const profile = await DoctorProfile.findById(id)
    .select("-pmdc_certificate_url -rejection_reason -verified_by")
    .populate("user_id", "name");
  if (!profile) throw new AppError("Doctor not found", 404);
  return profile;
}

// ── GET /api/doctors/:id/availability/dates ───────────────────────────────────

async function getDoctorAvailableDates(doctorProfileId) {
  const Appointment = require("../models/Appointment");
  const avail = await DoctorAvailability.findOne({ doctor_id: doctorProfileId });
  if (!avail) return { dates: [] };

  const todayStr  = todayCalendarDate();
  const upcoming  = (avail.exceptions || [])
    .filter(ex => ex.available && normalizeCalendarDate(ex.date) && normalizeCalendarDate(ex.date) >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const results = await Promise.all(
    upcoming.map(async (ex) => {
      const startTime = ex.custom_hours?.start_time || null;
      const endTime   = ex.custom_hours?.end_time   || null;

      if (ex.max_patients) {
        const bookedCount = await Appointment.countDocuments({
          doctor_id: doctorProfileId,
          "requested_slot.date": ex.date,
          status: { $in: ["confirmed", "pending_admin_review"] },
        });
        const spotsLeft = ex.max_patients - bookedCount;
        return {
          date: ex.date, capacity_mode: true, start_time: startTime, end_time: endTime,
          max_patients: ex.max_patients, spots_left: Math.max(spotsLeft, 0), full: spotsLeft <= 0,
        };
      }

      return { date: ex.date, capacity_mode: false, start_time: startTime, end_time: endTime, full: false };
    })
  );

  return { dates: results };
}

// ── GET /api/doctors/:id/availability ────────────────────────────────────────

async function getDoctorAvailability(doctorProfileId, queryDate) {
  const Appointment = require("../models/Appointment");
  const avail = await DoctorAvailability.findOne({ doctor_id: doctorProfileId });
  if (!avail) throw new AppError("No availability record found", 404);

  if (!queryDate) {
    return {
      weekly_schedule:       avail.weekly_schedule,
      slot_duration_minutes: avail.slot_duration_minutes,
      exceptions:            avail.exceptions,
    };
  }

  const requestedDate = normalizeCalendarDate(queryDate);
  if (!requestedDate) throw new AppError("Invalid date format. Expected YYYY-MM-DD", 400);

  const exception = (avail.exceptions || []).find(
    ex => ex.date && normalizeCalendarDate(ex.date) === requestedDate
  );

  if (exception && !exception.available)
    return { date: requestedDate, slots: [], reason: "Doctor unavailable on this date" };

  // Capacity mode
  if (exception?.max_patients && exception.custom_hours) {
    const bookedCount = await Appointment.countDocuments({
      doctor_id: doctorProfileId,
      "requested_slot.date": requestedDate,
      status: { $in: ["confirmed", "pending_admin_review"] },
    });
    const spotsLeft = exception.max_patients - bookedCount;
    if (spotsLeft <= 0)
      return { date: requestedDate, slots: [], full: true, reason: "This day is fully booked — please choose another date" };
    return {
      date: requestedDate,
      slots: [{ start_time: exception.custom_hours.start_time, end_time: exception.custom_hours.end_time }],
      capacity_mode: true, spots_left: spotsLeft, max_patients: exception.max_patients,
    };
  }

  const schedule = exception?.custom_hours
    ? [{ start_time: exception.custom_hours.start_time, end_time: exception.custom_hours.end_time }]
    : [];

  if (!schedule.length)
    return { date: requestedDate, slots: [], reason: "Not a working day" };

  const dur = Number(avail.slot_duration_minutes);
  if (!dur || dur <= 0) throw new AppError("Invalid slot duration configured for doctor", 500);

  const allSlots = [];
  for (const window of schedule) {
    if (!window.start_time || !window.end_time) continue;
    const [sh, sm] = window.start_time.split(":").map(Number);
    const [eh, em] = window.end_time.split(":").map(Number);
    let cur        = sh * 60 + sm;
    const end      = eh * 60 + em;
    while (cur + dur <= end) {
      allSlots.push({
        start_time: `${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`,
        end_time:   `${String(Math.floor((cur + dur) / 60)).padStart(2, "0")}:${String((cur + dur) % 60).padStart(2, "0")}`,
      });
      cur += dur;
    }
  }

  const booked = await Appointment.find({
    doctor_id: doctorProfileId,
    "requested_slot.date": requestedDate,
    status: { $in: ["confirmed", "pending_admin_review"] },
  });
  const bookedTimes = new Set(booked.map(a => a.requested_slot?.start_time).filter(Boolean));
  const openSlots   = allSlots.filter(s => !bookedTimes.has(s.start_time));

  return { date: requestedDate, slots: openSlots, slot_duration_minutes: dur };
}

// ── PATCH /api/doctors/me/availability ────────────────────────────────────────

async function updateMyAvailability(userId, body) {
  const profile = await DoctorProfile.findOne({ user_id: userId });
  if (!profile) throw new AppError("Doctor profile not found", 404);

  const { slot_duration_minutes, exceptions } = body;
  const update = {};

  if (slot_duration_minutes !== undefined && slot_duration_minutes !== null) {
    const duration = Number(slot_duration_minutes);
    if (!Number.isFinite(duration) || duration <= 0)
      throw new AppError("slot_duration_minutes must be a positive number", 400);
    update.slot_duration_minutes = duration;
  }

  if (Array.isArray(exceptions)) {
    const normalizedExceptions = [];
    for (const exception of exceptions) {
      const date = normalizeCalendarDate(exception.date);
      if (!date) throw new AppError("Invalid exception date. Expected YYYY-MM-DD", 400);

      let maxPatients = null;
      if (exception.max_patients !== undefined && exception.max_patients !== null && exception.max_patients !== "") {
        const n = Number(exception.max_patients);
        if (!Number.isFinite(n) || n < 1) throw new AppError("max_patients must be a positive number", 400);
        if (!exception.custom_hours) throw new AppError("max_patients requires custom_hours (a start/end time window) to also be set", 400);
        maxPatients = n;
      }

      normalizedExceptions.push({
        date,
        available:    Boolean(exception.available),
        custom_hours: exception.custom_hours
          ? { start_time: exception.custom_hours.start_time, end_time: exception.custom_hours.end_time }
          : null,
        max_patients: maxPatients,
      });
    }
    update.exceptions      = normalizedExceptions;
    update.weekly_schedule = [];
  }

  return DoctorAvailability.findOneAndUpdate(
    { doctor_id: profile._id },
    { $set: update },
    { new: true, upsert: true, runValidators: true }
  );
}

// ── GET /api/admin/doctors ────────────────────────────────────────────────────

async function adminListDoctors({ status, page = 1, limit = 50 } = {}) {
  const filter = status ? { status } : {};
  const skip   = (Number(page) - 1) * Number(limit);
  const total  = await DoctorProfile.countDocuments(filter);
  const docs   = await DoctorProfile.find(filter).sort({ created_at: -1 }).skip(skip).limit(Number(limit));
  return { total, page: Number(page), results: docs };
}

// ── PATCH /api/admin/doctors/:id/verify ──────────────────────────────────────

async function adminVerifyDoctor(id, { decision, rejection_reason }, verifiedById) {
  if (!["approve", "reject"].includes(decision))
    throw new AppError("decision must be 'approve' or 'reject'", 400);

  const profile = await DoctorProfile.findById(id);
  if (!profile) throw new AppError("Doctor profile not found", 404);
  if (profile.status !== "pending") throw new AppError(`Doctor is already ${profile.status}`, 409);

  if (decision === "approve") {
    // Enable Firebase account first — if Firebase fails, we don't falsely mark approved in MongoDB
    const doctorUser = await User.findById(profile.user_id).select("provider_uid email");
    if (doctorUser?.provider_uid) {
      await admin.auth().updateUser(doctorUser.provider_uid, { disabled: false });
    }
    profile.status      = "verified";
    profile.verified_by = verifiedById;
    profile.verified_at = new Date();
  } else {
    if (!rejection_reason?.trim()) throw new AppError("rejection_reason is required when rejecting", 400);
    // Leave Firebase account disabled on rejection — do not delete it
    profile.status           = "rejected";
    profile.rejection_reason = rejection_reason.trim();
  }

  await profile.save();
  return { message: `Doctor ${decision === "approve" ? "approved" : "rejected"}`, profile };
}

// ── GET /api/doctors/:id/dashboard-summary ────────────────────────────────────

async function getDashboardSummary(profileId, requestingUser) {
  const Appointment             = require("../models/Appointment");
  const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");

  const profile = await DoctorProfile.findById(profileId).select("_id");
  if (!profile) throw new AppError("Doctor not found", 404);

  if (requestingUser.role === "doctor") {
    const myProfile = await DoctorProfile.findOne({ user_id: requestingUser._id }).select("_id");
    if (!myProfile || myProfile._id.toString() !== profileId)
      throw new AppError("Access denied", 403);
  }

  const [totalPatients, ongoing, pendingNew, completed] = await Promise.all([
    PatientDoctorAssignment.countDocuments({ doctor_id: profile._id, status: "active" }),
    Appointment.countDocuments({ doctor_id: profile._id, status: "confirmed" }),
    Appointment.countDocuments({ doctor_id: profile._id, status: "confirmed", doctor_viewed: { $ne: true } }),
    Appointment.countDocuments({ doctor_id: profile._id, status: "completed" }),
  ]);

  return { total_patients: totalPatients, ongoing, pending_new: pendingNew, completed };
}

module.exports = {
  registerDoctor,
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
