// =============================================================================
// Backend/tests/review.test.js
//
// Post-case rating & feedback:
//   POST /api/appointments/:id/review   (patient ↔ doctor, completed only)
//   GET  /api/appointments/:id/reviews  (visibility rules)
//   GET  /api/doctors/:id/reviews       (public list)
//   GET  /api/doctors?min_rating / sort=rating
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

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
afterEach(async () => await clearDatabase());

const auth = (id) => `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" })}`;

let seq = 0;

async function makePatient(name = "Sara Ahmed") {
  seq += 1;
  const uid = new mongoose.Types.ObjectId();
  const patient = await Patient.create({ name, contact: { email: `p${seq}@test.com` } });
  const user = await User.create({
    _id: uid, name, email: `p${seq}@test.com`, role: "patient",
    patient_id: patient._id, is_verified: true, provider_uid: uid.toString(),
  });
  return { patient, user };
}

async function makeDoctor(name = "Dr Heart") {
  seq += 1;
  const uid = new mongoose.Types.ObjectId();
  const user = await User.create({ _id: uid, name, email: `d${seq}@test.com`, role: "doctor", provider_uid: uid.toString() });
  const profile = await DoctorProfile.create({
    user_id: uid, pmdc_number: `PMDC-R${seq}`, name_as_per_cnic: name, father_name_as_per_cnic: "F",
    specialty: "Cardiology", gender: "male", location: { city: "Lahore" },
    contact: { phone: "0300", email: `d${seq}@test.com` }, status: "verified",
  });
  return { user, profile };
}

async function makeAdmin() {
  const uid = new mongoose.Types.ObjectId();
  return User.create({ _id: uid, name: "Admin", email: `a${++seq}@test.com`, role: "admin", provider_uid: uid.toString() });
}

async function makeAppointment(patient, doctor, status = "completed") {
  const assignment = await PatientDoctorAssignment.findOneAndUpdate(
    { patient_id: patient._id, doctor_id: doctor._id },
    { $setOnInsert: { status: "active" } },
    { upsert: true, new: true }
  );
  return Appointment.create({
    patient_id: patient._id, doctor_id: doctor._id, assignment_id: assignment._id,
    requested_slot: { date: "2027-01-10", start_time: "10:00", end_time: "10:30" }, status,
  });
}

async function scenario(status = "completed") {
  const p = await makePatient();
  const d = await makeDoctor();
  const appt = await makeAppointment(p.patient, d.profile, status);
  return { ...p, doctorUser: d.user, profile: d.profile, appt };
}

// ── Submitting ───────────────────────────────────────────────────────────────

describe("POST /api/appointments/:id/review", () => {
  test("patient rates the doctor → doctor rating summary updates", async () => {
    const { user, appt, profile } = await scenario();
    const res = await request(app)
      .post(`/api/appointments/${appt._id}/review`)
      .set("Authorization", auth(user._id))
      .send({ rating: 4, comment: "  Very helpful  " });

    expect(res.status).toBe(200);
    expect(res.body.review.reviewer_role).toBe("patient");
    expect(res.body.review.comment).toBe("Very helpful");
    expect(res.body.rating_summary).toEqual({ average: 4, count: 1 });

    const doc = await DoctorProfile.findById(profile._id);
    expect(doc.rating.average).toBe(4);
    expect(doc.rating.count).toBe(1);
  });

  test("doctor rates the patient → patient rating summary updates", async () => {
    const { doctorUser, appt, patient } = await scenario();
    const res = await request(app)
      .post(`/api/appointments/${appt._id}/review`)
      .set("Authorization", auth(doctorUser._id))
      .send({ rating: 5, comment: "Cooperative patient" });

    expect(res.status).toBe(200);
    expect(res.body.review.reviewer_role).toBe("doctor");
    const saved = await Patient.findById(patient._id);
    expect(saved.rating.average).toBe(5);
  });

  test("resubmitting edits the review instead of duplicating it", async () => {
    const { user, appt, profile } = await scenario();
    await request(app).post(`/api/appointments/${appt._id}/review`).set("Authorization", auth(user._id)).send({ rating: 2 });
    await request(app).post(`/api/appointments/${appt._id}/review`).set("Authorization", auth(user._id)).send({ rating: 5 });

    expect(await Review.countDocuments({ appointment_id: appt._id })).toBe(1);
    expect((await DoctorProfile.findById(profile._id)).rating).toMatchObject({ average: 5, count: 1 });
  });

  test("average is across all of the doctor's completed cases", async () => {
    const d = await makeDoctor();
    for (const stars of [5, 4, 3]) {
      const p = await makePatient();
      const appt = await makeAppointment(p.patient, d.profile);
      await request(app).post(`/api/appointments/${appt._id}/review`).set("Authorization", auth(p.user._id)).send({ rating: stars });
    }
    const doc = await DoctorProfile.findById(d.profile._id);
    expect(doc.rating.average).toBe(4);
    expect(doc.rating.count).toBe(3);
  });

  test.each(["confirmed", "pending_admin_review", "cancelled"])("not allowed while status is %s → 409", async (status) => {
    const { user, appt } = await scenario(status);
    const res = await request(app).post(`/api/appointments/${appt._id}/review`).set("Authorization", auth(user._id)).send({ rating: 5 });
    expect(res.status).toBe(409);
  });

  test.each([0, 6, 3.5, "abc", undefined])("invalid rating %p → 400", async (rating) => {
    const { user, appt } = await scenario();
    const res = await request(app).post(`/api/appointments/${appt._id}/review`).set("Authorization", auth(user._id)).send({ rating });
    expect(res.status).toBe(400);
  });

  test("comment over 1000 characters → 400", async () => {
    const { user, appt } = await scenario();
    const res = await request(app).post(`/api/appointments/${appt._id}/review`).set("Authorization", auth(user._id))
      .send({ rating: 5, comment: "x".repeat(1001) });
    expect(res.status).toBe(400);
  });

  test("a patient who is not on the appointment → 403", async () => {
    const { appt } = await scenario();
    const stranger = await makePatient("Stranger");
    const res = await request(app).post(`/api/appointments/${appt._id}/review`).set("Authorization", auth(stranger.user._id)).send({ rating: 1 });
    expect(res.status).toBe(403);
  });

  test("a different doctor → 403", async () => {
    const { appt } = await scenario();
    const other = await makeDoctor("Dr Other");
    const res = await request(app).post(`/api/appointments/${appt._id}/review`).set("Authorization", auth(other.user._id)).send({ rating: 1 });
    expect(res.status).toBe(403);
  });

  test("admins cannot submit reviews → 403", async () => {
    const { appt } = await scenario();
    const admin = await makeAdmin();
    const res = await request(app).post(`/api/appointments/${appt._id}/review`).set("Authorization", auth(admin._id)).send({ rating: 5 });
    expect(res.status).toBe(403);
  });
});

