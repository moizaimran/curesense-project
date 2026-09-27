// =============================================================================
// Backend/routes/authRoutes.js
// =============================================================================
const express  = require("express");
const router   = express.Router();
const {
  register, verifyEmail, resendOTP,
  googleAuth,
  forgotPassword,
  createStaff, assignPatient,
  getMe, updateMe,
  listStaff, getSettings, updateSettings,
  registerPushToken,
} = require("../controllers/authController");
const { protect, authorize } = require("../middleware/auth");
const { authLimiter }        = require("../middleware/rateLimiter");

// ── Registration + email verification ────────────────────────────────────────
router.post("/register",     authLimiter, register);
router.post("/verify-email", authLimiter, verifyEmail);
router.post("/resend-otp",   authLimiter, resendOTP);

// ── Google OAuth ──────────────────────────────────────────────────────────────
// /login removed — clients use Firebase Client SDK to sign in and send ID tokens
router.post("/google", authLimiter, googleAuth);

// ── Forgot password ───────────────────────────────────────────────────────────
// Reset is handled end-to-end by Firebase; verify-reset-otp and reset-password removed
router.post("/forgot-password", authLimiter, forgotPassword);

// ── Current user — any authenticated role ─────────────────────────────────────
router.get("/me",           protect, getMe);
router.patch("/me",         protect, updateMe);
router.patch("/push-token", protect, registerPushToken);

// ── Admin-only ────────────────────────────────────────────────────────────────
router.post("/staff",     protect, authorize("admin"), createStaff);
router.get("/staff",      protect, authorize("admin"), listStaff);
router.post("/assign",    protect, authorize("admin"), assignPatient);
router.get("/settings",   protect, authorize("admin"), getSettings);
router.patch("/settings", protect, authorize("admin"), updateSettings);

module.exports = router;
