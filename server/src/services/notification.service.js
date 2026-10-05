const Notification = require("../models/Notification");
const User = require("../models/User");
const AdminSettings = require("../models/AdminSettings");
const { ROLES } = require("../config/roles");
const { emitToUser } = require("../realtime/socketServer");
const EVENTS = require("../realtime/events");

const publishNotification = (notification) => {
  if (!notification) return;
  emitToUser(notification.recipient, EVENTS.NOTIFICATION_CREATED, {
    notificationId: String(notification._id),
    type: notification.type,
    entityType: notification.entityType,
    entityId: notification.entityId ? String(notification.entityId) : null,
    createdAt: notification.createdAt,
  });
};

/**
 * Every "tell someone about this" write goes through here.
 *
 * WHY a shared writer: the Admin dashboard is the only surface that has to react
 * to events raised in five different modules (a patient is registered in
 * `admin.service`, an appointment is booked in `appointment.service`, a
 * laboratory request is created by a doctor, an invoice is issued in
 * `billing.service`, an access request arrives in `accessRequest.service`). Each
 * module writing its own `Notification.create(...)` loop is how those five
 * notifications end up with five different shapes and five different failure
 * behaviours.
 *
 * Two guarantees this function provides that a hand-rolled call site does not:
 *  1. A notification failure NEVER fails the business action that triggered it.
 *     The request, booking or payment is already committed; losing an alert is
 *     logged, losing the payment is not acceptable.
 *  2. An Admin who turned a category off in their notification settings is not
 *     sent it, so the settings screen is not decorative.
 */

const TAG = "[NOTIFY]";

/**
 * Sends one notification to one recipient.
 * @returns {Promise<object|null>} the stored notification, or null if it failed
 */
const notifyUser = async ({ recipient, type, title, message, entityType, entityId }) => {
  try {
    const notification = await Notification.create({ recipient, type, title, message, entityType, entityId });
    publishNotification(notification);
    return notification;
  } catch (error) {
    console.error(`${TAG} Failed to notify ${recipient} (${type}):`, error.message);
    return null;
  }
};

/**
 * Sends one notification to every active Admin.
 *
 * `preference` names the `AdminSettings` boolean for this event category. Admins
 * who have not opened the settings screen yet have no row, and every boolean on
 * that model defaults to true - so a brand-new Admin receives these exactly as
 * they did before the settings screen existed.
 *
 * @param {string} [preference] field on AdminSettings, e.g. "appointmentAlerts"
 * @returns {Promise<number>} how many Admins were actually notified
 */
const notifyAdmins = async ({ type, title, message, entityType, entityId, preference }) => {
  try {
    const admins = await User.find({ role: ROLES.ADMIN, isActive: true }).select("_id").lean();
    if (!admins.length) return 0;

    let optedOut = new Set();
    if (preference) {
      const settings = await AdminSettings.find({
        user: { $in: admins.map((admin) => admin._id) },
        [preference]: false,
      })
        .select("user")
        .lean();
      optedOut = new Set(settings.map((row) => String(row.user)));
    }

    const recipients = admins
      .filter((admin) => !optedOut.has(String(admin._id)))
      .map((admin) => ({ recipient: admin._id, type, title, message, entityType, entityId }));

    if (!recipients.length) return 0;

    const results = await Promise.allSettled(recipients.map((row) => Notification.create(row)));
    const failed = results.filter((result) => result.status === "rejected");
    for (const result of results) {
      if (result.status === "fulfilled") publishNotification(result.value);
    }
    if (failed.length) {
      console.error(`${TAG} ${failed.length}/${recipients.length} admin notifications failed for ${type}`);
    }
    return recipients.length - failed.length;
  } catch (error) {
    console.error(`${TAG} Failed to notify admins (${type}):`, error.message);
    return 0;
  }
};

/** Reads the Admin's stored preferences, creating the row on first use. */
const getOrCreateSettings = async (userId) => {
  const existing = await AdminSettings.findOne({ user: userId });
  if (existing) return existing;

  try {
    return await AdminSettings.create({ user: userId });
  } catch (error) {
    // Another concurrent request created it first - adopt their row.
    if (error.code === 11000) return AdminSettings.findOne({ user: userId });
    throw error;
  }
};

module.exports = { notifyUser, notifyAdmins, getOrCreateSettings, publishNotification };