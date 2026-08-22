// =============================================================================
// Backend/routes/authRoutes.js
// =============================================================================
const express  = require("express");
const router   = express.Router();
const { register, login, createStaff, assignPatient, getMe, updateMe, listStaff, getSettings, updateSettings } = require("../controllers/authController");
const { protect, authorize } = require("../middleware/auth");
const { authLimiter }        = require("../middleware/rateLimiter");

// Rate-limited public endpoints — credential-stuffing starts here
router.post("/register", authLimiter, register);
router.post("/login",    authLimiter, login);

// Current user — any authenticated role
router.get("/me",        protect, getMe);
router.patch("/me",      protect, updateMe);

// Admin-only — protected, no rate limit (already behind auth)
router.post("/staff",    protect, authorize("admin"), createStaff);
router.get("/staff",     protect, authorize("admin"), listStaff);
router.post("/assign",   protect, authorize("admin"), assignPatient);
router.get("/settings",  protect, authorize("admin"), getSettings);
router.patch("/settings",protect, authorize("admin"), updateSettings);

module.exports = router;
