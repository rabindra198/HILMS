const crypto = require("crypto");

/**
 * Temporary password generation for approved Doctor / Laboratory accounts.
 *
 * The applicant never chooses their own password. When an Admin approves a
 * request the backend generates a single-use credential here, emails the
 * plaintext once, and persists only the bcrypt hash. Because the account is
 * flagged `mustChangePassword` and the change-password endpoint clears that
 * flag, the credential is strictly one-time: the first login must replace it.
 *
 * Character pools exclude visually ambiguous glyphs (0/O, 1/l/I) because these
 * passwords get read off a printed or forwarded email and typed by hand.
 */
const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?";

const TEMP_PASSWORD_LENGTH = 14;

// SRS 13: generated credentials must not be these predictable values.
const FORBIDDEN_PASSWORDS = new Set([
  "123456",
  "password",
  "12345678",
  "123456789",
  "password123",
]);

const pick = (pool) => pool[crypto.randomInt(pool.length)];

/**
 * Generates a cryptographically random temporary password.
 *
 * Guarantees at least one lowercase, one uppercase, one digit and one symbol,
 * shuffles with a CSPRNG (Fisher-Yates), and rejects the explicitly forbidden
 * values from SRS 13.
 *
 * @param {number} [length=14]
 * @returns {string} plaintext password - never persisted, only emailed
 */
const generateTemporaryPassword = (length = TEMP_PASSWORD_LENGTH) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const all = LOWERCASE + UPPERCASE + DIGITS + SYMBOLS;
    const chars = [pick(LOWERCASE), pick(UPPERCASE), pick(DIGITS), pick(SYMBOLS)];

    while (chars.length < length) {
      chars.push(pick(all));
    }

    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    const password = chars.join("");
    if (!FORBIDDEN_PASSWORDS.has(password.toLowerCase())) {
      return password;
    }
  }

  throw new Error("Unable to generate a temporary password");
};

module.exports = {
  generateTemporaryPassword,
  TEMP_PASSWORD_LENGTH,
  FORBIDDEN_PASSWORDS,
};
