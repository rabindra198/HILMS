const ROLES = Object.freeze({
  ADMIN: "admin",
  DOCTOR: "doctor",
  LAB: "lab",
  PATIENT: "patient",
});

const ROLE_VALUES = Object.values(ROLES);

const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: "Admin",
  [ROLES.DOCTOR]: "Doctor",
  [ROLES.LAB]: "Laboratory",
  [ROLES.PATIENT]: "Patient",
});

// Roles a member of the public may REQUEST through "Request Access".
// Admin can never be self-assigned and is excluded by design.
const REQUESTABLE_ROLES = Object.freeze([ROLES.PATIENT, ROLES.DOCTOR, ROLES.LAB]);

// SRS 2.6: "Only Patients can self-register; all other accounts are created
// by an Admin." A Patient submission therefore creates an active account
// immediately.
const SELF_REGISTRABLE_ROLES = Object.freeze([ROLES.PATIENT]);

// Doctor / Laboratory submissions never carry a password. They are stored as
// PENDING requests and only become accounts once an Admin approves them, at
// which point a temporary password is generated and emailed.
const ADMIN_APPROVAL_ROLES = Object.freeze([ROLES.DOCTOR, ROLES.LAB]);

// The extra identity field each non-patient role must supply, per the request
// specification. Used by the validator and by the admin review screen.
const ROLE_REGISTRATION_FIELDS = Object.freeze({
  [ROLES.PATIENT]: [],
  [ROLES.DOCTOR]: "nmcNumber",
  [ROLES.LAB]: "labRegistryNumber",
});

// Roles that carry system-level privileges. Never self-assignable.
const PRIVILEGED_ROLES = Object.freeze([ROLES.ADMIN]);

const ROLE_ALIASES = Object.freeze({
  admin: ROLES.ADMIN,
  doctor: ROLES.DOCTOR,
  laboratory: ROLES.LAB,
  lab: ROLES.LAB,
  patient: ROLES.PATIENT,
  user: ROLES.PATIENT,
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: [
    "admin.overview.view",
    "users.manage",
    "access_requests.review",
    "doctors.manage",
    "patients.view",
    "patients.timeline.view",
    "appointments.manage",
    "laboratory.view",
    "billing.manage",
    "reports.export",
    "audit_logs.view",
    "settings.manage",
  ],
  [ROLES.DOCTOR]: [
    "doctor.dashboard.view",
    "appointments.assigned.view",
    "consultations.manage",
    "prescriptions.manage",
    "lab_requests.create",
    "lab_reports.view",
    "patients.assigned.view",
    "follow_ups.manage",
    "schedule.manage",
  ],
  [ROLES.LAB]: [
    "lab.dashboard.view",
    "lab_requests.manage",
    "lab_samples.track",
    "lab_reports.manage",
  ],
  [ROLES.PATIENT]: [
    "patient.dashboard.view",
    "appointments.own.view",
    "lab_reports.own.view",
    "prescriptions.own.view",
    "payments.own.view",
    "medical_history.own.view",
    "notifications.own.view",
  ],
});

const normalizeRole = (role) => {
  const key = String(role || ROLES.PATIENT).trim().toLowerCase().replace(/\s+/g, " ");
  return ROLE_ALIASES[key] || ROLES.PATIENT;
};

/**
 * Strict resolver for public "Request Access" submissions.
 * Returns null for anything that is not explicitly requestable, so a crafted
 * API request can never smuggle in admin (or any other role).
 * Deliberately does NOT fall back to a default role.
 */
const resolveRequestableRole = (role) => {
  const key = String(role || "").trim().toLowerCase().replace(/\s+/g, " ");
  const resolved = ROLE_ALIASES[key];
  return resolved && REQUESTABLE_ROLES.includes(resolved) ? resolved : null;
};

/**
 * Strict resolver for privileged role assignment (admin-side).
 * Unlike normalizeRole it never falls back to a default, so a crafted request
 * cannot silently downgrade an unknown role string to "patient".
 */
const resolveRole = (role) => {
  const key = String(role || "").trim().toLowerCase().replace(/\s+/g, " ");
  const resolved = ROLE_ALIASES[key];
  return resolved && ROLE_VALUES.includes(resolved) ? resolved : null;
};

const isRequestableRole = (role) => resolveRequestableRole(role) !== null;

/** Strict resolver for the Patient self-registration endpoint (SRS 2.6). */
const resolveSelfRegistrableRole = (role) => {
  const resolved = resolveRequestableRole(role);
  return resolved && SELF_REGISTRABLE_ROLES.includes(resolved) ? resolved : null;
};

/** True when a submission must be reviewed by an Admin before it can log in. */
const isApprovalRequiredRole = (role) => {
  const resolved = resolveRequestableRole(role);
  return resolved !== null && ADMIN_APPROVAL_ROLES.includes(resolved);
};

const isPrivilegedRole = (role) => PRIVILEGED_ROLES.includes(normalizeRole(role));

const isAdminRole = (role) => normalizeRole(role) === ROLES.ADMIN;

const getRoleLabel = (role) => ROLE_LABELS[normalizeRole(role)];

const getRolePermissions = (role, explicitPermissions = []) => {
  const normalizedRole = normalizeRole(role);
  const inheritedPermissions = ROLE_PERMISSIONS[normalizedRole] || [];
  return Array.from(new Set([...inheritedPermissions, ...explicitPermissions])).sort();
};

module.exports = {
  ROLES,
  ROLE_VALUES,
  ROLE_LABELS,
  ROLE_ALIASES,
  ROLE_PERMISSIONS,
  REQUESTABLE_ROLES,
  SELF_REGISTRABLE_ROLES,
  ADMIN_APPROVAL_ROLES,
  ROLE_REGISTRATION_FIELDS,
  PRIVILEGED_ROLES,
  normalizeRole,
  resolveRole,
  resolveRequestableRole,
  resolveSelfRegistrableRole,
  isRequestableRole,
  isApprovalRequiredRole,
  isPrivilegedRole,
  isAdminRole,
  getRoleLabel,
  getRolePermissions,
};
