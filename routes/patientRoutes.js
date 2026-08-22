// =============================================================================
// Backend/routes/patientRoutes.js
// =============================================================================
const express  = require("express");
const router   = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { validateObjectId }   = require("../middleware/validate");
const {
  createPatient,
  listPatients,
  getPatient,
  updatePatientProfile,
  getPatientReports,
} = require("../controllers/patientController");
const { getPatientAppointmentHistory } = require("../controllers/appointmentController");

// List / create — admin only
router.get("/",  protect, authorize("admin"), listPatients);
router.post("/", protect, authorize("admin"), createPatient);

// Sub-resource routes — declared BEFORE /:id so Express doesn't mistake the
// path suffix ("reports", "appointments") as the id parameter.
router.get("/:id/reports",      protect, authorize("patient", "doctor", "admin"), validateObjectId("id"), getPatientReports);
router.get("/:id/appointments", protect, authorize("patient", "doctor", "admin"), validateObjectId("id"), getPatientAppointmentHistory);

router.get("/:id",   protect,                              validateObjectId("id"), getPatient);
router.patch("/:id", protect, authorize("patient", "admin"), validateObjectId("id"), updatePatientProfile);

module.exports = router;
