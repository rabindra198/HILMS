/**
 * Display formatting shared by the Admin dashboard and billing screens.
 *
 * Amounts are NPR throughout and are always stored as plain numbers, so money is
 * formatted in exactly one place - a page that rolls its own will eventually
 * disagree with the invoice it is quoting.
 */

/**
 * `84,500` - grouped, whole rupees unless paise are actually present.
 *
 * Returns the bare amount with no currency symbol: callers render
 * `Rs. ${formatMoney(n)}` so the unit stays visible in prose and in table cells
 * alike. Do not add a second prefix inside this function.
 */
export const formatMoney = (value, { showPaise = false } = {}) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";

  return new Intl.NumberFormat("en-NP", {
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(amount);
};

/** `84,500` / `1,500.50`, chosen by whether the value has paise. */
export const formatMoneyExact = (value) => {
  const amount = Number(value || 0);
  return formatMoney(amount, { showPaise: Math.abs(amount) % 1 !== 0 });
};

/** Signed percentage for a dashboard delta, or an em dash when not computable. */
export const formatDelta = (percent) => {
  if (percent === null || percent === undefined || !Number.isFinite(Number(percent))) return "—";
  const rounded = Math.round(Number(percent));
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
};

/**
 * "09:30" -> "9:30 AM".
 *
 * The backend stores appointment times as minutes-from-midnight and returns them
 * pre-formatted as 24-hour strings, so this only re-labels them for display.
 */
export const formatTime12 = (hhmm) => {
  if (!hhmm || typeof hhmm !== "string") return "—";
  const [hours, minutes] = hhmm.split(":");
  const parsed = Number(hours);
  if (!Number.isFinite(parsed)) return hhmm;

  const suffix = parsed >= 12 ? "PM" : "AM";
  const display = parsed % 12 === 0 ? 12 : parsed % 12;
  return `${display}:${minutes ?? "00"} ${suffix}`;
};

/**
 * "05 Feb, 14:30" - date and time in one label.
 *
 * `lib/formatDate` only expands YYYY/MM/DD tokens, so passing a time to it would
 * render the token literally. Timestamps therefore go through the platform
 * formatter here, matching the other modules that already display them.
 */
export const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Today's date as `YYYY-MM-DD` for `<input type="date">`. */
export const todayInputValue = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};