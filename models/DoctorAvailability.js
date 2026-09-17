// =============================================================================
// Backend/models/DoctorAvailability.js
//
// One document per doctor — describes when they accept appointments.
// weekly_schedule: recurring weekly windows (day_of_week 0=Sunday … 6=Saturday).
// exceptions:      one-off overrides — a holiday (available:false) or an extra
//                  session on a normally-off day (available:true, custom_hours).
// slot_duration_minutes: default booking slot length.
// =============================================================================
const mongoose = require("mongoose");

const TimeWindowSchema = new mongoose.Schema(
  {
    start_time: { type: String, required: true }, // "09:00"
    end_time:   { type: String, required: true }, // "17:00"
  },
  { _id: false }
);

const WeeklySlotSchema = new mongoose.Schema(
  {
    day_of_week: { type: Number, required: true, min: 0, max: 6 },
    start_time:  { type: String, required: true },
    end_time:    { type: String, required: true },
  },
  { _id: false }
);

const ExceptionSchema = new mongoose.Schema(
  {
    // Store as YYYY-MM-DD string, NOT Date (see prior timezone bug notes).
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    available:    { type: Boolean, required: true }, // false = day off
    custom_hours: { type: TimeWindowSchema, default: null },

    // NEW: "capacity mode" / walk-in mode.
    // When set (a positive number), the whole custom_hours window is
    // treated as ONE bookable slot that up to `max_patients` different
    // patients can all book (e.g. "9:00–12:00, up to 50 patients")
    // instead of the window being divided into fixed-duration slots.
    // null/undefined = normal fixed-duration slot generation (unchanged
    // behavior).
    max_patients: {
      type: Number,
      default: null,
      min: 1,
    },
  },
  { _id: false }
);

const DoctorAvailabilitySchema = new mongoose.Schema(
  {
    doctor_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "DoctorProfile",
      required: true,
      unique:   true,
    },
    weekly_schedule:       { type: [WeeklySlotSchema], default: [] },
    slot_duration_minutes: { type: Number, default: 30, min: 5 },
    exceptions:            { type: [ExceptionSchema], default: [] },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("DoctorAvailability", DoctorAvailabilitySchema);
