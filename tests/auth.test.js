// =============================================================================
// Backend/tests/auth.test.js
//
// Coverage: authController (register, login, createStaff, assignPatient, getMe)
//
// Critical Phase-1 tests:
//  · Doctor pending/rejected login gate — the verification must block token issuance,
//    not just hide the dashboard.
//  · Unified signToken — only one implementation imported from utils/jwt.
//  · Input validation helpers shared across all three signup flows.
// =============================================================================

process.env.JWT_SECRET = "test_secret_for_jest";

const request  = require("supertest");
const jwt      = require("jsonwebtoken");
const mongoose = require("mongoose");

const app = require("../app");
const { connect, closeDatabase, clearDatabase } = require("./mongoTestHelper");

const User         = require("../models/User");
const Patient      = require("../models/Patient");
const DoctorProfile = require("../models/DoctorProfile");
const DoctorAvailability = require("../models/DoctorAvailability");
const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1d" });

const VALID_PATIENT_BODY = {
  name:     "Jane Doe",
  email:    "jane@example.com",
  password: "password1",
  dob:      "1990-05-15",
  gender:   "female",
};

async function createAdminUser() {
  const user = await User.create({
    name:     "Admin User",
    email:    "admin@example.com",
    password: "admin1234",
    role:     "admin",
  });
  return { user, token: makeToken(user._id) };
}

async function createDoctorWithStatus(status) {
  const user = await User.create({
    name:     "Dr Smith",
    email:    `doctor-${status}@example.com`,
    password: "password1",
    role:     "doctor",
  });
  const profile = await DoctorProfile.create({
    user_id:     user._id,
    pmdc_number: `PMDC-${status.toUpperCase()}-001`,
    specialty:   "Cardiology",
    gender:      "male",
    location:    { city: "Lahore" },
    contact:     { phone: "0300-0000001", email: user.email },
    status,
  });
  return { user, profile };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
beforeEach(async () => await clearDatabase());

// =============================================================================
// 1. Patient registration
// =============================================================================
describe("POST /api/auth/register — patient registration", () => {
  test("happy path: 201 with token and normalised user shape", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(VALID_PATIENT_BODY);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toMatchObject({
      name:           "Jane Doe",
      email:          "jane@example.com",
      role:           "patient",
      doctor_profile: null,
    });
    expect(res.body.user.patient_id).toBeTruthy();
  });

  test("creates linked Patient profile in DB", async () => {
    await request(app).post("/api/auth/register").send(VALID_PATIENT_BODY);
    const patient = await Patient.findOne({ "contact.email": "jane@example.com" });
    expect(patient).not.toBeNull();
    expect(patient.name).toBe("Jane Doe");
  });

  test("missing name → 400", async () => {
    const { name, ...body } = VALID_PATIENT_BODY;
    const res = await request(app).post("/api/auth/register").send(body);
    expect(res.status).toBe(400);
  });

  test("missing dob → 400", async () => {
    const { dob, ...body } = VALID_PATIENT_BODY;
    const res = await request(app).post("/api/auth/register").send(body);
    expect(res.status).toBe(400);
  });

  test("missing gender → 400", async () => {
    const { gender, ...body } = VALID_PATIENT_BODY;
    const res = await request(app).post("/api/auth/register").send(body);
    expect(res.status).toBe(400);
  });

  test("invalid email format → 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_PATIENT_BODY, email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test("email with no dot after @ → 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_PATIENT_BODY, email: "user@nodot" });
    expect(res.status).toBe(400);
  });

  test("weak password (< 8 chars) → 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_PATIENT_BODY, password: "abc123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  test("weak password (no digit) → 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_PATIENT_BODY, password: "onlyletters" });
    expect(res.status).toBe(400);
  });

  test("weak password (no letter) → 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_PATIENT_BODY, password: "12345678" });
    expect(res.status).toBe(400);
  });

  test("duplicate email → 409", async () => {
    await request(app).post("/api/auth/register").send(VALID_PATIENT_BODY);
    const res = await request(app).post("/api/auth/register").send(VALID_PATIENT_BODY);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });
});

// =============================================================================
// 2. Login — including doctor verification gate (Phase 1)
// =============================================================================
describe("POST /api/auth/login", () => {
  test("patient happy path → 200 with token", async () => {
    await request(app).post("/api/auth/register").send(VALID_PATIENT_BODY);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: VALID_PATIENT_BODY.email, password: VALID_PATIENT_BODY.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe("patient");
  });

  test("missing email → 400", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ password: "password1" });
    expect(res.status).toBe(400);
  });

  test("missing password → 400", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@test.com" });
    expect(res.status).toBe(400);
  });

  test("wrong password → 401 (not 404)", async () => {
    await request(app).post("/api/auth/register").send(VALID_PATIENT_BODY);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: VALID_PATIENT_BODY.email, password: "wrongpassword1" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid credentials/);
  });

  test("nonexistent email → 401 (same message as wrong password)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "password1" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid credentials/);
  });

  test("verified doctor → 200 with doctor_profile in response", async () => {
    const { user, profile } = await createDoctorWithStatus("verified");

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "password1" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.doctor_profile).toMatchObject({
      status:    "verified",
      specialty: "Cardiology",
    });
  });

  // ── PHASE 1: Doctor verification gate ──────────────────────────────────────
  // Previously, pending/rejected doctors could obtain a valid JWT. This gate
  // must block token issuance entirely — not just hide UI features.

  test("GATE: pending doctor login → 403, no token issued", async () => {
    const { user } = await createDoctorWithStatus("pending");

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "password1" });

    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
    expect(res.body.error).toMatch(/pending verification/i);
  });

  test("GATE: rejected doctor login → 403, no token issued", async () => {
    const { user } = await createDoctorWithStatus("rejected");

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "password1" });

    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
    expect(res.body.error).toMatch(/not approved/i);
  });

  test("admin login → 200, doctor_profile null", async () => {
    const { user } = await createAdminUser();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "admin1234" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("admin");
    expect(res.body.user.doctor_profile).toBeNull();
  });
});

