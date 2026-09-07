const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { normalizeRole } = require("../config/roles");

const DEV_MOCK_USER = {
  _id: "dev-mock-admin",
  id: "dev-mock-admin",
  name: "Dev Admin",
  email: "dev@hilms.local",
  phone: "",
  role: "admin",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  createdAt: null,
  updatedAt: null,
};

const verifyToken = async (req, res, next) => {
  let token;

  token = req.cookies?.token;

  if (!token) {
    if (process.env.BYPASS_AUTH === "true") {
      req.user = DEV_MOCK_USER;
      return next();
    }
    return res.status(401).json({ message: "Not authorized to access this route" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("[AUTH] Token verified for userId:", decoded.id);
    req.user = await User.findById(decoded.id);
    if (!req.user) {
      console.log("[AUTH] User not found for userId:", decoded.id);
      return res.status(401).json({ message: "Not authorized, user not found" });
    }
    req.user.role = normalizeRole(req.user.role);
    next();
  } catch (error) {
    console.log("[AUTH] Token verification failed:", error.message);
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Not authorized as admin" });
  }
  next();
};

const requireRole = (...roles) => (req, res, next) => {
  const allowedRoles = roles.map(normalizeRole);
  const userRole = normalizeRole(req.user?.role);

  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({ message: "Not authorized for this role" });
  }

  next();
};

module.exports = { verifyToken, isAdmin, requireRole };
