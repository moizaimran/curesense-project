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
  const email  = `patient${suffix}@test.com`;
  const uid    = new mongoose.Types.ObjectId();
  const user   = await User.create({
    _id: uid, name: `Patient ${suffix}`, email, role: "patient", provider_uid: uid.toString(),
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
  const uid   = new mongoose.Types.ObjectId();
  const user  = await User.create({
    _id: uid, name: `Dr ${suffix}`, email, role: "doctor", provider_uid: uid.toString(),
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
    const adminId = new mongoose.Types.ObjectId();
    const admin   = await User.create({
      _id: adminId, name: "Admin", email: "admin@test.com", role: "admin", provider_uid: adminId.toString(),
    });

    const res = await request(app)
      .post("/api/sessions")
      .set("Authorization", `Bearer ${makeToken(admin._id)}`);

    expect(res.status).toBe(403);
  });

  test("patient user with no patient_id → 400", async () => {
    const bareId = new mongoose.Types.ObjectId();
    const user   = await User.create({
      _id: bareId, name: "Bare Patient", email: "bare@test.com", role: "patient", provider_uid: bareId.toString(),
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

  test("no patient_text → 400", async () => {
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
        questionType:         "text",
        options:              [],
        sessionName:          "Headache Session",
      },
    });
    // Second mock: the finalize pipeline response
    axios.post.mockResolvedValueOnce({
      data: {
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
    // The finalize request carries the specialty list the AI must choose from
    expect(axios.post.mock.calls.at(-1)[1].specialties).toContain("General Physician");
    // and the patient's saved profile history
    expect(axios.post.mock.calls.at(-1)[1]).toEqual(expect.objectContaining({
      profile_medications: expect.any(Array),
      profile_allergies:   expect.any(Array),
      profile_conditions:  expect.any(Array),
    }));

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

// =============================================================================
// Session failure and automatic abandonment
// =============================================================================
describe("Session end states", () => {
  test("finalize pipeline error on the last turn → session marked failed, final turn kept, 502", async () => {
    const { patient, token } = await buildPatientUser("F");
    const session = await Session.create({ patient_id: patient._id });

    axios.post.mockResolvedValueOnce({
      data: {
        status: "complete", message: "Thank you — generating your report.",
        correctedPatientText: "No allergies",
        questionType: "text", options: [],
      },
    });
    axios.post.mockRejectedValueOnce(Object.assign(new Error("AI down"), { response: { status: 500, data: {} } }));

    const res = await request(app)
      .post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`)
      .send({ patient_text: "no allergies" });

    expect(res.status).toBe(502);
    expect(res.body.session_status).toBe("failed");
    const saved = await Session.findById(session._id);
    expect(saved.status).toBe("failed");
    expect(saved.transcript).toHaveLength(1);
    expect(saved.completed_at).toBeNull();
    expect(await Report.countDocuments({ session_id: session._id })).toBe(0);
  });

  test("abandonInactiveSessions marks only in-progress sessions idle for over 48 hours", async () => {
    const { abandonInactiveSessions } = require("../services/sessionService");
    const { patient } = await buildPatientUser("A");
    const old = new Date(Date.now() - 49 * 36e5);
    const idle      = await Session.create({ patient_id: patient._id });
    const recent    = await Session.create({ patient_id: patient._id });
    const completed = await Session.create({ patient_id: patient._id, status: "completed" });
    await setSessionLastActivity(idle._id, old);
    await setSessionLastActivity(completed._id, old);

    expect(await abandonInactiveSessions()).toBe(1);
    expect((await Session.findById(idle._id)).status).toBe("abandoned");
    expect((await Session.findById(recent._id)).status).toBe("in_progress");
    expect((await Session.findById(completed._id)).status).toBe("completed");
  });
});

describe("Session name from the first turn", () => {
  test("turn 1 requests and stores the name; later turns do not request it", async () => {
    const { patient, token } = await buildPatientUser("N");
    const session = await Session.create({ patient_id: patient._id });
    const turnReply = (sessionName) => ({
      data: {
        status: "continue", message: "Where is the pain?", correctedPatientText: "My back hurts.", questionType: "text", options: [], sessionName,
      },
    });

    axios.post.mockClear();
    axios.post.mockResolvedValueOnce(turnReply("Lower Back Pain"));
    await request(app).post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`).send({ patient_text: "my back hurts" });

    expect(axios.post.mock.calls[0][1].request_session_name).toBe(true);
    expect((await Session.findById(session._id)).session_name).toBe("Lower Back Pain");

    axios.post.mockResolvedValueOnce(turnReply(""));
    await request(app).post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`).send({ patient_text: "lower back" });

    expect(axios.post.mock.calls[1][1].request_session_name).toBe(false);
    expect((await Session.findById(session._id)).session_name).toBe("Lower Back Pain");
  });
});

describe("Voice message URL validation", () => {
  const turnReply = {
    data: { status: "continue", message: "Next?", correctedPatientText: "Back pain.", questionType: "text", options: [], sessionName: "" },
  };

  test("a link outside this project's Cloudinary account → 400, turn not forwarded", async () => {
    process.env.CLOUDINARY_CLOUD_NAME = "curesense-test";
    const { patient, token } = await buildPatientUser("V1");
    const session = await Session.create({ patient_id: patient._id });
    axios.post.mockClear();

    const res = await request(app).post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`)
      .send({ patient_text: "back pain", voice_message_url: "https://evil.example.com/track.mp3" });

    expect(res.status).toBe(400);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("own Cloudinary link is accepted and stored with the turn", async () => {
    process.env.CLOUDINARY_CLOUD_NAME = "curesense-test";
    const { patient, token } = await buildPatientUser("V2");
    const session = await Session.create({ patient_id: patient._id });
    const url = "https://res.cloudinary.com/curesense-test/video/upload/v1/abc.m4a";
    axios.post.mockResolvedValueOnce(turnReply);

    const res = await request(app).post(`/api/sessions/${session._id}/turn`)
      .set("Authorization", `Bearer ${token}`)
      .send({ patient_text: "back pain", voice_message_url: url });

    expect(res.status).toBe(200);
    expect((await Session.findById(session._id)).transcript[0].voice_message_url).toBe(url);
  });
});

test("patient_raw stores the text the patient sent, not the AI service's copy", async () => {
  const { patient, token } = await buildPatientUser("R");
  const session = await Session.create({ patient_id: patient._id });
  axios.post.mockResolvedValueOnce({
    data: { status: "continue", message: "Since when?", correctedPatientText: "My head hurts a lot.", questionType: "text", options: [], sessionName: "" },
  });

  await request(app).post(`/api/sessions/${session._id}/turn`)
    .set("Authorization", `Bearer ${token}`).send({ patient_text: "mera sar bohot dard kar raha hai" });

  const turn = (await Session.findById(session._id)).transcript[0];
  expect(turn.patient_raw).toBe("mera sar bohot dard kar raha hai");
  expect(turn.patient_corrected).toBe("My head hurts a lot.");
});
