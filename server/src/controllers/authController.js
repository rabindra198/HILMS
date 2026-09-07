import User from "../models/User.js";
import Patient from "../models/Patient.js";
import { normalizeRole } from "../config/roles.js";
import { userResource } from "../resources/userResource.js";
import { generateToken } from "../utils/generateToken.js";

const DEV_USERS = new Map();

const DEV_DEFAULT_ADMIN = {
  _id: "dev-mock-admin",
  id: "dev-mock-admin",
  name: "Dev Admin",
  email: "admin@hilms.com",
  phone: "",
  password: "Admin@123",
  role: "admin",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  createdAt: null,
  updatedAt: null,
};

DEV_USERS.set(DEV_DEFAULT_ADMIN.email, DEV_DEFAULT_ADMIN);

const setAuthCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const handleDevFallbackAuth = (req, res, mode, payload = {}) => {
  if (process.env.BYPASS_AUTH !== "true") {
    return false;
  }

  const normalizedEmail = String(payload.email || "").trim().toLowerCase();

  if (mode === "signup") {
    const existingDevUser = DEV_USERS.get(normalizedEmail);
    if (existingDevUser) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    const devUser = {
      _id: `dev-user-${Date.now()}`,
      id: `dev-user-${Date.now()}`,
      name: payload.name || "New User",
      email: normalizedEmail,
      phone: payload.phone || "",
      password: payload.password,
      role: normalizeRole(payload.role),
      status: "active",
      emailVerifiedAt: null,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    DEV_USERS.set(normalizedEmail, devUser);

    const token = generateToken(devUser._id);
    setAuthCookie(res, token);
    return res.status(201).json({ ...userResource(devUser), token });
  }

  if (mode === "login") {
    const devUser = DEV_USERS.get(normalizedEmail);
    if (!devUser || devUser.password !== payload.password) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = generateToken(devUser._id);
    setAuthCookie(res, token);
    return res.status(200).json({ ...userResource(devUser), token });
  }

  return false;
};

export const signup = async (req, res, next) => {
  try {
    const { name, email, phone, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    const user = await User.create({
      name,
      email,
      phone,
      password,
      role: normalizeRole(role),
    });

    if (user.role === "patient") {
      await Patient.create({
        user: user._id,
        name: user.name,
        phone: user.phone || "",
        email: user.email,
      });
    }

    const token = generateToken(user._id);

    setAuthCookie(res, token);

    res.status(201).json({ ...userResource(user), token });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (process.env.BYPASS_AUTH === "true") {
      const devResponse = handleDevFallbackAuth(req, res, "login", { email, password });
      if (devResponse) {
        return devResponse;
      }
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = generateToken(user._id);

    setAuthCookie(res, token);

    res.status(200).json({ ...userResource(user), token });
  } catch (error) {
    next(error);
  }
};

export const logout = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.status(200).json({ message: "Logged out successfully" });
};

export const getMe = async (req, res) => {
  res.status(200).json(userResource(req.user));
};
