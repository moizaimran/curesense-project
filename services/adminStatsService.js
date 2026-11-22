// =============================================================================
// Backend/services/adminStatsService.js — admin dashboard analytics
//
// Everything accepts an optional doctorId: null = whole platform, otherwise
// just that doctor (the admin's "filter by doctor").
//
// Money terms (PKR):
//   received        → payments confirmed as in our account: card "paid"
//                     (gateway-confirmed) + "verified" (admin-approved)
//   awaiting review → paid / submitted payments on appointments the admin
//                     hasn't approved yet ("pending payment verifications")
//   refund due      → money we owe back (appointment rejected/cancelled)
// =============================================================================
const mongoose      = require("mongoose");
const { AppError }  = require("../utils/errors");
const Appointment   = require("../models/Appointment");
const DoctorProfile = require("../models/DoctorProfile");
const Patient       = require("../models/Patient");
const Review        = require("../models/Review");

const TIMEZONE = process.env.STATS_TIMEZONE || "Asia/Karachi";

function toObjectId(id) {
  if (!id) return null;
  if (!mongoose.isValidObjectId(id)) throw new AppError("doctor_id is not a valid id", 400);
  return new mongoose.Types.ObjectId(String(id));
}

function currentMonth(timeZone = TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

// Throws 404 when filtering by a doctor that doesn't exist
async function resolveDoctor(doctorId) {
  const id = toObjectId(doctorId);
  if (!id) return null;
  const exists = await DoctorProfile.exists({ _id: id });
  if (!exists) throw new AppError("Doctor not found", 404);
  return id;
}

// ── KPI summary ──────────────────────────────────────────────────────────────

async function summary({ doctorId = null, timeZone = TIMEZONE, month } = {}) {
  const doc   = await resolveDoctor(doctorId);
  const match = doc ? { doctor_id: doc } : {};
  const ym    = month || currentMonth(timeZone);

  const [doctorCounts, patientCount, apptByStatus, money, ratingAgg] = await Promise.all([
    doc ? null : DoctorProfile.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    doc ? Appointment.distinct("patient_id", match).then((ids) => ids.length) : Patient.countDocuments(),
    Appointment.aggregate([{ $match: match }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Appointment.aggregate([
      { $match: { ...match, "payment.required": true } },
      {
        $group: {
          _id: null,
          received: {
            $sum: { $cond: [{ $in: ["$payment.status", ["paid", "verified"]] }, "$payment.amount", 0] },
          },
          received_this_month: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ["$payment.status", ["paid", "verified"]] },
                    {
                      $eq: [
                        { $dateToString: { format: "%Y-%m", timezone: timeZone, date: { $ifNull: ["$payment.paid_at", "$payment.verified_at"] } } },
                        ym,
                      ],
                    },
                  ],
                },
                "$payment.amount",
                0,
              ],
            },
          },
          awaiting_count: {
            $sum: { $cond: [{ $and: [{ $eq: ["$status", "pending_admin_review"] }, { $in: ["$payment.status", ["paid", "submitted"]] }] }, 1, 0] },
          },
          awaiting_amount: {
            $sum: { $cond: [{ $and: [{ $eq: ["$status", "pending_admin_review"] }, { $in: ["$payment.status", ["paid", "submitted"]] }] }, "$payment.amount", 0] },
          },
          refund_due_count:  { $sum: { $cond: [{ $eq: ["$payment.status", "refund_due"] }, 1, 0] } },
          refund_due_amount: { $sum: { $cond: [{ $eq: ["$payment.status", "refund_due"] }, "$payment.amount", 0] } },
          refunded_amount:   { $sum: { $cond: [{ $eq: ["$payment.status", "refunded"] }, "$payment.amount", 0] } },
          unpaid_count:      { $sum: { $cond: [{ $eq: ["$payment.status", "unpaid"] }, 1, 0] } },
        },
      },
    ]),
    Review.aggregate([
      { $match: { reviewer_role: "patient", ...(doc ? { doctor_id: doc } : {}) } },
      { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]),
  ]);

  const byStatus = Object.fromEntries(apptByStatus.map((r) => [r._id, r.n]));
  const m = money[0] || {};
  const docCount = doctorCounts ? Object.fromEntries(doctorCounts.map((r) => [r._id, r.n])) : null;

  return {
    doctor_id: doc ? String(doc) : null,
    month: ym,
    doctors: docCount && {
      total:    (docCount.verified || 0) + (docCount.pending || 0) + (docCount.rejected || 0),
      verified: docCount.verified || 0,
      pending:  docCount.pending  || 0,
    },
    patients: patientCount,
    appointments: {
      total: apptByStatus.reduce((s, r) => s + r.n, 0),
      pending_review: byStatus.pending_admin_review || 0,
      confirmed:      byStatus.confirmed || 0,
      completed:      byStatus.completed || 0,
      cancelled:      (byStatus.cancelled || 0) + (byStatus.rejected || 0) + (byStatus.no_show || 0),
    },
    revenue: {
      currency: "PKR",
      received:            m.received || 0,
      received_this_month: m.received_this_month || 0,
      refund_due:  { count: m.refund_due_count || 0, amount: m.refund_due_amount || 0 },
      refunded_amount: m.refunded_amount || 0,
    },
    payments: {
      pending_verification: { count: m.awaiting_count || 0, amount: m.awaiting_amount || 0 },
      awaiting_patient:     m.unpaid_count || 0,
    },
    rating: {
      average: ratingAgg[0] ? Math.round(ratingAgg[0].average * 100) / 100 : 0,
      count:   ratingAgg[0]?.count || 0,
    },
  };
}

