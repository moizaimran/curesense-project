// =============================================================================
// Backend/tests/notificationsReports.test.js
//   · in-app notifications (/api/notifications) + the events that create them
//   · admin Reports & analytics (/api/stats/reports)
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
const Report                  = require("../models/Report");
const Session                 = require("../models/Session");
const Notification            = require("../models/Notification");
const emailService            = require("../services/emailService");

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
beforeEach(() => jest.spyOn(emailService, "sendNotificationEmail").mockResolvedValue());
afterEach(async () => { await clearDatabase(); jest.restoreAllMocks(); });

const auth  = (id) => `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" })}`;
const flush = () => new Promise((r) => setTimeout(r, 200));

let seq = 0;
async function world({ emergency = false } = {}) {
  seq += 1;
  const pid = new mongoose.Types.ObjectId();
  const patient = await Patient.create({ name: "Sara Ahmed", contact: { email: `np${seq}@t.com` } });
  const patientUser = await User.create({ _id: pid, name: "Sara Ahmed", email: `np${seq}@t.com`, role: "patient", patient_id: patient._id, provider_uid: pid.toString() });
  const did = new mongoose.Types.ObjectId();
  const doctorUser = await User.create({ _id: did, name: "Dr. Bilal", email: `nd${seq}@t.com`, role: "doctor", provider_uid: did.toString() });
  const doctor = await DoctorProfile.create({
    user_id: did, pmdc_number: `NR-${seq}`, name_as_per_cnic: "B", father_name_as_per_cnic: "F", specialty: "Cardiology",
    gender: "male", location: { city: "Lahore" }, contact: { phone: "0", email: `nd${seq}@t.com` }, status: "verified",
  });
  const aid = new mongoose.Types.ObjectId();
  const adminUser = await User.create({ _id: aid, name: "Admin", email: `na${seq}@t.com`, role: "admin", provider_uid: aid.toString() });
  const report = await Report.create({
    session_id: new mongoose.Types.ObjectId(), patient_id: patient._id,
    emergency_warning: emergency ? { triggered: true, reason: "Chest pain with breathlessness" } : undefined,
  });
  const assignment = await PatientDoctorAssignment.create({ patient_id: patient._id, doctor_id: doctor._id, status: "pending" });
  const appt = await Appointment.create({
    patient_id: patient._id, doctor_id: doctor._id, assignment_id: assignment._id, report_id: report._id,
    requested_slot: { date: "2027-01-04", start_time: "09:00", end_time: "09:30" }, status: "pending_admin_review",
  });
  return { patient, patientUser, doctor, doctorUser, adminUser, appt };
}

const approve = (w) => request(app).patch(`/api/appointments/admin/${w.appt._id}/review`).set("Authorization", auth(w.adminUser._id)).send({ decision: "approve" });

describe("in-app notifications", () => {
  test("approving a case notifies the doctor with a link to the case", async () => {
    const w = await world();
    await approve(w);
    await flush();
    const res = await request(app).get("/api/notifications").set("Authorization", auth(w.doctorUser._id));
    expect(res.status).toBe(200);
    expect(res.body.unread_count).toBe(1);
    expect(res.body.results[0]).toMatchObject({ type: "new_case", title: "New case: Sara Ahmed", link: `/cases/${w.appt._id}`, read: false });
  });

  test("emergency-flagged reports become an urgent notification", async () => {
    const w = await world({ emergency: true });
    await approve(w);
    await flush();
    const n = await Notification.findOne({ user_id: w.doctorUser._id });
    expect(n.type).toBe("emergency_case");
    expect(n.title).toBe("Urgent case: Sara Ahmed");
    expect(n.message).toMatch(/Chest pain/);
  });

  test("patient message and test upload notify the doctor; doctor messages don't", async () => {
    const w = await world();
    await approve(w);
    await flush();
    await Notification.deleteMany({});

    await request(app).post(`/api/appointments/${w.appt._id}/queries`).set("Authorization", auth(w.patientUser._id)).send({ message: "Hello" });
    await request(app).post(`/api/appointments/${w.appt._id}/queries`).set("Authorization", auth(w.doctorUser._id)).send({ message: "Hi" });
    await flush();
    const types = (await Notification.find({ user_id: w.doctorUser._id })).map((n) => n.type);
    expect(types).toEqual(["patient_message"]);
  });

  test("in-app notifications ignore email settings", async () => {
    const w = await world();
    await request(app).patch("/api/auth/me/notifications").set("Authorization", auth(w.doctorUser._id))
      .send({ email: { appointment_updates: false } });
    await approve(w);
    await flush();
    expect(await Notification.countDocuments({ user_id: w.doctorUser._id })).toBe(1);
  });

  test("mark one read, mark all read; users only touch their own", async () => {
    const w = await world();
    const other = await world();
    const mine = await Notification.create([
      { user_id: w.doctorUser._id, type: "new_case", title: "A" },
      { user_id: w.doctorUser._id, type: "new_case", title: "B" },
    ]);
    const theirs = await Notification.create({ user_id: other.doctorUser._id, type: "new_case", title: "C" });

    const one = await request(app).patch(`/api/notifications/${mine[0]._id}/read`).set("Authorization", auth(w.doctorUser._id));
    expect(one.status).toBe(200);
    expect(one.body.read).toBe(true);

    const notMine = await request(app).patch(`/api/notifications/${theirs._id}/read`).set("Authorization", auth(w.doctorUser._id));
    expect(notMine.status).toBe(404);

    const all = await request(app).patch("/api/notifications/read-all").set("Authorization", auth(w.doctorUser._id));
    expect(all.body.updated).toBe(1);
    const list = await request(app).get("/api/notifications").set("Authorization", auth(w.doctorUser._id));
    expect(list.body.unread_count).toBe(0);
    expect(list.body.results).toHaveLength(2);
    expect((await Notification.findById(theirs._id)).read).toBe(false);
  });

  test("bad id → 400; login required", async () => {
    const w = await world();
    expect((await request(app).patch("/api/notifications/nope/read").set("Authorization", auth(w.doctorUser._id))).status).toBe(400);
    expect((await request(app).get("/api/notifications")).status).toBe(401);
  });
});

