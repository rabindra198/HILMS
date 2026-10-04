/**
 * Client-side role constants and routing map.
 *
 * These are presentation concerns only. The role itself is always supplied by
 * the backend on login / GET /auth/me, and every protected API call is
 * authorised server-side as well.
 */

export const ROLES = Object.freeze({
  ADMIN: "admin",
  DOCTOR: "doctor",
  LAB: "lab",
  PATIENT: "patient",
});

/** Default landing page for each backend-assigned role. */
export const ROLE_HOME = Object.freeze({
  [ROLES.ADMIN]: "/admin/dashboard",
  [ROLES.DOCTOR]: "/doctor/dashboard",
  [ROLES.LAB]: "/lab/dashboard",
  [ROLES.PATIENT]: "/patient/dashboard",
});

/** URL prefix for each role's protected area. */
export const ROLE_AREA = Object.freeze({
  [ROLES.ADMIN]: "/admin",
  [ROLES.DOCTOR]: "/doctor",
  [ROLES.LAB]: "/lab",
  [ROLES.PATIENT]: "/patient",
});

/** Roles a member of the public is allowed to request. Admin is excluded. */
export const REQUESTABLE_ROLES = Object.freeze([
  {
    value: ROLES.PATIENT,
    label: "Patient",
    description: "Appointments, prescriptions, lab reports, payments and medical history.",
  },
  {
    value: ROLES.DOCTOR,
    label: "Doctor",
    description: "Consultations, diagnoses, prescriptions and laboratory requests.",
  },
  {
    value: ROLES.LAB,
    label: "Laboratory",
    description: "Laboratory requests, samples, processing, results and report verification.",
  },
]);

export const ACCOUNT_STATUSES = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
});

const ROLE_ALIASES = Object.freeze({
  admin: ROLES.ADMIN,
  doctor: ROLES.DOCTOR,
  laboratory: ROLES.LAB,
  lab: ROLES.LAB,
  patient: ROLES.PATIENT,
});

export const normalizeRole = (role) => {
  const key = String(role || "").trim().toLowerCase();
  return ROLE_ALIASES[key] || "";
};

/** Landing route for a backend-supplied role. */
export const getRoleHome = (role) => ROLE_HOME[normalizeRole(role)] || "/unauthorized";

/** Roles permitted to enter a given protected area. */
export const getRolesForArea = (area) => {
  const entry = Object.entries(ROLE_AREA).find(([, prefix]) => prefix === area);
  return entry ? [entry[0]] : [];
};

export const isRequestableRole = (role) => REQUESTABLE_ROLES.some((option) => option.value === role);
