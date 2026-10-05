const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const env = require("../config/env");
const { ROLE_VALUES, normalizeRole, resolveRole } = require("../config/roles");
const logger = require("../utils/logger");

const USER_ROOM = (userId) => `user:${userId}`;
const ROLE_ROOM = (role) => `role:${role}`;

let io;
let warnedBeforeInitialization = false;

const unauthorized = () => {
  const error = new Error("Authentication required");
  error.data = { code: "SOCKET_UNAUTHORIZED" };
  return error;
};

const getCookieToken = (cookieHeader = "") => {
  const tokenCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("token="));
  if (!tokenCookie) return null;

  try {
    return decodeURIComponent(tokenCookie.slice("token=".length));
  } catch {
    return null;
  }
};

const authenticateSocket = async (socket, next) => {
  try {
    const token = getCookieToken(socket.handshake.headers.cookie);
    if (!token) return next(unauthorized());

    let claims;
    try {
      claims = jwt.verify(token, env.jwtSecret);
    } catch {
      return next(unauthorized());
    }
    if (!claims || typeof claims.id !== "string") return next(unauthorized());

    const user = await User.findById(claims.id)
      .select("_id role status isActive tokenVersion mustChangePassword")
      .lean();
    if (
      !user ||
      user.status !== "APPROVED" ||
      user.isActive !== true ||
      user.mustChangePassword === true ||
      (typeof claims.tv === "number" && claims.tv !== (user.tokenVersion || 0))
    ) {
      return next(unauthorized());
    }

    const role = resolveRole(user.role);
    if (!ROLE_VALUES.includes(role)) return next(unauthorized());

    socket.data.userId = String(user._id);
    socket.data.role = role;
    socket.data.tokenExpiresAt = claims.exp ? claims.exp * 1000 : null;
    return next();
  } catch (error) {
    return next(error);
  }
};

const createSocketServer = (httpServer) => {
  if (io) throw new Error("Socket.IO has already been initialized");

  const allowedOrigins = env.clientUrl.split(",").map((origin) => origin.trim()).filter(Boolean);
  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin is not allowed"));
      },
      credentials: true,
    },
    allowRequest(request, callback) {
      const origin = request.headers.origin;
      callback(null, !origin || allowedOrigins.includes(origin));
    },
  });

  io.use(authenticateSocket);
  io.on("connection", (socket) => {
    const userRoom = USER_ROOM(socket.data.userId);
    socket.join([userRoom, ROLE_ROOM(socket.data.role)]);

    const expiresAt = socket.data.tokenExpiresAt;
    if (expiresAt) {
      let expiryTimer;
      const disconnectAtExpiry = () => {
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) {
          socket.disconnect(true);
          return;
        }
        expiryTimer = setTimeout(disconnectAtExpiry, Math.min(remaining, 2_147_000_000));
        expiryTimer.unref?.();
      };
      disconnectAtExpiry();
      socket.once("disconnect", () => clearTimeout(expiryTimer));
    }
  });

  return io;
};

const getSocketServer = () => {
  if (io) return io;
  if (!warnedBeforeInitialization) {
    warnedBeforeInitialization = true;
    logger.warn("Socket.IO is not initialized; real-time events are unavailable");
  }
  return null;
};

const emitToUser = (userId, event, payload) => {
  getSocketServer()?.to(USER_ROOM(String(userId))).emit(event, payload);
};

const emitToRole = (role, event, payload) => {
  getSocketServer()?.to(ROLE_ROOM(normalizeRole(role))).emit(event, payload);
};

const emitToRoles = (roles, event, payload) => {
  const rooms = roles.map((role) => ROLE_ROOM(normalizeRole(role)));
  getSocketServer()?.to(rooms).emit(event, payload);
};

const disconnectUser = (userId) => {
  getSocketServer()?.in(USER_ROOM(String(userId))).disconnectSockets(true);
};

module.exports = {
  createSocketServer,
  emitToUser,
  emitToRole,
  emitToRoles,
  disconnectUser,
  USER_ROOM,
  ROLE_ROOM,
};
