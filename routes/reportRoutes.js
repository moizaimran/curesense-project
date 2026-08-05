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

router.get("/patient/:patientId", protect, authorize("patient", "doctor", "admin"), getReportsForPatient);
router.get("/session/:sessionId", protect,                                          getReportForSession);
router.get("/:id",                protect,                                          getReport);

module.exports = router;
