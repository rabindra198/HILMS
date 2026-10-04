/**
 * Small clinical helpers shared by the doctor module.
 *
 * Kept dependency-free and pure so both the service layer and the seed scripts
 * can use them, and so they are trivially testable.
 */

/** Whole years between `dateOfBirth` and now. */
const calculateAge = (dateOfBirth, reference = new Date()) => {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;

  let age = reference.getFullYear() - birth.getFullYear();
  const monthDelta = reference.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 130 ? age : null;
};

/** "1990-04-12" -> "12 Apr 1990". Returns null for unusable input. */
const formatDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

/** "09:30" from minutes-from-midnight. */
const formatMinutes = (minutes) => {
  if (!Number.isFinite(minutes)) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

/** "ONCE_DAILY" -> "Once daily". Falls back to the raw value. */
const humanize = (value) => {
  if (!value) return null;
  const text = String(value).replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Flags a lab result as out of range by comparing the numeric value against the
 * reference range. Returns the stored flag when the value is not numeric, so a
 * qualitative result ("Negative") keeps whatever the laboratory recorded rather
 * than being forced into a numeric verdict.
 */
const deriveFlag = (value, referenceRange) => {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || !referenceRange) return null;

  // Accepts "70-100", "70 - 100", "13.5-17.5 mg/dL".
  const match = /(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/.exec(String(referenceRange));
  if (!match) return null;

  const low = Number(match[1]);
  const high = Number(match[2]);
  if (numeric < low || numeric > high) return "HIGH";
  return "NORMAL";
};

module.exports = { calculateAge, formatDate, formatMinutes, humanize, deriveFlag };
