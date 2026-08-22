// =============================================================================
// Backend/routes/imageRoutes.js
// =============================================================================
const express  = require("express");
const router   = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { writeLimiter }       = require("../middleware/rateLimiter");
const { validateObjectId }   = require("../middleware/validate");
const { uploadImage, listImages, listPatientImages, getImageStatus } = require("../controllers/imageController");

router.use(protect);

// Upload is write-heavy and triggers an AI background job — rate limited
router.post("/",                          writeLimiter, uploadImage);
router.get("/",                           listImages);
// Doctor/admin view of a patient's scan analyses — never returns raw file URLs
router.get("/patient/:patientId",         authorize("doctor", "admin"), validateObjectId("patientId"), listPatientImages);
router.get("/:id",                        validateObjectId("id"), getImageStatus);

module.exports = router;
