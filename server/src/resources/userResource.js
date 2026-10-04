const { getRoleLabel, getRolePermissions, normalizeRole } = require("../config/roles");

const idOf = (value) => {
  if (!value) return undefined;
  return typeof value.toString === "function" ? value.toString() : value;
};

/**
 * Derive the account status from real persisted state.
 * `status` is the authoritative field; the legacy `isActive` boolean is
 * honoured as a fallback for records created before `status` existed.
 */
const resolveStatus = (rawUser) => {
  if (rawUser.status) return String(rawUser.status).toUpperCase();
  return rawUser.isActive === false ? "REJECTED" : "APPROVED";
};

const userResource = (user) => {
  const rawUser = typeof user?.toObject === "function" ? user.toObject() : user;
  if (!rawUser) return null;

  const role = normalizeRole(rawUser.role);
  const permissions = getRolePermissions(role, rawUser.permissions || []);

  return {
    id: idOf(rawUser._id || rawUser.id),
    name: rawUser.name,
    email: rawUser.email,
    phone: rawUser.phone || "",
    contactNumber: rawUser.contactNumber || rawUser.phone || "",
    address: rawUser.address || "",
    nmcNumber: rawUser.nmcNumber || "",
    labRegistryNumber: rawUser.labRegistryNumber || "",
    role,
    roleLabel: getRoleLabel(role),
    permissions,
    status: resolveStatus(rawUser),
    isActive: rawUser.isActive !== false,
    // Drives the forced first-login password change. The backend re-checks
    // this flag on every protected request, so a bypassed frontend redirect
    // still cannot reach a dashboard.
    mustChangePassword: rawUser.mustChangePassword === true,
    lastLoginAt: rawUser.lastLoginAt || null,
    profilePhotoUrl: rawUser.profilePhotoUrl || null,
    createdAt: rawUser.createdAt || null,
    updatedAt: rawUser.updatedAt || null,
  };
};

const authResource = (user, meta = {}) => {
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

module.exports = { userResource, authResource, resolveStatus };

