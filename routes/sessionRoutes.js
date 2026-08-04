// =============================================================================
// Backend/routes/sessionRoutes.js
// =============================================================================
const express  = require("express");
const router   = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  createSession,
  processTurn,
  getSession,
  getSessionsForPatient,
  getLatestSession,
  softDeleteSession,
} = require("../controllers/sessionController");

router.post("/",                           protect, authorize("patient"),                    createSession);
router.post("/:id/turn",                   protect, authorize("patient"),                    processTurn);
router.get("/patient/:patientId/latest",   protect, authorize("patient", "doctor", "admin"), getLatestSession);
router.get("/patient/:patientId",          protect, authorize("patient", "doctor", "admin"), getSessionsForPatient);
router.get("/:id",                         protect,                                          getSession);
router.patch("/:id/delete",               protect,                                          softDeleteSession);

module.exports = router;
