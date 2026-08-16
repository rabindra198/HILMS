const response = require("../utils/response");

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return response.error(res, "Not authorized", 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return response.error(res, `Access denied. Requires role: ${allowedRoles.join(", ")}`, 403);
    }

    next();
  };
};

module.exports = { authorize };