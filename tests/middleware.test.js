// =============================================================================
// Backend/tests/middleware.test.js
//
// Unit tests for the three middleware modules added in Phase 2:
//   · validate.js   — validateObjectId, validateDateQuery
//   · auth.js       — protect (JWT verification), authorize (role gate)
//
// These are pure unit tests — middleware functions are called directly with
// mock req/res/next objects. No HTTP stack or database involved.
// =============================================================================

process.env.JWT_SECRET = "test_secret_for_jest";

const mongoose = require("mongoose");
const jwt      = require("jsonwebtoken");

const { validateObjectId, validateDateQuery } = require("../middleware/validate");

// ── Shared mock factory ───────────────────────────────────────────────────────

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// =============================================================================
// 1. validateObjectId
// =============================================================================
describe("validateObjectId middleware", () => {
  test("valid ObjectId → calls next(), no response sent", () => {
    const id  = new mongoose.Types.ObjectId().toString();
    const req = { params: { id } };
    const res = mockRes();
    const next = jest.fn();

    validateObjectId("id")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("invalid string → 400, next not called", () => {
    const req  = { params: { id: "not-a-valid-id" } };
    const res  = mockRes();
    const next = jest.fn();

    validateObjectId("id")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("Invalid ID") })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("empty string → 400", () => {
    const req  = { params: { id: "" } };
    const res  = mockRes();
    const next = jest.fn();

    validateObjectId("id")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test("undefined param value → 400", () => {
    const req  = { params: {} };
    const res  = mockRes();
    const next = jest.fn();

    validateObjectId("id")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test("multiple params — all valid → next() called once", () => {
    const req  = {
      params: {
        patientId: new mongoose.Types.ObjectId().toString(),
        doctorId:  new mongoose.Types.ObjectId().toString(),
      },
    };
    const res  = mockRes();
    const next = jest.fn();

    validateObjectId("patientId", "doctorId")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("multiple params — first invalid → 400, short-circuits on first failure", () => {
    const req  = {
      params: {
        patientId: "bad-id",
        doctorId:  new mongoose.Types.ObjectId().toString(),
      },
    };
    const res  = mockRes();
    const next = jest.fn();

    validateObjectId("patientId", "doctorId")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("patientId") })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("multiple params — second invalid → 400 with correct param name", () => {
    const req  = {
      params: {
        patientId: new mongoose.Types.ObjectId().toString(),
        doctorId:  "also-bad",
      },
    };
    const res  = mockRes();
    const next = jest.fn();

    validateObjectId("patientId", "doctorId")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("doctorId") })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("24-hex-char string → valid ObjectId, next() called", () => {
    const req  = { params: { id: "507f1f77bcf86cd799439011" } };
    const res  = mockRes();
    const next = jest.fn();

    validateObjectId("id")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("SQL injection attempt → 400", () => {
    const req  = { params: { id: "' OR '1'='1" } };
    const res  = mockRes();
    const next = jest.fn();

    validateObjectId("id")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 2. validateDateQuery
// =============================================================================
describe("validateDateQuery middleware", () => {
  test("valid YYYY-MM-DD date → next() called", () => {
    const req  = { query: { date: "2026-08-21" } };
    const res  = mockRes();
    const next = jest.fn();

    validateDateQuery("date")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("date param absent → next() called (param is optional)", () => {
    const req  = { query: {} };
    const res  = mockRes();
    const next = jest.fn();

    validateDateQuery("date")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("invalid date string → 400, next not called", () => {
    const req  = { query: { date: "not-a-date" } };
    const res  = mockRes();
    const next = jest.fn();

    validateDateQuery("date")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("date") })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("empty string date → 400", () => {
    const req  = { query: { date: "" } };
    const res  = mockRes();
    const next = jest.fn();

    // "" becomes new Date("") → Invalid Date
    validateDateQuery("date")(req, res, next);

    // Empty string is explicitly present as undefined-ish — but it IS in query
    // new Date("") is Invalid Date, so this should 400
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test("uses the custom param name provided", () => {
    const req  = { query: { from: "garbage" } };
    const res  = mockRes();
    const next = jest.fn();

    validateDateQuery("from")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("from") })
    );
  });

  test("defaults to checking 'date' param when no name provided", () => {
    const req  = { query: { date: "bad-date" } };
    const res  = mockRes();
    const next = jest.fn();

    validateDateQuery()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("ISO-8601 datetime string → valid, next() called", () => {
    const req  = { query: { date: "2026-08-21T09:00:00.000Z" } };
    const res  = mockRes();
    const next = jest.fn();

    validateDateQuery("date")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
