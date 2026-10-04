const pad = (value) => String(value).padStart(2, "0");

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Date formatter supporting `YYYY`, `MM`, `DD`, `MMM` and `MMMM`.
 *
 * `MMM`/`MMMM` exist because "DD MMM YYYY" is the pattern the Admin screens ask
 * for. Without them the `MM` inside `MMM` matched first and "05 Feb 2026" came
 * out as "05 Fe05 2026" - so the longer tokens have to be matched before the
 * shorter ones they start with.
 */
export const formatDate = (value, pattern = "YYYY-MM-DD", { utc = false } = {}) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = utc
    ? {
        YYYY: date.getUTCFullYear(),
        MM: pad(date.getUTCMonth() + 1),
        MMM: MONTHS_SHORT[date.getUTCMonth()],
        MMMM: MONTHS_LONG[date.getUTCMonth()],
        DD: pad(date.getUTCDate()),
      }
    : {
        YYYY: date.getFullYear(),
        MM: pad(date.getMonth() + 1),
        MMM: MONTHS_SHORT[date.getMonth()],
        MMMM: MONTHS_LONG[date.getMonth()],
        DD: pad(date.getDate()),
      };

  // Longest token first: MMMM before MMM, and both before MM.
  return pattern.replace(/YYYY|MMMM|MMM|MM|DD/g, (token) => parts[token]);
};
