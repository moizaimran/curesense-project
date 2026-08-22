// =============================================================================
// Backend/tests/doctor.test.js
//
// Coverage: doctorController (register, searchDoctors, adminVerifyDoctor,
//           getDashboardSummary) + doctor-session lifecycle
//
// Critical behaviors under test:
//  · Doctor registration creates User + DoctorProfile + DoctorAvailability atomically.
//  · status always starts as "pending" — admin must explicitly approve.
//  · searchDoctors only returns "verified" doctors to patients/public.
//  · adminVerifyDoctor: approve → verified, reject → rejected (requires reason).
//  · Idempotency: cannot approve/reject an already-decided doctor.
//  · getDashboardSummary: doctor sees own, blocked from others', admin sees any.
// =============================================================================

process.env.JWT_SECRET = "test_secret_for_jest";

const request  = require("supertest");
const jwt      = require("jsonwebtoken");
const mongoose = require("mongoose");

const app = require("../app");
const { connect, closeDatabase, clearDatabase } = require("./mongoTestHelper");

const User               = require("../models/User");
const DoctorProfile      = require("../models/DoctorProfile");
const DoctorAvailability = require("../models/DoctorAvailability");
const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");
const Appointment        = require("../models/Appointment");

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1d" });

const VALID_DOCTOR_BODY = {
  firstName:       "Amina",
  lastName:        "Khan",
  email:           "amina.khan@example.com",
  phone:           "0300-1234567",
  password:        "password1",
  confirmPassword: "password1",
  pmdc_number:     "PMDC-DOC-001",
  specialty:       "Cardiology",
  gender:          "female",
  city:            "Karachi",
};

async function createAdminUser() {
  const user = await User.create({
    name: "Admin", email: "admin@test.com", password: "admin1234", role: "admin",
  });
  return { user, token: makeToken(user._id) };
}