// ── Visibility ───────────────────────────────────────────────────────────────

describe("GET /api/appointments/:id/reviews — visibility", () => {
  async function bothReviewed() {
    const s = await scenario();
    await request(app).post(`/api/appointments/${s.appt._id}/review`).set("Authorization", auth(s.user._id)).send({ rating: 4, comment: "Good doctor" });
    await request(app).post(`/api/appointments/${s.appt._id}/review`).set("Authorization", auth(s.doctorUser._id)).send({ rating: 2, comment: "Late to appointment" });
    return s;
  }

  test("patient sees only their own review, never the doctor's rating of them", async () => {
    const { user, appt } = await bothReviewed();
    const res = await request(app).get(`/api/appointments/${appt._id}/reviews`).set("Authorization", auth(user._id));
    expect(res.status).toBe(200);
    expect(res.body.patient_review.rating).toBe(4);
    expect(res.body.doctor_review).toBeNull();
  });

  test("doctor sees both reviews", async () => {
    const { doctorUser, appt } = await bothReviewed();
    const res = await request(app).get(`/api/appointments/${appt._id}/reviews`).set("Authorization", auth(doctorUser._id));
    expect(res.body.patient_review.comment).toBe("Good doctor");
    expect(res.body.doctor_review.comment).toBe("Late to appointment");
  });

  test("admin sees both reviews", async () => {
    const { appt } = await bothReviewed();
    const admin = await makeAdmin();
    const res = await request(app).get(`/api/appointments/${appt._id}/reviews`).set("Authorization", auth(admin._id));
    expect(res.body.patient_review).not.toBeNull();
    expect(res.body.doctor_review).not.toBeNull();
  });

  test("unrelated patient → 403", async () => {
    const { appt } = await bothReviewed();
    const stranger = await makePatient("Stranger");
    const res = await request(app).get(`/api/appointments/${appt._id}/reviews`).set("Authorization", auth(stranger.user._id));
    expect(res.status).toBe(403);
  });

  test("patient profile endpoint hides doctors' ratings from the patient", async () => {
    const { user, patient } = await bothReviewed();
    const res = await request(app).get(`/api/patients/${patient._id}`).set("Authorization", auth(user._id));
    expect(res.status).toBe(200);
    expect(res.body.rating).toBeUndefined();
  });
});

// ── Public doctor reviews + search ───────────────────────────────────────────

describe("public doctor reviews and rating search", () => {
  test("GET /api/doctors/:id/reviews lists patient reviews with first name only", async () => {
    const { user, appt, profile, doctorUser } = await scenario();
    await request(app).post(`/api/appointments/${appt._id}/review`).set("Authorization", auth(user._id)).send({ rating: 5, comment: "Excellent" });
    await request(app).post(`/api/appointments/${appt._id}/review`).set("Authorization", auth(doctorUser._id)).send({ rating: 1, comment: "private note" });

    const res = await request(app).get(`/api/doctors/${profile._id}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.rating).toMatchObject({ average: 5, count: 1 });
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toMatchObject({ rating: 5, comment: "Excellent", patient_first_name: "Sara" });
    expect(JSON.stringify(res.body)).not.toContain("private note");
  });

  test("reviews for an unverified doctor → 404", async () => {
    const { profile } = await makeDoctor();
    await DoctorProfile.updateOne({ _id: profile._id }, { status: "pending" });
    const res = await request(app).get(`/api/doctors/${profile._id}/reviews`);
    expect(res.status).toBe(404);
  });

  test("min_rating filter and sort=rating", async () => {
    const top = await makeDoctor("Top Doc");
    const low = await makeDoctor("Low Doc");
    await makeDoctor("New Doc");
    await DoctorProfile.updateOne({ _id: top.profile._id }, { rating: { average: 4.8, count: 10 } });
    await DoctorProfile.updateOne({ _id: low.profile._id }, { rating: { average: 3.1, count: 4 } });

    const filtered = await request(app).get("/api/doctors?min_rating=4");
    expect(filtered.body.results.map((d) => d.user_id.name)).toEqual(["Top Doc"]);

    const sorted = await request(app).get("/api/doctors?sort=rating");
    expect(sorted.body.results.map((d) => d.user_id.name)).toEqual(["Top Doc", "Low Doc", "New Doc"]);

    const bad = await request(app).get("/api/doctors?min_rating=9");
    expect(bad.status).toBe(400);
  });
});
