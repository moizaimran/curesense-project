// =============================================================================
// Backend/routes/notificationRoutes.js — in-app notifications, /api/notifications
// Every signed-in user sees only their own notifications.
// =============================================================================
const express      = require("express");
const router       = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const { protect }  = require("../middleware/auth");
const inApp        = require("../services/inAppNotificationService");

router.use(protect);

router.get("/", asyncHandler(async (req, res) => {
  res.json(await inApp.list(req.user._id, req.query));
}));

// must come before "/:id/read"
router.patch("/read-all", asyncHandler(async (req, res) => {
  res.json(await inApp.markAllRead(req.user._id));
}));

router.patch("/:id/read", asyncHandler(async (req, res) => {
  res.json(await inApp.markRead(req.user._id, req.params.id));
}));

module.exports = router;
