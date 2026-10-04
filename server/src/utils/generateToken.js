const jwt = require("jsonwebtoken");
const env = require("../config/env");

/**
 * Signs a session token.
 *
 * `tv` (token version) is compared against the account's `tokenVersion` on every
 * request, which is what makes a stateless JWT revocable: incrementing the field
 * invalidates every token minted before the change (FR-AUTH-11).
 *
 * `jti` identifies the individual sign-in so it can be listed as a device /
 * session and marked as the current one (FR-AUTH-09).
 */
const generateToken = (id, { tokenVersion = 0, expiresIn, jti } = {}) =>
  jwt.sign({ id, tv: tokenVersion }, env.jwtSecret, {
    expiresIn: expiresIn || env.jwtExpiresIn,
    ...(jti ? { jwtid: jti } : {}),
  });

module.exports = { generateToken };
