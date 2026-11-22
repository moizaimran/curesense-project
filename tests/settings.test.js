// =============================================================================
// Backend/tests/settings.test.js — dashboard settings
//   · notification preferences (GET/PATCH /api/auth/me/notifications)
//   · activity emails respect those preferences
//   · profile edits (name sync for patients, patient phone)
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
const emailService            = require("../services/emailService");

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
afterEach(async () => { await clearDatabase(); jest.restoreAllMocks(); });

const auth = (id) => `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" })}`;
const flush = () => new Promise((r) => setTimeout(r, 150)); // let fire-and-forget emails run

let seq = 0;
async function world() {
  seq += 1;
  const pid = new mongoose.Types.ObjectId();
  const patient = await Patient.create({ name: "Sara Ahmed", contact: { email: `pat${seq}@t.com` } });
  const patientUser = await User.create({ _id: pid, name: "Sara Ahmed", email: `pat${seq}@t.com`, role: "patient", patient_id: patient._id, provider_uid: pid.toString() });

  const did = new mongoose.Types.ObjectId();
  const doctorUser = await User.create({ _id: did, name: "Dr. Bilal", email: `doc${seq}@t.com`, role: "doctor", provider_uid: did.toString() });
  const doctor = await DoctorProfile.create({
    user_id: did, pmdc_number: `ST-${seq}`, name_as_per_cnic: "Bilal", father_name_as_per_cnic: "F",
    specialty: "Cardiology", gender: "male", location: { city: "Lahore" }, contact: { phone: "0", email: `doc${seq}@t.com` }, status: "verified",
  });

  const aid = new mongoose.Types.ObjectId();
  const adminUser = await User.create({ _id: aid, name: "Admin", email: `adm${seq}@t.com`, role: "admin", provider_uid: aid.toString() });

  const assignment = await PatientDoctorAssignment.create({ patient_id: patient._id, doctor_id: doctor._id, status: "pending" });
  const appt = await Appointment.create({
    patient_id: patient._id, doctor_id: doctor._id, assignment_id: assignment._id,
    requested_slot: { date: "2027-01-04", start_time: "09:00", end_time: "09:30" }, status: "pending_admin_review",
  });
  return { patient, patientUser, doctor, doctorUser, adminUser, appt };
}

// ── Preferences API ──────────────────────────────────────────────────────────

describe("notification preferences", () => {
  test("defaults to everything on, for every role", async () => {
    const { patientUser, doctorUser, adminUser } = await world();
    for (const u of [patientUser, doctorUser, adminUser]) {
      const res = await request(app).get("/api/auth/me/notifications").set("Authorization", auth(u._id));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ email: { appointment_updates: true, payment_updates: true, messages: true } });
    }
  });

  test("partial update keeps the other settings", async () => {
    const { doctorUser } = await world();
    const res = await request(app).patch("/api/auth/me/notifications").set("Authorization", auth(doctorUser._id))
      .send({ email: { messages: false } });
    expect(res.status).toBe(200);
    expect(res.body.email).toEqual({ appointment_updates: true, payment_updates: true, messages: false });

    const again = await request(app).get("/api/auth/me/notifications").set("Authorization", auth(doctorUser._id));
    expect(again.body.email.messages).toBe(false);
  });

  test.each([
    [{ email: { marketing: true } }],
    [{ email: { messages: "no" } }],
    [{}],
  ])("invalid body %j → 400", async (body) => {
    const { patientUser } = await world();
    const res = await request(app).patch("/api/auth/me/notifications").set("Authorization", auth(patientUser._id)).send(body);
    expect(res.status).toBe(400);
  });

  test("requires login", async () => {
    expect((await request(app).get("/api/auth/me/notifications")).status).toBe(401);
  });
});

// ── Emails respect preferences ───────────────────────────────────────────────

