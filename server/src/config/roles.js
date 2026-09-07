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
    "patients.assigned.view",
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
  ],
});

const normalizeRole = (role) => {
  const key = String(role || ROLES.PATIENT).trim().toLowerCase().replace(/\s+/g, " ");
  return ROLE_ALIASES[key] || ROLES.PATIENT;
};

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
  normalizeRole,
  getRoleLabel,
  getRolePermissions,
};
