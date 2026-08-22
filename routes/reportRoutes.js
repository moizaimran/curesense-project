// =============================================================================
// Backend/routes/reportRoutes.js
// =============================================================================
const express  = require("express");
const router   = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { validateObjectId }   = require("../middleware/validate");
const {
  getReport,
  getReportsForPatient,
  getReportForSession,
} = require("../controllers/reportController");

// :patientId and :sessionId are ObjectIds too
router.get("/patient/:patientId", protect, authorize("patient", "doctor", "admin"), validateObjectId("patientId"), getReportsForPatient);
router.get("/session/:sessionId", protect,                                           validateObjectId("sessionId"), getReportForSession);
router.get("/:id",                protect,                                           validateObjectId("id"),        getReport);

module.exports = router;
