import { getRoleLabel, getRolePermissions, normalizeRole } from "../config/roles.js";

const idOf = (value) => {
  if (!value) return undefined;
  return typeof value.toString === "function" ? value.toString() : value;
};

export const userResource = (user) => {
  const rawUser = typeof user?.toObject === "function" ? user.toObject() : user;
  if (!rawUser) return null;

  const role = normalizeRole(rawUser.role);
  const permissions = getRolePermissions(role, rawUser.permissions || []);

  return {
    id: idOf(rawUser._id || rawUser.id),
    name: rawUser.name,
    email: rawUser.email,
    phone: rawUser.phone || "",
    role,
    roleLabel: getRoleLabel(role),
    permissions,
    status: rawUser.status || "active",
    emailVerifiedAt: rawUser.emailVerifiedAt || null,
    lastLoginAt: rawUser.lastLoginAt || null,
    createdAt: rawUser.createdAt || null,
    updatedAt: rawUser.updatedAt || null,
  };
};

export const authResource = (user, meta = {}) => {
  const serializedUser = userResource(user);
  const permissions = serializedUser?.permissions || [];

  return {
    user: serializedUser,
    role: serializedUser?.role,
    permissions,
    abilities: permissions,
    ...meta,
  };
};