// ── Per-doctor table (ratings, workload, revenue) ────────────────────────────

async function doctorTable() {
  const [doctors, work] = await Promise.all([
    DoctorProfile.find({ status: "verified" })
      .select("specialty hospital_clinic location.city rating consultation_fee user_id name_as_per_cnic")
      .populate("user_id", "name")
      .lean(),
    Appointment.aggregate([
      {
        $group: {
          _id: "$doctor_id",
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          active:    { $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] } },
          patients:  { $addToSet: { $cond: [{ $eq: ["$status", "completed"] }, "$patient_id", "$$REMOVE"] } },
          revenue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$payment.required", true] }, { $in: ["$payment.status", ["paid", "verified"]] }] },
                "$payment.amount",
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const byDoctor = new Map(work.map((w) => [String(w._id), w]));
  const results = doctors.map((d) => {
    const w = byDoctor.get(String(d._id)) || {};
    return {
      _id: d._id,
      name: d.user_id?.name || d.name_as_per_cnic || "—",
      specialty: d.specialty,
      city: d.location?.city || "",
      consultation_fee: d.consultation_fee || 0,
      rating: { average: d.rating?.average || 0, count: d.rating?.count || 0 },
      completed_cases: w.completed || 0,
      active_cases: w.active || 0,
      patients_treated: (w.patients || []).length,
      revenue: w.revenue || 0,
    };
  });

  // Top performers: most patients treated, then best rating, then most reviews
  const top = [...results]
    .filter((r) => r.completed_cases > 0)
    .sort((a, b) =>
      b.patients_treated - a.patients_treated ||
      b.rating.average - a.rating.average ||
      b.rating.count - a.rating.count)
    .slice(0, 5)
    .map((r) => String(r._id));

  return { results, top_performers: top };
}

// ── Reports & analytics (AI consultations) ───────────────────────────────────

const REPORT_RANGES = { "30d": 30, "90d": 90, "12m": 365, all: null };

function rangeStart(range) {
  if (!(range in REPORT_RANGES)) throw new AppError(`range must be one of: ${Object.keys(REPORT_RANGES).join(", ")}`, 400);
  const days = REPORT_RANGES[range];
  return days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
}

// Last `count` calendar months (YYYY-MM) ending with the current one
function lastMonths(count, timeZone = TIMEZONE) {
  const [y, m] = currentMonth(timeZone).split("-").map(Number);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

// The report's headline condition: first "likely" interpreted diagnosis,
// else the first interpreted one, else the top of the raw disease ranking.
const PRIMARY_CONDITION = {
  $let: {
    vars: {
      likely: {
        $arrayElemAt: [
          { $filter: { input: { $ifNull: ["$interpreted_diagnoses", []] }, as: "d", cond: { $eq: ["$$d.plausibility", "likely"] } } },
          0,
        ],
      },
      firstInterp: { $arrayElemAt: [{ $ifNull: ["$interpreted_diagnoses", []] }, 0] },
      firstRank:   { $arrayElemAt: [{ $ifNull: ["$disease_ranking", []] }, 0] },
    },
    in: {
      $trim: { input: { $ifNull: ["$$likely.disease", { $ifNull: ["$$firstInterp.disease", { $ifNull: ["$$firstRank.disease", ""] }] }] } },
    },
  },
};

async function reportsAnalytics({ range = "90d", timeZone = TIMEZONE } = {}) {
  const Report  = require("../models/Report");
  const Session = require("../models/Session");

  const from  = rangeStart(range);
  const match = { is_deleted: { $ne: true }, ...(from ? { generated_at: { $gte: from } } : {}) };
  const months = lastMonths(12, timeZone);
  const trendFrom = new Date(Date.UTC(Number(months[0].slice(0, 4)), Number(months[0].slice(5, 7)) - 1, 1) - 24 * 3600 * 1000);

  const [kpi, conditions, specialties, sessionStatus, reportTrend, patientTrend] = await Promise.all([
    Report.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total:     { $sum: 1 },
          shared:    { $sum: { $cond: [{ $ne: [{ $ifNull: ["$appointment_id", null] }, null] }, 1, 0] } },
          emergency: { $sum: { $cond: [{ $eq: ["$emergency_warning.triggered", true] }, 1, 0] } },
          patients:  { $addToSet: "$patient_id" },
        },
      },
    ]),
    Report.aggregate([
      { $match: match },
      { $project: { condition: PRIMARY_CONDITION } },
      { $match: { condition: { $ne: "" } } },
      { $group: { _id: { $toLower: "$condition" }, name: { $first: "$condition" }, count: { $sum: 1 } } },
      { $sort: { count: -1, name: 1 } },
      { $limit: 10 },
    ]),
    Report.aggregate([
      { $match: match },
      { $project: { s: { $trim: { input: { $ifNull: ["$patient_summary.referralSpecialty", ""] } } } } },
      { $match: { s: { $ne: "" } } },
      { $group: { _id: { $toLower: "$s" }, name: { $first: "$s" }, count: { $sum: 1 } } },
      { $sort: { count: -1, name: 1 } },
      { $limit: 10 },
    ]),
    Session.aggregate([
      { $match: { is_deleted: { $ne: true }, ...(from ? { started_at: { $gte: from } } : {}) } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    Report.aggregate([
      { $match: { is_deleted: { $ne: true }, generated_at: { $gte: trendFrom } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$generated_at", timezone: timeZone } }, n: { $sum: 1 } } },
    ]),
    Patient.aggregate([
      { $match: { created_at: { $gte: trendFrom } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$created_at", timezone: timeZone } }, n: { $sum: 1 } } },
    ]),
  ]);

  const k = kpi[0] || { total: 0, shared: 0, emergency: 0, patients: [] };
  const sessions = Object.fromEntries(sessionStatus.map((r) => [r._id, r.n]));
  const rep = new Map(reportTrend.map((r) => [r._id, r.n]));
  const pat = new Map(patientTrend.map((r) => [r._id, r.n]));
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

  return {
    range,
    consultations: {
      total: k.total,
      patients: k.patients.length,
      shared_with_doctor: k.shared,
      shared_percent: pct(k.shared, k.total),
      emergency_flags: k.emergency,
      emergency_percent: pct(k.emergency, k.total),
    },
    interviews: {
      completed:   sessions.completed   || 0,
      abandoned:   sessions.abandoned   || 0,
      failed:      sessions.failed      || 0,
      in_progress: sessions.in_progress || 0,
    },
    top_conditions:  conditions.map((c) => ({ name: c.name, count: c.count })),
    top_specialties: specialties.map((c) => ({ name: c.name, count: c.count })),
    monthly: months.map((m) => ({
      month: m,
      label: new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "short", year: "2-digit" }),
      consultations: rep.get(m) || 0,
      new_patients:  pat.get(m) || 0,
    })),
  };
}

module.exports = { summary, doctorTable, resolveDoctor, reportsAnalytics, REPORT_RANGES };
