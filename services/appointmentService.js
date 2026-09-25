const { AppError }            = require("../utils/errors");
const { normalizeCalendarDate } = require("../utils/date");
const { canAccessPatient }    = require("../middleware/auth");
const DoctorProfile           = require("../models/DoctorProfile");
const DoctorAvailability      = require("../models/DoctorAvailability");
const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");
const Appointment             = require("../models/Appointment");
const Report                  = require("../models/Report");
const cloudinary              = require("../config/cloudinary");

const QUERY_MAX_CHARS    = 2000;
const TEST_UPLOAD_MAX_MB = 15;

// Allowed keys for doctor feedback — prevents arbitrary data being stored
const FEEDBACK_ALLOWED_KEYS = new Set([
  "diagnosis", "notes", "tests_requested",
  "follow_up_date", "prescription", "referral",
]);

// ── Private helpers ────────────────────────────────────────────────────────────

function toMinutes(t) {
  if (!t || typeof t !== "string") return NaN;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

async function _isSlotValid(doctorProfileId, slot) {
  const avail = await DoctorAvailability.findOne({ doctor_id: doctorProfileId });
  if (!avail) return false;

  const requestedDate = normalizeCalendarDate(slot.date);
  if (!requestedDate) return false;

  const exception = (avail.exceptions || []).find(
    ex => normalizeCalendarDate(ex.date) === requestedDate
  );

  if (exception && !exception.available) return false;

  let windows = [];
  if (exception?.custom_hours) {
    windows = [exception.custom_hours];
  } else {
    const [year, month, day] = requestedDate.split("-").map(Number);
    const localDate = new Date(year, month - 1, day);
    const dow       = localDate.getDay();
    windows = (avail.weekly_schedule || []).filter(s => Number(s.day_of_week) === dow);
  }

  if (!windows.length) return false;

  const reqStart = toMinutes(slot.start_time);
  const reqEnd   = toMinutes(slot.end_time);
  if (!Number.isFinite(reqStart) || !Number.isFinite(reqEnd) || reqEnd <= reqStart) return false;

  return windows.some(w => reqStart >= toMinutes(w.start_time) && reqEnd <= toMinutes(w.end_time));
}

async function _isSlotFree(doctorProfileId, slot) {
  const requestedDate = normalizeCalendarDate(slot.date);
  if (!requestedDate) return false;
  const conflict = await Appointment.findOne({
    doctor_id: doctorProfileId,
    "requested_slot.date":       requestedDate,
    "requested_slot.start_time": slot.start_time,
    status: { $in: ["confirmed", "pending_admin_review"] },
  });
  return !conflict;
}

// ── POST /api/appointments ────────────────────────────────────────────────────

async function createAppointment(body, user) {
  const { doctor_profile_id, slot, report_id } = body;

  if (!doctor_profile_id || !slot?.date || !slot?.start_time || !slot?.end_time || !report_id)
    throw new AppError("doctor_profile_id, slot (date, start_time, end_time), and report_id are required", 400);

  const requestedDate = normalizeCalendarDate(slot.date);
  if (!requestedDate) throw new AppError("Invalid date format. Expected YYYY-MM-DD", 400);

  const normalizedSlot = { date: requestedDate, start_time: slot.start_time, end_time: slot.end_time };

  const patientId = user.patient_id;
  if (!patientId) throw new AppError("No patient profile linked to this account", 400);

  const report = await Report.findById(report_id);
  if (!report) throw new AppError("Report not found", 404);
  if (report.patient_id.toString() !== patientId.toString())
    throw new AppError("This report does not belong to you", 403);
  if (report.appointment_id) throw new AppError("This report is already linked to an appointment", 409);

  const doctor = await DoctorProfile.findById(doctor_profile_id);
  if (!doctor) throw new AppError("Doctor not found", 404);
  if (doctor.status !== "verified") throw new AppError("This doctor is not yet verified", 400);

  // Slot validation — capacity mode vs normal
  const availForCapacityCheck = await DoctorAvailability.findOne({ doctor_id: doctor._id });
  const exceptionForDate = (availForCapacityCheck?.exceptions || []).find(
    ex => normalizeCalendarDate(ex.date) === requestedDate
  );

  if (exceptionForDate?.max_patients) {
    if (!exceptionForDate.available) throw new AppError("Doctor is unavailable on this date", 400);
    const win = exceptionForDate.custom_hours;
    if (!win || normalizedSlot.start_time !== win.start_time || normalizedSlot.end_time !== win.end_time)
      throw new AppError("Invalid slot for this date", 400);
    const bookedCount = await Appointment.countDocuments({
      doctor_id: doctor._id,
      "requested_slot.date": requestedDate,
      status: { $in: ["confirmed", "pending_admin_review"] },
    });
    if (bookedCount >= exceptionForDate.max_patients)
      throw new AppError("This day is fully booked — please choose another date", 409);
  } else {
    if (!(await _isSlotValid(doctor._id, normalizedSlot)))
      throw new AppError("Requested slot is outside the doctor's availability", 400);
    if (!(await _isSlotFree(doctor._id, normalizedSlot)))
      throw new AppError("This slot is already booked — please choose another time", 409);
  }

  const assignment = await PatientDoctorAssignment.findOneAndUpdate(
    { patient_id: patientId, doctor_id: doctor._id },
    { $setOnInsert: { patient_id: patientId, doctor_id: doctor._id, status: "pending" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const isRepeatVisit     = assignment.status === "active";
  const appointmentStatus = isRepeatVisit ? "confirmed" : "pending_admin_review";

  const appointment = await Appointment.create({
    patient_id:     patientId,
    doctor_id:      doctor._id,
    assignment_id:  assignment._id,
    requested_slot: { date: requestedDate, start_time: normalizedSlot.start_time, end_time: normalizedSlot.end_time },
    status:         appointmentStatus,
    report_id:      report._id,
  });

  await Report.findByIdAndUpdate(report._id, { $set: { appointment_id: appointment._id } });

  return { appointment, assignment_status: assignment.status, requires_admin_review: !isRepeatVisit };
}

// ── GET /api/appointments/:id ─────────────────────────────────────────────────

async function getAppointmentById(id, user) {
  const appointment = await Appointment.findById(id)
    .populate("patient_id", "name dob gender contact allergies current_medications")
    .populate("doctor_id",  "specialty hospital_clinic");

  if (!appointment) throw new AppError("Appointment not found", 404);

  if (user.role === "patient") {
    if (appointment.patient_id._id.toString() !== user.patient_id?.toString())
      throw new AppError("Access denied", 403);
  } else if (user.role === "doctor") {
    const profile = await DoctorProfile.findOne({ user_id: user._id }).select("_id");
    if (!profile || appointment.doctor_id._id.toString() !== profile._id.toString())
      throw new AppError("Access denied", 403);
    if (!(await canAccessPatient(user, appointment.patient_id._id || appointment.patient_id)))
      throw new AppError("Access denied — appointment pending admin approval", 403);

    if (!appointment.doctor_viewed || appointment.has_new_test_upload) {
      await Appointment.findByIdAndUpdate(appointment._id, {
        doctor_viewed:       true,
        has_new_test_upload: false,
      });
    }
  }

  return appointment;
}

// ── GET /api/appointments/my (patient) ───────────────────────────────────────

async function getMyAppointments(user, query) {
  const patientId = user.patient_id;
  if (!patientId) throw new AppError("No patient profile linked to this account", 400);

  const filter = { patient_id: patientId };
  if (query.status) filter.status = query.status;

  return Appointment.find(filter)
    .populate("doctor_id", "specialty hospital_clinic location contact")
    .sort({ "requested_slot.date": -1 });
}

// ── GET /api/appointments/doctor ─────────────────────────────────────────────

async function getDoctorAppointments(userId, query) {
  const profile = await DoctorProfile.findOne({ user_id: userId });
  if (!profile) throw new AppError("Doctor profile not found", 404);

  const { status } = query;
  if (status === "pending_admin_review") return [];

  const filter = { doctor_id: profile._id, status: { $ne: "pending_admin_review" } };
  if (status) filter.status = status;

  return Appointment.find(filter)
    .populate("patient_id", "name dob gender contact")
    .sort({ "requested_slot.date": -1 });
}

// ── GET /api/admin/appointments ───────────────────────────────────────────────

async function adminGetAppointments({ status = "pending_admin_review", page = 1, limit = 50 } = {}) {
  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Appointment.countDocuments({ status });
  const docs  = await Appointment.find({ status })
    .populate("patient_id", "name dob gender contact")
    .populate({ path: "doctor_id", select: "specialty hospital_clinic pmdc_number location contact user_id", populate: { path: "user_id", select: "name" } })
    .sort({ created_at: 1 })
    .skip(skip)
    .limit(Number(limit));
  return { total, page: Number(page), results: docs };
}

// ── PATCH /api/admin/appointments/:id/review ──────────────────────────────────

async function adminReviewAppointment(id, { decision, rejection_reason }, adminUserId) {
  if (!["approve", "reject"].includes(decision))
    throw new AppError("decision must be 'approve' or 'reject'", 400);

  const appointment = await Appointment.findById(id);
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (appointment.status !== "pending_admin_review")
    throw new AppError(`Appointment is already ${appointment.status}`, 409);

  appointment.reviewed_by = adminUserId;
  appointment.reviewed_at = new Date();

  if (decision === "approve") {
    appointment.status = "confirmed";
    await appointment.save();

    const assignment = await PatientDoctorAssignment.findById(appointment.assignment_id);
    if (assignment && assignment.status !== "active") {
      assignment.status = "active";
      if (!assignment.first_appointment_id) assignment.first_appointment_id = appointment._id;
      assignment.activated_at = new Date();
      await assignment.save();
    }
  } else {
    if (!rejection_reason?.trim()) throw new AppError("rejection_reason is required when rejecting", 400);
    appointment.status           = "rejected";
    appointment.rejection_reason = rejection_reason.trim();
    await appointment.save();
  }

  return { appointment };
}

// ── GET /api/patients/:id/appointments ───────────────────────────────────────

async function getPatientAppointmentHistory(patientId, query, user) {
  if (!(await canAccessPatient(user, patientId))) throw new AppError("Access denied", 403);

  const filter = { patient_id: patientId };
  if (query.doctor_id) filter.doctor_id = query.doctor_id;
  if (query.status)    filter.status    = query.status;

  return Appointment.find(filter)
    .populate("doctor_id", "specialty hospital_clinic")
    .sort({ "requested_slot.date": -1 });
}

// ── POST /api/appointments/:id/queries ───────────────────────────────────────

async function addQuery(appointmentId, body, user) {
  const { message, file_base64, mime_type, original_filename } = body;

  // Must have at least a message or a file
  if (!message?.trim() && !file_base64)
    throw new AppError("message or file_base64 is required", 400);
  if (message?.trim() && message.length > QUERY_MAX_CHARS)
    throw new AppError(`message must be ${QUERY_MAX_CHARS} characters or fewer`, 400);

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new AppError("Appointment not found", 404);

  let sender;
  if (user.role === "patient") {
    if (appointment.patient_id.toString() !== user.patient_id?.toString())
      throw new AppError("Access denied", 403);
    sender = "patient";
  } else if (user.role === "doctor") {
    if (!(await canAccessPatient(user, appointment.patient_id))) throw new AppError("Access denied", 403);
    sender = "doctor";
  } else {
    throw new AppError("Access denied", 403);
  }

  // ── Image attachment path ─────────────────────────────────────────────────
  if (file_base64) {
    const BLOCKED_FOR_IMAGES = new Set(["cancelled", "rejected", "no_show"]);
    if (BLOCKED_FOR_IMAGES.has(appointment.status))
      throw new AppError(`Cannot send images on a ${appointment.status} appointment`, 422);
    const imageService = require("./imageService");

    // Create ImageUpload record (validates file type + size, throws AppError if invalid)
    const imageRecord = await imageService.createChatImageRecord({
      userId:        user._id,
      appointmentId,
      fileBase64:    file_base64,
      mimeType:      mime_type,
      filename:      original_filename,
    });

    // Create the query message with attachment_status: "analyzing"
    const queryDoc = {
      sender,
      message:           message?.trim() || "",
      attachment_status: "analyzing",
      image_upload_id:   imageRecord._id,
      created_at:        new Date(),
      read:              false,
    };
    const pushUpdate = { $push: { queries: queryDoc } };
    if (sender === "patient") pushUpdate.$set = { has_unread_patient_query: true };

    const updated   = await Appointment.findByIdAndUpdate(appointmentId, pushUpdate, { new: true });
    const lastQuery = updated.queries[updated.queries.length - 1];

    // Fire background: Cloudinary upload + MedGemma + update message + notify doctor
    imageService.startChatImageBackground({
      recordId:       imageRecord._id,
      fileBase64:     file_base64,
      uploadType:     imageRecord.upload_type,
      mimeType:       mime_type,
      filename:       original_filename || "chat-image",
      appointmentId,
      queryMessageId: lastQuery._id,
      doctorProfileId: appointment.doctor_id,
    });

    return { query: lastQuery, has_unread_patient_query: updated.has_unread_patient_query };
  }

  // ── Text-only path (original behaviour) ──────────────────────────────────
  const update = {
    $push: { queries: { sender, message: message.trim(), created_at: new Date(), read: false } },
  };
  if (sender === "patient") update.$set = { has_unread_patient_query: true };

  const updated   = await Appointment.findByIdAndUpdate(appointmentId, update, { new: true });
  const lastQuery = updated.queries[updated.queries.length - 1];
  return { query: lastQuery, has_unread_patient_query: updated.has_unread_patient_query };
}

// ── PATCH /api/appointments/:id/queries/read ─────────────────────────────────

async function markQueriesRead(appointmentId, userId) {
  const profile = await DoctorProfile.findOne({ user_id: userId }).select("_id");
  if (!profile) throw new AppError("Doctor profile not found", 404);

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (appointment.doctor_id.toString() !== profile._id.toString())
    throw new AppError("Access denied", 403);

  await Appointment.updateOne(
    { _id: appointmentId },
    { $set: { has_unread_patient_query: false, "queries.$[msg].read": true } },
    { arrayFilters: [{ "msg.sender": "patient", "msg.read": false }] }
  );
  return { message: "Queries marked as read" };
}

// ── POST /api/appointments/:id/feedback ──────────────────────────────────────

async function submitFeedback(appointmentId, body, userId) {
  const profile = await DoctorProfile.findOne({ user_id: userId }).select("_id");
  if (!profile) throw new AppError("Doctor profile not found", 404);

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (appointment.doctor_id.toString() !== profile._id.toString())
    throw new AppError("Access denied", 403);

  // Build feedback from allowlisted keys only
  const feedbackData = {};
  for (const key of FEEDBACK_ALLOWED_KEYS) {
    if (body[key] !== undefined) feedbackData[key] = body[key];
  }
  if (!Object.keys(feedbackData).length)
    throw new AppError(`feedback must include at least one of: ${[...FEEDBACK_ALLOWED_KEYS].join(", ")}`, 400);

  const feedback = { ...feedbackData, submitted_at: new Date(), submitted_by: userId };
  const updated  = await Appointment.findByIdAndUpdate(
    appointmentId, { $set: { feedback } }, { new: true }
  );
  return { feedback: updated.feedback };
}

// ── POST /api/appointments/:id/complete ──────────────────────────────────────

async function completeAppointment(appointmentId, userId) {
  const profile = await DoctorProfile.findOne({ user_id: userId }).select("_id");
  if (!profile) throw new AppError("Doctor profile not found", 404);

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (appointment.doctor_id.toString() !== profile._id.toString())
    throw new AppError("Access denied", 403);
  if (appointment.status !== "confirmed")
    throw new AppError(`Cannot complete an appointment with status '${appointment.status}'`, 409);

  const updated = await Appointment.findByIdAndUpdate(
    appointment._id, { $set: { status: "completed" } }, { new: true }
  );
  return { appointment: updated };
}

// Detects file type from first magic bytes — only JPEG, PNG, and PDF accepted
function _detectTestFileType(base64) {
  const buf = Buffer.from(base64.slice(0, 20), "base64");
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF)                     return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return "png";
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf";
  return "unknown";
}

// ── POST /api/appointments/:id/test-uploads ───────────────────────────────────

async function uploadTestResult(appointmentId, body, user) {
  const { file_base64, mime_type, original_filename, test_name } = body;

  if (!file_base64) throw new AppError("file_base64 is required", 400);

  const approxBytes = (file_base64.length * 3) / 4;
  if (approxBytes > TEST_UPLOAD_MAX_MB * 1024 * 1024)
    throw new AppError(`File must be under ${TEST_UPLOAD_MAX_MB}MB`, 400);

  const detectedType = _detectTestFileType(file_base64);
  if (detectedType === "unknown")
    throw new AppError("Only JPEG, PNG, and PDF files are accepted for test results.", 422);

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (appointment.patient_id.toString() !== user.patient_id?.toString())
    throw new AppError("Access denied", 403);

  const isImage       = (mime_type || "").startsWith("image/");
  const cloudinaryType = isImage ? "image" : "raw";

  let uploadResult;
  try {
    uploadResult = await cloudinary.uploader.upload(
      `data:${mime_type || "application/pdf"};base64,${file_base64}`,
      { resource_type: cloudinaryType }
    );
  } catch (err) {
    throw new AppError("Failed to upload file — please try again", 502);
  }

  const entry = {
    test_name:         test_name?.trim() || "",
    file_url:          uploadResult.secure_url,
    file_type:         cloudinaryType,
    original_filename: original_filename || "",
    uploaded_at:       new Date(),
  };

  const updated = await Appointment.findByIdAndUpdate(
    appointmentId,
    { $push: { test_uploads: entry }, $set: { has_new_test_upload: true } },
    { new: true }
  );
  const lastUpload = updated.test_uploads[updated.test_uploads.length - 1];
  return { upload: lastUpload, has_new_test_upload: updated.has_new_test_upload };
}

// ── PATCH /api/appointments/:id/test-uploads/read ────────────────────────────

async function markTestUploadsRead(appointmentId, userId) {
  const profile = await DoctorProfile.findOne({ user_id: userId }).select("_id");
  if (!profile) throw new AppError("Doctor profile not found", 404);

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (appointment.doctor_id.toString() !== profile._id.toString())
    throw new AppError("Access denied", 403);

  await Appointment.updateOne({ _id: appointmentId }, { $set: { has_new_test_upload: false } });
  return { message: "Test uploads marked as read" };
}

// ── POST /api/appointments/:id/cancel ────────────────────────────────────────

async function cancelAppointment(appointmentId, user) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (appointment.patient_id.toString() !== user.patient_id?.toString())
    throw new AppError("Access denied", 403);
  if (!["confirmed", "pending_admin_review"].includes(appointment.status))
    throw new AppError(`Cannot cancel an appointment with status '${appointment.status}'`, 409);

  appointment.status = "cancelled";
  await appointment.save();

  await PatientDoctorAssignment.findByIdAndUpdate(
    appointment.assignment_id, { $set: { status: "terminated" } }
  );

  // Unlink the report so the patient can use it to book a new appointment
  if (appointment.report_id) {
    await Report.findByIdAndUpdate(appointment.report_id, { $unset: { appointment_id: "" } });
  }

  return { message: "Appointment cancelled and doctor access revoked", appointment };
}

module.exports = {
  createAppointment,
  getMyAppointments,
  getAppointmentById,
  getDoctorAppointments,
  adminGetAppointments,
  adminReviewAppointment,
  getPatientAppointmentHistory,
  addQuery,
  markQueriesRead,
  submitFeedback,
  uploadTestResult,
  markTestUploadsRead,
  completeAppointment,
  cancelAppointment,
};
