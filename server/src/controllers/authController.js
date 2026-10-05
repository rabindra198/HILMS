const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const LoginHistory = require("../models/LoginHistory");
const { authResource } = require("../resources/userResource");
const { generateToken } = require("../utils/generateToken");
const { extractToken } = require("../middleware/auth");
const env = require("../config/env");
const auditService = require("../services/audit.service");
const { disconnectUser } = require("../realtime/socketServer");

const DAY_MS = 24 * 60 * 60 * 1000;

// Converts a jsonwebtoken-style expiry ("30d", "12h", "1d", or seconds) into
// milliseconds so the cookie and the token share exactly one lifetime.
const expiryToMs = (value) => {
  if (typeof value === "number") return value * 1000;
  const match = /^(\d+)\s*([smhd])$/i.exec(String(value || "").trim());
  if (!match) return DAY_MS;
  const amount = Number.parseInt(match[1], 10);
  const unit = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: DAY_MS }[match[2].toLowerCase()];
  return amount * unit;
};

// A real bcrypt hash (of an unguessable random value) used to spend the same CPU
// on an unknown email as on a wrong password. Without it the response time would
// reveal whether an account exists - a timing side channel that account
// enumeration feeds on. The plaintext is discarded, so it can never match.
const TIMING_DECOY_HASH = bcrypt.hashSync(crypto.randomBytes(24).toString("hex"), 12);

const GENERIC_LOGIN_FAILURE = { message: "Invalid email or password" };

const lockResponse = (res, lockUntil) => {
  const retryAfterSeconds = Math.max(1, Math.ceil((lockUntil.getTime() - Date.now()) / 1000));
  res.set("Retry-After", String(retryAfterSeconds));
  return res.status(423).json({
    message: `Account temporarily locked after ${env.security.maxLoginAttempts} failed sign-in attempts. Try again in ${Math.ceil(
      retryAfterSeconds / 60
    )} minute(s), or reset your password.`,
    code: "ACCOUNT_LOCKED",
    retryAfterSeconds,
  });
};

const setAuthCookie = (res, token, maxAgeMs) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: maxAgeMs,
  });
};

