// =============================================================================
// Backend/controllers/appointmentController.js
//
// POST /api/appointments               — patient books an appointment slot
// GET  /api/appointments/my            — patient: their own appointments
// GET  /api/appointments/doctor        — doctor: appointments with their patients
// GET  /api/admin/appointments         — admin: appointment review queue
// PATCH /api/admin/appointments/:id/review — admin: approve or reject
// GET  /api/patients/:id/appointments  — patient or doctor: full visit history
//
// Access-control rule (CRITICAL — do not weaken):
//   A doctor may only read a patient's data when PatientDoctorAssignment.status
//   is "active" for that pair. This is enforced by canAccessPatient in auth.js.
//   Doctors who are only "pending" have zero access to patient data.
//
// Repeat-visit rule:
//   If the Assignment for this patient-doctor pair already exists with
//   status:"active", new appointments are auto-confirmed (no admin step).
//   Only FIRST appointments (Assignment status:"pending") go to admin review.
// =============================================================================
const DoctorProfile           = require("../models/DoctorProfile");
const DoctorAvailability      = require("../models/DoctorAvailability");
const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");
const Appointment             = require("../models/Appointment");
const Report                  = require("../models/Report");
const asyncHandler            = require("../utils/asyncHandler");
const { canAccessPatient }    = require("../middleware/auth");

// ── Helpers ───────────────────────────────────────────────────────────────────

// Convert "HH:MM" to minutes-from-midnight for comparison
function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Check that the requested slot falls within the doctor's declared schedule on that day
async function isSlotValid(doctorProfileId, slot) {
  const avail = await DoctorAvailability.findOne({ doctor_id: doctorProfileId });
  if (!avail) return false;

  const date = new Date(slot.date);
  const dow  = date.getDay();

  // Exceptions override the weekly schedule
  const exception = avail.exceptions.find(
    ex => ex.date.toDateString() === date.toDateString()
  );
  if (exception && !exception.available) return false;

  const windows = exception?.custom_hours
    ? [exception.custom_hours]
    : avail.weekly_schedule.filter(s => s.day_of_week === dow);

  if (windows.length === 0) return false;

  const reqStart = toMinutes(slot.start_time);
  const reqEnd   = toMinutes(slot.end_time);

  return windows.some(w =>
    reqStart >= toMinutes(w.start_time) && reqEnd <= toMinutes(w.end_time)
  );
}

