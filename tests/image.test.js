// =============================================================================
// Backend/tests/image.test.js
//
// Coverage: imageController (uploadImage, listImages, getImageStatus,
//           listPatientImages) + magic-byte validation
//
// External services are mocked:
//  · cloudinary — prevents real uploads; background job completes cleanly.
//  · axios — prevents real AI service calls from the background job.
//
// Note: file-size limit (55 MB for pdf/xray, 150 MB for ct_mri) is a boundary
//       on string.length and is not testable without a multi-MB in-memory string.
//       That check is treated as a trusted language primitive and not exercised here.
// =============================================================================

process.env.JWT_SECRET = "test_secret_for_jest";

// ── Hoist mocks before any module loads ───────────────────────────────────────
jest.mock("../config/cloudinary", () => ({
  uploader: {
    upload: jest.fn().mockResolvedValue({
      secure_url: "https://res.cloudinary.com/test/upload/test-file",
      public_id:  "test/test-file",
    }),
  },
}));

jest.mock("axios", () => ({
  post: jest.fn().mockResolvedValue({
    status: 200,
    data:   { summary: "Mock analysis", key_findings: [], recommendations: [] },
  }),
}));

const request   = require("supertest");
const jwt       = require("jsonwebtoken");
const mongoose  = require("mongoose");

const app = require("../app");
const { connect, closeDatabase, clearDatabase } = require("./mongoTestHelper");

const User        = require("../models/User");
const Patient     = require("../models/Patient");
const DoctorProfile = require("../models/DoctorProfile");
const DoctorAvailability = require("../models/DoctorAvailability");
const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");
const ImageUpload = require("../models/ImageUpload");

// ── Magic-byte test fixtures ──────────────────────────────────────────────────
// These are the smallest possible valid base64 strings that will trigger the
// correct magic-byte detector in _detectFileType.

// %PDF (0x25 0x50 0x44 0x46) + some padding
const PDF_BASE64  = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]).toString("base64");
// JPEG (0xFF 0xD8 0xFF 0xE0) + JFIF marker
const JPEG_BASE64 = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]).toString("base64");
// ZIP (0x50 0x4B 0x03 0x04) — used for CT/MRI
const ZIP_BASE64  = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]).toString("base64");

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1d" });

async function createPatientUser(suffix = "") {
  const email = `img-patient${suffix}@test.com`;
  const user = await User.create({
    name: `Img Patient ${suffix}`, email, password: "password1", role: "patient",
  });
  const patient = await Patient.create({
    name: `Img Patient ${suffix}`, dob: new Date("1990-01-01"), gender: "female",
    contact: { email },
    user_id: user._id,
  });
  await User.updateOne({ _id: user._id }, { $set: { patient_id: patient._id } });
  const userFull = await User.findById(user._id);
  return { user: userFull, patient, token: makeToken(user._id) };
}

