// =============================================================================
// Backend/tests/adminStats.test.js — admin dashboard analytics (/api/stats/*)
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
const Review                  = require("../models/Review");
const adminStats              = require("../services/adminStatsService");

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
afterEach(async () => await clearDatabase());

const auth = (id) => `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" })}`;

let seq = 0;
async function makeUser(role) {
  seq += 1;
  const _id = new mongoose.Types.ObjectId();
  return User.create({ _id, name: `${role} ${seq}`, email: `${role}${seq}@t.com`, role, provider_uid: _id.toString() });
}

async function makeDoctor(name, { status = "verified", fee = 1000 } = {}) {
  const user = await makeUser("doctor");
  await User.updateOne({ _id: user._id }, { name });
  return DoctorProfile.create({
    user_id: user._id, pmdc_number: `AS-${seq}`, name_as_per_cnic: name, father_name_as_per_cnic: "F",
    specialty: "Cardiology", gender: "male", location: { city: "Lahore" },
    contact: { phone: "0", email: `${seq}@doc.t` }, status, consultation_fee: fee,
  });
}

async function makePatient() {
  seq += 1;
  return Patient.create({ name: `Patient ${seq}`, contact: { email: `pp${seq}@t.com` } });
}

async function appt(doctor, patient, { status = "completed", payment = { required: false, status: "not_required" }, completedAt = new Date() } = {}) {
  const a = await PatientDoctorAssignment.findOneAndUpdate(
    { patient_id: patient._id, doctor_id: doctor._id }, { $setOnInsert: { status: "active" } }, { upsert: true, new: true });
  return Appointment.create({
    patient_id: patient._id, doctor_id: doctor._id, assignment_id: a._id,
    requested_slot: { date: "2026-11-10", start_time: "10:00", end_time: "10:30" },
    status, payment, completed_at: status === "completed" ? completedAt : null,
  });
}

async function review(doctor, patient, appointment, rating) {
  return Review.create({
    appointment_id: appointment._id, doctor_id: doctor._id, patient_id: patient._id,
    reviewer_role: "patient", reviewer_user_id: new mongoose.Types.ObjectId(), rating,
  });
}

const paid = (amount, status = "verified", extra = {}) => ({ required: true, amount, status, method: "card", paid_at: new Date(), ...extra });

async function seed() {
  const heart = await makeDoctor("Dr Heart");
  const brain = await makeDoctor("Dr Brain");
  await makeDoctor("Dr Waiting", { status: "pending" });
  const [p1, p2, p3] = [await makePatient(), await makePatient(), await makePatient()];

  const a1 = await appt(heart, p1, { payment: paid(1500) });
  const a2 = await appt(heart, p2, { payment: paid(1500) });
  const a3 = await appt(brain, p3, { payment: paid(2000) });
  await appt(brain, p1, { status: "pending_admin_review", payment: { required: true, amount: 2000, status: "submitted", method: "easypaisa" } });
  await appt(heart, p3, { status: "pending_admin_review", payment: paid(1500, "paid") });
  await appt(heart, p3, { status: "pending_admin_review", payment: { required: true, amount: 1500, status: "unpaid" } });
  await appt(brain, p2, { status: "rejected", payment: paid(2000, "refund_due") });
  await appt(brain, p2, { status: "confirmed" });

  await review(heart, p1, a1, 5);
  await review(heart, p2, a2, 4);
  await review(brain, p3, a3, 2);
  await DoctorProfile.updateOne({ _id: heart._id }, { rating: { average: 4.5, count: 2 } });
  await DoctorProfile.updateOne({ _id: brain._id }, { rating: { average: 2, count: 1 } });
  return { heart, brain };
}

