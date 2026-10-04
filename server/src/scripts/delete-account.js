// Deletes a single account and its dependent records.
//
// Deliberately does NOT delete audit-log rows. The audit trail is the record of
// what happened to the account, and removing it would erase the history that
// the system exists to keep. Pass --purge-audit if that is genuinely wanted.
//
// Requires an explicit --confirm flag so this cannot run by accident.
//
// Usage:
//   node src/scripts/delete-account.js <email>
//   node src/scripts/delete-account.js <email> --confirm
//   node src/scripts/delete-account.js <email> --confirm --purge-audit
require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");
const AccessRequest = require("../models/AccessRequest");
const Notification = require("../models/Notification");
const PasswordResetToken = require("../models/PasswordResetToken");
const AuditLog = require("../models/AuditLog");

const args = process.argv.slice(2);
const target = (args.find((a) => !a.startsWith("--")) || "").trim().toLowerCase();
const confirmed = args.includes("--confirm");
const purgeAudit = args.includes("--purge-audit");

(async () => {
  if (!target) {
    console.log("Usage: node src/scripts/delete-account.js <email> --confirm [--purge-audit]");
    process.exitCode = 1;
    return;
  }
  if (!confirmed) {
    console.log("Refusing to delete without --confirm.");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email: target });
  if (!user) {
    console.log(`No account found for ${target}. Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  // Capture enough to undo this by hand if it turns out to be the wrong account.
  console.log(`\nDeleting: ${user.name} <${user.email}>  [${user.role}]  id=${user._id}\n`);

  const userId = user._id;
  // Requests are matched on the linked user OR the email, so a request that
  // pre-dates the link (e.g. an approval that failed to attach) still goes.
  const requests = await AccessRequest.find({ $or: [{ user: userId }, { email: target }] });
  const requestIds = requests.map((r) => r._id);
  const notifications = await Notification.find({ recipient: userId });
  const resetTokens = await PasswordResetToken.find({ user: userId });
  const auditRows = await AuditLog.find({
    $or: [{ actor: userId }, { targetId: userId }, { targetEmail: target }, { targetId: { $in: requestIds } }],
  });

  // Notifications can point at the request as well as the user.
  const notificationsByEntity = await Notification.find({ entityId: { $in: requestIds } });
  const allNotifications = [...notifications, ...notificationsByEntity];

  const deletedNotifications = await Notification.deleteMany({
    $or: [{ recipient: userId }, { entityId: { $in: requestIds } }],
  });
  const deletedTokens = await PasswordResetToken.deleteMany({ user: userId });

  let deletedAudit = 0;
  if (purgeAudit) {
    deletedAudit = (
      await AuditLog.deleteMany({
        $or: [{ actor: userId }, { targetId: userId }, { targetEmail: target }, { targetId: { $in: requestIds } }],
      })
    ).deletedCount;
  }

  const deletedRequests = await AccessRequest.deleteMany({ _id: { $in: requestIds } });
  const deletedUser = await User.deleteOne({ _id: userId });

  console.log(`  users removed            ${deletedUser.deletedCount}`);
  console.log(`  access requests removed  ${deletedRequests.deletedCount}`);
  console.log(`  notifications removed    ${deletedNotifications.deletedCount}`);
  console.log(`  password resets removed  ${deletedTokens.deletedCount}`);
  console.log(`  audit rows removed       ${deletedAudit}${purgeAudit ? "" : "  (kept, append-only)"}`);

  const stillThere = await User.countDocuments({ email: target });
  console.log(`\n  accounts matching ${target}: ${stillThere}`);

  if (stillThere === 0) {
    console.log("  The email is free again, so this person can submit a new access request.");
  }

  await mongoose.disconnect();
})();
