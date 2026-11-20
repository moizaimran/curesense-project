// =============================================================================
// Backend/tests/doctorCnic.test.js
//
// Coverage: new CNIC + email behaviours added to doctor registration/verification
//
// Critical behaviours under test:
//  · Registration: cnic_image_url is saved to DoctorProfile when supplied.
//  · Registration: name_as_per_cnic / father_name_as_per_cnic are required.
//  · Registration: verification link email and pending-review email fired.
//  · adminVerifyDoctor: approval email sent on approve.
//  · adminVerifyDoctor: rejection email sent on reject.
//  · POST /api/doctors/verify-cnic: returns extracted fields + cnic_image_url.
//  · POST /api/doctors/verify-cnic: 400 when body missing cnic_image_base64.
//
// External deps mocked:
//  · firebase-admin/* — via jest.config.js moduleNameMapper stubs
//  · emailService — all five functions
//  · textractService.extractCnicFields — GPT-4o Vision
//  · cloudinary.uploader.upload — Cloudinary
//  · pmdcService.verifyDoctor — PMDC lookup
// =============================================================================

process.env.JWT_SECRET = "test_secret_for_jest";

// ── Mock email service before any require("../app") ──────────────────────────
jest.mock("../services/emailService", () => ({
  sendVerificationLinkEmail:  jest.fn().mockResolvedValue(undefined),
  sendPasswordResetLinkEmail: jest.fn().mockResolvedValue(undefined),
  sendDoctorRegistrationEmail: jest.fn().mockResolvedValue(undefined),
  sendDoctorApprovalEmail:    jest.fn().mockResolvedValue(undefined),
  sendDoctorRejectionEmail:   jest.fn().mockResolvedValue(undefined),
}));

// ── Mock PMDC service ─────────────────────────────────────────────────────────
jest.mock("../services/pmdcService", () => ({
  verifyDoctor: jest.fn().mockResolvedValue({
    pmdc_found: false,
    confidence: 0,
    decision:   "flagged",
    breakdown:  {},
    message:    "mocked",
  }),
}));

// ── Mock GPT-4o Vision (textractService) ─────────────────────────────────────
jest.mock("../services/textractService", () => ({
  extractCnicFields: jest.fn().mockResolvedValue({
    name:        "HASSAN RAHEEM",
    father_name: "ABDUL RAHEEM",
    cnic_number: "12345-6789012-3",
    expiry_date: "31-12-2030",
    confidence:  { name: 1, father_name: 1, cnic_number: 1, expiry_date: 1 },
  }),
}));

