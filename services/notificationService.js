// =============================================================================
// Backend/services/notificationService.js
//
// Best-effort Expo push notifications. Never throws — a failed notification
// must never break the operation that triggered it.
//
// To enable: mobile app calls PATCH /api/auth/push-token after login and sends
// { expo_push_token: "ExponentPushToken[...]" } — stored on the User document.
// =============================================================================
const axios  = require("axios");
const logger = require("../utils/logger");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Send a single Expo push notification.
 * @param {string|null} expoPushToken
 * @param {{ title: string, body: string, data?: object }} payload
 */
async function sendPushNotification(expoPushToken, { title, body, data = {} }) {
  if (!expoPushToken) return;
  if (!expoPushToken.startsWith("ExponentPushToken[") && !expoPushToken.startsWith("ExpoExpoPushToken[")) return;

  try {
    await axios.post(
      EXPO_PUSH_URL,
      { to: expoPushToken, title, body, data, sound: "default", priority: "high" },
      { timeout: 10_000 }
    );
  } catch (err) {
    logger.warn({ err: err?.message }, "Push notification delivery failed (non-fatal)");
  }
}

/**
 * Look up a user's push token and send a notification.
 * Silently no-ops if the user has no registered token.
 * @param {mongoose.Types.ObjectId|string} userId
 * @param {{ title: string, body: string, data?: object }} payload
 */
async function notifyUser(userId, payload) {
  try {
    const User = require("../models/User");
    const user = await User.findById(userId).select("expo_push_token");
    if (user?.expo_push_token) {
      await sendPushNotification(user.expo_push_token, payload);
    }
  } catch (err) {
    logger.warn({ err: err?.message }, "notifyUser failed (non-fatal)");
  }
}

module.exports = { sendPushNotification, notifyUser };
