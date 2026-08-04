// =============================================================================
// Backend/routes/authRoutes.js
// =============================================================================
const express  = require("express");
const router   = express.Router();
const { register, login, createStaff, assignPatient, getMe } = require("../controllers/authController");
const { protect, authorize } = require("../middleware/auth");

router.post("/register", register);
router.post("/login",    login);
router.post("/staff",    protect, authorize("admin"), createStaff);
router.post("/assign",   protect, authorize("admin"), assignPatient);
router.get("/me",        protect, getMe);

module.exports = router;
