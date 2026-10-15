// =============================================================================
// Backend/tests/report.test.js
//
// Coverage: role-based report view — patients receive only patient-facing
// fields; admins/doctors receive the full clinical report.
// =============================================================================

process.env.JWT_SECRET = "test_secret_for_jest";

const request  = require("supertest");
const jwt      = require("jsonwebtoken");
const mongoose = require("mongoose");

const app = require("../app");
const { connect, closeDatabase, clearDatabase } = require("./mongoTestHelper");
const User    = require("../models/User");
const Patient = require("../models/Patient");
const Session = require("../models/Session");
const Report  = require("../models/Report");

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
afterEach(async () => await clearDatabase());

const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);

async function seed() {
  const pid = new mongoose.Types.ObjectId();
  const aid = new mongoose.Types.ObjectId();
  const patient = await Patient.create({ name: "P", contact: { email: "p@test.com" } });
  await User.create({ _id: pid, name: "P", email: "p@test.com", role: "patient", patient_id: patient._id, is_verified: true, provider_uid: pid.toString() });
  await User.create({ _id: aid, name: "A", email: "a@test.com", role: "admin", is_verified: true, provider_uid: aid.toString() });
  const session = await Session.create({ patient_id: patient._id, status: "completed" });
  await Report.create({
    session_id: session._id, patient_id: patient._id,
    rag_query: "internal query", diagnostic_query: "internal dq",
    entities: [{ category: "symptom", keyword: "headache" }],
    disease_ranking: [{ disease: "Rare syndrome", confidence: 81 }],
    retrieved_chunks: [{ source: "textbook", text: "clinical text", score: 0.7 }],
    doctor_report: { patientComplaintSummary: "clinical summary", ragSummary: "evidence", medicationFlags: [{ drug: "X", flag: "risk" }] },
    patient_summary: { patientComplaintSummary: "plain summary", referralSpecialty: "Neurologist" },
    interpreted_diagnoses: [
      { disease: "Migraine", icdCode: "G43.9", plausibility: "likely", clinicalReason: "doctor reasoning", patientNote: "plain note" },
      { disease: "Rare syndrome", icdCode: "Q87", plausibility: "unlikely", clinicalReason: "no match", patientNote: "" },
    ],
    emergency_warning: { triggered: false, reason: "clinical reason", message: "" },
    flags: ["urgent"],
  });
  return { session, patientToken: tokenFor(pid), adminToken: tokenFor(aid) };
}

describe("Report view by role", () => {
  test("patient receives only patient-facing fields", async () => {
    const { session, patientToken } = await seed();
    const res = await request(app).get(`/api/reports/session/${session._id}`).set("Authorization", `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    for (const hidden of ["doctor_report", "rag_query", "diagnostic_query", "entities", "disease_ranking",
                          "retrieved_chunks", "openfda_results", "flags"]) {
      expect(res.body).not.toHaveProperty(hidden);
    }
    expect(res.body.patient_summary.patientComplaintSummary).toBe("plain summary");
    expect(res.body.interpreted_diagnoses).toEqual([
      { disease: "Migraine", icdCode: "G43.9", plausibility: "likely", patientNote: "plain note" },
    ]);
    expect(res.body.emergency_warning).toEqual({ triggered: false, message: "" });
  });

  test("patient report list is filtered too", async () => {
    const { session, patientToken } = await seed();
    const patientId = (await Session.findById(session._id)).patient_id;
    const res = await request(app).get(`/api/reports/patient/${patientId}`).set("Authorization", `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.results[0]).not.toHaveProperty("doctor_report");
    expect(res.body.results[0]).not.toHaveProperty("disease_ranking");
  });

  test("admin receives the full clinical report", async () => {
    const { session, adminToken } = await seed();
    const res = await request(app).get(`/api/reports/session/${session._id}`).set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.doctor_report.ragSummary).toBe("evidence");
    expect(res.body.interpreted_diagnoses).toHaveLength(2);
    expect(res.body.rag_query).toBe("internal query");
  });
});
