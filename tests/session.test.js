// =============================================================================
// Backend/tests/session.test.js
//
// Coverage: sessionController (createSession, getSession, getSessionsForPatient,
//           softDeleteSession, processTurn)
//
// Critical behaviors under test:
//  · Only patients can create sessions / process turns (authorize("patient")).
//  · Session access follows canAccessPatient — doctor needs active assignment.
//  · Soft delete is patient-only at route level (Phase-1 fix); cascades to Report.
//  · processTurn guards: wrong patient, ended session, 48h abandonment, text length.
//  · processTurn happy path and completion path (Flask calls mocked via axios).
// =============================================================================

process.env.JWT_SECRET = "test_secret_for_jest";
process.env.AI_SERVICE_URL = "http://mock-ai-service";

// Mock axios before any modules that use it are loaded
jest.mock("axios", () => ({
  post: jest.fn(),
}));

const request  = require("supertest");
const jwt      = require("jsonwebtoken");
const mongoose = require("mongoose");
const axios    = require("axios");

const app = require("../app");
const { connect, closeDatabase, clearDatabase } = require("./mongoTestHelper");

const User                    = require("../models/User");
const Patient                 = require("../models/Patient");
const DoctorProfile           = require("../models/DoctorProfile");
const DoctorAvailability      = require("../models/DoctorAvailability");
const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");
const Session                 = require("../models/Session");
const Report                  = require("../models/Report");

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1d" });

async function buildPatientUser(suffix = "") {
  const email = `patient${suffix}@test.com`;
  const user = await User.create({
    name: `Patient ${suffix}`, email, password: "password1", role: "patient",
  });
  const patient = await Patient.create({
    name: `Patient ${suffix}`, dob: new Date("1990-01-01"), gender: "male",
    contact: { email },
  });
  await User.updateOne({ _id: user._id }, { $set: { patient_id: patient._id } });
  const userFull = await User.findById(user._id);
  return { user: userFull, patient, token: makeToken(user._id) };
}

async function buildDoctorUser(status = "verified", suffix = "") {
  const email = `doctor${suffix}@test.com`;
  const user = await User.create({
    name: `Dr ${suffix}`, email, password: "password1", role: "doctor",
  });
  const profile = await DoctorProfile.create({
    user_id: user._id, pmdc_number: `PMDC-${suffix}`, specialty: "General",
    gender: "male", location: { city: "Lahore" }, contact: { phone: "0300-111", email },
    status,
  });
  await DoctorAvailability.create({ doctor_id: profile._id });
  return { user, profile, token: makeToken(user._id) };
}

