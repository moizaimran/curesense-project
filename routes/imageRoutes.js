// =============================================================================
// Backend/routes/imageRoutes.js
// =============================================================================
const express  = require("express");
const router   = express.Router();
const { protect } = require("../middleware/auth");
const { uploadImage, listImages, getImageStatus } = require("../controllers/imageController");

router.use(protect);

router.post("/",    uploadImage);
router.get("/",     listImages);
router.get("/:id",  getImageStatus);

module.exports = router;
