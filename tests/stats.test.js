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
const { patientsTreated, _internal } = require("../services/statsService");

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
async function makeCase(doctor, { status = "completed", completedAt = null, slotDate = "2026-01-01" } = {}) {
  seq += 1;
  const patient = await Patient.create({ name: `P${seq}`, contact: { email: `p${seq}@t.com` } });
  const assignment = await PatientDoctorAssignment.create({ patient_id: patient._id, doctor_id: doctor._id, status: "active" });
  return Appointment.create({
    patient_id: patient._id, doctor_id: doctor._id, assignment_id: assignment._id,
    requested_slot: { date: slotDate, start_time: "10:00", end_time: "10:30" },
    status, completed_at: completedAt ? new Date(completedAt) : null,
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