// Guard against double-booking: reject if doctor already has a confirmed or
// pending_admin_review appointment overlapping this slot on the same day.
async function isSlotFree(doctorProfileId, slot) {
  const date      = new Date(slot.date);
  const dayStart  = new Date(date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd    = new Date(date); dayEnd.setHours(23, 59, 59, 999);

  const conflict = await Appointment.findOne({
    doctor_id: doctorProfileId,
    "requested_slot.date": { $gte: dayStart, $lte: dayEnd },
    "requested_slot.start_time": slot.start_time,
    status: { $in: ["confirmed", "pending_admin_review"] },
  });
  return !conflict;
}

// ── POST /api/appointments ────────────────────────────────────────────────────
// Patient requests a slot with a verified doctor and links a specific report.
// report_id is required — the patient always picks which report to share when booking.
const createAppointment = asyncHandler(async (req, res) => {
  const { doctor_profile_id, slot, report_id } = req.body;
  // slot: { date: "2026-08-25", start_time: "09:00", end_time: "09:30" }

  if (!doctor_profile_id || !slot?.date || !slot?.start_time || !slot?.end_time || !report_id) {
    return res.status(400).json({
      error: "doctor_profile_id, slot (date, start_time, end_time), and report_id are required",
    });
  }

  const patientId = req.user.patient_id;
  if (!patientId) {
    return res.status(400).json({ error: "No patient profile linked to this account" });
  }

  // Validate the report: must exist, belong to this patient, and not already be linked
  const report = await Report.findById(report_id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (report.patient_id.toString() !== patientId.toString()) {
    return res.status(403).json({ error: "This report does not belong to you" });
  }
  if (report.appointment_id) {
    return res.status(409).json({ error: "This report is already linked to an appointment" });
  }

  // Doctor must be verified before patients can book
  const doctor = await DoctorProfile.findById(doctor_profile_id);
  if (!doctor) return res.status(404).json({ error: "Doctor not found" });
  if (doctor.status !== "verified") {
    return res.status(400).json({ error: "This doctor is not yet verified" });
  }

  // Slot must fall within the doctor's declared availability
  if (!(await isSlotValid(doctor._id, slot))) {
    return res.status(400).json({ error: "Requested slot is outside the doctor's availability" });
  }

  // Prevent double-booking
  if (!(await isSlotFree(doctor._id, slot))) {
    return res.status(409).json({ error: "This slot is already booked — please choose another time" });
  }

  // Look up (or create) the PatientDoctorAssignment atomically.
  // Using findOneAndUpdate + upsert avoids the TOCTOU race where two concurrent
  // requests both see no existing assignment and both try to create one, which
  // would cause a duplicate-key error on the unique (patient_id, doctor_id) index.
  // setOnInsert only applies if the document is NEW (upserted), so an existing
  // active assignment is never overwritten back to pending.
  const assignment = await PatientDoctorAssignment.findOneAndUpdate(
    { patient_id: patientId, doctor_id: doctor._id },
    { $setOnInsert: { patient_id: patientId, doctor_id: doctor._id, status: "pending" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Determine whether admin review is needed:
  //   - First appointment (assignment is still pending): admin reviews
  //   - Repeat visit (assignment already active): auto-confirmed
  const isRepeatVisit = assignment.status === "active";
  const appointmentStatus = isRepeatVisit ? "confirmed" : "pending_admin_review";

  const appointment = await Appointment.create({
    patient_id:     patientId,
    doctor_id:      doctor._id,
    assignment_id:  assignment._id,
    requested_slot: { date: new Date(slot.date), start_time: slot.start_time, end_time: slot.end_time },
    status:         appointmentStatus,
    report_id:      report._id,
  });

  // Cross-link the report so it knows which appointment it belongs to.
  // Written here — not in sessionController — so the interview pipeline stays
  // completely unaware of the doctor-assignment feature.
  await Report.findByIdAndUpdate(report._id, { $set: { appointment_id: appointment._id } });

  res.status(201).json({
    appointment,
    assignment_status: assignment.status,
    requires_admin_review: !isRepeatVisit,
  });
});

// ── GET /api/appointments/:id — single appointment by ID ─────────────────────
// Used by the web case-detail page on hard refresh (no navigation state).
// Doctor can only fetch their own appointments; patient can only fetch theirs.
const getAppointmentById = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate("patient_id", "name dob gender contact")
    .populate("doctor_id",  "specialty hospital_clinic");
  if (!appointment) return res.status(404).json({ error: "Appointment not found" });

  if (req.user.role === "patient") {
    if (appointment.patient_id._id.toString() !== req.user.patient_id?.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }
  } else if (req.user.role === "doctor") {
    const profile = await DoctorProfile.findOne({ user_id: req.user._id }).select("_id");
    if (!profile || appointment.doctor_id._id.toString() !== profile._id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }
    // SECURITY: assignment must be active — admin may not have approved yet.
    // Checking doctor_id alone is insufficient: the doctor is set on the Appointment
    // document at booking time (before admin review), so ownership alone does not
    // imply the doctor has been granted access to this patient's data.
    if (!(await canAccessPatient(req.user, appointment.patient_id._id || appointment.patient_id))) {
      return res.status(403).json({ error: "Access denied — appointment pending admin approval" });
    }

    // First time the doctor opens this case — mark it viewed so it leaves the
    // "Pending / New" queue on the dashboard, even if no patient query has arrived.
    if (!appointment.doctor_viewed) {
      await Appointment.findByIdAndUpdate(appointment._id, { doctor_viewed: true });
    }
  }
  // admin falls through

  res.json(appointment);
});

// ── GET /api/appointments/doctor — doctor sees appointments with their patients ─
// SECURITY: never return pending_admin_review appointments to the doctor.
// The admin-approval gate must be enforced here as well as in canAccessPatient —
// a doctor must not see (or click into) a patient's case until an admin has
// explicitly approved the first appointment for that patient-doctor pair.
const getDoctorAppointments = asyncHandler(async (req, res) => {
  const profile = await DoctorProfile.findOne({ user_id: req.user._id });
  if (!profile) return res.status(404).json({ error: "Doctor profile not found" });

  const { status } = req.query;

  // Block any attempt to query for pending_admin_review appointments directly.
  if (status === "pending_admin_review") {
    return res.json([]);
  }

  const filter = { doctor_id: profile._id, status: { $ne: "pending_admin_review" } };
  if (status) filter.status = status; // overrides $ne only when a valid status is given

  const appointments = await Appointment.find(filter)
    .populate("patient_id", "name dob gender contact")
    .sort({ "requested_slot.date": -1 });

  res.json(appointments);
});

// ── GET /api/admin/appointments — admin review queue ─────────────────────────
const adminGetAppointments = asyncHandler(async (req, res) => {
  const { status = "pending_admin_review", page = 1, limit = 50 } = req.query;
  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Appointment.countDocuments({ status });
  const docs  = await Appointment.find({ status })
    .populate("patient_id", "name dob gender contact")
    .populate({ path: "doctor_id", select: "specialty hospital_clinic pmdc_number location contact user_id", populate: { path: "user_id", select: "name" } })
    .sort({ created_at: 1 })
    .skip(skip)
    .limit(Number(limit));

  res.json({ total, page: Number(page), results: docs });
});

// ── PATCH /api/admin/appointments/:id/review ─── admin decision ───────────────
// Body: { decision: "approve" | "reject", rejection_reason?: string }
//
// On approve:
//   · Set Appointment.status = "confirmed"
//   · If this is the first appointment for the pair, activate the Assignment
//     so the doctor gains access to this patient's data immediately.
//
// On reject:
//   · Set Appointment.status = "rejected"
//   · Leave the Assignment as "pending" (patient can try a different slot or doctor)
const adminReviewAppointment = asyncHandler(async (req, res) => {
  const { decision, rejection_reason } = req.body;
  if (!["approve", "reject"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approve' or 'reject'" });
  }

  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return res.status(404).json({ error: "Appointment not found" });
  if (appointment.status !== "pending_admin_review") {
    return res.status(409).json({ error: `Appointment is already ${appointment.status}` });
  }

  appointment.reviewed_by = req.user._id;
  appointment.reviewed_at = new Date();

  if (decision === "approve") {
    appointment.status = "confirmed";
    await appointment.save();

    // Activate the Assignment if this is the first confirmed appointment for this pair
    const assignment = await PatientDoctorAssignment.findById(appointment.assignment_id);
    if (assignment && assignment.status === "pending") {
      assignment.status               = "active";
      assignment.first_appointment_id = appointment._id;
      assignment.activated_at         = new Date();
      await assignment.save();
    }
  } else {
    if (!rejection_reason?.trim()) {
      return res.status(400).json({ error: "rejection_reason is required when rejecting" });
    }
    appointment.status           = "rejected";
    appointment.rejection_reason = rejection_reason.trim();
    await appointment.save();
    // Assignment stays "pending" — patient can book again with a different slot
  }

  res.json({ appointment });
});

// ── GET /api/patients/:id/appointments — full visit history ───────────────────
// Accessible by the patient themselves, any doctor with an active assignment,
// or admin. canAccessPatient enforces the doctor-access rule.
// Optional query params: doctor_id (filter by doctor), status (filter by status)
const getPatientAppointmentHistory = asyncHandler(async (req, res) => {
  if (!(await canAccessPatient(req.user, req.params.id))) {
    return res.status(403).json({ error: "Access denied" });
  }

  const { doctor_id, status } = req.query;
  const filter = { patient_id: req.params.id };
  if (doctor_id) filter.doctor_id = doctor_id;
  if (status)    filter.status    = status;

  const appointments = await Appointment.find(filter)
    .populate("doctor_id", "specialty hospital_clinic")
    .sort({ "requested_slot.date": -1 });

  res.json(appointments);
});

const QUERY_MAX_CHARS = 2000;

// ── POST /api/appointments/:id/queries — append a message to the query thread ─
// Either party (patient or doctor) can post. Patient posts set has_unread_patient_query.
const addQuery = asyncHandler(async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message is required" });
  if (message.length > QUERY_MAX_CHARS) {
    return res.status(400).json({ error: `message must be ${QUERY_MAX_CHARS} characters or fewer` });
  }

  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return res.status(404).json({ error: "Appointment not found" });

  let sender;
  if (req.user.role === "patient") {
    if (appointment.patient_id.toString() !== req.user.patient_id?.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }
    sender = "patient";
  } else if (req.user.role === "doctor") {
    if (!(await canAccessPatient(req.user, appointment.patient_id))) {
      return res.status(403).json({ error: "Access denied" });
    }
    sender = "doctor";
  } else {
    return res.status(403).json({ error: "Access denied" });
  }

  const update = { $push: { queries: { sender, message: message.trim(), created_at: new Date(), read: false } } };
  if (sender === "patient") update.$set = { has_unread_patient_query: true };

  const updated = await Appointment.findByIdAndUpdate(req.params.id, update, { new: true });
  const lastQuery = updated.queries[updated.queries.length - 1];

  res.status(201).json({ query: lastQuery, has_unread_patient_query: updated.has_unread_patient_query });
});

// ── PATCH /api/appointments/:id/queries/read — doctor clears the unread indicator ─
const markQueriesRead = asyncHandler(async (req, res) => {
  const profile = await DoctorProfile.findOne({ user_id: req.user._id }).select("_id");
  if (!profile) return res.status(404).json({ error: "Doctor profile not found" });

  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return res.status(404).json({ error: "Appointment not found" });

  if (appointment.doctor_id.toString() !== profile._id.toString()) {
    return res.status(403).json({ error: "Access denied" });
  }

  await Appointment.updateOne(
    { _id: req.params.id },
    { $set: { has_unread_patient_query: false, "queries.$[msg].read": true } },
    { arrayFilters: [{ "msg.sender": "patient", "msg.read": false }] }
  );

  res.json({ message: "Queries marked as read" });
});

// ── POST /api/appointments/:id/feedback — doctor submits/updates their feedback ─
const submitFeedback = asyncHandler(async (req, res) => {
  const profile = await DoctorProfile.findOne({ user_id: req.user._id }).select("_id");
  if (!profile) return res.status(404).json({ error: "Doctor profile not found" });

  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return res.status(404).json({ error: "Appointment not found" });

  if (appointment.doctor_id.toString() !== profile._id.toString()) {
    return res.status(403).json({ error: "Access denied" });
  }

  const feedback = { ...req.body, submitted_at: new Date(), submitted_by: req.user._id };
  const updated  = await Appointment.findByIdAndUpdate(
    req.params.id,
    { $set: { feedback } },
    { new: true }
  );

  res.json({ feedback: updated.feedback });
});

// ── POST /api/appointments/:id/complete — doctor marks appointment completed ───
const completeAppointment = asyncHandler(async (req, res) => {
  const profile = await DoctorProfile.findOne({ user_id: req.user._id }).select("_id");
  if (!profile) return res.status(404).json({ error: "Doctor profile not found" });

  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return res.status(404).json({ error: "Appointment not found" });

  if (appointment.doctor_id.toString() !== profile._id.toString()) {
    return res.status(403).json({ error: "Access denied" });
  }
  if (appointment.status !== "confirmed") {
    return res.status(409).json({ error: `Cannot complete an appointment with status '${appointment.status}'` });
  }

  appointment.status = "completed";
  await appointment.save();

  res.json({ appointment });
});

// ── POST /api/appointments/:id/cancel — patient cancels and terminates access ──
// Cancelling an appointment ends the entire doctor-patient relationship
// (PatientDoctorAssignment.status → terminated). The Appointment and Report
// records are preserved permanently — only the access gate changes.
const cancelAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return res.status(404).json({ error: "Appointment not found" });

  if (appointment.patient_id.toString() !== req.user.patient_id?.toString()) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (!["confirmed", "pending_admin_review"].includes(appointment.status)) {
    return res.status(409).json({ error: `Cannot cancel an appointment with status '${appointment.status}'` });
  }

  appointment.status = "cancelled";
  await appointment.save();

  // Terminate the PatientDoctorAssignment — this immediately revokes the doctor's
  // access to all of this patient's data. History (Appointment + Report) is intact.
  await PatientDoctorAssignment.findByIdAndUpdate(
    appointment.assignment_id,
    { $set: { status: "terminated" } }
  );

  res.json({ message: "Appointment cancelled and doctor access revoked", appointment });
});

module.exports = {
  createAppointment,
  getAppointmentById,
  getDoctorAppointments,
  adminGetAppointments,
  adminReviewAppointment,
  getPatientAppointmentHistory,
  addQuery,
  markQueriesRead,
  submitFeedback,
  completeAppointment,
  cancelAppointment,
};
