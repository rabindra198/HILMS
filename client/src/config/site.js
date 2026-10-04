/**
 * Deployment-level configuration for HILMS.
 *
 * Everything here is presentation-only and safe to expose to the browser: it is
 * read from Vite's `VITE_*` build-time variables so that branding, support
 * details and the copyright year can be changed per environment (dev / staging /
 * production) without touching component code.
 *
 * Support contact details are deliberately EMPTY by default. HILMS does not ship
 * invented hospital addresses, phone numbers or email addresses - a deployment
 * that wants them in the footer sets the variables in `client/.env` (see
 * `client/.env.example`). When they are absent the footer renders a neutral
 * "maintained by your administrator" line instead of fake data.
 */

/** Trimmed read of a Vite env var. Vite replaces `import.meta.env.X` at build time. */
const envValue = (value) => (typeof value === "string" ? value.trim() : "");

export const SITE = Object.freeze({
  name: "HILMS",
  fullName: "Hospital Information & Laboratory Management System",
  tagline:
    "Connected healthcare management for patients, doctors, laboratories and hospital administration.",
  /** Override per deployment if the footer must show a different year. */
  copyrightYear: Number(envValue(import.meta.env.VITE_HILMS_COPYRIGHT_YEAR)) || new Date().getFullYear(),
});

/**
 * Contact details for the deploying organisation. No defaults are invented.
 */
export const SUPPORT_CONTACT = Object.freeze({
  organisation: envValue(import.meta.env.VITE_HILMS_ORGANISATION),
  email: envValue(import.meta.env.VITE_HILMS_SUPPORT_EMAIL),
  phone: envValue(import.meta.env.VITE_HILMS_SUPPORT_PHONE),
  location: envValue(import.meta.env.VITE_HILMS_LOCATION),
  hours: envValue(import.meta.env.VITE_HILMS_SUPPORT_HOURS),
});

/** Rows that actually have a value, in display order. Drives the contact column. */
export const SUPPORT_CONTACT_ROWS = Object.freeze(
  [
    SUPPORT_CONTACT.email && { key: "email", label: "Email", value: SUPPORT_CONTACT.email, href: `mailto:${SUPPORT_CONTACT.email}` },
    SUPPORT_CONTACT.phone && { key: "phone", label: "Phone", value: SUPPORT_CONTACT.phone, href: `tel:${SUPPORT_CONTACT.phone.replace(/[^+\d]/g, "")}` },
    SUPPORT_CONTACT.location && { key: "location", label: "Location", value: SUPPORT_CONTACT.location },
    SUPPORT_CONTACT.hours && { key: "hours", label: "Hours", value: SUPPORT_CONTACT.hours },
  ].filter(Boolean)
);

/** True when at least one support detail has been configured for this deployment. */
export const hasSupportContact = SUPPORT_CONTACT_ROWS.length > 0;
