// =============================================================================
// Backend/tests/auth.test.js
//
// Coverage: authController (register, verifyEmail, createStaff, assignPatient, getMe)
//
// Firebase Admin SDK is fully mocked — no real Firebase calls happen.
// The protect middleware calls admin.auth().verifyIdToken(token); we configure
// that mock per-test via makeToken() which registers a fake decoded payload.
// =============================================================================

// ── Firebase Admin mocks — must appear before any require("../app") ──────────

jest.mock("firebase-admin/app", () => ({
  initializeApp: jest.fn(),
  getApps:       jest.fn(() => [{}]),   // pretend already initialised
  cert:          jest.fn(x => x),
}));

jest.mock("firebase-admin/auth", () => {
  const auth = {
    verifyIdToken:                   jest.fn(),
    createUser:                      jest.fn(),
    getUserByEmail:                  jest.fn(),
    getUser:                         jest.fn(),
    generateEmailVerificationLink:   jest.fn().mockResolvedValue("http://fake-verify-link"),
    generatePasswordResetLink:       jest.fn().mockResolvedValue("http://fake-reset-link"),
    updateUser:                      jest.fn().mockResolvedValue(undefined),
    deleteUser:                      jest.fn().mockResolvedValue(undefined),
  };
  return { getAuth: jest.fn(() => auth) };
});