const clearAuthCookie = (res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    // Unknown email: burn an equivalent bcrypt comparison and return exactly the
    // same body as a wrong password, so neither the response nor its timing
    // reveals whether the account exists.
    if (!user) {
      await bcrypt.compare(String(password || ""), TIMING_DECOY_HASH);
      return res.status(401).json(GENERIC_LOGIN_FAILURE);
    }

    // FR-AUTH-10 / NFR-04: an account under an active lock is refused before the
    // password is even checked, so no guess can shorten or extend the window.
    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      await auditService.record({
        action: "LOGIN_BLOCKED_LOCKED",
        actor: user,
        targetType: "User",
        targetId: user._id,
        targetEmail: user.email,
        req,
      });
      return lockResponse(res, user.lockUntil);
    }

    const passwordMatches = await user.comparePassword(password);

    if (!passwordMatches) {
      // A lock that has already expired resets the counter before this failure is
      // counted, so the user gets a full fresh window rather than being locked
      // again on the very next mistake.
      if (user.lockUntil && user.lockUntil.getTime() <= Date.now()) {
        user.failedLoginAttempts = 0;
        user.lockUntil = null;
      }

      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      if (user.failedLoginAttempts >= env.security.maxLoginAttempts) {
        user.lockUntil = new Date(Date.now() + env.security.lockoutMinutes * 60 * 1000);
        await user.save();
        await auditService.record({
          action: "ACCOUNT_LOCKED",
          actor: user,
          targetType: "User",
          targetId: user._id,
          targetEmail: user.email,
          metadata: { failedLoginAttempts: user.failedLoginAttempts, lockMinutes: env.security.lockoutMinutes },
          req,
        });
        return lockResponse(res, user.lockUntil);
      }

      await user.save();
      await auditService.record({
        action: "LOGIN_FAILED",
        actor: user,
        targetType: "User",
        targetId: user._id,
        targetEmail: user.email,
        metadata: { failedLoginAttempts: user.failedLoginAttempts, remaining: env.security.maxLoginAttempts - user.failedLoginAttempts },
        req,
      });
      // Same body as the unknown-email branch: a wrong password never confirms
      // that the address is registered.
      return res.status(401).json(GENERIC_LOGIN_FAILURE);
    }

    // The backend is the sole authority on account lifecycle. A PENDING or
    // REJECTED account is refused here, before any token is issued.
    if (user.status === "PENDING") {
      return res.status(403).json({
        message: "Your access request is still pending administrator approval. Please try again once approved.",
        status: "PENDING",
      });
    }
    if (user.status === "REJECTED") {
      return res.status(403).json({
        message: "Your access request was rejected. Please contact the hospital administrator.",
        status: "REJECTED",
      });
    }
    if (!user.isActive) {
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact the hospital administrator.",
        status: "INACTIVE",
      });
    }

    // A good sign-in clears any failure history, so the next unrelated typo
    // starts from zero rather than from the edge of a lock.
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    // FR-AUTH-08: "Remember me" extends the session onto a trusted device; a
    // normal sign-in keeps the shorter default lifetime. The token and the cookie
    // are given the same lifetime so they never disagree.
    const remember = req.body.remember === true || req.body.remember === "true";
    const expiresIn = remember ? `${env.security.rememberMeDays}d` : env.jwtExpiresIn;
    const jti = crypto.randomUUID();

    const token = generateToken(user._id, { tokenVersion: user.tokenVersion || 0, expiresIn, jti });
    setAuthCookie(res, token, expiryToMs(expiresIn));

    // FR-AUTH-09: record the device/address of this sign-in. Best-effort - a
    // history write must never block an otherwise valid sign-in.
    LoginHistory.create({
      user: user._id,
      jti,
      ip: req.ip,
      userAgent: req.get("user-agent") || "",
      remember,
      expiresAt: new Date(Date.now() + env.security.loginHistoryTtlDays * DAY_MS),
    }).catch((error) => console.error("[AUTH] Failed to record login history:", error.message));

    // The authoritative role is always read from the database record and
    // returned by the backend; the client only consumes it.
    return res.status(200).json(authResource(user, { token }));
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res) => {
  const token = extractToken(req);

  if (token) {
    try {
      const decoded = jwt.verify(token, env.jwtSecret);
      if (decoded?.id) {
        // FR-AUTH-11: revoke every live token for the account, so a copied JWT
        // cannot keep working after the user signs out. A fresh sign-in mints a
        // token carrying the new version and is accepted again.
        await User.updateOne({ _id: decoded.id }, { $inc: { tokenVersion: 1 } });
        disconnectUser(decoded.id);
      }
    } catch {
      // Expired or malformed token - nothing to revoke, but the cookie still
      // needs clearing.
    }
  }

  clearAuthCookie(res);
  return res.status(200).json({ success: true, message: "Logged out successfully" });
};

const getMe = async (req, res, next) => {
  try {
    return res.status(200).json(authResource(req.user));
  } catch (error) {
    return next(error);
  }
};

/**
 * FR-AUTH-09: the signed-in user's recent sign-ins (device, address, time),
 * newest first, with the caller's own session marked. Read-only history; the
 * `jti` of the current token is what identifies "this device".
 */
const listSessions = async (req, res, next) => {
  try {
    const history = await LoginHistory.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const sessions = history.map((entry) => ({
      id: String(entry._id),
      ip: entry.ip || "",
      userAgent: entry.userAgent || "",
      remember: entry.remember === true,
      signedInAt: entry.createdAt,
      current: Boolean(entry.jti && entry.jti === req.auth?.jti),
    }));

    return res.status(200).json({ success: true, sessions });
  } catch (error) {
    return next(error);
  }
};

/**
 * FR-AUTH-09 / FR-AUTH-11: sign out of every device by revoking every token the
 * account currently holds. The caller's own session is included, so the client
 * clears its state and returns to the sign-in screen.
 */
const revokeAllSessions = async (req, res, next) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    disconnectUser(req.user._id);
    clearAuthCookie(res);
    await auditService.record({
      action: "SESSIONS_REVOKED_ALL",
      actor: req.user,
      targetType: "User",
      targetId: req.user._id,
      targetEmail: req.user.email,
      req,
    });
    return res.status(200).json({
      success: true,
      message: "All sessions have been signed out. Please sign in again.",
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  login,
  logout,
  getMe,
  listSessions,
  revokeAllSessions,
  setAuthCookie,
  clearAuthCookie,
};
