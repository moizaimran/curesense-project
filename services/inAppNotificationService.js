// =============================================================================
// Backend/services/inAppNotificationService.js — the doctor dashboard bell
//
// create* helpers never throw into the caller (a failed notification must not
// break the action that triggered it).
// =============================================================================
const mongoose      = require("mongoose");
const logger        = require("../utils/logger");
const { AppError }  = require("../utils/errors");
const Notification  = require("../models/Notification");
const DoctorProfile = require("../models/DoctorProfile");

async function create(userId, { type, title, message = "", appointmentId = null, link }) {
  try {
    if (!userId) return null;
    return await Notification.create({
      user_id: userId,
      type,
      title,
      message: String(message).slice(0, 500),
      appointment_id: appointmentId || null,
      link: link ?? (appointmentId ? `/cases/${appointmentId}` : ""),
    });
  } catch (err) {
    logger.warn({ err: err?.message, type }, "In-app notification failed (non-fatal)");
    return null;
  }
}

async function createForDoctor(doctorProfileId, payload) {
  try {
    const profile = await DoctorProfile.findById(doctorProfileId).select("user_id").lean();
    return profile?.user_id ? create(profile.user_id, payload) : null;
  } catch (err) {
    logger.warn({ err: err?.message }, "In-app notification lookup failed (non-fatal)");
    return null;
  }
}

// ── API ──────────────────────────────────────────────────────────────────────

async function list(userId, { limit = 20, unread_only } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const filter = { user_id: userId };
  if (unread_only === "true" || unread_only === true) filter.read = false;
  const [results, unread_count] = await Promise.all([
    Notification.find(filter).sort({ created_at: -1 }).limit(lim).lean(),
    Notification.countDocuments({ user_id: userId, read: false }),
  ]);
  return { results, unread_count };
}

async function markRead(userId, id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid notification id", 400);
  const n = await Notification.findOneAndUpdate({ _id: id, user_id: userId }, { $set: { read: true } }, { new: true }).lean();
  if (!n) throw new AppError("Notification not found", 404);
  return n;
}

async function markAllRead(userId) {
  const r = await Notification.updateMany({ user_id: userId, read: false }, { $set: { read: true } });
  return { updated: r.modifiedCount };
}

module.exports = { create, createForDoctor, list, markRead, markAllRead };
