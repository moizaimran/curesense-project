// =============================================================================
// Backend/tests/payment.test.js — per-doctor fee + advance payment
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
const Report                  = require("../models/Report");
const Settings                = require("../models/Settings");
const { expireUnpaidAppointments, _internal } = require("../services/paymentService");

beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());
afterEach(async () => await clearDatabase());

const auth = (id) => `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" })}`;

// 2027-01-04 is a Monday
const SLOT  = { date: "2027-01-04", start_time: "09:00", end_time: "09:30" };
const SLOT2 = { date: "2027-01-04", start_time: "09:30", end_time: "10:00" };
const GOOD_CARD = { card_number: "4242 4242 4242 4242", exp_month: 12, exp_year: 2035, cvc: "123", name_on_card: "Sara Ahmed" };

let seq = 0;
async function fixture({ fee = 1500 } = {}) {
  seq += 1;
  const puid = new mongoose.Types.ObjectId();
  const patient = await Patient.create({ name: "Sara Ahmed", contact: { email: `p${seq}@t.com` } });
  const patientUser = await User.create({ _id: puid, name: "Sara Ahmed", email: `p${seq}@t.com`, role: "patient", patient_id: patient._id, provider_uid: puid.toString() });

  const duid = new mongoose.Types.ObjectId();
  const doctorUser = await User.create({ _id: duid, name: "Dr Fee", email: `d${seq}@t.com`, role: "doctor", provider_uid: duid.toString() });
  const doctor = await DoctorProfile.create({
    user_id: duid, pmdc_number: `PAY-${seq}`, name_as_per_cnic: "Dr Fee", father_name_as_per_cnic: "F",
    specialty: "Cardiology", gender: "male", location: { city: "Lahore" },
    contact: { phone: "0300", email: `d${seq}@t.com` }, status: "verified", consultation_fee: fee,
  });
  await DoctorAvailability.create({ doctor_id: doctor._id, weekly_schedule: [{ day_of_week: 1, start_time: "09:00", end_time: "17:00" }] });

  const auid = new mongoose.Types.ObjectId();
  const adminUser = await User.create({ _id: auid, name: "Admin", email: `a${seq}@t.com`, role: "admin", provider_uid: auid.toString() });

  const report = await Report.create({ session_id: new mongoose.Types.ObjectId(), patient_id: patient._id });
  return { patient, patientUser, doctor, doctorUser, adminUser, report };
}

async function book(f, slot = SLOT, report = f.report) {
  return request(app).post("/api/appointments").set("Authorization", auth(f.patientUser._id))
    .send({ doctor_profile_id: f.doctor._id, slot, report_id: report._id });
}

const payWallet = (f, id, body) =>
  request(app).post(`/api/appointments/${id}/payment/wallet`).set("Authorization", auth(f.patientUser._id)).send(body);
const payCard   = (f, id, card = GOOD_CARD) =>
  request(app).post(`/api/appointments/${id}/payment/card`).set("Authorization", auth(f.patientUser._id)).send(card);
const review    = (f, id, body) =>
  request(app).patch(`/api/appointments/admin/${id}/review`).set("Authorization", auth(f.adminUser._id)).send(body);

// ── Fee ──────────────────────────────────────────────────────────────────────

describe("doctor fee", () => {
  test("doctor sets their own fee; invalid fees are refused", async () => {
    const f = await fixture({ fee: 0 });
    const ok = await request(app).patch("/api/doctors/me/profile").set("Authorization", auth(f.doctorUser._id)).send({ consultation_fee: 2500 });
    expect(ok.status).toBe(200);
    expect(ok.body.consultation_fee).toBe(2500);

    for (const bad of [-1, 12.5, "abc", 200000]) {
      const res = await request(app).patch("/api/doctors/me/profile").set("Authorization", auth(f.doctorUser._id)).send({ consultation_fee: bad });
      expect(res.status).toBe(400);
    }
  });

  test("fee is visible to patients in search, with max_fee filter and cheapest-first sort", async () => {
    const f = await fixture({ fee: 3000 });
    await DoctorProfile.create({
      user_id: new mongoose.Types.ObjectId(), pmdc_number: "CHEAP", name_as_per_cnic: "x", father_name_as_per_cnic: "y",
      specialty: "Cardiology", gender: "female", location: { city: "Lahore" },
      contact: { phone: "0", email: "cheap@t.com" }, status: "verified", consultation_fee: 800,
    });
    const all = await request(app).get("/api/doctors?sort=fee_low");
    expect(all.body.results.map((d) => d.consultation_fee)).toEqual([800, 3000]);

    const cheap = await request(app).get("/api/doctors?max_fee=1000");
    expect(cheap.body.results.map((d) => d.consultation_fee)).toEqual([800]);
    expect(f.doctor.consultation_fee).toBe(3000);
  });
});

