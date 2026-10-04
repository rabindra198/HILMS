const mongoose = require("mongoose");

/**
 * Append-only audit trail for security-relevant actions, primarily
 * access-request reviews and role assignments.
 */
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true, uppercase: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    actorEmail: { type: String, trim: true, lowercase: true },
    actorRole: { type: String, trim: true },
    targetType: { type: String, trim: true },
    targetId: { type: mongoose.Schema.Types.ObjectId },
    targetEmail: { type: String, trim: true, lowercase: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String, trim: true },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