describe("admin reports analytics", () => {
  async function seedReports() {
    const p1 = await Patient.create({ name: "P1", contact: { email: "r1@t.com" } });
    const p2 = await Patient.create({ name: "P2", contact: { email: "r2@t.com" } });
    const mk = (patient, extra = {}) => Report.create({ session_id: new mongoose.Types.ObjectId(), patient_id: patient._id, ...extra });
    await mk(p1, { interpreted_diagnoses: [{ disease: "Migraine", plausibility: "possible" }, { disease: "Tension headache", plausibility: "likely" }], patient_summary: { referralSpecialty: "Neurologist" } });
    await mk(p1, { interpreted_diagnoses: [{ disease: "tension headache", plausibility: "likely" }], patient_summary: { referralSpecialty: "Neurologist" }, appointment_id: new mongoose.Types.ObjectId() });
    await mk(p2, { disease_ranking: [{ disease: "Influenza", confidence: 0.7 }], patient_summary: { referralSpecialty: "General Physician" }, emergency_warning: { triggered: true } });
    await mk(p2, { is_deleted: true, disease_ranking: [{ disease: "Hidden", confidence: 1 }] });
    await mk(p2, { generated_at: new Date(Date.now() - 200 * 24 * 3600 * 1000), disease_ranking: [{ disease: "Old case", confidence: 1 }] });
    await Session.create([
      { patient_id: p1._id, status: "completed" },
      { patient_id: p2._id, status: "abandoned" },
    ]);
  }

  test("KPIs, top conditions (likely first, case-insensitive), referrals, monthly trend", async () => {
    await seedReports();
    const { reportsAnalytics } = require("../services/adminStatsService");
    const r = await reportsAnalytics({ range: "90d" });

    expect(r.consultations).toEqual({ total: 3, patients: 2, shared_with_doctor: 1, shared_percent: 33.3, emergency_flags: 1, emergency_percent: 33.3 });
    expect(r.top_conditions[0]).toEqual({ name: "Tension headache", count: 2 });
    expect(r.top_conditions.map((c) => c.name)).toContain("Influenza");
    expect(r.top_conditions.map((c) => c.name)).not.toContain("Hidden");
    expect(r.top_specialties[0]).toEqual({ name: "Neurologist", count: 2 });
    expect(r.interviews).toMatchObject({ completed: 1, abandoned: 1 });
    expect(r.monthly).toHaveLength(12);
    expect(r.monthly[11].consultations).toBe(3);
    expect(r.monthly[11].new_patients).toBe(2);
  });

  test("range=all includes older reports; bad range → 400", async () => {
    await seedReports();
    const { reportsAnalytics } = require("../services/adminStatsService");
    expect((await reportsAnalytics({ range: "all" })).consultations.total).toBe(4);
    await expect(reportsAnalytics({ range: "7y" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("API is admin only", async () => {
    const w = await world();
    expect((await request(app).get("/api/stats/reports").set("Authorization", auth(w.doctorUser._id))).status).toBe(403);
    const ok = await request(app).get("/api/stats/reports?range=30d").set("Authorization", auth(w.adminUser._id));
    expect(ok.status).toBe(200);
    expect(ok.body.range).toBe("30d");
  });
});
