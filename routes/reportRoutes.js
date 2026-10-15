const express  = require("express");
const router   = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { validateObjectId }   = require("../middleware/validate");
const {
  getReport,
  getReportsForPatient,
  getReportForSession,
} = require("../controllers/reportController");

// Static paths before /:id
router.get("/patient/:patientId", protect, authorize("patient", "doctor", "admin"), validateObjectId("patientId"), getReportsForPatient);
router.get("/session/:sessionId", protect,                                           validateObjectId("sessionId"), getReportForSession);

// Single report — any authenticated user (access checked in service)
router.get("/:id",                protect, validateObjectId("id"), getReport);

module.exports = router;
