// =============================================================================
// Backend/tests/stats.test.js — "patients treated" chart data
// =============================================================================

process.env.JWT_SECRET = "test_secret_for_jest";

const request  = require("supertest");
const jwt      = require("jsonwebtoken");
const mongoose = require("mongoose");

const app = require("../app");
const { connect, closeDatabase, clearDatabase } = require("./mongoTestHelper");

const User                    = require("../models/User");
const Patient                 = require("../models/Patient");
const DoctorProfile           = require("../models/DoctorProfile");
const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");
const Appointment             = require("../models/Appointment");
const { patientsTreated, caseOverview, _internal } = require("../services/statsService");

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
afterEach(async () => await clearDatabase());

const auth = (id) => `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" })}`;

let seq = 0;
async function makeDoctor() {
  seq += 1;
  const uid = new mongoose.Types.ObjectId();
  const user = await User.create({ _id: uid, name: `Dr ${seq}`, email: `d${seq}@t.com`, role: "doctor", provider_uid: uid.toString() });
  const profile = await DoctorProfile.create({
    user_id: uid, pmdc_number: `S-${seq}`, name_as_per_cnic: "x", father_name_as_per_cnic: "y",
    specialty: "Cardiology", gender: "male", location: { city: "Lahore" },
    contact: { phone: "0", email: `d${seq}@t.com` }, status: "verified",
  });
  return { user, profile };
}

// A case for `doctor`; `completedAt` is an ISO instant (or null for legacy cases)
async function makeCase(doctor, { status = "completed", completedAt = null, slotDate = "2026-01-01", doctorReplied = false, patient = null } = {}) {
  seq += 1;
  patient = patient || await Patient.create({ name: `P${seq}`, contact: { email: `p${seq}@t.com` } });
  const assignment = await PatientDoctorAssignment.findOneAndUpdate(
    { patient_id: patient._id, doctor_id: doctor._id },
    { $setOnInsert: { status: "active" } },
    { upsert: true, new: true }
  );
  return Appointment.create({
    patient_id: patient._id, doctor_id: doctor._id, assignment_id: assignment._id,
    requested_slot: { date: slotDate, start_time: "10:00", end_time: "10:30" },
    status, completed_at: completedAt ? new Date(completedAt) : null,
    queries: doctorReplied ? [{ sender: "doctor", message: "How are you feeling?" }] : [],
  });
}

describe("bucket math", () => {
  const { bucketStarts, bucketStart } = _internal;

  test("weeks start on Monday", () => {
    expect(bucketStart("2026-11-21", "week")).toBe("2026-11-16"); // Sat → Mon
    expect(bucketStart("2026-11-16", "week")).toBe("2026-11-16"); // Mon → itself
    expect(bucketStart("2026-11-22", "week")).toBe("2026-11-16"); // Sun → previous Mon
  });

  test("daily = last 7 days ending today", () => {
    expect(bucketStarts("day", 7, "2026-03-02")).toEqual([
      "2026-02-24", "2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02",
    ]);
  });

  test("monthly = last 12 months across a year boundary", () => {
    const m = bucketStarts("month", 12, "2026-03-15");
    expect(m[0]).toBe("2025-04-01");
    expect(m[11]).toBe("2026-03-01");
    expect(m).toHaveLength(12);
  });
});

