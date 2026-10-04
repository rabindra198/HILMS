import {
  PageShell,
  PageCard,
  TableState,
  ResponsiveList,
  TrustNote,
} from "@/components/common/PageShell";
import { StatusBadge } from "@/components/common/StatusBadge";

/**
 * Shared chrome and formatting for the Patient screens.
 *
 * Mirrors `doctorUi.jsx`: these helpers encode patient-facing vocabulary (slot
 * times, appointment types, the laboratory progress track) that no other module
 * should depend on, so they live beside the screens rather than in `components/`.
 *
 * Nothing in here reads or writes storage. Every screen gets its data from
 * `patientApi`, which is the only place the patient module talks to the server.
 */

export function PatientPageShell(props) {
  return <PageShell {...props} />;
}

export function PatientCard(props) {
  return <PageCard {...props} />;
}

export function PatientTableState(props) {
  return <TableState {...props} />;
}

export function PatientResponsiveList(props) {
  return <ResponsiveList {...props} />;
}

export function PatientTrustNote() {
  return (
    <TrustNote message="Only you can see these records. Your doctors and laboratory staff see them too, and every access is logged." />
  );
}

export { StatusBadge };

/* ---- Domain constants -----------------------------------------------------
 * Mirrored from the models, for the same reason as the doctor equivalents: they
 * drive rendering and labels. The server re-validates every value, so a stale
 * entry here can never let an invalid one through.
 */

export const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "IN_CONSULTATION",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

export const APPOINTMENT_TYPES = [
  "CONSULTATION",
  "FOLLOW_UP",
  "REPORT_REVIEW",
  "PROCEDURE",
];

export const CONSULTATION_STATUSES = ["IN_PROGRESS", "COMPLETED", "CANCELLED"];

/**
 * The laboratory progress track, in order. A request's position in this list is
 * the `stage` the server sends, so the bar and the status badge can never disagree.
 */
export const LAB_PROGRESS = [
  "PENDING",
  "ACCEPTED",
  "SAMPLE_COLLECTED",
  "PROCESSING",
  "COMPLETED",
  "VERIFIED",
];

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const GENDERS = ["male", "female", "other"];

export const NOTIFICATION_TYPES = [
  "APPOINTMENT_BOOKED",
  "APPOINTMENT_CONFIRMED",
  "APPOINTMENT_CANCELLED",
  "LAB_REQUEST_ACCEPTED",
  "LAB_REPORT_VERIFIED",
  "LAB_REPORT_COMMENT",
  "PRESCRIPTION_ISSUED",
  "GENERAL",
];

/**
 * Only these can be cancelled by the patient. Mirrors
 * `appointment.service.PATIENT_CANCELLABLE`; the button is hidden rather than
 * shown-and-failing because the server rejects the rest with a 409.
 */
export const CANCELLABLE = ["SCHEDULED", "CONFIRMED"];

export const canCancel = (appointment) =>
  CANCELLABLE.includes(String(appointment?.status || "").toUpperCase());

/* ---- Formatting ------------------------------------------------------------ */

const pad = (value) => String(value).padStart(2, "0");

export const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
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
 * The server stores the slot as a number precisely so a client timezone cannot
 * shift it; formatting with `Date` here would reintroduce the bug storage avoids.
 */
export const formatSlot = (minutes) => {
  if (minutes == null || Number.isNaN(Number(minutes))) return "-";
  const total = Number(minutes);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

export const formatSlotEnd = (appointment) => {
  if (appointment?.startMinutes == null) return "-";
  return formatSlot(
    Number(appointment.startMinutes) + Number(appointment.durationMinutes || 0),
  );
};

/** A whole-slot range: "09:00 - 09:30". */
export const formatSlotRange = (appointment) =>
  `${formatSlot(appointment?.startMinutes)} - ${formatSlotEnd(appointment)}`;

/** `YYYY-MM-DD` for an `<input type="date">`, in local time. */
export const toDateInput = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * The ISO string the availability/booking endpoints expect for a chosen day.
 *
 * Local midnight, not a UTC instant: in a positive-offset zone a UTC timestamp for
 * "today" can land on the previous day server-side.
 */
export const dayStartIso = (dateInput) => {
  if (!dateInput) return "";
  const [year, month, day] = dateInput.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
};

export const humanise = (value) => {
  if (!value) return "-";
  return String(value)
    .toLowerCase()
    .split("_")
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join(" ");
};

export const initials = (name) =>
  String(name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

/** `1200` -> "NPR 1,200". Money is formatted from real prices only. */
export const formatMoney = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "-";
  return `NPR ${value.toLocaleString()}`;
};

/** A short relative label for a notification list, falling back to a date. */
export const relativeTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(value);
};

/* ---- Form field styles -----------------------------------------------------
 * Shared so a filter input and a form input are the same control, matching the
 * doctor and laboratory screens.
 */

export const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20";

export const LABEL_CLASS =
  "mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft";

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
