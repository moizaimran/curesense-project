// =============================================================================
// Backend/routes/reportRoutes.js
// =============================================================================
const express  = require("express");
const router   = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  getReport,
  getReportsForPatient,
  getReportForSession,
} = require("../controllers/reportController");

router.get("/:id",                protect,                                          getReport);
router.get("/patient/:patientId", protect, authorize("patient", "doctor", "admin"), getReportsForPatient);
router.get("/session/:sessionId", protect,                                          getReportForSession);

module.exports = router;
