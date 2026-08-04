// =============================================================================
// Backend/routes/patientRoutes.js
// =============================================================================
const express  = require("express");
const router   = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  createPatient,
  getPatient,
  updatePatientProfile,
} = require("../controllers/patientController");

// Manual patient creation is admin-only (patients are created via /api/auth/register)
router.post("/",     protect, authorize("admin"),            createPatient);
router.get("/:id",   protect,                                getPatient);
router.patch("/:id", protect, authorize("patient", "admin"), updatePatientProfile);

module.exports = router;
