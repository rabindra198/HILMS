const response = require("../utils/response");
const { normalizeRole } = require("../config/roles");

/**
 * Exact-role authorization used by the feature routers (laboratory today).
 * Unlike `isAdmin`, this does NOT imply any role hierarchy: a role listed
 * here is the only role permitted through.
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return response.error(res, "Not authorized, no token provided", 401);
    }

    const allowed = allowedRoles.map(normalizeRole);
    if (!allowed.includes(normalizeRole(req.user.role))) {
      return response.error(res, `Access denied. Requires role: ${allowed.join(", ")}`, 403);
    }

    return next();
  };
};

module.exports = { authorize };
