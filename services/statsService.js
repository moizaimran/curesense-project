// =============================================================================
// Backend/services/statsService.js — dashboard statistics
//
// "Patients treated" = appointments with status "completed", bucketed by the
// date the case was completed (completed_at), falling back to the slot date
// for cases completed before completed_at existed.
//
// All bucketing happens in the clinic timezone (Asia/Karachi by default) so a
// case completed at 11pm local time lands on the right day.
//
// doctorId = a DoctorProfile id → that doctor's numbers only.
// doctorId = null               → all doctors combined (admin analytics).
// =============================================================================
const mongoose      = require("mongoose");
const { AppError }  = require("../utils/errors");
const Appointment   = require("../models/Appointment");
const DoctorProfile = require("../models/DoctorProfile");

const TIMEZONE = process.env.STATS_TIMEZONE || "Asia/Karachi";

// How many buckets each view shows (spec: 7 days, 4–8 weeks, 6–12 months)
const PERIODS = {
  daily:   { unit: "day",   buckets: 7  },
  weekly:  { unit: "week",  buckets: 8  },
  monthly: { unit: "month", buckets: 12 },
};

// ── Calendar helpers (pure date math on YYYY-MM-DD, no timezone drift) ──────

function todayIn(timeZone) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(s, n) {
  const d = parseYmd(s);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

function addMonths(s, n) {
  const d = parseYmd(s);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return ymd(d);
}

// Start of the bucket containing `s` (weeks start on Monday)
function bucketStart(s, unit) {
  if (unit === "day") return s;
  if (unit === "month") return `${s.slice(0, 7)}-01`;
  const dow = parseYmd(s).getUTCDay(); // 0 = Sunday
  return addDays(s, -((dow + 6) % 7));
}

function nextBucket(s, unit) {
  if (unit === "day") return addDays(s, 1);
  if (unit === "week") return addDays(s, 7);
  return addMonths(s, 1);
}

function bucketLabel(start, unit) {
  const d = parseYmd(start);
  const opts = { timeZone: "UTC" };
  if (unit === "day")   return d.toLocaleDateString("en-GB", { ...opts, weekday: "short", day: "numeric" });
  if (unit === "week")  return d.toLocaleDateString("en-GB", { ...opts, day: "numeric", month: "short" });
  return d.toLocaleDateString("en-GB", { ...opts, month: "short", year: "2-digit" });
}

// Consecutive bucket starts ending with the one containing today
function bucketStarts(unit, count, today) {
  let start = bucketStart(today, unit);
  for (let i = 1; i < count; i++) {
    start = unit === "day" ? addDays(start, -1) : unit === "week" ? addDays(start, -7) : addMonths(start, -1);
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(start);
    start = nextBucket(start, unit);
  }
  return out;
}

// ── Access control ───────────────────────────────────────────────────────────

// Doctors may only read their own stats; admins may read any doctor's.
async function assertCanViewDoctor(doctorId, user) {
  if (!mongoose.isValidObjectId(doctorId)) throw new AppError("Invalid doctor id", 400);
  const profile = await DoctorProfile.findById(doctorId).select("_id user_id").lean();
  if (!profile) throw new AppError("Doctor not found", 404);
  if (user.role === "doctor" && String(profile.user_id) !== String(user._id))
    throw new AppError("Access denied", 403);
  return profile._id;
}

// ── Patients treated ─────────────────────────────────────────────────────────

async function patientsTreated({ doctorId = null, period = "daily", timeZone = TIMEZONE, today } = {}) {
  const cfg = PERIODS[period];
  if (!cfg) throw new AppError(`period must be one of: ${Object.keys(PERIODS).join(", ")}`, 400);

  const now    = today || todayIn(timeZone);
  const starts = bucketStarts(cfg.unit, cfg.buckets, now);
  const first  = starts[0];

  const match = { status: "completed" };
  if (doctorId) match.doctor_id = new mongoose.Types.ObjectId(String(doctorId));

  const rows = await Appointment.aggregate([
    { $match: match },
    {
      $addFields: {
        _treated_at: {
          $ifNull: [
            "$completed_at",
            { $dateFromString: { dateString: "$requested_slot.date", timezone: timeZone, onError: null, onNull: null } },
          ],
        },
      },
    },
    { $match: { _treated_at: { $ne: null } } },
    {
      $addFields: {
        _bucket: {
          $dateToString: {
            format: "%Y-%m-%d",
            timezone: timeZone,
            date: {
              $dateTrunc: { date: "$_treated_at", unit: cfg.unit, timezone: timeZone, startOfWeek: "monday" },
            },
          },
        },
      },
    },
    { $match: { _bucket: { $gte: first } } },
    { $group: { _id: "$_bucket", count: { $sum: 1 } } },
  ]);

  const counts = new Map(rows.map((r) => [r._id, r.count]));
  const buckets = starts.map((start) => ({
    start,
    label: bucketLabel(start, cfg.unit),
    count: counts.get(start) || 0,
  }));

  return {
    period,
    timezone: timeZone,
    buckets,
    total: buckets.reduce((sum, b) => sum + b.count, 0),
  };
}

// ── Case status + monthly comparison ─────────────────────────────────────────
//
// Case states (same definitions as the doctor dashboard cards):
//   completed → status "completed"
//   ongoing   → status "confirmed" and the doctor has replied at least once
//   pending   → status "confirmed" and the doctor hasn't replied yet (new case)
// Appointments still waiting for admin review aren't the doctor's cases yet.
//
// Monthly comparison (calendar months, clinic timezone):
//   patients_treated → distinct patients with a case completed that month
//   completed        → cases completed that month
//   pending/ongoing  → cases whose appointment falls in that month and are
//                      still pending / ongoing now
// "This month" is month-to-date.

const STATE_EXPR = {
  $switch: {
    branches: [
      { case: { $eq: ["$status", "completed"] }, then: "completed" },
      {
        case: {
          $and: [
            { $eq: ["$status", "confirmed"] },
            { $in: ["doctor", { $ifNull: ["$queries.sender", []] }] },
          ],
        },
        then: "ongoing",
      },
      { case: { $eq: ["$status", "confirmed"] }, then: "pending" },
    ],
    default: null,
  },
};

function pctChange(current, previous) {
  if (!previous) return current ? null : 0; // null = "new" (nothing last month to compare with)
  return Math.round(((current - previous) / previous) * 100);
}

function monthLabel(ym) {
  return new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
}

async function caseOverview({ doctorId = null, timeZone = TIMEZONE, today } = {}) {
  const now       = today || todayIn(timeZone);
  const thisMonth = now.slice(0, 7);
  const lastMonth = addMonths(`${thisMonth}-01`, -1).slice(0, 7);

  const match = { status: { $in: ["completed", "confirmed"] } };
  if (doctorId) match.doctor_id = new mongoose.Types.ObjectId(String(doctorId));

  const rows = await Appointment.aggregate([
    { $match: match },
    {
      $project: {
        patient_id: 1,
        state: STATE_EXPR,
        slot_month: { $substrBytes: [{ $ifNull: ["$requested_slot.date", ""] }, 0, 7] },
        completed_month: {
          $cond: [
            { $eq: ["$status", "completed"] },
            {
              $ifNull: [
                { $dateToString: { format: "%Y-%m", date: "$completed_at", timezone: timeZone } },
                { $substrBytes: [{ $ifNull: ["$requested_slot.date", ""] }, 0, 7] },
              ],
            },
            null,
          ],
        },
      },
    },
    { $match: { state: { $ne: null } } },
  ]);

  // Status donut — all of the doctor's current cases
  const status = { completed: 0, ongoing: 0, pending: 0 };
  for (const r of rows) status[r.state] += 1;
  const total = status.completed + status.ongoing + status.pending;
  const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);

  // Monthly comparison
  function month(ym) {
    const completedRows = rows.filter((r) => r.completed_month === ym);
    return {
      month: ym,
      label: monthLabel(ym),
      patients_treated: new Set(completedRows.map((r) => String(r.patient_id))).size,
      completed: completedRows.length,
      pending:   rows.filter((r) => r.state === "pending" && r.slot_month === ym).length,
      ongoing:   rows.filter((r) => r.state === "ongoing" && r.slot_month === ym).length,
    };
  }
  const current  = month(thisMonth);
  const previous = month(lastMonth);

  return {
    timezone: timeZone,
    status: {
      total,
      completed: { count: status.completed, percent: pct(status.completed) },
      ongoing:   { count: status.ongoing,   percent: pct(status.ongoing) },
      pending:   { count: status.pending,   percent: pct(status.pending) },
    },
    monthly: {
      this_month: current,
      last_month: previous,
      change: {
        patients_treated: pctChange(current.patients_treated, previous.patients_treated),
        completed:        pctChange(current.completed, previous.completed),
        pending:          pctChange(current.pending, previous.pending),
        ongoing:          pctChange(current.ongoing, previous.ongoing),
      },
    },
  };
}

module.exports = {
  PERIODS,
  assertCanViewDoctor,
  patientsTreated,
  caseOverview,
  // exported for tests
  _internal: { bucketStarts, bucketStart, bucketLabel },
};