describe("patientsTreated", () => {
  const TODAY = "2026-11-21"; // Saturday

  test("daily counts only completed cases, in Karachi time, last 7 days", async () => {
    const { profile } = await makeDoctor();
    await makeCase(profile._id, { completedAt: "2026-11-21T05:00:00Z" });            // today
    await makeCase(profile._id, { completedAt: "2026-11-21T06:00:00Z" });            // today
    await makeCase(profile._id, { completedAt: "2026-11-19T20:30:00Z" });            // 01:30 on 20th in Karachi
    await makeCase(profile._id, { completedAt: "2026-11-14T10:00:00Z" });            // 8 days ago → outside
    await makeCase(profile._id, { status: "confirmed", completedAt: null });          // not treated
    await makeCase(profile._id, { status: "cancelled", completedAt: null });          // not treated

    const res = await patientsTreated({ doctorId: profile._id, period: "daily", today: TODAY });
    expect(res.buckets.map((b) => b.start)).toEqual([
      "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21",
    ]);
    expect(res.buckets.map((b) => b.count)).toEqual([0, 0, 0, 0, 0, 1, 2]);
    expect(res.total).toBe(3);
  });

  test("legacy completed cases without completed_at use the slot date", async () => {
    const { profile } = await makeDoctor();
    await makeCase(profile._id, { completedAt: null, slotDate: "2026-11-18" });
    const res = await patientsTreated({ doctorId: profile._id, period: "daily", today: TODAY });
    expect(res.buckets.find((b) => b.start === "2026-11-18").count).toBe(1);
  });

  test("weekly = 8 Monday-start weeks", async () => {
    const { profile } = await makeDoctor();
    await makeCase(profile._id, { completedAt: "2026-11-17T08:00:00Z" }); // this week
    await makeCase(profile._id, { completedAt: "2026-11-09T08:00:00Z" }); // last week (Mon 9th)
    await makeCase(profile._id, { completedAt: "2026-09-28T08:00:00Z" }); // week of Sep 28 = first bucket

    const res = await patientsTreated({ doctorId: profile._id, period: "weekly", today: TODAY });
    expect(res.buckets).toHaveLength(8);
    expect(res.buckets[0].start).toBe("2026-09-28");
    expect(res.buckets[7].start).toBe("2026-11-16");
    expect(res.buckets.map((b) => b.count)).toEqual([1, 0, 0, 0, 0, 0, 1, 1]);
  });

  test("monthly = 12 months", async () => {
    const { profile } = await makeDoctor();
    await makeCase(profile._id, { completedAt: "2026-11-01T08:00:00Z" });
    await makeCase(profile._id, { completedAt: "2025-12-31T21:00:00Z" }); // Jan 1st 02:00 in Karachi
    await makeCase(profile._id, { completedAt: "2025-11-30T08:00:00Z" }); // 12 months back → outside

    const res = await patientsTreated({ doctorId: profile._id, period: "monthly", today: TODAY });
    expect(res.buckets[0].start).toBe("2025-12-01");
    expect(res.buckets.find((b) => b.start === "2026-01-01").count).toBe(1);
    expect(res.buckets.find((b) => b.start === "2026-11-01").count).toBe(1);
    expect(res.total).toBe(2);
  });

  test("each doctor sees only their own cases; null doctorId = all doctors", async () => {
    const a = await makeDoctor();
    const b = await makeDoctor();
    await makeCase(a.profile._id, { completedAt: "2026-11-21T05:00:00Z" });
    await makeCase(b.profile._id, { completedAt: "2026-11-21T05:00:00Z" });
    await makeCase(b.profile._id, { completedAt: "2026-11-21T06:00:00Z" });

    expect((await patientsTreated({ doctorId: a.profile._id, today: TODAY })).total).toBe(1);
    expect((await patientsTreated({ doctorId: b.profile._id, today: TODAY })).total).toBe(2);
    expect((await patientsTreated({ doctorId: null, today: TODAY })).total).toBe(3);
  });

  test("invalid period → 400", async () => {
    await expect(patientsTreated({ period: "yearly" })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("GET /api/doctors/:id/stats/treated", () => {
  test("doctor gets their own stats", async () => {
    const { user, profile } = await makeDoctor();
    await makeCase(profile._id, { completedAt: new Date().toISOString() });
    const res = await request(app).get(`/api/doctors/${profile._id}/stats/treated?period=daily`).set("Authorization", auth(user._id));
    expect(res.status).toBe(200);
    expect(res.body.buckets).toHaveLength(7);
    expect(res.body.total).toBe(1);
  });

  test("doctor cannot read another doctor's stats → 403", async () => {
    const me = await makeDoctor();
    const other = await makeDoctor();
    const res = await request(app).get(`/api/doctors/${other.profile._id}/stats/treated`).set("Authorization", auth(me.user._id));
    expect(res.status).toBe(403);
  });

  test("admin can read any doctor's stats", async () => {
    const { profile } = await makeDoctor();
    const uid = new mongoose.Types.ObjectId();
    await User.create({ _id: uid, name: "A", email: "admin@t.com", role: "admin", provider_uid: uid.toString() });
    const res = await request(app).get(`/api/doctors/${profile._id}/stats/treated?period=monthly`).set("Authorization", auth(uid));
    expect(res.status).toBe(200);
    expect(res.body.buckets).toHaveLength(12);
  });

  test("patients are not allowed → 403", async () => {
    const { profile } = await makeDoctor();
    const uid = new mongoose.Types.ObjectId();
    await User.create({ _id: uid, name: "P", email: "pt@t.com", role: "patient", provider_uid: uid.toString() });
    const res = await request(app).get(`/api/doctors/${profile._id}/stats/treated`).set("Authorization", auth(uid));
    expect(res.status).toBe(403);
  });

  test("completing a case stamps completed_at", async () => {
    const { user, profile } = await makeDoctor();
    const appt = await makeCase(profile._id, { status: "confirmed" });
    const res = await request(app).post(`/api/appointments/${appt._id}/complete`).set("Authorization", auth(user._id));
    expect(res.status).toBe(200);
    const saved = await Appointment.findById(appt._id);
    expect(saved.completed_at).toBeInstanceOf(Date);
  });
});

describe("caseOverview (status donut + monthly comparison)", () => {
  const TODAY = "2026-11-21";

  async function seed(doctorId) {
    // Current states
    await makeCase(doctorId, { status: "confirmed", slotDate: "2026-11-10" });                        // pending (Nov)
    await makeCase(doctorId, { status: "confirmed", slotDate: "2026-11-12", doctorReplied: true });   // ongoing (Nov)
    await makeCase(doctorId, { status: "confirmed", slotDate: "2026-10-20", doctorReplied: true });   // ongoing (Oct)
    await makeCase(doctorId, { status: "pending_admin_review", slotDate: "2026-11-15" });              // not the doctor's yet
    await makeCase(doctorId, { status: "cancelled", slotDate: "2026-11-15" });                         // ignored
    // Completed: 3 in Nov (2 patients), 1 in Oct
    const repeat = await Patient.create({ name: "Repeat", contact: { email: "rep@t.com" } });
    await makeCase(doctorId, { completedAt: "2026-11-02T08:00:00Z", patient: repeat });
    await makeCase(doctorId, { completedAt: "2026-11-15T08:00:00Z", patient: repeat });
    await makeCase(doctorId, { completedAt: "2026-11-20T08:00:00Z" });
    await makeCase(doctorId, { completedAt: "2026-10-31T20:00:00Z" });  // 1 Nov 01:00 in Karachi → November!
    await makeCase(doctorId, { completedAt: "2026-10-05T08:00:00Z" });  // October
  }

  test("status counts and percentages", async () => {
    const { profile } = await makeDoctor();
    await seed(profile._id);
    const res = await caseOverview({ doctorId: profile._id, today: TODAY });
    expect(res.status.total).toBe(8);
    expect(res.status.completed).toEqual({ count: 5, percent: 62.5 });
    expect(res.status.ongoing).toEqual({ count: 2, percent: 25 });
    expect(res.status.pending).toEqual({ count: 1, percent: 12.5 });
  });

  test("this month vs last month, in Karachi time", async () => {
    const { profile } = await makeDoctor();
    await seed(profile._id);
    const { monthly } = await caseOverview({ doctorId: profile._id, today: TODAY });

    expect(monthly.this_month).toMatchObject({ month: "2026-11", label: "November 2026", completed: 4, patients_treated: 3, pending: 1, ongoing: 1 });
    expect(monthly.last_month).toMatchObject({ month: "2026-10", label: "October 2026", completed: 1, patients_treated: 1, pending: 0, ongoing: 1 });
    expect(monthly.change).toEqual({ patients_treated: 200, completed: 300, pending: null, ongoing: 0 });
  });

  test("January compares against December of the previous year", async () => {
    const { profile } = await makeDoctor();
    await makeCase(profile._id, { completedAt: "2025-12-10T08:00:00Z" });
    const { monthly } = await caseOverview({ doctorId: profile._id, today: "2026-01-05" });
    expect(monthly.last_month.month).toBe("2025-12");
    expect(monthly.last_month.completed).toBe(1);
    expect(monthly.change.completed).toBe(-100);
  });

  test("empty doctor → zeros, no division by zero", async () => {
    const { profile } = await makeDoctor();
    const res = await caseOverview({ doctorId: profile._id, today: TODAY });
    expect(res.status).toEqual({ total: 0, completed: { count: 0, percent: 0 }, ongoing: { count: 0, percent: 0 }, pending: { count: 0, percent: 0 } });
    expect(res.monthly.change).toEqual({ patients_treated: 0, completed: 0, pending: 0, ongoing: 0 });
  });

  test("only this doctor's cases; null = all doctors", async () => {
    const a = await makeDoctor();
    const b = await makeDoctor();
    await makeCase(a.profile._id, { status: "confirmed", slotDate: "2026-11-10" });
    await makeCase(b.profile._id, { status: "confirmed", slotDate: "2026-11-10" });
    await makeCase(b.profile._id, { completedAt: "2026-11-10T08:00:00Z" });
    expect((await caseOverview({ doctorId: a.profile._id, today: TODAY })).status.total).toBe(1);
    expect((await caseOverview({ doctorId: null, today: TODAY })).status.total).toBe(3);
  });

  test("API: own data only; other doctor → 403; admin allowed", async () => {
    const me = await makeDoctor();
    const other = await makeDoctor();
    const ok = await request(app).get(`/api/doctors/${me.profile._id}/stats/overview`).set("Authorization", auth(me.user._id));
    expect(ok.status).toBe(200);
    expect(ok.body.monthly.this_month).toBeDefined();

    const denied = await request(app).get(`/api/doctors/${other.profile._id}/stats/overview`).set("Authorization", auth(me.user._id));
    expect(denied.status).toBe(403);

    const uid = new mongoose.Types.ObjectId();
    await User.create({ _id: uid, name: "A", email: "adm-ov@t.com", role: "admin", provider_uid: uid.toString() });
    const admin = await request(app).get(`/api/doctors/${other.profile._id}/stats/overview`).set("Authorization", auth(uid));
    expect(admin.status).toBe(200);
  });
});
