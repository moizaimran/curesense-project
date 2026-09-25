// =============================================================================
// Backend/routes/authRoutes.js
// =============================================================================
const express  = require("express");
const router   = express.Router();
const { register, login, createStaff, assignPatient, getMe, updateMe, listStaff, getSettings, updateSettings, registerPushToken } = require("../controllers/authController");
const { protect, authorize } = require("../middleware/auth");
const { authLimiter }        = require("../middleware/rateLimiter");

// Rate-limited public endpoints — credential-stuffing starts here
router.post("/register", authLimiter, register);
router.post("/login",    authLimiter, login);

// Current user — any authenticated role
router.get("/me",           protect, getMe);
router.patch("/me",         protect, updateMe);
// Register Expo push token — called by mobile app after login
router.patch("/push-token", protect, registerPushToken);

// Admin-only — creates admin accounts only (doctors must self-register via /api/doctors/register)
router.post("/staff",    protect, authorize("admin"), createStaff);
router.get("/staff",     protect, authorize("admin"), listStaff);
router.post("/assign",   protect, authorize("admin"), assignPatient);
router.get("/settings",  protect, authorize("admin"), getSettings);
router.patch("/settings",protect, authorize("admin"), updateSettings);

module.exports = router;
