// =============================================================================
// Backend/routes/sessionRoutes.js
// =============================================================================
const express  = require("express");
const router   = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { writeLimiter }       = require("../middleware/rateLimiter");
const { validateObjectId }   = require("../middleware/validate");
const {
  createSession,
  processTurn,
  transcribeAudio,
  getSession,
  getSessionsForPatient,
  getLatestSession,
  softDeleteSession,
} = require("../controllers/sessionController");

// Creating sessions and processing turns are write-heavy AI calls — rate limited
router.post("/",                 protect, authorize("patient"), writeLimiter, createSession);
router.post("/:id/turn",        protect, authorize("patient"), writeLimiter, validateObjectId("id"), processTurn);
router.post("/:id/transcribe",  protect, authorize("patient"), writeLimiter, validateObjectId("id"), transcribeAudio);

// Read endpoints — no rate limit
router.get("/patient/:patientId/latest", protect, authorize("patient", "doctor", "admin"), validateObjectId("patientId"), getLatestSession);
router.get("/patient/:patientId",        protect, authorize("patient", "doctor", "admin"), validateObjectId("patientId"), getSessionsForPatient);
router.get("/:id",                       protect,                                          validateObjectId("id"),        getSession);

// Patient-only: deleting a session is the patient managing their own record.
// authorize("patient") + canAccessPatient (in controller) = belt and suspenders.
router.patch("/:id/delete", protect, authorize("patient"), validateObjectId("id"), softDeleteSession);

module.exports = router;
