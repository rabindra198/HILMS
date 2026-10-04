const Notification = require("../models/Notification");

/**
 * The signed-in administrator's own notification inbox.
 *
 * Scoped to `{ recipient: adminUser._id }` in every query rather than filtered in
 * the controller, so a crafted query string cannot widen what an administrator
 * reads. There is no "read all notifications" endpoint here - unread state is
 * per-recipient data, and clearing another person's inbox is not a thing that
 * should be expressible.
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const LIST_LIMIT = 50;

const list = async (adminId, query = {}) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || LIST_LIMIT));
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  const filter = { recipient: adminId };
  if (query.unread === "true" || query.unread === true) filter.readAt = null;
  if (query.type) filter.type = String(query.type).trim();

  const [items, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ readAt: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: adminId, readAt: null }),
  ]);

  return {
    items,
    unread,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

/** The badge count. Separate from the list so the sidebar can poll it cheaply. */
const unreadCount = async (adminId) => Notification.countDocuments({ recipient: adminId, readAt: null });

/**
 * Marks one notification read.
 *
 * Scoped by recipient in the query, so a request for somebody else's notification
 * id is a 404 rather than a silent no-op that would suggest it succeeded.
 */
const markRead = async (adminId, notificationId) => {
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: adminId, readAt: null },
    { readAt: new Date() },
    { new: true }
  ).lean();

  // Already-read is a success, not an error: marking something read twice is
  // idempotent by definition.
  if (!updated) {
    const existing = await Notification.findOne({ _id: notificationId, recipient: adminId }).lean();
    if (!existing) fail("Notification not found", 404);
    return existing;
  }

  return updated;
};

const markAllRead = async (adminId) => {
  const result = await Notification.updateMany(
    { recipient: adminId, readAt: null },
    { readAt: new Date() }
  );

  return { updated: result.modifiedCount, unread: 0 };
};

module.exports = { list, unreadCount, markRead, markAllRead, LIST_LIMIT };