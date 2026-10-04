// Inspects one account and every record that references it, before deletion.
// Read-only. Usage: node src/scripts/inspect-account.js <email>
require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");
const AccessRequest = require("../models/AccessRequest");
const Notification = require("../models/Notification");
const PasswordResetToken = require("../models/PasswordResetToken");
const AuditLog = require("../models/AuditLog");

const target = (process.argv[2] || "").trim().toLowerCase();

(async () => {
  if (!target) {
    console.log("Usage: node src/scripts/inspect-account.js <email>");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email: target }).lean();
  if (!user) {
    console.log(`No account found for ${target}`);
    await mongoose.disconnect();
    return;
  }

  const requests = await AccessRequest.find({ $or: [{ user: user._id }, { email: target }] }).lean();
  const notifications = await Notification.find({ recipient: user._id }).lean();
  const resetTokens = await PasswordResetToken.find({ user: user._id }).lean();
  const auditAsActor = await AuditLog.find({ actor: user._id }).lean();
  const auditAsTarget = await AuditLog.find({ targetId: user._id }).lean();
  const auditByEmail = await AuditLog.find({ targetEmail: target }).lean();

  console.log(`\nACCOUNT  ${user.email}`);
  console.log(`  name            ${user.name}`);
  console.log(`  role            ${user.role}`);
  console.log(`  status          ${user.status}`);
  console.log(`  isActive        ${user.isActive}`);
  console.log(`  mustChange      ${user.mustChangePassword}`);
  console.log(`  lastLoginAt     ${user.lastLoginAt || "never"}`);
  console.log(`  createdAt       ${user.createdAt}`);
  console.log(`  id              ${user._id}`);

  console.log(`\nLINKED RECORDS (these would go too)`);
  console.log(`  access requests   ${requests.length}`);
  requests.forEach((r) =>
    console.log(`    - [${r.status}] requestedRole=${r.requestedRole} reviewedBy=${r.reviewedBy || "-"} notes=${r.reviewNotes || "-"}`)
  );
  console.log(`  notifications     ${notifications.length}`);
  console.log(`  password resets   ${resetTokens.length}`);
  console.log(`  audit (as actor)  ${auditAsActor.length}`);
  console.log(`  audit (as target) ${auditAsTarget.length}`);
  console.log(`  audit (by email)  ${auditByEmail.length}`);

  await mongoose.disconnect();
})();
