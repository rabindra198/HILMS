const User = require("../models/User");
const { generateToken } = require("../utils/jwt");

const DEV_USERS = new Map();

const buildDevUser = ({ name, email, password, role, phone }) => {
  const safeEmail = String(email || "").trim().toLowerCase();
  const safeRole = String(role || "patient").trim().toLowerCase();
  const id = `dev-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    _id: id,
    id,
    name: String(name || "Dev User").trim() || "Dev User",
    email: safeEmail,
    phone: phone || "",
    password,
    role: safeRole,
  };
};

const registerUser = async ({ name, email, password, role, phone }) => {
  if (process.env.BYPASS_AUTH === "true") {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (DEV_USERS.has(normalizedEmail)) {
      const error = new Error("Email already registered");
      error.statusCode = 400;
      throw error;
    }

    const devUser = buildDevUser({ name, email: normalizedEmail, password, role, phone });
    DEV_USERS.set(normalizedEmail, devUser);

    const token = generateToken(devUser._id);
    return {
      token,
      user: { id: devUser.id, name: devUser.name, email: devUser.email, role: devUser.role },
    };
  }

  const existing = await User.findOne({ email });
  if (existing) {
    const error = new Error("Email already registered");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.create({ name, email, password, role, phone });
  return { id: user._id, name: user.name, email: user.email, role: user.role };
};

const loginUser = async ({ email, password }) => {
  if (process.env.BYPASS_AUTH === "true") {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const devUser = DEV_USERS.get(normalizedEmail);

    if (!devUser || devUser.password !== password) {
      const error = new Error("Invalid credentials");
      error.statusCode = 401;
      throw error;
    }

    const token = generateToken(devUser._id);
    return {
      token,
      user: { id: devUser.id, name: devUser.name, email: devUser.email, role: devUser.role },
    };
  }

  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  const token = generateToken(user._id);
  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  };
};

module.exports = { registerUser, loginUser };