// ── Mock Cloudinary ───────────────────────────────────────────────────────────
jest.mock("../config/cloudinary", () => ({
  uploader: {
    upload: jest.fn().mockResolvedValue({
      secure_url: "https://res.cloudinary.com/test/cnic/test.jpg",
      public_id:  "curesense/cnic/test",
    }),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────
const request  = require("supertest");
const jwt      = require("jsonwebtoken");
const mongoose = require("mongoose");

const app = require("../app");
const { connect, closeDatabase, clearDatabase } = require("./mongoTestHelper");

const User          = require("../models/User");
const DoctorProfile = require("../models/DoctorProfile");
const DoctorAvailability = require("../models/DoctorAvailability");

const emailService    = require("../services/emailService");
const cloudinary      = require("../config/cloudinary");
const { extractCnicFields } = require("../services/textractService");

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1d" });

const BASE_DOCTOR_BODY = {
  firstName:               "Hassan",
  lastName:                "Raheem",
  name_as_per_cnic:        "Hassan Raheem",
  father_name_as_per_cnic: "Abdul Raheem",
  email:                   "hassan.test@example.com",
  phone:                   "0300-1234567",
  password:                "password1",
  confirmPassword:         "password1",
  pmdc_number:             "PMDC-CNIC-001",
  specialty:               "Cardiologist",
  gender:                  "male",
  city:                    "Islamabad",
  cnic_image_url:          "https://res.cloudinary.com/test/cnic/test.jpg",
};

async function createAdminUser() {
  const adminId = new mongoose.Types.ObjectId();
  const user    = await User.create({
    _id: adminId, name: "Admin", email: "admin@cnictest.com", role: "admin", provider_uid: adminId.toString(),
  });
  return { user, token: makeToken(user._id) };
}

async function createDoctorDirect(status = "pending", suffix = "") {
  const email = `drcnic${suffix}@test.com`;
  const uid   = new mongoose.Types.ObjectId();
  const user  = await User.create({
    _id: uid, name: "Dr CNIC", email, role: "doctor", provider_uid: uid.toString(),
  });
  const profile = await DoctorProfile.create({
    user_id:                 user._id,
    pmdc_number:             `PMDC-CNIC-D-${suffix || "1"}`,
    name_as_per_cnic:        "HASSAN RAHEEM",
    father_name_as_per_cnic: "ABDUL RAHEEM",
    specialty:               "Cardiologist",
    gender:                  "male",
    location:                { city: "Islamabad" },
    contact:                 { phone: "0300-1234567", email },
    status,
    cnic_image_url:          "https://res.cloudinary.com/test/cnic/existing.jpg",
  });
  await DoctorAvailability.create({ doctor_id: profile._id });
  return { user, profile, token: makeToken(user._id) };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
beforeEach(async () => {
  await clearDatabase();
  jest.clearAllMocks();
});

// =============================================================================
// 1. Registration — CNIC fields
// =============================================================================
describe("POST /api/doctors/register — CNIC fields", () => {
  test("cnic_image_url saved to DoctorProfile when supplied", async () => {
    const res = await request(app)
      .post("/api/doctors/register")
      .send(BASE_DOCTOR_BODY);

    expect(res.status).toBe(201);

    const profile = await DoctorProfile.findById(res.body.user.doctor_profile.id);
    expect(profile.cnic_image_url).toBe("https://res.cloudinary.com/test/cnic/test.jpg");
  });

  test("name_as_per_cnic and father_name_as_per_cnic are saved to DoctorProfile", async () => {
    const res = await request(app)
      .post("/api/doctors/register")
      .send(BASE_DOCTOR_BODY);

    expect(res.status).toBe(201);

    const profile = await DoctorProfile.findById(res.body.user.doctor_profile.id);
    expect(profile.name_as_per_cnic).toBe("Hassan Raheem");
    expect(profile.father_name_as_per_cnic).toBe("Abdul Raheem");
  });

  test("missing name_as_per_cnic → 400", async () => {
    const { name_as_per_cnic, ...body } = BASE_DOCTOR_BODY;
    const res = await request(app).post("/api/doctors/register").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cnic/i);
  });

  test("missing father_name_as_per_cnic → 400", async () => {
    const { father_name_as_per_cnic, ...body } = BASE_DOCTOR_BODY;
    const res = await request(app).post("/api/doctors/register").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cnic/i);
  });

  test("cnic_image_url stored as empty string when omitted", async () => {
    const { cnic_image_url, ...body } = BASE_DOCTOR_BODY;
    const res = await request(app).post("/api/doctors/register").send(body);
    expect(res.status).toBe(201);
    const profile = await DoctorProfile.findById(res.body.user.doctor_profile.id);
    expect(profile.cnic_image_url).toBe("");
  });
});

// =============================================================================
// 2. Registration — email sending
// =============================================================================
describe("POST /api/doctors/register — email sending", () => {
  test("sendDoctorRegistrationEmail called after successful registration", async () => {
    await request(app).post("/api/doctors/register").send(BASE_DOCTOR_BODY);

    // Fire-and-forget — give the promise a tick to settle
    await new Promise(r => setTimeout(r, 50));

    expect(emailService.sendDoctorRegistrationEmail).toHaveBeenCalledWith(
      BASE_DOCTOR_BODY.email,
      "Hassan Raheem"
    );
  });

  test("sendVerificationLinkEmail called after successful registration", async () => {
    await request(app).post("/api/doctors/register").send(BASE_DOCTOR_BODY);

    await new Promise(r => setTimeout(r, 50));

    expect(emailService.sendVerificationLinkEmail).toHaveBeenCalledWith(
      BASE_DOCTOR_BODY.email,
      expect.any(String)
    );
  });

  test("email functions not called when registration fails (bad payload)", async () => {
    const { firstName, ...bad } = BASE_DOCTOR_BODY;
    await request(app).post("/api/doctors/register").send(bad);

    await new Promise(r => setTimeout(r, 50));

    expect(emailService.sendDoctorRegistrationEmail).not.toHaveBeenCalled();
    expect(emailService.sendVerificationLinkEmail).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 3. Admin verification — approval/rejection emails
// =============================================================================
describe("PATCH /api/doctors/admin/:id/verify — notification emails", () => {
  test("sendDoctorApprovalEmail called when admin approves", async () => {
    const { token: adminToken } = await createAdminUser();
    const { profile }           = await createDoctorDirect("pending", "em1");

    await request(app)
      .patch(`/api/doctors/admin/${profile._id}/verify`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "approve" });

    await new Promise(r => setTimeout(r, 50));

    expect(emailService.sendDoctorApprovalEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendDoctorRejectionEmail).not.toHaveBeenCalled();
  });

  test("sendDoctorRejectionEmail called with reason when admin rejects", async () => {
    const { token: adminToken } = await createAdminUser();
    const { profile }           = await createDoctorDirect("pending", "em2");

    await request(app)
      .patch(`/api/doctors/admin/${profile._id}/verify`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "reject", rejection_reason: "PMDC not verifiable" });

    await new Promise(r => setTimeout(r, 50));

    expect(emailService.sendDoctorRejectionEmail).toHaveBeenCalledTimes(1);
    const [, , reason] = emailService.sendDoctorRejectionEmail.mock.calls[0];
    expect(reason).toBe("PMDC not verifiable");
    expect(emailService.sendDoctorApprovalEmail).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 4. POST /api/doctors/verify-cnic
// =============================================================================
describe("POST /api/doctors/verify-cnic", () => {
  test("happy path: returns extracted CNIC fields + cnic_image_url", async () => {
    const res = await request(app)
      .post("/api/doctors/verify-cnic")
      .send({ cnic_image_base64: "FAKEB64DATA" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("HASSAN RAHEEM");
    expect(res.body.father_name).toBe("ABDUL RAHEEM");
    expect(res.body.cnic_number).toBe("12345-6789012-3");
    expect(res.body.cnic_image_url).toBe("https://res.cloudinary.com/test/cnic/test.jpg");
  });

  test("extractCnicFields and cloudinary.upload called in parallel", async () => {
    await request(app)
      .post("/api/doctors/verify-cnic")
      .send({ cnic_image_base64: "FAKEB64DATA" });

    expect(extractCnicFields).toHaveBeenCalledWith("FAKEB64DATA");
    expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
      "data:image/jpeg;base64,FAKEB64DATA",
      expect.objectContaining({ folder: "curesense/cnic" })
    );
  });

  test("missing cnic_image_base64 → 400", async () => {
    const res = await request(app)
      .post("/api/doctors/verify-cnic")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cnic_image_base64/i);
  });

  test("confidence object returned with four keys", async () => {
    const res = await request(app)
      .post("/api/doctors/verify-cnic")
      .send({ cnic_image_base64: "FAKEB64DATA" });

    expect(res.body.confidence).toMatchObject({
      name: 1, father_name: 1, cnic_number: 1, expiry_date: 1,
    });
  });
});