jest.mock("../services/emailService", () => ({
  sendVerificationLinkEmail:  jest.fn().mockResolvedValue(undefined),
  sendPasswordResetLinkEmail: jest.fn().mockResolvedValue(undefined),
  sendOTPEmail:               jest.fn().mockResolvedValue(undefined),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const request  = require("supertest");
const mongoose = require("mongoose");

const app = require("../app");
const { connect, closeDatabase, clearDatabase } = require("./mongoTestHelper");

const User                    = require("../models/User");
const Patient                 = require("../models/Patient");
const DoctorProfile           = require("../models/DoctorProfile");
const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");

// Get handle to the mocked auth instance so tests can configure it
const { getAuth } = require("firebase-admin/auth");
const fbAuth = getAuth();

// ── Token registry ────────────────────────────────────────────────────────────
// makeToken registers a fake Firebase decoded payload keyed by an arbitrary
// string. verifyIdToken resolves with the payload when called with that string.

let _tokens = {};

function makeToken(user, { emailVerified = true } = {}) {
  const tok = `mock-fb-token-${user.provider_uid}`;
  _tokens[tok] = { uid: user.provider_uid, email_verified: emailVerified };
  return tok;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function createAdminUser() {
  const uid  = "uid-admin-test";
  const user = await User.create({
    name:         "Admin User",
    email:        "admin@example.com",
    role:         "admin",
    is_verified:  true,
    provider_uid: uid,
  });
  return { user, token: makeToken(user) };
}

async function createPatientUser() {
  const uid     = "uid-patient-test";
  const patient = await Patient.create({
    name: "Jane Doe", dob: "1990-05-15", gender: "female",
    contact: { email: "jane@example.com", phone: "" },
    current_medications: [], allergies: [], medical_conditions: [],
  });
  const user = await User.create({
    name:         "Jane Doe",
    email:        "jane@example.com",
    role:         "patient",
    is_verified:  true,
    patient_id:   patient._id,
    provider_uid: uid,
  });
  return { user, token: makeToken(user) };
}

async function createDoctorWithStatus(status) {
  const uid  = `uid-doctor-${status}`;
  const user = await User.create({
    name:         "Dr Smith",
    email:        `doctor-${status}@example.com`,
    role:         "doctor",
    is_verified:  status === "verified",
    provider_uid: uid,
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
  return { user, profile, token: makeToken(user) };
}

// ── Valid registration body ───────────────────────────────────────────────────

const VALID_PATIENT_BODY = {
  name:     "Jane Doe",
  email:    "jane@example.com",
  password: "password1",
  dob:      "1990-05-15",
  gender:   "female",
};

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());

beforeEach(async () => {
  await clearDatabase();
  jest.clearAllMocks();
  _tokens = {};

  // Default: createUser returns a uid derived from email
  fbAuth.createUser.mockImplementation(async ({ email }) => ({
    uid:           `uid-${email.split("@")[0].replace(/[^a-z0-9]/g, "-")}`,
    email,
    emailVerified: false,
    disabled:      false,
  }));

  // Default: verifyIdToken resolves from the token registry, rejects otherwise
  fbAuth.verifyIdToken.mockImplementation(async (token) => {
    if (_tokens[token]) return _tokens[token];
    const err = Object.assign(new Error("auth/id-token-invalid"), { code: "auth/id-token-invalid" });
    throw err;
  });

  // Default: getUser reports email as verified (used by verifyEmail endpoint)
  fbAuth.getUser.mockResolvedValue({ emailVerified: true });

  // Default: link generators
  fbAuth.generateEmailVerificationLink.mockResolvedValue("http://fake-verify-link");
  fbAuth.generatePasswordResetLink.mockResolvedValue("http://fake-reset-link");
});

// =============================================================================
// 1. Patient registration
// =============================================================================
describe("POST /api/auth/register — patient registration", () => {
  test("happy path: 201 with message + email (no token — client signs in via Firebase SDK)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(VALID_PATIENT_BODY);

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/verification link/i);
    expect(res.body.email).toBe(VALID_PATIENT_BODY.email);
    expect(res.body.token).toBeUndefined();
  });

  test("creates linked Patient profile in DB", async () => {
    await request(app).post("/api/auth/register").send(VALID_PATIENT_BODY);
    const patient = await Patient.findOne({ "contact.email": "jane@example.com" });
    expect(patient).not.toBeNull();
    expect(patient.name).toBe("Jane Doe");
  });

  test("creates User with provider_uid from Firebase", async () => {
    await request(app).post("/api/auth/register").send(VALID_PATIENT_BODY);
    const user = await User.findOne({ email: "jane@example.com" });
    expect(user).not.toBeNull();
    expect(user.provider_uid).toBeTruthy();
    expect(user.is_verified).toBe(false);
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

  test("duplicate verified email → 409", async () => {
    // First registration + mark verified
    await request(app).post("/api/auth/register").send(VALID_PATIENT_BODY);
    await User.findOneAndUpdate({ email: VALID_PATIENT_BODY.email }, { is_verified: true });

    const res = await request(app).post("/api/auth/register").send(VALID_PATIENT_BODY);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });
});

// =============================================================================
// 2. POST /api/auth/login — REMOVED
//    Login is handled entirely by Firebase Client SDK on the mobile/web.
//    Clients call signInWithEmailAndPassword, get an ID token, and send it
//    as a Bearer to all API calls. There is no /api/auth/login endpoint.
// =============================================================================

// =============================================================================
// 3. Admin staff creation
// =============================================================================
describe("POST /api/auth/staff — admin only", () => {
  test("patient role → 403", async () => {
    const { token } = await createPatientUser();
    const res = await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Admin", email: "newadmin@example.com", password: "password1", role: "admin" });
    expect(res.status).toBe(403);
  });

  test("unauthenticated → 401", async () => {
    const res = await request(app)
      .post("/api/auth/staff")
      .send({ name: "New Admin", email: "newadmin@example.com", password: "password1", role: "admin" });
    expect(res.status).toBe(401);
  });

  test("admin creates admin user → 201", async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Admin 2", email: "admin2@example.com", password: "password1", role: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("admin");
    expect(res.body.token).toBeUndefined();
  });

  test("doctor role via /staff → 400 (doctors must self-register)", async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Dr Jones", email: "drjones@example.com", password: "password1", role: "doctor" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/self-register/i);
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
    const body = { name: "Admin 2", email: "admin2@example.com", password: "password1", role: "admin" };
    await request(app).post("/api/auth/staff").set("Authorization", `Bearer ${token}`).send(body);
    const res = await request(app).post("/api/auth/staff").set("Authorization", `Bearer ${token}`).send(body);
    expect(res.status).toBe(409);
  });

  test("weak password → 400", async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Dr X", email: "drx@example.com", password: "abc", role: "admin" });
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
    const { token } = await createPatientUser();
    const res = await request(app)
      .post("/api/auth/assign")
      .set("Authorization", `Bearer ${token}`)
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
    const { token } = await createPatientUser();
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("jane@example.com");
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

  test("token with email_verified=false → 403", async () => {
    const uid  = "uid-unverified";
    const user = await User.create({
      name: "Unverified", email: "unverified@example.com",
      role: "patient", is_verified: false, provider_uid: uid,
    });
    const token = makeToken(user, { emailVerified: false });
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not verified/i);
  });
});
