// =============================================================================
// Backend/tests/searchFilters.test.js
//
// Coverage for the search filters on:
//  - GET /api/doctors              (q, available_on, sort)
//  - GET /api/patients             (gender, age range, profile_complete, registered dates)
//  - GET /api/appointments/admin   (status list / all, search, specialty, date range)
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
const DoctorAvailability      = require("../models/DoctorAvailability");
const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");
const Appointment             = require("../models/Appointment");

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
afterEach(async () => await clearDatabase());

const token = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" });

async function makeAdmin() {
  const _id = new mongoose.Types.ObjectId();
  await User.create({ _id, name: "Admin", email: "admin@test.com", role: "admin", provider_uid: _id.toString() });
  return token(_id);
}

let docSeq = 0;
async function makeDoctor({ name, specialty = "Cardiology", hospital = "", experience = 0, city = "Lahore" }) {
  docSeq += 1;
  const uid = new mongoose.Types.ObjectId();
  await User.create({ _id: uid, name, email: `doc${docSeq}@test.com`, role: "doctor", provider_uid: uid.toString() });
  return DoctorProfile.create({
    user_id: uid,
    pmdc_number: `PMDC-${docSeq}`,
    name_as_per_cnic: name,
    father_name_as_per_cnic: "Father",
    specialty,
    hospital_clinic: hospital,
    experience_years: experience,
    gender: "male",
    location: { city },
    contact: { phone: "0300", email: `doc${docSeq}@test.com` },
    status: "verified",
  });
}

function yearsAgo(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  d.setMonth(d.getMonth() - 1); // a month past the birthday, so age is exactly n
  return d;
}

// ── GET /api/doctors ─────────────────────────────────────────────────────────

describe("GET /api/doctors — search filters", () => {
  test("q matches doctor name, specialty or hospital", async () => {
    await makeDoctor({ name: "Ayesha Malik", specialty: "Dermatology" });
    await makeDoctor({ name: "Bilal Khan", specialty: "Cardiology", hospital: "Shifa International" });
    await makeDoctor({ name: "Usman Ali", specialty: "Neurology" });

    const byName = await request(app).get("/api/doctors?q=ayesha");
    expect(byName.body.results.map((d) => d.user_id.name)).toEqual(["Ayesha Malik"]);

    const byHospital = await request(app).get("/api/doctors?q=shifa");
    expect(byHospital.body.results.map((d) => d.user_id.name)).toEqual(["Bilal Khan"]);

    const bySpecialty = await request(app).get("/api/doctors?q=neuro");
    expect(bySpecialty.body.total).toBe(1);
  });

  test("available_on respects weekly schedule and exceptions", async () => {
    const weekdayDoc = await makeDoctor({ name: "Monday Doc" });
    const offDoc     = await makeDoctor({ name: "Holiday Doc" });
    const extraDoc   = await makeDoctor({ name: "Extra Doc" });

    // 2027-01-04 is a Monday (day_of_week 1)
    const monday = { day_of_week: 1, start_time: "09:00", end_time: "17:00" };
    await DoctorAvailability.create({ doctor_id: weekdayDoc._id, weekly_schedule: [monday] });
    await DoctorAvailability.create({
      doctor_id: offDoc._id, weekly_schedule: [monday],
      exceptions: [{ date: "2027-01-04", available: false }],
    });
    await DoctorAvailability.create({
      doctor_id: extraDoc._id, weekly_schedule: [],
      exceptions: [{ date: "2027-01-04", available: true, custom_hours: { start_time: "10:00", end_time: "12:00" } }],
    });

    const res = await request(app).get("/api/doctors?available_on=2027-01-04");
    expect(res.status).toBe(200);
    expect(res.body.results.map((d) => d.user_id.name).sort()).toEqual(["Extra Doc", "Monday Doc"]);
  });

  test("invalid available_on → 400", async () => {
    const res = await request(app).get("/api/doctors?available_on=tomorrow");
    expect(res.status).toBe(400);
  });

  test("sort=experience orders by experience descending", async () => {
    await makeDoctor({ name: "Junior", experience: 2 });
    await makeDoctor({ name: "Senior", experience: 20 });
    const res = await request(app).get("/api/doctors?sort=experience");
    expect(res.body.results.map((d) => d.user_id.name)).toEqual(["Senior", "Junior"]);
  });
});

// ── GET /api/patients ────────────────────────────────────────────────────────

