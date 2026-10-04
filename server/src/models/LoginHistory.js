const mongoose = require("mongoose");

/**
 * FR-AUTH-09: a record of each successful sign-in, so a user can review the
 * devices and addresses that have accessed their account and spot anything they
 * do not recognise.
 *
 * This is an append-only history, not an authorization authority: revocation is
 * enforced by `User.tokenVersion` (see middleware/auth.js). The `jti` stored here
 * is the same value carried by the token, which is what lets the current sign-in
 * be marked in the list.
 *
 * Rows expire after LOGIN_HISTORY_TTL_DAYS via a TTL index, so the collection
 * cannot grow without bound.
 */
const loginHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jti: { type: String, trim: true },
    ip: { type: String, trim: true, default: "" },
    userAgent: { type: String, trim: true, default: "" },
    // Whether the sign-in asked to be remembered (FR-AUTH-08). Useful because a
    // long-lived trusted-device session is exactly what a user would want to
    // audit first if their account were accessed.
    remember: { type: Boolean, default: false },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

loginHistorySchema.index({ user: 1, createdAt: -1 });
// TTL: Mongo removes each row once `expiresAt` passes.
loginHistorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("LoginHistory", loginHistorySchema);
