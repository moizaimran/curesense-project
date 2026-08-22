// =============================================================================
// Backend/routes/doctorRoutes.js
//
// IMPORTANT: static segments (/register, /me/*, /admin/*) MUST come before
// parameterised segments (/:id, /:id/availability) so Express matches them
// correctly — a route defined later with /:id would eat "me" or "admin" first.
// =============================================================================
const express = require("express");
const router  = express.Router();
const {
  register,
  searchDoctors,
  getMyProfile,
  updateMyProfile,
  getDoctorById,
  getDoctorAvailability,
  updateMyAvailability,
  adminListDoctors,
  adminVerifyDoctor,
  getDashboardSummary,
} = require("../controllers/doctorController");
const { protect, authorize }         = require("../middleware/auth");
const { authLimiter }                = require("../middleware/rateLimiter");
const { validateObjectId, validateDateQuery } = require("../middleware/validate");

// ── Public ────────────────────────────────────────────────────────────────────
// Doctor registration is rate-limited the same as patient login/register
router.post("/register", authLimiter, register);
router.get("/",          searchDoctors);

// ── Doctor-only (own profile / availability) — must come before /:id ─────────
router.get("/me/profile",        protect, authorize("doctor"), getMyProfile);
router.patch("/me/profile",      protect, authorize("doctor"), updateMyProfile);
router.patch("/me/availability", protect, authorize("doctor"), updateMyAvailability);

// ── Admin-only — must come before /:id ────────────────────────────────────────
router.get("/admin/all",          protect, authorize("admin"), adminListDoctors);
router.patch("/admin/:id/verify", protect, authorize("admin"), validateObjectId("id"), adminVerifyDoctor);

// ── Parameterised — must come last ────────────────────────────────────────────
router.get("/:id/availability",       protect,                              validateObjectId("id"), validateDateQuery("date"), getDoctorAvailability);
router.get("/:id/dashboard-summary",  protect, authorize("doctor", "admin"), validateObjectId("id"), getDashboardSummary);
router.get("/:id",                    protect,                              validateObjectId("id"), getDoctorById);

module.exports = router;