async function createDoctorWithAssignment(patient) {
  const email = `img-doctor@test.com`;
  const user = await User.create({
    name: "Img Doctor", email, password: "password1", role: "doctor",
  });
  const profile = await DoctorProfile.create({
    user_id: user._id, pmdc_number: "PMDC-IMG-001", specialty: "Radiology",
    gender: "male", location: { city: "Karachi" }, contact: { phone: "0311-999", email },
    status: "verified",
  });
  await DoctorAvailability.create({ doctor_id: profile._id });
  const assignment = await PatientDoctorAssignment.create({
    patient_id: patient._id, doctor_id: profile._id, status: "active",
  });
  return { user, profile, assignment, token: makeToken(user._id) };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
beforeEach(async () => await clearDatabase());

// =============================================================================
// 1. Upload validation (all return before background job runs)
// =============================================================================
describe("POST /api/images — upload validation", () => {
  let token;

  beforeEach(async () => {
    ({ token } = await createPatientUser("1"));
  });

  test("unauthenticated → 401", async () => {
    const res = await request(app)
      .post("/api/images")
      .send({ file_base64: PDF_BASE64, upload_type: "pdf" });
    expect(res.status).toBe(401);
  });

  test("missing file_base64 → 400", async () => {
    const res = await request(app)
      .post("/api/images")
      .set("Authorization", `Bearer ${token}`)
      .send({ upload_type: "pdf" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file_base64/);
  });

  test("invalid upload_type → 400", async () => {
    const res = await request(app)
      .post("/api/images")
      .set("Authorization", `Bearer ${token}`)
      .send({ file_base64: PDF_BASE64, upload_type: "unknown_type" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/upload_type/);
  });

  test("PDF content sent as xray type (mismatch) → 422", async () => {
    const res = await request(app)
      .post("/api/images")
      .set("Authorization", `Bearer ${token}`)
      .send({ file_base64: PDF_BASE64, upload_type: "xray" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/PDF/i);
  });

  test("JPEG content sent as pdf type (mismatch) → 422", async () => {
    const res = await request(app)
      .post("/api/images")
      .set("Authorization", `Bearer ${token}`)
      .send({ file_base64: JPEG_BASE64, upload_type: "pdf" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/image|scan/i);
  });
});

// =============================================================================
// 2. Upload happy path
// =============================================================================
describe("POST /api/images — happy path", () => {
  let user, patient, token;

  beforeEach(async () => {
    ({ user, patient, token } = await createPatientUser("2"));
  });

  test("PDF upload → 202 with id and processing status", async () => {
    const res = await request(app)
      .post("/api/images")
      .set("Authorization", `Bearer ${token}`)
      .send({ file_base64: PDF_BASE64, upload_type: "pdf", original_filename: "report.pdf" });

    expect(res.status).toBe(202);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe("processing");

    const record = await ImageUpload.findById(res.body.id);
    expect(record).not.toBeNull();
    expect(record.user_id.toString()).toBe(user._id.toString());
    expect(record.upload_type).toBe("pdf");
    expect(record.original_filename).toBe("report.pdf");
  });

  test("xray (JPEG) upload → 202 with record created in DB", async () => {
    const res = await request(app)
      .post("/api/images")
      .set("Authorization", `Bearer ${token}`)
      .send({ file_base64: JPEG_BASE64, upload_type: "xray" });

    expect(res.status).toBe(202);
    const record = await ImageUpload.findById(res.body.id);
    expect(record.upload_type).toBe("xray");
  });

  test("ct_mri (ZIP) upload → 202 with record created", async () => {
    const res = await request(app)
      .post("/api/images")
      .set("Authorization", `Bearer ${token}`)
      .send({ file_base64: ZIP_BASE64, upload_type: "ct_mri" });

    expect(res.status).toBe(202);
    const record = await ImageUpload.findById(res.body.id);
    expect(record.upload_type).toBe("ct_mri");
  });
});

// =============================================================================
// 3. List own images
// =============================================================================
describe("GET /api/images — listImages", () => {
  test("returns only the authenticated user's records", async () => {
    const { user: u1, token: t1 } = await createPatientUser("3a");
    const { user: u2 } = await createPatientUser("3b");

    await ImageUpload.create({ user_id: u1._id, upload_type: "pdf",  status: "complete" });
    await ImageUpload.create({ user_id: u1._id, upload_type: "xray", status: "processing" });
    await ImageUpload.create({ user_id: u2._id, upload_type: "pdf",  status: "complete" });

    const res = await request(app)
      .get("/api/images")
      .set("Authorization", `Bearer ${t1}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every(r => r.upload_type !== undefined)).toBe(true);
  });

  test("returns empty array when user has no uploads", async () => {
    const { token } = await createPatientUser("3c");
    const res = await request(app).get("/api/images").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test("response does not include storage_url (security: raw URL not exposed)", async () => {
    const { user, token } = await createPatientUser("3d");
    await ImageUpload.create({
      user_id: user._id, upload_type: "pdf", status: "complete",
      storage_url: "https://secret-cloudinary-url.com/file.pdf",
    });

    const res = await request(app).get("/api/images").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].storage_url).toBeUndefined();
  });
});

// =============================================================================
// 4. Get single image status (GET /api/images/:id)
// =============================================================================
describe("GET /api/images/:id — getImageStatus", () => {
  test("owner retrieves their own record → 200", async () => {
    const { user, token } = await createPatientUser("4a");
    const record = await ImageUpload.create({
      user_id: user._id, upload_type: "pdf", status: "complete",
      analysis_result: { summary: "Normal" },
    });

    const res = await request(app)
      .get(`/api/images/${record._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(record._id.toString());
    expect(res.body.status).toBe("complete");
    expect(res.body.analysis_result).toMatchObject({ summary: "Normal" });
  });

  test("different user's record → 404 (no information disclosure)", async () => {
    const { user: u1 }        = await createPatientUser("4b");
    const { token: token2 }   = await createPatientUser("4c");
    const record = await ImageUpload.create({
      user_id: u1._id, upload_type: "pdf", status: "complete",
    });

    const res = await request(app)
      .get(`/api/images/${record._id}`)
      .set("Authorization", `Bearer ${token2}`);

    // Returns 404 (not 403) — no information disclosure about whether the record exists
    expect(res.status).toBe(404);
  });

  test("nonexistent ID → 404", async () => {
    const { token } = await createPatientUser("4d");
    const res = await request(app)
      .get(`/api/images/${new mongoose.Types.ObjectId()}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("invalid ObjectId → 400 from validateObjectId middleware", async () => {
    const { token } = await createPatientUser("4e");
    const res = await request(app)
      .get("/api/images/not-a-valid-id")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid ID/);
  });
});

// =============================================================================
// 5. listPatientImages (doctor/admin view of a patient's scan history)
// =============================================================================
describe("GET /api/images/patient/:patientId — listPatientImages", () => {
  test("doctor with active assignment sees patient's images → 200", async () => {
    const { user: u1, patient: p1, token: t1 } = await createPatientUser("5a");
    const { token: docToken } = await createDoctorWithAssignment(p1);

    await ImageUpload.create({ user_id: u1._id, upload_type: "xray", status: "complete" });

    const res = await request(app)
      .get(`/api/images/patient/${p1._id}`)
      .set("Authorization", `Bearer ${docToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].storage_url).toBeUndefined();
  });

  test("doctor without assignment → 403", async () => {
    const { patient: p1 } = await createPatientUser("5b");
    const unrelatedDoctor = await User.create({
      name: "Unrelated", email: "unrelated@test.com", password: "password1", role: "doctor",
    });

    const res = await request(app)
      .get(`/api/images/patient/${p1._id}`)
      .set("Authorization", `Bearer ${makeToken(unrelatedDoctor._id)}`);

    expect(res.status).toBe(403);
  });

  test("patient cannot use this endpoint (doctor/admin only) → 403", async () => {
    const { patient: p1, token: t1 } = await createPatientUser("5c");

    const res = await request(app)
      .get(`/api/images/patient/${p1._id}`)
      .set("Authorization", `Bearer ${t1}`);

    expect(res.status).toBe(403);
  });

  test("invalid patientId ObjectId → 400", async () => {
    const unrelatedDoctor = await User.create({
      name: "Dr2", email: "dr2@test.com", password: "password1", role: "doctor",
    });
    const profile = await DoctorProfile.create({
      user_id: unrelatedDoctor._id, pmdc_number: "PMDC-99", specialty: "X",
      gender: "male", location: { city: "X" }, contact: { phone: "0311", email: "dr2@test.com" },
    });

    const res = await request(app)
      .get("/api/images/patient/bad-id")
      .set("Authorization", `Bearer ${makeToken(unrelatedDoctor._id)}`);

    expect(res.status).toBe(400);
  });
});
