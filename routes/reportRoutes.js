// =============================================================================
// Backend/routes/reportRoutes.js
// =============================================================================
const express = require("express");
const router  = express.Router();
const {
  getReport,
  getReportsForPatient,
  getReportForSession,
} = require("../controllers/reportController");

router.get("/:id",                    getReport);
router.get("/patient/:patientId",     getReportsForPatient);
router.get("/session/:sessionId",     getReportForSession);

module.exports = router;
