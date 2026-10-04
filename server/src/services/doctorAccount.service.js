const User = require("../models/User");
const Notification = require("../models/Notification");
const DoctorSettings = require("../models/DoctorSettings");
const auditService = require("./audit.service");

/**
 * Doctor account surfaces: notifications, profile and preferences.
 *
 * These exist because the doctor module needs them, but the read/write logic is
 * deliberately generic - `Notification` and `User` are shared collections and
 * every query is filtered on the authenticated doctor's own id. A doctor can
 * therefore only ever reach their own rows, which is why reusing the
 * laboratory equivalents here would mean importing a service whose name claims
 * a role it does not enforce.
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

// ---- Notifications -------------------------------------------------------

const listNotifications = async (doctorId, { unread, read, limit = 50 } = {}) => {
  const filter = { recipient: doctorId };

  if (unread) filter.readAt = null;
  if (read) filter.readAt = { $ne: null };

  const capped = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(capped).lean(),
    Notification.countDocuments({ recipient: doctorId, readAt: null }),
  ]);

  return { items, unreadCount };
};

const getUnreadCount = (doctorId) =>
  Notification.countDocuments({ recipient: doctorId, readAt: null });

/**
 * The recipient is part of the filter, so a notification belonging to another
 * user is simply not found - never updated. That keeps this from becoming a
 * "mark somebody else's notification read" oracle.
 */
const markRead = async (notificationId, doctorId) => {
  const item = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: doctorId },
    { $set: { readAt: new Date() } },
    { new: true }
  );

  if (!item) fail("Notification not found", 404);
  return item;
};

const markAllRead = async (doctorId) => {
  const result = await Notification.updateMany(
    { recipient: doctorId, readAt: null },
    { $set: { readAt: new Date() } }
  );
  return { updated: result.modifiedCount || 0 };
};

// ---- Profile -------------------------------------------------------------

const PROFILE_FIELDS =
  "name email phone contactNumber address profilePhotoUrl nmcNumber department qualification specialization status isActive createdAt";

const getProfile = (doctorId) => User.findById(doctorId).select(PROFILE_FIELDS);

/**
 * SRS 8.3: a profile update is auditable. Only self-service clinical fields are
 * writable here. `role`, `status`, `isActive` and the NMC number are deliberately
 * absent: those are Super Admin controls, and a doctor editing their own NMC
 * number would break the `one_account_per_nmc_number` guarantee that ties a
 * licence to a person.
 */
const updateProfile = async (doctorId, data = {}, actor) => {
  const allowed = {};

  ["name", "phone", "contactNumber", "address", "department", "qualification", "specialization"].forEach(
    (field) => {
      if (data[field] !== undefined) allowed[field] = data[field];
    }
  );

  if (!Object.keys(allowed).length) fail("No editable profile fields were supplied");

  // Identity is taken from the JWT, never from the body.
  const user = await User.findByIdAndUpdate(
    doctorId,
    { $set: allowed },
    { new: true, runValidators: true }
  ).select(PROFILE_FIELDS);

  if (!user) fail("Doctor not found", 404);

  await auditService.record({
    action: "PROFILE_UPDATED",
    actor,
    targetType: "User",
    targetId: doctorId,
    targetEmail: user.email,
    metadata: { fields: Object.keys(allowed) },
  });

  return user;
};

// ---- Settings ------------------------------------------------------------

const getSettings = (doctorId) =>
  DoctorSettings.findOneAndUpdate(
    { user: doctorId },
    { $setOnInsert: { user: doctorId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

const updateSettings = (doctorId, data = {}) => {
  const allowed = {};
  [
    "appointmentAlerts",
    "followUpAlerts",
    "labReportAlerts",
    "emailNotifications",
  ].forEach((field) => {
    if (data[field] !== undefined) allowed[field] = Boolean(data[field]);
  });

  return DoctorSettings.findOneAndUpdate(
    { user: doctorId },
    { $set: allowed, $setOnInsert: { user: doctorId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  getProfile,
  updateProfile,
  getSettings,
  updateSettings,
};