// Bypasses Mongoose pre-save hook to set last_activity_at to an arbitrary time.
async function setSessionLastActivity(sessionId, date) {
  await Session.collection.updateOne(
    { _id: sessionId },
    { $set: { last_activity_at: date } }
  );
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
beforeEach(async () => {
  await clearDatabase();
  axios.post.mockReset();
});

// =============================================================================
// 1. Session creation (POST /api/sessions)
// =============================================================================
describe("POST /api/sessions — create session", () => {
  test("patient creates session → 201, in_progress", async () => {
    const { patient, token } = await buildPatientUser("A");

    const res = await request(app)
      .post("/api/sessions")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("in_progress");
    expect(res.body.patient_id).toBe(patient._id.toString());
  });

  test("doctor cannot create session → 403 (role guard)", async () => {
    const { token } = await buildDoctorUser("verified", "D1");

    const res = await request(app)
      .post("/api/sessions")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test("admin cannot create session → 403 (role guard)", async () => {
    const admin = await User.create({
      name: "Admin", email: "admin@test.com", password: "admin1234", role: "admin",
    });

    const res = await request(app)
      .post("/api/sessions")
      .set("Authorization", `Bearer ${makeToken(admin._id)}`);

    expect(res.status).toBe(403);
  });

  test("patient user with no patient_id → 400", async () => {
    const user = await User.create({
      name: "Bare Patient", email: "bare@test.com", password: "password1", role: "patient",
    });

    const res = await request(app)
      .post("/api/sessions")
      .set("Authorization", `Bearer ${makeToken(user._id)}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No patient profile/);
  });
});

// =============================================================================
// 2. Session reads
// =============================================================================
describe("Session read endpoints", () => {
  test("patient reads own session → 200", async () => {
    const { patient, token } = await buildPatientUser("B");
    const session = await Session.create({ patient_id: patient._id });

    const res = await request(app)
      .get(`/api/sessions/${session._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(session._id.toString());
  });

  test("patient reads another patient's session → 403", async () => {
    const { patient: p1 } = await buildPatientUser("C1");
    const { token: t2 }   = await buildPatientUser("C2");
    const session = await Session.create({ patient_id: p1._id });

    const res = await request(app)
      .get(`/api/sessions/${session._id}`)
      .set("Authorization", `Bearer ${t2}`);

    expect(res.status).toBe(403);
  });

  test("doctor without active assignment reads session → 403", async () => {
    const { patient } = await buildPatientUser("D");
    const { token: docToken } = await buildDoctorUser("verified", "D2");
    const session = await Session.create({ patient_id: patient._id });

    const res = await request(app)
      .get(`/api/sessions/${session._id}`)
      .set("Authorization", `Bearer ${docToken}`);

    expect(res.status).toBe(403);
  });

  test("soft-deleted session returns 404", async () => {
    const { patient, token } = await buildPatientUser("E");
    const session = await Session.create({ patient_id: patient._id, is_deleted: true });

    const res = await request(app)
      .get(`/api/sessions/${session._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test("nonexistent session → 404", async () => {
    const { token } = await buildPatientUser("F");
    const res = await request(app)
      .get(`/api/sessions/${new mongoose.Types.ObjectId()}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("invalid ObjectId format → 400", async () => {
    const { token } = await buildPatientUser("G");
    const res = await request(app)
      .get("/api/sessions/not-an-id")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// 3. Soft delete (PATCH /api/sessions/:id/delete)
// =============================================================================
describe("PATCH /api/sessions/:id/delete — soft delete", () => {
  test("patient soft-deletes own session → 200, is_deleted=true in DB", async () => {
    const { patient, token } = await buildPatientUser("H");
    const session = await Session.create({ patient_id: patient._id });

    const res = await request(app)
      .patch(`/api/sessions/${session._id}/delete`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    const updated = await Session.findById(session._id);
    expect(updated.is_deleted).toBe(true);
  });

  test("soft delete cascades to linked report", async () => {
    const { patient, token } = await buildPatientUser("I");
    const session = await Session.create({ patient_id: patient._id });
    const report  = await Report.create({
      session_id:   session._id,
      patient_id:   patient._id,
      generated_at: new Date(),
    });

    await request(app)
      .patch(`/api/sessions/${session._id}/delete`)
      .set("Authorization", `Bearer ${token}`);

    const updatedReport = await Report.findById(report._id);
    expect(updatedReport.is_deleted).toBe(true);
  });

  test("doctor cannot soft-delete (route-level guard) → 403", async () => {
    const { patient } = await buildPatientUser("J");
    const { profile, token: docToken } = await buildDoctorUser("verified", "J1");
    await PatientDoctorAssignment.create({
      patient_id: patient._id, doctor_id: profile._id, status: "active",
    });
    const session = await Session.create({ patient_id: patient._id });

    const res = await request(app)
      .patch(`/api/sessions/${session._id}/delete`)
      .set("Authorization", `Bearer ${docToken}`);

    // authorize("patient") at route level — doctor gets 403 regardless of canAccessPatient
    expect(res.status).toBe(403);
  });

  test("already-deleted session → 404", async () => {
    const { patient, token } = await buildPatientUser("K");
    const session = await Session.create({ patient_id: patient._id, is_deleted: true });

    const res = await request(app)
      .patch(`/api/sessions/${session._id}/delete`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// 4. processTurn guards and happy path
// =============================================================================
describe("POST /api/sessions/:id/turn — processTurn", () => {
  test("wrong patient accessing another patient's session → 403", async () => {
    const { patient: p1 }   = await buildPatientUser("L1");
    const { token: token2 } = await buildPatientUser("L2");
    const session = await Session.create({ patient_id: p1._id });

    const res = await request(app)
      .post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ patient_text: "Hello" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/);
  });

  test("patient_text too long (>2000 chars) → 400", async () => {
    const { patient, token } = await buildPatientUser("M");
    const session = await Session.create({ patient_id: patient._id });

    const res = await request(app)
      .post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`)
      .send({ patient_text: "a".repeat(2001) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2000/);
  });

  test("no patient_text and no audio → 400", async () => {
    const { patient, token } = await buildPatientUser("N");
    const session = await Session.create({ patient_id: patient._id });

    const res = await request(app)
      .post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/patient_text/);
  });

  test("completed session → 409", async () => {
    const { patient, token } = await buildPatientUser("O");
    const session = await Session.create({ patient_id: patient._id, status: "completed" });

    const res = await request(app)
      .post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`)
      .send({ patient_text: "Hello" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already ended/);
  });

  test("failed session → 409", async () => {
    const { patient, token } = await buildPatientUser("P");
    const session = await Session.create({ patient_id: patient._id, status: "failed" });

    const res = await request(app)
      .post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`)
      .send({ patient_text: "Hello" });

    expect(res.status).toBe(409);
  });

  test("abandoned session → 409 (status check before activity check)", async () => {
    const { patient, token } = await buildPatientUser("Q");
    const session = await Session.create({ patient_id: patient._id, status: "abandoned" });

    const res = await request(app)
      .post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`)
      .send({ patient_text: "Hello" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/abandoned/);
  });

  test("48-hour inactivity → marks session abandoned, returns 410", async () => {
    const { patient, token } = await buildPatientUser("R");
    const session = await Session.create({ patient_id: patient._id });
    // Bypass pre-save hook to set an old activity time
    const oldTime = new Date(Date.now() - 49 * 60 * 60 * 1000);
    await setSessionLastActivity(session._id, oldTime);

    const res = await request(app)
      .post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`)
      .send({ patient_text: "Hello" });

    expect(res.status).toBe(410);

    const updated = await Session.findById(session._id);
    expect(updated.status).toBe("abandoned");
  });

  test("happy path in_progress turn — Flask returns in_progress", async () => {
    const { patient, token } = await buildPatientUser("S");
    const session = await Session.create({ patient_id: patient._id });

    axios.post.mockResolvedValueOnce({
      data: {
        status:               "in_progress",
        message:              "What other symptoms do you have?",
        correctedPatientText: "I have a headache",
        rawPatientText:       "i have a headache",
        questionType:         "text",
        options:              [],
      },
    });

    const res = await request(app)
      .post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`)
      .send({ patient_text: "I have a headache" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("in_progress");
    expect(res.body.message).toBe("What other symptoms do you have?");

    // Turn saved to session
    const updated = await Session.findById(session._id);
    expect(updated.turn_count).toBe(1);
    expect(updated.transcript).toHaveLength(1);
    expect(updated.transcript[0].patient_corrected).toBe("I have a headache");
  });

  test("completion turn — Flask returns complete, report is created", async () => {
    const { patient, token } = await buildPatientUser("T");
    const session = await Session.create({ patient_id: patient._id });

    // First mock: the turn response (status=complete)
    axios.post.mockResolvedValueOnce({
      data: {
        status:               "complete",
        message:              "Thank you — generating your report.",
        correctedPatientText: "I feel better now",
        rawPatientText:       "i feel better now",
        questionType:         "text",
        options:              [],
        sessionName:          "Headache Session",
      },
    });
    // Second mock: the finalize pipeline response
    axios.post.mockResolvedValueOnce({
      data: {
        sessionName:          "Headache Session",
        ragQuery:             "headache symptoms",
        diagnosticQuery:      "headache",
        verifiedEntities:     [],
        rankedDiseases:       [],
        retrievedSources:     [],
        medicationInfo:       {},
        doctorReport:         {},
        patientSummary:       {},
        interpretedDiagnoses: [],
      },
    });

    const res = await request(app)
      .post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`)
      .send({ patient_text: "I feel better now" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("complete");
    expect(res.body.report_id).toBeDefined();

    // Session marked completed
    const updatedSession = await Session.findById(session._id);
    expect(updatedSession.status).toBe("completed");
    expect(updatedSession.session_name).toBe("Headache Session");

    // Report created
    const report = await Report.findById(res.body.report_id);
    expect(report).not.toBeNull();
    expect(report.patient_id.toString()).toBe(patient._id.toString());
  });

  test("AI service HTTP error → 502", async () => {
    const { patient, token } = await buildPatientUser("U");
    const session = await Session.create({ patient_id: patient._id });

    const aiError = new Error("Flask returned 500");
    aiError.response = { status: 500, data: { error: "Internal server error" } };
    axios.post.mockRejectedValueOnce(aiError);
    // callAI retries once on network errors but not HTTP errors — this is an HTTP error
    // so it should propagate immediately. The retry in callAI only fires when err.response is absent.
    // Here err.response IS set, so no retry — but we still need a second mockRejectedValue
    // if callAI tries again. Let's check: callAI does:
    //   catch (err) { if (err.response) throw err; ... retry ... }
    // So it throws immediately. processTurn catches it and returns 502.

    const res = await request(app)
      .post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`)
      .send({ patient_text: "Hello" });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("AI service error");
  });
});