// ── Booking ──────────────────────────────────────────────────────────────────

describe("booking with a fee", () => {
  test("creates an unpaid, pending-review appointment with the fee snapshot", async () => {
    const f = await fixture({ fee: 1500 });
    const res = await book(f);
    expect(res.status).toBe(201);
    expect(res.body.payment_required).toBe(true);
    expect(res.body.appointment.status).toBe("pending_admin_review");
    expect(res.body.appointment.payment).toMatchObject({ required: true, amount: 1500, currency: "PKR", status: "unpaid" });
    expect(new Date(res.body.appointment.payment.due_by) > new Date()).toBe(true);
  });

  test("free doctor → no payment step", async () => {
    const f = await fixture({ fee: 0 });
    const res = await book(f);
    expect(res.body.payment_required).toBe(false);
    expect(res.body.appointment.payment.status).toBe("not_required");
  });

  test("a paid repeat visit still goes to admin review (payment must be verified)", async () => {
    const f = await fixture({ fee: 1500 });
    await PatientDoctorAssignment.create({ patient_id: f.patient._id, doctor_id: f.doctor._id, status: "active" });
    const res = await book(f);
    expect(res.body.appointment.status).toBe("pending_admin_review");
    expect(res.body.requires_admin_review).toBe(true);
  });

  test("a free repeat visit is still confirmed immediately (unchanged)", async () => {
    const f = await fixture({ fee: 0 });
    await PatientDoctorAssignment.create({ patient_id: f.patient._id, doctor_id: f.doctor._id, status: "active" });
    const res = await book(f);
    expect(res.body.appointment.status).toBe("confirmed");
  });
});

// ── Card (sandbox) ───────────────────────────────────────────────────────────

