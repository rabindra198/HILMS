const jwt = require("jsonwebtoken");
const User = require("../models/User");
const env = require("../config/env");
const { normalizeRole, isAdminRole } = require("../config/roles");

/**
 * Extract the JWT from either transport the project supports:
 *  - httpOnly cookie set by the auth controller (browser clients)
 *  - Authorization: Bearer <token>            (Postman / API clients)
 */
const extractToken = (req) => {
  const cookieToken = req.cookies?.token;
  if (cookieToken) return cookieToken;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return null;
};

/**
 * Backend authorization gate. This is the single enforcement point - the
 * frontend route guards are a UX convenience only and are never trusted.
 */
const verifyToken = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token provided" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    const message =
      error.name === "TokenExpiredError" ? "Not authorized, token expired" : "Not authorized, token failed";
    return res.status(401).json({ message });
  }

  let user;
  try {
    user = await User.findById(decoded.id);
  } catch (error) {
    return next(error);
  }

  if (!user) {
    return res.status(401).json({ message: "Not authorized, user not found" });
  }

  // Re-read account state on every request so an approval/rejection takes
  // effect immediately instead of waiting for the token to expire.
  if (user.status !== "APPROVED") {
    return res.status(403).json({
      message:
        user.status === "PENDING"
          ? "Your access request is still pending administrator approval"
          : "Your access request was rejected. Please contact the hospital administrator.",
      status: user.status,
    });
  }

  if (!user.isActive) {
    return res.status(403).json({ message: "Your account has been deactivated. Please contact the administrator." });
  }

  // FR-AUTH-11: a token minted before the account's current version has been
  // revoked (logout / "sign out everywhere") is refused here, so revocation takes
  // effect immediately rather than at token expiry. Tokens predating this field
  // carry no `tv` and are grandfathered rather than rejected.
  if (typeof decoded.tv === "number" && decoded.tv !== (user.tokenVersion || 0)) {
    return res.status(401).json({
      message: "Your session has ended. Please sign in again.",
      code: "SESSION_REVOKED",
    });
  }

  req.user = user;
  req.userRole = normalizeRole(user.role);
  // The current sign-in's identifier, so a session list can mark which record is
  // the caller's own.
  req.auth = { jti: decoded.jti || null };
  return next();
};

// Retained name for the laboratory routes, which imported `protect`.
// Delegates to the single implementation above - no duplicate auth logic.
const protect = verifyToken;

const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authorized, no token provided" });
  }
  if (!isAdminRole(req.user.role)) {
    return res.status(403).json({ message: "Not authorized as admin" });
  }
  return next();
};

/**
 * Forced first-login password change, enforced on the backend.
 *
 * When an Admin approves a Doctor / Laboratory request the backend issues a
 * temporary password and flags the account `mustChangePassword`. Such a session
 * is only allowed to reach the change-password endpoint - every other
 * protected route is refused with 403 until the temporary credential has been
 * replaced. The frontend redirect is a UX convenience only; this is the
 * authoritative check, so skipping the redirect in a browser cannot grant
 * dashboard access.
 */
const blockUntilPasswordChanged = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authorized, no token provided" });
  }
  if (req.user.mustChangePassword === true) {
    return res.status(403).json({
      message: "You must change your temporary password before continuing.",
      code: "PASSWORD_CHANGE_REQUIRED",
      mustChangePassword: true,
    });
  }
  return next();
};

module.exports = {
  verifyToken,
  protect,
  isAdmin,
  blockUntilPasswordChanged,
  extractToken,
};
