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
 const DoctorProfile =
  require("../models/DoctorProfile");

const DoctorAvailability =
  require("../models/DoctorAvailability");

const PatientDoctorAssignment =
  require("../models/PatientDoctorAssignment");

const Appointment =
  require("../models/Appointment");

const Report =
  require("../models/Report");

const cloudinary =
  require("../config/cloudinary");

const asyncHandler =
  require("../utils/asyncHandler");

const {
  canAccessPatient,
} = require("../middleware/auth");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Convert HH:MM to minutes from midnight
function toMinutes(t) {
  if (!t || typeof t !== "string") {
    return NaN;
  }

  const [h, m] =
    t.split(":").map(Number);

  return h * 60 + m;
}

// IMPORTANT:
// Calendar dates are handled as strings.
// Never use new Date("YYYY-MM-DD")
// for calendar comparisons.
function normalizeCalendarDate(value) {
  if (!value) return null;

  const date =
    String(value).slice(0, 10);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return null;
  }

  return date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check requested slot against doctor's availability
// ─────────────────────────────────────────────────────────────────────────────

async function isSlotValid(
  doctorProfileId,
  slot
) {
  const avail =
    await DoctorAvailability.findOne({
      doctor_id: doctorProfileId,
    });

  if (!avail) {
    return false;
  }

  const requestedDate =
    normalizeCalendarDate(slot.date);

  if (!requestedDate) {
    return false;
  }

  // ────────────────────────────────────────
  // Find date-specific exception
  // ────────────────────────────────────────

  const exception =
    (avail.exceptions || []).find(
      (ex) =>
        normalizeCalendarDate(ex.date) ===
        requestedDate
    );

  // Explicitly unavailable
  if (
    exception &&
    !exception.available
  ) {
    return false;
  }

  // ────────────────────────────────────────
  // If custom hours exist, use them
  // ────────────────────────────────────────

  let windows = [];

  if (exception?.custom_hours) {
    windows = [
      exception.custom_hours,
    ];
  } else {
    // If there is no exception,
    // use weekly schedule.
    //
    // We calculate day-of-week WITHOUT
    // relying on new Date("YYYY-MM-DD")
    // timezone conversion.

    const [
      year,
      month,
      day,
    ] = requestedDate
      .split("-")
      .map(Number);

    // Construct local date safely.
    const localDate =
      new Date(
        year,
        month - 1,
        day
      );

    const dow =
      localDate.getDay();

    windows =
      (avail.weekly_schedule || [])
        .filter(
          (schedule) =>
            Number(
              schedule.day_of_week
            ) === dow
        );
  }

  if (!windows.length) {
    return false;
  }

  const reqStart =
    toMinutes(slot.start_time);

  const reqEnd =
    toMinutes(slot.end_time);

  if (
    !Number.isFinite(reqStart) ||
    !Number.isFinite(reqEnd) ||
    reqEnd <= reqStart
  ) {
    return false;
  }

  return windows.some(
    (window) =>
      reqStart >=
        toMinutes(
          window.start_time
        ) &&
      reqEnd <=
        toMinutes(
          window.end_time
        )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Check if requested slot is already booked
// ─────────────────────────────────────────────────────────────────────────────

async function isSlotFree(
  doctorProfileId,
  slot
) {
  const requestedDate =
    normalizeCalendarDate(slot.date);

  if (!requestedDate) {
    return false;
  }

  // IMPORTANT:
  // requested_slot.date is stored as
  // YYYY-MM-DD STRING.
  //
  // Therefore we compare the string directly.
  const conflict =
    await Appointment.findOne({
      doctor_id:
        doctorProfileId,

      "requested_slot.date":
        requestedDate,

      "requested_slot.start_time":
        slot.start_time,

      status: {
        $in: [
          "confirmed",
          "pending_admin_review",
        ],
      },
    });

  return !conflict;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/appointments
// ─────────────────────────────────────────────────────────────────────────────

const createAppointment =
  asyncHandler(async (req, res) => {
    const {
      doctor_profile_id,
      slot,
      report_id,
    } = req.body;

    /*
      slot:
      {
        date: "2026-09-04",
        start_time: "09:00",
        end_time: "09:30"
      }
    */

    if (
      !doctor_profile_id ||
      !slot?.date ||
      !slot?.start_time ||
      !slot?.end_time ||
      !report_id
    ) {
      return res.status(400).json({
        error:
          "doctor_profile_id, slot (date, start_time, end_time), and report_id are required",
      });
    }

    // ────────────────────────────────────────
    // Normalize calendar date
    // ────────────────────────────────────────

    const requestedDate =
      normalizeCalendarDate(
        slot.date
      );

    if (!requestedDate) {
      return res.status(400).json({
        error:
          "Invalid date format. Expected YYYY-MM-DD",
      });
    }

    const normalizedSlot = {
      date: requestedDate,
      start_time: slot.start_time,
      end_time: slot.end_time,
    };

    // ────────────────────────────────────────
    // Patient
    // ────────────────────────────────────────

    const patientId =
      req.user.patient_id;

    if (!patientId) {
      return res.status(400).json({
        error:
          "No patient profile linked to this account",
      });
    }

    // ────────────────────────────────────────
    // Validate report
    // ────────────────────────────────────────

    const report =
      await Report.findById(report_id);

    if (!report) {
      return res.status(404).json({
        error: "Report not found",
      });
    }

    if (
      report.patient_id.toString() !==
      patientId.toString()
    ) {
      return res.status(403).json({
        error:
          "This report does not belong to you",
      });
    }

    if (report.appointment_id) {
      return res.status(409).json({
        error:
          "This report is already linked to an appointment",
      });
    }

    // ────────────────────────────────────────
    // Validate doctor
    // ────────────────────────────────────────

    const doctor =
      await DoctorProfile.findById(
        doctor_profile_id
      );

    if (!doctor) {
      return res.status(404).json({
        error: "Doctor not found",
      });
    }

    if (doctor.status !== "verified") {
      return res.status(400).json({
        error:
          "This doctor is not yet verified",
      });
    }

    // ────────────────────────────────────────
    // Validate slot
    //
    // NEW: capacity-mode ("walk-in" style) days work differently — the
    // whole window (e.g. 9:00–12:00) is ONE slot that many patients can
    // all book, up to a max_patients cap, instead of each patient
    // needing a unique time slot.
    // ────────────────────────────────────────

    const availForCapacityCheck =
      await DoctorAvailability.findOne({
        doctor_id: doctor._id,
      });

    const exceptionForDate =
      (availForCapacityCheck?.exceptions || []).find(
        (ex) =>
          normalizeCalendarDate(ex.date) ===
          requestedDate
      );

    if (exceptionForDate?.max_patients) {
      // Capacity mode.
      if (!exceptionForDate.available) {
        return res.status(400).json({
          error:
            "Doctor is unavailable on this date",
        });
      }

      const win = exceptionForDate.custom_hours;

      if (
        !win ||
        normalizedSlot.start_time !== win.start_time ||
        normalizedSlot.end_time !== win.end_time
      ) {
        return res.status(400).json({
          error:
            "Invalid slot for this date",
        });
      }

      const bookedCount =
        await Appointment.countDocuments({
          doctor_id: doctor._id,
          "requested_slot.date": requestedDate,
          status: {
            $in: ["confirmed", "pending_admin_review"],
          },
        });

      if (bookedCount >= exceptionForDate.max_patients) {
        return res.status(409).json({
          error:
            "This day is fully booked — please choose another date",
        });
      }
    } else {
      // Normal (non-capacity) validation — unchanged.
      if (
        !(await isSlotValid(
          doctor._id,
          normalizedSlot
        ))
      ) {
        return res.status(400).json({
          error:
            "Requested slot is outside the doctor's availability",
        });
      }

      // Prevent double booking
      if (
        !(await isSlotFree(
          doctor._id,
          normalizedSlot
        ))
      ) {
        return res.status(409).json({
          error:
            "This slot is already booked — please choose another time",
        });
      }
    }

    // ────────────────────────────────────────
    // Patient-doctor assignment
    // ────────────────────────────────────────

    const assignment =
      await PatientDoctorAssignment.findOneAndUpdate(
        {
          patient_id: patientId,
          doctor_id: doctor._id,
        },

        {
          $setOnInsert: {
            patient_id: patientId,
            doctor_id: doctor._id,
            status: "pending",
          },
        },

        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

    // ────────────────────────────────────────
    // Determine appointment status
    // ────────────────────────────────────────

    const isRepeatVisit =
      assignment.status === "active";

    const appointmentStatus =
      isRepeatVisit
        ? "confirmed"
        : "pending_admin_review";

    // ────────────────────────────────────────
    // Create appointment
    //
    // IMPORTANT:
    // Store date as YYYY-MM-DD STRING.
    // ────────────────────────────────────────

    const appointment =
      await Appointment.create({
        patient_id: patientId,

        doctor_id:
          doctor._id,

        assignment_id:
          assignment._id,

        requested_slot: {
          date: requestedDate,
          start_time:
            normalizedSlot.start_time,
          end_time:
            normalizedSlot.end_time,
        },

        status:
          appointmentStatus,

        report_id:
          report._id,
      });

    // ────────────────────────────────────────
    // Link report to appointment
    // ────────────────────────────────────────

    await Report.findByIdAndUpdate(
      report._id,
      {
        $set: {
          appointment_id:
            appointment._id,
        },
      }
    );

    res.status(201).json({
      appointment,

      assignment_status:
        assignment.status,

      requires_admin_review:
        !isRepeatVisit,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/appointments/:id
// ─────────────────────────────────────────────────────────────────────────────

const getAppointmentById =
  asyncHandler(async (req, res) => {
    const appointment =
      await Appointment.findById(
        req.params.id
      )
        .populate(
          "patient_id",
          "name dob gender contact allergies current_medications"
        )
        .populate(
          "doctor_id",
          "specialty hospital_clinic"
        );

    if (!appointment) {
      return res.status(404).json({
        error:
          "Appointment not found",
      });
    }

    if (
      req.user.role === "patient"
    ) {
      if (
        appointment.patient_id._id.toString() !==
        req.user.patient_id?.toString()
      ) {
        return res.status(403).json({
          error: "Access denied",
        });
      }
    } else if (
      req.user.role === "doctor"
    ) {
      const profile =
        await DoctorProfile.findOne({
          user_id: req.user._id,
        }).select("_id");

      if (
        !profile ||
        appointment.doctor_id._id.toString() !==
          profile._id.toString()
      ) {
        return res.status(403).json({
          error: "Access denied",
        });
      }

      if (
        !(await canAccessPatient(
          req.user,
          appointment.patient_id._id ||
            appointment.patient_id
        ))
      ) {
        return res.status(403).json({
          error:
            "Access denied — appointment pending admin approval",
        });
      }

           if (!appointment.doctor_viewed || appointment.has_new_test_upload) {
        await Appointment.findByIdAndUpdate(
          appointment._id,
          {
            doctor_viewed: true,
            has_new_test_upload: false,
          }
        );
      }
    }

    res.json(appointment);
  });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/appointments/doctor
// ─────────────────────────────────────────────────────────────────────────────

const getDoctorAppointments =
  asyncHandler(async (req, res) => {
    const profile =
      await DoctorProfile.findOne({
        user_id: req.user._id,
      });

    if (!profile) {
      return res.status(404).json({
        error:
          "Doctor profile not found",
      });
    }

    const { status } =
      req.query;

    if (
      status ===
      "pending_admin_review"
    ) {
      return res.json([]);
    }

    const filter = {
      doctor_id: profile._id,

      status: {
        $ne:
          "pending_admin_review",
      },
    };

    if (status) {
      filter.status = status;
    }

    const appointments =
      await Appointment.find(filter)
        .populate(
          "patient_id",
          "name dob gender contact"
        )
        .sort({
          "requested_slot.date": -1,
        });

    res.json(appointments);
  });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/appointments
// ─────────────────────────────────────────────────────────────────────────────

const adminGetAppointments =
  asyncHandler(async (req, res) => {
    const {
      status =
        "pending_admin_review",

      page = 1,

      limit = 50,
    } = req.query;

    const skip =
      (Number(page) - 1) *
      Number(limit);

    const total =
      await Appointment.countDocuments({
        status,
      });

    const docs =
      await Appointment.find({
        status,
      })
        .populate(
          "patient_id",
          "name dob gender contact"
        )
        .populate({
          path: "doctor_id",

          select:
            "specialty hospital_clinic pmdc_number location contact user_id",

          populate: {
            path: "user_id",
            select: "name",
          },
        })
        .sort({
          created_at: 1,
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
// PATCH /api/admin/appointments/:id/review
// ─────────────────────────────────────────────────────────────────────────────

const adminReviewAppointment =
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

    const appointment =
      await Appointment.findById(
        req.params.id
      );

    if (!appointment) {
      return res.status(404).json({
        error:
          "Appointment not found",
      });
    }

    if (
      appointment.status !==
      "pending_admin_review"
    ) {
      return res.status(409).json({
        error:
          `Appointment is already ${appointment.status}`,
      });
    }

    appointment.reviewed_by =
      req.user._id;

    appointment.reviewed_at =
      new Date();

    if (decision === "approve") {
      appointment.status =
        "confirmed";

      await appointment.save();

      const assignment =
        await PatientDoctorAssignment.findById(
          appointment.assignment_id
        );

      // FIX: previously this only reactivated the assignment when its
      // status was "pending". If a patient had cancelled an earlier
      // appointment (which sets the assignment to "terminated") and then
      // booked again, approving the new appointment never brought the
      // assignment back to "active" — so the patient permanently
      // disappeared from "Total Assigned Patients" (which counts
      // status: "active") even though they had a confirmed/completed
      // appointment. Now we reactivate from any non-active status
      // (covers both "pending" and "terminated").
      if (
        assignment &&
        assignment.status !== "active"
      ) {
        assignment.status =
          "active";

        if (!assignment.first_appointment_id) {
          assignment.first_appointment_id =
            appointment._id;
        }

        assignment.activated_at =
          new Date();

        await assignment.save();
      }
    } else {
      if (
        !rejection_reason?.trim()
      ) {
        return res.status(400).json({
          error:
            "rejection_reason is required when rejecting",
        });
      }

      appointment.status =
        "rejected";

      appointment.rejection_reason =
        rejection_reason.trim();

      await appointment.save();
    }

    res.json({
      appointment,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/patients/:id/appointments
// ─────────────────────────────────────────────────────────────────────────────

const getPatientAppointmentHistory =
  asyncHandler(async (req, res) => {
    if (
      !(await canAccessPatient(
        req.user,
        req.params.id
      ))
    ) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    const {
      doctor_id,
      status,
    } = req.query;

    const filter = {
      patient_id:
        req.params.id,
    };

    if (doctor_id) {
      filter.doctor_id =
        doctor_id;
    }

    if (status) {
      filter.status =
        status;
    }

    const appointments =
      await Appointment.find(filter)
        .populate(
          "doctor_id",
          "specialty hospital_clinic"
        )
        .sort({
          "requested_slot.date": -1,
        });

    res.json(appointments);
  });

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/appointments/:id/queries
// ─────────────────────────────────────────────────────────────────────────────

const QUERY_MAX_CHARS = 2000;

const addQuery =
  asyncHandler(async (req, res) => {
    const { message } =
      req.body;

    if (!message?.trim()) {
      return res.status(400).json({
        error:
          "message is required",
      });
    }

    if (
      message.length >
      QUERY_MAX_CHARS
    ) {
      return res.status(400).json({
        error:
          `message must be ${QUERY_MAX_CHARS} characters or fewer`,
      });
    }

    const appointment =
      await Appointment.findById(
        req.params.id
      );

    if (!appointment) {
      return res.status(404).json({
        error:
          "Appointment not found",
      });
    }

    let sender;

    if (
      req.user.role === "patient"
    ) {
      if (
        appointment.patient_id.toString() !==
        req.user.patient_id?.toString()
      ) {
        return res.status(403).json({
          error: "Access denied",
        });
      }

      sender = "patient";
    } else if (
      req.user.role === "doctor"
    ) {
      if (
        !(await canAccessPatient(
          req.user,
          appointment.patient_id
        ))
      ) {
        return res.status(403).json({
          error: "Access denied",
        });
      }

      sender = "doctor";
    } else {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    const update = {
      $push: {
        queries: {
          sender,

          message:
            message.trim(),

          created_at:
            new Date(),

          read: false,
        },
      },
    };

    if (sender === "patient") {
      update.$set = {
        has_unread_patient_query:
          true,
      };
    }

    const updated =
      await Appointment.findByIdAndUpdate(
        req.params.id,
        update,
        {
          new: true,
        }
      );

    const lastQuery =
      updated.queries[
        updated.queries.length - 1
      ];

    res.status(201).json({
      query: lastQuery,

      has_unread_patient_query:
        updated.has_unread_patient_query,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/appointments/:id/queries/read
// ─────────────────────────────────────────────────────────────────────────────

const markQueriesRead =
  asyncHandler(async (req, res) => {
    const profile =
      await DoctorProfile.findOne({
        user_id: req.user._id,
      }).select("_id");

    if (!profile) {
      return res.status(404).json({
        error:
          "Doctor profile not found",
      });
    }

    const appointment =
      await Appointment.findById(
        req.params.id
      );

    if (!appointment) {
      return res.status(404).json({
        error:
          "Appointment not found",
      });
    }

    if (
      appointment.doctor_id.toString() !==
      profile._id.toString()
    ) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    await Appointment.updateOne(
      {
        _id: req.params.id,
      },

      {
        $set: {
          has_unread_patient_query:
            false,

          "queries.$[msg].read":
            true,
        },
      },

      {
        arrayFilters: [
          {
            "msg.sender":
              "patient",

            "msg.read":
              false,
          },
        ],
      }
    );

    res.json({
      message:
        "Queries marked as read",
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/appointments/:id/feedback
// ─────────────────────────────────────────────────────────────────────────────

const submitFeedback =
  asyncHandler(async (req, res) => {
    const profile =
      await DoctorProfile.findOne({
        user_id: req.user._id,
      }).select("_id");

    if (!profile) {
      return res.status(404).json({
        error:
          "Doctor profile not found",
      });
    }

    const appointment =
      await Appointment.findById(
        req.params.id
      );

    if (!appointment) {
      return res.status(404).json({
        error:
          "Appointment not found",
      });
    }

    if (
      appointment.doctor_id.toString() !==
      profile._id.toString()
    ) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    const feedback = {
      ...req.body,

      submitted_at:
        new Date(),

      submitted_by:
        req.user._id,
    };

    const updated =
      await Appointment.findByIdAndUpdate(
        req.params.id,

        {
          $set: {
            feedback,
          },
        },

        {
          new: true,
        }
      );

    res.json({
      feedback:
        updated.feedback,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/appointments/:id/complete
// ─────────────────────────────────────────────────────────────────────────────

const completeAppointment =
  asyncHandler(async (req, res) => {
    const profile =
      await DoctorProfile.findOne({
        user_id: req.user._id,
      }).select("_id");

    if (!profile) {
      return res.status(404).json({
        error:
          "Doctor profile not found",
      });
    }

    const appointment =
      await Appointment.findById(
        req.params.id
      );

    if (!appointment) {
      return res.status(404).json({
        error:
          "Appointment not found",
      });
    }

    if (
      appointment.doctor_id.toString() !==
      profile._id.toString()
    ) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    if (
      appointment.status !==
      "confirmed"
    ) {
      return res.status(409).json({
        error:
          `Cannot complete an appointment with status '${appointment.status}'`,
      });
    }

    // Use findByIdAndUpdate to avoid full-document validation on legacy
    // appointments whose requested_slot.date was stored in a non-YYYY-MM-DD
    // format before normalizeCalendarDate was enforced on all writes.
    const updated = await Appointment.findByIdAndUpdate(
      appointment._id,
      { $set: { status: "completed" } },
      { new: true }
    );

    res.json({
      appointment: updated,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/appointments/:id/test-uploads
//
// Patient uploads a test result (image or PDF) that the doctor asked for
// via feedback.tests_requested. Uploaded to Cloudinary (same pattern as
// sessionController's voice upload), stored on the appointment, and
// flags has_new_test_upload so the doctor sees it when opening the case.
// ─────────────────────────────────────────────────────────────────────────────

const TEST_UPLOAD_MAX_MB = 15;

const uploadTestResult =
  asyncHandler(async (req, res) => {
    const {
      file_base64,
      mime_type,
      original_filename,
      test_name,
    } = req.body;

    if (!file_base64) {
      return res.status(400).json({
        error: "file_base64 is required",
      });
    }

    // Rough size guard before we even try uploading — base64 is ~4/3 the
    // size of the raw bytes.
    const approxBytes =
      (file_base64.length * 3) / 4;

    if (
      approxBytes >
      TEST_UPLOAD_MAX_MB * 1024 * 1024
    ) {
      return res.status(400).json({
        error: `File must be under ${TEST_UPLOAD_MAX_MB}MB`,
      });
    }

    const appointment =
      await Appointment.findById(
        req.params.id
      );

    if (!appointment) {
      return res.status(404).json({
        error:
          "Appointment not found",
      });
    }

    if (
      appointment.patient_id.toString() !==
      req.user.patient_id?.toString()
    ) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    const isImage =
      (mime_type || "").startsWith(
        "image/"
      );

    const cloudinaryType = isImage
      ? "image"
      : "raw";

    let uploadResult;

    try {
      uploadResult =
        await cloudinary.uploader.upload(
          `data:${mime_type || "application/pdf"};base64,${file_base64}`,
          { resource_type: cloudinaryType }
        );
    } catch (err) {
      req.log?.error(
        { err: err?.message },
        "Test upload failed on Cloudinary"
      );
      return res.status(502).json({
        error:
          "Failed to upload file — please try again",
      });
    }

    const entry = {
      test_name:
        test_name?.trim() || "",
      file_url:
        uploadResult.secure_url,
      file_type: cloudinaryType,
      original_filename:
        original_filename || "",
      uploaded_at: new Date(),
    };

    const updated =
      await Appointment.findByIdAndUpdate(
        req.params.id,
        {
          $push: {
            test_uploads: entry,
          },
          $set: {
            has_new_test_upload: true,
          },
        },
        { new: true }
      );

    const lastUpload =
      updated.test_uploads[
        updated.test_uploads.length - 1
      ];

    res.status(201).json({
      upload: lastUpload,
      has_new_test_upload:
        updated.has_new_test_upload,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/appointments/:id/test-uploads/read
//
// Doctor opens the case → clears the "new test upload" flag.
// ─────────────────────────────────────────────────────────────────────────────

const markTestUploadsRead =
  asyncHandler(async (req, res) => {
    const profile =
      await DoctorProfile.findOne({
        user_id: req.user._id,
      }).select("_id");

    if (!profile) {
      return res.status(404).json({
        error:
          "Doctor profile not found",
      });
    }

    const appointment =
      await Appointment.findById(
        req.params.id
      );

    if (!appointment) {
      return res.status(404).json({
        error:
          "Appointment not found",
      });
    }

    if (
      appointment.doctor_id.toString() !==
      profile._id.toString()
    ) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    await Appointment.updateOne(
      { _id: req.params.id },
      {
        $set: {
          has_new_test_upload: false,
        },
      }
    );

    res.json({
      message:
        "Test uploads marked as read",
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/appointments/:id/cancel
// ─────────────────────────────────────────────────────────────────────────────

const cancelAppointment =
  asyncHandler(async (req, res) => {
    const appointment =
      await Appointment.findById(
        req.params.id
      );

    if (!appointment) {
      return res.status(404).json({
        error:
          "Appointment not found",
      });
    }

    if (
      appointment.patient_id.toString() !==
      req.user.patient_id?.toString()
    ) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    if (
      ![
        "confirmed",
        "pending_admin_review",
      ].includes(
        appointment.status
      )
    ) {
      return res.status(409).json({
        error:
          `Cannot cancel an appointment with status '${appointment.status}'`,
      });
    }

    appointment.status =
      "cancelled";

    await appointment.save();

    await PatientDoctorAssignment.findByIdAndUpdate(
      appointment.assignment_id,

      {
        $set: {
          status: "terminated",
        },
      }
    );

    res.json({
      message:
        "Appointment cancelled and doctor access revoked",

      appointment,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

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
  uploadTestResult,
  markTestUploadsRead,
  completeAppointment,
  cancelAppointment,
};
