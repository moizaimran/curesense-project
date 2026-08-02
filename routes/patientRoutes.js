// =============================================================================
// Backend/routes/patientRoutes.js
// =============================================================================
const express = require("express");
const router  = express.Router();
const {
  createPatient,
  getPatient,
  updatePatientProfile,
} = require("../controllers/patientController");

router.post("/",        createPatient);
router.get("/:id",      getPatient);
router.patch("/:id",    updatePatientProfile);

module.exports = router;