// Creates a doctor user + profile with the given status, bypassing the registration flow.
async function createDoctorDirect(status = "pending", suffix = "") {
  const email = `doctor${suffix}@test.com`;
  const user = await User.create({
    name: "Dr Direct", email, password: "password1", role: "doctor",
  });
  const profile = await DoctorProfile.create({
    user_id:     user._id,
    pmdc_number: `PMDC-DIRECT-${suffix || "1"}`,
    specialty:   "Orthopedics",
    gender:      "male",
    location:    { city: "Lahore" },
    contact:     { phone: "0311-1111111", email },
    status,
  });
  await DoctorAvailability.create({ doctor_id: profile._id });
  return { user, profile, token: makeToken(user._id) };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
beforeEach(async () => await clearDatabase());

// =============================================================================
// 1. Doctor registration
// =============================================================================
describe("POST /api/doctors/register", () => {
  test("happy path: 201, token, status='pending'", async () => {
    const res = await request(app)
      .post("/api/doctors/register")
      .send(VALID_DOCTOR_BODY);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe("doctor");
    expect(res.body.user.doctor_profile.status).toBe("pending");
    expect(res.body.user.doctor_profile.specialty).toBe("Cardiology");
    expect(res.body.user.patient_id).toBeNull();
  });

  test("creates DoctorProfile + DoctorAvailability in DB", async () => {
    const res = await request(app)
      .post("/api/doctors/register")
      .send(VALID_DOCTOR_BODY);

    const profile = await DoctorProfile.findById(res.body.user.doctor_profile.id);
    expect(profile).not.toBeNull();
    expect(profile.pmdc_number).toBe("PMDC-DOC-001");

    const avail = await DoctorAvailability.findOne({ doctor_id: profile._id });
    expect(avail).not.toBeNull();
  });

  test("missing required field (firstName) → 400", async () => {
    const { firstName, ...body } = VALID_DOCTOR_BODY;
    const res = await request(app).post("/api/doctors/register").send(body);
    expect(res.status).toBe(400);
  });

  test("missing city → 400", async () => {
    const { city, ...body } = VALID_DOCTOR_BODY;
    const res = await request(app).post("/api/doctors/register").send(body);
    expect(res.status).toBe(400);
  });

  test("passwords don't match → 400", async () => {
    const res = await request(app)
      .post("/api/doctors/register")
      .send({ ...VALID_DOCTOR_BODY, confirmPassword: "different1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/do not match/i);
  });

  test("weak password → 400", async () => {
    const res = await request(app)
      .post("/api/doctors/register")
      .send({ ...VALID_DOCTOR_BODY, password: "short", confirmPassword: "short" });
    expect(res.status).toBe(400);
  });

  test("invalid email → 400", async () => {
    const res = await request(app)
      .post("/api/doctors/register")
      .send({ ...VALID_DOCTOR_BODY, email: "not-valid" });
    expect(res.status).toBe(400);
  });

  test("duplicate email → 409", async () => {
    await request(app).post("/api/doctors/register").send(VALID_DOCTOR_BODY);
    const res = await request(app).post("/api/doctors/register").send({
      ...VALID_DOCTOR_BODY, pmdc_number: "PMDC-DOC-002",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  test("duplicate PMDC number → 409", async () => {
    await request(app).post("/api/doctors/register").send(VALID_DOCTOR_BODY);
    const res = await request(app).post("/api/doctors/register").send({
      ...VALID_DOCTOR_BODY, email: "other@example.com",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/PMDC/i);
  });
});

// =============================================================================
// 2. Doctor search (GET /api/doctors — public, no auth required)
// =============================================================================
describe("GET /api/doctors — public search", () => {
  beforeEach(async () => {
    await createDoctorDirect("verified",  "v1");
    await createDoctorDirect("pending",   "p1");
    await createDoctorDirect("rejected",  "r1");
  });

  test("only verified doctors are returned", async () => {
    const res = await request(app).get("/api/doctors");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].status).toBe("verified");
  });

  test("no auth required — 200 without token", async () => {
    const res = await request(app).get("/api/doctors");
    expect(res.status).toBe(200);
  });

  test("specialty filter narrows results", async () => {
    // VALID_DOCTOR_BODY specialty is Cardiology; createDoctorDirect uses Orthopedics
    await request(app).post("/api/doctors/register").send({
      ...VALID_DOCTOR_BODY,
      email: "cardiologist@test.com",
      pmdc_number: "PMDC-CARD-001",
    });
    // Mark that doctor as verified directly
    await DoctorProfile.findOneAndUpdate(
      { "contact.email": "cardiologist@test.com" },
      { $set: { status: "verified" } }
    );

    const res = await request(app).get("/api/doctors?specialty=Cardiology");
    expect(res.status).toBe(200);
    expect(res.body.results.every(d => d.specialty === "Cardiology")).toBe(true);
  });
});

// =============================================================================
// 3. Admin doctor verification lifecycle
// =============================================================================
describe("PATCH /api/doctors/admin/:id/verify", () => {
  test("admin approves pending doctor → status becomes 'verified'", async () => {
    const { token: adminToken } = await createAdminUser();
    const { profile } = await createDoctorDirect("pending", "2");

    const res = await request(app)
      .patch(`/api/doctors/admin/${profile._id}/verify`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "approve" });

    expect(res.status).toBe(200);
    expect(res.body.profile.status).toBe("verified");

    const updated = await DoctorProfile.findById(profile._id);
    expect(updated.status).toBe("verified");
    expect(updated.verified_at).not.toBeNull();
  });

  test("admin rejects pending doctor with reason → status becomes 'rejected'", async () => {
    const { token: adminToken } = await createAdminUser();
    const { profile } = await createDoctorDirect("pending", "3");

    const res = await request(app)
      .patch(`/api/doctors/admin/${profile._id}/verify`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "reject", rejection_reason: "PMDC number unverifiable" });

    expect(res.status).toBe(200);
    expect(res.body.profile.status).toBe("rejected");
    expect(res.body.profile.rejection_reason).toBe("PMDC number unverifiable");
  });

  test("reject without rejection_reason → 400", async () => {
    const { token: adminToken } = await createAdminUser();
    const { profile } = await createDoctorDirect("pending", "4");

    const res = await request(app)
      .patch(`/api/doctors/admin/${profile._id}/verify`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "reject" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rejection_reason/i);
  });

  test("approving an already-verified doctor → 409", async () => {
    const { token: adminToken } = await createAdminUser();
    const { profile } = await createDoctorDirect("verified", "5");

    const res = await request(app)
      .patch(`/api/doctors/admin/${profile._id}/verify`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "approve" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already verified/i);
  });

  test("invalid decision value → 400", async () => {
    const { token: adminToken } = await createAdminUser();
    const { profile } = await createDoctorDirect("pending", "6");

    const res = await request(app)
      .patch(`/api/doctors/admin/${profile._id}/verify`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "maybe" });

    expect(res.status).toBe(400);
  });

  test("non-admin cannot verify → 403", async () => {
    const { profile } = await createDoctorDirect("pending", "7");
    const { body } = await request(app)
      .post("/api/auth/register")
      .send({ name: "P", email: "p@p.com", password: "password1", dob: "1990-01-01", gender: "male" });

    const res = await request(app)
      .patch(`/api/doctors/admin/${profile._id}/verify`)
      .set("Authorization", `Bearer ${body.token}`)
      .send({ decision: "approve" });

    expect(res.status).toBe(403);
  });

  test("invalid ObjectId → 400", async () => {
    const { token: adminToken } = await createAdminUser();
    const res = await request(app)
      .patch("/api/doctors/admin/not-a-valid-id/verify")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "approve" });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// 4. Dashboard summary
// =============================================================================
describe("GET /api/doctors/:id/dashboard-summary", () => {
  test("doctor gets their own summary → 200 with count fields", async () => {
    const { profile, token } = await createDoctorDirect("verified", "8");

    const res = await request(app)
      .get(`/api/doctors/${profile._id}/dashboard-summary`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total_patients: expect.any(Number),
      ongoing:        expect.any(Number),
      pending_new:    expect.any(Number),
      completed:      expect.any(Number),
    });
    // pending_new now counts confirmed+unread (not pending_admin_review)
    // unread_queries field was removed from the response
    expect(res.body.unread_queries).toBeUndefined();
  });

  test("doctor cannot view another doctor's summary → 403", async () => {
    const { profile: profileA } = await createDoctorDirect("verified", "9a");
    const { token: tokenB }     = await createDoctorDirect("verified", "9b");

    const res = await request(app)
      .get(`/api/doctors/${profileA._id}/dashboard-summary`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
  });

  test("admin can view any doctor's summary → 200", async () => {
    const { token: adminToken } = await createAdminUser();
    const { profile }           = await createDoctorDirect("verified", "10");

    const res = await request(app)
      .get(`/api/doctors/${profile._id}/dashboard-summary`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  test("counts reflect actual DB state", async () => {
    const { user: adminUser, token: adminToken } = await createAdminUser();
    const { profile, token: docToken }           = await createDoctorDirect("verified", "11");

    const Patient  = require("../models/Patient");
    const patient  = await Patient.create({
      name: "Patient11", dob: new Date("1990-01-01"), gender: "male",
      contact: { email: "p11@test.com" },
    });
    const assignment = await PatientDoctorAssignment.create({
      patient_id: patient._id, doctor_id: profile._id, status: "active",
    });
    // doctor_viewed not set → defaults false → counts as pending_new
    await Appointment.create({
      patient_id: patient._id, doctor_id: profile._id, assignment_id: assignment._id,
      requested_slot: { date: new Date("2026-09-01"), start_time: "09:00", end_time: "09:30" },
      status: "confirmed",
    });

    const res = await request(app)
      .get(`/api/doctors/${profile._id}/dashboard-summary`)
      .set("Authorization", `Bearer ${docToken}`);

    expect(res.body.total_patients).toBe(1);
    expect(res.body.ongoing).toBe(1);
    // pending_new = confirmed + !doctor_viewed: new cases doctor hasn't opened yet
    expect(res.body.pending_new).toBe(1);
  });
});
