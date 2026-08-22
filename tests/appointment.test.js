// =============================================================================
// Backend/tests/appointment.test.js
//
// Integration tests for the three feature areas:
//  1. Query thread append + unread flag toggling
//  2. Self-only reports never appearing in the appointments list
//  3. Cancel flow: terminates access while preserving history
// =============================================================================

// Must set JWT_SECRET before requiring app.js (which loads auth middleware)
process.env.JWT_SECRET = "test_secret_for_jest";

const request = require("supertest");
const jwt     = require("jsonwebtoken");
const mongoose = require("mongoose");

const app = require("../app");
const { connect, closeDatabase, clearDatabase } = require("./mongoTestHelper");

const User                    = require("../models/User");
const Patient                 = require("../models/Patient");
const DoctorProfile           = require("../models/DoctorProfile");
const DoctorAvailability      = require("../models/DoctorAvailability");
const PatientDoctorAssignment = require("../models/PatientDoctorAssignment");
const Appointment             = require("../models/Appointment");
const Report                  = require("../models/Report");

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1d" });

// Create a minimal confirmed appointment with supporting fixtures.
// Returns all created documents so tests can reference them.
async function buildConfirmedScenario() {
  // Patient user + profile
  const patientUser = await User.create({
    name: "Test Patient",
    email: "patient@test.com",
    password: "hashedPwd!",  // pre-hashed placeholder; we never test login here
    role: "patient",
  });
  const patient = await Patient.create({
    name: "Test Patient",
    dob: new Date("1990-01-01"),
    gender: "male",
    contact: { email: "patient@test.com" },
  });
  await User.updateOne({ _id: patientUser._id }, { $set: { patient_id: patient._id } });

  // Doctor user + profile
  const doctorUser = await User.create({
    name: "Dr Test",
    email: "doctor@test.com",
    password: "hashedPwd!",
    role: "doctor",
  });
  const doctorProfile = await DoctorProfile.create({
    user_id:     doctorUser._id,
    pmdc_number: "PMDC-TEST-001",
    specialty:   "Cardiology",
    gender:      "male",
    location:    { city: "Lahore" },
    contact:     { phone: "0300-1111111", email: "doctor@test.com" },
    status:      "verified",
  });
  await DoctorAvailability.create({ doctor_id: doctorProfile._id });

  // Active assignment
  const assignment = await PatientDoctorAssignment.create({
    patient_id: patient._id,
    doctor_id:  doctorProfile._id,
    status:     "active",
  });

  // Confirmed appointment
  const appointment = await Appointment.create({
    patient_id:     patient._id,
    doctor_id:      doctorProfile._id,
    assignment_id:  assignment._id,
    requested_slot: { date: new Date("2026-09-01"), start_time: "09:00", end_time: "09:30" },
    status:         "confirmed",
  });

  // Reload patient user so patient_id is populated
  const patientUserFull = await User.findById(patientUser._id);

  return { patientUser: patientUserFull, patient, doctorUser, doctorProfile, assignment, appointment };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
beforeEach(async () => await clearDatabase());

// =============================================================================
// 1. Query thread + unread flag toggling
// =============================================================================
describe("Query thread", () => {
  test("patient append sets has_unread_patient_query to true", async () => {
    const { patientUser, appointment } = await buildConfirmedScenario();
    const token = makeToken(patientUser._id);

    const res = await request(app)
      .post(`/api/appointments/${appointment._id}/queries`)
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "When should I take the medication?" });

    expect(res.status).toBe(201);
    expect(res.body.query.sender).toBe("patient");
    expect(res.body.has_unread_patient_query).toBe(true);

    // Verify DB state
    const updated = await Appointment.findById(appointment._id);
    expect(updated.has_unread_patient_query).toBe(true);
    expect(updated.queries).toHaveLength(1);
  });

  test("doctor append does NOT set has_unread_patient_query", async () => {
    const { doctorUser, appointment } = await buildConfirmedScenario();
    const token = makeToken(doctorUser._id);

    const res = await request(app)
      .post(`/api/appointments/${appointment._id}/queries`)
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "Please bring your latest test results." });

    expect(res.status).toBe(201);
    expect(res.body.query.sender).toBe("doctor");
    expect(res.body.has_unread_patient_query).toBe(false);

    const updated = await Appointment.findById(appointment._id);
    expect(updated.has_unread_patient_query).toBe(false);
  });

  test("doctor markQueriesRead clears has_unread_patient_query and marks messages read", async () => {
    const { patientUser, doctorUser, appointment } = await buildConfirmedScenario();

    // Patient adds a query first
    await request(app)
      .post(`/api/appointments/${appointment._id}/queries`)
      .set("Authorization", `Bearer ${makeToken(patientUser._id)}`)
      .send({ message: "Is this medication safe?" });

    // Confirm it's unread
    let appt = await Appointment.findById(appointment._id);
    expect(appt.has_unread_patient_query).toBe(true);

    // Doctor marks read
    const readRes = await request(app)
      .patch(`/api/appointments/${appointment._id}/queries/read`)
      .set("Authorization", `Bearer ${makeToken(doctorUser._id)}`);

    expect(readRes.status).toBe(200);

    // Verify DB state
    appt = await Appointment.findById(appointment._id);
    expect(appt.has_unread_patient_query).toBe(false);
    expect(appt.queries[0].read).toBe(true);
  });

  test("patient cannot post to another patient's appointment", async () => {
    const { appointment } = await buildConfirmedScenario();

    // Second unrelated patient
    const otherUser = await User.create({
      name: "Other Patient", email: "other@test.com", password: "password!", role: "patient",
    });
    const otherPatient = await Patient.create({
      name: "Other Patient", dob: new Date("1995-01-01"), gender: "female",
      contact: { email: "other@test.com" },
    });
    await User.updateOne({ _id: otherUser._id }, { $set: { patient_id: otherPatient._id } });

    const res = await request(app)
      .post(`/api/appointments/${appointment._id}/queries`)
      .set("Authorization", `Bearer ${makeToken(otherUser._id)}`)
      .send({ message: "Trying to access someone else's appointment" });

    expect(res.status).toBe(403);
  });
});

