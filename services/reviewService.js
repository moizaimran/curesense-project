// =============================================================================
// Backend/services/reviewService.js — post-case ratings & feedback
//
// Visibility:
//   · patient → doctor reviews: seen by the patient who wrote it, the doctor,
//     admins, and (rating + comment + first name only) on the doctor's public
//     review list.
//   · doctor → patient reviews: seen by the doctor who wrote it and admins.
//     Never shown to the patient.
// =============================================================================
const mongoose      = require("mongoose");
const { AppError }  = require("../utils/errors");
const Review        = require("../models/Review");
const Appointment   = require("../models/Appointment");
const DoctorProfile = require("../models/DoctorProfile");
const Patient       = require("../models/Patient");

const COMMENT_MAX_CHARS = 1000;

function validateReviewBody({ rating, comment }) {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5)
    throw new AppError("rating must be a whole number from 1 to 5", 400);
  if (comment !== undefined && comment !== null && typeof comment !== "string")
    throw new AppError("comment must be text", 400);
  const text = (comment || "").trim();
  if (text.length > COMMENT_MAX_CHARS)
    throw new AppError(`comment must be at most ${COMMENT_MAX_CHARS} characters`, 400);
  return { rating: r, comment: text };
}

// Which side of the appointment is this user on? Returns "patient" | "doctor" | null.
async function partyRole(appointment, user) {
  if (user.role === "patient") {
    return user.patient_id && String(user.patient_id) === String(appointment.patient_id) ? "patient" : null;
  }
  if (user.role === "doctor") {
    const profile = await DoctorProfile.findOne({ user_id: user._id }).select("_id").lean();
    return profile && String(profile._id) === String(appointment.doctor_id) ? "doctor" : null;
  }
  return null;
}

// Recalculate the average/count for whoever the reviews are about.
async function refreshRatingSummary(reviewerRole, targetId) {
  const match = reviewerRole === "patient"
    ? { reviewer_role: "patient", doctor_id: new mongoose.Types.ObjectId(String(targetId)) }
    : { reviewer_role: "doctor",  patient_id: new mongoose.Types.ObjectId(String(targetId)) };

  const [agg] = await Review.aggregate([
    { $match: match },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const rating = {
    average: agg ? Math.round(agg.average * 100) / 100 : 0,
    count:   agg ? agg.count : 0,
  };

  const Model = reviewerRole === "patient" ? DoctorProfile : Patient;
  await Model.updateOne({ _id: targetId }, { $set: { rating } });
  return rating;
}

// ── POST /api/appointments/:id/review ────────────────────────────────────────

async function submitReview(appointmentId, user, body) {
  const { rating, comment } = validateReviewBody(body || {});

  const appointment = await Appointment.findById(appointmentId).select("patient_id doctor_id status").lean();
  if (!appointment) throw new AppError("Appointment not found", 404);

  const role = await partyRole(appointment, user);
  if (!role) throw new AppError("Access denied", 403);
  if (appointment.status !== "completed")
    throw new AppError("You can only leave a review after the case is completed", 409);

  const review = await Review.findOneAndUpdate(
    { appointment_id: appointment._id, reviewer_role: role },
    {
      $set: { rating, comment, reviewer_user_id: user._id },
      $setOnInsert: {
        appointment_id: appointment._id,
        reviewer_role:  role,
        doctor_id:      appointment.doctor_id,
        patient_id:     appointment.patient_id,
      },
    },
    { new: true, upsert: true, runValidators: true }
  );

  const target = role === "patient" ? appointment.doctor_id : appointment.patient_id;
  const summary = await refreshRatingSummary(role, target);

  return { review, rating_summary: summary };
}

// ── GET /api/appointments/:id/reviews ────────────────────────────────────────

async function getAppointmentReviews(appointmentId, user) {
  const appointment = await Appointment.findById(appointmentId).select("patient_id doctor_id").lean();
  if (!appointment) throw new AppError("Appointment not found", 404);

  const role = user.role === "admin" ? "admin" : await partyRole(appointment, user);
  if (!role) throw new AppError("Access denied", 403);

  const reviews = await Review.find({ appointment_id: appointment._id }).lean();
  const patientReview = reviews.find((r) => r.reviewer_role === "patient") || null;
  const doctorReview  = reviews.find((r) => r.reviewer_role === "doctor")  || null;

  return {
    patient_review: patientReview,
    // The patient never sees how the doctor rated them
    doctor_review:  role === "patient" ? null : doctorReview,
  };
}

// ── GET /api/doctors/:id/reviews (public) ────────────────────────────────────

async function getDoctorReviews(doctorId, { page = 1, limit = 10 } = {}) {
  const doctor = await DoctorProfile.findById(doctorId).select("rating status").lean();
  if (!doctor || doctor.status !== "verified") throw new AppError("Doctor not found", 404);

  const lim  = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * lim;
  const filter = { doctor_id: doctor._id, reviewer_role: "patient" };

  const [total, reviews] = await Promise.all([
    Review.countDocuments(filter),
    Review.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(lim)
      .populate("patient_id", "name")
      .lean(),
  ]);

  return {
    rating:  doctor.rating || { average: 0, count: 0 },
    total,
    page:    Number(page) || 1,
    // Only the patient's first name is public
    results: reviews.map((r) => ({
      _id:        r._id,
      rating:     r.rating,
      comment:    r.comment,
      created_at: r.created_at,
      patient_first_name: (r.patient_id?.name || "Patient").split(" ")[0],
    })),
  };
}

module.exports = {
  submitReview,
  getAppointmentReviews,
  getDoctorReviews,
  refreshRatingSummary,
};