describe("GET /api/patients — admin filters", () => {
  beforeEach(async () => {
    await Patient.create([
      { name: "Young Female", dob: yearsAgo(20), gender: "Female", contact: { email: "yf@test.com", phone: "03001112222" }, profile_complete: true },
      { name: "Old Male",     dob: yearsAgo(60), gender: "male",   contact: { email: "om@test.com" }, profile_complete: true },
      { name: "No Profile",   contact: { email: "np@test.com" } },
    ]);
  });

  test("gender is case-insensitive", async () => {
    const res = await request(app).get("/api/patients?gender=female").set("Authorization", `Bearer ${await makeAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body.results.map((p) => p.name)).toEqual(["Young Female"]);
  });

  test("age range", async () => {
    const t = await makeAdmin();
    const res = await request(app).get("/api/patients?min_age=18&max_age=30").set("Authorization", `Bearer ${t}`);
    expect(res.body.results.map((p) => p.name)).toEqual(["Young Female"]);

    const older = await request(app).get("/api/patients?min_age=50").set("Authorization", `Bearer ${t}`);
    expect(older.body.results.map((p) => p.name)).toEqual(["Old Male"]);
  });

  test("profile_complete=false finds incomplete profiles", async () => {
    const res = await request(app).get("/api/patients?profile_complete=false").set("Authorization", `Bearer ${await makeAdmin()}`);
    expect(res.body.results.map((p) => p.name)).toEqual(["No Profile"]);
  });

  test("search matches phone number", async () => {
    const res = await request(app).get("/api/patients?search=0300111").set("Authorization", `Bearer ${await makeAdmin()}`);
    expect(res.body.results.map((p) => p.name)).toEqual(["Young Female"]);
  });

  test("registered date range excludes future-only window", async () => {
    const res = await request(app).get("/api/patients?registered_from=2099-01-01").set("Authorization", `Bearer ${await makeAdmin()}`);
    expect(res.body.total).toBe(0);
  });
});

// ── GET /api/appointments/admin ──────────────────────────────────────────────

describe("GET /api/appointments/admin — filters", () => {
  async function seedAppointments() {
    const cardio = await makeDoctor({ name: "Dr Heart", specialty: "Cardiology" });
    const neuro  = await makeDoctor({ name: "Dr Brain", specialty: "Neurology" });
    const sara   = await Patient.create({ name: "Sara Ahmed", contact: { email: "sara@test.com" } });
    const omar   = await Patient.create({ name: "Omar Farooq", contact: { email: "omar@test.com" } });

    async function appt(patient, doctor, date, status) {
      const assignment = await PatientDoctorAssignment.create({ patient_id: patient._id, doctor_id: doctor._id, status: "active" })
        .catch(() => PatientDoctorAssignment.findOne({ patient_id: patient._id, doctor_id: doctor._id }));
      return Appointment.create({
        patient_id: patient._id, doctor_id: doctor._id, assignment_id: assignment._id,
        requested_slot: { date, start_time: "10:00", end_time: "10:30" }, status,
      });
    }

    await appt(sara, cardio, "2027-01-10", "pending_admin_review");
    await appt(omar, cardio, "2027-02-10", "completed");
    await appt(sara, neuro,  "2027-03-10", "confirmed");
    return { cardio, neuro };
  }

  test("defaults to pending only", async () => {
    await seedAppointments();
    const res = await request(app).get("/api/appointments/admin").set("Authorization", `Bearer ${await makeAdmin()}`);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].status).toBe("pending_admin_review");
  });

  test("status=all and comma-separated statuses", async () => {
    await seedAppointments();
    const t = await makeAdmin();
    const all = await request(app).get("/api/appointments/admin?status=all").set("Authorization", `Bearer ${t}`);
    expect(all.body.total).toBe(3);

    const two = await request(app).get("/api/appointments/admin?status=completed,confirmed").set("Authorization", `Bearer ${t}`);
    expect(two.body.total).toBe(2);
  });

  test("invalid status → 400", async () => {
    const res = await request(app).get("/api/appointments/admin?status=bogus").set("Authorization", `Bearer ${await makeAdmin()}`);
    expect(res.status).toBe(400);
  });

  test("search by patient or doctor name", async () => {
    await seedAppointments();
    const t = await makeAdmin();
    const byPatient = await request(app).get("/api/appointments/admin?status=all&search=omar").set("Authorization", `Bearer ${t}`);
    expect(byPatient.body.total).toBe(1);

    const byDoctor = await request(app).get("/api/appointments/admin?status=all&search=brain").set("Authorization", `Bearer ${t}`);
    expect(byDoctor.body.total).toBe(1);
    expect(byDoctor.body.results[0].status).toBe("confirmed");
  });

  test("specialty and date range", async () => {
    await seedAppointments();
    const t = await makeAdmin();
    const cardio = await request(app).get("/api/appointments/admin?status=all&specialty=cardio").set("Authorization", `Bearer ${t}`);
    expect(cardio.body.total).toBe(2);

    const feb = await request(app).get("/api/appointments/admin?status=all&date_from=2027-02-01&date_to=2027-02-28").set("Authorization", `Bearer ${t}`);
    expect(feb.body.total).toBe(1);
    expect(feb.body.results[0].status).toBe("completed");
  });
});
