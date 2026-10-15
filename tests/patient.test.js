// =============================================================================
// Backend/tests/patient.test.js
//
// Coverage: PATCH /api/patients/:id — profile completion fields sent by the
// mobile Complete Profile screen (Google sign-ups start without dob/gender).
// =============================================================================

process.env.JWT_SECRET = "test_secret_for_jest";

const request  = require("supertest");
const jwt      = require("jsonwebtoken");
const mongoose = require("mongoose");

const app = require("../app");
const { connect, closeDatabase, clearDatabase } = require("./mongoTestHelper");
const User    = require("../models/User");
const Patient = require("../models/Patient");

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
afterEach(async () => await clearDatabase());

async function googlePatient() {
  const uid = new mongoose.Types.ObjectId();
  const patient = await Patient.create({ name: "Google User", contact: { email: "g@test.com" } });
  await User.create({
    _id: uid, name: "Google User", email: "g@test.com", role: "patient",
    patient_id: patient._id, is_verified: true, provider_uid: uid.toString(),
  });
  return { patient, token: jwt.sign({ id: uid }, process.env.JWT_SECRET) };
}

describe("PATCH /api/patients/:id — complete profile", () => {
  test("saves dob, gender and profile_complete", async () => {
    const { patient, token } = await googlePatient();

    const res = await request(app)
      .patch(`/api/patients/${patient._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dob: "1995-03-20", gender: "Female", profile_complete: true });

    expect(res.status).toBe(200);
    const saved = await Patient.findById(patient._id);
    expect(saved.dob.toISOString().slice(0, 10)).toBe("1995-03-20");
    expect(saved.gender).toBe("Female");
    expect(saved.profile_complete).toBe(true);
  });

  test("invalid dob → 400 and nothing saved", async () => {
    const { patient, token } = await googlePatient();

    const res = await request(app)
      .patch(`/api/patients/${patient._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dob: "not-a-date", gender: "Male", profile_complete: true });

    expect(res.status).toBe(400);
    const saved = await Patient.findById(patient._id);
    expect(saved.gender).toBeNull();
    expect(saved.profile_complete).toBe(false);
  });
});
