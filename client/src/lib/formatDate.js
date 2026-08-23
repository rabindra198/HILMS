const pad = (value) => String(value).padStart(2, "0");

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
        DD: pad(date.getUTCDate()),
      }
    : {
        YYYY: date.getFullYear(),
        MM: pad(date.getMonth() + 1),
        DD: pad(date.getDate()),
      };

  return pattern.replace(/YYYY|MM|DD/g, (token) => parts[token]);
};