describe("summary", () => {
  test("platform-wide KPIs", async () => {
    await seed();
    const s = await adminStats.summary();
    expect(s.doctors).toEqual({ total: 3, verified: 2, pending: 1 });
    expect(s.patients).toBe(3);
    expect(s.appointments).toEqual({ total: 8, pending_review: 3, confirmed: 1, completed: 3, cancelled: 1 });
    // received = verified 1500+1500+2000 + card-paid-awaiting 1500
    expect(s.revenue.received).toBe(6500);
    expect(s.revenue.received_this_month).toBe(6500);
    expect(s.revenue.refund_due).toEqual({ count: 1, amount: 2000 });
    expect(s.payments.pending_verification).toEqual({ count: 2, amount: 3500 });
    expect(s.payments.awaiting_patient).toBe(1);
    // weighted across all reviews: (5 + 4 + 2) / 3
    expect(s.rating).toEqual({ average: 3.67, count: 3 });
  });

  test("filtered to one doctor", async () => {
    const { heart } = await seed();
    const s = await adminStats.summary({ doctorId: heart._id });
    expect(s.doctors).toBeNull();
    expect(s.patients).toBe(3);
    expect(s.appointments.completed).toBe(2);
    expect(s.revenue.received).toBe(4500);
    expect(s.payments.pending_verification).toEqual({ count: 1, amount: 1500 });
    expect(s.rating).toEqual({ average: 4.5, count: 2 });
  });

  test("unknown or malformed doctor → 404 / 400", async () => {
    await expect(adminStats.summary({ doctorId: new mongoose.Types.ObjectId() })).rejects.toMatchObject({ statusCode: 404 });
    await expect(adminStats.summary({ doctorId: "nope" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("empty platform → zeros", async () => {
    const s = await adminStats.summary();
    expect(s.revenue.received).toBe(0);
    expect(s.rating).toEqual({ average: 0, count: 0 });
    expect(s.appointments.total).toBe(0);
  });
});

describe("doctor table", () => {
  test("one row per verified doctor with rating, reviews, workload and revenue; top performers", async () => {
    const { heart, brain } = await seed();
    const { results, top_performers } = await adminStats.doctorTable();
    expect(results).toHaveLength(2); // pending doctor excluded

    const h = results.find((r) => String(r._id) === String(heart._id));
    expect(h).toMatchObject({
      name: "Dr Heart", rating: { average: 4.5, count: 2 },
      completed_cases: 2, patients_treated: 2, revenue: 4500, consultation_fee: 1000,
    });
    const b = results.find((r) => String(r._id) === String(brain._id));
    expect(b).toMatchObject({ completed_cases: 1, active_cases: 1, revenue: 2000 });

    expect(top_performers).toEqual([String(heart._id), String(brain._id)]);
  });
});

describe("API /api/stats/*", () => {
  test("admin only", async () => {
    const doctor = await makeUser("doctor");
    const patient = await makeUser("patient");
    for (const u of [doctor, patient]) {
      const res = await request(app).get("/api/stats/summary").set("Authorization", auth(u._id));
      expect(res.status).toBe(403);
    }
    expect((await request(app).get("/api/stats/summary")).status).toBe(401);
  });

  test("summary, treated, overview and doctors all respond, with doctor filter", async () => {
    const { heart } = await seed();
    const admin = await makeUser("admin");
    const h = auth(admin._id);

    const sum = await request(app).get(`/api/stats/summary?doctor_id=${heart._id}`).set("Authorization", h);
    expect(sum.status).toBe(200);
    expect(sum.body.doctor_id).toBe(String(heart._id));

    const all = await request(app).get("/api/stats/treated?period=monthly").set("Authorization", h);
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);
    const one = await request(app).get(`/api/stats/treated?period=monthly&doctor_id=${heart._id}`).set("Authorization", h);
    expect(one.body.total).toBe(2);

    const ov = await request(app).get(`/api/stats/overview?doctor_id=${heart._id}`).set("Authorization", h);
    expect(ov.status).toBe(200);
    expect(ov.body.status.completed.count).toBe(2);

    const docs = await request(app).get("/api/stats/doctors").set("Authorization", h);
    expect(docs.status).toBe(200);
    expect(docs.body.results).toHaveLength(2);

    const bad = await request(app).get("/api/stats/overview?doctor_id=123").set("Authorization", h);
    expect(bad.status).toBe(400);
  });
});
