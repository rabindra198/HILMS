import { PageShell, PageCard, TableState, ResponsiveList, TrustNote } from "@/components/common/PageShell";
import { StatusBadge } from "@/components/common/StatusBadge";

/**
 * Shared chrome and formatting for the Doctor screens.
 *
 * Lives beside the screens rather than in `components/` because these helpers
 * encode doctor-specific vocabulary (slot times, appointment types, the
 * consultation lifecycle) that no other module should depend on.
 */

export function DoctorPageShell(props) {
  return <PageShell {...props} />;
}

export function DoctorCard(props) {
  return <PageCard {...props} />;
}

export function DoctorTableState(props) {
  return <TableState {...props} />;
}

export function DoctorResponsiveList(props) {
  return <ResponsiveList {...props} />;
}

export function DoctorTrustNote() {
  return (
    <TrustNote message="Patient records are shown only for people on that patient's care team, and every access is audited." />
  );
}

export { StatusBadge };

// ---- Domain constants -----------------------------------------------------
// Mirrored from the models. Duplicated deliberately: these drive rendering and
// dropdowns, and reading them at runtime would mean an extra request on every
// screen just to label a select. The server re-validates every one of them, so a
// stale value here can never let an invalid value through.

export const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "IN_CONSULTATION",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

export const APPOINTMENT_TYPES = ["CONSULTATION", "FOLLOW_UP", "REPORT_REVIEW", "PROCEDURE"];

export const CONSULTATION_STATUSES = ["IN_PROGRESS", "COMPLETED", "CANCELLED"];

export const FREQUENCIES = ["ONCE_DAILY", "TWICE_DAILY", "THREE_TIMES_DAILY", "FOUR_TIMES_DAILY", "WEEKLY", "AS_NEEDED", "AT_BEDTIME", "STAT"];

export const ROUTES = ["ORAL", "IV", "IM", "TOPICAL", "INHALATION", "RECTAL", "SUBCUTANEOUS"];

export const LAB_PRIORITIES = ["ROUTINE", "URGENT", "STAT"];

/**
 * The status a doctor is allowed to move an appointment to, keyed by its current
 * status. This mirrors `appointment.service.TRANSITIONS` exactly.
 *
 * The buttons are hidden rather than shown-and-failing because the server
 * rejects an illegal transition with a 409 - offering a button that always
 * errors teaches the doctor the screen is broken.
 */
export const NEXT_APPOINTMENT_STATUSES = {
  SCHEDULED: ["CONFIRMED", "IN_CONSULTATION", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["IN_CONSULTATION", "CANCELLED", "NO_SHOW"],
  IN_CONSULTATION: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const CONSULTATION_NEXT_STATUSES = {
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// ---- Formatting ------------------------------------------------------------

const pad = (value) => String(value).padStart(2, "0");

export const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

export const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Minutes-from-midnight -> "09:30".
 *
 * The server stores the slot as a number precisely so the client's timezone
 * cannot shift it; formatting it here with `Date` would reintroduce exactly the
 * bug that storage avoids.
 */
export const formatSlot = (minutes) => {
  if (minutes == null || Number.isNaN(Number(minutes))) return "-";
  const total = Number(minutes);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

/** The end of a slot, from its start and duration. May roll past midnight. */
export const formatSlotEnd = (appointment) => {
  if (appointment?.startMinutes == null) return "-";
  return formatSlot(Number(appointment.startMinutes) + Number(appointment.durationMinutes || 0));
};

/** `YYYY-MM-DD` for an `<input type="date">`. Local time, not UTC. */
export const toDateInput = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * The ISO string the booking endpoint expects for a chosen calendar day.
 *
 * The service rejects a past `appointmentDate`, and it compares against the
 * server's "now", so the client sends local midnight for the chosen day rather
 * than a UTC instant that can land on the previous day in a positive-offset zone.
 */
export const dayStartIso = (dateInput) => {
  if (!dateInput) return "";
  const [year, month, day] = dateInput.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
};

export const humanise = (value) => {
  if (!value) return "-";
  const words = String(value).toLowerCase().split("_");
  return words
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
};

export const genderLabel = (value) => humanise(value);

export const ageFromDateOfBirth = (value) => {
  if (!value) return null;
  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  // Subtract a year when the birthday has not come round yet this calendar year.
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
};

export const patientLabel = (patient) => {
  if (!patient) return "Patient";
  const age = ageFromDateOfBirth(patient.dateOfBirth);
  return [patient.name, age != null ? `${age} yrs` : null, humanise(patient.gender)].filter(Boolean).join(" · ");
};

/** Initials for the avatar chips. */
export const initials = (name) =>
  String(name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

// ---- Form field styles -----------------------------------------------------
// Shared so a filter input and a form input are the same control, matching the
// laboratory screens.

export const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20";

export const LABEL_CLASS = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft";

export const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:cursor-not-allowed disabled:opacity-50";

export const SECONDARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-deept/15 bg-white px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale disabled:cursor-not-allowed disabled:opacity-50";

export const DANGER_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-coral/40 bg-white px-4 py-2.5 text-sm font-semibold text-coral-dark transition hover:bg-coral-pale disabled:cursor-not-allowed disabled:opacity-50";

export const CHIP_BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg border border-deept/15 px-3 py-2 text-xs font-bold text-teal-deep transition hover:bg-teal-pale disabled:opacity-50";

export const CHIP_PRIMARY =
  "inline-flex items-center gap-1.5 rounded-lg bg-teal-deep px-3 py-2 text-xs font-bold text-white transition hover:bg-teal-mid disabled:opacity-50";

export const CHIP_DANGER =
  "inline-flex items-center gap-1.5 rounded-lg border border-coral/40 px-3 py-2 text-xs font-bold text-coral-dark transition hover:bg-coral-pale disabled:opacity-50";
