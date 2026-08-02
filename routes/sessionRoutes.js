// =============================================================================
// Backend/routes/sessionRoutes.js
// =============================================================================
const express = require("express");
const router  = express.Router();
const {
  createSession,
  processTurn,
  getSession,
  getSessionsForPatient,
} = require("../controllers/sessionController");

router.post("/",                     createSession);
router.post("/:id/turn",             processTurn);
router.get("/:id",                   getSession);
router.get("/patient/:patientId",    getSessionsForPatient);

module.exports = router;