describe("activity emails", () => {
  test("approving an appointment emails the patient and the doctor", async () => {
    const spy = jest.spyOn(emailService, "sendNotificationEmail").mockResolvedValue();
    const { appt, adminUser, patientUser, doctorUser } = await world();
    await request(app).patch(`/api/appointments/admin/${appt._id}/review`).set("Authorization", auth(adminUser._id)).send({ decision: "approve" });
    await flush();

    const to = spy.mock.calls.map((c) => c[0]).sort();
    expect(to).toEqual([doctorUser.email, patientUser.email].sort());
    const patientMail = spy.mock.calls.find((c) => c[0] === patientUser.email)[1];
    expect(patientMail.subject).toMatch(/confirmed/i);
    expect(patientMail.lines.join(" ")).toMatch(/Dr\. Bilal/);
    expect(patientMail.lines.join(" ")).not.toMatch(/Dr\. Dr\./);
  });

  test("a patient who turned appointment emails off gets none; the doctor still does", async () => {
    const spy = jest.spyOn(emailService, "sendNotificationEmail").mockResolvedValue();
    const { appt, adminUser, patientUser, doctorUser } = await world();
    await request(app).patch("/api/auth/me/notifications").set("Authorization", auth(patientUser._id)).send({ email: { appointment_updates: false } });

    await request(app).patch(`/api/appointments/admin/${appt._id}/review`).set("Authorization", auth(adminUser._id)).send({ decision: "approve" });
    await flush();
    expect(spy.mock.calls.map((c) => c[0])).toEqual([doctorUser.email]);
  });

  test("rejection email includes the reason", async () => {
    const spy = jest.spyOn(emailService, "sendNotificationEmail").mockResolvedValue();
    const { appt, adminUser, patientUser } = await world();
    await request(app).patch(`/api/appointments/admin/${appt._id}/review`).set("Authorization", auth(adminUser._id))
      .send({ decision: "reject", rejection_reason: "Doctor on leave" });
    await flush();
    const mail = spy.mock.calls.find((c) => c[0] === patientUser.email)[1];
    expect(mail.lines.join(" ")).toMatch(/Doctor on leave/);
  });

  test("new message emails the other side, honouring the messages setting", async () => {
    const spy = jest.spyOn(emailService, "sendNotificationEmail").mockResolvedValue();
    const { appt, patientUser, doctorUser } = await world();
    await Appointment.updateOne({ _id: appt._id }, { status: "confirmed" });
    await PatientDoctorAssignment.updateOne({ _id: appt.assignment_id }, { status: "active" });

    await request(app).post(`/api/appointments/${appt._id}/queries`).set("Authorization", auth(patientUser._id)).send({ message: "Hello doctor" });
    await flush();
    expect(spy.mock.calls.map((c) => c[0])).toEqual([doctorUser.email]);

    spy.mockClear();
    await request(app).patch("/api/auth/me/notifications").set("Authorization", auth(patientUser._id)).send({ email: { messages: false } });
    await request(app).post(`/api/appointments/${appt._id}/queries`).set("Authorization", auth(doctorUser._id)).send({ message: "Hi Sara" });
    await flush();
    expect(spy).not.toHaveBeenCalled();
  });

  test("an email failure never breaks the request", async () => {
    jest.spyOn(emailService, "sendNotificationEmail").mockRejectedValue(new Error("SMTP down"));
    const { appt, adminUser } = await world();
    const res = await request(app).patch(`/api/appointments/admin/${appt._id}/review`).set("Authorization", auth(adminUser._id)).send({ decision: "approve" });
    await flush();
    expect(res.status).toBe(200);
  });
});

// ── Profile edits ────────────────────────────────────────────────────────────

describe("profile edits", () => {
  test("a patient renaming themselves updates the name doctors see", async () => {
    const { patientUser, patient } = await world();
    const res = await request(app).patch("/api/auth/me").set("Authorization", auth(patientUser._id)).send({ name: "  Sara A. Khan " });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Sara A. Khan");
    expect((await Patient.findById(patient._id)).name).toBe("Sara A. Khan");
  });

  test("name is required and limited", async () => {
    const { doctorUser } = await world();
    expect((await request(app).patch("/api/auth/me").set("Authorization", auth(doctorUser._id)).send({ name: " " })).status).toBe(400);
    expect((await request(app).patch("/api/auth/me").set("Authorization", auth(doctorUser._id)).send({ name: "x".repeat(101) })).status).toBe(400);
  });

  test("patient can update their phone number; invalid numbers are refused", async () => {
    const { patientUser, patient } = await world();
    const ok = await request(app).patch(`/api/patients/${patient._id}`).set("Authorization", auth(patientUser._id)).send({ phone: "0300 123 4567" });
    expect(ok.status).toBe(200);
    expect((await Patient.findById(patient._id)).contact.phone).toBe("03001234567");

    const bad = await request(app).patch(`/api/patients/${patient._id}`).set("Authorization", auth(patientUser._id)).send({ phone: "12345" });
    expect(bad.status).toBe(400);
  });
});
