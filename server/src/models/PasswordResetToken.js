const mongoose = require("mongoose");

const RESET_TOKEN_TTL_MINUTES = 30;

/**
 * Single-use password reset token.
 * Only the SHA-256 hash of the token is stored; the plaintext token is
 * returned to the caller once and never persisted.
 */
const passwordResetTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Mongo removes the document once expired - no cleanup job required.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PasswordResetToken", passwordResetTokenSchema);
module.exports.RESET_TOKEN_TTL_MINUTES = RESET_TOKEN_TTL_MINUTES;
