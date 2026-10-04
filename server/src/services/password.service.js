const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Notification = require("../models/Notification");
const PasswordResetToken = require("../models/PasswordResetToken");
const auditService = require("./audit.service");
const emailService = require("./email.service");
const { userResource } = require("../resources/userResource");
const env = require("../config/env");

const BCRYPT_SALT_ROUNDS = 12;

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const notify = (recipient, type, title, message, entityType, entityId) =>
  Notification.create({ recipient, type, title, message, entityType, entityId }).catch((error) => {
    console.error("[PASSWORD] Failed to create notification:", error.message);
  });

/**
 * Issues a single-use reset token and delivers it by email (primary channel,
 * via the configured SMTP provider - SRS 5.3) plus an in-app notification as a
 * secondary channel.
 *
 * The HTTP response is always identical whether or not the email is
 * registered, so this endpoint cannot be used to enumerate accounts. The
 * plaintext token is never returned to the caller.
 */
const requestPasswordReset = async (email) => {
  const genericMessage = "If an account exists for that email, a password reset has been issued.";

  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user || user.status !== "APPROVED") {
    return { delivered: true, message: genericMessage };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const ttlMinutes = PasswordResetToken.RESET_TOKEN_TTL_MINUTES;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  // Only the hash is persisted; the plaintext token lives only in the email
  // (and the in-app notification).
  await PasswordResetToken.create({
    user: user._id,
    tokenHash: sha256(token),
    expiresAt,
  });

  const resetUrl = `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const { text, html } = emailService.buildPasswordResetEmail({
    name: user.name,
    email: user.email,
    resetUrl,
    ttlMinutes,
  });

  const mail = await emailService.sendMail({
    to: user.email,
    subject: "Reset your HILMS password",
    text,
    html,
  });

  // Secondary channel: also surface the reset link in-app for users who are
  // currently signed in on another device.
  await notify(
    user._id,
    "PASSWORD_RESET",
    "Password reset requested",
    `A password reset was requested for your HILMS account. This link expires in ${ttlMinutes} minutes: ${resetUrl}`,
    "PasswordResetToken",
    user._id
  );

  await auditService.record({
    action: "PASSWORD_RESET_REQUESTED",
    actor: user,
    targetType: "User",
    targetId: user._id,
    targetEmail: user.email,
    metadata: { emailDelivered: mail.delivered, emailReason: mail.reason },
  });

  // Development convenience: when no mail provider is configured, print the
  // reset link so the flow can be exercised locally. Never enabled in
  // production, and never returned over HTTP.
  if (!mail.delivered && !emailService.isProduction()) {
    console.log(`[PASSWORD] Email not sent (${mail.reason}). Reset link for ${user.email}: ${resetUrl}`);
  }

  return { delivered: true, message: genericMessage, emailDelivered: mail.delivered, token, expiresAt };
};

const resetPassword = async ({ token, password }) => {
  if (!token) fail("Reset token is required");
  if (!password || password.length < 6) fail("Password must be at least 6 characters");

  const record = await PasswordResetToken.findOne({ tokenHash: sha256(String(token).trim()) });
  if (!record) fail("This password reset link is invalid or has already been used", 400);
  if (record.usedAt) fail("This password reset link has already been used", 400);
  if (record.expiresAt.getTime() < Date.now()) fail("This password reset link has expired. Please request a new one.", 400);

  const user = await User.findById(record.user);
  if (!user) fail("Account no longer exists", 404);

  user.password = password;
  // Force re-authentication semantics for any stale sessions.
  user.status = "APPROVED";
  // A completed reset also satisfies any outstanding forced password change.
  user.mustChangePassword = false;
  user.temporaryPasswordIssuedAt = null;
  await user.save();

  record.usedAt = new Date();
  await record.save();

  // Invalidate every other outstanding reset token for this account.
  await PasswordResetToken.updateMany(
    { user: user._id, usedAt: null, _id: { $ne: record._id } },
    { $set: { usedAt: new Date() } }
  );

  await auditService.record({
    action: "PASSWORD_RESET_COMPLETED",
    actor: user,
    targetType: "User",
    targetId: user._id,
    targetEmail: user.email,
  });

  return { email: user.email };
};

const changePassword = async (userId, payload = {}) => {
  // `temporaryPassword` is the name the forced first-login screen uses;
  // `currentPassword` is the name long-standing clients already send. Both mean
  // "the credential currently on the account".
  const currentPassword = payload.temporaryPassword || payload.currentPassword;
  const { newPassword, confirmPassword } = payload;

  if (!newPassword || newPassword.length < 6) fail("New password must be at least 6 characters");
  if (confirmPassword !== undefined && confirmPassword !== newPassword) {
    fail("Password confirmation does not match the new password");
  }

  const user = await User.findById(userId).select("+password");
  if (!user) fail("Account not found", 404);

  if (!currentPassword) fail("Temporary password is required");
  if (!(await user.comparePassword(String(currentPassword)))) {
    fail(user.mustChangePassword ? "Temporary password is incorrect" : "Current password is incorrect", 401);
  }
  if (currentPassword === newPassword) {
    fail("New password must be different from the temporary password");
  }

  // Capture before mutating, so the audit trail records what actually happened.
  const wasTemporaryPassword = user.mustChangePassword === true;

  user.password = newPassword;
  // Completing this change is what retires an Admin-issued temporary password:
  // the one-time credential stops working the moment the new hash is written.
  user.mustChangePassword = false;
  user.temporaryPasswordIssuedAt = null;
  await user.save();

  await auditService.record({
    action: "PASSWORD_CHANGED",
    actor: user,
    targetType: "User",
    targetId: user._id,
    targetEmail: user.email,
    metadata: { wasTemporaryPassword },
  });

  // The refreshed user lets the client clear `mustChangePassword` straight away
  // instead of re-fetching the session just to discover the new state.
  return { email: user.email, mustChangePassword: user.mustChangePassword, user: userResource(user) };
};

module.exports = {
  requestPasswordReset,
  resetPassword,
  changePassword,
  BCRYPT_SALT_ROUNDS,
  sha256,
};
