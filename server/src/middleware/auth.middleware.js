const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");
const response = require("../utils/response");

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return response.error(res, "Not authorized, no token provided", 401);
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.id).select("-password");
    if (!user || !user.isActive) {
      return response.error(res, "Not authorized, user not found or inactive", 401);
    }

    req.user = user;
    next();
  } catch (error) {
    return response.error(res, "Not authorized, invalid or expired token", 401);
  }
};

module.exports = { protect };