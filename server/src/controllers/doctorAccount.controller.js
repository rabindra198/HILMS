const doctorAccountService = require("../services/doctorAccount.service");
const response = require("../utils/response");

/**
 * Doctor notifications, profile and settings.
 *
 * Thin HTTP layer: parse, delegate, respond. Every handler reads the doctor id
 * from `req.user`, which the router's `protect` middleware has already verified,
 * so no handler accepts a doctor id from the request.
 */
const run = (handler, successMessage = "Success", statusCode = 200) => async (req, res, next) => {
  try {
    return response.success(res, await handler(req), statusCode, successMessage);
  } catch (error) {
    return next(error);
  }
};

const id = (req) => req.user._id;

module.exports = {
  // ---- notifications ----
  notifications: run((req) =>
    doctorAccountService.listNotifications(id(req), {
      unread: req.query.unread === "true",
      read: req.query.read === "true",
      limit: req.query.limit,
    })
  ),
  unreadNotificationCount: run((req) => doctorAccountService.getUnreadCount(id(req))),
  readNotification: run((req) => doctorAccountService.markRead(req.params.id, id(req)), "Notification marked as read"),
  readAllNotifications: run((req) => doctorAccountService.markAllRead(id(req)), "Notifications marked as read"),

  // ---- profile ----
  profile: run((req) => doctorAccountService.getProfile(id(req))),
  updateProfile: run((req) => doctorAccountService.updateProfile(id(req), req.body, req.user), "Profile updated successfully"),

  // ---- settings ----
  settings: run((req) => doctorAccountService.getSettings(id(req))),
  updateSettings: run((req) => doctorAccountService.updateSettings(id(req), req.body), "Settings updated successfully"),
};