describe("card payment (sandbox)", () => {
  test("test card succeeds; only brand + last 4 are stored", async () => {
    const f = await fixture();
    const { body } = await book(f);
    const res = await payCard(f, body.appointment._id);
    expect(res.status).toBe(200);
    expect(res.body.payment).toMatchObject({ status: "paid", method: "card", card_brand: "Visa", card_last4: "4242", gateway: "sandbox" });
    expect(res.body.payment.gateway_ref).toMatch(/^SBX-/);

    const raw = JSON.stringify(await Appointment.findById(body.appointment._id).lean());
    expect(raw).not.toContain("4242424242424242");
    expect(raw).not.toContain('"123"');
  });

  test("declined and insufficient-funds test cards → 402, booking stays unpaid", async () => {
    const f = await fixture();
    const { body } = await book(f);
    const declined = await payCard(f, body.appointment._id, { ...GOOD_CARD, card_number: "4000000000000002" });
    expect(declined.status).toBe(402);
    const nsf = await payCard(f, body.appointment._id, { ...GOOD_CARD, card_number: "4000000000009995" });
    expect(nsf.status).toBe(402);
    expect((await Appointment.findById(body.appointment._id)).payment.status).toBe("unpaid");
  });

  test("real (non-test) card numbers are refused in sandbox mode", async () => {
    const f = await fixture();
    const { body } = await book(f);
    const res = await payCard(f, body.appointment._id, { ...GOOD_CARD, card_number: "4111111111111111" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sandbox/i);
  });

  test.each([
    ["bad Luhn", { card_number: "4242424242424241" }],
    ["expired", { exp_month: 1, exp_year: 2020 }],
    ["bad month", { exp_month: 13 }],
    ["bad cvc", { cvc: "12" }],
    ["no name", { name_on_card: " " }],
  ])("validation: %s → 400", async (_label, patch) => {
    const f = await fixture();
    const { body } = await book(f);
    const res = await payCard(f, body.appointment._id, { ...GOOD_CARD, ...patch });
    expect(res.status).toBe(400);
  });

  test("cannot pay twice", async () => {
    const f = await fixture();
    const { body } = await book(f);
    await payCard(f, body.appointment._id);
    const again = await payCard(f, body.appointment._id);
    expect(again.status).toBe(409);
  });

  test("another patient cannot pay for this appointment", async () => {
    const f = await fixture();
    const other = await fixture();
    const { body } = await book(f);
    const res = await payCard(other, body.appointment._id);
    expect(res.status).toBe(403);
  });

  test("free appointments cannot be paid", async () => {
    const f = await fixture({ fee: 0 });
    const { body } = await book(f);
    expect((await payCard(f, body.appointment._id)).status).toBe(409);
  });

  test("luhn helper", () => {
    expect(_internal.luhnValid("4242424242424242")).toBe(true);
    expect(_internal.luhnValid("4242424242424241")).toBe(false);
  });
});

// ── Wallets ──────────────────────────────────────────────────────────────────

describe("EasyPaisa / JazzCash", () => {
  const WALLET = { method: "easypaisa", transaction_id: "ep12345678", payer_number: "0300 1234567" };
  const WALLET_SETTINGS = {
    easypaisaAccountTitle: "CureSense Pvt", easypaisaAccountNumber: "03111111111",
    jazzcashAccountTitle: "CureSense Pvt", jazzcashAccountNumber: "03222222222",
  };
  beforeEach(async () => { await Settings.create(WALLET_SETTINGS); });

  test("TID submission → submitted (normalised), awaiting admin verification", async () => {
    const f = await fixture();
    const { body } = await book(f);
    const res = await payWallet(f, body.appointment._id, WALLET);
    expect(res.status).toBe(200);
    expect(res.body.payment).toMatchObject({ status: "submitted", method: "easypaisa", transaction_id: "EP12345678", payer_number: "03001234567" });
  });

  test.each([
    ["unknown method", { method: "paypal" }],
    ["short TID", { transaction_id: "123" }],
    ["TID with symbols", { transaction_id: "AB-12345678" }],
    ["bad phone", { payer_number: "12345" }],
  ])("validation: %s → 400", async (_l, patch) => {
    const f = await fixture();
    const { body } = await book(f);
    expect((await payWallet(f, body.appointment._id, { ...WALLET, ...patch })).status).toBe(400);
  });

  test("a wallet the admin hasn't set up can't be used", async () => {
    await Settings.updateOne({}, { $set: { jazzcashAccountNumber: "" } });
    const f = await fixture();
    const { body } = await book(f);
    const res = await payWallet(f, body.appointment._id, { ...WALLET, method: "jazzcash" });
    expect(res.status).toBe(409);
  });

  test("the same transaction ID cannot pay for two appointments", async () => {
    const f = await fixture();
    const first = await book(f);
    await payWallet(f, first.body.appointment._id, WALLET);

    const report2 = await Report.create({ session_id: new mongoose.Types.ObjectId(), patient_id: f.patient._id });
    const second = await book(f, SLOT2, report2);
    const res = await payWallet(f, second.body.appointment._id, WALLET);
    expect(res.status).toBe(409);
  });

  test("admin rejects a TID → patient can pay again", async () => {
    const f = await fixture();
    const { body } = await book(f);
    const id = body.appointment._id;
    await payWallet(f, id, WALLET);

    const rej = await request(app).patch(`/api/appointments/admin/${id}/payment`).set("Authorization", auth(f.adminUser._id))
      .send({ decision: "reject", reason: "TID not found in EasyPaisa statement" });
    expect(rej.status).toBe(200);
    expect(rej.body.payment).toMatchObject({ status: "rejected", rejection_reason: "TID not found in EasyPaisa statement" });

    const retry = await payWallet(f, id, { ...WALLET, transaction_id: "EP99999999" });
    expect(retry.status).toBe(200);
    expect(retry.body.payment.status).toBe("submitted");
  });

  test("approving a submitted wallet payment verifies it", async () => {
    const f = await fixture();
    const { body } = await book(f);
    await payWallet(f, body.appointment._id, { method: "jazzcash", transaction_id: "JC12345678", payer_number: "03001234567" });
    const res = await review(f, body.appointment._id, { decision: "approve" });
    expect(res.status).toBe(200);
    expect((await Appointment.findById(body.appointment._id)).payment.status).toBe("verified");
  });

  test("checkout shows card + the admin's wallet accounts", async () => {
    const f = await fixture();
    const res = await request(app).get("/api/payments/accounts").set("Authorization", auth(f.patientUser._id));
    expect(res.status).toBe(200);
    expect(res.body.card).toEqual({ enabled: true, sandbox: true });
    expect(res.body.easypaisa).toEqual({ account_title: "CureSense Pvt", account_number: "03111111111" });
    expect(res.body.jazzcash).toEqual({ account_title: "CureSense Pvt", account_number: "03222222222" });
  });
});

describe("payment settings", () => {
  test("admin saves wallet accounts; unset wallets are hidden at checkout", async () => {
    const f = await fixture();
    const save = await request(app).patch("/api/auth/settings").set("Authorization", auth(f.adminUser._id))
      .send({ jazzcashAccountTitle: "CureSense", jazzcashAccountNumber: "03222222222" });
    expect(save.status).toBe(200);
    expect(save.body.jazzcashAccountNumber).toBe("03222222222");

    const res = await request(app).get("/api/payments/accounts").set("Authorization", auth(f.patientUser._id));
    expect(res.body.jazzcash).toEqual({ account_title: "CureSense", account_number: "03222222222" });
    expect(res.body.easypaisa).toBeNull();
  });
});

// ── Admin approval ───────────────────────────────────────────────────────────

describe("admin verifies payment while approving", () => {
  test("cannot approve before payment", async () => {
    const f = await fixture();
    const { body } = await book(f);
    const res = await review(f, body.appointment._id, { decision: "approve" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/payment/i);
  });

  test("approving a paid appointment marks the payment verified", async () => {
    const f = await fixture();
    const { body } = await book(f);
    await payCard(f, body.appointment._id);
    const res = await review(f, body.appointment._id, { decision: "approve" });
    expect(res.status).toBe(200);
    const saved = await Appointment.findById(body.appointment._id);
    expect(saved.status).toBe("confirmed");
    expect(saved.payment.status).toBe("verified");
    expect(String(saved.payment.verified_by)).toBe(String(f.adminUser._id));
  });

  test("rejecting a paid appointment → refund_due → admin marks refunded", async () => {
    const f = await fixture();
    const { body } = await book(f);
    const id = body.appointment._id;
    await payCard(f, id);
    await review(f, id, { decision: "reject", rejection_reason: "Doctor unavailable" });
    expect((await Appointment.findById(id)).payment.status).toBe("refund_due");

    const res = await request(app).patch(`/api/appointments/admin/${id}/payment`).set("Authorization", auth(f.adminUser._id)).send({ decision: "refunded" });
    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe("refunded");
  });

  test("patient cancels after paying → refund_due; cancels before paying → void", async () => {
    const f = await fixture();
    const paid = await book(f);
    await payCard(f, paid.body.appointment._id);
    await request(app).post(`/api/appointments/${paid.body.appointment._id}/cancel`).set("Authorization", auth(f.patientUser._id));
    expect((await Appointment.findById(paid.body.appointment._id)).payment.status).toBe("refund_due");

    const report2 = await Report.create({ session_id: new mongoose.Types.ObjectId(), patient_id: f.patient._id });
    const unpaid = await book(f, SLOT2, report2);
    await request(app).post(`/api/appointments/${unpaid.body.appointment._id}/cancel`).set("Authorization", auth(f.patientUser._id));
    expect((await Appointment.findById(unpaid.body.appointment._id)).payment.status).toBe("void");
  });

  test("admin list can filter by payment status", async () => {
    const f = await fixture();
    const a = await book(f);
    await payCard(f, a.body.appointment._id);
    const report2 = await Report.create({ session_id: new mongoose.Types.ObjectId(), patient_id: f.patient._id });
    await book(f, SLOT2, report2);

    const res = await request(app).get("/api/appointments/admin?payment_status=paid").set("Authorization", auth(f.adminUser._id));
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].payment.status).toBe("paid");
  });
});

// ── Payment window ───────────────────────────────────────────────────────────

describe("unpaid bookings expire", () => {
  test("after the window, the booking is cancelled, the slot and report are released", async () => {
    const f = await fixture();
    const { body } = await book(f);
    const id = body.appointment._id;
    await Appointment.updateOne({ _id: id }, { $set: { "payment.due_by": new Date(Date.now() - 60_000) } });

    // paying after the deadline is refused
    expect((await payCard(f, id)).status).toBe(410);

    const saved = await Appointment.findById(id);
    expect(saved.status).toBe("cancelled");
    expect(saved.payment.status).toBe("void");
    expect((await Report.findById(f.report._id)).appointment_id).toBeFalsy();

    // the same slot can be booked again
    const again = await book(f);
    expect(again.status).toBe(201);
  });

  test("paid bookings never expire", async () => {
    const f = await fixture();
    const { body } = await book(f);
    await payCard(f, body.appointment._id);
    await Appointment.updateOne({ _id: body.appointment._id }, { $set: { "payment.due_by": new Date(Date.now() - 60_000) } });
    expect(await expireUnpaidAppointments()).toBe(0);
    expect((await Appointment.findById(body.appointment._id)).status).toBe("pending_admin_review");
  });
});
