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
} = require("../controllers/sessionController");

router.post("/",                  protect, authorize("patient"),                    createSession);
router.post("/:id/turn",          protect, authorize("patient"),                    processTurn);
router.get("/:id",                protect,                                          getSession);
router.get("/patient/:patientId", protect, authorize("patient", "doctor", "admin"), getSessionsForPatient);

module.exports = router;