// =============================================================================
// 3. Admin staff creation
// =============================================================================
describe("POST /api/auth/staff — admin only", () => {
  test("patient role → 403", async () => {
    const { body } = await request(app).post("/api/auth/register").send(VALID_PATIENT_BODY);
    const res = await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${body.token}`)
      .send({ name: "New Admin", email: "newadmin@example.com", password: "password1", role: "admin" });
    expect(res.status).toBe(403);
  });

  test("unauthenticated → 401", async () => {
    const res = await request(app)
      .post("/api/auth/staff")
      .send({ name: "New Admin", email: "newadmin@example.com", password: "password1", role: "admin" });
    expect(res.status).toBe(401);
  });

  test("admin creates doctor user → 201, no token in response", async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Dr Jones", email: "drjones@example.com", password: "password1", role: "doctor" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("doctor");
    expect(res.body.token).toBeUndefined();
  });

  test("admin creates admin user → 201", async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Admin 2", email: "admin2@example.com", password: "password1", role: "admin" });
    expect(res.status).toBe(201);
  });

  test("role 'patient' not allowed via createStaff → 400", async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test", email: "test2@example.com", password: "password1", role: "patient" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
  });

  test("duplicate email → 409", async () => {
    const { token } = await createAdminUser();
    const body = { name: "Dr Jones", email: "drjones2@example.com", password: "password1", role: "doctor" };
    await request(app).post("/api/auth/staff").set("Authorization", `Bearer ${token}`).send(body);
    const res = await request(app).post("/api/auth/staff").set("Authorization", `Bearer ${token}`).send(body);
    expect(res.status).toBe(409);
  });

  test("weak password → 400", async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Dr X", email: "drx@example.com", password: "abc", role: "doctor" });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// 4. Patient-doctor assignment
// =============================================================================
describe("POST /api/auth/assign — admin only", () => {
  async function buildAssignScenario() {
    const { token } = await createAdminUser();
    const { user: doctorUser, profile } = await createDoctorWithStatus("verified");
    const patient = await Patient.create({
      name: "Test Patient", dob: new Date("1990-01-01"), gender: "male",
      contact: { email: "p@test.com" },
    });
    return { token, doctorUser, profile, patient };
  }

  test("admin assigns patient to doctor → 200", async () => {
    const { token, doctorUser, patient } = await buildAssignScenario();

    const res = await request(app)
      .post("/api/auth/assign")
      .set("Authorization", `Bearer ${token}`)
      .send({ doctor_user_id: doctorUser._id, patient_id: patient._id });

    expect(res.status).toBe(200);
    expect(res.body.assignment.status).toBe("active");
  });

  test("duplicate active assignment → 409", async () => {
    const { token, doctorUser, patient } = await buildAssignScenario();
    const body = { doctor_user_id: doctorUser._id, patient_id: patient._id };
    await request(app).post("/api/auth/assign").set("Authorization", `Bearer ${token}`).send(body);
    const res = await request(app).post("/api/auth/assign").set("Authorization", `Bearer ${token}`).send(body);
    expect(res.status).toBe(409);
  });

  test("patient role cannot assign → 403", async () => {
    const { body } = await request(app).post("/api/auth/register").send(VALID_PATIENT_BODY);
    const res = await request(app)
      .post("/api/auth/assign")
      .set("Authorization", `Bearer ${body.token}`)
      .send({ doctor_user_id: new mongoose.Types.ObjectId(), patient_id: new mongoose.Types.ObjectId() });
    expect(res.status).toBe(403);
  });

  test("missing fields → 400", async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .post("/api/auth/assign")
      .set("Authorization", `Bearer ${token}`)
      .send({ doctor_user_id: new mongoose.Types.ObjectId() });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// 5. GET /api/auth/me
// =============================================================================
describe("GET /api/auth/me", () => {
  test("returns own user when authenticated", async () => {
    const { body } = await request(app).post("/api/auth/register").send(VALID_PATIENT_BODY);
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(VALID_PATIENT_BODY.email);
  });

  test("no token → 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  test("invalid token → 401", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not.a.real.token");
    expect(res.status).toBe(401);
  });
});
