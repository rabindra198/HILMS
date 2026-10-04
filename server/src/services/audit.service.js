const AuditLog = require("../models/AuditLog");

/**
 * Append-only audit trail writer. Never throws into the request path - a
 * failed audit write must not roll back a completed business action, it is
 * logged to the server console instead.
 */
const record = async ({ action, actor, targetType, targetId, targetEmail, metadata, req }) => {
  try {
    return await AuditLog.create({
      action,
      actor: actor?._id,
      actorEmail: actor?.email,
      actorRole: actor?.role,
      targetType,
      targetId,
      targetEmail,
      metadata,
      ip: req ? req.ip : undefined,
    });
  } catch (error) {
    console.error("[AUDIT] Failed to record audit entry:", error.message);
    return null;
  }
};

module.exports = { record };
