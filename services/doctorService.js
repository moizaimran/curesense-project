const admin              = require("../config/firebase");
const { AppError }       = require("../utils/errors");
const { isStrongPassword, validateEmail, escapeRegex } = require("../utils/validation");
const { normalizeCalendarDate, todayCalendarDate } = require("../utils/date");
const { isValidSpecialty } = require("../constants/specialties");
const { verifyDoctor }   = require("./pmdcService");
const { sendVerificationLinkEmail, sendDoctorRegistrationEmail, sendDoctorApprovalEmail, sendDoctorRejectionEmail } = require("./emailService");

const INVALID_SPECIALTY = "specialty must be one of the listed specialties (GET /api/doctors/specialties)";
const User               = require("../models/User");
const DoctorProfile      = require("../models/DoctorProfile");
const DoctorAvailability = require("../models/DoctorAvailability");

// ── POST /api/doctors/register ────────────────────────────────────────────────

async function registerDoctor(body) {
  const {
    firstName, lastName, email, phone, password, confirmPassword,
    pmdc_number, specialty, sub_specialty, gender,
    hospital_clinic, experience_years, city, address, education,
    name_as_per_cnic, father_name_as_per_cnic, cnic_image_url,
  } = body;

  if (!firstName || !lastName || !email || !phone || !password || !pmdc_number || !specialty || !gender || !city)
    throw new AppError("firstName, lastName, email, phone, password, pmdc_number, specialty, gender and city are required", 400);
  if (!name_as_per_cnic || !father_name_as_per_cnic)
    throw new AppError("name_as_per_cnic and father_name_as_per_cnic (as on your CNIC) are required", 400);
  if (!validateEmail(email))
    throw new AppError("Invalid email format", 400);
  if (!isStrongPassword(password))
    throw new AppError("Password must be at least 8 characters and contain at least one letter and one number", 400);
  if (password !== confirmPassword)
    throw new AppError("Passwords do not match", 400);
  if (!["male", "female"].includes(gender))
    throw new AppError("gender must be 'male' or 'female'", 400);
  if (!isValidSpecialty(specialty))
    throw new AppError(INVALID_SPECIALTY, 400);
  if (await User.findOne({ email }))
    throw new AppError("Email already registered", 409);
  if (await DoctorProfile.findOne({ pmdc_number: pmdc_number.toUpperCase() }))
    throw new AppError("PMDC number already registered", 409);

  // Create Firebase account with disabled:false so Firebase's email-verification link handler works.
  // Unapproved doctors are gated at the app layer: signInToPortal checks doctor_profile.status.
  let fbUser;
  try {
    fbUser = await admin.auth().createUser({ email, password, emailVerified: false, disabled: false });
  } catch (fbErr) {
    if (fbErr.code === "auth/email-already-exists") throw new AppError("Email already registered", 409);
    throw fbErr;
  }

  // Send email verification link immediately after Firebase account creation (fire-and-forget).
  // continueUrl redirects the doctor back to the login page after they click the link.
  const verifyRedirectUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/doctor/login?verified=true`;
  admin.auth().generateEmailVerificationLink(email, { url: verifyRedirectUrl })
    .then((link) => sendVerificationLinkEmail(email, link))
    .catch((err) => console.error("[registerDoctor] verification email failed:", err.message));

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
      user_id:                user._id,
      pmdc_number,
      name_as_per_cnic:        name_as_per_cnic.trim(),
      father_name_as_per_cnic: father_name_as_per_cnic.trim(),
      specialty,
      sub_specialty:          sub_specialty || "",
      gender,
      location:               { city, address: address || "" },
      contact:                { phone, email },
      education:              Array.isArray(education) ? education : [],
      experience_years:       experience_years ? Number(experience_years) : 0,
      hospital_clinic:        hospital_clinic || "",
      cnic_image_url:         cnic_image_url  || "",
    });
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    await admin.auth().deleteUser(fbUser.uid).catch(() => {});
    throw err;
  }

  await DoctorAvailability.create({ doctor_id: profile._id });

  // Fire-and-forget — PMDC check runs in background after registration responds.
  // Registration never fails because of PMDC being slow or unreachable.
  verifyDoctor({
    pmdcNumber:         pmdc_number,
    nameFromCnic:       name_as_per_cnic,
    fatherNameFromCnic: father_name_as_per_cnic,
    typedName:          `${firstName.trim()} ${lastName.trim()}`,
    specialty,
  }).then((result) =>
    DoctorProfile.findByIdAndUpdate(profile._id, {
      pmdc_verification: {
        pmdc_found:       result.pmdc_found,
        pmdc_name:        result.pmdc_name        || "",
        pmdc_father_name: result.pmdc_father_name || "",
        pmdc_status:      result.pmdc_status      || "",
        confidence:       result.confidence,
        decision:         result.decision,
        breakdown:        result.breakdown,
        checked_at:       new Date(),
      },
    })
  ).catch((err) => console.error("[registerDoctor] PMDC check failed:", err.message));

  // Send registration confirmation email (fire-and-forget)
  sendDoctorRegistrationEmail(email, name).catch((err) =>
    console.error("[registerDoctor] registration email failed:", err.message)
  );

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

// Day-of-week (0 = Sunday) for a YYYY-MM-DD string, timezone-independent.
function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// DoctorProfile ids that are working on `dateStr`: either a weekly slot on
// that weekday with no day-off exception, or an extra-session exception.
async function doctorIdsAvailableOn(dateStr) {
  const dow = dayOfWeek(dateStr);
  const rows = await DoctorAvailability.find({
    $or: [
      { "weekly_schedule.day_of_week": dow },
      { exceptions: { $elemMatch: { date: dateStr, available: true } } },
    ],
  }).select("doctor_id weekly_schedule exceptions").lean();

  return rows
    .filter((r) => {
      const exc = (r.exceptions || []).find((e) => e.date === dateStr);
      if (exc) return exc.available;
      return (r.weekly_schedule || []).some((w) => w.day_of_week === dow);
    })
    .map((r) => r.doctor_id);
}

const DOCTOR_SORTS = {
  experience: { experience_years: -1 },
  newest:     { created_at: -1 },
  rating:     { "rating.average": -1, "rating.count": -1 },
  fee_low:    { consultation_fee: 1, experience_years: -1 },
};

async function searchDoctors(query) {
  const {
    q, specialty, sub_specialty, gender, city, hospital_clinic,
    min_experience, max_experience, education_degree, available_on, min_rating, max_fee,
    sort = "experience",
    page = 1, limit = 20,
  } = query;

  const filter = { status: "verified" };

  // Free-text search across doctor name, specialty and hospital
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: "i" };
    const users = await User.find({ name: rx, role: "doctor" }).select("_id").lean();
    filter.$or = [
      { user_id: { $in: users.map((u) => u._id) } },
      { specialty: rx },
      { hospital_clinic: rx },
    ];
  }

  const availableDate = normalizeCalendarDate(available_on);
  if (available_on && !availableDate) throw new AppError("available_on must be YYYY-MM-DD", 400);
  if (availableDate) filter._id = { $in: await doctorIdsAvailableOn(availableDate) };

  if (min_rating) {
    const r = Number(min_rating);
    if (!(r >= 1 && r <= 5)) throw new AppError("min_rating must be between 1 and 5", 400);
    filter["rating.average"] = { $gte: r };
  }

  if (max_fee !== undefined && max_fee !== "") {
    const f = Number(max_fee);
    if (!(f >= 0)) throw new AppError("max_fee must be a positive number", 400);
    filter.consultation_fee = { $lte: f };
  }
  if (specialty)       filter.specialty              = { $regex: escapeRegex(specialty),       $options: "i" };
  if (sub_specialty)   filter.sub_specialty          = { $regex: escapeRegex(sub_specialty),   $options: "i" };
  if (gender)          filter.gender                 = gender;
  if (city)            filter["location.city"]       = { $regex: escapeRegex(city),            $options: "i" };
  if (hospital_clinic) filter.hospital_clinic        = { $regex: escapeRegex(hospital_clinic), $options: "i" };
  if (min_experience || max_experience) {
    filter.experience_years = {};
    if (min_experience) filter.experience_years.$gte = Number(min_experience);
    if (max_experience) filter.experience_years.$lte = Number(max_experience);
  }
  if (education_degree) filter["education.degree"] = { $regex: escapeRegex(education_degree), $options: "i" };

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await DoctorProfile.countDocuments(filter);
  const docs  = await DoctorProfile.find(filter)
    .select("-pmdc_certificate_url -rejection_reason -verified_by")
    .populate("user_id", "name")
    .sort(DOCTOR_SORTS[sort] || DOCTOR_SORTS.experience)
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
  const { specialty, sub_specialty, hospital_clinic, experience_years, location, contact, consultation_fee } = body;
  const update = {};
  if (specialty !== undefined && !isValidSpecialty(specialty))
    throw new AppError(INVALID_SPECIALTY, 400);
  if (specialty         !== undefined) update.specialty              = specialty;
  if (sub_specialty     !== undefined) update.sub_specialty          = sub_specialty;
  if (hospital_clinic   !== undefined) update.hospital_clinic        = hospital_clinic;
  if (experience_years  !== undefined) update.experience_years       = Number(experience_years);
  if (location?.city    !== undefined) update["location.city"]       = location.city;
  if (location?.address !== undefined) update["location.address"]    = location.address;
  if (contact?.phone    !== undefined) update["contact.phone"]       = contact.phone;
  if (consultation_fee  !== undefined) {
    const fee = Number(consultation_fee);
    if (!Number.isInteger(fee) || fee < 0 || fee > 100000)
      throw new AppError("consultation_fee must be a whole number of rupees between 0 and 100,000", 400);
    update.consultation_fee = fee;
  }

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
  await require("./paymentService").expireUnpaidAppointments({ doctorId: doctorProfileId });
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
  await require("./paymentService").expireUnpaidAppointments({ doctorId: doctorProfileId });
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
  const docs   = await DoctorProfile.find(filter)
    .populate("user_id", "name")
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(Number(limit));
  return { total, page: Number(page), results: docs };
}

// ── PATCH /api/admin/doctors/:id/verify ──────────────────────────────────────

async function adminVerifyDoctor(id, { decision, rejection_reason }, verifiedById) {
  if (!["approve", "reject"].includes(decision))
    throw new AppError("decision must be 'approve' or 'reject'", 400);

  const profile = await DoctorProfile.findById(id);
  if (!profile) throw new AppError("Doctor profile not found", 404);
  if (profile.status !== "pending") throw new AppError(`Doctor is already ${profile.status}`, 409);

  const doctorUser = await User.findById(profile.user_id).select("provider_uid email name");

  if (decision === "approve") {
    // Firebase account is already enabled from registration — nothing to change there.
    // We do NOT auto-mark emailVerified; the doctor must still click the verification link.
    await User.findByIdAndUpdate(profile.user_id, { is_verified: true });
    profile.status      = "verified";
    profile.verified_by = verifiedById;
    profile.verified_at = new Date();

    // Notify doctor their account is approved
    if (doctorUser?.email) {
      sendDoctorApprovalEmail(doctorUser.email, doctorUser.name || "Doctor").catch((err) =>
        console.error("[adminVerifyDoctor] approval email failed:", err.message)
      );
    }
  } else {
    if (!rejection_reason?.trim()) throw new AppError("rejection_reason is required when rejecting", 400);
    // Leave Firebase account disabled on rejection — do not delete it
    profile.status           = "rejected";
    profile.rejection_reason = rejection_reason.trim();

    // Notify doctor their account was rejected with reason
    if (doctorUser?.email) {
      sendDoctorRejectionEmail(doctorUser.email, doctorUser.name || "Doctor", rejection_reason.trim()).catch((err) =>
        console.error("[adminVerifyDoctor] rejection email failed:", err.message)
      );
    }
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

// ── POST /api/doctors/resend-verification ────────────────────────────────────

async function resendDoctorVerificationEmail(email) {
  if (!email) throw new AppError("email is required", 400);

  // Confirm a doctor account exists with this email before sending
  const user = await User.findOne({ email: email.toLowerCase(), role: "doctor" });
  if (!user) throw new AppError("No doctor account found with this email", 404);

  const continueUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/doctor/login?verified=true`;
  const link = await admin.auth().generateEmailVerificationLink(email.toLowerCase(), { url: continueUrl });
  await sendVerificationLinkEmail(email.toLowerCase(), link);
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
  resendDoctorVerificationEmail,
};