// =============================================================================
// 2. Self-only reports never appear in appointments list
// =============================================================================
describe("Self-only report isolation", () => {
  test("self-only report (appointment_id=null) does not appear in /appointments", async () => {
    const { patientUser, patient, doctorProfile, assignment } = await buildConfirmedScenario();

    // Self-only report — no appointment_id (patient ran interview, no doctor booked)
    const selfOnlyReport = await Report.create({
      session_id:   new mongoose.Types.ObjectId(),
      patient_id:   patient._id,
      generated_at: new Date(),
      appointment_id: null,  // self-only — the defining characteristic
    });

    // A separate appointment-linked report and appointment
    const linkedReport = await Report.create({
      session_id:     new mongoose.Types.ObjectId(),
      patient_id:     patient._id,
      generated_at:   new Date(),
      appointment_id: null,  // will be set below after appointment creation
    });
    const linkedAppointment = await Appointment.create({
      patient_id:     patient._id,
      doctor_id:      doctorProfile._id,
      assignment_id:  assignment._id,
      requested_slot: { date: new Date("2026-09-10"), start_time: "10:00", end_time: "10:30" },
      status:         "confirmed",
      report_id:      linkedReport._id,
    });
    await Report.updateOne({ _id: linkedReport._id }, { $set: { appointment_id: linkedAppointment._id } });

    const token = makeToken(patientUser._id);

    // /reports endpoint should return BOTH reports
    const reportsRes = await request(app)
      .get(`/api/patients/${patient._id}/reports`)
      .set("Authorization", `Bearer ${token}`);
    expect(reportsRes.status).toBe(200);
    expect(reportsRes.body).toHaveLength(2);

    // /appointments returns Appointment documents only — not Report documents.
    // buildConfirmedScenario creates 1 appointment; this test adds 1 more = 2 total.
    const apptRes = await request(app)
      .get(`/api/patients/${patient._id}/appointments`)
      .set("Authorization", `Bearer ${token}`);
    expect(apptRes.status).toBe(200);
    expect(apptRes.body).toHaveLength(2);

    // The self-only report must NOT be referenced as a report_id in any appointment.
    // (The linked report IS referenced; the self-only one is not — it has no appointment.)
    const appointmentReportIds = apptRes.body.map(a => a.report_id?.toString()).filter(Boolean);
    expect(appointmentReportIds).not.toContain(selfOnlyReport._id.toString());
    expect(appointmentReportIds).toContain(linkedReport._id.toString());
  });

  test("GET /api/patients/:id/reports returns self-only reports (appointment_id=null)", async () => {
    const { patientUser, patient } = await buildConfirmedScenario();

    await Report.create({
      session_id:     new mongoose.Types.ObjectId(),
      patient_id:     patient._id,
      appointment_id: null,
    });

    const res = await request(app)
      .get(`/api/patients/${patient._id}/reports`)
      .set("Authorization", `Bearer ${makeToken(patientUser._id)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].appointment_id).toBeNull();
  });
});

// =============================================================================
// 3. Cancel flow: terminates access while preserving history
// =============================================================================
describe("Cancel appointment", () => {
  test("patient can cancel a confirmed appointment", async () => {
    const { patientUser, appointment } = await buildConfirmedScenario();

    const res = await request(app)
      .post(`/api/appointments/${appointment._id}/cancel`)
      .set("Authorization", `Bearer ${makeToken(patientUser._id)}`);

    expect(res.status).toBe(200);
    expect(res.body.appointment.status).toBe("cancelled");
  });

  test("cancelling terminates the PatientDoctorAssignment", async () => {
    const { patientUser, appointment, assignment } = await buildConfirmedScenario();

    await request(app)
      .post(`/api/appointments/${appointment._id}/cancel`)
      .set("Authorization", `Bearer ${makeToken(patientUser._id)}`);

    const updatedAssignment = await PatientDoctorAssignment.findById(assignment._id);
    expect(updatedAssignment.status).toBe("terminated");
  });

  test("appointment record is preserved after cancellation (history intact)", async () => {
    const { patientUser, appointment } = await buildConfirmedScenario();

    await request(app)
      .post(`/api/appointments/${appointment._id}/cancel`)
      .set("Authorization", `Bearer ${makeToken(patientUser._id)}`);

    // The Appointment document must still exist in the DB — never deleted
    const stillExists = await Appointment.findById(appointment._id);
    expect(stillExists).not.toBeNull();
    expect(stillExists.status).toBe("cancelled");
  });

  test("doctor loses access to patient data after cancellation", async () => {
    const { patientUser, doctorUser, patient, appointment } = await buildConfirmedScenario();

    // Doctor can add query before cancellation
    const preCancel = await request(app)
      .post(`/api/appointments/${appointment._id}/queries`)
      .set("Authorization", `Bearer ${makeToken(doctorUser._id)}`)
      .send({ message: "Pre-cancel message." });
    expect(preCancel.status).toBe(201);

    // Patient cancels
    await request(app)
      .post(`/api/appointments/${appointment._id}/cancel`)
      .set("Authorization", `Bearer ${makeToken(patientUser._id)}`);

    // Doctor no longer has active assignment — canAccessPatient returns false
    // This is exercised by GET /api/patients/:id (which calls canAccessPatient)
    const postCancel = await request(app)
      .get(`/api/patients/${patient._id}`)
      .set("Authorization", `Bearer ${makeToken(doctorUser._id)}`);
    expect(postCancel.status).toBe(403);
  });

  test("doctor cannot cancel a patient's appointment", async () => {
    const { doctorUser, appointment } = await buildConfirmedScenario();

    const res = await request(app)
      .post(`/api/appointments/${appointment._id}/cancel`)
      .set("Authorization", `Bearer ${makeToken(doctorUser._id)}`);

    // authorize("patient") rejects the doctor
    expect(res.status).toBe(403);
  });

  test("already-cancelled appointment cannot be cancelled again", async () => {
    const { patientUser, appointment } = await buildConfirmedScenario();

    await request(app)
      .post(`/api/appointments/${appointment._id}/cancel`)
      .set("Authorization", `Bearer ${makeToken(patientUser._id)}`);

    const res = await request(app)
      .post(`/api/appointments/${appointment._id}/cancel`)
      .set("Authorization", `Bearer ${makeToken(patientUser._id)}`);

    expect(res.status).toBe(409);
  });
});

// =============================================================================
// 4. Admin-approval gate — regression for the "doctor bypasses admin review" bug
//
// Root cause: getDoctorAppointments returned pending_admin_review appointments to
// the doctor (no assignment-status check), and getAppointmentById did the same.
// Fix: both endpoints now exclude pending_admin_review entirely for doctors.
// This test pins the correct behaviour so the bug cannot regress silently.
// =============================================================================

// Helper: build a first-time booking scenario — assignment is "pending",
// appointment is "pending_admin_review". No admin approval yet.
async function buildPendingScenario() {
  const patientUser = await User.create({
    name: "Pending Patient", email: "pending@test.com", password: "pwd1234!", role: "patient",
  });
  const patient = await Patient.create({
    name: "Pending Patient", dob: new Date("1992-05-10"), gender: "female",
    contact: { email: "pending@test.com" },
  });
  await User.updateOne({ _id: patientUser._id }, { $set: { patient_id: patient._id } });

  const doctorUser = await User.create({
    name: "Dr Gate", email: "drgate@test.com", password: "pwd1234!", role: "doctor",
  });
  const doctorProfile = await DoctorProfile.create({
    user_id:     doctorUser._id,
    pmdc_number: "PMDC-GATE-001",
    specialty:   "Neurology",
    gender:      "male",
    location:    { city: "Karachi" },
    contact:     { phone: "0300-2222222", email: "drgate@test.com" },
    status:      "verified",
  });

  const adminUser = await User.create({
    name: "Admin", email: "admin@test.com", password: "pwd1234!", role: "admin",
  });

  // Assignment in pending state — admin has NOT approved yet
  const assignment = await PatientDoctorAssignment.create({
    patient_id: patient._id,
    doctor_id:  doctorProfile._id,
    status:     "pending",
  });

  // Appointment awaiting admin review
  const appointment = await Appointment.create({
    patient_id:     patient._id,
    doctor_id:      doctorProfile._id,
    assignment_id:  assignment._id,
    requested_slot: { date: new Date("2026-09-15"), start_time: "10:00", end_time: "10:30" },
    status:         "pending_admin_review",
  });

  const patientUserFull = await User.findById(patientUser._id);
  return { patientUser: patientUserFull, patient, doctorUser, doctorProfile, adminUser, assignment, appointment };
}

describe("Admin-approval gate (regression: doctor must not see patient before approval)", () => {
  test("doctor cannot see pending_admin_review appointment in GET /api/appointments/doctor", async () => {
    const { doctorUser, appointment } = await buildPendingScenario();
    const token = makeToken(doctorUser._id);

    const res = await request(app)
      .get("/api/appointments/doctor")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = res.body.map(a => a._id.toString());
    expect(ids).not.toContain(appointment._id.toString());
  });

  test("doctor cannot query pending_admin_review status directly", async () => {
    const { doctorUser } = await buildPendingScenario();
    const token = makeToken(doctorUser._id);

    const res = await request(app)
      .get("/api/appointments/doctor?status=pending_admin_review")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test("doctor gets 403 on GET /api/appointments/:id while pending_admin_review", async () => {
    const { doctorUser, appointment } = await buildPendingScenario();
    const token = makeToken(doctorUser._id);

    const res = await request(app)
      .get(`/api/appointments/${appointment._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test("doctor gets 403 on GET /api/patients/:id while assignment is pending", async () => {
    const { doctorUser, patient } = await buildPendingScenario();

    const res = await request(app)
      .get(`/api/patients/${patient._id}`)
      .set("Authorization", `Bearer ${makeToken(doctorUser._id)}`);

    expect(res.status).toBe(403);
  });

  test("after admin approves, doctor CAN see the appointment and patient data", async () => {
    const { doctorUser, adminUser, patient, appointment } = await buildPendingScenario();

    // Admin approves
    const reviewRes = await request(app)
      .patch(`/api/appointments/admin/${appointment._id}/review`)
      .set("Authorization", `Bearer ${makeToken(adminUser._id)}`)
      .send({ decision: "approve" });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.appointment.status).toBe("confirmed");

    // Doctor now sees the appointment in their list
    const listRes = await request(app)
      .get("/api/appointments/doctor")
      .set("Authorization", `Bearer ${makeToken(doctorUser._id)}`);
    expect(listRes.status).toBe(200);
    const ids = listRes.body.map(a => a._id.toString());
    expect(ids).toContain(appointment._id.toString());

    // Doctor can fetch the appointment detail
    const detailRes = await request(app)
      .get(`/api/appointments/${appointment._id}`)
      .set("Authorization", `Bearer ${makeToken(doctorUser._id)}`);
    expect(detailRes.status).toBe(200);

    // Doctor can access the patient
    const patientRes = await request(app)
      .get(`/api/patients/${patient._id}`)
      .set("Authorization", `Bearer ${makeToken(doctorUser._id)}`);
    expect(patientRes.status).toBe(200);
  });

  test("after admin rejects, doctor STILL cannot access patient data", async () => {
    const { doctorUser, adminUser, patient, appointment } = await buildPendingScenario();

    // Admin rejects
    const reviewRes = await request(app)
      .patch(`/api/appointments/admin/${appointment._id}/review`)
      .set("Authorization", `Bearer ${makeToken(adminUser._id)}`)
      .send({ decision: "reject", rejection_reason: "Slot conflict with another patient" });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.appointment.status).toBe("rejected");

    // Doctor still cannot see patient
    const patientRes = await request(app)
      .get(`/api/patients/${patient._id}`)
      .set("Authorization", `Bearer ${makeToken(doctorUser._id)}`);
    expect(patientRes.status).toBe(403);

    // Appointment is visible nowhere (still pending_admin_review path was rejected)
    const listRes = await request(app)
      .get("/api/appointments/doctor")
      .set("Authorization", `Bearer ${makeToken(doctorUser._id)}`);
    expect(listRes.status).toBe(200);
    // rejected appointments ARE returned (not pending_admin_review) so this would be included
    // But access to the patient is still blocked since assignment never became active
    const rejectedAppt = listRes.body.find(a => a._id.toString() === appointment._id.toString());
    expect(rejectedAppt).toBeDefined(); // rejected appointment IS visible in list (status≠pending_admin_review)
    expect(rejectedAppt.status).toBe("rejected");
    // BUT patient profile is still inaccessible
    const patientRes2 = await request(app)
      .get(`/api/patients/${patient._id}`)
      .set("Authorization", `Bearer ${makeToken(doctorUser._id)}`);
    expect(patientRes2.status).toBe(403);
  });
});

// =============================================================================
// 5. Booking business rules
//    · Slot outside declared availability → 400
//    · Double-booking same slot → 409
//    · Admin decision idempotency (second PATCH on already-decided appt) → 409
//    · Cancel a completed appointment → 409
// =============================================================================

// Monday 2026-09-07 is inside weekly_schedule day_of_week:1 09:00–17:00
const VALID_SLOT   = { date: "2026-09-07", start_time: "09:00", end_time: "09:30" };
const OUTSIDE_SLOT = { date: "2026-09-07", start_time: "21:00", end_time: "21:30" };

async function buildBookingFixture() {
  const pu = await User.create({ name: "Book Patient", email: "bookpat@test.com", password: "pwd1234!", role: "patient" });
  const pt = await Patient.create({ name: "Book Patient", dob: new Date("1992-06-15"), gender: "female", contact: { email: "bookpat@test.com" } });
  await User.updateOne({ _id: pu._id }, { $set: { patient_id: pt._id } });

  const du = await User.create({ name: "Dr Avail", email: "dravail@test.com", password: "pwd1234!", role: "doctor" });
  const dp = await DoctorProfile.create({
    user_id:     du._id,
    pmdc_number: "PMDC-AV-001",
    specialty:   "Dermatology",
    gender:      "male",
    location:    { city: "Karachi" },
    contact:     { phone: "0300-9999999", email: "dravail@test.com" },
    status:      "verified",
  });

  // Monday 09:00–17:00 recurring
  await DoctorAvailability.findOneAndUpdate(
    { doctor_id: dp._id },
    { doctor_id: dp._id, weekly_schedule: [{ day_of_week: 1, start_time: "09:00", end_time: "17:00" }] },
    { upsert: true, new: true }
  );

  const report = await Report.create({ session_id: new mongoose.Types.ObjectId(), patient_id: pt._id });
  const adminUser = await User.create({ name: "Admin", email: "admin-bk@test.com", password: "pwd1234!", role: "admin" });

  return { patientUser: await User.findById(pu._id), patient: pt, doctorProfile: dp, report, adminUser };
}

describe("Booking business rules", () => {
  test("slot outside doctor availability → 400", async () => {
    const { patientUser, doctorProfile, report } = await buildBookingFixture();
    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${makeToken(patientUser._id)}`)
      .send({ doctor_profile_id: doctorProfile._id, slot: OUTSIDE_SLOT, report_id: report._id });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/outside.*availability/i);
  });

  test("double-booking same slot → 409", async () => {
    const { patientUser, patient, doctorProfile, report } = await buildBookingFixture();

    // A different patient already holds the slot
    const pu2 = await User.create({ name: "Other Patient", email: "otherpat@test.com", password: "pwd1234!", role: "patient" });
    const pt2 = await Patient.create({ name: "Other Patient", dob: new Date("1988-01-01"), gender: "male", contact: { email: "otherpat@test.com" } });
    await User.updateOne({ _id: pu2._id }, { $set: { patient_id: pt2._id } });
    const asgn = await PatientDoctorAssignment.create({ patient_id: pt2._id, doctor_id: doctorProfile._id, status: "active" });
    await Appointment.create({
      patient_id:     pt2._id,
      doctor_id:      doctorProfile._id,
      assignment_id:  asgn._id,
      requested_slot: { date: new Date("2026-09-07"), start_time: "09:00", end_time: "09:30" },
      status:         "confirmed",
    });

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${makeToken(patientUser._id)}`)
      .send({ doctor_profile_id: doctorProfile._id, slot: VALID_SLOT, report_id: report._id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already booked/i);
  });

  test("admin review idempotency — second PATCH on decided appointment → 409", async () => {
    const { patient, doctorProfile, adminUser } = await buildBookingFixture();
    const asgn = await PatientDoctorAssignment.create({ patient_id: patient._id, doctor_id: doctorProfile._id, status: "pending" });
    const appt = await Appointment.create({
      patient_id:     patient._id,
      doctor_id:      doctorProfile._id,
      assignment_id:  asgn._id,
      requested_slot: { date: new Date("2026-09-07"), start_time: "10:00", end_time: "10:30" },
      status:         "pending_admin_review",
    });

    const adminToken = makeToken(adminUser._id);
    const first = await request(app)
      .patch(`/api/appointments/admin/${appt._id}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "approve" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .patch(`/api/appointments/admin/${appt._id}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "approve" });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already/i);
  });

  test("cancel a completed appointment → 409", async () => {
    const { patientUser, patient, doctorProfile } = await buildBookingFixture();
    const asgn = await PatientDoctorAssignment.create({ patient_id: patient._id, doctor_id: doctorProfile._id, status: "active" });
    const appt = await Appointment.create({
      patient_id:     patient._id,
      doctor_id:      doctorProfile._id,
      assignment_id:  asgn._id,
      requested_slot: { date: new Date("2026-09-01"), start_time: "09:00", end_time: "09:30" },
      status:         "completed",
    });

    const res = await request(app)
      .post(`/api/appointments/${appt._id}/cancel`)
      .set("Authorization", `Bearer ${makeToken(patientUser._id)}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cannot cancel/i);
  });
});
